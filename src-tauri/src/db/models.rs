// src-tauri/src/db/models.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Data Models / Structs
// ═══════════════════════════════════════════════════════════════════════════════

use rusqlite::Result as SqlResult;
use serde::{Deserialize, Serialize};

// ══════════════════════════════════════════════════════════════════════════════
// CORE MODELS
// ══════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Beat {
    pub id: String,
    pub name: String,
    pub path: Option<String>,
    pub bpm: Option<f64>,
    pub key: Option<String>,
    pub status: Option<String>,
    pub tags: Option<String>,
    pub favorite: Option<i64>,
    pub created_date: Option<String>,
    pub modified_date: Option<String>,
    pub notes: Option<String>,
    pub sold_to: Option<String>,
    pub has_artwork: Option<i64>,
    pub has_video: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CustomTag {
    pub id: i64,
    pub tag: String,
    pub display_name: String,
    pub category: String,
    pub usage_count: i64,
    pub created_at: String,
}

// ══════════════════════════════════════════════════════════════════════════════
// STATS MODELS
// ══════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Serialize, Deserialize)]
pub struct Stats {
    pub total: i64,
    pub this_month: i64,
    pub favorites: i64,
    pub avg_bpm: f64,
    pub by_status: ByStatus,
    pub top_keys: Vec<KeyCount>,
    pub top_tags: Vec<TagCount>,
    pub beats_per_month: Vec<MonthCount>,
    pub recent_beats: Vec<Beat>,
    pub available_years: Vec<i64>,
    pub selected_year: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ByStatus {
    pub idea: i64,
    pub wip: i64,
    pub finished: i64,
    pub sold: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct KeyCount {
    pub key: String,
    pub count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TagCount {
    pub tag: String,
    pub count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MonthCount {
    pub month: String,
    pub count: i64,
}

// ══════════════════════════════════════════════════════════════════════════════
// CREATE TAB MODELS
// ══════════════════════════════════════════════════════════════════════════════

/// Audio-Datei Info für Source File Dropdown
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AudioFileInfo {
    pub path: String,
    pub name: String,
    pub extension: String,
    pub size: u64,
    pub modified_at: String,
    pub is_untagged: bool,
}

/// FLP-Datei Info für Source FLP Dropdown
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FlpFileInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub modified_at: String,
    pub created_at: String,
    pub is_master: bool,
    pub is_newest: bool,
}

/// Parsed Beat Folder — alles was wir aus dem Source-Ordner extrahieren
#[derive(Debug, Serialize, Deserialize)]
pub struct ParsedBeatFolder {
    pub name: String,
    pub key: Option<String>,
    pub bpm: Option<i32>,
    pub flp_path: Option<String>,
    pub flp_files: Vec<FlpFileInfo>,
    pub created_date: Option<String>,
    pub year_month: String,
    pub audio_files: Vec<AudioFileInfo>,
    pub all_files: Vec<String>,
    pub cover_path: Option<String>,
    pub source_path: String,
    pub suggested_id: i32,
}

// ══════════════════════════════════════════════════════════════════════════════
// ARCHIVE MODELS
// ══════════════════════════════════════════════════════════════════════════════

/// Ergebnis einer Duplikat-Prüfung
#[derive(Debug, Serialize, Deserialize)]
pub struct DuplicateCheckResult {
    pub has_duplicate: bool,
    pub duplicate_type: Option<String>,
    pub existing_id: Option<String>,
    pub existing_name: Option<String>,
}

/// Ergebnis eines Archive-Vorgangs
#[derive(Debug, Serialize, Deserialize)]
pub struct ArchiveResult {
    pub success: bool,
    pub beat_id: String,
    pub archive_path: String,
    pub message: String,
}

/// Scan-Ergebnis für Archive-Import
#[derive(Debug, Serialize, Deserialize)]
pub struct ScanResult {
    pub found: i64,
    pub imported: i64,
    pub skipped: i64,
    pub errors: Vec<String>,
}

// ══════════════════════════════════════════════════════════════════════════════
// BROWSE TAB MODELS
// ══════════════════════════════════════════════════════════════════════════════

/// Paginated beats response
#[derive(Debug, Serialize)]
pub struct PaginatedBeatsResponse {
    pub beats: Vec<Beat>,
    pub total_count: i64,
}

/// Update beat parameters
#[derive(Debug, Deserialize)]
pub struct UpdateBeatParams {
    pub id: String,
    pub name: Option<String>,
    pub bpm: Option<f64>,
    pub key: Option<String>,
    pub status: Option<String>,
    pub tags: Option<String>,
    pub notes: Option<String>,
    pub sold_to: Option<String>,
}

// ══════════════════════════════════════════════════════════════════════════════
// AUDIO PLAYER MODELS
// ══════════════════════════════════════════════════════════════════════════════

/// Audio file info for streaming
#[derive(Debug, Serialize, Deserialize)]
pub struct StreamingAudioInfo {
    pub path: String,
    pub format: String,
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

/// Convert a database row to a Beat struct
pub fn row_to_beat(row: &rusqlite::Row) -> SqlResult<Beat> {
    Ok(Beat {
        id:            row.get::<_, String>(0).unwrap_or_default(),
        name:          row.get::<_, String>(1).unwrap_or_default(),
        path:          row.get(2).ok(),
        bpm:           row.get(3).ok(),
        key:           row.get(4).ok(),
        status:        row.get(5).ok(),
        tags:          row.get(6).ok(),
        favorite:      row.get(7).ok(),
        created_date:  row.get(8).ok(),
        modified_date: row.get(9).ok(),
        notes:         row.get(10).ok(),
        sold_to:       row.get(11).ok(),
        has_artwork:   row.get(12).ok(),
        has_video:     row.get(13).ok(),
    })
}
