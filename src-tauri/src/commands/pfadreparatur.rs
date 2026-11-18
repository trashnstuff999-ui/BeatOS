// src-tauri/src/commands/pfadreparatur.rs
// ═══════════════════════════════════════════════════════════════════════════════
// FLP-Pfade im Archiv reparieren (vor Scheibe 4, gemessen 10.11.2026: 254 Beats,
// 2207 Verweise ins Leere). FL speichert jeden Audio-Pfad voll; nach Archivieren,
// Umbenennen und Umsortieren der Sample-Packs zeigen viele ins Leere.
//
// Je fehlendem Verweis, in dieser Reihenfolge:
//   1. Datei gleichen Namens im eigenen Beat-Ordner     → dorthin umbiegen
//   2. sonst eindeutig im Suchindex (längster passender  → liegt sie an einem
//      Pfad-Schwanz, bei Gleichstand gleiche Größe)        sicheren Ort: umbiegen;
//                                                          in Downloads, D: oder
//                                                          Produktion: erst nach
//                                                          01_SAVEFILES/Samples kopieren
//   3. sonst: bleibt, steht im Bericht
// Jede FLP bekommt vorher eine Sicherung „(vor Pfad-Reparatur)“ in Backup/
// (flp_umschreiben). Backup/ und Autosaves/ selbst bleiben unberührt.
// Kopien werden geprüft und im Protokoll gelistet (Rückgängig: löschen + Sicherung zurück).
// ═══════════════════════════════════════════════════════════════════════════════

// ponytail: läuft nur über die Handprobe `pfadreparatur_echt`; App-Knopf erst, wenn er gebraucht wird
#![allow(dead_code)]

use crate::commands::flp::{audio_pfade, flp_umschreiben};
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

const AUDIO: &[&str] = &["wav", "mp3", "flac", "aif", "aiff", "ogg"];

fn ist_audio(p: &Path) -> bool {
    p.extension().is_some_and(|e| AUDIO.contains(&e.to_string_lossy().to_lowercase().as_str()))
}

fn ist_ausgeschlossen(name: &str) -> bool {
    let n = name.to_lowercase();
    n == "backup" || n == "autosaves"
}

/// Alle Dateien unter `d`; `ohne_backup` lässt Backup/ und Autosaves/ aus.
pub(crate) fn dateien(d: &Path, ohne_backup: bool, out: &mut Vec<PathBuf>) {
    let Ok(rd) = std::fs::read_dir(d) else { return };
    for e in rd.flatten() {
        let p = e.path();
        if p.is_dir() {
            if ohne_backup && ist_ausgeschlossen(&e.file_name().to_string_lossy()) { continue; }
            dateien(&p, ohne_backup, out);
        } else {
            out.push(p);
        }
    }
}

/// Dateiname (klein) → alle Fundorte
pub(crate) struct Index(HashMap<String, Vec<PathBuf>>);

impl Index {
    pub(crate) fn bauen(wurzeln: &[PathBuf]) -> Index {
        let mut m: HashMap<String, Vec<PathBuf>> = HashMap::new();
        for w in wurzeln {
            let mut alle = Vec::new();
            dateien(w, false, &mut alle);
            for p in alle.into_iter().filter(|p| ist_audio(p)) {
                if p.components().any(|k| k.as_os_str().eq_ignore_ascii_case("backup")) { continue; }
                let k = p.file_name().unwrap().to_string_lossy().to_lowercase();
                m.entry(k).or_default().push(p);
            }
        }
        Index(m)
    }
}

/// Wie viele Pfadteile von hinten gleich sind (Name zählt mit)
fn schwanz(a: &str, b: &Path) -> usize {
    let ta: Vec<String> = a.split(['\\', '/']).map(|s| s.to_lowercase()).collect();
    let tb: Vec<String> = b.components().map(|k| k.as_os_str().to_string_lossy().to_lowercase()).collect();
    ta.iter().rev().zip(tb.iter().rev()).take_while(|(x, y)| x == y).count()
}

