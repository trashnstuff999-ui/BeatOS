// src-tauri/src/commands/upload/rename.rs
// Filename-convention engine: plan + apply canonical names for beat assets.

use crate::db::open_db;
use crate::utils::{current_year_str, is_image_extension, sanitize_filename_part, unique_dest};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

// ═══════════════════════════════════════════════════════════════════════════════
// Convert filenames to convention
// ═══════════════════════════════════════════════════════════════════════════════
//
// Naming rules (Key first to match the folder-name convention):
//   MP3        → {TITLE_UPPER} [{KEY} {BPM}]_tagged.mp3
//   WAV        → {TITLE_UPPER} [{KEY} {BPM}]_untagged.wav
//   MP4        → {TYPE_BEAT_MAIN} Type Beat {YEAR} - {TITLE_UPPER} - {GENRE_TAGS}.mp4
//   Cover      → {TITLE_UPPER}_Cover_2000x2000.{ext}
//   Thumbnail  → {TITLE_UPPER}_Thumbnail_1920x1080.{ext}
//   FLP        → {TITLE_UPPER} [{KEY} {BPM}].flp   (plus _master / _old variants)
//
// Multi-file disambiguation: only the "primary" file of each kind is renamed.
// Audio/video → the newest (by modified date). FLPs → file containing "master"
// wins, else newest. Other files of the same kind are reported as `skipped`
// so the user knows they weren't touched.
//
// Aufräumen: ältere MP3s und WAVs bleiben nicht im Beat-Root liegen, sondern
// wandern nach 02_OLD/ (Originalname, bei Namensgleichheit _2, _3 …). Im Root
// sitzt damit genau eine MP3 und eine WAV — die neueste. Das läuft im selben
// Plan wie die Umbenennungen, also überall mit: Archivieren mit Auto-Rename,
// Upload-Dialog, Ordner-Abgleich und Auto-Sync nach dem Umbenennen.
//
// Safety: planning is read-only. The Apply step never overwrites — collisions
// are caught upfront and listed as `status = "collision"`.

/// Ablage für abgelöste Audio-Dateien, relativ zum Beat-Root.
const OLD_SUBDIR: &str = "02_OLD";

#[derive(Debug, Serialize)]
pub struct RenameOp {
    pub from:   String,
    /// Ziel, relativ zum Quellordner. Trägt beim Wegräumen einen Unterordner
    /// mit ("02_OLD/ALTE DATEI.mp3"), sonst nur den Dateinamen.
    pub to:     String,
    pub kind:   String,            // "mp3" | "wav" | "mp4" | "cover" | "thumbnail" | "flp" | "flp_master" | "flp_old"
    pub status: String,            // "rename" | "noop" | "collision"
    pub subdir: Option<String>,    // None for beat-root files, Some("01_SAVEFILES") for FLPs
}

#[derive(Debug, Serialize)]
pub struct SkippedFile {
    pub file:   String,
    pub kind:   String,
    pub reason: String,
}

#[derive(Debug, Serialize)]
pub struct RenamePlan {
    pub operations: Vec<RenameOp>,
    pub skipped:    Vec<SkippedFile>,
    /// True if any operation has status="rename" — i.e. there's actual work to do.
    pub has_work: bool,
}

#[derive(Debug, Serialize)]
pub struct RenameResult {
    pub renamed: usize,
    pub noops:   usize,
    pub errors:  Vec<String>,
}

#[tauri::command]
pub fn plan_filename_convention(beat_id: String) -> Result<RenamePlan, String> {
    let (beat_root, naming) = load_naming_context(&beat_id)?;
    Ok(build_rename_plan(&beat_root, &naming))
}

