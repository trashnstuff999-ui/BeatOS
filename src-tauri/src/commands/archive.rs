// src-tauri/src/commands/archive.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Archive & Scan Commands
// ═══════════════════════════════════════════════════════════════════════════════

use crate::db::{open_db, DuplicateCheckResult, ScanResult};
use crate::utils::{
    secs_to_date, file_created_secs, file_modified_secs, 
    is_audio_extension, is_image_extension
};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

// ══════════════════════════════════════════════════════════════════════════════
// ARCHIVE PATH CONSTANT
// ══════════════════════════════════════════════════════════════════════════════

const ARCHIVE_PATH: &str = r"C:\Users\kismo\OneDrive\Dokumente\._BEAT LIBRARY\03_ARCHIVE";

// ══════════════════════════════════════════════════════════════════════════════
// HELPER STRUCTS
// ══════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Serialize, Deserialize)]
pub struct ArchiveBeatParams {
    pub source_folder: String,
    pub title: String,
    pub key: Option<String>,
    pub bpm: Option<i32>,
    pub catalog_id: i32,
    pub status: String,
    pub tags: String,
    pub notes: String,
    pub source_audio_path: String,
    pub source_flp_path: String,
    pub cover_path: Option<String>,
    pub year_month: String,
    pub archive_base_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ArchiveResultFull {
    pub success: bool,
    pub archive_path: String,
    pub beat_id: String,
    pub files_copied: i32,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FixDatesResult {
    pub updated: i64,
    pub not_found: i64,
    pub no_flp: i64,
    pub errors: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct FileMetadata {
    original_path: String,
    created_at: String,
    modified_at: String,
    accessed_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct CreateDateJson {
    archived_at: String,
    source_folder: String,
    files: Vec<FileMetadata>,
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

fn file_accessed_secs(path: &Path) -> Option<u64> {
    let meta = std::fs::metadata(path).ok()?;
    let sys_time = meta.accessed().ok()?;
    Some(sys_time.duration_since(UNIX_EPOCH).ok()?.as_secs())
}

fn copy_and_verify(source: &Path, dest: &Path) -> Result<(), String> {
    std::fs::copy(source, dest)
        .map_err(|e| format!("Error copying {:?}: {}", source.file_name(), e))?;
    
    let source_size = std::fs::metadata(source)
        .map_err(|e| format!("Cannot read source metadata: {}", e))?
        .len();
    
    let dest_size = std::fs::metadata(dest)
        .map_err(|e| format!("Cannot read dest metadata: {}", e))?
        .len();
    
    if source_size != dest_size {
        let _ = std::fs::remove_file(dest);
        return Err(format!(
            "Size verification failed for {:?}: {} vs {} bytes",
            source.file_name(), source_size, dest_size
        ));
    }
    
    Ok(())
}

fn copy_dir_recursive(source: &Path, dest: &Path) -> Result<i32, String> {
    let mut count = 0;
    
    std::fs::create_dir_all(dest)
        .map_err(|e| format!("Cannot create dest folder: {}", e))?;
    
    for entry in std::fs::read_dir(source)
        .map_err(|e| format!("Cannot read source folder: {}", e))? 
    {
        let entry = entry.map_err(|e| format!("Read error: {}", e))?;
        let path = entry.path();
        let dest_path = dest.join(entry.file_name());
        
        if path.is_dir() {
            count += copy_dir_recursive(&path, &dest_path)?;
        } else {
            copy_and_verify(&path, &dest_path)?;
            count += 1;
        }
    }
    
    Ok(count)
}

fn parse_beat_folder(folder_name: &str) -> Option<(String, String, Option<String>, Option<f64>)> {
    let parts: Vec<&str> = folder_name.splitn(2, " - ").collect();
    if parts.len() < 2 { return None; }

    let id   = parts[0].trim().to_string();
    let rest = parts[1].trim();

    let (name_part, key, bpm) = if let (Some(lb), Some(rb)) = (rest.rfind('['), rest.rfind(']')) {
        if lb < rb {
            let bracket = &rest[lb+1..rb];
            let name    = rest[..lb].trim().to_string();
            let tokens: Vec<&str> = bracket.split_whitespace().collect();
            if tokens.is_empty() {
                (name, None, None)
            } else {
                let last = tokens.last().unwrap();
                let bpm_str: String = last.chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
                let bpm_val: Option<f64> = bpm_str.parse().ok();
                let key_val = if tokens.len() > 1 {
                    Some(tokens[..tokens.len()-1].join(" "))
                } else if bpm_val.is_some() {
                    None
                } else {
                    Some(tokens[0].to_string())
                };
                (name, key_val, bpm_val)
            }
        } else {
            (rest.to_string(), None, None)
        }
    } else {
        (rest.to_string(), None, None)
    };

    Some((id, name_part, key, bpm))
}

fn file_creation_date(path: &Path) -> Option<String> {
    file_created_secs(path).map(secs_to_date)
}

fn date_from_archive_path(beat_path: &Path) -> Option<String> {
    let month_dir = beat_path.parent()?;
    let year_dir  = month_dir.parent()?;

    let year_str = year_dir.file_name()?.to_str()?;
    let year: u32 = year_str.parse().ok()?;
    if year < 2000 || year > 2100 { return None; }

    let month_str = month_dir.file_name()?.to_str()?;
    let month_num: u32 = month_str
        .chars()
        .take(2)
        .collect::<String>()
        .parse()
        .ok()?;
    if !(1..=12).contains(&month_num) { return None; }

    Some(format!("{:04}-{:02}-01", year, month_num))
}

fn find_beat_in_archive(archive_path: &str, id: &str) -> Option<PathBuf> {
    let archive_dir = Path::new(archive_path);
    let year_dirs = std::fs::read_dir(archive_dir).ok()?;
    for year_entry in year_dirs.filter_map(|e| e.ok()) {
        let year_path = year_entry.path();
        if !year_path.is_dir() { continue; }
        let month_dirs = match std::fs::read_dir(&year_path) { Ok(d) => d, Err(_) => continue };
        for month_entry in month_dirs.filter_map(|e| e.ok()) {
            let month_path = month_entry.path();
            if !month_path.is_dir() { continue; }
            let beat_dirs = match std::fs::read_dir(&month_path) { Ok(d) => d, Err(_) => continue };
            for beat_entry in beat_dirs.filter_map(|e| e.ok()) {
                let beat_path = beat_entry.path();
                if !beat_path.is_dir() { continue; }
                if let Some(name) = beat_path.file_name().and_then(|n| n.to_str()) {
                    let prefix = format!("{} - ", id);
                    if name.starts_with(&prefix) || name == id {
                        return Some(beat_path);
                    }
                }
            }
        }
    }
    None
}

// ══════════════════════════════════════════════════════════════════════════════
// COMMANDS
// ══════════════════════════════════════════════════════════════════════════════

#[tauri::command]
pub fn check_beat_duplicate(
    catalog_id: i32,
    title: String,
    key: Option<String>,
    bpm: Option<i32>,
) -> Result<DuplicateCheckResult, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    
    let id_str = catalog_id.to_string();
    let id_padded = format!("{:04}", catalog_id);
    
    let existing_by_id: Option<(String, String)> = conn
        .query_row(
            "SELECT id, name FROM beats WHERE id = ?1 OR id = ?2",
            [&id_str, &id_padded],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .ok();
    
    if let Some((existing_id, existing_name)) = existing_by_id {
        return Ok(DuplicateCheckResult {
            has_duplicate: true,
            duplicate_type: Some("id".to_string()),
            existing_id: Some(existing_id),
            existing_name: Some(existing_name),
        });
    }
    
    let title_lower = title.to_lowercase();
    let key_lower = key.as_ref().map(|k| k.to_lowercase());
    
    let existing_by_combo: Option<(String, String)> = match (&key_lower, bpm) {
        (Some(k), Some(b)) => {
            conn.query_row(
                "SELECT id, name FROM beats WHERE LOWER(name) = ?1 AND LOWER(key) = ?2 AND bpm BETWEEN ?3 AND ?4",
                rusqlite::params![&title_lower, k, b - 2, b + 2],
                |row| Ok((row.get(0)?, row.get(1)?)),
            ).ok()
        },
        (Some(k), None) => {
            conn.query_row(
                "SELECT id, name FROM beats WHERE LOWER(name) = ?1 AND LOWER(key) = ?2 AND (bpm IS NULL OR bpm = '')",
                rusqlite::params![&title_lower, k],
                |row| Ok((row.get(0)?, row.get(1)?)),
            ).ok()
        },
        (None, Some(b)) => {
            conn.query_row(
                "SELECT id, name FROM beats WHERE LOWER(name) = ?1 AND (key IS NULL OR key = '') AND bpm BETWEEN ?2 AND ?3",
                rusqlite::params![&title_lower, b - 2, b + 2],
                |row| Ok((row.get(0)?, row.get(1)?)),
            ).ok()
        },
        (None, None) => {
            conn.query_row(
                "SELECT id, name FROM beats WHERE LOWER(name) = ?1 AND (key IS NULL OR key = '') AND (bpm IS NULL OR bpm = '')",
                rusqlite::params![&title_lower],
                |row| Ok((row.get(0)?, row.get(1)?)),
            ).ok()
        },
    };
    
    if let Some((existing_id, existing_name)) = existing_by_combo {
        return Ok(DuplicateCheckResult {
            has_duplicate: true,
            duplicate_type: Some("name_key_bpm".to_string()),
            existing_id: Some(existing_id),
            existing_name: Some(existing_name),
        });
    }
    
    Ok(DuplicateCheckResult {
        has_duplicate: false,
        duplicate_type: None,
        existing_id: None,
        existing_name: None,
    })
}

#[tauri::command]
pub fn archive_beat(params: ArchiveBeatParams) -> Result<ArchiveResultFull, String> {
    let source_path = Path::new(&params.source_folder);
    
    if !source_path.exists() {
        return Err(format!("Source folder doesn't exist: {}", params.source_folder));
    }
    
    let key_bpm = match (&params.key, params.bpm) {
        (Some(k), Some(b)) => format!("[{} {}]", k, b),
        (Some(k), None) => format!("[{}]", k),
        (None, Some(b)) => format!("[{}]", b),
        (None, None) => String::new(),
    };
    
    let folder_name = format!(
        "{:04} - {} {}",
        params.catalog_id,
        params.title,
        key_bpm
    ).trim().to_string();
    
    let archive_base = Path::new(&params.archive_base_path);
    let target_path = archive_base
        .join(&params.year_month)
        .join(&folder_name);
    
    if target_path.exists() {
        return Err(format!("Target folder already exists: {:?}", target_path));
    }
    
    let audio_dir = target_path.join("01_AUDIO");
    let visuals_dir = target_path.join("02_VISUALS");
    let projects_dir = target_path.join("03_PROJECTS");
    
    std::fs::create_dir_all(&audio_dir)
        .map_err(|e| format!("Cannot create 01_AUDIO: {}", e))?;
    std::fs::create_dir_all(&visuals_dir)
        .map_err(|e| format!("Cannot create 02_VISUALS: {}", e))?;
    std::fs::create_dir_all(&projects_dir)
        .map_err(|e| format!("Cannot create 03_PROJECTS: {}", e))?;
    
    let mut files_copied = 0;
    let mut file_metadata: Vec<FileMetadata> = Vec::new();
    
    let entries: Vec<_> = std::fs::read_dir(source_path)
        .map_err(|e| format!("Cannot read source folder: {}", e))?
        .filter_map(|e| e.ok())
        .collect();
    
    let selected_cover = params.cover_path.as_ref().map(|p| Path::new(p));
    
    let new_name_base = match (&params.key, params.bpm) {
        (Some(k), Some(b)) => format!("{} [{} {}]", params.title, k, b),
        (Some(k), None) => format!("{} [{}]", params.title, k),
        (None, Some(b)) => format!("{} [{}]", params.title, b),
        (None, None) => params.title.clone(),
    };
    
    let mut cover_count = 0;
    
    // External cover handling
    if let Some(cover_path_str) = &params.cover_path {
        let cover_path = Path::new(cover_path_str);
        let is_external = !cover_path.starts_with(source_path);
        
        if is_external && cover_path.exists() {
            let ext = cover_path.extension()
                .and_then(|e| e.to_str())
                .unwrap_or("png")
                .to_lowercase();
            
            let cover_name = format!("{}_COVER.{}", params.title, ext);
            let dest = visuals_dir.join(&cover_name);
            
            copy_and_verify(cover_path, &dest)?;
            files_copied += 1;
            
            let created = file_created_secs(cover_path).unwrap_or(0);
            let modified = file_modified_secs(cover_path).unwrap_or(0);
            let accessed = file_accessed_secs(cover_path).unwrap_or(0);
            
            file_metadata.push(FileMetadata {
                original_path: cover_path_str.clone(),
                created_at: secs_to_date(created),
                modified_at: secs_to_date(modified),
                accessed_at: secs_to_date(accessed),
            });
        }
    }
    
    for entry in entries {
        let path = entry.path();
        let file_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        
        let created = file_created_secs(&path).unwrap_or(0);
        let modified = file_modified_secs(&path).unwrap_or(0);
        let accessed = file_accessed_secs(&path).unwrap_or(0);
        
        file_metadata.push(FileMetadata {
            original_path: path.to_string_lossy().to_string(),
            created_at: secs_to_date(created),
            modified_at: secs_to_date(modified),
            accessed_at: secs_to_date(accessed),
        });
        
        if path.is_dir() {
            let dest = projects_dir.join(&file_name);
            files_copied += copy_dir_recursive(&path, &dest)?;
        } else {
            let ext = path.extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            
            if is_audio_extension(&ext) {
                let dest = audio_dir.join(&file_name);
                copy_and_verify(&path, &dest)?;
                files_copied += 1;
            } else if is_image_extension(&ext) {
                let is_selected_cover = selected_cover
                    .map(|c| c == path)
                    .unwrap_or(false);
                
                let has_external_cover = params.cover_path.as_ref()
                    .map(|cp| !Path::new(cp).starts_with(source_path))
                    .unwrap_or(false);
                
                let new_name = if is_selected_cover && !has_external_cover {
                    format!("{}_COVER.{}", params.title, ext)
                } else {
                    cover_count += 1;
                    format!("{}_COVER_old{}.{}", params.title, cover_count, ext)
                };
                
                let dest = visuals_dir.join(&new_name);
                copy_and_verify(&path, &dest)?;
                files_copied += 1;
            } else if ext == "flp" {
                let is_selected = path.to_string_lossy() == params.source_flp_path;
                let is_master = file_name.to_lowercase().contains("master");
                
                let new_name = if is_selected {
                    format!("{}.flp", new_name_base)
                } else if is_master {
                    format!("{}_master.flp", new_name_base)
                } else {
                    format!("{}_old.flp", new_name_base)
                };
                
                let dest = projects_dir.join(&new_name);
                copy_and_verify(&path, &dest)?;
                files_copied += 1;
            } else {
                let dest = projects_dir.join(&file_name);
                copy_and_verify(&path, &dest)?;
                files_copied += 1;
            }
        }
    }
    
    // Create create_date.json
    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    
    let create_date_json = CreateDateJson {
        archived_at: secs_to_date(now_secs),
        source_folder: params.source_folder.clone(),
        files: file_metadata,
    };
    
    let json_content = serde_json::to_string_pretty(&create_date_json)
        .map_err(|e| format!("Cannot create JSON: {}", e))?;
    
    std::fs::write(projects_dir.join("create_date.json"), json_content)
        .map_err(|e| format!("Cannot write create_date.json: {}", e))?;
    
    // Insert into database
    let conn = open_db().map_err(|e| e.to_string())?;
    
    let beat_id = format!("{:04}", params.catalog_id);
    let created_date_str = file_created_secs(Path::new(&params.source_flp_path))
        .map(secs_to_date)
        .unwrap_or_else(|| secs_to_date(now_secs));
    
    conn.execute(
        "INSERT INTO beats (id, name, path, bpm, key, status, tags, notes, created_date, modified_date) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![
            beat_id,
            params.title,
            target_path.to_string_lossy().to_string(),
            params.bpm,
            params.key,
            params.status,
            params.tags,
            params.notes,
            created_date_str,
            secs_to_date(now_secs),
        ],
    ).map_err(|e| format!("DB insert error: {}", e))?;
    
    Ok(ArchiveResultFull {
        success: true,
        archive_path: target_path.to_string_lossy().to_string(),
        beat_id,
        files_copied,
        error: None,
    })
}

#[tauri::command]
pub fn scan_archive() -> Result<ScanResult, String> {
    let conn = open_db().map_err(|e| e.to_string())?;

    let mut id_stmt = conn.prepare("SELECT id FROM beats").map_err(|e| e.to_string())?;
    let existing_ids: HashSet<String> = id_stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut found    = 0i64;
    let mut imported = 0i64;
    let mut skipped  = 0i64;
    let mut errors: Vec<String> = Vec::new();

    let archive_dir = Path::new(ARCHIVE_PATH);
    if !archive_dir.exists() {
        return Err(format!("Archive not found: {}", ARCHIVE_PATH));
    }

    for year_entry in std::fs::read_dir(archive_dir).map_err(|e| e.to_string())?.filter_map(|e| e.ok()) {
        let year_path = year_entry.path();
        if !year_path.is_dir() { continue; }

        let month_entries = match std::fs::read_dir(&year_path) {
            Ok(entries) => entries,
            Err(e) => {
                errors.push(format!("Cannot read year dir {:?}: {}", year_path, e));
                continue;
            }
        };

        for month_entry in month_entries.filter_map(|e| e.ok()) {
            let month_path = month_entry.path();
            if !month_path.is_dir() { continue; }

            let beat_entries = match std::fs::read_dir(&month_path) {
                Ok(entries) => entries,
                Err(e) => {
                    errors.push(format!("Cannot read month dir {:?}: {}", month_path, e));
                    continue;
                }
            };

            for beat_entry in beat_entries.filter_map(|e| e.ok()) {
                let beat_path = beat_entry.path();
                if !beat_path.is_dir() { continue; }

                let folder_name = match beat_path.file_name().and_then(|n| n.to_str()) {
                    Some(n) => n.to_string(), None => continue,
                };

                let (id, name, key, bpm) = match parse_beat_folder(&folder_name) {
                    Some(p) => p,
                    None => { errors.push(format!("Cannot parse: {}", folder_name)); continue; }
                };

                found += 1;
                if existing_ids.contains(&id) { skipped += 1; continue; }

                let projects_path = beat_path.join("03_PROJECTS");
                let created_date = if projects_path.exists() {
                    let mut flp_dates: Vec<(SystemTime, PathBuf)> = Vec::new();
                    if let Ok(entries) = std::fs::read_dir(&projects_path) {
                        for e in entries.filter_map(|e| e.ok()) {
                            let p = e.path();
                            if p.extension().and_then(|x| x.to_str()) == Some("flp") {
                                if let Ok(meta) = std::fs::metadata(&p) {
                                    let t = meta.created().or_else(|_| meta.modified());
                                    if let Ok(t) = t { flp_dates.push((t, p)); }
                                }
                            }
                        }
                    }
                    flp_dates.sort_by_key(|(t, _)| *t);
                    flp_dates.first().and_then(|(_, p)| file_creation_date(p))
                } else { None };

                let created_date = created_date
                    .or_else(|| file_creation_date(&beat_path))
                    .unwrap_or_default();

                let path_str = beat_path.to_string_lossy().to_string();

                match conn.execute(
                    "INSERT OR IGNORE INTO beats (id, name, path, key, bpm, status, created_date, favorite) VALUES (?1,?2,?3,?4,?5,'idea',?6,0)",
                    rusqlite::params![id, name, path_str, key.unwrap_or_default(), bpm.unwrap_or(0.0), created_date],
                ) {
                    Ok(_)  => imported += 1,
                    Err(e) => errors.push(format!("{}: {}", folder_name, e)),
                }
            }
        }
    }

    Ok(ScanResult { found, imported, skipped, errors })
}

#[tauri::command]
pub fn fix_dates() -> Result<FixDatesResult, String> {
    let conn = open_db().map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare("SELECT id, path FROM beats")
        .map_err(|e| e.to_string())?;

    struct BeatRow { id: String, path: Option<String> }
    let beats: Vec<BeatRow> = stmt
        .query_map([], |r| Ok(BeatRow {
            id:   r.get::<_, String>(0)?,
            path: r.get::<_, Option<String>>(1)?,
        }))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut updated   = 0i64;
    let mut not_found = 0i64;
    let mut no_flp    = 0i64;
    let mut errors: Vec<String> = Vec::new();

    for beat in &beats {
        let beat_path = if let Some(ref p) = beat.path {
            let p = PathBuf::from(p);
            if p.exists() { Some(p) } else { None }
        } else { None };

        let beat_path = if beat_path.is_none() {
            find_beat_in_archive(ARCHIVE_PATH, &beat.id)
        } else {
            beat_path
        };

        let beat_path = match beat_path {
            Some(p) => p,
            None => {
                not_found += 1;
                errors.push(format!("Not found: {}", beat.id));
                continue;
            }
        };

        let new_date = date_from_archive_path(&beat_path);

        let new_date = if new_date.is_none() {
            let projects_path = beat_path.join("03_PROJECTS");
            if projects_path.exists() {
                let mut flp_dates: Vec<(SystemTime, PathBuf)> = Vec::new();
                if let Ok(entries) = std::fs::read_dir(&projects_path) {
                    for e in entries.filter_map(|e| e.ok()) {
                        let p = e.path();
                        if p.extension().and_then(|x| x.to_str()) == Some("flp") {
                            if let Ok(meta) = std::fs::metadata(&p) {
                                if let Ok(t) = meta.modified() { flp_dates.push((t, p)); }
                            }
                        }
                    }
                }
                flp_dates.sort_by_key(|(t, _)| *t);
                flp_dates.first().and_then(|(_, p)| file_creation_date(p))
            } else {
                no_flp += 1;
                None
            }
        } else {
            new_date
        };

        let new_date = match new_date {
            Some(d) => d,
            None => {
                errors.push(format!("No date for: {}", beat.id));
                continue;
            }
        };

        match conn.execute(
            "UPDATE beats SET created_date = ?1 WHERE id = ?2",
            rusqlite::params![new_date, beat.id],
        ) {
            Ok(_)  => updated += 1,
            Err(e) => errors.push(format!("{}: {}", beat.id, e)),
        }
    }

    Ok(FixDatesResult { updated, not_found, no_flp, errors })
}
