// src-tauri/src/commands/nummerieren.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Scheibe 4: Archiv neu nummerieren, B0001 … nach Fertig-Datum.
// Umbau-Werkzeug, läuft nur über die Handprobe `nummerieren_echt` und kommt
// nach dem Bibliothek-Umbau wieder weg.
//
// Eingabe ist die Vorschau-Tabelle (Neu;Alt;…), die Stephan durchgesehen hat:
// was dort steht, passiert. Je Beat:
//   - Ordner umbenennen: „0712 - ANGER [Am 160]“ → „B0145 - ANGER [Am 160]“
//     (nur die Nummer, der Rest des Namens bleibt)
//   - DB in einer Transaktion: beats.id, path, frueher_nr (= alte ID) und alle
//     Verweise (beat_uploads, beat_sample_credits, beat_description_overrides,
//     artist_songs.beat_id). Zweistufig über „~“, damit sich IDs nie kreuzen.
//   - FLPs der ganzen Bibliothek, die in einen umbenannten Ordner zeigen, auf
//     den neuen Ordner umbiegen (Sicherung „(vor Neu-Nummerierung)“ in Backup/).
//   - create_date.json bekommt „frueher_nr“.
// Protokoll vorab nach _BEATOS/Scheibe4; Rückgängig dreht alles um.
// ═══════════════════════════════════════════════════════════════════════════════
#![allow(dead_code)]

