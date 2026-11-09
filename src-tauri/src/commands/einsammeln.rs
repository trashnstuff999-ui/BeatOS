// src-tauri/src/commands/einsammeln.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Einsammeln (Bibliothek-Umbau Scheibe 3): Fundstücke ins Archiv KOPIEREN.
// Der Altbestand bleibt unberührt.
//
//   <Archiv>/<Jahr>/<MM_MONAT>/<NNNN - Titel [Key BPM]>/
//     Titel [Key BPM].mp3        neuester Export je Endung
//     01_SAVEFILES/Titel [Key BPM].flp   neueste FLP
//     01_SAVEFILES/<Rest des Song-Ordners>   Samples/, Audio/ … (nur bei eigenem Ordner)
//     02_OLD/<Originalnamen>     ältere Exporte und FLPs
//
// Sicherheit:
//   - jede Kopie wird Byte für Byte mit dem Original verglichen
//   - Zielordner existiert schon → Abbruch, nie überschreiben
//   - eine Datei liegt schon byte-gleich im Archiv → Song wird ausgelassen
//   - Verweise der kopierten FLPs auf mitkopierte Dateien zeigen danach auf
//     die Kopien. Andere Verweise bleiben (Scheibe 10).
//   - Protokoll in _BEATOS listet jede angelegte Datei; Rückgängig löscht genau
//     die, und nur, wenn sie noch unverändert sind.
// ═══════════════════════════════════════════════════════════════════════════════

use crate::commands::archive::{build_archive_folder_name, detect_assets};
use crate::commands::archive_match::{collect_files, normalize_title, old_system_id_and_title, read_archive_index, same_content};
use crate::db::open_db;
use crate::utils::{file_modified_secs, is_audio_extension, is_valid_key, sanitize_filename_part, secs_to_date, unique_dest, year_month_from_secs};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize)]
pub struct EinsammelEintrag {
    pub id: Option<u32>,
    pub titel: String,
    pub key: Option<String>,
    pub bpm: Option<i32>,
    pub dateien: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Eingesammelt {
    pub beat_id: String,
    pub ordner: String,
    /// Jede angelegte Datei mit Größe, für Rückgängig
    pub dateien: Vec<(String, u64)>,
}

#[derive(Debug, Serialize)]
pub struct EinsammelErgebnis {
    pub fertig: Vec<Eingesammelt>,
    /// Titel: Grund
    pub ausgelassen: Vec<String>,
    /// Abbruch des Laufs (Kopie fehlerhaft o. ä.); was davor fertig war, bleibt
    pub fehler: Option<String>,
    pub protokoll: Option<String>,
}

/// „Amin" → „Am", „CMaj" → „C", „d#m" → „D#m". Unbrauchbares → None.
pub(crate) fn key_schreibweise(k: &str) -> Option<String> {
    let k = k.trim();
    if !is_valid_key(k) {
        return None;
    }
    let mut c = k.chars();
    let ton: String = c.next()?.to_ascii_uppercase().to_string();
    let rest: String = c.collect();
    let (vorzeichen, art) = match rest.chars().next() {
        Some(v @ ('#' | 'b')) => (v.to_string(), rest[1..].to_string()),
        _ => (String::new(), rest),
    };
    let art = match art.to_lowercase().as_str() {
        "" | "maj" | "major" | "dur" => "",
        "m" | "min" | "minor" | "moll" => "m",
        _ if art == "M" => "",
        _ => return None,
    };
    Some(format!("{ton}{vorzeichen}{art}"))
}

fn ist_audio(p: &Path) -> bool {
    p.extension().and_then(|e| e.to_str()).is_some_and(|e| is_audio_extension(&e.to_lowercase()))
}
fn ist_flp(p: &Path) -> bool {
    p.extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case("flp"))
}
fn vergleichsform(p: &str) -> String {
    p.replace('/', "\\").to_lowercase()
}

