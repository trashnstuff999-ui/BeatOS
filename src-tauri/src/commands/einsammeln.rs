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
    /// Bei Grau: der Archivordner, in den die Reste gehören
    #[serde(default)]
    pub archiv: Option<String>,
}

/// Wohin ein Lauf sammelt
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Art {
    /// Grün: neuer Beat im Archiv, mit Katalognummer
    Archiv,
    /// Rot: nach 07_REMIXES als R0001, ohne Katalog-Eintrag
    Remix,
    /// Grau: fehlende Versionen in den bestehenden Archivordner nach 02_OLD
    Reste,
    /// Gelb „Loop“: nach 06_SAMPLES als S0001, ohne Katalog-Eintrag
    Sample,
}

fn sample_ordner(archiv: &Path) -> PathBuf {
    archiv.parent().unwrap_or(archiv).join("06_SAMPLES")
}

/// „S0012 - Titel“ / „S0005 Project_0889“ → 12 / 5
fn praefix_nummer(name: &str, p: char) -> Option<u32> {
    let z: String = name.strip_prefix(p)?.chars().take_while(|c| c.is_ascii_digit()).collect();
    z.parse().ok()
}

/// 07_REMIXES neben dem Archiv, wie 05_ARTISTS und 06_SAMPLES
fn remix_ordner(archiv: &Path) -> PathBuf {
    archiv.parent().unwrap_or(archiv).join("07_REMIXES")
}

/// „R0012 - Titel" → 12
fn remix_nummer(name: &str) -> Option<u32> {
    let z: String = name.strip_prefix('R')?.chars().take_while(|c| c.is_ascii_digit()).collect();
    if z.len() == 4 { z.parse().ok() } else { None }
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
    // Sammelordner wie „Music\Songs\Lo-Fi“ (Name passt zu „LoFi“) enthalten
    // andere Songs: eigener Ordner nur, wenn jede FLP/jeder Export darin dazugehört
    let gelistet: Vec<String> = e.dateien.iter().map(|d| vergleichsform(d)).collect();
    let fremd = std::fs::read_dir(&erster).into_iter().flatten().flatten().any(|x| {
        let p = x.path();
        p.is_file() && (ist_flp(&p) || ist_audio(&p)) && !gelistet.contains(&vergleichsform(&p.to_string_lossy()))
    });
    (passt && !fremd).then_some(erster)
}

#[tauri::command(async)]
pub fn einsammeln(eintraege: Vec<EinsammelEintrag>, archive_path: String, art: Option<Art>) -> Result<EinsammelErgebnis, String> {
    let archiv = Path::new(&archive_path);
    if !archiv.is_dir() {
        return Err(format!("Archiv-Ordner nicht gefunden: {}", archiv.display()));
    }
    crate::db::backup_db()?;
    let conn = open_db().map_err(|e| e.to_string())?;
    einsammeln_mit(&conn, eintraege, archiv, &crate::db::backup_target_path().parent().map(Path::to_path_buf).unwrap_or_default(), art.unwrap_or(Art::Archiv))
}

