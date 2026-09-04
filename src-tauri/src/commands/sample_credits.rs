// src-tauri/src/commands/sample_credits.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Sample-Credits — fremde Samples in der Beschreibung nennen
// ═══════════════════════════════════════════════════════════════════════════════
//
// Produziert wird jeder Beat selbst; manchmal steckt ein Sample von jemand
// anderem drin. Der gehört mit Namen und Links in die Beschreibung, und seine
// Links sollen einmal gepflegt werden statt bei jedem Upload neu.
//
// Zwei Tabellen (siehe db/connection.rs):
//   sample_producers     — das Adressbuch
//   beat_sample_credits  — wer bei welchem Beat was beigesteuert hat
//
// Verwiesen wird über die id: ändert jemand seinen Instagram-Link, stimmt er
// beim nächsten Rendern überall. Schon geschriebene Beschreibungsdateien im
// Beat-Ordner bleiben, wie sie sind — die entstehen beim Rendern neu.

use crate::db::open_db;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

/// Ein Eintrag im Adressbuch.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SampleProducer {
    /// `None` heißt: neu anlegen.
    #[serde(default)]
    pub id: Option<i64>,
    pub name: String,
    #[serde(default)]
    pub instagram_url: String,
    #[serde(default)]
    pub beatstars_url: String,
    #[serde(default)]
    pub soundcloud_url: String,
    #[serde(default)]
    pub youtube_url: String,
    /// Auf wie vielen Beats er genannt ist. Nur beim Lesen gefüllt, damit das
    /// Löschen sagen kann, was es anrichtet.
    #[serde(default)]
    pub use_count: i64,
}

/// Ein Sample-Geber an einem bestimmten Beat.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BeatSampleCredit {
    pub producer_id: i64,
    /// Freitext: „Guitarsample", „Drumloop", „Vocal Chop". Wechselt von Beat
    /// zu Beat und gehört deshalb hierher, nicht ins Adressbuch.
    pub contribution: String,
    /// Nur beim Lesen gefüllt, kommt aus dem Adressbuch.
    #[serde(default)]
    pub producer_name: String,
}

// ─────────────────────────────────────────────────────────────────────────────
// Adressbuch
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_sample_producers() -> Result<Vec<SampleProducer>, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT p.id, p.name,
                    COALESCE(p.instagram_url, ''), COALESCE(p.beatstars_url, ''),
                    COALESCE(p.soundcloud_url, ''), COALESCE(p.youtube_url, ''),
                    (SELECT COUNT(*) FROM beat_sample_credits c WHERE c.producer_id = p.id)
             FROM sample_producers p
             ORDER BY p.name COLLATE NOCASE",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(SampleProducer {
                id: Some(row.get(0)?),
                name: row.get(1)?,
                instagram_url: row.get(2)?,
                beatstars_url: row.get(3)?,
                soundcloud_url: row.get(4)?,
                youtube_url: row.get(5)?,
                use_count: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

/// Anlegen (ohne `id`) oder ändern (mit `id`). Gibt die id zurück.
#[tauri::command]
pub fn save_sample_producer(producer: SampleProducer) -> Result<i64, String> {
    let name = producer.name.trim().to_string();
    if name.is_empty() {
        return Err("Der Name darf nicht leer sein".into());
    }
    let conn = open_db().map_err(|e| e.to_string())?;
    let p = [
        name.as_str(),
        producer.instagram_url.trim(),
        producer.beatstars_url.trim(),
        producer.soundcloud_url.trim(),
        producer.youtube_url.trim(),
    ];

    match producer.id {
        Some(id) => {
            let changed = conn
                .execute(
                    "UPDATE sample_producers
                     SET name = ?1, instagram_url = ?2, beatstars_url = ?3,
                         soundcloud_url = ?4, youtube_url = ?5
                     WHERE id = ?6",
                    rusqlite::params![p[0], p[1], p[2], p[3], p[4], id],
                )
                .map_err(|e| e.to_string())?;
            if changed == 0 {
                return Err(format!("Sample-Produzent {} nicht gefunden", id));
            }
            Ok(id)
        }
        None => {
            conn.execute(
                "INSERT INTO sample_producers
                     (name, instagram_url, beatstars_url, soundcloud_url, youtube_url)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![p[0], p[1], p[2], p[3], p[4]],
            )
            .map_err(|e| e.to_string())?;
            Ok(conn.last_insert_rowid())
        }
    }
}

/// Löscht den Eintrag und alle Nennungen daran — sonst blieben Zeilen zurück,
/// die auf niemanden mehr zeigen und beim Rendern still verschwinden.
#[tauri::command]
pub fn delete_sample_producer(id: i64) -> Result<(), String> {
    let mut conn = open_db().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM beat_sample_credits WHERE producer_id = ?1", [id])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM sample_producers WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// Zuordnung pro Beat
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_beat_sample_credits(beat_id: String) -> Result<Vec<BeatSampleCredit>, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    read_credits(&conn, &beat_id).map_err(|e| e.to_string())
}

fn read_credits(conn: &Connection, beat_id: &str) -> rusqlite::Result<Vec<BeatSampleCredit>> {
    let mut stmt = conn.prepare(
        "SELECT c.producer_id, c.contribution, p.name
         FROM beat_sample_credits c
         JOIN sample_producers p ON p.id = c.producer_id
         WHERE c.beat_id = ?1
         ORDER BY c.rowid",
    )?;
    let rows = stmt.query_map([beat_id], |row| {
        Ok(BeatSampleCredit {
            producer_id: row.get(0)?,
            contribution: row.get(1)?,
            producer_name: row.get(2)?,
        })
    })?;
    rows.collect()
}

