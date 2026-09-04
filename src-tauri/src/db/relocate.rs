// src-tauri/src/db/relocate.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Anker — die Bibliothek umziehen, ohne die Datenbank zu verlieren
// ═══════════════════════════════════════════════════════════════════════════════
//
// Jeder gespeicherte Pfad beginnt mit demselben Präfix, dem Anker. Zieht die
// Bibliothek um — andere Platte, NAS, anderer Rechner, anderes Betriebssystem —,
// tauscht diese Datei genau dieses Präfix aus. Der Rest des Pfads bleibt Zeichen
// für Zeichen gleich; nur die Trenner werden auf das laufende System gedreht,
// denn der Bestand mischt `\` und `/` bereits (66 von 211 Beat-Pfaden tragen
// mitten drin ein `/`, weil `year_month` als "2025/06_JUNE" angelegt wurde).
//
// Sicherheit: hier wird ausschließlich die Datenbank geschrieben, nie das
// Dateisystem. Ein falscher Anker erzeugt Pfade, die es nicht gibt — und jede
// Stelle, die einen DB-Pfad anfasst, prüft vorher auf Existenz oder auf die
// Lage unterhalb des Archiv-Roots. Ein Fehlgriff ist wirkungslos, nicht
// zerstörerisch, und durch den Rücktausch umkehrbar.
//
// Stand: nur Trockenlauf. Aufgerufen wird bisher ausschließlich aus den Tests
// (siehe `trockenlauf_am_echten_bestand`), deshalb das `allow` — es fällt weg,
// sobald `apply` und der Bestätigungsdialog dranhängen.
#![allow(dead_code)]

use rusqlite::{Connection, Result as SqlResult};

/// Spalten, in denen Pfade stehen.
///
/// `projects` fehlt bewusst: 710 Zeilen aus dem alten Ordnersystem, die kein
/// Kommando der App mehr liest. Sie mitzuschreiben hieße, Daten anzufassen,
/// die niemand braucht.
const PATH_COLUMNS: &[(&str, &str)] = &[("beats", "path"), ("studio_projects", "path")];

/// Settings-Schlüssel, deren Wert ein Pfad ist. Alle anderen (Producer-Name,
/// URLs, Tags) bleiben unberührt.
const PATH_SETTINGS: &[&str] = &[
    "archive_path",
    "production_path",
    "asset_path",
    "flp_template_path",
];

/// Trenner des laufenden Systems: `\` auf Windows, `/` sonst.
fn sep() -> char {
    std::path::MAIN_SEPARATOR
}

/// Trenner vereinheitlichen und Schlussstriche abschneiden, damit
/// „C:/Prod\" und „C:\Prod" derselbe Anker sind.
fn normalize(p: &str, sep: char) -> String {
    let mut s: String = p
        .chars()
        .map(|c| if c == '\\' || c == '/' { sep } else { c })
        .collect();
    while s.len() > 1 && s.ends_with(sep) {
        s.pop();
    }
    s
}

/// Tauscht den Anker eines Pfads aus. `None`, wenn der Pfad nicht am alten
/// Anker hängt — solche Werte bleiben unangetastet.
pub fn swap_anchor(value: &str, old_anchor: &str, new_anchor: &str, sep: char) -> Option<String> {
    let old = normalize(old_anchor, sep);
    let val = normalize(value, sep);

    // Windows vergleicht Pfade ohne Rücksicht auf Groß-/Kleinschreibung, macOS
    // mit APFS standardmäßig auch. Ein Vergleich in Kleinbuchstaben passt zu
    // beiden und ist strenger als nötig auf keinem von beiden.
    let head = val.get(..old.len())?;
    if !head.eq_ignore_ascii_case(&old) {
        return None;
    }
    let tail = &val[old.len()..];

    // Der Anker muss an einer Ordnergrenze enden, sonst würde
    // „…\BEAT LIBRARY_ALT\x" am Anker „…\BEAT LIBRARY" hängen bleiben.
    if !tail.is_empty() && !tail.starts_with(sep) {
        return None;
    }

    Some(format!("{}{}", normalize(new_anchor, sep), tail))
}

