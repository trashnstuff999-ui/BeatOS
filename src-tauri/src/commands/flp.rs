// src-tauri/src/commands/flp.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Kapitel aus FL Studio: die Zeitmarker im Playlist-Fenster.
//
// Eine FLP ist eine Kette von Ereignissen: ein Byte Kennung, dann ein Wert,
// dessen Länge an der Kennung hängt (0–63: 1 Byte, 64–127: 2, 128–191: 4,
// ab 192: Länge als Varint, dann Daten). Gebraucht werden nur:
//   99  neues Arrangement (Wert = Nummer)   148  Marker-Position in Ticks
//   156 Tempo × 1000 (fehlt ab FL 26)       205  Marker-Name, UTF-16LE
// PPQ steht im Kopf. Gemessen an 127 eigenen FLPs (FL 21–26), 16.10.2026.
//
// Störfälle aus derselben Messung, die herausfallen:
//   * Taktart-Marker („4/4") — Position mit gesetztem Bit 0x08000000
//   * 148/205 vor dem ersten Arrangement gehören zu etwas anderem
//   * „Auto", „Auto #2" — keine Abschnitte
//   * Marker ohne Namen
// ═══════════════════════════════════════════════════════════════════════════════

use crate::commands::upload::Timecode;

const TAKTART: u32 = 0x0800_0000;

/// Marker des ersten Arrangements als Kapitel, in Sekunden.
/// `bpm` aus der Datenbank gilt nur, wenn die FLP selbst kein Tempo trägt.
#[tauri::command(async)]
pub fn read_flp_markers(flp_path: String, bpm: Option<f64>) -> Result<Vec<Timecode>, String> {
    let bytes = std::fs::read(&flp_path).map_err(|e| format!("FLP nicht lesbar: {e}"))?;
    let flp = lesen(&bytes).ok_or("Keine gültige FLP-Datei")?;
    // ponytail: ein Tempo für den ganzen Song; Tempo-Automation verschiebt
    // spätere Marker. Erst angehen, wenn ein Beat das wirklich nutzt.
    let bpm = flp.tempo.or(bpm).filter(|b| *b > 0.0).ok_or("Kein Tempo bekannt")?;
    Ok(flp.marker.into_iter()
        .map(|(ticks, label)| Timecode {
            seconds: (ticks as f64 / flp.ppq as f64 * 60.0 / bpm).floor() as i64,
            label,
        })
        .collect())
}

#[derive(Debug)]
struct Flp {
    ppq: u16,
    tempo: Option<f64>,
    marker: Vec<(u32, String)>,
}

/// Tempo (Event 156) aus dem Dateianfang. `b` darf abgeschnitten sein:
/// das Tempo steht bei den Kopf-Events, weit vor den Kanälen.
pub(crate) fn tempo(b: &[u8]) -> Option<f64> {
    if b.get(0..4)? != b"FLhd" { return None; }
    let mut p = 8 + u32::from_le_bytes(b.get(4..8)?.try_into().ok()?) as usize + 8;
    loop {
        let id = *b.get(p)?;
        p += 1;
        match id {
            0..=63 => p += 1,
            64..=127 => p += 2,
            156 => return Some(u32::from_le_bytes(b.get(p..p + 4)?.try_into().ok()?) as f64 / 1000.0),
            128..=191 => p += 4,
            _ => {
                let (mut len, mut shift) = (0usize, 0);
                loop {
                    let c = *b.get(p)?;
                    p += 1;
                    len |= ((c & 0x7f) as usize) << shift;
                    shift += 7;
                    if c & 0x80 == 0 { break; }
                }
                p += len;
            }
        }
    }
}

