// src-tauri/src/commands/beats.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Beat CRUD Commands
// ═══════════════════════════════════════════════════════════════════════════════

use crate::db::{open_db, Beat, PaginatedBeatsResponse, UpdateBeatParams, row_to_beat, BEAT_COLUMNS};
use serde::Serialize;
use std::path::Path;

/// Shared WHERE fragment for the search / status / favorites filters used by
/// both `get_beats` and `get_beats_paginated`.
/// Returns (clauses, boxed params, next free parameter index).
fn base_beat_filters(
    search: &Option<String>,
    status_filter: &Option<String>,
    only_favs: bool,
) -> (Vec<String>, Vec<Box<dyn rusqlite::ToSql>>, usize) {
    let mut where_clauses: Vec<String> = vec!["1=1".to_string()];
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![];
    let mut param_idx = 1;

    if let Some(s) = search {
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

    if let Some(s) = status_filter {
        if s != "all" {
            where_clauses.push(format!("LOWER(status) = LOWER(?{})", param_idx));
            params.push(Box::new(s.clone()));
            param_idx += 1;
        }
    }

    if only_favs {
        where_clauses.push("favorite = 1".to_string());
    }

    (where_clauses, params, param_idx)
}

#[derive(Debug, Serialize)]
pub struct DeleteBeatResult {
    pub success: bool,
    pub beat_id: String,
    /// True if the on-disk folder existed and was moved to trash.
    /// False means the DB row was orphaned (folder already gone) — DB entry was still removed.
    pub folder_trashed: bool,
}

/// Delete a beat: move its folder to the OS recycle bin and remove the DB row.
///
/// Safety: the beat's stored path must live underneath `archive_base_path` (the
/// user-configured archive root). This prevents accidentally trashing arbitrary
/// folders if the DB ever holds a bogus path.
#[tauri::command]
pub fn delete_beat(beat_id: String, archive_base_path: String) -> Result<DeleteBeatResult, String> {
    let conn = open_db().map_err(|e| e.to_string())?;

    // 1. Look up the beat's path from the DB (single source of truth)
    let beat_path: String = match conn.query_row(
        "SELECT path FROM beats WHERE id = ?1",
        rusqlite::params![beat_id],
        |row| row.get::<_, String>(0),
    ) {
        Ok(p) => p,
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            return Err(format!("Beat {} not found in database", beat_id));
        }
        Err(e) => return Err(format!("DB lookup failed: {}", e)),
    };

    // 2. Safety check: the folder must live under the configured archive root.
    //    Canonicalize both sides where possible to handle trailing slashes /
    //    relative segments. If canonicalize fails (e.g. the beat folder no
    //    longer exists) we fall back to a string prefix comparison, which is
    //    still safe — the path can't be empty and must literally start with
    //    the archive root.
    let beat_path_buf = Path::new(&beat_path);
    let archive_root = Path::new(&archive_base_path);

    let canonical_root = archive_root.canonicalize()
        .map_err(|e| format!("Archive root unreadable ({}): {}", archive_base_path, e))?;

    let under_archive = match beat_path_buf.canonicalize() {
        Ok(canonical_beat) => canonical_beat.starts_with(&canonical_root),
        Err(_) => beat_path_buf.starts_with(&archive_root),
    };

    if !under_archive {
        return Err(format!(
            "Refusing to delete: beat path is not inside the configured archive root.\n  beat:    {}\n  archive: {}",
            beat_path, archive_base_path
        ));
    }

    // 3. Trash the folder if it still exists. If it's already gone we just
    //    clean up the orphan DB row instead of failing the whole operation.
    let folder_trashed = if beat_path_buf.exists() {
        if !beat_path_buf.is_dir() {
            return Err(format!("Beat path is not a directory: {}", beat_path));
        }
        trash::delete(beat_path_buf)
            .map_err(|e| format!("Failed to move folder to recycle bin: {}", e))?;
        true
    } else {
        false
    };

    // 4. Remove the DB row only after the filesystem step succeeded (or was a no-op).
    conn.execute(
        "DELETE FROM beats WHERE id = ?1",
        rusqlite::params![beat_id],
    ).map_err(|e| format!("DB delete failed: {}", e))?;

    Ok(DeleteBeatResult {
        success: true,
        beat_id,
        folder_trashed,
    })
}

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

    let (where_clauses, params, _) = base_beat_filters(&search, &status_filter, only_favs);

    let where_sql = where_clauses.join(" AND ");
    let sql = format!(
        "SELECT {} FROM beats WHERE {} ORDER BY CAST(id AS INTEGER) DESC LIMIT {} OFFSET {}",
        BEAT_COLUMNS, where_sql, lim, off
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
    unpublished_only: Option<bool>,
) -> Result<PaginatedBeatsResponse, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(50);
    let off = offset.unwrap_or(0);

    let (mut where_clauses, mut params, mut param_idx) =
        base_beat_filters(&search, &status_filter, only_favs);

    // "Unveröffentlicht": no platform has been uploaded for this beat yet
    if unpublished_only.unwrap_or(false) {
        where_clauses.push(
            "NOT EXISTS (SELECT 1 FROM beat_uploads u WHERE u.beat_id = beats.id AND u.status = 'uploaded')"
                .to_string(),
        );
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
        param_idx += 1;
    }

    let _ = param_idx; // all params accounted for
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
        // Produktionsdatum aus der FLP — NICHT dasselbe wie die Nummer. Die
        // wird beim Archivieren fortlaufend vergeben, das Datum kommt aus der
        // Datei; ein spaet archivierter Beat kann also eine alte FLP haben.
        // Ohne Datum ans Ende, sonst stuenden sie je nach Richtung vorne.
        "created_date" => "COALESCE(created_date, '0000-00-00')",
        "key" => "COALESCE(LOWER(key), 'zzz')",
        // Nach Workflow, nicht nach Alphabet — alphabetisch kaeme
        // finished/idea/sold/wip heraus, was keiner Reihenfolge entspricht.
        // Leeres/unbekanntes Status sortiert ans Ende.
        "status" => "CASE LOWER(COALESCE(status, '')) \
                       WHEN 'idea' THEN 0 WHEN 'wip' THEN 1 \
                       WHEN 'finished' THEN 2 WHEN 'sold' THEN 3 ELSE 4 END",
        _ => "CAST(id AS INTEGER)",
    };
    
    let sort_dir = match sort_dir_input.as_str() {
        "ASC" => "ASC",
        "DESC" => "DESC",
        _ => "DESC",
    };
    
    let sql = format!(
        "SELECT {} FROM beats WHERE {} ORDER BY {} {} LIMIT {} OFFSET {}",
        BEAT_COLUMNS, where_sql, order_expr, sort_dir, lim, off
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
    
    drop(conn);

    // Name/BPM/Key stecken im Ordner- und in den Dateinamen — sofort nachziehen,
    // sonst heißt der Beat in der App anders als auf der Platte.
    if params.name.is_some() || params.bpm.is_some() || params.key.is_some() {
        crate::commands::sync_beat_folder(&params.id, false)
            .map_err(|e| format!("Gespeichert, aber Umbenennen auf der Platte schlug fehl: {}", e))?;
    }

    Ok(())
}

