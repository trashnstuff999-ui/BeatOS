// src-tauri/src/commands/upload/migration.rs
// Legacy layout (01_AUDIO/02_VISUALS/03_PROJECTS/04_UPLOAD) → flat structure.

use crate::db::open_db;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

// ═══════════════════════════════════════════════════════════════════════════════
// Legacy structure migration
// ═══════════════════════════════════════════════════════════════════════════════
//
// Legacy layout (older archives):     New layout (current Create-flow):
//   {beat}/01_AUDIO/*                   {beat}/* (all media in root)
//   {beat}/02_VISUALS/*                 {beat}/01_SAVEFILES/*.flp
//   {beat}/03_PROJECTS/*                {beat}/{platform}.txt
//   {beat}/04_UPLOAD/*
//
// Migration moves contents of 01_AUDIO/, 02_VISUALS/, 04_UPLOAD/ into the
// root and renames 03_PROJECTS/ to 01_SAVEFILES/. A final sweep moves all but
// the newest MP3/WAV into 02_OLD/, so exactly one MP3 and one WAV stay in
// the root. Nothing is overwritten —
// if a destination filename already exists in the root we report it as a
// collision and abort the whole migration before touching the disk.

const LEGACY_FLATTEN_DIRS: [&str; 3] = ["01_AUDIO", "02_VISUALS", "04_UPLOAD"];

#[derive(Debug, Serialize)]
pub struct LegacyMove {
    pub from_subdir: String,
    pub file_name:   String,
    /// True when the entry is itself a folder (e.g. `01_AUDIO/Backup/`).
    /// Folders move as a whole via `fs::rename`, contents stay intact.
    pub is_dir:      bool,
}

#[derive(Debug, Serialize)]
pub struct LegacyStructure {
    pub is_legacy:           bool,
    pub has_01_audio:        bool,
    pub has_02_visuals:      bool,
    pub has_03_projects:     bool,
    pub has_04_upload:       bool,
    pub has_01_savefiles:    bool,
    pub planned_moves:       Vec<LegacyMove>,
    /// File names that would collide with files already in the root.
    /// If non-empty, migration is refused.
    pub collisions:          Vec<String>,
    /// Set when 03_PROJECTS exists AND 01_SAVEFILES also exists — the
    /// rename step can't happen because both names are taken. User has to
    /// merge manually.
    pub savefiles_conflict:  bool,
}

#[derive(Debug, Serialize)]
pub struct MigrationResult {
    pub moved_files:        usize,
    pub renamed_savefiles:  bool,
    pub removed_subfolders: Vec<String>,
    /// Older MP3/WAV files swept into 02_OLD/ after the migration.
    pub moved_to_old:       usize,
}

/// Inspect a beat's folder, build a migration plan without touching anything.
/// Used by the UI to decide whether to show the "Migrate" banner + dialog.
#[tauri::command]
pub fn check_legacy_structure(beat_id: String) -> Result<LegacyStructure, String> {
    let beat_root = resolve_beat_root(&beat_id)?;
    Ok(scan_legacy(&beat_root))
}

