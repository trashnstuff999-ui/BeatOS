// src-tauri/src/lib.rs
use rusqlite::{Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const DB_PATH: &str = r"C:\Users\kismo\OneDrive\Dokumente\._BEAT LIBRARY\beats.db";

fn open_db() -> SqlResult<Connection> {
    let conn = Connection::open(DB_PATH)?;
    // Ensure custom_tags table exists
    conn.execute(
        "CREATE TABLE IF NOT EXISTS custom_tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tag TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL,
            category TEXT NOT NULL CHECK (category IN ('genre', 'vibe', 'instrument', 'other')),
            usage_count INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;
    Ok(conn)
}

// ══════════════════════════════════════════════════════════════════════════════
// STRUCTS
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

// ── Neue Structs für Create Tab ──────────────────────────────────────────────

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

/// FLP-Datei Info für Source FLP Dropdown (NEU)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FlpFileInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub modified_at: String,
    pub created_at: String,
    pub is_master: bool,   // true wenn "master" im Dateinamen
    pub is_newest: bool,   // true wenn neueste FLP (nach modified_at)
}

/// Parsed Beat Folder — alles was wir aus dem Source-Ordner extrahieren
#[derive(Debug, Serialize, Deserialize)]
pub struct ParsedBeatFolder {
    /// Beat name aus Audio-Dateiname geparst
    pub name: String,
    /// Musical key (z.B. "Cm", "F#m") — None wenn nicht erkannt
    pub key: Option<String>,
    /// BPM — None wenn nicht erkannt
    pub bpm: Option<i32>,
    /// Pfad zur ältesten FLP-Datei (für Datum) — Legacy, für Rückwärtskompatibilität
    pub flp_path: Option<String>,
    /// Alle FLP-Dateien im Root (NEU) — sortiert nach modified_at, neueste zuerst
    pub flp_files: Vec<FlpFileInfo>,
    /// Created date aus ältester FLP (Format: "YYYY-MM-DD")
    pub created_date: Option<String>,
    /// Year-Month String für Ordnerstruktur (z.B. "2025/03_MARCH")
    pub year_month: String,
    /// Audio-Dateien gefunden (sortiert: _untagged zuerst, dann nach mtime newest first)
    pub audio_files: Vec<AudioFileInfo>,
    /// Alle Dateien im Root (nur Dateinamen)
    pub all_files: Vec<String>,
    /// Cover-Image Pfad (erste PNG im Root)
    pub cover_path: Option<String>,
    /// Quellordner-Pfad
    pub source_path: String,
    /// Nächste freie Beat-ID (aus DB)
    pub suggested_id: i32,
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

fn row_to_beat(row: &rusqlite::Row) -> SqlResult<Beat> {
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

/// Konvertiert Unix-Sekunden zu "YYYY-MM-DD" String
fn secs_to_date(secs: u64) -> String {
    let days_since_epoch = secs / 86400;
    let (mut year, mut rem) = (1970u64, days_since_epoch);
    
    loop {
        let days_in_year = if year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) { 366u64 } else { 365u64 };
        if rem < days_in_year { break; }
        rem -= days_in_year;
        year += 1;
    }
    
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days_in_months = [31u64, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut month = 1u64;
    
    for &d in &days_in_months {
        if rem < d { break; }
        rem -= d;
        month += 1;
    }
    
    format!("{:04}-{:02}-{:02}", year, month, rem + 1)
}

/// Konvertiert Unix-Sekunden zu (year, month, day) Tuple
fn secs_to_ymd(secs: u64) -> (u64, u64, u64) {
    let days_since_epoch = secs / 86400;
    let (mut year, mut rem) = (1970u64, days_since_epoch);
    
    loop {
        let days_in_year = if year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) { 366u64 } else { 365u64 };
        if rem < days_in_year { break; }
        rem -= days_in_year;
        year += 1;
    }
    
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days_in_months = [31u64, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut month = 1u64;
    
    for &d in &days_in_months {
        if rem < d { break; }
        rem -= d;
        month += 1;
    }
    
    (year, month, rem + 1)
}

/// Gibt Unix-Sekunden für created time einer Datei zurück (fallback: modified)
fn file_created_secs(path: &Path) -> Option<u64> {
    let meta = std::fs::metadata(path).ok()?;
    let sys_time = meta.created().or_else(|_| meta.modified()).ok()?;
    Some(sys_time.duration_since(UNIX_EPOCH).ok()?.as_secs())
}

/// Gibt Unix-Sekunden für modified time einer Datei zurück
fn file_modified_secs(path: &Path) -> Option<u64> {
    let meta = std::fs::metadata(path).ok()?;
    let sys_time = meta.modified().ok()?;
    Some(sys_time.duration_since(UNIX_EPOCH).ok()?.as_secs())
}

/// Prüft ob ein String ein valider musikalischer Key ist (A-G mit optionalem #/b und m/M/min/maj)
fn is_valid_key(s: &str) -> bool {
    let s = s.trim();
    if s.is_empty() {
        return false;
    }
    
    // Gültige Keys: A, Am, A#, A#m, Ab, Abm, Amaj, Amin, etc.
    let first = s.chars().next().unwrap().to_ascii_uppercase();
    if !('A'..='G').contains(&first) {
        return false;
    }
    
    // Rest kann #, b, m, M, maj, min sein
    let rest = &s[1..].to_lowercase();
    if rest.is_empty() {
        return true; // Nur Buchstabe wie "A" oder "C"
    }
    
    // Mögliche Patterns nach dem Grundton
    let valid_suffixes = ["m", "min", "maj", "#", "b", "#m", "bm", "#min", "bmin", "#maj", "bmaj"];
    valid_suffixes.iter().any(|&suf| rest == suf)
}

/// Monatsnamen für year_month Ordner
const MONTH_NAMES: [&str; 12] = [
    "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
    "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
];

/// Generiert year_month String aus Unix-Sekunden (z.B. "2025/03_MARCH")
fn year_month_from_secs(secs: u64) -> String {
    let (year, month, _) = secs_to_ymd(secs);
    let month_idx = (month as usize).saturating_sub(1).min(11);
    format!("{}/{:02}_{}", year, month, MONTH_NAMES[month_idx])
}

/// Parst Audio-Dateiname im Format "Name [Key BPM].ext" oder "Name [BPM Key].ext"
/// Reihenfolge von Key und BPM ist egal - wird automatisch erkannt.
/// Beispiele:
///   - "Midnight Drift [Cm 140].wav" → ("Midnight Drift", Some("Cm"), Some(140))
///   - "Trap Beat [165 F#m]_untagged.mp3" → ("Trap Beat", Some("F#m"), Some(165))
///   - "Chill Vibes [135 Bm].wav" → ("Chill Vibes", Some("Bm"), Some(135))
fn parse_audio_filename(filename: &str) -> (String, Option<String>, Option<i32>) {
    // Extension entfernen
    let without_ext = filename
        .rsplit_once('.')
        .map(|(name, _)| name)
        .unwrap_or(filename);
    
    // Suffix wie _untagged, _tagged, _unmastered entfernen
    let without_suffix = without_ext
        .rsplit_once('_')
        .and_then(|(base, suffix)| {
            let lower = suffix.to_lowercase();
            if lower == "untagged" || lower == "tagged" || lower == "unmastered" 
                || lower == "master" || lower == "final" {
                Some(base)
            } else {
                None
            }
        })
        .unwrap_or(without_ext);
    
    // [Key BPM] oder [BPM Key] Pattern suchen
    if let (Some(lb), Some(rb)) = (without_suffix.rfind('['), without_suffix.rfind(']')) {
        if lb < rb {
            let name = without_suffix[..lb].trim().to_string();
            let bracket_content = &without_suffix[lb + 1..rb];
            let tokens: Vec<&str> = bracket_content.split_whitespace().collect();
            
            if tokens.is_empty() {
                return (name, None, None);
            }
            
            // Intelligente Erkennung: Finde BPM (reine Zahl) und Key (Buchstaben)
            let mut bpm: Option<i32> = None;
            let mut key_parts: Vec<&str> = Vec::new();
            
            for token in &tokens {
                // Prüfe ob Token eine reine Zahl ist (BPM)
                if let Ok(num) = token.parse::<i32>() {
                    // Plausibilitätsprüfung: BPM zwischen 40 und 300
                    if num >= 40 && num <= 300 {
                        bpm = Some(num);
                        continue;
                    }
                }
                
                // Prüfe ob Token mit Ziffern beginnt und dann Buchstaben hat (z.B. "140bpm")
                let digits: String = token.chars().take_while(|c| c.is_ascii_digit()).collect();
                if !digits.is_empty() {
                    if let Ok(num) = digits.parse::<i32>() {
                        if num >= 40 && num <= 300 {
                            bpm = Some(num);
                            // Rest nach Ziffern könnte Key sein (unwahrscheinlich, aber sicher)
                            let rest: String = token.chars().skip(digits.len()).collect();
                            if !rest.is_empty() && is_valid_key(&rest) {
                                key_parts.push(token.split_at(digits.len()).1);
                            }
                            continue;
                        }
                    }
                }
                
                // Ansonsten ist es Teil des Keys
                key_parts.push(token);
            }
            
            let key = if key_parts.is_empty() {
                None
            } else {
                Some(key_parts.join(" "))
            };
            
            return (name, key, bpm);
        }
    }
    
    // Kein Bracket-Pattern gefunden → Name ohne Parsing zurückgeben
    (without_suffix.to_string(), None, None)
}

/// Prüft ob eine Dateiendung eine Audio-Datei ist
fn is_audio_extension(ext: &str) -> bool {
    matches!(ext.to_lowercase().as_str(), "wav" | "mp3" | "flac" | "aiff" | "ogg" | "m4a")
}

/// Prüft ob eine Dateiendung ein Bild ist
fn is_image_extension(ext: &str) -> bool {
    matches!(ext.to_lowercase().as_str(), "png" | "jpg" | "jpeg" | "webp" | "gif")
}

// ══════════════════════════════════════════════════════════════════════════════
// CREATE TAB COMMANDS (NEU)
// ══════════════════════════════════════════════════════════════════════════════

/// Gibt die nächste freie Beat-ID zurück (MAX + 1)
#[tauri::command]
fn get_next_beat_id() -> Result<i32, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    
    // IDs können Strings sein wie "0042" — wir casten zu INTEGER für MAX
    let max_id: Option<i64> = conn
        .query_row(
            "SELECT MAX(CAST(id AS INTEGER)) FROM beats",
            [],
            |row| row.get(0),
        )
        .ok();
    
    // Nächste ID = MAX + 1, oder 1 wenn DB leer
    let next_id = max_id.map(|m| m as i32 + 1).unwrap_or(1);
    
    Ok(next_id)
}

/// Parst einen Beat-Ordner und extrahiert alle relevanten Metadaten
/// - Findet Audio-Dateien (priorisiert _untagged, dann nach mtime sortiert)
/// - Parst Name/Key/BPM aus dem ersten Audio-Dateinamen
/// - Findet älteste FLP für created_date
/// - Generiert year_month für Archiv-Struktur
/// - Findet Cover-PNG im Root
#[tauri::command]
fn parse_beat_folder_for_create(folder_path: String) -> Result<ParsedBeatFolder, String> {
    let path = Path::new(&folder_path);
    
    if !path.exists() {
        return Err(format!("Ordner existiert nicht: {}", folder_path));
    }
    if !path.is_dir() {
        return Err(format!("Pfad ist kein Ordner: {}", folder_path));
    }
    
    // ── Alle Dateien im Root sammeln ─────────────────────────────────────────
    let entries: Vec<_> = std::fs::read_dir(path)
        .map_err(|e| format!("Kann Ordner nicht lesen: {}", e))?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file())
        .collect();
    
    let all_files: Vec<String> = entries
        .iter()
        .filter_map(|e| e.file_name().to_str().map(|s| s.to_string()))
        .collect();
    
    // ── Audio-Dateien finden ─────────────────────────────────────────────────
    let mut audio_files: Vec<AudioFileInfo> = Vec::new();
    
    for entry in &entries {
        let file_path = entry.path();
        let file_name = match file_path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        
        let extension = file_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        
        if !is_audio_extension(&extension) {
            continue;
        }
        
        let meta = std::fs::metadata(&file_path).ok();
        let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
        let modified_secs = file_modified_secs(&file_path).unwrap_or(0);
        let modified_at = secs_to_date(modified_secs);
        
        // Prüfen ob _untagged im Namen
        let is_untagged = file_name.to_lowercase().contains("_untagged");
        
        audio_files.push(AudioFileInfo {
            path: file_path.to_string_lossy().to_string(),
            name: file_name,
            extension,
            size,
            modified_at,
            is_untagged,
        });
    }
    
    // Sortierung: _untagged zuerst, dann nach mtime (neueste zuerst)
    audio_files.sort_by(|a, b| {
        // _untagged hat Priorität
        match (a.is_untagged, b.is_untagged) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => {
                // Beide gleich → nach mtime sortieren (neueste zuerst)
                let a_secs = file_modified_secs(Path::new(&a.path)).unwrap_or(0);
                let b_secs = file_modified_secs(Path::new(&b.path)).unwrap_or(0);
                b_secs.cmp(&a_secs) // Descending
            }
        }
    });
    
    // ── Name/Key/BPM aus erster Audio-Datei parsen ───────────────────────────
    let (name, key, bpm) = audio_files
        .first()
        .map(|f| parse_audio_filename(&f.name))
        .unwrap_or_else(|| {
            // Fallback: Ordnername als Name
            let folder_name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("Unknown Beat")
                .to_string();
            (folder_name, None, None)
        });
    
    // ── FLP-Dateien finden (alle im Root) ──────────────────────────────────────
    let mut flp_entries: Vec<(u64, u64, PathBuf)> = Vec::new(); // (created_secs, modified_secs, path)
    
    for entry in &entries {
        let file_path = entry.path();
        if file_path.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()) == Some("flp".to_string()) {
            let created_secs = file_created_secs(&file_path).unwrap_or(0);
            let modified_secs = file_modified_secs(&file_path).unwrap_or(0);
            flp_entries.push((created_secs, modified_secs, file_path));
        }
    }
    
    // Nach modified_at sortieren (neueste zuerst) für is_newest Bestimmung
    flp_entries.sort_by(|a, b| b.1.cmp(&a.1)); // Descending by modified_secs
    
    // Neueste modified_secs für is_newest Flag
    let newest_modified = flp_entries.first().map(|(_, m, _)| *m).unwrap_or(0);
    
    // FlpFileInfo Vec bauen
    let flp_files: Vec<FlpFileInfo> = flp_entries
        .iter()
        .map(|(created_secs, modified_secs, path)| {
            let file_name = path.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown.flp")
                .to_string();
            
            let meta = std::fs::metadata(path).ok();
            let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
            
            // Prüfen ob "master" im Dateinamen (case-insensitive)
            let is_master = file_name.to_lowercase().contains("master");
            
            // Neueste Datei markieren
            let is_newest = *modified_secs == newest_modified;
            
            FlpFileInfo {
                path: path.to_string_lossy().to_string(),
                name: file_name,
                size,
                modified_at: secs_to_date(*modified_secs),
                created_at: secs_to_date(*created_secs),
                is_master,
                is_newest,
            }
        })
        .collect();
    
    // Älteste FLP für created_date (nach created_secs sortieren)
    let mut flp_by_created = flp_entries.clone();
    flp_by_created.sort_by_key(|(created, _, _)| *created); // Ascending by created_secs
    
    let (flp_path, created_date, year_month) = if let Some((secs, _, flp)) = flp_by_created.first() {
        (
            Some(flp.to_string_lossy().to_string()),
            Some(secs_to_date(*secs)),
            year_month_from_secs(*secs),
        )
    } else {
        // Kein FLP gefunden → aktuelles Datum als Fallback
        let now_secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        (None, None, year_month_from_secs(now_secs))
    };
    
    // ── Cover-PNG finden (jede PNG im Root) ──────────────────────────────────
    let cover_path = entries
        .iter()
        .find(|e| {
            let ext = e.path()
                .extension()
                .and_then(|x| x.to_str())
                .unwrap_or("")
                .to_lowercase();
            ext == "png"
        })
        .map(|e| e.path().to_string_lossy().to_string());
    
    // ── Nächste Beat-ID aus DB ───────────────────────────────────────────────
    let suggested_id = get_next_beat_id().unwrap_or(1);
    
    Ok(ParsedBeatFolder {
        name,
        key,
        bpm,
        flp_path,
        flp_files,
        created_date,
        year_month,
        audio_files,
        all_files,
        cover_path,
        source_path: folder_path,
        suggested_id,
    })
}

