// src-tauri/src/utils/date.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Date Utility Functions
// ═══════════════════════════════════════════════════════════════════════════════

use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// Month names for year_month folder structure
pub const MONTH_NAMES: [&str; 12] = [
    "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
    "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
];

/// Convert Unix seconds to "YYYY-MM-DD" string
pub fn secs_to_date(secs: u64) -> String {
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

/// Convert Unix seconds to (year, month, day) tuple
pub fn secs_to_ymd(secs: u64) -> (u64, u64, u64) {
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

/// Get Unix seconds for created time of a file (fallback: modified)
pub fn file_created_secs(path: &Path) -> Option<u64> {
    let meta = std::fs::metadata(path).ok()?;
    let sys_time = meta.created().or_else(|_| meta.modified()).ok()?;
    Some(sys_time.duration_since(UNIX_EPOCH).ok()?.as_secs())
}

/// Get Unix seconds for modified time of a file
pub fn file_modified_secs(path: &Path) -> Option<u64> {
    let meta = std::fs::metadata(path).ok()?;
    let sys_time = meta.modified().ok()?;
    Some(sys_time.duration_since(UNIX_EPOCH).ok()?.as_secs())
}

/// Generate year_month string from Unix seconds (e.g., "2025/03_MARCH")
pub fn year_month_from_secs(secs: u64) -> String {
    let (year, month, _) = secs_to_ymd(secs);
    let month_idx = (month as usize).saturating_sub(1).min(11);
    format!("{}/{:02}_{}", year, month, MONTH_NAMES[month_idx])
}

/// Get current time as Unix seconds
pub fn current_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Get creation date from a file path as "YYYY-MM-DD" string
pub fn file_creation_date(path: &Path) -> Option<String> {
    file_created_secs(path).map(secs_to_date)
}
