// src-tauri/src/commands/upload/read.rs
// get_upload_data — beat meta + platform rows + live filesystem asset scan.

use super::PLATFORMS;
use crate::db::open_db;
use crate::utils::is_image_extension;
use serde::Serialize;
use std::fs;
use std::path::Path;

// ═══════════════════════════════════════════════════════════════════════════════
// Upload schedule (planner strip / future calendar)
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Serialize)]
pub struct ScheduleEntry {
    pub date: String,       // YYYY-MM-DD (scheduled_at)
    pub platform: String,   // beatstars | soundcloud | youtube
    pub status: String,     // scheduled | uploaded
    pub beat_id: String,
    pub beat_name: String,
}

/// A "scheduled" entry whose date has passed: promote it to
/// "uploaded" and stamp uploaded_at with the planned day. Idempotent —
/// runs before every read so the data stays honest even across midnight.
/// Entries scheduled for TODAY stay "scheduled" until the day is over.
pub fn promote_past_scheduled(conn: &rusqlite::Connection) -> rusqlite::Result<usize> {
    conn.execute(
        "UPDATE beat_uploads
         SET status = 'uploaded',
             uploaded_at = COALESCE(uploaded_at, scheduled_at)
         WHERE status = 'scheduled'
           AND scheduled_at IS NOT NULL AND scheduled_at != ''
           AND scheduled_at < date('now','localtime')",
        [],
    )
}

/// All scheduled/uploaded platform entries between two dates (inclusive).
/// Dates are YYYY-MM-DD strings, so a plain string BETWEEN is correct.
#[tauri::command]
pub fn get_upload_schedule(from_date: String, to_date: String) -> Result<Vec<ScheduleEntry>, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    promote_past_scheduled(&conn).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT u.scheduled_at, u.platform, u.status, b.id, b.name
         FROM beat_uploads u JOIN beats b ON b.id = u.beat_id
         WHERE u.scheduled_at IS NOT NULL AND u.scheduled_at != ''
           AND u.scheduled_at BETWEEN ?1 AND ?2
         ORDER BY u.scheduled_at, u.platform",
    ).map_err(|e| e.to_string())?;

    let entries: Vec<ScheduleEntry> = stmt
        .query_map(rusqlite::params![from_date, to_date], |row| {
            Ok(ScheduleEntry {
                date:      row.get(0)?,
                platform:  row.get(1)?,
                status:    row.get(2)?,
                beat_id:   row.get(3)?,
                beat_name: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(entries)
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
    promote_past_scheduled(&conn).map_err(|e| e.to_string())?;

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
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::promote_past_scheduled;
    use rusqlite::Connection;

    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE beat_uploads (
                beat_id      TEXT NOT NULL,
                platform     TEXT NOT NULL,
                status       TEXT NOT NULL DEFAULT 'draft',
                scheduled_at TEXT,
                uploaded_at  TEXT,
                url          TEXT,
                PRIMARY KEY (beat_id, platform)
            );",
        ).unwrap();
        conn
    }

    fn insert(conn: &Connection, beat: &str, platform: &str, status: &str, scheduled: Option<&str>, uploaded: Option<&str>) {
        conn.execute(
            "INSERT INTO beat_uploads (beat_id, platform, status, scheduled_at, uploaded_at) VALUES (?1,?2,?3,?4,?5)",
            rusqlite::params![beat, platform, status, scheduled, uploaded],
        ).unwrap();
    }

    fn row(conn: &Connection, beat: &str, platform: &str) -> (String, Option<String>) {
        conn.query_row(
            "SELECT status, uploaded_at FROM beat_uploads WHERE beat_id=?1 AND platform=?2",
            rusqlite::params![beat, platform],
            |r| Ok((r.get(0)?, r.get(1)?)),
        ).unwrap()
    }

    #[test]
    fn past_scheduled_becomes_uploaded_with_stamped_date() {
        let conn = test_conn();
        insert(&conn, "0001", "youtube", "scheduled", Some("2020-01-15"), None);
        promote_past_scheduled(&conn).unwrap();
        let (status, uploaded_at) = row(&conn, "0001", "youtube");
        assert_eq!(status, "uploaded");
        assert_eq!(uploaded_at.as_deref(), Some("2020-01-15"));
    }

    #[test]
    fn future_and_today_stay_scheduled() {
        let conn = test_conn();
        let today: String = conn.query_row("SELECT date('now','localtime')", [], |r| r.get(0)).unwrap();
        insert(&conn, "0002", "soundcloud", "scheduled", Some("2099-12-31"), None);
        insert(&conn, "0003", "soundcloud", "scheduled", Some(&today), None);
        promote_past_scheduled(&conn).unwrap();
        assert_eq!(row(&conn, "0002", "soundcloud").0, "scheduled");
        assert_eq!(row(&conn, "0003", "soundcloud").0, "scheduled");
    }

    #[test]
    fn drafts_and_existing_uploads_untouched() {
        let conn = test_conn();
        insert(&conn, "0004", "beatstars", "draft", None, None);
        insert(&conn, "0005", "beatstars", "uploaded", Some("2020-01-01"), Some("2020-01-02"));
        promote_past_scheduled(&conn).unwrap();
        assert_eq!(row(&conn, "0004", "beatstars").0, "draft");
        // an existing uploaded_at is never overwritten
        assert_eq!(row(&conn, "0005", "beatstars").1.as_deref(), Some("2020-01-02"));
    }
}
