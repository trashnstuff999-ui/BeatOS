// src-tauri/src/commands/archive.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Archive & Scan Commands
// ═══════════════════════════════════════════════════════════════════════════════

use crate::db::{open_db, DuplicateCheckResult, ScanResult};
use crate::utils::{
    secs_to_date, file_created_secs, file_modified_secs, file_creation_date,
    oldest_flp_date, parse_beat_folder,
    is_audio_extension, is_image_extension, is_video_extension, unique_dest,
};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

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
    pub year_month: String,
    pub archive_base_path: String,
    /// Apply the filename convention right after archiving (default: true).
    #[serde(default = "default_true")]
    pub auto_rename: bool,
    // Optional type-beat info (from a preset picked in the Create flow) —
    // lands directly on the beats row so the Upload tab starts "Infos ✓".
    #[serde(default)]
    pub type_beat_main: Option<String>,
    #[serde(default)]
    pub type_beat_also_fits: Option<String>,
    #[serde(default)]
    pub genre_tags: Option<String>,
    #[serde(default)]
    pub youtube_tags: Option<String>,
    #[serde(default)]
    pub soundcloud_tags: Option<String>,
}

fn default_true() -> bool {
    true
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

/// Resolve the FLP subdirectory of a beat: `01_SAVEFILES/` (current) takes
/// precedence over `03_PROJECTS/` (legacy). Returns None if neither exists.
fn flp_subdir(beat_root: &Path) -> Option<PathBuf> {
    let candidates = [
        beat_root.join("01_SAVEFILES"),
        beat_root.join("03_PROJECTS"),
    ];
    candidates.into_iter().find(|p| p.is_dir())
}

use crate::utils::copy_and_verify;

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

/// Detect whether a beat folder contains artwork (image) / video files.
/// Checks the flat root and the legacy 02_VISUALS/ subfolder.
fn detect_assets(beat_root: &Path) -> (bool, bool) {
    let mut has_artwork = false;
    let mut has_video = false;
    for dir in [beat_root.to_path_buf(), beat_root.join("02_VISUALS")] {
        let Ok(rd) = std::fs::read_dir(&dir) else { continue };
        for e in rd.filter_map(|e| e.ok()) {
            let p = e.path();
            if !p.is_file() { continue; }
            let ext = p.extension().and_then(|x| x.to_str()).unwrap_or("").to_lowercase();
            if is_image_extension(&ext) { has_artwork = true; }
            if is_video_extension(&ext) { has_video = true; }
        }
    }
    (has_artwork, has_video)
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

/// Single source of truth for the archive folder name. Used by the real
/// archive step and by the live preview in the Create tab, so the preview
/// can never diverge from what actually lands on disk.
pub(crate) fn build_archive_folder_name(
    catalog_id: i32,
    title: &str,
    key: Option<&str>,
    bpm: Option<i32>,
) -> String {
    let key_bpm = match (key, bpm) {
        (Some(k), Some(b)) => format!("[{} {}]", k, b),
        (Some(k), None) => format!("[{}]", k),
        (None, Some(b)) => format!("[{}]", b),
        (None, None) => String::new(),
    };
    // Titles come from user input / parsed filenames — strip anything Windows
    // refuses in a folder name before building the path.
    let safe_title = crate::utils::sanitize_filename_part(title);
    crate::utils::sanitize_filename_part(
        format!("{:04} - {} {}", catalog_id, safe_title, key_bpm).trim(),
    )
}

/// Move the source folder of a just-archived beat to the recycle bin.
/// Opt-in only (dialog after successful archive) — never called automatically.
#[tauri::command]
pub fn trash_source_folder(source_folder: String, archive_base_path: String) -> Result<(), String> {
    let src = Path::new(&source_folder);
    if !src.exists() || !src.is_dir() {
        return Err(format!("Quellordner nicht gefunden: {}", source_folder));
    }
    // Never trash a drive root / degenerate path
    if src.parent().is_none() || source_folder.trim().len() < 8 {
        return Err("Sicherheitsstopp: Pfad zu kurz oder Laufwerks-Root".to_string());
    }
    // Never trash anything inside (or equal to) the archive itself
    if !archive_base_path.trim().is_empty() {
        if let (Ok(canon_src), Ok(canon_archive)) =
            (src.canonicalize(), Path::new(&archive_base_path).canonicalize())
        {
            if canon_src.starts_with(&canon_archive) {
                return Err("Sicherheitsstopp: Quellordner liegt im Archiv".to_string());
            }
        }
    }
    trash::delete(src).map_err(|e| format!("Papierkorb fehlgeschlagen: {}", e))
}

/// Relative archive path preview for the Create tab (e.g.
/// "2026/07_JULY/0042 - Dark Nights [Am 140]").
#[tauri::command]
pub fn preview_archive_path(
    catalog_id: i32,
    title: String,
    key: Option<String>,
    bpm: Option<i32>,
    year_month: String,
) -> Result<String, String> {
    let folder = build_archive_folder_name(catalog_id, &title, key.as_deref(), bpm);
    Ok(format!("{}/{}", year_month, folder))
}

#[tauri::command]
pub async fn archive_beat(params: ArchiveBeatParams) -> Result<ArchiveResultFull, String> {
    // Copying whole beat folders is heavy I/O — keep it off the IPC thread.
    tauri::async_runtime::spawn_blocking(move || archive_beat_blocking(params))
        .await
        .map_err(|e| format!("Archive task panicked: {}", e))?
}

fn archive_beat_blocking(params: ArchiveBeatParams) -> Result<ArchiveResultFull, String> {
    let source_path = Path::new(&params.source_folder);
    
    if !source_path.exists() {
        return Err(format!("Source folder doesn't exist: {}", params.source_folder));
    }
    
    let folder_name = build_archive_folder_name(
        params.catalog_id,
        &params.title,
        params.key.as_deref(),
        params.bpm,
    );

    let archive_base = Path::new(&params.archive_base_path);
    let target_path = archive_base
        .join(&params.year_month)
        .join(&folder_name);

    if target_path.exists() {
        return Err(format!("Target folder already exists: {:?}", target_path));
    }

    let savefiles_dir = target_path.join("01_SAVEFILES");

    // Everything from here on creates state on disk. If any step fails, the
    // half-written target folder is removed so no orphan archive remains.
    let result = archive_beat_inner(&params, source_path, &target_path, &savefiles_dir);
    if result.is_err() {
        let _ = std::fs::remove_dir_all(&target_path);
    }
    result
}

fn archive_beat_inner(
    params: &ArchiveBeatParams,
    source_path: &Path,
    target_path: &Path,
    savefiles_dir: &Path,
) -> Result<ArchiveResultFull, String> {
    std::fs::create_dir_all(target_path)
        .map_err(|e| format!("Cannot create target folder: {}", e))?;
    std::fs::create_dir_all(savefiles_dir)
        .map_err(|e| format!("Cannot create 01_SAVEFILES: {}", e))?;

    let mut files_copied = 0;
    let mut file_metadata: Vec<FileMetadata> = Vec::new();

    let entries: Vec<_> = std::fs::read_dir(source_path)
        .map_err(|e| format!("Cannot read source folder: {}", e))?
        .filter_map(|e| e.ok())
        .collect();

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
            // Quellordner, die schon das Layout benutzen (01_SAVEFILES/ bzw.
            // alt 03_PROJECTS/), werden in das Ziel-01_SAVEFILES gemischt —
            // sonst landet die FLP in 01_SAVEFILES/01_SAVEFILES/.
            let dest = if file_name.eq_ignore_ascii_case("01_SAVEFILES")
                || file_name.eq_ignore_ascii_case("03_PROJECTS")
            {
                savefiles_dir.to_path_buf()
            } else {
                unique_dest(savefiles_dir, &file_name)
            };
            files_copied += copy_dir_recursive(&path, &dest)?;
        } else {
            let ext = path.extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();

            // Flat layout:
            //   audio / video / image  -> beat root, original name
            //   flp / everything else  -> 01_SAVEFILES/, original name
            // No renaming happens here; that's the job of the convert tool.
            let dest_dir = if is_audio_extension(&ext)
                || is_video_extension(&ext)
                || is_image_extension(&ext)
            {
                &target_path
            } else {
                &savefiles_dir
            };

            let dest = unique_dest(dest_dir, &file_name);
            copy_and_verify(&path, &dest)?;
            files_copied += 1;
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
    
    std::fs::write(savefiles_dir.join("create_date.json"), json_content)
        .map_err(|e| format!("Cannot write create_date.json: {}", e))?;
    
    // Insert into database (transaction; on failure the caller removes the
    // copied folder so DB and filesystem stay consistent)
    let mut conn = open_db().map_err(|e| e.to_string())?;

    let beat_id = format!("{:04}", params.catalog_id);
    let created_date_str = file_created_secs(Path::new(&params.source_flp_path))
        .map(secs_to_date)
        .unwrap_or_else(|| secs_to_date(now_secs));

    let (has_artwork, has_video) = detect_assets(target_path);

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO beats (id, name, path, bpm, key, status, tags, notes, created_date, modified_date, has_artwork, has_video,
                            type_beat_main, type_beat_also_fits, genre_tags, youtube_tags, soundcloud_tags)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
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
            has_artwork as i32,
            has_video as i32,
            params.type_beat_main,
            params.type_beat_also_fits,
            params.genre_tags,
            params.youtube_tags,
            params.soundcloud_tags,
        ],
    ).map_err(|e| format!("DB insert error: {}", e))?;
    tx.commit().map_err(|e| format!("DB commit error: {}", e))?;

    // Auto-rename: apply the same filename convention as the Upload-tab
    // "Convert filenames" tool, so the asset checklist is green immediately.
    // A rename problem never fails the archive — it is reported as warning.
    let mut warning: Option<String> = None;
    if params.auto_rename {
        match crate::commands::apply_filename_convention(beat_id.clone()) {
            Ok(r) if r.errors.is_empty() => {}
            Ok(r) => warning = Some(format!("Auto-Rename mit Fehlern: {}", r.errors.join("; "))),
            Err(e) => warning = Some(format!("Auto-Rename fehlgeschlagen: {}", e)),
        }
    } else {
        // Ohne Auto-Rename bleiben die Originalnamen — aber im Root soll trotzdem
        // nur die neueste MP3/WAV liegen, der Rest wandert nach 02_OLD/.
        crate::commands::sweep_old_audio(target_path);
    }

    // Refresh the OneDrive snapshot in the background after a successful write.
    std::thread::spawn(|| {
        if let Err(e) = crate::db::backup_db() {
            eprintln!("WARNING: DB backup failed: {}", e);
        }
    });

    Ok(ArchiveResultFull {
        success: true,
        archive_path: target_path.to_string_lossy().to_string(),
        beat_id,
        files_copied,
        error: warning,
    })
}

