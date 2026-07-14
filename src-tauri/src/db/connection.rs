// src-tauri/src/db/connection.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Database Connection & Initialization
// ═══════════════════════════════════════════════════════════════════════════════

use rusqlite::{Connection, Result as SqlResult};
use std::path::{Path, PathBuf};
use std::sync::{Once, OnceLock};

/// Legacy database location inside the OneDrive-synced library folder.
/// Kept only as migration source and as target directory for backups.
const LEGACY_DB_PATH: &str = r"C:\Users\kismo\OneDrive\Dokumente\._BEAT LIBRARY\beats.db";

static DB_PATH: OnceLock<PathBuf> = OnceLock::new();

/// Resolve the database path. The live DB lives in %LOCALAPPDATA%\BeatOS so
/// OneDrive sync can never lock or corrupt it; on first run an existing
/// legacy DB is migrated over (copy + integrity check). Falls back to the
/// legacy path only if %LOCALAPPDATA% is unavailable.
pub fn get_db_path() -> &'static Path {
    DB_PATH.get_or_init(resolve_db_path)
}

fn resolve_db_path() -> PathBuf {
    let local = match std::env::var_os("LOCALAPPDATA") {
        Some(v) if !v.is_empty() => PathBuf::from(v),
        _ => return PathBuf::from(LEGACY_DB_PATH),
    };
    let dir = local.join("BeatOS");
    if let Err(e) = std::fs::create_dir_all(&dir) {
        eprintln!("WARNING: cannot create {}: {} — using legacy DB path", dir.display(), e);
        return PathBuf::from(LEGACY_DB_PATH);
    }
    let new_path = dir.join("beats.db");
    let legacy = Path::new(LEGACY_DB_PATH);

    if !new_path.exists() && legacy.exists() {
        match migrate_legacy_db(legacy, &new_path) {
            Ok(()) => {
                // Keep the old file around, but renamed so nothing keeps
                // writing to the OneDrive copy by accident.
                let retired = legacy.with_file_name("beats.db.migrated-backup");
                if let Err(e) = std::fs::rename(legacy, &retired) {
                    eprintln!("WARNING: could not rename legacy DB: {}", e);
                }
            }
            Err(e) => {
                eprintln!("WARNING: DB migration failed ({}) — staying on legacy path", e);
                let _ = std::fs::remove_file(&new_path);
                return PathBuf::from(LEGACY_DB_PATH);
            }
        }
    }
    new_path
}

/// Copy the legacy DB to the new location and verify the copy before use.
fn migrate_legacy_db(from: &Path, to: &Path) -> Result<(), String> {
    let src_len = std::fs::metadata(from).map_err(|e| e.to_string())?.len();
    std::fs::copy(from, to).map_err(|e| format!("copy failed: {}", e))?;
    let dst_len = std::fs::metadata(to).map_err(|e| e.to_string())?.len();
    if src_len != dst_len {
        return Err(format!("size mismatch after copy ({} vs {})", src_len, dst_len));
    }
    let conn = Connection::open(to).map_err(|e| format!("cannot open copy: {}", e))?;
    let check: String = conn
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(|e| format!("integrity check failed to run: {}", e))?;
    if check != "ok" {
        return Err(format!("integrity check reported: {}", check));
    }
    Ok(())
}

/// Open database connection (fast, no schema operations).
/// WAL is safe here because the live DB is outside any sync folder.
pub fn open_db() -> SqlResult<Connection> {
    let conn = Connection::open(get_db_path())?;
    conn.busy_timeout(std::time::Duration::from_millis(5000))?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    Ok(conn)
}

/// Where the OneDrive-synced backup snapshot lives.
pub fn backup_target_path() -> PathBuf {
    Path::new(LEGACY_DB_PATH)
        .parent()
        .map(|d| d.join("beats.backup.db"))
        .unwrap_or_else(|| PathBuf::from("beats.backup.db"))
}

/// Write a consistent single-file snapshot of the live DB into the OneDrive
/// library folder (`beats.backup.db`). Uses VACUUM INTO on a temp file and an
/// atomic swap so the synced file is never a half-written database.
pub fn backup_db() -> Result<(), String> {
    let backup_dir = Path::new(LEGACY_DB_PATH)
        .parent()
        .ok_or("no backup directory")?;
    if !backup_dir.exists() {
        return Err(format!("backup directory missing: {}", backup_dir.display()));
    }
    let final_path = backup_target_path();
    let tmp_path = backup_dir.join("beats.backup.db.tmp");
    let _ = std::fs::remove_file(&tmp_path);

    let conn = open_db().map_err(|e| e.to_string())?;
    conn.execute(
        "VACUUM INTO ?1",
        [tmp_path.to_string_lossy().as_ref()],
    )
    .map_err(|e| format!("VACUUM INTO failed: {}", e))?;
    drop(conn);

    let _ = std::fs::remove_file(&final_path);
    std::fs::rename(&tmp_path, &final_path).map_err(|e| format!("backup swap failed: {}", e))?;
    Ok(())
}

/// Initialize database schema - called ONCE at app startup
static DB_INIT: Once = Once::new();
static DB_INIT_ERROR: OnceLock<Option<String>> = OnceLock::new();

