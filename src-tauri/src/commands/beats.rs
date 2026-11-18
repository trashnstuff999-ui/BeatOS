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
            // % und _ sind getippter Text, keine Platzhalter
            let muster = |s: &str| format!("%{}%", s.replace('\\', r"\\").replace('%', r"\%").replace('_', r"\_"));
            let search_pattern = muster(&search_lower);
            // ponytail: SQLite kennt Groß/Klein nur für ASCII. Klein- und
            // Großfassung decken „ä“ gegen „Ä“ ab; gemischte Umlaute in einem
            // Wort (äÖ) nicht, dafür bräuchte es eine eigene SQL-Funktion.
            let gross_pattern = muster(&s.to_uppercase());
            // „B0145“ und „#0145“ meinen die ID 0145; die frühere Nummer findet den Beat auch
            let nr = search_lower.trim().trim_start_matches(['b', '#']);
            let nr_pattern = if !nr.is_empty() && nr.chars().all(|c| c.is_ascii_digit()) { format!("%{nr}%") } else { search_pattern.clone() };
            let spalten: Vec<String> = ["name", "key", "tags"].iter()
                .map(|sp| format!(r"{sp} LIKE ?{a} ESCAPE '\' OR {sp} LIKE ?{b} ESCAPE '\'", a = param_idx, b = param_idx + 1))
                .collect();
            where_clauses.push(format!(
                r"({} OR id LIKE ?{n} ESCAPE '\' OR frueher_nr LIKE ?{n} ESCAPE '\')",
                spalten.join(" OR "), n = param_idx + 2
            ));
            params.push(Box::new(search_pattern));
            params.push(Box::new(gross_pattern));
            params.push(Box::new(nr_pattern));
            param_idx += 3;
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
    let mut conn = open_db().map_err(|e| e.to_string())?;

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
    beat_aus_db(&mut conn, &beat_id).map_err(|e| format!("DB delete failed: {}", e))?;

    Ok(DeleteBeatResult {
        success: true,
        beat_id,
        folder_trashed,
    })
}

/// Beat samt allem, was an seiner Nummer hängt. Die nächste Nummer ist
/// „höchste + 1“: blieben Uploads oder Credits stehen, erbte sie der nächste
/// Beat mit derselben Nummer.
fn beat_aus_db(conn: &mut rusqlite::Connection, beat_id: &str) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    for t in ["beat_uploads", "beat_sample_credits", "beat_description_overrides"] {
        tx.execute(&format!("DELETE FROM {t} WHERE beat_id = ?1"), [beat_id])?;
    }
    tx.execute("UPDATE artist_songs SET beat_id = NULL WHERE beat_id = ?1", [beat_id])?;
    tx.execute("DELETE FROM beats WHERE id = ?1", [beat_id])?;
    tx.commit()
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
        // Ohne Wert ans Ende, wie beim Datum
        "begonnen" => "COALESCE(begonnen, '9999-99-99')",
        // Alte Nummern als Zahl, Projektordner („Project_0121") danach
        "alte_id" => "CASE WHEN alte_id GLOB '[0-9]*' THEN printf('%07d', CAST(alte_id AS INTEGER)) ELSE 'z' || COALESCE(alte_id, 'zz') END",
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
        // Namensregel: Titel stehen groß, wie im Ordnernamen
        values.push(Box::new(name.to_uppercase()));
    }
    
    if let Some(bpm) = params.bpm {
        // 0 = geleert. null kann es nicht heißen, das bedeutet „nicht geändert“.
        updates.push("bpm = ?".to_string());
        values.push(Box::new((bpm > 0.0).then_some(bpm)));
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
        // Leer = geleert, als NULL gespeichert
        updates.push("sold_to = ?".to_string());
        values.push(Box::new(Some(sold_to.trim().to_string()).filter(|s| !s.is_empty())));
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
    /// Link zum Video/Track — macht den Punkt in der Archiv-Liste klickbar.
    pub url: Option<String>,
}

