// src-tauri/src/db/connection.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Database Connection & Initialization
// ═══════════════════════════════════════════════════════════════════════════════

use rusqlite::{Connection, Result as SqlResult};
use std::path::{Path, PathBuf};
use std::sync::{Once, OnceLock};

/// Früherer Ort der Datenbank, im Bibliotheksordner.
///
/// Nur noch Quelle für die einmalige Migration — das Sicherungsziel hängt
/// seit `backup_dir()` am eingestellten Archivpfad und nicht mehr hier.
const LEGACY_DB_PATH: &str = r"C:\Users\kismo\OneDrive\Dokumente\._BEAT LIBRARY\beats.db";

static DB_PATH: OnceLock<PathBuf> = OnceLock::new();

/// Verzeichnis der Datenbank, pro System.
///
/// Windows bleibt bei `%LOCALAPPDATA%\BeatOS`: dort liegt der Bestand, und ein
/// Umzug an einen „saubereren" Ort würde nur Daten bewegen, die längst am
/// richtigen Platz sind.
/// Tests bekommen eine eigene Datenbank im Temp-Ordner. Mit der echten
/// schrieben sie Protokolle und Sicherungen in die Bibliothek.
#[cfg(test)]
fn data_dir() -> Option<PathBuf> {
    Some(std::env::temp_dir().join(format!("beatos_test_{}", std::process::id())))
}

#[cfg(all(windows, not(test)))]
fn data_dir() -> Option<PathBuf> {
    std::env::var_os("LOCALAPPDATA")
        .filter(|v| !v.is_empty())
        .map(|v| PathBuf::from(v).join("BeatOS"))
}

/// macOS. Linux ist kein Ziel dieser App — käme es dazu, gehört hier
/// `$XDG_DATA_HOME` hin.
#[cfg(all(not(windows), not(test)))]
fn data_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .filter(|v| !v.is_empty())
        .map(|v| PathBuf::from(v).join("Library/Application Support/BeatOS"))
}

/// Wo die laufende Datenbank liegt.
///
/// Bewusst außerhalb des Bibliotheksordners: so kann die Bibliothek umziehen
/// (siehe `db::relocate`), ohne dass die Datenbank mitwandert, und ein
/// Sync-Client im Bibliotheksordner könnte sie nie sperren.
///
/// Beim ersten Start wird eine vorhandene Datenbank vom alten Ort übernommen
/// (Kopie plus Integritätsprüfung). Auf einem frischen System gibt es den
/// alten Ort nicht, dann entfällt der Schritt von selbst.
pub fn get_db_path() -> &'static Path {
    DB_PATH.get_or_init(resolve_db_path)
}

