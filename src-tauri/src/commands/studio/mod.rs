// src-tauri/src/commands/studio/mod.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Studio tab: every started FLP project across the configured production
// roots. The filesystem is the source of truth for WHICH projects exist;
// the studio_projects table only carries status / priority / notes.
// Archiving moves the folder away (auto-trash), so archived projects
// disappear from the scan — orphaned DB rows are cleaned up on each scan.
// ═══════════════════════════════════════════════════════════════════════════════

use crate::db::open_db;
use crate::utils::{
    file_modified_secs, is_flp, is_image_extension,
    is_video_extension, parse_audio_filename, sanitize_filename_part, secs_to_date,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

pub const STUDIO_STATUSES: [&str; 5] = ["idea", "wip", "exported", "ready", "discard"];

/// Die zwei Status, die es nur von Hand gibt. Der Scan fasst sie nie an — sonst
/// überschreibt der Fokus-Refresh beim nächsten Fensterwechsel die Entscheidung,
/// die gerade erst getroffen wurde.
pub const MANUAL_STATUSES: [&str; 2] = ["wip", "discard"];

pub fn is_manual_status(status: &str) -> bool {
    MANUAL_STATUSES.contains(&status)
}

/// Die automatische Stufe eines Projekts, allein aus dem, was im Ordner liegt:
/// MP3 + WAV heißt exportiert, dazu Cover, Thumbnail und Video heißt bereit.
///
/// ponytail: has_cover zählt jedes Bild im Ordner-Root, dessen Name nicht
/// „thumb" enthält (siehe scan_project_dir) — ein hingelegter Screenshot
/// befördert das Projekt damit auf „Bereit". Erst schärfen, wenn das stört.
pub fn derive_stage(mp3: bool, wav: bool, cover: bool, thumbnail: bool, video: bool) -> &'static str {
    if !(mp3 && wav) {
        return "idea";
    }
    if cover && thumbnail && video {
        "ready"
    } else {
        "exported"
    }
}

/// Was nach einem Scan gilt: ein von Hand gesetzter Status bleibt stehen, alles
/// andere rechnet die Automatik aus den Dateien.
/// Ab so vielen Tagen ohne Änderung steht eine Idee im Aufräumen
/// (gleicher Wert wie STALE_DAYS in ProjectsPane.tsx).
const AUFRAEUMEN_NACH_TAGEN: u64 = 30;

/// Wie sectionOf() im Frontend: eine Idee ohne Stern, länger nicht angefasst.
fn faellt_ins_aufraeumen(status: &str, priority: i64, modified_secs: u64, jetzt: u64) -> bool {
    status == "idea" && priority == 0
        && modified_secs > 0
        && jetzt.saturating_sub(modified_secs) > AUFRAEUMEN_NACH_TAGEN * 86_400
}

fn resolve_status(stored: Option<&str>, derived: &str) -> String {
    match stored {
        Some(s) if is_manual_status(s) => s.to_string(),
        _ => derived.to_string(),
    }
}

#[derive(Debug, Serialize)]
pub struct FlpEntry {
    pub path: String,
    pub name: String,
    pub modified_secs: u64,
    pub modified_date: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct StudioProject {
    pub path: String,            // project folder (identity)
    pub name: String,            // folder name
    pub root: String,            // which production root it came from
    pub parsed_name: String,     // folder name without [Key BPM]
    /// Song title parsed from the exported MP3/WAV — the real name of the
    /// track when the project folder is still called "project_187".
    pub song_name: Option<String>,
    pub key: Option<String>,
    pub bpm: Option<i32>,
    pub newest_flp: Option<String>,
    pub flp_count: usize,
    /// Arbeitszeit aus der FLP (FL zählt mit), über alle Versionen die größte
    pub work_minutes: Option<u32>,
    /// All FLP versions, newest first (for the inspector)
    pub flps: Vec<FlpEntry>,
    pub modified_date: Option<String>, // of newest FLP (fallback: folder)
    pub modified_secs: u64,            // for sorting
    pub has_mp3: bool,
    pub has_wav: bool,
    pub has_cover: bool,
    /// Das Bild für die Kachel: „Cover…" vor jedem anderen Bild, sonst None
    pub cover_path: Option<String>,
    pub has_thumbnail: bool,
    pub has_video: bool,
    // from studio_projects table:
    pub status: String,
    pub priority: i64,
    pub notes: Option<String>,
    /// Im Aufräumen „Behalten" gedrückt — steht nicht mehr unter „Lange inaktiv"
    pub kept: bool,
    /// Fest im Aufräumen (von Hand hingeschoben oder von dort in FL geöffnet) —
    /// bleibt dort, auch wenn FL das Projekt wieder „frisch" macht. Raus nur per Behalten.
    pub aufraeumen: bool,
}

/// Scan all production roots for project folders (any direct subfolder
/// containing at least one FLP — searched one level deep incl. 01_SAVEFILES)
/// and merge with the persisted status/priority/notes.
#[tauri::command]
pub async fn scan_studio_projects(paths: Vec<String>) -> Result<Vec<StudioProject>, String> {
    tauri::async_runtime::spawn_blocking(move || scan_studio_projects_blocking(&paths))
        .await
        .map_err(|e| format!("Studio scan panicked: {}", e))?
}

fn scan_studio_projects_blocking(paths: &[String]) -> Result<Vec<StudioProject>, String> {
    let mut projects: Vec<StudioProject> = Vec::new();

    for root in paths {
        let root_path = Path::new(root);
        if root.trim().is_empty() || !root_path.is_dir() {
            continue;
        }
        let entries = match std::fs::read_dir(root_path) {
            Ok(rd) => rd,
            Err(_) => continue,
        };
        for entry in entries.filter_map(|e| e.ok()) {
            let dir = entry.path();
            // `_IDEEN`, `_ARCHIVIERT` und Co. sind Ablagen, keine Projekte
            if !dir.is_dir() || entry.file_name().to_string_lossy().starts_with('_') {
                continue;
            }
            if let Some(p) = scan_project_dir(&dir, root) {
                projects.push(p);
            }
        }
    }

    // Merge with DB state + drop orphaned rows (folder gone = archived/deleted)
    let conn = open_db().map_err(|e| e.to_string())?;
    let mut db_state: HashMap<String, (String, i64, Option<String>, i64)> = HashMap::new();
    {
        let mut stmt = conn
            .prepare("SELECT path, status, priority, notes, kept FROM studio_projects")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    (r.get::<_, String>(1)?, r.get::<_, i64>(2)?, r.get::<_, Option<String>>(3)?, r.get::<_, i64>(4)?),
                ))
            })
            .map_err(|e| e.to_string())?;
        for row in rows.flatten() {
            db_state.insert(row.0, row.1);
        }
    }

    let live_paths: std::collections::HashSet<&str> =
        projects.iter().map(|p| p.path.as_str()).collect();
    for db_path in db_state.keys() {
        if live_paths.contains(db_path.as_str()) || !is_orphan_row(Path::new(db_path)) {
            continue;
        }
        let _ = conn.execute(
            "DELETE FROM studio_projects WHERE path = ?1",
            rusqlite::params![db_path],
        );
    }

    let jetzt = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    for p in &mut projects {
        let derived = derive_stage(p.has_mp3, p.has_wav, p.has_cover, p.has_thumbnail, p.has_video);
        match db_state.get(&p.path) {
            Some((status, priority, notes, kept)) => {
                p.priority = *priority;
                p.notes = notes.clone();
                p.status = resolve_status(Some(status), derived);
                // kept: 0 automatisch, 1 Behalten, 2 fest im Aufräumen.
                // Was einmal ins Aufräumen fällt, bleibt dort, auch wenn FL die
                // FLP beim Speichern wieder frisch macht. Raus nur per Behalten.
                let kept = if *kept == 0 && faellt_ins_aufraeumen(&p.status, *priority, p.modified_secs, jetzt) {
                    let _ = conn.execute(
                        "UPDATE studio_projects SET kept = 2 WHERE path = ?1",
                        rusqlite::params![p.path],
                    );
                    2
                } else { *kept };
                p.kept = kept == 1;
                p.aufraeumen = kept == 2;
                // Nur bei Abweichung schreiben — der Scan läuft bei jedem
                // Fensterwechsel über alle Produktions-Ordner.
                if p.status != *status {
                    let _ = conn.execute(
                        "UPDATE studio_projects SET status = ?2 WHERE path = ?1",
                        rusqlite::params![p.path, p.status],
                    );
                }
            }
            None => {
                p.status = resolve_status(None, derived);
                p.aufraeumen = faellt_ins_aufraeumen(&p.status, 0, p.modified_secs, jetzt);
                let _ = conn.execute(
                    "INSERT OR IGNORE INTO studio_projects (path, status, kept) VALUES (?1, ?2, ?3)",
                    rusqlite::params![p.path, p.status, if p.aufraeumen { 2 } else { 0 }],
                );
            }
        }
    }

    // Ohne Sortierung: die Liste wird im Frontend nach Sektion und gewähltem
    // Sortiermodus komplett neu geordnet — hier zu sortieren hat nur Zeit
    // gekostet und die Reihenfolge zweimal an zwei Stellen festgelegt.
    Ok(projects)
}

