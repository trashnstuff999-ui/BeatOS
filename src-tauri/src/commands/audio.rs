// src-tauri/src/commands/audio.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Audio Player Commands
// Playback runs over the Tauri asset protocol (convertFileSrc) — these
// commands only resolve which file to use. The old base64 variants
// (read_audio_file, get_beat_cover_base64, get_beat_audio_for_streaming)
// were removed: they loaded whole files into RAM and had no callers.
// ═══════════════════════════════════════════════════════════════════════════════

use std::path::Path;
use std::time::{Duration, SystemTime};

/// Find the best audio file to play for a beat — see `waehle_audio`.
///
/// `(async)`: both commands here hit the filesystem. Without it Tauri runs a
/// sync command on the main thread, so a page of directory scans blocks the UI.
#[tauri::command(async)]
pub fn get_beat_audio_path(beat_path: String) -> Result<Option<String>, String> {
    let base_path = Path::new(&beat_path);
    let audio_dir = base_path.join("01_AUDIO");
    let dir = if audio_dir.exists() { audio_dir } else { base_path.to_path_buf() };

    let rd = match std::fs::read_dir(&dir) {
        Ok(rd) => rd,
        Err(_) => return Ok(None),
    };
    let dateien: Vec<(String, SystemTime)> = rd.filter_map(|e| e.ok())
        .filter_map(|e| {
            let path = e.path();
            let ext = path.extension()?.to_string_lossy().to_lowercase();
            if !path.is_file() || !matches!(ext.as_str(), "mp3" | "wav" | "flac" | "m4a") { return None; }
            let zeit = e.metadata().and_then(|m| m.modified()).unwrap_or(SystemTime::UNIX_EPOCH);
            Some((path.to_string_lossy().to_string(), zeit))
        })
        .collect();
    Ok(waehle_audio(&dateien))
}

/// Änderungszeit einer Datei in ms — daran erkennt die Kapitel-Karte einen
/// Export, der die alte Datei unter gleichem Namen überschrieben hat.
#[tauri::command(async)]
pub fn get_file_mtime(path: String) -> Option<u64> {
    let t = std::fs::metadata(path).and_then(|m| m.modified()).ok()?;
    Some(t.duration_since(SystemTime::UNIX_EPOCH).ok()?.as_millis() as u64)
}

/// Wie weit eine Datei hinter der neuesten liegen darf und trotzdem noch zum
/// selben Export zählt — getaggte und ungetaggte Fassung entstehen
/// nacheinander, nicht in derselben Sekunde.
const SELBER_EXPORT: Duration = Duration::from_secs(10 * 60);

/// Welche Datei der Player nimmt: die zuletzt exportierte.
///
/// Früher gewann jede Datei mit „untagged" im Namen, egal wie alt. Wer in FL
/// Studio eine neue Version unter neuem Namen exportierte, hörte im Upload-Tab
/// weiter die alte — dauerhaft, auch nach einem Neustart. Jetzt zählt zuerst
/// das Datum; untagged > tagged > mp3 entscheidet nur noch zwischen Dateien
/// desselben Exports.
fn waehle_audio(dateien: &[(String, SystemTime)]) -> Option<String> {
    let neueste = dateien.iter().map(|(_, t)| *t).max()?;
    let rang = |p: &str| {
        let n = Path::new(p).file_name()
            .map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
        if n.contains("untagged") { 0 }
        else if n.contains("tagged") { 1 }
        else if n.ends_with(".mp3") { 2 }
        else { 3 }
    };
    dateien.iter()
        .filter(|(_, t)| neueste.duration_since(*t).unwrap_or_default() <= SELBER_EXPORT)
        // Gleicher Rang → die neuere.
        .min_by_key(|(p, t)| (rang(p), std::cmp::Reverse(*t)))
        .map(|(p, _)| p.clone())
}

/// Get cover image path for a beat.
/// Searches beat root first (new flat layout), then 02_VISUALS/ for legacy archives.
#[tauri::command(async)]
pub fn get_beat_cover_path(beat_path: String) -> Result<Option<String>, String> {
    let base_path = Path::new(&beat_path);

    let mut images: Vec<std::fs::DirEntry> = Vec::new();
    for dir in [base_path.to_path_buf(), base_path.join("02_VISUALS")] {
        if !dir.exists() { continue; }
        if let Ok(rd) = std::fs::read_dir(&dir) {
            for entry in rd.filter_map(|e| e.ok()) {
                let path = entry.path();
                if !path.is_file() { continue; }
                if let Some(ext) = path.extension() {
                    let ext_lower = ext.to_string_lossy().to_lowercase();
                    if crate::utils::is_image_extension(&ext_lower) {
                        images.push(entry);
                    }
                }
            }
        }
    }

    if images.is_empty() {
        return Ok(None);
    }

    // Priority 1: file with "cover" in name
    for entry in &images {
        let name = entry.file_name().to_string_lossy().to_lowercase();
        if name.contains("cover") {
            return Ok(Some(entry.path().to_string_lossy().to_string()));
        }
    }

    // Priority 2: file with beat name in it
    if let Some(beat_folder_name) = base_path.file_name() {
        let beat_name = beat_folder_name.to_string_lossy().to_lowercase();
        let name_part = beat_name.split('[').next().unwrap_or(&beat_name).trim();
        let clean_name = if let Some(pos) = name_part.find(" - ") {
            &name_part[pos + 3..]
        } else {
            name_part
        }.trim().to_lowercase();

        for entry in &images {
            let file_name = entry.file_name().to_string_lossy().to_lowercase();
            if file_name.contains(&clean_name) {
                return Ok(Some(entry.path().to_string_lossy().to_string()));
            }
        }
    }

    // Priority 3: first image file
    Ok(Some(images[0].path().to_string_lossy().to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vor(min: u64) -> SystemTime { SystemTime::now() - Duration::from_secs(min * 60) }

    #[test]
    fn neuer_export_schlaegt_alte_untagged() {
        let d = vec![
            ("X_untagged.wav".to_string(), vor(60 * 24)),
            ("X_tagged.mp3".to_string(), vor(60 * 24)),
            ("X v2.mp3".to_string(), vor(1)),
        ];
        assert_eq!(waehle_audio(&d).as_deref(), Some("X v2.mp3"));
    }

    #[test]
    fn im_selben_export_gewinnt_untagged() {
        let d = vec![
            ("X_tagged.mp3".to_string(), vor(0)),
            ("X_untagged.wav".to_string(), vor(2)),
        ];
        assert_eq!(waehle_audio(&d).as_deref(), Some("X_untagged.wav"));
    }

    #[test]
    fn leer_ist_none() {
        assert_eq!(waehle_audio(&[]), None);
    }
}
