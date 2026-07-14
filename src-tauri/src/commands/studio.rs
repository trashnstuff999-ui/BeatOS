// src-tauri/src/commands/studio.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Studio tab: every started FLP project across the configured production
// roots. The filesystem is the source of truth for WHICH projects exist;
// the studio_projects table only carries status / priority / notes.
// Archiving moves the folder away (auto-trash), so archived projects
// disappear from the scan — orphaned DB rows are cleaned up on each scan.
// ═══════════════════════════════════════════════════════════════════════════════

use crate::db::open_db;
use crate::utils::{
    file_modified_secs, is_audio_extension, is_flp, is_image_extension,
    is_video_extension, parse_audio_filename, secs_to_date,
};
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

pub const STUDIO_STATUSES: [&str; 4] = ["idea", "wip", "exported", "ready"];

#[derive(Debug, Serialize)]
pub struct FlpEntry {
    pub path: String,
    pub name: String,
    pub modified_secs: u64,
    pub modified_date: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct StudioProject {
    pub path: String,            // project folder (identity)
    pub name: String,            // folder name
    pub root: String,            // which production root it came from
    pub parsed_name: String,     // name without [Key BPM]
    pub key: Option<String>,
    pub bpm: Option<i32>,
    pub newest_flp: Option<String>,
    pub flp_count: usize,
    /// All FLP versions, newest first (for the inspector)
    pub flps: Vec<FlpEntry>,
    pub modified_date: Option<String>, // of newest FLP (fallback: folder)
    pub modified_secs: u64,            // for sorting
    pub has_mp3: bool,
    pub has_wav: bool,
    pub has_cover: bool,
    pub has_thumbnail: bool,
    pub has_video: bool,
    // from studio_projects table:
    pub status: String,
    pub priority: i64,
    pub notes: Option<String>,
}

/// Scan all production roots for project folders (any direct subfolder
/// containing at least one FLP — searched one level deep incl. 01_SAVEFILES)
/// and merge with the persisted status/priority/notes.
#[tauri::command]
pub async fn scan_studio_projects(paths: Vec<String>) -> Result<Vec<StudioProject>, String> {
    tauri::async_runtime::spawn_blocking(move || scan_studio_projects_blocking(&paths))
        .await
        .map_err(|e| format!("Studio scan panicked: {}", e))?
}

fn scan_studio_projects_blocking(paths: &[String]) -> Result<Vec<StudioProject>, String> {
    let mut projects: Vec<StudioProject> = Vec::new();

    for root in paths {
        let root_path = Path::new(root);
        if root.trim().is_empty() || !root_path.is_dir() {
            continue;
        }
        let entries = match std::fs::read_dir(root_path) {
            Ok(rd) => rd,
            Err(_) => continue,
        };
        for entry in entries.filter_map(|e| e.ok()) {
            let dir = entry.path();
            if !dir.is_dir() {
                continue;
            }
            if let Some(p) = scan_project_dir(&dir, root) {
                projects.push(p);
            }
        }
    }

    // Merge with DB state + drop orphaned rows (folder gone = archived/deleted)
    let conn = open_db().map_err(|e| e.to_string())?;
    let mut db_state: HashMap<String, (String, i64, Option<String>)> = HashMap::new();
    {
        let mut stmt = conn
            .prepare("SELECT path, status, priority, notes FROM studio_projects")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    (r.get::<_, String>(1)?, r.get::<_, i64>(2)?, r.get::<_, Option<String>>(3)?),
                ))
            })
            .map_err(|e| e.to_string())?;
        for row in rows.flatten() {
            db_state.insert(row.0, row.1);
        }
    }

    let live_paths: std::collections::HashSet<&str> =
        projects.iter().map(|p| p.path.as_str()).collect();
    for db_path in db_state.keys() {
        if !live_paths.contains(db_path.as_str()) {
            let _ = conn.execute(
                "DELETE FROM studio_projects WHERE path = ?1",
                rusqlite::params![db_path],
            );
        }
    }

    for p in &mut projects {
        if let Some((status, priority, notes)) = db_state.get(&p.path) {
            p.status = status.clone();
            p.priority = *priority;
            p.notes = notes.clone();
        } else {
            let _ = conn.execute(
                "INSERT OR IGNORE INTO studio_projects (path) VALUES (?1)",
                rusqlite::params![p.path],
            );
        }
    }

    // Priority first, then workflow progress (ready first), then newest
    let status_rank = |s: &str| STUDIO_STATUSES.iter().position(|x| *x == s).unwrap_or(0);
    projects.sort_by(|a, b| {
        b.priority
            .cmp(&a.priority)
            .then(status_rank(&b.status).cmp(&status_rank(&a.status)))
            .then(b.modified_secs.cmp(&a.modified_secs))
    });

    Ok(projects)
}