/// Liest eine Bild-Datei und gibt sie als Base64-String zurück
/// Format: "data:image/png;base64,..." (direkt verwendbar als img src)
#[tauri::command]
fn read_image_file(file_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);
    
    if !path.exists() {
        return Err(format!("Datei existiert nicht: {}", file_path));
    }
    
    // Extension für MIME-Type
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();
    
    if !is_image_extension(&extension) {
        return Err(format!("Keine Bild-Datei: {}", file_path));
    }
    
    // MIME-Type bestimmen
    let mime_type = match extension.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "image/png",
    };
    
    // Datei lesen
    let bytes = std::fs::read(path)
        .map_err(|e| format!("Kann Datei nicht lesen: {}", e))?;
    
    // Base64 encodieren
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    let encoded = STANDARD.encode(&bytes);
    
    // Data-URL Format zurückgeben
    Ok(format!("data:{};base64,{}", mime_type, encoded))
}

// ══════════════════════════════════════════════════════════════════════════════
// ARCHIVE BEAT COMMANDS (NEU)
// ══════════════════════════════════════════════════════════════════════════════

/// Ergebnis einer Duplikat-Prüfung
#[derive(Debug, Serialize, Deserialize)]
pub struct DuplicateCheckResult {
    /// true wenn ein Duplikat gefunden wurde
    pub has_duplicate: bool,
    /// Art des Duplikats: "id", "name_key_bpm", oder None
    pub duplicate_type: Option<String>,
    /// ID des existierenden Beats
    pub existing_id: Option<String>,
    /// Name des existierenden Beats
    pub existing_name: Option<String>,
}

