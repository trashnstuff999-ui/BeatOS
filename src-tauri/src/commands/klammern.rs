// src-tauri/src/commands/klammern.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Namensregel, Scheibe 4 (docs/namensregeln.md): das Archiv von `[Bm 145]` auf
// `[145 Bmin]` umstellen. Umbau-Werkzeug, läuft nur über die Handprobe
// `klammern_echt` und kommt danach wieder weg.
//
// Geändert wird nur die Klammer, rein am Text: Titel, Etiketten und alles andere
// bleiben. Je Beat der Ordner und die Dateien im Root und in 01_SAVEFILES
// (02_OLD, Backup und tiefere Ordner nicht). Dazu beats.path und alle FLPs der
// Bibliothek, die auf einen umbenannten Ordner oder eine umbenannte Datei zeigen
// (Sicherung „(vor Klammer-Umstellung)“ in Backup/). Eine Klammer, die sich
// nicht sicher lesen lässt (`[No Key No]`), bleibt stehen.
// Protokoll vorab; Rückgängig dreht alles um.
// ═══════════════════════════════════════════════════════════════════════════════
#![allow(dead_code)]

use crate::commands::flp::{audio_pfade, flp_umschreiben};
use crate::commands::pfadreparatur::dateien;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// `X [Bm 145]_tagged.mp3` → `X [145 Bmin]_tagged.mp3`. None, wenn es nichts zu
/// tun gibt oder in der Klammer etwas anderes steht als ein Tempo und eine Tonart.
pub(crate) fn klammer_neu(name: &str) -> Option<String> {
    let (lb, rb) = (name.rfind('[')?, name.rfind(']')?);
    if lb == 0 || lb > rb { return None; }
    let (mut bpm, mut key) = (None, None);
    for t in name[lb + 1..rb].split_whitespace() {
        match t.parse::<i32>() {
            Ok(n) if (40..=300).contains(&n) && bpm.is_none() => bpm = Some(n),
            Err(_) if crate::utils::is_valid_key(t) && key.is_none() => key = Some(t),
            _ => return None,
        }
    }
    if bpm.is_none() && key.is_none() { return None; }
    let neu = format!("{}{}{}", name[..lb].trim_end(), crate::utils::klammer(key, bpm), &name[rb + 1..]);
    (neu != name).then_some(neu)
}

/// Titel eines Beat-Ordners: `B0013 - Agony [155 Fmin]` → `Agony`.
fn ordner_titel(ordner: &str) -> Option<&str> {
    let rest = ordner.split_once(" - ")?.1;
    let titel = if rest.ends_with(']') { rest.rfind(" [").map_or(rest, |i| &rest[..i]) } else { rest };
    (!titel.trim().is_empty()).then_some(titel)
}

/// Steht der Titel vorn im Namen, wird er groß (Stephan, 16.11.2026):
/// `Agony [155 Fmin].mp3` → `AGONY [155 Fmin].mp3`. Alles dahinter bleibt, und
/// Dateien, die anders anfangen (das Video mit dem YouTube-Titel), bleiben ganz.
fn titel_gross(name: &str, titel: &str) -> String {
    match name.get(..titel.len()) {
        Some(a) if a.to_lowercase() == titel.to_lowercase()
            && !name[titel.len()..].starts_with(|c: char| c.is_alphanumeric()) => format!("{}{}", titel.to_uppercase(), &name[titel.len()..]),
        _ => name.to_string(),
    }
}