fn lesen(b: &[u8]) -> Option<Flp> {
    if b.get(0..4)? != b"FLhd" { return None; }
    let kopf = u32::from_le_bytes(b.get(4..8)?.try_into().ok()?) as usize;
    let ppq = u16::from_le_bytes(b.get(12..14)?.try_into().ok()?);
    let mut p = 8 + kopf;
    if b.get(p..p + 4)? != b"FLdt" { return None; }
    p += 8;

    let mut tempo = None;
    let mut im_arrangement = false;
    let mut marker: Vec<(u32, Option<String>)> = Vec::new();

    while p < b.len() {
        let id = b[p];
        p += 1;
        let (zahl, text): (u32, Option<&[u8]>) = match id {
            0..=63 => { let v = *b.get(p)? as u32; p += 1; (v, None) }
            64..=127 => { let v = u16::from_le_bytes(b.get(p..p + 2)?.try_into().ok()?) as u32; p += 2; (v, None) }
            128..=191 => { let v = u32::from_le_bytes(b.get(p..p + 4)?.try_into().ok()?); p += 4; (v, None) }
            _ => {
                let (mut len, mut shift) = (0usize, 0);
                loop {
                    let c = *b.get(p)?;
                    p += 1;
                    len |= ((c & 0x7f) as usize) << shift;
                    shift += 7;
                    if c & 0x80 == 0 { break; }
                }
                let d = b.get(p..p + len)?;
                p += len;
                (0, Some(d))
            }
        };
        match id {
            156 => tempo = Some(zahl as f64 / 1000.0),
            99 => {
                if im_arrangement { break; }       // nur das erste Arrangement
                im_arrangement = zahl == 0;
            }
            148 if im_arrangement => marker.push((zahl, None)),
            205 if im_arrangement => {
                if let (Some(m), Some(d)) = (marker.last_mut(), text) {
                    let einheiten: Vec<u16> = d.chunks_exact(2)
                        .map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
                    m.1 = Some(String::from_utf16_lossy(&einheiten).trim_end_matches('\0').trim().to_string());
                }
            }
            _ => {}
        }
    }

    let ist_auto = |n: &str| { let n = n.to_lowercase(); n == "auto" || n.starts_with("auto #") };
    Some(Flp {
        ppq,
        tempo,
        marker: marker.into_iter()
            .filter_map(|(pos, name)| {
                let name = name.filter(|n| !n.is_empty() && !ist_auto(n))?;
                (pos & TAKTART == 0).then_some((pos, name))
            })
            .collect(),
    })
}

// ─── Audio-Pfade (Ereignis 196) ─────────────────────────────────────────────
//
// FL speichert je Audio-Clip den vollen Pfad als Ereignis 196 (UTF-16LE mit
// \0). Gesucht und ersetzt wird per Bytefolge statt per Durchlauf: FL 26
// schreibt am Anfang ein Ereignis, das nicht ins Längenschema passt — ein
// Durchlauf gerät dort aus dem Takt (gemessen an Heartbreak Highlights,
// 18.10.2026). Die Folge „196, Länge, Pfad, \0" ist eindeutig genug.

const PFAD: u8 = 196;
/// Datenordner des Projekts (Aufnahmen, Renders), gleicher Aufbau, endet auf `\`.
/// Gemessen an B0369 am 18.11.2026: blieb beim Umbenennen auf dem alten Ordner stehen.
const DATENORDNER: u8 = 202;

fn varint(mut n: usize) -> Vec<u8> {
    let mut out = Vec::new();
    loop {
        let b = (n & 0x7f) as u8;
        n >>= 7;
        if n == 0 { out.push(b); return out; }
        out.push(b | 0x80);
    }
}

#[cfg(test)]
pub(crate) fn pfad_ereignis(pfad: &str) -> Vec<u8> { ereignis(PFAD, pfad) }

fn ereignis(id: u8, pfad: &str) -> Vec<u8> {
    let daten: Vec<u8> = pfad.encode_utf16().chain([0]).flat_map(|u| u.to_le_bytes()).collect();
    let mut e = vec![id];
    e.extend(varint(daten.len()));
    e.extend(daten);
    e
}

/// Alle Audio-Pfade, die die FLP verwendet (ohne Doppelte, in Reihenfolge).
pub(crate) fn audio_pfade(b: &[u8]) -> Vec<String> { pfade_mit(b, PFAD) }

/// Datenordner, falls die FLP einen trägt.
pub(crate) fn datenordner(b: &[u8]) -> Option<String> { pfade_mit(b, DATENORDNER).into_iter().next() }

