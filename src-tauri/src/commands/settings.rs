// src-tauri/src/commands/settings.rs
// ═══════════════════════════════════════════════════════════════════════════════
// App Settings — persisted in SQLite
// ═══════════════════════════════════════════════════════════════════════════════

use crate::db::open_db;
use std::collections::HashMap;

/// Load all settings as key→value map.
#[tauri::command]
pub fn get_settings() -> Result<HashMap<String, String>, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT key, value FROM app_settings")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;
    let mut map = HashMap::new();
    for row in rows {
        let (k, v) = row.map_err(|e| e.to_string())?;
        map.insert(k, v);
    }
    Ok(map)
}

/// Persist arbitrary settings as key/value pairs.
/// Frontend sends a flat map; only keys present in the map are written
/// (keys not in the map are left untouched in the DB).
#[tauri::command]
pub fn save_settings(settings: HashMap<String, String>) -> Result<(), String> {
    let mut conn = open_db().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for (key, value) in &settings {
        tx.execute(
            "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            rusqlite::params![key, value],
        ).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use rusqlite::Connection;
    use std::collections::HashMap;

    fn setup_in_memory_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
            [],
        ).unwrap();
        conn
    }

    fn get_settings_from(conn: &Connection) -> HashMap<String, String> {
        let mut stmt = conn.prepare("SELECT key, value FROM app_settings").unwrap();
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        }).unwrap();
        rows.filter_map(|r| r.ok()).collect()
    }

    fn save_settings_to(conn: &Connection, archive: &str, production: &str, asset: &str) {
        let pairs = [
            ("archive_path", archive),
            ("production_path", production),
            ("asset_path", asset),
        ];
        for (key, value) in &pairs {
            conn.execute(
                "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                rusqlite::params![key, value],
            ).unwrap();
        }
    }

    #[test]
    fn test_settings_round_trip() {
        let conn = setup_in_memory_db();
        save_settings_to(&conn, "/archive", "/production", "/assets");

        let map = get_settings_from(&conn);
        assert_eq!(map.get("archive_path").map(|s| s.as_str()), Some("/archive"));
        assert_eq!(map.get("production_path").map(|s| s.as_str()), Some("/production"));
        assert_eq!(map.get("asset_path").map(|s| s.as_str()), Some("/assets"));
    }

    #[test]
    fn test_settings_overwrite() {
        let conn = setup_in_memory_db();
        save_settings_to(&conn, "/old", "", "");
        save_settings_to(&conn, "/new", "", "");

        let map = get_settings_from(&conn);
        assert_eq!(map.get("archive_path").map(|s| s.as_str()), Some("/new"));
    }

    #[test]
    fn test_empty_db_returns_no_keys() {
        let conn = setup_in_memory_db();
        let map = get_settings_from(&conn);
        assert!(map.is_empty());
    }
}