/// Gehören alle Dateien zu einem eigenen Song-Ordner wie „[532] Stay - 120 Em"?
/// Dann wandert sein ganzer Inhalt mit (Samples/, Audio/), sonst nur die Dateien.
fn song_ordner(e: &EinsammelEintrag) -> Option<PathBuf> {
    let erster = Path::new(e.dateien.first()?).parent()?.to_path_buf();
    if !e.dateien.iter().all(|d| Path::new(d).parent() == Some(erster.as_path())) {
        return None;
    }
    let name = erster.file_name()?.to_string_lossy().to_string();
    let passt = match (e.id, old_system_id_and_title(&name)) {
        (Some(id), Some(o)) => o.id == id,
        _ => {
            let t = normalize_title(&e.titel);
            !t.is_empty() && normalize_title(&name).starts_with(&t)
        }
    };
    passt.then_some(erster)
}

#[tauri::command(async)]
pub fn einsammeln(eintraege: Vec<EinsammelEintrag>, archive_path: String) -> Result<EinsammelErgebnis, String> {
    let archiv = Path::new(&archive_path);
    if !archiv.is_dir() {
        return Err(format!("Archiv-Ordner nicht gefunden: {}", archiv.display()));
    }
    crate::db::backup_db()?;
    let conn = open_db().map_err(|e| e.to_string())?;
    einsammeln_mit(&conn, eintraege, archiv, &crate::db::backup_target_path().parent().map(Path::to_path_buf).unwrap_or_default())
}

