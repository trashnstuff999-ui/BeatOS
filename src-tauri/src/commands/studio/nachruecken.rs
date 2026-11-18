// src-tauri/src/commands/studio/nachruecken.rs

use super::*;

// ═══════════════════════════════════════════════════════════════════════════════
// Nachrücken: Lücken in der Projekt-Nummerierung schließen
//
// Wie im Asset-Tab: wird Project_0005 gelöscht, wird aus 0006 die 0005 usw.
// Die Reihenfolge bleibt (anders als beim Zusammenführen, das nach Alter
// sortiert), jeder Ordner bleibt in seinem Root. Läuft automatisch nach dem
// Papierkorb und per Knopf „Lücken schließen" nach Löschen im Explorer —
// derselbe Weg wie der Merge, also mit Protokoll und „Rückgängig".
// ═══════════════════════════════════════════════════════════════════════════════

/// Produktions-Roots aus den Einstellungen (eine Zeile pro Root).
pub(super) fn production_roots() -> Vec<String> {
    crate::commands::get_settings()
        .ok()
        .and_then(|s| s.get("production_path").cloned())
        .map(|p| {
            p.split(['\n', ';'])
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(String::from)
                .collect()
        })
        .unwrap_or_default()
}

/// Ein Schritt je Ordner, dessen Nummer sich ändert. Doppelte Nummern
/// bekommen nacheinander eigene; Ordner ohne Nummer bleiben, wie sie sind.
pub(super) fn plan_close_gaps(roots: &[String]) -> Vec<MergeStep> {
    let mut found: Vec<(u32, PathBuf, String, ProjectId)> = Vec::new();
    let mut seen: std::collections::HashSet<PathBuf> = std::collections::HashSet::new();
    for root in roots {
        let Ok(rd) = std::fs::read_dir(Path::new(root)) else { continue };
        for e in rd.filter_map(|e| e.ok()) {
            let dir = e.path();
            if !dir.is_dir() || !seen.insert(dir.canonicalize().unwrap_or_else(|_| dir.clone())) {
                continue;
            }
            let name = e.file_name().to_string_lossy().to_string();
            if let Some(id) = parse_project_id(&name) {
                found.push((id.number, dir, name, id));
            }
        }
    }
    found.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));

    found
        .into_iter()
        .enumerate()
        // Stimmt die Nummer schon, bleibt auch die Schreibweise unangetastet —
        // außer beim alten Schema „Project_0001“: das wird zu „P0001“
        .filter(|(i, (n, _, old_name, _))| *n != *i as u32 + 1 || !old_name.starts_with(&format!("{}{:04}", PROJECT_PREFIX, n)))
        .map(|(i, (_, dir, old_name, id))| {
            let number = format!("{}{:04}", PROJECT_PREFIX, i + 1);
            let new_name = match &id.name {
                Some(n) => sanitize_filename_part(&format!("{} - {}", number, n)),
                None => number,
            };
            MergeStep {
                from: dir.to_string_lossy().to_string(),
                to: dir.with_file_name(&new_name).to_string_lossy().to_string(),
                old_name,
                new_name,
                date: None,
            }
        })
        .collect()
}

pub(super) fn close_gaps_in(roots: &[String]) -> Result<MergeReport, String> {
    let steps = plan_close_gaps(roots);
    if steps.is_empty() {
        return Ok(MergeReport {
            moved: 0,
            failed: Vec::new(),
            log_path: None,
            log_copies: Vec::new(),
            summary_path: None,
            db_backup: None,
        });
    }
    apply_steps(steps, None)
}

/// Nach dem Löschen eines Ordners: nachrücken, wenn er in einem Produktions-
/// Root lag. Gibt zurück, was nicht geklappt hat (z.B. Projekt in FL offen).
pub(crate) fn nachruecken_nach_loeschen(geloescht: &Path) -> Vec<String> {
    let roots = production_roots();
    let Some(parent) = geloescht.parent() else { return Vec::new() };
    let parent = norm_path(&parent.to_string_lossy());
    if !roots.iter().any(|r| norm_path(r) == parent) {
        return Vec::new(); // Übergabe-Ordner, Künstler-Ordner … — keine Nummernreihe
    }
    match close_gaps_in(&roots) {
        Ok(r) => r.failed,
        Err(e) => vec![e],
    }
}

/// Knopf „Lücken schließen" — für Ordner, die im Explorer gelöscht wurden.
#[tauri::command]
pub async fn close_project_gaps() -> Result<MergeReport, String> {
    tauri::async_runtime::spawn_blocking(|| close_gaps_in(&production_roots()))
        .await
        .map_err(|e| format!("Nachrücken abgestürzt: {}", e))?
}
