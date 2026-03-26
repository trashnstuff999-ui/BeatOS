// src-tauri/src/db/connection.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Database Connection & Initialization
// ═══════════════════════════════════════════════════════════════════════════════

use rusqlite::{Connection, Result as SqlResult};
use std::sync::Once;

/// Database path - can be changed for different environments
/// TODO: Make this configurable via settings or environment variable
pub fn get_db_path() -> &'static str {
    r"C:\Users\kismo\OneDrive\Dokumente\._BEAT LIBRARY\beats.db"
}

/// Open database connection (fast, no schema operations)
pub fn open_db() -> SqlResult<Connection> {
    Connection::open(get_db_path())
}

/// Initialize database schema - called ONCE at app startup
static DB_INIT: Once = Once::new();
static mut DB_INIT_ERROR: Option<String> = None;

pub fn init_db() -> Result<(), String> {
    let mut init_error: Option<String> = None;
    
    DB_INIT.call_once(|| {
        match open_db() {
            Ok(conn) => {
                // Create custom_tags table if not exists
                if let Err(e) = conn.execute(
                    "CREATE TABLE IF NOT EXISTS custom_tags (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        tag TEXT UNIQUE NOT NULL,
                        display_name TEXT NOT NULL,
                        category TEXT NOT NULL CHECK (category IN ('genre', 'vibe', 'instrument', 'custom', 'other')),
                        usage_count INTEGER DEFAULT 1,
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP
                    )",
                    [],
                ) {
                    init_error = Some(format!("Failed to create custom_tags table: {}", e));
                }

                // Migration: rebuild table if CHECK constraint is missing 'custom'
                // SQLite cannot ALTER a constraint, so we recreate the table.
                let needs_migration: bool = conn.query_row(
                    "SELECT sql FROM sqlite_master WHERE type='table' AND name='custom_tags'",
                    [],
                    |row| row.get::<_, String>(0),
                ).map(|sql| !sql.contains("'custom'"))
                 .unwrap_or(false);

                if needs_migration {
                    let migration = "
                        BEGIN;
                        CREATE TABLE custom_tags_new (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            tag TEXT UNIQUE NOT NULL,
                            display_name TEXT NOT NULL,
                            category TEXT NOT NULL CHECK (category IN ('genre', 'vibe', 'instrument', 'custom', 'other')),
                            usage_count INTEGER DEFAULT 1,
                            created_at TEXT DEFAULT CURRENT_TIMESTAMP
                        );
                        INSERT INTO custom_tags_new SELECT * FROM custom_tags;
                        DROP TABLE custom_tags;
                        ALTER TABLE custom_tags_new RENAME TO custom_tags;
                        COMMIT;
                    ";
                    if let Err(e) = conn.execute_batch(migration) {
                        init_error = Some(format!("Failed to migrate custom_tags table: {}", e));
                    }
                }
            }
            Err(e) => {
                init_error = Some(format!("Failed to open database: {}", e));
            }
        }
    });
    
    // Store error for later retrieval
    if let Some(ref e) = init_error {
        unsafe { DB_INIT_ERROR = Some(e.clone()); }
        return Err(e.clone());
    }
    
    // Check if previous init failed
    unsafe {
        if let Some(ref e) = DB_INIT_ERROR {
            return Err(e.clone());
        }
    }
    
    Ok(())
}
