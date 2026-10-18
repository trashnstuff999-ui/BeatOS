// src-tauri/src/commands/artists.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Künstler-Projekte (Mix & Master): 05_ARTISTS/<Künstler>/<Song>/
//
// Eigener Wurzelordner, bewusst nicht im Archiv (der Archiv-Scan liest dort
// Jahr/Monat/Beat) und nicht in der Produktion (der Studio-Scan sähe einen
// Künstlerordner als ein Projekt). Plan: docs/kuenstler-projekte.md.
//
// Ein Song-Ordner wie im Archiv (Stephans Wahl, 18.10.2026):
//   01_SAVEFILES/  FLP — FL legt Audio/ (Aufnahmen) und Backup/ daneben
//   02_ASSETS/     was der Künstler schickt: Vocals, Demo, Beat
//   03_VERSIONS/   Mixe, Master, Abgaben
// Ältere Songs haben FLP und Exporte lose im Song-Ordner; der Scan liest
// beides, „Ordner aufräumen" bringt sie ins Schema.
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
    /// Dateinamen im Song-Ordner, in Assets/ und Audio/ — damit Downloads,
    /// die schon da sind, nicht noch einmal vorgeschlagen werden.
    pub dateien: Vec<String>,
    /// Audio-Pfade aus den FLPs, die es gibt — zeigt eine davon in die
    /// Downloads, gehört der Download zu diesem Song, egal wie er heißt.
    pub verweise: Vec<String>,
    /// Fehlende Verweise, deren Datei BeatOS gefunden hat (Pfade reparieren).
    pub reparierbar: usize,
    /// Fehlende Verweise ohne Fundort.
    pub fehlend: Vec<String>,
    /// Audiodateien direkt im Song-Ordner (Mix, Master), neueste zuerst —
    /// zur Auswahl beim Abgeben.
    pub exporte: Vec<String>,
    /// Datum der Abgabe (JJJJ-MM-TT), aus artist_songs.
    pub abgegeben: Option<String>,
    /// So viele Dinge liegen noch außerhalb von 01_/02_/03_ — „Ordner aufräumen".
    pub umbau: usize,
    /// Alle Audiodateien mit Rolle, neueste zuerst — Reinhören und Verlauf.
    pub audio: Vec<AudioDatei>,
    /// Die FLPs des Songs (01_SAVEFILES oder lose), neueste zuerst — zum
    /// Öffnen in FL, mit Auswahl der Version.
    pub flps: Vec<FlpVersion>,
    /// „Mein Beat": der verknüpfte Katalog-Beat (von Hand, artist_songs).
    pub beat_id: Option<String>,
    /// Ein Katalog-Beat, dessen Dateien die FLP schon verwendet — Vorschlag
    /// zum Verknüpfen (Heartbreak Highlights nutzt die WAV von SWEET DREAMS).
    pub beat_vorschlag: Option<String>,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct FlpVersion {
    pub name: String,
    pub path: String,
    pub geaendert: u64,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct Artist {
    pub name: String,
    pub path: String,
    /// Profilbild `_profil_<zeit>.<ext>` im Künstler-Ordner.
    pub bild: Option<String>,
    /// Plattform → Link (spotify, soundcloud, youtube, instagram, discord),
    /// aus `_kuenstler.json` im Künstler-Ordner.
    pub links: std::collections::BTreeMap<String, String>,
    pub songs: Vec<ArtistSong>,
}

const FERTIG: &str = "_Fertig";
const SAVES: &str = "01_SAVEFILES";
const ASSETS: &str = "02_ASSETS";
const VERSIONS: &str = "03_VERSIONS";

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
    // Notiz, Warten, Abgabedatum, Beat dazulesen. Ohne Tabelle bleibt es leer.
    if let Ok(conn) = open_db() {
        if let Ok(mut stmt) = conn.prepare("SELECT path, notiz, warten, abgegeben, beat_id FROM artist_songs") {
            type Zeile = (Option<String>, bool, Option<String>, Option<String>);
            let zeilen: HashMap<String, Zeile> = stmt
                .query_map([], |r| Ok((r.get::<_, String>(0)?, (r.get(1)?, r.get::<_, i64>(2)? != 0, r.get(3)?, r.get(4)?))))
                .map(|rows| rows.flatten().collect())
                .unwrap_or_default();
            for s in kuenstler.iter_mut().flat_map(|k| k.songs.iter_mut()) {
                if let Some((notiz, warten, abgegeben, beat_id)) = zeilen.get(&s.path) {
                    s.notiz = notiz.clone();
                    s.warten = *warten;
                    s.abgegeben = abgegeben.clone();
                    s.beat_id = beat_id.clone();
                }
            }
        }
        // Verwendet die FLP Dateien aus einem Beat-Ordner des Katalogs?
        if let Ok(mut stmt) = conn.prepare("SELECT id, path FROM beats WHERE path IS NOT NULL AND path != ''") {
            let beats: Vec<(String, String)> = stmt
                .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
                .map(|rows| rows.flatten().collect())
                .unwrap_or_default();
            for s in kuenstler.iter_mut().flat_map(|k| k.songs.iter_mut()) {
                s.beat_vorschlag = beat_in_verweisen(&s.verweise, &beats);
                if s.beat_vorschlag.is_some() || s.beat_id.is_some() { s.beat = true; }
            }
        }
    }
    Ok(ArtistsScan { vorhanden: pfad.is_dir(), kuenstler })
}

/// Der Katalog-Beat, in dessen Ordner einer der Verweise liegt (Groß/klein
/// und Trenner egal). Der längste Pfad gewinnt, falls Ordner verschachtelt sind.
fn beat_in_verweisen(verweise: &[String], beats: &[(String, String)]) -> Option<String> {
    let norm = |p: &str| p.to_lowercase().replace('/', "\\").trim_end_matches('\\').to_string();
    let verweise: Vec<String> = verweise.iter().map(|v| norm(v)).collect();
    beats.iter()
        .map(|(id, pfad)| (id, format!("{}\\", norm(pfad))))
        .filter(|(_, ordner)| verweise.iter().any(|v| v.starts_with(ordner.as_str())))
        .max_by_key(|(_, ordner)| ordner.len())
        .map(|(id, _)| id.clone())
}