/// Neuer Name eines Ordners oder einer Datei: Klammer nach Regel, Titel groß.
fn neuer_name(name: &str, titel: Option<&str>, ist_ordner: bool) -> String {
    let n = klammer_neu(name).unwrap_or_else(|| name.to_string());
    match (n.split_once(" - "), titel) {
        // Ordner: der Titel steht hinter der Nummer
        (Some((nr, rest)), Some(t)) if ist_ordner => format!("{} - {}", nr, titel_gross(rest, t)),
        (_, Some(t)) => titel_gross(&n, t),
        _ => n,
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Beat {
    pub id: String,
    pub alt_pfad: PathBuf,
    pub neu_pfad: PathBuf,
    /// (alt, neu), relativ zum Beat-Ordner
    pub dateien: Vec<(String, String)>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct Protokoll {
    pub beats: Vec<Beat>,
    /// So viele Beats sind auf der Platte umbenannt
    pub fertig: usize,
    pub db: bool,
    pub flps: Vec<PathBuf>,
}

/// Was sich ändern würde, und was liegen bleibt (Grund je Zeile). Rein lesend.
pub(crate) fn planen(conn: &rusqlite::Connection) -> Result<(Vec<Beat>, Vec<String>), String> {
    let zeilen: Vec<(String, String)> = conn.prepare("SELECT id, path FROM beats ORDER BY id").map_err(|e| e.to_string())?
        .query_map([], |r| Ok((r.get(0)?, r.get::<_, Option<String>>(1)?.unwrap_or_default()))).map_err(|e| e.to_string())?
        .flatten().collect();
    Ok(ordner_planen(zeilen))
}

/// Sample-Ordner mit Nummer (`S0022 - BELGIUM [D#m 140]`), derselbe Plan ohne DB.
pub(crate) fn samples_planen(root: &Path) -> (Vec<Beat>, Vec<String>) {
    let mut zeilen: Vec<(String, String)> = std::fs::read_dir(root).into_iter().flatten().flatten()
        .filter(|e| e.path().is_dir())
        .filter_map(|e| {
            let n = e.file_name().to_string_lossy().to_string();
            let nr = n.strip_prefix('S')?.chars().take_while(|c| c.is_ascii_digit()).collect::<String>();
            // Nur wo eine Klammer steht: ohne Tempo und Tonart bleibt der Ordner, wie er ist
            (!nr.is_empty() && n.ends_with(']')).then(|| (format!("S{nr}"), e.path().to_string_lossy().to_string()))
        }).collect();
    zeilen.sort();
    ordner_planen(zeilen)
}

/// Lose Dateien einer Ablage (`_MIDI`): Klammer nach Regel, der Name davor groß.
pub(crate) fn ablage_planen(ordner: &Path) -> Option<Beat> {
    let mut umbenannt = Vec::new();
    for e in std::fs::read_dir(ordner).into_iter().flatten().flatten().filter(|e| e.path().is_file()) {
        let n = e.file_name().to_string_lossy().to_string();
        let stamm = n.rsplit_once('.').map_or(n.as_str(), |(s, _)| s);
        let neu = neuer_name(&n, Some(stamm.split(" [").next().unwrap_or(stamm)), false);
        if neu != n { umbenannt.push((n, neu)); }
    }
    umbenannt.sort();
    (!umbenannt.is_empty()).then(|| Beat { id: "Ablage".into(), alt_pfad: ordner.to_path_buf(), neu_pfad: ordner.to_path_buf(), dateien: umbenannt })
}

fn ordner_planen(zeilen: Vec<(String, String)>) -> (Vec<Beat>, Vec<String>) {
    let (mut plan, mut bleibt) = (Vec::new(), Vec::new());
    for (id, pfad) in zeilen {
        let alt_pfad = PathBuf::from(pfad.replace('/', "\\"));
        if !alt_pfad.is_dir() { bleibt.push(format!("{id}: Ordner fehlt ({pfad})")); continue; }
        let ordner = alt_pfad.file_name().unwrap_or_default().to_string_lossy().to_string();
        let titel = ordner_titel(&ordner);
        let ordner_neu = neuer_name(&ordner, titel, true);
        let neu_pfad = alt_pfad.with_file_name(&ordner_neu);
        // Nur Groß/Klein anders: Windows meldet das Ziel als vorhanden, umbenennen geht trotzdem
        if !ordner_neu.eq_ignore_ascii_case(&ordner) && neu_pfad.exists() { bleibt.push(format!("{id}: Ziel gibt es schon ({})", neu_pfad.display())); continue; }
        let mut umbenannt = Vec::new();
        for unter in ["", "01_SAVEFILES"] {
            let mut namen: Vec<String> = std::fs::read_dir(alt_pfad.join(unter)).into_iter().flatten().flatten()
                .filter(|e| e.path().is_file()).map(|e| e.file_name().to_string_lossy().to_string()).collect();
            namen.sort();
            for n in &namen {
                let neu = neuer_name(n, titel, false);
                if neu == *n { continue; }
                if namen.iter().any(|x| x != n && x.eq_ignore_ascii_case(&neu)) { bleibt.push(format!("{id}: „{neu}“ gibt es schon")); continue; }
                let rel = |x: &str| Path::new(unter).join(x).to_string_lossy().to_string();
                umbenannt.push((rel(n), rel(&neu)));
            }
        }
        if neu_pfad != alt_pfad || !umbenannt.is_empty() {
            plan.push(Beat { id, alt_pfad, neu_pfad, dateien: umbenannt });
        }
    }
    (plan, bleibt)
}

fn schreiben(p: &Path, prot: &Protokoll) -> Result<(), String> {
    std::fs::write(p, serde_json::to_string_pretty(prot).unwrap()).map_err(|e| format!("Protokoll: {e}"))
}

/// Ein Beat auf der Platte, vor oder zurück. Scheitert ein Schritt, ist der Beat wieder wie vorher.
fn platte(b: &Beat, rueck: bool) -> Result<(), String> {
    let (von, nach) = if rueck { (&b.neu_pfad, &b.alt_pfad) } else { (&b.alt_pfad, &b.neu_pfad) };
    let paar = |d: &(String, String)| if rueck { (von.join(&d.1), von.join(&d.0)) } else { (von.join(&d.0), von.join(&d.1)) };
    for (i, d) in b.dateien.iter().enumerate() {
        let (a, z) = paar(d);
        if let Err(e) = std::fs::rename(&a, &z) {
            for v in b.dateien[..i].iter().rev() { let (a, z) = paar(v); let _ = std::fs::rename(&z, &a); }
            return Err(format!("{}: {e}", a.display()));
        }
    }
    if von != nach {
        if let Err(e) = std::fs::rename(von, nach) {
            for v in b.dateien.iter().rev() { let (a, z) = paar(v); let _ = std::fs::rename(&z, &a); }
            return Err(format!("{}: {e}", von.display()));
        }
    }
    Ok(())
}

fn klein(p: &Path) -> String { p.to_string_lossy().replace('/', "\\").to_lowercase() }

/// FLPs, die auf einen umbenannten Ordner oder eine umbenannte Datei zeigen, umbiegen.
fn flps_umbiegen(beats: &[Beat], wurzeln: &[PathBuf], rueck: bool, nur: Option<&[PathBuf]>) -> Result<Vec<PathBuf>, String> {
    // alter Pfad (klein) → neuer Pfad, für Ordner und einzelne Dateien
    let mut ordner: HashMap<String, PathBuf> = HashMap::new();
    let mut einzeln: HashMap<String, PathBuf> = HashMap::new();
    for b in beats {
        let (von, nach) = if rueck { (&b.neu_pfad, &b.alt_pfad) } else { (&b.alt_pfad, &b.neu_pfad) };
        ordner.insert(klein(von), nach.clone());
        for (a, n) in &b.dateien {
            let (a, n) = if rueck { (n, a) } else { (a, n) };
            einzeln.insert(klein(&von.join(a)), nach.join(n));
        }
    }
    let mut flps = Vec::new();
    match nur {
        Some(l) => flps.extend(l.iter().cloned()),
        None => for w in wurzeln {
            let mut alle = Vec::new();
            dateien(w, true, &mut alle);
            flps.extend(alle.into_iter().filter(|p| p.extension().is_some_and(|e| e.eq_ignore_ascii_case("flp"))));
        },
    }
    let mut geaendert = Vec::new();
    for flp in flps {
        let Ok(bytes) = std::fs::read(&flp) else { continue };
        let ersatz: Vec<(String, String)> = audio_pfade(&bytes).into_iter().filter_map(|p| {
            let pp = PathBuf::from(p.replace('/', "\\"));
            if let Some(z) = einzeln.get(&klein(&pp)) {
                return (klein(z) != klein(&pp)).then(|| (p, z.to_string_lossy().to_string()));
            }
            pp.ancestors().skip(1).find_map(|a| ordner.get(&klein(a)).map(|nach| nach.join(pp.strip_prefix(a).unwrap())))
                // Nur Groß/Klein anders: der Pfad stimmt für Windows weiter, die FLP bleibt
                .filter(|z| klein(z) != klein(&pp)).map(|z| (p, z.to_string_lossy().to_string()))
        }).collect();
        if ersatz.is_empty() { continue; }
        flp_umschreiben(&flp, &ersatz, if rueck { "vor Rückgängig Klammer-Umstellung" } else { "vor Klammer-Umstellung" })?;
        geaendert.push(flp);
    }
    Ok(geaendert)
}

fn db_pfade(conn: &mut rusqlite::Connection, beats: &[Beat], rueck: bool) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for b in beats {
        let pfad = if rueck { &b.alt_pfad } else { &b.neu_pfad };
        let n = tx.execute("UPDATE beats SET path = ?1 WHERE id = ?2", rusqlite::params![pfad.to_string_lossy(), b.id]).map_err(|e| e.to_string())?;
        if n != 1 { return Err(format!("Beat {} nicht gefunden", b.id)); }
    }
    tx.commit().map_err(|e| e.to_string())
}

/// Der Lauf. Protokoll wird vorab geschrieben und nach jedem Schritt erneuert.
pub(crate) fn ausfuehren(conn: &mut rusqlite::Connection, plan: Vec<Beat>, wurzeln: &[PathBuf], protokoll: &Path) -> Result<Protokoll, String> {
    let mut prot = Protokoll { beats: plan, ..Default::default() };
    schreiben(protokoll, &prot)?;
    for i in 0..prot.beats.len() {
        if let Err(e) = platte(&prot.beats[i], false) {
            for v in prot.beats[..i].iter().rev() { let _ = platte(v, true); }
            return Err(format!("{e}; alles zurückgenommen"));
        }
        prot.fertig = i + 1;
    }
    schreiben(protokoll, &prot)?;
    if let Err(e) = db_pfade(conn, &prot.beats, false) {
        for v in prot.beats.iter().rev() { let _ = platte(v, true); }
        prot.fertig = 0;
        let _ = schreiben(protokoll, &prot);
        return Err(format!("DB: {e}; Platte zurückgenommen"));
    }
    prot.db = true;
    schreiben(protokoll, &prot)?;
    prot.flps = flps_umbiegen(&prot.beats, wurzeln, false, None)?;
    schreiben(protokoll, &prot)?;
    Ok(prot)
}

pub(crate) fn rueckgaengig(conn: &mut rusqlite::Connection, protokoll: &Path) -> Result<(), String> {
    let prot: Protokoll = serde_json::from_str(&std::fs::read_to_string(protokoll).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    flps_umbiegen(&prot.beats, &[], true, Some(&prot.flps))?;
    if prot.db { db_pfade(conn, &prot.beats, true)?; }
    for b in prot.beats.iter().take(prot.fertig).rev() { platte(b, true)?; }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn flp_mit(pfade: &[String]) -> Vec<u8> {
        let mut daten = Vec::new();
        for p in pfade { daten.extend(crate::commands::flp::pfad_ereignis(p)); }
        let mut b = b"FLhd".to_vec();
        b.extend(6u32.to_le_bytes()); b.extend([0u8; 6]);
        b.extend(b"FLdt"); b.extend((daten.len() as u32).to_le_bytes()); b.extend(daten);
        b
    }

    #[test]
    fn nur_die_klammer() {
        for (alt, neu) in [
            ("B0403 - NO MAN'S LAND [Bm 145]", Some("B0403 - NO MAN'S LAND [145 Bmin]")),
            ("NO MAN'S LAND [Bm 145]_tagged.mp3", Some("NO MAN'S LAND [145 Bmin]_tagged.mp3")),
            ("Smoke [114].mp3", None),
            ("Hope [F#]", Some("Hope [F#maj]")),
            ("X [145 Bmin]_untagged.wav", None),
            ("Y [No Key No]", None),
            ("[663] Loyal - 93 C#m.mp3", None),
            ("NO MAN'S LAND_Cover_2000x2000.png", None),
        ] {
            assert_eq!(klammer_neu(alt).as_deref(), neu, "{alt}");
        }
    }

    #[test]
    fn archiv_umstellen_und_zurueck() {
        let t = std::env::temp_dir().join(format!("beatos_klammern_{}", std::process::id()));
        let _ = fs::remove_dir_all(&t);
        let beat = t.join("03_ARCHIVE/2026/11_NOVEMBER/B0403 - LAND [Bm 145]");
        let smoke = t.join("03_ARCHIVE/2026/11_NOVEMBER/B0159 - Smoke [114]");
        for f in ["LAND [Bm 145]_untagged.wav", "LAND [Bm 145]_tagged.mp3", "LAND_Cover_2000x2000.png",
                  "01_SAVEFILES/LAND [Bm 145].flp", "01_SAVEFILES/Audio/vox.wav", "02_OLD/LAND [Bm 145]_tagged.mp3"] {
            let p = beat.join(f);
            fs::create_dir_all(p.parent().unwrap()).unwrap(); fs::write(p, "x").unwrap();
        }
        for f in ["Smoke [114].mp3", "smoke_Cover_2000x2000.png", "Type Beat 2026 - Smoke.mp4"] {
            fs::create_dir_all(&smoke).unwrap(); fs::write(smoke.join(f), "x").unwrap();
        }
        let s = |p: PathBuf| p.to_string_lossy().to_string();
        // Die eigene FLP zeigt in den eigenen Ordner, ein Song auf die WAV des Beats
        let flp = beat.join("01_SAVEFILES/LAND [Bm 145].flp");
        fs::write(&flp, flp_mit(&[s(beat.join("01_SAVEFILES/Audio/vox.wav"))])).unwrap();
        let song = t.join("05_ARTISTS/X/Song/Song.flp");
        fs::create_dir_all(song.parent().unwrap()).unwrap();
        fs::write(&song, flp_mit(&[s(beat.join("LAND [Bm 145]_untagged.wav"))])).unwrap();
        let vorher = audio_pfade(&fs::read(&song).unwrap());

        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE beats (id TEXT PRIMARY KEY, path TEXT);").unwrap();
        conn.execute("INSERT INTO beats VALUES ('0403', ?1), ('0159', ?2), ('0001', 'C:\\gibt\\es\\nicht')",
            [s(beat.clone()).replace("\\11_NOVEMBER", "/11_NOVEMBER"), s(smoke.clone())]).unwrap();

        let (plan, bleibt) = planen(&conn).unwrap();
        assert_eq!(plan.len(), 2);
        assert_eq!(plan[0].dateien, [("Smoke [114].mp3".to_string(), "SMOKE [114].mp3".to_string()), ("smoke_Cover_2000x2000.png".to_string(), "SMOKE_Cover_2000x2000.png".to_string())]);
        assert_eq!(bleibt.len(), 1, "{bleibt:?}");
        assert_eq!(plan[1].dateien.len(), 3);
        let prot_pfad = t.join("lauf.json");
        let prot = ausfuehren(&mut conn, plan, &[t.clone()], &prot_pfad).unwrap();

        let neu = beat.with_file_name("B0403 - LAND [145 Bmin]");
        for f in ["LAND [145 Bmin]_untagged.wav", "LAND [145 Bmin]_tagged.mp3", "LAND_Cover_2000x2000.png",
                  "01_SAVEFILES/LAND [145 Bmin].flp", "02_OLD/LAND [Bm 145]_tagged.mp3"] {
            assert!(neu.join(f).is_file(), "{f}");
        }
        assert!(!beat.exists());
        let namen = |d: &Path| fs::read_dir(d).unwrap().flatten().map(|e| e.file_name().to_string_lossy().to_string()).collect::<Vec<_>>();
        assert!(namen(smoke.parent().unwrap()).contains(&"B0159 - SMOKE [114]".to_string()));
        assert!(namen(&smoke).contains(&"SMOKE [114].mp3".to_string()) && namen(&smoke).contains(&"Type Beat 2026 - Smoke.mp4".to_string()));
        let pfad: String = conn.query_row("SELECT path FROM beats WHERE id = '0403'", [], |r| r.get(0)).unwrap();
        assert_eq!(PathBuf::from(pfad), neu);
        for f in [neu.join("01_SAVEFILES/LAND [145 Bmin].flp"), song.clone()] {
            for x in audio_pfade(&fs::read(&f).unwrap()) { assert!(Path::new(&x).is_file(), "{x}"); }
        }
        assert_eq!(prot.flps.len(), 2);
        assert!(planen(&conn).unwrap().0.is_empty(), "zweimal: nichts mehr zu tun");

        rueckgaengig(&mut conn, &prot_pfad).unwrap();
        assert!(beat.join("LAND [Bm 145]_untagged.wav").is_file() && flp.is_file() && !neu.exists());
        assert!(namen(smoke.parent().unwrap()).contains(&"B0159 - Smoke [114]".to_string()) && namen(&smoke).contains(&"Smoke [114].mp3".to_string()));
        // Derselbe Pfad wie vorher (der Test baut ihn mit „/“, geschrieben wird „\“)
        let gleich = |v: Vec<String>| v.iter().map(|p| p.replace('/', "\\")).collect::<Vec<_>>();
        assert_eq!(gleich(audio_pfade(&fs::read(&song).unwrap())), gleich(vorher));
        let _ = fs::remove_dir_all(&t);
    }

    /// Echt, Samples und MIDI-Ablage (ohne DB): BEATOS_SAMPLES (06_SAMPLES), BEATOS_LISTE. Ohne
    /// BEATOS_SCHREIBEN=1 nur die Liste; zum Schreiben BEATOS_WURZELN (;) und BEATOS_PROTOKOLL.
    /// Rückgängig: BEATOS_RUECK=1 mit demselben Protokoll.
    #[test]
    #[ignore]
    fn samples_klammern_echt() {
        let prot_pfad = std::env::var("BEATOS_PROTOKOLL").map(PathBuf::from);
        if std::env::var("BEATOS_RUECK").is_ok_and(|v| v == "1") {
            let mut conn = rusqlite::Connection::open_in_memory().unwrap();
            rueckgaengig(&mut conn, &prot_pfad.unwrap()).unwrap();
            println!("zurückgenommen");
            return;
        }
        let root = PathBuf::from(std::env::var("BEATOS_SAMPLES").unwrap());
        let (mut plan, bleibt) = samples_planen(&root);
        // Ordner, die schon nach Regel heißen: ihre Spuren benennt „Nachziehen" in der App, nicht dieser Lauf
        plan.retain(|b| b.alt_pfad != b.neu_pfad);
        plan.extend(ablage_planen(&root.join("_MIDI")));
        let mut liste = String::from("\u{feff}Wo;Alt;Neu\r\n");
        for b in &plan {
            let n = |p: &Path| p.file_name().unwrap_or_default().to_string_lossy().to_string();
            if b.alt_pfad != b.neu_pfad { liste.push_str(&format!("{};{};{}\r\n", b.id, n(&b.alt_pfad), n(&b.neu_pfad))); }
            for (a, z) in &b.dateien { liste.push_str(&format!("{};  {a};  {z}\r\n", b.id)); }
        }
        for z in &bleibt { liste.push_str(&format!("bleibt;{z};\r\n")); }
        fs::write(std::env::var("BEATOS_LISTE").unwrap(), &liste).unwrap();
        println!("{liste}");
        if std::env::var("BEATOS_SCHREIBEN").is_ok_and(|v| v == "1") {
            let wurzeln: Vec<PathBuf> = std::env::var("BEATOS_WURZELN").unwrap().split(';').map(PathBuf::from).collect();
            let prot_pfad = prot_pfad.unwrap();
            let mut prot = Protokoll { beats: plan, ..Default::default() };
            schreiben(&prot_pfad, &prot).unwrap();
            for i in 0..prot.beats.len() {
                platte(&prot.beats[i], false).unwrap();
                prot.fertig = i + 1;
                schreiben(&prot_pfad, &prot).unwrap();
            }
            prot.flps = flps_umbiegen(&prot.beats, &wurzeln, false, None).unwrap();
            schreiben(&prot_pfad, &prot).unwrap();
            println!("fertig: {} Ordner, {} FLPs umgebogen", prot.fertig, prot.flps.len());
        }
    }

    /// Echt: BEATOS_DB (echte beats.db), BEATOS_LISTE (Ausgabe alt;neu). Ohne BEATOS_SCHREIBEN=1 nur die Liste.
    /// Zum Schreiben dazu BEATOS_WURZELN (;) und BEATOS_PROTOKOLL. Rückgängig: BEATOS_RUECK=1 mit demselben Protokoll.
    #[test]
    #[ignore]
    fn klammern_echt() {
        let mut conn = rusqlite::Connection::open(std::env::var("BEATOS_DB").unwrap()).unwrap();
        if std::env::var("BEATOS_RUECK").is_ok_and(|v| v == "1") {
            rueckgaengig(&mut conn, Path::new(&std::env::var("BEATOS_PROTOKOLL").unwrap())).unwrap();
            println!("zurückgenommen");
            return;
        }
        let (mut plan, bleibt) = planen(&conn).unwrap();
        // BEATOS_NUR (IDs, ;): Probelauf mit wenigen Beats
        if let Ok(nur) = std::env::var("BEATOS_NUR") {
            let nur: Vec<&str> = nur.split(';').collect();
            plan.retain(|b| nur.contains(&b.id.as_str()));
        }
        let mut liste = String::from("\u{feff}Beat;Alt;Neu\r\n");
        for b in &plan {
            let n = |p: &Path| p.file_name().unwrap_or_default().to_string_lossy().to_string();
            if b.alt_pfad != b.neu_pfad { liste.push_str(&format!("{};{};{}\r\n", b.id, n(&b.alt_pfad), n(&b.neu_pfad))); }
            for (a, z) in &b.dateien { liste.push_str(&format!("{};  {a};  {z}\r\n", b.id)); }
        }
        for z in &bleibt { liste.push_str(&format!("bleibt;{z};\r\n")); }
        fs::write(std::env::var("BEATOS_LISTE").unwrap(), liste).unwrap();
        let ordner = plan.iter().filter(|b| b.alt_pfad != b.neu_pfad).count();
        let dateien: usize = plan.iter().map(|b| b.dateien.len()).sum();
        println!("Plan: {} Beats, {ordner} Ordner, {dateien} Dateien; bleibt: {}", plan.len(), bleibt.len());
        if std::env::var("BEATOS_SCHREIBEN").is_ok_and(|v| v == "1") {
            let wurzeln: Vec<PathBuf> = std::env::var("BEATOS_WURZELN").unwrap().split(';').map(PathBuf::from).collect();
            let p = ausfuehren(&mut conn, plan, &wurzeln, Path::new(&std::env::var("BEATOS_PROTOKOLL").unwrap())).unwrap();
            println!("fertig: {} Beats, DB {}, {} FLPs umgebogen", p.fertig, p.db, p.flps.len());
        }
    }
}
