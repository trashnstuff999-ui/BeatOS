// src-tauri/src/commands/artists.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Künstler-Projekte (Mix & Master): 05_ARTISTS/<Künstler>/<Song>/
//
// Eigener Wurzelordner, bewusst nicht im Archiv (der Archiv-Scan liest dort
// Jahr/Monat/Beat) und nicht in der Produktion (der Studio-Scan sähe einen
// Künstlerordner als ein Projekt). Plan: docs/kuenstler-projekte.md.
//
// Was in einem Song-Ordner liegt, ergibt seinen Stand — gelesen wird nur,
// nichts geschrieben. Die Regeln richten sich nach den echten Ordnern
// (JarnoGm, Yoghi, Stand 18.10.2026): FLP im Song-Ordner, aufgenommene
// Vocals in Audio/ („…_VOCALS DRY.wav"), Export direkt daneben, Backup/ von FL.
// ═══════════════════════════════════════════════════════════════════════════════

use crate::utils::{is_audio_extension, is_flp};
use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize, PartialEq, Default)]
pub struct ArtistSong {
    pub name: String,
    pub path: String,
    /// Liegt in <Künstler>/_Fertig/ — abgegeben.
    pub fertig: bool,
    pub flp: bool,
    pub vocals: bool,
    pub demo: bool,
    pub beat: bool,
    pub mix: bool,
    pub master: bool,
    /// Jüngste Änderung im Song (Sekunden) — zum Sortieren.
    pub geaendert: u64,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct Artist {
    pub name: String,
    pub path: String,
    pub songs: Vec<ArtistSong>,
}

const FERTIG: &str = "_Fertig";
const EINGANG: &str = "Eingang";

/// Ordner, die kein Song sind: FLs Backup und eigene Unterordner mit „_".
fn kein_song(name: &str) -> bool {
    name.eq_ignore_ascii_case("backup") || name.starts_with('_')
}

/// Ergebnis des Scans. `vorhanden` unterscheidet „Ordner fehlt" (dann
/// anbieten, ihn anzulegen) von „Ordner leer".
#[derive(Debug, Serialize)]
pub struct ArtistsScan {
    pub vorhanden: bool,
    pub kuenstler: Vec<Artist>,
}

#[tauri::command(async)]
pub fn scan_artists(root: String) -> Result<ArtistsScan, String> {
    let pfad = Path::new(&root);
    Ok(ArtistsScan { vorhanden: pfad.is_dir(), kuenstler: kuenstler_lesen(pfad) })
}

fn kuenstler_lesen(root: &Path) -> Vec<Artist> {
    if !root.is_dir() { return Vec::new(); }
    let mut kuenstler: Vec<Artist> = unterordner(root).into_iter()
        .filter(|(n, _)| !kein_song(n))
        .map(|(name, pfad)| {
            let mut songs: Vec<ArtistSong> = unterordner(&pfad).into_iter()
                .filter(|(n, _)| !kein_song(n))
                .map(|(n, p)| song(&n, &p, false))
                .collect();
            songs.extend(unterordner(&pfad.join(FERTIG)).into_iter()
                .filter(|(n, _)| !kein_song(n))
                .map(|(n, p)| song(&n, &p, true)));
            songs.sort_by(|a, b| a.fertig.cmp(&b.fertig).then(b.geaendert.cmp(&a.geaendert)));
            Artist { name, path: pfad.to_string_lossy().to_string(), songs }
        })
        .collect();
    kuenstler.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    kuenstler
}

/// Den Wurzelordner anlegen (leerer Zustand: „05_ARTISTS anlegen").
#[tauri::command]
pub fn create_artists_root(root: String) -> Result<(), String> {
    fs::create_dir_all(&root).map_err(|e| format!("Ordner ließ sich nicht anlegen: {e}"))
}

// ─── Altbestand aus dem Archiv umziehen ─────────────────────────────────────

/// Ein Ordner im Archiv, der kein Jahresordner ist — früher wurden
/// Künstler-Projekte dort abgelegt („JarnoGm - Library", „Yoghi").
#[derive(Debug, Serialize, PartialEq)]
pub struct Altbestand {
    pub pfad: String,
    pub name: String,
    /// Vorschlag für den Künstlernamen: „ - Library" fällt weg.
    pub kuenstler: String,
    pub songs: usize,
}

#[tauri::command(async)]
pub fn artists_altbestand(archive_root: String) -> Result<Vec<Altbestand>, String> {
    let mut out: Vec<Altbestand> = unterordner(Path::new(&archive_root)).into_iter()
        // Jahresordner (2024, 2025 …) sind das echte Archiv.
        .filter(|(n, _)| !(n.len() == 4 && n.chars().all(|c| c.is_ascii_digit())))
        .map(|(name, pfad)| Altbestand {
            kuenstler: kuenstler_vorschlag(&name),
            songs: unterordner(&pfad).iter().filter(|(n, _)| !kein_song(n)).count(),
            pfad: pfad.to_string_lossy().to_string(),
            name,
        })
        .collect();
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}

fn kuenstler_vorschlag(name: &str) -> String {
    let n = name.trim();
    let ohne = n.strip_suffix("Library").map(|r| r.trim_end().trim_end_matches('-').trim_end()).unwrap_or(n);
    if ohne.is_empty() { n.to_string() } else { ohne.to_string() }
}

#[derive(Debug, serde::Deserialize)]
pub struct Umzug {
    pub pfad: String,
    pub kuenstler: String,
}

#[derive(Debug, Serialize)]
pub struct UmzugErgebnis {
    pub pfad: String,
    pub ok: bool,
    pub meldung: String,
}

/// Ganze Ordner nach <artists_root>/<Künstler> verschieben — mit allem
/// darin, nichts geht verloren. Gibt es das Ziel schon, wird übersprungen
/// statt zusammengeführt oder überschrieben. Verschoben wird nur, was
/// wirklich im Archiv-Ordner liegt.
#[tauri::command(async)]
pub fn artists_umziehen(archive_root: String, artists_root: String, umzuege: Vec<Umzug>) -> Result<Vec<UmzugErgebnis>, String> {
    fs::create_dir_all(&artists_root).map_err(|e| format!("Künstler-Ordner ließ sich nicht anlegen: {e}"))?;
    let archiv = fs::canonicalize(&archive_root).map_err(|e| format!("Archiv-Ordner nicht gefunden: {e}"))?;
    Ok(umzuege.into_iter().map(|u| {
        let ergebnis = |ok: bool, meldung: String| UmzugErgebnis { pfad: u.pfad.clone(), ok, meldung };
        let name = crate::utils::sanitize_filename_part(u.kuenstler.trim());
        if name.is_empty() { return ergebnis(false, "Kein Künstlername".into()); }
        let quelle = match fs::canonicalize(&u.pfad) {
            Ok(q) if q.parent() == Some(archiv.as_path()) && q.is_dir() => q,
            _ => return ergebnis(false, "Liegt nicht direkt im Archiv-Ordner".into()),
        };
        let ziel = Path::new(&artists_root).join(&name);
        if ziel.exists() {
            return ergebnis(false, format!("{} gibt es schon — übersprungen", ziel.display()));
        }
        match fs::rename(&quelle, &ziel) {
            Ok(()) => ergebnis(true, format!("→ {}", ziel.display())),
            Err(e) => ergebnis(false, format!("Verschieben fehlgeschlagen: {e}")),
        }
    }).collect())
}

fn unterordner(dir: &Path) -> Vec<(String, std::path::PathBuf)> {
    let Ok(rd) = fs::read_dir(dir) else { return Vec::new() };
    rd.filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .filter_map(|p| Some((p.file_name()?.to_string_lossy().to_string(), p)))
        .collect()
}

fn dateien(dir: &Path) -> Vec<(String, u64)> {
    let Ok(rd) = fs::read_dir(dir) else { return Vec::new() };
    rd.filter_map(|e| e.ok())
        .filter(|e| e.path().is_file())
        .map(|e| {
            let t = e.metadata().and_then(|m| m.modified()).ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs()).unwrap_or(0);
            (e.file_name().to_string_lossy().to_string(), t)
        })
        .collect()
}

