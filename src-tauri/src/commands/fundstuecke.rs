// src-tauri/src/commands/fundstuecke.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Fundstücke: fertige Songs im Altbestand, die noch nicht im Archiv sind.
// Rein lesend. Jede Datei mit Export (MP3/WAV …) wird einem Song zugeordnet,
// über die alte Nummer „[618] HEAT - 152 - D#m", sonst über den Titel. FLPs
// hängen nur am Song, Skizzen ohne Export erscheinen nicht.
//
// Ampel, absichtlich vorsichtig: lieber Gelb als falsch Grün.
//   grau  schon im Archiv (gleiche Datei, Nummer + Titel oder Titel eindeutig)
//   rot   Remix oder Mashup
//   gelb  unsicher: keine Nummer, kein Titel, Nummer mit mehreren Titeln,
//         Key/BPM uneinheitlich, gleicher Titel im Archiv mit anderem Key
//   grün  alte Nummer, eindeutig, nicht im Archiv
// ═══════════════════════════════════════════════════════════════════════════════

use crate::commands::archive_match::{
    collect_files, contradicts, normalize_title, old_system_id_and_title, read_archive_index,
    same_content, ArchiveEntry,
};
use crate::utils::parse_audio_filename;
use serde::Serialize;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::{Path, PathBuf};

const AUDIO: &[&str] = &["mp3", "wav", "m4a", "ogg", "flac", "aif", "aiff"];
/// FL-Arbeitsmaterial, Sample-Packs, Vorlagen, Künstler (Scheibe 7) und der eigene Beattag.
const UEBERSPRINGEN: &[&str] = &["audio", "beattag", "autosaves", "samples", "templates", "template", "coverarts", "files n presets", "artists"];

#[derive(Debug, Serialize)]
pub struct FundDatei {
    pub path: String,
    pub size: u64,
    /// Sekunden seit 1970
    pub modified: i64,
    pub flp: bool,
    pub im_archiv: bool,
    /// Was der Name dieser Datei hergibt: zum Aufteilen gemischter Einträge
    pub titel: Option<String>,
    pub key: Option<String>,
    pub bpm: Option<i32>,
    /// Archiv-Beat, in dem diese Datei schon liegt („0776 - Louis V [Dm 165]“)
    pub archiv: Option<String>,
    /// Als „Weg“ markiert (gilt pro Datei, auch für Teile aufgeteilter Einträge)
    pub weg: bool,
}

#[derive(Debug, Serialize)]
pub struct Fund {
    pub id: Option<u32>,
    pub titel: String,
    pub key: Option<String>,
    pub bpm: Option<i32>,
    /// gruen | gelb | rot | grau
    pub ampel: &'static str,
    pub grund: String,
    /// Archiv-Ordner bei Grau, oder der ähnliche bei Gelb
    pub archiv: Option<String>,
    /// Dateien ohne byte-gleiche Kopie im Archiv. Bei Grau die Reste, die
    /// Scheibe 3 noch mitnehmen muss.
    pub nur_hier: usize,
    /// Ältester Export (JJJJ-MM-TT): wann der Song fertig war
    pub fertig: Option<String>,
    /// Exporte zuerst, neueste zuerst
    pub dateien: Vec<FundDatei>,
    /// Alle Dateien als „Weg“ markiert (bleibt im Altbestand, Scheibe 10)
    pub weg: bool,
}

#[derive(Debug, Clone)]
struct Werk {
    id: Option<u32>,
    titel: String,
    key: Option<String>,
    bpm: Option<i32>,
}

impl Werk {
    fn schluessel(&self) -> String {
        match self.id {
            Some(id) => format!("#{id}"),
            None => format!("t:{}", normalize_title(&self.titel)),
        }
    }
}

/// „Ten_2" und „Ten_old" sind Versionen von „Ten".
fn ohne_version(t: &str) -> &str {
    let mut t = t.trim();
    loop {
        let vorher = t;
        if t.len() > 4 && t.get(t.len() - 4..).is_some_and(|e| e.eq_ignore_ascii_case("_old")) {
            t = &t[..t.len() - 4];
        }
        if let Some((a, b)) = t.rsplit_once('_') {
            if !a.is_empty() && !b.is_empty() && b.chars().all(|c| c.is_ascii_digit()) {
                t = a;
            }
        }
        // „Daydreams2“, „Show Off - 3“: eine Ziffer 2–9 am Ende. Mehr Stellen
        // nicht („Blink182“, „Area51“), mit Leerzeichen nicht („Destiny 2“).
        if t.len() > 3 && t.ends_with(|c: char| ('2'..='9').contains(&c)) {
            let a = &t[..t.len() - 1];
            if let Some(v) = a.strip_suffix(" - ").filter(|v| !v.trim().is_empty()) {
                t = v;
            // mindestens drei Buchstaben davor: „Ten4“ ja, „146_4mp3“ nein
            } else if a.chars().rev().take_while(|c| c.is_alphabetic()).count() >= 3 && !a.to_lowercase().ends_with("mp") {
                t = a;
            }
        }
        if t == vorher {
            return t.trim();
        }
    }
}

/// „@xP4RA - Forever" und „Victory @xP4RA" → der Titel ohne Producer-Tag.
fn ohne_tag(t: &str) -> &str {
    let mut t = t.trim();
    if t.starts_with('@') {
        if let Some((_, rest)) = t.split_once(" - ") { t = rest; }
    }
    if let Some((vorn, hinten)) = t.rsplit_once(" @") {
        if !hinten.contains(' ') { t = vorn; }
    }
    t.trim().trim_end_matches(['-', ' ']).trim()
}

/// „untitled", „Project_0242", „test44", „2403": daraus lässt sich kein Song lesen.
fn generisch(titel: &str) -> bool {
    let n = normalize_title(titel).to_lowercase();
    n.is_empty()
        || n.chars().all(|c| c.is_ascii_digit())
        || ["untitled", "project", "test", "unbenannt", "newproject", "neuesprojekt"].iter().any(|p| n.starts_with(p))
        || ["beattag", "tag", "template", "starttemplate", "deleteme"].contains(&n.as_str())
        // Projekt-Platzhalter „P0039“ (seit Scheibe 4), wie „Project_0039“
        || (n.len() >= 5 && n.starts_with('p') && n[1..].chars().all(|c| c.is_ascii_digit()))
}

/// Song aus einem Datei- oder Ordnernamen. None = nichts Brauchbares.
/// `nackte_nr`: „536.mp3“ als alte Nummer lesen. Nicht in Produktionsprojekten,
/// dort ist „1.mp3“ ein Bounce und „100 Tausend“ ein Titel.
fn werk_aus_name(name: &str, ist_datei: bool, nackte_nr: bool) -> Option<Werk> {
    let stamm = if ist_datei { name.rsplit_once('.').map(|(a, _)| a).unwrap_or(name) } else { name };
    if let Some(o) = old_system_id_and_title(stamm) {
        // „[638] Cuthroat -150 - Gm": die „-150" ist das Tempo, nicht der Titel
        let titel = match (o.title.rsplit_once(' '), o.bpm) {
            (Some((vorn, zahl)), Some(b)) if zahl.trim_start_matches('-') == b.to_string() => vorn.trim().to_string(),
            _ => o.title,
        };
        return Some(Werk { id: Some(o.id), titel, key: o.key, bpm: o.bpm });
    }
    if let Some(w) = nur_nummer(ohne_version(stamm)).filter(|_| nackte_nr) {
        return Some(w);
    }
    // parse_audio_filename schneidet eine Endung ab, Ordnernamen haben keine
    // „ANGER - 160 Am_2": Versionsnummer hinter dem Key, sonst wird der Key nicht erkannt
    let stamm = match stamm.rsplit_once('_') {
        Some((a, v)) if !a.is_empty() && !v.is_empty() && v.chars().all(|c| c.is_ascii_digit()) => a,
        _ => stamm,
    };
    let (mut titel, mut key, mut bpm) = parse_audio_filename(&format!("{stamm}.x"));
    // Altes Schema ohne Nummer: „ANGER - 160 Am“, gelesen wie „[1] ANGER - 160 Am“
    if key.is_none() && bpm.is_none() {
        if let Some(o) = old_system_id_and_title(&format!("[1] {stamm}")).filter(|o| o.key.is_some() || o.bpm.is_some()) {
            (titel, key, bpm) = (o.title, o.key, o.bpm);
        }
    }
    let titel = ohne_tag(ohne_version(&titel)).to_string();
    if generisch(&titel) {
        return None;
    }
    Some(Werk { id: None, titel, key, bpm })
}

