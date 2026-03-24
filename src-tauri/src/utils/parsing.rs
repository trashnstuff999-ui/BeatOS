// src-tauri/src/utils/parsing.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Filename Parsing Utilities
// ═══════════════════════════════════════════════════════════════════════════════

use super::files::is_valid_key;

/// Parse audio filename in format "Name [Key BPM].ext" or "Name [BPM Key].ext"
/// Order of Key and BPM doesn't matter - detected automatically.
/// 
/// Examples:
///   - "Midnight Drift [Cm 140].wav" → ("Midnight Drift", Some("Cm"), Some(140))
///   - "Trap Beat [165 F#m]_untagged.mp3" → ("Trap Beat", Some("F#m"), Some(165))
///   - "Chill Vibes [135 Bm].wav" → ("Chill Vibes", Some("Bm"), Some(135))
pub fn parse_audio_filename(filename: &str) -> (String, Option<String>, Option<i32>) {
    // Remove extension
    let without_ext = filename
        .rsplit_once('.')
        .map(|(name, _)| name)
        .unwrap_or(filename);
    
    // Remove suffix like _untagged, _tagged, _unmastered
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
    
    // Look for [Key BPM] or [BPM Key] pattern
    if let (Some(lb), Some(rb)) = (without_suffix.rfind('['), without_suffix.rfind(']')) {
        if lb < rb {
            let name = without_suffix[..lb].trim().to_string();
            let bracket_content = &without_suffix[lb + 1..rb];
            let tokens: Vec<&str> = bracket_content.split_whitespace().collect();
            
            if tokens.is_empty() {
                return (name, None, None);
            }
            
            // Smart detection: Find BPM (pure number) and Key (letters)
            let mut bpm: Option<i32> = None;
            let mut key_parts: Vec<&str> = Vec::new();
            
            for token in &tokens {
                // Check if token is a pure number (BPM)
                if let Ok(num) = token.parse::<i32>() {
                    // Plausibility check: BPM between 40 and 300
                    if num >= 40 && num <= 300 {
                        bpm = Some(num);
                        continue;
                    }
                }
                
                // Check if token starts with digits then has letters (e.g., "140bpm")
                let digits: String = token.chars().take_while(|c| c.is_ascii_digit()).collect();
                if !digits.is_empty() {
                    if let Ok(num) = digits.parse::<i32>() {
                        if num >= 40 && num <= 300 {
                            bpm = Some(num);
                            // Rest after digits could be Key (unlikely, but safe)
                            let rest: String = token.chars().skip(digits.len()).collect();
                            if !rest.is_empty() && is_valid_key(&rest) {
                                key_parts.push(token.split_at(digits.len()).1);
                            }
                            continue;
                        }
                    }
                }
                
                // Otherwise it's part of the Key
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
    
    // No bracket pattern found → return name without parsing
    (without_suffix.to_string(), None, None)
}

/// Parse beat folder name in format "#ID Name [Key BPM]" or "ID - Name [Key BPM]"
/// 
/// Examples:
///   - "#0870 PIECES [Bm 135]" → ("0870", "PIECES", Some("Bm"), Some(135.0))
///   - "0870 - PIECES [Bm 135]" → ("0870", "PIECES", Some("Bm"), Some(135.0))
pub fn parse_beat_folder(folder_name: &str) -> Option<(String, String, Option<String>, Option<f64>)> {
    let s = folder_name.trim();
    
    // Try pattern: #ID Name [Key BPM]
    if s.starts_with('#') {
        let rest = &s[1..];
        let (id, remainder) = rest.split_once(' ')?;
        return parse_name_key_bpm(id, remainder);
    }
    
    // Try pattern: ID - Name [Key BPM]
    if let Some((id_part, remainder)) = s.split_once(" - ") {
        let id = id_part.trim().trim_start_matches('#');
        return parse_name_key_bpm(id, remainder);
    }
    
    // Try pattern: ID Name [Key BPM] (space separated)
    let tokens: Vec<&str> = s.splitn(2, ' ').collect();
    if tokens.len() == 2 {
        let id = tokens[0].trim_start_matches('#');
        if id.chars().all(|c| c.is_ascii_digit()) {
            return parse_name_key_bpm(id, tokens[1]);
        }
    }
    
    None
}

fn parse_name_key_bpm(id: &str, remainder: &str) -> Option<(String, String, Option<String>, Option<f64>)> {
    let (name, key, bpm) = if let (Some(lb), Some(rb)) = (remainder.rfind('['), remainder.rfind(']')) {
        if lb < rb {
            let name = remainder[..lb].trim();
            let bracket = &remainder[lb + 1..rb];
            let tokens: Vec<&str> = bracket.split_whitespace().collect();
            
            let mut key: Option<String> = None;
            let mut bpm: Option<f64> = None;
            
            for token in tokens {
                if let Ok(num) = token.parse::<f64>() {
                    if num >= 40.0 && num <= 300.0 {
                        bpm = Some(num);
                        continue;
                    }
                }
                if is_valid_key(token) {
                    key = Some(token.to_string());
                }
            }
            
            (name.to_string(), key, bpm)
        } else {
            (remainder.trim().to_string(), None, None)
        }
    } else {
        (remainder.trim().to_string(), None, None)
    };
    
    Some((id.to_string(), name, key, bpm))
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_parse_audio_filename() {
        let (name, key, bpm) = parse_audio_filename("Midnight Drift [Cm 140].wav");
        assert_eq!(name, "Midnight Drift");
        assert_eq!(key, Some("Cm".to_string()));
        assert_eq!(bpm, Some(140));
        
        let (name, key, bpm) = parse_audio_filename("Trap Beat [165 F#m]_untagged.mp3");
        assert_eq!(name, "Trap Beat");
        assert_eq!(key, Some("F#m".to_string()));
        assert_eq!(bpm, Some(165));
    }
    
    #[test]
    fn test_parse_beat_folder() {
        let result = parse_beat_folder("#0870 PIECES [Bm 135]");
        assert!(result.is_some());
        let (id, name, key, bpm) = result.unwrap();
        assert_eq!(id, "0870");
        assert_eq!(name, "PIECES");
        assert_eq!(key, Some("Bm".to_string()));
        assert_eq!(bpm, Some(135.0));
    }
}