/// Kein sicherer Ort: Downloads, Laufwerk D:, Produktion (wird umbenannt/aufgeräumt)
fn unsicher(p: &Path) -> bool {
    let s = p.to_string_lossy().to_lowercase();
    s.starts_with("d:") || s.contains("\\downloads") || s.contains("01_active_production")
}

#[derive(Debug, Serialize, Default)]
pub struct Bericht {
    pub flps: usize,
    pub flps_geaendert: usize,
    pub umgebogen: usize,
    pub kopiert: Vec<(String, String)>,
    pub mehrdeutig: Vec<String>,
    pub nicht_gefunden: Vec<String>,
}

enum Loesung { Hier(PathBuf), Woanders(PathBuf), Mehrdeutig(usize), Nichts }

fn loesen(fehlt: &str, beat_audio: &[PathBuf], index: &Index) -> Loesung {
    let name = fehlt.rsplit(['\\', '/']).next().unwrap_or("").to_lowercase();
    // 1. im eigenen Beat-Ordner: der mit dem längsten passenden Schwanz
    let mut hier: Vec<&PathBuf> = beat_audio.iter().filter(|p| p.file_name().is_some_and(|n| n.to_string_lossy().to_lowercase() == name)).collect();
    if !hier.is_empty() {
        let m = hier.iter().map(|p| schwanz(fehlt, p)).max().unwrap();
        hier.retain(|p| schwanz(fehlt, p) == m);
        return Loesung::Hier(hier[0].clone());
    }
    // 2. Suchindex
    let Some(alle) = index.0.get(&name) else { return Loesung::Nichts };
    let m = alle.iter().map(|p| schwanz(fehlt, p)).max().unwrap_or(0);
    let mut wahl: Vec<&PathBuf> = alle.iter().filter(|p| schwanz(fehlt, p) == m).collect();
    if wahl.len() > 1 {
        let groessen: std::collections::HashSet<u64> = wahl.iter().filter_map(|p| std::fs::metadata(p).ok()).map(|m| m.len()).collect();
        if groessen.len() == 1 { wahl.truncate(1); }
    }
    match wahl.as_slice() {
        [p] => Loesung::Woanders((*p).clone()),
        [] => Loesung::Nichts,
        v => Loesung::Mehrdeutig(v.len()),
    }
}

/// Einen Beat-Ordner reparieren. `schreiben = false`: nur der Bericht.
pub(crate) fn beat_reparieren(beat: &Path, index: &Index, schreiben: bool) -> Result<Bericht, String> {
    let mut alle = Vec::new();
    dateien(beat, true, &mut alle);
    let flps: Vec<&PathBuf> = alle.iter().filter(|p| p.extension().is_some_and(|e| e.eq_ignore_ascii_case("flp"))).collect();
    // Audio im Beat, auch in Backup-freien Unterordnern (Audio/, Samples/, 02_OLD/ …)
    let beat_audio: Vec<PathBuf> = alle.iter().filter(|p| ist_audio(p)).cloned().collect();
    let samples = beat.join("01_SAVEFILES").join("Samples");
    let mut b = Bericht { flps: flps.len(), ..Default::default() };
    // Kopien je Quelle nur einmal
    let mut kopie_von: HashMap<PathBuf, PathBuf> = HashMap::new();
    for flp in flps {
        let bytes = std::fs::read(flp).map_err(|e| format!("{}: {e}", flp.display()))?;
        let mut ersatz: Vec<(String, String)> = Vec::new();
        for p in audio_pfade(&bytes) {
            if p.starts_with('%') || Path::new(&p).is_file() { continue; }
            match loesen(&p, &beat_audio, index) {
                Loesung::Hier(z) => ersatz.push((p, z.to_string_lossy().to_string())),
                Loesung::Woanders(q) if !unsicher(&q) => ersatz.push((p, q.to_string_lossy().to_string())),
                Loesung::Woanders(q) => {
                    let ziel = if let Some(z) = kopie_von.get(&q) { z.clone() } else {
                        let z = freier_name(&q, &samples.join(q.file_name().unwrap()));
                        if schreiben && !z.exists() {
                            std::fs::create_dir_all(&samples).map_err(|e| e.to_string())?;
                            crate::utils::copy_and_verify(&q, &z)?;
                        }
                        b.kopiert.push((q.to_string_lossy().to_string(), z.to_string_lossy().to_string()));
                        kopie_von.insert(q.clone(), z.clone());
                        z
                    };
                    ersatz.push((p, ziel.to_string_lossy().to_string()));
                }
                Loesung::Mehrdeutig(n) => b.mehrdeutig.push(format!("{} ({n}×)", p)),
                Loesung::Nichts => b.nicht_gefunden.push(p),
            }
        }
        if ersatz.is_empty() { continue; }
        b.umgebogen += ersatz.len();
        b.flps_geaendert += 1;
        if schreiben { flp_umschreiben(flp, &ersatz, "vor Pfad-Reparatur")?; }
    }
    b.mehrdeutig.sort(); b.mehrdeutig.dedup();
    b.nicht_gefunden.sort(); b.nicht_gefunden.dedup();
    Ok(b)
}

