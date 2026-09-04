// src-tauri/src/commands/upload/render.rs
// Description rendering ({{PLACEHOLDER}} templates) + hashtag generator.

use super::templates::templates_dir;
use super::SOUNDCLOUD_TAG_LIMIT;
use crate::commands::sample_credits::ResolvedCredit;
use crate::db::open_db;
use crate::utils::current_year_str;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::AppHandle;

// ═══════════════════════════════════════════════════════════════════════════════
// Phase D — template rendering + 04_UPLOAD/ file writing
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Serialize)]
pub struct UploadDescriptions {
    pub beatstars:  String,
    pub soundcloud: String,
    pub youtube:    String,
}

/// Render all 3 platform descriptions for a beat using the current
/// templates + DB state + settings. Pure read — does NOT touch the filesystem
/// beyond reading the template files.
#[tauri::command]
pub fn render_upload_descriptions(app: AppHandle, beat_id: String) -> Result<UploadDescriptions, String> {
    let dir = templates_dir(&app)?;
    let bs_tpl = fs::read_to_string(dir.join("beatstars.template"))
        .map_err(|e| format!("Cannot read beatstars.template: {}", e))?;
    let sc_tpl = fs::read_to_string(dir.join("soundcloud.template"))
        .map_err(|e| format!("Cannot read soundcloud.template: {}", e))?;
    let yt_tpl = fs::read_to_string(dir.join("youtube.template"))
        .map_err(|e| format!("Cannot read youtube.template: {}", e))?;

    let render_for = build_renderer(&beat_id)?;
    Ok(UploadDescriptions {
        beatstars:  render_for("beatstars", &bs_tpl),
        soundcloud: render_for("soundcloud", &sc_tpl),
        youtube:    render_for("youtube", &yt_tpl),
    })
}

/// Vorschau für eine NOCH NICHT gespeicherte Vorlage: rendert beliebigen Text
/// mit den Werten eines echten Beats. Damit zeigt der Template-Editor, was die
/// Platzhalter tun, bevor die Datei überschrieben wird.
#[tauri::command]
pub fn preview_template(beat_id: String, platform: String, contents: String) -> Result<String, String> {
    let render_for = build_renderer(&beat_id)?;
    Ok(render_for(&platform, &contents))
}