/// One project folder → StudioProject (None if it contains no FLP).
fn scan_project_dir(dir: &Path, root: &str) -> Option<StudioProject> {
    let mut flps: Vec<(u64, PathBuf)> = Vec::new();
    let mut has_mp3 = false;
    let mut has_wav = false;
    let mut has_cover = false;
    let mut has_thumbnail = false;
    let mut has_video = false;

    // Folder root + one level of subdirs (01_SAVEFILES etc.)
    let mut scan_files = |d: &Path, collect_assets: bool| {
        let Ok(rd) = std::fs::read_dir(d) else { return };
        for e in rd.filter_map(|e| e.ok()) {
            let p = e.path();
            if p.is_dir() {
                continue;
            }
            if is_flp(&p) {
                flps.push((file_modified_secs(&p).unwrap_or(0), p));
                continue;
            }
            if !collect_assets {
                continue;
            }
            let ext = p.extension().and_then(|x| x.to_str()).unwrap_or("").to_lowercase();
            let name_lower = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
            if ext == "mp3" { has_mp3 = true; }
            if ext == "wav" { has_wav = true; }
            if is_audio_extension(&ext) { /* covered by mp3/wav flags */ }
            if is_image_extension(&ext) {
                if name_lower.contains("thumb") { has_thumbnail = true; } else { has_cover = true; }
            }
            if is_video_extension(&ext) { has_video = true; }
        }
    };

    scan_files(dir, true);
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.filter_map(|e| e.ok()) {
            let p = e.path();
            if p.is_dir() {
                scan_files(&p, false); // FLPs in subfolders count, assets only from root
            }
        }
    }

    if flps.is_empty() {
        return None;
    }
    flps.sort_by_key(|(secs, _)| *secs);
    let (newest_secs, newest_flp) = flps.last().cloned()?;

    // Newest first for the inspector's version list
    let flp_entries: Vec<FlpEntry> = flps
        .iter()
        .rev()
        .map(|(secs, p)| FlpEntry {
            path: p.to_string_lossy().to_string(),
            name: p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string(),
            modified_secs: *secs,
            modified_date: if *secs > 0 { Some(secs_to_date(*secs)) } else { None },
        })
        .collect();

    let name = dir.file_name()?.to_str()?.to_string();
    let (parsed_name, key, bpm) = parse_audio_filename(&name);
    let modified_secs = if newest_secs > 0 { newest_secs } else { file_modified_secs(dir).unwrap_or(0) };

    Some(StudioProject {
        path: dir.to_string_lossy().to_string(),
        name,
        root: root.to_string(),
        parsed_name,
        key,
        bpm,
        newest_flp: Some(newest_flp.to_string_lossy().to_string()),
        flp_count: flps.len(),
        flps: flp_entries,
        modified_date: if modified_secs > 0 { Some(secs_to_date(modified_secs)) } else { None },
        modified_secs,
        has_mp3,
        has_wav,
        has_cover,
        has_thumbnail,
        has_video,
        status: "idea".to_string(),
        priority: 0,
        notes: None,
    })
}