/// „Mein Beat" setzen oder lösen (None).
#[tauri::command]
pub fn set_artist_beat(path: String, beat_id: Option<String>) -> Result<(), String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO artist_songs (path, beat_id) VALUES (?1, ?2)
         ON CONFLICT(path) DO UPDATE SET beat_id = excluded.beat_id",
        rusqlite::params![path, beat_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

/// Eine Datei des Beats (die WAV) in 02_ASSETS kopieren — kopieren, nicht
/// verschieben: das Archiv bleibt, wie es ist. Gibt den neuen Pfad zurück.
#[tauri::command(async)]
pub fn artist_beat_kopieren(song_path: String, quelle: String) -> Result<String, String> {
    let quelle = Path::new(&quelle);
    let name = quelle.file_name().ok_or("Kein Dateiname")?;
    let ziel_dir = Path::new(&song_path).join(ASSETS);
    fs::create_dir_all(&ziel_dir).map_err(|e| format!("{ASSETS} ließ sich nicht anlegen: {e}"))?;
    let ziel = ziel_dir.join(name);
    if ziel.exists() { return Err(format!("{} liegt schon in {ASSETS}", name.to_string_lossy())); }
    crate::utils::copy_and_verify(quelle, &ziel)?;
    Ok(ziel.to_string_lossy().to_string())
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

/// Neuer Song: Ordner + Template-FLP wie ein Studio-Projekt (Prüfungen von
/// dort), die FLP dann in 01_SAVEFILES, dazu 02_ASSETS und 03_VERSIONS.
/// Gibt den Pfad der FLP zurück.
#[tauri::command]
pub fn create_artist_song(artist_path: String, name: String, template_flp: String) -> Result<String, String> {
    let flp = std::path::PathBuf::from(crate::commands::create_project_folder(artist_path, name, template_flp)?);
    let dir = flp.parent().ok_or("FLP ohne Ordner")?.to_path_buf();
    let ziel = dir.join(SAVES).join(flp.file_name().ok_or("FLP ohne Namen")?);
    let angelegt = [SAVES, ASSETS, VERSIONS].iter().try_for_each(|o| fs::create_dir_all(dir.join(o)))
        .and_then(|_| fs::rename(&flp, &ziel));
    if let Err(e) = angelegt {
        let _ = fs::remove_dir_all(&dir);
        return Err(format!("Song-Ordner ließ sich nicht anlegen: {e}"));
    }
    Ok(ziel.to_string_lossy().to_string())
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

    // Nur ein Dateiname, kein Pfad — gesucht, wo Exporte liegen.
    if datei.contains(['/', '\\']) { return Err("Ungültiger Dateiname".into()); }
    let quelle = [song.join(VERSIONS), song.join(SAVES), song.to_path_buf()].iter()
        .map(|d| d.join(datei)).find(|p| p.is_file())
        .ok_or_else(|| format!("{datei} liegt nicht im Song-Ordner"))?;
    let ext = quelle.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_else(|| "wav".into());
    let neuer_name = format!("{}.{ext}", crate::utils::sanitize_filename_part(&format!("{kuenstler} - {song_name} ({art})")));

    let fertig_dir = kuenstler_dir.join(FERTIG);
    let ziel_song = fertig_dir.join(&song_name);
    // Erst alles prüfen, dann anfassen.
    if ziel_song.exists() { return Err(format!("In _Fertig gibt es „{song_name}\" schon")); }
    // Die Abgabe landet in 03_VERSIONS, egal wo FL sie hingelegt hat.
    let umbenannt = song.join(VERSIONS).join(&neuer_name);
    if umbenannt != quelle && umbenannt.exists() {
        return Err(format!("„{neuer_name}\" gibt es in {VERSIONS} schon"));
    }

    fs::create_dir_all(song.join(VERSIONS)).map_err(|e| format!("{VERSIONS} ließ sich nicht anlegen: {e}"))?;
    fs::rename(&quelle, &umbenannt).map_err(|e| format!("Umbenennen fehlgeschlagen: {e}"))?;
    fs::create_dir_all(&fertig_dir).map_err(|e| format!("_Fertig ließ sich nicht anlegen: {e}"))?;
    if let Err(e) = fs::rename(song, &ziel_song) {
        // Ordner offen in FL oder im Explorer: Umbenennung zurück, nichts halb lassen.
        let _ = fs::rename(&umbenannt, &quelle);
        return Err(format!("Song-Ordner ließ sich nicht verschieben (in FL oder im Explorer offen?): {e}"));
    }
    Ok((ziel_song.clone(), ziel_song.join(VERSIONS).join(&neuer_name)))
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
            Artist { bild: profilbild(&pfad), links: links_lesen(&pfad), name, path: pfad.to_string_lossy().to_string(), songs }
        })
        .collect();
    kuenstler.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    kuenstler
}

// ─── Profil: Bild und Links, beides im Künstler-Ordner ──────────────────────
//
// Liegt beim Künstler statt in der Datenbank: zieht beim Umbenennen oder
// Umziehen des Ordners mit. Das Bild trägt die Zeit im Namen, damit die
// Ansicht ein neues Bild nicht aus dem Cache zeigt.

const PROFIL: &str = "_profil";
const PROFIL_JSON: &str = "_kuenstler.json";
const PLATTFORMEN: [&str; 5] = ["spotify", "soundcloud", "youtube", "instagram", "discord"];

fn profilbild(dir: &Path) -> Option<String> {
    dateien(dir).into_iter()
        .filter(|(n, _)| n.to_lowercase().starts_with(PROFIL) && ist_bild(n))
        .max_by_key(|(_, t)| *t)
        .map(|(n, _)| dir.join(n).to_string_lossy().to_string())
}

fn ist_bild(name: &str) -> bool {
    Path::new(name).extension().map(|e| crate::utils::is_image_extension(&e.to_string_lossy().to_lowercase())).unwrap_or(false)
}

#[derive(serde::Deserialize, Serialize, Default)]
struct ProfilDatei {
    #[serde(default)]
    links: std::collections::BTreeMap<String, String>,
}

fn links_lesen(dir: &Path) -> std::collections::BTreeMap<String, String> {
    fs::read_to_string(dir.join(PROFIL_JSON)).ok()
        .and_then(|s| serde_json::from_str::<ProfilDatei>(&s).ok())
        .map(|p| p.links).unwrap_or_default()
}

/// Links speichern; leere Felder fallen weg, nur bekannte Plattformen.
#[tauri::command]
pub fn set_artist_links(artist_path: String, links: std::collections::BTreeMap<String, String>) -> Result<(), String> {
    let dir = Path::new(&artist_path);
    if !dir.is_dir() { return Err("Künstler-Ordner nicht gefunden".into()); }
    let links = links.into_iter()
        .map(|(k, v)| (k.to_lowercase(), v.trim().to_string()))
        .filter(|(k, v)| PLATTFORMEN.contains(&k.as_str()) && !v.is_empty())
        .collect();
    let json = serde_json::to_string_pretty(&ProfilDatei { links }).map_err(|e| e.to_string())?;
    fs::write(dir.join(PROFIL_JSON), json).map_err(|e| format!("{PROFIL_JSON} ließ sich nicht schreiben: {e}"))
}

/// Ein Bild als Profilbild übernehmen (kopiert, die Quelle bleibt). Ältere
/// Profilbilder des Künstlers fallen weg. Gibt den neuen Pfad zurück.
#[tauri::command]
pub fn set_artist_bild(artist_path: String, quelle: String) -> Result<String, String> {
    bild_uebernehmen(Path::new(&artist_path), Path::new(&quelle))
}

fn bild_uebernehmen(dir: &Path, quelle: &Path) -> Result<String, String> {
    let ext = quelle.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    if !crate::utils::is_image_extension(&ext) { return Err("Das ist kein Bild".into()); }
    let ziel = dir.join(format!("{PROFIL}_{}.{ext}", crate::utils::current_secs()));
    let alte: Vec<String> = dateien(dir).into_iter()
        .filter(|(n, _)| n.to_lowercase().starts_with(PROFIL) && ist_bild(n)).map(|(n, _)| n).collect();
    fs::copy(quelle, &ziel).map_err(|e| format!("Bild ließ sich nicht kopieren: {e}"))?;
    for n in alte { if dir.join(&n) != ziel { let _ = fs::remove_file(dir.join(n)); } }
    Ok(ziel.to_string_lossy().to_string())
}