/// Vorhandene Verweise an unsicheren Orten (Produktion, Downloads, D:) in den Beat holen:
/// kopieren nach 01_SAVEFILES/Audio (lag in einem „Audio“-Ordner) bzw. 01_SAVEFILES/Samples,
/// dann umbiegen. Danach hängt der Beat nicht mehr am Produktionsordner.
pub(crate) fn unsichere_holen(beat: &Path, schreiben: bool) -> Result<Bericht, String> {
    let mut alle = Vec::new();
    dateien(beat, true, &mut alle);
    let flps: Vec<&PathBuf> = alle.iter().filter(|p| p.extension().is_some_and(|e| e.eq_ignore_ascii_case("flp"))).collect();
    let beat_klein = beat.to_string_lossy().replace('/', "\\").to_lowercase() + "\\";
    // Liegt die Datei schon byte-gleich im eigenen Ordner (ganzer Artist-Ordner kopiert),
    // wird nur umgebogen, nicht noch einmal kopiert
    let eigene: Vec<PathBuf> = alle.iter().filter(|p| ist_audio(p)).cloned().collect();
    let schon_hier = |q: &Path| -> Option<PathBuf> {
        let n = q.file_name()?.to_string_lossy().to_lowercase();
        eigene.iter().find(|e| e.file_name().is_some_and(|x| x.to_string_lossy().to_lowercase() == n)
            && crate::commands::archive_match::same_content(q, e)).cloned()
    };
    let mut b = Bericht { flps: flps.len(), ..Default::default() };
    let mut kopie_von: HashMap<PathBuf, PathBuf> = HashMap::new();
    for flp in flps {
        let bytes = std::fs::read(flp).map_err(|e| format!("{}: {e}", flp.display()))?;
        let mut ersatz: Vec<(String, String)> = Vec::new();
        for p in audio_pfade(&bytes) {
            let q = PathBuf::from(p.replace('/', "\\"));
            // Produktion (wird aufgeräumt), Downloads und Altbestand (geht in Scheibe 10 nach _ALT);
            // die Sample-Bibliothek auf D: bleibt, wo sie ist
            let s = q.to_string_lossy().to_lowercase();
            let holen = s.contains("\\01_active_production\\") || s.contains("\\downloads")
                || s.contains("\\music\\songs\\") || s.contains("\\image-line\\fl studio\\projects\\");
            if p.starts_with('%') || !q.is_file() || !holen || s.starts_with(&beat_klein) { continue; }
            let ziel = if let Some(z) = kopie_von.get(&q) { z.clone() } else if let Some(h) = schon_hier(&q) {
                kopie_von.insert(q.clone(), h.clone());
                h
            } else {
                let audio = q.parent().and_then(|e| e.file_name()).is_some_and(|n| n.eq_ignore_ascii_case("audio"));
                let ordner = beat.join("01_SAVEFILES").join(if audio { "Audio" } else { "Samples" });
                let z = freier_name(&q, &ordner.join(q.file_name().unwrap()));
                if schreiben && !z.exists() {
                    std::fs::create_dir_all(&ordner).map_err(|e| e.to_string())?;
                    crate::utils::copy_and_verify(&q, &z)?;
                }
                b.kopiert.push((q.to_string_lossy().to_string(), z.to_string_lossy().to_string()));
                kopie_von.insert(q.clone(), z.clone());
                z
            };
            ersatz.push((p, ziel.to_string_lossy().to_string()));
        }
        if ersatz.is_empty() { continue; }
        b.umgebogen += ersatz.len();
        b.flps_geaendert += 1;
        if schreiben { flp_umschreiben(flp, &ersatz, "vor Pfad-Reparatur")?; }
    }
    Ok(b)
}

