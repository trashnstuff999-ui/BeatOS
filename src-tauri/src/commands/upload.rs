// src-tauri/src/commands/upload.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Upload Tab — backend commands
//
// Phase A: template bootstrap (`ensure_default_templates`, `get_templates_dir`,
//          `read_template`).
// Phase B: read-side commands for the Upload UI (`get_upload_data`).
// ═══════════════════════════════════════════════════════════════════════════════

use crate::db::open_db;
use crate::utils::is_image_extension;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const PLATFORMS: [&str; 3] = ["beatstars", "soundcloud", "youtube"];
const VALID_STATUSES: [&str; 3] = ["draft", "scheduled", "uploaded"];
const SOUNDCLOUD_TAG_LIMIT: usize = 9;

const TEMPLATE_FILES: &[(&str, &str)] = &[
    ("beatstars.template", DEFAULT_BEATSTARS),
    ("soundcloud.template", DEFAULT_SOUNDCLOUD),
    ("youtube.template", DEFAULT_YOUTUBE),
];

/// Get the templates directory inside the app's data dir.
/// e.g. on Windows: %APPDATA%\com.beatos.app\templates\
pub fn templates_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app_data_dir: {}", e))?;
    Ok(base.join("templates"))
}

/// Ensure each default template exists on disk. Never overwrites — if a file
/// is already there (user has edited it), it is left untouched.
pub fn ensure_default_templates(app: &AppHandle) -> Result<(), String> {
    let dir = templates_dir(app)?;
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create templates dir {:?}: {}", dir, e))?;

    for (name, contents) in TEMPLATE_FILES {
        let path = dir.join(name);
        if !path.exists() {
            fs::write(&path, contents)
                .map_err(|e| format!("Failed to write default template {:?}: {}", path, e))?;
        }
    }
    Ok(())
}

/// Tauri command: returns the absolute path to the templates folder.
/// Used by the Upload tab "Edit Templates" button to reveal it in Explorer.
#[tauri::command]
pub fn get_templates_dir(app: AppHandle) -> Result<String, String> {
    let dir = templates_dir(&app)?;
    Ok(dir.to_string_lossy().to_string())
}

/// Tauri command: read a single template's current contents.
/// Phase B+ will use this for live preview rendering.
#[tauri::command]
pub fn read_template(app: AppHandle, name: String) -> Result<String, String> {
    let dir = templates_dir(&app)?;
    // Defense-in-depth: reject path-traversal attempts.
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err(format!("Invalid template name: {}", name));
    }
    let path: &Path = &dir.join(&name);
    fs::read_to_string(path)
        .map_err(|e| format!("Failed to read template {:?}: {}", path, e))
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase B — get_upload_data
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Serialize)]
pub struct UploadBeatInfo {
    pub id: String,
    pub name: String,
    pub path: String,
    pub bpm: Option<f64>,
    pub key: Option<String>,
    pub type_beat_main: Option<String>,
    pub type_beat_also_fits: Option<String>,
    pub genre_tags: Option<String>,
    pub youtube_tags: Option<String>,
    pub soundcloud_tags: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct UploadFilesState {
    pub beatstars_txt: bool,
    pub soundcloud_txt: bool,
    pub youtube_txt: bool,
}

#[derive(Debug, Serialize)]
pub struct AssetCheck {
    pub mp3: Option<String>,
    pub wav: Option<String>,
    pub flp: Option<String>,
    pub cover: Option<String>,
    pub thumbnail: Option<String>,
    pub video: Option<String>,
    pub upload_files: UploadFilesState,
}

#[derive(Debug, Serialize)]
pub struct UploadPlatformRow {
    pub platform: String,
    pub status: String,
    pub scheduled_at: Option<String>,
    pub uploaded_at: Option<String>,
    pub url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct UploadData {
    pub beat: UploadBeatInfo,
    pub assets: AssetCheck,
    pub uploads: Vec<UploadPlatformRow>,
}

/// Load everything the Upload tab needs for a given beat:
///   • core metadata + type-beat fields (from `beats`)
///   • upload-platform statuses (from `beat_uploads`, with default drafts for missing platforms)
///   • asset detection (filesystem scan of the beat folder)
#[tauri::command]
pub fn get_upload_data(beat_id: String) -> Result<UploadData, String> {
    let conn = open_db().map_err(|e| e.to_string())?;

    // ─── Beat metadata ───────────────────────────────────────────────────
    let beat = conn.query_row(
        "SELECT id, name, path, bpm, key,
                type_beat_main, type_beat_also_fits, genre_tags,
                youtube_tags, soundcloud_tags
         FROM beats WHERE id = ?1",
        rusqlite::params![beat_id],
        |row| {
            Ok(UploadBeatInfo {
                id:                  row.get(0)?,
                name:                row.get(1)?,
                path:                row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                bpm:                 row.get(3).ok(),
                key:                 row.get(4).ok(),
                type_beat_main:      row.get(5).ok(),
                type_beat_also_fits: row.get(6).ok(),
                genre_tags:          row.get(7).ok(),
                youtube_tags:        row.get(8).ok(),
                soundcloud_tags:     row.get(9).ok(),
            })
        },
    ).map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => format!("Beat {} not found", beat_id),
        _ => format!("DB lookup failed: {}", e),
    })?;

    // ─── Uploads (fill missing platforms with default drafts) ───────────
    let mut stmt = conn.prepare(
        "SELECT platform, status, scheduled_at, uploaded_at, url
         FROM beat_uploads WHERE beat_id = ?1"
    ).map_err(|e| e.to_string())?;

