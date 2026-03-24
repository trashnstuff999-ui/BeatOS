// src-tauri/src/commands/beats.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Beat CRUD Commands
// ═══════════════════════════════════════════════════════════════════════════════

use crate::db::{open_db, Beat, PaginatedBeatsResponse, UpdateBeatParams, row_to_beat};

#[tauri::command]
pub fn get_beats(
    search: Option<String>,
    status_filter: Option<String>,
    only_favs: bool,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<Beat>, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(50);
    let off = offset.unwrap_or(0);
    
    let mut where_clauses: Vec<String> = vec!["1=1".to_string()];
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![];
    let mut param_idx = 1;
    
    if let Some(ref s) = search {
        let search_lower = s.to_lowercase();
        if !search_lower.is_empty() {
            let search_pattern = format!("%{}%", search_lower);
            where_clauses.push(format!(
                "(LOWER(name) LIKE ?{idx} OR LOWER(id) LIKE ?{idx} OR LOWER(key) LIKE ?{idx} OR LOWER(tags) LIKE ?{idx})",
                idx = param_idx
            ));
            params.push(Box::new(search_pattern));
            param_idx += 1;
        }
    }
    
    if let Some(ref s) = status_filter {
        if s != "all" {
            where_clauses.push(format!("LOWER(status) = LOWER(?{})", param_idx));
            params.push(Box::new(s.clone()));
            let _ = param_idx; // Suppress warning
        }
    }
    
    if only_favs {
        where_clauses.push("favorite = 1".to_string());
    }
    
    let where_sql = where_clauses.join(" AND ");
    let sql = format!(
        "SELECT id, name, path, bpm, key, status, tags, favorite,
                created_date, modified_date, notes, sold_to, has_artwork, has_video
         FROM beats WHERE {} ORDER BY CAST(id AS INTEGER) DESC LIMIT {} OFFSET {}",
        where_sql, lim, off
    );
    
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    
    let beats: Vec<Beat> = stmt
        .query_map(param_refs.as_slice(), row_to_beat)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(beats)
}

#[tauri::command]
pub fn get_beats_paginated(
    search: Option<String>,
    status_filter: Option<String>,
    only_favs: bool,
    key_filter: Option<Vec<String>>,
    bpm_min: Option<i32>,
    bpm_max: Option<i32>,
    sort_column: Option<String>,
    sort_direction: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<PaginatedBeatsResponse, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(50);
    let off = offset.unwrap_or(0);
    
    let mut where_clauses: Vec<String> = vec!["1=1".to_string()];
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![];
    let mut param_idx = 1;
    
    // Search filter
    if let Some(ref s) = search {
        let search_lower = s.to_lowercase();
        if !search_lower.is_empty() {
            let search_pattern = format!("%{}%", search_lower);
            where_clauses.push(format!(
                "(LOWER(name) LIKE ?{idx} OR LOWER(id) LIKE ?{idx} OR LOWER(key) LIKE ?{idx} OR LOWER(tags) LIKE ?{idx})",
                idx = param_idx
            ));
            params.push(Box::new(search_pattern));
            param_idx += 1;
        }
    }
    
    // Status filter
    if let Some(ref s) = status_filter {
        if s != "all" {
            where_clauses.push(format!("LOWER(status) = LOWER(?{})", param_idx));
            params.push(Box::new(s.clone()));
            param_idx += 1;
        }
    }
    
    if only_favs {
        where_clauses.push("favorite = 1".to_string());
    }
    
    // Key filter
    if let Some(ref keys) = key_filter {
        if !keys.is_empty() {
            let mut key_conditions: Vec<String> = vec![];
            for key in keys {
                let normalized = key.to_lowercase()
                    .replace(" ", "")
                    .replace("minor", "m")
                    .replace("min", "m")
                    .replace("major", "")
                    .replace("maj", "");
                
                key_conditions.push(format!(
                    "LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(key, ' ', ''), 'minor', 'm'), 'min', 'm'), 'major', ''), 'maj', '')) = ?{}",
                    param_idx
                ));
                params.push(Box::new(normalized));
                param_idx += 1;
            }
            where_clauses.push(format!("({})", key_conditions.join(" OR ")));
        }
    }
    
    // BPM range
    if let Some(min) = bpm_min {
        where_clauses.push(format!("bpm >= ?{}", param_idx));
        params.push(Box::new(min));
        param_idx += 1;
    }
    if let Some(max) = bpm_max {
        where_clauses.push(format!("bpm <= ?{}", param_idx));
        params.push(Box::new(max));
    }
    
    let where_sql = where_clauses.join(" AND ");
    
    // Count total
    let count_sql = format!("SELECT COUNT(*) FROM beats WHERE {}", where_sql);
    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    
    let total_count: i64 = conn
        .query_row(&count_sql, param_refs.as_slice(), |r| r.get(0))
        .map_err(|e| e.to_string())?;
    
    // WHITELIST validation for sort
    let sort_col = sort_column.unwrap_or_else(|| "id".to_string());
    let sort_dir_input = sort_direction.unwrap_or_else(|| "desc".to_string()).to_uppercase();
    
    let order_expr = match sort_col.as_str() {
        "id" => "CAST(id AS INTEGER)",
        "name" => "LOWER(name)",
        "bpm" => "COALESCE(bpm, 0)",
        "key" => "COALESCE(LOWER(key), 'zzz')",
        "status" => "COALESCE(status, 'zzz')",
        _ => "CAST(id AS INTEGER)",
    };
    
    let sort_dir = match sort_dir_input.as_str() {
        "ASC" => "ASC",
        "DESC" => "DESC",
        _ => "DESC",
    };
    
    let sql = format!(
        "SELECT id, name, path, bpm, key, status, tags, favorite,
                created_date, modified_date, notes, sold_to, has_artwork, has_video
         FROM beats WHERE {} ORDER BY {} {} LIMIT {} OFFSET {}",
        where_sql, order_expr, sort_dir, lim, off
    );
    
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let beats: Vec<Beat> = stmt
        .query_map(param_refs.as_slice(), row_to_beat)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    
    Ok(PaginatedBeatsResponse { beats, total_count })
}

