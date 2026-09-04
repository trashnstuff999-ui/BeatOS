// src-tauri/src/commands/archive_match.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Zwei Fragen zu einem Produktionsordner, beide rein lesend:
//
//   1. Ist dieser Beat schon im Archiv?          → match_projects_to_archive
//   2. Ist die Kopie dort wirklich vollständig?  → Feld `missing` im Ergebnis
//
// Frage 2 ist die wichtigere. Im Bestand liegen Ordner, die längst archiviert
// sind, aber trotzdem noch die Arbeits-FLP tragen — im Archiv steht dort nur
// FL-Autosave aus `Backup/`. Wer nach Frage 1 aufräumt, verliert Arbeit.
//
// Deshalb ist der Vergleich absichtlich schief gebaut: „vollständig" gilt nur
// bei gleicher Größe UND gleichem Inhalt. Ein zu Unrecht als fehlend
// gemeldeter Ordner kostet einen Blick, ein zu Unrecht als vollständig
// gemeldeter kostet eine Datei.
// ═══════════════════════════════════════════════════════════════════════════════

use crate::utils::{is_flp, parse_audio_filename, parse_beat_folder};
use serde::Serialize;
use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};

/// Ein Beat, wie er im Archiv liegt.
#[derive(Debug, Clone)]
pub struct ArchiveEntry {
    pub catalog_id: u32,
    pub title: String,
    pub key: Option<String>,
    pub bpm: Option<i32>,
    pub path: PathBuf,
    pub folder: String,
}

/// Vergleichsform eines Titels: Groß-/Kleinschreibung, Leerzeichen und
/// Satzzeichen fallen weg. „DEVIL EYES" und „DevilEyes" sind derselbe Song.
fn normalize_title(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(|c| c.to_uppercase())
        .collect()
}

/// Alle Beats im Archiv einlesen (`<Jahr>/<Monat>/<NNNN - Titel [Key BPM]>`).
/// Ordner, deren Name nicht dem Schema folgt, werden als Zwischenebene
/// behandelt und weiter durchsucht — bis zu vier Ebenen tief.
pub fn read_archive_index(archive_root: &Path) -> Vec<ArchiveEntry> {
    let mut out = Vec::new();
    collect_archive(archive_root, 0, &mut out);
    out
}

fn collect_archive(dir: &Path, depth: usize, out: &mut Vec<ArchiveEntry>) {
    if depth > 4 {
        return;
    }
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for e in rd.filter_map(|e| e.ok()) {
        let p = e.path();
        if !p.is_dir() {
            continue;
        }
        let name = e.file_name().to_string_lossy().to_string();
        match parse_beat_folder(&name) {
            Some((id, title, key, bpm)) if id.chars().all(|c| c.is_ascii_digit()) => {
                // Ältere Archiv-Ordner schreiben „[Cm 125BPM]" statt „[Cm 125]".
                // Der gemeinsame Parser gibt dafür kein Tempo her; ohne das
                // könnte das Tempo nie einem falschen Treffer widersprechen.
                let bpm = bpm.map(|b| b as i32).or_else(|| bpm_from_bpm_suffix(&name));
                out.push(ArchiveEntry {
                    catalog_id: id.parse().unwrap_or(0),
                    title,
                    key,
                    bpm,
                    path: p,
                    folder: name,
                });
            }
            _ => collect_archive(&p, depth + 1, out),
        }
    }
}

/// „0701 - One Sided Love [Cm 125BPM]" → 125. Nur für die alte Schreibweise
/// mit angehängtem BPM; ohne sie bliebe das Tempo dieser Einträge unbekannt.
fn bpm_from_bpm_suffix(folder: &str) -> Option<i32> {
    let lower = folder.to_lowercase();
    let at = lower.rfind("bpm")?;
    let digits: String = lower[..at]
        .chars()
        .rev()
        .take_while(|c| c.is_ascii_digit())
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    let n: i32 = digits.parse().ok()?;
    (40..=300).contains(&n).then_some(n)
}

// ═══════════════════════════════════════════════════════════════════════════════
// Frage 1 — ist der Beat archiviert?
// ═══════════════════════════════════════════════════════════════════════════════

/// Aus „[701] One Sided Love - 125 Cm" die Nummer und den Titel holen.
///
/// **Nur dieses Schema.** Im alten System ist die Nummer in eckigen Klammern
/// dieselbe Katalog-ID, unter der der Beat im Archiv liegt (`0701 - One Sided
/// Love`). Im neuen System ist „Project_0242" dagegen eine Studio-Nummer, die
/// mit der Katalog-ID nichts zu tun hat — ein Treffer darüber wäre falsch und
/// würde ein lebendes Projekt als erledigt ausweisen.
#[derive(Debug, PartialEq)]
pub struct OldSystemName {
    pub id: u32,
    pub title: String,
    pub key: Option<String>,
    pub bpm: Option<i32>,
}

