// src-tauri/src/commands/stats.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Statistics Commands
// ═══════════════════════════════════════════════════════════════════════════════

use crate::db::{open_db, Beat, Stats, ByStatus, KeyCount, TagCount, MonthCount, row_to_beat};
use std::collections::HashMap;

#[tauri::command]
pub fn get_stats(year: Option<i64>) -> Result<Stats, String> {
    let conn = open_db().map_err(|e| e.to_string())?;

    // Get available years
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

    let current_year: i64 = conn
        .query_row("SELECT CAST(strftime('%Y', 'now') AS INTEGER)", [], |r| r.get(0))
        .unwrap_or(2025);

    let selected_year: i64 = year.unwrap_or(current_year);

    // Basic counts
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

    // Status counts
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

    // Top keys
    let mut stmt = conn.prepare(
        "SELECT key, COUNT(*) as cnt FROM beats WHERE key IS NOT NULL AND key != ''
         GROUP BY key ORDER BY cnt DESC",
    ).map_err(|e| e.to_string())?;

    let top_keys: Vec<KeyCount> = stmt
        .query_map([], |r| Ok(KeyCount { key: r.get(0)?, count: r.get(1)? }))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // Top tags
    let mut tag_map: HashMap<String, i64> = HashMap::new();
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

    // Beats per month
    let mut stmt3 = conn.prepare(
        "SELECT strftime('%Y-%m', created_date) as month, COUNT(*) as cnt
         FROM beats
         WHERE created_date IS NOT NULL AND created_date != ''
           AND strftime('%Y', created_date) = ?1
         GROUP BY month ORDER BY month ASC",
    ).map_err(|e| e.to_string())?;

    let db_months: HashMap<String, i64> = stmt3
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
pub fn get_beat_count() -> Result<i64, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    conn.query_row("SELECT COUNT(*) FROM beats", [], |r| r.get(0))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_date_sample() -> Result<Vec<String>, String> {
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
