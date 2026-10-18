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

use crate::db::open_db;
use crate::utils::{is_audio_extension, is_flp};
use std::collections::HashMap;
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
    /// Von Hand, aus artist_songs: eine Notiz und „Warte auf Künstler".
    pub notiz: Option<String>,
    pub warten: bool,
    /// Dateinamen in Eingang/ — damit Downloads, die schon da sind, nicht
    /// noch einmal vorgeschlagen werden.
    pub eingang: Vec<String>,
    /// Audiodateien direkt im Song-Ordner (Mix, Master), neueste zuerst —
    /// zur Auswahl beim Abgeben.
    pub exporte: Vec<String>,
    /// Datum der Abgabe (JJJJ-MM-TT), aus artist_songs.
    pub abgegeben: Option<String>,
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
    let mut kuenstler = kuenstler_lesen(pfad);
    // Notiz, Warten, Abgabedatum dazulesen. Ohne Tabelle bleibt es leer.
    if let Ok(conn) = open_db() {
        if let Ok(mut stmt) = conn.prepare("SELECT path, notiz, warten, abgegeben FROM artist_songs") {
            let zeilen: HashMap<String, (Option<String>, bool, Option<String>)> = stmt
                .query_map([], |r| Ok((r.get::<_, String>(0)?, (r.get(1)?, r.get::<_, i64>(2)? != 0, r.get(3)?))))
                .map(|rows| rows.flatten().collect())
                .unwrap_or_default();
            for s in kuenstler.iter_mut().flat_map(|k| k.songs.iter_mut()) {
                if let Some((notiz, warten, abgegeben)) = zeilen.get(&s.path) {
                    s.notiz = notiz.clone();
                    s.warten = *warten;
                    s.abgegeben = abgegeben.clone();
                }
            }
        }
    }
    Ok(ArtistsScan { vorhanden: pfad.is_dir(), kuenstler })
}