/// Darf die DB-Zeile zu diesem Projektordner weg?
///
/// Nur wenn der Produktions-Root (der Elternordner) gerade lesbar ist UND der
/// Projektordner darin nicht mehr existiert. Sonst löscht eine abgezogene
/// Platte, ein nicht synchronisierter OneDrive-Ordner oder ein aus den
/// Einstellungen genommener Pfad reihenweise Status und Notizen — und der Scan
/// läuft seit dem Fokus-Refresh bei jedem Fensterwechsel mit.
///
/// Ordner da, aber gerade ohne FLP (verschoben, umbenannt) zählt als "lebt".
fn is_orphan_row(project_dir: &Path) -> bool {
    project_dir.parent().is_some_and(|root| root.is_dir()) && !project_dir.is_dir()
}

/// Wie lange in FL an der FLP gearbeitet wurde, in Minuten. Steht als Event
/// 237 (zwei f64: Anlegedatum, Arbeitszeit — beides in Tagen) ganz vorn in
/// der Datei, bei allen gemessenen Projekten unter 400 Bytes. Gelesen werden
/// deshalb nur die ersten 16 KB — der Scan läuft bei jedem Fensterwechsel.
fn flp_work_minutes(path: &Path) -> Option<u32> {
    use std::io::Read;
    let mut buf = Vec::with_capacity(16 * 1024);
    std::fs::File::open(path).ok()?.take(16 * 1024).read_to_end(&mut buf).ok()?;
    flp_work_minutes_from(&buf)
}

/// Gesucht wird das Muster selbst (Event 237, Länge 16, plausibles Datum),
/// statt die Events der Reihe nach abzulaufen: FL Studio 2026 hat am
/// Dateianfang ein neues Event, an dem ein Event-Leser aus dem Tritt kam —
/// die Zeit steht trotzdem an derselben Stelle.
fn flp_work_minutes_from(b: &[u8]) -> Option<u32> {
    if b.get(0..4)? != b"FLhd" {
        return None;
    }
    let f64_at = |i: usize| b.get(i..i + 8).map(|s| f64::from_le_bytes(s.try_into().unwrap()));
    // 18 Bytes ab i: Id, Länge, zwei f64
    (0..b.len().saturating_sub(17)).find_map(|i| {
        if b[i] != 237 || b[i + 1] != 16 {
            return None;
        }
        // Tage seit 1899-12-30: 35000 ≈ 1995, 60000 ≈ 2064
        let angelegt = f64_at(i + 2)?;
        let tage = f64_at(i + 10)?;
        ((35_000.0..60_000.0).contains(&angelegt) && (0.0..3650.0).contains(&tage))
            .then(|| (tage * 1440.0).round() as u32)
    })
}

/// One project folder → StudioProject (None if it contains no FLP).
fn scan_project_dir(dir: &Path, root: &str) -> Option<StudioProject> { scan_dir(dir, root, false) }