/// „536", „182_2", „504 - Bpm 160 Cm", „17_Seventeen": alte Nummer ohne
/// Klammern. Höchstens drei Stellen, „2403" ist keine.
fn nur_nummer(s: &str) -> Option<Werk> {
    let d: String = s.chars().take_while(|c| c.is_ascii_digit()).collect();
    let rest = &s[d.len()..];
    // „700-799" ist ein Sammelordner, keine Nummer
    let bereich = rest.strip_prefix('-').is_some_and(|r| r.starts_with(|c: char| c.is_ascii_digit()));
    if d.is_empty() || d.len() > 3 || bereich || !(rest.is_empty() || rest.starts_with(['_', ' ', '-', '.', '('])) {
        return None;
    }
    let id: u32 = d.parse().ok().filter(|&i| i > 0)?;
    // „_2 - Bpm 80 Ab": Version weg, dann wie ein Name im alten Schema lesen
    let rest = rest.strip_prefix('_').map(|r| r.trim_start_matches(|c: char| c.is_ascii_digit())).unwrap_or(rest);
    let o = old_system_id_and_title(&format!("[{id}] {}", rest.trim_start_matches(['_', ' ', '-', '.']).trim()))?;
    // „397 . Master", „473_Prototype", „198_Loop": Arbeitsnamen, kein Titel
    let fuellwort = ["master", "premaster", "pastmaster", "mp3", "wav", "loop", "prototype", "idee", "idea", "beat",
        "beatcontest", "demo", "demotrack", "mix", "final", "20minbeat", "short", "vocals", "vocal", "instrumental", "acapella", "stems"]
        .contains(&normalize_title(&o.title).to_lowercase().as_str());
    let titel = if o.title.to_lowercase().starts_with("bpm") || generisch(&o.title) || fuellwort { String::new() } else { o.title };
    Some(Werk { id: Some(id), titel, key: o.key, bpm: o.bpm })
}

/// „500-599“ → (500, 599)
fn eimer_bereich(name: &str) -> Option<(u32, u32)> {
    let (a, b) = name.split_once('-')?;
    Some((a.parse().ok()?, b.parse().ok()?))
}

/// Nackte Nummer im Eimer muss in seinen Bereich passen: „1_3.mp3“ in
/// 800-899 ist ein Bounce, „536.wav“ in 500-599 die alte 536.
fn passt_in_eimer(w: &Werk, name: &str, eimer: Option<(u32, u32)>) -> bool {
    match (w.id, eimer) {
        (Some(id), Some((a, b))) if !name.starts_with('[') => (a..=b).contains(&id),
        _ => true,
    }
}

struct Fundort {
    path: PathBuf,
    werk: Option<Werk>,
    flp: bool,
    size: u64,
    modified: i64,
}

/// Produktionsordner: „Project_0646“ (alt) oder „P0646“ (seit Scheibe 4)
fn ist_projektname(n: &str) -> bool {
    n.starts_with("Project_") || (n.len() >= 5 && n.starts_with('P') && n[1..5].chars().all(|c| c.is_ascii_digit()))
}

/// `…\01_ACTIVE_PRODUCTION\P0646` für jede Datei darunter
fn projekt_ordner(p: &Path) -> Option<&Path> {
    p.ancestors().find(|a| {
        a.file_name().is_some_and(|n| ist_projektname(&n.to_string_lossy()))
            && a.parent().and_then(|e| e.file_name()).is_some_and(|n| n.eq_ignore_ascii_case("01_ACTIVE_PRODUCTION"))
    })
}

fn endung(p: &Path) -> String {
    p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase()
}

/// Rekursiv sammeln. `ordner_werk`: der nächste Elternordner mit Nummer oder
/// Titel, z. B. „[795] Gotta Go Now - Am 140". Namenlose Dateien erben ihn.
fn sammeln(dir: &Path, ordner_werk: Option<&Werk>, out: &mut Vec<Fundort>) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    let eimer = dir.components().rev().find_map(|k| eimer_bereich(&k.as_os_str().to_string_lossy()));
    let nackte_nr = !dir.components().any(|k| ist_projektname(&k.as_os_str().to_string_lossy()));
    let mut hier = Vec::new();
    for e in rd.filter_map(|e| e.ok()) {
        let p = e.path();
        let name = e.file_name().to_string_lossy().to_string();
        if p.is_dir() {
            let klein = name.to_lowercase();
            if klein.contains("backup") || UEBERSPRINGEN.contains(&klein.as_str()) {
                continue;
            }
            // Sammelordner wie „Beats" oder „Remixes" sind kein Song: nur mit
            // Nummer oder Key/BPM im Namen gibt der Ordner einen Titel her.
            // „01_SAVEFILES“, „02_OLD“: BeatOS-Gliederung, keine alte Nummer 1/2
            let gliederung = name.len() > 3 && name.as_bytes()[..2].iter().all(u8::is_ascii_digit) && name.as_bytes()[2] == b'_'
                && name[3..].chars().all(|c| c.is_ascii_uppercase() || c == '_');
            let eigen = werk_aus_name(&name, false, nackte_nr).filter(|w| !gliederung && (w.id.is_some() || w.key.is_some() || w.bpm.is_some()));
            sammeln(&p, eigen.as_ref().or(ordner_werk), out);
            continue;
        }
        let ext = endung(&p);
        let flp = ext == "flp";
        if !flp && !AUDIO.contains(&ext.as_str()) {
            continue;
        }
        let meta = std::fs::metadata(&p).ok();
        let modified = meta
            .as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        hier.push(Fundort {
            // Im Ordner „[539] YaYa" gehört „YaYa - 140 Em.mp3" zur 539.
            werk: match (werk_aus_name(&name, true, nackte_nr).filter(|w| passt_in_eimer(w, &name, eimer)).or_else(|| werk_aus_name(&name, true, false)), ordner_werk) {
                (Some(w), _) if w.id.is_some() => Some(w),
                (_, Some(o)) if o.id.is_some() => Some(o.clone()),
                (w, o) => w.or_else(|| o.cloned()),
            },
            path: p,
            flp,
            size: meta.map(|m| m.len()).unwrap_or(0),
            modified,
        });
    }
    // Namenlose Datei neben genau einem Song gehört zu ihm
    // (Produktion: „Project_0242.flp" neben „SWEET DREAMS [Cm 140].wav").
    // Nur wenn der Song hier selbst einen Export hat; eine FLP allein reicht nicht.
    let songs: HashSet<String> = hier.iter().filter_map(|f| f.werk.as_ref().map(|w| w.schluessel())).collect();
    let mit_export = hier.iter().any(|f| !f.flp && f.werk.is_some());
    if songs.len() == 1 && mit_export {
        let w = hier.iter().filter(|f| !f.flp).find_map(|f| f.werk.clone()); // Angaben vom Export, nicht von einer Skizzen-FLP
        for f in hier.iter_mut().filter(|f| f.werk.is_none()) {
            f.werk = w.clone();
        }
    }
    out.extend(hier);
}

fn ist_remix(p: &Path) -> bool {
    let s = p.to_string_lossy().to_lowercase();
    ["remix", "mashup", "bootleg"].iter().any(|w| s.contains(w))
}

/// „Weg“: Dateien, die nicht eingesammelt werden. Sie bleiben im Altbestand
/// und gehen in Scheibe 10 mit nach _ALT. Pfade klein geschrieben.
fn weg_tabelle(conn: &rusqlite::Connection) -> Result<(), String> {
    conn.execute("CREATE TABLE IF NOT EXISTS fund_weg (path TEXT PRIMARY KEY, seit TEXT DEFAULT CURRENT_TIMESTAMP)", [])
        .map(|_| ()).map_err(|e| e.to_string())
}

