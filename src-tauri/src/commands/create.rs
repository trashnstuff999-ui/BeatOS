// src-tauri/src/commands/create.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Create Tab Commands
// ═══════════════════════════════════════════════════════════════════════════════

use crate::db::{open_db, AudioFileInfo, FlpFileInfo, ParsedBeatFolder};
use crate::utils::{
    secs_to_date, file_created_secs, file_modified_secs, year_month_from_secs,
    is_audio_extension, is_image_extension, image_mime_type,
    parse_audio_filename,
};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// Get next available beat ID (MAX + 1)
#[tauri::command]
pub fn get_next_beat_id() -> Result<i32, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    
    let max_id: Option<i64> = conn
        .query_row(
            "SELECT MAX(CAST(id AS INTEGER)) FROM beats",
            [],
            |row| row.get(0),
        )
        .ok();
    
    let next_id = max_id.map(|m| m as i32 + 1).unwrap_or(1);
    
    Ok(next_id)
}

/// Parse a beat folder and extract all relevant metadata
#[tauri::command]
pub fn parse_beat_folder_for_create(folder_path: String) -> Result<ParsedBeatFolder, String> {
    let path = Path::new(&folder_path);
    
    if !path.exists() {
        return Err(format!("Folder doesn't exist: {}", folder_path));
    }
    if !path.is_dir() {
        return Err(format!("Path is not a folder: {}", folder_path));
    }
    
    // Collect all files in root
    let entries: Vec<_> = std::fs::read_dir(path)
        .map_err(|e| format!("Cannot read folder: {}", e))?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file())
        .collect();
    
    let all_files: Vec<String> = entries
        .iter()
        .filter_map(|e| e.file_name().to_str().map(|s| s.to_string()))
        .collect();
    
    // Find audio files
    let mut audio_files: Vec<AudioFileInfo> = Vec::new();
    
    for entry in &entries {
        let file_path = entry.path();
        let file_name = match file_path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        
        let extension = file_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        
        if !is_audio_extension(&extension) {
            continue;
        }
        
        let meta = std::fs::metadata(&file_path).ok();
        let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
        let modified_secs = file_modified_secs(&file_path).unwrap_or(0);
        let modified_at = secs_to_date(modified_secs);
        
        let is_untagged = file_name.to_lowercase().contains("_untagged");
        
        audio_files.push(AudioFileInfo {
            path: file_path.to_string_lossy().to_string(),
            name: file_name,
            extension,
            size,
            modified_at,
            is_untagged,
        });
    }
    
    // Sort: _untagged first, then by mtime (newest first)
    audio_files.sort_by(|a, b| {
        match (a.is_untagged, b.is_untagged) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => {
                let a_secs = file_modified_secs(Path::new(&a.path)).unwrap_or(0);
                let b_secs = file_modified_secs(Path::new(&b.path)).unwrap_or(0);
                b_secs.cmp(&a_secs)
            }
        }
    });
    
    // Parse name/key/bpm from first audio file
    let (name, key, bpm) = audio_files
        .first()
        .map(|f| parse_audio_filename(&f.name))
        .unwrap_or_else(|| {
            let folder_name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("Unknown Beat")
                .to_string();
            (folder_name, None, None)
        });
    
    // Find FLP files
    let mut flp_entries: Vec<(u64, u64, std::path::PathBuf)> = Vec::new();
    
    for entry in &entries {
        let file_path = entry.path();
        if file_path.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()) == Some("flp".to_string()) {
            let created_secs = file_created_secs(&file_path).unwrap_or(0);
            let modified_secs = file_modified_secs(&file_path).unwrap_or(0);
            flp_entries.push((created_secs, modified_secs, file_path));
        }
    }
    
    // Sort by modified_at (newest first)
    flp_entries.sort_by(|a, b| b.1.cmp(&a.1));
    
    let newest_modified = flp_entries.first().map(|(_, m, _)| *m).unwrap_or(0);
    
    let flp_files: Vec<FlpFileInfo> = flp_entries
        .iter()
        .map(|(created_secs, modified_secs, flp_path)| {
            let file_name = flp_path.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown.flp")
                .to_string();
            
            let meta = std::fs::metadata(flp_path).ok();
            let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
            
            let is_master = file_name.to_lowercase().contains("master");
            let is_newest = *modified_secs == newest_modified;
            
            FlpFileInfo {
                path: flp_path.to_string_lossy().to_string(),
                name: file_name,
                size,
                modified_at: secs_to_date(*modified_secs),
                created_at: secs_to_date(*created_secs),
                is_master,
                is_newest,
            }
        })
        .collect();
    
    // Oldest FLP for created_date
    let mut flp_by_created = flp_entries.clone();
    flp_by_created.sort_by_key(|(created, _, _)| *created);
    
    let (flp_path, created_date, year_month) = if let Some((secs, _, flp)) = flp_by_created.first() {
        (
            Some(flp.to_string_lossy().to_string()),
            Some(secs_to_date(*secs)),
            year_month_from_secs(*secs),
        )
    } else {
        let now_secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        (None, None, year_month_from_secs(now_secs))
    };
    
    // Find cover PNG
    let cover_path = entries
        .iter()
        .find(|e| {
            let ext = e.path()
                .extension()
                .and_then(|x| x.to_str())
                .unwrap_or("")
                .to_lowercase();
            ext == "png"
        })
        .map(|e| e.path().to_string_lossy().to_string());
    
    // Get next beat ID
    let suggested_id = get_next_beat_id().unwrap_or(1);
    
    Ok(ParsedBeatFolder {
        name,
        key,
        bpm,
        flp_path,
        flp_files,
        created_date,
        year_month,
        audio_files,
        all_files,
        cover_path,
        source_path: folder_path,
        suggested_id,
    })
}

/// Read an image file and return as base64 data URL
#[tauri::command]
pub fn read_image_file(file_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);
    
    if !path.exists() {
        return Err(format!("File doesn't exist: {}", file_path));
    }
    
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();
    
    if !is_image_extension(&extension) {
        return Err(format!("Not an image file: {}", file_path));
    }
    
    let mime_type = image_mime_type(&extension);
    
    let bytes = std::fs::read(path)
        .map_err(|e| format!("Cannot read file: {}", e))?;
    
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    let encoded = STANDARD.encode(&bytes);
    
    Ok(format!("data:{};base64,{}", mime_type, encoded))
}
