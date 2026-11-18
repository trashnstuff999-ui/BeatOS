// src-tauri/src/commands/studio/zusammenfuehren.rs

use super::*;

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
pub(super) const MERGE_TEMP_PREFIX: &str = ".beatos_merge_";

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
pub(super) fn norm_path(p: &str) -> String {
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
pub(super) fn earliest_secs(p: &Path) -> u64 {
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
pub(super) fn oldest_flp_secs(dir: &Path) -> Option<u64> {
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
    apply_steps(steps, Some("zusammengeführt"))
}

/// Der gemeinsame Ausführungsteil für alles, was Ordner bewegt: DB-Sicherung,
/// Protokoll vorher, zweiphasiges Umbenennen, DB-Pfade nachziehen, Protokoll
/// eindampfen, lesbare Liste. Das Parken benutzt denselben Weg — und erbt damit
/// dasselbe Sicherheitsnetz, inklusive „Rückgängig" aus der Läufe-Liste.
pub(super) fn apply_steps(steps: Vec<MergeStep>, was: Option<&str>) -> Result<MergeReport, String> {
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

    // Die lesbare Liste landet neben den Protokollen in `_BEATOS`, nicht
    // zwischen den Projektordnern.
    let target_dir = crate::db::backup_target_path().parent().map(|p| p.to_path_buf());

    let (done, mut failed) = merge_steps_on_disk(&steps);

    // FL speichert volle Pfade: Aufnahmen in Audio/ zeigen nach dem Umbenennen
    // auf den alten Ordnernamen. Im eigenen Ordner wiederfinden und umbiegen.
    for s in &done {
        if let Err(e) = crate::commands::pfadreparatur::eigener_ordner(Path::new(&s.to)) {
            failed.push(format!("{}: FLP-Pfade nicht nachgezogen ({})", s.new_name, e));
        }
    }

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
            "Datenbank nicht erreichbar ({}): Ordner sind verschoben, Status/Notizen bleiben am alten Pfad",
            e
        )),
    }

    // Danach auf das eindampfen, was wirklich passiert ist — das ist die
    // Vorlage fürs Rückgängigmachen.
    rewrite_merge_logs(&log_paths, &done, &mut failed);

    // Die lesbare Liste erst jetzt: sie dokumentiert, was passiert ist, nicht
    // was geplant war. Ohne `was` keine Liste — das Nachrücken läuft nach jedem
    // Löschen und würde den Produktions-Ordner sonst mit Textdateien füllen.
    let summary_path = match (target_dir.as_deref(), was) {
        (Some(dir), Some(was)) => write_merge_summary(dir, &done, was),
        _ => None,
    };

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
