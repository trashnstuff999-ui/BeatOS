// src-tauri/src/commands/create.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Create Tab Commands
// ═══════════════════════════════════════════════════════════════════════════════

use crate::db::{open_db, AudioFileInfo, FlpFileInfo, ParsedBeatFolder};
use crate::utils::{
    secs_to_date, file_created_secs, file_modified_secs, year_month_from_secs,
    is_audio_extension, is_image_extension, image_mime_type, is_flp, flp_search_dirs,
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
    
    // Find FLP files — Ordner-Root plus die Projekt-Unterordner: Studio legt
    // neue Projekte mit der FLP in 01_SAVEFILES/ an, Altbestand in 03_PROJECTS/.
    let mut flp_entries: Vec<(u64, u64, std::path::PathBuf)> = Vec::new();

    for dir in flp_search_dirs(path) {
        for entry in std::fs::read_dir(&dir).into_iter().flatten().filter_map(|e| e.ok()) {
            let file_path = entry.path();
            if !file_path.is_file() || !is_flp(&file_path) {
                continue;
            }
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
    
    // Asset slots — cover and thumbnail are told apart by the "thumb" marker
    // in the filename (same rule as the Studio scan). Taking "the first
    // image" would show the thumbnail as cover whenever it sorts first.
    let (cover_path, thumbnail_path, video_path) = find_asset_slots(&entries);

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
        thumbnail_path,
        video_path,
        source_path: folder_path,
        suggested_id,
    })
}

/// Split the folder's visual files into (cover, thumbnail, video).
/// A file counts as thumbnail when its name contains "thumb"; every other
/// image is a cover candidate. Nothing is guessed: a folder holding only a
/// thumbnail reports no cover.
fn find_asset_slots(
    entries: &[std::fs::DirEntry],
) -> (Option<String>, Option<String>, Option<String>) {
    let mut cover: Option<String> = None;
    let mut thumbnail: Option<String> = None;
    let mut video: Option<String> = None;

    for entry in entries {
        let path = entry.path();
        if path.is_dir() {
            continue;
        }
        let ext = path.extension().and_then(|x| x.to_str()).unwrap_or("").to_lowercase();
        let name_lower = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
        let as_string = || path.to_string_lossy().to_string();

        if crate::utils::is_image_extension(&ext) {
            if name_lower.contains("thumb") {
                thumbnail.get_or_insert_with(as_string);
            } else {
                cover.get_or_insert_with(as_string);
            }
        } else if crate::utils::is_video_extension(&ext) {
            video.get_or_insert_with(as_string);
        }
    }

    (cover, thumbnail, video)
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

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::{find_asset_slots, flp_search_dirs, is_flp};

    /// FLP im Root UND FLP in 01_SAVEFILES müssen beide gefunden werden.
    #[test]
    fn findet_flp_in_root_und_savefiles() {
        let tmp = std::env::temp_dir().join(format!("beatos_flp_scan_{}", std::process::id()));
        let saves = tmp.join("01_SAVEFILES");
        std::fs::create_dir_all(&saves).unwrap();
        std::fs::write(tmp.join("root.flp"), b"x").unwrap();
        std::fs::write(saves.join("nested.flp"), b"x").unwrap();

        let mut found: Vec<String> = flp_search_dirs(&tmp)
            .iter()
            .flat_map(|d| std::fs::read_dir(d).unwrap())
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| is_flp(p))
            .map(|p| p.file_name().unwrap().to_string_lossy().to_string())
            .collect();
        found.sort();
        std::fs::remove_dir_all(&tmp).ok();
        assert_eq!(found, vec!["nested.flp", "root.flp"]);
    }

    fn entries(dir: &std::path::Path) -> Vec<std::fs::DirEntry> {
        let mut v: Vec<_> = std::fs::read_dir(dir).unwrap().filter_map(|e| e.ok()).collect();
        v.sort_by_key(|e| e.file_name());
        v
    }

    #[test]
    fn splits_cover_thumbnail_and_video() {
        let tmp = std::env::temp_dir().join(format!("beatos_slots_{}", std::process::id()));
        std::fs::create_dir_all(&tmp).unwrap();
        // Thumbnail sorts BEFORE the cover — the old "first image" rule got this wrong
        std::fs::write(tmp.join("MEMORIES_Cover_2000x2000.png"), b"png").unwrap();
        std::fs::write(tmp.join("AAA_MEMORIES_Thumbnail_1920x1080.png"), b"png").unwrap();
        std::fs::write(tmp.join("MEMORIES.mp4"), b"mp4").unwrap();

        let (cover, thumb, video) = find_asset_slots(&entries(&tmp));
        assert!(cover.as_deref().unwrap().ends_with("MEMORIES_Cover_2000x2000.png"));
        assert!(thumb.as_deref().unwrap().contains("Thumbnail"));
        assert!(video.as_deref().unwrap().ends_with("MEMORIES.mp4"));

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn thumbnail_only_leaves_cover_empty() {
        let tmp = std::env::temp_dir().join(format!("beatos_slots2_{}", std::process::id()));
        std::fs::create_dir_all(&tmp).unwrap();
        std::fs::write(tmp.join("X_Thumbnail.png"), b"png").unwrap();

        let (cover, thumb, video) = find_asset_slots(&entries(&tmp));
        assert!(cover.is_none(), "ein Thumbnail ist kein Cover");
        assert!(thumb.is_some());
        assert!(video.is_none());

        std::fs::remove_dir_all(&tmp).unwrap();
    }
}