fn old_system_id_and_title(folder: &str) -> Option<OldSystemName> {
    let rest = folder.trim().strip_prefix('[')?;
    let (digits, after) = rest.split_once(']')?;
    let id: u32 = digits.trim().parse().ok()?;
    if id == 0 {
        return None; // "[000]Samples" ist kein Beat
    }
    let after = after.trim();
    let title = after.split(" - ").next().unwrap_or("").trim().to_string();

    // Tonart und Tempo stehen hinten dran: „Dream - 165 C#m", „GHOST - Am 130".
    // Sie entscheiden später, ob ein Titeltreffer glaubwürdig ist.
    let mut key = None;
    let mut bpm = None;
    for token in after.split([' ', '-']).filter(|t| !t.is_empty()) {
        if let Ok(n) = token.parse::<i32>() {
            if (40..=300).contains(&n) && bpm.is_none() {
                bpm = Some(n);
                continue;
            }
        }
        if key.is_none() && crate::utils::is_valid_key(token) {
            key = Some(token.to_string());
        }
    }
    Some(OldSystemName { id, title, key, bpm })
}

/// Widersprechen sich Ordner und Archiv-Eintrag in Tonart oder Tempo?
///
/// Ein Titel allein reicht nicht: „Dream" gibt es zweimal, einmal in C#m mit
/// 165 und einmal in Am mit 160 — das sind verschiedene Beats. Wo beide Seiten
/// einen Wert tragen und die Werte auseinandergehen, ist der Treffer keiner.
fn contradicts(key: Option<&str>, bpm: Option<i32>, e: &ArchiveEntry) -> bool {
    let key_conflict = matches!(
        (key, e.key.as_deref()),
        (Some(a), Some(b)) if !a.eq_ignore_ascii_case(b)
    );
    let bpm_conflict = matches!((bpm, e.bpm), (Some(a), Some(b)) if a != b);
    key_conflict || bpm_conflict
}

/// Titel, unter denen ein Produktionsordner im Archiv stehen könnte: der
/// Ordnername selbst und jeder Export-Dateiname im Ordner-Root.
fn candidate_titles(project_dir: &Path) -> Vec<String> {
    let mut out = Vec::new();
    if let Some(name) = project_dir.file_name().and_then(|n| n.to_str()) {
        // "0857 - Kopie" → "Kopie" wäre Unsinn; der ganze Name ist der bessere
        // Kandidat, der Export darunter liefert den echten Titel.
        out.push(name.to_string());
        let (parsed, _, _) = parse_audio_filename(name);
        if !parsed.trim().is_empty() {
            out.push(parsed);
        }
        // "[701] One Sided Love - 125 Cm" → "One Sided Love".
        // parse_audio_filename liefert hier nichts: es sucht die Klammer am
        // Ende, hier steht sie vorn.
        if let Some(old) = old_system_id_and_title(name) {
            if !old.title.is_empty() {
                out.push(old.title);
            }
        }
    }
    if let Ok(rd) = std::fs::read_dir(project_dir) {
        for e in rd.filter_map(|e| e.ok()) {
            let p = e.path();
            if !p.is_file() {
                continue;
            }
            let ext = p.extension().and_then(|x| x.to_str()).unwrap_or("").to_lowercase();
            if ext != "mp3" && ext != "wav" {
                continue;
            }
            let Some(file_name) = p.file_name().and_then(|n| n.to_str()) else { continue };
            let (title, _, _) = parse_audio_filename(file_name);
            if !title.trim().is_empty() {
                out.push(title);
            }
        }
    }
    out
}

/// Wie sicher der Treffer ist. Titelgleichheit allein reicht, wenn der Titel
/// im Archiv nur einmal vorkommt; gibt es ihn mehrfach, entscheidet Tonart
/// oder BPM. Bleibt es mehrdeutig, wird nichts behauptet.
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MatchKind {
    /// Die [NNN]-Nummer des alten Systems ist die Katalog-ID im Archiv —
    /// der sicherste Treffer, den es gibt
    CatalogId,
    /// Titel eindeutig im Archiv gefunden
    Title,
    /// Titel mehrfach vorhanden, Tonart oder BPM hat entschieden
    TitleAndKeyBpm,
    /// Titel mehrfach vorhanden und nichts entscheidet — von Hand ansehen
    Ambiguous,
}

#[derive(Debug, Serialize)]
pub struct MissingFile {
    /// Pfad relativ zum Projektordner
    pub relative_path: String,
    pub size: u64,
    /// FL-Autosave aus einem `Backup/`-Ordner. Zählt nicht als verlorene
    /// Arbeit — die Arbeitsdatei steht daneben — würde den Bericht aber
    /// zumüllen, wenn beides gleich aussähe.
    pub is_backup: bool,
}

#[derive(Debug, Serialize)]
pub struct ProjectArchiveStatus {
    pub project_path: String,
    pub project_name: String,
    /// None = kein Treffer im Archiv, also ein lebendes Projekt
    pub archive_folder: Option<String>,
    pub archive_path: Option<String>,
    pub catalog_id: Option<u32>,
    pub matched_by: Option<MatchKind>,
    /// Dateien, die es nur in der Produktion gibt. Leer heißt: vollständig
    /// archiviert. Nur gefüllt, wenn ein Treffer vorliegt.
    pub missing: Vec<MissingFile>,
    /// Davon echte Arbeitsdateien (ohne FL-Autosaves). Das ist die Zahl, die
    /// entscheidet, ob ein Ordner weggeräumt werden darf.
    pub missing_important: usize,
    /// Wie viele Dateien verglichen wurden — für den Bericht
    pub compared: usize,
}

