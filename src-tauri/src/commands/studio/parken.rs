// src-tauri/src/commands/studio/parken.rs

use super::*;

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
pub(super) fn park_skip_reason(s: &crate::commands::archive_match::ProjectArchiveStatus) -> Option<String> {
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

pub(super) fn park_blocking(
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
    let report = apply_steps(steps, Some("geparkt"))?;

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

pub(super) fn read_merge_run(path: &Path, file_name: &str) -> Option<MergeRun> {
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
pub(super) fn repath_studio_rows(
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
        // Artist-Songs mit diesem Projekt als „Mein Beat" ziehen genauso mit.
        crate::commands::artists::projekt_umhaengen(&tx, &s.from, &format!("{}{}", MERGE_TEMP_PREFIX, i))?;
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
        crate::commands::artists::projekt_umhaengen(&tx, &format!("{}{}", MERGE_TEMP_PREFIX, i), &s.to)?;
    }

    tx.commit()
}

/// Der Dateisystem-Teil (ohne DB und Protokoll, damit testbar).
/// Zwei Phasen, weil die Namen untereinander getauscht werden: Project_5 kann
/// nur zu Project_0005 werden, wenn der bisherige Project_0005 vorher weg ist.
pub(super) fn merge_steps_on_disk(steps: &[MergeStep]) -> (Vec<MergeStep>, Vec<String>) {
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
                "{}: „{}“ ist belegt, liegt jetzt als {}",
                s.old_name,
                s.new_name,
                temp.display()
            ));
            continue;
        }
        if let Err(e) = std::fs::rename(&temp, &to) {
            failed.push(format!(
                "{}: Umbenennen nach „{}“ fehlgeschlagen ({}), liegt als {}",
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
pub(super) fn merge_log_dirs() -> Vec<PathBuf> {
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
pub(super) fn write_merge_log(steps: &[MergeStep]) -> Vec<String> {
    write_merge_log_to(&merge_log_dirs(), steps)
}

/// Der schreibende Teil, mit den Zielordnern als Parameter — so ist er ohne
/// echte Bibliothek und ohne %LOCALAPPDATA% prüfbar.
pub(super) fn write_merge_log_to(dirs: &[PathBuf], steps: &[MergeStep]) -> Vec<String> {
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
pub(super) fn rewrite_merge_logs(paths: &[String], done: &[MergeStep], failed: &mut Vec<String>) {
    let Ok(json) = serde_json::to_string_pretty(done) else { return };
    for path in paths {
        if let Err(e) = std::fs::write(path, &json) {
            failed.push(format!(
                "Protokoll nicht aktualisierbar ({}): {} enthält noch den Plan",
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
pub(super) fn write_merge_summary(target_dir: &Path, done: &[MergeStep], was: &str) -> Option<String> {
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

pub(super) fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    s.chars().take(max.saturating_sub(1)).collect::<String>() + "…"
}