/// Profilbild von einer Profilseite holen (Spotify, SoundCloud, YouTube,
/// Instagram): Jede dieser Seiten nennt ihr Bild als `og:image` — gemessen
/// am 18.10.2026, ohne Konto oder Schlüssel. Geladen wird mit dem curl,
/// das Windows mitbringt.
#[tauri::command(async)]
pub fn artist_bild_holen(artist_path: String, url: String) -> Result<String, String> {
    let url = url.trim();
    if !url.starts_with("https://") && !url.starts_with("http://") { return Err("Das ist kein Link".into()); }
    let seite = curl(&["-sL", "--max-time", "20", "-A", "Mozilla/5.0", url])?;
    let seite = String::from_utf8_lossy(&seite);
    let bild = og_image(&seite).ok_or("Auf der Seite ist kein Profilbild zu finden")?;
    if !bild.starts_with("https://") { return Err("Unerwartete Bild-Adresse".into()); }
    let daten = curl(&["-sL", "--max-time", "30", "-A", "Mozilla/5.0", &bild])?;
    let ext = bildtyp(&daten).ok_or("Die Seite liefert kein Bild")?;
    let tmp = std::env::temp_dir().join(format!("beatos_profil_{}.{ext}", std::process::id()));
    fs::write(&tmp, &daten).map_err(|e| e.to_string())?;
    let erg = bild_uebernehmen(Path::new(&artist_path), &tmp);
    let _ = fs::remove_file(&tmp);
    erg
}

fn curl(args: &[&str]) -> Result<Vec<u8>, String> {
    let mut c = std::process::Command::new("curl");
    c.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let out = c.output().map_err(|e| format!("curl ließ sich nicht starten: {e}"))?;
    if !out.status.success() { return Err("Die Seite ließ sich nicht laden".into()); }
    Ok(out.stdout)
}

/// `<meta property="og:image" content="…">` — Reihenfolge der Attribute egal.
fn og_image(html: &str) -> Option<String> {
    html.split("<meta").skip(1).find_map(|tag| {
        let tag = &tag[..tag.find('>')?];
        if !tag.contains("og:image\"") { return None; }
        let rest = &tag[tag.find("content=\"")? + 9..];
        Some(rest[..rest.find('"')?].replace("&amp;", "&"))
    })
}

/// Bildformat an den ersten Bytes — die Adressen tragen oft keine Endung.
fn bildtyp(b: &[u8]) -> Option<&'static str> {
    if b.starts_with(&[0xFF, 0xD8, 0xFF]) { Some("jpg") }
    else if b.starts_with(b"\x89PNG") { Some("png") }
    else if b.len() > 12 && &b[0..4] == b"RIFF" && &b[8..12] == b"WEBP" { Some("webp") }
    else { None }
}

/// Den Wurzelordner anlegen (leerer Zustand: „05_ARTISTS anlegen").
#[tauri::command]
pub fn create_artists_root(root: String) -> Result<(), String> {
    fs::create_dir_all(&root).map_err(|e| format!("Ordner ließ sich nicht anlegen: {e}"))
}

// ─── Downloads in Assets/ ───────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct Download {
    pub name: String,
    pub path: String,
    pub geaendert: u64,
}

/// Audiodateien im Downloads-Ordner der letzten 30 Tage, neueste zuerst —
/// zum Auswählen beim Anlegen eines Songs. Welche zum Song passen, entscheidet
/// das Frontend am Namen („heartbreak highlights_vocals").
/// `dir` aus den Einstellungen; leer = der Downloads-Ordner von Windows.
#[tauri::command(async)]
pub fn artist_downloads(app: tauri::AppHandle, dir: Option<String>) -> Result<Vec<Download>, String> {
    use tauri::Manager;
    let dir = match dir.filter(|d| !d.trim().is_empty()) {
        Some(d) => std::path::PathBuf::from(d.trim()),
        None => app.path().download_dir().map_err(|e| format!("Downloads-Ordner nicht gefunden: {e}"))?,
    };
    // ponytail: ohne Altersgrenze — Vocals bleiben oft Wochen liegen. Bei
    // hunderten Audiodateien im Ordner eine Grenze einziehen.
    let mut out: Vec<Download> = dateien(&dir).into_iter()
        .filter(|(n, _)| ist_audio(n))
        .map(|(name, geaendert)| Download { path: dir.join(&name).to_string_lossy().to_string(), name, geaendert })
        .collect();
    out.sort_by(|a, b| b.geaendert.cmp(&a.geaendert));
    Ok(out)
}

/// Dateien in `<Song>/Assets/` verschieben. Liegt dort schon eine gleichnamige
/// Datei, wird übersprungen statt überschrieben.
#[tauri::command(async)]
pub fn artist_assets_fuellen(song_path: String, dateien: Vec<String>) -> Result<Vec<UmzugErgebnis>, String> {
    let assets = Path::new(&song_path).join(ASSETS);
    fs::create_dir_all(&assets).map_err(|e| format!("Assets/ ließ sich nicht anlegen: {e}"))?;
    let mut erg = assets_verschieben(&assets, dateien);
    // Verwendet die FLP eine der Dateien, zeigt sie jetzt ins Leere — nachziehen.
    if erg.iter().any(|e| e.ok) {
        if let Err(e) = pfade_reparieren(Path::new(&song_path)) {
            erg.push(UmzugErgebnis { pfad: song_path.clone(), ok: false, meldung: format!("FLP-Pfade nicht nachgezogen: {e}") });
        }
    }
    Ok(erg)
}

fn assets_verschieben(assets: &Path, dateien: Vec<String>) -> Vec<UmzugErgebnis> {
    dateien.into_iter().map(|d| {
        let ergebnis = |ok: bool, meldung: String| UmzugErgebnis { pfad: d.clone(), ok, meldung };
        let quelle = Path::new(&d);
        let Some(name) = quelle.file_name() else { return ergebnis(false, "Kein Dateiname".into()) };
        let ziel = assets.join(name);
        if ziel.exists() { return ergebnis(false, "liegt schon in Assets/ — übersprungen".into()); }
        // rename klappt nur auf demselben Laufwerk; sonst kopieren, prüfen, löschen.
        let verschoben = fs::rename(quelle, &ziel).map_err(|e| e.to_string()).or_else(|_| {
            crate::utils::copy_and_verify(quelle, &ziel)?;
            fs::remove_file(quelle).map_err(|e| format!("kopiert, Original blieb liegen: {e}"))
        });
        match verschoben {
            Ok(()) => ergebnis(true, "→ Assets".into()),
            Err(e) => ergebnis(false, e),
        }
    }).collect()
}

// ─── FLP-Pfade reparieren ────────────────────────────────────────────────────
//
// FL merkt sich Audio mit vollem Pfad. Nach dem Umzug aus dem Archiv und nach
// dem Holen aus den Downloads zeigen die Pfade ins Leere. Die Datei wird so
// gesucht: erst die letzten Pfadteile unter dem Künstler-Ordner
// („<Song>\Audio\x.wav", auch ein Nachbarordner wie „NO BLEED (Prod.
// goodbxy)\vocals\…"), dann der Dateiname im Song-Ordner und seinen
// Unterordnern. Nur die FLPs direkt im Song-Ordner — Backup/ bleibt, wie es ist.