#[tauri::command]
pub fn apply_filename_convention(beat_id: String) -> Result<RenameResult, String> {
    let (beat_root, naming) = load_naming_context(&beat_id)?;
    let plan = build_rename_plan(&beat_root, &naming);

    let mut renamed = 0usize;
    let mut noops   = 0usize;
    let mut errors: Vec<String> = Vec::new();

    for op in &plan.operations {
        match op.status.as_str() {
            "noop" => { noops += 1; }
            "collision" => {
                errors.push(format!("Skipped {} → {}: target already exists", op.from, op.to));
            }
            "rename" => {
                let dir = match &op.subdir {
                    Some(s) => beat_root.join(s),
                    None    => beat_root.to_path_buf(),
                };
                let from_path = dir.join(&op.from);
                let to_path   = dir.join(&op.to);

                // Defensive re-check: another rename in this batch could
                // have just created our target. fs::rename on Windows
                // refuses to overwrite, so this is the last safety net.
                if to_path.exists() {
                    errors.push(format!("Skipped {} → {}: target now exists (race)", op.from, op.to));
                    continue;
                }
                // Wegräum-Ziele liegen in einem Unterordner, den es noch nicht
                // geben muss (02_OLD). Auf bestehenden Ordnern ein No-Op.
                if let Some(parent) = to_path.parent() {
                    if let Err(e) = fs::create_dir_all(parent) {
                        errors.push(format!("Failed {} → {}: {}", op.from, op.to, e));
                        continue;
                    }
                }
                match fs::rename(&from_path, &to_path) {
                    Ok(_) => renamed += 1,
                    Err(e) => errors.push(format!("Failed {} → {}: {}", op.from, op.to, e)),
                }
            }
            _ => {}
        }
    }

    Ok(RenameResult { renamed, noops, errors })
}

/// Ältere MP3/WAV aus dem Beat-Root nach `02_OLD/` wegräumen: die neueste MP3
/// und die neueste WAV bleiben liegen, alles Ältere zieht mit Originalnamen um
/// (bei Namensgleichheit _2, _3 …). Ohne DB und ohne Namenskonvention — damit
/// auch Flows ohne Auto-Rename aufräumen: Legacy-Migration und Archivieren mit
/// abgeschaltetem Auto-Rename. Gibt die Zahl der verschobenen Dateien zurück;
/// ein fehlgeschlagener Umzug lässt die Datei liegen und bricht nichts ab.
pub fn sweep_old_audio(beat_root: &Path) -> usize {
    let files = list_files(beat_root);
    let mut moved = 0usize;

    for ext in ["mp3", "wav"] {
        let matching: Vec<&(String, SystemTime)> = files.iter()
            .filter(|(n, _)| ext_lower(n) == ext)
            .collect();
        if matching.len() < 2 { continue; }

        let old_dir = beat_root.join(OLD_SUBDIR);
        if let Err(e) = fs::create_dir_all(&old_dir) {
            eprintln!("WARNING: {} konnte nicht angelegt werden: {}", OLD_SUBDIR, e);
            return moved;
        }

        let newest = matching.iter().max_by_key(|(_, t)| *t).copied().unwrap();
        for (n, _) in matching.iter().filter(|(n, _)| n != &newest.0) {
            let dest = unique_dest(&old_dir, n);
            match fs::rename(beat_root.join(n), &dest) {
                Ok(_)  => moved += 1,
                Err(e) => eprintln!("WARNING: {} -> {}/: {}", n, OLD_SUBDIR, e),
            }
        }
    }
    moved
}

// ─── Plan-builder internals ────────────────────────────────────────────────

#[derive(Debug)]
struct NamingContext {
    title_upper:    String,
    key_bpm:        String,          // " [Fm 140]" or "" if both missing
    mp4_basename:   Option<String>,  // None if no TYPE_BEAT_MAIN
}

fn load_naming_context(beat_id: &str) -> Result<(PathBuf, NamingContext), String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let (path, name, bpm, key, tbm, genre) = conn.query_row(
        "SELECT path, name, bpm, key, type_beat_main, genre_tags
         FROM beats WHERE id = ?1",
        rusqlite::params![beat_id],
        |row| {
            Ok((
                row.get::<_, Option<String>>(0)?.unwrap_or_default(),
                row.get::<_, String>(1)?,
                row.get::<_, Option<f64>>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
            ))
        },
    ).map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => format!("Beat {} not found", beat_id),
        _ => format!("DB lookup failed: {}", e),
    })?;

    let beat_root = PathBuf::from(&path);
    if !beat_root.is_dir() {
        return Err(format!("Beat folder does not exist: {}", path));
    }

    let title_upper = sanitize_filename_part(&name).to_uppercase();
    let key_bpm = match (key.as_deref().map(str::trim).filter(|s| !s.is_empty()), bpm) {
        (Some(k), Some(b)) => format!(" [{} {}]", k, b as i64),
        (Some(k), None)    => format!(" [{}]", k),
        (None, Some(b))    => format!(" [{}]", b as i64),
        (None, None)       => String::new(),
    };
    let mp4_basename = build_mp4_basename(
        &title_upper,
        tbm.as_deref().map(str::trim).filter(|s| !s.is_empty()),
        genre.as_deref().map(str::trim).filter(|s| !s.is_empty()),
        &current_year_str(),
    );

    Ok((beat_root, NamingContext {
        title_upper,
        key_bpm,
        mp4_basename,
    }))
}