/// Platform badges for the Browse table: which platforms are scheduled or
/// uploaded per beat. Drafts are skipped — nothing to show for them.
#[derive(Debug, Serialize)]
pub struct UploadBadge {
    pub beat_id: String,
    pub platform: String,
    pub status: String,
}

#[tauri::command]
pub fn get_upload_badges(beat_ids: Vec<String>) -> Result<Vec<UploadBadge>, String> {
    if beat_ids.is_empty() {
        return Ok(Vec::new());
    }
    let conn = open_db().map_err(|e| e.to_string())?;
    let placeholders: Vec<String> = (1..=beat_ids.len()).map(|i| format!("?{}", i)).collect();
    let sql = format!(
        "SELECT beat_id, platform, status FROM beat_uploads
         WHERE status != 'draft' AND beat_id IN ({})",
        placeholders.join(",")
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::ToSql> = beat_ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();
    let badges: Vec<UploadBadge> = stmt
        .query_map(param_refs.as_slice(), |r| {
            Ok(UploadBadge {
                beat_id: r.get(0)?,
                platform: r.get(1)?,
                status: r.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(badges)
}

#[tauri::command]
pub fn get_beat_by_id(beat_id: String) -> Result<Option<Beat>, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare(
        &format!("SELECT {} FROM beats WHERE id = ?1", BEAT_COLUMNS)
    ).map_err(|e| e.to_string())?;
    
    let beat = stmt.query_row([&beat_id], row_to_beat);
    
    match beat {
        Ok(b) => Ok(Some(b)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}
