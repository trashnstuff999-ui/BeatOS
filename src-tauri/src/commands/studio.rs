// src-tauri/src/commands/studio.rs
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
    /// All FLP versions, newest first (for the inspector)
    pub flps: Vec<FlpEntry>,
    pub modified_date: Option<String>, // of newest FLP (fallback: folder)
    pub modified_secs: u64,            // for sorting
    pub has_mp3: bool,
    pub has_wav: bool,
    pub has_cover: bool,
    pub has_thumbnail: bool,
    pub has_video: bool,
    // from studio_projects table:
    pub status: String,
    pub priority: i64,
    pub notes: Option<String>,
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
            if !dir.is_dir() {
                continue;
            }
            if let Some(p) = scan_project_dir(&dir, root) {
                projects.push(p);
            }
        }
    }

    // Merge with DB state + drop orphaned rows (folder gone = archived/deleted)
    let conn = open_db().map_err(|e| e.to_string())?;
    let mut db_state: HashMap<String, (String, i64, Option<String>)> = HashMap::new();
    {
        let mut stmt = conn
            .prepare("SELECT path, status, priority, notes FROM studio_projects")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    (r.get::<_, String>(1)?, r.get::<_, i64>(2)?, r.get::<_, Option<String>>(3)?),
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

    for p in &mut projects {
        let derived = derive_stage(p.has_mp3, p.has_wav, p.has_cover, p.has_thumbnail, p.has_video);
        match db_state.get(&p.path) {
            Some((status, priority, notes)) => {
                p.priority = *priority;
                p.notes = notes.clone();
                p.status = resolve_status(Some(status), derived);
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
                let _ = conn.execute(
                    "INSERT OR IGNORE INTO studio_projects (path, status) VALUES (?1, ?2)",
                    rusqlite::params![p.path, p.status],
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

/// One project folder → StudioProject (None if it contains no FLP).
fn scan_project_dir(dir: &Path, root: &str) -> Option<StudioProject> {
    let mut flps: Vec<(u64, PathBuf)> = Vec::new();
    let mut has_mp3 = false;
    let mut has_wav = false;
    let mut has_cover = false;
    let mut has_thumbnail = false;
    let mut has_video = false;
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
            if ext == "mp3" { has_mp3 = true; }
            if ext == "wav" { has_wav = true; }
            if ext == "mp3" || ext == "wav" {
                let rank = if ext == "mp3" { 1 } else { 0 };
                audio_exports.push((rank, file_modified_secs(&p).unwrap_or(0), file_name));
            }
            if is_image_extension(&ext) {
                if name_lower.contains("thumb") { has_thumbnail = true; } else { has_cover = true; }
            }
            if is_video_extension(&ext) { has_video = true; }
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

    if flps.is_empty() {
        return None;
    }
    flps.sort_by_key(|(secs, _)| *secs);
    let (newest_secs, newest_flp) = flps.last().cloned()?;

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
        newest_flp: Some(newest_flp.to_string_lossy().to_string()),
        flp_count: flps.len(),
        flps: flp_entries,
        modified_date: if modified_secs > 0 { Some(secs_to_date(modified_secs)) } else { None },
        modified_secs,
        has_mp3,
        has_wav,
        has_cover,
        has_thumbnail,
        has_video,
        status: "idea".to_string(),
        priority: 0,
        notes: None,
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

/// Namensschema der Projektordner: Project_1, Project_2, …
const PROJECT_PREFIX: &str = "Project_";

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

    // Optionales '#', dann optional das Wort "Project_", dann die Ziffern
    let s = s.strip_prefix('#').unwrap_or(s);
    let after_prefix = match s.get(..PROJECT_PREFIX.len()) {
        Some(head) if head.eq_ignore_ascii_case(PROJECT_PREFIX) => &s[PROJECT_PREFIX.len()..],
        _ => s,
    };

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

/// Projekt umbenennen: Ordner umbenennen, gleichnamige FLPs mitziehen und die
/// DB-Zeile (Status/Priorität/Notizen) auf den neuen Pfad umhängen — sonst
/// räumt der nächste Scan sie als verwaist weg. Gibt den neuen Pfad zurück.
#[tauri::command]
pub fn rename_project_folder(path: String, new_name: String) -> Result<String, String> {
    let new_dir = rename_project_dir(Path::new(&path), &new_name)?;
    let new_path = new_dir.to_string_lossy().to_string();

    if new_path != path {
        let conn = open_db().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE OR REPLACE studio_projects SET path = ?1 WHERE path = ?2",
            rusqlite::params![new_path, path],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(new_path)
}

/// Der Dateisystem-Teil des Umbenennens (ohne DB, damit testbar).
fn rename_project_dir(dir: &Path, new_name: &str) -> Result<PathBuf, String> {
    if !dir.is_dir() {
        return Err(format!("Projektordner nicht gefunden: {}", dir.display()));
    }
    let folder = sanitize_filename_part(new_name);
    if folder.is_empty() {
        return Err("Bitte einen Projektnamen eingeben".to_string());
    }
    let old_name = dir
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Ungültiger Ordnername")?
        .to_string();
    if folder == old_name {
        return Ok(dir.to_path_buf());
    }

    let parent = dir.parent().ok_or("Projektordner hat keinen Elternordner")?;
    let new_dir = parent.join(&folder);
    if new_dir.exists() {
        return Err(format!("„{}\" gibt es in diesem Ordner schon", folder));
    }
    std::fs::rename(dir, &new_dir)
        .map_err(|e| format!("Ordner konnte nicht umbenannt werden: {}", e))?;

    rename_matching_flps(&new_dir, &old_name, &folder);
    Ok(new_dir)
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

/// Neues Projekt anlegen: Ordner im gewählten Produktions-Root, darin
/// `01_SAVEFILES` mit einer Kopie der Template-FLP unter dem Projektnamen.
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
            "Template-FLP nicht gefunden: '{}' — in den Einstellungen unter „Template-FLP\" setzen",
            template_flp
        ));
    }

    let dir = root_path.join(&folder);
    if dir.exists() {
        return Err(format!("„{}\" gibt es in diesem Ordner schon", folder));
    }
    let saves = dir.join("01_SAVEFILES");
    std::fs::create_dir_all(&saves)
        .map_err(|e| format!("Ordner konnte nicht angelegt werden: {}", e))?;

    let dest = saves.join(format!("{}.flp", folder));
    if let Err(e) = crate::utils::copy_and_verify(template, &dest) {
        // Halbfertigen Ordner nicht liegen lassen
        let _ = std::fs::remove_dir_all(&dir);
        return Err(e);
    }

    Ok(dest.to_string_lossy().to_string())
}

// ═══════════════════════════════════════════════════════════════════════════════
// Produktions-Ordner zusammenführen
//
// Alle "Project_<Zahl>"-Ordner aus mehreren Roots landen in EINEM Zielordner und
// werden nach dem Datum ihrer ältesten FLP durchnummeriert (ältester = 0001).
// Ordner mit anderem Namensschema und solche ohne FLP bleiben unangetastet
// liegen, wo sie sind.
//
// Sicherheitsnetz, weil das über hunderte echte Ordner läuft:
//   1. plan_production_merge zeigt jeden Schritt, bevor irgendetwas passiert
//   2. Umbenannt wird in zwei Phasen (erst temporäre Namen), damit sich zwei
//      Ordner nie um denselben Namen streiten
//   3. Ein vorhandener Zielname wird NIE überschrieben — der Schritt scheitert
//      und wird gemeldet
//   4. Jeder ausgeführte Umzug landet in einem JSON-Protokoll; undo_production_
//      merge spielt es rückwärts ab
// ═══════════════════════════════════════════════════════════════════════════════

/// Zwischenname während Phase 1. Bleibt nach einem Absturz sichtbar liegen.
const MERGE_TEMP_PREFIX: &str = ".beatos_merge_";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeStep {
    pub from: String,
    pub to: String,
    pub old_name: String,
    pub new_name: String,
    /// Datum der ältesten FLP — nur für die Anzeige
    pub date: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct MergeSkip {
    pub path: String,
    pub name: String,
    pub reason: String,
}

/// Eine Nummer, die mehr als einem Ordner gehört.
#[derive(Debug, Serialize)]
pub struct DuplicateId {
    pub number: u32,
    pub dirs: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct MergePlan {
    pub target: String,
    pub steps: Vec<MergeStep>,
    pub skipped: Vec<MergeSkip>,
    /// Mehrfach vergebene Nummern im aktuellen Bestand. Der Lauf löst sie auf —
    /// die Liste sagt vorher, wie groß das Problem ist.
    pub duplicates: Vec<DuplicateId>,
}

#[derive(Debug, Serialize)]
pub struct MergeReport {
    pub moved: usize,
    /// Menschenlesbare Zeilen: was hat nicht geklappt und warum
    pub failed: Vec<String>,
    /// Pfad des Protokolls für das Rückgängigmachen
    pub log_path: Option<String>,
    /// Weitere Ablageorte desselben Protokolls — eine Kopie kann verlorengehen,
    /// beide gleichzeitig praktisch nicht
    pub log_copies: Vec<String>,
    /// Die lesbare Liste im Zielordner, direkt neben den Ordnern
    pub summary_path: Option<String>,
    pub db_backup: Option<String>,
}

/// Pfade vergleichbar machen: Windows unterscheidet keine Groß-/Kleinschreibung
/// und mischt Schrägstriche.
fn norm_path(p: &str) -> String {
    p.replace('/', "\\").trim_end_matches('\\').to_lowercase()
}

/// Vorschau: was würde wohin wandern und wie hieße es danach.
///
/// `exclude` nimmt Ordner aus dem Lauf, bevor die Nummern vergeben werden —
/// sonst entstünden Lücken. Gedacht für Projekte, die nachweislich vollständig
/// im Archiv liegen: die brauchen keine Nummer mehr und sollen keine
/// verbrauchen.
#[tauri::command]
pub fn plan_production_merge(
    paths: Vec<String>,
    target: String,
    exclude: Vec<String>,
) -> Result<MergePlan, String> {
    let excluded: std::collections::HashSet<String> =
        exclude.iter().map(|p| norm_path(p)).collect();
    let target_dir = Path::new(&target);
    if !target_dir.is_dir() {
        return Err(format!("Zielordner nicht gefunden: {}", target));
    }

    // Der Zielordner zählt immer mit — auch seine Projekte werden neu nummeriert
    let mut roots: Vec<String> = paths;
    if !roots.iter().any(|r| Path::new(r) == target_dir) {
        roots.push(target.clone());
    }

    let mut candidates: Vec<(u64, PathBuf, String, ProjectId)> = Vec::new();
    let mut skipped: Vec<MergeSkip> = Vec::new();
    let mut seen: std::collections::HashSet<PathBuf> = std::collections::HashSet::new();

    for root in &roots {
        let Ok(rd) = std::fs::read_dir(Path::new(root)) else { continue };
        for e in rd.filter_map(|e| e.ok()) {
            let dir = e.path();
            if !dir.is_dir() {
                continue;
            }
            let canon = dir.canonicalize().unwrap_or_else(|_| dir.clone());
            if !seen.insert(canon) {
                continue; // derselbe Ordner über zwei Roots erreichbar
            }
            let name = e.file_name().to_string_lossy().to_string();
            let path_str = dir.to_string_lossy().to_string();

            // Vollständig archiviert: bleibt liegen und verbraucht keine Nummer
            if excluded.contains(&norm_path(&path_str)) {
                skipped.push(MergeSkip {
                    path: path_str,
                    name,
                    reason: "vollständig archiviert".to_string(),
                });
                continue;
            }

            let Some(id) = parse_project_id(&name) else {
                skipped.push(MergeSkip {
                    path: path_str,
                    name,
                    reason: "keine Nummer im Namen".to_string(),
                });
                continue;
            };
            match oldest_flp_secs(&dir) {
                Some(secs) => candidates.push((secs, dir, name, id)),
                None => skipped.push(MergeSkip {
                    path: dir.to_string_lossy().to_string(),
                    name,
                    reason: "keine FLP gefunden".to_string(),
                }),
            }
        }
    }

    // Ältester Beat zuerst; bei gleichem Datum entscheidet der Pfad, damit die
    // Vorschau bei jedem Durchlauf dieselbe Reihenfolge zeigt.
    candidates.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));

    // Die neue Nummer läuft nach Alter durch; ein vorhandener Namensteil zieht
    // mit, damit „Project_0243 - MEMORIES" nicht zu „Project_0007" verkümmert.
    let steps = candidates
        .into_iter()
        .enumerate()
        .map(|(i, (secs, dir, old_name, id))| {
            let number = format!("{}{:04}", PROJECT_PREFIX, i + 1);
            let new_name = match &id.name {
                Some(n) => sanitize_filename_part(&format!("{} - {}", number, n)),
                None => number,
            };
            MergeStep {
                from: dir.to_string_lossy().to_string(),
                to: target_dir.join(&new_name).to_string_lossy().to_string(),
                old_name,
                new_name,
                date: if secs > 0 { Some(secs_to_date(secs)) } else { None },
            }
        })
        .collect();

    skipped.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(MergePlan {
        target,
        steps,
        skipped,
        duplicates: duplicate_project_ids(&roots)
            .into_iter()
            .map(|(number, dirs)| DuplicateId { number, dirs })
            .collect(),
    })
}

/// Frühester bekannter Zeitpunkt einer Datei: das Kleinere aus Erstell- und
/// Änderungszeit. Kopieren setzt die Erstellzeit auf „jetzt", Nachspeichern die
/// Änderungszeit — das Minimum übersteht beides und schätzt nie zu jung.
fn earliest_secs(p: &Path) -> u64 {
    let Ok(m) = std::fs::metadata(p) else { return 0 };
    let to_secs = |t: std::time::SystemTime| {
        t.duration_since(std::time::UNIX_EPOCH).ok().map(|d| d.as_secs())
    };
    match (m.created().ok().and_then(to_secs), m.modified().ok().and_then(to_secs)) {
        (Some(a), Some(b)) => a.min(b),
        (Some(a), None) | (None, Some(a)) => a,
        (None, None) => 0,
    }
}

/// Ältester Zeitpunkt aller FLPs im Ordner (Root + eine Ebene, ohne Backups).
/// Bester Anhaltspunkt dafür, wann an dem Beat angefangen wurde.
fn oldest_flp_secs(dir: &Path) -> Option<u64> {
    let mut oldest: Option<u64> = None;
    let mut consider = |d: &Path| {
        let Ok(rd) = std::fs::read_dir(d) else { return };
        for e in rd.filter_map(|e| e.ok()) {
            let p = e.path();
            if !is_flp(&p) {
                continue;
            }
            let secs = earliest_secs(&p);
            if secs > 0 && oldest.is_none_or(|o| secs < o) {
                oldest = Some(secs);
            }
        }
    };

    consider(dir);
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.filter_map(|e| e.ok()) {
            let p = e.path();
            if p.is_dir() {
                let n = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
                if !n.contains("backup") {
                    consider(&p);
                }
            }
        }
    }
    oldest
}

/// Plan ausführen: DB sichern, verschieben, umbenennen, protokollieren.
#[tauri::command]
pub fn apply_production_merge(steps: Vec<MergeStep>) -> Result<MergeReport, String> {
    apply_steps(steps, "zusammengeführt")
}

/// Der gemeinsame Ausführungsteil für alles, was Ordner bewegt: DB-Sicherung,
/// Protokoll vorher, zweiphasiges Umbenennen, DB-Pfade nachziehen, Protokoll
/// eindampfen, lesbare Liste. Das Parken benutzt denselben Weg — und erbt damit
/// dasselbe Sicherheitsnetz, inklusive „Rückgängig" aus der Läufe-Liste.
fn apply_steps(steps: Vec<MergeStep>, was: &str) -> Result<MergeReport, String> {
    // Erst der DB-Schnappschuss — Status, Priorität und Notizen hängen daran.
    let db_backup = match crate::db::backup_db() {
        Ok(()) => Some(crate::db::backup_target_path().to_string_lossy().to_string()),
        Err(e) => {
            eprintln!("WARNING: DB-Sicherung vor dem Zusammenführen fehlgeschlagen: {}", e);
            None
        }
    };

    // Das Vorhaben liegt auf der Platte, BEVOR der erste Ordner sich bewegt —
    // stürzt die App mittendrin ab, ist die Zuordnung trotzdem nachvollziehbar.
    let log_paths = write_merge_log(&steps);

    // Der Zielordner steckt in den Schritten; die lesbare Liste landet dort.
    let target_dir = steps
        .first()
        .and_then(|s| Path::new(&s.to).parent().map(|p| p.to_path_buf()));

    let (done, mut failed) = merge_steps_on_disk(&steps);

    // Status/Priorität/Notizen auf die neuen Pfade umhängen
    match open_db() {
        Ok(mut conn) => {
            if let Err(e) = repath_studio_rows(&mut conn, &done) {
                failed.push(format!(
                    "Ordner sind verschoben, aber Status/Notizen konnten nicht mitziehen ({}) — \
                     der Stand von vorher liegt in der Sicherung",
                    e
                ));
            }
        }
        Err(e) => failed.push(format!(
            "Datenbank nicht erreichbar ({}) — Ordner sind verschoben, Status/Notizen bleiben am alten Pfad",
            e
        )),
    }

    // Danach auf das eindampfen, was wirklich passiert ist — das ist die
    // Vorlage fürs Rückgängigmachen.
    rewrite_merge_logs(&log_paths, &done, &mut failed);

    // Die lesbare Liste erst jetzt: sie dokumentiert, was passiert ist, nicht
    // was geplant war.
    let summary_path = target_dir
        .as_deref()
        .and_then(|dir| write_merge_summary(dir, &done, was));

    let mut log_paths = log_paths;
    // Rückgängig nur anbieten, wenn tatsächlich etwas zu drehen ist
    if done.is_empty() {
        log_paths.clear();
    }
    let log_path = log_paths.first().cloned();
    let log_copies = log_paths.into_iter().skip(1).collect();

    Ok(MergeReport {
        moved: done.len(),
        failed,
        log_path,
        log_copies,
        summary_path,
        db_backup,
    })
}

// ═══════════════════════════════════════════════════════════════════════════════
// Parken: fertige Beats aus den Produktions-Ordnern nehmen
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Serialize)]
pub struct ParkSkip {
    pub name: String,
    pub reason: String,
}

#[derive(Debug, Serialize)]
pub struct ParkReport {
    pub park_dir: String,
    /// Was tatsächlich umgezogen ist
    pub moved: usize,
    /// Ordner, die die erneute Prüfung nicht bestanden haben
    pub skipped: Vec<ParkSkip>,
    pub failed: Vec<String>,
    pub log_path: Option<String>,
    pub log_copies: Vec<String>,
    pub summary_path: Option<String>,
    pub db_backup: Option<String>,
}

/// Vollständig archivierte Projekte in einen Parkordner verschieben.
///
/// Verschoben wird nur, was **hier drin** nochmal geprüft wurde: der Beat liegt
/// im Archiv, die Zuordnung ist eindeutig, und keine einzige Datei des
/// Projektordners fehlt dort. Die Liste aus der Oberfläche gilt als Vorschlag,
/// nicht als Freibrief — zwischen Abgleich und Klick können Minuten liegen.
///
/// Nichts wird gelöscht: es ist derselbe `fs::rename`-Weg wie beim
/// Zusammenführen, mit demselben Protokoll und demselben „Rückgängig".
#[tauri::command]
pub async fn park_archived_projects(
    project_paths: Vec<String>,
    archive_path: String,
    park_dir: String,
) -> Result<ParkReport, String> {
    tauri::async_runtime::spawn_blocking(move || {
        park_blocking(&project_paths, &archive_path, &park_dir)
    })
    .await
    .map_err(|e| format!("Parken abgestürzt: {}", e))?
}

/// Warum ein Ordner NICHT geparkt wird — oder None, wenn er weg darf.
///
/// Maßgeblich ist `missing_important`, nicht `missing`: FL schreibt bei jedem
/// Öffnen einen Autosave nach `Backup/`, und ein Projekt, das du nach dem
/// Archivieren nochmal aufgemacht hast, hat dort zwangsläufig Dateien, die im
/// Archiv fehlen. Als verlorene Arbeit zählt das nicht — die Arbeitsdatei liegt
/// daneben. Vorher übersprang das Parken genau diese Ordner, obwohl der Dialog
/// sie (richtig) als vollständig gezählt und angekündigt hatte.
fn park_skip_reason(s: &crate::commands::archive_match::ProjectArchiveStatus) -> Option<String> {
    if s.archive_folder.is_none() {
        return Some("nicht im Archiv gefunden".to_string());
    }
    if s.matched_by == Some(crate::commands::archive_match::MatchKind::Ambiguous) {
        return Some("Zuordnung nicht eindeutig".to_string());
    }
    if s.missing_important > 0 {
        return Some(format!(
            "{} Arbeitsdatei(en) fehlen im Archiv",
            s.missing_important
        ));
    }
    None
}

fn park_blocking(
    project_paths: &[String],
    archive_path: &str,
    park_dir: &str,
) -> Result<ParkReport, String> {
    let park = PathBuf::from(park_dir);
    if park_dir.trim().is_empty() {
        return Err("Kein Parkordner angegeben".to_string());
    }
    // Der Parkordner darf weder in einem Projekt noch in einem Produktions-Root
    // liegen — sonst taucht er beim nächsten Scan als ein Projekt mit hunderten
    // FLPs auf. Die Roots stehen nicht als Parameter zur Verfügung, aber jedes
    // Projekt liegt direkt in einem: sein Elternordner IST der Root.
    for p in project_paths {
        let dir = Path::new(p);
        if park.starts_with(dir) {
            return Err(format!("Parkordner liegt im Projekt {}", p));
        }
        if let Some(root) = dir.parent() {
            if park.starts_with(root) {
                return Err(format!(
                    "Parkordner liegt im Produktions-Ordner {} — er muss daneben liegen, \
                     sonst liest der nächste Scan ihn als ein einziges Projekt",
                    root.display()
                ));
            }
        }
    }
    std::fs::create_dir_all(&park)
        .map_err(|e| format!("Parkordner nicht anlegbar: {}", e))?;

    let dirs: Vec<PathBuf> = project_paths.iter().map(PathBuf::from).collect();
    let status = crate::commands::archive_match::check_project_dirs(
        &dirs,
        Path::new(archive_path),
        true,
    )?;

    let mut steps: Vec<MergeStep> = Vec::new();
    let mut skipped: Vec<ParkSkip> = Vec::new();

    for s in status {
        let name = s.project_name.clone();
        let reason = park_skip_reason(&s);
        match reason {
            Some(r) => skipped.push(ParkSkip { name, reason: r }),
            None => {
                let dest = crate::utils::unique_dest(&park, &name);
                let new_name = dest
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| name.clone());
                steps.push(MergeStep {
                    from: s.project_path,
                    to: dest.to_string_lossy().to_string(),
                    old_name: name,
                    new_name,
                    date: None,
                });
            }
        }
    }

    // Verschieben, protokollieren, DB nachziehen — derselbe Weg wie der Merge
    let report = apply_steps(steps, "geparkt")?;

    Ok(ParkReport {
        park_dir: park.to_string_lossy().to_string(),
        moved: report.moved,
        skipped,
        failed: report.failed,
        log_path: report.log_path,
        log_copies: report.log_copies,
        summary_path: report.summary_path,
        db_backup: report.db_backup,
    })
}