/// Persist status / priority / notes for one project folder.
#[tauri::command]
pub fn update_studio_project(
    path: String,
    status: String,
    priority: i64,
    notes: Option<String>,
) -> Result<(), String> {
    if !STUDIO_STATUSES.contains(&status.as_str()) {
        return Err(format!("Invalid studio status: {}", status));
    }
    let conn = open_db().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO studio_projects (path, status, priority, notes)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(path) DO UPDATE SET
            status = excluded.status,
            priority = excluded.priority,
            notes = excluded.notes",
        rusqlite::params![path, status, priority, notes],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════════
// Asset inbox (central 04_UPLOAD export folder → assign to projects)
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Serialize)]
pub struct AssetFile {
    pub path: String,
    pub name: String,
    pub kind: String,       // "image" | "video"
    pub guessed_role: String, // "cover" | "thumbnail" | "video" | "image"
    pub size: u64,
    pub modified_date: Option<String>,
    pub modified_secs: u64,
}

/// List images/videos in the asset inbox (root + one level of subfolders).
#[tauri::command]
pub async fn scan_asset_inbox(path: String) -> Result<Vec<AssetFile>, String> {
    tauri::async_runtime::spawn_blocking(move || scan_asset_inbox_blocking(&path))
        .await
        .map_err(|e| format!("Asset scan panicked: {}", e))?
}

fn scan_asset_inbox_blocking(path: &str) -> Result<Vec<AssetFile>, String> {
    let root = Path::new(path);
    if path.trim().is_empty() || !root.is_dir() {
        return Err(format!(
            "Asset-Ordner nicht gefunden: '{}' — bitte Asset Path in den Settings setzen",
            path
        ));
    }

    let mut out: Vec<AssetFile> = Vec::new();
    let mut collect = |dir: &Path| {
        let Ok(rd) = std::fs::read_dir(dir) else { return };
        for e in rd.filter_map(|e| e.ok()) {
            let p = e.path();
            if !p.is_file() {
                continue;
            }
            let ext = p.extension().and_then(|x| x.to_str()).unwrap_or("").to_lowercase();
            let kind = if is_image_extension(&ext) {
                "image"
            } else if is_video_extension(&ext) {
                "video"
            } else {
                continue;
            };
            let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
            let name_lower = name.to_lowercase();
            let guessed_role = if kind == "video" {
                "video"
            } else if name_lower.contains("thumb") {
                "thumbnail"
            } else if name_lower.contains("cover") {
                "cover"
            } else {
                "image"
            };
            let size = std::fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
            let secs = file_modified_secs(&p).unwrap_or(0);
            out.push(AssetFile {
                path: p.to_string_lossy().to_string(),
                name,
                kind: kind.to_string(),
                guessed_role: guessed_role.to_string(),
                size,
                modified_date: if secs > 0 { Some(secs_to_date(secs)) } else { None },
                modified_secs: secs,
            });
        }
    };

    collect(root);
    if let Ok(rd) = std::fs::read_dir(root) {
        for e in rd.filter_map(|e| e.ok()) {
            let p = e.path();
            if p.is_dir() {
                collect(&p);
            }
        }
    }

    out.sort_by(|a, b| b.modified_secs.cmp(&a.modified_secs));
    Ok(out)
}

/// Move an asset from the inbox into a project folder root (where the
/// Create-tab parser will pick it up and archive it with the beat).
#[tauri::command]
pub fn assign_asset_to_project(
    asset_path: String,
    asset_root: String,
    project_dir: String,
) -> Result<String, String> {
    let src = Path::new(&asset_path);
    let root = Path::new(&asset_root);
    let target_dir = Path::new(&project_dir);

    if !src.is_file() {
        return Err(format!("Asset nicht gefunden: {}", asset_path));
    }
    // Guard: source must live under the configured inbox
    match (src.canonicalize(), root.canonicalize()) {
        (Ok(cs), Ok(cr)) if cs.starts_with(&cr) => {}
        _ => return Err("Sicherheitsstopp: Asset liegt nicht im Asset-Ordner".to_string()),
    }
    if !target_dir.is_dir() {
        return Err(format!("Projektordner nicht gefunden: {}", project_dir));
    }

    let file_name = src
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Ungültiger Dateiname")?;
    let dest = crate::utils::unique_dest(target_dir, file_name);

    // rename fails across drives → fall back to verified copy + delete
    if std::fs::rename(src, &dest).is_err() {
        copy_and_verify_move(src, &dest)?;
    }

    Ok(dest.to_string_lossy().to_string())
}