/// Ersetzt die Nennungen eines Beats vollständig. Leere Liste = keine.
#[tauri::command]
pub fn set_beat_sample_credits(
    beat_id: String,
    credits: Vec<BeatSampleCredit>,
) -> Result<(), String> {
    let mut conn = open_db().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM beat_sample_credits WHERE beat_id = ?1", [&beat_id])
        .map_err(|e| e.to_string())?;
    for c in &credits {
        let contribution = match c.contribution.trim() {
            "" => "Sample",
            s => s,
        };
        // OR IGNORE: derselbe Produzent zweimal am selben Beat ist kein
        // Fehler, sondern eine Doppelung — die zweite Zeile fällt weg.
        tx.execute(
            "INSERT OR IGNORE INTO beat_sample_credits (beat_id, producer_id, contribution)
             VALUES (?1, ?2, ?3)",
            rusqlite::params![beat_id, c.producer_id, contribution],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// Für den Renderer
// ─────────────────────────────────────────────────────────────────────────────

/// Ein Sample-Geber mit allem, was die Beschreibung braucht.
#[derive(Debug, Clone)]
pub(crate) struct ResolvedCredit {
    pub name: String,
    pub contribution: String,
    /// Nur die ausgefüllten Links, in der Reihenfolge Instagram, Beatstars,
    /// SoundCloud, YouTube.
    pub links: Vec<String>,
}

/// Die Sample-Geber eines Beats, aufgelöst. Fehlt die Tabelle noch oder hakt
/// die Abfrage, liefert das eine leere Liste — eine Beschreibung ohne
/// Sample-Block ist besser als gar keine Beschreibung.
pub(crate) fn resolved_credits(conn: &Connection, beat_id: &str) -> Vec<ResolvedCredit> {
    let Ok(mut stmt) = conn.prepare(
        "SELECT p.name, c.contribution,
                COALESCE(p.instagram_url, ''), COALESCE(p.beatstars_url, ''),
                COALESCE(p.soundcloud_url, ''), COALESCE(p.youtube_url, '')
         FROM beat_sample_credits c
         JOIN sample_producers p ON p.id = c.producer_id
         WHERE c.beat_id = ?1
         ORDER BY c.rowid",
    ) else {
        return Vec::new();
    };

    let rows = stmt.query_map([beat_id], |row| {
        let links: Vec<String> = (2..6)
            .filter_map(|i| row.get::<_, String>(i).ok())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        Ok(ResolvedCredit {
            name: row.get::<_, String>(0)?.trim().to_string(),
            contribution: row.get::<_, String>(1)?.trim().to_string(),
            links,
        })
    });

    match rows {
        Ok(r) => r.filter_map(|x| x.ok()).filter(|c| !c.name.is_empty()).collect(),
        Err(_) => Vec::new(),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE sample_producers (
                id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
                instagram_url TEXT, beatstars_url TEXT,
                soundcloud_url TEXT, youtube_url TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
             CREATE TABLE beat_sample_credits (
                beat_id TEXT NOT NULL, producer_id INTEGER NOT NULL,
                contribution TEXT NOT NULL DEFAULT 'Sample',
                PRIMARY KEY (beat_id, producer_id));
             INSERT INTO sample_producers (name, instagram_url, beatstars_url)
                VALUES ('prodzeux', 'https://www.instagram.com/prodzeux/',
                        'https://www.beatstars.com/prodzeux');
             INSERT INTO sample_producers (name) VALUES ('ohnelinks');
             INSERT INTO beat_sample_credits VALUES ('0895', 1, 'Guitarsample');",
        )
        .unwrap();
        conn
    }

    #[test]
    fn aufgeloest_kommen_nur_gefuellte_links_mit() {
        let conn = test_db();
        let credits = resolved_credits(&conn, "0895");
        assert_eq!(credits.len(), 1);
        assert_eq!(credits[0].name, "prodzeux");
        assert_eq!(credits[0].contribution, "Guitarsample");
        assert_eq!(
            credits[0].links,
            vec![
                "https://www.instagram.com/prodzeux/",
                "https://www.beatstars.com/prodzeux"
            ],
            "leere SoundCloud- und YouTube-Felder fallen weg"
        );
    }

    #[test]
    fn beat_ohne_nennung_ergibt_leere_liste() {
        let conn = test_db();
        assert!(resolved_credits(&conn, "0000").is_empty());
    }

    #[test]
    fn produzent_ohne_links_bleibt_nennbar() {
        let conn = test_db();
        conn.execute("INSERT INTO beat_sample_credits VALUES ('0896', 2, 'Drumloop')", [])
            .unwrap();
        let credits = resolved_credits(&conn, "0896");
        assert_eq!(credits.len(), 1);
        assert_eq!(credits[0].name, "ohnelinks");
        assert!(credits[0].links.is_empty(), "kein Social-Block, aber genannt wird er");
    }

    #[test]
    fn gelesene_nennung_traegt_den_namen_mit() {
        let conn = test_db();
        let credits = read_credits(&conn, "0895").unwrap();
        assert_eq!(credits[0].producer_name, "prodzeux");
        assert_eq!(credits[0].producer_id, 1);
    }
}