pub(crate) fn einsammeln_mit(
    conn: &rusqlite::Connection,
    eintraege: Vec<EinsammelEintrag>,
    archiv: &Path,
    protokoll_dir: &Path,
    art: Art,
) -> Result<EinsammelErgebnis, String> {
    let index = read_archive_index(archiv);
    let remixe = remix_ordner(archiv);
    let samples = sample_ordner(archiv);
    // Nächste freie Nummer: über Archiv-Ordner und DB, damit nichts doppelt wird
    let mut naechste = index.iter().map(|e| e.catalog_id).max().unwrap_or(0);
    if art == Art::Remix {
        naechste = std::fs::read_dir(&remixe).into_iter().flatten().flatten()
            .filter_map(|e| remix_nummer(&e.file_name().to_string_lossy())).max().unwrap_or(0);
    } else if art == Art::Sample {
        naechste = std::fs::read_dir(&samples).into_iter().flatten().flatten()
            .filter_map(|e| praefix_nummer(&e.file_name().to_string_lossy(), 'S')).max().unwrap_or(0);
    } else if let Ok(mut stmt) = conn.prepare("SELECT id FROM beats") {
        let ids = stmt.query_map([], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
        for id in ids.flatten() {
            if let Ok(n) = id.trim().parse::<u32>() { naechste = naechste.max(n); }
        }
    }
    // Exporte im Archiv nach Größe: liegt etwas schon dort, nicht nochmal
    let mut im_archiv: HashMap<u64, Vec<PathBuf>> = HashMap::new();
    let mut alle = Vec::new();
    collect_files(archiv, archiv, &mut alle);
    if art == Art::Remix { collect_files(&remixe, &remixe, &mut alle); }
    if art == Art::Sample { collect_files(&samples, &samples, &mut alle); }
    for (size, p, _) in alle {
        if ist_audio(&p) { im_archiv.entry(size).or_default().push(p); }
    }

    let mut erg = EinsammelErgebnis { fertig: Vec::new(), ausgelassen: Vec::new(), fehler: None, protokoll: None };
    // Nach jedem Song geschrieben: bricht der Lauf ab (App-Neustart), bleibt
    // Rückgängig für alles bis dahin möglich
    // Nie ein vorhandenes Protokoll überschreiben: zwei Läufe in einer Sekunde
    let protokoll = unique_dest(protokoll_dir, &format!("einsammeln_{}.json", chrono_frei_stempel()));
    let schreiben = |fertig: &Vec<Eingesammelt>| -> Result<(), String> {
        std::fs::create_dir_all(protokoll_dir).map_err(|e| e.to_string())?;
        std::fs::write(&protokoll, serde_json::to_string_pretty(fertig).map_err(|e| e.to_string())?)
            .map_err(|e| format!("Protokoll nicht geschrieben: {e}"))
    };
    for e in eintraege {
        let name = format!("{}{}", e.id.map(|i| format!("[{i}] ")).unwrap_or_default(), e.titel);
        let pfade: Vec<PathBuf> = e.dateien.iter().map(PathBuf::from).collect();
        if let Some(p) = pfade.iter().find(|p| !p.is_file()) {
            erg.ausgelassen.push(format!("{name}: {} fehlt", p.display()));
            continue;
        }
        // Reste dürfen nur FLPs sein (neuere Projektdatei zu einem Archiv-Beat)
        if art != Art::Reste && !pfade.iter().any(|p| ist_audio(p)) {
            erg.ausgelassen.push(format!("{name}: kein Export"));
            continue;
        }
        if art == Art::Reste {
            let ordner = e.archiv.as_deref().and_then(|a| {
                let mut t = index.iter().filter(|x| x.folder == a);
                match (t.next(), t.next()) { (Some(x), None) => Some(x.path.clone()), _ => None }
            });
            let Some(ordner) = ordner else {
                erg.ausgelassen.push(format!("{name}: Archivordner nicht eindeutig"));
                continue;
            };
            match reste(&pfade, &ordner, &im_archiv) {
                Ok(g) if g.dateien.is_empty() => erg.ausgelassen.push(format!("{name}: nichts fehlt")),
                Ok(g) => {
                    erg.fertig.push(g);
                    schreiben(&erg.fertig)?;
                    erg.protokoll = Some(protokoll.to_string_lossy().to_string());
                }
                Err(f) => { erg.fehler = Some(format!("{name}: {f}")); break; }
            }
            continue;
        }
        // Nur ein Beat mit diesem Titel zählt: ein geteiltes Sample (Tag,
        // Vocals) in einem anderen Beat blockiert den Song nicht
        let doppelt = pfade.iter().filter(|p| ist_audio(p)).find(|p| {
            let size = std::fs::metadata(p).map(|m| m.len()).unwrap_or(0);
            im_archiv.get(&size).is_some_and(|cs| cs.iter().any(|c| {
                same_content(p, c) && match index.iter().find(|x| c.starts_with(&x.path)) {
                    None => true,
                    Some(x) => super::fundstuecke::gleicher_song(&[e.titel.as_str()],
                        e.key.as_deref().and_then(key_schreibweise).as_deref(), e.bpm, c, x),
                }
            }))
        });
        if let Some(p) = doppelt {
            erg.ausgelassen.push(format!("{name}: {} liegt schon im Archiv", p.display()));
            continue;
        }
        naechste += 1;
        let basis = match art {
            Art::Remix => Some((remixe.as_path(), 'R')),
            Art::Sample => Some((samples.as_path(), 'S')),
            _ => None,
        };
        match ein_song(conn, &e, &pfade, archiv, naechste, basis) {
            Ok(g) => {
                erg.fertig.push(g);
                schreiben(&erg.fertig)?;
                erg.protokoll = Some(protokoll.to_string_lossy().to_string());
            }
            Err(f) => {
                erg.fehler = Some(format!("{name}: {f}"));
                break; // Plan: bei einer Abweichung bricht der Lauf ab
            }
        }
    }

    Ok(erg)
}

/// JJJJMMTT_hhmmss aus der Systemzeit (UTC), ohne zusätzliches Crate
fn chrono_frei_stempel() -> String {
    let s = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    format!("{}_{:02}{:02}{:02}", secs_to_date(s).replace('-', ""), (s / 3600) % 24, (s / 60) % 60, s % 60)
}

/// Grau: die Dateien, die im Archiv noch fehlen, nach `<Ordner>/02_OLD`.
/// Was schon byte-gleich im Archiv liegt, bleibt aus.
fn reste(pfade: &[PathBuf], ordner: &Path, im_archiv: &HashMap<u64, Vec<PathBuf>>) -> Result<Eingesammelt, String> {
    let alt = ordner.join("02_OLD");
    let mut im_ordner = Vec::new();
    collect_files(ordner, ordner, &mut im_ordner);
    let mut angelegt = Vec::new();
    for p in pfade {
        let size = std::fs::metadata(p).map(|m| m.len()).unwrap_or(0);
        // Exporte gegen das ganze Archiv, FLPs gegen den eigenen Ordner
        let liegt_schon = im_archiv.get(&size).is_some_and(|cs| cs.iter().any(|c| same_content(p, c)))
            || im_ordner.iter().any(|(s, q, _)| *s == size && same_content(p, q));
        if liegt_schon { continue; }
        std::fs::create_dir_all(&alt).map_err(|e| e.to_string())?;
        let z = unique_dest(&alt, &p.file_name().unwrap().to_string_lossy());
        std::fs::copy(p, &z).map_err(|err| format!("{} nicht kopiert: {err}", p.display()))?;
        if !same_content(p, &z) {
            let _ = std::fs::remove_file(&z);
            return Err(format!("Kopie von {} weicht ab", p.display()));
        }
        angelegt.push((z.to_string_lossy().to_string(), size));
    }
    Ok(Eingesammelt { beat_id: String::new(), ordner: ordner.to_string_lossy().to_string(), dateien: angelegt })
}

/// `flach`: Remix (07_REMIXES, R) oder Sample (06_SAMPLES, S) statt Archiv
fn ein_song(conn: &rusqlite::Connection, e: &EinsammelEintrag, pfade: &[PathBuf], archiv: &Path, nr: u32, flach: Option<(&Path, char)>) -> Result<Eingesammelt, String> {
    let remix = flach;
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
    // FLs eigenes Anlegedatum schlägt das Dateidatum: FLPs werden neu gespeichert
    let begonnen_tag = pfade.iter().filter(|p| ist_flp(p))
        .filter_map(|p| std::fs::read(p).ok().and_then(|b| crate::commands::flp::flp_angelegt(&b)))
        .chain([secs_to_date(begonnen)])
        .min()
        .unwrap();

    let ordner_name = build_archive_folder_name(nr as i32, titel, key.as_deref(), bpm);
    let ziel = match remix {
        // Remixe flach: 07_REMIXES/R0001 - Titel [Key BPM]
        Some((r, p)) => r.join(format!("{p}{ordner_name}")),
        // „2024/11_NOVEMBER“ kommt mit Schrägstrich, im Pfad einheitlich trennen
        None => archiv.join(year_month_from_secs(fertig).replace('/', std::path::MAIN_SEPARATOR_STR)).join(&ordner_name),
    };
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

    // Erst in einen Zwischenordner, geprüft, dann umbenennen: ein Abbruch
    // (App-Neustart, Strom) hinterlässt nie einen halben Beat im Archiv.
    // Der Unterstrich hält ihn aus dem Archiv-Index heraus.
    std::fs::create_dir_all(ziel.parent().unwrap()).map_err(|e| e.to_string())?;
    let zwischen = ziel.parent().unwrap().join(format!("_einsammeln_{}{nr:04}.tmp", match remix { Some((_, p)) => p.to_string(), None => String::new() }));
    if zwischen.exists() {
        // Rest eines abgebrochenen Laufs: den Namen legt nur diese Funktion an
        std::fs::remove_dir_all(&zwischen).map_err(|e| format!("{} lässt sich nicht aufräumen: {e}", zwischen.display()))?;
    }
    let mut kopiert: Vec<PathBuf> = Vec::new(); // endgültige Pfade
    let kopieren = (|| -> Result<(), String> {
        for (q, z) in &plan {
            let rel = z.strip_prefix(&ziel).unwrap();
            let tmp = zwischen.join(rel);
            let tmp = unique_dest(tmp.parent().unwrap(), &tmp.file_name().unwrap().to_string_lossy());
            std::fs::create_dir_all(tmp.parent().unwrap()).map_err(|e| e.to_string())?;
            std::fs::copy(q, &tmp).map_err(|err| format!("{} nicht kopiert: {err}", q.display()))?;
            if !same_content(q, &tmp) {
                return Err(format!("Kopie von {} weicht ab", q.display()));
            }
            kopiert.push(ziel.join(tmp.strip_prefix(&zwischen).unwrap()));
        }
        std::fs::rename(&zwischen, &ziel).map_err(|e| format!("{} nicht angelegt: {e}", ziel.display()))
    })();
    if let Err(f) = kopieren {
        let _ = std::fs::remove_dir_all(&zwischen);
        return Err(f);
    }

    let mut angelegt: Vec<(String, u64)> = kopiert.iter()
        .map(|z| (z.to_string_lossy().to_string(), std::fs::metadata(z).map(|m| m.len()).unwrap_or(0)))
        .collect();
    let ergebnis = (|| -> Result<(), String> {
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
            "begonnen": begonnen_tag,
            "fertig": secs_to_date(fertig),
        });
        let json_pfad = saves.join("create_date.json");
        std::fs::create_dir_all(&saves).map_err(|e| e.to_string())?;
        std::fs::write(&json_pfad, serde_json::to_string_pretty(&json).unwrap()).map_err(|e| e.to_string())?;
        angelegt.push((json_pfad.to_string_lossy().to_string(), std::fs::metadata(&json_pfad).map(|m| m.len()).unwrap_or(0)));

        if remix.is_some() {
            return Ok(()); // Remixe und Samples stehen nicht im Beat-Katalog
        }
        let (art, video) = detect_assets(&ziel);
        conn.execute(
            "INSERT INTO beats (id, name, path, bpm, key, status, notes, created_date, modified_date, favorite, has_artwork, has_video, alte_id, begonnen)
             VALUES (?1, ?2, ?3, ?4, ?5, 'finished', ?6, ?7, ?7, 0, ?8, ?9, ?10, ?11)",
            rusqlite::params![
                format!("{nr:04}"), titel, ziel.to_string_lossy(), bpm, key,
                format!("Eingesammelt aus {}", quelle.display()), secs_to_date(fertig),
                art as i32, video as i32, e.id.map(|i| i.to_string()), begonnen_tag,
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
pub fn einsammeln_rueckgaengig(protokoll: String, beat_ids: Option<Vec<String>>) -> Result<Vec<String>, String> {
    crate::db::backup_db()?;
    let conn = open_db().map_err(|e| e.to_string())?;
    rueckgaengig_teil(&conn, Path::new(&protokoll), beat_ids.as_deref())
}

pub(crate) fn rueckgaengig_mit(conn: &rusqlite::Connection, protokoll: &Path) -> Result<Vec<String>, String> {
    rueckgaengig_teil(conn, protokoll, None)
}

/// `nur`: nur diese Beats zurücknehmen; die übrigen bleiben im Protokoll,
/// damit sie später noch zurückgehen
pub(crate) fn rueckgaengig_teil(conn: &rusqlite::Connection, protokoll: &Path, nur: Option<&[String]>) -> Result<Vec<String>, String> {
    let roh = std::fs::read_to_string(protokoll).map_err(|e| format!("Protokoll nicht lesbar: {e}"))?;
    let alle: Vec<Eingesammelt> = serde_json::from_str(&roh).map_err(|e| e.to_string())?;
    let (laeufe, bleiben): (Vec<Eingesammelt>, Vec<Eingesammelt>) = alle.into_iter()
        .partition(|g| nur.is_none_or(|ids| ids.contains(&g.beat_id)));
    if let Some(ids) = nur {
        if let Some(fehlt) = ids.iter().find(|i| !laeufe.iter().any(|g| &g.beat_id == *i)) {
            return Err(format!("{fehlt} steht nicht in diesem Protokoll"));
        }
    }
    let mut hinweise = Vec::new();
    for g in &laeufe {
        for (d, groesse) in &g.dateien {
            match std::fs::metadata(d) {
                Ok(m) if m.len() == *groesse => { let _ = std::fs::remove_file(d); }
                Ok(_) => hinweise.push(format!("{d} wurde geändert, bleibt")),
                Err(_) => {}
            }
        }
        // Reste haben keine eigene Nummer (Grün und Rot schon)
        if g.beat_id.is_empty() {
            // Reste in einem bestehenden Beat: nur 02_OLD wegräumen, wenn leer
            let _ = std::fs::remove_dir(Path::new(&g.ordner).join("02_OLD"));
            continue;
        }
        leere_ordner_weg(Path::new(&g.ordner));
        if Path::new(&g.ordner).exists() {
            hinweise.push(format!("{} enthält neue Dateien, bleibt", g.ordner));
        }
        conn.execute("DELETE FROM beats WHERE id = ?1 AND path = ?2", rusqlite::params![g.beat_id, g.ordner])
            .map_err(|e| e.to_string())?;
    }
    if bleiben.is_empty() {
        let erledigt = protokoll.with_extension("rueckgaengig.json");
        let _ = std::fs::rename(protokoll, erledigt);
    } else {
        // Zurückgenommene getrennt aufheben, der Rest bleibt rücknehmbar
        let weg = unique_dest(protokoll.parent().unwrap(), &format!("{}.teil-rueckgaengig.json", protokoll.file_stem().unwrap().to_string_lossy()));
        std::fs::write(&weg, serde_json::to_string_pretty(&laeufe).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        std::fs::write(protokoll, serde_json::to_string_pretty(&bleiben).map_err(|e| e.to_string())?)
            .map_err(|e| format!("Protokoll nicht aktualisiert: {e}"))?;
    }
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
                dateien: vec![s(&alt.join("[532] Stay - 120 Em_2.mp3")), s(&alt.join("[532] Stay - 120 Em.mp3")), s(&alt.join("532.flp"))], archiv: None },
            EinsammelEintrag { id: None, titel: "whynot".into(), key: None, bpm: None, dateien: vec![s(&andere)], archiv: None },
        ];
        let r = einsammeln_mit(&conn, eintraege, &arch, &t.join("_BEATOS"), Art::Archiv).unwrap();
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

    #[test]
    fn remix_und_reste() {
        let t = std::env::temp_dir().join(format!("beatos_einsammeln_rr_{}", std::process::id()));
        let _ = fs::remove_dir_all(&t);
        let arch = t.join("LIB").join("03_ARCHIVE");
        let beat = arch.join("2024/02_FEBRUARY/0946 - Bloom [D#m 138]");
        datei(&beat.join("Bloom [D#m 138].mp3"), b"bloom1");
        datei(&beat.join("02_OLD/alt.txt"), b"x");
        let alt = t.join("alt");
        datei(&alt.join("[630] Bloom - 138 D#m.mp3"), b"bloom1");   // schon da
        datei(&alt.join("[630_3] Bloom - 138 D#m.mp3"), b"bloom3"); // fehlt
        datei(&alt.join("Remixes/Lil Peep - Star Shopping.wav"), b"peep");
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE beats (id TEXT PRIMARY KEY, name TEXT, path TEXT, bpm REAL, key TEXT, status TEXT, notes TEXT,
            created_date TEXT, modified_date TEXT, favorite INTEGER, has_artwork INTEGER, has_video INTEGER, alte_id TEXT, begonnen TEXT);").unwrap();
        let s = |p: &Path| p.to_string_lossy().to_string();

        // Rot: 07_REMIXES/R0001, kein Katalog-Eintrag
        let rot = vec![EinsammelEintrag { id: None, titel: "Lil Peep - Star Shopping".into(), key: None, bpm: None,
            dateien: vec![s(&alt.join("Remixes/Lil Peep - Star Shopping.wav"))], archiv: None }];
        let r = einsammeln_mit(&conn, rot, &arch, &t.join("_BEATOS"), Art::Remix).unwrap();
        assert!(r.fehler.is_none(), "{:?}", r.fehler);
        let ziel = PathBuf::from(&r.fertig[0].ordner);
        assert_eq!(ziel, t.join("LIB/07_REMIXES/R0001 - Lil Peep - Star Shopping"));
        assert!(ziel.join("Lil Peep - Star Shopping.wav").is_file());
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM beats", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 0);

        // Grau: nur die fehlende Version nach 02_OLD
        let grau = vec![EinsammelEintrag { id: Some(630), titel: "Bloom".into(), key: None, bpm: None,
            dateien: vec![s(&alt.join("[630] Bloom - 138 D#m.mp3")), s(&alt.join("[630_3] Bloom - 138 D#m.mp3"))],
            archiv: Some("0946 - Bloom [D#m 138]".into()) }];
        let g = einsammeln_mit(&conn, grau, &arch, &t.join("_BEATOS"), Art::Reste).unwrap();
        assert!(g.fehler.is_none(), "{:?}", g.fehler);
        assert_eq!(g.fertig[0].dateien.len(), 1);
        assert_eq!(fs::read(beat.join("02_OLD/[630_3] Bloom - 138 D#m.mp3")).unwrap(), b"bloom3");

        // Gleich wie mit nur einer FLP (Louis V: neuere Projektdatei)
        datei(&alt.join("Project_78.flp"), b"flp-neu");
        let flp = vec![EinsammelEintrag { id: None, titel: "Bloom".into(), key: None, bpm: None,
            dateien: vec![s(&alt.join("Project_78.flp"))], archiv: Some("0946 - Bloom [D#m 138]".into()) }];
        let f = einsammeln_mit(&conn, flp, &arch, &t.join("_BEATOS"), Art::Reste).unwrap();
        assert!(f.ausgelassen.is_empty(), "{:?}", f.ausgelassen);
        assert_eq!(fs::read(beat.join("02_OLD/Project_78.flp")).unwrap(), b"flp-neu");

        // Rückgängig: Kopie weg, der Beat und sein 02_OLD bleiben
        rueckgaengig_mit(&conn, Path::new(g.protokoll.as_ref().unwrap())).unwrap();
        assert!(!beat.join("02_OLD/[630_3] Bloom - 138 D#m.mp3").exists());
        assert!(beat.join("02_OLD/alt.txt").is_file());
        assert!(beat.join("Bloom [D#m 138].mp3").is_file());
        rueckgaengig_mit(&conn, Path::new(r.protokoll.as_ref().unwrap())).unwrap();
        assert!(!ziel.exists());
        let _ = fs::remove_dir_all(&t);
    }

    #[test]
    fn sammelordner_wird_nicht_mitkopiert() {
        let t = std::env::temp_dir().join(format!("beatos_einsammeln_lofi_{}", std::process::id()));
        let _ = fs::remove_dir_all(&t);
        let arch = t.join("archiv");
        fs::create_dir_all(&arch).unwrap();
        let lofi = t.join("alt/Lo-Fi");
        datei(&lofi.join("[239] LoFi - Bpm75 - D#m.mp3"), b"lofi");
        datei(&lofi.join("[239] LoFi - Bpm75 - D#m.flp"), b"lofi-flp");
        datei(&lofi.join("[280] Paris - Bpm92 - Amin.mp3"), b"paris");
        datei(&lofi.join("untitled.flp"), b"fremd");
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE beats (id TEXT PRIMARY KEY, name TEXT, path TEXT, bpm REAL, key TEXT, status TEXT, notes TEXT,
            created_date TEXT, modified_date TEXT, favorite INTEGER, has_artwork INTEGER, has_video INTEGER, alte_id TEXT, begonnen TEXT);").unwrap();
        let s = |p: &Path| p.to_string_lossy().to_string();
        let e = EinsammelEintrag { id: Some(239), titel: "LoFi".into(), key: Some("D#m".into()), bpm: Some(75), archiv: None,
            dateien: vec![s(&lofi.join("[239] LoFi - Bpm75 - D#m.mp3")), s(&lofi.join("[239] LoFi - Bpm75 - D#m.flp"))] };
        let r = einsammeln_mit(&conn, vec![e], &arch, &t.join("_BEATOS"), Art::Archiv).unwrap();
        assert!(r.fehler.is_none(), "{:?}", r.fehler);
        let mut alle = Vec::new();
        collect_files(Path::new(&r.fertig[0].ordner), Path::new(&r.fertig[0].ordner), &mut alle);
        let namen: Vec<String> = alle.iter().map(|(_, _, rel)| rel.clone()).collect();
        assert!(!namen.iter().any(|n| n.contains("Paris") || n.contains("untitled")), "{namen:?}");
        let _ = fs::remove_dir_all(&t);
    }

    #[test]
    fn loop_nach_samples() {
        let t = std::env::temp_dir().join(format!("beatos_einsammeln_loop_{}", std::process::id()));
        let _ = fs::remove_dir_all(&t);
        let arch = t.join("LIB").join("03_ARCHIVE");
        fs::create_dir_all(&arch).unwrap();
        fs::create_dir_all(t.join("LIB/06_SAMPLES/S0005 Project_0889")).unwrap();
        fs::create_dir_all(t.join("LIB/06_SAMPLES/_MIDI")).unwrap();
        datei(&t.join("alt/198_Loop.mp3"), b"loop");
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE beats (id TEXT PRIMARY KEY, name TEXT, path TEXT, bpm REAL, key TEXT, status TEXT, notes TEXT,
            created_date TEXT, modified_date TEXT, favorite INTEGER, has_artwork INTEGER, has_video INTEGER, alte_id TEXT, begonnen TEXT);").unwrap();
        let e = EinsammelEintrag { id: Some(198), titel: "Dark Loop".into(), key: Some("Amin".into()), bpm: Some(140),
            dateien: vec![t.join("alt/198_Loop.mp3").to_string_lossy().to_string()], archiv: None };
        let r = einsammeln_mit(&conn, vec![e], &arch, &t.join("_BEATOS"), Art::Sample).unwrap();
        assert!(r.fehler.is_none(), "{:?}", r.fehler);
        let ziel = PathBuf::from(&r.fertig[0].ordner);
        assert_eq!(ziel, t.join("LIB/06_SAMPLES/S0006 - Dark Loop [Am 140]"));
        assert!(ziel.join("Dark Loop [Am 140].mp3").is_file());
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM beats", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 0);
        let _ = fs::remove_dir_all(&t);
    }

    #[test]
    fn teil_rueckgaengig() {
        let t = std::env::temp_dir().join(format!("beatos_einsammeln_teil_{}", std::process::id()));
        let _ = fs::remove_dir_all(&t);
        let arch = t.join("archiv");
        fs::create_dir_all(&arch).unwrap();
        let alt = t.join("alt");
        datei(&alt.join("[630] Bloom - 138 D#m.mp3"), b"b");
        datei(&alt.join("397 . Master.mp3"), b"m");
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE beats (id TEXT PRIMARY KEY, name TEXT, path TEXT, bpm REAL, key TEXT, status TEXT, notes TEXT,
            created_date TEXT, modified_date TEXT, favorite INTEGER, has_artwork INTEGER, has_video INTEGER, alte_id TEXT, begonnen TEXT);").unwrap();
        let s = |p: &Path| p.to_string_lossy().to_string();
        let ein = |id: u32, titel: &str, d: &str| EinsammelEintrag { id: Some(id), titel: titel.into(), key: None, bpm: None, dateien: vec![s(&alt.join(d))], archiv: None };
        let r = einsammeln_mit(&conn, vec![ein(630, "Bloom", "[630] Bloom - 138 D#m.mp3"), ein(397, "Master", "397 . Master.mp3")], &arch, &t.join("_BEATOS"), Art::Archiv).unwrap();
        let p = PathBuf::from(r.protokoll.unwrap());
        let master = r.fertig.iter().find(|g| g.ordner.contains("Master")).unwrap().clone();
        let bloom = r.fertig.iter().find(|g| g.ordner.contains("Bloom")).unwrap().clone();
        rueckgaengig_teil(&conn, &p, Some(&[master.beat_id.clone()])).unwrap();
        assert!(!Path::new(&master.ordner).exists());
        assert!(Path::new(&bloom.ordner).exists());
        // Bloom bleibt im Protokoll und lässt sich weiter zurücknehmen
        rueckgaengig_mit(&conn, &p).unwrap();
        assert!(!Path::new(&bloom.ordner).exists());
        assert!(rueckgaengig_teil(&conn, &p, Some(&["0001".into()])).is_err());
        let _ = fs::remove_dir_all(&t);
    }

    /// Einen Teil eines echten Laufs zurücknehmen (echte DB!):
    /// BEATOS_PROTOKOLL, BEATOS_IDS (mit , getrennt)
    #[test]
    #[ignore]
    fn teil_rueckgaengig_echt() {
        let db = PathBuf::from(std::env::var("LOCALAPPDATA").unwrap()).join("BeatOS").join("beats.db");
        let conn = rusqlite::Connection::open(&db).unwrap();
        let ids: Vec<String> = std::env::var("BEATOS_IDS").unwrap().split(',').map(|s| s.trim().to_string()).collect();
        let hinweise = rueckgaengig_teil(&conn, Path::new(&std::env::var("BEATOS_PROTOKOLL").unwrap()), Some(&ids)).unwrap();
        println!("{} zurückgenommen, Hinweise: {hinweise:?}", ids.len());
    }

    /// „Gleich wie“ auf echten Daten: BEATOS_DATEIEN (;-getrennt) nach
    /// BEATOS_ARCHIV_ORDNER/02_OLD, mit Protokoll in _BEATOS
    #[test]
    #[ignore]
    fn reste_echt() {
        let db = PathBuf::from(std::env::var("LOCALAPPDATA").unwrap()).join("BeatOS").join("beats.db");
        let conn = rusqlite::Connection::open(&db).unwrap();
        let arch = PathBuf::from(std::env::var("BEATOS_ARCHIVE").unwrap());
        // Ohne BEATOS_ARCHIV_ORDNER: als neuer Song (BEATOS_TITEL, _ID, _KEY, _BPM)
        let v = |k: &str| std::env::var(k).ok().filter(|s| !s.is_empty());
        let archiv = v("BEATOS_ARCHIV_ORDNER");
        let art = if archiv.is_some() { Art::Reste } else { Art::Archiv };
        let e = EinsammelEintrag { id: v("BEATOS_ID").and_then(|s| s.parse().ok()), titel: v("BEATOS_TITEL").unwrap_or_default(),
            key: v("BEATOS_KEY"), bpm: v("BEATOS_BPM").and_then(|s| s.parse().ok()), archiv,
            dateien: std::env::var("BEATOS_DATEIEN").unwrap().split(';').map(|s| s.trim().to_string()).collect() };
        let r = einsammeln_mit(&conn, vec![e], &arch, &arch.parent().unwrap().join("_BEATOS"), art).unwrap();
        println!("{:?} {:?} {:?}", r.fertig.iter().map(|g| &g.dateien).collect::<Vec<_>>(), r.ausgelassen, r.fehler);
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
        let e = EinsammelEintrag { id: f.id, titel: f.titel.clone(), key: f.key.clone(), bpm: f.bpm, dateien: f.dateien.iter().map(|d| d.path.clone()).collect(), archiv: None };
        let r = einsammeln_mit(&conn, vec![e], &arch, &t.join("_BEATOS"), Art::Archiv).unwrap();
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