    let existing: Vec<UploadPlatformRow> = stmt
        .query_map(rusqlite::params![beat_id], |row| {
            Ok(UploadPlatformRow {
                platform:     row.get(0)?,
                status:       row.get(1)?,
                scheduled_at: row.get(2).ok(),
                uploaded_at:  row.get(3).ok(),
                url:          row.get(4).ok(),
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let uploads: Vec<UploadPlatformRow> = PLATFORMS.iter()
        .map(|platform| {
            existing.iter()
                .find(|row| row.platform == *platform)
                .map(|row| UploadPlatformRow {
                    platform: row.platform.clone(),
                    status: row.status.clone(),
                    scheduled_at: row.scheduled_at.clone(),
                    uploaded_at: row.uploaded_at.clone(),
                    url: row.url.clone(),
                })
                .unwrap_or_else(|| UploadPlatformRow {
                    platform: platform.to_string(),
                    status: "draft".to_string(),
                    scheduled_at: None,
                    uploaded_at: None,
                    url: None,
                })
        })
        .collect();

    // ─── Asset detection (filesystem scan) ───────────────────────────────
    let assets = scan_beat_assets(Path::new(&beat.path));

    Ok(UploadData { beat, assets, uploads })
}

/// Pure helper: classify what's inside a beat folder.
/// Returns empty asset slots gracefully when the folder doesn't exist
/// (rather than erroring — the user can still see the beat row and
/// the missing-folder state is implicit in all-None assets).
///
/// Layouts handled:
///   • new flat: everything in beat root, FLP in 01_SAVEFILES/
///   • legacy:   audio in 01_AUDIO/, visuals in 02_VISUALS/, FLP in 03_PROJECTS/
/// Root wins on collisions — `scan_dir_into` only fills slots that are still None.
fn scan_beat_assets(beat_root: &Path) -> AssetCheck {
    let mut out = AssetCheck {
        mp3: None, wav: None, flp: None,
        cover: None, thumbnail: None, video: None,
        upload_files: UploadFilesState {
            beatstars_txt: false,
            soundcloud_txt: false,
            youtube_txt: false,
        },
    };

    if !beat_root.exists() || !beat_root.is_dir() {
        return out;
    }

    // Pass 1 — flat layout (beat root).
    scan_dir_into(beat_root, &mut out);

    // Pass 2 — legacy 01_AUDIO/ if audio slots still empty.
    if out.mp3.is_none() || out.wav.is_none() {
        let audio_dir = beat_root.join("01_AUDIO");
        if audio_dir.is_dir() {
            scan_dir_into(&audio_dir, &mut out);
        }
    }

    // Pass 3 — legacy 02_VISUALS/ if any visual slot still empty.
    if out.cover.is_none() || out.thumbnail.is_none() || out.video.is_none() {
        let visuals_dir = beat_root.join("02_VISUALS");
        if visuals_dir.is_dir() {
            scan_dir_into(&visuals_dir, &mut out);
        }
    }

    // FLP lives in 01_SAVEFILES/ (new) or 03_PROJECTS/ (legacy).
    // Try new layout first, fall back to legacy.
    for subdir_name in ["01_SAVEFILES", "03_PROJECTS"] {
        if out.flp.is_some() { break; }
        let dir = beat_root.join(subdir_name);
        if !dir.is_dir() { continue; }
        if let Ok(rd) = fs::read_dir(&dir) {
            for entry in rd.filter_map(|e| e.ok()) {
                let path = entry.path();
                if !path.is_file() { continue; }
                if path.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()) == Some("flp".into()) {
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        out.flp = Some(name.to_string());
                        break;
                    }
                }
            }
        }
    }

    // Description files: live in the beat root with the new layout. For
    // backward compat with beats that still have a legacy 04_UPLOAD/ folder
    // we OR in the legacy location — a true on either side means "found".
    let legacy_dir = beat_root.join("04_UPLOAD");
    let exists_any = |name: &str| {
        beat_root.join(name).exists() || legacy_dir.join(name).exists()
    };
    out.upload_files.beatstars_txt  = exists_any("beatstars.txt");
    out.upload_files.soundcloud_txt = exists_any("soundcloud.txt");
    out.upload_files.youtube_txt    = exists_any("youtube.txt");

    out
}

/// Scan a single directory and fill any still-empty audio / video / image
/// slots on `out`. Existing values are preserved (first call wins).
fn scan_dir_into(dir: &Path, out: &mut AssetCheck) {
    let rd = match fs::read_dir(dir) {
        Ok(rd) => rd,
        Err(_) => return,
    };

    let mut images: Vec<(String, String)> = Vec::new(); // (filename, name_lowercase)

    for entry in rd.filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_file() { continue; }
        let file_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        let ext = path.extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        match ext.as_str() {
            "mp3" if out.mp3.is_none()   => out.mp3   = Some(file_name),
            "wav" if out.wav.is_none()   => out.wav   = Some(file_name),
            "mp4" if out.video.is_none() => out.video = Some(file_name),
            _ if is_image_extension(&ext) => {
                let lower = file_name.to_lowercase();
                images.push((file_name, lower));
            }
            _ => {}
        }
    }

    // Thumbnail wins over cover for the same file (e.g. "weightless_thumbnail.png"
    // shouldn't double-fill the cover slot).
    if out.thumbnail.is_none() {
        if let Some((name, _)) = images.iter().find(|(_, l)| l.contains("thumbnail")) {
            out.thumbnail = Some(name.clone());
        }
    }
    if out.cover.is_none() {
        if let Some((name, _)) = images.iter().find(|(name, l)| {
            l.contains("cover") && Some(name) != out.thumbnail.as_ref()
        }) {
            out.cover = Some(name.clone());
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase C — write commands (type-beat info, upload status, presets)
// ═══════════════════════════════════════════════════════════════════════════════

/// Update the five Upload-tab type-beat fields on the beats row.
/// Empty strings are stored as NULL (cleaner for templates and queries).
#[tauri::command]
pub fn update_type_beat_info(
    beat_id: String,
    main: String,
    also_fits: String,
    genre_tags: String,
    youtube_tags: String,
    soundcloud_tags: String,
) -> Result<(), String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE beats SET
            type_beat_main      = ?1,
            type_beat_also_fits = ?2,
            genre_tags          = ?3,
            youtube_tags        = ?4,
            soundcloud_tags     = ?5,
            modified_date       = datetime('now')
         WHERE id = ?6",
        rusqlite::params![
            empty_to_none(&main),
            empty_to_none(&also_fits),
            empty_to_none(&genre_tags),
            empty_to_none(&youtube_tags),
            empty_to_none(&soundcloud_tags),
            beat_id,
        ],
    ).map_err(|e| format!("Failed to update type-beat info: {}", e))?;
    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct UpdateUploadStatusParams {
    pub beat_id:      String,
    pub platform:     String,
    pub status:       String,
    pub scheduled_at: Option<String>,
    pub uploaded_at:  Option<String>,
    pub url:          Option<String>,
}

/// Upsert a beat_uploads row for one platform.
/// Validates platform + status against the table's CHECK constraints
/// so the DB error never surfaces as a confusing SQL message.
#[tauri::command]
pub fn update_upload_status(params: UpdateUploadStatusParams) -> Result<(), String> {
    if !PLATFORMS.contains(&params.platform.as_str()) {
        return Err(format!("Invalid platform: {}", params.platform));
    }
    if !VALID_STATUSES.contains(&params.status.as_str()) {
        return Err(format!("Invalid status: {}", params.status));
    }

    let conn = open_db().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO beat_uploads (beat_id, platform, status, scheduled_at, uploaded_at, url)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(beat_id, platform) DO UPDATE SET
            status       = excluded.status,
            scheduled_at = excluded.scheduled_at,
            uploaded_at  = excluded.uploaded_at,
            url          = excluded.url",
        rusqlite::params![
            params.beat_id,
            params.platform,
            params.status,
            params.scheduled_at,
            params.uploaded_at,
            params.url,
        ],
    ).map_err(|e| format!("Failed to upsert upload status: {}", e))?;
    Ok(())
}

#[derive(Debug, Serialize)]
pub struct TypeBeatPreset {
    pub id:              i64,
    pub label:           String,
    pub main_artists:    String,
    pub also_fits:       Option<String>,
    pub genre_tags:      Option<String>,
    pub youtube_tags:    Option<String>,
    pub soundcloud_tags: Option<String>,
    pub use_count:       i64,
}

#[derive(Debug, Deserialize)]
pub struct SaveTypeBeatPresetParams {
    pub label:           String,
    pub main_artists:    String,
    pub also_fits:       Option<String>,
    pub genre_tags:      Option<String>,
    pub youtube_tags:    Option<String>,
    pub soundcloud_tags: Option<String>,
}

/// List all presets, most-used first then alphabetical.
#[tauri::command]
pub fn get_type_beat_presets() -> Result<Vec<TypeBeatPreset>, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, label, main_artists, also_fits, genre_tags,
                youtube_tags, soundcloud_tags, use_count
         FROM type_beat_presets
         ORDER BY use_count DESC, LOWER(label) ASC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |row| {
        Ok(TypeBeatPreset {
            id:              row.get(0)?,
            label:           row.get(1)?,
            main_artists:    row.get(2)?,
            also_fits:       row.get(3).ok(),
            genre_tags:      row.get(4).ok(),
            youtube_tags:    row.get(5).ok(),
            soundcloud_tags: row.get(6).ok(),
            use_count:       row.get(7)?,
        })
    }).map_err(|e| e.to_string())?;

    Ok(rows.filter_map(|r| r.ok()).collect())
}

