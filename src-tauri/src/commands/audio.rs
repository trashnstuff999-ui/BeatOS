// src-tauri/src/commands/audio.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Audio Player Commands
// ═══════════════════════════════════════════════════════════════════════════════

use crate::db::StreamingAudioInfo;
use crate::utils::audio_mime_type;
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

/// Read audio file and return as base64 data URL
#[tauri::command]
pub fn read_audio_file(file_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);
    
    if !path.exists() {
        return Err("Audio file not found".to_string());
    }
    
    let ext = path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    
    let mime_type = audio_mime_type(&ext);
    
    let data = std::fs::read(&path)
        .map_err(|e| format!("Failed to read audio file: {}", e))?;
    
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    let encoded = STANDARD.encode(&data);
    
    Ok(format!("data:{};base64,{}", mime_type, encoded))
}

/// Get cover image path for a beat
#[tauri::command]
pub fn get_beat_cover_path(beat_path: String) -> Result<Option<String>, String> {
    let base_path = Path::new(&beat_path);
    let visuals_dir = base_path.join("02_VISUALS");
    
    let search_dirs = if visuals_dir.exists() {
        vec![visuals_dir]
    } else {
        vec![base_path.to_path_buf()]
    };
    
    let image_extensions = ["jpg", "jpeg", "png", "webp", "gif"];
    
    for dir in search_dirs {
        if !dir.exists() {
            continue;
        }
        
        let entries: Vec<_> = match std::fs::read_dir(&dir) {
            Ok(rd) => rd.filter_map(|e| e.ok()).collect(),
            Err(_) => continue,
        };
        
        let images: Vec<_> = entries.into_iter()
            .filter(|e| {
                let path = e.path();
                if !path.is_file() { return false; }
                if let Some(ext) = path.extension() {
                    let ext_lower = ext.to_string_lossy().to_lowercase();
                    image_extensions.contains(&ext_lower.as_str())
                } else {
                    false
                }
            })
            .collect();
        
        if images.is_empty() {
            continue;
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
        return Ok(Some(images[0].path().to_string_lossy().to_string()));
    }
    
    Ok(None)
}

/// Get cover image as base64 data URL
#[tauri::command]
pub fn get_beat_cover_base64(beat_path: String) -> Result<Option<String>, String> {
    let base_path = Path::new(&beat_path);
    let visuals_dir = base_path.join("02_VISUALS");
    
    if !visuals_dir.exists() {
        return Ok(None);
    }
    
    let image_extensions = ["jpg", "jpeg", "png", "webp", "gif"];
    
    let entries: Vec<_> = match std::fs::read_dir(&visuals_dir) {
        Ok(rd) => rd.filter_map(|e| e.ok()).collect(),
        Err(_) => return Ok(None),
    };
    
    let images: Vec<_> = entries.into_iter()
        .filter(|e| {
            let path = e.path();
            if !path.is_file() { return false; }
            if let Some(ext) = path.extension() {
                let ext_lower = ext.to_string_lossy().to_lowercase();
                image_extensions.contains(&ext_lower.as_str())
            } else {
                false
            }
        })
        .collect();
    
    if images.is_empty() {
        return Ok(None);
    }
    
    let cover_file = images.iter()
        .find(|e| e.file_name().to_string_lossy().to_lowercase().contains("cover"))
        .or_else(|| images.first());
    
    let cover_path = match cover_file {
        Some(e) => e.path(),
        None => return Ok(None),
    };
    
    let bytes = match std::fs::read(&cover_path) {
        Ok(b) => b,
        Err(_) => return Ok(None),
    };
    
    let ext = cover_path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();
    
    let mime_type = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "image/jpeg",
    };
    
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    let encoded = STANDARD.encode(&bytes);
    
    Ok(Some(format!("data:{};base64,{}", mime_type, encoded)))
}

/// Get audio file info for streaming
#[tauri::command]
pub fn get_beat_audio_for_streaming(beat_path: String) -> Result<Option<StreamingAudioInfo>, String> {
    let base_path = Path::new(&beat_path);
    let audio_dir = base_path.join("01_AUDIO");
    
    let search_dir = if audio_dir.exists() { audio_dir } else { base_path.to_path_buf() };
    
    if !search_dir.exists() {
        return Ok(None);
    }
    
    let entries: Vec<_> = match std::fs::read_dir(&search_dir) {
        Ok(rd) => rd.filter_map(|e| e.ok()).collect(),
        Err(_) => return Ok(None),
    };
    
    let audio_files: Vec<_> = entries.into_iter()
        .filter(|e| {
            let path = e.path();
            if !path.is_file() { return false; }
            if let Some(ext) = path.extension() {
                let ext_lower = ext.to_string_lossy().to_lowercase();
                ext_lower == "mp3" || ext_lower == "wav" || ext_lower == "m4a" || ext_lower == "flac"
            } else {
                false
            }
        })
        .collect();
    
    if audio_files.is_empty() {
        return Ok(None);
    }
    
    // Priority 1: Untagged MP3
    for entry in &audio_files {
        let name = entry.file_name().to_string_lossy().to_lowercase();
        let ext = entry.path().extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        if name.contains("untagged") && ext == "mp3" {
            return Ok(Some(StreamingAudioInfo { path: entry.path().to_string_lossy().to_string(), format: "mp3".to_string() }));
        }
    }
    
    // Priority 2: Any Untagged
    for entry in &audio_files {
        let name = entry.file_name().to_string_lossy().to_lowercase();
        if name.contains("untagged") {
            let ext = entry.path().extension().and_then(|e| e.to_str()).unwrap_or("mp3").to_lowercase();
            return Ok(Some(StreamingAudioInfo { path: entry.path().to_string_lossy().to_string(), format: ext }));
        }
    }
    
    // Priority 3: Tagged MP3
    for entry in &audio_files {
        let name = entry.file_name().to_string_lossy().to_lowercase();
        let ext = entry.path().extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        if name.contains("tagged") && !name.contains("untagged") && ext == "mp3" {
            return Ok(Some(StreamingAudioInfo { path: entry.path().to_string_lossy().to_string(), format: "mp3".to_string() }));
        }
    }
    
    // Priority 4: Any MP3
    for entry in &audio_files {
        let ext = entry.path().extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        if ext == "mp3" {
            return Ok(Some(StreamingAudioInfo { path: entry.path().to_string_lossy().to_string(), format: "mp3".to_string() }));
        }
    }
    
    // Priority 5: First audio file
    let first = &audio_files[0];
    let ext = first.path().extension().and_then(|e| e.to_str()).unwrap_or("mp3").to_lowercase();
    Ok(Some(StreamingAudioInfo { path: first.path().to_string_lossy().to_string(), format: ext }))
}