/// Kern von Frage 1, ohne Dateisystem-Vergleich: welcher Archiv-Eintrag gehört
/// zu diesem Ordner?
fn find_archive_entry<'a>(
    titles: &[String],
    by_title: &'a HashMap<String, Vec<usize>>,
    by_catalog_id: &'a HashMap<u32, usize>,
    index: &'a [ArchiveEntry],
    old_system_id: Option<u32>,
    folder_key: Option<&str>,
    folder_bpm: Option<i32>,
) -> Option<(&'a ArchiveEntry, MatchKind)> {
    // Die Katalog-ID schlägt jeden Titelvergleich: sie ist dieselbe Zahl, kein
    // Namensvergleich, keine Schreibvariante. Nur fürs alte [NNN]-Schema.
    if let Some(id) = old_system_id {
        if let Some(&i) = by_catalog_id.get(&id) {
            return Some((&index[i], MatchKind::CatalogId));
        }
    }
    for t in titles {
        let key = normalize_title(t);
        if key.is_empty() {
            continue;
        }
        let Some(hits) = by_title.get(&key) else { continue };

        // Treffer verwerfen, die Tonart oder Tempo widersprechen — ein
        // gleicher Titel allein ist kein Beweis.
        let glaubwuerdig: Vec<usize> = hits
            .iter()
            .copied()
            .filter(|&i| !contradicts(folder_key, folder_bpm, &index[i]))
            .collect();
        if glaubwuerdig.is_empty() {
            continue; // dieser Titel passt nicht; nächster Kandidat
        }
        if glaubwuerdig.len() == 1 {
            return Some((&index[glaubwuerdig[0]], MatchKind::Title));
        }
        // Mehrere bleiben übrig — jetzt muss Tonart/BPM aktiv bestätigen
        let narrowed: Vec<usize> = glaubwuerdig
            .iter()
            .copied()
            .filter(|&i| {
                let e = &index[i];
                let key_ok = match (folder_key, e.key.as_deref()) {
                    (Some(a), Some(b)) => a.eq_ignore_ascii_case(b),
                    _ => false,
                };
                let bpm_ok = matches!((folder_bpm, e.bpm), (Some(a), Some(b)) if a == b);
                key_ok || bpm_ok
            })
            .collect();
        return match narrowed.len() {
            1 => Some((&index[narrowed[0]], MatchKind::TitleAndKeyBpm)),
            _ => Some((&index[glaubwuerdig[0]], MatchKind::Ambiguous)),
        };
    }
    None
}

// ═══════════════════════════════════════════════════════════════════════════════
// Frage 2 — liegt wirklich alles im Archiv?
// ═══════════════════════════════════════════════════════════════════════════════

/// Alle Dateien unter `dir`, rekursiv, als (Größe, Pfad).
fn collect_files(dir: &Path, base: &Path, out: &mut Vec<(u64, PathBuf, String)>) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for e in rd.filter_map(|e| e.ok()) {
        let p = e.path();
        if p.is_dir() {
            collect_files(&p, base, out);
            continue;
        }
        let Ok(meta) = std::fs::metadata(&p) else { continue };
        let rel = p
            .strip_prefix(base)
            .unwrap_or(&p)
            .to_string_lossy()
            .to_string();
        out.push((meta.len(), p, rel));
    }
}

/// Inhaltsvergleich in Blöcken. Kein Hash-Crate nötig: verglichen wird nur bei
/// gleicher Größe, und dann bricht der erste abweichende Block sofort ab.
fn same_content(a: &Path, b: &Path) -> bool {
    let (Ok(mut fa), Ok(mut fb)) = (std::fs::File::open(a), std::fs::File::open(b)) else {
        return false;
    };
    let mut ba = vec![0u8; 64 * 1024];
    let mut bb = vec![0u8; 64 * 1024];
    loop {
        let na = match fa.read(&mut ba) {
            Ok(n) => n,
            Err(_) => return false,
        };
        let nb = match read_exactly(&mut fb, &mut bb, na) {
            Some(n) => n,
            None => return false,
        };
        if na != nb || ba[..na] != bb[..nb] {
            return false;
        }
        if na == 0 {
            return true;
        }
    }
}

/// Liest genau `want` Bytes (oder weniger am Dateiende) — `read` darf kurz
/// liefern, ein naiver Vergleich würde dann fälschlich „verschieden" sagen.
fn read_exactly(f: &mut std::fs::File, buf: &mut [u8], want: usize) -> Option<usize> {
    let mut filled = 0;
    while filled < want {
        match f.read(&mut buf[filled..want]) {
            Ok(0) => break,
            Ok(n) => filled += n,
            Err(_) => return None,
        }
    }
    Some(filled)
}