pub(crate) fn einsammeln_mit(
    conn: &rusqlite::Connection,
    eintraege: Vec<EinsammelEintrag>,
    archiv: &Path,
    protokoll_dir: &Path,
) -> Result<EinsammelErgebnis, String> {
    // Nächste freie Nummer: über Archiv-Ordner und DB, damit nichts doppelt wird
    let mut naechste = read_archive_index(archiv).iter().map(|e| e.catalog_id).max().unwrap_or(0);
    if let Ok(mut stmt) = conn.prepare("SELECT id FROM beats") {
        let ids = stmt.query_map([], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
        for id in ids.flatten() {
            if let Ok(n) = id.trim().parse::<u32>() { naechste = naechste.max(n); }
        }
    }
    // Exporte im Archiv nach Größe: liegt etwas schon dort, nicht nochmal
    let mut im_archiv: HashMap<u64, Vec<PathBuf>> = HashMap::new();
    let mut alle = Vec::new();
    collect_files(archiv, archiv, &mut alle);
    for (size, p, _) in alle {
        if ist_audio(&p) { im_archiv.entry(size).or_default().push(p); }
    }

    let mut erg = EinsammelErgebnis { fertig: Vec::new(), ausgelassen: Vec::new(), fehler: None, protokoll: None };
    for e in eintraege {
        let name = format!("{}{}", e.id.map(|i| format!("[{i}] ")).unwrap_or_default(), e.titel);
        let pfade: Vec<PathBuf> = e.dateien.iter().map(PathBuf::from).collect();
        if let Some(p) = pfade.iter().find(|p| !p.is_file()) {
            erg.ausgelassen.push(format!("{name}: {} fehlt", p.display()));
            continue;
        }
        if !pfade.iter().any(|p| ist_audio(p)) {
            erg.ausgelassen.push(format!("{name}: kein Export"));
            continue;
        }
        let doppelt = pfade.iter().filter(|p| ist_audio(p)).find(|p| {
            let size = std::fs::metadata(p).map(|m| m.len()).unwrap_or(0);
            im_archiv.get(&size).is_some_and(|cs| cs.iter().any(|c| same_content(p, c)))
        });
        if let Some(p) = doppelt {
            erg.ausgelassen.push(format!("{name}: {} liegt schon im Archiv", p.display()));
            continue;
        }
        naechste += 1;
        match ein_song(conn, &e, &pfade, archiv, naechste) {
            Ok(g) => erg.fertig.push(g),
            Err(f) => {
                erg.fehler = Some(format!("{name}: {f}"));
                break; // Plan: bei einer Abweichung bricht der Lauf ab
            }
        }
    }

    if !erg.fertig.is_empty() {
        let stempel = chrono_frei_stempel();
        let datei = protokoll_dir.join(format!("einsammeln_{stempel}.json"));
        std::fs::create_dir_all(protokoll_dir).map_err(|e| e.to_string())?;
        std::fs::write(&datei, serde_json::to_string_pretty(&erg.fertig).map_err(|e| e.to_string())?)
            .map_err(|e| format!("Protokoll nicht geschrieben: {e}"))?;
        erg.protokoll = Some(datei.to_string_lossy().to_string());
    }
    Ok(erg)
}

/// JJJJMMTT_hhmmss aus der Systemzeit (UTC), ohne zusätzliches Crate
fn chrono_frei_stempel() -> String {
    let s = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    format!("{}_{:02}{:02}{:02}", secs_to_date(s).replace('-', ""), (s / 3600) % 24, (s / 60) % 60, s % 60)
}

fn ein_song(conn: &rusqlite::Connection, e: &EinsammelEintrag, pfade: &[PathBuf], archiv: &Path, nr: u32) -> Result<Eingesammelt, String> {
    let key = e.key.as_deref().and_then(key_schreibweise);
    let bpm = e.bpm.filter(|b| (40..=300).contains(b));
    let titel = e.titel.trim();
    if titel.is_empty() {
        return Err("kein Titel".into());
    }
    let datum = |p: &Path| file_modified_secs(p).unwrap_or(u64::MAX);
    let fertig = pfade.iter().filter(|p| ist_audio(p)).map(|p| datum(p)).min().filter(|&s| s != u64::MAX)
        .ok_or("kein Datum")?;
    let begonnen = pfade.iter().map(|p| datum(p)).min().unwrap_or(fertig).min(fertig);

    let ordner_name = build_archive_folder_name(nr as i32, titel, key.as_deref(), bpm);
    // „2024/11_NOVEMBER“ kommt mit Schrägstrich, im Pfad einheitlich trennen
    let ziel = archiv.join(year_month_from_secs(fertig).replace('/', std::path::MAIN_SEPARATOR_STR)).join(&ordner_name);
    if ziel.exists() {
        return Err(format!("{} gibt es schon", ziel.display()));
    }
    let schema = sanitize_filename_part(&build_archive_folder_name(0, titel, key.as_deref(), bpm)["0000 - ".len()..]);

    // Was wohin: (Quelle, Ziel)
    let mut plan: Vec<(PathBuf, PathBuf)> = Vec::new();
    let saves = ziel.join("01_SAVEFILES");
    let alt = ziel.join("02_OLD");
    let mut nach_neu: Vec<&PathBuf> = pfade.iter().collect();
    nach_neu.sort_by_key(|p| std::cmp::Reverse(datum(p)));
    let mut vergeben: Vec<String> = Vec::new(); // Endungen, deren Neuester schon steht
    for p in &nach_neu {
        let ext = p.extension().and_then(|x| x.to_str()).unwrap_or("").to_lowercase();
        let original = p.file_name().unwrap().to_string_lossy().to_string();
        let ziel_datei = if !vergeben.contains(&ext) {
            vergeben.push(ext.clone());
            if ist_flp(p) { saves.join(format!("{schema}.flp")) } else { ziel.join(format!("{schema}.{ext}")) }
        } else {
            alt.join(original)
        };
        plan.push(((*p).clone(), ziel_datei));
    }
    // Eigener Song-Ordner: der Rest (Samples/, Audio/, Backup/ …) mit Struktur
    if let Some(d) = song_ordner(e) {
        let gelistet: Vec<String> = pfade.iter().map(|p| vergleichsform(&p.to_string_lossy())).collect();
        let mut rest = Vec::new();
        collect_files(&d, &d, &mut rest);
        for (_, p, rel) in rest {
            if !gelistet.contains(&vergleichsform(&p.to_string_lossy())) {
                plan.push((p, saves.join(rel)));
            }
        }
    }

    let mut angelegt: Vec<(String, u64)> = Vec::new();
    let ergebnis = (|| -> Result<(), String> {
        for (q, z) in &plan {
            let z = unique_dest(z.parent().unwrap(), &z.file_name().unwrap().to_string_lossy());
            std::fs::create_dir_all(z.parent().unwrap()).map_err(|e| e.to_string())?;
            std::fs::copy(q, &z).map_err(|err| format!("{} nicht kopiert: {err}", q.display()))?;
            angelegt.push((z.to_string_lossy().to_string(), std::fs::metadata(&z).map(|m| m.len()).unwrap_or(0)));
            if !same_content(q, &z) {
                return Err(format!("Kopie von {} weicht ab", q.display()));
            }
        }
        // FLP-Verweise auf mitkopierte Dateien auf die Kopien umstellen
        let umzug: HashMap<String, String> = plan.iter().zip(&angelegt)
            .map(|((q, _), (z, _))| (vergleichsform(&q.to_string_lossy()), z.clone()))
            .collect();
        for (z, _) in angelegt.clone().iter().filter(|(z, _)| ist_flp(Path::new(z)) && !z.to_lowercase().contains("backup")) {
            let Ok(bytes) = std::fs::read(z) else { continue };
            let ersatz: Vec<(String, String)> = crate::commands::flp::audio_pfade(&bytes).into_iter()
                .filter_map(|alt| umzug.get(&vergleichsform(&alt)).map(|neu| (alt, neu.clone())))
                .collect();
            if !ersatz.is_empty() {
                crate::commands::flp::flp_umschreiben(Path::new(z), &ersatz, "vor Einsammeln")?;
                // Die Sicherung legt flp_umschreiben neben die FLP: mit ins Protokoll
                let stamm = Path::new(z).file_stem().unwrap().to_string_lossy().to_string();
                let sicherung = Path::new(z).parent().unwrap().join("Backup").join(format!("{stamm} (vor Einsammeln).flp"));
                if sicherung.is_file() && !angelegt.iter().any(|(a, _)| Path::new(a) == sicherung) {
                    angelegt.push((sicherung.to_string_lossy().to_string(), std::fs::metadata(&sicherung).map(|m| m.len()).unwrap_or(0)));
                }
                // Größe nach dem Umschreiben neu
                if let Some(eintrag) = angelegt.iter_mut().find(|(a, _)| a == z) {
                    eintrag.1 = std::fs::metadata(z).map(|m| m.len()).unwrap_or(0);
                }
            }
        }
        // Protokoll im Ordner, wie beim Archivieren
        let quelle = song_ordner(e).unwrap_or_else(|| nach_neu[0].parent().unwrap().to_path_buf());
        let json = serde_json::json!({
            "archived_at": secs_to_date(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)),
            "source_folder": quelle.to_string_lossy(),
            "files": pfade.iter().map(|p| serde_json::json!({
                "original_path": p.to_string_lossy(),
                "created_at": secs_to_date(crate::utils::file_created_secs(p).unwrap_or(0)),
                "modified_at": secs_to_date(datum(p)),
                "accessed_at": secs_to_date(0),
            })).collect::<Vec<_>>(),
            "alte_id": e.id.map(|i| i.to_string()),
            "begonnen": secs_to_date(begonnen),
            "fertig": secs_to_date(fertig),
        });
        let json_pfad = saves.join("create_date.json");
        std::fs::create_dir_all(&saves).map_err(|e| e.to_string())?;
        std::fs::write(&json_pfad, serde_json::to_string_pretty(&json).unwrap()).map_err(|e| e.to_string())?;
        angelegt.push((json_pfad.to_string_lossy().to_string(), std::fs::metadata(&json_pfad).map(|m| m.len()).unwrap_or(0)));

        let (art, video) = detect_assets(&ziel);
        conn.execute(
            "INSERT INTO beats (id, name, path, bpm, key, status, notes, created_date, modified_date, favorite, has_artwork, has_video, alte_id, begonnen)
             VALUES (?1, ?2, ?3, ?4, ?5, 'finished', ?6, ?7, ?7, 0, ?8, ?9, ?10, ?11)",
            rusqlite::params![
                format!("{nr:04}"), titel, ziel.to_string_lossy(), bpm, key,
                format!("Eingesammelt aus {}", quelle.display()), secs_to_date(fertig),
                art as i32, video as i32, e.id.map(|i| i.to_string()), secs_to_date(begonnen),
            ],
        ).map_err(|e| format!("DB: {e}"))?;
        Ok(())
    })();

    if let Err(f) = ergebnis {
        // Halbfertiges wegräumen: nur, was dieser Lauf angelegt hat
        for (a, _) in &angelegt { let _ = std::fs::remove_file(a); }
        leere_ordner_weg(&ziel);
        let _ = conn.execute("DELETE FROM beats WHERE id = ?1 AND path = ?2", rusqlite::params![format!("{nr:04}"), ziel.to_string_lossy()]);
        return Err(f);
    }
    Ok(Eingesammelt { beat_id: format!("{nr:04}"), ordner: ziel.to_string_lossy().to_string(), dateien: angelegt })
}