/// Sammelt Beat-Zeile, Einstellungen und Hashtag-Logik einmal ein und gibt eine
/// Funktion (Plattform, Vorlage) → fertiger Text zurück. Eine Quelle für das
/// echte Rendern und für die Vorschau im Editor.
fn build_renderer(beat_id: &str) -> Result<impl Fn(&str, &str) -> String, String> {
    let conn = open_db().map_err(|e| e.to_string())?;

    // ─── Beat row ────────────────────────────────────────────────────────
    let (name, bpm, key_field, tb_main, tb_also, tb_genre, tb_youtube, tb_soundcloud) = conn.query_row(
        "SELECT name, bpm, key, type_beat_main, type_beat_also_fits, genre_tags,
                youtube_tags, soundcloud_tags
         FROM beats WHERE id = ?1",
        rusqlite::params![beat_id],
        |row| {
            Ok((
                row.get::<_, String>(0).unwrap_or_default(),
                row.get::<_, Option<f64>>(1).unwrap_or(None),
                row.get::<_, Option<String>>(2).unwrap_or(None),
                row.get::<_, Option<String>>(3).unwrap_or(None),
                row.get::<_, Option<String>>(4).unwrap_or(None),
                row.get::<_, Option<String>>(5).unwrap_or(None),
                row.get::<_, Option<String>>(6).unwrap_or(None),
                row.get::<_, Option<String>>(7).unwrap_or(None),
            ))
        },
    ).map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => format!("Beat {} not found", beat_id),
        _ => format!("DB lookup failed: {}", e),
    })?;

    // ─── Settings map ────────────────────────────────────────────────────
    let mut settings: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    {
        let mut stmt = conn.prepare("SELECT key, value FROM app_settings").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        }).map_err(|e| e.to_string())?;
        for r in rows.filter_map(|r| r.ok()) {
            settings.insert(r.0, r.1);
        }
    }

    // ─── Beatstars purchase link from beat_uploads ───────────────────────
    let beatstars_link: String = conn.query_row(
        "SELECT url FROM beat_uploads WHERE beat_id = ?1 AND platform = 'beatstars'",
        rusqlite::params![beat_id],
        |row| row.get::<_, Option<String>>(0),
    )
    .unwrap_or(None)
    .filter(|s| !s.trim().is_empty())
    .unwrap_or_else(|| settings.get("beatstars_url").cloned().unwrap_or_default());

    // ─── Sample-Credits ──────────────────────────────────────────────────
    // Wer bei diesem Beat ein Sample beigesteuert hat, aufgelöst mit Namen
    // und Links. Leer, wenn keiner — dann sagt der Credits-Block weiterhin,
    // dass keine fremden Samples drinstecken.
    let credits = crate::commands::sample_credits::resolved_credits(&conn, beat_id);

    // ─── Build shared placeholders ───────────────────────────────────────
    let producer = settings.get("producer_name").cloned().unwrap_or_default();
    let producer_prod = if producer.is_empty() {
        String::new()
    } else {
        format!("prod. {}", producer)
    };
    let year = current_year_str();
    let bpm_str = bpm.map(|b| format!("{}", b as i64)).unwrap_or_default();
    let key_str = key_field.unwrap_or_default();
    let title = name.clone();
    let title_upper = title.to_uppercase();
    let tb_main_s = tb_main.clone().unwrap_or_default();
    let tb_also_s = tb_also.clone().unwrap_or_default();
    let tb_genre_s = tb_genre.clone().unwrap_or_default();

    let base_vars: Vec<(&str, String)> = vec![
        ("TITLE",          title),
        ("TITLE_UPPER",    title_upper),
        ("BPM",            bpm_str),
        ("KEY",            key_str),
        ("TYPE_BEAT_MAIN", tb_main_s.clone()),
        ("ALSO_FITS",      tb_also_s.clone()),
        ("GENRE_TAGS",     tb_genre_s.clone()),
        ("PRODUCER",       producer.clone()),
        ("PRODUCER_PROD",  producer_prod),
        ("PRODUCER_LINE",  producer_line(&producer, &credits)),
        ("CREDITS",        credits_block(&producer, &credits)),
        ("COLLAB_SOCIALS", collab_socials(&credits)),
        ("EMAIL",          settings.get("contact_email").cloned().unwrap_or_default()),
        ("IG_URL",         settings.get("instagram_url").cloned().unwrap_or_default()),
        ("SC_URL",         settings.get("soundcloud_url").cloned().unwrap_or_default()),
        ("YT_URL",         settings.get("youtube_url").cloned().unwrap_or_default()),
        ("BS_URL",         settings.get("beatstars_url").cloned().unwrap_or_default()),
        ("BEATSTARS_LINK", beatstars_link),
        ("YEAR",           year),
    ];

    // ─── Per-platform render (HASHTAGS differs by platform style) ────────
    let default_genre = settings.get("default_genre_tags").cloned().unwrap_or_default();
    let yt_override = tb_youtube.unwrap_or_default();
    let sc_override = tb_soundcloud.unwrap_or_default();
    let year_for_yt = base_vars.iter()
        .find(|(k, _)| *k == "YEAR")
        .map(|(_, v)| v.clone())
        .unwrap_or_default();

    Ok(move |platform: &str, template: &str| -> String {
        let hashtags = build_hashtags(
            platform,
            &default_genre,
            &tb_main_s,
            &tb_also_s,
            &tb_genre_s,
            &producer,
            &yt_override,
            &sc_override,
            &year_for_yt,
        );
        let mut vars = base_vars.clone();
        vars.push(("HASHTAGS", hashtags));
        render_template(template, &vars)
    })
}

#[derive(Debug, Deserialize)]
pub struct SaveUploadDescriptionsParams {
    pub beat_id:    String,
    pub beatstars:  Option<String>,
    pub soundcloud: Option<String>,
    pub youtube:    Option<String>,
}