/// `ohne_flp`: ein Sample aus losen Spuren hat keine FLP und zählt trotzdem,
/// sobald Audio oder MIDI im Ordner liegt.
fn scan_dir(dir: &Path, root: &str, ohne_flp: bool) -> Option<StudioProject> {
    let mut flps: Vec<(u64, PathBuf)> = Vec::new();
    let mut has_mp3 = false;
    let mut has_wav = false;
    let mut has_cover = false;
    let mut has_thumbnail = false;
    let mut has_video = false;
    let mut has_midi = false;
    // (Rang, Pfad): 0 = heißt „Cover…", 1 = irgendein anderes Bild
    let mut cover: Option<(u8, String)> = None;
    // Exported audio: (rank, modified, filename) — rank 1 = mp3 beats wav.
    // The export filename carries the real song title ("MEMORIES [156 Fm].mp3")
    // even when the project folder is still called "project_187".
    let mut audio_exports: Vec<(u8, u64, String)> = Vec::new();

    // Folder root + one level of subdirs (01_SAVEFILES etc.)
    let mut scan_files = |d: &Path, collect_assets: bool| {
        let Ok(rd) = std::fs::read_dir(d) else { return };
        for e in rd.filter_map(|e| e.ok()) {
            let p = e.path();
            if p.is_dir() {
                continue;
            }
            if is_flp(&p) {
                flps.push((file_modified_secs(&p).unwrap_or(0), p));
                continue;
            }
            if !collect_assets {
                continue;
            }
            let ext = p.extension().and_then(|x| x.to_str()).unwrap_or("").to_lowercase();
            let file_name = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
            let name_lower = file_name.to_lowercase();
            // Stems sind Einzelspuren, kein Export: weder „WAV da" noch Songtitel.
            if crate::utils::ist_stem(&file_name) { continue; }
            if ext == "mp3" { has_mp3 = true; }
            if ext == "wav" { has_wav = true; }
            if ext == "mp3" || ext == "wav" {
                let rank = if ext == "mp3" { 1 } else { 0 };
                audio_exports.push((rank, file_modified_secs(&p).unwrap_or(0), file_name));
            }
            if is_image_extension(&ext) {
                if name_lower.contains("thumb") {
                    has_thumbnail = true;
                } else {
                    has_cover = true;
                    let kandidat = (u8::from(!name_lower.starts_with("cover")), p.to_string_lossy().to_string());
                    if cover.as_ref().is_none_or(|c| kandidat < *c) { cover = Some(kandidat); }
                }
            }
            if is_video_extension(&ext) { has_video = true; }
            if ext == "mid" { has_midi = true; }
        }
    };

    scan_files(dir, true);
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.filter_map(|e| e.ok()) {
            let p = e.path();
            if p.is_dir() {
                // FL Studio legt Autosaves in "Backup"-Ordnern ab — die sind
                // nie die Arbeitsversion und werden komplett ignoriert.
                let dir_name = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
                if dir_name.contains("backup") {
                    continue;
                }
                scan_files(&p, false); // FLPs in subfolders count, assets only from root
            }
        }
    }

    if flps.is_empty() && !(ohne_flp && (has_wav || has_mp3 || has_midi)) {
        return None;
    }
    flps.sort_by_key(|(secs, _)| *secs);
    let newest_secs = flps.last().map_or(0, |(s, _)| *s);
    let newest_flp = flps.last().map(|(_, p)| p.to_string_lossy().to_string());

    // Newest first for the inspector's version list
    let flp_entries: Vec<FlpEntry> = flps
        .iter()
        .rev()
        .map(|(secs, p)| FlpEntry {
            path: p.to_string_lossy().to_string(),
            name: p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string(),
            modified_secs: *secs,
            modified_date: if *secs > 0 { Some(secs_to_date(*secs)) } else { None },
        })
        .collect();

    let name = dir.file_name()?.to_str()?.to_string();
    let (parsed_name, folder_key, folder_bpm) = parse_audio_filename(&name);
    let modified_secs = if newest_secs > 0 { newest_secs } else { file_modified_secs(dir).unwrap_or(0) };

    // Song title from the best export (mp3 first, then newest). Key/BPM from
    // the filename fill in whatever the folder name didn't provide.
    audio_exports.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));
    let (song_name, key, bpm) = match audio_exports.last() {
        Some((_, _, file_name)) => {
            let (song, song_key, song_bpm) = parse_audio_filename(file_name);
            let song = song.trim().to_string();
            (
                if song.is_empty() { None } else { Some(song) },
                folder_key.or(song_key),
                folder_bpm.or(song_bpm),
            )
        }
        None => (None, folder_key, folder_bpm),
    };

    Some(StudioProject {
        path: dir.to_string_lossy().to_string(),
        name,
        root: root.to_string(),
        parsed_name,
        song_name,
        key,
        bpm,
        newest_flp,
        flp_count: flps.len(),
        // Die Zeit läuft über „Speichern unter" weiter — die größte zählt
        work_minutes: flps.iter().filter_map(|(_, p)| flp_work_minutes(p)).max(),
        flps: flp_entries,
        modified_date: if modified_secs > 0 { Some(secs_to_date(modified_secs)) } else { None },
        modified_secs,
        has_mp3,
        has_wav,
        has_cover,
        cover_path: cover.map(|(_, p)| p),
        has_thumbnail,
        has_video,
        status: "idea".to_string(),
        priority: 0,
        notes: None,
        kept: false,
        aufraeumen: false,
    })
}

/// Persist status / priority / notes for one project folder.
#[tauri::command]
pub fn update_studio_project(
    path: String,
    status: String,
    priority: i64,
    notes: Option<String>,
) -> Result<(), String> {
    if !STUDIO_STATUSES.contains(&status.as_str()) {
        return Err(format!("Invalid studio status: {}", status));
    }
    let conn = open_db().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO studio_projects (path, status, priority, notes)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(path) DO UPDATE SET
            status = excluded.status,
            priority = excluded.priority,
            notes = excluded.notes",
        rusqlite::params![path, status, priority, notes],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Projekt fest ins Aufräumen legen (kept = 2): steht dort unabhängig vom
/// Alter, bis „Behalten" gedrückt wird.
#[tauri::command]
pub fn set_studio_aufraeumen(path: String) -> Result<(), String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO studio_projects (path, kept) VALUES (?1, 2)
         ON CONFLICT(path) DO UPDATE SET kept = 2",
        rusqlite::params![path],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Aufräumen → „Behalten": das Projekt bleibt, fällt aber aus „Lange inaktiv".
/// Hebt auch „fest im Aufräumen" (kept = 2) auf.
#[tauri::command]
pub fn set_studio_kept(path: String, kept: bool) -> Result<(), String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO studio_projects (path, kept) VALUES (?1, ?2)
         ON CONFLICT(path) DO UPDATE SET kept = excluded.kept",
        rusqlite::params![path, kept as i64],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Die zwei Zahlen am Studio-Tab: was fertig ist und was du dir vorgemerkt hast.
#[derive(Debug, Serialize)]
pub struct StudioStatusCounts {
    pub ready: i64,
    pub wip: i64,
}

/// Zählt nur in der Tabelle, ohne einen einzigen Ordner anzufassen — den Stand
/// hat der letzte Scan hineingeschrieben.
///
/// Gezählt wird ausschließlich, was direkt in einem der übergebenen Roots
/// liegt: Die Tabelle behält auch Zeilen zu Ordnern, die aus der Produktion
/// heraus sind. `park_archived_projects` schiebt fertige Projekte nach
/// `_ARCHIVIERT` und hängt ihre Zeile auf den neuen Pfad um (damit Notizen
/// nicht verlorengehen) — die Liste sieht sie nie wieder, die Zahl am Tab
/// zählte sie mit und stand um genau diese Projekte zu hoch.
///
/// Vergleich in Rust statt per SQL-LIKE: die Pfade enthalten `_` und `%`
/// („._BEAT LIBRARY"), und das sind LIKE-Platzhalter.
///
/// ponytail: ein Ordner, der gerade keine FLP mehr hat, bleibt als Zeile
/// stehen (so gewollt) und zählt hier mit, obwohl die Liste ihn nicht zeigt.
/// Erst schärfen, wenn das je vorkommt.
#[tauri::command]
pub fn studio_status_counts(paths: Vec<String>) -> Result<StudioStatusCounts, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT path, status FROM studio_projects WHERE status IN ('ready', 'wip')")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;

    let mut counts = StudioStatusCounts { ready: 0, wip: 0 };
    for (path, status) in rows.flatten() {
        if !liegt_in_roots(&path, &paths) {
            continue;
        }
        match status.as_str() {
            "ready" => counts.ready += 1,
            "wip" => counts.wip += 1,
            _ => {}
        }
    }
    Ok(counts)
}

/// Liegt dieser Projektordner in einem der gescannten Produktions-Ordner?
fn liegt_in_roots(path: &str, roots: &[String]) -> bool {
    let p = norm_path(path);
    roots
        .iter()
        .filter(|r| !r.trim().is_empty())
        .any(|root| p.starts_with(&format!("{}\\", norm_path(root))))
}

/// Namensschema der Projektordner: P0001, P0002 … (seit Scheibe 4, 10.11.2026)
const PROJECT_PREFIX: &str = "P";
/// Das alte Schema „Project_0001“ wird weiter gelesen; „Lücken schließen“ stellt es auf P um.
const PROJECT_PREFIX_ALT: &str = "Project_";