fn pfade_mit(b: &[u8], id: u8) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for i in 0..b.len() {
        if b[i] != id { continue; }
        let (mut len, mut p, mut shift) = (0usize, i + 1, 0);
        while let Some(&c) = b.get(p) {
            p += 1;
            len |= ((c & 0x7f) as usize) << shift;
            shift += 7;
            if c & 0x80 == 0 || shift > 14 { break; }
        }
        if !(8..=4000).contains(&len) || len % 2 != 0 { continue; }
        let Some(d) = b.get(p..p + len) else { continue };
        if d[len - 2..] != [0, 0] { continue; }
        let einheiten: Vec<u16> = d[..len - 2].chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
        let Ok(s) = String::from_utf16(&einheiten) else { continue };
        let laufwerk = s.as_bytes().get(1..3) == Some(b":\\".as_slice());
        if (laufwerk || s.starts_with('%')) && !s.chars().any(|c| c.is_control()) && !out.contains(&s) {
            out.push(s);
        }
    }
    out
}

/// Wann FL das Projekt angelegt hat (JJJJ-MM-TT). Ereignis 237, 16 Bytes:
/// Anlegedatum als f64 in Tagen seit 1899-12-30, dann die Arbeitszeit. Bleibt
/// beim Kopieren und Neuspeichern gleich, anders als das Dateidatum. Per
/// Bytefolge gesucht, aus demselben Grund wie die Audio-Pfade oben.
pub(crate) fn flp_angelegt(b: &[u8]) -> Option<String> {
    (0..b.len().saturating_sub(18)).find_map(|i| {
        if b[i] != 237 || b[i + 1] != 16 { return None; }
        let tage = f64::from_le_bytes(b[i + 2..i + 10].try_into().ok()?);
        // 1996 bis 2100: alles andere ist kein Datum, sondern Zufall im Byte-Strom
        (35000.0..75000.0).contains(&tage)
            .then(|| crate::utils::secs_to_date(((tage - 25569.0) * 86400.0) as u64))
    })
}

/// Pfade austauschen (alt → neu). Gibt die neue Datei und die Zahl der
/// Ersetzungen zurück; None, wenn die Datei kein FLP-Aufbau hat.
pub(crate) fn pfade_ersetzen(b: &[u8], ersatz: &[(String, String)]) -> Option<(Vec<u8>, usize)> {
    ersetzen_mit(b, PFAD, ersatz)
}

fn ersetzen_mit(b: &[u8], id: u8, ersatz: &[(String, String)]) -> Option<(Vec<u8>, usize)> {
    if b.get(0..4)? != b"FLhd" { return None; }
    let kopf = u32::from_le_bytes(b.get(4..8)?.try_into().ok()?) as usize;
    let dt = 8 + kopf;
    if b.get(dt..dt + 4)? != b"FLdt" { return None; }

    let mut out = b.to_vec();
    let mut zahl = 0;
    for (alt, neu) in ersatz {
        let (a, n) = (ereignis(id, alt), ereignis(id, neu));
        let mut i = dt + 8;
        while let Some(pos) = out[i..].windows(a.len()).position(|w| w == a.as_slice()) {
            let start = i + pos;
            out.splice(start..start + a.len(), n.iter().copied());
            i = start + n.len();
            zahl += 1;
        }
    }
    let laenge = u32::try_from(out.len() - dt - 8).ok()?;
    out[dt + 4..dt + 8].copy_from_slice(&laenge.to_le_bytes());
    Some((out, zahl))
}