/// Write whichever of the 3 description strings were provided directly into
/// the beat folder root (`{beat_folder}/{platform}.txt`). Missing fields are
/// skipped, so the same command serves both "save all" and "save just this tab".
#[tauri::command]
pub fn save_upload_descriptions(params: SaveUploadDescriptionsParams) -> Result<(), String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let beat_path: String = conn.query_row(
        "SELECT path FROM beats WHERE id = ?1",
        rusqlite::params![params.beat_id],
        |row| row.get::<_, Option<String>>(0),
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => format!("Beat {} not found", params.beat_id),
        _ => format!("DB lookup failed: {}", e),
    })?
    .ok_or_else(|| format!("Beat {} has no folder path on record", params.beat_id))?;

    let beat_root = Path::new(&beat_path);
    if !beat_root.is_dir() {
        return Err(format!("Beat folder does not exist: {}", beat_path));
    }

    let writes: [(Option<String>, &str); 3] = [
        (params.beatstars,  "beatstars.txt"),
        (params.soundcloud, "soundcloud.txt"),
        (params.youtube,    "youtube.txt"),
    ];
    for (content, name) in writes {
        if let Some(text) = content {
            let dest = beat_root.join(name);
            fs::write(&dest, text)
                .map_err(|e| format!("Failed to write {:?}: {}", dest, e))?;
        }
    }
    Ok(())
}

// ─── Renderer + Hashtag generator ──────────────────────────────────────────

fn render_template(template: &str, vars: &[(&str, String)]) -> String {
    // Plain string-replace — pull each {{KEY}} occurrence. Cheap and predictable;
    // no need for a full template engine for this many placeholders.
    let mut out = template.to_string();
    for (k, v) in vars {
        out = out.replace(&format!("{{{{{}}}}}", k), v);
    }
    collapse_blank_runs(&out)
}

/// Wo ein leerer Platzhalter stand, bliebe sonst eine Lücke im Text — bei
/// {{COLLAB_SOCIALS}} etwa eine Leerzeile über einem frei stehenden
/// Trennstrich. Mehr als eine Leerzeile am Stück auf eine zusammenziehen.
///
/// Das ersetzt Bedingungen im Renderer: alle anderen Platzhalter sind so
/// gebaut, dass sie nie leer werden, und die Vorlagen trennen Absätze mit
/// genau einer Leerzeile — an denen ändert die Regel also nichts.
fn collapse_blank_runs(s: &str) -> String {
    let mut kept: Vec<&str> = Vec::new();
    let mut blank_run = 0usize;

    for line in s.split('\n') {
        if line.trim().is_empty() {
            blank_run += 1;
            if blank_run > 1 {
                continue;
            }
        } else {
            blank_run = 0;
        }
        kept.push(line);
    }

    // Mit `join` statt angehängtem Umbruch: das leere Stück, das `split` nach
    // einem abschließenden Umbruch liefert, ist keine Zeile, sondern ein
    // Artefakt — es einzeln zu behandeln hatte einen Umbruch zu viel erzeugt.
    kept.join("\n")
}

// ─── Sample-Credits: die drei Blöcke ───────────────────────────────────────
//
// Wortlaut und Symbole stehen hier, nicht in der Vorlage: die Blöcke entstehen
// aus Daten, also muss ihre Form mitgeliefert werden. Wer sie ändern will,
// ändert diese Konstanten.

const CREDIT_MARK: &str = "🎸";
const NO_SAMPLES: &str = "🚫 No Samples Used";

/// Die Namenszeile: „prod. goodbxy", mit einem Sample-Geber
/// „prod. goodbxy & prodzeux", mit mehreren „prod. goodbxy, a & b".
fn producer_line(producer: &str, credits: &[ResolvedCredit]) -> String {
    let mut names: Vec<&str> = Vec::with_capacity(credits.len() + 1);
    if !producer.trim().is_empty() {
        names.push(producer.trim());
    }
    names.extend(credits.iter().map(|c| c.name.as_str()));

    match names.len() {
        0 => String::new(),
        1 => names[0].to_string(),
        n => format!("{} & {}", names[..n - 1].join(", "), names[n - 1]),
    }
}

