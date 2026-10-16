// src-tauri/src/commands/upload/write.rs
// Type-beat info, per-platform upload status, and presets.

use super::{PLATFORMS, VALID_STATUSES};
use crate::db::open_db;
use serde::{Deserialize, Serialize};

// ═══════════════════════════════════════════════════════════════════════════════
// Phase C — write commands (type-beat info, upload status, presets)
// ═══════════════════════════════════════════════════════════════════════════════

/// Update the five Upload-tab type-beat fields on the beats row.
/// Empty strings are stored as NULL (cleaner for templates and queries).
#[tauri::command]
pub fn update_type_beat_info(
    beat_id: String,
    main: String,
    also_fits: String,
    genre_tags: String,
    youtube_tags: String,
    soundcloud_tags: String,
) -> Result<(), String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE beats SET
            type_beat_main      = ?1,
            type_beat_also_fits = ?2,
            genre_tags          = ?3,
            youtube_tags        = ?4,
            soundcloud_tags     = ?5,
            modified_date       = datetime('now')
         WHERE id = ?6",
        rusqlite::params![
            empty_to_none(&main),
            empty_to_none(&also_fits),
            empty_to_none(&genre_tags),
            empty_to_none(&youtube_tags),
            empty_to_none(&soundcloud_tags),
            beat_id,
        ],
    ).map_err(|e| format!("Failed to update type-beat info: {}", e))?;
    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════════
// Kapitelmarken
// ═══════════════════════════════════════════════════════════════════════════════

/// Eine Marke: Sekunden plus Beschriftung.
#[derive(Debug, Deserialize, Serialize, PartialEq)]
pub struct Timecode {
    pub seconds: i64,
    pub label:   String,
}

/// Sekunden → "M:SS", ab einer Stunde "H:MM:SS".
/// YouTube liest beide Formen; kürzer ist lesbarer.
pub fn format_timecode(seconds: i64) -> String {
    let s = seconds.max(0);
    let (h, m, sec) = (s / 3600, (s % 3600) / 60, s % 60);
    if h > 0 { format!("{}:{:02}:{:02}", h, m, sec) } else { format!("{}:{:02}", m, sec) }
}

/// Aus den Zeilen der Karte wird der Block, der so in die Beschreibung geht.
///
/// Hier wird auch aufgeräumt, und zwar bewusst beim Speichern statt beim
/// Rendern: nach Zeit sortieren, Marken ohne Beschriftung weglassen, und je
/// Zeitpunkt nur die erste behalten. Zwei Kapitel auf derselben Sekunde lässt
/// YouTube den ganzen Block verwerfen.
///
/// Die erste Marke wird auf 0:00 gezogen, wenn keine dort liegt — ohne
/// Startmarke ignoriert YouTube die Kapitel komplett. Die Karte hält die
/// erste Zeile deshalb ohnehin fest; das hier ist der Gurt dahinter.
pub fn build_timecode_block(mut marks: Vec<Timecode>) -> String {
    marks.retain(|m| !m.label.trim().is_empty());
    marks.sort_by_key(|m| m.seconds.max(0));
    marks.dedup_by_key(|m| m.seconds.max(0));

    if let Some(first) = marks.first_mut() {
        if first.seconds > 0 { first.seconds = 0; }
    }

    marks.iter()
        .map(|m| format!("{} {}", format_timecode(m.seconds), m.label.trim()))
        .collect::<Vec<_>>()
        .join("\n")
}

