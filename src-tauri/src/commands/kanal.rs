// src-tauri/src/commands/kanal.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Uploads nacherfassen: die eigenen Kanäle (YouTube, SoundCloud) über yt-dlp
// lesen und fehlende Upload-Einträge ergänzen.
//
// Warum: `beat_uploads` wird erst seit 02/2026 geführt. Ältere Beats sind
// hochgeladen, stehen aber als „nie" in der Datenbank — und jede Zahl zu
// „fertig, nicht draußen" stimmt nicht.
//
// yt-dlp braucht keinen API-Schlüssel. Die Kanalliste kommt in einem Aufruf
// (schnell, aber ohne Datum); das Datum je Video/Track kostet einen Abruf
// pro Eintrag (~2 s) und wird deshalb nur für die bestätigten Zuordnungen
// geholt, in kleinen Stücken, damit die Oberfläche Fortschritt zeigen kann.
// ═══════════════════════════════════════════════════════════════════════════════

use crate::db::open_db;
use serde::Serialize;
use std::process::Command;

#[derive(Debug, Serialize, PartialEq)]
pub struct KanalEintrag {
    pub id: String,
    pub titel: String,
    pub url: String,
    pub aufrufe: Option<u64>,
}

/// yt-dlp ohne aufblitzendes Konsolenfenster starten.
fn yt_dlp() -> Command {
    let mut c = Command::new("yt-dlp");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    c
}

fn ausfuehren(mut c: Command) -> Result<String, String> {
    let out = c.output().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            "yt-dlp wurde nicht gefunden (installiert, im PATH?)".to_string()
        } else {
            format!("yt-dlp ließ sich nicht starten: {e}")
        }
    })?;
    if !out.status.success() && out.stdout.is_empty() {
        let fehler = String::from_utf8_lossy(&out.stderr);
        return Err(format!("yt-dlp: {}", fehler.lines().last().unwrap_or("unbekannter Fehler")));
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

/// Die Liste eines Kanals: YouTube-Videos bzw. SoundCloud-Tracks.
/// `kanal` ist der Link aus den Einstellungen (mit oder ohne https://).
#[tauri::command(async)]
pub fn kanal_liste(kanal: String) -> Result<Vec<KanalEintrag>, String> {
    let mut url = kanal.trim().trim_end_matches('/').to_string();
    if url.is_empty() { return Err("Kein Kanal-Link in den Einstellungen".into()); }
    if !url.starts_with("http") { url = format!("https://{url}"); }
    let youtube = url.contains("youtube.com") || url.contains("youtu.be");
    // Die Uploads, nicht die Startseite des Kanals (die mischt Playlists und Shorts).
    if youtube && !url.ends_with("/videos") { url.push_str("/videos"); }
    if url.contains("soundcloud.com") && !url.ends_with("/tracks") { url.push_str("/tracks"); }

    let mut c = yt_dlp();
    c.args(["--flat-playlist", "-J", "--no-warnings", &url]);
    parse_liste(&ausfuehren(c)?, youtube)
}

fn parse_liste(json: &str, youtube: bool) -> Result<Vec<KanalEintrag>, String> {
    let v: serde_json::Value = serde_json::from_str(json).map_err(|e| format!("Antwort von yt-dlp unlesbar: {e}"))?;
    let eintraege = v["entries"].as_array().ok_or("Antwort von yt-dlp ohne Einträge")?;
    Ok(eintraege.iter().filter_map(|e| {
        let id = e["id"].as_str().map(String::from)
            .or_else(|| e["id"].as_u64().map(|n| n.to_string()))?;
        let titel = e["title"].as_str()?.to_string();
        let url = if youtube {
            format!("https://www.youtube.com/watch?v={id}")
        } else {
            e["url"].as_str()?.to_string()
        };
        Some(KanalEintrag { id, titel, url, aufrufe: e["view_count"].as_u64() })
    }).collect())
}

/// Upload-Datum je Link (YYYY-MM-DD). Fehlt eins, fehlt es im Ergebnis —
/// ein einzelnes privates Video soll nicht alle anderen aufhalten.
#[tauri::command(async)]
pub fn upload_daten(urls: Vec<String>) -> Result<Vec<(String, String)>, String> {
    if urls.is_empty() { return Ok(Vec::new()); }
    let mut c = yt_dlp();
    c.args(["--skip-download", "--no-warnings", "--ignore-errors", "--print", "%(webpage_url)s\t%(upload_date)s"]);
    c.args(&urls);
    Ok(parse_daten(&ausfuehren(c)?))
}

fn parse_daten(text: &str) -> Vec<(String, String)> {
    text.lines().filter_map(|z| {
        let (url, d) = z.trim().split_once('\t')?;
        (d.len() == 8 && d.bytes().all(|b| b.is_ascii_digit()))
            .then(|| (url.to_string(), format!("{}-{}-{}", &d[0..4], &d[4..6], &d[6..8])))
    }).collect()
}

/// Einen Upload nachtragen — ohne Vorhandenes zu überschreiben: Link und
/// Datum werden nur gesetzt, wo sie fehlen; ein Termin bleibt stehen.
#[tauri::command]
pub fn upload_nacherfassen(beat_id: String, platform: String, url: String, datum: Option<String>) -> Result<(), String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    nacherfassen(&conn, &beat_id, &platform, &url, datum.as_deref())
        .map_err(|e| format!("Nacherfassen fehlgeschlagen: {e}"))
}