/// Welche Dateien des Projektordners fehlen im Archivordner?
///
/// Verglichen wird ohne Rücksicht auf die Ordnerstruktur — das Archiv sortiert
/// in `01_AUDIO/`, `02_VISUALS/`, `03_PROJECTS/` um, die Produktion nicht.
/// Eine Datei gilt als vorhanden, wenn irgendwo im Archivordner eine mit
/// gleicher Größe und gleichem Inhalt liegt.
pub fn missing_in_archive(project_dir: &Path, archive_dir: &Path) -> (Vec<MissingFile>, usize) {
    let mut archive_files = Vec::new();
    collect_files(archive_dir, archive_dir, &mut archive_files);
    let mut by_size: HashMap<u64, Vec<&PathBuf>> = HashMap::new();
    for (size, path, _) in &archive_files {
        by_size.entry(*size).or_default().push(path);
    }

    let mut project_files = Vec::new();
    collect_files(project_dir, project_dir, &mut project_files);

    let mut missing = Vec::new();
    for (size, path, rel) in &project_files {
        // Leere Dateien sagen nichts aus
        if *size == 0 {
            continue;
        }
        let found = match by_size.get(size) {
            // Keine Datei gleicher Größe im Archiv → sicher nicht dort
            None => false,
            Some(candidates) => candidates.iter().any(|c| same_content(path, c)),
        };
        if !found {
            missing.push(MissingFile {
                relative_path: rel.clone(),
                size: *size,
                is_backup: is_backup_path(rel),
            });
        }
    }
    // Echte Arbeitsdateien zuerst, Autosaves ans Ende
    missing.sort_by(|a, b| {
        a.is_backup
            .cmp(&b.is_backup)
            .then(a.relative_path.cmp(&b.relative_path))
    });
    (missing, project_files.len())
}

/// Liegt die Datei in einem FL-Backup-Ordner? Dieselbe Regel wie im
/// Studio-Scan: der Ordnername enthält „backup".
fn is_backup_path(relative: &str) -> bool {
    relative
        .split(['/', '\\'])
        .rev()
        .skip(1) // der Dateiname selbst zählt nicht
        .any(|seg| seg.to_lowercase().contains("backup"))
}

// ═══════════════════════════════════════════════════════════════════════════════
// Der Befehl
// ═══════════════════════════════════════════════════════════════════════════════

/// Jeden Projektordner unter `paths` gegen das Archiv halten.
///
/// `deep` schaltet den Datei-für-Datei-Vergleich zu (Frage 2). Ohne ihn kommt
/// nur die Zuordnung — schnell, aber es sagt nichts darüber, ob die Kopie im
/// Archiv vollständig ist.
#[tauri::command]
pub async fn match_projects_to_archive(
    paths: Vec<String>,
    archive_path: String,
    deep: bool,
) -> Result<Vec<ProjectArchiveStatus>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        match_projects_blocking(&paths, Path::new(&archive_path), deep)
    })
    .await
    .map_err(|e| format!("Archiv-Abgleich abgestürzt: {}", e))?
}

/// Nur für Handproben aus anderen Modulen — dieselbe Arbeit, ohne den
/// async-Umweg über den Tauri-Command.
#[cfg(test)]
pub(crate) fn match_projects_for_test(
    paths: &[String],
    archive_root: &Path,
    deep: bool,
) -> Vec<ProjectArchiveStatus> {
    match_projects_blocking(paths, archive_root, deep).unwrap_or_default()
}

/// Alle Projektordner unter den Roots einsammeln — direkte Unterordner mit FLP.
fn project_dirs_under(paths: &[String]) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut seen: std::collections::HashSet<PathBuf> = std::collections::HashSet::new();
    for root in paths {
        let Ok(rd) = std::fs::read_dir(Path::new(root)) else { continue };
        for e in rd.filter_map(|e| e.ok()) {
            let dir = e.path();
            if !dir.is_dir() {
                continue;
            }
            let canon = dir.canonicalize().unwrap_or_else(|_| dir.clone());
            if !seen.insert(canon) {
                continue;
            }
            if has_flp(&dir) {
                out.push(dir);
            }
        }
    }
    out
}

fn match_projects_blocking(
    paths: &[String],
    archive_root: &Path,
    deep: bool,
) -> Result<Vec<ProjectArchiveStatus>, String> {
    check_project_dirs(&project_dirs_under(paths), archive_root, deep)
}