fn build_mp4_basename(title_upper: &str, type_beat_main: Option<&str>, genre_tags: Option<&str>, year: &str) -> Option<String> {
    let tbm = type_beat_main?;  // No type-beat main = no MP4 rename
    let mut parts: Vec<String> = vec![
        sanitize_filename_part(&format!("{} Type Beat {}", tbm, year)),
        title_upper.to_string(),
    ];
    if let Some(g) = genre_tags {
        parts.push(sanitize_filename_part(g));
    }
    parts.retain(|s| !s.is_empty());
    Some(parts.join(" - "))
}


fn build_rename_plan(beat_root: &Path, nc: &NamingContext) -> RenamePlan {
    let mut ops: Vec<RenameOp> = Vec::new();
    let mut skipped: Vec<SkippedFile> = Vec::new();
    // Track the rename targets we've already planned so two operations
    // can't collide with each other (e.g. an MP3 already named correctly
    // shouldn't make us mark another MP3 rename as a collision).
    let mut planned_targets: std::collections::HashSet<(Option<String>, String)> = std::collections::HashSet::new();
    // Root-Dateien, die dieser Plan nach 02_OLD wegräumt. Ihr alter Platz gilt
    // damit als frei — sonst meldet der neue Primärname eine Kollision gegen
    // eine Datei, die zwei Zeilen vorher weggezogen wird.
    let mut vacating: std::collections::HashSet<String> = std::collections::HashSet::new();

    // ─── Root-level files ────────────────────────────────────────────────
    let root_files = list_files(beat_root);

    // Audio (mp3 / wav) — newest gets the canonical name, older ones move to 02_OLD.
    plan_single_kind(
        &root_files, "mp3", "mp3",
        format!("{}{}_tagged.mp3", nc.title_upper, nc.key_bpm),
        beat_root, None, Some(OLD_SUBDIR),
        &mut ops, &mut skipped, &mut planned_targets, &mut vacating,
    );
    plan_single_kind(
        &root_files, "wav", "wav",
        format!("{}{}_untagged.wav", nc.title_upper, nc.key_bpm),
        beat_root, None, Some(OLD_SUBDIR),
        &mut ops, &mut skipped, &mut planned_targets, &mut vacating,
    );

    // MP4 — needs MP4 basename (depends on TYPE_BEAT_MAIN)
    if let Some(basename) = &nc.mp4_basename {
        plan_single_kind(
            &root_files, "mp4", "mp4",
            format!("{}.mp4", basename),
            beat_root, None, None,
            &mut ops, &mut skipped, &mut planned_targets, &mut vacating,
        );
    } else {
        for (name, _) in root_files.iter().filter(|(n, _)| ext_lower(n) == "mp4") {
            skipped.push(SkippedFile {
                file: name.clone(),
                kind: "mp4".to_string(),
                reason: "Set Type-Beat Main first to generate an MP4 filename".to_string(),
            });
        }
    }

    // Cover & Thumbnail — image files matched by name
    plan_image(&root_files, "cover", "cover",
        |ext| format!("{}_Cover_2000x2000.{}", nc.title_upper, ext),
        beat_root, &mut ops, &mut skipped, &mut planned_targets, &vacating);
    plan_image(&root_files, "thumbnail", "thumbnail",
        |ext| format!("{}_Thumbnail_1920x1080.{}", nc.title_upper, ext),
        beat_root, &mut ops, &mut skipped, &mut planned_targets, &vacating);

    // ─── FLPs in 01_SAVEFILES/ (or 03_PROJECTS/ legacy) ─────────────────
    let (flp_dir_name, flp_files) = list_flps(beat_root);
    if !flp_files.is_empty() {
        plan_flps(&flp_files, nc, beat_root, flp_dir_name.as_deref(),
            &mut ops, &mut skipped, &mut planned_targets, &vacating);
    }

    let has_work = ops.iter().any(|o| o.status == "rename");
    RenamePlan { operations: ops, skipped, has_work }
}