/// Prüft ob ein Beat mit gleicher ID oder Name/Key/BPM Kombination existiert
#[tauri::command]
fn check_beat_duplicate(
    catalog_id: i32,
    title: String,
    key: Option<String>,
    bpm: Option<i32>,
) -> Result<DuplicateCheckResult, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    
    // 1. Prüfe ob ID bereits existiert
    let id_str = catalog_id.to_string();
    let id_padded = format!("{:04}", catalog_id);
    
    let existing_by_id: Option<(String, String)> = conn
        .query_row(
            "SELECT id, name FROM beats WHERE id = ?1 OR id = ?2",
            [&id_str, &id_padded],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .ok();
    
    if let Some((existing_id, existing_name)) = existing_by_id {
        return Ok(DuplicateCheckResult {
            has_duplicate: true,
            duplicate_type: Some("id".to_string()),
            existing_id: Some(existing_id),
            existing_name: Some(existing_name),
        });
    }
    
    // 2. Prüfe ob Name + Key + BPM Kombination existiert
    let title_lower = title.to_lowercase();
    let key_lower = key.as_ref().map(|k| k.to_lowercase());
    
    let mut query = String::from(
        "SELECT id, name FROM beats WHERE LOWER(name) = ?1"
    );
    
    // Key-Vergleich (NULL-safe)
    if key_lower.is_some() {
        query.push_str(" AND LOWER(key) = ?2");
    } else {
        query.push_str(" AND (key IS NULL OR key = '')");
    }
    
    // BPM-Vergleich (NULL-safe, mit Toleranz von ±2)
    if let Some(b) = bpm {
        query.push_str(&format!(" AND bpm BETWEEN {} AND {}", b - 2, b + 2));
    } else {
        query.push_str(" AND (bpm IS NULL OR bpm = '')");
    }
    
    let existing_by_combo: Option<(String, String)> = if let Some(ref k) = key_lower {
        conn.query_row(&query, [&title_lower, k], |row| Ok((row.get(0)?, row.get(1)?)))
            .ok()
    } else {
        conn.query_row(&query, [&title_lower], |row| Ok((row.get(0)?, row.get(1)?)))
            .ok()
    };
    
    if let Some((existing_id, existing_name)) = existing_by_combo {
        return Ok(DuplicateCheckResult {
            has_duplicate: true,
            duplicate_type: Some("name_key_bpm".to_string()),
            existing_id: Some(existing_id),
            existing_name: Some(existing_name),
        });
    }
    
    // Kein Duplikat gefunden
    Ok(DuplicateCheckResult {
        has_duplicate: false,
        duplicate_type: None,
        existing_id: None,
        existing_name: None,
    })
}

/// Parameter für archive_beat Command
#[derive(Debug, Serialize, Deserialize)]
pub struct ArchiveBeatParams {
    /// Quellordner-Pfad
    pub source_folder: String,
    /// Beat-Titel
    pub title: String,
    /// Musical Key (optional)
    pub key: Option<String>,
    /// BPM (optional)
    pub bpm: Option<i32>,
    /// Catalog ID (z.B. 42)
    pub catalog_id: i32,
    /// Status (idea, wip, finished, sold)
    pub status: String,
    /// Tags (comma-separated)
    pub tags: String,
    /// Interne Notizen
    pub notes: String,
    /// Pfad zur ausgewählten Source-Audio
    pub source_audio_path: String,
    /// Pfad zur ausgewählten Haupt-FLP
    pub source_flp_path: String,
    /// Pfad zum ausgewählten Cover (optional)
    pub cover_path: Option<String>,
    /// Year-Month für Zielordner (z.B. "2025/03_MARCH")
    pub year_month: String,
    /// Basis-Pfad zum Archive (z.B. "C:\...\03_ARCHIVE")
    pub archive_base_path: String,
}

/// Ergebnis einer erfolgreichen Archivierung
#[derive(Debug, Serialize, Deserialize)]
pub struct ArchiveResult {
    /// true wenn erfolgreich
    pub success: bool,
    /// Pfad zum neuen Beat-Ordner
    pub archive_path: String,
    /// Beat-ID in der Datenbank
    pub beat_id: String,
    /// Anzahl kopierter Dateien
    pub files_copied: i32,
    /// Fehlermeldung (nur bei success=false)
    pub error: Option<String>,
}

/// Datei-Metadaten für create_date.json
#[derive(Debug, Serialize, Deserialize)]
struct FileMetadata {
    original_path: String,
    created_at: String,
    modified_at: String,
    accessed_at: String,
}

/// Inhalt der create_date.json
#[derive(Debug, Serialize, Deserialize)]
struct CreateDateJson {
    archived_at: String,
    source_folder: String,
    files: Vec<FileMetadata>,
}

/// Gibt accessed time einer Datei als Unix-Sekunden zurück
fn file_accessed_secs(path: &Path) -> Option<u64> {
    let meta = std::fs::metadata(path).ok()?;
    let sys_time = meta.accessed().ok()?;
    Some(sys_time.duration_since(UNIX_EPOCH).ok()?.as_secs())
}

/// Kopiert eine Datei und verifiziert die Kopie
fn copy_and_verify(source: &Path, dest: &Path) -> Result<(), String> {
    // Kopiere mit Metadaten
    std::fs::copy(source, dest)
        .map_err(|e| format!("Fehler beim Kopieren von {:?}: {}", source.file_name(), e))?;
    
    // Verifiziere Dateigröße
    let source_size = std::fs::metadata(source)
        .map_err(|e| format!("Kann Source-Metadaten nicht lesen: {}", e))?
        .len();
    
    let dest_size = std::fs::metadata(dest)
        .map_err(|e| format!("Kann Ziel-Metadaten nicht lesen: {}", e))?
        .len();
    
    if source_size != dest_size {
        // Rollback: Lösche fehlerhaft kopierte Datei
        let _ = std::fs::remove_file(dest);
        return Err(format!(
            "Größenverifikation fehlgeschlagen für {:?}: {} vs {} bytes",
            source.file_name(), source_size, dest_size
        ));
    }
    
    Ok(())
}