fn weg_lesen() -> HashSet<String> {
    let Ok(conn) = crate::db::open_db() else { return HashSet::new() };
    if weg_tabelle(&conn).is_err() { return HashSet::new(); }
    let Ok(mut stmt) = conn.prepare("SELECT path FROM fund_weg") else { return HashSet::new() };
    stmt.query_map([], |r| r.get::<_, String>(0)).map(|z| z.flatten().collect()).unwrap_or_default()
}

/// Dateien als „Weg“ markieren oder zurückholen
#[tauri::command]
pub fn fund_weg(paths: Vec<String>, weg: bool) -> Result<(), String> {
    let mut conn = crate::db::open_db().map_err(|e| e.to_string())?;
    weg_tabelle(&conn)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for p in paths {
        let p = p.to_lowercase();
        if weg {
            tx.execute("INSERT OR IGNORE INTO fund_weg (path) VALUES (?1)", [p]).map_err(|e| e.to_string())?;
        } else {
            tx.execute("DELETE FROM fund_weg WHERE path = ?1", [p]).map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())
}

/// Gelb „Artist“: Dateien nach `<Künstler>/<Song>/` kopieren, FLPs nach
/// 01_SAVEFILES, Exporte nach 03_VERSIONS (`assets`: nach 02_ASSETS, für Vocals).
/// Byte-gleiche Kopien, so erkennt der Scan sie danach als „schon da“. Der
/// Altbestand bleibt. Gibt den Song-Ordner zurück.
#[tauri::command(async)]
pub fn fund_zum_artist(artists_root: String, artist: String, song: String, dateien: Vec<String>, assets: Option<bool>) -> Result<String, String> {
    let ziel = artist_song_ordner(&artists_root, &artist, &song)?;
    zum_artist(&ziel, &dateien, assets.unwrap_or(false))
}

/// `<root>/<Artist>/<Song>`, oder `<Artist>/_Fertig/<Song>`, wenn der Song schon abgegeben ist
fn artist_song_ordner(artists_root: &str, artist: &str, song: &str) -> Result<PathBuf, String> {
    let artist = crate::utils::sanitize_filename_part(artist.trim());
    let song = crate::utils::sanitize_filename_part(song.trim());
    if artist.is_empty() || song.is_empty() { return Err("Artist und Song angeben".into()); }
    let kuenstler = Path::new(artists_root).join(artist);
    let fertig = kuenstler.join("_Fertig").join(&song);
    Ok(if fertig.is_dir() { fertig } else { kuenstler.join(song) })
}

/// Song-Ordner (oder lose Datei) aus einem Altbestand-„Artists“-Ordner
#[derive(Debug, Serialize)]
pub struct AltArtistSong {
    pub artist: String,
    pub song: String,
    pub pfad: String,
    pub dateien: usize,
    pub flps: usize,
    /// So viele liegen byte-gleich schon in 05_ARTISTS
    pub da: usize,
}

/// Alle Ordner namens „Artists“ in den Altbestand-Wurzeln (bis Tiefe 4): je
/// `<Artist>/<Song>` ein Eintrag, lose Dateien je ein eigener Song. Diese
/// Ordner überspringt der Fundstücke-Scan, sie ziehen hier als Ganzes um.
#[tauri::command(async)]
pub fn artist_ordner_altbestand(roots: Vec<String>, artists_root: String) -> Result<Vec<AltArtistSong>, String> {
    let mut vorhanden = Vec::new();
    collect_files(Path::new(&artists_root), Path::new(&artists_root), &mut vorhanden);
    let mut by_size: HashMap<u64, Vec<PathBuf>> = HashMap::new();
    for (s, p, _) in vorhanden { by_size.entry(s).or_default().push(p); }
    let mut wurzeln = Vec::new();
    for r in &roots { artists_ordner_finden(Path::new(r.trim()), 0, &mut wurzeln); }
    let mut out = Vec::new();
    for a in wurzeln {
        for e in std::fs::read_dir(&a).into_iter().flatten().flatten() {
            let p = e.path();
            let name = e.file_name().to_string_lossy().to_string();
            if p.is_dir() {
                for s in std::fs::read_dir(&p).into_iter().flatten().flatten() {
                    let sp = s.path();
                    let sn = s.file_name().to_string_lossy().to_string();
                    if sp.is_dir() && sn.eq_ignore_ascii_case("backup") { continue; }
                    if sp.is_file() && !ist_musik(&sp) { continue; }
                    out.push(alt_song(&name, &sp, &by_size));
                }
            } else if ist_musik(&p) {
                out.push(alt_song("", &p, &by_size)); // lose Datei ohne Artist
            }
        }
    }
    out.sort_by(|a, b| a.artist.to_lowercase().cmp(&b.artist.to_lowercase()).then(a.song.to_lowercase().cmp(&b.song.to_lowercase())));
    Ok(out)
}

fn ist_musik(p: &Path) -> bool {
    let e = endung(p);
    e == "flp" || AUDIO.contains(&e.as_str())
}

fn artists_ordner_finden(dir: &Path, tiefe: usize, out: &mut Vec<PathBuf>) {
    if tiefe > 4 { return; }
    for e in std::fs::read_dir(dir).into_iter().flatten().flatten() {
        let p = e.path();
        if !p.is_dir() { continue; }
        let n = e.file_name().to_string_lossy().to_lowercase();
        if n == "artists" { out.push(p); } else if !n.contains("backup") && n != "audio" { artists_ordner_finden(&p, tiefe + 1, out); }
    }
}

fn alt_song(artist: &str, p: &Path, by_size: &HashMap<u64, Vec<PathBuf>>) -> AltArtistSong {
    let mut alle = Vec::new();
    if p.is_dir() { collect_files(p, p, &mut alle); } else if let Ok(m) = std::fs::metadata(p) { alle.push((m.len(), p.to_path_buf(), String::new())); }
    let musik: Vec<&(u64, PathBuf, String)> = alle.iter().filter(|(_, f, _)| ist_musik(f)).collect();
    let da = musik.iter().filter(|(s, f, _)| by_size.get(s).is_some_and(|cs| cs.iter().any(|c| same_content(f, c)))).count();
    let song = if p.is_dir() { p.file_name() } else { p.file_stem() }.map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    AltArtistSong {
        artist: artist.to_string(), song, pfad: p.to_string_lossy().to_string(),
        dateien: musik.len(), flps: musik.iter().filter(|(_, f, _)| endung(f) == "flp").count(), da,
    }
}

#[derive(Debug, Serialize)]
pub struct KopierErgebnis {
    pub ordner: String,
    pub kopiert: usize,
    pub gleich: usize,
    /// Gleicher Name, anderer Inhalt: nicht überschrieben
    pub konflikte: Vec<String>,
}

/// Song-Ordner komplett nach `05_ARTISTS/<Artist>/<Song>/` kopieren, mit
/// Unterordnern (Audio, Samples, Backup), jede Kopie geprüft. Liegt eine Datei
/// schon da: gleich → übersprungen, anders → nicht überschrieben, gemeldet.
/// Eine lose Datei kommt wie bei „Artist“ nach 01_SAVEFILES/03_VERSIONS.
#[tauri::command(async)]
pub fn artist_ordner_kopieren(pfad: String, artists_root: String, artist: String, song: String) -> Result<KopierErgebnis, String> {
    let ziel = artist_song_ordner(&artists_root, &artist, &song)?;
    let quelle = Path::new(&pfad);
    if quelle.is_file() {
        zum_artist(&ziel, &[pfad.clone()], false)?;
        return Ok(KopierErgebnis { ordner: ziel.to_string_lossy().to_string(), kopiert: 1, gleich: 0, konflikte: vec![] });
    }
    let mut alle = Vec::new();
    collect_files(quelle, quelle, &mut alle);
    let mut erg = KopierErgebnis { ordner: ziel.to_string_lossy().to_string(), kopiert: 0, gleich: 0, konflikte: vec![] };
    for (_, f, rel) in alle {
        let d = ziel.join(&rel);
        if d.exists() {
            if same_content(&f, &d) { erg.gleich += 1; } else { erg.konflikte.push(rel); }
            continue;
        }
        std::fs::create_dir_all(d.parent().unwrap()).map_err(|e| format!("Ordner ließ sich nicht anlegen: {e}"))?;
        crate::utils::copy_and_verify(&f, &d)?;
        erg.kopiert += 1;
    }
    Ok(erg)
}

fn zum_artist(ziel: &Path, dateien: &[String], assets: bool) -> Result<String, String> {
    for d in dateien {
        let quelle = Path::new(d);
        let ordner = ziel.join(if endung(quelle) == "flp" { "01_SAVEFILES" } else if assets { "02_ASSETS" } else { "03_VERSIONS" });
        std::fs::create_dir_all(&ordner).map_err(|e| format!("Ordner ließ sich nicht anlegen: {e}"))?;
        // Gleicher Name, anderer Inhalt (drei verschiedene „Daydreams.flp“): daneben als „(2)“
        let Some(datei) = freier_name(quelle, &ordner.join(quelle.file_name().ok_or("Datei ohne Namen")?)) else { continue };
        crate::utils::copy_and_verify(quelle, &datei)?;
    }
    Ok(ziel.to_string_lossy().to_string())
}

/// Wohin die Kopie kommt: der Name selbst, sonst „Name (2).ext“, „(3)“ …
/// `None`: dieselbe Datei liegt dort schon (unter einem dieser Namen).
fn freier_name(quelle: &Path, ziel: &Path) -> Option<PathBuf> {
    let stamm = ziel.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let ext = ziel.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    (1..).map(|i| if i == 1 { ziel.to_path_buf() } else { ziel.with_file_name(format!("{stamm} ({i}){ext}")) })
        .find_map(|k| if !k.exists() { Some(Some(k)) } else if same_content(quelle, &k) { Some(None) } else { None })
        .flatten()
}

/// Gleicher Song dem Titel nach? „MISTAKES" passt zu „MISTAKE", „LightsOut"
/// zu „Lights Out". Leere Titel passen nie.
pub(crate) fn titel_passt(a: &str, b: &str) -> bool {
    let (a, b) = (normalize_title(a), normalize_title(b));
    !a.is_empty() && !b.is_empty() && (a == b || a.contains(&b) || b.contains(&a))
}

/// Belegt eine byte-gleiche Datei `c` im Archiv-Beat `e`, dass es derselbe
/// Song ist? Ja, wenn der Titel passt. Sonst nur, wenn `c` dort liegt, wo
/// Exporte liegen (nicht in 01_SAVEFILES, 03_PROJECTS, Samples, Audio: dort
/// stecken geteilte Tags und Vocals) und Key/BPM sich nicht widersprechen.
/// So zählt „GIVING UP [167 Am]" als HEADLIGHTS [Am 167], „BXII Tag.wav" in
/// Solanium/Samples dagegen nicht, und YaYa (Em 140) nicht als Paralysed (Cm 143).
pub(crate) fn gleicher_song(titel: &[&str], key: Option<&str>, bpm: Option<i32>, c: &Path, e: &ArchiveEntry) -> bool {
    // Widersprechen sich Key oder BPM, ist es nie sicher derselbe Song, auch
    // bei gleichem Titel (Destiny F#m 140 und Destiny Dm 181): dann gelb
    let gleich = |a: Option<&str>| a.and_then(super::einsammeln::key_schreibweise);
    let key_widerspruch = matches!((gleich(key), gleich(e.key.as_deref())), (Some(a), Some(b)) if a != b);
    let bpm_widerspruch = matches!((bpm, e.bpm), (Some(a), Some(b)) if a != b);
    if key_widerspruch || bpm_widerspruch {
        return false;
    }
    if titel.iter().any(|t| titel_passt(t, &e.title)) {
        return true;
    }
    let rel = c.strip_prefix(&e.path).unwrap_or(c);
    let im_projekt = rel.parent().into_iter().flat_map(|p| p.components())
        .any(|k| ["01_savefiles", "03_projects", "samples", "audio"].contains(&k.as_os_str().to_string_lossy().to_lowercase().as_str()));
    !im_projekt
}

/// Quelle (Vergleichsform) → (Änderungsdatum beim Archivieren, Protokoll)
type Herkunft = HashMap<String, (String, PathBuf)>;

fn herkunft_lesen(json: &Path, out: &mut Herkunft) {
    let Ok(roh) = std::fs::read_to_string(json) else { return };
    let Ok(v) = serde_json::from_str::<serde_json::Value>(&roh) else { return };
    for d in v.get("files").and_then(|f| f.as_array()).into_iter().flatten() {
        if let (Some(p), Some(m)) = (d.get("original_path").and_then(|x| x.as_str()), d.get("modified_at").and_then(|x| x.as_str())) {
            out.insert(p.replace('/', "\\").to_lowercase(), (m.to_string(), json.to_path_buf()));
        }
    }
}

#[tauri::command]
pub async fn scan_fundstuecke(app: tauri::AppHandle, roots: Vec<String>, archive_path: String) -> Result<Vec<Fund>, String> {
    // Zum Reinhören: der Player darf nur freigegebene Ordner lesen, und der
    // Altbestand (Music\Songs, Image-Line) liegt außerhalb der Bibliothek.
    {
        use tauri::Manager;
        let scope = app.asset_protocol_scope();
        for r in &roots {
            if let Err(e) = scope.allow_directory(r.trim(), true) {
                eprintln!("WARNING: cannot extend asset scope for {r}: {e}");
            }
        }
    }
    tauri::async_runtime::spawn_blocking(move || {
        let mut out = fundstuecke(&roots, Path::new(&archive_path))?;
        let weg = weg_lesen();
        for f in &mut out {
            for d in &mut f.dateien { d.weg = weg.contains(&d.path.to_lowercase()); }
            f.weg = f.dateien.iter().all(|d| d.weg);
        }
        Ok(out)
    })
        .await
        .map_err(|e| format!("Fundstücke-Scan abgestürzt: {e}"))?
}

pub(crate) fn fundstuecke(roots: &[String], archive_root: &Path) -> Result<Vec<Fund>, String> {
    if !archive_root.is_dir() {
        return Err(format!("Archiv-Ordner nicht gefunden: {}", archive_root.display()));
    }
    let index = read_archive_index(archive_root);
    let mut by_title: HashMap<String, Vec<usize>> = HashMap::new();
    let mut by_id: HashMap<u32, Vec<usize>> = HashMap::new();
    for (i, e) in index.iter().enumerate() {
        by_title.entry(normalize_title(&e.title)).or_default().push(i);
        by_id.entry(e.catalog_id).or_default().push(i);
    }
    // Exporte im Archiv nach Größe, für den Inhaltsvergleich
    let mut archiv_dateien = Vec::new();
    collect_files(archive_root, archive_root, &mut archiv_dateien);
    // Eingesammelte Remixe, Loops und Artist-Songs zählen als „schon da“, sonst stünden sie wieder da
    // ponytail: 05_ARTISTS fest neben dem Archiv, die Einstellung artists_path zählt hier nicht
    for nebenan in ["07_REMIXES", "06_SAMPLES", "05_ARTISTS"] {
        let d = archive_root.parent().unwrap_or(archive_root).join(nebenan);
        collect_files(&d, &d, &mut archiv_dateien);
    }
    let mut by_size: HashMap<u64, Vec<PathBuf>> = HashMap::new();
    // Herkunft aus create_date.json: eingesammelte FLPs sind umbenannt und
    // umgeschrieben, also nicht mehr byte-gleich. Das Protokoll weiß, woher
    // sie kamen; gilt, solange die Quelle seitdem nicht geändert wurde.
    let mut vermerkt: Herkunft = HashMap::new();
    for (size, p, _) in archiv_dateien {
        let ext = endung(&p);
        if ext == "flp" || AUDIO.contains(&ext.as_str()) {
            by_size.entry(size).or_default().push(p);
        } else if p.file_name().is_some_and(|n| n == "create_date.json") {
            herkunft_lesen(&p, &mut vermerkt);
        }
    }

    let mut orte = Vec::new();
    for r in roots {
        sammeln(Path::new(r.trim()), None, &mut orte);
    }

    // Gruppieren. Namenlose Exporte bleiben einzeln (Schlüssel = Pfad).
    let mut gruppen: BTreeMap<String, Vec<Fundort>> = BTreeMap::new();
    for f in orte {
        let k = match (projekt_ordner(&f.path), &f.werk) {
            // Projektordner der Produktion: alles darin ist ein Projekt, auch
            // namenlose FLPs und Bounces (Artist live da: Beat + Song in einem)
            (Some(p), _) => format!("p:{}", p.to_string_lossy().to_lowercase()),
            (None, Some(w)) => w.schluessel(),
            (None, None) if f.flp => continue, // Skizze
            (None, None) => format!("?:{}", f.path.display()),
        };
        gruppen.entry(k).or_default().push(f);
    }
    // Titel ohne Nummer an die eine Nummer mit gleichem Titel hängen.
    // Mehrere Nummern mit dem Titel: nichts raten, getrennt lassen.
    let mut nummer_zu_titel: HashMap<String, Vec<String>> = HashMap::new();
    for (k, fs) in &gruppen {
        if k.starts_with('#') {
            for t in fs.iter().filter_map(|f| f.werk.as_ref()).map(|w| normalize_title(&w.titel)).collect::<HashSet<_>>() {
                if !t.is_empty() {
                    nummer_zu_titel.entry(t).or_default().push(k.clone());
                }
            }
        }
    }
    for (t, nummern) in nummer_zu_titel {
        if let [ziel] = nummern.as_slice() {
            if let Some(fs) = gruppen.remove(&format!("t:{t}")) {
                gruppen.get_mut(ziel).unwrap().extend(fs);
            }
        }
    }
    // FLPs ohne Export (lose oder in einem eigenen Projektordner) an den einen
    // Eintrag mit Export hängen, der dieselbe Nummer oder denselben Titel trägt.
    // Sonst fielen sie raus, seit Projektordner eigene Einträge sind.
    // ponytail: O(Gruppen²), bei ein paar hundert Gruppen egal
    let merkmale = |fs: &[Fundort]| -> HashSet<String> {
        fs.iter().filter_map(|f| f.werk.as_ref()).flat_map(|w| {
            let t = normalize_title(&w.titel);
            [w.id.map(|i| format!("#{i}")), (!t.is_empty()).then(|| format!("t:{t}"))]
        }).flatten().collect()
    };
    let nur_flp: Vec<String> = gruppen.iter().filter(|(_, fs)| fs.iter().all(|f| f.flp)).map(|(k, _)| k.clone()).collect();
    for k in nur_flp {
        let m = merkmale(&gruppen[&k]);
        if m.is_empty() { continue; }
        let ziele: Vec<String> = gruppen.iter()
            .filter(|(k2, fs)| **k2 != k && fs.iter().any(|f| !f.flp) && !merkmale(fs).is_disjoint(&m))
            .map(|(k2, _)| k2.clone()).collect();
        if let [ziel] = ziele.as_slice() {
            let fs = gruppen.remove(&k).unwrap();
            gruppen.get_mut(ziel).unwrap().extend(fs);
        }
    }

    let mut out: Vec<Fund> = gruppen
        .into_values()
        .filter(|fs| fs.iter().any(|f| !f.flp)) // nur mit Export
        .map(|fs| bewerten(fs, &index, &by_title, &by_id, &by_size, &vermerkt))
        // Namenlose Bounces offener Projekte sind Zwischenstände, keine
        // verlorenen Songs: sie kommen beim Archivieren des Projekts mit
        .filter(|f| !(f.grund == "ohne Titel" && f.dateien.iter().all(|d| Path::new(&d.path).components()
            .any(|k| ist_projektname(&k.as_os_str().to_string_lossy())))))
        .collect();
    let rang = |a: &str| ["gruen", "gelb", "rot", "grau"].iter().position(|x| *x == a).unwrap_or(9);
    out.sort_by(|a, b| {
        rang(a.ampel).cmp(&rang(b.ampel)).then(a.id.cmp(&b.id)).then(a.titel.to_lowercase().cmp(&b.titel.to_lowercase()))
    });
    Ok(out)
}

fn bewerten(
    mut fs: Vec<Fundort>,
    index: &[ArchiveEntry],
    by_title: &HashMap<String, Vec<usize>>,
    by_id: &HashMap<u32, Vec<usize>>,
    by_size: &HashMap<u64, Vec<PathBuf>>,
    vermerkt: &Herkunft,
) -> Fund {
    fs.sort_by(|a, b| a.flp.cmp(&b.flp).then(b.modified.cmp(&a.modified)));
    let werke: Vec<&Werk> = fs.iter().filter_map(|f| f.werk.as_ref()).collect();
    let id = werke.iter().find_map(|w| w.id);
    let titel = werke.iter().map(|w| w.titel.clone()).find(|t| !t.is_empty())
        .unwrap_or_else(|| fs[0].path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default());
    let key = werke.iter().find_map(|w| w.key.clone());
    let bpm = werke.iter().find_map(|w| w.bpm);
    // Vergleichstitel nur aus echten Namen, nie aus dem Dateinamen „504"
    let titel_n = werke.iter().map(|w| normalize_title(&w.titel)).find(|t| !t.is_empty()).unwrap_or_default();
    let archiv_name = |i: usize| Some(index[i].folder.clone());
    let treffer: Vec<Option<PathBuf>> = fs.iter()
        .map(|f| {
            // Leere Datei (0 Bytes): da geht nichts verloren, zählt als „schon da“
            if f.size == 0 { return Some(f.path.clone()); }
            if let Some(c) = by_size.get(&f.size).and_then(|cs| cs.iter().find(|c| same_content(&f.path, c))) {
                return Some(c.clone());
            }
            // Im Protokoll vermerkt und seitdem unverändert (gleicher Tag)
            let tag = crate::utils::secs_to_date(f.modified as u64);
            vermerkt.get(&f.path.to_string_lossy().replace('/', "\\").to_lowercase())
                .filter(|(t, _)| *t == tag)
                .map(|(_, json)| json.clone())
        })
        .collect();
    let nur_hier = treffer.iter().filter(|t| t.is_none()).count();
    let fertig = fs.iter().filter(|f| !f.flp && f.modified > 0).map(|f| f.modified).min()
        .map(|s| crate::utils::secs_to_date(s as u64));
    let fund = |ampel, grund: &str, archiv| Fund {
        id, titel: titel.clone(), key: key.clone(), bpm, ampel, grund: grund.to_string(), archiv, nur_hier, fertig: fertig.clone(),
        dateien: fs.iter().zip(&treffer).map(|(f, t)| FundDatei {
            path: f.path.to_string_lossy().to_string(), size: f.size, modified: f.modified, flp: f.flp, im_archiv: t.is_some(),
            titel: f.werk.as_ref().map(|w| w.titel.clone()).filter(|t| !t.is_empty()),
            key: f.werk.as_ref().and_then(|w| w.key.clone()), bpm: f.werk.as_ref().and_then(|w| w.bpm),
            archiv: t.as_ref().and_then(|c| index.iter().find(|e| c.starts_with(&e.path))).map(|e| e.folder.clone()),
            weg: false,
        }).collect(),
        weg: false,
    };

    // Grau: dieselbe Datei liegt im Archiv, und zwar in einem Beat mit diesem
    // Titel. Ein Producer-Tag oder Vocal-Sample steckt in vielen Songs: liegt
    // es in einem anderen Beat, sagt das über diesen Song nichts.
    let titel_alle: Vec<&str> = werke.iter().map(|w| w.titel.as_str()).filter(|t| !normalize_title(t).is_empty()).collect();
    // Zwei Songs gleichen Titels in einem Eintrag (Destiny F#m 140 und Dm 181):
    // nie automatisch grau, das entscheidest du bei Gelb
    // Nur Exporte zählen: eine Skizzen-FLP „LoFi - Bpm140" neben dem fertigen
    // „LoFi - Bpm75 - D#m" macht noch keinen zweiten Song
    let uneinheitlich = {
        let export: Vec<&Werk> = fs.iter().filter(|f| !f.flp).filter_map(|f| f.werk.as_ref()).collect();
        let k: HashSet<String> = export.iter().filter_map(|w| w.key.as_deref().and_then(super::einsammeln::key_schreibweise)).collect();
        let b: HashSet<i32> = export.iter().filter_map(|w| w.bpm).collect();
        k.len() > 1 || b.len() > 1
    };
    let titel_set: HashSet<String> = werke.iter().map(|w| normalize_title(&w.titel)).filter(|t| !t.is_empty()).collect();
    let einziger_beat = || {
        let beats: HashSet<String> = treffer.iter().flatten()
            .filter_map(|c| index.iter().find(|e| c.starts_with(&e.path))).map(|e| e.folder.clone()).collect();
        (beats.len() == 1).then(|| beats.into_iter().next().unwrap())
    };
    // Jede Datei liegt schon im Archiv: nichts mehr zu entscheiden
    if nur_hier == 0 {
        return fund("grau", "gleiche Datei im Archiv", einziger_beat());
    }
    // Projektordner, dessen Exporte in genau einem Archiv-Beat liegen: archiviert.
    // Was dort fehlt (die Projekt-FLP, neuere Versionen), holt „Reste einsammeln“
    // nach. Die Archiv-FLP ist umgeschrieben und daher nie byte-gleich.
    if projekt_ordner(&fs[0].path).is_some() {
        let beats: HashSet<String> = fs.iter().zip(&treffer).filter(|(f, _)| !f.flp).filter_map(|(_, t)| t.as_ref())
            .filter_map(|c| index.iter().find(|e| c.starts_with(&e.path))).map(|e| e.folder.clone()).collect();
        if beats.len() == 1 {
            return fund("grau", "Projekt im Archiv", beats.into_iter().next());
        }
    }
    // Ein Projektordner mit mehreren Titeln bleibt ein Eintrag, nie aufteilen
    if (uneinheitlich || titel_set.len() > 1) && projekt_ordner(&fs[0].path).is_some() {
        return fund("gelb", "mehrere Titel im Projekt", einziger_beat());
    }
    for (f, t) in fs.iter().zip(&treffer) {
        if let (false, Some(c)) = (f.flp, t.as_ref()) {
            let beat = index.iter().find(|e| c.starts_with(&e.path));
            let passt = match beat {
                None => true, // 07_REMIXES, 06_SAMPLES
                Some(e) => titel_alle.is_empty() || gleicher_song(&titel_alle, key.as_deref(), bpm, c, e),
            };
            if passt && !uneinheitlich {
                return fund("grau", "gleiche Datei im Archiv", beat.map(|e| e.folder.clone()));
            }
        }
    }
    if uneinheitlich {
        return fund("gelb", "Key/BPM uneinheitlich", None);
    }
    // Grau: Nummer und Titel stimmen
    let mut nummer_belegt = None;
    if let Some(hits) = id.and_then(|i| by_id.get(&i)) {
        if let Some(&i) = hits.iter().find(|&&i| { let a = normalize_title(&index[i].title); !a.is_empty() && !titel_n.is_empty() && (a == titel_n || a.contains(&titel_n) || titel_n.contains(&a)) }) {
            return fund("grau", "Nummer und Titel im Archiv", archiv_name(i));
        }
        nummer_belegt = Some(hits[0]);
    }
    // Grau oder Gelb über den Titel
    let mut aehnlich = None;
    if let Some(hits) = by_title.get(&titel_n).filter(|_| !titel_n.is_empty() && !werke.is_empty()) {
        let passend: Vec<usize> = hits.iter().copied().filter(|&i| !contradicts(key.as_deref(), bpm, &index[i])).collect();
        match passend.as_slice() {
            [i] => return fund("grau", "Titel im Archiv", archiv_name(*i)),
            [] => aehnlich = Some(hits[0]),
            [i, ..] => return fund("gelb", "Titel mehrfach im Archiv", archiv_name(*i)),
        }
    }

    if fs.iter().any(|f| ist_remix(&f.path)) {
        return fund("rot", "Remix oder Mashup", None);
    }
    if let Some(i) = aehnlich {
        return fund("gelb", "gleicher Titel im Archiv, anderer Key/BPM", archiv_name(i));
    }
    if titel_set.len() > 1 {
        return fund("gelb", "Nummer mit mehreren Titeln", None);
    }
    if werke.is_empty() {
        return fund("gelb", "ohne Titel", None);
    }
    if id.is_none() {
        return fund("gelb", "ohne Nummer", None);
    }
    if titel_n.is_empty() {
        return fund("gelb", "nur Nummer", None);
    }
    if let Some(i) = nummer_belegt {
        return fund("gelb", "Nummer im Archiv mit anderem Titel", archiv_name(i));
    }
    fund("gruen", "nicht im Archiv", None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn datei(p: &Path, inhalt: &str) {
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, inhalt).unwrap();
    }

    #[test]
    fn ampel_fuer_altbestand() {
        let t = std::env::temp_dir().join(format!("beatos_fund_{}", std::process::id()));
        let _ = fs::remove_dir_all(&t);
        let arch = t.join("archiv");
        datei(&arch.join("2026/05_MAY/0618 - HEAT [D#m 152]/HEAT [D#m 152].mp3"), "heat");
        datei(&arch.join("2026/05_MAY/0700 - Bloom [Am 120]/Bloom [Am 120].mp3"), "bloom-neu");
        let alt = t.join("alt");
        // Grün, mit Version und FLP
        datei(&alt.join("[233] Dynastie - Dark Trap Beat - Bpm130 - A#.mp3"), "dyn");
        datei(&alt.join("[233_2] Dynastie - Dark Trap Beat - Bpm130 - A#.mp3"), "dyn2");
        datei(&alt.join("Beats/[233] Dynastie.flp"), "flp");
        // Grau über Nummer + Titel
        datei(&alt.join("[618] HEAT - 152 - D#m.mp3"), "anders");
        // Grau über gleiche Datei, obwohl der Name nichts sagt
        datei(&alt.join("whynot.mp3"), "heat");
        // Gelb: gleicher Titel, anderer Key
        datei(&alt.join("[630] Bloom - 138 D#m.mp3"), "bloom-alt");
        // Gelb: eine Nummer, zwei Songs
        datei(&alt.join("[301] Agony - 155 Fm.mp3"), "a");
        datei(&alt.join("[301] Sunset - 140 Am.mp3"), "b");
        datei(&alt.join("[539] YaYa - 140 Em/YaYa - 140 Em.mp3"), "yaya");
        // Produktion: nackte Zahl ist Bounce oder Titel, keine alte Nummer
        datei(&alt.join("Project_0753/2.mp3"), "bounce");
        // Skizzen-FLP mit anderem BPM macht keinen zweiten Song
        datei(&alt.join("LoFi239/[239] LoFi - Bpm75 - D#m.mp3"), "lofi");
        datei(&alt.join("LoFi239/[239] LoFi - Bpm75 - D#m.flp"), "lofi-flp");
        datei(&alt.join("LoFi239/[239] LoFi - Bpm140.flp"), "lofi-140");
        datei(&alt.join("800-899/1_3.mp3"), "bounce13");
        datei(&alt.join("Project_0572/100 Tausend_mix.mp3"), "tausend");
        // Gliederungsordner: nicht „Nr. 1 SAVEFILES“, der Song kommt vom Ordner darüber
        datei(&alt.join("Kira - Ember [Am 150]/01_SAVEFILES/Ember v2.mp3"), "ember");
        datei(&alt.join("Kira - Nova [Cm 140]/01_SAVEFILES/Nova.mp3"), "nova");
        datei(&alt.join("Lo-Fi/untitled.mp3"), "u");
        datei(&alt.join("test.mp3"), "t");
        datei(&arch.join("2026/05_MAY/0891 - test [F#m 135]/test.mp3"), "anderer test");
        datei(&alt.join("Beats/200-299/233_2.mp3"), "dyn3");
        datei(&alt.join("Beats/500-599/504 - Bpm 160 Cm.mp3"), "504");
        datei(&alt.join("Beats/2403.mp3"), "x");
        datei(&alt.join("700-799/lilpeep remix.mp3"), "lp");
        datei(&alt.join("700-799/[733] I Just Wanna - 136 Cm.mp3"), "ijw");
        // Rot
        datei(&alt.join("Remixes/Juice WRLD - Deprived Remix.mp3"), "r");
        // Skizze ohne Export: erscheint nicht
        datei(&alt.join("[400] Nur FLP.flp"), "s");
        // Ordner gibt den Namen, Datei darin ist namenlos
        datei(&alt.join("[795] Gotta Go Now - Am 140/untitled.mp3"), "go");
        // Unterordner Audio ist FL-Material
        datei(&alt.join("[795] Gotta Go Now - Am 140/Audio/rec.wav"), "rec");

        // Geteilter Producer-Tag: liegt in HEAT/Samples, macht Sunrise nicht grau
        datei(&arch.join("2026/05_MAY/0618 - HEAT [D#m 152]/01_SAVEFILES/Samples/BXII Tag.wav"), "tag");
        datei(&alt.join("[701] Sunrise - 140 Am/[701] Sunrise - 140 Am.mp3"), "sunrise");
        datei(&alt.join("[701] Sunrise - 140 Am/BXII Tag.wav"), "tag");
        // Als Loop eingesammelt: liegt in 06_SAMPLES, also schon da
        datei(&alt.join("No Names.mp3"), "loop");
        datei(&t.join("06_SAMPLES/S0001 - No Names/No Names.mp3"), "loop");
        let r = fundstuecke(&[alt.to_string_lossy().to_string()], &arch).unwrap();
        let finde = |id: u32| r.iter().find(|f| f.id == Some(id)).unwrap_or_else(|| panic!("{id} fehlt: {r:#?}"));
        assert_eq!(finde(233).ampel, "gruen");
        assert_eq!(finde(701).ampel, "gruen", "{:?}", finde(701));
        assert_eq!(finde(233).dateien.len(), 4);
        assert_eq!(finde(504).grund, "nur Nummer");
        assert_eq!(finde(504).bpm, Some(160));
        assert!(r.iter().all(|f| f.id != Some(700)));
        assert_eq!(finde(733).dateien.len(), 1);
        assert!(r.iter().any(|f| f.titel == "2403" && f.grund == "ohne Titel"));
        assert_eq!(finde(618).ampel, "grau");
        let whynot = r.iter().find(|f| f.titel == "whynot").unwrap();
        assert_eq!((whynot.nur_hier, whynot.dateien[0].im_archiv), (0, true));
        assert_eq!(finde(233).nur_hier, 4);
        assert_eq!(finde(630).ampel, "gelb");
        assert_eq!(finde(301).ampel, "gelb"); // zwei Songs unter einer Nummer
        assert_eq!(finde(795).ampel, "gruen");
        assert_eq!(finde(795).dateien.len(), 1);
        assert!(r.iter().all(|f| f.id != Some(400)));
        assert!(r.iter().any(|f| f.titel == "whynot" && f.ampel == "grau"));
        assert!(r.iter().any(|f| f.titel == "No Names" && f.ampel == "grau"), "Loop aus 06_SAMPLES nicht erkannt");
        // Artist: kopieren, danach grau
        datei(&alt.join("JarnoGm/Behind her mind.wav"), "bhm");
        datei(&alt.join("JarnoGm/Behind her mind.flp"), "bhm-flp");
        let vorher = fundstuecke(&[alt.to_string_lossy().to_string()], &arch).unwrap();
        let bhm = vorher.iter().find(|f| f.titel == "Behind her mind").unwrap();
        assert_eq!(bhm.ampel, "gelb");
        let pfade: Vec<String> = bhm.dateien.iter().map(|d| d.path.clone()).collect();
        let song = t.join("05_ARTISTS/JarnoGm/Behind her mind");
        zum_artist(&song, &pfade, false).unwrap();
        zum_artist(&song, &pfade, false).unwrap(); // zweimal: nichts doppelt, kein Fehler
        assert!(song.join("01_SAVEFILES/Behind her mind.flp").is_file() && song.join("03_VERSIONS/Behind her mind.wav").is_file());
        let nachher = fundstuecke(&[alt.to_string_lossy().to_string()], &arch).unwrap();
        assert_eq!(nachher.iter().find(|f| f.titel == "Behind her mind").unwrap().ampel, "grau");
        // Produktion: ein Projektordner ist ein Eintrag, auch mit Artist-Song,
        // namenloser FLP und Bounce. Beattag-Ordner erscheint nicht.
        let prod = t.join("01_ACTIVE_PRODUCTION");
        datei(&prod.join("Project_0572/100 Tausend_mix.mp3"), "ht");
        datei(&prod.join("Project_0572/JarnoGm - NACH VORN.mp3"), "nv");
        datei(&prod.join("Project_0572/Project_193.flp"), "p193");
        datei(&prod.join("Project_0572/2.mp3"), "bounce");
        datei(&alt.join("700-799/Beattag/BXII Tag.wav"), "eigener tag");
        // DISAPPEAR: Exporte im Archiv, nur die Projekt-FLP nicht (die Archiv-FLP
        // ist umgeschrieben): grau mit Reste, nicht gelb
        datei(&arch.join("2026/06_JUNE/0900 - DISAPPEAR [F#m 135]/DISAPPEAR [F#m 135].mp3"), "dis");
        datei(&prod.join("Project_0807/DISAPPEAR [F#m 135].mp3"), "dis");
        datei(&prod.join("Project_0807/DISAPEAR [F#m 135]_untagged.wav"), "dis-wav-neu");
        datei(&prod.join("Project_0807/Project_0807.flp"), "flp");
        let p = fundstuecke(&[prod.to_string_lossy().to_string(), alt.to_string_lossy().to_string()], &arch).unwrap();
        let dis = p.iter().find(|f| f.dateien.iter().any(|d| d.path.contains("Project_0807"))).unwrap();
        assert_eq!((dis.ampel, dis.archiv.as_deref(), dis.nur_hier, dis.dateien.len()), ("grau", Some("0900 - DISAPPEAR [F#m 135]"), 2, 3), "{dis:#?}");
        let im_projekt: Vec<&Fund> = p.iter().filter(|f| f.dateien.iter().any(|d| d.path.contains("Project_0572"))
            && f.dateien.iter().any(|d| d.path.contains("01_ACTIVE_PRODUCTION"))).collect();
        assert_eq!(im_projekt.len(), 1, "{im_projekt:#?}");
        assert_eq!((im_projekt[0].ampel, im_projekt[0].grund.as_str(), im_projekt[0].dateien.len()), ("gelb", "mehrere Titel im Projekt", 4));
        assert!(p.iter().all(|f| f.dateien.iter().all(|d| !d.path.contains("Beattag"))));
        assert!(r.iter().any(|f| f.ampel == "rot"));
        assert_eq!(finde(539).dateien.len(), 1);
        assert!(r.iter().all(|f| f.id != Some(1) && f.id != Some(2)), "Project_0753/2.mp3 als Nummer gelesen");
        assert_eq!((finde(239).ampel, finde(239).dateien.len()), ("gruen", 3), "{:?}", finde(239));
        // Namenloser Bounce im offenen Projekt: gar nicht in den Fundstücken
        assert!(r.iter().all(|f| !f.dateien.iter().any(|d| d.path.contains("Project_0753"))));
        let tausend = r.iter().find(|f| f.dateien[0].path.contains("100 Tausend")).unwrap();
        assert_eq!((tausend.id, tausend.titel.as_str()), (None, "100 Tausend_mix"));
        assert!(r.iter().all(|f| f.id != Some(1)), "01_SAVEFILES als Nummer gelesen");
        assert!(r.iter().any(|f| f.dateien.iter().any(|d| d.path.ends_with("Nova.mp3")) && f.titel == "Nova"));
        assert!(r.iter().all(|f| f.titel != "Lo-Fi"));
        assert!(r.iter().any(|f| f.titel == "test" && f.grund == "ohne Titel"));
        assert_eq!(werk_aus_name("[638] Cuthroat -150 - Gm.mp3", true, true).unwrap().titel, "Cuthroat");
        assert_eq!(werk_aus_name("397 . Master.mp3", true, true).unwrap().titel, "");
        // Projekt-Platzhalter sind kein Titel, im alten wie im neuen Schema
        assert!(werk_aus_name("P0039.flp", true, false).is_none() && werk_aus_name("Project_0039.flp", true, false).is_none());
        assert_eq!(werk_aus_name("Pain.mp3", true, false).unwrap().titel, "Pain");
        let anger = werk_aus_name("ANGER - 160 Am_2.mp3", true, true).unwrap();
        assert_eq!((anger.titel.as_str(), anger.key.as_deref(), anger.bpm), ("ANGER", Some("Am"), Some(160)));
        assert_eq!(werk_aus_name("473_Prototype.mp3", true, true).unwrap().titel, "");
        // Versionen ohne Unterstrich, aber keine echten Zahlentitel
        for (roh, titel) in [("Daydreams9", "Daydreams"), ("Show Off - 3", "Show Off"), ("Ten4", "Ten"), ("Nine - LoFi2", "Nine - LoFi"),
            ("Blink182", "Blink182"), ("Area51", "Area51"), ("Destiny 2", "Destiny 2"), ("Ten", "Ten"), ("UP2", "UP2"), ("146_4mp3", "146_4mp3"), ("Bump3", "Bump3")] {
            assert_eq!(ohne_version(roh), titel, "{roh}");
        }
        assert_eq!(ohne_tag("@xP4RA - Forever"), "Forever");
        assert_eq!(ohne_tag("Destiny - "), "Destiny");
        assert_eq!(ohne_tag("Victory @xP4RA"), "Victory");
        let _ = fs::remove_dir_all(&t);
    }

    #[test]
    fn artist_ordner_umziehen() {
        let t = std::env::temp_dir().join(format!("beatos_artord_{}", std::process::id()));
        let _ = fs::remove_dir_all(&t);
        let alt = t.join("Projects/Songs/Artists");
        datei(&alt.join("JarnoGm/Downbad high/Downbad high.flp"), "flp");
        datei(&alt.join("JarnoGm/Downbad high/Audio/vocals.wav"), "voc");
        datei(&alt.join("JarnoGm/Downbad high/notizen.txt"), "txt");
        datei(&alt.join("JarnoGm/Backup/x.flp"), "backup");
        datei(&alt.join("JarnoGm/Struggle.mp3"), "str");
        datei(&alt.join("Female Vocalist.mp3"), "fv");
        let ziel = t.join("05_ARTISTS");
        let r = artist_ordner_altbestand(vec![t.join("Projects").to_string_lossy().to_string()], ziel.to_string_lossy().to_string()).unwrap();
        let namen: Vec<(String, String, usize)> = r.iter().map(|s| (s.artist.clone(), s.song.clone(), s.dateien)).collect();
        assert_eq!(namen, vec![("".into(), "Female Vocalist".into(), 1), ("JarnoGm".into(), "Downbad high".into(), 2), ("JarnoGm".into(), "Struggle".into(), 1)]);
        let dh = &r[1];
        let e = artist_ordner_kopieren(dh.pfad.clone(), ziel.to_string_lossy().to_string(), "JarnoGm".into(), "Downbad high".into()).unwrap();
        assert_eq!((e.kopiert, e.gleich), (3, 0)); // alles, auch die Notiz
        assert!(ziel.join("JarnoGm/Downbad high/Audio/vocals.wav").is_file());
        // nochmal: nichts doppelt; anderer Inhalt wird nicht überschrieben
        fs::write(ziel.join("JarnoGm/Downbad high/notizen.txt"), "anders").unwrap();
        let e = artist_ordner_kopieren(dh.pfad.clone(), ziel.to_string_lossy().to_string(), "JarnoGm".into(), "Downbad high".into()).unwrap();
        assert_eq!((e.kopiert, e.gleich, e.konflikte.len()), (0, 2, 1));
        let r = artist_ordner_altbestand(vec![t.join("Projects").to_string_lossy().to_string()], ziel.to_string_lossy().to_string()).unwrap();
        assert_eq!(r[1].da, 2);
        // Vocals in 02_ASSETS
        fund_zum_artist(ziel.to_string_lossy().to_string(), "JarnoGm".into(), "Struggle".into(), vec![r[2].pfad.clone()], Some(true)).unwrap();
        assert!(ziel.join("JarnoGm/Struggle/02_ASSETS/Struggle.mp3").is_file());
        // Drei verschiedene „Daydreams.flp“: keine bricht ab, keine überschreibt, zweimal nichts doppelt
        let dd: Vec<String> = ["a", "b", "c"].iter().map(|x| {
            let p = t.join(format!("dd_{x}/Daydreams.flp")); datei(&p, x); p.to_string_lossy().to_string()
        }).collect();
        let song = ziel.join("GOODBXY/Daydreams");
        zum_artist(&song, &dd, false).unwrap();
        zum_artist(&song, &dd, false).unwrap();
        let mut namen: Vec<String> = fs::read_dir(song.join("01_SAVEFILES")).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().to_string()).collect();
        namen.sort();
        assert_eq!(namen, ["Daydreams (2).flp", "Daydreams (3).flp", "Daydreams.flp"]);
        let _ = fs::remove_dir_all(&t);
    }

    /// Echte Artist-Ordner: BEATOS_FUND_ROOTS, BEATOS_ARTISTS (nur lesend)
    #[test]
    #[ignore]
    fn artist_ordner_handprobe() {
        let roots: Vec<String> = std::env::var("BEATOS_FUND_ROOTS").unwrap().split(';').map(String::from).collect();
        let r = artist_ordner_altbestand(roots, std::env::var("BEATOS_ARTISTS").unwrap()).unwrap();
        for s in &r { println!("{:<22} {:<45} {:>3} Dateien {:>2} FLP {:>3} da  {}", s.artist, s.song, s.dateien, s.flps, s.da, s.pfad); }
        println!("{} Einträge, {} offen", r.len(), r.iter().filter(|s| s.da < s.dateien).count());
    }

    /// Alle offenen Artist-Ordner kopieren (schreibt!): BEATOS_FUND_ROOTS, BEATOS_ARTISTS.
    /// Ohne Artist → „Ohne Artist“.
    #[test]
    #[ignore]
    fn artist_ordner_alle_echt() {
        let roots: Vec<String> = std::env::var("BEATOS_FUND_ROOTS").unwrap().split(';').map(String::from).collect();
        let ziel = std::env::var("BEATOS_ARTISTS").unwrap();
        let (mut ok, mut fehler) = (0, 0);
        for s in artist_ordner_altbestand(roots, ziel.clone()).unwrap() {
            if s.dateien > 0 && s.da >= s.dateien { continue; }
            let artist = if s.artist.is_empty() { "Ohne Artist".to_string() } else { s.artist.clone() };
            match artist_ordner_kopieren(s.pfad.clone(), ziel.clone(), artist.clone(), s.song.clone()) {
                Ok(e) if e.konflikte.is_empty() => { ok += 1; println!("ok    {artist} / {}: {} kopiert, {} gleich", s.song, e.kopiert, e.gleich); }
                Ok(e) => { fehler += 1; println!("KONFL {artist} / {}: {} kopiert, nicht überschrieben: {:?}", s.song, e.kopiert, e.konflikte); }
                Err(e) => { fehler += 1; println!("FEHLER {artist} / {}: {e}", s.song); }
            }
        }
        println!("{ok} ok, {fehler} mit Problemen");
    }

    /// Echte Zahlen: BEATOS_FUND_ROOTS (mit ; getrennt), BEATOS_ARCHIVE, BEATOS_DUMP
    #[test]
    #[ignore]
    fn fund_handprobe() {
        let roots: Vec<String> = std::env::var("BEATOS_FUND_ROOTS").unwrap().split(';').map(String::from).collect();
        let r = fundstuecke(&roots, Path::new(&std::env::var("BEATOS_ARCHIVE").unwrap())).unwrap();
        let mut zahl: BTreeMap<&str, usize> = BTreeMap::new();
        for f in &r { *zahl.entry(f.ampel).or_default() += 1; }
        println!("{zahl:?}");
        let mut grund: BTreeMap<(&str, &str), usize> = BTreeMap::new();
        for f in &r { *grund.entry((f.ampel, f.grund.as_str())).or_default() += 1; }
        for (k, v) in grund { println!("{k:?}: {v}"); }
        if let Ok(p) = std::env::var("BEATOS_DUMP") {
            let zeilen: Vec<String> = r.iter().map(|f| format!("{}\t{}\t{}\t{}\t{}\t{}\t{}",
                f.ampel, f.id.map(|i| i.to_string()).unwrap_or_default(), f.titel, format!("{} (nur hier {})", f.grund, f.nur_hier),
                f.archiv.clone().unwrap_or_default(), f.dateien.len(), f.dateien.iter().map(|d| format!("{}{}", if d.im_archiv { "A:" } else { "" }, d.path)).collect::<Vec<_>>().join(" | "))).collect();
            fs::write(p, zeilen.join("\n")).unwrap();
        }
    }
}
