// src-tauri/src/utils/sanitize.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Filename / folder-name sanitization (Windows-safe, fine on macOS/Linux too)
// ═══════════════════════════════════════════════════════════════════════════════

/// Names Windows reserves regardless of extension (case-insensitive).
const RESERVED_NAMES: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL",
    "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
    "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Strip characters Windows refuses in file/folder names, control chars,
/// and trailing dots/spaces. Reserved device names get a `_` suffix.
pub fn sanitize_filename_part(s: &str) -> String {
    let cleaned: String = s
        .chars()
        .filter(|c| {
            !matches!(*c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*')
                && !c.is_control()
        })
        .collect();
    let trimmed = cleaned.trim().trim_end_matches(['.', ' ']).to_string();
    if RESERVED_NAMES
        .iter()
        .any(|r| trimmed.eq_ignore_ascii_case(r))
    {
        return format!("{}_", trimmed);
    }
    trimmed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_windows_forbidden_chars() {
        assert_eq!(sanitize_filename_part("A<B>:C\"D/E\\F|G?H*I"), "ABCDEFGHI");
    }

    #[test]
    fn trims_trailing_dots_and_spaces() {
        assert_eq!(sanitize_filename_part("My Beat.. "), "My Beat");
        assert_eq!(sanitize_filename_part("  spaced  "), "spaced");
    }

    #[test]
    fn keeps_normal_names_untouched() {
        assert_eq!(
            sanitize_filename_part("0042 - Dark Nights [Am 140]"),
            "0042 - Dark Nights [Am 140]"
        );
    }

    #[test]
    fn escapes_reserved_device_names() {
        assert_eq!(sanitize_filename_part("CON"), "CON_");
        assert_eq!(sanitize_filename_part("aux"), "aux_");
        assert_eq!(sanitize_filename_part("Konsole"), "Konsole");
    }

    #[test]
    fn removes_control_chars() {
        assert_eq!(sanitize_filename_part("A\tB\nC"), "ABC");
    }
}
