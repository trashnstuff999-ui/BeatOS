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
    pub date: String,       // YYYY-MM-DD (scheduled_at, sonst uploaded_at)
    pub platform: String,   // beatstars | soundcloud | youtube
    pub status: String,     // scheduled | uploaded
    pub beat_id: String,
    pub beat_name: String,
    /// Voller Pfad zum Cover — die Planung zeigt Covers statt Punkte.
    pub cover: Option<String>,
}

/// Ein Beat, dessen geplanter Tag vorbei ist und der noch nicht als live
/// bestätigt wurde.
#[derive(Debug, Serialize)]
pub struct OverdueBeat {
    pub beat_id: String,
    pub beat_name: String,
    /// Frühester überfälliger Termin, YYYY-MM-DD.
    pub date: String,
    pub cover: Option<String>,
}

/// Geplante Uploads, deren Tag vorbei ist. Sie werden nicht mehr von selbst
/// „Live" (Entscheidung 13.11.2026): der Termin steht nur in BeatOS, ob der
/// Upload wirklich stattfand, weiß nur Stephan. Heute Geplantes zählt nicht.
#[tauri::command(async)]
pub fn get_overdue_uploads() -> Result<Vec<OverdueBeat>, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(&format!(
        "SELECT b.id, b.name, MIN(u.scheduled_at), b.path
         FROM (SELECT beat_id, scheduled_at FROM beat_uploads WHERE {}) u
         JOIN beats b ON b.id = u.beat_id
         GROUP BY b.id ORDER BY 3",
        super::UEBERFAELLIG,
    )).map_err(|e| e.to_string())?;
    let beats = stmt
        .query_map([], |row| Ok(OverdueBeat {
            beat_id:   row.get(0)?,
            beat_name: row.get(1)?,
            date:      row.get(2)?,
            cover:     row.get::<_, Option<String>>(3)?
                .and_then(|p| crate::commands::get_beat_cover_path(p).ok().flatten()),
        }))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(beats)
}

