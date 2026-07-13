// src-tauri/src/commands/audio.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Audio Player Commands
// Playback runs over the Tauri asset protocol (convertFileSrc) — these
// commands only resolve which file to use. The old base64 variants
// (read_audio_file, get_beat_cover_base64, get_beat_audio_for_streaming)
// were removed: they loaded whole files into RAM and had no callers.
// ═══════════════════════════════════════════════════════════════════════════════

use std::path::Path;

/// Find the best audio file to play for a beat
/// Priority: Untagged > Tagged > MP3 > Newest audio file
#[tauri::command]
pub fn get_beat_audio_path(beat_path: String) -> Result<Option<String>, String> {
    let base_path = Path::new(&beat_path);
    let audio_dir = base_path.join("01_AUDIO");

    let search_dirs = if audio_dir.exists() {
        vec![audio_dir]
    } else {
        vec![base_path.to_path_buf()]
    };

    for dir in search_dirs {
        if !dir.exists() {
            continue;
        }

        let entries: Vec<_> = match std::fs::read_dir(&dir) {
            Ok(rd) => rd.filter_map(|e| e.ok()).collect(),
            Err(_) => continue,
        };

        let audio_files: Vec<_> = entries.into_iter()
            .filter(|e| {
                let path = e.path();
                if !path.is_file() { return false; }
                if let Some(ext) = path.extension() {
                    let ext_lower = ext.to_string_lossy().to_lowercase();
                    ext_lower == "mp3" || ext_lower == "wav" || ext_lower == "flac" || ext_lower == "m4a"
                } else {
                    false
                }
            })
            .collect();

        if audio_files.is_empty() {
            continue;
        }

        // Priority 1: Untagged
        for entry in &audio_files {
            let name = entry.file_name().to_string_lossy().to_lowercase();
            if name.contains("untagged") {
                return Ok(Some(entry.path().to_string_lossy().to_string()));
            }
        }

        // Priority 2: Tagged (but not untagged)
        for entry in &audio_files {
            let name = entry.file_name().to_string_lossy().to_lowercase();
            if name.contains("tagged") && !name.contains("untagged") {
                return Ok(Some(entry.path().to_string_lossy().to_string()));
            }
        }

        // Priority 3: MP3 files first
        for entry in &audio_files {
            let path = entry.path();
            if let Some(ext) = path.extension() {
                if ext.to_string_lossy().to_lowercase() == "mp3" {
                    return Ok(Some(path.to_string_lossy().to_string()));
                }
            }
        }

        // Priority 4: Newest audio file
        let mut newest: Option<(std::fs::DirEntry, std::time::SystemTime)> = None;

        for entry in audio_files {
            if let Ok(metadata) = entry.metadata() {
                if let Ok(modified) = metadata.modified() {
                    match &newest {
                        None => newest = Some((entry, modified)),
                        Some((_, prev_time)) if modified > *prev_time => {
                            newest = Some((entry, modified));
                        }
                        _ => {}
                    }
                }
            }
        }

        if let Some((entry, _)) = newest {
            return Ok(Some(entry.path().to_string_lossy().to_string()));
        }
    }

    Ok(None)
}

/// Get cover image path for a beat.
/// Searches beat root first (new flat layout), then 02_VISUALS/ for legacy archives.
#[tauri::command]
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