/// Nächster freier Projektname über ALLE Produktions-Roots — eine laufende
/// Nummer wie beim Archiv, aber aus den Ordnernamen statt aus der Datenbank.
/// Beide Zählungen bleiben dadurch getrennt: die Beat-ID im Archiv kommt aus
/// `beats` (get_next_beat_id), diese hier sieht nur den Dateisystem-Stand.
///
/// ponytail: benannte Projekte („MEMORIES") tragen keine Nummer mehr, ihre
/// Nummer wird also irgendwann neu vergeben. Stört erst, wenn die alte Nummer
/// noch irgendwo klebt — dann die höchste je vergebene Nummer in den Settings
/// mitschreiben und hier das Maximum aus beidem nehmen.
#[tauri::command]
pub fn next_project_name(paths: Vec<String>) -> Result<String, String> {
    Ok(format!("{}{:04}", PROJECT_PREFIX, highest_project_number(&paths) + 1))
}

fn highest_project_number(paths: &[String]) -> u32 {
    let mut max = 0;
    for root in paths {
        let Ok(rd) = std::fs::read_dir(Path::new(root)) else { continue };
        for e in rd.filter_map(|e| e.ok()) {
            if !e.path().is_dir() {
                continue;
            }
            if let Some(n) = project_number(&e.file_name().to_string_lossy()) {
                max = max.max(n);
            }
        }
    }
    max
}

/// Eine erkannte Projekt-ID: die Nummer und der Namensteil dahinter.
///
/// Der Name muss mitgeführt werden, sonst macht das Umnummerieren aus
/// „Project_0243 - MEMORIES" wieder ein nacktes „Project_0007".
#[derive(Debug, Clone, PartialEq)]
pub struct ProjectId {
    pub number: u32,
    pub name: Option<String>,
}

/// Höchste Zahl, die noch als Projektnummer durchgeht. Ohne diese Grenze
/// würde ein Ordner namens „2222222" die Nummernvergabe entführen.
const MAX_PROJECT_NUMBER: u32 = 99_999;

/// Erkennt jede Schreibweise, die im Bestand tatsächlich vorkommt:
///
/// ```text
///   Project_0243                    → 243
///   Project_0243 - MEMORIES         → 243, "MEMORIES"
///   #Project_75                     →  75
///   0857                            → 857
///   0857 - Kopie                    → 857, "Kopie"
///   [701] One Sided Love - 125 Cm   → 701, "One Sided Love - 125 Cm"
/// ```
///
/// Groß-/Kleinschreibung egal. Was keine führende Nummer trägt — „NO MORE
/// RUNNING", „#Project_test" — ergibt None und bleibt damit unangetastet.
fn parse_project_id(folder: &str) -> Option<ProjectId> {
    let s = folder.trim();

    // [NNN] Titel — das alte System
    if let Some(rest) = s.strip_prefix('[') {
        let (digits, after) = rest.split_once(']')?;
        return build_project_id(digits, after);
    }

    // Optionales '#', dann optional „Project_“ (alt) oder „P“, dann die Ziffern
    let s = s.strip_prefix('#').unwrap_or(s);
    let ohne = |p: &str| s.get(..p.len()).filter(|h| h.eq_ignore_ascii_case(p)).map(|_| &s[p.len()..]);
    let after_prefix = ohne(PROJECT_PREFIX_ALT)
        .or_else(|| ohne(PROJECT_PREFIX).filter(|r| r.starts_with(|c: char| c.is_ascii_digit())))
        .unwrap_or(s);

    let digits_len = after_prefix.chars().take_while(|c| c.is_ascii_digit()).count();
    if digits_len == 0 {
        return None;
    }
    build_project_id(&after_prefix[..digits_len], &after_prefix[digits_len..])
}

fn build_project_id(digits: &str, rest: &str) -> Option<ProjectId> {
    let number: u32 = digits.trim().parse().ok()?;
    if number == 0 || number > MAX_PROJECT_NUMBER {
        return None;
    }
    // Trennzeichen zwischen Nummer und Name abschneiden
    let name = rest.trim().trim_start_matches(['-', '–', '_']).trim();
    Some(ProjectId {
        number,
        name: if name.is_empty() { None } else { Some(name.to_string()) },
    })
}

/// Nur die Nummer — für die Vergabe der nächsten freien.
fn project_number(folder: &str) -> Option<u32> {
    parse_project_id(folder).map(|id| id.number)
}

/// Nummern, die über alle Roots hinweg mehr als einmal vergeben sind.
/// Im Bestand betrifft das über 200 Ordner: das alte System hat bei 1 angefangen
/// und das neue später wieder — „die ID bleibt" ist erst dann ein Versprechen,
/// wenn das aufgelöst ist.
fn duplicate_project_ids(paths: &[String]) -> Vec<(u32, Vec<String>)> {
    let mut by_number: HashMap<u32, Vec<String>> = HashMap::new();
    let mut seen: std::collections::HashSet<PathBuf> = std::collections::HashSet::new();

    for root in paths {
        let Ok(rd) = std::fs::read_dir(Path::new(root)) else { continue };
        for e in rd.filter_map(|e| e.ok()) {
            let dir = e.path();
            if !dir.is_dir() {
                continue;
            }
            // Derselbe Ordner über zwei Roots erreichbar zählt einmal
            let canon = dir.canonicalize().unwrap_or_else(|_| dir.clone());
            if !seen.insert(canon) {
                continue;
            }
            let name = e.file_name().to_string_lossy().to_string();
            if let Some(id) = parse_project_id(&name) {
                by_number
                    .entry(id.number)
                    .or_default()
                    .push(dir.to_string_lossy().to_string());
            }
        }
    }

    let mut out: Vec<(u32, Vec<String>)> = by_number
        .into_iter()
        .filter(|(_, dirs)| dirs.len() > 1)
        .collect();
    out.sort_by_key(|(n, _)| *n);
    for (_, dirs) in &mut out {
        dirs.sort();
    }
    out
}

// ─── Beat benennen (docs/beat-umbenennen.md) ─────────────────────────────────
// Name, Tonart und BPM landen im Ordnernamen (`Project_0796 - NAME [140 Cmin]`),
// der Scan liest sie von dort zurück. Die Exporte im Ordner-Root ziehen mit
// (`NAME [140 Cmin]_untagged.wav`), von den FLPs nur die neueste. Ältere
// Versionen behalten ihren Namen (Entscheidung 29.10.2026: die Herkunft bleibt
// erkennbar).

#[derive(Debug, Serialize, PartialEq)]
pub struct RenameOp {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Serialize)]
pub struct ProjectRenamePlan {
    pub folder_from: String,
    pub folder_to: String,
    /// Nur Dateien, deren Name sich ändert. Pfade relativ zum Projektordner.
    pub files: Vec<RenameOp>,
}

/// `NAME [140 Cmin]`, `NAME [Cmin]`, `NAME [140]` oder nur `NAME` (docs/namensregeln.md).
fn beat_basisname(name: &str, key: Option<&str>, bpm: Option<i32>) -> String {
    sanitize_filename_part(&format!("{}{}", sanitize_filename_part(name.trim()).to_uppercase(), crate::utils::klammer(key, bpm)))
}

