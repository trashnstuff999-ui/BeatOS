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
/// FL-Arbeitsmaterial, Sample-Packs, Vorlagen und Künstler (Scheibe 7).
const UEBERSPRINGEN: &[&str] = &["audio", "autosaves", "samples", "templates", "template", "coverarts", "files n presets", "artists"];

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
    let (titel, key, bpm) = parse_audio_filename(&format!("{stamm}.x"));
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

fn endung(p: &Path) -> String {
    p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase()
}

/// Rekursiv sammeln. `ordner_werk`: der nächste Elternordner mit Nummer oder
/// Titel, z. B. „[795] Gotta Go Now - Am 140". Namenlose Dateien erben ihn.
fn sammeln(dir: &Path, ordner_werk: Option<&Werk>, out: &mut Vec<Fundort>) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    let eimer = dir.components().rev().find_map(|k| eimer_bereich(&k.as_os_str().to_string_lossy()));
    let nackte_nr = !dir.components().any(|k| k.as_os_str().to_string_lossy().starts_with("Project_"));
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
    // Eingesammelte Remixe zählen als „schon da“, sonst stünden sie wieder rot
    let remixe = archive_root.parent().unwrap_or(archive_root).join("07_REMIXES");
    collect_files(&remixe, &remixe, &mut archiv_dateien);
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
        let k = match &f.werk {
            Some(w) => w.schluessel(),
            None if f.flp => continue, // Skizze
            None => format!("?:{}", f.path.display()),
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

    let mut out: Vec<Fund> = gruppen
        .into_values()
        .filter(|fs| fs.iter().any(|f| !f.flp)) // nur mit Export
        .map(|fs| bewerten(fs, &index, &by_title, &by_id, &by_size, &vermerkt))
        // Namenlose Bounces offener Projekte sind Zwischenstände, keine
        // verlorenen Songs: sie kommen beim Archivieren des Projekts mit
        .filter(|f| !(f.grund == "ohne Titel" && f.dateien.iter().all(|d| Path::new(&d.path).components()
            .any(|k| k.as_os_str().to_string_lossy().starts_with("Project_")))))
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
            if f.size == 0 { return None; }
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
    for (f, t) in fs.iter().zip(&treffer) {
        if let (false, Some(c)) = (f.flp, t.as_ref()) {
            let beat = index.iter().find(|e| c.starts_with(&e.path));
            let passt = match beat {
                None => true, // 07_REMIXES
                Some(e) => titel_alle.is_empty() || gleicher_song(&titel_alle, key.as_deref(), bpm, c, e),
            };
            if passt && !uneinheitlich {
                return fund("grau", "gleiche Datei im Archiv", beat.map(|e| e.folder.clone()));
            }
        }
    }
    if uneinheitlich {
        // Jede Datei liegt schon im Archiv (Try mit 132 und 85 BPM eingesammelt):
        // nichts mehr zu entscheiden
        if nur_hier == 0 {
            let beats: HashSet<String> = treffer.iter().flatten()
                .filter_map(|c| index.iter().find(|e| c.starts_with(&e.path))).map(|e| e.folder.clone()).collect();
            return fund("grau", "gleiche Datei im Archiv", (beats.len() == 1).then(|| beats.into_iter().next().unwrap()));
        }
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
    let titel_set: HashSet<String> = werke.iter().map(|w| normalize_title(&w.titel)).filter(|t| !t.is_empty()).collect();
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