#[derive(Default)]
struct PfadPlan {
    /// je FLP: (alt, neu)
    ersatz: Vec<(std::path::PathBuf, Vec<(String, String)>)>,
    fehlend: Vec<String>,
    verweise: Vec<String>,
}

fn pfad_plan(song: &Path) -> PfadPlan {
    let mut plan = PfadPlan::default();
    let kuenstler_dir = match song.parent() {
        Some(p) if p.file_name().is_some_and(|n| n == FERTIG) => p.parent(),
        p => p,
    };
    // Song: bis 01_SAVEFILES/Audio hinunter. Künstler: auch Nachbar-Songs
    // (No Bleed nutzt Takes aus „NO BLEED (Prod. goodbxy)/vocals").
    let ordner_song = ordner_bis(song, 2);
    // Erst lesen, wenn etwas fehlt — der Scan läuft bei jedem Fensterwechsel.
    let ordner_kuenstler = std::cell::OnceCell::new();
    let finden = |fehlt: &str| -> Option<String> {
        let teile: Vec<&str> = fehlt.split(['\\', '/']).filter(|t| !t.is_empty()).collect();
        if let Some(k) = kuenstler_dir {
            for n in [3, 2] {
                if teile.len() > n {
                    let kandidat = teile[teile.len() - n..].iter().fold(k.to_path_buf(), |p, t| p.join(t));
                    if kandidat.is_file() { return Some(kandidat.to_string_lossy().to_string()); }
                }
            }
        }
        let name = teile.last()?;
        if let Some(p) = ordner_song.iter().map(|d| d.join(name)).find(|p| p.is_file()) {
            return Some(p.to_string_lossy().to_string());
        }
        // Im ganzen Künstler-Ordner nur, wenn der Name eindeutig ist —
        // „verse take 1.wav" kann es in zwei Songs geben.
        let alle: &Vec<std::path::PathBuf> = ordner_kuenstler.get_or_init(|| kuenstler_dir.map(|k| ordner_bis(k, 4)).unwrap_or_default());
        let mut treffer = alle.iter().map(|d| d.join(name)).filter(|p| p.is_file());
        match (treffer.next(), treffer.next()) {
            (Some(p), None) => Some(p.to_string_lossy().to_string()),
            _ => None,
        }
    };

    let flps = [song.to_path_buf(), song.join(SAVES)].into_iter()
        .flat_map(|d| dateien(&d).into_iter().map(move |(n, _)| d.join(n)))
        .filter(|p| is_flp(p));
    for flp in flps {
        let Ok(bytes) = fs::read(&flp) else { continue };
        let mut ersatz = Vec::new();
        for p in crate::commands::flp::audio_pfade(&bytes) {
            if p.starts_with('%') { continue; }
            if Path::new(&p).exists() {
                if !plan.verweise.contains(&p) { plan.verweise.push(p); }
            } else if let Some(neu) = finden(&p) {
                // FL schreibt Windows-Pfade; kein gemischtes „Yoghi/No Bleed\…" eintragen.
                let neu = if cfg!(windows) { neu.replace('/', "\\") } else { neu };
                ersatz.push((p, neu));
            } else if !plan.fehlend.contains(&p) {
                plan.fehlend.push(p);
            }
        }
        if !ersatz.is_empty() { plan.ersatz.push((flp, ersatz)); }
    }
    plan
}

/// Gefundene Pfade in die FLPs schreiben. Vorher eine Sicherung in Backup/ —
/// die erste bleibt stehen, sie ist der Stand vor BeatOS.
fn pfade_reparieren(song: &Path) -> Result<usize, String> {
    let mut gesamt = 0;
    for (flp, ersatz) in pfad_plan(song).ersatz {
        let alt = fs::read(&flp).map_err(|e| format!("{} nicht lesbar: {e}", flp.display()))?;
        let (neu, zahl) = crate::commands::flp::pfade_ersetzen(&alt, &ersatz)
            .ok_or_else(|| format!("{} ist keine gültige FLP", flp.display()))?;
        if zahl == 0 { continue; }
        let stamm = flp.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
        // Neben die FLP, wo FL seine eigenen Backups ablegt.
        let backup_dir = flp.parent().unwrap_or(song).join("Backup");
        let backup = backup_dir.join(format!("{stamm} (vor Pfad-Reparatur).flp"));
        if !backup.exists() {
            fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;
            fs::copy(&flp, &backup).map_err(|e| format!("Sicherung fehlgeschlagen: {e}"))?;
        }
        // Erst daneben schreiben, dann austauschen — nie eine halbe FLP.
        let tmp = flp.with_extension("flp.beatos-tmp");
        fs::write(&tmp, &neu).map_err(|e| format!("Schreiben fehlgeschlagen: {e}"))?;
        fs::rename(&tmp, &flp).map_err(|e| { let _ = fs::remove_file(&tmp); format!("{} ist gesperrt (in FL offen?): {e}", flp.display()) })?;
        gesamt += zahl;
    }
    Ok(gesamt)
}

/// „Pfade reparieren" an einem Song. Gibt die Zahl der Ersetzungen zurück.
#[tauri::command(async)]
pub fn artist_pfade_reparieren(song_path: String) -> Result<usize, String> {
    pfade_reparieren(Path::new(&song_path))
}

// ─── Ordner aufräumen: ins Schema 01_/02_/03_ ────────────────────────────────

/// Ältere Songs ins Schema bringen (Ziele: `ziel_im_schema`). Verschoben wird
/// nur innerhalb des Song-Ordners, nichts überschrieben — gibt es ein Ziel
/// schon, bleibt die Datei liegen und steht in der Meldung. Danach die
/// FLP-Pfade: erst wenn alle Songs fertig sind, denn No Bleed verwendet
/// Dateien aus einem Nachbar-Song.
#[tauri::command(async)]
pub fn artist_ordner_aufraeumen(songs: Vec<String>) -> Result<Vec<UmzugErgebnis>, String> {
    let mut erg: Vec<UmzugErgebnis> = songs.iter().map(|s| {
        let (zahl, fehler) = aufraeumen(Path::new(s));
        let mut meldung = if zahl == 1 { "1 Eintrag verschoben".to_string() } else { format!("{zahl} Einträge verschoben") };
        if !fehler.is_empty() { meldung.push_str(&format!("; liegen geblieben: {}", fehler.join("; "))); }
        UmzugErgebnis { pfad: s.clone(), ok: fehler.is_empty(), meldung }
    }).collect();
    for (s, e) in songs.iter().zip(erg.iter_mut()) {
        match pfade_reparieren(Path::new(s)) {
            Ok(0) => {}
            Ok(n) => e.meldung.push_str(&format!(", {n} FLP-Pfade nachgezogen")),
            Err(f) => { e.ok = false; e.meldung.push_str(&format!("; FLP-Pfade: {f}")); }
        }
    }
    Ok(erg)
}