fn resolve_db_path() -> PathBuf {
    let Some(dir) = data_dir() else {
        return PathBuf::from(LEGACY_DB_PATH);
    };
    if let Err(e) = std::fs::create_dir_all(&dir) {
        eprintln!("WARNING: cannot create {}: {} — using legacy DB path", dir.display(), e);
        return PathBuf::from(LEGACY_DB_PATH);
    }
    let new_path = dir.join("beats.db");
    let legacy = Path::new(LEGACY_DB_PATH);

    if !cfg!(test) && !new_path.exists() && legacy.exists() {
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

/// Der Bibliotheksordner zu einem Archivpfad — eine Ebene darüber.
///
/// Rein rechnerisch, ohne Blick auf die Platte, damit es prüfbar bleibt.
fn library_dir_from_archive(archive: &str) -> Option<PathBuf> {
    let archive = archive.trim();
    if archive.is_empty() {
        return None;
    }
    Path::new(archive)
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .map(|p| p.to_path_buf())
}

/// Wohin die Sicherung geht: in den Bibliotheksordner, also eine Ebene über
/// dem eingestellten Archiv.
///
/// Früher stand hier ein einkompilierter Pfad. Seit die Bibliothek umziehen
/// kann (siehe `db::relocate`), wäre der nach dem ersten Ankertausch tot —
/// abgeleitet folgt die Sicherung der Bibliothek von selbst.
///
/// Fällt auf das Verzeichnis der Datenbank zurück, wenn kein Archivpfad
/// gesetzt ist oder sein Elternordner fehlt. Eine Sicherung neben der
/// Datenbank ist schwächer als eine in der Bibliothek, aber immer noch eine —
/// und der Pfad steht in den Einstellungen, ist also nicht versteckt.
fn backup_dir() -> PathBuf {
    let from_settings = open_db().ok().and_then(|conn| {
        let archive: String = conn
            .query_row(
                "SELECT value FROM app_settings WHERE key = 'archive_path'",
                [],
                |row| row.get(0),
            )
            .ok()?;
        let lib = library_dir_from_archive(&archive).filter(|p| p.is_dir())?;
        // Alles, was die App selbst schreibt, in einem Ordner statt lose im Root
        let dir = lib.join("_BEATOS");
        std::fs::create_dir_all(&dir).ok()?;
        Some(dir)
    });

    from_settings.unwrap_or_else(|| {
        get_db_path()
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| PathBuf::from("."))
    })
}

/// Wo der Sicherungs-Schnappschuss liegt.
pub fn backup_target_path() -> PathBuf {
    backup_dir().join("beats.backup.db")
}

/// Schreibt einen in sich konsistenten Ein-Datei-Schnappschuss der laufenden
/// Datenbank als `beats.backup.db` in den Bibliotheksordner. `VACUUM INTO` auf
/// eine temporäre Datei plus atomarer Tausch, damit die Zieldatei nie eine
/// halb geschriebene Datenbank ist.
pub fn backup_db() -> Result<(), String> {
    let backup_dir = backup_dir();
    if !backup_dir.is_dir() {
        return Err(format!(
            "Sicherungsordner nicht gefunden: {}",
            backup_dir.display()
        ));
    }
    let final_path = backup_dir.join("beats.backup.db");
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
    let jetzt = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    tagessicherung(&backup_dir, &final_path, &crate::utils::secs_to_date(jetzt));
    Ok(())
}

/// Wie viele Tagessicherungen bleiben.
const TAGESSICHERUNGEN: usize = 7;

/// Eine Kopie je Tag (`beats.backup.JJJJ-MM-TT.db`), die letzten sieben bleiben.
/// Der Schnappschuss oben wird bei jedem Start überschrieben, auch mit einer
/// kaputten Datenbank. Die Kopie eines Tages entsteht nur einmal.
fn tagessicherung(dir: &Path, schnappschuss: &Path, heute: &str) {
    let ziel = dir.join(format!("beats.backup.{heute}.db"));
    if !ziel.exists() {
        if let Err(e) = std::fs::copy(schnappschuss, &ziel) {
            eprintln!("WARNING: Tagessicherung fehlgeschlagen: {}", e);
            return;
        }
    }
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    let mut alle: Vec<PathBuf> = rd.filter_map(|e| e.ok()).map(|e| e.path())
        .filter(|p| p.file_name().and_then(|n| n.to_str()).is_some_and(|n|
            // "beats.backup." + Datum (10) + ".db"
            n.len() == 26 && n.starts_with("beats.backup.") && n.ends_with(".db")))
        .collect();
    alle.sort();
    for alt in alle.iter().rev().skip(TAGESSICHERUNGEN) {
        let _ = std::fs::remove_file(alt);
    }
}

/// Initialize database schema - called ONCE at app startup
static DB_INIT: Once = Once::new();
static DB_INIT_ERROR: OnceLock<Option<String>> = OnceLock::new();

fn titel_gross(conn: &Connection) -> usize {
    let zeilen: Vec<(String, String)> = conn.prepare("SELECT id, name FROM beats WHERE name IS NOT NULL")
        .and_then(|mut s| s.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?.collect())
        .unwrap_or_default();
    zeilen.into_iter().filter(|(_, n)| n.to_uppercase() != *n)
        .filter(|(id, n)| conn.execute("UPDATE beats SET name = ?1 WHERE id = ?2", [n.to_uppercase(), id.clone()]).is_ok())
        .count()
}

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
                    // Kapitelmarken fuer die YouTube-Beschreibung, eine Zeile
                    // je Marke ("0:00 Intro"). Als Text und nicht als eigene
                    // Tabelle: die Liste wird immer komplett gelesen und
                    // komplett geschrieben, und das Speicherformat ist zugleich
                    // das, was YouTube erwartet. Wie genre_tags und youtube_tags.
                    "ALTER TABLE beats ADD COLUMN timecodes TEXT",
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

                // Sample-Credits, Teil 1: das Adressbuch der Sample-Geber.
                // Einmal gepflegt, damit ihre Links nicht bei jedem Upload
                // neu abgetippt werden. Form wie type_beat_presets.
                if let Err(e) = conn.execute(
                    "CREATE TABLE IF NOT EXISTS sample_producers (
                        id             INTEGER PRIMARY KEY AUTOINCREMENT,
                        name           TEXT NOT NULL,
                        instagram_url  TEXT,
                        beatstars_url  TEXT,
                        soundcloud_url TEXT,
                        youtube_url    TEXT,
                        created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )",
                    [],
                ) {
                    init_error = Some(format!("Failed to create sample_producers table: {}", e));
                }

                // Teil 2: wer bei welchem Beat was beigesteuert hat. Mehrere
                // Zeilen pro Beat, zusammengesetzter Schlüssel — dieselbe Form
                // wie beat_uploads. Verwiesen wird über die id, damit ein
                // geänderter Link beim nächsten Rendern überall stimmt.
                if let Err(e) = conn.execute(
                    "CREATE TABLE IF NOT EXISTS beat_sample_credits (
                        beat_id      TEXT    NOT NULL,
                        producer_id  INTEGER NOT NULL,
                        contribution TEXT    NOT NULL DEFAULT 'Sample',
                        PRIMARY KEY (beat_id, producer_id)
                    )",
                    [],
                ) {
                    init_error = Some(format!("Failed to create beat_sample_credits table: {}", e));
                }

                // Von Hand geänderte Beschreibungen. Fehlt eine Zeile, gilt die
                // Vorlage. Vorher lagen Änderungen nur in den .txt-Dateien im
                // Beat-Ordner — und die las nichts zurück: Karte und
                // Release-Assistent zeigten wieder die Vorlage.
                if let Err(e) = conn.execute(
                    "CREATE TABLE IF NOT EXISTS beat_description_overrides (
                        beat_id  TEXT NOT NULL,
                        platform TEXT NOT NULL,
                        text     TEXT NOT NULL,
                        PRIMARY KEY (beat_id, platform)
                    )",
                    [],
                ) {
                    init_error = Some(format!("Failed to create beat_description_overrides table: {}", e));
                }

                // Künstler-Songs: eine Notiz und „Warte auf Künstler", am
                // Song-Ordner. Eigene Tabelle statt studio_projects: deren
                // Status (idea/wip/ready …) kennt kein „Warten" und zählt in
                // die Studio-Statistik.
                if let Err(e) = conn.execute(
                    "CREATE TABLE IF NOT EXISTS artist_songs (
                        path   TEXT PRIMARY KEY,
                        notiz  TEXT,
                        warten INTEGER NOT NULL DEFAULT 0
                    )",
                    [],
                ) {
                    init_error = Some(format!("Failed to create artist_songs table: {}", e));
                }
                // Datum der Abgabe (Scheibe 7) kam später — scheitert, wenn
                // die Spalte schon da ist, und das ist gut so.
                let _ = conn.execute("ALTER TABLE artist_songs ADD COLUMN abgegeben TEXT", []);
                // „Mein Beat" (Scheibe 5): welcher Katalog-Beat im Song steckt.
                // Nur hier vermerkt — am Beat im Archiv ändert sich nichts.
                let _ = conn.execute("ALTER TABLE artist_songs ADD COLUMN beat_id TEXT", []);
                // „Nur Master": ein fertiger Track kommt rein, Vocals und Mix entfallen.
                let _ = conn.execute("ALTER TABLE artist_songs ADD COLUMN nur_master INTEGER NOT NULL DEFAULT 0", []);
                // Bibliothek-Umbau Scheibe 7: Haken von Hand, z. B. "vocals,mix".
                // NULL = nie angefasst, dann gilt die Vermutung aus den Dateien.
                let _ = conn.execute("ALTER TABLE artist_songs ADD COLUMN erledigt TEXT", []);
                // „Mein Beat" aus der Produktion: der Projektordner, solange
                // der Beat noch nicht im Katalog steht.
                let _ = conn.execute("ALTER TABLE artist_songs ADD COLUMN projekt TEXT", []);
                // „Nicht hochladen": der Beat fällt aus der Warteschlange.
                let _ = conn.execute("ALTER TABLE beats ADD COLUMN upload_skip INTEGER NOT NULL DEFAULT 0", []);
                // Bibliothek-Umbau: alte Nummer ("630", "Project_0121") und wann der
                // Song begonnen wurde. Bleiben über jede Neu-Nummerierung erhalten.
                let _ = conn.execute("ALTER TABLE beats ADD COLUMN alte_id TEXT", []);
                let _ = conn.execute("ALTER TABLE beats ADD COLUMN begonnen TEXT", []);
                // Scheibe 4: Katalognummer vor der Neu-Nummerierung (B-Nummern), suchbar
                let _ = conn.execute("ALTER TABLE beats ADD COLUMN frueher_nr TEXT", []);
                // Namensregel (18.11.2026): Titel stehen groß. In Rust, weil upper()
                // in SQLite nur A-Z kennt (ä bliebe klein). Ändert nur, was noch nicht stimmt.
                titel_gross(&conn);

                // Studio tab: per-project status/priority, keyed by folder path
                if let Err(e) = conn.execute(
                    "CREATE TABLE IF NOT EXISTS studio_projects (
                        path       TEXT PRIMARY KEY,
                        status     TEXT NOT NULL DEFAULT 'idea'
                                   CHECK (status IN ('idea','wip','exported','ready','discard')),
                        priority   INTEGER NOT NULL DEFAULT 0,
                        notes      TEXT,
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP
                    )",
                    [],
                ) {
                    init_error = Some(format!("Failed to create studio_projects table: {}", e));
                }

                // Migration: 'discard' ("Kann weg") kam später dazu. SQLite kann
                // keinen CHECK ändern — Tabelle neu bauen, wie oben bei
                // custom_tags. Die Werte bleiben, der Studio-Scan rechnet
                // idea/exported/ready ohnehin aus den Dateien neu.
                let studio_needs_migration: bool = conn.query_row(
                    "SELECT sql FROM sqlite_master WHERE type='table' AND name='studio_projects'",
                    [],
                    |row| row.get::<_, String>(0),
                ).map(|sql| !sql.contains("'discard'"))
                 .unwrap_or(false);

                if studio_needs_migration {
                    let migration = "
                        BEGIN;
                        CREATE TABLE studio_projects_new (
                            path       TEXT PRIMARY KEY,
                            status     TEXT NOT NULL DEFAULT 'idea'
                                       CHECK (status IN ('idea','wip','exported','ready','discard')),
                            priority   INTEGER NOT NULL DEFAULT 0,
                            notes      TEXT,
                            created_at TEXT DEFAULT CURRENT_TIMESTAMP
                        );
                        INSERT INTO studio_projects_new SELECT * FROM studio_projects;
                        DROP TABLE studio_projects;
                        ALTER TABLE studio_projects_new RENAME TO studio_projects;
                        COMMIT;
                    ";
                    if let Err(e) = conn.execute_batch(migration) {
                        init_error = Some(format!("Failed to migrate studio_projects table: {}", e));
                    }
                }

                // Aufräumen → „Behalten" (Werkbank Scheibe 5). Nach dem Umbau
                // oben, sonst fiele die Spalte dem SELECT * zum Opfer.
                let _ = conn.execute("ALTER TABLE studio_projects ADD COLUMN kept INTEGER NOT NULL DEFAULT 0", []);

                // Data repair: earlier archive scans stored 0.0 / '' instead
                // of NULL, which poisons BPM filters.
                // Idempotent, so safe to run on every start.
                for sql in [
                    "UPDATE beats SET bpm = NULL WHERE bpm = 0",
                    "UPDATE beats SET key = NULL WHERE key = ''",
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

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::{library_dir_from_archive, tagessicherung, titel_gross};
    use std::path::PathBuf;

    #[test]
    fn titel_werden_gross_auch_mit_umlaut() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE beats (id TEXT, name TEXT);
            INSERT INTO beats VALUES ('1', 'Make No Drama'), ('2', 'Träume'), ('3', 'SCHON GROSS'), ('4', NULL);").unwrap();
        assert_eq!(titel_gross(&conn), 2);
        let namen: Vec<String> = conn.prepare("SELECT name FROM beats WHERE name IS NOT NULL ORDER BY id").unwrap()
            .query_map([], |r| r.get(0)).unwrap().map(Result::unwrap).collect();
        assert_eq!(namen, ["MAKE NO DRAMA", "TRÄUME", "SCHON GROSS"]);
        assert_eq!(titel_gross(&conn), 0, "zweiter Start: nichts mehr zu tun");
    }

    #[test]
    fn tagessicherung_einmal_je_tag_und_sieben_bleiben() {
        let dir = std::env::temp_dir().join(format!("beatos_tagessicherung_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let schnappschuss = dir.join("beats.backup.db");

        std::fs::write(&schnappschuss, b"gut").unwrap();
        tagessicherung(&dir, &schnappschuss, "2026-11-01");
        // Zweiter Start am selben Tag mit kaputter Datenbank: die Kopie bleibt gut
        std::fs::write(&schnappschuss, b"kaputt").unwrap();
        tagessicherung(&dir, &schnappschuss, "2026-11-01");
        assert_eq!(std::fs::read(dir.join("beats.backup.2026-11-01.db")).unwrap(), b"gut");

        for tag in 2..=9 {
            tagessicherung(&dir, &schnappschuss, &format!("2026-11-{tag:02}"));
        }
        let mut da: Vec<String> = std::fs::read_dir(&dir).unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().to_string()).collect();
        da.sort();
        // Sieben Tage plus der laufende Schnappschuss; 01. und 02. sind raus
        assert_eq!(da.len(), 8);
        assert_eq!(da[0], "beats.backup.2026-11-03.db");
        assert_eq!(da[6], "beats.backup.2026-11-09.db");
        assert_eq!(da[7], "beats.backup.db");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn sicherung_landet_eine_ebene_ueber_dem_archiv() {
        assert_eq!(
            library_dir_from_archive(r"C:\P\._BEAT LIBRARY\03_ARCHIVE"),
            Some(PathBuf::from(r"C:\P\._BEAT LIBRARY"))
        );
        // Aus der Adressleiste kopiert, endet der Pfad gern auf einem Strich
        assert_eq!(
            library_dir_from_archive(r"C:\P\._BEAT LIBRARY\03_ARCHIVE\"),
            Some(PathBuf::from(r"C:\P\._BEAT LIBRARY"))
        );
        assert_eq!(
            library_dir_from_archive("  /Users/goodbxy/Studio/BEAT LIBRARY/03_ARCHIVE  "),
            Some(PathBuf::from("/Users/goodbxy/Studio/BEAT LIBRARY"))
        );
    }

    #[test]
    fn ohne_brauchbaren_archivpfad_kein_ziel() {
        // Leer, nur Leerzeichen, oder ohne Elternordner — dann greift der
        // Rueckfall auf das Verzeichnis der Datenbank.
        assert_eq!(library_dir_from_archive(""), None);
        assert_eq!(library_dir_from_archive("   "), None);
        assert_eq!(library_dir_from_archive("03_ARCHIVE"), None);
    }
}
