// src-tauri/src/commands/studio/assets.rs

use super::*;

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

pub(super) fn scan_asset_inbox_blocking(path: &str) -> Result<Vec<AssetFile>, String> {
    let root = Path::new(path);
    if path.trim().is_empty() || !root.is_dir() {
        return Err(format!(
            "Asset-Ordner nicht gefunden: '{}' (Einstellungen → Pfade)",
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

/// Ergebnis je Datei beim Umbenennen/Löschen im Asset-Ordner.
#[derive(Debug, Serialize)]
pub struct AssetErgebnis {
    pub pfad: String,
    pub ok: bool,
    pub meldung: String,
}

/// Liegt `pfad` als Datei im Asset-Ordner (oder einem Unterordner davon)?
/// Schutz für Umbenennen und Löschen — nichts außerhalb anfassen.
pub(super) fn im_asset_ordner(asset_root: &str, pfad: &str) -> Result<PathBuf, String> {
    let root = Path::new(asset_root).canonicalize().map_err(|_| "Asset-Ordner nicht gefunden".to_string())?;
    let p = Path::new(pfad).canonicalize().map_err(|_| "Datei nicht gefunden".to_string())?;
    if !p.is_file() || !p.starts_with(&root) || p == root {
        return Err("Liegt nicht im Asset-Ordner".into());
    }
    Ok(p)
}

#[derive(Debug, Deserialize)]
pub struct AssetUmbenennung {
    pub pfad: String,
    /// Nur der neue Dateiname — die Datei bleibt in ihrem Ordner.
    pub neu: String,
}

/// Covers/Thumbnails umbenennen („Nummerieren"). Ein vorhandenes Ziel wird nie
/// überschrieben; der Plan entsteht im Frontend (lib/assetNummern.ts).
/// Zwei Schritte: erst alle auf Zwischennamen, dann auf das Ziel. So geht auch
/// ein Ringtausch (Cover_1 ↔ Cover_2), wenn sich die Reihenfolge nach Alter ändert.
#[tauri::command]
pub fn rename_assets(asset_root: String, umbenennungen: Vec<AssetUmbenennung>) -> Vec<AssetErgebnis> {
    let mut ergebnisse = Vec::new();
    // (Ergebnis-Index, Originalpfad, Zwischenpfad, Zielname)
    let mut zwischen: Vec<(usize, PathBuf, PathBuf, String)> = Vec::new();
    for (i, u) in umbenennungen.into_iter().enumerate() {
        let idx = ergebnisse.len();
        let mut ergebnis = |ok: bool, meldung: String| ergebnisse.push(AssetErgebnis { pfad: u.pfad.clone(), ok, meldung });
        let quelle = match im_asset_ordner(&asset_root, &u.pfad) { Ok(p) => p, Err(e) => { ergebnis(false, e); continue } };
        let neu = sanitize_filename_part(u.neu.trim());
        if neu.is_empty() || neu.contains(['/', '\\']) { ergebnis(false, "Ungültiger Name".into()); continue }
        let name = quelle.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
        let tmp = quelle.with_file_name(format!("~nummerieren_{i}_{name}"));
        match std::fs::rename(&quelle, &tmp) {
            Ok(()) => { zwischen.push((idx, quelle, tmp, neu.clone())); ergebnis(true, neu) }
            Err(e) => ergebnis(false, format!("Umbenennen fehlgeschlagen: {e}")),
        }
    }
    for (idx, quelle, tmp, neu) in zwischen {
        let ziel = quelle.with_file_name(&neu);
        let schief = if ziel.exists() { Some(format!("{neu} gibt es schon")) }
            else { std::fs::rename(&tmp, &ziel).err().map(|e| format!("Umbenennen fehlgeschlagen: {e}")) };
        if let Some(meldung) = schief {
            // Zurück auf den alten Namen; ist der inzwischen belegt, bleibt der Zwischenname.
            let _ = std::fs::rename(&tmp, &quelle);
            ergebnisse[idx].ok = false;
            ergebnisse[idx].meldung = meldung;
        }
    }
    ergebnisse
}

/// Bilder/Videos aus dem Asset-Ordner in den Windows-Papierkorb — weg aus dem
/// Ordner, nach einem Fehlklick aber wiederholbar.
#[tauri::command]
pub fn trash_assets(asset_root: String, pfade: Vec<String>) -> Vec<AssetErgebnis> {
    let erg = trash_assets_einzeln(&asset_root, pfade);
    // Nur Ordner wirklich gelöschter Dateien — die sind geprüft (im Asset-Ordner).
    let ordner: std::collections::BTreeSet<PathBuf> = erg.iter().filter(|e| e.ok)
        .filter_map(|e| Path::new(&e.pfad).parent().map(Path::to_path_buf)).collect();
    for o in ordner { luecken_schliessen(&o); }
    erg
}

/// Die Nummern-Reihen eines Asset-Ordners lückenlos machen: Cover_1, Cover_2 …
/// in derselben Reihenfolge, Covers und Thumbnails jede für sich (26.10.2026).
/// Die Nummer heißt nur „wartet auf einen Beat" — wird Cover_1 zugewiesen
/// oder gelöscht, rutscht der Rest nach (Stephan, 18.10.2026). Den Knopf
/// „Nummerieren" plant src/lib/assetNummern.ts. Nicht nummerierte Dateien und
/// Videos bleiben, wie sie sind.
pub(crate) fn luecken_schliessen(dir: &Path) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    // (Rolle "Cover"/"Thumbnail", Nummer, Pfad, Endung)
    let mut nummeriert: Vec<(&'static str, u32, PathBuf, String)> = Vec::new();
    for p in rd.filter_map(|e| e.ok()).map(|e| e.path()).filter(|p| p.is_file()) {
        let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        if !is_image_extension(&ext) { continue; }
        let stamm = p.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
        let (rolle, rest) = if let Some(r) = stamm.strip_prefix("cover") { ("Cover", r) }
            else if let Some(r) = stamm.strip_prefix("thumbnail") { ("Thumbnail", r) }
            else if let Some(r) = stamm.strip_prefix("thumb") { ("Thumbnail", r) }
            else { continue };
        let ziffern = rest.trim_start_matches([' ', '_', '-']);
        if ziffern.is_empty() || !ziffern.chars().all(|c| c.is_ascii_digit()) { continue; }
        let Ok(nr) = ziffern.parse::<u32>() else { continue };
        nummeriert.push((rolle, nr, p, ext));
    }
    let reihe_von = |rolle: &str| {
        let mut r: Vec<u32> = nummeriert.iter().filter(|n| n.0 == rolle).map(|n| n.1).collect();
        r.sort_unstable();
        r.dedup();
        r
    };
    let (covers, thumbs) = (reihe_von("Cover"), reihe_von("Thumbnail"));
    // Aufsteigend umbenennen: das Ziel ist dann immer schon frei.
    nummeriert.sort_by_key(|n| (n.0, n.1));
    for (rolle, alt, pfad, ext) in nummeriert {
        let reihe = if rolle == "Cover" { &covers } else { &thumbs };
        let neu = reihe.iter().position(|&r| r == alt).map(|i| i as u32 + 1).unwrap_or(alt);
        let ziel = dir.join(format!("{rolle}_{neu}.{ext}"));
        if ziel == pfad { continue; }
        let selbe = ziel.to_string_lossy().eq_ignore_ascii_case(&pfad.to_string_lossy());
        if ziel.exists() && !selbe { continue; }
        let _ = std::fs::rename(&pfad, &ziel);
    }
}

pub(super) fn trash_assets_einzeln(asset_root: &str, pfade: Vec<String>) -> Vec<AssetErgebnis> {
    pfade.into_iter().map(|pfad| {
        let ergebnis = |ok: bool, meldung: String| AssetErgebnis { pfad: pfad.clone(), ok, meldung };
        match im_asset_ordner(&asset_root, &pfad) {
            Ok(p) => match trash::delete(&p) {
                Ok(()) => ergebnis(true, "im Papierkorb".into()),
                Err(e) => ergebnis(false, format!("Papierkorb fehlgeschlagen: {e}")),
            },
            Err(e) => ergebnis(false, e),
        }
    }).collect()
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
        // Cover_1 ist weg → Cover_2 rutscht auf 1 nach.
        if let Some(ordner) = src.parent() { luecken_schliessen(ordner); }
    } else {
        crate::utils::copy_and_verify(src, &dest)?;
    }

    // Ersetzen heisst ersetzen: was den Slot vorher belegt hat, geht zurück in
    // den Asset-Ordner. Vorher blieb es liegen — beide Dateien im Projekt, und
    // die Erkennung (erstes passendes Bild) blieb bei der alten.
    // Erst nach dem Einsetzen der neuen: scheitert etwas, ist nie beides weg.
    // Alte Videos braucht Stephan nie wieder: die gehen in den Papierkorb.
    if let Some(slot) = slot.as_deref() {
        if root.is_dir() {
            for alt in slot_occupants(target_dir, slot) {
                if alt == dest { continue; }
                if slot == "video" {
                    trash::delete(&alt).map_err(|e| format!("Altes Video nicht in den Papierkorb: {e}"))?;
                    continue;
                }
                let name = alt.file_name().and_then(|n| n.to_str()).unwrap_or("asset");
                let ziel = crate::utils::unique_dest(root, name);
                if std::fs::rename(&alt, &ziel).is_err() {
                    copy_and_verify_move(&alt, &ziel)?;
                }
            }
        }
    }

    Ok(dest.to_string_lossy().to_string())
}

/// Dateien im Ordner-Root, die ein Slot als seine liest — dieselbe Regel wie
/// `scan_project_dir` und `find_asset_slots`: Bild mit "thumb" = Thumbnail,
/// jedes andere Bild = Cover, jede Videodatei = Video.
pub(super) fn slot_occupants(dir: &Path, slot: &str) -> Vec<std::path::PathBuf> {
    let Ok(rd) = std::fs::read_dir(dir) else { return Vec::new() };
    rd.filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.is_file())
        .filter(|p| {
            let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("");
            let thumb = p.file_name().and_then(|n| n.to_str())
                .map(|n| n.to_lowercase().contains("thumb")).unwrap_or(false);
            match slot {
                "cover" => crate::utils::is_image_extension(ext) && !thumb,
                "thumbnail" => crate::utils::is_image_extension(ext) && thumb,
                "video" => crate::utils::is_video_extension(ext),
                _ => false,
            }
        })
        .collect()
}

/// Cover und Thumbnail unterscheiden sich im Zielordner nur am Dateinamen:
/// `find_asset_slots` (create.rs) und `scan_project_dir` (hier) lesen jedes Bild
/// mit "thumb" als Thumbnail und jedes andere als Cover. Ein Export ohne Marker
/// landet damit im Cover-Slot — auch wenn er als Thumbnail gewählt wurde. Also
/// den Marker beim Verschieben ergänzen.
///
/// Der Upload-Tab (`scan_dir_into`, upload/read.rs) ist strenger: er nimmt nur
/// Bilder mit "cover" bzw. "thumbnail" im Namen. Seit dort auch zugewiesen
/// werden kann, bekommen beide Slots den vollen Marker — dann passt der Name
/// zu allen drei Leseregeln.
pub(super) fn ensure_slot_marker(file_name: &str, slot: Option<&str>) -> String {
    let marker = match slot {
        Some("thumbnail") => "thumbnail",
        Some("cover") => "cover",
        _ => return file_name.to_string(),
    };
    let path = Path::new(file_name);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or(file_name);
    if stem.to_lowercase().contains(marker) {
        return file_name.to_string();
    }
    match path.extension().and_then(|e| e.to_str()) {
        Some(ext) => format!("{}_{}.{}", stem, marker, ext),
        None => format!("{}_{}", stem, marker),
    }
}

pub(super) fn copy_and_verify_move(src: &Path, dest: &Path) -> Result<(), String> {
    crate::utils::copy_and_verify(src, dest)?;
    std::fs::remove_file(src).map_err(|e| format!("Quelle konnte nicht entfernt werden: {}", e))
}
