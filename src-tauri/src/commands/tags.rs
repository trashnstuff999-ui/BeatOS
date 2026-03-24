// src-tauri/src/commands/tags.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Custom Tags Commands
// ═══════════════════════════════════════════════════════════════════════════════

use crate::db::{open_db, CustomTag};

/// Get all custom tags, sorted by usage_count (most used first)
#[tauri::command]
pub fn get_custom_tags() -> Result<Vec<CustomTag>, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare(
        "SELECT id, tag, display_name, category, usage_count, created_at 
         FROM custom_tags 
         ORDER BY usage_count DESC, display_name ASC"
    ).map_err(|e| e.to_string())?;
    
    let tags: Vec<CustomTag> = stmt
        .query_map([], |row| {
            Ok(CustomTag {
                id:           row.get(0)?,
                tag:          row.get(1)?,
                display_name: row.get(2)?,
                category:     row.get(3)?,
                usage_count:  row.get(4)?,
                created_at:   row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    
    Ok(tags)
}

/// Save a new custom tag or increment usage_count if it exists
#[tauri::command]
pub fn save_custom_tag(tag: String, display_name: String, category: String) -> Result<CustomTag, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    
    // Validate category
    let valid_categories = ["genre", "vibe", "instrument", "other"];
    if !valid_categories.contains(&category.as_str()) {
        return Err(format!("Invalid category: {}. Must be one of: genre, vibe, instrument, other", category));
    }
    
    // INSERT OR UPDATE (UPSERT)
    conn.execute(
        "INSERT INTO custom_tags (tag, display_name, category, usage_count, created_at)
         VALUES (?1, ?2, ?3, 1, datetime('now'))
         ON CONFLICT(tag) DO UPDATE SET 
            usage_count = usage_count + 1,
            display_name = ?2,
            category = ?3",
        rusqlite::params![tag.to_lowercase(), display_name, category],
    ).map_err(|e| e.to_string())?;
    
    // Return saved tag
    let saved: CustomTag = conn.query_row(
        "SELECT id, tag, display_name, category, usage_count, created_at 
         FROM custom_tags WHERE tag = ?1",
        [tag.to_lowercase()],
        |row| {
            Ok(CustomTag {
                id:           row.get(0)?,
                tag:          row.get(1)?,
                display_name: row.get(2)?,
                category:     row.get(3)?,
                usage_count:  row.get(4)?,
                created_at:   row.get(5)?,
            })
        },
    ).map_err(|e| e.to_string())?;
    
    Ok(saved)
}

/// Save multiple custom tags at once (batch operation)
#[tauri::command]
pub fn save_custom_tags_batch(tags: Vec<(String, String, String)>) -> Result<i64, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let mut saved_count = 0i64;
    
    for (tag, display_name, category) in tags {
        let valid_categories = ["genre", "vibe", "instrument", "other"];
        if !valid_categories.contains(&category.as_str()) {
            continue;
        }
        
        match conn.execute(
            "INSERT INTO custom_tags (tag, display_name, category, usage_count, created_at)
             VALUES (?1, ?2, ?3, 1, datetime('now'))
             ON CONFLICT(tag) DO UPDATE SET 
                usage_count = usage_count + 1,
                display_name = ?2,
                category = ?3",
            rusqlite::params![tag.to_lowercase(), display_name, category],
        ) {
            Ok(_) => saved_count += 1,
            Err(_) => continue,
        }
    }
    
    Ok(saved_count)
}

/// Delete a custom tag
#[tauri::command]
pub fn delete_custom_tag(tag: String) -> Result<bool, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    
    let rows_affected = conn.execute(
        "DELETE FROM custom_tags WHERE tag = ?1",
        [tag.to_lowercase()],
    ).map_err(|e| e.to_string())?;
    
    Ok(rows_affected > 0)
}

/// Search custom tags (for autocomplete)
#[tauri::command]
pub fn search_custom_tags(query: String) -> Result<Vec<CustomTag>, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    
    let search_pattern = format!("%{}%", query.to_lowercase());
    
    let mut stmt = conn.prepare(
        "SELECT id, tag, display_name, category, usage_count, created_at 
         FROM custom_tags 
         WHERE tag LIKE ?1 OR display_name LIKE ?1
         ORDER BY usage_count DESC
         LIMIT 20"
    ).map_err(|e| e.to_string())?;
    
    let tags: Vec<CustomTag> = stmt
        .query_map([search_pattern], |row| {
            Ok(CustomTag {
                id:           row.get(0)?,
                tag:          row.get(1)?,
                display_name: row.get(2)?,
                category:     row.get(3)?,
                usage_count:  row.get(4)?,
                created_at:   row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    
    Ok(tags)
}