fn aufraeumen(song: &Path) -> (usize, Vec<String>) {
    for o in [SAVES, ASSETS, VERSIONS] {
        if let Err(e) = fs::create_dir_all(song.join(o)) { return (0, vec![format!("{o}: {e}")]); }
    }
    // Vor dem Verschieben lesen — danach liegt die FLP schon in 01_SAVEFILES.
    let verwendet = verwendete_namen(song);
    let Ok(rd) = fs::read_dir(song) else { return (0, vec!["Song-Ordner nicht lesbar".into()]) };
    let (mut zahl, mut fehler) = (0, Vec::new());
    for e in rd.filter_map(|e| e.ok()).collect::<Vec<_>>() {
        let name = e.file_name().to_string_lossy().to_string();
        let ist_ordner = e.path().is_dir();
        let Some(rel) = ziel_im_schema(&name, ist_ordner, &verwendet) else { continue };
        let ziel = song.join(&rel);
        if ist_ordner && ziel.is_dir() {
            // Assets/, Eingang/ → 02_ASSETS; oder Audio/ gibt es in den Saves schon
            let (z, f) = inhalt_verschieben(&e.path(), &ziel);
            zahl += z;
            fehler.extend(f);
            let _ = fs::remove_dir(e.path()); // nur, wenn er jetzt leer ist
        } else if ziel.exists() {
            fehler.push(format!("{name} (gibt es in {} schon)", rel.display()));
        } else {
            match fs::rename(e.path(), &ziel) {
                Ok(()) => zahl += 1,
                Err(err) => fehler.push(format!("{name} ({err})")),
            }
        }
    }
    (zahl, fehler)
}