/// Der Credits-Block. **Nie leer** — ohne Sample-Geber steht dort weiterhin,
/// dass keine fremden Samples verwendet wurden. Genau deshalb braucht der
/// Renderer keine Bedingungen.
fn credits_block(producer: &str, credits: &[ResolvedCredit]) -> String {
    if credits.is_empty() {
        return format!("{}\n{} Loop by {}", NO_SAMPLES, CREDIT_MARK, producer);
    }
    let mut lines: Vec<String> = credits
        .iter()
        .map(|c| format!("{} {} by {}", CREDIT_MARK, c.contribution, c.name))
        .collect();
    lines.push(format!("{} Beat by {}", CREDIT_MARK, producer));
    lines.join("\n")
}

/// Name und Links je Sample-Geber. Der einzige Block, der leer sein darf —
/// dann greift `collapse_blank_runs`. Wer keine Links hinterlegt hat, wird im
/// Credits-Block genannt, taucht hier aber nicht auf.
fn collab_socials(credits: &[ResolvedCredit]) -> String {
    credits
        .iter()
        .filter(|c| !c.links.is_empty())
        .map(|c| format!("{}:\n{}", c.name, c.links.join("\n")))
        .collect::<Vec<_>>()
        .join("\n\n")
}


/// Build the {{HASHTAGS}} block. Per-platform formatting:
///   • SoundCloud — one tag per line with "#" prefix, original casing preserved,
///                  HARD-CAPPED at SOUNDCLOUD_TAG_LIMIT.
///                  If `sc_override` is set: default_genre_tags (from settings,
///                  always-on) + per-beat curated list, deduped + capped.
///                  Otherwise: auto-generated from defaults + artists + vibes.
///   • YouTube — if `yt_override` is non-empty, used VERBATIM (with {{YEAR}}
///               substitution). Otherwise falls back to auto-generated.
///   • Beatstars — comma-separated lowercase auto-generated list.
fn build_hashtags(
    platform: &str,
    default_genre_tags: &str,
    type_beat_main: &str,
    also_fits: &str,
    genre_tags: &str,
    producer_name: &str,
    yt_override: &str,
    sc_override: &str,
    year: &str,
) -> String {
    // YouTube override path — verbatim text from the beat's youtube_tags field.
    // Supports {{YEAR}} substitution so the user can write "free type beat {{YEAR}}"
    // once and forget about it across years.
    if platform == "youtube" && !yt_override.trim().is_empty() {
        return yt_override.replace("{{YEAR}}", year);
    }

    // SoundCloud override path — curated per-beat list, always merged with the
    // "always-on" default SC tags from settings. Deduped + capped at 9.
    // Each line becomes "#Tag"; user can paste with or without # prefix.
    if platform == "soundcloud" && !sc_override.trim().is_empty() {
        let mut tags: Vec<String> = Vec::new();
        for t in split_tag_text(default_genre_tags) { tags.push(t); }
        for t in split_tag_text(sc_override)        { tags.push(t); }
        return format_soundcloud(&dedup_take(tags, SOUNDCLOUD_TAG_LIMIT));
    }

    // ─── Auto-fallback path (used when no override) ─────────────────────
    let mut out: Vec<String> = Vec::new();

    // 1. Global defaults (e.g. "Hip Hop & Rap, Emo Trap")
    for t in split_csv(default_genre_tags) { out.push(t); }

    // 2. Per-beat descriptive genre tags (vibes) — these matter most for SC
    //    so put them ahead of the artist tags in the priority order.
    for t in split_csv(genre_tags) { out.push(t); }

    // 3. "{Artist} Type Beat" for each main + also-fits artist
    for artist in split_artists(type_beat_main) {
        out.push(format!("{} Type Beat", artist));
    }
    for artist in split_artists(also_fits) {
        out.push(format!("{} Type Beat", artist));
    }

    // 4. Producer credit
    if !producer_name.trim().is_empty() {
        out.push(format!("prod {}", producer_name.trim()));
        out.push(producer_name.trim().to_string());
    }

    let unique = dedup_take(out, usize::MAX);

    match platform {
        "soundcloud" => format_soundcloud(&unique[..unique.len().min(SOUNDCLOUD_TAG_LIMIT)]),
        _ /* youtube fallback + beatstars + anything else */ => unique.iter()
            .map(|t| t.to_lowercase())
            .collect::<Vec<_>>()
            .join(", "),
    }
}