/// Ein vergangener Lauf, aus seinem Protokoll gelesen.
#[derive(Debug, Serialize)]
pub struct MergeRun {
    pub log_path: String,
    /// Datum aus dem Dateinamen (`merge_2026-08-30_….json`)
    pub date: String,
    pub steps: usize,
    /// Zielordner, in den damals verschoben wurde
    pub target: String,
    /// Wie viele der damaligen Zielordner heute noch dort liegen
    pub present: usize,
}

/// Alle Protokolle, die noch auffindbar sind — neuestes zuerst.
///
/// Ohne diese Liste verschwindet der Weg zurück in dem Moment, in dem der
/// Dialog zugeht. Bei einem Lauf über hunderte Ordner ist das die gefährlichste
/// Lücke von allen, deshalb überlebt sie hier den Neustart.
#[tauri::command]
pub fn list_merge_runs() -> Result<Vec<MergeRun>, String> {
    let mut by_name: HashMap<String, MergeRun> = HashMap::new();

    for dir in merge_log_dirs() {
        let Ok(rd) = std::fs::read_dir(&dir) else { continue };
        for e in rd.filter_map(|e| e.ok()) {
            let path = e.path();
            let name = e.file_name().to_string_lossy().to_string();
            if !name.starts_with("merge_") || !name.ends_with(".json") {
                continue;
            }
            // Dasselbe Protokoll liegt an mehreren Orten — einmal reicht.
            // Die zuerst gelistete Bibliothek gewinnt, sie ist die dauerhafte.
            if by_name.contains_key(&name) {
                continue;
            }
            let Some(run) = read_merge_run(&path, &name) else { continue };
            by_name.insert(name, run);
        }
    }

    let mut out: Vec<MergeRun> = by_name.into_values().collect();
    // Der Dateiname trägt Datum und Sekunden — absteigend sortiert steht der
    // jüngste Lauf oben.
    out.sort_by(|a, b| b.log_path.cmp(&a.log_path));
    Ok(out)
}