/// List top-level files in a dir as (filename, modified_time).
/// Subdirectories are excluded — we never rename folders.
fn list_files(dir: &Path) -> Vec<(String, SystemTime)> {
    let mut out: Vec<(String, SystemTime)> = Vec::new();
    if let Ok(rd) = fs::read_dir(dir) {
        for entry in rd.filter_map(|e| e.ok()) {
            let p = entry.path();
            if !p.is_file() { continue; }
            let name = match p.file_name().and_then(|n| n.to_str()) {
                Some(n) => n.to_string(),
                None => continue,
            };
            let mtime = fs::metadata(&p)
                .and_then(|m| m.modified())
                .unwrap_or(UNIX_EPOCH);
            out.push((name, mtime));
        }
    }
    out
}

fn ext_lower(name: &str) -> String {
    Path::new(name).extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase()
}

/// Pick the newest file of `ext` in `files`, plan a rename to `target_name`.
/// Die älteren Dateien wandern nach `old_subdir`, wenn eines gesetzt ist —
/// sonst werden sie nur als `skipped` gemeldet und bleiben liegen.
fn plan_single_kind(
    files: &[(String, SystemTime)],
    ext: &str,
    kind: &str,
    target_name: String,
    beat_root: &Path,
    subdir: Option<&str>,
    old_subdir: Option<&str>,
    ops: &mut Vec<RenameOp>,
    skipped: &mut Vec<SkippedFile>,
    planned: &mut std::collections::HashSet<(Option<String>, String)>,
    vacating: &mut std::collections::HashSet<String>,
) {
    let matching: Vec<&(String, SystemTime)> = files.iter()
        .filter(|(n, _)| ext_lower(n) == ext)
        .collect();
    if matching.is_empty() { return; }

    // Pick newest
    let primary = matching.iter()
        .max_by_key(|(_, t)| *t)
        .copied()
        .unwrap();

    // Die Alten zuerst: erst wenn sie weg sind, ist der Primärname frei.
    for (n, _) in matching.iter().filter(|(n, _)| n != &primary.0) {
        let Some(old_dir) = old_subdir else {
            skipped.push(SkippedFile {
                file: n.clone(),
                kind: kind.to_string(),
                reason: format!("Multiple .{} files — only the newest is renamed", ext),
            });
            continue;
        };
        // Originalname behalten; ist er in 02_OLD schon belegt, hängt
        // unique_dest _2, _3 … an, statt etwas zu überschreiben.
        let dest = unique_dest(&beat_root.join(old_dir), n);
        let file = dest.file_name().and_then(|f| f.to_str()).unwrap_or(n.as_str());
        push_op(beat_root, subdir, n, &format!("{}/{}", old_dir, file), kind, ops, planned, vacating);
        if subdir.is_none() {
            vacating.insert(n.clone());
        }
    }

    push_op(beat_root, subdir, &primary.0, &target_name, kind, ops, planned, vacating);
}

fn plan_image(
    files: &[(String, SystemTime)],
    needle: &str,        // "cover" or "thumbnail"
    kind: &str,
    target: impl Fn(&str) -> String,  // (ext) -> target filename
    beat_root: &Path,
    ops: &mut Vec<RenameOp>,
    skipped: &mut Vec<SkippedFile>,
    planned: &mut std::collections::HashSet<(Option<String>, String)>,
    vacating: &std::collections::HashSet<String>,
) {
    // Image classification: name contains `needle` (case-insensitive),
    // extension in image set, NOT also containing the other needle.
    let other = if needle == "cover" { "thumbnail" } else { "cover" };
    let matching: Vec<&(String, SystemTime)> = files.iter()
        .filter(|(n, _)| {
            let lower = n.to_lowercase();
            let e = ext_lower(n);
            is_image_extension(&e) && lower.contains(needle) && !lower.contains(other)
        })
        .collect();
    if matching.is_empty() { return; }

    let primary = matching.iter().max_by_key(|(_, t)| *t).copied().unwrap();
    let ext = ext_lower(&primary.0);
    let target_name = target(&ext);
    push_op(beat_root, None, &primary.0, &target_name, kind, ops, planned, vacating);

    for (n, _) in matching.iter().filter(|(n, _)| n != &primary.0) {
        skipped.push(SkippedFile {
            file: n.clone(),
            kind: kind.to_string(),
            reason: format!("Multiple {} images — only the newest is renamed", needle),
        });
    }
}