/// Kapitelmarken eines Beats speichern. Leere Liste = Spalte auf NULL, damit
/// `{{TIMECODES}}` sauber verschwindet statt eine Leerzeile zu hinterlassen.
#[tauri::command]
pub fn update_beat_timecodes(beat_id: String, marks: Vec<Timecode>) -> Result<(), String> {
    let block = build_timecode_block(marks);
    let conn = open_db().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE beats SET timecodes = ?1, modified_date = datetime('now') WHERE id = ?2",
        rusqlite::params![empty_to_none(&block), beat_id],
    ).map_err(|e| format!("Kapitelmarken konnten nicht gespeichert werden: {}", e))?;
    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct UpdateUploadStatusParams {
    pub beat_id:      String,
    pub platform:     String,
    pub status:       String,
    pub scheduled_at: Option<String>,
    pub uploaded_at:  Option<String>,
    pub url:          Option<String>,
}

/// Upsert a beat_uploads row for one platform.
/// Validates platform + status against the table's CHECK constraints
/// so the DB error never surfaces as a confusing SQL message.
#[tauri::command]
pub fn update_upload_status(params: UpdateUploadStatusParams) -> Result<(), String> {
    if !PLATFORMS.contains(&params.platform.as_str()) {
        return Err(format!("Invalid platform: {}", params.platform));
    }
    if !VALID_STATUSES.contains(&params.status.as_str()) {
        return Err(format!("Invalid status: {}", params.status));
    }

    let conn = open_db().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO beat_uploads (beat_id, platform, status, scheduled_at, uploaded_at, url)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(beat_id, platform) DO UPDATE SET
            status       = excluded.status,
            scheduled_at = excluded.scheduled_at,
            uploaded_at  = excluded.uploaded_at,
            url          = excluded.url",
        rusqlite::params![
            params.beat_id,
            params.platform,
            params.status,
            params.scheduled_at,
            params.uploaded_at,
            params.url,
        ],
    ).map_err(|e| format!("Failed to upsert upload status: {}", e))?;
    Ok(())
}

#[derive(Debug, Serialize)]
pub struct TypeBeatPreset {
    pub id:              i64,
    pub label:           String,
    pub main_artists:    String,
    pub also_fits:       Option<String>,
    pub genre_tags:      Option<String>,
    pub youtube_tags:    Option<String>,
    pub soundcloud_tags: Option<String>,
    pub use_count:       i64,
}

#[derive(Debug, Deserialize)]
pub struct SaveTypeBeatPresetParams {
    pub label:           String,
    pub main_artists:    String,
    pub also_fits:       Option<String>,
    pub genre_tags:      Option<String>,
    pub youtube_tags:    Option<String>,
    pub soundcloud_tags: Option<String>,
}

/// List all presets, most-used first then alphabetical.
#[tauri::command]
pub fn get_type_beat_presets() -> Result<Vec<TypeBeatPreset>, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, label, main_artists, also_fits, genre_tags,
                youtube_tags, soundcloud_tags, use_count
         FROM type_beat_presets
         ORDER BY use_count DESC, LOWER(label) ASC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |row| {
        Ok(TypeBeatPreset {
            id:              row.get(0)?,
            label:           row.get(1)?,
            main_artists:    row.get(2)?,
            also_fits:       row.get(3).ok(),
            genre_tags:      row.get(4).ok(),
            youtube_tags:    row.get(5).ok(),
            soundcloud_tags: row.get(6).ok(),
            use_count:       row.get(7)?,
        })
    }).map_err(|e| e.to_string())?;

    Ok(rows.filter_map(|r| r.ok()).collect())
}

/// Insert a new preset. Returns the new row id.
/// Rejects empty label / main_artists to keep the dropdown sane.
#[tauri::command]
pub fn save_type_beat_preset(params: SaveTypeBeatPresetParams) -> Result<i64, String> {
    let label = params.label.trim().to_string();
    let main  = params.main_artists.trim().to_string();
    if label.is_empty() {
        return Err("Preset label cannot be empty".into());
    }
    if main.is_empty() {
        return Err("Main artists cannot be empty".into());
    }

    let conn = open_db().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO type_beat_presets
            (label, main_artists, also_fits, genre_tags, youtube_tags, soundcloud_tags)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            label,
            main,
            params.also_fits.as_deref().map(str::trim).and_then(non_empty),
            params.genre_tags.as_deref().map(str::trim).and_then(non_empty),
            params.youtube_tags.as_deref().map(str::trim).and_then(non_empty),
            params.soundcloud_tags.as_deref().map(str::trim).and_then(non_empty),
        ],
    ).map_err(|e| format!("Failed to save preset: {}", e))?;

    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn delete_type_beat_preset(id: i64) -> Result<(), String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM type_beat_presets WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| format!("Failed to delete preset: {}", e))?;
    Ok(())
}