fn ist_audio(name: &str) -> bool {
    Path::new(name).extension().map(|e| is_audio_extension(&e.to_string_lossy().to_lowercase())).unwrap_or(false)
}

/// Dateiname ohne Endung, klein, nur Buchstaben/Ziffern — zum Vergleich mit dem Songnamen.
fn vergleich(s: &str) -> String {
    let stamm = Path::new(s).file_stem().map(|x| x.to_string_lossy().to_string()).unwrap_or_default();
    stamm.to_lowercase().chars().filter(|c| c.is_alphanumeric()).collect()
}

pub(crate) fn song(name: &str, pfad: &Path, fertig: bool) -> ArtistSong {
    let wurzel = dateien(pfad);
    let eingang = dateien(&pfad.join(EINGANG));
    let audio_ordner = dateien(&pfad.join("Audio"));
    let song_name = vergleich(name);
    let hat_vocal = |n: &String| n.to_lowercase().contains("vocal");

    let mut s = ArtistSong {
        name: name.to_string(),
        path: pfad.to_string_lossy().to_string(),
        fertig,
        ..Default::default()
    };
    s.flp = wurzel.iter().any(|(n, _)| is_flp(Path::new(n)));
    s.vocals = wurzel.iter().chain(&eingang).chain(&audio_ordner).any(|(n, _)| ist_audio(n) && hat_vocal(n));
    s.master = wurzel.iter().any(|(n, _)| ist_audio(n) && n.to_lowercase().contains("master"));
    s.mix = wurzel.iter().any(|(n, _)| ist_audio(n) && !hat_vocal(n) && !n.to_lowercase().contains("master"));
    s.demo = eingang.iter().any(|(n, _)| ist_audio(n) && !hat_vocal(n) && vergleich(n) == song_name);
    s.beat = eingang.iter().any(|(n, _)| ist_audio(n) && !hat_vocal(n) && vergleich(n) != song_name);
    s.geaendert = wurzel.iter().chain(&eingang).chain(&audio_ordner).map(|(_, t)| *t).max().unwrap_or(0);
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    fn datei(p: &Path) {
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, b"x").unwrap();
    }

    #[test]
    fn liest_kuenstler_songs_und_ihren_stand() {
        let root = std::env::temp_dir().join(format!("beatos_artists_{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        // Wie Yoghi/No Bleed heute: FLP, Export, aufgenommene Vocals in Audio/
        datei(&root.join("Yoghi/No Bleed/No Bleed.flp"));
        datei(&root.join("Yoghi/No Bleed/No Bleed.mp3"));
        datei(&root.join("Yoghi/No Bleed/Audio/No Bleed_2026-08-25_VOCALS DRY.wav"));
        datei(&root.join("Yoghi/No Bleed/Backup/No Bleed (autosaved).flp"));
        // Neues Layout: Eingang mit Vocals, Demo, Beat; Master daneben
        datei(&root.join("JarnoGm/Heartbreak Highlights/Heartbreak Highlights.flp"));
        datei(&root.join("JarnoGm/Heartbreak Highlights/Eingang/Heartbreak Highlights Vocals.wav"));
        datei(&root.join("JarnoGm/Heartbreak Highlights/Eingang/Heartbreak Highlights.mp3"));
        datei(&root.join("JarnoGm/Heartbreak Highlights/Eingang/LEFT ALONE [F#m 135].wav"));
        datei(&root.join("JarnoGm/Heartbreak Highlights/Heartbreak Highlights - Master.wav"));
        // Abgegeben
        datei(&root.join("JarnoGm/_Fertig/Alt/Alt.flp"));
        // Kein Künstler
        datei(&root.join("Backup/x.flp"));

        let scan = scan_artists(root.to_string_lossy().to_string()).unwrap();
        assert!(scan.vorhanden);
        let k = scan.kuenstler;
        assert_eq!(k.iter().map(|a| a.name.as_str()).collect::<Vec<_>>(), vec!["JarnoGm", "Yoghi"]);

        let nb = &k[1].songs[0];
        assert!(nb.flp && nb.vocals && nb.mix && !nb.master && !nb.demo && !nb.beat && !nb.fertig);

        let hh = k[0].songs.iter().find(|s| s.name == "Heartbreak Highlights").unwrap();
        assert!(hh.flp && hh.vocals && hh.demo && hh.beat && hh.master && !hh.mix);

        let alt = k[0].songs.iter().find(|s| s.name == "Alt").unwrap();
        assert!(alt.fertig && alt.flp);
        assert_eq!(k[0].songs.last().unwrap().name, "Alt", "Fertiges steht unten");

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn fehlender_ordner_ist_leer() {
        let scan = scan_artists("C:/gibt/es/nicht".into()).unwrap();
        assert!(!scan.vorhanden && scan.kuenstler.is_empty());
    }

    #[test]
    fn altbestand_erkennen_und_umziehen() {
        let basis = std::env::temp_dir().join(format!("beatos_umzug_{}", std::process::id()));
        let _ = fs::remove_dir_all(&basis);
        let archiv = basis.join("03_ARCHIVE");
        let artists = basis.join("05_ARTISTS");
        datei(&archiv.join("2026/10_OCTOBER/Beat/x.mp3"));
        datei(&archiv.join("JarnoGm - Library/Finden/Finden.flp"));
        datei(&archiv.join("JarnoGm - Library/Backup/teufelskraut.flp"));
        datei(&archiv.join("Yoghi/No Bleed/No Bleed.flp"));
        datei(&artists.join("Yoghi/schon da.txt"));

        let alt = artists_altbestand(archiv.to_string_lossy().to_string()).unwrap();
        assert_eq!(alt.iter().map(|a| (a.name.as_str(), a.kuenstler.as_str(), a.songs)).collect::<Vec<_>>(),
            vec![("JarnoGm - Library", "JarnoGm", 1), ("Yoghi", "Yoghi", 1)], "Jahresordner zählen nicht");

        let erg = artists_umziehen(
            archiv.to_string_lossy().to_string(),
            artists.to_string_lossy().to_string(),
            alt.iter().map(|a| Umzug { pfad: a.pfad.clone(), kuenstler: a.kuenstler.clone() }).collect(),
        ).unwrap();
        assert!(erg[0].ok, "JarnoGm zieht um");
        assert!(!erg[1].ok, "Yoghi gibt es schon — übersprungen");
        // Alles kam mit, auch die losen Backups; nichts wurde überschrieben
        assert!(artists.join("JarnoGm/Finden/Finden.flp").is_file());
        assert!(artists.join("JarnoGm/Backup/teufelskraut.flp").is_file());
        assert!(!archiv.join("JarnoGm - Library").exists());
        assert!(archiv.join("Yoghi/No Bleed/No Bleed.flp").is_file());
        assert!(artists.join("Yoghi/schon da.txt").is_file());

        // Außerhalb des Archivs wird nichts angefasst
        let fremd = artists_umziehen(
            archiv.to_string_lossy().to_string(), artists.to_string_lossy().to_string(),
            vec![Umzug { pfad: basis.to_string_lossy().to_string(), kuenstler: "X".into() }],
        ).unwrap();
        assert!(!fremd[0].ok);
        let _ = fs::remove_dir_all(&basis);
    }
}
