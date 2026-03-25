// src/lib/constants.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Application Constants
// ═══════════════════════════════════════════════════════════════════════════════

// Archive Base Path
// TODO: In einer späteren Version via Settings-Page konfigurierbar machen
//       (invoke("get_archive_path") statt Hardcode)
export const ARCHIVE_BASE_PATH = "C:\\Users\\kismo\\OneDrive\\Dokumente\\._BEAT LIBRARY\\03_ARCHIVE";

// DB_PATH wurde entfernt — der Datenbankpfad wird ausschließlich im Rust-Backend
// verwaltet (src-tauri/src/db/connection.rs → get_db_path()). Das Frontend
// kommuniziert nur via invoke() und braucht den Pfad nicht zu kennen.
