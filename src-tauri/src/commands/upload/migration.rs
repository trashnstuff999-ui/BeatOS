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

/// Die zweite Ebene des Altbestands. Unter `01_AUDIO` liegen die Exporte nicht
/// direkt, sondern in genau diesen drei Ordnern — im Archiv gemessen: TAGGED
/// 144×, UNTAGGED 144×, UNMASTERED 143×, andere Namen kommen nicht vor, und
/// unter `02_VISUALS`/`04_UPLOAD` gibt es ueberhaupt keine Unterordner.
///
/// Sie werden AUFGELOEST: ihre Dateien wandern in den Root, die leere Huelle
/// faellt weg. Wuerde man sie wie jeden anderen Ordner als Ganzes hochziehen,
/// laege die MP3 danach in `{beat}/TAGGED/` — also weiterhin nicht dort, wo
/// `get_beat_audio_path` und `build_rename_plan` suchen. Genau daran scheiterten
/// 132 der 174 Alt-Ordner.
///
/// Jeder andere Unterordner (z.B. `Backup/`) wandert unveraendert als Ordner
/// mit. Geraten wird nichts.
const LEGACY_AUDIO_SUBDIRS: [&str; 3] = ["TAGGED", "UNTAGGED", "UNMASTERED"];

/// Eine geplante Bewegung nach `{beat}/`. Quelle absolut, damit Planen und
/// Ausfuehren dieselbe Liste benutzen und nicht auseinanderlaufen koennen.
struct PlannedMove {
    from:       PathBuf,
    /// Herkunft fuer die Anzeige — "01_AUDIO" oder "01_AUDIO/TAGGED".
    from_label: String,
    file_name:  String,
    is_dir:     bool,
}

/// Was beim Flachziehen bewegt wuerde. Liest nur, aendert nichts.
fn plan_moves(beat_root: &Path) -> Vec<PlannedMove> {
    let mut moves: Vec<PlannedMove> = Vec::new();

    for subdir_name in LEGACY_FLATTEN_DIRS {
        let subdir = beat_root.join(subdir_name);
        if !subdir.is_dir() { continue; }
        let Ok(rd) = fs::read_dir(&subdir) else { continue };

        for entry in rd.filter_map(|e| e.ok()) {
            let p = entry.path();
            let Some(name) = p.file_name().and_then(|n| n.to_str()).map(str::to_string) else { continue };
            let is_dir = p.is_dir();

            let bekannter_audio_ordner = is_dir
                && subdir_name == "01_AUDIO"
                && LEGACY_AUDIO_SUBDIRS.iter().any(|s| s.eq_ignore_ascii_case(&name));

            if bekannter_audio_ordner {
                let Ok(inner) = fs::read_dir(&p) else { continue };
                for f in inner.filter_map(|e| e.ok()) {
                    let fp = f.path();
                    // Tiefer als eine Ebene wird nicht gegraben. Steckt dort
                    // doch ein Ordner, bleibt er liegen — dann bleibt auch die
                    // Huelle stehen und ist danach sichtbar, statt still
                    // irgendwohin geschoben zu werden.
                    if fp.is_dir() { continue; }
                    let Some(fname) = fp.file_name().and_then(|n| n.to_str()).map(str::to_string) else { continue };
                    moves.push(PlannedMove {
                        from:       fp,
                        from_label: format!("{}/{}", subdir_name, name),
                        file_name:  fname,
                        is_dir:     false,
                    });
                }
                continue;
            }

            moves.push(PlannedMove {
                from:       p,
                from_label: subdir_name.to_string(),
                file_name:  name,
                is_dir,
            });
        }
    }
    moves
}

fn ist_leer(dir: &Path) -> bool {
    fs::read_dir(dir).map(|mut rd| rd.next().is_none()).unwrap_or(false)
}