/// Kopiert einen Ordner rekursiv
fn copy_dir_recursive(source: &Path, dest: &Path) -> Result<i32, String> {
    let mut count = 0;
    
    std::fs::create_dir_all(dest)
        .map_err(|e| format!("Kann Zielordner nicht erstellen: {}", e))?;
    
    for entry in std::fs::read_dir(source)
        .map_err(|e| format!("Kann Quellordner nicht lesen: {}", e))? 
    {
        let entry = entry.map_err(|e| format!("Fehler beim Lesen: {}", e))?;
        let path = entry.path();
        let dest_path = dest.join(entry.file_name());
        
        if path.is_dir() {
            count += copy_dir_recursive(&path, &dest_path)?;
        } else {
            copy_and_verify(&path, &dest_path)?;
            count += 1;
        }
    }
    
    Ok(count)
}

/// Hauptfunktion: Archiviert einen Beat in die standardisierte Ordnerstruktur
/// 
/// Ablauf:
/// 1. Zielordner erstellen: {archive_base}/{year_month}/#{id} {title} [{key} {bpm}]/
/// 2. Unterordner erstellen: 01_AUDIO, 02_VISUALS, 03_PROJECTS
/// 3. Dateien kopieren mit Umbenennung
/// 4. create_date.json erstellen
/// 5. Beat in DB eintragen
#[tauri::command]
fn archive_beat(params: ArchiveBeatParams) -> Result<ArchiveResult, String> {
    let source_path = Path::new(&params.source_folder);
    
    // ── Validierung ───────────────────────────────────────────────────────────
    if !source_path.exists() {
        return Err(format!("Quellordner existiert nicht: {}", params.source_folder));
    }
    
    // ── Zielordner-Name bauen ─────────────────────────────────────────────────
    let key_bpm = match (&params.key, params.bpm) {
        (Some(k), Some(b)) => format!("[{} {}]", k, b),
        (Some(k), None) => format!("[{}]", k),
        (None, Some(b)) => format!("[{}]", b),
        (None, None) => String::new(),
    };
    
    // Format: "0870 - PIECES [Bm 135]" (ohne #)
    let folder_name = format!(
        "{:04} - {} {}",
        params.catalog_id,
        params.title,
        key_bpm
    ).trim().to_string();
    
    let archive_base = Path::new(&params.archive_base_path);
    let target_path = archive_base
        .join(&params.year_month)
        .join(&folder_name);
    
    // Prüfe ob Ziel bereits existiert
    if target_path.exists() {
        return Err(format!("Zielordner existiert bereits: {:?}", target_path));
    }
    
    // ── Unterordner erstellen ─────────────────────────────────────────────────
    let audio_dir = target_path.join("01_AUDIO");
    let visuals_dir = target_path.join("02_VISUALS");
    let projects_dir = target_path.join("03_PROJECTS");
    
    std::fs::create_dir_all(&audio_dir)
        .map_err(|e| format!("Kann 01_AUDIO nicht erstellen: {}", e))?;
    std::fs::create_dir_all(&visuals_dir)
        .map_err(|e| format!("Kann 02_VISUALS nicht erstellen: {}", e))?;
    std::fs::create_dir_all(&projects_dir)
        .map_err(|e| format!("Kann 03_PROJECTS nicht erstellen: {}", e))?;
    
    let mut files_copied = 0;
    let mut file_metadata: Vec<FileMetadata> = Vec::new();
    
    // ── Dateien im Source-Ordner verarbeiten ──────────────────────────────────
    let entries: Vec<_> = std::fs::read_dir(source_path)
        .map_err(|e| format!("Kann Quellordner nicht lesen: {}", e))?
        .filter_map(|e| e.ok())
        .collect();
    
    // Ausgewählte FLP für Namensbestimmung
    let selected_flp_path = Path::new(&params.source_flp_path);
    let selected_flp_name = selected_flp_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");
    
    // Ausgewähltes Cover für Umbenennung
    let selected_cover = params.cover_path.as_ref().map(|p| Path::new(p));
    
    // Neuer Dateiname-Basis
    let new_name_base = match (&params.key, params.bpm) {
        (Some(k), Some(b)) => format!("{} [{} {}]", params.title, k, b),
        (Some(k), None) => format!("{} [{}]", params.title, k),
        (None, Some(b)) => format!("{} [{}]", params.title, b),
        (None, None) => params.title.clone(),
    };
    
    let mut cover_count = 0;
    
    // ── EXTERNES COVER: Falls cover_path gesetzt und NICHT im source_folder ────
    if let Some(cover_path_str) = &params.cover_path {
        let cover_path = Path::new(cover_path_str);
        
        // Prüfe ob Cover außerhalb des Source-Ordners liegt
        let is_external = !cover_path.starts_with(source_path);
        
        if is_external && cover_path.exists() {
            let ext = cover_path.extension()
                .and_then(|e| e.to_str())
                .unwrap_or("png")
                .to_lowercase();
            
            // Cover umbenennen zu SONGNAME_COVER.ext
            let cover_name = format!("{}_COVER.{}", params.title, ext);
            let dest = visuals_dir.join(&cover_name);
            
            copy_and_verify(cover_path, &dest)?;
            files_copied += 1;
            
            // Metadaten für externes Cover sammeln
            let created = file_created_secs(cover_path).unwrap_or(0);
            let modified = file_modified_secs(cover_path).unwrap_or(0);
            let accessed = file_accessed_secs(cover_path).unwrap_or(0);
            
            file_metadata.push(FileMetadata {
                original_path: cover_path_str.clone(),
                created_at: secs_to_date(created),
                modified_at: secs_to_date(modified),
                accessed_at: secs_to_date(accessed),
            });
        }
    }
    
    for entry in entries {
        let path = entry.path();
        let file_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        
        // Metadaten sammeln
        let created = file_created_secs(&path).unwrap_or(0);
        let modified = file_modified_secs(&path).unwrap_or(0);
        let accessed = file_accessed_secs(&path).unwrap_or(0);
        
        file_metadata.push(FileMetadata {
            original_path: path.to_string_lossy().to_string(),
            created_at: secs_to_date(created),
            modified_at: secs_to_date(modified),
            accessed_at: secs_to_date(accessed),
        });
        
        if path.is_dir() {
            // Unterordner → komplett nach 03_PROJECTS kopieren
            let dest = projects_dir.join(&file_name);
            files_copied += copy_dir_recursive(&path, &dest)?;
        } else {
            let ext = path.extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            
            if is_audio_extension(&ext) {
                // Audio → 01_AUDIO (Original-Name behalten)
                let dest = audio_dir.join(&file_name);
                copy_and_verify(&path, &dest)?;
                files_copied += 1;
            } else if is_image_extension(&ext) {
                // Bilder → 02_VISUALS
                // Prüfe ob dieses Bild das ausgewählte Cover ist
                let is_selected_cover = selected_cover
                    .map(|c| c == path)
                    .unwrap_or(false);
                
                // Prüfe ob ein EXTERNES Cover gewählt wurde (dann sind alle internen Bilder "old")
                let has_external_cover = params.cover_path.as_ref()
                    .map(|cp| !Path::new(cp).starts_with(source_path))
                    .unwrap_or(false);
                
                let new_name = if is_selected_cover && !has_external_cover {
                    // Dieses interne Bild ist das Hauptcover
                    format!("{}_COVER.{}", params.title, ext)
                } else {
                    // Nicht das Hauptcover → als _old markieren
                    cover_count += 1;
                    format!("{}_COVER_old{}.{}", params.title, cover_count, ext)
                };
                
                let dest = visuals_dir.join(&new_name);
                copy_and_verify(&path, &dest)?;
                files_copied += 1;
            } else if ext == "flp" {
                // FLP → 03_PROJECTS mit Umbenennung
                let is_selected = path.to_string_lossy() == params.source_flp_path;
                let is_master = file_name.to_lowercase().contains("master");
                
                let new_name = if is_selected {
                    format!("{}.flp", new_name_base)
                } else if is_master {
                    format!("{}_master.flp", new_name_base)
                } else {
                    format!("{}_old.flp", new_name_base)
                };
                
                let dest = projects_dir.join(&new_name);
                copy_and_verify(&path, &dest)?;
                files_copied += 1;
            } else {
                // Andere Dateien → 03_PROJECTS (Original-Name)
                let dest = projects_dir.join(&file_name);
                copy_and_verify(&path, &dest)?;
                files_copied += 1;
            }
        }
    }
    
    // ── create_date.json erstellen ────────────────────────────────────────────
    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    
    let create_date_json = CreateDateJson {
        archived_at: secs_to_date(now_secs),
        source_folder: params.source_folder.clone(),
        files: file_metadata,
    };
    
    let json_content = serde_json::to_string_pretty(&create_date_json)
        .map_err(|e| format!("Kann JSON nicht erstellen: {}", e))?;
    
    std::fs::write(projects_dir.join("create_date.json"), json_content)
        .map_err(|e| format!("Kann create_date.json nicht schreiben: {}", e))?;
    
    // ── Beat in Datenbank eintragen ───────────────────────────────────────────
    let conn = open_db().map_err(|e| e.to_string())?;
    
    let beat_id = format!("{:04}", params.catalog_id);
    let created_date_str = file_created_secs(Path::new(&params.source_flp_path))
        .map(|s| secs_to_date(s))
        .unwrap_or_else(|| secs_to_date(now_secs));
    
    conn.execute(
        "INSERT INTO beats (id, name, path, bpm, key, status, tags, notes, created_date, modified_date) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![
            beat_id,
            params.title,
            target_path.to_string_lossy().to_string(),
            params.bpm,
            params.key,
            params.status,
            params.tags,
            params.notes,
            created_date_str,
            secs_to_date(now_secs),
        ],
    ).map_err(|e| format!("Fehler beim DB-Eintrag: {}", e))?;
    
    Ok(ArchiveResult {
        success: true,
        archive_path: target_path.to_string_lossy().to_string(),
        beat_id,
        files_copied,
        error: None,
    })
}