fn read_merge_run(path: &Path, file_name: &str) -> Option<MergeRun> {
    let raw = std::fs::read_to_string(path).ok()?;
    let steps: Vec<MergeStep> = serde_json::from_str(&raw).ok()?;
    if steps.is_empty() {
        return None;
    }
    // "merge_2026-08-30_1756512345.json" → "2026-08-30"
    let date = file_name
        .strip_prefix("merge_")
        .and_then(|s| s.split('_').next())
        .unwrap_or("")
        .to_string();

    let target = Path::new(&steps[0].to)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    // Nur was heute noch dort liegt, lässt sich zurückdrehen
    let present = steps.iter().filter(|s| Path::new(&s.to).is_dir()).count();

    Some(MergeRun {
        log_path: path.to_string_lossy().to_string(),
        date,
        steps: steps.len(),
        target,
        present,
    })
}

/// Protokoll rückwärts abspielen: to → from. Nutzt denselben Weg wie das
/// Zusammenführen, es werden nur Quelle und Ziel getauscht.
#[tauri::command]
pub fn undo_production_merge(log_path: String) -> Result<MergeReport, String> {
    let raw = std::fs::read_to_string(&log_path)
        .map_err(|e| format!("Protokoll nicht lesbar: {}", e))?;
    let steps: Vec<MergeStep> =
        serde_json::from_str(&raw).map_err(|e| format!("Protokoll unlesbar: {}", e))?;

    let back: Vec<MergeStep> = steps
        .into_iter()
        .map(|s| MergeStep {
            from: s.to,
            to: s.from,
            old_name: s.new_name,
            new_name: s.old_name,
            date: s.date,
        })
        .collect();

    apply_production_merge(back)
}

/// Die Pfade der `studio_projects`-Zeilen auf die neuen Ordner umhängen.
///
/// `path` ist PRIMARY KEY, und beim Umnummerieren tauschen Projekte ihre Namen
/// (Project_5 → Project_0005, während dort noch der alte Project_0005 steht).
/// Ein direktes `UPDATE OR REPLACE` löscht dabei die noch nicht umgehängte
/// Zeile — lautlos. Deshalb dieselben zwei Phasen wie auf der Platte, in einer
/// Transaktion: entweder ziehen alle mit, oder keiner.
fn repath_studio_rows(
    conn: &mut rusqlite::Connection,
    done: &[MergeStep],
) -> Result<(), rusqlite::Error> {
    let tx = conn.transaction()?;

    // Phase 1: raus aus dem alten Pfad, rein in einen Zwischennamen. Zeilen
    // halten sonst immer absolute Pfade — der Präfix kann nicht kollidieren.
    for (i, s) in done.iter().enumerate() {
        tx.execute(
            "UPDATE studio_projects SET path = ?1 WHERE path = ?2",
            rusqlite::params![format!("{}{}", MERGE_TEMP_PREFIX, i), s.from],
        )?;
    }

    // Eine Zeile, die schon auf dem Zielpfad sitzt, ist verwaist: der Umzug auf
    // der Platte hätte sonst abgebrochen, weil er nie überschreibt.
    for s in done {
        tx.execute(
            "DELETE FROM studio_projects WHERE path = ?1",
            rusqlite::params![s.to],
        )?;
    }

    // Phase 2: Zwischenname → endgültiger Pfad
    for (i, s) in done.iter().enumerate() {
        tx.execute(
            "UPDATE studio_projects SET path = ?1 WHERE path = ?2",
            rusqlite::params![s.to, format!("{}{}", MERGE_TEMP_PREFIX, i)],
        )?;
    }

    tx.commit()
}

/// Der Dateisystem-Teil (ohne DB und Protokoll, damit testbar).
/// Zwei Phasen, weil die Namen untereinander getauscht werden: Project_5 kann
/// nur zu Project_0005 werden, wenn der bisherige Project_0005 vorher weg ist.
fn merge_steps_on_disk(steps: &[MergeStep]) -> (Vec<MergeStep>, Vec<String>) {
    let mut failed: Vec<String> = Vec::new();
    let mut staged: Vec<(PathBuf, MergeStep)> = Vec::new();
    let mut done: Vec<MergeStep> = Vec::new();

    // Phase 1: raus aus dem alten Namen, rein in einen temporären im Zielordner
    for (i, s) in steps.iter().enumerate() {
        if s.from == s.to {
            continue; // liegt schon richtig
        }
        let from = Path::new(&s.from);
        if !from.is_dir() {
            failed.push(format!("{}: Ordner nicht gefunden", s.old_name));
            continue;
        }
        let Some(parent) = Path::new(&s.to).parent() else {
            failed.push(format!("{}: Zielpfad ohne Elternordner", s.old_name));
            continue;
        };
        if let Err(e) = std::fs::create_dir_all(parent) {
            failed.push(format!("{}: Zielordner nicht anlegbar ({})", s.old_name, e));
            continue;
        }
        let temp = parent.join(format!("{}{}", MERGE_TEMP_PREFIX, i));
        if temp.exists() {
            failed.push(format!("{}: Zwischenname {} ist belegt", s.old_name, temp.display()));
            continue;
        }
        // ponytail: rename bleibt innerhalb eines Laufwerks. Über Laufwerks-
        // grenzen scheitert der Schritt sichtbar, statt 28 GB zu kopieren —
        // dann rekursives copy+verify+delete nachrüsten.
        match std::fs::rename(from, &temp) {
            Ok(()) => staged.push((temp, s.clone())),
            Err(e) => failed.push(format!("{}: nicht verschiebbar ({})", s.old_name, e)),
        }
    }

    // Phase 2: temporärer Name → endgültiger Name
    for (temp, s) in staged {
        let to = PathBuf::from(&s.to);
        if to.exists() {
            failed.push(format!(
                "{}: „{}“ ist belegt — der Ordner liegt jetzt als {}",
                s.old_name,
                s.new_name,
                temp.display()
            ));
            continue;
        }
        if let Err(e) = std::fs::rename(&temp, &to) {
            failed.push(format!(
                "{}: Umbenennen nach „{}“ fehlgeschlagen ({}) — liegt als {}",
                s.old_name,
                s.new_name,
                e,
                temp.display()
            ));
            continue;
        }
        rename_matching_flps(&to, &s.old_name, &s.new_name);
        done.push(s);
    }

    (done, failed)
}

/// Den Trockenlauf-Bericht als Datei ablegen — in der OneDrive-Bibliothek,
/// nicht in %LOCALAPPDATA%, damit er die Maschine überlebt und mitsynchronisiert.
///
/// Das Frontend gibt bewusst keinen Pfad vor, sondern nur den Inhalt: so kann
/// über diesen Weg nichts Beliebiges auf der Platte überschrieben werden.
/// Zurück kommt der Pfad, damit die App ihn anzeigen kann.
#[tauri::command]
pub fn export_merge_preview(content: String) -> Result<String, String> {
    let dir = crate::db::backup_target_path()
        .parent()
        .map(|d| d.to_path_buf())
        .ok_or("Bibliotheks-Ordner nicht bestimmbar")?;
    if !dir.is_dir() {
        return Err(format!("Bibliotheks-Ordner nicht gefunden: {}", dir.display()));
    }
    let secs = crate::utils::current_secs();
    let path = dir.join(format!("merge-vorschau_{}_{}.csv", secs_to_date(secs), secs));
    // BOM, damit Excel die Umlaute richtig liest
    let mut bytes = vec![0xEF, 0xBB, 0xBF];
    bytes.extend_from_slice(content.as_bytes());
    std::fs::write(&path, bytes).map_err(|e| format!("Bericht nicht schreibbar: {}", e))?;
    Ok(path.to_string_lossy().to_string())
}

/// Wohin das Protokoll geht. Bewusst mehrere Orte: dieses eine Dokument ist die
/// einzige Aufzeichnung, welcher Ordner wohin wurde.
///
///   1. Die OneDrive-Bibliothek — wird mitsynchronisiert und überlebt damit
///      auch einen neu aufgesetzten Rechner. Vorher lag das Protokoll nur unter
///      %LOCALAPPDATA%, also am unsichersten Platz im ganzen Vorgang.
///   2. %LOCALAPPDATA%\BeatOS — immer schreibbar, auch wenn OneDrive klemmt.
fn merge_log_dirs() -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();
    for dir in [
        crate::db::backup_target_path().parent().map(|d| d.to_path_buf()),
        crate::db::get_db_path().parent().map(|d| d.to_path_buf()),
    ]
    .into_iter()
    .flatten()
    {
        if dir.is_dir() && !out.contains(&dir) {
            out.push(dir);
        }
    }
    out
}

/// Protokoll an alle erreichbaren Orte schreiben. Der erste Treffer ist der,
/// den „Rückgängig" später benutzt.
fn write_merge_log(steps: &[MergeStep]) -> Vec<String> {
    write_merge_log_to(&merge_log_dirs(), steps)
}

/// Der schreibende Teil, mit den Zielordnern als Parameter — so ist er ohne
/// echte Bibliothek und ohne %LOCALAPPDATA% prüfbar.
fn write_merge_log_to(dirs: &[PathBuf], steps: &[MergeStep]) -> Vec<String> {
    if steps.is_empty() {
        return Vec::new();
    }
    let Ok(json) = serde_json::to_string_pretty(steps) else {
        eprintln!("WARNING: Merge-Protokoll nicht serialisierbar");
        return Vec::new();
    };
    let secs = crate::utils::current_secs();
    let name = format!("merge_{}_{}.json", secs_to_date(secs), secs);

    let mut written = Vec::new();
    for dir in dirs {
        let path = dir.join(&name);
        match std::fs::write(&path, &json) {
            Ok(()) => written.push(path.to_string_lossy().to_string()),
            Err(e) => eprintln!("WARNING: Protokoll nicht schreibbar ({}): {}", path.display(), e),
        }
    }
    written
}

/// Nach dem Lauf: dieselben Dateien auf das eindampfen, was wirklich passiert
/// ist. Fehlschläge werden gemeldet, nicht verschluckt — ein veraltetes
/// Protokoll wäre beim Rückgängigmachen gefährlicher als gar keins.
fn rewrite_merge_logs(paths: &[String], done: &[MergeStep], failed: &mut Vec<String>) {
    let Ok(json) = serde_json::to_string_pretty(done) else { return };
    for path in paths {
        if let Err(e) = std::fs::write(path, &json) {
            failed.push(format!(
                "Protokoll nicht aktualisierbar ({}) — {} enthält noch den Plan",
                e, path
            ));
        }
    }
}

