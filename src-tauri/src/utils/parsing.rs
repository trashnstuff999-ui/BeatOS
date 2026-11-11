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
                
                // Reine Zahl außerhalb des BPM-Bereichs ist keine Tonart —
                // z.B. die alte Beat-Nummer in „[663] Loyal - 93 C#m.mp3"
                if token.chars().all(|c| c.is_ascii_digit()) {
                    continue;
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
    
    // Try pattern: ID - Name [Key BPM] — „B0145“ (Katalog ab Scheibe 4) liest sich wie „0145“
    if let Some((id_part, remainder)) = s.split_once(" - ") {
        let id = id_part.trim().trim_start_matches('#');
        let id = match id.strip_prefix('B') {
            Some(z) if !z.is_empty() && z.chars().all(|c| c.is_ascii_digit()) => z,
            _ => id,
        };
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

/// Die eine Namensregel der App (11.11.2026, Stephan):
/// `dont cry 150 bm` → `DONT CRY [150 Bmin]`, Sample `pads - dont cry 150 bm_2`
/// → `PADS - DONT CRY [150 Bmin]_2`.
/// - Tempo = Zahl 40–300, Tonart = das Wort direkt daneben (danach zuerst),
///   Reihenfolge egal. Ohne Tonart daneben gilt die letzte passende Zahl.
/// - Alles ab dem ersten `_` ist Zusatz und bleibt, wie getippt, am Ende.
/// - Instrument nur bei Samples: was vor ` - ` steht, wenn danach noch Titel kommt.
/// - Titel und Instrument in Großbuchstaben. Klammern im Eingang werden neu gelesen,
///   ein schon sauberer Name bleibt also gleich.
pub fn schoener_name(eingabe: &str, sample: bool) -> String {
    let (basis, zusatz) = match eingabe.find('_') {
        Some(i) => (&eingabe[..i], &eingabe[i..]),
        None => (eingabe, ""),
    };
    let basis = basis.replace(['[', ']'], " ");
    let tokens: Vec<&str> = basis.split_whitespace().collect();
    let tempo_von = |t: &str| t.trim_end_matches(|c: char| c.is_ascii_alphabetic())
        .parse::<u32>().ok().filter(|n| (40..=300).contains(n) && t.chars().next().is_some_and(|c| c.is_ascii_digit()));
    let ist_key = |i: usize| tokens.get(i).is_some_and(|t| is_valid_key(t));

    // Tempo: die Zahl mit Tonart daneben, sonst die letzte
    let zahlen: Vec<usize> = (0..tokens.len()).filter(|&i| tempo_von(tokens[i]).is_some()).collect();
    let tempo_i = zahlen.iter().copied()
        .find(|&i| ist_key(i + 1) || (i > 0 && ist_key(i - 1)))
        .or(zahlen.last().copied());
    let key_i = tempo_i.and_then(|i| if ist_key(i + 1) { Some(i + 1) } else if i > 0 && ist_key(i - 1) { Some(i - 1) } else { None });

    // Rest: Titelwörter, ` - ` merkt sich die Stelle fürs Instrument
    let mut vor: Vec<&str> = Vec::new();
    let mut nach: Vec<&str> = Vec::new();
    let mut trenner = false;
    for (i, t) in tokens.iter().enumerate() {
        if Some(i) == tempo_i || Some(i) == key_i { continue; }
        if *t == "-" { if !vor.is_empty() { trenner = true; } continue; }
        if trenner { nach.push(t) } else { vor.push(t) }
    }
    let (instrument, titel) = if sample && trenner && !nach.is_empty() {
        (vor.join("-"), nach.join(" "))
    } else {
        (String::new(), vor.into_iter().chain(nach).collect::<Vec<_>>().join(" "))
    };

    let mut klammer: Vec<String> = Vec::new();
    if let Some(i) = tempo_i { klammer.push(tempo_von(tokens[i]).unwrap().to_string()); }
    if let Some(i) = key_i { klammer.push(key_lang(tokens[i])); }

    let mut s = String::new();
    if !instrument.is_empty() { s.push_str(&instrument.to_uppercase()); s.push_str(" - "); }
    s.push_str(&titel.to_uppercase());
    if !klammer.is_empty() {
        if !s.is_empty() { s.push(' '); }
        s.push_str(&format!("[{}]", klammer.join(" ")));
    }
    s.push_str(zusatz);
    s
}

/// `bm` → `Bmin`, `b` → `Bmaj`, `f#m` → `F#min`, `bbm` → `Bbmin`, `Cmaj` → `Cmaj`.
fn key_lang(k: &str) -> String {
    let mut c = k.chars();
    let wurzel = c.next().unwrap().to_ascii_uppercase();
    let rest = c.as_str().to_lowercase();
    let (vorzeichen, art) = match rest.strip_prefix('#') {
        Some(r) => ("#", r.to_string()),
        None => match rest.strip_prefix('b') {
            Some(r) if ["", "m", "min", "maj"].contains(&r) => ("b", r.to_string()),
            _ => ("", rest),
        },
    };
    let art = if art == "m" || art == "min" { "min" } else { "maj" };
    format!("{}{}{}", wurzel, vorzeichen, art)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schoener_name_nach_stephans_tabelle() {
        for (ein, aus) in [
            ("dont cry - 150 bm", "DONT CRY [150 Bmin]"),
            ("dont cry 150 bm", "DONT CRY [150 Bmin]"),
            ("150 bm dont cry", "DONT CRY [150 Bmin]"),
            ("  dont cry - 150 b", "DONT CRY [150 Bmaj]"),
            ("dont cry 150 b", "DONT CRY [150 Bmaj]"),
            ("150 b dont cry", "DONT CRY [150 Bmaj]"),
            ("dont cry bm 150_2", "DONT CRY [150 Bmin]_2"),
            ("a day 150 am", "A DAY [150 Amin]"),
            ("dont cry f#m 150_master", "DONT CRY [150 F#min]_master"),
            ("dont cry 150 bbm", "DONT CRY [150 Bbmin]"),
            ("dont cry 150", "DONT CRY [150]"),
            ("dont cry", "DONT CRY"),
            ("50 cent 150 bm", "50 CENT [150 Bmin]"),
            ("DONT CRY [150 Bmin]_2", "DONT CRY [150 Bmin]_2"),
        ] {
            assert_eq!(schoener_name(ein, false), aus, "Beat: {ein}");
        }
        for (ein, aus) in [
            ("pads - dont cry 150 bm", "PADS - DONT CRY [150 Bmin]"),
            ("acoustic-guitar - dont cry 150 f#m_LEFT", "ACOUSTIC-GUITAR - DONT CRY [150 F#min]_LEFT"),
            ("wide lead - dont cry bm 150", "WIDE-LEAD - DONT CRY [150 Bmin]"),
            ("dont cry - 150 bm", "DONT CRY [150 Bmin]"), // nach „-“ kein Titel: kein Instrument
            ("dont cry 150 bm", "DONT CRY [150 Bmin]"),   // ohne Trenner: volle Version
            ("PADS - DONT CRY [150 Bmin]_2", "PADS - DONT CRY [150 Bmin]_2"),
        ] {
            assert_eq!(schoener_name(ein, true), aus, "Sample: {ein}");
        }
    }

    // ─── parse_audio_filename ────────────────────────────────────────────────

    #[test]
    fn test_audio_key_before_bpm() {
        let (name, key, bpm) = parse_audio_filename("Midnight Drift [Cm 140].wav");
        assert_eq!(name, "Midnight Drift");
        assert_eq!(key, Some("Cm".to_string()));
        assert_eq!(bpm, Some(140));
    }

    #[test]
    fn test_audio_bpm_before_key_with_suffix() {
        let (name, key, bpm) = parse_audio_filename("Trap Beat [165 F#m]_untagged.mp3");
        assert_eq!(name, "Trap Beat");
        assert_eq!(key, Some("F#m".to_string()));
        assert_eq!(bpm, Some(165));
    }

    #[test]
    fn test_audio_old_beat_number_is_no_key() {
        let (_, key, bpm) = parse_audio_filename("[663] Loyal - 93 C#m.mp3");
        assert_eq!(key, None);
        assert_eq!(bpm, None);
    }

    #[test]
    fn test_audio_bpm_only() {
        let (name, key, bpm) = parse_audio_filename("Dark Vibes [140].wav");
        assert_eq!(name, "Dark Vibes");
        assert_eq!(key, None);
        assert_eq!(bpm, Some(140));
    }

    #[test]
    fn test_audio_no_bracket() {
        let (name, key, bpm) = parse_audio_filename("Unnamed Beat.mp3");
        assert_eq!(name, "Unnamed Beat");
        assert_eq!(key, None);
        assert_eq!(bpm, None);
    }

    #[test]
    fn test_audio_bpm_out_of_range_ignored() {
        // BPM must be 40-300; 10 should not be parsed as BPM
        let (_name, _key, bpm) = parse_audio_filename("Test [10].wav");
        assert_eq!(bpm, None);
    }

    // ─── parse_beat_folder ───────────────────────────────────────────────────

    #[test]
    fn test_folder_hash_prefix() {
        let (id, name, key, bpm) = parse_beat_folder("#0870 PIECES [Bm 135]").unwrap();
        assert_eq!(id, "0870");
        assert_eq!(name, "PIECES");
        assert_eq!(key, Some("Bm".to_string()));
        assert_eq!(bpm, Some(135.0));
    }

    #[test]
    fn b_nummer_im_ordner() {
        let (id, name, key, bpm) = parse_beat_folder("B0145 - ANGER [Am 160]").unwrap();
        assert_eq!((id.as_str(), name.as_str(), key.as_deref(), bpm), ("0145", "ANGER", Some("Am"), Some(160.0)));
        // Ein Titel, der mit B anfängt, bleibt Titel; „Bxyz“ ist keine Nummer
        assert_eq!(parse_beat_folder("Bounce - Night [140]").unwrap().0, "Bounce");
        assert_eq!(crate::commands::build_archive_folder_name(145, "ANGER", Some("Am"), Some(160)), "B0145 - ANGER [Am 160]");
    }

    #[test]
    fn test_folder_dash_separator() {
        let (id, name, key, bpm) = parse_beat_folder("0042 - Dark Summer [Am 128]").unwrap();
        assert_eq!(id, "0042");
        assert_eq!(name, "Dark Summer");
        assert_eq!(key, Some("Am".to_string()));
        assert_eq!(bpm, Some(128.0));
    }

    #[test]
    fn test_folder_no_key_or_bpm() {
        let (id, name, key, bpm) = parse_beat_folder("0001 - Untitled").unwrap();
        assert_eq!(id, "0001");
        assert_eq!(name, "Untitled");
        assert_eq!(key, None);
        assert_eq!(bpm, None);
    }

    #[test]
    fn test_folder_invalid_returns_none() {
        assert!(parse_beat_folder("not a valid folder name").is_none());
        assert!(parse_beat_folder("").is_none());
    }

    #[test]
    fn test_folder_bpm_only_in_brackets() {
        let (id, name, key, bpm) = parse_beat_folder("0010 - Bounce [140]").unwrap();
        assert_eq!(id, "0010");
        assert_eq!(name, "Bounce");
        assert_eq!(key, None);
        assert_eq!(bpm, Some(140.0));
    }

    #[test]
    fn test_folder_bpm_before_key() {
        // The old local parser in archive.rs got this wrong (key="140", bpm=None)
        let (id, name, key, bpm) = parse_beat_folder("0011 - Night Ride [140 Am]").unwrap();
        assert_eq!(id, "0011");
        assert_eq!(name, "Night Ride");
        assert_eq!(key, Some("Am".to_string()));
        assert_eq!(bpm, Some(140.0));
    }

    #[test]
    fn test_folder_umlauts_and_sharp_key() {
        let (id, name, key, bpm) = parse_beat_folder("0099 - Träume [F#m 92]").unwrap();
        assert_eq!(id, "0099");
        assert_eq!(name, "Träume");
        assert_eq!(key, Some("F#m".to_string()));
        assert_eq!(bpm, Some(92.0));
    }
}