/// Derselbe Abgleich über eine ausdrückliche Ordnerliste statt über Roots.
/// Das Parken nutzt ihn, um kurz vor dem Verschieben nochmal nachzuprüfen —
/// zwischen Abgleich und Klick können Minuten liegen.
pub(crate) fn check_project_dirs(
    dirs: &[PathBuf],
    archive_root: &Path,
    deep: bool,
) -> Result<Vec<ProjectArchiveStatus>, String> {
    if !archive_root.is_dir() {
        return Err(format!("Archiv-Ordner nicht gefunden: {}", archive_root.display()));
    }
    let index = read_archive_index(archive_root);
    if index.is_empty() {
        return Err(format!(
            "Kein Beat im Archiv gefunden unter {} — stimmt der Pfad?",
            archive_root.display()
        ));
    }

    let mut by_title: HashMap<String, Vec<usize>> = HashMap::new();
    let mut by_catalog_id: HashMap<u32, usize> = HashMap::new();
    for (i, e) in index.iter().enumerate() {
        let k = normalize_title(&e.title);
        if !k.is_empty() {
            by_title.entry(k).or_default().push(i);
        }
        by_catalog_id.entry(e.catalog_id).or_insert(i);
    }

    let mut out = Vec::new();

    {
        for dir in dirs.iter().cloned() {
            let name = dir
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            // Tonart und Tempo kommen aus dem Ordnernamen — im neuen Schema aus
            // der Klammer am Ende, im alten aus dem Anhang „- 165 C#m".
            let (_, key_neu, bpm_neu) = parse_audio_filename(&name);
            let alt = old_system_id_and_title(&name);
            let folder_key = key_neu.or_else(|| alt.as_ref().and_then(|a| a.key.clone()));
            let folder_bpm = bpm_neu.or_else(|| alt.as_ref().and_then(|a| a.bpm));

            let titles = candidate_titles(&dir);
            let hit = find_archive_entry(
                &titles,
                &by_title,
                &by_catalog_id,
                &index,
                alt.as_ref().map(|a| a.id),
                folder_key.as_deref(),
                folder_bpm,
            );

            let (archive_folder, archive_path, catalog_id, matched_by, missing, compared) =
                match hit {
                    None => (None, None, None, None, Vec::new(), 0),
                    Some((entry, kind)) => {
                        let (missing, compared) = if deep {
                            missing_in_archive(&dir, &entry.path)
                        } else {
                            (Vec::new(), 0)
                        };
                        (
                            Some(entry.folder.clone()),
                            Some(entry.path.to_string_lossy().to_string()),
                            Some(entry.catalog_id),
                            Some(kind),
                            missing,
                            compared,
                        )
                    }
                };

            let missing_important = missing.iter().filter(|m| !m.is_backup).count();
            out.push(ProjectArchiveStatus {
                project_path: dir.to_string_lossy().to_string(),
                project_name: name,
                archive_folder,
                archive_path,
                catalog_id,
                matched_by,
                missing,
                missing_important,
                compared,
            });
        }
    }

    // Zwei Ordner können nicht derselbe archivierte Beat sein. Passiert bei
    // allgemeinen Titeln („test"): dann ist höchstens einer richtig und beide
    // werden als unsicher markiert, statt einen still falsch auszuweisen.
    let mut belegt: HashMap<String, usize> = HashMap::new();
    for r in &out {
        if let Some(p) = &r.archive_path {
            *belegt.entry(p.clone()).or_default() += 1;
        }
    }
    for r in &mut out {
        if r.archive_path.as_ref().is_some_and(|p| belegt[p] > 1) {
            r.matched_by = Some(MatchKind::Ambiguous);
        }
    }

    // Zuerst, was echte Arbeit nur in der Produktion hat — das ist die Gruppe,
    // bei der ein unbedachtes Wegräumen wehtut.
    out.sort_by(|a, b| {
        let rank = |s: &ProjectArchiveStatus| match &s.archive_folder {
            Some(_) if s.missing_important > 0 => 0,
            Some(_) if !s.missing.is_empty() => 1,
            Some(_) => 2,
            None => 3,
        };
        rank(a).cmp(&rank(b)).then(a.project_name.cmp(&b.project_name))
    });
    Ok(out)
}