/// Von Hand gewählt: Verweis `alt` in allen FLPs des Beats auf `quelle` umbiegen,
/// bei unsicherem Ort vorher nach 01_SAVEFILES/Samples kopieren. Gibt die Zahl
/// der geänderten FLPs zurück.
pub(crate) fn von_hand(beat: &Path, alt: &str, quelle: &Path) -> Result<usize, String> {
    if !quelle.is_file() { return Err(format!("{} fehlt", quelle.display())); }
    let ziel = if unsicher(quelle) {
        let samples = beat.join("01_SAVEFILES").join("Samples");
        let z = freier_name(quelle, &samples.join(quelle.file_name().unwrap()));
        if !z.exists() {
            std::fs::create_dir_all(&samples).map_err(|e| e.to_string())?;
            crate::utils::copy_and_verify(quelle, &z)?;
        }
        z
    } else { quelle.to_path_buf() };
    let mut alle = Vec::new();
    dateien(beat, true, &mut alle);
    let mut n = 0;
    for flp in alle.iter().filter(|p| p.extension().is_some_and(|e| e.eq_ignore_ascii_case("flp"))) {
        let bytes = std::fs::read(flp).map_err(|e| e.to_string())?;
        if !audio_pfade(&bytes).iter().any(|p| p == alt) { continue; }
        flp_umschreiben(flp, &[(alt.to_string(), ziel.to_string_lossy().to_string())], "vor Pfad-Reparatur")?;
        n += 1;
    }
    Ok(n)
}

/// Etwas wurde umbenannt (alt → neu, Ordner oder Datei): jede FLP unter `wurzeln`,
/// die noch auf den alten Pfad zeigt, auf den neuen umbiegen. Eine umbenannte
/// Datei geht vor ihrem umbenannten Ordner. Gibt die Zahl der geänderten FLPs
/// zurück; eine gesperrte FLP (in FL offen) bleibt, wie sie ist.
pub(crate) fn verweise_umbiegen(paare: &[(PathBuf, PathBuf)], wurzeln: &[PathBuf], anlass: &str, offen: &dyn Fn(&Path) -> bool) -> Nachzug {
    let mut alle = Vec::new();
    for w in wurzeln { dateien(w, true, &mut alle); }
    alle.retain(|p| p.extension().is_some_and(|e| e.eq_ignore_ascii_case("flp")));
    verweise_in(paare, &alle, anlass, offen)
}

/// Was beim Nachziehen herauskam. `offen` = in FL offen, nicht angefasst
/// (FL schriebe beim Speichern die alten Pfade zurück).
#[derive(Default)]
pub(crate) struct Nachzug { pub geaendert: usize, pub offen: Vec<PathBuf>, pub fehler: Vec<String> }