/// Ordnername: die Nummer bleibt (auf `Project_0796` normalisiert), der Rest
/// wird ersetzt. Zweimal angewendet ergibt dasselbe.
fn beat_ordnername(alt: &str, basis: &str) -> String {
    match parse_project_id(alt) {
        Some(id) => format!("{}{:04} - {}", PROJECT_PREFIX, id.number, basis),
        None => basis.to_string(),
    }
}

fn plan_rename(dir: &Path, name: &str, key: Option<&str>, bpm: Option<i32>) -> Result<ProjectRenamePlan, String> {
    if !dir.is_dir() {
        return Err(format!("Projektordner nicht gefunden: {}", dir.display()));
    }
    if sanitize_filename_part(name.trim()).is_empty() {
        return Err("Bitte einen Namen eingeben".to_string());
    }
    let key = key.map(str::trim).filter(|k| !k.is_empty());
    if let Some(k) = key {
        if !crate::utils::is_valid_key(k) {
            return Err(format!("„{}\" ist keine Tonart", k));
        }
    }
    if let Some(b) = bpm {
        if !(40..=300).contains(&b) {
            return Err("BPM zwischen 40 und 300".to_string());
        }
    }
    let basis = beat_basisname(name, key, bpm);
    let folder_from = dir.file_name().and_then(|n| n.to_str()).ok_or("Ungültiger Ordnername")?.to_string();
    let folder_to = beat_ordnername(&folder_from, &basis);

    let mut files = Vec::new();
    // Exporte im Root: je (Endung, Rolle) bekommt der neueste den sauberen
    // Namen, ältere _2, _3 … in Altersreihenfolge.
    let mut gruppen: HashMap<(String, String), Vec<(u64, String)>> = HashMap::new();
    for e in std::fs::read_dir(dir).map_err(|e| e.to_string())?.filter_map(|e| e.ok()) {
        let p = e.path();
        let Some(ext) = p.extension().and_then(|x| x.to_str()).map(str::to_lowercase) else { continue };
        if !p.is_file() || !matches!(ext.as_str(), "mp3" | "wav") {
            continue;
        }
        let datei = e.file_name().to_string_lossy().to_string();
        // Stems tragen keinen Beat-Namen als Export: sie bleiben, wie sie sind
        if crate::utils::ist_stem(&datei) { continue; }
        let stamm = p.file_stem().and_then(|s| s.to_str()).unwrap_or("");
        // Eigener Zusatz (`_mix`) bleibt, sonst WAV `_untagged`, MP3 `_tagged`
        let rolle = crate::utils::export_etikett(stamm, &ext);
        let zeit = e.metadata().and_then(|m| m.modified()).ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map_or(0, |d| d.as_secs());
        gruppen.entry((ext, rolle)).or_default().push((zeit, datei));
    }
    for ((ext, rolle), mut liste) in gruppen {
        liste.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
        for (i, (_, from)) in liste.into_iter().enumerate() {
            let nr = if i == 0 { String::new() } else { format!("_{}", i + 1) };
            files.push(RenameOp { to: format!("{}{}{}.{}", basis, rolle, nr, ext), from });
        }
    }
    // Die neueste FLP an ihrem Platz (Root oder 01_SAVEFILES)
    if let Some(flp) = scan_project_dir(dir, "").and_then(|p| p.newest_flp) {
        let flp = PathBuf::from(flp);
        if let (Ok(rel), Some(eltern)) = (flp.strip_prefix(dir), flp.parent()) {
            let ziel = eltern.join(format!("{}.flp", basis));
            let from = rel.to_string_lossy().to_string();
            let to = ziel.strip_prefix(dir).map_err(|e| e.to_string())?.to_string_lossy().to_string();
            if ziel.exists() && !from.eq_ignore_ascii_case(&to) {
                return Err(format!("„{}\" gibt es im Projekt schon", to));
            }
            files.push(RenameOp { from, to });
        }
    }
    files.retain(|op| op.from != op.to);
    files.sort_by(|a, b| a.from.cmp(&b.from));
    Ok(ProjectRenamePlan { folder_from, folder_to, files })
}

/// Vorschau für den Dialog „Beat benennen". Rein lesend.
#[tauri::command(async)]
pub fn plan_project_rename(path: String, name: String, key: Option<String>, bpm: Option<i32>) -> Result<ProjectRenamePlan, String> {
    plan_rename(Path::new(&path), &name, key.as_deref(), bpm)
}

/// Benennen ausführen: plant neu (Vorschau und Ausführung können nicht
/// auseinanderlaufen), Dateien in zwei Phasen über Zwischennamen, den Ordner
/// zuletzt, dann FLP-Pfade nachziehen und die DB-Zeile umhängen.
#[tauri::command(async)]
pub fn apply_project_rename(path: String, name: String, key: Option<String>, bpm: Option<i32>) -> Result<String, String> {
    let dir = PathBuf::from(&path);
    let ziel = apply_rename(&dir, &name, key.as_deref(), bpm)?;
    let neu = ziel.to_string_lossy().to_string();
    if neu != path {
        if let Err(e) = crate::commands::artists::pfade_reparieren(&ziel) {
            eprintln!("WARNING: FLP-Pfade in {} nicht nachgezogen: {}", ziel.display(), e);
        }
        let conn = open_db().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE OR REPLACE studio_projects SET path = ?1 WHERE path = ?2",
            rusqlite::params![neu, path],
        ).map_err(|e| e.to_string())?;
        crate::commands::artists::projekt_umhaengen(&conn, &path, &neu).map_err(|e| e.to_string())?;
    }
    Ok(neu)
}

/// Der Dateisystem-Teil (ohne DB, damit testbar).
fn apply_rename(dir: &Path, name: &str, key: Option<&str>, bpm: Option<i32>) -> Result<PathBuf, String> {
    let plan = plan_rename(dir, name, key, bpm)?;
    let gesperrt = |e: std::io::Error, datei: &str| format!("„{}\" ließ sich nicht umbenennen (in FL offen?): {}", datei, e);
    // Phase 1: alles auf Zwischennamen. Schlägt eine fehl, die schon bewegten zurück.
    let mut zwischen: Vec<(PathBuf, &RenameOp)> = Vec::new();
    for (i, op) in plan.files.iter().enumerate() {
        let von = dir.join(&op.from);
        let tmp = von.with_file_name(format!(".beatos-benennen-{}", i));
        if let Err(e) = std::fs::rename(&von, &tmp) {
            for (t, o) in &zwischen { let _ = std::fs::rename(t, dir.join(&o.from)); }
            return Err(gesperrt(e, &op.from));
        }
        zwischen.push((tmp, op));
    }
    // Phase 2: auf die Ziele. Ab hier wird nur noch gemeldet.
    let mut fehler = Vec::new();
    for (tmp, op) in &zwischen {
        if let Err(e) = std::fs::rename(tmp, dir.join(&op.to)) {
            let _ = std::fs::rename(tmp, dir.join(&op.from));
            fehler.push(gesperrt(e, &op.from));
        }
    }
    if !fehler.is_empty() {
        return Err(fehler.join("\n"));
    }
    // Der Ordner zuletzt
    if plan.folder_from == plan.folder_to {
        return Ok(dir.to_path_buf());
    }
    let neu = dir.parent().ok_or("Projektordner hat keinen Elternordner")?.join(&plan.folder_to);
    if neu.exists() && !plan.folder_from.eq_ignore_ascii_case(&plan.folder_to) {
        return Err(format!("„{}\" gibt es schon. Dateien sind umbenannt, der Ordner nicht", plan.folder_to));
    }
    std::fs::rename(dir, &neu).map_err(|e| format!("Ordner ließ sich nicht umbenennen (in FL offen?): {}", e))?;
    Ok(neu)
}