/// Where do FLPs live for this beat? Returns (subdir_name, files).
///
/// Reihenfolge: `01_SAVEFILES/` (aktuell), `03_PROJECTS/` (alt), Beat-Root
/// (Altbestand und von Hand angelegte Ordner). Ohne den Root blieben dort
/// liegende FLPs unsichtbar — sie wurden weder umbenannt noch als
/// übersprungen gemeldet.
fn list_flps(beat_root: &Path) -> (Option<String>, Vec<(String, SystemTime)>) {
    let flps_in = |dir: &Path| -> Vec<(String, SystemTime)> {
        list_files(dir).into_iter()
            .filter(|(n, _)| ext_lower(n) == "flp")
            .collect()
    };

    for subdir_name in ["01_SAVEFILES", "03_PROJECTS"] {
        let dir = beat_root.join(subdir_name);
        if !dir.is_dir() { continue; }
        let files = flps_in(&dir);
        if !files.is_empty() {
            return (Some(subdir_name.to_string()), files);
        }
    }
    (None, flps_in(beat_root))
}

/// Plan FLP renames:
///   • Files containing "master" in name (case-insensitive) → _master suffix
///   • Newest remaining → primary name (no suffix)
///   • Others           → _old suffix (with _2, _3 etc. on collision)
fn plan_flps(
    flps: &[(String, SystemTime)],
    nc: &NamingContext,
    beat_root: &Path,
    subdir: Option<&str>,
    ops: &mut Vec<RenameOp>,
    skipped: &mut Vec<SkippedFile>,
    planned: &mut std::collections::HashSet<(Option<String>, String)>,
    vacating: &std::collections::HashSet<String>,
) {
    let base = format!("{}{}", nc.title_upper, nc.key_bpm);

    let (masters, rest): (Vec<&(String, SystemTime)>, Vec<&(String, SystemTime)>) =
        flps.iter().partition(|(n, _)| n.to_lowercase().contains("master"));

    // Masters → _master[_N].flp
    let mut master_idx = 0;
    for (name, _) in masters {
        let suffix = if master_idx == 0 { String::new() } else { format!("_{}", master_idx + 1) };
        let target = format!("{}_master{}.flp", base, suffix);
        push_op(beat_root, subdir, name, &target, "flp_master", ops, planned, vacating);
        master_idx += 1;
    }

    // Newest non-master → primary, others → _old[_N].flp
    if !rest.is_empty() {
        let mut sorted = rest.clone();
        sorted.sort_by_key(|(_, t)| std::cmp::Reverse(*t));
        let primary_name = &sorted[0].0;
        let primary_target = format!("{}.flp", base);
        push_op(beat_root, subdir, primary_name, &primary_target, "flp", ops, planned, vacating);

        for (i, (name, _)) in sorted.iter().enumerate().skip(1) {
            let suffix = if i == 1 { String::new() } else { format!("_{}", i) };
            let target = format!("{}_old{}.flp", base, suffix);
            push_op(beat_root, subdir, name, &target, "flp_old", ops, planned, vacating);
        }
    }
    let _ = skipped; // FLPs don't get skipped — _old absorbs all secondaries.
}

