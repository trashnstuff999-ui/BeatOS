// src-tauri/src/lib.rs
use rusqlite::{Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};

const DB_PATH: &str = r"C:\Users\kismo\OneDrive\Dokumente\._BEAT LIBRARY\beats.db";

fn open_db() -> SqlResult<Connection> {
    Connection::open(DB_PATH)
}

// ── Structs ───────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Beat {
    pub id: String,
    pub name: String,
    pub path: Option<String>,
    pub bpm: Option<f64>,
    pub key: Option<String>,
    pub status: Option<String>,
    pub tags: Option<String>,
    pub favorite: Option<i64>,
    pub created_date: Option<String>,
    pub modified_date: Option<String>,
    pub notes: Option<String>,
    pub sold_to: Option<String>,
    pub has_artwork: Option<i64>,
    pub has_video: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Stats {
    pub total: i64,
    pub this_month: i64,
    pub favorites: i64,
    pub avg_bpm: f64,
    pub by_status: ByStatus,
    pub top_keys: Vec<KeyCount>,
    pub top_tags: Vec<TagCount>,
    pub beats_per_month: Vec<MonthCount>,
    pub recent_beats: Vec<Beat>,
    pub available_years: Vec<i64>,
    pub selected_year: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ByStatus {
    pub idea: i64,
    pub wip: i64,
    pub finished: i64,
    pub sold: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct KeyCount {
    pub key: String,
    pub count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TagCount {
    pub tag: String,
    pub count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MonthCount {
    pub month: String,
    pub count: i64,
}

// ── Helper ────────────────────────────────────────────────────────────────────

fn row_to_beat(row: &rusqlite::Row) -> SqlResult<Beat> {
    Ok(Beat {
        id:            row.get::<_, String>(0).unwrap_or_default(),
        name:          row.get::<_, String>(1).unwrap_or_default(),
        path:          row.get(2).ok(),
        bpm:           row.get(3).ok(),
        key:           row.get(4).ok(),
        status:        row.get(5).ok(),
        tags:          row.get(6).ok(),
        favorite:      row.get(7).ok(),
        created_date:  row.get(8).ok(),
        modified_date: row.get(9).ok(),
        notes:         row.get(10).ok(),
        sold_to:       row.get(11).ok(),
        has_artwork:   row.get(12).ok(),
        has_video:     row.get(13).ok(),
    })
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}


// ── Scan & Import ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct ScanResult {
    pub found: i64,
    pub imported: i64,
    pub skipped: i64,
    pub errors: Vec<String>,
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

fn file_creation_date(path: &std::path::Path) -> Option<String> {
    use std::time::UNIX_EPOCH;
    let meta = std::fs::metadata(path).ok()?;
    let sys_time = meta.created().or_else(|_| meta.modified()).ok()?;
    let secs = sys_time.duration_since(UNIX_EPOCH).ok()?.as_secs();
    let days_since_epoch = secs / 86400;
    let (mut year, mut rem) = (1970u64, days_since_epoch);
    loop {
        let diy = if year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) { 366u64 } else { 365u64 };
        if rem < diy { break; }
        rem -= diy;
        year += 1;
    }
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let dim = [31u64, if leap {29} else {28}, 31,30,31,30,31,31,30,31,30,31];
    let mut month = 1u64;
    for &d in &dim {
        if rem < d { break; }
        rem -= d;
        month += 1;
    }
    Some(format!("{:04}-{:02}-{:02}", year, month, rem + 1))
}

#[tauri::command]
fn scan_archive() -> Result<ScanResult, String> {
    let archive_path = r"C:\Users\kismo\OneDrive\Dokumente\._BEAT LIBRARY\03_ARCHIVE";
    let conn = open_db().map_err(|e| e.to_string())?;

    let mut id_stmt = conn.prepare("SELECT id FROM beats").map_err(|e| e.to_string())?;
    let existing_ids: std::collections::HashSet<String> = id_stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut found    = 0i64;
    let mut imported = 0i64;
    let mut skipped  = 0i64;
    let mut errors: Vec<String> = Vec::new();

    let archive_dir = std::path::Path::new(archive_path);
    if !archive_dir.exists() {
        return Err(format!("Archive not found: {}", archive_path));
    }

    for year_entry in std::fs::read_dir(archive_dir).map_err(|e| e.to_string())?.filter_map(|e| e.ok()) {
        let year_path = year_entry.path();
        if !year_path.is_dir() { continue; }

        for month_entry in std::fs::read_dir(&year_path).unwrap_or_else(|_| panic!()).filter_map(|e| e.ok()) {
            let month_path = month_entry.path();
            if !month_path.is_dir() { continue; }

            for beat_entry in std::fs::read_dir(&month_path).unwrap_or_else(|_| panic!()).filter_map(|e| e.ok()) {
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
                    // Alle .flp Dateien sammeln + älteste nehmen
                    let mut flp_dates: Vec<(std::time::SystemTime, std::path::PathBuf)> = Vec::new();
                    if let Ok(entries) = std::fs::read_dir(&projects_path) {
                        for e in entries.filter_map(|e| e.ok()) {
                            let p = e.path();
                            if p.extension().and_then(|x| x.to_str()) == Some("flp") {
                                if let Ok(meta) = std::fs::metadata(&p) {
                                    // created() bevorzugen, fallback modified()
                                    let t = meta.created().or_else(|_| meta.modified());
                                    if let Ok(t) = t { flp_dates.push((t, p)); }
                                }
                            }
                        }
                    }
                    // Älteste FLP = kleinster Timestamp
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


#[derive(Debug, Serialize, Deserialize)]
pub struct FixDatesResult {
    pub updated: i64,
    pub not_found: i64,   // Beat in DB aber kein Ordner gefunden
    pub no_flp: i64,      // Ordner gefunden aber keine FLP
    pub errors: Vec<String>,
}

#[tauri::command]
fn fix_dates() -> Result<FixDatesResult, String> {
    let archive_path = r"C:\Users\kismo\OneDrive\Dokumente\._BEAT LIBRARY\03_ARCHIVE";
    let conn = open_db().map_err(|e| e.to_string())?;

    // Alle Beats aus DB laden: id + path
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
        // Beat-Ordner finden: entweder über gespeicherten path oder durch Suche im Archiv
        let beat_path = if let Some(ref p) = beat.path {
            let p = std::path::PathBuf::from(p);
            if p.exists() { Some(p) } else { None }
        } else { None };

        // Falls path nicht gesetzt oder nicht existiert: im Archiv nach ID suchen
        let beat_path = if beat_path.is_none() {
            find_beat_in_archive(archive_path, &beat.id)
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

        // Älteste FLP in 03_PROJECTS suchen
        // Datum aus Archiv-Pfad ableiten (zuverlässigste Quelle)
        // z.B. 03_ARCHIVE\2024\10_OCTOBER\Beat → "2024-10-01"
        let new_date = date_from_archive_path(&beat_path);

        // Fallback: Modified-Date der ältesten FLP
        let new_date = if new_date.is_none() {
            let projects_path = beat_path.join("03_PROJECTS");
            if projects_path.exists() {
                let mut flp_dates: Vec<(std::time::SystemTime, std::path::PathBuf)> = Vec::new();
                if let Ok(entries) = std::fs::read_dir(&projects_path) {
                    for e in entries.filter_map(|e| e.ok()) {
                        let p = e.path();
                        if p.extension().and_then(|x| x.to_str()) == Some("flp") {
                            if let Ok(meta) = std::fs::metadata(&p) {
                                // Modified-Date — bleibt beim Kopieren erhalten
                                if let Ok(t) = meta.modified() { flp_dates.push((t, p)); }
                            }
                        }
                    }
                }
                flp_dates.sort_by_key(|(t, _)| *t);
                flp_dates.first().and_then(|(_, p)| {
                    use std::time::UNIX_EPOCH;
                    let meta = std::fs::metadata(p).ok()?;
                    let secs = meta.modified().ok()?.duration_since(UNIX_EPOCH).ok()?.as_secs();
                    let days = secs / 86400;
                    let (mut y, mut rem) = (1970u64, days);
                    loop {
                        let diy = if y%4==0 && (y%100!=0||y%400==0) {366u64} else {365u64};
                        if rem < diy { break; } rem -= diy; y += 1;
                    }
                    let leap = y%4==0 && (y%100!=0||y%400==0);
                    let dim = [31u64,if leap{29}else{28},31,30,31,30,31,31,30,31,30,31];
                    let mut m = 1u64;
                    for &d in &dim { if rem < d { break; } rem -= d; m += 1; }
                    Some(format!("{:04}-{:02}-{:02}", y, m, rem+1))
                })
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

        // DB updaten
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

// Datum aus Archiv-Pfad ableiten: ...\2024\10_OCTOBER\... → "2024-10-01"
fn date_from_archive_path(beat_path: &std::path::Path) -> Option<String> {
    // beat_path = .../03_ARCHIVE/2024/10_OCTOBER/0809 - Name
    // parent    = .../03_ARCHIVE/2024/10_OCTOBER  (Monatsordner)
    // parent²   = .../03_ARCHIVE/2024             (Jahresordner)
    let month_dir = beat_path.parent()?;
    let year_dir  = month_dir.parent()?;

    // Jahresordner: muss eine 4-stellige Zahl sein
    let year_str = year_dir.file_name()?.to_str()?;
    let year: u32 = year_str.parse().ok()?;
    if year < 2000 || year > 2100 { return None; }

    // Monatsordner: "01_JANUARY", "06_JUNE", "10_OCTOBER" etc.
    // Nimm die ersten 2 Zeichen als Monatsnummer
    let month_str = month_dir.file_name()?.to_str()?;
    let month_num: u32 = month_str
        .chars()
        .take(2)
        .collect::<String>()
        .parse()
        .ok()?;
    if month_num < 1 || month_num > 12 { return None; }

    Some(format!("{:04}-{:02}-01", year, month_num))
}

// Hilfsfunktion: Beat-Ordner anhand ID im Archiv finden
fn find_beat_in_archive(archive_path: &str, id: &str) -> Option<std::path::PathBuf> {
    let archive_dir = std::path::Path::new(archive_path);
    // Jahr → Monat → Beat-Ordner
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
                    // Startet mit ID gefolgt von " - "
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

// Diagnose — zeigt rohe Datumswerte aus der DB
#[tauri::command]
fn get_date_sample() -> Result<Vec<String>, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT created_date FROM beats WHERE created_date IS NOT NULL LIMIT 20"
    ).map_err(|e| e.to_string())?;
    let dates: Vec<String> = stmt
        .query_map([], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(dates)
}

#[tauri::command]
fn get_stats(year: Option<i64>) -> Result<Stats, String> {
    let conn = open_db().map_err(|e| e.to_string())?;

    // Verfügbare Jahre aus der DB
    let mut yr_stmt = conn.prepare(
        "SELECT DISTINCT CAST(strftime('%Y', created_date) AS INTEGER) as yr
         FROM beats WHERE created_date IS NOT NULL AND created_date != ''
         ORDER BY yr DESC"
    ).map_err(|e| e.to_string())?;

    let available_years: Vec<i64> = yr_stmt
        .query_map([], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // Aktuelles Jahr via SQLite
    let current_year: i64 = conn
        .query_row("SELECT CAST(strftime('%Y', 'now') AS INTEGER)", [], |r| r.get(0))
        .unwrap_or(2025);

    let selected_year: i64 = year.unwrap_or(current_year);

    // Total
    let total: i64 = conn
        .query_row("SELECT COUNT(*) FROM beats", [], |r| r.get(0))
        .unwrap_or(0);

    // This month
    let this_month: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM beats WHERE strftime('%Y-%m', created_date) = strftime('%Y-%m', 'now')",
            [], |r| r.get(0),
        )
        .unwrap_or(0);

    // Favorites
    let favorites: i64 = conn
        .query_row("SELECT COUNT(*) FROM beats WHERE favorite = 1", [], |r| r.get(0))
        .unwrap_or(0);

    // Avg BPM
    let avg_bpm: f64 = conn
        .query_row(
            "SELECT COALESCE(AVG(CAST(bpm AS REAL)), 0) FROM beats WHERE bpm IS NOT NULL AND bpm != ''",
            [], |r| r.get(0),
        )
        .unwrap_or(0.0);

    // By status
    let count_status = |s: &str| -> i64 {
        conn.query_row(
            "SELECT COUNT(*) FROM beats WHERE LOWER(status) = LOWER(?1)",
            [s], |r| r.get(0),
        ).unwrap_or(0)
    };

    let by_status = ByStatus {
        idea:     count_status("idea"),
        wip:      count_status("wip"),
        finished: count_status("finished"),
        sold:     count_status("sold"),
    };

    // Top keys — alle, kein Limit
    let mut stmt = conn.prepare(
        "SELECT key, COUNT(*) as cnt FROM beats WHERE key IS NOT NULL AND key != ''
         GROUP BY key ORDER BY cnt DESC",
    ).map_err(|e| e.to_string())?;

    let top_keys: Vec<KeyCount> = stmt
        .query_map([], |r| Ok(KeyCount { key: r.get(0)?, count: r.get(1)? }))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // Top tags — normalisiert lowercase
    let mut tag_map: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    let mut stmt2 = conn
        .prepare("SELECT tags FROM beats WHERE tags IS NOT NULL AND tags != ''")
        .map_err(|e| e.to_string())?;

    let tag_rows: Vec<String> = stmt2
        .query_map([], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    for tags_str in tag_rows {
        for tag in tags_str.split(',') {
            let t = tag.trim().to_lowercase();
            if !t.is_empty() {
                *tag_map.entry(t).or_insert(0) += 1;
            }
        }
    }

    let mut top_tags: Vec<TagCount> = tag_map
        .into_iter()
        .map(|(tag, count)| TagCount { tag, count })
        .collect();
    top_tags.sort_by(|a, b| b.count.cmp(&a.count));
    top_tags.truncate(20);

    // Beats per month — alle 12 Monate Jan–Dez des gewählten Jahres
    let mut stmt3 = conn.prepare(
        "SELECT strftime('%Y-%m', created_date) as month, COUNT(*) as cnt
         FROM beats
         WHERE created_date IS NOT NULL AND created_date != ''
           AND strftime('%Y', created_date) = ?1
         GROUP BY month ORDER BY month ASC",
    ).map_err(|e| e.to_string())?;

    let db_months: std::collections::HashMap<String, i64> = stmt3
        .query_map([selected_year.to_string()], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let beats_per_month: Vec<MonthCount> = (1i32..=12)
        .map(|m| {
            let key = format!("{}-{:02}", selected_year, m);
            let count = *db_months.get(&key).unwrap_or(&0);
            MonthCount { month: key, count }
        })
        .collect();

    // Recent beats
    let mut stmt4 = conn.prepare(
        "SELECT id, name, path, bpm, key, status, tags, favorite,
                created_date, modified_date, notes, sold_to, has_artwork, has_video
         FROM beats ORDER BY created_date DESC LIMIT 5",
    ).map_err(|e| e.to_string())?;

    let recent_beats: Vec<Beat> = stmt4
        .query_map([], row_to_beat)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Stats {
        total, this_month, favorites,
        avg_bpm: (avg_bpm * 10.0).round() / 10.0,
        by_status, top_keys, top_tags,
        beats_per_month, recent_beats,
        available_years, selected_year,
    })
}

#[tauri::command]
fn get_beats(
    search: Option<String>,
    status_filter: Option<String>,
    only_favs: bool,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<Beat>, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let lim    = limit.unwrap_or(50);
    let off    = offset.unwrap_or(0);
    let search = search.unwrap_or_default().to_lowercase();

    let mut sql = String::from(
        "SELECT id, name, path, bpm, key, status, tags, favorite,
                created_date, modified_date, notes, sold_to, has_artwork, has_video
         FROM beats WHERE 1=1",
    );

    if !search.is_empty() {
        sql.push_str(&format!(
            " AND (LOWER(name) LIKE '%{s}%' OR LOWER(id) LIKE '%{s}%' OR LOWER(key) LIKE '%{s}%' OR LOWER(tags) LIKE '%{s}%')",
            s = search
        ));
    }

    if let Some(ref s) = status_filter {
        if s != "all" {
            sql.push_str(&format!(" AND LOWER(status) = LOWER('{}')", s));
        }
    }

    if only_favs {
        sql.push_str(" AND favorite = 1");
    }

    sql.push_str(&format!(" ORDER BY created_date DESC LIMIT {} OFFSET {}", lim, off));

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let beats: Vec<Beat> = stmt
        .query_map([], row_to_beat)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(beats)
}

#[tauri::command]
fn get_beat_count() -> Result<i64, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    conn.query_row("SELECT COUNT(*) FROM beats", [], |r| r.get(0))
        .map_err(|e| e.to_string())
}

// ── Entry Point ───────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_stats,
            get_beats,
            get_beat_count,
            get_date_sample,
            scan_archive,
            fix_dates,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}