/// Notiz und „Warte auf Künstler" für einen Song speichern.
#[tauri::command]
pub fn set_artist_song(path: String, notiz: Option<String>, warten: bool) -> Result<(), String> {
    let notiz = notiz.filter(|n| !n.trim().is_empty());
    let conn = open_db().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO artist_songs (path, notiz, warten) VALUES (?1, ?2, ?3)
         ON CONFLICT(path) DO UPDATE SET notiz = excluded.notiz, warten = excluded.warten",
        rusqlite::params![path, notiz, warten as i64],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

/// Neuer Künstler: nur ein Ordner. Gibt den Pfad zurück.
#[tauri::command]
pub fn create_artist(root: String, name: String) -> Result<String, String> {
    let name = crate::utils::sanitize_filename_part(name.trim());
    if name.is_empty() { return Err("Bitte einen Namen eingeben".into()); }
    let dir = Path::new(&root).join(&name);
    if dir.exists() { return Err(format!("„{name}\" gibt es schon")); }
    fs::create_dir_all(&dir).map_err(|e| format!("Ordner ließ sich nicht anlegen: {e}"))?;
    Ok(dir.to_string_lossy().to_string())
}

/// Neuer Song: wie ein Studio-Projekt (Ordner + Template-FLP), dazu `Eingang/`
/// für das, was der Künstler schickt. Gibt den Pfad der FLP zurück.
#[tauri::command]
pub fn create_artist_song(artist_path: String, name: String, template_flp: String) -> Result<String, String> {
    let flp = crate::commands::create_project_folder(artist_path, name, template_flp)?;
    if let Some(dir) = Path::new(&flp).parent() {
        let _ = fs::create_dir_all(dir.join(EINGANG));
    }
    Ok(flp)
}

// ─── Abgabe ──────────────────────────────────────────────────────────────────

/// Abgeben: Export umbenennen nach `<Künstler> - <Song> (Master|Mix).<ext>`,
/// Song nach `<Künstler>/_Fertig/` schieben, Datum merken. Gibt den neuen Pfad
/// der Datei zurück — das Frontend zeigt sie im Explorer, zum Verschicken.
#[tauri::command]
pub fn artist_abgeben(song_path: String, datei: String, art: String) -> Result<String, String> {
    let (neuer_song, abgabe) = abgeben_dateien(Path::new(&song_path), &datei, &art)?;
    pfad_umhaengen(&song_path, &neuer_song.to_string_lossy(), true);
    Ok(abgabe.to_string_lossy().to_string())
}

/// Zurück aus `_Fertig/` — wenn der Künstler nach der Abgabe noch etwas will.
#[tauri::command]
pub fn artist_wieder_oeffnen(song_path: String) -> Result<String, String> {
    let neu = wieder_oeffnen_dateien(Path::new(&song_path))?;
    pfad_umhaengen(&song_path, &neu.to_string_lossy(), false);
    Ok(neu.to_string_lossy().to_string())
}

/// Notiz und Status ziehen mit um. Die Dateien sind dann schon verschoben —
/// ein DB-Fehler kostet höchstens die Notiz, darum kein Abbruch.
fn pfad_umhaengen(alt: &str, neu: &str, abgegeben: bool) {
    let Ok(conn) = open_db() else { return };
    let _ = conn.execute("DELETE FROM artist_songs WHERE path = ?1", [neu]);
    let _ = conn.execute("INSERT OR IGNORE INTO artist_songs (path) VALUES (?1)", [alt]);
    let _ = conn.execute(
        "UPDATE artist_songs SET path = ?2, warten = 0,
            abgegeben = CASE WHEN ?3 THEN date('now', 'localtime') ELSE NULL END
         WHERE path = ?1",
        rusqlite::params![alt, neu, abgegeben],
    );
}

fn abgeben_dateien(song: &Path, datei: &str, art: &str) -> Result<(std::path::PathBuf, std::path::PathBuf), String> {
    if art != "Master" && art != "Mix" { return Err(format!("Unbekannte Art: {art}")); }
    let kuenstler_dir = song.parent().ok_or("Song-Ordner ohne Künstler")?;
    let kuenstler = kuenstler_dir.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    if kuenstler == FERTIG { return Err("Der Song ist schon abgegeben".into()); }
    let song_name = song.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();

    // Nur ein Dateiname direkt im Song-Ordner, kein Pfad.
    if datei.contains(['/', '\\']) { return Err("Ungültiger Dateiname".into()); }
    let quelle = song.join(datei);
    if !quelle.is_file() { return Err(format!("{datei} liegt nicht im Song-Ordner")); }
    let ext = quelle.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_else(|| "wav".into());
    let neuer_name = format!("{}.{ext}", crate::utils::sanitize_filename_part(&format!("{kuenstler} - {song_name} ({art})")));

    let fertig_dir = kuenstler_dir.join(FERTIG);
    let ziel_song = fertig_dir.join(&song_name);
    // Erst alles prüfen, dann anfassen.
    if ziel_song.exists() { return Err(format!("In _Fertig gibt es „{song_name}\" schon")); }
    let umbenannt = song.join(&neuer_name);
    if !neuer_name.eq_ignore_ascii_case(datei) && umbenannt.exists() {
        return Err(format!("„{neuer_name}\" gibt es im Song-Ordner schon"));
    }

    fs::rename(&quelle, &umbenannt).map_err(|e| format!("Umbenennen fehlgeschlagen: {e}"))?;
    fs::create_dir_all(&fertig_dir).map_err(|e| format!("_Fertig ließ sich nicht anlegen: {e}"))?;
    if let Err(e) = fs::rename(song, &ziel_song) {
        // Ordner offen in FL oder im Explorer: Umbenennung zurück, nichts halb lassen.
        let _ = fs::rename(&umbenannt, &quelle);
        return Err(format!("Song-Ordner ließ sich nicht verschieben (in FL oder im Explorer offen?): {e}"));
    }
    Ok((ziel_song.clone(), ziel_song.join(&neuer_name)))
}

fn wieder_oeffnen_dateien(song: &Path) -> Result<std::path::PathBuf, String> {
    let fertig_dir = song.parent().ok_or("Song-Ordner ohne Künstler")?;
    if fertig_dir.file_name().map(|n| n != FERTIG).unwrap_or(true) { return Err("Der Song ist nicht abgegeben".into()); }
    let ziel = fertig_dir.parent().ok_or("_Fertig ohne Künstler")?.join(song.file_name().ok_or("Kein Song-Name")?);
    if ziel.exists() { return Err(format!("{} gibt es schon", ziel.display())); }
    fs::rename(song, &ziel).map_err(|e| format!("Song-Ordner ließ sich nicht verschieben (in FL oder im Explorer offen?): {e}"))?;
    Ok(ziel)
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

// ─── Downloads in den Eingang ───────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct Download {
    pub name: String,
    pub path: String,
    pub geaendert: u64,
}

/// Audiodateien im Downloads-Ordner der letzten 30 Tage, neueste zuerst —
/// zum Auswählen beim Anlegen eines Songs. Welche zum Song passen, entscheidet
/// das Frontend am Namen („heartbreak highlights_vocals").
#[tauri::command(async)]
pub fn artist_downloads(app: tauri::AppHandle) -> Result<Vec<Download>, String> {
    use tauri::Manager;
    let dir = app.path().download_dir().map_err(|e| format!("Downloads-Ordner nicht gefunden: {e}"))?;
    let jetzt = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let mut out: Vec<Download> = dateien(&dir).into_iter()
        .filter(|(n, t)| ist_audio(n) && *t + 30 * 86_400 >= jetzt)
        .map(|(name, geaendert)| Download { path: dir.join(&name).to_string_lossy().to_string(), name, geaendert })
        .collect();
    out.sort_by(|a, b| b.geaendert.cmp(&a.geaendert));
    Ok(out)
}

/// Dateien in `<Song>/Eingang/` verschieben. Liegt dort schon eine gleichnamige
/// Datei, wird übersprungen statt überschrieben.
#[tauri::command(async)]
pub fn artist_eingang_fuellen(song_path: String, dateien: Vec<String>) -> Result<Vec<UmzugErgebnis>, String> {
    let eingang = Path::new(&song_path).join(EINGANG);
    fs::create_dir_all(&eingang).map_err(|e| format!("Eingang ließ sich nicht anlegen: {e}"))?;
    Ok(dateien.into_iter().map(|d| {
        let ergebnis = |ok: bool, meldung: String| UmzugErgebnis { pfad: d.clone(), ok, meldung };
        let quelle = Path::new(&d);
        let Some(name) = quelle.file_name() else { return ergebnis(false, "Kein Dateiname".into()) };
        let ziel = eingang.join(name);
        if ziel.exists() { return ergebnis(false, "liegt schon im Eingang — übersprungen".into()); }
        // rename klappt nur auf demselben Laufwerk; sonst kopieren, prüfen, löschen.
        let verschoben = fs::rename(quelle, &ziel).map_err(|e| e.to_string()).or_else(|_| {
            crate::utils::copy_and_verify(quelle, &ziel)?;
            fs::remove_file(quelle).map_err(|e| format!("kopiert, Original blieb liegen: {e}"))
        });
        match verschoben {
            Ok(()) => ergebnis(true, "→ Eingang".into()),
            Err(e) => ergebnis(false, e),
        }
    }).collect())
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
    s.eingang = eingang.iter().map(|(n, _)| n.clone()).collect();
    let mut exporte: Vec<&(String, u64)> = wurzel.iter().filter(|(n, _)| ist_audio(n)).collect();
    exporte.sort_by(|a, b| b.1.cmp(&a.1));
    s.exporte = exporte.into_iter().map(|(n, _)| n.clone()).collect();
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
    fn kuenstler_und_song_anlegen() {
        let root = std::env::temp_dir().join(format!("beatos_anlegen_{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let vorlage = root.join("vorlage.flp");
        fs::write(&vorlage, b"FLhd").unwrap();
        let r = root.to_string_lossy().to_string();

        let k = create_artist(r.clone(), " Yoghi ".into()).unwrap();
        assert!(create_artist(r.clone(), "Yoghi".into()).is_err(), "doppelt");
        assert!(create_artist(r, "  ".into()).is_err(), "leer");

        let flp = create_artist_song(k.clone(), "No Bleed".into(), vorlage.to_string_lossy().to_string()).unwrap();
        assert!(Path::new(&flp).ends_with("Yoghi/No Bleed/No Bleed.flp"));
        assert!(Path::new(&k).join("No Bleed/Eingang").is_dir());

        // Downloads in den Eingang: verschoben, Gleichnamiges übersprungen
        let dl = root.join("dl");
        datei(&dl.join("no bleed_vocals.wav"));
        datei(&dl.join("no bleed.mp3"));
        let song = Path::new(&k).join("No Bleed");
        datei(&song.join("Eingang/no bleed.mp3"));
        let erg = artist_eingang_fuellen(song.to_string_lossy().to_string(), vec![
            dl.join("no bleed_vocals.wav").to_string_lossy().to_string(),
            dl.join("no bleed.mp3").to_string_lossy().to_string(),
        ]).unwrap();
        assert!(erg[0].ok && !erg[1].ok);
        assert!(song.join("Eingang/no bleed_vocals.wav").is_file() && !dl.join("no bleed_vocals.wav").exists());
        assert!(dl.join("no bleed.mp3").is_file(), "nicht überschrieben, Original bleibt");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn abgeben_und_wieder_oeffnen() {
        let root = std::env::temp_dir().join(format!("beatos_abgabe_{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let song = root.join("JarnoGm/Mindestens 2K");
        datei(&song.join("Mindestens 2K.flp"));
        datei(&song.join("Mindestens 2K_master v3.wav"));
        datei(&root.join("JarnoGm/Finden/Finden.mp3"));

        assert!(abgeben_dateien(&song, "Mindestens 2K_master v3.wav", "Bounce").is_err(), "nur Master/Mix");
        assert!(abgeben_dateien(&song, "../Finden/Finden.mp3", "Mix").is_err(), "nur Dateien im Song-Ordner");

        let (neu, abgabe) = abgeben_dateien(&song, "Mindestens 2K_master v3.wav", "Master").unwrap();
        assert_eq!(neu, root.join("JarnoGm/_Fertig/Mindestens 2K"));
        assert_eq!(abgabe, neu.join("JarnoGm - Mindestens 2K (Master).wav"));
        assert!(abgabe.is_file() && neu.join("Mindestens 2K.flp").is_file() && !song.exists());
        assert!(abgeben_dateien(&neu, "JarnoGm - Mindestens 2K (Master).wav", "Master").is_err(), "schon abgegeben");

        // Scan sieht ihn als fertig
        let k = &kuenstler_lesen(&root)[0];
        assert!(k.songs.iter().any(|s| s.name == "Mindestens 2K" && s.fertig));

        let zurueck = wieder_oeffnen_dateien(&neu).unwrap();
        assert_eq!(zurueck, song);
        assert!(song.join("JarnoGm - Mindestens 2K (Master).wav").is_file());
        assert!(wieder_oeffnen_dateien(&song).is_err(), "nicht in _Fertig");
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