/// Build a RenameOp and decide its status.
fn push_op(
    beat_root: &Path,
    subdir: Option<&str>,
    from: &str,
    to: &str,
    kind: &str,
    ops: &mut Vec<RenameOp>,
    planned: &mut std::collections::HashSet<(Option<String>, String)>,
    vacating: &std::collections::HashSet<String>,
) {
    let dir = match subdir {
        Some(s) => beat_root.join(s),
        None    => beat_root.to_path_buf(),
    };
    let to_path = dir.join(to);

    // `to` kann einen Zielordner tragen ("02_OLD/x.mp3"). Nur ein Ziel direkt
    // im Beat-Root kann von einer Datei belegt sein, die dieser Plan vorher
    // nach 02_OLD wegräumt — dann ist der Platz frei, keine Kollision.
    let frees_up = subdir.is_none() && !to.contains('/') && vacating.contains(to);

    let status = if from == to {
        "noop"
    } else if (to_path.exists() && !frees_up)
        || planned.contains(&(subdir.map(String::from), to.to_string()))
    {
        "collision"
    } else {
        "rename"
    };

    if status == "rename" {
        planned.insert((subdir.map(String::from), to.to_string()));
    }

    ops.push(RenameOp {
        from: from.to_string(),
        to: to.to_string(),
        kind: kind.to_string(),
        status: status.to_string(),
        subdir: subdir.map(String::from),
    });
}


// ═══════════════════════════════════════════════════════════════════════════════
// Folder sync — Ordnername, Dateinamen und beats.path auf die DB-Werte ziehen
// ═══════════════════════════════════════════════════════════════════════════════
//
// Der Ordnername ist die zweite Hälfte der Namenskonvention: die Dateien im
// Ordner erledigt die Engine oben, den Ordner selbst (und damit `beats.path`,
// aus dem Audio, Cover, Upload und Delete ihre Pfade bauen) erledigt das hier.
// Ohne diesen Schritt heißt ein Beat in der App anders als auf der Platte.

#[derive(Debug, Serialize)]
pub struct FolderSync {
    pub beat_id:       String,
    pub from:          String,          // alter Ordnername
    pub to:            String,          // Zielname nach Konvention
    pub files_renamed: usize,
    pub error:         Option<String>,
}

/// Ordner + Dateien + beats.path auf die aktuellen DB-Werte ziehen.
/// `dry_run` plant nur: es wird nichts angefasst, nur from/to gemeldet.
pub fn sync_beat_folder(beat_id: &str, dry_run: bool) -> Result<FolderSync, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let (path, name, bpm, key) = conn.query_row(
        "SELECT path, name, bpm, key FROM beats WHERE id = ?1",
        rusqlite::params![beat_id],
        |r| Ok((
            r.get::<_, Option<String>>(0)?.unwrap_or_default(),
            r.get::<_, String>(1)?,
            r.get::<_, Option<f64>>(2)?,
            r.get::<_, Option<String>>(3)?,
        )),
    ).map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => format!("Beat {} nicht gefunden", beat_id),
        _ => format!("DB-Abfrage fehlgeschlagen: {}", e),
    })?;

    let dir = PathBuf::from(&path);
    if !dir.is_dir() {
        return Err(format!("Beat-Ordner fehlt: {}", path));
    }
    let old_folder = dir.file_name()
        .and_then(|n| n.to_str())
        .ok_or("Ungültiger Ordnername")?
        .to_string();

    // Gleiche Regel wie beim Archivieren — eine Quelle der Wahrheit.
    // Nicht-numerische IDs passen nicht ins Schema: Ordner in Ruhe lassen,
    // nur die Dateien angleichen.
    let target = match beat_id.trim().parse::<i32>() {
        Ok(n) => crate::commands::build_archive_folder_name(
            n, &name, key.as_deref().map(str::trim).filter(|s| !s.is_empty()), bpm.map(|b| b as i32)),
        Err(_) => old_folder.clone(),
    };

    let mut out = FolderSync {
        beat_id:       beat_id.to_string(),
        from:          old_folder.clone(),
        to:            target.clone(),
        files_renamed: 0,
        error:         None,
    };
    if dry_run {
        // Dateien nur zählen, nichts anfassen — sonst meldet die Vorschau
        // "nichts zu tun", wenn zwar der Ordner passt, die Dateien aber nicht.
        let plan = plan_filename_convention(beat_id.to_string())?;
        out.files_renamed = plan.operations.iter().filter(|o| o.status == "rename").count();
        return Ok(out);
    }

    if target != old_folder {
        let new_dir = rename_beat_dir(&dir, &target)?;
        if let Err(e) = conn.execute(
            "UPDATE beats SET path = ?1 WHERE id = ?2",
            rusqlite::params![new_dir.to_string_lossy().to_string(), beat_id],
        ) {
            // DB-Pfad nicht geschrieben → Ordner zurück, sonst findet die App
            // den Beat nicht mehr.
            let _ = fs::rename(&new_dir, &dir);
            return Err(format!("DB-Pfad nicht aktualisiert: {}", e));
        }
    }

    // Dateien: bestehende Engine, liest den jetzt aktuellen Pfad aus der DB.
    let r = apply_filename_convention(beat_id.to_string())?;
    out.files_renamed = r.renamed;
    if !r.errors.is_empty() {
        out.error = Some(r.errors.join("; "));
    }
    Ok(out)
}