/// Pfade in einer FLP auf der Platte austauschen. Vorher eine Sicherung
/// `<Name> (<anlass>).flp` in `Backup/` neben der FLP (die erste bleibt stehen),
/// dann daneben schreiben und tauschen, nie eine halbe FLP.
pub(crate) fn flp_umschreiben(flp: &std::path::Path, ersatz: &[(String, String)], anlass: &str) -> Result<usize, String> {
    use std::fs;
    let alt = fs::read(flp).map_err(|e| format!("{} nicht lesbar: {e}", flp.display()))?;
    let (mut neu, mut zahl) = pfade_ersetzen(&alt, ersatz).ok_or_else(|| format!("{} ist keine gültige FLP", flp.display()))?;
    // Datenordner ins Leere (Ordner umbenannt, Projekt archiviert): der eigene Ordner,
    // wie FL ihn für neue Projekte nimmt. Sonst legte FL beim Aufnehmen den alten neu an.
    if let (Some(d), Some(eigen)) = (datenordner(&neu), flp.parent()) {
        if !std::path::Path::new(&d).is_dir() {
            let ziel = format!("{}\\", eigen.to_string_lossy().trim_end_matches('\\'));
            if let Some((n, k)) = ersetzen_mit(&neu, DATENORDNER, &[(d, ziel)]) { neu = n; zahl += k; }
        }
    }
    if zahl == 0 { return Ok(0); }
    let stamm = flp.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let backup_dir = flp.parent().ok_or("FLP ohne Ordner")?.join("Backup");
    let backup = backup_dir.join(format!("{stamm} ({anlass}).flp"));
    if !backup.exists() {
        fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;
        fs::copy(flp, &backup).map_err(|e| format!("Sicherung fehlgeschlagen: {e}"))?;
    }
    let tmp = flp.with_extension("flp.beatos-tmp");
    fs::write(&tmp, &neu).map_err(|e| format!("Schreiben fehlgeschlagen: {e}"))?;
    fs::rename(&tmp, flp).map_err(|e| { let _ = fs::remove_file(&tmp); format!("{} ist gesperrt (in FL offen?): {e}", flp.display()) })?;
    Ok(zahl)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn anlegedatum_lesen() {
        // 45333 Tage nach 1899-12-30 = 11.02.2024 (wie 601.flp), davor Rauschen mit 237
        let mut b = vec![237, 3, 1, 2, 3];
        b.extend([237, 16]);
        b.extend(45333.5f64.to_le_bytes());
        b.extend((47.0f64 / 1440.0).to_le_bytes());
        b.extend([0; 4]);
        assert_eq!(flp_angelegt(&b).as_deref(), Some("2024-02-11"));
        assert_eq!(flp_angelegt(&[237, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), None);
    }

    #[test]
    fn audio_pfade_lesen_und_ersetzen() {
        let mut e = Vec::new();
        ev_dword(&mut e, 156, 140_000);
        e.extend(pfad_ereignis(r"D:\Downloads [D]\Feelings feeln vocals.mp3"));
        ev_word(&mut e, 99, 0);
        // Ein langer Pfad: Länge braucht zwei Varint-Bytes
        let lang = format!(r"C:\{}\x.wav", "a".repeat(80));
        e.extend(pfad_ereignis(&lang));
        e.extend(pfad_ereignis(r"D:\Downloads [D]\Feelings feeln vocals.mp3"));
        let alt = flp(e);
        assert_eq!(audio_pfade(&alt), vec![r"D:\Downloads [D]\Feelings feeln vocals.mp3".to_string(), lang.clone()]);

        let neu_pfad = r"C:\05_ARTISTS\JarnoGm\Fellings Feeln\Assets\Feelings feeln vocals.mp3".to_string();
        let (neu, zahl) = pfade_ersetzen(&alt, &[(r"D:\Downloads [D]\Feelings feeln vocals.mp3".into(), neu_pfad.clone())]).unwrap();
        assert_eq!(zahl, 2);
        assert_eq!(audio_pfade(&neu), vec![neu_pfad, lang]);
        // Kopf-Länge stimmt, Tempo und Arrangement sind unberührt
        let dt_len = u32::from_le_bytes(neu[18..22].try_into().unwrap()) as usize;
        assert_eq!(dt_len, neu.len() - 22);
        assert_eq!(lesen(&neu).unwrap().tempo, Some(140.0));
        assert!(pfade_ersetzen(b"RIFF....", &[]).is_none());
    }

    #[test]
    fn datenordner_ins_leere_wird_der_eigene() {
        let t = std::env::temp_dir().join(format!("beatos_datenordner_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&t);
        let beat = t.join("B0369 - CALL ME [135 Emin]").join("01_SAVEFILES");
        std::fs::create_dir_all(&beat).unwrap();
        let alt_ordner = format!(r"{}\", t.join("B0369 - CALL ME [Em 135]").join("01_SAVEFILES").display());
        let mut e = ereignis(DATENORDNER, &alt_ordner);
        e.extend(pfad_ereignis(r"C:\weg\a.wav"));
        let flp_datei = beat.join("CALL ME.flp");
        std::fs::write(&flp_datei, flp(e)).unwrap();

        // Auch ohne Audio-Ersatz: nur der Datenordner zählt
        assert_eq!(flp_umschreiben(&flp_datei, &[], "vor Datenordner").unwrap(), 1);
        let b = std::fs::read(&flp_datei).unwrap();
        assert_eq!(datenordner(&b), Some(format!(r"{}\", beat.display())));
        assert_eq!(audio_pfade(&b), [r"C:\weg\a.wav"], "Audio bleibt");
        let dt_len = u32::from_le_bytes(b[18..22].try_into().unwrap()) as usize;
        assert_eq!(dt_len, b.len() - 22);
        // Existiert er, bleibt er
        assert_eq!(flp_umschreiben(&flp_datei, &[], "x").unwrap(), 0);
        let _ = std::fs::remove_dir_all(&t);
    }

    fn ev_dword(b: &mut Vec<u8>, id: u8, v: u32) { b.push(id); b.extend(v.to_le_bytes()); }
    fn ev_word(b: &mut Vec<u8>, id: u8, v: u16) { b.push(id); b.extend(v.to_le_bytes()); }
    fn ev_text(b: &mut Vec<u8>, id: u8, s: &str) {
        let d: Vec<u8> = s.encode_utf16().chain([0]).flat_map(|u| u.to_le_bytes()).collect();
        b.push(id);
        b.push(d.len() as u8);
        b.extend(d);
    }
    fn flp(events: Vec<u8>) -> Vec<u8> {
        let mut b = b"FLhd".to_vec();
        b.extend(6u32.to_le_bytes());
        b.extend([0, 0, 1, 0]);
        b.extend(96u16.to_le_bytes());
        b.extend(b"FLdt");
        b.extend((events.len() as u32).to_le_bytes());
        b.extend(events);
        b
    }

    /// Nachgebaut nach Project_0858 plus den Störfällen der Messung.
    #[test]
    fn liest_abschnitte_und_filtert_stoerfaelle() {
        let mut e = Vec::new();
        ev_dword(&mut e, 156, 152_000);
        ev_dword(&mut e, 148, TAKTART);            // Taktart vor dem Arrangement
        ev_text(&mut e, 205, "4/4");
        ev_word(&mut e, 99, 0);
        ev_dword(&mut e, 148, 0);
        ev_text(&mut e, 205, "Intro");
        ev_dword(&mut e, 148, TAKTART);            // Taktart im Arrangement
        ev_text(&mut e, 205, "4/4");
        ev_dword(&mut e, 148, 3072);
        ev_text(&mut e, 205, "Hook");
        ev_dword(&mut e, 148, 4000);
        ev_text(&mut e, 205, "Auto #2");
        ev_dword(&mut e, 148, 5000);               // ohne Namen
        ev_word(&mut e, 99, 1);                    // zweites Arrangement
        ev_dword(&mut e, 148, 6144);
        ev_text(&mut e, 205, "Gehört nicht dazu");

        let f = lesen(&flp(e)).unwrap();
        assert_eq!(f.ppq, 96);
        assert_eq!(f.tempo, Some(152.0));
        assert_eq!(f.marker, vec![(0, "Intro".to_string()), (3072, "Hook".to_string())]);
    }

    #[test]
    fn kaputte_datei_ist_none() {
        assert!(lesen(b"FLhd").is_none());
        assert!(lesen(b"RIFF....").is_none());
    }

    /// Handprobe (nur lesen): welche FLPs zeigen auf Pfade mit einem Stichwort?
    /// BEATOS_FLP_ROOTS="a;b" BEATOS_NEEDLE="02_LIBRARY_ASSETS" BEATOS_DUMP=out.tsv
    /// cargo test --lib flp_handprobe -- --ignored --nocapture
    #[test]
    #[ignore]
    fn flp_handprobe_verweise() {
        let (Ok(roots), Ok(needle)) = (std::env::var("BEATOS_FLP_ROOTS"), std::env::var("BEATOS_NEEDLE")) else { return };
        let needle = needle.to_lowercase();
        let mut stack: Vec<std::path::PathBuf> = roots.split(';').map(|r| r.trim().into()).collect();
        let (mut flps, mut out) = (0usize, String::new());
        while let Some(d) = stack.pop() {
            let Ok(rd) = std::fs::read_dir(&d) else { continue };
            for e in rd.flatten() {
                let p = e.path();
                if p.is_dir() { if !p.ends_with("Backup") { stack.push(p); } continue; }
                if !p.extension().map_or(false, |x| x.eq_ignore_ascii_case("flp")) { continue; }
                flps += 1;
                let Ok(b) = std::fs::read(&p) else { continue };
                for a in audio_pfade(&b) {
                    if a.to_lowercase().contains(&needle) {
                        out.push_str(&format!("{}	{}	{}
", p.display(), a, std::path::Path::new(&a).exists()));
                    }
                }
            }
        }
        println!("FLPs gelesen: {}, Verweise: {}", flps, out.lines().count());
        if let Ok(f) = std::env::var("BEATOS_DUMP") { std::fs::write(f, &out).unwrap(); }
    }
    /// Handprobe (schreibt!): Pfade laut Liste umschreiben, mit Sicherung in Backup/.
    /// Zeilen: FLP <TAB> alter Pfad <TAB> neuer Pfad.
    /// BEATOS_UMZUG_TSV=liste.tsv cargo test --lib flp_handprobe_umzug -- --ignored --nocapture
    #[test]
    #[ignore]
    /// Pfade mit Präfix ALT in den FLPs direkt in BEATOS_FLP_DIR auf NEU umbiegen
    /// (BEATOS_ALT, BEATOS_NEU). Zeigt vorher und nachher, was fehlt.
    fn flp_praefix_umbiegen() {
        let (Ok(dir), Ok(alt), Ok(neu)) = (std::env::var("BEATOS_FLP_DIR"), std::env::var("BEATOS_ALT"), std::env::var("BEATOS_NEU")) else { return };
        for e in std::fs::read_dir(&dir).unwrap().flatten() {
            let p = e.path();
            if !p.extension().is_some_and(|x| x.eq_ignore_ascii_case("flp")) { continue; }
            let pfade = audio_pfade(&std::fs::read(&p).unwrap());
            let ersatz: Vec<(String, String)> = pfade.iter()
                .filter(|a| a.to_lowercase().starts_with(&alt.to_lowercase()))
                .map(|a| (a.clone(), format!("{neu}{}", &a[alt.len()..]))).collect();
            let zahl = flp_umschreiben(&p, &ersatz, "vor Umzug ins Archiv").unwrap();
            let fehlt: Vec<String> = audio_pfade(&std::fs::read(&p).unwrap()).into_iter().filter(|a| !std::path::Path::new(a).is_file()).collect();
            println!("{}: {} von {} Pfaden umgebogen, danach fehlen {}: {:?}", p.display(), zahl, pfade.len(), fehlt.len(), fehlt);
        }
    }

    #[test]
    #[ignore]
    fn flp_handprobe_umzug() {
        let Ok(liste) = std::env::var("BEATOS_UMZUG_TSV") else { return };
        let text = std::fs::read_to_string(liste).unwrap();
        let text = text.trim_start_matches('\u{feff}');
        let mut je_flp: std::collections::BTreeMap<String, Vec<(String, String)>> = Default::default();
        for z in text.lines().filter(|z| !z.trim().is_empty()) {
            let t: Vec<&str> = z.split('\t').collect();
            assert!(std::path::Path::new(t[2]).is_file(), "Ziel fehlt: {}", t[2]);
            je_flp.entry(t[0].into()).or_default().push((t[1].into(), t[2].into()));
        }
        for (flp, ersatz) in je_flp {
            let n = flp_umschreiben(std::path::Path::new(&flp), &ersatz, "vor Bibliothek-Umbau").unwrap();
            println!("{n} ersetzt: {flp}");
        }
    }
}