/// Insert a new preset. Returns the new row id.
/// Rejects empty label / main_artists to keep the dropdown sane.
#[tauri::command]
pub fn save_type_beat_preset(params: SaveTypeBeatPresetParams) -> Result<i64, String> {
    let label = params.label.trim().to_string();
    let main  = params.main_artists.trim().to_string();
    if label.is_empty() {
        return Err("Preset label cannot be empty".into());
    }
    if main.is_empty() {
        return Err("Main artists cannot be empty".into());
    }

    let conn = open_db().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO type_beat_presets
            (label, main_artists, also_fits, genre_tags, youtube_tags, soundcloud_tags)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            label,
            main,
            params.also_fits.as_deref().map(str::trim).and_then(non_empty),
            params.genre_tags.as_deref().map(str::trim).and_then(non_empty),
            params.youtube_tags.as_deref().map(str::trim).and_then(non_empty),
            params.soundcloud_tags.as_deref().map(str::trim).and_then(non_empty),
        ],
    ).map_err(|e| format!("Failed to save preset: {}", e))?;

    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn delete_type_beat_preset(id: i64) -> Result<(), String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM type_beat_presets WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| format!("Failed to delete preset: {}", e))?;
    Ok(())
}

/// Increment the use_count when a preset is applied (drives sort order so
/// most-used presets bubble to the top of the dropdown over time).
#[tauri::command]
pub fn bump_preset_use(id: i64) -> Result<(), String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE type_beat_presets SET use_count = use_count + 1 WHERE id = ?1",
        rusqlite::params![id],
    ).map_err(|e| format!("Failed to bump preset use_count: {}", e))?;
    Ok(())
}

// ─── Tiny helpers ──────────────────────────────────────────────────────────

fn empty_to_none(s: &str) -> Option<&str> {
    let t = s.trim();
    if t.is_empty() { None } else { Some(t) }
}

fn non_empty(s: &str) -> Option<String> {
    if s.is_empty() { None } else { Some(s.to_string()) }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Legacy structure migration
// ═══════════════════════════════════════════════════════════════════════════════
//
// Legacy layout (older archives):     New layout (current Create-flow):
//   {beat}/01_AUDIO/*                   {beat}/* (all media in root)
//   {beat}/02_VISUALS/*                 {beat}/01_SAVEFILES/*.flp
//   {beat}/03_PROJECTS/*                {beat}/{platform}.txt
//   {beat}/04_UPLOAD/*
//
// Migration moves contents of 01_AUDIO/, 02_VISUALS/, 04_UPLOAD/ into the
// root and renames 03_PROJECTS/ to 01_SAVEFILES/. Nothing is overwritten —
// if a destination filename already exists in the root we report it as a
// collision and abort the whole migration before touching the disk.

const LEGACY_FLATTEN_DIRS: [&str; 3] = ["01_AUDIO", "02_VISUALS", "04_UPLOAD"];

#[derive(Debug, Serialize)]
pub struct LegacyMove {
    pub from_subdir: String,
    pub file_name:   String,
    /// True when the entry is itself a folder (e.g. `01_AUDIO/Backup/`).
    /// Folders move as a whole via `fs::rename`, contents stay intact.
    pub is_dir:      bool,
}

#[derive(Debug, Serialize)]
pub struct LegacyStructure {
    pub is_legacy:           bool,
    pub has_01_audio:        bool,
    pub has_02_visuals:      bool,
    pub has_03_projects:     bool,
    pub has_04_upload:       bool,
    pub has_01_savefiles:    bool,
    pub planned_moves:       Vec<LegacyMove>,
    /// File names that would collide with files already in the root.
    /// If non-empty, migration is refused.
    pub collisions:          Vec<String>,
    /// Set when 03_PROJECTS exists AND 01_SAVEFILES also exists — the
    /// rename step can't happen because both names are taken. User has to
    /// merge manually.
    pub savefiles_conflict:  bool,
}

#[derive(Debug, Serialize)]
pub struct MigrationResult {
    pub moved_files:        usize,
    pub renamed_savefiles:  bool,
    pub removed_subfolders: Vec<String>,
}

/// Inspect a beat's folder, build a migration plan without touching anything.
/// Used by the UI to decide whether to show the "Migrate" banner + dialog.
#[tauri::command]
pub fn check_legacy_structure(beat_id: String) -> Result<LegacyStructure, String> {
    let beat_root = resolve_beat_root(&beat_id)?;
    Ok(scan_legacy(&beat_root))
}

/// Execute the migration plan. Refuses to run if there are collisions or a
/// savefiles conflict — caller should re-invoke `check_legacy_structure` after
/// fixing the conflicts manually.
#[tauri::command]
pub fn migrate_legacy_beat_structure(beat_id: String) -> Result<MigrationResult, String> {
    let beat_root = resolve_beat_root(&beat_id)?;
    let plan = scan_legacy(&beat_root);

    if !plan.is_legacy {
        return Err("Beat has no legacy structure to migrate".into());
    }
    if !plan.collisions.is_empty() {
        return Err(format!(
            "Cannot migrate: {} file(s) would collide with existing root files. Resolve manually first.\n  {}",
            plan.collisions.len(),
            plan.collisions.join("\n  ")
        ));
    }
    if plan.savefiles_conflict {
        return Err(
            "Cannot migrate: both 03_PROJECTS/ and 01_SAVEFILES/ exist. Merge their contents manually before migrating.".into()
        );
    }

    let mut moved = 0usize;
    let mut removed: Vec<String> = Vec::new();

    // ─── Move files from each flatten-source into root ──────────────────
    for subdir_name in LEGACY_FLATTEN_DIRS {
        let subdir = beat_root.join(subdir_name);
        if !subdir.is_dir() { continue; }

        let entries: Vec<_> = match fs::read_dir(&subdir) {
            Ok(rd) => rd.filter_map(|e| e.ok()).collect(),
            Err(e) => return Err(format!("Cannot read {}: {}", subdir_name, e)),
        };

        for entry in entries {
            let from = entry.path();
            let file_name = match from.file_name().and_then(|n| n.to_str()) {
                Some(n) => n.to_string(),
                None => continue,
            };
            // Both files AND nested folders (e.g. "Backup/") get moved to
            // root. `fs::rename` handles directories atomically on the same
            // volume, contents stay intact.
            let to = beat_root.join(&file_name);
            if to.exists() {
                // Should have been caught by the plan; defensive double-check.
                return Err(format!(
                    "Aborting mid-migration: unexpected collision on '{}'. {} file(s) already moved.",
                    file_name, moved
                ));
            }
            fs::rename(&from, &to).map_err(|e| {
                format!("Failed to move {:?} → {:?}: {} ({} file(s) already moved)", from, to, e, moved)
            })?;
            moved += 1;
        }

        // Remove the subfolder only if it ended up empty (no nested dirs lurking).
        let still_has_entries = fs::read_dir(&subdir)
            .map(|rd| rd.filter_map(|e| e.ok()).next().is_some())
            .unwrap_or(true);
        if !still_has_entries {
            if let Err(e) = fs::remove_dir(&subdir) {
                // Non-fatal: report but continue.
                eprintln!("Could not remove empty {}: {}", subdir_name, e);
            } else {
                removed.push(subdir_name.to_string());
            }
        }
    }

    // ─── Rename 03_PROJECTS/ → 01_SAVEFILES/ ─────────────────────────────
    let renamed_savefiles = {
        let old = beat_root.join("03_PROJECTS");
        let new = beat_root.join("01_SAVEFILES");
        if old.is_dir() && !new.exists() {
            fs::rename(&old, &new).map_err(|e| {
                format!("Failed to rename 03_PROJECTS → 01_SAVEFILES: {} (files were already moved successfully)", e)
            })?;
            true
        } else {
            false
        }
    };

    Ok(MigrationResult {
        moved_files: moved,
        renamed_savefiles,
        removed_subfolders: removed,
    })
}

// ─── Internal helpers ──────────────────────────────────────────────────────

fn resolve_beat_root(beat_id: &str) -> Result<PathBuf, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let path_str: String = conn.query_row(
        "SELECT path FROM beats WHERE id = ?1",
        rusqlite::params![beat_id],
        |row| row.get::<_, Option<String>>(0),
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => format!("Beat {} not found", beat_id),
        _ => format!("DB lookup failed: {}", e),
    })?
    .ok_or_else(|| format!("Beat {} has no folder path on record", beat_id))?;

    let path = PathBuf::from(&path_str);
    if !path.is_dir() {
        return Err(format!("Beat folder does not exist: {}", path_str));
    }
    Ok(path)
}