// ══════════════════════════════════════════════════════════════════════════════
// CUSTOM TAGS COMMANDS
// ══════════════════════════════════════════════════════════════════════════════

/// Gibt alle Custom Tags zurück, sortiert nach usage_count (häufigste zuerst)
#[tauri::command]
fn get_custom_tags() -> Result<Vec<CustomTag>, String> {
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

/// Speichert einen neuen Custom Tag oder erhöht usage_count wenn er existiert
#[tauri::command]
fn save_custom_tag(tag: String, display_name: String, category: String) -> Result<CustomTag, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    
    // Validierung der Kategorie
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
    
    // Gespeicherten Tag zurückgeben
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

/// Speichert mehrere Custom Tags auf einmal (Batch-Operation)
#[tauri::command]
fn save_custom_tags_batch(tags: Vec<(String, String, String)>) -> Result<i64, String> {
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

/// Löscht einen Custom Tag
#[tauri::command]
fn delete_custom_tag(tag: String) -> Result<bool, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    
    let rows_affected = conn.execute(
        "DELETE FROM custom_tags WHERE tag = ?1",
        [tag.to_lowercase()],
    ).map_err(|e| e.to_string())?;
    
    Ok(rows_affected > 0)
}

/// Sucht Custom Tags (für Autocomplete)
#[tauri::command]
fn search_custom_tags(query: String) -> Result<Vec<CustomTag>, String> {
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

// ══════════════════════════════════════════════════════════════════════════════
// EXISTING COMMANDS (UNVERÄNDERT)
// ══════════════════════════════════════════════════════════════════════════════

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}

// ── Scan & Import ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct ScanResult {
    pub found: i64,
    pub imported: i64,
    pub skipped: i64,
    pub errors: Vec<String>,
}

fn parse_beat_folder(folder_name: &str) -> Option<(String, String, Option<String>, Option<f64>)> {
    let parts: Vec<&str> = folder_name.splitn(2, " - ").collect();
    if parts.len() < 2 { return None; }

    let id   = parts[0].trim().to_string();
    let rest = parts[1].trim();

    let (name_part, key, bpm) = if let (Some(lb), Some(rb)) = (rest.rfind('['), rest.rfind(']')) {
        if lb < rb {
            let bracket = &rest[lb+1..rb];
            let name    = rest[..lb].trim().to_string();
            let tokens: Vec<&str> = bracket.split_whitespace().collect();
            if tokens.is_empty() {
                (name, None, None)
            } else {
                let last = tokens.last().unwrap();
                let bpm_str: String = last.chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
                let bpm_val: Option<f64> = bpm_str.parse().ok();
                let key_val = if tokens.len() > 1 {
                    Some(tokens[..tokens.len()-1].join(" "))
                } else if bpm_val.is_some() {
                    None
                } else {
                    Some(tokens[0].to_string())
                };
                (name, key_val, bpm_val)
            }
        } else {
            (rest.to_string(), None, None)
        }
    } else {
        (rest.to_string(), None, None)
    };

    Some((id, name_part, key, bpm))
}

fn file_creation_date(path: &Path) -> Option<String> {
    let secs = file_created_secs(path)?;
    Some(secs_to_date(secs))
}