/// Der gemeinsame Anker einer Menge von Pfaden: das längste Präfix, das bei
/// allen an einer Ordnergrenze endet.
///
/// Damit muss niemand den alten Anker von Hand eintippen — genau dieses
/// Abtippen wäre die Stelle, an der man sich vertut.
pub fn common_anchor(values: &[String], sep: char) -> Option<String> {
    let mut iter = values.iter().filter(|v| !v.trim().is_empty());
    let mut anchor = normalize(iter.next()?, sep);

    for value in iter {
        let val = normalize(value, sep);
        // Gemeinsames Präfix kürzen, bis es passt …
        while !val
            .get(..anchor.len())
            .map(|head| head.eq_ignore_ascii_case(&anchor))
            .unwrap_or(false)
        {
            match anchor.rfind(sep) {
                Some(0) => {
                    anchor.truncate(1);
                    break;
                }
                Some(i) => anchor.truncate(i),
                None => return None,
            }
        }
        // … und dabei auf einer Ordnergrenze landen, nicht mitten im Namen.
        let tail = &val[anchor.len()..];
        if !tail.is_empty() && !tail.starts_with(sep) {
            match anchor.rfind(sep) {
                Some(0) => anchor.truncate(1),
                Some(i) => anchor.truncate(i),
                None => return None,
            }
        }
    }

    if anchor.is_empty() {
        None
    } else {
        Some(anchor)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Trockenlauf
// ─────────────────────────────────────────────────────────────────────────────

/// Was ein Umzug ändern würde. Schreibt nichts.
#[derive(Debug, serde::Serialize)]
pub struct RelocatePlan {
    pub old_anchor: String,
    pub new_anchor: String,
    pub entries: Vec<RelocateEntry>,
    /// Werte, die umgeschrieben würden
    pub total: usize,
    /// Werte, die nicht am alten Anker hängen und unberührt blieben
    pub skipped: usize,
}

#[derive(Debug, serde::Serialize)]
pub struct RelocateEntry {
    /// „beats.path" oder „app_settings.archive_path"
    pub label: String,
    pub count: usize,
    pub skipped: usize,
    pub sample_before: Option<String>,
    pub sample_after: Option<String>,
}

/// Alle Pfadwerte der DB, in der Reihenfolge (Beschriftung, Wert).
fn collect_values(conn: &Connection) -> SqlResult<Vec<(String, String)>> {
    let mut out = Vec::new();
    for (table, column) in PATH_COLUMNS {
        let sql = format!(
            "SELECT {c} FROM {t} WHERE {c} IS NOT NULL AND {c} != ''",
            c = column,
            t = table
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        for value in rows {
            out.push((format!("{}.{}", table, column), value?));
        }
    }
    for key in PATH_SETTINGS {
        let value: Option<String> = conn
            .query_row(
                "SELECT value FROM app_settings WHERE key = ?1",
                [key],
                |row| row.get(0),
            )
            .ok();
        if let Some(v) = value.filter(|v| !v.trim().is_empty()) {
            out.push((format!("app_settings.{}", key), v));
        }
    }
    Ok(out)
}

/// Der Anker, an dem die Datenbank gerade hängt.
pub fn detect_anchor(conn: &Connection) -> SqlResult<Option<String>> {
    let values: Vec<String> = collect_values(conn)?.into_iter().map(|(_, v)| v).collect();
    Ok(common_anchor(&values, sep()))
}

/// Trockenlauf: zählt und zeigt Beispiele, schreibt nichts.
pub fn plan(conn: &Connection, old_anchor: &str, new_anchor: &str) -> SqlResult<RelocatePlan> {
    // Der Zieltrenner kommt aus der Form des neuen Ankers, nicht aus dem
    // laufenden System — nur so lässt sich ein Mac-Umzug von Windows aus im
    // Trockenlauf ansehen. Ein Anker ohne Trenner fällt auf das System zurück.
    let target_sep = if new_anchor.contains('/') && !new_anchor.contains('\\') {
        '/'
    } else if new_anchor.contains('\\') {
        '\\'
    } else {
        sep()
    };

    let mut entries: Vec<RelocateEntry> = Vec::new();
    let (mut total, mut skipped) = (0usize, 0usize);

    for (label, value) in collect_values(conn)? {
        let slot = match entries.iter().position(|e| e.label == label) {
            Some(i) => &mut entries[i],
            None => {
                entries.push(RelocateEntry {
                    label: label.clone(),
                    count: 0,
                    skipped: 0,
                    sample_before: None,
                    sample_after: None,
                });
                entries.last_mut().expect("gerade eingefügt")
            }
        };
        match swap_anchor(&value, old_anchor, new_anchor, target_sep) {
            Some(after) => {
                slot.count += 1;
                total += 1;
                if slot.sample_before.is_none() {
                    slot.sample_before = Some(value);
                    slot.sample_after = Some(after);
                }
            }
            None => {
                slot.skipped += 1;
                skipped += 1;
            }
        }
    }

    Ok(RelocatePlan {
        old_anchor: old_anchor.to_string(),
        new_anchor: new_anchor.to_string(),
        entries,
        total,
        skipped,
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    const WIN: char = '\\';
    const MAC: char = '/';

    #[test]
    fn tauscht_nur_den_kopf_und_dreht_die_trenner() {
        let old = r"C:\Users\kismo\OneDrive\Dokumente";
        let new = "/Users/goodbxy/Studio";

        // Der gemischte Trenner aus dem echten Bestand ("2025/06_JUNE")
        let vorher = r"C:\Users\kismo\OneDrive\Dokumente\._BEAT LIBRARY\03_ARCHIVE\2025/06_JUNE\0862 - PARADISE";
        assert_eq!(
            swap_anchor(vorher, old, new, MAC).unwrap(),
            "/Users/goodbxy/Studio/._BEAT LIBRARY/03_ARCHIVE/2025/06_JUNE/0862 - PARADISE"
        );
    }

    #[test]
    fn anker_endet_an_der_ordnergrenze() {
        let old = r"C:\P\BEAT LIBRARY";
        // Nachbarordner mit gleichem Namensanfang darf nicht mitgerissen werden
        assert_eq!(swap_anchor(r"C:\P\BEAT LIBRARY_ALT\x", old, r"E:\B", WIN), None);
        assert_eq!(
            swap_anchor(r"C:\P\BEAT LIBRARY\x", old, r"E:\B", WIN).unwrap(),
            r"E:\B\x"
        );
    }

    #[test]
    fn schreibweise_und_schlussstrich_sind_egal() {
        assert_eq!(
            swap_anchor(r"c:\p\LIB/x", r"C:\P\lib\", r"E:\B", WIN).unwrap(),
            r"E:\B\x"
        );
    }

    #[test]
    fn fremde_pfade_bleiben_unberuehrt() {
        assert_eq!(swap_anchor(r"D:\woanders\x", r"C:\P", r"E:\B", WIN), None);
    }

    #[test]
    fn gemeinsamer_anker_endet_nie_mitten_im_namen() {
        let werte = vec![
            r"C:\P\LIB\03_ARCHIVE\a".to_string(),
            r"C:\P\LIB\01_ACTIVE\b".to_string(),
            r"C:\P\LIBRARY_ALT\c".to_string(),
        ];
        // Nicht "C:\P\LIB" — das wäre ein Präfix von "LIBRARY_ALT", aber keine
        // Ordnergrenze.
        assert_eq!(common_anchor(&werte, WIN).as_deref(), Some(r"C:\P"));
    }

    #[test]
    fn gemeinsamer_anker_am_echten_muster() {
        let werte = vec![
            r"C:\Users\kismo\OneDrive\Dokumente\._BEAT LIBRARY\03_ARCHIVE\x".to_string(),
            r"C:\Users\kismo\OneDrive\Dokumente\._BEAT LIBRARY\01_ACTIVE_PRODUCTION\y".to_string(),
            r"C:\Users\kismo\OneDrive\Dokumente\Image-Line\FL Studio\Projects\z".to_string(),
        ];
        assert_eq!(
            common_anchor(&werte, WIN).as_deref(),
            Some(r"C:\Users\kismo\OneDrive\Dokumente")
        );
    }

    fn test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE beats (id TEXT PRIMARY KEY, path TEXT);
             CREATE TABLE studio_projects (path TEXT PRIMARY KEY, status TEXT);
             CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             INSERT INTO beats VALUES ('1', 'C:\\P\\LIB\\03_ARCHIVE\\a'), ('2', 'C:\\P\\LIB\\03_ARCHIVE\\b');
             INSERT INTO studio_projects VALUES ('C:\\P\\LIB\\01_ACTIVE\\p', 'wip');
             INSERT INTO app_settings VALUES
               ('archive_path', 'C:\\P\\LIB\\03_ARCHIVE'),
               ('producer_name', 'prod. goodbxy');",
        )
        .unwrap();
        conn
    }

    #[test]
    fn trockenlauf_zaehlt_und_laesst_fremde_werte_liegen() {
        let conn = test_db();
        let p = plan(&conn, r"C:\P\LIB", r"E:\BEATS").unwrap();

        assert_eq!(p.total, 4, "2 beats + 1 studio + 1 settings-pfad");
        assert_eq!(p.skipped, 0);
        // producer_name steht nicht in PATH_SETTINGS und taucht gar nicht auf
        assert!(p.entries.iter().all(|e| !e.label.contains("producer_name")));

        let beats = p.entries.iter().find(|e| e.label == "beats.path").unwrap();
        assert_eq!(beats.count, 2);
        assert_eq!(beats.sample_after.as_deref(), Some(r"E:\BEATS\03_ARCHIVE\a"));
    }

    #[test]
    fn trockenlauf_schreibt_nichts() {
        let conn = test_db();
        plan(&conn, r"C:\P\LIB", r"E:\BEATS").unwrap();
        let path: String = conn
            .query_row("SELECT path FROM beats WHERE id = '1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(path, r"C:\P\LIB\03_ARCHIVE\a", "Trockenlauf darf nichts anfassen");
    }

    #[test]
    fn anker_wird_aus_der_db_erkannt() {
        let conn = test_db();
        let anchor = detect_anchor(&conn).unwrap().unwrap();
        // Auf Windows mit `\`, auf dem Mac mit `/` — normalize() dreht beides.
        assert!(
            anchor.to_lowercase().ends_with("lib"),
            "erkannt: {}",
            anchor
        );
    }

    /// Handprobe am echten Bestand — läuft nur mit gesetzten Pfaden:
    ///
    /// ```text
    /// BEATOS_RELOCATE_DB="C:\...\beats.db.vor-anker-2026-09-04" \
    /// BEATOS_NEW_ANCHOR="/Users/goodbxy/Studio" \
    ///   cargo test --lib trockenlauf_am_echten_bestand -- --ignored --nocapture
    /// ```
    ///
    /// Bewusst nicht Teil des normalen Laufs: er hängt an einer echten Datei.
    /// Öffnet sie nur lesend und schreibt nichts.
    #[test]
    #[ignore]
    fn trockenlauf_am_echten_bestand() {
        let (Ok(db), Ok(new_anchor)) = (
            std::env::var("BEATOS_RELOCATE_DB"),
            std::env::var("BEATOS_NEW_ANCHOR"),
        ) else {
            eprintln!("BEATOS_RELOCATE_DB und BEATOS_NEW_ANCHOR setzen — übersprungen");
            return;
        };

        let conn = Connection::open_with_flags(
            &db,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .expect("DB nicht lesbar");

        let old_anchor = detect_anchor(&conn)
            .expect("Anker-Erkennung fehlgeschlagen")
            .expect("kein gemeinsamer Anker gefunden");

        let p = plan(&conn, &old_anchor, &new_anchor).unwrap();

        println!("\n  ALT: {}", p.old_anchor);
        println!("  NEU: {}\n", p.new_anchor);
        for e in &p.entries {
            println!("  {:<32} {:>5} werte, {} uebersprungen", e.label, e.count, e.skipped);
            if let (Some(b), Some(a)) = (&e.sample_before, &e.sample_after) {
                println!("      vorher:   {}", b);
                println!("      nachher:  {}", a);
            }
        }
        println!("\n  GESAMT {} werte wuerden sich aendern, {} blieben liegen\n", p.total, p.skipped);

        assert!(p.total > 0, "der Trockenlauf hat nichts gefunden");
    }
}
