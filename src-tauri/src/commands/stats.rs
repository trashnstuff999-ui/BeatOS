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
        .unwrap_or_else(|_| {
            let (year, _, _) = crate::utils::secs_to_ymd(crate::utils::current_secs());
            year as i64
        });

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
        &format!("SELECT {} FROM beats ORDER BY created_date DESC LIMIT 5", crate::db::BEAT_COLUMNS),
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

// ══════════════════════════════════════════════════════════════════════════════
// Dashboard action stats — "Was steht heute an?"
// ══════════════════════════════════════════════════════════════════════════════

#[derive(Debug, serde::Serialize)]
pub struct WeekCount {
    pub week_start: String, // Monday, YYYY-MM-DD
    pub count: i64,
}

#[derive(Debug, serde::Serialize)]
pub struct DashboardActions {
    pub scheduled_next_7: i64,       // Uploads geplant heute..+6 Tage
    pub finished_unscheduled: i64,   // fertige Beats ohne Termin/Upload
    pub studio_ready: i64,           // Studio-Projekte mit Status 'ready'
    pub unpublished_finished: i64,   // fertige Beats ohne einen Upload
    pub published_beats: i64,        // Beats mit >=1 hochgeladener Plattform
    pub scheduled_total: i64,
    pub studio_by_status: std::collections::HashMap<String, i64>,
    pub uploads_per_week: Vec<WeekCount>, // letzte 8 Wochen, älteste zuerst
    pub current_streak_weeks: i64,
}

#[tauri::command]
pub fn get_dashboard_actions() -> Result<DashboardActions, String> {
    use crate::utils::{date_str_to_days, secs_to_date, week_index};
    let conn = open_db().map_err(|e| e.to_string())?;

    let count = |sql: &str| -> i64 {
        conn.query_row(sql, [], |r| r.get(0)).unwrap_or(0)
    };

    let scheduled_next_7 = count(
        "SELECT COUNT(*) FROM beat_uploads
         WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at != ''
           AND scheduled_at BETWEEN date('now','localtime') AND date('now','localtime','+6 days')",
    );
    let finished_unscheduled = count(
        "SELECT COUNT(*) FROM beats b WHERE LOWER(b.status) = 'finished'
           AND NOT EXISTS (SELECT 1 FROM beat_uploads u WHERE u.beat_id = b.id
                AND (u.status = 'uploaded' OR (u.scheduled_at IS NOT NULL AND u.scheduled_at != '')))",
    );
    let unpublished_finished = count(
        "SELECT COUNT(*) FROM beats b WHERE LOWER(b.status) = 'finished'
           AND NOT EXISTS (SELECT 1 FROM beat_uploads u WHERE u.beat_id = b.id AND u.status = 'uploaded')",
    );
    let published_beats = count(
        "SELECT COUNT(DISTINCT beat_id) FROM beat_uploads WHERE status = 'uploaded'",
    );
    let scheduled_total = count(
        "SELECT COUNT(*) FROM beat_uploads WHERE status = 'scheduled'",
    );

    // Studio funnel (table may be missing on very old DBs — treat as empty)
    let mut studio_by_status = std::collections::HashMap::new();
    if let Ok(mut stmt) = conn.prepare("SELECT status, COUNT(*) FROM studio_projects GROUP BY status") {
        if let Ok(rows) = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))) {
            for row in rows.flatten() {
                studio_by_status.insert(row.0, row.1);
            }
        }
    }
    let studio_ready = *studio_by_status.get("ready").unwrap_or(&0);

    // Upload rhythm: bucket uploaded_at by Monday-based week
    let today: String = conn
        .query_row("SELECT date('now','localtime')", [], |r| r.get(0))
        .unwrap_or_else(|_| secs_to_date(crate::utils::current_secs()));
    let current_week = date_str_to_days(&today).map(week_index).unwrap_or(0);

    let mut week_counts: std::collections::HashMap<i64, i64> = std::collections::HashMap::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT uploaded_at FROM beat_uploads WHERE status = 'uploaded' AND uploaded_at IS NOT NULL AND uploaded_at != ''",
    ) {
        if let Ok(rows) = stmt.query_map([], |r| r.get::<_, String>(0)) {
            for date in rows.flatten() {
                if let Some(days) = date_str_to_days(&date) {
                    *week_counts.entry(week_index(days)).or_insert(0) += 1;
                }
            }
        }
    }

    let uploads_per_week: Vec<WeekCount> = ((current_week - 7)..=current_week)
        .map(|w| {
            let monday_days = w * 7 - 3;
            WeekCount {
                week_start: secs_to_date((monday_days.max(0) as u64) * 86_400),
                count: *week_counts.get(&w).unwrap_or(&0),
            }
        })
        .collect();

    // Streak: consecutive weeks with >=1 upload, ending at the current week
    // (a still-empty current week does not break the streak yet).
    let mut streak = 0i64;
    let mut w = current_week;
    if *week_counts.get(&w).unwrap_or(&0) == 0 {
        w -= 1;
    }
    while *week_counts.get(&w).unwrap_or(&0) > 0 {
        streak += 1;
        w -= 1;
    }

    Ok(DashboardActions {
        scheduled_next_7,
        finished_unscheduled,
        studio_ready,
        unpublished_finished,
        published_beats,
        scheduled_total,
        studio_by_status,
        uploads_per_week,
        current_streak_weeks: streak,
    })
}