/// Format a tag list as one "#Tag" per line.
fn format_soundcloud(tags: &[String]) -> String {
    tags.iter()
        .map(|t| format!("#{}", t))
        .collect::<Vec<_>>()
        .join("\n")
}

/// Case-insensitive dedup keeping first-seen order, then truncate at `limit`.
fn dedup_take(tags: Vec<String>, limit: usize) -> Vec<String> {
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    tags.into_iter()
        .filter(|t| seen.insert(t.to_lowercase()))
        .take(limit)
        .collect()
}

/// Parse a freeform tag text: split on commas AND newlines, strip optional
/// leading "#", trim whitespace, drop empties. Lets the user paste in either
/// "#Tag1\n#Tag2" or "Tag1, Tag2" interchangeably.
fn split_tag_text(s: &str) -> Vec<String> {
    s.split(|c: char| c == ',' || c == '\n' || c == '\r')
        .map(|t| t.trim().trim_start_matches('#').trim().to_string())
        .filter(|t| !t.is_empty())
        .collect()
}

/// Split a "Dro Kenji x Juice WRLD, Lil Peep & Convolk" style string
/// into individual artist names.
fn split_artists(s: &str) -> Vec<String> {
    if s.trim().is_empty() { return Vec::new(); }
    // Split on commas first, then split each piece on " x ", " X ", " & "
    s.split(',')
        .flat_map(|chunk| {
            chunk
                .replace(" X ", " x ")
                .replace(" & ", " x ")
                .split(" x ")
                .map(|p| p.trim().to_string())
                .filter(|p| !p.is_empty())
                .collect::<Vec<_>>()
        })
        .collect()
}