// ─────────────────────────────────────────────────────────────────────────────
// Übergabe-Ordner
// ─────────────────────────────────────────────────────────────────────────────

/// Ein Ordner im Übergabe-Verzeichnis, der ein Beat sein könnte.
#[derive(Debug, serde::Serialize)]
pub struct ImportFolder {
    pub name: String,
    pub path: String,
    pub modified_at: String,
    /// Enthält mindestens eine Audiodatei — ohne die ist es kein Beat-Ordner
    pub has_audio: bool,
    pub file_count: usize,
}

/// Listet die Unterordner des Übergabe-Verzeichnisses, neueste zuerst.
///
/// Gedacht für den Weg über einen Zwischenspeicher: Beat auf der anderen
/// Maschine fertig, als Ordner herübergeschoben, hier eingepflegt. Vorher
/// musste man den Ordner jedes Mal im Dateidialog suchen.
///
/// Nur eine Ebene tief — verschachtelte Ablagen sind hier nicht der Fall, und
/// ein rekursiver Lauf über ein Downloads-Verzeichnis wäre spürbar langsam.
#[tauri::command(async)]
pub fn list_import_folders(import_path: String) -> Result<Vec<ImportFolder>, String> {
    let root = Path::new(import_path.trim());
    if import_path.trim().is_empty() {
        return Ok(Vec::new());
    }
    if !root.is_dir() {
        return Err(format!("Übergabe-Ordner nicht gefunden: {}", import_path));
    }

    let mut out: Vec<(u64, ImportFolder)> = Vec::new();

    for entry in std::fs::read_dir(root).map_err(|e| e.to_string())?.filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else { continue };

        let mut has_audio = false;
        let mut file_count = 0usize;
        for f in std::fs::read_dir(&path).into_iter().flatten().filter_map(|f| f.ok()) {
            let fp = f.path();
            if !fp.is_file() {
                continue;
            }
            file_count += 1;
            let ext = fp.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
            if is_audio_extension(&ext) {
                has_audio = true;
            }
        }

        let secs = file_modified_secs(&path).unwrap_or(0);
        out.push((secs, ImportFolder {
            name: name.to_string(),
            path: path.to_string_lossy().to_string(),
            modified_at: secs_to_date(secs),
            has_audio,
            file_count,
        }));
    }

    out.sort_by(|a, b| b.0.cmp(&a.0));
    // Ein Downloads-Ordner kann hunderte Einträge haben; die Liste soll eine
    // Auswahl sein, kein Dateibrowser.
    Ok(out.into_iter().take(30).map(|(_, f)| f).collect())
}