// ═══════════════════════════════════════════════════════════════════════════════
// Convert filenames to convention
// ═══════════════════════════════════════════════════════════════════════════════
//
// Naming rules (Key first to match the folder-name convention):
//   MP3        → {TITLE_UPPER} [{KEY} {BPM}]_tagged.mp3
//   WAV        → {TITLE_UPPER} [{KEY} {BPM}]_untagged.wav
//   MP4        → {TYPE_BEAT_MAIN} Type Beat {YEAR} - {TITLE_UPPER} - {GENRE_TAGS}.mp4
//   Cover      → {TITLE_UPPER}_Cover_2000x2000.{ext}
//   Thumbnail  → {TITLE_UPPER}_Thumbnail_1920x1080.{ext}
//   FLP        → {TITLE_UPPER} [{KEY} {BPM}].flp   (plus _master / _old variants)
//
// Multi-file disambiguation: only the "primary" file of each kind is renamed.
// Audio/video → the newest (by modified date). FLPs → file containing "master"
// wins, else newest. Other files of the same kind are reported as `skipped`
// so the user knows they weren't touched.
//
// Safety: planning is read-only. The Apply step never overwrites — collisions
// are caught upfront and listed as `status = "collision"`.

#[derive(Debug, Serialize)]
pub struct RenameOp {
    pub from:   String,
    pub to:     String,
    pub kind:   String,            // "mp3" | "wav" | "mp4" | "cover" | "thumbnail" | "flp" | "flp_master" | "flp_old"
    pub status: String,            // "rename" | "noop" | "collision"
    pub subdir: Option<String>,    // None for beat-root files, Some("01_SAVEFILES") for FLPs
}

#[derive(Debug, Serialize)]
pub struct SkippedFile {
    pub file:   String,
    pub kind:   String,
    pub reason: String,
}

#[derive(Debug, Serialize)]
pub struct RenamePlan {
    pub operations: Vec<RenameOp>,
    pub skipped:    Vec<SkippedFile>,
    /// True if any operation has status="rename" — i.e. there's actual work to do.
    pub has_work: bool,
}

#[derive(Debug, Serialize)]
pub struct RenameResult {
    pub renamed: usize,
    pub noops:   usize,
    pub errors:  Vec<String>,
}

#[tauri::command]
pub fn plan_filename_convention(beat_id: String) -> Result<RenamePlan, String> {
    let (beat_root, naming) = load_naming_context(&beat_id)?;
    Ok(build_rename_plan(&beat_root, &naming))
}

#[tauri::command]
pub fn apply_filename_convention(beat_id: String) -> Result<RenameResult, String> {
    let (beat_root, naming) = load_naming_context(&beat_id)?;
    let plan = build_rename_plan(&beat_root, &naming);

    let mut renamed = 0usize;
    let mut noops   = 0usize;
    let mut errors: Vec<String> = Vec::new();

    for op in &plan.operations {
        match op.status.as_str() {
            "noop" => { noops += 1; }
            "collision" => {
                errors.push(format!("Skipped {} → {}: target already exists", op.from, op.to));
            }
            "rename" => {
                let dir = match &op.subdir {
                    Some(s) => beat_root.join(s),
                    None    => beat_root.to_path_buf(),
                };
                let from_path = dir.join(&op.from);
                let to_path   = dir.join(&op.to);

                // Defensive re-check: another rename in this batch could
                // have just created our target. fs::rename on Windows
                // refuses to overwrite, so this is the last safety net.
                if to_path.exists() {
                    errors.push(format!("Skipped {} → {}: target now exists (race)", op.from, op.to));
                    continue;
                }
                match fs::rename(&from_path, &to_path) {
                    Ok(_) => renamed += 1,
                    Err(e) => errors.push(format!("Failed {} → {}: {}", op.from, op.to, e)),
                }
            }
            _ => {}
        }
    }

    Ok(RenameResult { renamed, noops, errors })
}

// ─── Plan-builder internals ────────────────────────────────────────────────

#[derive(Debug)]
struct NamingContext {
    title_upper:    String,
    key_bpm:        String,          // " [Fm 140]" or "" if both missing
    mp4_basename:   Option<String>,  // None if no TYPE_BEAT_MAIN
}

fn load_naming_context(beat_id: &str) -> Result<(PathBuf, NamingContext), String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let (path, name, bpm, key, tbm, genre) = conn.query_row(
        "SELECT path, name, bpm, key, type_beat_main, genre_tags
         FROM beats WHERE id = ?1",
        rusqlite::params![beat_id],
        |row| {
            Ok((
                row.get::<_, Option<String>>(0)?.unwrap_or_default(),
                row.get::<_, String>(1)?,
                row.get::<_, Option<f64>>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
            ))
        },
    ).map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => format!("Beat {} not found", beat_id),
        _ => format!("DB lookup failed: {}", e),
    })?;

    let beat_root = PathBuf::from(&path);
    if !beat_root.is_dir() {
        return Err(format!("Beat folder does not exist: {}", path));
    }

    let title_upper = sanitize_filename_part(&name).to_uppercase();
    let key_bpm = match (key.as_deref().map(str::trim).filter(|s| !s.is_empty()), bpm) {
        (Some(k), Some(b)) => format!(" [{} {}]", k, b as i64),
        (Some(k), None)    => format!(" [{}]", k),
        (None, Some(b))    => format!(" [{}]", b as i64),
        (None, None)       => String::new(),
    };
    let mp4_basename = build_mp4_basename(
        &title_upper,
        tbm.as_deref().map(str::trim).filter(|s| !s.is_empty()),
        genre.as_deref().map(str::trim).filter(|s| !s.is_empty()),
        &current_year_str(),
    );

    Ok((beat_root, NamingContext {
        title_upper,
        key_bpm,
        mp4_basename,
    }))
}

fn build_mp4_basename(title_upper: &str, type_beat_main: Option<&str>, genre_tags: Option<&str>, year: &str) -> Option<String> {
    let tbm = type_beat_main?;  // No type-beat main = no MP4 rename
    let mut parts: Vec<String> = vec![
        sanitize_filename_part(&format!("{} Type Beat {}", tbm, year)),
        title_upper.to_string(),
    ];
    if let Some(g) = genre_tags {
        parts.push(sanitize_filename_part(g));
    }
    parts.retain(|s| !s.is_empty());
    Some(parts.join(" - "))
}

use crate::utils::sanitize_filename_part;

