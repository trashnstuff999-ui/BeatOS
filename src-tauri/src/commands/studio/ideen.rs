// src-tauri/src/commands/studio/ideen.rs

use super::*;

// ═══════════════════════════════════════════════════════════════════════════════
// Alte Ideen: `<Produktion>/_IDEEN/<Jahr>/<Idee>`, FLPs ohne Export aus dem Altbestand
// ═══════════════════════════════════════════════════════════════════════════════

pub(super) const IDEEN_ORDNER: &str = "_IDEEN";

pub(super) fn alte_ideen_in(roots: &[String]) -> Vec<StudioProject> {
    use std::io::Read;
    let unterordner = |d: &Path| -> Vec<PathBuf> {
        std::fs::read_dir(d).map(|rd| rd.filter_map(|e| e.ok()).map(|e| e.path()).filter(|p| p.is_dir()).collect()).unwrap_or_default()
    };
    let mut ideen = Vec::new();
    for root in roots {
        for jahr in unterordner(&Path::new(root).join(IDEEN_ORDNER)) {
            for dir in unterordner(&jahr) {
                let Some(mut p) = scan_project_dir(&dir, root) else { continue };
                // Tempo aus der neuesten FLP: alte Namen tragen kein [Key BPM],
                // und „[248] FEAR“ läse der Namens-Parser als 248 BPM
                let mut buf = Vec::with_capacity(16 * 1024);
                let gelesen = p.newest_flp.as_ref().and_then(|f| std::fs::File::open(f).ok())
                    .and_then(|f| f.take(16 * 1024).read_to_end(&mut buf).ok());
                let tempo = gelesen.and_then(|_| crate::commands::flp::tempo(&buf)).map(|t| t.round() as i32).filter(|t| *t > 0);
                p.bpm = tempo.or(p.bpm.filter(|_| !p.name.starts_with('[')));
                ideen.push(p);
            }
        }
    }
    ideen
}

/// Liste „Alte Ideen“ im Studio. Ohne Datenbank, wie die Samples.
#[tauri::command]
pub async fn scan_alte_ideen() -> Result<Vec<StudioProject>, String> {
    tauri::async_runtime::spawn_blocking(|| alte_ideen_in(&production_roots()))
        .await
        .map_err(|e| format!("Ideen-Scan abgestürzt: {}", e))
}

/// Idee aus `_IDEEN` als nächstes P-Projekt in ihren Produktions-Ordner
/// verschieben. Derselbe Weg wie das Nachrücken: Protokoll, FLP-Pfade ziehen mit.
pub(super) fn idee_holen(roots: &[String], idee: &Path) -> Result<String, String> {
    let schritt = idee_schritt(roots, idee)?;
    let ziel = schritt.to.clone();
    let r = apply_steps(vec![schritt], None)?;
    if r.moved == 0 || !r.failed.is_empty() {
        return Err(if r.failed.is_empty() { "Nicht verschoben".to_string() } else { r.failed.join("; ") });
    }
    Ok(ziel)
}

/// Wohin die Idee zieht: `<Produktion>/P<nächste Nummer> - <alter Name>`.
pub(super) fn idee_schritt(roots: &[String], idee: &Path) -> Result<MergeStep, String> {
    let jahr = idee.parent().ok_or("Kein Ideen-Ordner")?;
    let ablage = jahr.parent().filter(|a| a.file_name().is_some_and(|n| n == IDEEN_ORDNER)).ok_or("Liegt nicht in _IDEEN")?;
    let root = ablage.parent().ok_or("Kein Produktions-Ordner")?;
    let alt = idee.file_name().ok_or("Kein Ordnername")?.to_string_lossy().to_string();
    // „[248] FEAR“ → „248 FEAR“: die alte Nummer bleibt, aber ohne Klammern,
    // sonst gilt sie im Projekt als [BPM]
    let titel = match alt.strip_prefix('[').and_then(|r| r.split_once(']')) {
        Some((nr, rest)) if !nr.is_empty() && nr.chars().all(|c| c.is_ascii_digit()) => format!("{} {}", nr, rest.trim()),
        _ => alt.clone(),
    };
    let neu = sanitize_filename_part(&format!("{}{:04} - {}", PROJECT_PREFIX, highest_project_number(roots) + 1, titel.trim()));
    Ok(MergeStep {
        from: idee.to_string_lossy().to_string(),
        to: root.join(&neu).to_string_lossy().to_string(),
        old_name: alt,
        new_name: neu,
        date: None,
    })
}

/// Läuft FL, speichert es ein offenes Projekt wieder unter dem alten Pfad.
pub(super) fn fl_laeuft() -> bool {
    let mut c = std::process::Command::new("tasklist");
    c.args(["/NH", "/FO", "CSV"]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    c.output().is_ok_and(|o| {
        let liste = String::from_utf8_lossy(&o.stdout).to_lowercase();
        liste.contains("\"fl64.exe\"") || liste.contains("\"fl.exe\"")
    })
}

/// Knopf „In Produktion holen“. Gibt den neuen Projektordner zurück.
#[tauri::command]
pub async fn idee_in_produktion(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if fl_laeuft() {
            return Err("FL läuft. Erst FL schließen.".to_string());
        }
        idee_holen(&production_roots(), Path::new(&path))
    })
    .await
    .map_err(|e| format!("Holen abgestürzt: {}", e))?
}