#[tauri::command]
pub fn get_upload_badges(beat_ids: Vec<String>) -> Result<Vec<UploadBadge>, String> {
    if beat_ids.is_empty() {
        return Ok(Vec::new());
    }
    let conn = open_db().map_err(|e| e.to_string())?;
    let placeholders: Vec<String> = (1..=beat_ids.len()).map(|i| format!("?{}", i)).collect();
    let sql = format!(
        "SELECT beat_id, platform, status, url FROM beat_uploads
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
                url: r.get(3)?,
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

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("
            CREATE TABLE beats (id TEXT PRIMARY KEY, name TEXT, key TEXT, tags TEXT, status TEXT, favorite INTEGER, frueher_nr TEXT);
            CREATE TABLE beat_uploads (beat_id TEXT, platform TEXT, status TEXT);
            CREATE TABLE beat_sample_credits (beat_id TEXT, producer_id INTEGER);
            CREATE TABLE beat_description_overrides (beat_id TEXT, platform TEXT, text TEXT);
            CREATE TABLE artist_songs (path TEXT PRIMARY KEY, beat_id TEXT);
        ").unwrap();
        conn
    }

    fn zahl(conn: &rusqlite::Connection, sql: &str) -> i64 {
        conn.query_row(sql, [], |r| r.get(0)).unwrap()
    }

    #[test]
    fn loeschen_nimmt_die_verweise_mit() {
        let mut conn = db();
        conn.execute_batch("
            INSERT INTO beats (id, name) VALUES ('0402', 'BLEIBT'), ('0403', 'WEG');
            INSERT INTO beat_uploads VALUES ('0402', 'youtube', 'uploaded'), ('0403', 'youtube', 'uploaded');
            INSERT INTO beat_sample_credits VALUES ('0403', 1);
            INSERT INTO beat_description_overrides VALUES ('0403', 'youtube', 'x');
            INSERT INTO artist_songs VALUES ('song', '0403'), ('anderer', '0402');
        ").unwrap();

        beat_aus_db(&mut conn, "0403").unwrap();

        // Ein neuer Beat 0403 fände nichts Geerbtes vor
        assert_eq!(zahl(&conn, "SELECT COUNT(*) FROM beats WHERE id = '0403'"), 0);
        assert_eq!(zahl(&conn, "SELECT COUNT(*) FROM beat_uploads WHERE beat_id = '0403'"), 0);
        assert_eq!(zahl(&conn, "SELECT COUNT(*) FROM beat_sample_credits"), 0);
        assert_eq!(zahl(&conn, "SELECT COUNT(*) FROM beat_description_overrides"), 0);
        // Der Song bleibt, nur die Verknüpfung ist gelöst
        assert_eq!(zahl(&conn, "SELECT COUNT(*) FROM artist_songs WHERE path = 'song' AND beat_id IS NULL"), 1);
        // Der Nachbar ist unberührt
        assert_eq!(zahl(&conn, "SELECT COUNT(*) FROM beat_uploads WHERE beat_id = '0402'"), 1);
        assert_eq!(zahl(&conn, "SELECT COUNT(*) FROM artist_songs WHERE beat_id = '0402'"), 1);
    }

    fn treffer(conn: &rusqlite::Connection, suche: &str) -> Vec<String> {
        let (wo, params, _) = base_beat_filters(&Some(suche.to_string()), &None, false);
        let refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        let mut stmt = conn.prepare(&format!("SELECT name FROM beats WHERE {} ORDER BY name", wo.join(" AND "))).unwrap();
        let namen: Vec<String> = stmt.query_map(refs.as_slice(), |r| r.get(0)).unwrap().flatten().collect();
        namen
    }

    #[test]
    fn suche_umlaute_und_platzhalter() {
        let conn = db();
        conn.execute_batch("
            INSERT INTO beats (id, name, tags) VALUES
              ('0001', 'TRÄUME', NULL), ('0002', 'Über Nacht', NULL),
              ('0003', '100% REAL', NULL), ('0004', 'PIECES', 'dark, Düster');
        ").unwrap();

        assert_eq!(treffer(&conn, "träume"), ["TRÄUME"]);
        assert_eq!(treffer(&conn, "über"), ["Über Nacht"]);
        assert_eq!(treffer(&conn, "düster"), ["PIECES"]);
        // % und _ suchen sich selbst statt alles zu treffen
        assert_eq!(treffer(&conn, "%"), ["100% REAL"]);
        assert!(treffer(&conn, "_").is_empty());
        // Wie bisher: ASCII ohne Rücksicht auf Groß/Klein, Nummer mit B davor
        assert_eq!(treffer(&conn, "pieces"), ["PIECES"]);
        assert_eq!(treffer(&conn, "B0004"), ["PIECES"]);
    }
}