#[tauri::command]
pub async fn scan_archive(archive_base_path: String) -> Result<ScanResult, String> {
    tauri::async_runtime::spawn_blocking(move || scan_archive_blocking(&archive_base_path))
        .await
        .map_err(|e| format!("Scan task panicked: {}", e))?
}

fn scan_archive_blocking(archive_base_path: &str) -> Result<ScanResult, String> {
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

    let archive_dir = Path::new(archive_base_path);
    if archive_base_path.trim().is_empty() || !archive_dir.exists() {
        return Err(format!(
            "Archive not found: '{}' — bitte Archive Path in den Settings setzen",
            archive_base_path
        ));
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

                // FLPs live in 01_SAVEFILES/ (new) or 03_PROJECTS/ (legacy).
                let created_date = flp_subdir(&beat_path)
                    .and_then(|dir| oldest_flp_date(&dir))
                    .or_else(|| file_creation_date(&beat_path))
                    .unwrap_or_default();

                let path_str = beat_path.to_string_lossy().to_string();
                let (has_artwork, has_video) = detect_assets(&beat_path);

                // key/bpm stay NULL when unknown — 0.0/'' would poison
                // BPM range filters.
                match conn.execute(
                    "INSERT OR IGNORE INTO beats (id, name, path, key, bpm, status, created_date, favorite, has_artwork, has_video)
                     VALUES (?1,?2,?3,?4,?5,'idea',?6,0,?7,?8)",
                    rusqlite::params![id, name, path_str, key, bpm, created_date, has_artwork as i32, has_video as i32],
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
pub async fn fix_dates(archive_base_path: String) -> Result<FixDatesResult, String> {
    tauri::async_runtime::spawn_blocking(move || fix_dates_blocking(&archive_base_path))
        .await
        .map_err(|e| format!("Fix-dates task panicked: {}", e))?
}

fn fix_dates_blocking(archive_base_path: &str) -> Result<FixDatesResult, String> {
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
            find_beat_in_archive(archive_base_path, &beat.id)
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

        // Backfill has_artwork / has_video while we already have the folder
        // resolved — keeps Browse/Checklist consistent with the filesystem.
        let (has_artwork, has_video) = detect_assets(&beat_path);
        if let Err(e) = conn.execute(
            "UPDATE beats SET has_artwork = ?1, has_video = ?2 WHERE id = ?3",
            rusqlite::params![has_artwork as i32, has_video as i32, beat.id],
        ) {
            errors.push(format!("{}: asset backfill failed: {}", beat.id, e));
        }

        let new_date = date_from_archive_path(&beat_path);

        let new_date = if new_date.is_none() {
            // FLPs live in 01_SAVEFILES/ (new) or 03_PROJECTS/ (legacy).
            match flp_subdir(&beat_path) {
                Some(dir) => oldest_flp_date(&dir),
                None => {
                    no_flp += 1;
                    None
                }
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