/// Wie `verweise_umbiegen`, nur über diese FLPs.
pub(crate) fn verweise_in(paare: &[(PathBuf, PathBuf)], flps: &[PathBuf], anlass: &str, offen: &dyn Fn(&Path) -> bool) -> Nachzug {
    let klein = |p: &Path| p.to_string_lossy().replace('/', "\\").to_lowercase();
    let karte: HashMap<String, &PathBuf> = paare.iter().map(|(a, n)| (klein(a), n)).collect();
    let mut n = Nachzug::default();
    for flp in flps {
        let Ok(bytes) = std::fs::read(flp) else { continue };
        let ersatz: Vec<(String, String)> = audio_pfade(&bytes).into_iter().filter_map(|p| {
            let pp = PathBuf::from(p.replace('/', "\\"));
            // `join` mit leerem Rest hängte einen Schrägstrich an: die Datei selbst getrennt
            let ziel = pp.ancestors().find_map(|a| karte.get(&klein(a)).map(|neu| {
                if a == pp { (*neu).clone() } else { neu.join(pp.strip_prefix(a).unwrap()) }
            }))?;
            (klein(&ziel) != klein(&pp)).then(|| (p, ziel.to_string_lossy().to_string()))
        }).collect();
        if ersatz.is_empty() { continue; }
        if offen(flp) { n.offen.push(flp.clone()); continue; }
        match flp_umschreiben(flp, &ersatz, anlass) {
            Ok(k) if k > 0 => n.geaendert += 1,
            Ok(_) => {}
            Err(e) => n.fehler.push(e),
        }
    }
    n
}

/// Nach dem Umbenennen eines Projektordners: Verweise ins Leere auf die Datei
/// gleichen Namens im eigenen Ordner umbiegen. Nur der eigene Ordner, nie ein
/// anderes Projekt: beim Nachrücken trägt ein anderes Projekt den alten Namen.
pub(crate) fn eigener_ordner(dir: &Path) -> Result<usize, String> {
    Ok(beat_reparieren(dir, &Index(HashMap::new()), true)?.umgebogen)
}

