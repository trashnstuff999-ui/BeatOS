// src-tauri/src/commands/upload/templates.rs
// Default upload-description templates (bootstrap on first launch).

use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const TEMPLATE_FILES: &[(&str, &str)] = &[
    ("beatstars.template", DEFAULT_BEATSTARS),
    ("soundcloud.template", DEFAULT_SOUNDCLOUD),
    ("youtube.template", DEFAULT_YOUTUBE),
];

/// Get the templates directory inside the app's data dir.
/// e.g. on Windows: %APPDATA%\com.beatos.app\templates\
pub fn templates_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app_data_dir: {}", e))?;
    Ok(base.join("templates"))
}

/// Ensure each default template exists on disk. Never overwrites — if a file
/// is already there (user has edited it), it is left untouched.
pub fn ensure_default_templates(app: &AppHandle) -> Result<(), String> {
    let dir = templates_dir(app)?;
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create templates dir {:?}: {}", dir, e))?;

    for (name, contents) in TEMPLATE_FILES {
        let path = dir.join(name);
        if !path.exists() {
            fs::write(&path, contents)
                .map_err(|e| format!("Failed to write default template {:?}: {}", path, e))?;
        }
    }
    Ok(())
}

/// Tauri command: returns the absolute path to the templates folder.
/// Used by the Upload tab "Edit Templates" button to reveal it in Explorer.
#[tauri::command]
pub fn get_templates_dir(app: AppHandle) -> Result<String, String> {
    let dir = templates_dir(&app)?;
    Ok(dir.to_string_lossy().to_string())
}

/// Tauri command: read a single template's current contents.
/// Phase B+ will use this for live preview rendering.
#[tauri::command]
pub fn read_template(app: AppHandle, name: String) -> Result<String, String> {
    let dir = templates_dir(&app)?;
    // Defense-in-depth: reject path-traversal attempts.
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err(format!("Invalid template name: {}", name));
    }
    let path: &Path = &dir.join(&name);
    fs::read_to_string(path)
        .map_err(|e| format!("Failed to read template {:?}: {}", path, e))
}

//   {{SC_URL}}            — settings.soundcloud_url
//   {{YT_URL}}            — settings.youtube_url
//   {{BS_URL}}            — settings.beatstars_url
//   {{BEATSTARS_LINK}}    — per-beat beat_uploads.url where platform='beatstars'
//   {{YEAR}}              — current year (e.g. "2026")

const DEFAULT_BEATSTARS: &str = "BEATSTARS TITEL:\n\
{{TITLE_UPPER}} - {{TYPE_BEAT_MAIN}} {{GENRE_TAGS}} Beat\n\
\n\
────────────────────────────\n\
\n\
PREMIERE PRO EXPORTNAME (Video):\n\
{{TYPE_BEAT_MAIN}} Type Beat {{YEAR}} - {{TITLE_UPPER}} - {{GENRE_TAGS}}\n\
\n\
ALBUMCOVER EXPORT:\n\
{{TITLE_UPPER}}_Cover_2000x2000.png\n\
\n\
THUMBNAIL EXPORT:\n\
{{TITLE_UPPER}}_THUMBNAIL_1920x1080.png\n";

const DEFAULT_SOUNDCLOUD: &str = "TITEL:\n\
[FREE] \"{{TITLE_UPPER}}\" {{TYPE_BEAT_MAIN}} Type Beat | {{GENRE_TAGS}} {{YEAR}}\n\
\n\
────────────────────────────\n\
\n\
DESCRIPTION:\n\
FREE DOWNLOAD / PURCHASE 🔥: {{BEATSTARS_LINK}}\n\
\n\
🎧 𝙃𝙞𝙜𝙝𝙡𝙞𝙜𝙝𝙩𝙨 ─ 𝙨𝙩𝙖𝙩𝙨\n\
BPM: {{BPM}} | Key: {{KEY}}\n\
\n\
{{GENRE_TAGS}} | {{TYPE_BEAT_MAIN}} Type Beat\n\
also fits: {{ALSO_FITS}}\n\
\n\
🚫 No Samples Used\n\
🎸 Loop by {{PRODUCER}}\n\
\n\
─────────────────────────\n\
CONTACT FOR STEMS & EXCLUSIVES:\n\
📧 Email: {{EMAIL}}\n\
📸 IG: {{IG_URL}}\n\
Contact on Instagram and/or Email for track stems and exclusive pricing.\n\
\n\
SOCIALS:\n\
🎵 YOUTUBE: {{YT_URL}}\n\
☁️ SOUNDCLOUD: {{SC_URL}}\n\
\n\
Drop a like and repost if you feel the vibe! 🤝\n\
\n\
────────────────────────────\n\
\n\
TAGS:\n\
{{HASHTAGS}}\n";

const DEFAULT_YOUTUBE: &str = "TITEL:\n\
[FREE] {{TYPE_BEAT_MAIN}} Type Beat {{YEAR}} \"{{TITLE_UPPER}}\"\n\
\n\
────────────────────────────\n\
\n\
DESCRIPTION:\n\
\"{{TITLE_UPPER}}\" — {{TYPE_BEAT_MAIN}} Type Beat | {{GENRE_TAGS}}\n\
\n\
🔥 PURCHASE / FREE DOWNLOAD: {{BEATSTARS_LINK}}\n\
\n\
BPM: {{BPM}} | Key: {{KEY}}\n\
{{PRODUCER_PROD}}\n\
\n\
────────────────────────────\n\
\n\
This {{GENRE_TAGS}} type beat fits artists like:\n\
{{TYPE_BEAT_MAIN}}, {{ALSO_FITS}}\n\
\n\
────────────────────────────\n\
\n\
📧 Email: {{EMAIL}}\n\
📸 Instagram: {{IG_URL}}\n\
☁️ SoundCloud: {{SC_URL}}\n\
🎵 YouTube: {{YT_URL}}\n\
🛒 Beatstars: {{BS_URL}}\n\
\n\
🚫 No Samples Used\n\
🎸 Loop by {{PRODUCER}}\n\
\n\
────────────────────────────\n\
\n\
LICENSING:\n\
✅ Free for non-profit use — must credit \"{{PRODUCER_PROD}}\" in title\n\
💰 For monetization on Spotify, Apple Music, YouTube, etc — purchase a lease\n\
👑 For exclusive ownership — contact via email\n\
\n\
────────────────────────────\n\
\n\
Time codes:\n\
0:00 - Intro\n\
[TIMESTAMP] - Chorus\n\
[TIMESTAMP] - Verse\n\
[TIMESTAMP] - Chorus\n\
[TIMESTAMP] - Verse\n\
[TIMESTAMP] - Chorus\n\
[TIMESTAMP] - Outro\n\
\n\
────────────────────────────\n\
\n\
TAGS:\n\
{{HASHTAGS}}\n";