#[tauri::command]
fn scan_archive() -> Result<ScanResult, String> {
    let archive_path = r"C:\Users\kismo\OneDrive\Dokumente\._BEAT LIBRARY\03_ARCHIVE";
    let conn = open_db().map_err(|e| e.to_string())?;

    let mut id_stmt = conn.prepare("SELECT id FROM beats").map_err(|e| e.to_string())?;
    let existing_ids: std::collections::HashSet<String> = id_stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut found    = 0i64;
    let mut imported = 0i64;
    let mut skipped  = 0i64;
    let mut errors: Vec<String> = Vec::new();

    let archive_dir = Path::new(archive_path);
    if !archive_dir.exists() {
        return Err(format!("Archive not found: {}", archive_path));
    }

    for year_entry in std::fs::read_dir(archive_dir).map_err(|e| e.to_string())?.filter_map(|e| e.ok()) {
        let year_path = year_entry.path();
        if !year_path.is_dir() { continue; }

        for month_entry in std::fs::read_dir(&year_path).unwrap_or_else(|_| panic!()).filter_map(|e| e.ok()) {
            let month_path = month_entry.path();
            if !month_path.is_dir() { continue; }

            for beat_entry in std::fs::read_dir(&month_path).unwrap_or_else(|_| panic!()).filter_map(|e| e.ok()) {
                let beat_path = beat_entry.path();
                if !beat_path.is_dir() { continue; }

                let folder_name = match beat_path.file_name().and_then(|n| n.to_str()) {
                    Some(n) => n.to_string(), None => continue,
                };

                let (id, name, key, bpm) = match parse_beat_folder(&folder_name) {
                    Some(p) => p,
                    None => { errors.push(format!("Cannot parse: {}", folder_name)); continue; }
                };

                found += 1;
                if existing_ids.contains(&id) { skipped += 1; continue; }

                let projects_path = beat_path.join("03_PROJECTS");
                let created_date = if projects_path.exists() {
                    let mut flp_dates: Vec<(SystemTime, PathBuf)> = Vec::new();
                    if let Ok(entries) = std::fs::read_dir(&projects_path) {
                        for e in entries.filter_map(|e| e.ok()) {
                            let p = e.path();
                            if p.extension().and_then(|x| x.to_str()) == Some("flp") {
                                if let Ok(meta) = std::fs::metadata(&p) {
                                    let t = meta.created().or_else(|_| meta.modified());
                                    if let Ok(t) = t { flp_dates.push((t, p)); }
                                }
                            }
                        }
                    }
                    flp_dates.sort_by_key(|(t, _)| *t);
                    flp_dates.first().and_then(|(_, p)| file_creation_date(p))
                } else { None };

                let created_date = created_date
                    .or_else(|| file_creation_date(&beat_path))
                    .unwrap_or_default();

                let path_str = beat_path.to_string_lossy().to_string();

                match conn.execute(
                    "INSERT OR IGNORE INTO beats (id, name, path, key, bpm, status, created_date, favorite) VALUES (?1,?2,?3,?4,?5,'idea',?6,0)",
                    rusqlite::params![id, name, path_str, key.unwrap_or_default(), bpm.unwrap_or(0.0), created_date],
                ) {
                    Ok(_)  => imported += 1,
                    Err(e) => errors.push(format!("{}: {}", folder_name, e)),
                }
            }
        }
    }

    Ok(ScanResult { found, imported, skipped, errors })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FixDatesResult {
    pub updated: i64,
    pub not_found: i64,
    pub no_flp: i64,
    pub errors: Vec<String>,
}

#[tauri::command]
fn fix_dates() -> Result<FixDatesResult, String> {
    let archive_path = r"C:\Users\kismo\OneDrive\Dokumente\._BEAT LIBRARY\03_ARCHIVE";
    let conn = open_db().map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare("SELECT id, path FROM beats")
        .map_err(|e| e.to_string())?;

    struct BeatRow { id: String, path: Option<String> }
    let beats: Vec<BeatRow> = stmt
        .query_map([], |r| Ok(BeatRow {
            id:   r.get::<_, String>(0)?,
            path: r.get::<_, Option<String>>(1)?,
        }))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut updated   = 0i64;
    let mut not_found = 0i64;
    let mut no_flp    = 0i64;
    let mut errors: Vec<String> = Vec::new();

    for beat in &beats {
        let beat_path = if let Some(ref p) = beat.path {
            let p = PathBuf::from(p);
            if p.exists() { Some(p) } else { None }
        } else { None };

        let beat_path = if beat_path.is_none() {
            find_beat_in_archive(archive_path, &beat.id)
        } else {
            beat_path
        };

        let beat_path = match beat_path {
            Some(p) => p,
            None => {
                not_found += 1;
                errors.push(format!("Not found: {}", beat.id));
                continue;
            }
        };

        let new_date = date_from_archive_path(&beat_path);

        let new_date = if new_date.is_none() {
            let projects_path = beat_path.join("03_PROJECTS");
            if projects_path.exists() {
                let mut flp_dates: Vec<(SystemTime, PathBuf)> = Vec::new();
                if let Ok(entries) = std::fs::read_dir(&projects_path) {
                    for e in entries.filter_map(|e| e.ok()) {
                        let p = e.path();
                        if p.extension().and_then(|x| x.to_str()) == Some("flp") {
                            if let Ok(meta) = std::fs::metadata(&p) {
                                if let Ok(t) = meta.modified() { flp_dates.push((t, p)); }
                            }
                        }
                    }
                }
                flp_dates.sort_by_key(|(t, _)| *t);
                flp_dates.first().and_then(|(_, p)| file_creation_date(p))
            } else {
                no_flp += 1;
                None
            }
        } else {
            new_date
        };

        let new_date = match new_date {
            Some(d) => d,
            None => {
                errors.push(format!("No date for: {}", beat.id));
                continue;
            }
        };

        match conn.execute(
            "UPDATE beats SET created_date = ?1 WHERE id = ?2",
            rusqlite::params![new_date, beat.id],
        ) {
            Ok(_)  => updated += 1,
            Err(e) => errors.push(format!("{}: {}", beat.id, e)),
        }
    }

    Ok(FixDatesResult { updated, not_found, no_flp, errors })
}

fn date_from_archive_path(beat_path: &Path) -> Option<String> {
    let month_dir = beat_path.parent()?;
    let year_dir  = month_dir.parent()?;

    let year_str = year_dir.file_name()?.to_str()?;
    let year: u32 = year_str.parse().ok()?;
    if year < 2000 || year > 2100 { return None; }

    let month_str = month_dir.file_name()?.to_str()?;
    let month_num: u32 = month_str
        .chars()
        .take(2)
        .collect::<String>()
        .parse()
        .ok()?;
    if month_num < 1 || month_num > 12 { return None; }

    Some(format!("{:04}-{:02}-01", year, month_num))
}

fn find_beat_in_archive(archive_path: &str, id: &str) -> Option<PathBuf> {
    let archive_dir = Path::new(archive_path);
    let year_dirs = std::fs::read_dir(archive_dir).ok()?;
    for year_entry in year_dirs.filter_map(|e| e.ok()) {
        let year_path = year_entry.path();
        if !year_path.is_dir() { continue; }
        let month_dirs = match std::fs::read_dir(&year_path) { Ok(d) => d, Err(_) => continue };
        for month_entry in month_dirs.filter_map(|e| e.ok()) {
            let month_path = month_entry.path();
            if !month_path.is_dir() { continue; }
            let beat_dirs = match std::fs::read_dir(&month_path) { Ok(d) => d, Err(_) => continue };
            for beat_entry in beat_dirs.filter_map(|e| e.ok()) {
                let beat_path = beat_entry.path();
                if !beat_path.is_dir() { continue; }
                if let Some(name) = beat_path.file_name().and_then(|n| n.to_str()) {
                    let prefix = format!("{} - ", id);
                    if name.starts_with(&prefix) || name == id {
                        return Some(beat_path);
                    }
                }
            }
        }
    }
    None
}

#[tauri::command]
fn get_date_sample() -> Result<Vec<String>, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT created_date FROM beats WHERE created_date IS NOT NULL LIMIT 20"
    ).map_err(|e| e.to_string())?;
    let dates: Vec<String> = stmt
        .query_map([], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(dates)
}