/// All scheduled/uploaded platform entries between two dates (inclusive).
/// Dates are YYYY-MM-DD strings, so a plain string BETWEEN is correct.
///
/// Der Tag ist der geplante, sonst der Upload-Tag: zwei Drittel der Uploads
/// werden ohne Termin direkt eingetragen und fehlten sonst in der Woche.
#[tauri::command(async)]
pub fn get_upload_schedule(from_date: String, to_date: String) -> Result<Vec<ScheduleEntry>, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT tag, platform, status, id, name, path FROM (
           SELECT COALESCE(NULLIF(u.scheduled_at, ''), substr(u.uploaded_at, 1, 10)) AS tag,
                  u.platform, u.status, b.id, b.name, b.path
           FROM beat_uploads u JOIN beats b ON b.id = u.beat_id)
         WHERE tag BETWEEN ?1 AND ?2
         ORDER BY tag, platform",
    ).map_err(|e| e.to_string())?;

    let entries: Vec<ScheduleEntry> = stmt
        .query_map(rusqlite::params![from_date, to_date], |row| {
            Ok(ScheduleEntry {
                date:      row.get(0)?,
                platform:  row.get(1)?,
                status:    row.get(2)?,
                beat_id:   row.get(3)?,
                beat_name: row.get(4)?,
                cover:     row.get::<_, Option<String>>(5)?
                    .and_then(|p| crate::commands::get_beat_cover_path(p).ok().flatten()),
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(entries)
}

// ═══════════════════════════════════════════════════════════════════════════════
// Warteschlange: fertig, aber noch ohne Termin
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Serialize)]
pub struct QueueBeat {
    pub id: String,
    pub name: String,
    pub cover: Option<String>,
    pub key: Option<String>,
    pub bpm: Option<f64>,
    pub created_date: Option<String>,
    /// Was vor dem Upload noch fehlt ("Infos", "Audio", "Cover") — leer = bereit.
    pub fehlt: Vec<String>,
}

/// Wie weit zurück die Warteschlange schaut. `beat_uploads` wird erst seit
/// 02/2026 geführt: ältere Beats sind oft längst hochgeladen, haben aber
/// keinen Eintrag — ohne Grenze stünden sie alle als „fertig, ohne Termin" da.
// ponytail: feste Grenze; entfällt, wenn der Archiv-Tab Uploads nacherfassen kann.
const WARTESCHLANGE_TAGE: i64 = 180;

/// Beats ohne Termin auf irgendeiner Plattform — mit dem, was vor dem
/// Upload noch fehlt.
///
/// Nur „bereite" Beats zu zeigen, ließ die Liste fast immer leer: gemessen
/// am 17.10.2026 hatten nur 3 Beats Infos, aber keinen Termin — die Infos
/// entstehen meist erst beim Upload. Einplanen darf man vorher; was fehlt,
/// steht dabei.
#[tauri::command(async)]
pub fn get_upload_queue() -> Result<Vec<QueueBeat>, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT b.id, b.name, b.path, b.key, b.bpm, b.created_date,
                TRIM(COALESCE(b.type_beat_main, '')) != '' AND TRIM(COALESCE(b.genre_tags, '')) != ''
         FROM beats b
         WHERE b.path IS NOT NULL
           AND COALESCE(b.created_date, '') >= date('now', ?1)
           AND COALESCE(b.upload_skip, 0) = 0
           AND NOT EXISTS (
             SELECT 1 FROM beat_uploads u WHERE u.beat_id = b.id
               AND ((u.scheduled_at IS NOT NULL AND u.scheduled_at != '') OR u.status = 'uploaded'))
         ORDER BY b.created_date DESC",
    ).map_err(|e| e.to_string())?;
    type Zeile = (String, String, String, Option<String>, Option<f64>, Option<String>, bool);
    let zeilen: Vec<Zeile> = stmt
        .query_map(rusqlite::params![format!("-{WARTESCHLANGE_TAGE} days")],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(zeilen.into_iter()
        .map(|(id, name, path, key, bpm, created_date, infos)| {
            let a = scan_beat_assets(Path::new(&path));
            let mut fehlt = Vec::new();
            if !infos { fehlt.push("Infos".to_string()); }
            if a.mp3.is_none() && a.wav.is_none() { fehlt.push("Audio".to_string()); }
            if a.cover.is_none() { fehlt.push("Cover".to_string()); }
            QueueBeat {
                id, name, fehlt, key, bpm, created_date,
                cover: crate::commands::get_beat_cover_path(path).ok().flatten(),
            }
        })
        .collect())
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
    /// Kapitelmarken, eine Zeile je Marke ("0:00 Intro").
    pub timecodes: Option<String>,
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
    /// Voller Pfad zu `flp` — das Archiv öffnet ihn direkt in FL Studio.
    pub flp_path: Option<String>,
    pub cover: Option<String>,
    pub thumbnail: Option<String>,
    pub video: Option<String>,
    pub upload_files: UploadFilesState,
    /// MP3/WAV im Root, die neben der neuesten liegen — „ältere Exporte".
    pub alte_exporte: usize,
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
                youtube_tags, soundcloud_tags, timecodes
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
                timecodes:           row.get(10).ok(),
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
        mp3: None, wav: None, flp: None, flp_path: None,
        cover: None, thumbnail: None, video: None,
        alte_exporte: 0,
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
    out.alte_exporte = super::rename::count_old_audio(beat_root);

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
        if let Some(path) = pick_flp(&beat_root.join(subdir_name)) {
            out.flp = path.file_name().and_then(|n| n.to_str()).map(String::from);
            out.flp_path = Some(path.to_string_lossy().to_string());
            break;
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

/// Welche FLP eines Ordners „die" FLP ist — dieselbe Regel wie beim Umbenennen
/// (rename.rs): "master" im Namen gewinnt, sonst die neueste. Vorher war es die
/// erste, die das Dateisystem lieferte — mit _old daneben also Glückssache.
fn pick_flp(dir: &Path) -> Option<std::path::PathBuf> {
    let flps: Vec<_> = fs::read_dir(dir).ok()?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.is_file()
            && p.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("flp")) == Some(true))
        .collect();
    let ist_master = |p: &std::path::PathBuf| p.file_name()
        .and_then(|n| n.to_str()).map(|n| n.to_lowercase().contains("master")).unwrap_or(false);
    flps.iter().find(|p| ist_master(p)).cloned().or_else(|| {
        flps.into_iter().max_by_key(|p| fs::metadata(p).and_then(|m| m.modified()).ok())
    })
}