use crate::commands::flp::{audio_pfade, flp_umschreiben};
use crate::commands::pfadreparatur::dateien;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Umbenennung {
    pub alt_id: String,
    pub neu_id: String,
    pub alt_pfad: PathBuf,
    pub neu_pfad: PathBuf,
    /// frueher_nr vor dem Lauf (für Rückgängig)
    pub frueher_vorher: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct Protokoll {
    pub umbenennungen: Vec<Umbenennung>,
    pub ordner_fertig: usize,
    pub db_fertig: bool,
    pub flps: Vec<PathBuf>,
}

fn normal(p: &str) -> PathBuf { PathBuf::from(p.replace('/', "\\")) }

/// Plan aus der Vorschau-Tabelle. `nur`: nur diese alten IDs (Probelauf).
pub(crate) fn planen(conn: &rusqlite::Connection, csv: &str, nur: Option<&[String]>) -> Result<Vec<Umbenennung>, String> {
    let mut plan = Vec::new();
    let mut neu_gesehen = std::collections::HashSet::new();
    for (i, z) in csv.trim_start_matches('\u{feff}').lines().enumerate().skip(1) {
        let t: Vec<&str> = z.split(';').collect();
        if t.len() < 2 { continue; }
        let (neu, alt) = (t[0].trim().to_string(), t[1].trim().to_string());
        if neu.len() != 4 || !neu.chars().all(|c| c.is_ascii_digit()) { return Err(format!("Zeile {}: neue Nummer „{neu}“", i + 1)); }
        if !neu_gesehen.insert(neu.clone()) { return Err(format!("Neue Nummer {neu} doppelt")); }
        if nur.is_some_and(|n| !n.contains(&alt)) { continue; }
        // Schon umgestellt (Probelauf): Beat steht unter der neuen ID mit dieser früheren Nummer
        let erledigt: bool = conn.query_row("SELECT COUNT(*) FROM beats WHERE id = ?1 AND frueher_nr = ?2", [&neu, &alt], |r| r.get::<_, i64>(0)).unwrap_or(0) == 1
            && conn.query_row("SELECT COUNT(*) FROM beats WHERE id = ?1", [&alt], |r| r.get::<_, i64>(0)).unwrap_or(0) == 0;
        if erledigt { continue; }
        let (pfad, frueher): (String, Option<String>) = conn.query_row(
            "SELECT path, frueher_nr FROM beats WHERE id = ?1", [&alt], |r| Ok((r.get(0)?, r.get(1)?)),
        ).map_err(|e| format!("Beat {alt}: {e}"))?;
        let alt_pfad = normal(&pfad);
        if !alt_pfad.is_dir() { return Err(format!("Ordner fehlt: {}", alt_pfad.display())); }
        let name = alt_pfad.file_name().unwrap().to_string_lossy().to_string();
        let rest = name.split_once(" - ").map(|(_, r)| r.to_string()).ok_or(format!("Ordner ohne „ - “: {name}"))?;
        let neu_pfad = alt_pfad.with_file_name(format!("B{neu} - {rest}"));
        if neu_pfad.exists() && neu_pfad != alt_pfad { return Err(format!("Ziel gibt es schon: {}", neu_pfad.display())); }
        plan.push(Umbenennung { alt_id: alt, neu_id: neu, alt_pfad, neu_pfad, frueher_vorher: frueher });
    }
    Ok(plan)
}

fn db_umstellen(conn: &mut rusqlite::Connection, plan: &[Umbenennung], rueck: bool) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let refs = [("beat_uploads", "beat_id"), ("beat_sample_credits", "beat_id"), ("beat_description_overrides", "beat_id"), ("artist_songs", "beat_id")];
    for u in plan {
        let (von, nach, pfad) = if rueck { (&u.neu_id, &u.alt_id, &u.alt_pfad) } else { (&u.alt_id, &u.neu_id, &u.neu_pfad) };
        let tmp = format!("~{nach}");
        let frueher = if rueck { u.frueher_vorher.clone() } else { Some(u.frueher_vorher.clone().unwrap_or_else(|| u.alt_id.clone())) };
        let n = tx.execute("UPDATE beats SET id = ?1, path = ?2, frueher_nr = ?3 WHERE id = ?4",
            rusqlite::params![tmp, pfad.to_string_lossy(), frueher, von]).map_err(|e| format!("beats {von}: {e}"))?;
        if n != 1 { return Err(format!("Beat {von} nicht gefunden ({n})")); }
        for (t, s) in refs {
            tx.execute(&format!("UPDATE {t} SET {s} = ?1 WHERE {s} = ?2"), [&tmp, von]).map_err(|e| format!("{t}: {e}"))?;
        }
    }
    tx.execute("UPDATE beats SET id = substr(id, 2) WHERE id LIKE '~%'", []).map_err(|e| e.to_string())?;
    for (t, s) in refs {
        tx.execute(&format!("UPDATE {t} SET {s} = substr({s}, 2) WHERE {s} LIKE '~%'"), []).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

/// FLPs unter `wurzeln`, die in einen umbenannten Ordner zeigen, umbiegen.
fn flps_umbiegen(plan: &[Umbenennung], wurzeln: &[PathBuf], rueck: bool, nur: Option<&[PathBuf]>) -> Result<Vec<PathBuf>, String> {
    let karte: HashMap<String, &Path> = plan.iter().map(|u| {
        let (von, nach) = if rueck { (&u.neu_pfad, &u.alt_pfad) } else { (&u.alt_pfad, &u.neu_pfad) };
        (von.to_string_lossy().replace('/', "\\").to_lowercase(), nach.as_path())
    }).collect();
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
        // Vergleich mit „\“: die Pfad-Reparatur hat Pfade wie „…\2025/06_JUNE\…“ aus der
        // DB übernommen. Ersetzt wird der Original-Text, geschrieben einheitlich mit „\“.
        let ersatz: Vec<(String, String)> = audio_pfade(&bytes).into_iter().filter_map(|p| {
            let einheitlich = p.replace('/', "\\");
            let pp = Path::new(&einheitlich);
            pp.ancestors().skip(1).find_map(|a| karte.get(&a.to_string_lossy().to_lowercase()).map(|nach| {
                let rest = pp.strip_prefix(a).unwrap();
                (p.clone(), nach.join(rest).to_string_lossy().to_string())
            }))
        }).collect();
        if ersatz.is_empty() { continue; }
        flp_umschreiben(&flp, &ersatz, if rueck { "vor Rückgängig Neu-Nummerierung" } else { "vor Neu-Nummerierung" })?;
        geaendert.push(flp);
    }
    Ok(geaendert)
}

fn json_vermerk(u: &Umbenennung, rueck: bool) {
    let p = (if rueck { &u.alt_pfad } else { &u.neu_pfad }).join("01_SAVEFILES").join("create_date.json");
    let Ok(t) = std::fs::read_to_string(&p) else { return };
    let Ok(mut v) = serde_json::from_str::<serde_json::Value>(&t) else { return };
    let Some(o) = v.as_object_mut() else { return };
    if rueck { o.remove("frueher_nr"); } else { o.insert("frueher_nr".into(), serde_json::Value::String(u.alt_id.clone())); }
    let _ = std::fs::write(&p, serde_json::to_string_pretty(&v).unwrap());
}

fn schreiben(p: &Path, prot: &Protokoll) -> Result<(), String> {
    std::fs::write(p, serde_json::to_string_pretty(prot).unwrap()).map_err(|e| format!("Protokoll: {e}"))
}

/// Der Lauf. Protokoll wird vorab geschrieben und nach jedem Schritt erneuert.
pub(crate) fn ausfuehren(conn: &mut rusqlite::Connection, plan: Vec<Umbenennung>, wurzeln: &[PathBuf], protokoll: &Path) -> Result<Protokoll, String> {
    let mut prot = Protokoll { umbenennungen: plan, ..Default::default() };
    schreiben(protokoll, &prot)?;
    // 1. Ordner
    for i in 0..prot.umbenennungen.len() {
        let u = &prot.umbenennungen[i];
        if let Err(e) = std::fs::rename(&u.alt_pfad, &u.neu_pfad) {
            // zurück, was schon umbenannt ist
            for v in prot.umbenennungen[..i].iter().rev() { let _ = std::fs::rename(&v.neu_pfad, &v.alt_pfad); }
            prot.ordner_fertig = 0;
            let _ = schreiben(protokoll, &prot);
            return Err(format!("Umbenennen von {} fehlgeschlagen ({e}), alles zurückgenommen", u.alt_pfad.display()));
        }
        prot.ordner_fertig = i + 1;
    }
    schreiben(protokoll, &prot)?;
    // 2. DB
    if let Err(e) = db_umstellen(conn, &prot.umbenennungen, false) {
        for v in prot.umbenennungen.iter().rev() { let _ = std::fs::rename(&v.neu_pfad, &v.alt_pfad); }
        prot.ordner_fertig = 0;
        let _ = schreiben(protokoll, &prot);
        return Err(format!("DB: {e}; Ordner zurückgenommen"));
    }
    prot.db_fertig = true;
    schreiben(protokoll, &prot)?;
    // 3. FLPs und Vermerk
    prot.flps = flps_umbiegen(&prot.umbenennungen, wurzeln, false, None)?;
    for u in &prot.umbenennungen { json_vermerk(u, false); }
    schreiben(protokoll, &prot)?;
    Ok(prot)
}

/// FLPs nachziehen, die der Lauf übersehen hat (gemischte Schrägstriche): Pläne aus
/// den Protokollen, Ergebnis als eigenes Protokoll (für Rückgängig zuerst zurückdrehen).
pub(crate) fn nachziehen(protokolle: &[PathBuf], wurzeln: &[PathBuf], ziel: &Path) -> Result<Protokoll, String> {
    let mut plan = Vec::new();
    for p in protokolle {
        let pr: Protokoll = serde_json::from_str(&std::fs::read_to_string(p).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        plan.extend(pr.umbenennungen);
    }
    let flps = flps_umbiegen(&plan, wurzeln, false, None)?;
    let prot = Protokoll { ordner_fertig: 0, db_fertig: false, flps, umbenennungen: plan };
    schreiben(ziel, &prot)?;
    Ok(prot)
}

pub(crate) fn rueckgaengig(conn: &mut rusqlite::Connection, protokoll: &Path, wurzeln: &[PathBuf]) -> Result<(), String> {
    let prot: Protokoll = serde_json::from_str(&std::fs::read_to_string(protokoll).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let _ = wurzeln;
    flps_umbiegen(&prot.umbenennungen, &[], true, Some(&prot.flps))?;
    if prot.db_fertig { db_umstellen(conn, &prot.umbenennungen, true)?; }
    for u in prot.umbenennungen.iter().take(prot.ordner_fertig).rev() {
        std::fs::rename(&u.neu_pfad, &u.alt_pfad).map_err(|e| format!("{}: {e}", u.neu_pfad.display()))?;
    }
    for u in &prot.umbenennungen { json_vermerk(u, true); }
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
    fn neu_nummerieren_und_zurueck() {
        let t = std::env::temp_dir().join(format!("beatos_nummer_{}", std::process::id()));
        let _ = fs::remove_dir_all(&t);
        let arch = t.join("03_ARCHIVE");
        let anger = arch.join("2024").join("08_AUGUST").join("0712 - ANGER [Am 160]");
        let smoke = arch.join("2024").join("08_AUGUST").join("1033 - Smoke [114]");
        for (p, x) in [(anger.join("01_SAVEFILES/Audio/vox.wav"), "v"), (smoke.join("Smoke [114].mp3"), "s")] {
            fs::create_dir_all(p.parent().unwrap()).unwrap(); fs::write(p, x).unwrap();
        }
        fs::write(anger.join("01_SAVEFILES/create_date.json"), r#"{"alte_id":"712"}"#).unwrap();
        // FLP in ANGER zeigt in den eigenen Ordner und in Smoke; eine Artist-FLP zeigt in Smoke
        let p = |d: &Path, r: &str| d.join(r).to_string_lossy().to_string();
        let flp_a = anger.join("01_SAVEFILES/ANGER.flp");
        fs::write(&flp_a, flp_mit(&[p(&anger, "01_SAVEFILES\\Audio\\vox.wav"), p(&smoke, "Smoke [114].mp3")])).unwrap();
        let art = t.join("05_ARTISTS/JarnoGm/Song");
        fs::create_dir_all(&art).unwrap();
        let flp_art = art.join("Song.flp");
        // Wie nach der Pfad-Reparatur: gemischte Schrägstriche im FLP-Pfad
        fs::write(&flp_art, flp_mit(&[p(&smoke, "Smoke [114].mp3").replace("\\08_AUGUST", "/08_AUGUST")])).unwrap();
        let orig_a = fs::read(&flp_a).unwrap();

        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE beats (id TEXT PRIMARY KEY, name TEXT, path TEXT, frueher_nr TEXT);
            CREATE TABLE beat_uploads (beat_id TEXT, platform TEXT);
            CREATE TABLE beat_sample_credits (beat_id TEXT); CREATE TABLE beat_description_overrides (beat_id TEXT);
            CREATE TABLE artist_songs (path TEXT, beat_id TEXT);").unwrap();
        // Smoke-Pfad mit gemischten Schrägstrichen, wie in der echten DB
        conn.execute("INSERT INTO beats VALUES ('0712','ANGER',?1,NULL), ('1033','Smoke',?2,NULL)",
            [anger.to_string_lossy().to_string(), smoke.to_string_lossy().replace("\\08_AUGUST", "/08_AUGUST")]).unwrap();
        conn.execute_batch("INSERT INTO beat_uploads VALUES ('0712','youtube'),('1033','youtube'); INSERT INTO artist_songs VALUES ('x','1033');").unwrap();

        let csv = "\u{feff}Neu;Alt;Titel\r\n0145;0712;ANGER\r\n0159;1033;Smoke\r\n";
        let plan = planen(&conn, csv, None).unwrap();
        let prot_pfad = t.join("lauf.json");
        let prot = ausfuehren(&mut conn, plan, &[arch.clone(), t.join("05_ARTISTS")], &prot_pfad).unwrap();

        let neu_a = arch.join("2024/08_AUGUST/B0145 - ANGER [Am 160]");
        let neu_s = arch.join("2024/08_AUGUST/B0159 - Smoke [114]");
        assert!(neu_a.is_dir() && neu_s.is_dir() && !anger.exists());
        let (id, pfad, fr): (String, String, String) = conn.query_row("SELECT id, path, frueher_nr FROM beats WHERE name='ANGER'", [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).unwrap();
        assert_eq!((id.as_str(), fr.as_str()), ("0145", "0712"));
        assert_eq!(PathBuf::from(pfad), neu_a);
        let ups: Vec<String> = conn.prepare("SELECT beat_id FROM beat_uploads ORDER BY beat_id").unwrap().query_map([], |r| r.get(0)).unwrap().flatten().collect();
        assert_eq!(ups, ["0145", "0159"]);
        let a: String = conn.query_row("SELECT beat_id FROM artist_songs", [], |r| r.get(0)).unwrap();
        assert_eq!(a, "0159");
        // FLPs zeigen auf die neuen Ordner, Dateien gibt es dort
        for f in [neu_a.join("01_SAVEFILES/ANGER.flp"), flp_art.clone()] {
            for x in audio_pfade(&fs::read(&f).unwrap()) { assert!(Path::new(&x).is_file(), "{x}"); }
        }
        assert_eq!(prot.flps.len(), 2);
        assert!(fs::read_to_string(neu_a.join("01_SAVEFILES/create_date.json")).unwrap().contains("\"frueher_nr\": \"0712\""));

        // Zweiter Plan über dieselbe Liste: schon Umgestelltes wird übersprungen
        assert!(planen(&conn, csv, None).unwrap().is_empty());

        // Rückgängig: alles wie vorher
        rueckgaengig(&mut conn, &prot_pfad, &[]).unwrap();
        assert!(anger.is_dir() && smoke.is_dir() && !neu_a.exists());
        let (id, fr): (String, Option<String>) = conn.query_row("SELECT id, frueher_nr FROM beats WHERE name='ANGER'", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
        assert_eq!((id.as_str(), fr), ("0712", None));
        assert_eq!(audio_pfade(&fs::read(&flp_a).unwrap()), audio_pfade(&orig_a));
        assert!(!fs::read_to_string(anger.join("01_SAVEFILES/create_date.json")).unwrap().contains("frueher_nr"));
        let _ = fs::remove_dir_all(&t);
    }

    /// Echt, schreibt: FLPs nachziehen. BEATOS_PROTOKOLLE (;), BEATOS_WURZELN (;), BEATOS_ZIEL.
    #[test]
    #[ignore]
    fn nummerieren_nachziehen_echt() {
        let prot: Vec<PathBuf> = std::env::var("BEATOS_PROTOKOLLE").unwrap().split(';').map(PathBuf::from).collect();
        let wurzeln: Vec<PathBuf> = std::env::var("BEATOS_WURZELN").unwrap().split(';').map(PathBuf::from).collect();
        let p = nachziehen(&prot, &wurzeln, Path::new(&std::env::var("BEATOS_ZIEL").unwrap())).unwrap();
        println!("nachgezogen: {} FLPs", p.flps.len());
    }

    /// Echt: BEATOS_DB (echte beats.db), BEATOS_CSV (Vorschau), BEATOS_WURZELN (;), BEATOS_PROTOKOLL, optional
    /// BEATOS_NUR (alte IDs, ;) für den Probelauf. Ohne BEATOS_SCHREIBEN=1 nur der Plan.
    /// Rückgängig: BEATOS_RUECK=1 mit demselben BEATOS_PROTOKOLL.
    #[test]
    #[ignore]
    fn nummerieren_echt() {
        // Echte DB ausdrücklich (im Test öffnet open_db eine leere Test-DB)
        let mut conn = rusqlite::Connection::open(std::env::var("BEATOS_DB").unwrap()).unwrap();
        let prot = PathBuf::from(std::env::var("BEATOS_PROTOKOLL").unwrap());
        let wurzeln: Vec<PathBuf> = std::env::var("BEATOS_WURZELN").unwrap().split(';').map(PathBuf::from).collect();
        if std::env::var("BEATOS_RUECK").is_ok_and(|v| v == "1") {
            rueckgaengig(&mut conn, &prot, &wurzeln).unwrap();
            println!("zurückgenommen");
            return;
        }
        let csv = std::fs::read_to_string(std::env::var("BEATOS_CSV").unwrap()).unwrap();
        let nur: Option<Vec<String>> = std::env::var("BEATOS_NUR").ok().map(|s| s.split(';').map(String::from).collect());
        let plan = planen(&conn, &csv, nur.as_deref()).unwrap();
        println!("Plan: {} Beats", plan.len());
        for u in plan.iter().take(5) { println!("  {} → {}", u.alt_pfad.file_name().unwrap().to_string_lossy(), u.neu_pfad.file_name().unwrap().to_string_lossy()); }
        if std::env::var("BEATOS_SCHREIBEN").is_ok_and(|v| v == "1") {
            let p = ausfuehren(&mut conn, plan, &wurzeln, &prot).unwrap();
            println!("fertig: {} Ordner, DB {}, {} FLPs umgebogen", p.ordner_fertig, p.db_fertig, p.flps.len());
        }
    }
}
