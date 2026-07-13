// src-tauri/src/commands/upload/read.rs
// get_upload_data — beat meta + platform rows + live filesystem asset scan.

use super::PLATFORMS;
use crate::db::open_db;
use crate::utils::is_image_extension;
use serde::Serialize;
use std::fs;
use std::path::Path;

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