pub fn init_db() -> Result<(), String> {
    let mut init_error: Option<String> = None;
    
    DB_INIT.call_once(|| {
        match open_db() {
            Ok(conn) => {
                // Create app_settings table if not exists
                if let Err(e) = conn.execute(
                    "CREATE TABLE IF NOT EXISTS app_settings (
                        key   TEXT PRIMARY KEY,
                        value TEXT NOT NULL
                    )",
                    [],
                ) {
                    init_error = Some(format!("Failed to create app_settings table: {}", e));
                }

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

                // ─── Upload-Tab Migrations ───────────────────────────────
                // The `beats` table is created externally; we only add new
                // columns idempotently. SQLite errors on duplicate-column
                // ADD, so we silently ignore that one specific error and
                // re-raise anything else.
                let add_beat_columns = [
                    "ALTER TABLE beats ADD COLUMN type_beat_main TEXT",
                    "ALTER TABLE beats ADD COLUMN type_beat_also_fits TEXT",
                    "ALTER TABLE beats ADD COLUMN genre_tags TEXT",
                    "ALTER TABLE beats ADD COLUMN youtube_tags TEXT",
                    "ALTER TABLE beats ADD COLUMN soundcloud_tags TEXT",
                ];
                for sql in add_beat_columns {
                    if let Err(e) = conn.execute(sql, []) {
                        let msg = e.to_string();
                        // "duplicate column name" is expected on re-runs.
                        if !msg.to_lowercase().contains("duplicate column") {
                            init_error = Some(format!("Failed to add beats column: {} ({})", sql, msg));
                        }
                    }
                }

                if let Err(e) = conn.execute(
                    "CREATE TABLE IF NOT EXISTS beat_uploads (
                        beat_id      TEXT NOT NULL,
                        platform     TEXT NOT NULL CHECK (platform IN ('soundcloud', 'youtube', 'beatstars')),
                        status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'uploaded')),
                        scheduled_at TEXT,
                        uploaded_at  TEXT,
                        url          TEXT,
                        PRIMARY KEY (beat_id, platform)
                    )",
                    [],
                ) {
                    init_error = Some(format!("Failed to create beat_uploads table: {}", e));
                }

                if let Err(e) = conn.execute(
                    "CREATE TABLE IF NOT EXISTS type_beat_presets (
                        id            INTEGER PRIMARY KEY AUTOINCREMENT,
                        label         TEXT NOT NULL,
                        main_artists  TEXT NOT NULL,
                        also_fits     TEXT,
                        genre_tags    TEXT,
                        use_count     INTEGER NOT NULL DEFAULT 0,
                        created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )",
                    [],
                ) {
                    init_error = Some(format!("Failed to create type_beat_presets table: {}", e));
                }

                // youtube_tags + soundcloud_tags on presets — idempotent ADD COLUMN
                for sql in [
                    "ALTER TABLE type_beat_presets ADD COLUMN youtube_tags TEXT",
                    "ALTER TABLE type_beat_presets ADD COLUMN soundcloud_tags TEXT",
                ] {
                    if let Err(e) = conn.execute(sql, []) {
                        let msg = e.to_string();
                        if !msg.to_lowercase().contains("duplicate column") {
                            init_error = Some(format!("Failed to add preset column: {} ({})", sql, msg));
                        }
                    }
                }

                // Studio tab: per-project status/priority, keyed by folder path
                if let Err(e) = conn.execute(
                    "CREATE TABLE IF NOT EXISTS studio_projects (
                        path       TEXT PRIMARY KEY,
                        status     TEXT NOT NULL DEFAULT 'idea'
                                   CHECK (status IN ('idea','wip','exported','ready')),
                        priority   INTEGER NOT NULL DEFAULT 0,
                        notes      TEXT,
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP
                    )",
                    [],
                ) {
                    init_error = Some(format!("Failed to create studio_projects table: {}", e));
                }

                // Data repair: earlier archive scans stored 0.0 / '' instead
                // of NULL, which poisons avg_bpm stats and BPM filters.
                // Idempotent, so safe to run on every start.
                for sql in [
                    "UPDATE beats SET bpm = NULL WHERE bpm = 0",
                    "UPDATE beats SET key = NULL WHERE key = ''",
                    // Past-scheduled uploads have happened: promote to uploaded.
                    // (Same rule as promote_past_scheduled in upload/read.rs —
                    // this catches old data right at startup.)
                    "UPDATE beat_uploads
                     SET status = 'uploaded', uploaded_at = COALESCE(uploaded_at, scheduled_at)
                     WHERE status = 'scheduled'
                       AND scheduled_at IS NOT NULL AND scheduled_at != ''
                       AND scheduled_at < date('now','localtime')",
                ] {
                    if let Err(e) = conn.execute(sql, []) {
                        // `beats` is created externally; a brand-new DB may not have it yet.
                        if !e.to_string().to_lowercase().contains("no such table") {
                            eprintln!("WARNING: data repair failed: {} ({})", sql, e);
                        }
                    }
                }
            }
            Err(e) => {
                init_error = Some(format!("Failed to open database: {}", e));
            }
        }
    });
    
    // Store the result of the first run; later calls return the same outcome.
    let stored = DB_INIT_ERROR.get_or_init(|| init_error);
    match stored {
        Some(e) => Err(e.clone()),
        None => Ok(()),
    }
}