#[tauri::command]
fn get_stats(year: Option<i64>) -> Result<Stats, String> {
    let conn = open_db().map_err(|e| e.to_string())?;

    let mut yr_stmt = conn.prepare(
        "SELECT DISTINCT CAST(strftime('%Y', created_date) AS INTEGER) as yr
         FROM beats WHERE created_date IS NOT NULL AND created_date != ''
         ORDER BY yr DESC"
    ).map_err(|e| e.to_string())?;

    let available_years: Vec<i64> = yr_stmt
        .query_map([], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let current_year: i64 = conn
        .query_row("SELECT CAST(strftime('%Y', 'now') AS INTEGER)", [], |r| r.get(0))
        .unwrap_or(2025);

    let selected_year: i64 = year.unwrap_or(current_year);

    let total: i64 = conn
        .query_row("SELECT COUNT(*) FROM beats", [], |r| r.get(0))
        .unwrap_or(0);

    let this_month: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM beats WHERE strftime('%Y-%m', created_date) = strftime('%Y-%m', 'now')",
            [], |r| r.get(0),
        )
        .unwrap_or(0);

    let favorites: i64 = conn
        .query_row("SELECT COUNT(*) FROM beats WHERE favorite = 1", [], |r| r.get(0))
        .unwrap_or(0);

    let avg_bpm: f64 = conn
        .query_row(
            "SELECT COALESCE(AVG(CAST(bpm AS REAL)), 0) FROM beats WHERE bpm IS NOT NULL AND bpm != ''",
            [], |r| r.get(0),
        )
        .unwrap_or(0.0);

    let count_status = |s: &str| -> i64 {
        conn.query_row(
            "SELECT COUNT(*) FROM beats WHERE LOWER(status) = LOWER(?1)",
            [s], |r| r.get(0),
        ).unwrap_or(0)
    };

    let by_status = ByStatus {
        idea:     count_status("idea"),
        wip:      count_status("wip"),
        finished: count_status("finished"),
        sold:     count_status("sold"),
    };

    let mut stmt = conn.prepare(
        "SELECT key, COUNT(*) as cnt FROM beats WHERE key IS NOT NULL AND key != ''
         GROUP BY key ORDER BY cnt DESC",
    ).map_err(|e| e.to_string())?;

    let top_keys: Vec<KeyCount> = stmt
        .query_map([], |r| Ok(KeyCount { key: r.get(0)?, count: r.get(1)? }))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut tag_map: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    let mut stmt2 = conn
        .prepare("SELECT tags FROM beats WHERE tags IS NOT NULL AND tags != ''")
        .map_err(|e| e.to_string())?;

    let tag_rows: Vec<String> = stmt2
        .query_map([], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    for tags_str in tag_rows {
        for tag in tags_str.split(',') {
            let t = tag.trim().to_lowercase();
            if !t.is_empty() {
                *tag_map.entry(t).or_insert(0) += 1;
            }
        }
    }

    let mut top_tags: Vec<TagCount> = tag_map
        .into_iter()
        .map(|(tag, count)| TagCount { tag, count })
        .collect();
    top_tags.sort_by(|a, b| b.count.cmp(&a.count));
    top_tags.truncate(20);

    let mut stmt3 = conn.prepare(
        "SELECT strftime('%Y-%m', created_date) as month, COUNT(*) as cnt
         FROM beats
         WHERE created_date IS NOT NULL AND created_date != ''
           AND strftime('%Y', created_date) = ?1
         GROUP BY month ORDER BY month ASC",
    ).map_err(|e| e.to_string())?;

    let db_months: std::collections::HashMap<String, i64> = stmt3
        .query_map([selected_year.to_string()], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let beats_per_month: Vec<MonthCount> = (1i32..=12)
        .map(|m| {
            let key = format!("{}-{:02}", selected_year, m);
            let count = *db_months.get(&key).unwrap_or(&0);
            MonthCount { month: key, count }
        })
        .collect();

    let mut stmt4 = conn.prepare(
        "SELECT id, name, path, bpm, key, status, tags, favorite,
                created_date, modified_date, notes, sold_to, has_artwork, has_video
         FROM beats ORDER BY created_date DESC LIMIT 5",
    ).map_err(|e| e.to_string())?;

    let recent_beats: Vec<Beat> = stmt4
        .query_map([], row_to_beat)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Stats {
        total, this_month, favorites,
        avg_bpm: (avg_bpm * 10.0).round() / 10.0,
        by_status, top_keys, top_tags,
        beats_per_month, recent_beats,
        available_years, selected_year,
    })
}

#[tauri::command]
fn get_beats(
    search: Option<String>,
    status_filter: Option<String>,
    only_favs: bool,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<Beat>, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let lim    = limit.unwrap_or(50);
    let off    = offset.unwrap_or(0);
    let search = search.unwrap_or_default().to_lowercase();

    let mut sql = String::from(
        "SELECT id, name, path, bpm, key, status, tags, favorite,
                created_date, modified_date, notes, sold_to, has_artwork, has_video
         FROM beats WHERE 1=1",
    );

    if !search.is_empty() {
        sql.push_str(&format!(
            " AND (LOWER(name) LIKE '%{s}%' OR LOWER(id) LIKE '%{s}%' OR LOWER(key) LIKE '%{s}%' OR LOWER(tags) LIKE '%{s}%')",
            s = search
        ));
    }

    if let Some(ref s) = status_filter {
        if s != "all" {
            sql.push_str(&format!(" AND LOWER(status) = LOWER('{}')", s));
        }
    }

    if only_favs {
        sql.push_str(" AND favorite = 1");
    }

    sql.push_str(&format!(" ORDER BY CAST(id AS INTEGER) DESC LIMIT {} OFFSET {}", lim, off));

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let beats: Vec<Beat> = stmt
        .query_map([], row_to_beat)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(beats)
}

/// Paginated beats response
#[derive(Debug, Serialize)]
struct PaginatedBeatsResponse {
    beats: Vec<Beat>,
    total_count: i64,
}

#[tauri::command]
fn get_beats_paginated(
    search: Option<String>,
    status_filter: Option<String>,
    only_favs: bool,
    key_filter: Option<Vec<String>>,  // Multi-select keys
    bpm_min: Option<i32>,
    bpm_max: Option<i32>,
    sort_column: Option<String>,
    sort_direction: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<PaginatedBeatsResponse, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(50);
    let off = offset.unwrap_or(0);
    let search = search.unwrap_or_default().to_lowercase();
    
    // Build WHERE clause
    let mut where_clauses: Vec<String> = vec!["1=1".to_string()];
    
    if !search.is_empty() {
        where_clauses.push(format!(
            "(LOWER(name) LIKE '%{s}%' OR LOWER(id) LIKE '%{s}%' OR LOWER(key) LIKE '%{s}%' OR LOWER(tags) LIKE '%{s}%')",
            s = search
        ));
    }
    
    if let Some(ref s) = status_filter {
        if s != "all" {
            where_clauses.push(format!("LOWER(status) = LOWER('{}')", s));
        }
    }
    
    if only_favs {
        where_clauses.push("favorite = 1".to_string());
    }
    
    // Key filter (multi-select) - normalize and match
    if let Some(ref keys) = key_filter {
        if !keys.is_empty() {
            let key_conditions: Vec<String> = keys.iter().map(|k| {
                // Normalize: remove spaces, convert "minor"/"min" to "m", remove "major"/"maj"
                let normalized = k.to_lowercase()
                    .replace(" ", "")
                    .replace("minor", "m")
                    .replace("min", "m")
                    .replace("major", "")
                    .replace("maj", "");
                format!(
                    "(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(key, ' ', ''), 'minor', 'm'), 'min', 'm'), 'major', ''), 'maj', '')) = '{}')",
                    normalized
                )
            }).collect();
            where_clauses.push(format!("({})", key_conditions.join(" OR ")));
        }
    }
    
    // BPM range filter
    if let Some(min) = bpm_min {
        where_clauses.push(format!("bpm >= {}", min));
    }
    if let Some(max) = bpm_max {
        where_clauses.push(format!("bpm <= {}", max));
    }
    
    let where_sql = where_clauses.join(" AND ");
    
    // Count total matching
    let count_sql = format!("SELECT COUNT(*) FROM beats WHERE {}", where_sql);
    let total_count: i64 = conn.query_row(&count_sql, [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    
    // Build ORDER BY clause
    let sort_col = sort_column.unwrap_or_else(|| "id".to_string());
    let sort_dir = sort_direction.unwrap_or_else(|| "desc".to_string()).to_uppercase();
    
    // Validate and map sort column
    let order_by = match sort_col.as_str() {
        "id" => format!("CAST(id AS INTEGER) {}", sort_dir),
        "name" => format!("LOWER(name) {}", sort_dir),
        "bpm" => format!("COALESCE(bpm, 0) {}", sort_dir),
        "key" => format!("COALESCE(LOWER(key), 'zzz') {}", sort_dir),
        "status" => format!("COALESCE(status, 'zzz') {}", sort_dir),
        _ => format!("CAST(id AS INTEGER) {}", sort_dir),
    };
    
    // Build final query
    let sql = format!(
        "SELECT id, name, path, bpm, key, status, tags, favorite,
                created_date, modified_date, notes, sold_to, has_artwork, has_video
         FROM beats WHERE {} ORDER BY {} LIMIT {} OFFSET {}",
        where_sql, order_by, lim, off
    );
    
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let beats: Vec<Beat> = stmt
        .query_map([], row_to_beat)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    
    Ok(PaginatedBeatsResponse { beats, total_count })
}

#[tauri::command]
fn get_beat_count() -> Result<i64, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    conn.query_row("SELECT COUNT(*) FROM beats", [], |r| r.get(0))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_favorite(beat_id: String, favorite: bool) -> Result<(), String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE beats SET favorite = ?1, modified_date = datetime('now') WHERE id = ?2",
        rusqlite::params![if favorite { 1 } else { 0 }, beat_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn update_beat_status(beat_id: String, status: String) -> Result<(), String> {
    // Validate status
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

/// Parameter struct für vollständiges Beat-Update
#[derive(Debug, Deserialize)]
struct UpdateBeatParams {
    id: String,
    name: Option<String>,
    bpm: Option<f64>,
    key: Option<String>,
    status: Option<String>,
    tags: Option<String>,
    notes: Option<String>,
    sold_to: Option<String>,
}

#[tauri::command]
fn update_beat(params: UpdateBeatParams) -> Result<(), String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    
    // Build dynamic UPDATE query based on provided fields
    let mut updates: Vec<String> = Vec::new();
    let mut values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    
    if let Some(ref name) = params.name {
        updates.push("name = ?".to_string());
        values.push(Box::new(name.clone()));
    }
    
    if let Some(bpm) = params.bpm {
        updates.push("bpm = ?".to_string());
        values.push(Box::new(bpm));
    }
    
    if let Some(ref key) = params.key {
        updates.push("key = ?".to_string());
        values.push(Box::new(key.clone()));
    }
    
    if let Some(ref status) = params.status {
        // Validate status
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
        updates.push("sold_to = ?".to_string());
        values.push(Box::new(sold_to.clone()));
    }
    
    // Always update modified_date
    updates.push("modified_date = datetime('now')".to_string());
    
    if updates.is_empty() {
        return Ok(());  // Nothing to update
    }
    
    let sql = format!(
        "UPDATE beats SET {} WHERE id = ?",
        updates.join(", ")
    );
    
    // Add beat_id as last parameter
    values.push(Box::new(params.id.clone()));
    
    // Convert to references for execute
    let value_refs: Vec<&dyn rusqlite::ToSql> = values.iter().map(|v| v.as_ref()).collect();
    
    conn.execute(&sql, value_refs.as_slice())
        .map_err(|e| format!("Failed to update beat: {}", e))?;
    
    Ok(())
}

#[tauri::command]
fn get_beat_by_id(beat_id: String) -> Result<Option<Beat>, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare(
        "SELECT id, name, path, bpm, key, status, tags, favorite,
                created_date, modified_date, notes, sold_to, has_artwork, has_video
         FROM beats WHERE id = ?1"
    ).map_err(|e| e.to_string())?;
    
    let beat = stmt.query_row([&beat_id], row_to_beat);
    
    match beat {
        Ok(b) => Ok(Some(b)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Find the best audio file to play for a beat
/// Priority: Untagged > Tagged > Newest audio file
#[tauri::command]
fn get_beat_audio_path(beat_path: String) -> Result<Option<String>, String> {
    let base_path = Path::new(&beat_path);
    let audio_dir = base_path.join("01_AUDIO");
    
    // Try 01_AUDIO first, then beat folder directly
    let search_dirs = if audio_dir.exists() {
        vec![audio_dir]
    } else {
        vec![base_path.to_path_buf()]
    };
    
    for dir in search_dirs {
        if !dir.exists() {
            continue;
        }
        
        let entries: Vec<_> = match std::fs::read_dir(&dir) {
            Ok(rd) => rd.filter_map(|e| e.ok()).collect(),
            Err(_) => continue,
        };
        
        // Filter to audio files only
        let audio_files: Vec<_> = entries.into_iter()
            .filter(|e| {
                let path = e.path();
                if !path.is_file() { return false; }
                if let Some(ext) = path.extension() {
                    let ext_lower = ext.to_string_lossy().to_lowercase();
                    ext_lower == "mp3" || ext_lower == "wav" || ext_lower == "flac" || ext_lower == "m4a"
                } else {
                    false
                }
            })
            .collect();
        
        if audio_files.is_empty() {
            continue;
        }
        
        // Priority 1: Untagged (case-insensitive)
        for entry in &audio_files {
            let name = entry.file_name().to_string_lossy().to_lowercase();
            if name.contains("untagged") {
                return Ok(Some(entry.path().to_string_lossy().to_string()));
            }
        }
        
        // Priority 2: Tagged (but not untagged)
        for entry in &audio_files {
            let name = entry.file_name().to_string_lossy().to_lowercase();
            if name.contains("tagged") && !name.contains("untagged") {
                return Ok(Some(entry.path().to_string_lossy().to_string()));
            }
        }
        
        // Priority 3: MP3 files first (smaller, faster to load)
        for entry in &audio_files {
            let path = entry.path();
            if let Some(ext) = path.extension() {
                if ext.to_string_lossy().to_lowercase() == "mp3" {
                    return Ok(Some(path.to_string_lossy().to_string()));
                }
            }
        }
        
        // Priority 4: Newest audio file by modification time
        let mut newest: Option<(std::fs::DirEntry, std::time::SystemTime)> = None;
        
        for entry in audio_files {
            if let Ok(metadata) = entry.metadata() {
                if let Ok(modified) = metadata.modified() {
                    match &newest {
                        None => newest = Some((entry, modified)),
                        Some((_, prev_time)) if modified > *prev_time => {
                            newest = Some((entry, modified));
                        }
                        _ => {}
                    }
                }
            }
        }
        
        if let Some((entry, _)) = newest {
            return Ok(Some(entry.path().to_string_lossy().to_string()));
        }
    }
    
    Ok(None)
}

/// Read audio file and return as base64 data URL
#[tauri::command]
fn read_audio_file(file_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);
    
    if !path.exists() {
        return Err("Audio file not found".to_string());
    }
    
    // Determine MIME type
    let ext = path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    
    let mime_type = match ext.as_str() {
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "m4a" => "audio/mp4",
        "flac" => "audio/flac",
        _ => "audio/mpeg",
    };
    
    // Read file
    let data = std::fs::read(&path)
        .map_err(|e| format!("Failed to read audio file: {}", e))?;
    
    // Encode as base64
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    let encoded = STANDARD.encode(&data);
    
    // Return as data URL
    Ok(format!("data:{};base64,{}", mime_type, encoded))
}

/// Get cover image path for a beat
#[tauri::command]
fn get_beat_cover_path(beat_path: String) -> Result<Option<String>, String> {
    let base_path = Path::new(&beat_path);
    
    // Try 02_VISUALS first
    let visuals_dir = base_path.join("02_VISUALS");
    
    let search_dirs = if visuals_dir.exists() {
        vec![visuals_dir]
    } else {
        // Fallback: search in beat folder directly
        vec![base_path.to_path_buf()]
    };
    
    let image_extensions = ["jpg", "jpeg", "png", "webp", "gif"];
    
    for dir in search_dirs {
        if !dir.exists() {
            continue;
        }
        
        let entries: Vec<_> = match std::fs::read_dir(&dir) {
            Ok(rd) => rd.filter_map(|e| e.ok()).collect(),
            Err(_) => continue,
        };
        
        // Filter to image files only
        let images: Vec<_> = entries.into_iter()
            .filter(|e| {
                let path = e.path();
                if !path.is_file() { return false; }
                if let Some(ext) = path.extension() {
                    let ext_lower = ext.to_string_lossy().to_lowercase();
                    image_extensions.contains(&ext_lower.as_str())
                } else {
                    false
                }
            })
            .collect();
        
        if images.is_empty() {
            continue;
        }
        
        // Priority 1: file with "cover" in name (case-insensitive)
        for entry in &images {
            let name = entry.file_name().to_string_lossy().to_lowercase();
            if name.contains("cover") {
                return Ok(Some(entry.path().to_string_lossy().to_string()));
            }
        }
        
        // Priority 2: file with beat name in it
        if let Some(beat_folder_name) = base_path.file_name() {
            let beat_name = beat_folder_name.to_string_lossy().to_lowercase();
            // Extract just the name part (before the [key bpm] bracket)
            let name_part = beat_name.split('[').next().unwrap_or(&beat_name).trim();
            // Remove the ID prefix like "0870 - "
            let clean_name = if let Some(pos) = name_part.find(" - ") {
                &name_part[pos + 3..]
            } else {
                name_part
            }.trim().to_lowercase();
            
            for entry in &images {
                let file_name = entry.file_name().to_string_lossy().to_lowercase();
                if file_name.contains(&clean_name) {
                    return Ok(Some(entry.path().to_string_lossy().to_string()));
                }
            }
        }
        
        // Priority 3: first image file
        return Ok(Some(images[0].path().to_string_lossy().to_string()));
    }
    
    Ok(None)
}

// ══════════════════════════════════════════════════════════════════════════════
// ENTRY POINT
// ══════════════════════════════════════════════════════════════════════════════

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_stats,
            get_beats,
            get_beats_paginated,
            get_beat_count,
            get_date_sample,
            scan_archive,
            fix_dates,
            // Custom Tags Commands
            get_custom_tags,
            save_custom_tag,
            save_custom_tags_batch,
            delete_custom_tag,
            search_custom_tags,
            // Create Tab Commands
            get_next_beat_id,
            parse_beat_folder_for_create,
            read_image_file,
            // Archive Beat Commands
            check_beat_duplicate,
            archive_beat,
            // Browse Tab Commands
            toggle_favorite,
            update_beat_status,
            update_beat,
            get_beat_by_id,
            // Audio Player Commands
            get_beat_audio_path,
            get_beat_cover_path,
            read_audio_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}