fn copy_and_verify_move(src: &Path, dest: &Path) -> Result<(), String> {
    crate::utils::copy_and_verify(src, dest)?;
    std::fs::remove_file(src).map_err(|e| format!("Quelle konnte nicht entfernt werden: {}", e))
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::scan_project_dir;

    #[test]
    fn detects_flp_project_with_assets() {
        let tmp = std::env::temp_dir().join(format!("beatos_studio_test_{}", std::process::id()));
        let proj = tmp.join("MEMORIES [156 Fm]");
        let save = proj.join("01_SAVEFILES");
        std::fs::create_dir_all(&save).unwrap();
        std::fs::write(save.join("memories_v3.FLP"), b"flp").unwrap();
        std::fs::write(proj.join("MEMORIES [156 Fm].mp3"), b"mp3").unwrap();
        std::fs::write(proj.join("MEMORIES_Cover.png"), b"png").unwrap();
        std::fs::write(proj.join("MEMORIES_Thumbnail.png"), b"png").unwrap();

        let p = scan_project_dir(&proj, "root").expect("project detected");
        assert_eq!(p.parsed_name, "MEMORIES");
        assert_eq!(p.key.as_deref(), Some("Fm"));
        assert_eq!(p.bpm, Some(156));
        assert!(p.has_mp3 && !p.has_wav);
        assert!(p.has_cover && p.has_thumbnail && !p.has_video);
        assert_eq!(p.flp_count, 1);
        assert!(p.newest_flp.as_deref().unwrap().to_lowercase().ends_with(".flp"));
        assert_eq!(p.flps.len(), 1);
        assert_eq!(p.flps[0].name.to_lowercase(), "memories_v3.flp");

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn folder_without_flp_is_not_a_project() {
        let tmp = std::env::temp_dir().join(format!("beatos_studio_test2_{}", std::process::id()));
        let proj = tmp.join("Nur Bilder");
        std::fs::create_dir_all(&proj).unwrap();
        std::fs::write(proj.join("cover.png"), b"png").unwrap();

        assert!(scan_project_dir(&proj, "root").is_none());

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn assign_asset_moves_with_collision_suffix() {
        let tmp = std::env::temp_dir().join(format!("beatos_assign_test_{}", std::process::id()));
        let inbox = tmp.join("inbox");
        let proj = tmp.join("proj");
        std::fs::create_dir_all(&inbox).unwrap();
        std::fs::create_dir_all(&proj).unwrap();
        std::fs::write(inbox.join("Cover.png"), b"neu").unwrap();
        std::fs::write(proj.join("Cover.png"), b"alt").unwrap(); // collision

        let dest = super::assign_asset_to_project(
            inbox.join("Cover.png").to_string_lossy().to_string(),
            inbox.to_string_lossy().to_string(),
            proj.to_string_lossy().to_string(),
        ).unwrap();

        assert!(dest.ends_with("Cover_2.png"), "got: {}", dest);
        assert!(!inbox.join("Cover.png").exists(), "source must be moved away");
        assert_eq!(std::fs::read(proj.join("Cover_2.png")).unwrap(), b"neu");
        assert_eq!(std::fs::read(proj.join("Cover.png")).unwrap(), b"alt");

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn assign_asset_refuses_outside_inbox() {
        let tmp = std::env::temp_dir().join(format!("beatos_assign_test2_{}", std::process::id()));
        let inbox = tmp.join("inbox");
        let outside = tmp.join("outside");
        let proj = tmp.join("proj");
        std::fs::create_dir_all(&inbox).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::create_dir_all(&proj).unwrap();
        std::fs::write(outside.join("x.png"), b"x").unwrap();

        let res = super::assign_asset_to_project(
            outside.join("x.png").to_string_lossy().to_string(),
            inbox.to_string_lossy().to_string(),
            proj.to_string_lossy().to_string(),
        );
        assert!(res.is_err());
        assert!(outside.join("x.png").exists());

        std::fs::remove_dir_all(&tmp).unwrap();
    }
}
