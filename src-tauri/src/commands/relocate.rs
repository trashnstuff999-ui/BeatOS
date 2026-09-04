// src-tauri/src/commands/relocate.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Bibliothek umgezogen — prüfen, vorschauen, umschreiben
// ═══════════════════════════════════════════════════════════════════════════════
//
// Die Regel dieses Bereichs: **erkannt wird automatisch, geschrieben wird nur
// auf Bestätigung.** Ein fehlender Archivpfad heißt nicht zwingend „umgezogen"
// — er heißt genauso oft „Platte nicht angesteckt" oder „Freigabe nicht
// eingebunden". Löste die Erkennung selbst etwas aus, würde ein schlafendes
// NAS die Datenbank umschreiben. Sie stellt deshalb nur die Frage.

use crate::db::{open_db, relocate};
use std::path::Path;

/// Woran die Datenbank gerade hängt, und ob es das auf dieser Maschine gibt.
#[derive(Debug, serde::Serialize)]
pub struct RelocateStatus {
    /// Aus den gespeicherten Pfaden berechnet, nicht aus den Einstellungen
    pub anchor: Option<String>,
    pub archive_path: Option<String>,
    /// `false` heißt: nachsehen. Nicht: handeln.
    pub archive_exists: bool,
}

fn archive_path(conn: &rusqlite::Connection) -> Option<String> {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = 'archive_path'",
        [],
        |row| row.get::<_, String>(0),
    )
    .ok()
    .filter(|v| !v.trim().is_empty())
}

#[tauri::command]
pub fn relocate_status() -> Result<RelocateStatus, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let anchor = relocate::detect_anchor(&conn).map_err(|e| e.to_string())?;
    let archive_path = archive_path(&conn);
    let archive_exists = archive_path
        .as_deref()
        .map(|p| Path::new(p).is_dir())
        .unwrap_or(false);

    Ok(RelocateStatus {
        anchor,
        archive_path,
        archive_exists,
    })
}

/// Trockenlauf. Schreibt nichts, zählt nur.
#[tauri::command]
pub fn relocate_preview(new_anchor: String) -> Result<relocate::RelocatePlan, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let old = relocate::detect_anchor(&conn)
        .map_err(|e| e.to_string())?
        .ok_or("Kein gemeinsamer Anker in der Datenbank gefunden")?;
    relocate::plan(&conn, &old, &new_anchor).map_err(|e| e.to_string())
}

#[derive(Debug, serde::Serialize)]
pub struct RelocateResult {
    pub changed: usize,
    /// Wohin die Sicherung vor dem Schreiben ging
    pub backup_path: String,
    pub old_anchor: String,
    pub new_anchor: String,
}

/// Schreibt den Ankertausch. Sichert vorher, schreibt in einer Transaktion.
#[tauri::command]
pub fn relocate_apply(new_anchor: String) -> Result<RelocateResult, String> {
    let new_anchor = new_anchor.trim().to_string();
    if new_anchor.is_empty() {
        return Err("Kein Zielordner angegeben".into());
    }
    if !Path::new(&new_anchor).is_dir() {
        return Err(format!(
            "Der Zielordner existiert nicht: {}\n\nBeim Umzug auf einen anderen Rechner \
             wird der Anker dort gesetzt, nicht hier.",
            new_anchor
        ));
    }

    let mut conn = open_db().map_err(|e| e.to_string())?;
    let old_anchor = relocate::detect_anchor(&conn)
        .map_err(|e| e.to_string())?
        .ok_or("Kein gemeinsamer Anker in der Datenbank gefunden")?;

    if old_anchor.eq_ignore_ascii_case(&new_anchor) {
        return Err("Alter und neuer Anker sind identisch — nichts zu tun".into());
    }

    // Erst sichern, dann schreiben. Die Sicherung liegt neben der Datenbank,
    // nicht in der Bibliothek — die ist ja gerade der Umzugsgrund.
    let backup = relocate::backup_before_relocate()?;
    let changed = relocate::apply(&mut conn, &old_anchor, &new_anchor)?;

    Ok(RelocateResult {
        changed,
        backup_path: backup.to_string_lossy().to_string(),
        old_anchor,
        new_anchor,
    })
}
