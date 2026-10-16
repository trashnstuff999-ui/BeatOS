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

#[cfg(test)]
mod tests {
    use super::*;

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
}