/// Scan a single directory and fill any still-empty audio / video / image
/// slots on `out`. Existing values are preserved (first call wins).
fn scan_dir_into(dir: &Path, out: &mut AssetCheck) {
    let rd = match fs::read_dir(dir) {
        Ok(rd) => rd,
        Err(_) => return,
    };

    let mut images: Vec<(String, String)> = Vec::new(); // (filename, name_lowercase)
    // Bei mehreren Exporten zählt der neueste — vorher war es der erste, den
    // das Dateisystem lieferte, und die Ampel zeigte nach einem neuen Export
    // weiter den alten Namen.
    let mut mp3: Option<(String, std::time::SystemTime)> = None;
    let mut wav: Option<(String, std::time::SystemTime)> = None;
    let neuer = |slot: &mut Option<(String, std::time::SystemTime)>, name: String, path: &Path| {
        let t = fs::metadata(path).and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH);
        if slot.as_ref().map_or(true, |(_, alt)| t > *alt) { *slot = Some((name, t)); }
    };

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
            "mp3" if out.mp3.is_none()   => neuer(&mut mp3, file_name, &path),
            "wav" if out.wav.is_none()   => neuer(&mut wav, file_name, &path),
            "mp4" if out.video.is_none() => out.video = Some(file_name),
            _ if is_image_extension(&ext) => {
                let lower = file_name.to_lowercase();
                images.push((file_name, lower));
            }
            _ => {}
        }
    }
    if let Some((n, _)) = mp3 { out.mp3 = Some(n); }
    if let Some((n, _)) = wav { out.wav = Some(n); }

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
    use super::super::write::ueberfaellig_bestaetigen;

    #[test]
    fn pick_flp_master_vor_neuester() {
        let dir = std::env::temp_dir().join(format!("beatos_pick_flp_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("SONG_master.flp"), b"").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(dir.join("SONG_old.flp"), b"").unwrap();
        std::fs::write(dir.join("notiz.txt"), b"").unwrap();
        assert!(super::pick_flp(&dir).unwrap().ends_with("SONG_master.flp"));
        // Ohne master: die neueste
        std::fs::remove_file(dir.join("SONG_master.flp")).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(dir.join("SONG.flp"), b"").unwrap();
        assert!(super::pick_flp(&dir).unwrap().ends_with("SONG.flp"));
        assert!(super::pick_flp(&dir.join("gibtsnicht")).is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }
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

    /// Bestätigen macht nur die überfälligen Termine DIESES Beats live, mit
    /// dem geplanten Tag als Upload-Datum. Alles andere bleibt stehen.
    #[test]
    fn bestaetigen_nur_ueberfaellige_des_beats() {
        let conn = test_conn();
        let today: String = conn.query_row("SELECT date('now','localtime')", [], |r| r.get(0)).unwrap();
        insert(&conn, "0001", "youtube", "scheduled", Some("2020-01-15"), None);
        insert(&conn, "0001", "soundcloud", "scheduled", Some("2099-12-31"), None);
        insert(&conn, "0001", "beatstars", "scheduled", Some(&today), None);
        insert(&conn, "0002", "youtube", "scheduled", Some("2020-01-15"), None);
        insert(&conn, "0003", "beatstars", "draft", None, None);

        assert_eq!(ueberfaellig_bestaetigen(&conn, "0001").unwrap(), 1);
        assert_eq!(row(&conn, "0001", "youtube"), ("uploaded".into(), Some("2020-01-15".into())));
        assert_eq!(row(&conn, "0001", "soundcloud").0, "scheduled", "Zukunft bleibt geplant");
        assert_eq!(row(&conn, "0001", "beatstars").0, "scheduled", "heute bleibt geplant");
        assert_eq!(row(&conn, "0002", "youtube").0, "scheduled", "anderer Beat bleibt, nichts wird von selbst live");
        assert_eq!(row(&conn, "0003", "beatstars").0, "draft");
    }

    /// Auf einen Tag ziehen plant alle Plattformen ein — schon Hochgeladenes
    /// behält Zustand und Datum.
    #[test]
    fn release_einplanen_laesst_hochgeladenes_stehen() {
        let conn = test_conn();
        conn.execute(
            "INSERT INTO beat_uploads (beat_id, platform, status, scheduled_at, uploaded_at)
             VALUES ('0900', 'beatstars', 'uploaded', '2026-10-01', '2026-10-01')", [],
        ).unwrap();
        super::super::write::release_einplanen(&conn, "0900", "2026-10-24").unwrap();

        let zeile = |p: &str| conn.query_row(
            "SELECT status, scheduled_at FROM beat_uploads WHERE beat_id = '0900' AND platform = ?1",
            [p], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
        ).unwrap();
        assert_eq!(zeile("beatstars"), ("uploaded".into(), "2026-10-01".into()));
        assert_eq!(zeile("youtube"), ("scheduled".into(), "2026-10-24".into()));
        assert_eq!(zeile("soundcloud"), ("scheduled".into(), "2026-10-24".into()));
    }
}