/// FLPs, die genau wie der Ordner hießen, heißen weiter wie der Ordner.
/// Selbst benannte Versionen ("hook_v3.flp") bleiben unangetastet. Best effort:
/// der Ordner ist an dieser Stelle schon umbenannt.
fn rename_matching_flps(dir: &Path, old_name: &str, new_name: &str) {
    let mut dirs = vec![dir.to_path_buf()];
    if let Ok(rd) = std::fs::read_dir(dir) {
        dirs.extend(rd.filter_map(|e| e.ok()).map(|e| e.path()).filter(|p| p.is_dir()));
    }
    for d in dirs {
        let Ok(rd) = std::fs::read_dir(&d) else { continue };
        for e in rd.filter_map(|e| e.ok()) {
            let p = e.path();
            if !is_flp(&p) {
                continue;
            }
            let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("");
            if !stem.eq_ignore_ascii_case(old_name) {
                continue;
            }
            let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("flp");
            let _ = std::fs::rename(&p, d.join(format!("{}.{}", new_name, ext)));
        }
    }
}

/// Neues Projekt anlegen: Ordner im gewählten Produktions-Root, darin direkt
/// eine Kopie der Template-FLP unter dem Projektnamen. Kein `01_SAVEFILES` —
/// das ist das Archiv-Layout; Studio-Projekte haben die FLP im Root, `Backup/`
/// legt FL selbst daneben an. Die Vorlage darf auch eine archivierte FLP sein
/// („Neue Version" im Archiv) — kopiert wird nur diese eine Datei.
/// Gibt den Pfad der neuen FLP zurück — das Frontend öffnet sie direkt in FL.
#[tauri::command]
pub fn create_project_folder(
    root: String,
    name: String,
    template_flp: String,
) -> Result<String, String> {
    let root_path = Path::new(&root);
    if !root_path.is_dir() {
        return Err(format!("Produktions-Ordner nicht gefunden: {}", root));
    }

    let folder = sanitize_filename_part(&name);
    if folder.is_empty() {
        return Err("Bitte einen Projektnamen eingeben".to_string());
    }

    let template = Path::new(&template_flp);
    if !template.is_file() || !is_flp(template) {
        return Err(format!(
            "Template-FLP nicht gefunden: '{}' (Einstellungen → Pfade)",
            template_flp
        ));
    }

    let dir = root_path.join(&folder);
    if dir.exists() {
        return Err(format!("„{}\" gibt es in diesem Ordner schon", folder));
    }
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Ordner konnte nicht angelegt werden: {}", e))?;

    // Ein Projekt (P-Nummer) bekommt gleich seinen Stems-Ordner; Samples und Songs nicht
    if parse_project_id(&folder).is_some() {
        let _ = std::fs::create_dir(dir.join(crate::utils::STEMS_PROJEKT));
    }
    let dest = dir.join(format!("{}.flp", folder));
    if let Err(e) = crate::utils::copy_and_verify(template, &dest) {
        // Halbfertigen Ordner nicht liegen lassen
        let _ = std::fs::remove_dir_all(&dir);
        return Err(e);
    }
    // Die Kopie erbt das Datum der Vorlage, ein neues Projekt sähe sonst alt
    // aus und fiele beim nächsten Scan fest ins Aufräumen.
    if let Ok(f) = std::fs::File::options().write(true).open(&dest) {
        let _ = f.set_modified(std::time::SystemTime::now());
    }

    Ok(dest.to_string_lossy().to_string())
}

/// „Beat daraus machen“: neues Projekt aus der Beat-Vorlage im ersten
/// Produktions-Ordner, die WAVs des Samples nach `Audio/` (Arbeitsmaterial,
/// kein Export), in der Notiz steht das Sample samt Tempo und Tonart. Das Tempo
/// in der FLP setzt BeatOS nicht. Gibt die neue FLP zurück.
#[tauri::command]
pub fn beat_aus_sample(sample: String, template_flp: String) -> Result<String, String> {
    let flp = beat_aus_sample_in(&production_roots(), Path::new(&sample), template_flp)?;
    let ordner = Path::new(&flp).parent().unwrap_or(Path::new("")).to_string_lossy().to_string();
    let woher = Path::new(&sample).file_name().unwrap_or_default().to_string_lossy().to_string();
    if let Ok(conn) = open_db() {
        let _ = conn.execute(
            "INSERT INTO studio_projects (path, status, notes) VALUES (?1, 'idea', ?2)
             ON CONFLICT(path) DO UPDATE SET notes = excluded.notes",
            rusqlite::params![ordner, format!("Aus Sample {}", woher)],
        );
    }
    Ok(flp)
}

fn beat_aus_sample_in(roots: &[String], sample: &Path, template_flp: String) -> Result<String, String> {
    let root = roots.first().ok_or("Kein Produktions-Ordner (Einstellungen → Pfade)")?.clone();
    let flp = create_project_folder(root, next_project_name(roots.to_vec())?, template_flp)?;
    let audio: Vec<PathBuf> = std::fs::read_dir(sample).into_iter().flatten().flatten().map(|e| e.path())
        .filter(|p| p.is_file() && p.extension().and_then(|e| e.to_str()).is_some_and(crate::utils::is_audio_extension))
        .collect();
    // WAVs, wo es welche gibt: MP3 daneben ist nur dieselbe Spur noch einmal
    let ist_wav = |p: &&PathBuf| p.extension().is_some_and(|e| e.eq_ignore_ascii_case("wav"));
    let quelle: Vec<&PathBuf> = if audio.iter().any(|p| ist_wav(&p)) { audio.iter().filter(ist_wav).collect() } else { audio.iter().collect() };
    if !quelle.is_empty() {
        let ziel = Path::new(&flp).parent().ok_or("Kein Projektordner")?.join("Audio");
        std::fs::create_dir_all(&ziel).map_err(|e| format!("Projekt liegt bereit, Audio-Ordner fehlt: {}", e))?;
        for p in quelle {
            crate::utils::copy_and_verify(p, &ziel.join(p.file_name().unwrap_or_default()))
                .map_err(|e| format!("Projekt liegt bereit, Spur nicht kopiert: {}", e))?;
        }
    }
    Ok(flp)
}

/// Neues Sample in `06_SAMPLES`: Ordner `S0001 Name` (Name optional) mit einer
/// Kopie der Sample-Vorlage, sonst wie ein Studio-Projekt. Eigene `S`-Nummern,
/// damit sie den Projektnummern nicht in die Quere kommen. Den Samples-Ordner
/// legt der erste Aufruf selbst an.
#[tauri::command]
pub fn create_sample(root: String, name: String, template_flp: String) -> Result<String, String> {
    let ordner = naechster_sample_ordner(&root, &name)?;
    create_project_folder(root, ordner, template_flp)
}