fn build_rename_plan(beat_root: &Path, nc: &NamingContext) -> RenamePlan {
    let mut ops: Vec<RenameOp> = Vec::new();
    let mut skipped: Vec<SkippedFile> = Vec::new();
    // Track the rename targets we've already planned so two operations
    // can't collide with each other (e.g. an MP3 already named correctly
    // shouldn't make us mark another MP3 rename as a collision).
    let mut planned_targets: std::collections::HashSet<(Option<String>, String)> = std::collections::HashSet::new();

    // ─── Root-level files ────────────────────────────────────────────────
    let root_files = list_files(beat_root);

    // Audio (mp3 / wav) — newest gets the canonical name, rest are skipped.
    plan_single_kind(
        &root_files, "mp3", "mp3",
        format!("{}{}_tagged.mp3", nc.title_upper, nc.key_bpm),
        beat_root, None,
        &mut ops, &mut skipped, &mut planned_targets,
    );
    plan_single_kind(
        &root_files, "wav", "wav",
        format!("{}{}_untagged.wav", nc.title_upper, nc.key_bpm),
        beat_root, None,
        &mut ops, &mut skipped, &mut planned_targets,
    );

    // MP4 — needs MP4 basename (depends on TYPE_BEAT_MAIN)
    if let Some(basename) = &nc.mp4_basename {
        plan_single_kind(
            &root_files, "mp4", "mp4",
            format!("{}.mp4", basename),
            beat_root, None,
            &mut ops, &mut skipped, &mut planned_targets,
        );
    } else {
        for (name, _) in root_files.iter().filter(|(n, _)| ext_lower(n) == "mp4") {
            skipped.push(SkippedFile {
                file: name.clone(),
                kind: "mp4".to_string(),
                reason: "Set Type-Beat Main first to generate an MP4 filename".to_string(),
            });
        }
    }

    // Cover & Thumbnail — image files matched by name
    plan_image(&root_files, "cover", "cover",
        |ext| format!("{}_Cover_2000x2000.{}", nc.title_upper, ext),
        beat_root, &mut ops, &mut skipped, &mut planned_targets);
    plan_image(&root_files, "thumbnail", "thumbnail",
        |ext| format!("{}_Thumbnail_1920x1080.{}", nc.title_upper, ext),
        beat_root, &mut ops, &mut skipped, &mut planned_targets);

    // ─── FLPs in 01_SAVEFILES/ (or 03_PROJECTS/ legacy) ─────────────────
    let (flp_dir_name, flp_files) = list_flps(beat_root);
    if !flp_files.is_empty() {
        plan_flps(&flp_files, nc, beat_root, flp_dir_name.as_deref(),
            &mut ops, &mut skipped, &mut planned_targets);
    }

    let has_work = ops.iter().any(|o| o.status == "rename");
    RenamePlan { operations: ops, skipped, has_work }
}

/// List top-level files in a dir as (filename, modified_time).
/// Subdirectories are excluded — we never rename folders.
fn list_files(dir: &Path) -> Vec<(String, SystemTime)> {
    let mut out: Vec<(String, SystemTime)> = Vec::new();
    if let Ok(rd) = fs::read_dir(dir) {
        for entry in rd.filter_map(|e| e.ok()) {
            let p = entry.path();
            if !p.is_file() { continue; }
            let name = match p.file_name().and_then(|n| n.to_str()) {
                Some(n) => n.to_string(),
                None => continue,
            };
            let mtime = fs::metadata(&p)
                .and_then(|m| m.modified())
                .unwrap_or(UNIX_EPOCH);
            out.push((name, mtime));
        }
    }
    out
}

fn ext_lower(name: &str) -> String {
    Path::new(name).extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase()
}

/// Pick the newest file of `ext` in `files`, plan a rename to `target_name`.
/// Other files of the same extension are reported as skipped.
fn plan_single_kind(
    files: &[(String, SystemTime)],
    ext: &str,
    kind: &str,
    target_name: String,
    beat_root: &Path,
    subdir: Option<&str>,
    ops: &mut Vec<RenameOp>,
    skipped: &mut Vec<SkippedFile>,
    planned: &mut std::collections::HashSet<(Option<String>, String)>,
) {
    let matching: Vec<&(String, SystemTime)> = files.iter()
        .filter(|(n, _)| ext_lower(n) == ext)
        .collect();
    if matching.is_empty() { return; }

    // Pick newest
    let primary = matching.iter()
        .max_by_key(|(_, t)| *t)
        .copied()
        .unwrap();
    push_op(beat_root, subdir, &primary.0, &target_name, kind, ops, planned);

    // The rest are leftovers
    for (n, _) in matching.iter().filter(|(n, _)| n != &primary.0) {
        skipped.push(SkippedFile {
            file: n.clone(),
            kind: kind.to_string(),
            reason: format!("Multiple .{} files — only the newest is renamed", ext),
        });
    }
}

fn plan_image(
    files: &[(String, SystemTime)],
    needle: &str,        // "cover" or "thumbnail"
    kind: &str,
    target: impl Fn(&str) -> String,  // (ext) -> target filename
    beat_root: &Path,
    ops: &mut Vec<RenameOp>,
    skipped: &mut Vec<SkippedFile>,
    planned: &mut std::collections::HashSet<(Option<String>, String)>,
) {
    // Image classification: name contains `needle` (case-insensitive),
    // extension in image set, NOT also containing the other needle.
    let other = if needle == "cover" { "thumbnail" } else { "cover" };
    let matching: Vec<&(String, SystemTime)> = files.iter()
        .filter(|(n, _)| {
            let lower = n.to_lowercase();
            let e = ext_lower(n);
            is_image_extension(&e) && lower.contains(needle) && !lower.contains(other)
        })
        .collect();
    if matching.is_empty() { return; }

    let primary = matching.iter().max_by_key(|(_, t)| *t).copied().unwrap();
    let ext = ext_lower(&primary.0);
    let target_name = target(&ext);
    push_op(beat_root, None, &primary.0, &target_name, kind, ops, planned);

    for (n, _) in matching.iter().filter(|(n, _)| n != &primary.0) {
        skipped.push(SkippedFile {
            file: n.clone(),
            kind: kind.to_string(),
            reason: format!("Multiple {} images — only the newest is renamed", needle),
        });
    }
}

/// Where do FLPs live for this beat? Returns (subdir_name, files).
fn list_flps(beat_root: &Path) -> (Option<String>, Vec<(String, SystemTime)>) {
    for subdir_name in ["01_SAVEFILES", "03_PROJECTS"] {
        let dir = beat_root.join(subdir_name);
        if !dir.is_dir() { continue; }
        let files: Vec<(String, SystemTime)> = list_files(&dir).into_iter()
            .filter(|(n, _)| ext_lower(n) == "flp")
            .collect();
        if !files.is_empty() {
            return (Some(subdir_name.to_string()), files);
        }
    }
    (None, Vec::new())
}

/// Plan FLP renames:
///   • Files containing "master" in name (case-insensitive) → _master suffix
///   • Newest remaining → primary name (no suffix)
///   • Others           → _old suffix (with _2, _3 etc. on collision)
fn plan_flps(
    flps: &[(String, SystemTime)],
    nc: &NamingContext,
    beat_root: &Path,
    subdir: Option<&str>,
    ops: &mut Vec<RenameOp>,
    skipped: &mut Vec<SkippedFile>,
    planned: &mut std::collections::HashSet<(Option<String>, String)>,
) {
    let base = format!("{}{}", nc.title_upper, nc.key_bpm);

    let (masters, rest): (Vec<&(String, SystemTime)>, Vec<&(String, SystemTime)>) =
        flps.iter().partition(|(n, _)| n.to_lowercase().contains("master"));

    // Masters → _master[_N].flp
    let mut master_idx = 0;
    for (name, _) in masters {
        let suffix = if master_idx == 0 { String::new() } else { format!("_{}", master_idx + 1) };
        let target = format!("{}_master{}.flp", base, suffix);
        push_op(beat_root, subdir, name, &target, "flp_master", ops, planned);
        master_idx += 1;
    }

    // Newest non-master → primary, others → _old[_N].flp
    if !rest.is_empty() {
        let mut sorted = rest.clone();
        sorted.sort_by_key(|(_, t)| std::cmp::Reverse(*t));
        let primary_name = &sorted[0].0;
        let primary_target = format!("{}.flp", base);
        push_op(beat_root, subdir, primary_name, &primary_target, "flp", ops, planned);

        for (i, (name, _)) in sorted.iter().enumerate().skip(1) {
            let suffix = if i == 1 { String::new() } else { format!("_{}", i) };
            let target = format!("{}_old{}.flp", base, suffix);
            push_op(beat_root, subdir, name, &target, "flp_old", ops, planned);
        }
    }
    let _ = skipped; // FLPs don't get skipped — _old absorbs all secondaries.
}