/// FLP im Ordner-Root oder eine Ebene tiefer (ohne Backups) — dieselbe Regel
/// wie im Studio-Scan.
fn has_flp(dir: &Path) -> bool {
    let any = |d: &Path| {
        std::fs::read_dir(d)
            .into_iter()
            .flatten()
            .filter_map(|e| e.ok())
            .any(|e| is_flp(&e.path()))
    };
    if any(dir) {
        return true;
    }
    std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .filter(|p| {
            !p.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_lowercase()
                .contains("backup")
        })
        .any(|p| any(&p))
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(tag: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("beatos_am_{}_{}", tag, std::process::id()));
        std::fs::remove_dir_all(&p).ok();
        p
    }

    fn write(path: &Path, bytes: &[u8]) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, bytes).unwrap();
    }

    #[test]
    fn titel_vergleich_ignoriert_schreibweise_und_zeichen() {
        assert_eq!(normalize_title("DEVIL EYES"), normalize_title("DevilEyes"));
        assert_eq!(normalize_title("Don't need you"), normalize_title("DONT NEED YOU"));
        assert_ne!(normalize_title("MEMORIES"), normalize_title("MEMORY"));
    }

    #[test]
    fn archiv_index_liest_das_jahr_monat_schema() {
        let root = tmp("idx");
        std::fs::create_dir_all(root.join("2026/05_MAY/0888 - LEFT ALONE [F#m 135]")).unwrap();
        std::fs::create_dir_all(root.join("2024/08_AUGUST/0701 - One Sided Love [Cm 125BPM]")).unwrap();

        let index = read_archive_index(&root);
        let mut ids: Vec<u32> = index.iter().map(|e| e.catalog_id).collect();
        ids.sort();
        assert_eq!(ids, vec![701, 888]);

        let left = index.iter().find(|e| e.catalog_id == 888).unwrap();
        assert_eq!(left.title, "LEFT ALONE");
        assert_eq!(left.key.as_deref(), Some("F#m"));
        assert_eq!(left.bpm, Some(135));

        std::fs::remove_dir_all(&root).ok();
    }

    /// Der Fall, um den es geht: der Ordner ist archiviert, trägt aber noch die
    /// Arbeits-FLP. Im Archiv liegt nur ein Autosave — gleiche Größenordnung,
    /// anderer Inhalt. Ein Größenvergleich allein würde hier „vollständig"
    /// melden, wenn die Größen zufällig übereinstimmen.
    #[test]
    fn arbeits_flp_die_nur_in_der_produktion_liegt_wird_gefunden() {
        let root = tmp("missing");
        let proj = root.join("prod/#Project_114");
        let arch = root.join("arch/0888 - LEFT ALONE [F#m 135]");

        // Gleicher Export auf beiden Seiten
        write(&proj.join("LEFT ALONE [F#m 135].mp3"), b"AUDIO-INHALT");
        write(&arch.join("01_AUDIO/LEFT ALONE [F#m 135].mp3"), b"AUDIO-INHALT");
        // Arbeitsdatei nur in der Produktion; im Archiv ein gleich GROSSER,
        // aber inhaltlich anderer Autosave
        write(&proj.join("Project_114.flp"), b"ARBEITSSTAND-AAAA");
        write(&arch.join("03_PROJECTS/Backup/Project_114 (autosaved).flp"), b"AUTOSAVE-BBBBBBBB");

        let (missing, compared) = missing_in_archive(&proj, &arch);
        assert_eq!(compared, 2);
        assert_eq!(missing.len(), 1, "nur die Arbeits-FLP fehlt: {:?}", missing);
        assert_eq!(missing[0].relative_path, "Project_114.flp");

        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn vollstaendig_archiviert_meldet_nichts() {
        let root = tmp("complete");
        let proj = root.join("prod/Project_173");
        let arch = root.join("arch/0902 - COME BACK [D#m 138]");
        write(&proj.join("COME BACK.mp3"), b"eins");
        write(&proj.join("Project_173.flp"), b"zwei");
        // Das Archiv sortiert um — der Vergleich darf sich davon nicht stören lassen
        write(&arch.join("01_AUDIO/COME BACK.mp3"), b"eins");
        write(&arch.join("03_PROJECTS/Project_173.flp"), b"zwei");

        let (missing, compared) = missing_in_archive(&proj, &arch);
        assert!(missing.is_empty(), "nichts sollte fehlen: {:?}", missing);
        assert_eq!(compared, 2);

        std::fs::remove_dir_all(&root).ok();
    }

    /// Gleiche Größe, anderer Inhalt — genau der Fall, den ein reiner
    /// Größenvergleich verschluckt.
    #[test]
    fn gleiche_groesse_anderer_inhalt_zaehlt_als_fehlend() {
        let root = tmp("size");
        let proj = root.join("prod/P");
        let arch = root.join("arch/A");
        write(&proj.join("mix.wav"), b"AAAAAAAAAAAAAAAA");
        write(&arch.join("01_AUDIO/mix.wav"), b"BBBBBBBBBBBBBBBB");

        let (missing, _) = missing_in_archive(&proj, &arch);
        assert_eq!(missing.len(), 1);
        assert_eq!(missing[0].relative_path, "mix.wav");

        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn zuordnung_ueber_titel_und_ueber_export_dateinamen() {
        let root = tmp("match");
        let archive = root.join("archive");
        std::fs::create_dir_all(archive.join("2026/05_MAY/0855 - ARE YOU HERE [F#m 118]")).unwrap();

        // Der Ordner heißt nur "0857" — der Titel steckt im Export
        let proj = root.join("prod/0857");
        write(&proj.join("0857.flp"), b"flp");
        write(&proj.join("ARE YOU HERE - [F#m 118].mp3"), b"mp3");
        // Ein lebendes Projekt ohne Archiv-Entsprechung
        let live = root.join("prod/Project_0242");
        write(&live.join("Project_0242.flp"), b"flp");

        let res = match_projects_blocking(
            &[root.join("prod").to_string_lossy().to_string()],
            &archive,
            true,
        )
        .unwrap();

        assert_eq!(res.len(), 2);
        let hit = res.iter().find(|r| r.project_name == "0857").unwrap();
        assert_eq!(hit.catalog_id, Some(855));
        assert_eq!(hit.matched_by, Some(MatchKind::Title));

        let live = res.iter().find(|r| r.project_name == "Project_0242").unwrap();
        assert!(live.archive_folder.is_none(), "lebendes Projekt darf keinen Treffer haben");

        std::fs::remove_dir_all(&root).ok();
    }

    /// Handprobe am echten Bestand — läuft nur, wenn beide Pfade gesetzt sind:
    ///
    /// ```text
    /// BEATOS_ROOTS="C:\...\01_ACTIVE_PRODUCTION;C:\...\600-699" \
    /// BEATOS_ARCHIVE="C:\...\03_ARCHIVE" \
    ///   cargo test --lib handprobe -- --ignored --nocapture
    /// ```
    ///
    /// Bewusst nicht Teil des normalen Laufs: er hängt an echten Ordnern.
    #[test]
    #[ignore]
    fn handprobe_am_echten_bestand() {
        let (Ok(roots), Ok(archive)) = (
            std::env::var("BEATOS_ROOTS"),
            std::env::var("BEATOS_ARCHIVE"),
        ) else {
            eprintln!("BEATOS_ROOTS und BEATOS_ARCHIVE setzen — übersprungen");
            return;
        };
        let deep = std::env::var("BEATOS_DEEP").is_ok();
        let paths: Vec<String> = roots.split(';').map(|s| s.trim().to_string()).collect();

        let res = match_projects_blocking(&paths, Path::new(&archive), deep).unwrap();
        let archived = res.iter().filter(|r| r.archive_folder.is_some()).count();
        let unvollstaendig = res.iter().filter(|r| r.missing_important > 0).count();
        let mehrdeutig = res
            .iter()
            .filter(|r| r.matched_by == Some(MatchKind::Ambiguous))
            .count();

        println!("\n── Handprobe ────────────────────────────────");
        println!("  Projekte gefunden:        {}", res.len());
        println!("  davon archiviert:         {}", archived);
        println!("  davon mehrdeutig:         {}", mehrdeutig);
        println!("  lebend:                   {}", res.len() - archived);
        if mehrdeutig > 0 {
            println!("\n  Unsichere Zuordnungen (von Hand ansehen):");
            for r in res.iter().filter(|r| r.matched_by == Some(MatchKind::Ambiguous)) {
                println!(
                    "    {:<42} → {}",
                    r.project_name,
                    r.archive_folder.as_deref().unwrap_or("?")
                );
            }
        }
        if deep {
            let nur_autosaves = res
                .iter()
                .filter(|r| r.missing_important == 0 && !r.missing.is_empty())
                .count();
            println!("  archiviert, ARBEITSDATEI fehlt dort: {}", unvollstaendig);
            println!("  archiviert, nur Autosaves fehlen:    {}", nur_autosaves);
            let vollstaendig: Vec<&ProjectArchiveStatus> = res
                .iter()
                .filter(|r| {
                    r.archive_folder.is_some()
                        && r.missing.is_empty()
                        && r.matched_by != Some(MatchKind::Ambiguous)
                })
                .collect();
            let bytes: u64 = vollstaendig
                .iter()
                .map(|r| {
                    let mut files = Vec::new();
                    collect_files(Path::new(&r.project_path), Path::new(&r.project_path), &mut files);
                    files.iter().map(|(s, _, _)| *s).sum::<u64>()
                })
                .sum();
            println!(
                "  archiviert und vollständig:          {}  ({:.1} GB)",
                vollstaendig.len(),
                bytes as f64 / 1_073_741_824.0
            );
            for r in res.iter().filter(|r| r.missing_important > 0) {
                println!(
                    "    {} → {}",
                    r.project_name,
                    r.archive_folder.as_deref().unwrap_or("?")
                );
                for m in r.missing.iter().filter(|m| !m.is_backup) {
                    println!("        {} ({} Bytes)", m.relative_path, m.size);
                }
            }
        }
        println!("─────────────────────────────────────────────\n");
    }

    #[test]
    fn nur_das_alte_schema_gibt_eine_katalog_id_her() {
        let a = old_system_id_and_title("[701] One Sided Love - 125 Cm").unwrap();
        assert_eq!((a.id, a.title.as_str()), (701, "One Sided Love"));
        assert_eq!(a.bpm, Some(125), "Tempo steht im Anhang");
        assert_eq!(a.key.as_deref(), Some("Cm"), "Tonart steht im Anhang");

        // Auch die Schreibweise „Titel - Tonart Tempo"
        let g = old_system_id_and_title("[833] GHOST - Am 130").unwrap();
        assert_eq!((g.id, g.title.as_str(), g.key.as_deref(), g.bpm), (833, "GHOST", Some("Am"), Some(130)));

        let p = old_system_id_and_title("[64] Past Master").unwrap();
        assert_eq!((p.id, p.title.as_str()), (64, "Past Master"));
        // Der gemeinsame Sample-Ordner der alten Eimer ist kein Beat
        assert_eq!(old_system_id_and_title("[000]Samples"), None);
        // Das neue System hat einen EIGENEN Nummernraum — hier darf nichts
        // zurückkommen, sonst gilt ein lebendes Projekt als archiviert.
        assert_eq!(old_system_id_and_title("Project_0242"), None);
        assert_eq!(old_system_id_and_title("0857"), None);
        assert_eq!(old_system_id_and_title("#Project_75"), None);
        assert_eq!(old_system_id_and_title("NO MORE RUNNING"), None);
    }

    /// Der Fund, der den ganzen Abgleich gerettet hat: das alte System trägt
    /// die Katalog-ID im Namen, aber `parse_audio_filename` findet dort keinen
    /// Titel — die Klammer steht vorn statt hinten. Ohne ID-Abgleich galten
    /// 143 fertige Beats als lebende Projekte.
    /// Der echte Fehlgriff aus dem Bestand: „[671] Dream - 165 C#m" hat auf
    /// „0808 - Dream [Am 160BPM]" gepasst — gleicher Titel, anderer Beat.
    /// Eine 0671 gibt es im Archiv gar nicht.
    #[test]
    fn titel_allein_reicht_nicht_wenn_tonart_widerspricht() {
        let root = tmp("contradict");
        let archive = root.join("archive");
        std::fs::create_dir_all(archive.join("2026/01_JANUARY/0808 - Dream [Am 160BPM]")).unwrap();

        let proj = root.join("prod/[671] Dream - 165 C#m");
        write(&proj.join("x.flp"), b"flp");

        let res = match_projects_blocking(
            &[root.join("prod").to_string_lossy().to_string()],
            &archive,
            false,
        )
        .unwrap();

        assert_eq!(res.len(), 1);
        assert!(
            res[0].archive_folder.is_none(),
            "C#m/165 gegen Am/160 ist ein anderer Beat — kein Treffer erlaubt, war aber: {:?}",
            res[0].archive_folder
        );

        std::fs::remove_dir_all(&root).ok();
    }

    /// Zwei Ordner, ein Archiv-Eintrag: höchstens einer kann es sein. Beide
    /// werden als unsicher markiert, damit später keiner von beiden
    /// versehentlich als „erledigt" weggeräumt wird.
    #[test]
    fn zwei_ordner_koennen_nicht_derselbe_beat_sein() {
        let root = tmp("claim");
        let archive = root.join("archive");
        std::fs::create_dir_all(archive.join("2026/05_MAY/0891 - test [F#m 135]")).unwrap();

        // Einer trifft über den Titel, einer über die Katalog-ID — beide
        // zeigen auf denselben Eintrag, und höchstens einer kann recht haben.
        for n in ["test", "[891] test - 135 F#m"] {
            write(&root.join("prod").join(n).join("x.flp"), b"flp");
        }

        let res = match_projects_blocking(
            &[root.join("prod").to_string_lossy().to_string()],
            &archive,
            false,
        )
        .unwrap();

        let treffer: Vec<_> = res.iter().filter(|r| r.archive_folder.is_some()).collect();
        assert_eq!(treffer.len(), 2, "beide beanspruchen denselben Eintrag");
        assert!(
            treffer.iter().all(|r| r.matched_by == Some(MatchKind::Ambiguous)),
            "beide müssen als unsicher gelten: {:?}",
            treffer.iter().map(|r| &r.matched_by).collect::<Vec<_>>()
        );

        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn bpm_wird_auch_aus_der_alten_schreibweise_gelesen() {
        assert_eq!(bpm_from_bpm_suffix("0701 - One Sided Love [Cm 125BPM]"), Some(125));
        assert_eq!(bpm_from_bpm_suffix("0888 - LEFT ALONE [F#m 135]"), None);
        assert_eq!(bpm_from_bpm_suffix("0705 - RANSOM [NoKey 150BPM]"), Some(150));
        // Unsinnswerte werden nicht als Tempo durchgewinkt
        assert_eq!(bpm_from_bpm_suffix("x [9999BPM]"), None);
    }

    #[test]
    fn altes_schema_trifft_ueber_die_katalog_id() {
        let root = tmp("catalog");
        let archive = root.join("archive");
        std::fs::create_dir_all(archive.join("2024/08_AUGUST/0701 - One Sided Love [Cm 125BPM]")).unwrap();
        std::fs::create_dir_all(archive.join("2026/05_MAY/0888 - LEFT ALONE [F#m 135]")).unwrap();

        // Titel im Ordnernamen weicht ab — nur die Nummer stimmt
        let alt = root.join("prod/[701] One Sided Love - 125 Cm");
        write(&alt.join("x.flp"), b"flp");
        // Neues System mit derselben Zahl: darf NICHT treffen
        let neu = root.join("prod/Project_0701");
        write(&neu.join("y.flp"), b"flp");

        let res = match_projects_blocking(
            &[root.join("prod").to_string_lossy().to_string()],
            &archive,
            false,
        )
        .unwrap();

        let alt = res.iter().find(|r| r.project_name.starts_with("[701]")).unwrap();
        assert_eq!(alt.catalog_id, Some(701));
        assert_eq!(alt.matched_by, Some(MatchKind::CatalogId));

        let neu = res.iter().find(|r| r.project_name == "Project_0701").unwrap();
        assert!(
            neu.archive_folder.is_none(),
            "Project_0701 ist eine Studio-Nummer, keine Katalog-ID — kein Treffer erlaubt"
        );

        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn ordner_ohne_flp_sind_keine_projekte() {
        let root = tmp("noflp");
        let archive = root.join("archive");
        std::fs::create_dir_all(archive.join("2026/05_MAY/0001 - X [Am 100]")).unwrap();
        std::fs::create_dir_all(root.join("prod/Samples")).unwrap();
        write(&root.join("prod/Samples/kick.wav"), b"k");

        let res = match_projects_blocking(
            &[root.join("prod").to_string_lossy().to_string()],
            &archive,
            false,
        )
        .unwrap();
        assert!(res.is_empty(), "Sample-Ordner ist kein Projekt: {:?}", res.len());

        std::fs::remove_dir_all(&root).ok();
    }
}