/// Der Plattenteil des Flachziehens — ohne Datenbank, damit pruefbar.
/// Bewegt genau das, was `plan_moves` angekuendigt hat, und raeumt danach die
/// leeren Huellen ab: erst die innere Ebene (TAGGED …), dann die aeussere.
/// Gibt (bewegte Dateien, entfernte Ordner) zurueck.
fn flatten_on_disk(beat_root: &Path) -> Result<(usize, Vec<String>), String> {
    let mut moved = 0usize;

    for m in plan_moves(beat_root) {
        let to = beat_root.join(&m.file_name);
        if to.exists() {
            // Der Plan haette das gefunden — hier steht der Gurt, falls sich
            // zwischen Pruefen und Ausfuehren etwas geaendert hat.
            return Err(format!(
                "Abbruch mitten in der Migration: unerwartete Kollision bei „{}“. {} Datei(en) sind bereits verschoben.",
                m.file_name, moved
            ));
        }
        fs::rename(&m.from, &to).map_err(|e| {
            format!("{:?} → {:?} fehlgeschlagen: {} ({} Datei(en) bereits verschoben)", m.from, to, e, moved)
        })?;
        moved += 1;
    }

    let mut removed: Vec<String> = Vec::new();
    for subdir_name in LEGACY_FLATTEN_DIRS {
        let subdir = beat_root.join(subdir_name);
        if !subdir.is_dir() { continue; }

        for inner_name in LEGACY_AUDIO_SUBDIRS {
            let inner = subdir.join(inner_name);
            if inner.is_dir() && ist_leer(&inner) {
                let _ = fs::remove_dir(&inner);
            }
        }

        // Nur wenn wirklich nichts mehr drin steht. Bleibt etwas liegen,
        // bleibt der Ordner sichtbar stehen — das ist die ehrlichere Meldung
        // als ein stiller Verlust.
        if ist_leer(&subdir) && fs::remove_dir(&subdir).is_ok() {
            removed.push(subdir_name.to_string());
        }
    }

    Ok((moved, removed))
}

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

    let (moved, removed) = flatten_on_disk(&beat_root)?;

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

    // Zwei Arten von Kollision: der Name liegt schon im Root, ODER zwei
    // Quellen zielen auf denselben Namen (dieselbe Datei in TAGGED und
    // UNTAGGED). Die zweite gab es vorher nicht — sie entsteht erst dadurch,
    // dass jetzt mehrere Unterordner in denselben Root schuetten.
    let mut ziele: std::collections::HashSet<String> = std::collections::HashSet::new();

    for m in plan_moves(beat_root) {
        if beat_root.join(&m.file_name).exists() {
            collisions.push(format!("{} (aus {})", m.file_name, m.from_label));
        } else if !ziele.insert(m.file_name.clone()) {
            collisions.push(format!("{} (zweimal, zuletzt aus {})", m.file_name, m.from_label));
        }
        planned_moves.push(LegacyMove {
            from_subdir: m.from_label,
            file_name:   m.file_name,
            is_dir:      m.is_dir,
        });
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


// ═══════════════════════════════════════════════════════════════════════════════
// Stapellauf über viele Beats
// ═══════════════════════════════════════════════════════════════════════════════

/// Eine Zeile pro Beat. Im Trockenlauf steht in `files`, was bewegt WUERDE;
/// nach dem Lauf, was bewegt WURDE.
#[derive(Debug, Default, Serialize)]
pub struct StructureMigration {
    pub beat_id:            String,
    pub is_legacy:          bool,
    pub files:              usize,
    pub moved_to_old:       usize,
    pub removed_subfolders: Vec<String>,
    pub collisions:         Vec<String>,
    pub savefiles_conflict: bool,
    pub error:              Option<String>,
}

/// Ein Command für alles: leere Liste = alle Beats, `dry_run` = nur Vorschau.
/// Ein kaputter Beat stoppt den Lauf nicht — sein Fehler landet in seiner
/// Zeile. Dieselbe Bauform wie `sync_beat_folders`, damit der Archiv-Knopf
/// beide Läufe gleich behandeln kann.
#[tauri::command]
pub fn migrate_beat_structures(
    beat_ids: Vec<String>,
    dry_run: bool,
) -> Result<Vec<StructureMigration>, String> {
    let ids: Vec<String> = if beat_ids.is_empty() {
        let conn = open_db().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id FROM beats ORDER BY id")
            .map_err(|e| e.to_string())?;
        // Erst binden, dann zurückgeben: sonst lebt der Borrow auf `stmt`
        // noch, wenn der Block endet.
        let ids: Vec<String> = stmt
            .query_map([], |r| r.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        ids
    } else {
        beat_ids
    };

    Ok(ids.iter().map(|id| migrate_one(id, dry_run)).collect())
}

fn migrate_one(beat_id: &str, dry_run: bool) -> StructureMigration {
    let mut out = StructureMigration { beat_id: beat_id.to_string(), ..Default::default() };

    let root = match resolve_beat_root(beat_id) {
        Ok(r) => r,
        Err(e) => { out.error = Some(e); return out; }
    };

    let plan = scan_legacy(&root);
    out.is_legacy          = plan.is_legacy;
    out.files              = plan.planned_moves.len();
    out.collisions         = plan.collisions;
    out.savefiles_conflict = plan.savefiles_conflict;

    if dry_run || !out.is_legacy {
        return out;
    }
    // Ein Beat mit Kollision wird übersprungen, nicht halb umgebaut. Er
    // bleibt in der Liste stehen, damit man ihn von Hand ansehen kann.
    if !out.collisions.is_empty() || out.savefiles_conflict {
        out.error = Some(if out.savefiles_conflict {
            "übersprungen: 03_PROJECTS und 01_SAVEFILES gibt es beide".to_string()
        } else {
            format!("übersprungen: {} Namenskollision(en)", out.collisions.len())
        });
        out.files = 0;
        return out;
    }

    match migrate_legacy_beat_structure(beat_id.to_string()) {
        Ok(r) => {
            out.files              = r.moved_files;
            out.moved_to_old       = r.moved_to_old;
            out.removed_subfolders = r.removed_subfolders;
        }
        Err(e) => { out.error = Some(e); out.files = 0; }
    }
    out
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn tmpdir(name: &str) -> PathBuf {
        let p = std::env::temp_dir()
            .join(format!("beatos_migr_{}_{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }

    fn datei(pfad: &Path) {
        fs::create_dir_all(pfad.parent().unwrap()).unwrap();
        fs::write(pfad, b"x").unwrap();
    }

    /// Der Fall, an dem 132 von 174 Archivordnern haengen: die Exporte liegen
    /// in `01_AUDIO/TAGGED/`, also eine Ebene tiefer als das Flachziehen
    /// bisher gereicht hat.
    #[test]
    fn tagged_wird_aufgeloest_statt_hochgeschoben() {
        let root = tmpdir("tagged");
        datei(&root.join("01_AUDIO/TAGGED/[847] KEIN ENDE - Bm 162.mp3"));
        datei(&root.join("01_AUDIO/UNMASTERED/roh.wav"));
        fs::create_dir_all(root.join("01_AUDIO/UNTAGGED")).unwrap();
        datei(&root.join("03_PROJECTS/KEIN ENDE [Bm 162].flp"));

        let plan = scan_legacy(&root);
        assert!(plan.is_legacy);
        assert!(plan.collisions.is_empty(), "{:?}", plan.collisions);
        assert_eq!(plan.planned_moves.len(), 2, "leerer UNTAGGED-Ordner bewegt nichts");
        assert_eq!(plan.planned_moves[0].from_subdir, "01_AUDIO/TAGGED");
        assert!(!plan.planned_moves[0].is_dir, "die Datei zaehlt, nicht die Huelle");

        let (moved, removed) = flatten_on_disk(&root).unwrap();
        assert_eq!(moved, 2);
        assert!(root.join("[847] KEIN ENDE - Bm 162.mp3").is_file(), "MP3 liegt im Root");
        assert!(root.join("roh.wav").is_file());
        assert!(!root.join("01_AUDIO").exists(), "leere Huelle ist weg: {:?}", removed);
        assert!(root.join("03_PROJECTS").is_dir(), "das benennt der Aufrufer um");
    }

    /// Fremde Unterordner bleiben Ordner — nur die drei bekannten Namen
    /// werden aufgeloest.
    #[test]
    fn unbekannter_unterordner_wandert_als_ordner() {
        let root = tmpdir("fremd");
        datei(&root.join("01_AUDIO/Stems/kick.wav"));

        let plan = scan_legacy(&root);
        assert_eq!(plan.planned_moves.len(), 1);
        assert!(plan.planned_moves[0].is_dir);
        assert_eq!(plan.planned_moves[0].file_name, "Stems");

        flatten_on_disk(&root).unwrap();
        assert!(root.join("Stems/kick.wav").is_file(), "Inhalt bleibt beisammen");
    }

    /// Zwei Quellen, ein Zielname. Gab es vorher nicht — entsteht erst,
    /// seit mehrere Unterordner in denselben Root schuetten.
    #[test]
    fn gleicher_name_aus_zwei_ordnern_ist_eine_kollision() {
        let root = tmpdir("doppelt");
        datei(&root.join("01_AUDIO/TAGGED/beat.mp3"));
        datei(&root.join("01_AUDIO/UNTAGGED/beat.mp3"));

        let plan = scan_legacy(&root);
        assert_eq!(plan.collisions.len(), 1, "{:?}", plan.collisions);
        assert!(plan.collisions[0].contains("beat.mp3"));
    }

    #[test]
    fn name_liegt_schon_im_root() {
        let root = tmpdir("belegt");
        datei(&root.join("beat.mp3"));
        datei(&root.join("01_AUDIO/TAGGED/beat.mp3"));

        let plan = scan_legacy(&root);
        assert_eq!(plan.collisions.len(), 1, "{:?}", plan.collisions);
    }

    /// Steckt in TAGGED doch ein Ordner, wird nicht tiefer gegraben — und
    /// die Huelle bleibt sichtbar stehen, statt still zu verschwinden.
    #[test]
    fn tieferer_ordner_bleibt_liegen() {
        let root = tmpdir("tief");
        datei(&root.join("01_AUDIO/TAGGED/mix.mp3"));
        datei(&root.join("01_AUDIO/TAGGED/Alt/aelter.mp3"));

        let (moved, _) = flatten_on_disk(&root).unwrap();
        assert_eq!(moved, 1);
        assert!(root.join("mix.mp3").is_file());
        assert!(root.join("01_AUDIO/TAGGED/Alt/aelter.mp3").is_file(), "unangetastet");
        assert!(root.join("01_AUDIO").is_dir(), "bleibt stehen, weil noch etwas drin ist");
    }

    #[test]
    fn moderner_ordner_ist_kein_fall_fuer_die_migration() {
        let root = tmpdir("modern");
        datei(&root.join("BEAT [Am 140]_tagged.mp3"));
        datei(&root.join("01_SAVEFILES/BEAT [Am 140].flp"));

        let plan = scan_legacy(&root);
        assert!(!plan.is_legacy);
        assert!(plan.planned_moves.is_empty());
    }
}