/// Build a RenameOp and decide its status.
fn push_op(
    beat_root: &Path,
    subdir: Option<&str>,
    from: &str,
    to: &str,
    kind: &str,
    ops: &mut Vec<RenameOp>,
    planned: &mut std::collections::HashSet<(Option<String>, String)>,
) {
    let dir = match subdir {
        Some(s) => beat_root.join(s),
        None    => beat_root.to_path_buf(),
    };
    let to_path = dir.join(to);

    let status = if from == to {
        "noop"
    } else if to_path.exists() || planned.contains(&(subdir.map(String::from), to.to_string())) {
        "collision"
    } else {
        "rename"
    };

    if status == "rename" {
        planned.insert((subdir.map(String::from), to.to_string()));
    }

    ops.push(RenameOp {
        from: from.to_string(),
        to: to.to_string(),
        kind: kind.to_string(),
        status: status.to_string(),
        subdir: subdir.map(String::from),
    });
}

fn scan_legacy(beat_root: &Path) -> LegacyStructure {
    let has_01_audio     = beat_root.join("01_AUDIO").is_dir();
    let has_02_visuals   = beat_root.join("02_VISUALS").is_dir();
    let has_03_projects  = beat_root.join("03_PROJECTS").is_dir();
    let has_04_upload    = beat_root.join("04_UPLOAD").is_dir();
    let has_01_savefiles = beat_root.join("01_SAVEFILES").is_dir();

    let needs_flatten = has_01_audio || has_02_visuals || has_04_upload;
    let needs_rename  = has_03_projects;
    let is_legacy = needs_flatten || needs_rename;

    // Build the move plan + collision list (read-only pass)
    let mut planned_moves: Vec<LegacyMove> = Vec::new();
    let mut collisions: Vec<String> = Vec::new();

    for subdir_name in LEGACY_FLATTEN_DIRS {
        let subdir = beat_root.join(subdir_name);
        if !subdir.is_dir() { continue; }
        if let Ok(rd) = fs::read_dir(&subdir) {
            for entry in rd.filter_map(|e| e.ok()) {
                let p = entry.path();
                let is_dir = p.is_dir();
                let file_name = match p.file_name().and_then(|n| n.to_str()) {
                    Some(n) => n.to_string(),
                    None => continue,
                };
                if beat_root.join(&file_name).exists() {
                    collisions.push(format!("{} (from {})", file_name, subdir_name));
                }
                planned_moves.push(LegacyMove {
                    from_subdir: subdir_name.to_string(),
                    file_name,
                    is_dir,
                });
            }
        }
    }

    // 03_PROJECTS → 01_SAVEFILES rename conflicts if both exist
    let savefiles_conflict = has_03_projects && has_01_savefiles;

    LegacyStructure {
        is_legacy,
        has_01_audio,
        has_02_visuals,
        has_03_projects,
        has_04_upload,
        has_01_savefiles,
        planned_moves,
        collisions,
        savefiles_conflict,
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase D — template rendering + 04_UPLOAD/ file writing
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Serialize)]
pub struct UploadDescriptions {
    pub beatstars:  String,
    pub soundcloud: String,
    pub youtube:    String,
}

/// Render all 3 platform descriptions for a beat using the current
/// templates + DB state + settings. Pure read — does NOT touch the filesystem
/// beyond reading the template files.
#[tauri::command]
pub fn render_upload_descriptions(app: AppHandle, beat_id: String) -> Result<UploadDescriptions, String> {
    let conn = open_db().map_err(|e| e.to_string())?;

    // ─── Beat row ────────────────────────────────────────────────────────
    let (name, bpm, key_field, tb_main, tb_also, tb_genre, tb_youtube, tb_soundcloud) = conn.query_row(
        "SELECT name, bpm, key, type_beat_main, type_beat_also_fits, genre_tags,
                youtube_tags, soundcloud_tags
         FROM beats WHERE id = ?1",
        rusqlite::params![beat_id],
        |row| {
            Ok((
                row.get::<_, String>(0).unwrap_or_default(),
                row.get::<_, Option<f64>>(1).unwrap_or(None),
                row.get::<_, Option<String>>(2).unwrap_or(None),
                row.get::<_, Option<String>>(3).unwrap_or(None),
                row.get::<_, Option<String>>(4).unwrap_or(None),
                row.get::<_, Option<String>>(5).unwrap_or(None),
                row.get::<_, Option<String>>(6).unwrap_or(None),
                row.get::<_, Option<String>>(7).unwrap_or(None),
            ))
        },
    ).map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => format!("Beat {} not found", beat_id),
        _ => format!("DB lookup failed: {}", e),
    })?;

    // ─── Settings map ────────────────────────────────────────────────────
    let mut settings: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    {
        let mut stmt = conn.prepare("SELECT key, value FROM app_settings").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        }).map_err(|e| e.to_string())?;
        for r in rows.filter_map(|r| r.ok()) {
            settings.insert(r.0, r.1);
        }
    }

    // ─── Beatstars purchase link from beat_uploads ───────────────────────
    let beatstars_link: String = conn.query_row(
        "SELECT url FROM beat_uploads WHERE beat_id = ?1 AND platform = 'beatstars'",
        rusqlite::params![beat_id],
        |row| row.get::<_, Option<String>>(0),
    )
    .unwrap_or(None)
    .filter(|s| !s.trim().is_empty())
    .unwrap_or_else(|| settings.get("beatstars_url").cloned().unwrap_or_default());

    // ─── Templates from disk ─────────────────────────────────────────────
    let dir = templates_dir(&app)?;
    let bs_tpl = fs::read_to_string(dir.join("beatstars.template"))
        .map_err(|e| format!("Cannot read beatstars.template: {}", e))?;
    let sc_tpl = fs::read_to_string(dir.join("soundcloud.template"))
        .map_err(|e| format!("Cannot read soundcloud.template: {}", e))?;
    let yt_tpl = fs::read_to_string(dir.join("youtube.template"))
        .map_err(|e| format!("Cannot read youtube.template: {}", e))?;

    // ─── Build shared placeholders ───────────────────────────────────────
    let producer = settings.get("producer_name").cloned().unwrap_or_default();
    let producer_prod = if producer.is_empty() {
        String::new()
    } else {
        format!("prod. {}", producer)
    };
    let year = current_year_str();
    let bpm_str = bpm.map(|b| format!("{}", b as i64)).unwrap_or_default();
    let key_str = key_field.unwrap_or_default();
    let title = name.clone();
    let title_upper = title.to_uppercase();
    let tb_main_s = tb_main.clone().unwrap_or_default();
    let tb_also_s = tb_also.clone().unwrap_or_default();
    let tb_genre_s = tb_genre.clone().unwrap_or_default();

    let base_vars: Vec<(&str, String)> = vec![
        ("TITLE",          title),
        ("TITLE_UPPER",    title_upper),
        ("BPM",            bpm_str),
        ("KEY",            key_str),
        ("TYPE_BEAT_MAIN", tb_main_s.clone()),
        ("ALSO_FITS",      tb_also_s.clone()),
        ("GENRE_TAGS",     tb_genre_s.clone()),
        ("PRODUCER",       producer.clone()),
        ("PRODUCER_PROD",  producer_prod),
        ("EMAIL",          settings.get("contact_email").cloned().unwrap_or_default()),
        ("IG_URL",         settings.get("instagram_url").cloned().unwrap_or_default()),
        ("SC_URL",         settings.get("soundcloud_url").cloned().unwrap_or_default()),
        ("YT_URL",         settings.get("youtube_url").cloned().unwrap_or_default()),
        ("BS_URL",         settings.get("beatstars_url").cloned().unwrap_or_default()),
        ("BEATSTARS_LINK", beatstars_link),
        ("YEAR",           year),
    ];

    // ─── Per-platform render (HASHTAGS differs by platform style) ────────
    let default_genre = settings.get("default_genre_tags").cloned().unwrap_or_default();
    let yt_override = tb_youtube.unwrap_or_default();
    let sc_override = tb_soundcloud.unwrap_or_default();
    let year_for_yt = base_vars.iter()
        .find(|(k, _)| *k == "YEAR")
        .map(|(_, v)| v.clone())
        .unwrap_or_default();

    let render_for = |template: &str, platform: &str| -> String {
        let hashtags = build_hashtags(
            platform,
            &default_genre,
            &tb_main_s,
            &tb_also_s,
            &tb_genre_s,
            &producer,
            &yt_override,
            &sc_override,
            &year_for_yt,
        );
        let mut vars = base_vars.clone();
        vars.push(("HASHTAGS", hashtags));
        render_template(template, &vars)
    };

    Ok(UploadDescriptions {
        beatstars:  render_for(&bs_tpl, "beatstars"),
        soundcloud: render_for(&sc_tpl, "soundcloud"),
        youtube:    render_for(&yt_tpl, "youtube"),
    })
}