/// Eine lesbare Liste in den Zielordner legen, direkt neben die Ordner, die sie
/// beschreibt. Wer in einem Jahr wissen will, woher „Project_0007" kommt, findet
/// die Antwort dort — ohne App, ohne Datenbank, ohne Protokolldatei zu suchen.
///
/// Der Unterstrich vorn sortiert die Datei im Explorer nach oben.
fn write_merge_summary(target_dir: &Path, done: &[MergeStep], was: &str) -> Option<String> {
    if done.is_empty() || !target_dir.is_dir() {
        return None;
    }
    let secs = crate::utils::current_secs();
    let date = secs_to_date(secs);
    let mut text = format!(
        "BeatOS — Produktions-Ordner {} am {}\r\n\
         {} Projekte.\r\n\
         Diese Datei ist nur eine Aufzeichnung; sie zu löschen ändert nichts.\r\n\
         \r\n\
         BISHER{}NEU\r\n\
         {}\r\n",
        was,
        date,
        done.len(),
        " ".repeat(44usize.saturating_sub(6)),
        "-".repeat(90)
    );
    for s in done {
        text.push_str(&format!(
            "{:<44}{}\r\n",
            truncate(&s.old_name, 42),
            s.new_name
        ));
    }

    // Sekunden mit im Namen, wie beim Protokoll: sonst überschreibt der zweite
    // Lauf am selben Tag (erst zusammenführen, dann parken) die erste Liste.
    let path = target_dir.join(format!("_beatos-umbenannt_{}_{}.txt", date, secs));
    match std::fs::write(&path, text) {
        Ok(()) => Some(path.to_string_lossy().to_string()),
        Err(e) => {
            eprintln!("WARNING: Liste im Zielordner nicht schreibbar: {}", e);
            None
        }
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    s.chars().take(max.saturating_sub(1)).collect::<String>() + "…"
}

// ═══════════════════════════════════════════════════════════════════════════════
// Asset inbox (central 04_UPLOAD export folder → assign to projects)
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Serialize)]
pub struct AssetFile {
    pub path: String,
    pub name: String,
    pub kind: String,       // "image" | "video"
    pub guessed_role: String, // "cover" | "thumbnail" | "video" | "image"
    pub size: u64,
    pub modified_date: Option<String>,
    pub modified_secs: u64,
}

/// List images/videos in the asset inbox (root + one level of subfolders).
#[tauri::command]
pub async fn scan_asset_inbox(path: String) -> Result<Vec<AssetFile>, String> {
    tauri::async_runtime::spawn_blocking(move || scan_asset_inbox_blocking(&path))
        .await
        .map_err(|e| format!("Asset scan panicked: {}", e))?
}

fn scan_asset_inbox_blocking(path: &str) -> Result<Vec<AssetFile>, String> {
    let root = Path::new(path);
    if path.trim().is_empty() || !root.is_dir() {
        return Err(format!(
            "Asset-Ordner nicht gefunden: '{}' — bitte Asset Path in den Settings setzen",
            path
        ));
    }

    let mut out: Vec<AssetFile> = Vec::new();
    let mut collect = |dir: &Path| {
        let Ok(rd) = std::fs::read_dir(dir) else { return };
        for e in rd.filter_map(|e| e.ok()) {
            let p = e.path();
            if !p.is_file() {
                continue;
            }
            let ext = p.extension().and_then(|x| x.to_str()).unwrap_or("").to_lowercase();
            let kind = if is_image_extension(&ext) {
                "image"
            } else if is_video_extension(&ext) {
                "video"
            } else {
                continue;
            };
            let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
            let name_lower = name.to_lowercase();
            let guessed_role = if kind == "video" {
                "video"
            } else if name_lower.contains("thumb") {
                "thumbnail"
            } else if name_lower.contains("cover") {
                "cover"
            } else {
                "image"
            };
            let size = std::fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
            let secs = file_modified_secs(&p).unwrap_or(0);
            out.push(AssetFile {
                path: p.to_string_lossy().to_string(),
                name,
                kind: kind.to_string(),
                guessed_role: guessed_role.to_string(),
                size,
                modified_date: if secs > 0 { Some(secs_to_date(secs)) } else { None },
                modified_secs: secs,
            });
        }
    };

    collect(root);
    if let Ok(rd) = std::fs::read_dir(root) {
        for e in rd.filter_map(|e| e.ok()) {
            let p = e.path();
            if p.is_dir() {
                collect(&p);
            }
        }
    }

    out.sort_by(|a, b| b.modified_secs.cmp(&a.modified_secs));
    Ok(out)
}

/// Move an asset from the inbox into a project folder root (where the
/// Create-tab parser will pick it up and archive it with the beat).
#[tauri::command]
pub fn assign_asset_to_project(
    asset_path: String,
    asset_root: String,
    project_dir: String,
    slot: Option<String>,
) -> Result<String, String> {
    let src = Path::new(&asset_path);
    let root = Path::new(&asset_root);
    let target_dir = Path::new(&project_dir);

    if !src.is_file() {
        return Err(format!("Asset nicht gefunden: {}", asset_path));
    }
    // Aus der Inbox wird VERSCHOBEN — sie soll ja leer werden. Alles andere
    // (per Drag & Drop aus einem beliebigen Ordner gezogen) wird KOPIERT: dann
    // kann weder ein Fehlgriff noch ein falscher Pfad eine Datei verlieren.
    let aus_der_inbox = match (src.canonicalize(), root.canonicalize()) {
        (Ok(cs), Ok(cr)) => cs.starts_with(&cr),
        _ => false,
    };
    if !target_dir.is_dir() {
        return Err(format!("Projektordner nicht gefunden: {}", project_dir));
    }

    let file_name = src
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Ungültiger Dateiname")?;
    let file_name = ensure_slot_marker(file_name, slot.as_deref());
    let dest = crate::utils::unique_dest(target_dir, &file_name);

    if aus_der_inbox {
        // rename fails across drives → fall back to verified copy + delete
        if std::fs::rename(src, &dest).is_err() {
            copy_and_verify_move(src, &dest)?;
        }
    } else {
        crate::utils::copy_and_verify(src, &dest)?;
    }

    Ok(dest.to_string_lossy().to_string())
}

/// Cover und Thumbnail unterscheiden sich im Zielordner nur am Dateinamen:
/// `find_asset_slots` (create.rs) und `scan_project_dir` (hier) lesen jedes Bild
/// mit "thumb" als Thumbnail und jedes andere als Cover. Ein Export ohne Marker
/// landet damit im Cover-Slot — auch wenn er als Thumbnail gewählt wurde. Also
/// den Marker beim Verschieben ergänzen.
///
/// Cover braucht keinen: es ist der Standardfall derselben Leseregel.
fn ensure_slot_marker(file_name: &str, slot: Option<&str>) -> String {
    if slot != Some("thumbnail") {
        return file_name.to_string();
    }
    let path = Path::new(file_name);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or(file_name);
    if stem.to_lowercase().contains("thumb") {
        return file_name.to_string();
    }
    match path.extension().and_then(|e| e.to_str()) {
        Some(ext) => format!("{}_thumbnail.{}", stem, ext),
        None => format!("{}_thumbnail", stem),
    }
}