/// Increment the use_count when a preset is applied (drives sort order so
/// most-used presets bubble to the top of the dropdown over time).
#[tauri::command]
pub fn bump_preset_use(id: i64) -> Result<(), String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE type_beat_presets SET use_count = use_count + 1 WHERE id = ?1",
        rusqlite::params![id],
    ).map_err(|e| format!("Failed to bump preset use_count: {}", e))?;
    Ok(())
}

// ─── Tiny helpers ──────────────────────────────────────────────────────────

fn empty_to_none(s: &str) -> Option<&str> {
    let t = s.trim();
    if t.is_empty() { None } else { Some(t) }
}

fn non_empty(s: &str) -> Option<String> {
    if s.is_empty() { None } else { Some(s.to_string()) }
}


// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::{build_timecode_block, format_timecode, Timecode};

    fn m(seconds: i64, label: &str) -> Timecode {
        Timecode { seconds, label: label.to_string() }
    }

    #[test]
    fn zeit_wird_wie_bei_youtube_geschrieben() {
        assert_eq!(format_timecode(0), "0:00");
        assert_eq!(format_timecode(7), "0:07");
        assert_eq!(format_timecode(62), "1:02");
        assert_eq!(format_timecode(600), "10:00");
        // Ab einer Stunde die lange Form — bei Beats selten, aber sonst
        // stuende dort "63:20" statt "1:03:20".
        assert_eq!(format_timecode(3800), "1:03:20");
    }

    #[test]
    fn marken_kommen_sortiert_heraus() {
        let block = build_timecode_block(vec![
            m(62, "Verse 1"), m(0, "Intro"), m(24, "Pre-Hook"),
        ]);
        assert_eq!(block, "0:00 Intro\n0:24 Pre-Hook\n1:02 Verse 1");
    }

    #[test]
    fn marken_ohne_beschriftung_fallen_weg() {
        let block = build_timecode_block(vec![
            m(0, "Intro"), m(30, "   "), m(60, "Hook"),
        ]);
        assert_eq!(block, "0:00 Intro\n1:00 Hook");
    }

    /// Zwei Kapitel auf derselben Sekunde laesst YouTube den GANZEN Block
    /// verwerfen — deshalb bleibt nur das erste stehen.
    #[test]
    fn gleiche_sekunde_nur_einmal() {
        let block = build_timecode_block(vec![
            m(0, "Intro"), m(30, "Hook"), m(30, "Pre-Hook"),
        ]);
        assert_eq!(block, "0:00 Intro\n0:30 Hook");
    }

    /// Ohne Startmarke ignoriert YouTube die Kapitel komplett. Die Karte haelt
    /// die erste Zeile fest; das hier ist der Gurt dahinter.
    #[test]
    fn erste_marke_wird_auf_null_gezogen() {
        let block = build_timecode_block(vec![m(12, "Intro"), m(48, "Hook")]);
        assert_eq!(block, "0:00 Intro\n0:48 Hook");
    }

    #[test]
    fn ohne_marken_bleibt_der_block_leer() {
        assert_eq!(build_timecode_block(vec![]), "");
        assert_eq!(build_timecode_block(vec![m(0, "")]), "");
    }

    #[test]
    fn beschriftung_wird_getrimmt() {
        assert_eq!(build_timecode_block(vec![m(0, "  Intro  ")]), "0:00 Intro");
    }
}