/// Der Dateisystem-Teil (ohne DB, damit testbar): Ordner auf `target`
/// umbenennen. Nie überschreiben, gleicher Name = nichts zu tun.
fn rename_beat_dir(dir: &Path, target: &str) -> Result<PathBuf, String> {
    if target.trim().is_empty() {
        return Err("Zielname ist leer".to_string());
    }
    let old = dir.file_name().and_then(|n| n.to_str()).unwrap_or_default();
    if old == target {
        return Ok(dir.to_path_buf());
    }
    let new_dir = dir.parent().ok_or("Beat-Ordner hat keinen Elternordner")?.join(target);
    if new_dir.exists() {
        return Err(format!("„{}“ gibt es in diesem Ordner schon", target));
    }
    fs::rename(dir, &new_dir)
        .map_err(|e| format!("Ordner konnte nicht umbenannt werden: {}", e))?;
    Ok(new_dir)
}

/// Ein Command für alles: leere Liste = alle Beats, `dry_run` = nur Vorschau.
/// Ein kaputter Beat stoppt den Lauf nicht — sein Fehler landet in seiner Zeile.
#[tauri::command]
pub fn sync_beat_folders(beat_ids: Vec<String>, dry_run: bool) -> Result<Vec<FolderSync>, String> {
    let ids = if beat_ids.is_empty() {
        let conn = open_db().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare("SELECT id FROM beats ORDER BY id")
            .map_err(|e| e.to_string())?;
        let ids: Vec<String> = stmt.query_map([], |r| r.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        ids
    } else {
        beat_ids
    };

    Ok(ids.into_iter().map(|id| {
        sync_beat_folder(&id, dry_run).unwrap_or_else(|e| FolderSync {
            beat_id:       id,
            from:          String::new(),
            to:            String::new(),
            files_renamed: 0,
            error:         Some(e),
        })
    }).collect())
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;
    use std::time::{Duration, UNIX_EPOCH};

    /// Datei mit fester Änderungszeit — die Engine wählt nach mtime aus,
    /// also darf der Test sich nicht auf die Anlege-Reihenfolge verlassen.
    fn write_at(path: &Path, secs: u64) {
        fs::write(path, b"x").unwrap();
        fs::File::options().write(true).open(path).unwrap()
            .set_modified(UNIX_EPOCH + Duration::from_secs(secs)).unwrap();
    }

    fn pieces_context() -> super::NamingContext {
        super::NamingContext {
            title_upper:  "PIECES".to_string(),
            key_bpm:      " [Bm 135]".to_string(),
            mp4_basename: None,
        }
    }

    /// Altbestand: FLP liegt direkt im Beat-Root, nicht in 01_SAVEFILES.
    #[test]
    fn flp_im_beat_root_wird_mitgenommen() {
        let tmp = std::env::temp_dir().join(format!("beatos_rootflp_{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();

        write_at(&tmp.join("pieces_v2.flp"), 2_000_000);
        write_at(&tmp.join("pieces_v1.flp"), 1_000_000);

        let plan = super::build_rename_plan(&tmp, &pieces_context());
        let op = |from: &str| plan.operations.iter().find(|o| o.from == from).expect(from);

        assert_eq!(op("pieces_v2.flp").to, "PIECES [Bm 135].flp");
        assert_eq!(op("pieces_v1.flp").to, "PIECES [Bm 135]_old.flp");
        // Root heisst: kein Unterordner im Ziel
        assert!(op("pieces_v2.flp").subdir.is_none());

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn old_audio_moves_to_02_old_and_frees_the_name() {
        let tmp = std::env::temp_dir().join(format!("beatos_oldaudio_{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();

        let canonical = "PIECES [Bm 135]_tagged.mp3";
        write_at(&tmp.join(canonical), 1_000_000);          // aeltere MP3
        write_at(&tmp.join("export_final.mp3"), 2_000_000); // neueste MP3
        write_at(&tmp.join("mix.wav"), 1_500_000);          // einzige WAV

        let plan = super::build_rename_plan(&tmp, &pieces_context());
        let op = |from: &str| plan.operations.iter().find(|o| o.from == from).expect(from);

        // Die aeltere MP3 raeumt den Root — mit ihrem Originalnamen.
        assert_eq!(op(canonical).to, format!("02_OLD/{}", canonical));
        assert_eq!(op(canonical).status, "rename");

        // Die neueste erbt den Namen: keine Kollision, obwohl die Datei
        // beim Planen noch da ist.
        assert_eq!(op("export_final.mp3").to, canonical);
        assert_eq!(op("export_final.mp3").status, "rename");

        // Einzelne WAV bleibt im Root.
        assert_eq!(op("mix.wav").to, "PIECES [Bm 135]_untagged.wav");
        assert!(!op("mix.wav").to.contains('/'));

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn second_old_file_gets_numbered_instead_of_overwriting() {
        let tmp = std::env::temp_dir().join(format!("beatos_oldaudio2_{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(tmp.join("02_OLD")).unwrap();

        let canonical = "PIECES [Bm 135]_tagged.mp3";
        write_at(&tmp.join("02_OLD").join(canonical), 900_000);  // Rest vom letzten Lauf
        write_at(&tmp.join(canonical), 1_000_000);
        write_at(&tmp.join("neu.mp3"), 2_000_000);

        let plan = super::build_rename_plan(&tmp, &pieces_context());
        let op = |from: &str| plan.operations.iter().find(|o| o.from == from).expect(from);

        assert_eq!(op(canonical).to, "02_OLD/PIECES [Bm 135]_tagged_2.mp3");
        assert_eq!(op(canonical).status, "rename");
        assert_eq!(op("neu.mp3").status, "rename");

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn sweep_moves_all_but_the_newest_per_extension() {
        let tmp = std::env::temp_dir().join(format!("beatos_sweep_{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();

        write_at(&tmp.join("aelter.mp3"), 500_000);
        write_at(&tmp.join("alt.mp3"), 1_000_000);
        write_at(&tmp.join("neu.mp3"), 2_000_000);
        write_at(&tmp.join("mix.wav"), 1_500_000);    // einzige WAV bleibt liegen
        write_at(&tmp.join("cover.png"), 3_000_000);  // nicht-Audio wird nicht angefasst

        assert_eq!(super::sweep_old_audio(&tmp), 2);
        assert!(tmp.join("neu.mp3").is_file());
        assert!(tmp.join("mix.wav").is_file());
        assert!(tmp.join("cover.png").is_file());
        assert!(tmp.join("02_OLD").join("alt.mp3").is_file());
        assert!(tmp.join("02_OLD").join("aelter.mp3").is_file());
        assert!(!tmp.join("alt.mp3").exists());

        // Zweiter Lauf: nur noch je eine MP3/WAV im Root, nichts zu tun.
        assert_eq!(super::sweep_old_audio(&tmp), 0);

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn renames_folder_never_overwrites() {
        let tmp = std::env::temp_dir().join(format!("beatos_foldersync_{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        let old = tmp.join("0870 - OLD [Bm 135]");
        fs::create_dir_all(&old).unwrap();
        fs::write(old.join("OLD [Bm 135]_tagged.mp3"), b"x").unwrap();

        // Umbenennen zieht den Inhalt mit.
        let new = super::rename_beat_dir(&old, "0870 - PIECES [Bm 135]").unwrap();
        assert!(new.join("OLD [Bm 135]_tagged.mp3").is_file());
        assert!(!old.exists());

        // Gleicher Name = No-Op, belegter Name = Fehler statt Überschreiben.
        assert_eq!(super::rename_beat_dir(&new, "0870 - PIECES [Bm 135]").unwrap(), new);
        fs::create_dir_all(tmp.join("0871 - ANDERER")).unwrap();
        assert!(super::rename_beat_dir(&new, "0871 - ANDERER").is_err());
        assert!(new.exists());

        let _ = fs::remove_dir_all(&tmp);
    }
}