/// Leere Ordner von unten nach oben entfernen, `wurzel` eingeschlossen.
fn leere_ordner_weg(wurzel: &Path) {
    if let Ok(rd) = std::fs::read_dir(wurzel) {
        for e in rd.flatten() {
            if e.path().is_dir() { leere_ordner_weg(&e.path()); }
        }
    }
    let _ = std::fs::remove_dir(wurzel); // scheitert, wenn nicht leer: gut so
}

/// Einen Lauf zurücknehmen: angelegte Dateien löschen, wenn sie noch so groß
/// sind wie angelegt, leere Ordner weg, DB-Zeile weg. Was du seitdem
/// dazugelegt hast (Cover …), bleibt mit seinem Ordner stehen.
#[tauri::command(async)]
pub fn einsammeln_rueckgaengig(protokoll: String) -> Result<Vec<String>, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    rueckgaengig_mit(&conn, Path::new(&protokoll))
}

pub(crate) fn rueckgaengig_mit(conn: &rusqlite::Connection, protokoll: &Path) -> Result<Vec<String>, String> {
    let roh = std::fs::read_to_string(protokoll).map_err(|e| format!("Protokoll nicht lesbar: {e}"))?;
    let laeufe: Vec<Eingesammelt> = serde_json::from_str(&roh).map_err(|e| e.to_string())?;
    let mut hinweise = Vec::new();
    for g in &laeufe {
        for (d, groesse) in &g.dateien {
            match std::fs::metadata(d) {
                Ok(m) if m.len() == *groesse => { let _ = std::fs::remove_file(d); }
                Ok(_) => hinweise.push(format!("{d} wurde geändert, bleibt")),
                Err(_) => {}
            }
        }
        leere_ordner_weg(Path::new(&g.ordner));
        if Path::new(&g.ordner).exists() {
            hinweise.push(format!("{} enthält neue Dateien, bleibt", g.ordner));
        }
        conn.execute("DELETE FROM beats WHERE id = ?1 AND path = ?2", rusqlite::params![g.beat_id, g.ordner])
            .map_err(|e| e.to_string())?;
    }
    let erledigt = protokoll.with_extension("rueckgaengig.json");
    let _ = std::fs::rename(protokoll, erledigt);
    Ok(hinweise)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn datei(p: &Path, inhalt: &[u8]) {
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, inhalt).unwrap();
    }

    #[test]
    fn key_wird_angeglichen() {
        assert_eq!(key_schreibweise("Amin").as_deref(), Some("Am"));
        assert_eq!(key_schreibweise("CMaj").as_deref(), Some("C"));
        assert_eq!(key_schreibweise("d#m").as_deref(), Some("D#m"));
        assert_eq!(key_schreibweise("F#").as_deref(), Some("F#"));
        assert_eq!(key_schreibweise("Cm-Gm"), None);
    }

    #[test]
    fn song_kopieren_pruefen_und_zuruecknehmen() {
        let t = std::env::temp_dir().join(format!("beatos_einsammeln_{}", std::process::id()));
        let _ = fs::remove_dir_all(&t);
        let arch = t.join("archiv");
        datei(&arch.join("2026/05_MAY/0938 - NO MAN'S LAND [Bm 145]/NO MAN'S LAND [Bm 145].mp3"), b"nml");
        let alt = t.join("alt").join("[532] Stay - 120 Em");
        datei(&alt.join("[532] Stay - 120 Em.mp3"), b"stay1");
        std::thread::sleep(std::time::Duration::from_millis(1100));
        datei(&alt.join("[532] Stay - 120 Em_2.mp3"), b"stay2");
        datei(&alt.join("532.flp"), b"keine echte flp");
        datei(&alt.join("Samples/kick.wav"), b"kick");
        let andere = t.join("alt/whynot.mp3");
        datei(&andere, b"nml"); // liegt schon im Archiv

        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE beats (id TEXT PRIMARY KEY, name TEXT, path TEXT, bpm REAL, key TEXT, status TEXT, notes TEXT,
            created_date TEXT, modified_date TEXT, favorite INTEGER, has_artwork INTEGER, has_video INTEGER, alte_id TEXT, begonnen TEXT);
            INSERT INTO beats (id, name) VALUES ('0938', 'NO MAN''S LAND');").unwrap();
        let s = |p: &Path| p.to_string_lossy().to_string();
        let eintraege = vec![
            EinsammelEintrag { id: Some(532), titel: "Stay".into(), key: Some("Emin".into()), bpm: Some(120),
                dateien: vec![s(&alt.join("[532] Stay - 120 Em_2.mp3")), s(&alt.join("[532] Stay - 120 Em.mp3")), s(&alt.join("532.flp"))] },
            EinsammelEintrag { id: None, titel: "whynot".into(), key: None, bpm: None, dateien: vec![s(&andere)] },
        ];
        let r = einsammeln_mit(&conn, eintraege, &arch, &t.join("_BEATOS")).unwrap();
        assert!(r.fehler.is_none(), "{:?}", r.fehler);
        assert_eq!(r.fertig.len(), 1);
        assert_eq!(r.ausgelassen.len(), 1, "{:?}", r.ausgelassen);
        let ziel = PathBuf::from(&r.fertig[0].ordner);
        assert!(ziel.ends_with("0939 - Stay [Em 120]"), "{}", ziel.display());
        assert_eq!(fs::read(ziel.join("Stay [Em 120].mp3")).unwrap(), b"stay2"); // neuester in den Root
        assert_eq!(fs::read(ziel.join("02_OLD/[532] Stay - 120 Em.mp3")).unwrap(), b"stay1");
        assert!(ziel.join("01_SAVEFILES/Stay [Em 120].flp").is_file());
        assert_eq!(fs::read(ziel.join("01_SAVEFILES/Samples/kick.wav")).unwrap(), b"kick");
        let (alte_id, begonnen): (String, String) = conn.query_row("SELECT alte_id, begonnen FROM beats WHERE id = '0939'", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
        assert_eq!(alte_id, "532");
        assert_eq!(begonnen.len(), 10);
        assert!(alt.join("[532] Stay - 120 Em.mp3").is_file()); // Original bleibt

        // Rückgängig: Kopien weg, Original und fremde Archiv-Beats bleiben
        let hinweise = rueckgaengig_mit(&conn, Path::new(r.protokoll.as_ref().unwrap())).unwrap();
        assert!(hinweise.is_empty(), "{hinweise:?}");
        assert!(!ziel.exists());
        assert!(alt.join("Samples/kick.wav").is_file());
        assert!(arch.join("2026/05_MAY/0938 - NO MAN'S LAND [Bm 145]").is_dir());
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM beats", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1);
        let _ = fs::remove_dir_all(&t);
    }

    /// Echter Song-Ordner (BEATOS_SONG_DIR), als Kopie in einem Testordner
    /// eingesammelt: zeigen die FLP-Verweise danach auf die Kopien?
    #[test]
    #[ignore]
    fn einsammeln_handprobe() {
        let quelle = PathBuf::from(std::env::var("BEATOS_SONG_DIR").unwrap());
        let t = std::env::temp_dir().join(format!("beatos_einsammeln_hand_{}", std::process::id()));
        let _ = fs::remove_dir_all(&t);
        let alt = t.join("alt").join(quelle.file_name().unwrap());
        let mut alle = Vec::new();
        collect_files(&quelle, &quelle, &mut alle);
        for (_, p, rel) in &alle {
            fs::create_dir_all(alt.join(rel).parent().unwrap()).unwrap();
            fs::copy(p, alt.join(rel)).unwrap();
        }
        // FLPs der Kopie auf die Kopie zeigen lassen, wie im Original auf das Original
        let mut flps = Vec::new();
        collect_files(&alt, &alt, &mut flps);
        for (_, p, _) in flps.iter().filter(|(_, p, _)| ist_flp(p)) {
            let bytes = fs::read(p).unwrap();
            let ersatz: Vec<(String, String)> = crate::commands::flp::audio_pfade(&bytes).into_iter()
                .filter(|a| vergleichsform(a).starts_with(&vergleichsform(&quelle.to_string_lossy())))
                .map(|a| { let neu = format!("{}{}", alt.to_string_lossy(), &a[quelle.to_string_lossy().len()..]); (a, neu) })
                .collect();
            if !ersatz.is_empty() { crate::commands::flp::flp_umschreiben(p, &ersatz, "test").unwrap(); }
        }
        let arch = t.join("archiv");
        fs::create_dir_all(&arch).unwrap();
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE beats (id TEXT PRIMARY KEY, name TEXT, path TEXT, bpm REAL, key TEXT, status TEXT, notes TEXT,
            created_date TEXT, modified_date TEXT, favorite INTEGER, has_artwork INTEGER, has_video INTEGER, alte_id TEXT, begonnen TEXT);").unwrap();
        let funde = crate::commands::fundstuecke::fundstuecke(&[t.join("alt").to_string_lossy().to_string()], &arch).unwrap();
        let f = funde.iter().max_by_key(|f| f.dateien.len()).unwrap();
        println!("Fund: {:?} {} {:?} {:?} {} Dateien", f.id, f.titel, f.key, f.bpm, f.dateien.len());
        let e = EinsammelEintrag { id: f.id, titel: f.titel.clone(), key: f.key.clone(), bpm: f.bpm, dateien: f.dateien.iter().map(|d| d.path.clone()).collect() };
        let r = einsammeln_mit(&conn, vec![e], &arch, &t.join("_BEATOS")).unwrap();
        println!("fehler {:?} ausgelassen {:?}", r.fehler, r.ausgelassen);
        let ziel = PathBuf::from(&r.fertig[0].ordner);
        println!("Ziel: {}", ziel.display());
        let mut neu = Vec::new();
        collect_files(&ziel, &ziel, &mut neu);
        for (_, _, rel) in &neu { println!("  {rel}"); }
        for (_, p, rel) in neu.iter().filter(|(_, p, _)| ist_flp(p) && !p.to_string_lossy().contains("Backup")) {
            let refs = crate::commands::flp::audio_pfade(&fs::read(p).unwrap());
            let ins_archiv = refs.iter().filter(|r| vergleichsform(r).starts_with(&vergleichsform(&ziel.to_string_lossy()))).count();
            let auf_alt = refs.iter().filter(|r| vergleichsform(r).starts_with(&vergleichsform(&t.join("alt").to_string_lossy()))).count();
            let tot = refs.iter().filter(|r| !r.starts_with('%') && !Path::new(r).exists()).count();
            println!("{rel}: {} Verweise, {ins_archiv} ins Archiv, {auf_alt} noch auf alt, {tot} tot", refs.len());
            assert_eq!(auf_alt, 0);
        }
        let _ = fs::remove_dir_all(&t);
    }
}