pub(crate) fn nacherfassen(conn: &rusqlite::Connection, beat_id: &str, platform: &str, url: &str, datum: Option<&str>) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO beat_uploads (beat_id, platform, status, uploaded_at, url)
         VALUES (?1, ?2, 'uploaded', ?3, ?4)
         ON CONFLICT(beat_id, platform) DO UPDATE SET
            status      = 'uploaded',
            uploaded_at = COALESCE(uploaded_at, excluded.uploaded_at),
            url         = COALESCE(NULLIF(url, ''), excluded.url)",
        rusqlite::params![beat_id, platform, datum, url],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn liest_youtube_und_soundcloud_listen() {
        let yt = r#"{"entries":[{"id":"uVinrWFwhmQ","title":"[FREE] Lil Peep x Juice WRLD Type Beat \"DONT WANNA BE\"","view_count":163}]}"#;
        assert_eq!(parse_liste(yt, true).unwrap(), vec![KanalEintrag {
            id: "uVinrWFwhmQ".into(),
            titel: "[FREE] Lil Peep x Juice WRLD Type Beat \"DONT WANNA BE\"".into(),
            url: "https://www.youtube.com/watch?v=uVinrWFwhmQ".into(),
            aufrufe: Some(163),
        }]);
        let sc = r#"{"entries":[{"id":2417518011,"title":"[FREE] \"DONT WANNA BE\" x","url":"https://soundcloud.com/prodgoodbxy/dontwannabe"}]}"#;
        assert_eq!(parse_liste(sc, false).unwrap()[0].url, "https://soundcloud.com/prodgoodbxy/dontwannabe");
    }

    #[test]
    fn daten_ohne_datum_fallen_weg() {
        let t = "https://www.youtube.com/watch?v=a\t20261012\nhttps://x/b\tNA\n";
        assert_eq!(parse_daten(t), vec![("https://www.youtube.com/watch?v=a".to_string(), "2026-10-12".to_string())]);
    }

    #[test]
    fn nacherfassen_ueberschreibt_nichts() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE beat_uploads (beat_id TEXT, platform TEXT, status TEXT, scheduled_at TEXT,
                                        uploaded_at TEXT, url TEXT, PRIMARY KEY (beat_id, platform));
             INSERT INTO beat_uploads VALUES ('0900','youtube','uploaded','2026-03-01','2026-03-01','https://alt');
             INSERT INTO beat_uploads VALUES ('0900','soundcloud','scheduled','2026-04-01',NULL,NULL);",
        ).unwrap();
        nacherfassen(&conn, "0900", "youtube", "https://neu", Some("2026-03-05")).unwrap();
        nacherfassen(&conn, "0900", "soundcloud", "https://sc", Some("2026-04-02")).unwrap();
        nacherfassen(&conn, "0800", "youtube", "https://yt", Some("2025-01-10")).unwrap();
        let z = |b: &str, p: &str| conn.query_row(
            "SELECT status, scheduled_at, uploaded_at, url FROM beat_uploads WHERE beat_id=?1 AND platform=?2",
            [b, p], |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?, r.get::<_, Option<String>>(2)?, r.get::<_, Option<String>>(3)?)),
        ).unwrap();
        // Vorhandenes bleibt
        assert_eq!(z("0900", "youtube"), ("uploaded".into(), Some("2026-03-01".into()), Some("2026-03-01".into()), Some("https://alt".into())));
        // Fehlendes wird ergänzt, der Termin bleibt
        assert_eq!(z("0900", "soundcloud"), ("uploaded".into(), Some("2026-04-01".into()), Some("2026-04-02".into()), Some("https://sc".into())));
        assert_eq!(z("0800", "youtube"), ("uploaded".into(), None, Some("2025-01-10".into()), Some("https://yt".into())));
    }
}