/// Ziel für eine Kopie: der Name selbst, „Name (2)“ … — oder der Name, unter dem
/// dieselbe Datei dort schon liegt.
fn freier_name(quelle: &Path, ziel: &Path) -> PathBuf {
    let stamm = ziel.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let ext = ziel.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    for i in 1.. {
        let k = if i == 1 { ziel.to_path_buf() } else { ziel.with_file_name(format!("{stamm} ({i}){ext}")) };
        if !k.exists() || crate::commands::archive_match::same_content(quelle, &k) { return k; }
    }
    unreachable!()
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
    fn umbenanntes_sample_zieht_die_beats_nach() {
        let t = std::env::temp_dir().join(format!("beatos_verweise_{}", std::process::id()));
        let _ = fs::remove_dir_all(&t);
        let alt = t.join("06_SAMPLES").join("dont cry 150 bm");
        let neu = t.join("06_SAMPLES").join("S0044 - DONT CRY [150 Bmin]");
        let beat = t.join("01_ACTIVE_PRODUCTION").join("P0001");
        for (p, x) in [(neu.join("PAD - DONT CRY [150 Bmin].wav"), "p"), (neu.join("roh.wav"), "r"), (t.join("fremd.wav"), "f")] {
            fs::create_dir_all(p.parent().unwrap()).unwrap(); fs::write(&p, x).unwrap();
        }
        fs::create_dir_all(&beat).unwrap();
        let s = |p: PathBuf| p.to_string_lossy().to_string();
        let flp = beat.join("P0001.flp");
        fs::write(&flp, flp_mit(&[s(alt.join("pads.wav")), s(alt.join("roh.wav")), s(t.join("fremd.wav"))])).unwrap();
        // Ordner umbenannt, eine Spur darin auch
        let paare = vec![(alt.clone(), neu.clone()), (alt.join("pads.wav"), neu.join("PAD - DONT CRY [150 Bmin].wav"))];
        let wurzel = [t.join("01_ACTIVE_PRODUCTION")];
        // In FL offen: nicht anfassen, sondern melden
        let n = verweise_umbiegen(&paare, &wurzel, "vor Sample-Umbenennung", &|_| true);
        assert_eq!((n.geaendert, n.offen.clone()), (0, vec![flp.clone()]));
        assert_eq!(audio_pfade(&fs::read(&flp).unwrap())[0], s(alt.join("pads.wav")));
        // FL hat sie geschlossen: jetzt nachziehen
        assert_eq!(verweise_in(&paare, &n.offen, "vor Sample-Umbenennung", &|_| false).geaendert, 1);
        let jetzt = audio_pfade(&fs::read(&flp).unwrap());
        assert_eq!(jetzt, [s(neu.join("PAD - DONT CRY [150 Bmin].wav")), s(neu.join("roh.wav")), s(t.join("fremd.wav"))]);
        assert!(beat.join("Backup/P0001 (vor Sample-Umbenennung).flp").is_file());
        assert_eq!(verweise_umbiegen(&paare, &wurzel, "x", &|_| false).geaendert, 0, "zweimal: nichts mehr zu tun");
        let _ = fs::remove_dir_all(&t);
    }

    #[test]
    fn pfade_im_archiv_reparieren() {
        let t = std::env::temp_dir().join(format!("beatos_pfadrep_{}", std::process::id()));
        let _ = fs::remove_dir_all(&t);
        let beat = t.join("03_ARCHIVE/2026/02_FEBRUARY/0854 - LONELY WORLD [Am 148]");
        let vault = t.join("Vault/Drum Kits/Rarely used imo/Nettspend Type/Open Hats");
        let dl = t.join("D/Downloads");
        for (p, x) in [(beat.join("01_SAVEFILES/Audio/Kontakt (consolidated).wav"), "k"), (vault.join("Hat.wav"), "h"),
                       (dl.join("vocals_CLEAN.wav"), "v"), (t.join("Andere/Hihat 3.wav"), "a"), (t.join("Noch/Hihat 3.wav"), "bb")] {
            fs::create_dir_all(p.parent().unwrap()).unwrap(); fs::write(&p, x).unwrap();
        }
        let s = |p: &str| p.replace('/', "\\");
        let alt = [
            s("C:/x/01_ACTIVE_PRODUCTION/0855/Audio/Kontakt (consolidated).wav"),
            s("C:/x/Vault/Drum Kits/Nettspend Type/Open Hats/Hat.wav"),
            s("D:/Downloads [D]/vocals_CLEAN.wav"),
            s("C:/weg/Hihat 3.wav"),
            s("C:/weg/gibtsnicht.wav"),
        ];
        let flp = beat.join("01_SAVEFILES/LONELY WORLD [Am 148].flp");
        fs::write(&flp, flp_mit(&alt)).unwrap();
        // Downloads als „D:“ simulieren: unsicher() prüft „\downloads“
        let index = Index::bauen(&[t.join("Vault"), t.join("D"), t.join("Andere"), t.join("Noch")]);
        let probe = beat_reparieren(&beat, &index, false).unwrap();
        assert_eq!((probe.umgebogen, probe.kopiert.len(), probe.mehrdeutig.len(), probe.nicht_gefunden.len()), (3, 1, 1, 1), "{probe:#?}");
        assert_eq!(fs::read(&flp).unwrap(), flp_mit(&alt), "Probe darf nichts schreiben");
        let r = beat_reparieren(&beat, &index, true).unwrap();
        assert_eq!(r.umgebogen, 3);
        let neu = audio_pfade(&fs::read(&flp).unwrap());
        assert!(Path::new(&neu[0]).is_file() && neu[0].contains("0854 - LONELY WORLD"));
        assert!(neu[1].contains("Rarely used imo"));
        assert!(neu[2].contains("01_SAVEFILES\\Samples\\vocals_CLEAN.wav") || neu[2].contains("01_SAVEFILES/Samples"));
        assert!(Path::new(&neu[2]).is_file());
        assert!(beat.join("01_SAVEFILES/Backup/LONELY WORLD [Am 148] (vor Pfad-Reparatur).flp").is_file());
        // nochmal: nichts mehr zu tun, keine zweite Kopie
        let r2 = beat_reparieren(&beat, &index, true).unwrap();
        assert_eq!((r2.umgebogen, r2.kopiert.len()), (0, 0));
        // Mehrdeutiges von Hand: Quelle unter „Downloads“ → erst kopieren
        assert_eq!(von_hand(&beat, &s("C:/weg/Hihat 3.wav"), &dl.join("vocals_CLEAN.wav")).unwrap(), 1);
        let neu = audio_pfade(&fs::read(&flp).unwrap());
        assert!(neu.iter().all(|p| !p.contains("C:\\weg\\Hihat")) && neu.iter().filter(|p| p.ends_with("vocals_CLEAN.wav")).all(|p| Path::new(p).is_file()));
        let _ = fs::remove_dir_all(&t);
    }

    #[test]
    fn unsichere_in_den_beat_holen() {
        let t = std::env::temp_dir().join(format!("beatos_holen_{}", std::process::id()));
        let _ = fs::remove_dir_all(&t);
        let beat = t.join("03_ARCHIVE/2024/08_AUGUST/B0191 - Nevermore [Am 155]");
        let prod = t.join("01_ACTIVE_PRODUCTION/P0171 - Nevermore");
        for (p, x) in [(prod.join("Audio/vox (consolidated).wav"), "v"), (prod.join("kick.wav"), "k"), (beat.join("01_SAVEFILES/Samples/kick.wav"), "anders")] {
            fs::create_dir_all(p.parent().unwrap()).unwrap(); fs::write(p, x).unwrap();
        }
        let flp = beat.join("02_OLD/Nevermore_2.flp");
        fs::create_dir_all(flp.parent().unwrap()).unwrap();
        let alt = [prod.join("Audio/vox (consolidated).wav").to_string_lossy().to_string(), prod.join("kick.wav").to_string_lossy().to_string()];
        fs::write(&flp, flp_mit(&alt)).unwrap();
        let r = unsichere_holen(&beat, true).unwrap();
        assert_eq!((r.umgebogen, r.kopiert.len()), (2, 2));
        let neu = audio_pfade(&fs::read(&flp).unwrap());
        assert!(neu[0].ends_with("01_SAVEFILES\\Audio\\vox (consolidated).wav") && Path::new(&neu[0]).is_file(), "{neu:?}");
        // gleicher Name, anderer Inhalt: daneben als (2), das Vorhandene bleibt
        assert!(neu[1].ends_with("kick (2).wav") && fs::read(&neu[1]).unwrap() == b"k");
        assert_eq!(fs::read(beat.join("01_SAVEFILES/Samples/kick.wav")).unwrap(), b"anders");
        // zweimal: nichts mehr zu tun
        assert_eq!(unsichere_holen(&beat, true).unwrap().umgebogen, 0);
        // Liegt die Datei schon byte-gleich im Song: nur umbiegen, nicht kopieren
        let alt_ordner = t.join("Music/Songs/Artists/JarnoGm/Song");
        fs::create_dir_all(&alt_ordner).unwrap(); fs::write(alt_ordner.join("hook.wav"), "h").unwrap();
        let song = t.join("05_ARTISTS/JarnoGm/Song");
        fs::create_dir_all(song.join("Audio")).unwrap(); fs::write(song.join("Audio/hook.wav"), "h").unwrap();
        fs::write(song.join("Song.flp"), flp_mit(&[alt_ordner.join("hook.wav").to_string_lossy().to_string()])).unwrap();
        let r = unsichere_holen(&song, true).unwrap();
        assert_eq!((r.umgebogen, r.kopiert.len()), (1, 0));
        assert_eq!(PathBuf::from(&audio_pfade(&fs::read(song.join("Song.flp")).unwrap())[0]), song.join("Audio").join("hook.wav"));
        let _ = fs::remove_dir_all(&t);
    }

    /// Echt: BEATOS_BEATS (;), optional BEATOS_SCHREIBEN=1. Holt Verweise aus unsicheren Orten.
    #[test]
    #[ignore]
    fn holen_echt() {
        let schreiben = std::env::var("BEATOS_SCHREIBEN").is_ok_and(|v| v == "1");
        let (mut u, mut k, mut f) = (0, 0, 0);
        for b in std::env::var("BEATOS_BEATS").unwrap().split(';') {
            let r = unsichere_holen(Path::new(b), schreiben).unwrap();
            if r.umgebogen > 0 { println!("{}: {} Verweise, {} Kopien", Path::new(b).file_name().unwrap().to_string_lossy(), r.umgebogen, r.kopiert.len()); }
            u += r.umgebogen; k += r.kopiert.len(); f += r.flps_geaendert;
        }
        println!("gesamt: {f} FLPs, {u} Verweise, {k} Kopien, geschrieben: {schreiben}");
    }

    /// Echt, schreibt: BEATOS_ZUORDNUNG = TSV „Beat-Ordner <TAB> alter Pfad <TAB> Quelle“.
    #[test]
    #[ignore]
    fn pfadreparatur_von_hand_echt() {
        let tsv = std::fs::read_to_string(std::env::var("BEATOS_ZUORDNUNG").unwrap()).unwrap();
        for z in tsv.lines().filter(|l| !l.trim().is_empty()) {
            let t: Vec<&str> = z.split('\t').collect();
            let n = von_hand(Path::new(t[0]), t[1], Path::new(t[2])).unwrap();
            println!("{}: {n} FLP(s) → {}", Path::new(t[0]).file_name().unwrap().to_string_lossy(), t[2]);
        }
    }

    /// Echt (schreibt nur mit BEATOS_SCHREIBEN=1): BEATOS_BEATS = Beat-Ordner mit ; getrennt,
    /// BEATOS_INDEX = Suchwurzeln mit ;. Bericht als JSON nach BEATOS_PROTOKOLL.
    #[test]
    #[ignore]
    fn pfadreparatur_echt() {
        let beats: Vec<PathBuf> = std::env::var("BEATOS_BEATS").unwrap().split(';').map(PathBuf::from).collect();
        let wurzeln: Vec<PathBuf> = std::env::var("BEATOS_INDEX").unwrap().split(';').map(PathBuf::from).collect();
        let schreiben = std::env::var("BEATOS_SCHREIBEN").is_ok_and(|v| v == "1");
        let index = Index::bauen(&wurzeln);
        let mut protokoll = Vec::new();
        for b in &beats {
            let r = beat_reparieren(b, &index, schreiben).unwrap();
            println!("{}: {} FLPs, {} geändert, {} umgebogen, {} kopiert, {} mehrdeutig, {} fehlen",
                b.file_name().unwrap().to_string_lossy(), r.flps, r.flps_geaendert, r.umgebogen, r.kopiert.len(), r.mehrdeutig.len(), r.nicht_gefunden.len());
            for (q, z) in &r.kopiert { println!("    kopiert {q}\n         → {z}"); }
            for m in &r.mehrdeutig { println!("    mehrdeutig {m}"); }
            for n in &r.nicht_gefunden { println!("    fehlt {n}"); }
            protokoll.push(serde_json::json!({ "beat": b, "bericht": r }));
        }
        if let Ok(p) = std::env::var("BEATOS_PROTOKOLL") {
            std::fs::write(p, serde_json::to_string_pretty(&serde_json::json!({ "geschrieben": schreiben, "beats": protokoll })).unwrap()).unwrap();
        }
    }
}
