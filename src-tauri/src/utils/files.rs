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

/// Get MIME type for audio extension
pub fn audio_mime_type(ext: &str) -> &'static str {
    match ext.to_lowercase().as_str() {
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "flac" => "audio/flac",
        "m4a" => "audio/mp4",
        "ogg" => "audio/ogg",
        "aiff" => "audio/aiff",
        _ => "audio/mpeg",
    }
}

/// Read file and encode as base64 data URL
pub fn file_to_base64_data_url(path: &Path, mime_type: &str) -> Result<String, String> {
    let bytes = std::fs::read(path)
        .map_err(|e| format!("Cannot read file: {}", e))?;
    
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    let encoded = STANDARD.encode(&bytes);
    
    Ok(format!("data:{};base64,{}", mime_type, encoded))
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