#[derive(Debug, Serialize)]
pub struct FlVorlage {
    /// Unterordner = Typ: `Beat`, `Sample`, `Recording`, `Mix-Master`
    pub ordner: String,
    pub name: String,
    pub pfad: String,
}

/// Jede FLP in `<dir>/<Typ>/` für das Menü „Neu". Fehlender Ordner = keine
/// Vorlagen, kein Fehler. Sortiert nach Ordner, dann Name.
#[tauri::command]
pub fn fl_vorlagen(dir: String) -> Vec<FlVorlage> {
    let mut alle = Vec::new();
    for typ in std::fs::read_dir(&dir).into_iter().flatten().flatten() {
        if !typ.path().is_dir() { continue; }
        let ordner = typ.file_name().to_string_lossy().to_string();
        for f in std::fs::read_dir(typ.path()).into_iter().flatten().flatten() {
            let p = f.path();
            if p.is_file() && is_flp(&p) {
                alle.push(FlVorlage {
                    ordner: ordner.clone(),
                    name: p.file_stem().unwrap_or_default().to_string_lossy().to_string(),
                    pfad: p.to_string_lossy().to_string(),
                });
            }
        }
    }
    alle.sort_by(|a, b| (&a.ordner, a.name.to_lowercase()).cmp(&(&b.ordner, b.name.to_lowercase())));
    alle
}

/// Projekt (aus Projekte oder Aufräumen) als Sample nach `06_SAMPLES`: Ordner
/// verschieben und als `S0012 Name` benennen, gleichnamige FLPs mitziehen. FL
/// speichert Audio mit vollem Pfad, also danach die Pfade in den FLPs
/// nachziehen (Sicherung in Backup/). Die DB-Zeile fällt weg, Samples haben
/// keinen Status. Nachrücken der Projektnummern macht das Frontend danach.
#[tauri::command(async)]
pub fn move_to_samples(path: String, root: String, name: String) -> Result<String, String> {
    let ziel = move_dir_to_samples(Path::new(&path), &root, &name)?;
    if let Err(e) = crate::commands::artists::pfade_reparieren(&ziel) {
        eprintln!("WARNING: FLP-Pfade in {} nicht nachgezogen: {}", ziel.display(), e);
    }
    let conn = open_db().map_err(|e| e.to_string())?;
    let _ = conn.execute("DELETE FROM studio_projects WHERE path = ?1", rusqlite::params![path]);
    Ok(ziel.to_string_lossy().to_string())
}

/// Der Dateisystem-Teil (ohne DB, damit testbar).
fn move_dir_to_samples(dir: &Path, root: &str, name: &str) -> Result<PathBuf, String> {
    if !dir.is_dir() {
        return Err(format!("Projektordner nicht gefunden: {}", dir.display()));
    }
    let alt = dir.file_name().and_then(|n| n.to_str()).ok_or("Ungültiger Ordnername")?.to_string();
    let ordner = sanitize_filename_part(&naechster_sample_ordner(root, name)?);
    let ziel = Path::new(root).join(&ordner);
    if ziel.exists() {
        return Err(format!("„{}\" gibt es in Samples schon", ordner));
    }
    std::fs::rename(dir, &ziel)
        .map_err(|e| format!("„{}\" ließ sich nicht verschieben (in FL offen?): {}", alt, e))?;
    rename_matching_flps(&ziel, &alt, &ordner);
    Ok(ziel)
}

/// `S0013 Name` (oder nur `S0013`) mit der nächsten freien Nummer in `root`.
/// Legt `root` an, falls es ihn noch nicht gibt.
fn naechster_sample_ordner(root: &str, name: &str) -> Result<String, String> {
    std::fs::create_dir_all(root)
        .map_err(|e| format!("Samples-Ordner konnte nicht angelegt werden: {}", e))?;
    let naechste = std::fs::read_dir(root)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter_map(|e| sample_number(&e.file_name().to_string_lossy()))
        .max()
        .unwrap_or(0) + 1;
    let name = name.trim();
    Ok(if name.is_empty() { format!("S{:04}", naechste) } else { format!("S{:04} {}", naechste, name) })
}

/// Alle Samples in `06_SAMPLES`: derselbe Ordner-Scan wie bei Projekten, aber
/// ohne Datenbank. Sonst zählten Samples in der Statistik als Ideen und fielen
/// nach 30 Tagen ins Aufräumen.
#[tauri::command]
pub async fn scan_samples(root: String) -> Result<Vec<StudioProject>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Ok(rd) = std::fs::read_dir(&root) else { return Vec::new() };
        rd.filter_map(|e| e.ok())
            .filter(|e| e.path().is_dir())
            // `_MIDI` und Co. sind Ablagen, keine Samples
            .filter(|e| !e.file_name().to_string_lossy().starts_with('_'))
            .filter_map(|e| scan_dir(&e.path(), &root, true))
            .collect()
    })
    .await
    .map_err(|e| format!("Sample-Scan abgestürzt: {}", e))
}

#[derive(Debug, Serialize, PartialEq)]
pub struct SampleSpur {
    /// Dateiname ohne Endung
    pub name: String,
    pub audio: Option<String>,
    pub midi: Option<String>,
}

/// Spuren eines Samples (oberste Ebene): WAV/MP3 und MIDI mit gleichem Namen
/// sind eine Spur. Bei WAV und MP3 nebeneinander gewinnt die WAV.
#[tauri::command]
pub fn sample_spuren(path: String) -> Vec<SampleSpur> {
    let mut spuren: std::collections::BTreeMap<String, SampleSpur> = std::collections::BTreeMap::new();
    for p in std::fs::read_dir(&path).into_iter().flatten().flatten().map(|e| e.path()) {
        if !p.is_file() || !ist_spur(&p) { continue; }
        let name = stamm(&p);
        let ext = p.extension().unwrap_or_default().to_string_lossy().to_lowercase();
        let pfad = Some(p.to_string_lossy().to_string());
        let s = spuren.entry(name.clone()).or_insert(SampleSpur { name, audio: None, midi: None });
        if ext == "mid" { s.midi = pfad } else if s.audio.is_none() || ext == "wav" { s.audio = pfad }
    }
    spuren.into_values().collect()
}

#[derive(Debug, Default, Serialize, PartialEq)]
pub struct MidiVorschau {
    /// Ticks je Viertel, 0 wenn die Datei in Timecode zählt
    pub ppq: u32,
    /// Erstes Tempo aus der Datei, falls eins drinsteht
    pub bpm: Option<f64>,
    /// `[Start, Länge, Tonhöhe]` in Ticks, alle Spuren und Kanäle zusammen
    pub noten: Vec<[u32; 3]>,
}

/// Noten einer MIDI-Datei für die Vorschau. Unlesbare Datei = keine Noten.
#[tauri::command]
pub fn midi_noten(path: String) -> MidiVorschau {
    std::fs::read(&path).map(|b| noten_aus_midi(&b)).unwrap_or_default()
}