#[tauri::command]
pub fn toggle_favorite(beat_id: String, favorite: bool) -> Result<(), String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE beats SET favorite = ?1, modified_date = datetime('now') WHERE id = ?2",
        rusqlite::params![if favorite { 1 } else { 0 }, beat_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_beat_status(beat_id: String, status: String) -> Result<(), String> {
    let valid_statuses = ["idea", "wip", "finished", "sold"];
    if !valid_statuses.contains(&status.to_lowercase().as_str()) {
        return Err(format!("Invalid status: {}. Must be one of: {:?}", status, valid_statuses));
    }
    
    let conn = open_db().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE beats SET status = ?1, modified_date = datetime('now') WHERE id = ?2",
        rusqlite::params![status.to_lowercase(), beat_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_beat(params: UpdateBeatParams) -> Result<(), String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    
    let mut updates: Vec<String> = Vec::new();
    let mut values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    
    if let Some(ref name) = params.name {
        updates.push("name = ?".to_string());
        values.push(Box::new(name.clone()));
    }
    
    if let Some(bpm) = params.bpm {
        updates.push("bpm = ?".to_string());
        values.push(Box::new(bpm));
    }
    
    if let Some(ref key) = params.key {
        updates.push("key = ?".to_string());
        values.push(Box::new(key.clone()));
    }
    
    if let Some(ref status) = params.status {
        let valid_statuses = ["idea", "wip", "finished", "sold"];
        let status_lower = status.to_lowercase();
        if !valid_statuses.contains(&status_lower.as_str()) {
            return Err(format!("Invalid status: {}", status));
        }
        updates.push("status = ?".to_string());
        values.push(Box::new(status_lower));
    }
    
    if let Some(ref tags) = params.tags {
        updates.push("tags = ?".to_string());
        values.push(Box::new(tags.clone()));
    }
    
    if let Some(ref notes) = params.notes {
        updates.push("notes = ?".to_string());
        values.push(Box::new(notes.clone()));
    }
    
    if let Some(ref sold_to) = params.sold_to {
        updates.push("sold_to = ?".to_string());
        values.push(Box::new(sold_to.clone()));
    }
    
    updates.push("modified_date = datetime('now')".to_string());
    
    if updates.len() == 1 {
        return Ok(());
    }
    
    let sql = format!("UPDATE beats SET {} WHERE id = ?", updates.join(", "));
    values.push(Box::new(params.id.clone()));
    
    let value_refs: Vec<&dyn rusqlite::ToSql> = values.iter().map(|v| v.as_ref()).collect();
    
    conn.execute(&sql, value_refs.as_slice())
        .map_err(|e| format!("Failed to update beat: {}", e))?;
    
    Ok(())
}

#[tauri::command]
pub fn get_beat_by_id(beat_id: String) -> Result<Option<Beat>, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare(
        "SELECT id, name, path, bpm, key, status, tags, favorite,
                created_date, modified_date, notes, sold_to, has_artwork, has_video
         FROM beats WHERE id = ?1"
    ).map_err(|e| e.to_string())?;
    
    let beat = stmt.query_row([&beat_id], row_to_beat);
    
    match beat {
        Ok(b) => Ok(Some(b)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}