fn copy_and_verify_move(src: &Path, dest: &Path) -> Result<(), String> {
    crate::utils::copy_and_verify(src, dest)?;
    std::fs::remove_file(src).map_err(|e| format!("Quelle konnte nicht entfernt werden: {}", e))
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::{
        derive_stage, duplicate_project_ids, ensure_slot_marker, is_manual_status, is_orphan_row,
        parse_project_id, repath_studio_rows, resolve_status, scan_project_dir, MergeStep,
        STUDIO_STATUSES,
    };

    /// Jede Schreibweise, die im echten Bestand vorkommt, muss ihre Nummer
    /// hergeben — sonst fällt der Ordner still aus dem Zusammenführen heraus.
    #[test]
    fn parser_kennt_alle_schreibweisen_im_bestand() {
        let id = |s: &str| parse_project_id(s).map(|i| (i.number, i.name));

        // Das neue System
        assert_eq!(id("Project_0243"), Some((243, None)));
        assert_eq!(id("project_243"), Some((243, None)), "Groß-/Kleinschreibung egal");
        // Schema A: der Name muss mitkommen
        assert_eq!(id("Project_0243 - MEMORIES"), Some((243, Some("MEMORIES".into()))));
        assert_eq!(id("Project_25 - lil peep ninteen"), Some((25, Some("lil peep ninteen".into()))));
        // Reine Nummern und das Rautenschema
        assert_eq!(id("0857"), Some((857, None)));
        assert_eq!(id("0857 - Kopie"), Some((857, Some("Kopie".into()))));
        assert_eq!(id("#Project_75"), Some((75, None)));
        // Das alte System
        assert_eq!(
            id("[701] One Sided Love - 125 Cm"),
            Some((701, Some("One Sided Love - 125 Cm".into())))
        );
        assert_eq!(id("[64] Past Master"), Some((64, Some("Past Master".into()))));

        // Ohne Nummer im Namen: bleibt unangetastet
        assert_eq!(id("NO MORE RUNNING"), None);
        assert_eq!(id("#Project_test"), None);
        assert_eq!(id("Samples"), None);
        // Der gemeinsame Sample-Ordner der alten Eimer darf keine ID bekommen
        assert_eq!(id("[000]Samples"), None);
        // Unsinnszahlen entführen die Nummernvergabe nicht
        assert_eq!(id("2222222"), None);
    }

    /// Das Protokoll ist die einzige Aufzeichnung, welcher Ordner wohin wurde.
    /// Es muss an jedem erreichbaren Ort liegen — und nach dem Lauf überall
    /// auf das eingedampft sein, was wirklich passiert ist.
    #[test]
    fn protokoll_liegt_an_mehreren_orten_und_wird_ueberall_nachgezogen() {
        let root = std::env::temp_dir().join(format!("beatos_log_{}", std::process::id()));
        let bibliothek = root.join("bibliothek");
        let lokal = root.join("lokal");
        std::fs::create_dir_all(&bibliothek).unwrap();
        std::fs::create_dir_all(&lokal).unwrap();

        let schritt = |name: &str| MergeStep {
            from: format!("C:\\ALT\\{}", name),
            to: format!("C:\\PROD\\{}", name),
            old_name: name.to_string(),
            new_name: name.to_string(),
            date: None,
        };
        let geplant = vec![schritt("A"), schritt("B"), schritt("C")];

        let dirs = vec![bibliothek.clone(), lokal.clone()];
        let paths = super::write_merge_log_to(&dirs, &geplant);
        assert_eq!(paths.len(), 2, "das Protokoll muss an BEIDEN Orten liegen");

        // Vor dem Lauf steht der ganze Plan drin
        for p in &paths {
            let inhalt = std::fs::read_to_string(p).unwrap();
            assert!(inhalt.contains("\"old_name\": \"C\""), "Plan unvollständig in {}", p);
        }

        // Nach dem Lauf: nur A und B kamen durch
        let mut failed = Vec::new();
        let erledigt = vec![schritt("A"), schritt("B")];
        super::rewrite_merge_logs(&paths, &erledigt, &mut failed);
        assert!(failed.is_empty(), "Nachziehen sollte klappen: {:?}", failed);

        for p in &paths {
            let inhalt = std::fs::read_to_string(p).unwrap();
            assert!(inhalt.contains("\"old_name\": \"A\""));
            assert!(
                !inhalt.contains("\"old_name\": \"C\""),
                "C ist nie passiert und darf nicht mehr im Protokoll stehen ({})",
                p
            );
        }

        // Ein unerreichbarer Ort darf den anderen nicht mitreißen, muss aber
        // gemeldet werden — ein stilles Scheitern wäre hier das Schlimmste.
        let mut failed2 = Vec::new();
        let mut mit_kaputtem = paths.clone();
        mit_kaputtem.push(root.join("gibt-es-nicht").join("x.json").to_string_lossy().to_string());
        super::rewrite_merge_logs(&mit_kaputtem, &erledigt, &mut failed2);
        assert_eq!(failed2.len(), 1, "der unerreichbare Ort muss gemeldet werden");

        // Ohne Schritte kein Protokoll
        assert!(super::write_merge_log_to(&dirs, &[]).is_empty());

        std::fs::remove_dir_all(&root).ok();
    }

    /// Handprobe: den Plan über den echten Bestand rechnen, ohne etwas zu
    /// bewegen. `plan_production_merge` liest nur.
    ///
    /// ```text
    /// BEATOS_ROOTS="A;B;C" BEATOS_TARGET="A" \
    ///   cargo test --lib plan_handprobe -- --ignored --nocapture
    /// ```
    #[test]
    #[ignore]
    fn plan_handprobe_am_echten_bestand() {
        let (Ok(roots), Ok(target)) = (
            std::env::var("BEATOS_ROOTS"),
            std::env::var("BEATOS_TARGET"),
        ) else {
            eprintln!("BEATOS_ROOTS und BEATOS_TARGET setzen — übersprungen");
            return;
        };
        let paths: Vec<String> = roots.split(';').map(|s| s.trim().to_string()).collect();

        // Wenn ein Archivpfad gesetzt ist: erst abgleichen, dann die
        // nachweislich vollständig archivierten aus dem Lauf nehmen. Genau das
        // macht der Dialog auch — hier sieht man das Ergebnis in Zahlen.
        let exclude: Vec<String> = match std::env::var("BEATOS_ARCHIVE") {
            Ok(archive) => {
                let res = crate::commands::archive_match::match_projects_for_test(
                    &paths,
                    std::path::Path::new(&archive),
                    true,
                );
                res.into_iter()
                    .filter(|r| {
                        r.archive_folder.is_some()
                            && r.missing_important == 0
                            && r.matched_by
                                != Some(crate::commands::archive_match::MatchKind::Ambiguous)
                    })
                    .map(|r| r.project_path)
                    .collect()
            }
            Err(_) => Vec::new(),
        };
        println!("  ausgenommen (vollständig archiviert): {}", exclude.len());

        let plan = super::plan_production_merge(paths, target.clone(), exclude).unwrap();

        let verschieben = plan.steps.iter().filter(|s| s.from != s.to).count();
        println!("\n── Plan-Handprobe ───────────────────────────");
        println!("  Ziel:                     {}", plan.target);
        println!("  Projekte im Lauf:         {}", plan.steps.len());
        println!("    davon verschoben:       {}", verschieben);
        println!("    davon nur umbenannt:    {}", plan.steps.len() - verschieben);
        println!("  bleiben liegen:           {}", plan.skipped.len());
        println!("  doppelte Nummern:         {}", plan.duplicates.len());

        let mut gruende: std::collections::HashMap<&str, usize> = std::collections::HashMap::new();
        for s in &plan.skipped {
            *gruende.entry(s.reason.as_str()).or_default() += 1;
        }
        for (grund, n) in &gruende {
            println!("    „{}“: {}", grund, n);
        }

        println!("\n  Erste zehn Schritte (ältester zuerst):");
        for s in plan.steps.iter().take(10) {
            println!("    {:<44} → {}", super::truncate(&s.old_name, 42), s.new_name);
        }
        println!("\n  Letzte drei:");
        for s in plan.steps.iter().rev().take(3) {
            println!("    {:<44} → {}", super::truncate(&s.old_name, 42), s.new_name);
        }

        // Kein Zielname darf doppelt vorkommen — sonst überschreibt der Lauf
        // sich selbst (er bricht zwar ab, aber das wäre ein halbes Ergebnis).
        let mut namen: Vec<&str> = plan.steps.iter().map(|s| s.new_name.as_str()).collect();
        namen.sort();
        let vorher = namen.len();
        namen.dedup();
        println!("\n  Zielnamen eindeutig:      {}", if namen.len() == vorher { "ja" } else { "NEIN" });
        assert_eq!(namen.len(), vorher, "doppelte Zielnamen im Plan");
        println!("─────────────────────────────────────────────\n");
    }

    /// Geparkt wird nur, was der Befehl SELBST nachgeprüft hat. Die Liste aus
    /// der Oberfläche ist ein Vorschlag — zwischen Abgleich und Klick können
    /// Minuten liegen, und in der Zeit kann sich ein Ordner geändert haben.
    #[test]
    fn parken_prueft_selbst_nach_und_verschiebt_nur_das_geprueffte() {
        let tmp = std::env::temp_dir().join(format!("beatos_park_{}", std::process::id()));
        let prod = tmp.join("PROD");
        let archiv = tmp.join("ARCHIV/2026/05_MAY");
        let park = tmp.join("_ARCHIVIERT");

        // Vollständig archiviert: darf geparkt werden
        let fertig = prod.join("Project_1");
        std::fs::create_dir_all(&fertig).unwrap();
        std::fs::write(fertig.join("GOODBYES.mp3"), b"audio").unwrap();
        std::fs::write(fertig.join("Project_1.flp"), b"projekt").unwrap();
        let a1 = archiv.join("0897 - GOODBYES [F#m 130]/01_AUDIO");
        std::fs::create_dir_all(&a1).unwrap();
        std::fs::write(a1.join("GOODBYES.mp3"), b"audio").unwrap();
        std::fs::write(a1.join("Project_1.flp"), b"projekt").unwrap();

        // Archiviert, aber die Arbeits-FLP fehlt dort: darf NICHT geparkt werden
        let unfertig = prod.join("Project_2");
        std::fs::create_dir_all(&unfertig).unwrap();
        std::fs::write(unfertig.join("HOLLOW.mp3"), b"audio2").unwrap();
        std::fs::write(unfertig.join("Project_2.flp"), b"NUR HIER").unwrap();
        let a2 = archiv.join("0895 - HOLLOW [Fm 159]/01_AUDIO");
        std::fs::create_dir_all(&a2).unwrap();
        std::fs::write(a2.join("HOLLOW.mp3"), b"audio2").unwrap();

        let report = super::park_blocking(
            &[
                fertig.to_string_lossy().to_string(),
                unfertig.to_string_lossy().to_string(),
            ],
            tmp.join("ARCHIV").to_string_lossy().as_ref(),
            park.to_string_lossy().as_ref(),
        )
        .unwrap();

        assert_eq!(report.moved, 1, "nur der vollständige zieht um");
        assert_eq!(report.skipped.len(), 1);
        assert_eq!(report.skipped[0].name, "Project_2");
        assert!(report.skipped[0].reason.contains("fehlen im Archiv"), "{:?}", report.skipped[0]);

        // Der geprüfte liegt im Parkordner, der andere unangetastet in PROD
        assert!(park.join("Project_1").is_dir(), "Project_1 sollte geparkt sein");
        assert!(!fertig.exists(), "Project_1 darf nicht mehr in PROD liegen");
        assert!(unfertig.join("Project_2.flp").is_file(), "Project_2 bleibt vollständig liegen");

        // Nichts gelöscht: die Datei ist mitgezogen, nicht verschwunden
        assert_eq!(
            std::fs::read(park.join("Project_1/Project_1.flp")).unwrap(),
            b"projekt"
        );

        std::fs::remove_dir_all(&tmp).ok();
    }

    /// Ein Parkordner innerhalb eines Projekts wäre ein Rekursionsunfall.
    #[test]
    fn parkordner_darf_nicht_im_projekt_liegen() {
        let tmp = std::env::temp_dir().join(format!("beatos_parkbad_{}", std::process::id()));
        let proj = tmp.join("PROD/Project_1");
        std::fs::create_dir_all(&proj).unwrap();

        let err = super::park_blocking(
            &[proj.to_string_lossy().to_string()],
            tmp.join("ARCHIV").to_string_lossy().as_ref(),
            proj.join("_ARCHIVIERT").to_string_lossy().as_ref(),
        )
        .unwrap_err();
        assert!(err.contains("liegt im Projekt"), "{}", err);

        // Eine Ebene höher ist genauso falsch: der Elternordner eines Projekts
        // IST der Produktions-Root, und ein Parkordner darin wird beim nächsten
        // Scan zu einem Projekt mit allem Geparkten darin. Passiert mit einem
        // Pfad, der auf „\" endet — dann schneidet der Dialog den falschen
        // Abschnitt ab.
        let err = super::park_blocking(
            &[proj.to_string_lossy().to_string()],
            tmp.join("ARCHIV").to_string_lossy().as_ref(),
            tmp.join("PROD/_ARCHIVIERT").to_string_lossy().as_ref(),
        )
        .unwrap_err();
        assert!(err.contains("liegt im Produktions-Ordner"), "{}", err);

        std::fs::remove_dir_all(&tmp).ok();
    }

    /// Vollständig archivierte Ordner sollen keine Nummer verbrauchen. Der
    /// Ausschluss muss deshalb VOR der Vergabe greifen — sonst bliebe eine
    /// Lücke, und genau die wollte man vermeiden.
    #[test]
    fn ausgeschlossene_ordner_verbrauchen_keine_nummer() {
        let tmp = std::env::temp_dir().join(format!("beatos_excl_{}", std::process::id()));
        let target = tmp.join("PROD");
        std::fs::create_dir_all(&target).unwrap();

        make_project(&target.join("Project_1"), "a.flp", 400); // ältester
        make_project(&target.join("Project_2"), "b.flp", 300); // wird ausgenommen
        make_project(&target.join("Project_3"), "c.flp", 200);
        make_project(&target.join("Project_4"), "d.flp", 100); // jüngster

        let plan = super::plan_production_merge(
            vec![target.to_string_lossy().to_string()],
            target.to_string_lossy().to_string(),
            vec![target.join("Project_2").to_string_lossy().to_string()],
        )
        .unwrap();

        let namen: Vec<(&str, &str)> = plan
            .steps
            .iter()
            .map(|s| (s.old_name.as_str(), s.new_name.as_str()))
            .collect();
        assert_eq!(
            namen,
            vec![
                ("Project_1", "Project_0001"),
                ("Project_3", "Project_0002"),
                ("Project_4", "Project_0003"),
            ],
            "lückenlos durchnummeriert, der ausgenommene zählt nicht mit"
        );

        let raus = plan.skipped.iter().find(|s| s.name == "Project_2").unwrap();
        assert_eq!(raus.reason, "vollständig archiviert");

        // Schreibweise des Pfads darf keine Rolle spielen — sonst greift der
        // Ausschluss auf Windows still nicht.
        let plan2 = super::plan_production_merge(
            vec![target.to_string_lossy().to_string()],
            target.to_string_lossy().to_string(),
            vec![target.join("PROJECT_2").to_string_lossy().to_string().replace('\\', "/")],
        )
        .unwrap();
        assert_eq!(plan2.steps.len(), 3, "Groß/Klein und Schrägstriche egal");

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    /// Ein Protokoll wird zum Eintrag in der Läufe-Liste. Entscheidend ist
    /// `present`: nur was heute noch am Zielort liegt, lässt sich zurückdrehen.
    /// Ein bereits rückgängig gemachter Lauf muss sich selbst als leer melden.
    #[test]
    fn vergangener_lauf_meldet_wie_viel_davon_noch_steht() {
        let root = std::env::temp_dir().join(format!("beatos_runs_{}", std::process::id()));
        let ziel = root.join("PROD");
        std::fs::create_dir_all(&ziel).unwrap();
        // Zwei von drei Zielordnern liegen noch da
        std::fs::create_dir_all(ziel.join("Project_0001")).unwrap();
        std::fs::create_dir_all(ziel.join("Project_0002")).unwrap();

        let schritt = |n: &str| MergeStep {
            from: root.join("ALT").join(n).to_string_lossy().to_string(),
            to: ziel.join(n).to_string_lossy().to_string(),
            old_name: n.to_string(),
            new_name: n.to_string(),
            date: None,
        };
        let steps = vec![schritt("Project_0001"), schritt("Project_0002"), schritt("Project_0003")];

        let log = root.join("merge_2026-08-30_1756512345.json");
        std::fs::write(&log, serde_json::to_string_pretty(&steps).unwrap()).unwrap();

        let run = super::read_merge_run(&log, "merge_2026-08-30_1756512345.json").unwrap();
        assert_eq!(run.date, "2026-08-30");
        assert_eq!(run.steps, 3);
        assert_eq!(run.present, 2, "nur zwei Zielordner existieren noch");
        assert_eq!(run.target, ziel.to_string_lossy().to_string());

        // Nach einem Rückgängig ist nichts mehr am Zielort — der Eintrag
        // bleibt sichtbar, meldet aber ehrlich 0.
        std::fs::remove_dir_all(ziel.join("Project_0001")).unwrap();
        std::fs::remove_dir_all(ziel.join("Project_0002")).unwrap();
        let run = super::read_merge_run(&log, "merge_2026-08-30_1756512345.json").unwrap();
        assert_eq!(run.present, 0);

        // Kaputte oder leere Protokolle tauchen gar nicht erst auf
        let leer = root.join("merge_2026-01-01_1.json");
        std::fs::write(&leer, "[]").unwrap();
        assert!(super::read_merge_run(&leer, "merge_2026-01-01_1.json").is_none());
        let kaputt = root.join("merge_2026-01-02_2.json");
        std::fs::write(&kaputt, "kein json").unwrap();
        assert!(super::read_merge_run(&kaputt, "merge_2026-01-02_2.json").is_none());

        std::fs::remove_dir_all(&root).ok();
    }

    /// Die Liste im Zielordner ist die Aufzeichnung, die ohne App, ohne
    /// Datenbank und ohne Protokolldatei lesbar bleibt.
    #[test]
    fn lesbare_liste_landet_im_zielordner() {
        let dir = std::env::temp_dir().join(format!("beatos_summary_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();

        let done = vec![
            MergeStep {
                from: "C:\\ALT\\[701] One Sided Love - 125 Cm".into(),
                to: "C:\\PROD\\Project_0001 - One Sided Love - 125 Cm".into(),
                old_name: "[701] One Sided Love - 125 Cm".into(),
                new_name: "Project_0001 - One Sided Love - 125 Cm".into(),
                date: Some("2024-08-01".into()),
            },
            MergeStep {
                from: "C:\\PROD\\Project_242".into(),
                to: "C:\\PROD\\Project_0002".into(),
                old_name: "Project_242".into(),
                new_name: "Project_0002".into(),
                date: None,
            },
        ];

        let path = super::write_merge_summary(&dir, &done, "zusammengeführt").expect("Liste muss geschrieben werden");
        let text = std::fs::read_to_string(&path).unwrap();

        // Beide Zuordnungen müssen drinstehen — das ist der ganze Zweck
        assert!(text.contains("[701] One Sided Love - 125 Cm"), "alter Name fehlt:\n{}", text);
        assert!(text.contains("Project_0001 - One Sided Love - 125 Cm"), "neuer Name fehlt");
        assert!(text.contains("Project_242"));
        assert!(text.contains("Project_0002"));
        // Der Unterstrich sortiert die Datei im Explorer nach oben
        assert!(
            std::path::Path::new(&path).file_name().unwrap().to_string_lossy().starts_with("_beatos-umbenannt_"),
            "unerwarteter Dateiname: {}",
            path
        );

        // Ohne Schritte gibt es nichts zu dokumentieren
        assert!(super::write_merge_summary(&dir, &[], "zusammengeführt").is_none());

        std::fs::remove_dir_all(&dir).ok();
    }

    /// Sehr lange Ordnernamen dürfen die Spalten nicht sprengen, aber auch
    /// nicht unkenntlich werden.
    #[test]
    fn lange_namen_werden_gekuerzt_nicht_verschluckt() {
        assert_eq!(super::truncate("kurz", 10), "kurz");
        let lang = "a".repeat(60);
        let gekuerzt = super::truncate(&lang, 10);
        assert_eq!(gekuerzt.chars().count(), 10);
        assert!(gekuerzt.ends_with('…'));
        // Umlaute zählen als ein Zeichen, nicht als zwei Bytes
        assert_eq!(super::truncate("äöüäöüäöüäöü", 5).chars().count(), 5);
    }

    /// Zwei Welten, dieselbe Nummer, verschiedene Beats — das muss auffallen,
    /// bevor irgendetwas verschoben wird.
    #[test]
    fn doppelt_vergebene_nummern_werden_gefunden() {
        let root = std::env::temp_dir().join(format!("beatos_dup_{}", std::process::id()));
        let alt = root.join("alt");
        let neu = root.join("neu");
        for d in [
            alt.join("[102] Irgendwas - 140 Am"),
            alt.join("Project_25"),
            neu.join("Project_0102 - MEMORIES"),
            neu.join("Project_0243"),
            neu.join("NO MORE RUNNING"),
        ] {
            std::fs::create_dir_all(&d).unwrap();
        }

        let paths = vec![
            alt.to_string_lossy().to_string(),
            neu.to_string_lossy().to_string(),
        ];
        let dups = duplicate_project_ids(&paths);

        // 102 gibt es zweimal, 25 und 243 je einmal, NO MORE RUNNING gar nicht
        assert_eq!(dups.len(), 1, "genau eine doppelte Nummer erwartet: {:?}", dups);
        assert_eq!(dups[0].0, 102);
        assert_eq!(dups[0].1.len(), 2);

        std::fs::remove_dir_all(&root).ok();
    }

    /// Ein Bild ohne "thumb" im Namen muss den Marker bekommen, sonst liest der
    /// Zielordner es als Cover zurück und der Thumbnail-Slot bleibt leer.
    #[test]
    fn thumbnail_bekommt_seinen_marker() {
        assert_eq!(ensure_slot_marker("MEMORIES.png", Some("thumbnail")), "MEMORIES_thumbnail.png");
        // Marker schon da (in jeder Schreibweise) → Name bleibt unangetastet
        assert_eq!(ensure_slot_marker("art_thumb.jpg", Some("thumbnail")), "art_thumb.jpg");
        assert_eq!(ensure_slot_marker("Art_Thumbnail.jpg", Some("thumbnail")), "Art_Thumbnail.jpg");
        // Cover und Video sind der Standardfall der Leseregel — nichts anfassen
        assert_eq!(ensure_slot_marker("MEMORIES.png", Some("cover")), "MEMORIES.png");
        assert_eq!(ensure_slot_marker("clip.mp4", Some("video")), "clip.mp4");
        assert_eq!(ensure_slot_marker("MEMORIES.png", None), "MEMORIES.png");
        // Datei ohne Endung
        assert_eq!(ensure_slot_marker("bild", Some("thumbnail")), "bild_thumbnail");
    }

    /// Eine nicht erreichbare Platte darf keine Notizen löschen.
    #[test]
    fn verwaist_ist_nur_was_unter_einem_lesbaren_root_fehlt() {
        let root = std::env::temp_dir().join(format!("beatos_orphan_{}", std::process::id()));
        let lebt = root.join("Project_0001");
        std::fs::create_dir_all(&lebt).unwrap();

        // Ordner weg, Root lesbar → Zeile darf weg
        assert!(is_orphan_row(&root.join("Project_0002")));
        // Ordner da (auch ohne FLP) → Zeile bleibt
        assert!(!is_orphan_row(&lebt));
        // Root nicht erreichbar (Platte ab, Pfad raus aus den Einstellungen)
        assert!(!is_orphan_row(&root.join("weg").join("Project_0003")));

        std::fs::remove_dir_all(&root).ok();
    }

    /// Die Stufe kommt aus den Dateien: MP3+WAV = exportiert, dazu Cover,
    /// Thumbnail und Video = bereit. Alles andere bleibt Idee.
    #[test]
    fn stufe_kommt_aus_den_dateien() {
        //        mp3    wav    cover  thumb  video   erwartet
        let faelle = [
            (false, false, false, false, false, "idea"),
            (true,  false, true,  true,  true,  "idea"),     // nur MP3 reicht nicht
            (false, true,  true,  true,  true,  "idea"),     // nur WAV auch nicht
            (true,  true,  false, false, false, "exported"),
            (true,  true,  true,  true,  false, "exported"), // Video fehlt
            (true,  true,  true,  false, true,  "exported"), // Thumbnail fehlt
            (true,  true,  false, true,  true,  "exported"), // Cover fehlt
            (true,  true,  true,  true,  true,  "ready"),
        ];
        for (mp3, wav, cover, thumb, video, erwartet) in faelle {
            assert_eq!(
                derive_stage(mp3, wav, cover, thumb, video),
                erwartet,
                "mp3={mp3} wav={wav} cover={cover} thumb={thumb} video={video}"
            );
        }
    }

    /// Von Hand gesetzt schlägt die Automatik — sonst überschreibt der
    /// Fokus-Scan „Überarbeiten" und „Kann weg" beim nächsten Fensterwechsel.
    #[test]
    fn handvergabe_ueberlebt_den_scan() {
        assert_eq!(resolve_status(Some("wip"), "ready"), "wip");
        assert_eq!(resolve_status(Some("discard"), "ready"), "discard");
        // Automatik-Werte werden neu gerechnet, auch abwärts
        assert_eq!(resolve_status(Some("ready"), "exported"), "exported");
        assert_eq!(resolve_status(Some("idea"), "ready"), "ready");
        assert_eq!(resolve_status(None, "exported"), "exported");
        // Alles, was nicht in MANUAL_STATUSES steht, gehört der Automatik
        assert!(STUDIO_STATUSES.iter().all(|s| is_manual_status(s) || resolve_status(Some(s), "idea") == "idea"));
    }

    /// Beim Umnummerieren tauschen Projekte ihre Namen — dabei darf keine
    /// Zeile verschwinden.
    #[test]
    fn repath_ueberlebt_den_namenstausch() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE studio_projects (
                path TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'idea',
                priority INTEGER NOT NULL DEFAULT 0, notes TEXT)",
            [],
        )
        .unwrap();
        for (p, n) in [(r"C:\P\Project_5", "alt"), (r"C:\P\Project_0005", "besetzt")] {
            conn.execute(
                "INSERT INTO studio_projects (path, notes) VALUES (?1, ?2)",
                rusqlite::params![p, n],
            )
            .unwrap();
        }

        let step = |from: &str, to: &str| MergeStep {
            from: from.to_string(),
            to: to.to_string(),
            old_name: String::new(),
            new_name: String::new(),
            date: None,
        };
        // Project_5 → Project_0005 und der bisherige Project_0005 → Project_0012
        repath_studio_rows(
            &mut conn,
            &[
                step(r"C:\P\Project_5", r"C:\P\Project_0005"),
                step(r"C:\P\Project_0005", r"C:\P\Project_0012"),
            ],
        )
        .unwrap();

        let notiz = |p: &str| -> Option<String> {
            conn.query_row(
                "SELECT notes FROM studio_projects WHERE path = ?1",
                rusqlite::params![p],
                |r| r.get(0),
            )
            .ok()
        };
        assert_eq!(notiz(r"C:\P\Project_0005").as_deref(), Some("alt"));
        assert_eq!(notiz(r"C:\P\Project_0012").as_deref(), Some("besetzt"), "Zeile nicht verschluckt");
        let anzahl: i64 = conn
            .query_row("SELECT COUNT(*) FROM studio_projects", [], |r| r.get(0))
            .unwrap();
        assert_eq!(anzahl, 2);
    }


    #[test]
    fn detects_flp_project_with_assets() {
        let tmp = std::env::temp_dir().join(format!("beatos_studio_test_{}", std::process::id()));
        let proj = tmp.join("MEMORIES [156 Fm]");
        let save = proj.join("01_SAVEFILES");
        std::fs::create_dir_all(&save).unwrap();
        std::fs::write(save.join("memories_v3.FLP"), b"flp").unwrap();
        std::fs::write(proj.join("MEMORIES [156 Fm].mp3"), b"mp3").unwrap();
        std::fs::write(proj.join("MEMORIES_Cover.png"), b"png").unwrap();
        std::fs::write(proj.join("MEMORIES_Thumbnail.png"), b"png").unwrap();

        let p = scan_project_dir(&proj, "root").expect("project detected");
        assert_eq!(p.parsed_name, "MEMORIES");
        assert_eq!(p.key.as_deref(), Some("Fm"));
        assert_eq!(p.bpm, Some(156));
        assert!(p.has_mp3 && !p.has_wav);
        assert!(p.has_cover && p.has_thumbnail && !p.has_video);
        assert_eq!(p.flp_count, 1);
        assert!(p.newest_flp.as_deref().unwrap().to_lowercase().ends_with(".flp"));
        assert_eq!(p.flps.len(), 1);
        assert_eq!(p.flps[0].name.to_lowercase(), "memories_v3.flp");

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn song_name_comes_from_export_and_fills_key_bpm() {
        let tmp = std::env::temp_dir().join(format!("beatos_studio_song_{}", std::process::id()));
        // Folder name carries no title info — the export does.
        let proj = tmp.join("project_187");
        std::fs::create_dir_all(&proj).unwrap();
        std::fs::write(proj.join("session.flp"), b"flp").unwrap();
        std::fs::write(proj.join("MEMORIES [156 Fm]_tagged.mp3"), b"mp3").unwrap();

        let p = scan_project_dir(&proj, "root").expect("project detected");
        assert_eq!(p.song_name.as_deref(), Some("MEMORIES"));
        assert_eq!(p.key.as_deref(), Some("Fm"), "Key aus dem Dateinamen");
        assert_eq!(p.bpm, Some(156), "BPM aus dem Dateinamen");
        assert_eq!(p.parsed_name, "project_187", "Ordnername bleibt erhalten");

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn folder_key_bpm_wins_over_export_and_mp3_wins_over_wav() {
        let tmp = std::env::temp_dir().join(format!("beatos_studio_song2_{}", std::process::id()));
        let proj = tmp.join("0042 - DRIFT [Am 140]");
        std::fs::create_dir_all(&proj).unwrap();
        std::fs::write(proj.join("session.flp"), b"flp").unwrap();
        std::fs::write(proj.join("OLD NAME [90 Cm].wav"), b"wav").unwrap();
        std::fs::write(proj.join("DRIFT FINAL [140 Am].mp3"), b"mp3").unwrap();

        let p = scan_project_dir(&proj, "root").expect("project detected");
        assert_eq!(p.song_name.as_deref(), Some("DRIFT FINAL"), "MP3 schlägt WAV");
        assert_eq!(p.key.as_deref(), Some("Am"));
        assert_eq!(p.bpm, Some(140));

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn no_export_means_no_song_name() {
        let tmp = std::env::temp_dir().join(format!("beatos_studio_song3_{}", std::process::id()));
        let proj = tmp.join("Skizze");
        std::fs::create_dir_all(&proj).unwrap();
        std::fs::write(proj.join("session.flp"), b"flp").unwrap();

        let p = scan_project_dir(&proj, "root").expect("project detected");
        assert!(p.song_name.is_none());

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn backup_folder_flps_are_ignored() {
        let tmp = std::env::temp_dir().join(format!("beatos_studio_backup_{}", std::process::id()));
        let proj = tmp.join("DRIFT [140 Am]");
        let backup = proj.join("Backup");
        std::fs::create_dir_all(&backup).unwrap();
        std::fs::write(proj.join("drift_v2.flp"), b"flp").unwrap();
        // Autosave im Backup-Ordner — darf weder zählen noch "neueste" werden
        std::fs::write(backup.join("drift (autosaved at 12-34).flp"), b"flp").unwrap();

        let p = scan_project_dir(&proj, "root").expect("project detected");
        assert_eq!(p.flp_count, 1, "Backup-FLPs dürfen nicht mitzählen");
        assert!(p.newest_flp.as_deref().unwrap().ends_with("drift_v2.flp"));
        assert_eq!(p.flps.len(), 1);

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn folder_without_flp_is_not_a_project() {
        let tmp = std::env::temp_dir().join(format!("beatos_studio_test2_{}", std::process::id()));
        let proj = tmp.join("Nur Bilder");
        std::fs::create_dir_all(&proj).unwrap();
        std::fs::write(proj.join("cover.png"), b"png").unwrap();

        assert!(scan_project_dir(&proj, "root").is_none());

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn assign_asset_moves_with_collision_suffix() {
        let tmp = std::env::temp_dir().join(format!("beatos_assign_test_{}", std::process::id()));
        let inbox = tmp.join("inbox");
        let proj = tmp.join("proj");
        std::fs::create_dir_all(&inbox).unwrap();
        std::fs::create_dir_all(&proj).unwrap();
        std::fs::write(inbox.join("Cover.png"), b"neu").unwrap();
        std::fs::write(proj.join("Cover.png"), b"alt").unwrap(); // collision

        let dest = super::assign_asset_to_project(
            inbox.join("Cover.png").to_string_lossy().to_string(),
            inbox.to_string_lossy().to_string(),
            proj.to_string_lossy().to_string(),
            None,
        ).unwrap();

        assert!(dest.ends_with("Cover_2.png"), "got: {}", dest);
        assert!(!inbox.join("Cover.png").exists(), "source must be moved away");
        assert_eq!(std::fs::read(proj.join("Cover_2.png")).unwrap(), b"neu");
        assert_eq!(std::fs::read(proj.join("Cover.png")).unwrap(), b"alt");

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn create_project_copies_template_and_refuses_duplicates() {
        let tmp = std::env::temp_dir().join(format!("beatos_create_proj_{}", std::process::id()));
        let root = tmp.join("root");
        std::fs::create_dir_all(&root).unwrap();
        let template = tmp.join("Template.flp");
        std::fs::write(&template, b"flp-bytes").unwrap();

        let flp = super::create_project_folder(
            root.to_string_lossy().to_string(),
            "  MEIN SONG: Teil 1  ".to_string(), // wird bereinigt und getrimmt
            template.to_string_lossy().to_string(),
        )
        .unwrap();

        let dir = root.join("MEIN SONG Teil 1");
        assert_eq!(flp, dir.join("01_SAVEFILES").join("MEIN SONG Teil 1.flp").to_string_lossy());
        assert_eq!(std::fs::read(&flp).unwrap(), b"flp-bytes");
        // Der Scan muss das neue Projekt sofort sehen
        assert!(scan_project_dir(&dir, "root").is_some());

        // Zweiter Anlauf mit demselben Namen darf nichts überschreiben
        let again = super::create_project_folder(
            root.to_string_lossy().to_string(),
            "MEIN SONG Teil 1".to_string(),
            template.to_string_lossy().to_string(),
        );
        assert!(again.is_err());

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn next_project_name_is_max_plus_one_across_roots() {
        let tmp = std::env::temp_dir().join(format!("beatos_next_name_{}", std::process::id()));
        let a = tmp.join("a");
        let b = tmp.join("b");
        std::fs::create_dir_all(a.join("Project_134")).unwrap();
        std::fs::create_dir_all(a.join("MEMORIES")).unwrap();          // ohne Nummer
        std::fs::create_dir_all(a.join("Project_alt")).unwrap();       // keine Zahl
        std::fs::create_dir_all(b.join("project_205")).unwrap();       // andere Schreibweise
        std::fs::create_dir_all(b.join("Project_192")).unwrap();

        let roots = vec![a.to_string_lossy().to_string(), b.to_string_lossy().to_string()];
        assert_eq!(super::next_project_name(roots).unwrap(), "Project_0206");
        // Leerer Ordner → fängt bei 1 an
        assert_eq!(
            super::next_project_name(vec![tmp.join("leer").to_string_lossy().to_string()]).unwrap(),
            "Project_0001"
        );

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn rename_moves_folder_and_matching_flp() {
        let tmp = std::env::temp_dir().join(format!("beatos_rename_{}", std::process::id()));
        let root = tmp.join("root");
        let proj = root.join("Project_206");
        let saves = proj.join("01_SAVEFILES");
        std::fs::create_dir_all(&saves).unwrap();
        std::fs::write(saves.join("Project_206.flp"), b"flp").unwrap();
        std::fs::write(saves.join("hook_v3.flp"), b"flp").unwrap();

        let new_dir = super::rename_project_dir(&proj, "MEMORIES").unwrap();

        assert_eq!(new_dir, root.join("MEMORIES"));
        assert!(!proj.exists());
        assert!(new_dir.join("01_SAVEFILES").join("MEMORIES.flp").exists(), "FLP zieht mit");
        assert!(new_dir.join("01_SAVEFILES").join("hook_v3.flp").exists(), "eigener Name bleibt");

        // Auf einen belegten Namen darf nicht umbenannt werden
        std::fs::create_dir_all(root.join("DRIFT")).unwrap();
        assert!(super::rename_project_dir(&new_dir, "DRIFT").is_err());
        // Gleicher Name = kein Fehler, nur nichts zu tun
        assert_eq!(super::rename_project_dir(&new_dir, "MEMORIES").unwrap(), new_dir);

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn create_project_without_template_leaves_no_folder() {
        let tmp = std::env::temp_dir().join(format!("beatos_create_proj2_{}", std::process::id()));
        let root = tmp.join("root");
        std::fs::create_dir_all(&root).unwrap();

        let res = super::create_project_folder(
            root.to_string_lossy().to_string(),
            "Ohne Vorlage".to_string(),
            tmp.join("gibtsnicht.flp").to_string_lossy().to_string(),
        );
        assert!(res.is_err());
        assert!(!root.join("Ohne Vorlage").exists(), "kein halber Ordner");

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    /// Legt ein Projekt mit einer FLP an, deren Zeitstempel gesetzt ist.
    fn make_project(dir: &std::path::Path, flp: &str, age_days: u64) {
        let saves = dir.join("01_SAVEFILES");
        std::fs::create_dir_all(&saves).unwrap();
        let f = saves.join(flp);
        std::fs::write(&f, b"flp").unwrap();
        let when = std::time::SystemTime::now() - std::time::Duration::from_secs(age_days * 86_400);
        let file = std::fs::File::options().write(true).open(&f).unwrap();
        file.set_modified(when).unwrap();
    }

    #[test]
    fn plan_numbers_by_age_and_keeps_the_name_part() {
        let tmp = std::env::temp_dir().join(format!("beatos_merge_plan_{}", std::process::id()));
        let target = tmp.join("01_ACTIVE_PRODUCTION");
        let other = tmp.join("700-799");
        std::fs::create_dir_all(&target).unwrap();
        std::fs::create_dir_all(&other).unwrap();

        make_project(&target.join("Project_5"), "Project_5.flp", 400);   // ältester
        make_project(&target.join("Project_9"), "Project_9.flp", 10);    // jüngster
        make_project(&other.join("Project_236"), "Project_236.flp", 100); // Mitte
        // Seit dem erweiterten Parser laufen diese beiden mit statt still
        // hinten runterzufallen — das alte System benutzt genau diese Schemata.
        make_project(&other.join("#Project_1"), "x.flp", 50);
        make_project(&other.join("[701] One Sided Love - 125 Cm"), "y.flp", 200);
        // Bleiben liegen:
        make_project(&other.join("NO MORE RUNNING"), "z.flp", 60); // keine Nummer im Namen
        std::fs::create_dir_all(other.join("Project_77")).unwrap(); // ohne FLP
        std::fs::write(other.join("untitled.flp"), b"flp").unwrap(); // lose Datei

        let plan = super::plan_production_merge(
            vec![other.to_string_lossy().to_string()],
            target.to_string_lossy().to_string(),
            vec![],
        )
        .unwrap();

        let names: Vec<(&str, &str)> = plan
            .steps
            .iter()
            .map(|s| (s.old_name.as_str(), s.new_name.as_str()))
            .collect();
        assert_eq!(
            names,
            vec![
                ("Project_5", "Project_0001"),
                ("[701] One Sided Love - 125 Cm", "Project_0002 - One Sided Love - 125 Cm"),
                ("Project_236", "Project_0003"),
                ("#Project_1", "Project_0004"),
                ("Project_9", "Project_0005"),
            ],
            "ältester Beat bekommt die 1, und der Namensteil zieht mit"
        );
        assert!(plan.steps.iter().all(|s| s.to.starts_with(&target.to_string_lossy().to_string())));

        let skipped: Vec<&str> = plan.skipped.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(skipped, vec!["NO MORE RUNNING", "Project_77"]);
        assert!(plan.skipped.iter().any(|s| s.reason.contains("keine FLP")));
        assert!(plan.skipped.iter().any(|s| s.reason.contains("keine Nummer")));

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn apply_swaps_names_without_collision_and_undo_restores() {
        let tmp = std::env::temp_dir().join(format!("beatos_merge_apply_{}", std::process::id()));
        let target = tmp.join("target");
        let other = tmp.join("other");
        std::fs::create_dir_all(&target).unwrap();
        std::fs::create_dir_all(&other).unwrap();

        // Project_0001 existiert schon und muss selbst zu Project_0002 werden —
        // genau der Fall, an dem ein einphasiges Umbenennen scheitern würde.
        make_project(&target.join("Project_0001"), "Project_0001.flp", 5);
        make_project(&other.join("Project_42"), "Project_42.flp", 900);
        std::fs::write(target.join("Project_0001").join("notiz.txt"), b"bleibt").unwrap();

        let plan = super::plan_production_merge(
            vec![other.to_string_lossy().to_string()],
            target.to_string_lossy().to_string(),
            vec![],
        )
        .unwrap();
        assert_eq!(plan.steps.len(), 2);

        let (done, failed) = super::merge_steps_on_disk(&plan.steps);
        assert!(failed.is_empty(), "unerwartet fehlgeschlagen: {:?}", failed);
        assert_eq!(done.len(), 2);

        // Der alte Beat steht vorn, der junge dahinter — samt FLP-Namen
        assert!(target.join("Project_0001/01_SAVEFILES/Project_0001.flp").exists());
        assert!(target.join("Project_0002/01_SAVEFILES/Project_0002.flp").exists());
        assert!(target.join("Project_0002/notiz.txt").exists(), "Inhalt zieht mit");
        assert!(!other.join("Project_42").exists());
        // Keine Zwischennamen übrig
        assert!(!std::fs::read_dir(&target).unwrap().filter_map(|e| e.ok())
            .any(|e| e.file_name().to_string_lossy().starts_with(".beatos_merge_")));

        // Rückwärts abspielen stellt den Ausgangszustand wieder her
        let back: Vec<super::MergeStep> = done
            .into_iter()
            .map(|s| super::MergeStep {
                from: s.to, to: s.from,
                old_name: s.new_name, new_name: s.old_name,
                date: s.date,
            })
            .collect();
        let (undone, failed) = super::merge_steps_on_disk(&back);
        assert!(failed.is_empty(), "Rückgängig fehlgeschlagen: {:?}", failed);
        assert_eq!(undone.len(), 2);

        assert!(other.join("Project_42/01_SAVEFILES/Project_42.flp").exists());
        assert!(target.join("Project_0001/01_SAVEFILES/Project_0001.flp").exists());
        assert!(target.join("Project_0001/notiz.txt").exists());
        assert!(!target.join("Project_0002").exists());

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn apply_never_overwrites_an_occupied_target() {
        let tmp = std::env::temp_dir().join(format!("beatos_merge_guard_{}", std::process::id()));
        let target = tmp.join("target");
        std::fs::create_dir_all(&target).unwrap();
        make_project(&target.join("Project_7"), "Project_7.flp", 3);
        // Fremder Ordner belegt den Zielnamen und darf nicht verschwinden
        std::fs::create_dir_all(target.join("Project_0001")).unwrap();
        std::fs::write(target.join("Project_0001").join("wichtig.txt"), b"fremd").unwrap();

        let steps = vec![super::MergeStep {
            from: target.join("Project_7").to_string_lossy().to_string(),
            to: target.join("Project_0001").to_string_lossy().to_string(),
            old_name: "Project_7".to_string(),
            new_name: "Project_0001".to_string(),
            date: None,
        }];
        let (done, failed) = super::merge_steps_on_disk(&steps);

        assert!(done.is_empty());
        assert_eq!(failed.len(), 1);
        assert!(failed[0].contains("belegt"), "got: {}", failed[0]);
        // Nichts überschrieben, nichts verloren — der Ordner wartet unter dem
        // Zwischennamen auf den Nutzer
        assert_eq!(std::fs::read(target.join("Project_0001/wichtig.txt")).unwrap(), b"fremd");
        assert!(std::fs::read_dir(&target).unwrap().filter_map(|e| e.ok())
            .any(|e| e.file_name().to_string_lossy().starts_with(".beatos_merge_")));

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    /// `mergeClasses.ts` liest diese Texte: „archiviert" färbt die Zeile grün,
    /// „keine FLP" grau, alles andere gilt als „keine Nummer". Wer hier
    /// umformuliert, verschiebt stumm Farben und Zahlen im Merge-Dialog —
    /// also stehen die drei Wörter hier fest.
    #[test]
    fn die_uebersprungen_gruende_bleiben_wie_der_dialog_sie_liest() {
        let tmp = std::env::temp_dir().join(format!("beatos_gruende_{}", std::process::id()));
        let root = tmp.join("PROD");
        std::fs::create_dir_all(&root).unwrap();

        make_project(&root.join("Project_1"), "a.flp", 400);
        make_project(&root.join("Project_2"), "b.flp", 300);
        std::fs::create_dir_all(root.join("NO MORE RUNNING")).unwrap(); // ohne Nummer
        std::fs::create_dir_all(root.join("Project_9")).unwrap(); // ohne FLP

        let roots = vec![root.to_string_lossy().to_string()];
        let ziel = root.to_string_lossy().to_string();
        let plan = super::plan_production_merge(
            roots,
            ziel,
            vec![root.join("Project_1").to_string_lossy().to_string()],
        )
        .unwrap();

        let grund = |name: &str| {
            plan.skipped
                .iter()
                .find(|s| s.name == name)
                .map(|s| s.reason.clone())
                .unwrap_or_else(|| panic!("{} steht nicht in den Übersprungenen", name))
        };

        // buildMergeRows: .includes("archiviert") → archived_complete
        assert!(grund("Project_1").contains("archiviert"), "{}", grund("Project_1"));
        // buildMergeRows: .includes("keine FLP") → no_flp
        assert!(grund("Project_9").contains("keine FLP"), "{}", grund("Project_9"));
        // alles andere → no_number
        let ohne_nummer = grund("NO MORE RUNNING");
        assert!(!ohne_nummer.contains("archiviert") && !ohne_nummer.contains("keine FLP"),
                "{}", ohne_nummer);

        std::fs::remove_dir_all(&tmp).ok();
    }

    /// Das Parken hielt sich an `missing` statt an `missing_important` und
    /// übersprang damit Ordner, die der Dialog vorher als vollständig gezählt
    /// und angekündigt hatte — es genügte ein FL-Autosave aus einer Sitzung
    /// nach dem Archivieren.
    #[test]
    fn parken_stolpert_nicht_ueber_fl_autosaves() {
        use crate::commands::archive_match::{MatchKind, MissingFile, ProjectArchiveStatus};

        let status = |missing: Vec<MissingFile>, wichtig: usize| ProjectArchiveStatus {
            project_path: r"C:\PROD\Project_0042".into(),
            project_name: "Project_0042".into(),
            archive_folder: Some("0042 - MEMORIES [Am 140]".into()),
            archive_path: Some(r"C:\ARCHIV\2026\08_AUGUST\0042".into()),
            catalog_id: Some(42),
            matched_by: Some(MatchKind::Title),
            missing,
            missing_important: wichtig,
            compared: 12,
        };
        let autosave = || MissingFile {
            relative_path: r"Backup\Project_0042 (autosaved).flp".into(),
            size: 1024,
            is_backup: true,
        };
        let arbeitsdatei = || MissingFile {
            relative_path: r"01_SAVEFILES\hook_v3.flp".into(),
            size: 2048,
            is_backup: false,
        };

        // Der Fall, um den es geht: nur ein Autosave fehlt → darf weg
        assert_eq!(super::park_skip_reason(&status(vec![autosave()], 0)), None);
        // Nichts fehlt → darf weg
        assert_eq!(super::park_skip_reason(&status(vec![], 0)), None);
        // Echte Arbeitsdatei fehlt → bleibt liegen, und die Meldung sagt warum
        assert_eq!(
            super::park_skip_reason(&status(vec![arbeitsdatei(), autosave()], 1)),
            Some("1 Arbeitsdatei(en) fehlen im Archiv".to_string())
        );

        // Die beiden anderen Gründe bleiben, wie sie waren
        let mut ohne_treffer = status(vec![], 0);
        ohne_treffer.archive_folder = None;
        assert_eq!(
            super::park_skip_reason(&ohne_treffer),
            Some("nicht im Archiv gefunden".to_string())
        );
        let mut mehrdeutig = status(vec![], 0);
        mehrdeutig.matched_by = Some(MatchKind::Ambiguous);
        assert_eq!(
            super::park_skip_reason(&mehrdeutig),
            Some("Zuordnung nicht eindeutig".to_string())
        );
    }

    /// Die Zahl am Studio-Tab zählte 43 „Überarbeiten", die Liste zeigte 42:
    /// die 43. Zeile war ein nach `_ARCHIVIERT` geparktes Projekt. Der Ordner
    /// existiert noch und die Zeile hängt (absichtlich) am neuen Pfad, gescannt
    /// wird er aber nie wieder — also darf er auch nicht mitzählen.
    #[test]
    fn zaehlung_nimmt_nur_was_auch_gescannt_wird() {
        let root = r"C:\Users\kismo\OneDrive\Dokumente\._BEAT LIBRARY\01_ACTIVE_PRODUCTION";
        let roots = vec![root.to_string(), "  ".to_string()];

        assert!(super::liegt_in_roots(&format!(r"{}\Project_0515", root), &roots));

        // Der echte Fall aus dem Bestand
        assert!(!super::liegt_in_roots(
            r"C:\Users\kismo\OneDrive\Dokumente\._BEAT LIBRARY\_ARCHIVIERT\Project_174",
            &roots,
        ));

        // Groß-/Kleinschreibung, Schrägstriche und ein Schluss-Backslash am Root
        assert!(super::liegt_in_roots(
            &format!("{}/project_0515", root.to_lowercase()),
            &vec![format!(r"{}\", root)],
        ));

        // Der Root selbst ist kein Projekt, und ein Ordner daneben mit
        // demselben Namensanfang gehört nicht dazu
        assert!(!super::liegt_in_roots(root, &roots));
        assert!(!super::liegt_in_roots(&format!("{}_ALT\\Project_1", root), &roots));

        // Ohne Roots zählt nichts — sonst zählte die Zahl bei leeren
        // Einstellungen plötzlich den gesamten Bestand
        assert!(!super::liegt_in_roots(&format!(r"{}\Project_0515", root), &[]));
    }

    /// Von außerhalb der Inbox (Drag & Drop) wird kopiert, nicht verschoben —
    /// das Original bleibt liegen, wo es lag.
    #[test]
    fn assign_asset_kopiert_von_ausserhalb() {
        let tmp = std::env::temp_dir().join(format!("beatos_assign_test2_{}", std::process::id()));
        let inbox = tmp.join("inbox");
        let outside = tmp.join("outside");
        let proj = tmp.join("proj");
        std::fs::create_dir_all(&inbox).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::create_dir_all(&proj).unwrap();
        std::fs::write(outside.join("x.png"), b"x").unwrap();

        let res = super::assign_asset_to_project(
            outside.join("x.png").to_string_lossy().to_string(),
            inbox.to_string_lossy().to_string(),
            proj.to_string_lossy().to_string(),
            None,
        );
        assert!(res.is_ok(), "Drag & Drop von außerhalb darf ankommen");
        assert!(proj.join("x.png").is_file(), "Kopie liegt im Projekt");
        assert!(outside.join("x.png").exists(), "Original bleibt liegen");

        std::fs::remove_dir_all(&tmp).unwrap();
    }
}