#[derive(Debug, Deserialize)]
pub struct SaveUploadDescriptionsParams {
    pub beat_id:    String,
    pub beatstars:  Option<String>,
    pub soundcloud: Option<String>,
    pub youtube:    Option<String>,
}

/// Write whichever of the 3 description strings were provided directly into
/// the beat folder root (`{beat_folder}/{platform}.txt`). Missing fields are
/// skipped, so the same command serves both "save all" and "save just this tab".
#[tauri::command]
pub fn save_upload_descriptions(params: SaveUploadDescriptionsParams) -> Result<(), String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let beat_path: String = conn.query_row(
        "SELECT path FROM beats WHERE id = ?1",
        rusqlite::params![params.beat_id],
        |row| row.get::<_, Option<String>>(0),
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => format!("Beat {} not found", params.beat_id),
        _ => format!("DB lookup failed: {}", e),
    })?
    .ok_or_else(|| format!("Beat {} has no folder path on record", params.beat_id))?;

    let beat_root = Path::new(&beat_path);
    if !beat_root.is_dir() {
        return Err(format!("Beat folder does not exist: {}", beat_path));
    }

    let writes: [(Option<String>, &str); 3] = [
        (params.beatstars,  "beatstars.txt"),
        (params.soundcloud, "soundcloud.txt"),
        (params.youtube,    "youtube.txt"),
    ];
    for (content, name) in writes {
        if let Some(text) = content {
            let dest = beat_root.join(name);
            fs::write(&dest, text)
                .map_err(|e| format!("Failed to write {:?}: {}", dest, e))?;
        }
    }
    Ok(())
}

// ─── Renderer + Hashtag generator ──────────────────────────────────────────

fn render_template(template: &str, vars: &[(&str, String)]) -> String {
    // Plain string-replace — pull each {{KEY}} occurrence. Cheap and predictable;
    // no need for a full template engine for this many placeholders.
    let mut out = template.to_string();
    for (k, v) in vars {
        out = out.replace(&format!("{{{{{}}}}}", k), v);
    }
    out
}

fn current_year_str() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    // Days since 1970-01-01, then approximate year from that. Good enough
    // for a copyright-style "2026" footer and avoids pulling a date crate.
    let days = secs / 86_400;
    let mut year = 1970i64;
    let mut remaining_days = days;
    loop {
        let len = if is_leap(year) { 366 } else { 365 };
        if remaining_days < len { break; }
        remaining_days -= len;
        year += 1;
    }
    year.to_string()
}

