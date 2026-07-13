// src-tauri/src/utils/files.rs
// ═══════════════════════════════════════════════════════════════════════════════
// File Utility Functions
// ═══════════════════════════════════════════════════════════════════════════════

use std::path::Path;

/// Check if file extension is an audio file
pub fn is_audio_extension(ext: &str) -> bool {
    matches!(ext.to_lowercase().as_str(), "wav" | "mp3" | "flac" | "aiff" | "ogg" | "m4a")
}

/// Check if file extension is an image file
pub fn is_image_extension(ext: &str) -> bool {
    matches!(ext.to_lowercase().as_str(), "png" | "jpg" | "jpeg" | "webp" | "gif")
}

/// Check if file extension is a video file (routed to 02_VISUALS)
pub fn is_video_extension(ext: &str) -> bool {
    matches!(ext.to_lowercase().as_str(), "mp4" | "mov" | "webm" | "mkv" | "avi")
}

/// True if the path is an FL Studio project file (case-insensitive `.flp`)
pub fn is_flp(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("flp"))
        .unwrap_or(false)
}

/// Resolve a destination path that does not collide with an existing file.
/// If `dir/file_name` exists, returns `dir/{stem}_2.{ext}`, `_3`, ... until a free slot is found.
/// Never overwrites; guarantees the returned PathBuf does not yet exist.
pub fn unique_dest(dir: &Path, file_name: &str) -> std::path::PathBuf {
    let candidate = dir.join(file_name);
    if !candidate.exists() {
        return candidate;
    }

    let path = Path::new(file_name);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or(file_name);
    let ext = path.extension().and_then(|e| e.to_str());

    let mut n = 2u32;
    loop {
        let new_name = match ext {
            Some(e) => format!("{}_{}.{}", stem, n, e),
            None => format!("{}_{}", stem, n),
        };
        let candidate = dir.join(&new_name);
        if !candidate.exists() {
            return candidate;
        }
        n += 1;
    }
}

/// Get MIME type for image extension
pub fn image_mime_type(ext: &str) -> &'static str {
    match ext.to_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "image/png",
    }
}

/// Check if a string is a valid musical key
pub fn is_valid_key(s: &str) -> bool {
    let s = s.trim();
    if s.is_empty() {
        return false;
    }
    
    // Valid keys: A, Am, A#, A#m, Ab, Abm, Amaj, Amin, etc.
    let first = s.chars().next().unwrap().to_ascii_uppercase();
    if !('A'..='G').contains(&first) {
        return false;
    }
    
    // Rest can be #, b, m, M, maj, min
    let rest = &s[1..].to_lowercase();
    if rest.is_empty() {
        return true; // Just letter like "A" or "C"
    }
    
    // Possible patterns after root note
    let valid_suffixes = ["m", "min", "maj", "#", "b", "#m", "bm", "#min", "bmin", "#maj", "bmaj"];
    valid_suffixes.iter().any(|&suf| rest == suf)
}
