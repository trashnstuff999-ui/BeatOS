// src-tauri/src/lib.rs
use rusqlite::{Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};

const DB_PATH: &str =
    r"C:\Users\kismo\OneDrive\Dokumente\._BEAT LIBRARY\beats.db";

fn open_db() -> SqlResult<Connection> {
    Connection::open(DB_PATH)
}

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

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}

#[tauri::command]
fn get_stats() -> Result<Stats, String> {
    let conn = open_db().map_err(|e| e.to_string())?;

    let total: i64 = conn
        .query_row("SELECT COUNT(*) FROM beats", [], |r| r.get(0))
        .unwrap_or(0);

    let this_month: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM beats WHERE strftime('%Y-%m', created_date) = strftime('%Y-%m', 'now')",
            [], |r| r.get(0),
        )
        .unwrap_or(0);

    let favorites: i64 = conn
        .query_row("SELECT COUNT(*) FROM beats WHERE favorite = 1", [], |r| r.get(0))
        .unwrap_or(0);

    let avg_bpm: f64 = conn
        .query_row(
            "SELECT COALESCE(AVG(CAST(bpm AS REAL)), 0) FROM beats WHERE bpm IS NOT NULL AND bpm != ''",
            [], |r| r.get(0),
        )
        .unwrap_or(0.0);

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

    let mut stmt = conn.prepare(
        "SELECT key, COUNT(*) as cnt FROM beats WHERE key IS NOT NULL AND key != ''
         GROUP BY key ORDER BY cnt DESC",
    ).map_err(|e| e.to_string())?;

    let top_keys: Vec<KeyCount> = stmt
        .query_map([], |r| Ok(KeyCount { key: r.get(0)?, count: r.get(1)? }))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

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
            let t = tag.trim().to_string();
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
    top_tags.truncate(10);

    let mut stmt3 = conn.prepare(
        "SELECT strftime('%Y-%m', created_date) as month, COUNT(*) as cnt
         FROM beats
         WHERE created_date IS NOT NULL AND created_date != ''
         GROUP BY month ORDER BY month DESC LIMIT 12",
    ).map_err(|e| e.to_string())?;

    let mut beats_per_month: Vec<MonthCount> = stmt3
        .query_map([], |r| Ok(MonthCount { month: r.get(0)?, count: r.get(1)? }))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    beats_per_month.reverse();

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
        by_status, top_keys, top_tags, beats_per_month, recent_beats,
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_stats,
            get_beats,
            get_beat_count,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}