fn is_leap(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

/// Build the {{HASHTAGS}} block. Per-platform formatting:
///   • SoundCloud — one tag per line with "#" prefix, original casing preserved,
///                  HARD-CAPPED at SOUNDCLOUD_TAG_LIMIT.
///                  If `sc_override` is set: default_genre_tags (from settings,
///                  always-on) + per-beat curated list, deduped + capped.
///                  Otherwise: auto-generated from defaults + artists + vibes.
///   • YouTube — if `yt_override` is non-empty, used VERBATIM (with {{YEAR}}
///               substitution). Otherwise falls back to auto-generated.
///   • Beatstars — comma-separated lowercase auto-generated list.
fn build_hashtags(
    platform: &str,
    default_genre_tags: &str,
    type_beat_main: &str,
    also_fits: &str,
    genre_tags: &str,
    producer_name: &str,
    yt_override: &str,
    sc_override: &str,
    year: &str,
) -> String {
    // YouTube override path — verbatim text from the beat's youtube_tags field.
    // Supports {{YEAR}} substitution so the user can write "free type beat {{YEAR}}"
    // once and forget about it across years.
    if platform == "youtube" && !yt_override.trim().is_empty() {
        return yt_override.replace("{{YEAR}}", year);
    }

    // SoundCloud override path — curated per-beat list, always merged with the
    // "always-on" default SC tags from settings. Deduped + capped at 9.
    // Each line becomes "#Tag"; user can paste with or without # prefix.
    if platform == "soundcloud" && !sc_override.trim().is_empty() {
        let mut tags: Vec<String> = Vec::new();
        for t in split_tag_text(default_genre_tags) { tags.push(t); }
        for t in split_tag_text(sc_override)        { tags.push(t); }
        return format_soundcloud(&dedup_take(tags, SOUNDCLOUD_TAG_LIMIT));
    }

    // ─── Auto-fallback path (used when no override) ─────────────────────
    let mut out: Vec<String> = Vec::new();

    // 1. Global defaults (e.g. "Hip Hop & Rap, Emo Trap")
    for t in split_csv(default_genre_tags) { out.push(t); }

    // 2. Per-beat descriptive genre tags (vibes) — these matter most for SC
    //    so put them ahead of the artist tags in the priority order.
    for t in split_csv(genre_tags) { out.push(t); }

    // 3. "{Artist} Type Beat" for each main + also-fits artist
    for artist in split_artists(type_beat_main) {
        out.push(format!("{} Type Beat", artist));
    }
    for artist in split_artists(also_fits) {
        out.push(format!("{} Type Beat", artist));
    }

    // 4. Producer credit
    if !producer_name.trim().is_empty() {
        out.push(format!("prod {}", producer_name.trim()));
        out.push(producer_name.trim().to_string());
    }

    let unique = dedup_take(out, usize::MAX);

    match platform {
        "soundcloud" => format_soundcloud(&unique[..unique.len().min(SOUNDCLOUD_TAG_LIMIT)]),
        _ /* youtube fallback + beatstars + anything else */ => unique.iter()
            .map(|t| t.to_lowercase())
            .collect::<Vec<_>>()
            .join(", "),
    }
}

/// Format a tag list as one "#Tag" per line.
fn format_soundcloud(tags: &[String]) -> String {
    tags.iter()
        .map(|t| format!("#{}", t))
        .collect::<Vec<_>>()
        .join("\n")
}

/// Case-insensitive dedup keeping first-seen order, then truncate at `limit`.
fn dedup_take(tags: Vec<String>, limit: usize) -> Vec<String> {
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    tags.into_iter()
        .filter(|t| seen.insert(t.to_lowercase()))
        .take(limit)
        .collect()
}

/// Parse a freeform tag text: split on commas AND newlines, strip optional
/// leading "#", trim whitespace, drop empties. Lets the user paste in either
/// "#Tag1\n#Tag2" or "Tag1, Tag2" interchangeably.
fn split_tag_text(s: &str) -> Vec<String> {
    s.split(|c: char| c == ',' || c == '\n' || c == '\r')
        .map(|t| t.trim().trim_start_matches('#').trim().to_string())
        .filter(|t| !t.is_empty())
        .collect()
}

/// Split a "Dro Kenji x Juice WRLD, Lil Peep & Convolk" style string
/// into individual artist names.
fn split_artists(s: &str) -> Vec<String> {
    if s.trim().is_empty() { return Vec::new(); }
    // Split on commas first, then split each piece on " x ", " X ", " & "
    s.split(',')
        .flat_map(|chunk| {
            chunk
                .replace(" X ", " x ")
                .replace(" & ", " x ")
                .split(" x ")
                .map(|p| p.trim().to_string())
                .filter(|p| !p.is_empty())
                .collect::<Vec<_>>()
        })
        .collect()
}

fn split_csv(s: &str) -> Vec<String> {
    s.split(',')
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
        .collect()
}

// ─── Default Template Contents ─────────────────────────────────────────────
// Placeholders use {{NAME}} syntax. Phase D will implement the renderer.
//
// Available placeholders:
//   {{TITLE}}             — beat title as stored (e.g. "Weightless")
//   {{TITLE_UPPER}}       — uppercased title (e.g. "WEIGHTLESS")
//   {{BPM}}               — e.g. "145"
//   {{KEY}}               — e.g. "Fm"
//   {{TYPE_BEAT_MAIN}}    — e.g. "Dro Kenji x Juice WRLD"
//   {{ALSO_FITS}}         — e.g. "Lil Peep, Convolk, Scorey"
//   {{GENRE_TAGS}}        — e.g. "Dark Melodic Trap"
//   {{HASHTAGS}}          — derived hashtag block, one per line
//   {{PRODUCER}}          — settings.producer_name (e.g. "goodbxy")
//   {{PRODUCER_PROD}}     — "prod. " + producer name (e.g. "prod. goodbxy")
//   {{EMAIL}}             — settings.contact_email
//   {{IG_URL}}            — settings.instagram_url
//   {{SC_URL}}            — settings.soundcloud_url
//   {{YT_URL}}            — settings.youtube_url
//   {{BS_URL}}            — settings.beatstars_url
//   {{BEATSTARS_LINK}}    — per-beat beat_uploads.url where platform='beatstars'
//   {{YEAR}}              — current year (e.g. "2026")

const DEFAULT_BEATSTARS: &str = "BEATSTARS TITEL:\n\
{{TITLE_UPPER}} - {{TYPE_BEAT_MAIN}} {{GENRE_TAGS}} Beat\n\
\n\
────────────────────────────\n\
\n\
PREMIERE PRO EXPORTNAME (Video):\n\
{{TYPE_BEAT_MAIN}} Type Beat {{YEAR}} - {{TITLE_UPPER}} - {{GENRE_TAGS}}\n\
\n\
ALBUMCOVER EXPORT:\n\
{{TITLE_UPPER}}_Cover_2000x2000.png\n\
\n\
THUMBNAIL EXPORT:\n\
{{TITLE_UPPER}}_THUMBNAIL_1920x1080.png\n";

const DEFAULT_SOUNDCLOUD: &str = "TITEL:\n\
[FREE] \"{{TITLE_UPPER}}\" {{TYPE_BEAT_MAIN}} Type Beat | {{GENRE_TAGS}} {{YEAR}}\n\
\n\
────────────────────────────\n\
\n\
DESCRIPTION:\n\
FREE DOWNLOAD / PURCHASE 🔥: {{BEATSTARS_LINK}}\n\
\n\
🎧 𝙃𝙞𝙜𝙝𝙡𝙞𝙜𝙝𝙩𝙨 ─ 𝙨𝙩𝙖𝙩𝙨\n\
BPM: {{BPM}} | Key: {{KEY}}\n\
\n\
{{GENRE_TAGS}} | {{TYPE_BEAT_MAIN}} Type Beat\n\
also fits: {{ALSO_FITS}}\n\
\n\
🚫 No Samples Used\n\
🎸 Loop by {{PRODUCER}}\n\
\n\
─────────────────────────\n\
CONTACT FOR STEMS & EXCLUSIVES:\n\
📧 Email: {{EMAIL}}\n\
📸 IG: {{IG_URL}}\n\
Contact on Instagram and/or Email for track stems and exclusive pricing.\n\
\n\
SOCIALS:\n\
🎵 YOUTUBE: {{YT_URL}}\n\
☁️ SOUNDCLOUD: {{SC_URL}}\n\
\n\
Drop a like and repost if you feel the vibe! 🤝\n\
\n\
────────────────────────────\n\
\n\
TAGS:\n\
{{HASHTAGS}}\n";

const DEFAULT_YOUTUBE: &str = "TITEL:\n\
[FREE] {{TYPE_BEAT_MAIN}} Type Beat {{YEAR}} \"{{TITLE_UPPER}}\"\n\
\n\
────────────────────────────\n\
\n\
DESCRIPTION:\n\
\"{{TITLE_UPPER}}\" — {{TYPE_BEAT_MAIN}} Type Beat | {{GENRE_TAGS}}\n\
\n\
🔥 PURCHASE / FREE DOWNLOAD: {{BEATSTARS_LINK}}\n\
\n\
BPM: {{BPM}} | Key: {{KEY}}\n\
{{PRODUCER_PROD}}\n\
\n\
────────────────────────────\n\
\n\
This {{GENRE_TAGS}} type beat fits artists like:\n\
{{TYPE_BEAT_MAIN}}, {{ALSO_FITS}}\n\
\n\
────────────────────────────\n\
\n\
📧 Email: {{EMAIL}}\n\
📸 Instagram: {{IG_URL}}\n\
☁️ SoundCloud: {{SC_URL}}\n\
🎵 YouTube: {{YT_URL}}\n\
🛒 Beatstars: {{BS_URL}}\n\
\n\
🚫 No Samples Used\n\
🎸 Loop by {{PRODUCER}}\n\
\n\
────────────────────────────\n\
\n\
LICENSING:\n\
✅ Free for non-profit use — must credit \"{{PRODUCER_PROD}}\" in title\n\
💰 For monetization on Spotify, Apple Music, YouTube, etc — purchase a lease\n\
👑 For exclusive ownership — contact via email\n\
\n\
────────────────────────────\n\
\n\
Time codes:\n\
0:00 - Intro\n\
[TIMESTAMP] - Chorus\n\
[TIMESTAMP] - Verse\n\
[TIMESTAMP] - Chorus\n\
[TIMESTAMP] - Verse\n\
[TIMESTAMP] - Chorus\n\
[TIMESTAMP] - Outro\n\
\n\
────────────────────────────\n\
\n\
TAGS:\n\
{{HASHTAGS}}\n";