/// Tempo-Event → BPM. Die Norm schreibt Mikrosekunden je Viertel; FL Studio
/// schreibt in seine Exporte das Tempo selbst (145 statt 413 793). Was in
/// keiner Lesart ein Tempo ergibt, zählt nicht.
fn tempo_aus_midi(wert: u32) -> Option<f64> {
    if (40..=300).contains(&wert) { return Some(wert as f64); }
    Some(60_000_000.0 / wert.max(1) as f64).filter(|b| (20.0..=400.0).contains(b))
}

fn noten_aus_midi(bytes: &[u8]) -> MidiVorschau {
    use midly::{MetaMessage, MidiMessage, Timing, TrackEventKind};
    let Ok(smf) = midly::Smf::parse(bytes) else { return MidiVorschau::default() };
    let ppq = match smf.header.timing { Timing::Metrical(t) => t.as_int() as u32, _ => 0 };
    let mut bpm = None;
    let mut noten = Vec::new();
    for spur in &smf.tracks {
        let mut zeit = 0u32;
        // (Kanal, Tonhöhe) → Start der klingenden Note
        let mut offen: std::collections::HashMap<(u8, u8), u32> = std::collections::HashMap::new();
        for ev in spur {
            zeit += ev.delta.as_int();
            if let TrackEventKind::Meta(MetaMessage::Tempo(us)) = ev.kind {
                if bpm.is_none() { bpm = tempo_aus_midi(us.as_int()); }
            }
            let TrackEventKind::Midi { channel, message } = ev.kind else { continue };
            let (key, an) = match message {
                MidiMessage::NoteOn { key, vel } => (key.as_int(), vel.as_int() > 0),
                MidiMessage::NoteOff { key, .. } => (key.as_int(), false),
                _ => continue,
            };
            // Neue Note oder Ende: eine noch klingende auf derselben Taste endet hier
            if let Some(start) = offen.remove(&(channel.as_int(), key)) {
                noten.push([start, zeit - start, key as u32]);
            }
            if an { offen.insert((channel.as_int(), key), zeit); }
        }
    }
    noten.sort();
    MidiVorschau { ppq, bpm, noten }
}

/// MIDI zum Herausziehen: transponiert und/oder auf die Takte `von..bis` (ab 0,
/// `bis` ausgeschlossen) gekürzt. Liegt danach unter dem gewünschten Namen im
/// Temp-Ordner, das Original bleibt unberührt.
#[tauri::command]
pub fn midi_ausschnitt(path: String, name: String, halbtoene: i32, von: Option<u32>, bis: Option<u32>) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let neu = midi_umbauen(&bytes, halbtoene, von.zip(bis))?;
    // ponytail: die Dateien bleiben im Temp-Ordner liegen (je wenige KB); aufräumen, falls es stört
    let ordner = std::env::temp_dir().join("BeatOS-MIDI");
    std::fs::create_dir_all(&ordner).map_err(|e| e.to_string())?;
    let sauber: String = name.chars().map(|c| if r#"/:*?"<>|"#.contains(c) { '_' } else { c }).collect();
    let ziel = ordner.join(format!("{sauber}.mid"));
    std::fs::write(&ziel, neu).map_err(|e| e.to_string())?;
    Ok(ziel.to_string_lossy().to_string())
}

/// Takte zählen als 4/4, wie in der Vorschau. Beim Kürzen fallen Noten weg, die
/// vor dem Ausschnitt beginnen; was hineinragt, endet an seiner Grenze. Tempo
/// und Einstellungen von davor gelten ab dem ersten Tick.
fn midi_umbauen(bytes: &[u8], halbtoene: i32, takte: Option<(u32, u32)>) -> Result<Vec<u8>, String> {
    use midly::{num::{u28, u4, u7}, MetaMessage, MidiMessage, Timing, TrackEvent, TrackEventKind};
    let mut smf = midly::Smf::parse(bytes).map_err(|e| e.to_string())?;
    let bereich = match (takte, smf.header.timing) {
        (Some((von, bis)), Timing::Metrical(t)) if bis > von => {
            let takt = t.as_int() as u32 * 4;
            Some((von * takt, bis * takt))
        }
        (Some(_), _) => return Err("MIDI ohne Takt-Raster".into()),
        _ => None,
    };
    let hoch = |k: u7| u7::new((k.as_int() as i32 + halbtoene).clamp(0, 127) as u8);
    for spur in &mut smf.tracks {
        for ev in spur.iter_mut() {
            if let TrackEventKind::Midi { message, .. } = &mut ev.kind {
                match message {
                    MidiMessage::NoteOn { key, .. } | MidiMessage::NoteOff { key, .. } | MidiMessage::Aftertouch { key, .. } => *key = hoch(*key),
                    _ => {}
                }
            }
        }
        let Some((a, b)) = bereich else { continue };
        let mut zeit = 0u32;
        // (Kanal, Tonhöhe) → im Ausschnitt begonnene, noch klingende Noten
        let mut offen: HashMap<(u8, u8), u32> = HashMap::new();
        let mut raus: Vec<(u32, TrackEventKind)> = Vec::new();
        for ev in spur.iter() {
            zeit += ev.delta.as_int();
            match ev.kind {
                TrackEventKind::Meta(MetaMessage::EndOfTrack) => {}
                TrackEventKind::Midi { channel, message: MidiMessage::NoteOn { key, vel } } if vel.as_int() > 0 => {
                    if zeit >= a && zeit < b {
                        *offen.entry((channel.as_int(), key.as_int())).or_default() += 1;
                        raus.push((zeit - a, ev.kind));
                    }
                }
                TrackEventKind::Midi { channel, message: MidiMessage::NoteOn { key, .. } | MidiMessage::NoteOff { key, .. } } => {
                    if let Some(n) = offen.get_mut(&(channel.as_int(), key.as_int())).filter(|n| **n > 0) {
                        *n -= 1;
                        raus.push((zeit.min(b) - a, ev.kind));
                    }
                }
                _ => if zeit < b { raus.push((zeit.saturating_sub(a), ev.kind)) },
            }
        }
        // Ohne Ende in der Datei klänge die Note in FL ewig
        for ((kanal, key), n) in offen {
            for _ in 0..n {
                raus.push((b - a, TrackEventKind::Midi { channel: u4::new(kanal), message: MidiMessage::NoteOff { key: u7::new(key), vel: u7::new(0) } }));
            }
        }
        raus.sort_by_key(|(t, _)| *t);
        raus.push((b - a, TrackEventKind::Meta(MetaMessage::EndOfTrack)));
        let mut davor = 0u32;
        *spur = raus.into_iter().map(|(t, kind)| {
            let delta = u28::new(t - davor);
            davor = t;
            TrackEvent { delta, kind }
        }).collect();
    }
    let mut out = Vec::new();
    smf.write_std(&mut out).map_err(|e| e.to_string())?;
    Ok(out)
}

// Teile: Alte Ideen, Neues erkennen + Samples, Zusammenführen, Nachrücken, Parken, Asset-Inbox
mod ideen;
mod neu;
mod zusammenfuehren;
mod nachruecken;
mod parken;
mod assets;
pub use ideen::*;
pub use neu::*;
pub use zusammenfuehren::*;
pub use nachruecken::*;
pub use parken::*;
pub use assets::*;

#[cfg(test)]
mod tests;
#[cfg(test)]
mod asset_tests;
