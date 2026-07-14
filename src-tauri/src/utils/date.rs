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

/// Parse "YYYY-MM-DD" into days since Unix epoch (civil-from-days algorithm).
/// Returns None for malformed strings.
pub fn date_str_to_days(s: &str) -> Option<i64> {
    let mut parts = s.trim().splitn(3, '-');
    let y: i64 = parts.next()?.parse().ok()?;
    let m: i64 = parts.next()?.parse().ok()?;
    let d: i64 = parts.next()?.parse().ok()?;
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    // Howard Hinnant's days_from_civil
    let y_adj = if m <= 2 { y - 1 } else { y };
    let era = if y_adj >= 0 { y_adj } else { y_adj - 399 } / 400;
    let yoe = y_adj - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    Some(era * 146_097 + doe - 719_468)
}

/// Monday-based week index for a days-since-epoch value.
/// 1970-01-01 was a Thursday, so shifting by +3 aligns week starts to Monday.
pub fn week_index(days: i64) -> i64 {
    (days + 3).div_euclid(7)
}

/// Current year as string (e.g. "2026") — used in templates and filenames
pub fn current_year_str() -> String {
    let (year, _, _) = secs_to_ymd(current_secs());
    year.to_string()
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

/// Creation date ("YYYY-MM-DD") of the oldest FLP file in `dir`.
/// The oldest project file is the best proxy for when a beat was started.
pub fn oldest_flp_date(dir: &Path) -> Option<String> {
    let mut flps: Vec<(SystemTime, std::path::PathBuf)> = Vec::new();
    for e in std::fs::read_dir(dir).ok()?.filter_map(|e| e.ok()) {
        let p = e.path();
        if !crate::utils::is_flp(&p) {
            continue;
        }
        if let Ok(meta) = std::fs::metadata(&p) {
            if let Ok(t) = meta.created().or_else(|_| meta.modified()) {
                flps.push((t, p));
            }
        }
    }
    flps.sort_by_key(|(t, _)| *t);
    flps.first().and_then(|(_, p)| file_creation_date(p))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn date_str_roundtrips_with_secs_to_date() {
        for secs in [0u64, 86_400, 1_700_000_000, 1_800_000_000] {
            let s = secs_to_date(secs);
            let days = date_str_to_days(&s).expect("parse");
            assert_eq!(days as u64, secs / 86_400, "roundtrip failed for {}", s);
        }
    }

    #[test]
    fn date_str_rejects_garbage() {
        assert!(date_str_to_days("").is_none());
        assert!(date_str_to_days("2026-13-01").is_none());
        assert!(date_str_to_days("not-a-date").is_none());
    }

    #[test]
    fn week_index_is_monday_based() {
        // 1970-01-01 = Thursday (day 0), 1970-01-05 = Monday (day 4)
        assert_eq!(week_index(0), 0);
        assert_eq!(week_index(3), 0);  // Sunday 1970-01-04
        assert_eq!(week_index(4), 1);  // Monday 1970-01-05 starts week 1
    }
}