/// Execute the migration plan. Refuses to run if there are collisions or a
/// savefiles conflict — caller should re-invoke `check_legacy_structure` after
/// fixing the conflicts manually.
#[tauri::command]
pub fn migrate_legacy_beat_structure(beat_id: String) -> Result<MigrationResult, String> {
    let beat_root = resolve_beat_root(&beat_id)?;
    let plan = scan_legacy(&beat_root);

    if !plan.is_legacy {
        return Err("Beat has no legacy structure to migrate".into());
    }
    if !plan.collisions.is_empty() {
        return Err(format!(
            "Cannot migrate: {} file(s) would collide with existing root files. Resolve manually first.\n  {}",
            plan.collisions.len(),
            plan.collisions.join("\n  ")
        ));
    }
    if plan.savefiles_conflict {
        return Err(
            "Cannot migrate: both 03_PROJECTS/ and 01_SAVEFILES/ exist. Merge their contents manually before migrating.".into()
        );
    }

    let mut moved = 0usize;
    let mut removed: Vec<String> = Vec::new();

    // ─── Move files from each flatten-source into root ──────────────────
    for subdir_name in LEGACY_FLATTEN_DIRS {
        let subdir = beat_root.join(subdir_name);
        if !subdir.is_dir() { continue; }

        let entries: Vec<_> = match fs::read_dir(&subdir) {
            Ok(rd) => rd.filter_map(|e| e.ok()).collect(),
            Err(e) => return Err(format!("Cannot read {}: {}", subdir_name, e)),
        };

        for entry in entries {
            let from = entry.path();
            let file_name = match from.file_name().and_then(|n| n.to_str()) {
                Some(n) => n.to_string(),
                None => continue,
            };
            // Both files AND nested folders (e.g. "Backup/") get moved to
            // root. `fs::rename` handles directories atomically on the same
            // volume, contents stay intact.
            let to = beat_root.join(&file_name);
            if to.exists() {
                // Should have been caught by the plan; defensive double-check.
                return Err(format!(
                    "Aborting mid-migration: unexpected collision on '{}'. {} file(s) already moved.",
                    file_name, moved
                ));
            }
            fs::rename(&from, &to).map_err(|e| {
                format!("Failed to move {:?} → {:?}: {} ({} file(s) already moved)", from, to, e, moved)
            })?;
            moved += 1;
        }

        // Remove the subfolder only if it ended up empty (no nested dirs lurking).
        let still_has_entries = fs::read_dir(&subdir)
            .map(|rd| rd.filter_map(|e| e.ok()).next().is_some())
            .unwrap_or(true);
        if !still_has_entries {
            if let Err(e) = fs::remove_dir(&subdir) {
                // Non-fatal: report but continue.
                eprintln!("Could not remove empty {}: {}", subdir_name, e);
            } else {
                removed.push(subdir_name.to_string());
            }
        }
    }

    // ─── Rename 03_PROJECTS/ → 01_SAVEFILES/ ─────────────────────────────
    let renamed_savefiles = {
        let old = beat_root.join("03_PROJECTS");
        let new = beat_root.join("01_SAVEFILES");
        if old.is_dir() && !new.exists() {
            fs::rename(&old, &new).map_err(|e| {
                format!("Failed to rename 03_PROJECTS → 01_SAVEFILES: {} (files were already moved successfully)", e)
            })?;
            true
        } else {
            false
        }
    };

    // Nach dem Flatten liegen alle Audios des Altbestands im Root. Nur die
    // neueste MP3/WAV bleibt dort, der Rest zieht nach 02_OLD/.
    let moved_to_old = crate::commands::sweep_old_audio(&beat_root);

    Ok(MigrationResult {
        moved_files: moved,
        renamed_savefiles,
        removed_subfolders: removed,
        moved_to_old,
    })
}

// ─── Internal helpers ──────────────────────────────────────────────────────

fn resolve_beat_root(beat_id: &str) -> Result<PathBuf, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let path_str: String = conn.query_row(
        "SELECT path FROM beats WHERE id = ?1",
        rusqlite::params![beat_id],
        |row| row.get::<_, Option<String>>(0),
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => format!("Beat {} not found", beat_id),
        _ => format!("DB lookup failed: {}", e),
    })?
    .ok_or_else(|| format!("Beat {} has no folder path on record", beat_id))?;

    let path = PathBuf::from(&path_str);
    if !path.is_dir() {
        return Err(format!("Beat folder does not exist: {}", path_str));
    }
    Ok(path)
}

fn scan_legacy(beat_root: &Path) -> LegacyStructure {
    let has_01_audio     = beat_root.join("01_AUDIO").is_dir();
    let has_02_visuals   = beat_root.join("02_VISUALS").is_dir();
    let has_03_projects  = beat_root.join("03_PROJECTS").is_dir();
    let has_04_upload    = beat_root.join("04_UPLOAD").is_dir();
    let has_01_savefiles = beat_root.join("01_SAVEFILES").is_dir();

    let needs_flatten = has_01_audio || has_02_visuals || has_04_upload;
    let needs_rename  = has_03_projects;
    let is_legacy = needs_flatten || needs_rename;

    // Build the move plan + collision list (read-only pass)
    let mut planned_moves: Vec<LegacyMove> = Vec::new();
    let mut collisions: Vec<String> = Vec::new();

    for subdir_name in LEGACY_FLATTEN_DIRS {
        let subdir = beat_root.join(subdir_name);
        if !subdir.is_dir() { continue; }
        if let Ok(rd) = fs::read_dir(&subdir) {
            for entry in rd.filter_map(|e| e.ok()) {
                let p = entry.path();
                let is_dir = p.is_dir();
                let file_name = match p.file_name().and_then(|n| n.to_str()) {
                    Some(n) => n.to_string(),
                    None => continue,
                };
                if beat_root.join(&file_name).exists() {
                    collisions.push(format!("{} (from {})", file_name, subdir_name));
                }
                planned_moves.push(LegacyMove {
                    from_subdir: subdir_name.to_string(),
                    file_name,
                    is_dir,
                });
            }
        }
    }

    // 03_PROJECTS → 01_SAVEFILES rename conflicts if both exist
    let savefiles_conflict = has_03_projects && has_01_savefiles;

    LegacyStructure {
        is_legacy,
        has_01_audio,
        has_02_visuals,
        has_03_projects,
        has_04_upload,
        has_01_savefiles,
        planned_moves,
        collisions,
        savefiles_conflict,
    }
}