fn inhalt_verschieben(von: &Path, nach: &Path) -> (usize, Vec<String>) {
    let Ok(rd) = fs::read_dir(von) else { return (0, vec![format!("{} nicht lesbar", von.display())]) };
    let (mut zahl, mut fehler) = (0, Vec::new());
    for e in rd.filter_map(|e| e.ok()).collect::<Vec<_>>() {
        let ziel = nach.join(e.file_name());
        if e.path().is_dir() && ziel.is_dir() {
            let (z, f) = inhalt_verschieben(&e.path(), &ziel);
            zahl += z;
            fehler.extend(f);
            let _ = fs::remove_dir(e.path());
        } else if ziel.exists() {
            fehler.push(format!("{} (gibt es schon)", e.file_name().to_string_lossy()));
        } else {
            match fs::rename(e.path(), &ziel) {
                Ok(()) => zahl += 1,
                Err(err) => fehler.push(format!("{} ({err})", e.file_name().to_string_lossy())),
            }
        }
    }
    (zahl, fehler)
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

/// `dir` und seine Unterordner bis `tiefe` Ebenen, ohne Backup/.
fn ordner_bis(dir: &Path, tiefe: usize) -> Vec<std::path::PathBuf> {
    let mut out = vec![dir.to_path_buf()];
    if tiefe > 0 {
        for (n, p) in unterordner(dir) {
            if !n.eq_ignore_ascii_case("backup") { out.extend(ordner_bis(&p, tiefe - 1)); }
        }
    }
    out
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

/// Wohin ein Eintrag direkt im Song-Ordner beim Aufräumen gehört — None,
/// wenn er schon richtig liegt.
/// Dateinamen (klein), die die FLPs des Songs als Material verwenden. Lose
/// Audiodateien daneben sind dann Vocals oder Beat, kein Export — bei
/// Teufelskraut liegen „Teufelskraut alles.mp3" und der Beat neben den Mixen.
fn verwendete_namen(song: &Path) -> std::collections::HashSet<String> {
    [song.to_path_buf(), song.join(SAVES)].iter()
        .flat_map(|d| dateien(d).into_iter().map(move |(n, _)| d.join(n)))
        .filter(|p| is_flp(p))
        .filter_map(|p| fs::read(p).ok())
        .flat_map(|b| crate::commands::flp::audio_pfade(&b))
        .filter_map(|p| p.rsplit(['\\', '/']).next().map(|n| n.to_lowercase()))
        .collect()
}

/// Lose Audiodatei, die Material ist und kein Export: die FLP verwendet sie,
/// oder sie heißt „Demo" („NO BLEED [DEMO] (Prod. goodbxy).wav").
fn ist_material(name: &str, verwendet: &std::collections::HashSet<String>) -> bool {
    let n = name.to_lowercase();
    verwendet.contains(&n) || n.contains("demo")
}

fn ziel_im_schema(name: &str, ist_ordner: bool, verwendet: &std::collections::HashSet<String>) -> Option<std::path::PathBuf> {
    let n = name.to_lowercase();
    if [SAVES, ASSETS, VERSIONS].iter().any(|s| s.eq_ignore_ascii_case(name)) { return None; }
    Some(if ist_ordner {
        match n.as_str() {
            // FLs eigene Ordner gehören zur FLP
            "audio" | "backup" => Path::new(SAVES).join(name),
            // Frühere Namen des Asset-Ordners: Inhalt, nicht Ordner, nach 02_ASSETS
            "assets" | "eingang" => Path::new(ASSETS).to_path_buf(),
            _ => Path::new(ASSETS).join(name),
        }
    } else if is_flp(Path::new(name)) {
        Path::new(SAVES).join(name)
    } else if ist_audio(name) && !ist_material(name, verwendet) {
        Path::new(VERSIONS).join(name)
    } else {
        Path::new(ASSETS).join(name)
    })
}

/// Eine Audiodatei des Songs mit ihrer Rolle — zum Reinhören und für den
/// Verlauf. `art`: vocals, demo, beat (vom Künstler) oder mix, master (Exporte).
#[derive(Debug, Serialize, PartialEq)]
pub struct AudioDatei {
    pub art: &'static str,
    pub name: String,
    pub path: String,
    pub geaendert: u64,
}

pub(crate) fn song(name: &str, pfad: &Path, fertig: bool) -> ArtistSong {
    // (Name, Zeit, voller Pfad)
    type Datei = (String, u64, std::path::PathBuf);
    let liste = |d: std::path::PathBuf| -> Vec<Datei> {
        dateien(&d).into_iter().map(|(n, t)| { let p = d.join(&n); (n, t, p) }).collect()
    };
    let wurzel = liste(pfad.to_path_buf());
    let saves = liste(pfad.join(SAVES));
    let versions = liste(pfad.join(VERSIONS));
    // Was die FLP neben sich als Material verwendet, ist ein Asset, kein Export.
    let verwendet = verwendete_namen(pfad);
    let lose: Vec<&Datei> = saves.iter().chain(&wurzel).filter(|d| ist_audio(&d.0)).collect();
    // Bis „Ordner aufräumen" lief, liegen Assets auch noch in Assets/, Eingang/ oder lose.
    let assets: Vec<Datei> = [ASSETS, "Assets", "Eingang"].iter().flat_map(|o| liste(pfad.join(o))).collect();
    let aufnahmen: Vec<Datei> = liste(pfad.join(SAVES).join("Audio")).into_iter().chain(liste(pfad.join("Audio"))).collect();
    let song_name = vergleich(name);
    let hat_vocal = |n: &str| n.to_lowercase().contains("vocal");
    // In den Assets ist alles mit dem Songnamen außer der Demo selbst eine
    // Gesangsspur — Jarno schickt auch „Teufelskraut alles.mp3".
    // Demo: heißt wie der Song, oder „Demo" steht im Namen („NO BLEED [DEMO] (Prod. goodbxy)").
    let ist_demo = |n: &str| !hat_vocal(n) && (vergleich(n) == song_name || n.to_lowercase().contains("demo"));
    let ist_asset_vocal = |n: &str| hat_vocal(n) || (!ist_demo(n) && vergleich(n).contains(&song_name));

    // Alle Audiodateien mit Rolle — daraus folgen Häkchen, Reinhören, Verlauf.
    let eintrag = |art: &'static str, d: &Datei| AudioDatei { art, name: d.0.clone(), path: d.2.to_string_lossy().to_string(), geaendert: d.1 };
    let mut audio: Vec<AudioDatei> = Vec::new();
    for d in assets.iter().filter(|d| ist_audio(&d.0)).chain(lose.iter().copied().filter(|d| ist_material(&d.0, &verwendet))) {
        let art = if ist_demo(&d.0) { "demo" } else if ist_asset_vocal(&d.0) { "vocals" } else { "beat" };
        audio.push(eintrag(art, d));
    }
    // Aufnahmen in Audio/: nur die als Vocals benannten, nicht jeder Take.
    for d in aufnahmen.iter().filter(|d| ist_audio(&d.0) && hat_vocal(&d.0)) { audio.push(eintrag("vocals", d)); }
    // Exporte: in 03_VERSIONS, oder wo FL sie hinlegt — neben die FLP.
    let exporte: Vec<&Datei> = versions.iter().filter(|d| ist_audio(&d.0))
        .chain(lose.iter().copied().filter(|d| !ist_material(&d.0, &verwendet)))
        .collect();
    for d in &exporte {
        let n = d.0.to_lowercase();
        let art = if hat_vocal(&n) { "vocals" } else if n.contains("master") { "master" } else { "mix" };
        audio.push(eintrag(art, d));
    }
    audio.sort_by(|a, b| b.geaendert.cmp(&a.geaendert));

    let mut s = ArtistSong {
        name: name.to_string(),
        path: pfad.to_string_lossy().to_string(),
        fertig,
        ..Default::default()
    };
    s.flps = saves.iter().chain(&wurzel).filter(|d| is_flp(Path::new(&d.0)))
        .map(|d| FlpVersion { name: d.0.clone(), path: d.2.to_string_lossy().to_string(), geaendert: d.1 })
        .collect();
    s.flps.sort_by(|a, b| b.geaendert.cmp(&a.geaendert));
    s.flp = !s.flps.is_empty();
    let hat = |art: &str| audio.iter().any(|a| a.art == art);
    s.vocals = hat("vocals");
    s.demo = hat("demo");
    s.beat = hat("beat");
    s.mix = hat("mix");
    s.master = hat("master");
    let alle = || wurzel.iter().chain(&saves).chain(&versions).chain(&assets).chain(&aufnahmen);
    s.geaendert = alle().map(|d| d.1).max().unwrap_or(0);
    s.dateien = alle().map(|d| d.0.clone()).collect();
    s.umbau = fs::read_dir(pfad).map(|rd| rd.filter_map(|e| e.ok())
        .filter(|e| ziel_im_schema(&e.file_name().to_string_lossy(), e.path().is_dir(), &verwendet).is_some())
        .count()).unwrap_or(0);
    let plan = pfad_plan(pfad);
    s.verweise = plan.verweise;
    // Verschiedene Dateien zählen — Mindestens 2K, _2, _3 verweisen auf dieselben.
    s.reparierbar = plan.ersatz.iter().flat_map(|(_, e)| e.iter().map(|(alt, _)| alt))
        .collect::<std::collections::HashSet<_>>().len();
    s.fehlend = plan.fehlend;
    let mut exporte = exporte;
    exporte.sort_by(|a, b| b.1.cmp(&a.1));
    s.exporte = exporte.into_iter().map(|d| d.0.clone()).collect();
    s.audio = audio;
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
        // Schema: 01_SAVEFILES, 02_ASSETS mit Vocals, Demo, Beat; 03_VERSIONS
        datei(&root.join("JarnoGm/Heartbreak Highlights/01_SAVEFILES/Heartbreak Highlights.flp"));
        datei(&root.join("JarnoGm/Heartbreak Highlights/02_ASSETS/Heartbreak Highlights Vocals.wav"));
        datei(&root.join("JarnoGm/Heartbreak Highlights/02_ASSETS/Heartbreak Highlights.mp3"));
        datei(&root.join("JarnoGm/Heartbreak Highlights/02_ASSETS/LEFT ALONE [F#m 135].wav"));
        datei(&root.join("JarnoGm/Heartbreak Highlights/03_VERSIONS/Heartbreak Highlights - Master.wav"));
        // „Teufelskraut alles" sind Vocals, kein Beat; der Mix liegt neben der FLP
        datei(&root.join("JarnoGm/Teufelskraut/01_SAVEFILES/teufelskraut.flp"));
        datei(&root.join("JarnoGm/Teufelskraut/01_SAVEFILES/teufelskraut.mp3"));
        datei(&root.join("JarnoGm/Teufelskraut/02_ASSETS/Teufelskraut alles.mp3"));
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

        assert_eq!(nb.umbau, 4, "FLP, Export, Audio/, Backup/ liegen noch lose");

        let hh = k[0].songs.iter().find(|s| s.name == "Heartbreak Highlights").unwrap();
        assert!(hh.flp && hh.vocals && hh.demo && hh.beat && hh.master && !hh.mix);
        assert_eq!(hh.umbau, 0);

        let tk = k[0].songs.iter().find(|s| s.name == "Teufelskraut").unwrap();
        assert!(tk.flp && tk.vocals && !tk.beat && !tk.demo && tk.mix);
        assert_eq!(tk.exporte, vec!["teufelskraut.mp3".to_string()]);
        assert_eq!(tk.flps.len(), 1);
        assert!(Path::new(&tk.flps[0].path).ends_with("Teufelskraut/01_SAVEFILES/teufelskraut.flp"));

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
        assert!(Path::new(&flp).ends_with("Yoghi/No Bleed/01_SAVEFILES/No Bleed.flp"));
        assert!(Path::new(&k).join("No Bleed/02_ASSETS").is_dir() && Path::new(&k).join("No Bleed/03_VERSIONS").is_dir());
        assert!(!Path::new(&k).join("No Bleed/No Bleed.flp").exists());

        // Downloads in 02_ASSETS: verschoben, Gleichnamiges übersprungen
        let dl = root.join("dl");
        datei(&dl.join("no bleed_vocals.wav"));
        datei(&dl.join("no bleed.mp3"));
        let song = Path::new(&k).join("No Bleed");
        datei(&song.join("02_ASSETS/no bleed.mp3"));
        let erg = artist_assets_fuellen(song.to_string_lossy().to_string(), vec![
            dl.join("no bleed_vocals.wav").to_string_lossy().to_string(),
            dl.join("no bleed.mp3").to_string_lossy().to_string(),
        ]).unwrap();
        assert!(erg[0].ok && !erg[1].ok);
        assert!(song.join("02_ASSETS/no bleed_vocals.wav").is_file() && !dl.join("no bleed_vocals.wav").exists());
        assert!(dl.join("no bleed.mp3").is_file(), "nicht überschrieben, Original bleibt");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn abgeben_und_wieder_oeffnen() {
        let root = std::env::temp_dir().join(format!("beatos_abgabe_{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let song = root.join("JarnoGm/Mindestens 2K");
        datei(&song.join("01_SAVEFILES/Mindestens 2K.flp"));
        // FL hat den Master neben die FLP exportiert
        datei(&song.join("01_SAVEFILES/Mindestens 2K_master v3.wav"));
        datei(&root.join("JarnoGm/Finden/Finden.mp3"));

        assert!(abgeben_dateien(&song, "Mindestens 2K_master v3.wav", "Bounce").is_err(), "nur Master/Mix");
        assert!(abgeben_dateien(&song, "../Finden/Finden.mp3", "Mix").is_err(), "nur Dateien im Song-Ordner");

        let (neu, abgabe) = abgeben_dateien(&song, "Mindestens 2K_master v3.wav", "Master").unwrap();
        assert_eq!(neu, root.join("JarnoGm/_Fertig/Mindestens 2K"));
        assert_eq!(abgabe, neu.join("03_VERSIONS/JarnoGm - Mindestens 2K (Master).wav"));
        assert!(abgabe.is_file() && neu.join("01_SAVEFILES/Mindestens 2K.flp").is_file() && !song.exists());
        assert!(abgeben_dateien(&neu, "JarnoGm - Mindestens 2K (Master).wav", "Master").is_err(), "schon abgegeben");

        // Scan sieht ihn als fertig
        let k = &kuenstler_lesen(&root)[0];
        assert!(k.songs.iter().any(|s| s.name == "Mindestens 2K" && s.fertig));

        let zurueck = wieder_oeffnen_dateien(&neu).unwrap();
        assert_eq!(zurueck, song);
        assert!(song.join("03_VERSIONS/JarnoGm - Mindestens 2K (Master).wav").is_file());
        assert!(wieder_oeffnen_dateien(&song).is_err(), "nicht in _Fertig");
        let _ = fs::remove_dir_all(&root);
    }

    /// Kleinste FLP mit Audio-Pfaden (Ereignis 196).
    fn flp_mit(pfade: &[String]) -> Vec<u8> {
        let mut e = Vec::new();
        for p in pfade {
            let d: Vec<u8> = p.encode_utf16().chain([0]).flat_map(|u| u.to_le_bytes()).collect();
            e.push(196);
            if d.len() >= 128 { e.extend([(d.len() & 0x7f) as u8 | 0x80, (d.len() >> 7) as u8]); } else { e.push(d.len() as u8); }
            e.extend(d);
        }
        let mut b = b"FLhd".to_vec();
        b.extend(6u32.to_le_bytes());
        b.extend([0, 0, 1, 0, 96, 0]);
        b.extend(b"FLdt");
        b.extend((e.len() as u32).to_le_bytes());
        b.extend(e);
        b
    }

    #[test]
    fn flp_pfade_nach_umzug_und_downloads_reparieren() {
        let root = std::env::temp_dir().join(format!("beatos_pfade_{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let song = root.join("Yoghi/No Bleed");
        let dl = root.join("dl");
        datei(&song.join("Audio/v.wav"));
        datei(&root.join("Yoghi/NO BLEED (Prod)/vocals/t1.wav"));
        datei(&dl.join("no bleed vocals.mp3"));
        let dl_datei = dl.join("no bleed vocals.mp3").to_string_lossy().to_string();
        let flp = song.join("No Bleed.flp");
        fs::write(&flp, flp_mit(&[
            r"C:\weg\03_ARCHIVE\Yoghi\No Bleed\Audio\v.wav".into(),
            r"C:\weg\03_ARCHIVE\Yoghi\NO BLEED (Prod)\vocals\t1.wav".into(),
            r"D:\nirgends\verloren.wav".into(),
            dl_datei.clone(),
        ])).unwrap();

        let s = song_lesen(&song);
        assert_eq!((s.reparierbar, s.fehlend.len()), (2, 1));
        assert_eq!(s.verweise, vec![dl_datei.clone()], "der Download gehört zum Song, auch ohne passenden Namen");

        // Download holen: verschoben und in der FLP nachgezogen, Umzug-Schäden gleich mit
        let erg = artist_assets_fuellen(song.to_string_lossy().to_string(), vec![dl_datei]).unwrap();
        assert!(erg.iter().all(|e| e.ok), "{erg:?}");
        let pfade = crate::commands::flp::audio_pfade(&fs::read(&flp).unwrap());
        assert_eq!(pfade[0], win(song.join("Audio/v.wav")));
        assert_eq!(pfade[1], win(root.join("Yoghi/NO BLEED (Prod)/vocals/t1.wav")));
        assert_eq!(pfade[2], r"D:\nirgends\verloren.wav", "nicht Gefundenes bleibt");
        assert_eq!(pfade[3], win(song.join("02_ASSETS/no bleed vocals.mp3")));
        assert!(song.join("Backup/No Bleed (vor Pfad-Reparatur).flp").is_file());
        let s = song_lesen(&song);
        assert_eq!((s.reparierbar, s.fehlend.len()), (0, 1));

        // Aufräumen: alles ins Schema, beide Songs — No Bleed verwendet einen
        // Take aus dem Nachbar-Song, der dabei selbst umzieht.
        datei(&song.join("Eingang/demo.mp3"));
        datei(&song.join("No Bleed.mp3"));
        let nachbar = root.join("Yoghi/NO BLEED (Prod)");
        let erg = artist_ordner_aufraeumen(vec![
            song.to_string_lossy().to_string(), nachbar.to_string_lossy().to_string(),
        ]).unwrap();
        assert!(erg.iter().all(|e| e.ok), "{erg:?}");
        let flp = song.join("01_SAVEFILES/No Bleed.flp");
        assert!(flp.is_file() && song.join("01_SAVEFILES/Audio/v.wav").is_file());
        assert!(song.join("01_SAVEFILES/Backup/No Bleed (vor Pfad-Reparatur).flp").is_file());
        assert!(song.join("02_ASSETS/demo.mp3").is_file() && !song.join("Eingang").exists());
        assert!(song.join("03_VERSIONS/No Bleed.mp3").is_file());
        assert!(nachbar.join("02_ASSETS/vocals/t1.wav").is_file());
        let pfade = crate::commands::flp::audio_pfade(&fs::read(&flp).unwrap());
        assert_eq!(pfade[0], win(song.join("01_SAVEFILES/Audio/v.wav")));
        assert_eq!(pfade[1], win(nachbar.join("02_ASSETS/vocals/t1.wav")));
        let s = song_lesen(&song);
        assert_eq!((s.reparierbar, s.fehlend.len(), s.umbau), (0, 1, 0));
        let _ = fs::remove_dir_all(&root);
    }

    /// Teufelskraut, wie es heute liegt: Beat und Vocals lose neben den Mixen.
    #[test]
    fn aufraeumen_trennt_material_von_exporten() {
        let root = std::env::temp_dir().join(format!("beatos_teufel_{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let song_dir = root.join("JarnoGm/Teufelskraut");
        let beat = song_dir.join("(FREE) Lil Tecca Type Beat — LIFESTYLE.mp3");
        let alles = song_dir.join("Teufelskraut alles.mp3");
        for p in [&beat, &alles, &song_dir.join("teufelskraut.mp3"), &song_dir.join("JarnoGm - Teufelskraut.wav"),
                  &song_dir.join("TEUFELSKRAUT [DEMO].wav")] { datei(p); }
        fs::write(song_dir.join("teufelskraut.flp"), flp_mit(&[
            r"C:\weg\JarnoGm - Library\Teufelskraut\(FREE) Lil Tecca Type Beat — LIFESTYLE.mp3".into(),
            r"C:\weg\JarnoGm - Library\Teufelskraut\Teufelskraut alles.mp3".into(),
        ])).unwrap();

        let s = song("Teufelskraut", &song_dir, false);
        assert!(s.vocals && s.beat && s.mix, "Material zählt schon vor dem Aufräumen richtig");
        assert_eq!(s.exporte.len(), 2, "nur die zwei Mixe: {:?}", s.exporte);

        let erg = artist_ordner_aufraeumen(vec![song_dir.to_string_lossy().to_string()]).unwrap();
        assert!(erg[0].ok, "{erg:?}");
        assert!(song_dir.join("02_ASSETS/Teufelskraut alles.mp3").is_file());
        assert!(song_dir.join("02_ASSETS/(FREE) Lil Tecca Type Beat — LIFESTYLE.mp3").is_file());
        assert!(song_dir.join("02_ASSETS/TEUFELSKRAUT [DEMO].wav").is_file(), "eine Demo ist kein Export");
        assert!(song_dir.join("03_VERSIONS/teufelskraut.mp3").is_file() && song_dir.join("03_VERSIONS/JarnoGm - Teufelskraut.wav").is_file());
        let pfade = crate::commands::flp::audio_pfade(&fs::read(song_dir.join("01_SAVEFILES/teufelskraut.flp")).unwrap());
        assert_eq!(pfade[1], win(song_dir.join("02_ASSETS/Teufelskraut alles.mp3")));
        let s = song("Teufelskraut", &song_dir, false);
        assert!(s.vocals && s.beat && s.mix && s.umbau == 0 && s.reparierbar == 0);
        assert!(s.demo, "TEUFELSKRAUT [DEMO].wav ist die Demo");
        // Reinhören/Verlauf: jede Datei mit Rolle und vollem Pfad
        let art = |n: &str| s.audio.iter().find(|a| a.name == n).map(|a| a.art);
        assert_eq!(art("Teufelskraut alles.mp3"), Some("vocals"));
        assert_eq!(art("TEUFELSKRAUT [DEMO].wav"), Some("demo"));
        assert_eq!(art("(FREE) Lil Tecca Type Beat — LIFESTYLE.mp3"), Some("beat"));
        assert_eq!(art("teufelskraut.mp3"), Some("mix"));
        assert!(s.audio.iter().all(|a| Path::new(&a.path).is_file()));
        let _ = fs::remove_dir_all(&root);
    }

    fn song_lesen(p: &Path) -> ArtistSong { song("No Bleed", p, false) }
    fn win(p: std::path::PathBuf) -> String { p.to_string_lossy().replace('/', "\\") }

    #[test]
    fn erkennt_den_beat_an_den_flp_verweisen() {
        let beats = vec![
            ("0929".to_string(), r"C:\Lib\03_ARCHIVE\2026\09_SEPTEMBER\0929 - SWEET DREAMS [D#m 146]".to_string()),
            ("0921".to_string(), r"C:\Lib\03_ARCHIVE\2026\09_SEPTEMBER\0921 - NOBODY HERE [C#m 156]".to_string()),
        ];
        let verweise = vec![
            r"C:\Users\x\.Vault\Library\Tags\Tag xP4RA.wav".to_string(),
            r"c:/lib/03_archive/2026/09_september/0929 - sweet dreams [d#m 146]/SWEET DREAMS [D#m 146]_untagged.wav".to_string(),
        ];
        assert_eq!(beat_in_verweisen(&verweise, &beats), Some("0929".into()));
        assert_eq!(beat_in_verweisen(&verweise[..1], &beats), None);
        // Ordnername als Präfix eines anderen zählt nicht („…0929 - SWEET" ≠ „…0929 - SWEET DREAMS 2")
        let fast = vec![r"C:\Lib\03_ARCHIVE\2026\09_SEPTEMBER\0929 - SWEET DREAMS [D#m 146] 2\x.wav".to_string()];
        assert_eq!(beat_in_verweisen(&fast, &beats), None);
    }

    #[test]
    fn profil_bild_und_links() {
        // So sehen die Seiten aus (gekürzt, 18.10.2026)
        assert_eq!(og_image(r#"<head><meta name="x" content="y"><meta property="og:image" content="https://i1.sndcdn.com/avatars-1-t500x500.jpg"></head>"#).as_deref(),
            Some("https://i1.sndcdn.com/avatars-1-t500x500.jpg"));
        assert_eq!(og_image(r#"<meta content="https://a.b/c.jpg?x=1&amp;y=2" property="og:image"/>"#).as_deref(), Some("https://a.b/c.jpg?x=1&y=2"));
        assert_eq!(og_image("<meta property=\"og:title\" content=\"x\">"), None);
        assert_eq!(bildtyp(&[0xFF, 0xD8, 0xFF, 0xE0]), Some("jpg"));
        assert_eq!(bildtyp(b"<html>"), None);

        let root = std::env::temp_dir().join(format!("beatos_profil_{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let k = root.join("JarnoGm");
        datei(&k.join("Song/01_SAVEFILES/Song.flp"));
        let quelle = root.join("bild.png");
        fs::write(&quelle, b"\x89PNG").unwrap();
        datei(&k.join("_profil_1.jpg")); // ein altes Bild
        let neu = set_artist_bild(k.to_string_lossy().to_string(), quelle.to_string_lossy().to_string()).unwrap();
        assert!(Path::new(&neu).is_file() && !k.join("_profil_1.jpg").exists() && quelle.is_file());
        assert!(set_artist_bild(k.to_string_lossy().to_string(), k.join("Song/01_SAVEFILES/Song.flp").to_string_lossy().to_string()).is_err());

        let mut links = std::collections::BTreeMap::new();
        links.insert("Spotify".to_string(), " https://open.spotify.com/artist/x ".to_string());
        links.insert("youtube".to_string(), "".to_string());
        links.insert("myspace".to_string(), "https://x".to_string());
        set_artist_links(k.to_string_lossy().to_string(), links).unwrap();

        let a = &kuenstler_lesen(&root)[0];
        assert_eq!(a.bild.as_deref(), Some(neu.as_str()));
        assert_eq!(a.links.iter().collect::<Vec<_>>(), vec![(&"spotify".to_string(), &"https://open.spotify.com/artist/x".to_string())]);
        assert_eq!(a.songs.len(), 1, "Profil-Dateien sind keine Songs");
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