/// Split a genre/tag list on commas AND pipes. The Upload tab serializes
/// genre rows as "Sad Guitar Type Beat | Sad Melodic Type Beat".
fn split_csv(s: &str) -> Vec<String> {
    s.split(|c: char| c == ',' || c == '|')
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn credit(name: &str, contribution: &str, links: &[&str]) -> ResolvedCredit {
        ResolvedCredit {
            name: name.into(),
            contribution: contribution.into(),
            links: links.iter().map(|s| s.to_string()).collect(),
        }
    }

    // ─── Sample-Credits ────────────────────────────────────────────────

    #[test]
    fn namenszeile_waechst_mit_den_sample_gebern() {
        assert_eq!(producer_line("prod. goodbxy", &[]), "prod. goodbxy");
        assert_eq!(
            producer_line("prod. goodbxy", &[credit("prodzeux", "Guitarsample", &[])]),
            "prod. goodbxy & prodzeux"
        );
        assert_eq!(
            producer_line(
                "prod. goodbxy",
                &[credit("a", "Sample", &[]), credit("b", "Sample", &[])]
            ),
            "prod. goodbxy, a & b"
        );
    }

    /// Der Kern des Entwurfs: dieser Block ist nie leer, deshalb braucht der
    /// Renderer keine Bedingungen.
    #[test]
    fn credits_block_ist_nie_leer() {
        assert_eq!(
            credits_block("prod. goodbxy", &[]),
            "🚫 No Samples Used\n🎸 Loop by prod. goodbxy"
        );
        assert_eq!(
            credits_block("prod. goodbxy", &[credit("prodzeux", "Guitarsample", &[])]),
            "🎸 Guitarsample by prodzeux\n🎸 Beat by prod. goodbxy"
        );
    }

    #[test]
    fn socials_nur_fuer_wen_links_hinterlegt_sind() {
        let mit = credit("prodzeux", "Guitarsample", &[
            "https://www.instagram.com/prodzeux/",
            "https://www.beatstars.com/prodzeux",
        ]);
        let ohne = credit("ohnelinks", "Drumloop", &[]);

        assert_eq!(
            collab_socials(&[mit.clone(), ohne]),
            "prodzeux:\nhttps://www.instagram.com/prodzeux/\nhttps://www.beatstars.com/prodzeux",
            "wer keine Links hat, wird nur im Credits-Block genannt"
        );
        assert_eq!(collab_socials(&[]), "");
    }

    /// Ohne diese Regel bliebe da, wo der leere Block stand, eine Leerzeile
    /// über einem frei stehenden Trennstrich.
    #[test]
    fn leerer_block_hinterlaesst_keine_luecke() {
        let vorlage = "Beatstars: {{BS_URL}}\n\n{{COLLAB_SOCIALS}}\n────────\n";
        let vars = vec![
            ("BS_URL", "beatstars.com/prodgoodbxy".to_string()),
            ("COLLAB_SOCIALS", String::new()),
        ];
        assert_eq!(
            render_template(vorlage, &vars),
            "Beatstars: beatstars.com/prodgoodbxy\n\n────────\n"
        );
    }

    #[test]
    fn gefuellter_block_bleibt_unangetastet() {
        let vorlage = "oben\n\n{{COLLAB_SOCIALS}}\n────────";
        let vars = vec![("COLLAB_SOCIALS", "prodzeux:\nlink".to_string())];
        assert_eq!(
            render_template(vorlage, &vars),
            "oben\n\nprodzeux:\nlink\n────────"
        );
    }

    #[test]
    fn absaetze_mit_einer_leerzeile_ueberleben() {
        let text = "a\n\nb\n\nc";
        assert_eq!(collapse_blank_runs(text), text);
    }

    // ─── Bestehende Tests ──────────────────────────────────────────────

    #[test]
    fn artists_split_on_x_comma_ampersand() {
        assert_eq!(
            split_artists("Dro Kenji x Juice WRLD, Lil Peep & Convolk"),
            vec!["Dro Kenji", "Juice WRLD", "Lil Peep", "Convolk"]
        );
        assert_eq!(split_artists("A X B"), vec!["A", "B"]);
        assert_eq!(split_artists(""), Vec::<String>::new());
        // "x" inside a name must not split (only " x " with spaces does)
        assert_eq!(split_artists("Xavier Wulf"), vec!["Xavier Wulf"]);
    }

    #[test]
    fn csv_splits_on_comma_and_pipe() {
        assert_eq!(
            split_csv("Sad Guitar Type Beat | Sad Melodic Type Beat"),
            vec!["Sad Guitar Type Beat", "Sad Melodic Type Beat"]
        );
        assert_eq!(split_csv("Dark, Melodic"), vec!["Dark", "Melodic"]);
        assert_eq!(split_csv("Mixed | A, B"), vec!["Mixed", "A", "B"]);
        assert_eq!(split_csv("  "), Vec::<String>::new());
    }

    #[test]
    fn tag_text_splits_on_comma_and_newline_strips_hash() {
        assert_eq!(
            split_tag_text("#Tag1\n#Tag2\r\nTag3, Tag4"),
            vec!["Tag1", "Tag2", "Tag3", "Tag4"]
        );
    }

    #[test]
    fn dedup_is_case_insensitive_and_capped() {
        let tags = vec!["Trap".into(), "trap".into(), "Dark".into(), "Sad".into()];
        assert_eq!(dedup_take(tags, 2), vec!["Trap", "Dark"]);
    }
}

// ─── Default Template Contents ─────────────────────────────────────────────
// Placeholders use {{NAME}} syntax. Phase D will implement the renderer.
//
// Available placeholders:
//   {{TITLE}}             — beat title as stored (e.g. "Weightless")
//   {{TITLE_UPPER}}       — uppercased title (e.g. "WEIGHTLESS")
//   {{BPM}}               — e.g. "145"
//   {{KEY}}               — e.g. "Fm"
//   {{TYPE_BEAT_MAIN}}    — e.g. "Dro Kenji x Juice WRLD"
//   {{ALSO_FITS}}         — e.g. "Lil Peep, Convolk, Scorey"
//   {{GENRE_TAGS}}        — e.g. "Dark Melodic Trap"
//   {{HASHTAGS}}          — derived hashtag block, one per line
//   {{PRODUCER}}          — settings.producer_name (e.g. "goodbxy")
//   {{PRODUCER_PROD}}     — "prod. " + producer name (e.g. "prod. goodbxy")
//   {{EMAIL}}             — settings.contact_email
//   {{IG_URL}}            — settings.instagram_url
