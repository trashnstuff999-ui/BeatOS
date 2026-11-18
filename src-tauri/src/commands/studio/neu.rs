// src-tauri/src/commands/studio/neu.rs

use super::*;

// ═══════════════════════════════════════════════════════════════════════════════
// Scheibe 6: Neues erkennen. In FL ohne BeatOS gespeichert („dont cry 150 bm“)
// liegt als Ordner oder lose FLP ohne Nummer in der Produktion bzw. 06_SAMPLES.
// BeatOS schlägt Nummer + Namen nach der Regel vor, Stephan übernimmt.
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Serialize)]
pub struct NeuGefunden {
    pub pfad: String,
    /// Name wie gespeichert (Ordner oder FLP ohne Endung)
    pub alt: String,
    /// Vorschlag ohne Nummer: „DONT CRY [150 Bmin]“
    pub titel: String,
    /// „P0773“ / „S0039“, fortlaufend innerhalb der Liste
    pub nummer: String,
    pub sample: bool,
    /// Lose FLP statt Ordner
    pub lose: bool,
    pub in_fl: bool,
    /// Lose Spuren (WAV/MIDI ohne FLP) mit demselben Titel: Anzahl, sonst 0
    pub spuren: u32,
    /// Titel, Tempo und Tonart da, in FL zu, seit 2 Minuten unverändert:
    /// BeatOS ordnet es ohne Klick ein
    pub fertig: bool,
    /// Lose: welche Dateien beim Übernehmen mitgehen (Dateinamen). Ordner: leer
    pub dateien: Vec<String>,
}

/// So lange muss alles ruhen, bevor BeatOS von selbst einordnet. Sonst risse
/// ein laufender Export aus FL die Spuren auf zwei Ordner auseinander.
pub(super) const RUHE_SEK: u64 = 120;

/// Steht kein Tempo im Namen, das aus der FLP dazu: `DONT CRY` → `DONT CRY [140]`.
pub(super) fn mit_flp_tempo(titel: String, p: &Path) -> String {
    use std::io::Read;
    if titel.contains('[') || ist_spur(p) { return titel; }
    let flp = if p.is_dir() {
        std::fs::read_dir(p).into_iter().flatten().flatten().map(|e| e.path()).find(|f| is_flp(f))
    } else { Some(p.to_path_buf()) };
    let mut kopf = Vec::new();
    let tempo = flp.and_then(|f| std::fs::File::open(f).ok())
        .and_then(|f| f.take(65_536).read_to_end(&mut kopf).ok())
        .and_then(|_| crate::commands::flp::tempo(&kopf))
        .map(|t| t.round() as u32).filter(|t| (40..=300).contains(t));
    let Some(t) = tempo else { return titel };
    let (basis, zusatz) = titel.split_at(titel.find('_').unwrap_or(titel.len()));
    format!("{} [{}]{}", basis.trim_end(), t, zusatz).trim_start().to_string()
}

/// Jüngste Änderung an dem, was umziehen würde. Lose Spuren: alle im Stamm,
/// ein laufender Export hält also jede Gruppe an.
pub(super) fn juengste_secs(p: &Path, root: &Path) -> u64 {
    let dir = if p.is_dir() { p } else if ist_spur(p) { root } else { return file_modified_secs(p).unwrap_or(0) };
    std::fs::read_dir(dir).into_iter().flatten().flatten().map(|e| e.path())
        .filter(|f| f.is_file() && (p.is_dir() || ist_spur(f)))
        .filter_map(|f| file_modified_secs(&f)).max().unwrap_or(0)
}

/// `[150 Bmin]`: Tempo und Tonart stehen beide da.
pub(super) fn komplett(titel: &str) -> bool {
    titel.split_once('[').is_some_and(|(t, k)| !t.trim().is_empty()
        && k.split(']').next().unwrap_or("").split_whitespace().count() == 2)
}

/// WAV, MP3 … oder MIDI: was BeatOS in einem Sample als Spur benennt.
pub(super) fn ist_spur(p: &Path) -> bool {
    p.extension().and_then(|e| e.to_str())
        .is_some_and(|e| crate::utils::is_audio_extension(e) || e.eq_ignore_ascii_case("mid"))
}

pub(super) fn stamm(p: &Path) -> String {
    p.file_stem().unwrap_or_default().to_string_lossy().to_string()
}

/// Titel, zu dem eine lose Spur gehört: `Bass-GTR - Blue Hour - 150 bm` →
/// `BLUE HOUR [150 Bmin]`. Ohne Instrument ist der ganze Name der Titel.
pub(super) fn gruppen_titel(stem: &str) -> String {
    let s = crate::utils::schoener_name(stem.split('_').next().unwrap_or(""), true);
    match s.split_once(" - ") { Some((_, t)) => t.to_string(), None => s }
}

/// Voller Spurname ohne Endung. `alt_titel` = Titel, wie er bisher im Namen stand.
/// `keys lead` → `KEYS LEAD - TITEL [145 F#min]`, die ganze Version → `TITEL [145 F#min]`.
pub(super) fn spur_name(stem: &str, alt_titel: &str, titel: &str) -> String {
    let (basis, zusatz) = stem.split_at(stem.find('_').unwrap_or(stem.len()));
    let ohne_klammer = |t: &str| t.split(" [").next().unwrap_or("").to_string();
    let sauber = crate::utils::schoener_name(basis, true);
    let traegt_titel = |t: &str| [alt_titel, titel].iter().any(|x| ohne_klammer(x) == ohne_klammer(t));
    let spur = match sauber.split_once(" - ") {
        Some((inst, t)) if traegt_titel(t) => inst.to_string(),
        // Umgekehrt getippt: `NO MORE TIME - Piano`
        Some((t, inst)) if traegt_titel(t) => crate::utils::spur_kurz(inst),
        None if traegt_titel(&sauber) => String::new(),
        _ => crate::utils::spur_kurz(basis),
    };
    if spur.is_empty() { format!("{}{}", titel, zusatz) } else { format!("{} - {}{}", spur, titel, zusatz) }
}

/// Welche Spuren im Ordner (nur oberste Ebene) wie heißen müssten: (jetzt, voll benannt).
/// Was schon stimmt oder auf einen belegten Namen fiele, fehlt in der Liste.
pub(super) fn spuren_plan(ordner: &Path, alt_titel: &str, titel: &str) -> Vec<(PathBuf, PathBuf)> {
    let mut plan: Vec<(PathBuf, PathBuf)> = Vec::new();
    for p in std::fs::read_dir(ordner).into_iter().flatten().flatten().map(|e| e.path()) {
        if !p.is_file() || !ist_spur(&p) { continue; }
        let ext = p.extension().unwrap_or_default().to_string_lossy().to_string();
        let ziel = ordner.join(sanitize_filename_part(&format!("{}.{}", spur_name(&stamm(&p), alt_titel, titel), ext)));
        if ziel != p && !ziel.exists() && !plan.iter().any(|(_, z)| *z == ziel) { plan.push((p, ziel)); }
    }
    plan
}

/// Alte Samples nachziehen: Spuren in nummerierten Sample-Ordnern, die noch
/// nicht den vollen Namen tragen. Nur wo Titel, Tempo und Tonart im Ordnernamen
/// stehen; FLPs bleiben, wie sie sind. Je Eintrag: Ordner, Dateiname jetzt,
/// Dateiname danach. `anwenden` benennt um und gibt zurück, was umbenannt wurde.
#[tauri::command]
pub fn samples_nachziehen(root: String, anwenden: bool) -> Vec<[String; 3]> {
    let datei = |p: &Path| p.file_name().unwrap_or_default().to_string_lossy().to_string();
    let mut ordner: Vec<PathBuf> = std::fs::read_dir(&root).into_iter().flatten().flatten()
        .map(|e| e.path()).filter(|p| p.is_dir()).collect();
    ordner.sort();
    let mut liste = Vec::new();
    let mut umbenannt: Vec<(PathBuf, PathBuf)> = Vec::new();
    for o in ordner {
        let name = datei(&o);
        // `S0039 - RUNAWAY [158 Dmin]` → `RUNAWAY [158 Dmin]`
        let Some(rest) = name.strip_prefix('S') else { continue };
        let titel = rest.trim_start_matches(|c: char| c.is_ascii_digit());
        if titel.len() == rest.len() { continue; }
        let titel = titel.trim_start_matches([' ', '-']);
        if !komplett(titel) { continue; }
        for (von, nach) in spuren_plan(&o, titel, titel) {
            if !anwenden || std::fs::rename(&von, &nach).is_ok() {
                liste.push([name.clone(), datei(&von), datei(&nach)]);
                if anwenden { umbenannt.push((von, nach)); }
            }
        }
    }
    beats_nachziehen(umbenannt);
    liste
}

pub(super) const NACHZUG_ANLASS: &str = "vor Sample-Umbenennung";

/// Beats, die ein umbenanntes Sample benutzen, ziehen nach (alt → neu, Ordner oder
/// Datei). Im Hintergrund, weil dafür jede FLP der Bibliothek gelesen wird (6000+, ~45 s).
/// In FL offene Beats warten, bis FL sie schließt: sonst schriebe FL beim Speichern die
/// alten Pfade zurück. Die Warteliste liegt als Datei neben der DB und übersteht einen
/// Neustart (`nachzuege_fortsetzen`).
pub(super) fn beats_nachziehen(paare: Vec<(PathBuf, PathBuf)>) {
    if paare.is_empty() { return; }
    std::thread::spawn(move || {
        let mut wurzeln: Vec<PathBuf> = production_roots().into_iter().map(PathBuf::from).collect();
        if let Some(lib) = samples_root().and_then(|s| s.parent().map(Path::to_path_buf)) {
            wurzeln.extend(["03_ARCHIVE", "05_ARTISTS", "07_REMIXES"].map(|o| lib.join(o)));
        }
        let fl = fl_fenstertitel();
        let n = crate::commands::pfadreparatur::verweise_umbiegen(&paare, &wurzeln, NACHZUG_ANLASS, &|p| in_fl(&fl, &stamm(p)));
        let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
        nachzug_abschliessen(paare, n, nachzug_ordner().join(format!("nachzug-{}.json", nanos)));
    });
}

pub(super) fn nachzug_ordner() -> PathBuf {
    crate::db::get_db_path().parent().map(Path::to_path_buf).unwrap_or_else(|| PathBuf::from("."))
}

/// Meldet den Stand und wartet auf die offenen Beats, bis keiner mehr offen ist.
pub(super) fn nachzug_abschliessen(paare: Vec<(PathBuf, PathBuf)>, mut n: crate::commands::pfadreparatur::Nachzug, datei: PathBuf) {
    let mut gemeldet = usize::MAX;
    loop {
        if n.offen.len() != gemeldet { nachzug_melden(&n); gemeldet = n.offen.len(); }
        if n.offen.is_empty() { let _ = std::fs::remove_file(&datei); return; }
        if let Ok(j) = serde_json::to_vec(&(&paare, &n.offen)) { let _ = std::fs::write(&datei, j); }
        std::thread::sleep(std::time::Duration::from_secs(10));
        let fl = fl_fenstertitel();
        let r = crate::commands::pfadreparatur::verweise_in(&paare, &n.offen, NACHZUG_ANLASS, &|p| in_fl(&fl, &stamm(p)));
        n.geaendert += r.geaendert;
        n.fehler.extend(r.fehler);
        n.offen = r.offen;
    }
}

/// Ereignis `beats-nachgezogen` an die Oberfläche (NachzugHinweis.tsx).
pub(super) fn nachzug_melden(n: &crate::commands::pfadreparatur::Nachzug) {
    if n.geaendert == 0 && n.offen.is_empty() && n.fehler.is_empty() { return; }
    eprintln!("Sample umbenannt: {} FLPs nachgezogen, {} warten auf FL, {} Fehler", n.geaendert, n.offen.len(), n.fehler.len());
    if let Some(app) = crate::APP.get() {
        use tauri::Emitter;
        let offen: Vec<String> = n.offen.iter().map(|p| stamm(p)).collect();
        let _ = app.emit("beats-nachgezogen", serde_json::json!({ "geaendert": n.geaendert, "offen": offen, "fehler": n.fehler }));
    }
}

/// Beim Start: Wartelisten vom letzten Mal weiterführen.
pub(crate) fn nachzuege_fortsetzen() {
    for e in std::fs::read_dir(nachzug_ordner()).into_iter().flatten().flatten() {
        let datei = e.path();
        let name = e.file_name().to_string_lossy().to_string();
        if !(name.starts_with("nachzug-") && name.ends_with(".json")) { continue; }
        let Ok((paare, offen)) = std::fs::read(&datei).map_err(|_| ())
            .and_then(|b| serde_json::from_slice::<(Vec<(PathBuf, PathBuf)>, Vec<PathBuf>)>(&b).map_err(|_| ())) else { continue };
        let n = crate::commands::pfadreparatur::Nachzug { offen, ..Default::default() };
        std::thread::spawn(move || nachzug_abschliessen(paare, n, datei));
    }
}

/// Spuren im Sample-Ordner (nur oberste Ebene) auf den vollen Namen bringen.
/// FLPs bleiben, die benennt der Ordner-Umzug. Belegte Zielnamen bleiben liegen.
// ponytail: steht nicht im Umzugs-Protokoll; Rückgängig stellt den Ordner zurück, die Spurnamen nicht.
/// Gibt zurück, welche Spuren umbenannt wurden (jetzt, danach).
pub(super) fn spuren_benennen(ordner: &Path, alt_titel: &str, titel: &str) -> Vec<(PathBuf, PathBuf)> {
    let umbenannt: Vec<(PathBuf, PathBuf)> = spuren_plan(ordner, alt_titel, titel).into_iter()
        .filter(|(von, nach)| std::fs::rename(von, nach).is_ok()).collect();
    // Genau eine FLP, die anders heißt als der Ordner (in FL frei benannt): heißt jetzt wie er
    let flps: Vec<PathBuf> = std::fs::read_dir(ordner).into_iter().flatten().flatten()
        .map(|e| e.path()).filter(|p| is_flp(p)).collect();
    if let ([flp], Some(name)) = (flps.as_slice(), ordner.file_name()) {
        let ziel = ordner.join(format!("{}.flp", name.to_string_lossy()));
        if !ziel.exists() { let _ = std::fs::rename(flp, &ziel); }
    }
    umbenannt
}

/// Lose Spuren mit demselben Titel wie `pfad` in einen neuen Ordner, voll benannt.
/// Gibt je Spur zurück, wo sie lag und wo sie jetzt liegt.
pub(super) fn lose_spuren_einordnen(pfad: &Path, ziel: &Path, titel: &str) -> Result<Vec<(PathBuf, PathBuf)>, String> {
    let root = pfad.parent().ok_or("Kein Elternordner")?;
    let gruppe = gruppen_titel(&stamm(pfad));
    if !ziel.exists() { std::fs::create_dir(ziel).map_err(|e| format!("Ordner nicht anlegbar: {}", e))?; }
    let mut wege: Vec<(PathBuf, PathBuf)> = Vec::new();
    for p in std::fs::read_dir(root).into_iter().flatten().flatten().map(|e| e.path()) {
        if p.is_file() && ist_spur(&p) && gruppen_titel(&stamm(&p)) == gruppe {
            let neu = ziel.join(p.file_name().unwrap());
            std::fs::rename(&p, &neu).map_err(|e| format!("„{}“ nicht verschiebbar: {}", stamm(&p), e))?;
            wege.push((p, neu));
        }
    }
    for (von, nach) in spuren_benennen(ziel, &gruppe, titel) {
        if let Some(w) = wege.iter_mut().find(|w| w.1 == von) { w.1 = nach; }
    }
    Ok(wege)
}

pub(super) fn samples_root() -> Option<PathBuf> {
    let s = crate::commands::get_settings().ok()?;
    Some(Path::new(s.get("archive_path")?.trim()).parent()?.join("06_SAMPLES"))
}

/// Titel des FL-Fensters, kleingeschrieben. `Some("")`, wenn FL läuft, der Titel
/// aber nicht lesbar ist; `None`, wenn FL nicht läuft.
pub(crate) fn fl_fenstertitel() -> Option<String> {
    // Je Name gefiltert: `/V` über alle Prozesse braucht 20 Sekunden, mit Filter 0,1.
    let mut out = String::new();
    for exe in ["FL64.exe", "FL.exe"] {
        let mut c = std::process::Command::new("tasklist");
        c.args(["/V", "/NH", "/FO", "CSV", "/FI", &format!("IMAGENAME eq {}", exe)]);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            c.creation_flags(0x0800_0000);
        }
        out.push_str(&String::from_utf8_lossy(&c.output().ok()?.stdout).to_lowercase());
        out.push('\n');
    }
    let zeilen: Vec<&str> = out.lines().filter(|l| l.starts_with("\"fl64.exe\"") || l.starts_with("\"fl.exe\"")).collect();
    if zeilen.is_empty() { return None; }
    // Letzte CSV-Spalte = Fenstertitel
    Some(zeilen.iter().map(|l| l.rsplit("\",\"").next().unwrap_or("").trim_matches('"').to_string())
        .filter(|t| t != "n/a").collect::<Vec<_>>().join("\n"))
}

/// Offen in FL = Name steht im Fenstertitel. Titel nicht lesbar: lieber „offen“.
pub(crate) fn in_fl(titel: &Option<String>, name: &str) -> bool {
    match titel {
        None => false,
        Some(t) if t.is_empty() => true,
        Some(t) => t.contains(&name.to_lowercase()),
    }
}

pub(super) fn neues_in(root: &Path, sample: bool, start: u32, fl: &Option<String>) -> Vec<NeuGefunden> {
    let Ok(rd) = std::fs::read_dir(root) else { return Vec::new() };
    let mut alle: Vec<(PathBuf, String, bool)> = Vec::new();
    let mut spuren: Vec<PathBuf> = Vec::new();
    for e in rd.filter_map(|e| e.ok()) {
        let p = e.path();
        let name = e.file_name().to_string_lossy().to_string();
        if name.starts_with('_') || name.starts_with('.') { continue; }
        let hat_nummer = if sample { sample_number(&name).is_some() } else { project_number(&name).is_some() };
        if p.is_dir() && !hat_nummer {
            let hat_flp = std::fs::read_dir(&p).into_iter().flatten().flatten().any(|f| is_flp(&f.path()));
            if hat_flp { alle.push((p, name, false)); }
        } else if p.is_file() && is_flp(&p) {
            let stem = p.file_stem().unwrap_or_default().to_string_lossy().to_string();
            alle.push((p, stem, true));
        } else if sample && p.is_file() && ist_spur(&p) {
            spuren.push(p);
        }
    }
    // Lose Spuren: eine Zeile je Titel. Exporte einer losen FLP ziehen mit ihr um,
    // bei Samples auch Spuren mit ihrem Titel (`gtr - sunrise - f#m 132.wav` zu `sunrise - f#m 132.flp`).
    spuren.retain(|p| !alle.iter().any(|(f, a, lose)| *lose
        && (*a == stamm(p) || (sample && gruppen_titel(&stamm(f)) == gruppen_titel(&stamm(p))))));
    spuren.sort();
    let mut anzahl: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
    for p in spuren {
        let t = gruppen_titel(&stamm(&p));
        if !anzahl.contains_key(&t) { alle.push((p.clone(), stamm(&p), true)); }
        *anzahl.entry(t).or_default() += 1;
    }
    alle.sort_by_key(|(p, _, _)| file_modified_secs(p));
    let prefix = if sample { "S" } else { PROJECT_PREFIX };
    let jetzt = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let lose_dateien: Vec<PathBuf> = std::fs::read_dir(root).into_iter().flatten().flatten()
        .map(|e| e.path()).filter(|p| p.is_file()).collect();
    alle.into_iter().enumerate().map(|(i, (p, alt, lose))| {
        let titel = if ist_spur(&p) { gruppen_titel(&alt) } else { mit_flp_tempo(crate::utils::schoener_name(&alt, sample), &p) };
        let offen = fl_namen(&p).iter().any(|n| in_fl(fl, n));
        // Wie lose_flp_einordnen / lose_spuren_einordnen: gleicher Name, bei Samples gleicher Titel
        let gruppe = gruppen_titel(&alt);
        let mut dateien: Vec<String> = if !lose { Vec::new() } else {
            lose_dateien.iter().filter(|f| **f == p || (is_flp(&p) && stamm(f) == alt)
                || (sample && ist_spur(f) && gruppen_titel(&stamm(f)) == gruppe))
                .map(|f| f.file_name().unwrap_or_default().to_string_lossy().to_string()).collect()
        };
        dateien.sort();
        NeuGefunden {
            pfad: p.to_string_lossy().to_string(),
            spuren: if ist_spur(&p) { anzahl.get(&gruppen_titel(&alt)).copied().unwrap_or(0) } else { 0 },
            nummer: format!("{}{:04}", prefix, start + i as u32 + 1),
            fertig: !offen && komplett(&titel) && jetzt.saturating_sub(juengste_secs(&p, root)) >= RUHE_SEK,
            in_fl: offen,
            titel, alt, sample, lose, dateien,
        }
    }).collect()
}

pub(super) fn hoechste_sample_nummer(root: &Path) -> u32 {
    std::fs::read_dir(root).into_iter().flatten().flatten()
        .filter_map(|e| sample_number(&e.file_name().to_string_lossy())).max().unwrap_or(0)
}

/// Studio-Zeile „Neu“: alles ohne Nummer in Produktion und 06_SAMPLES.
#[tauri::command]
pub async fn scan_neues() -> Result<Vec<NeuGefunden>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let roots = production_roots();
        let fl = fl_fenstertitel();
        let mut liste = Vec::new();
        let mut naechste = highest_project_number(&roots);
        for r in &roots {
            // Stems, die seit dem letzten Blick dazugekommen sind, benennen
            for p in std::fs::read_dir(r).into_iter().flatten().flatten().map(|e| e.path()) {
                if p.join(crate::utils::STEMS_PROJEKT).is_dir() { stems_benennen(&p, RUHE_SEK); }
                // Frische Exporte: nur wo der Ordner schon einen Titel trägt
                let titel = p.file_name().and_then(|n| parse_project_id(&n.to_string_lossy())).and_then(|id| id.name);
                if let Some(t) = titel.filter(|t| !t.trim().is_empty()) { exporte_benennen(&p, &t, &t, RUHE_SEK); }
            }
            let neu = neues_in(Path::new(r), false, naechste, &fl);
            naechste += neu.len() as u32;
            liste.extend(neu);
        }
        if let Some(s) = samples_root() {
            liste.extend(neues_in(&s, true, hoechste_sample_nummer(&s), &fl));
        }
        liste
    })
    .await
    .map_err(|e| format!("Scan abgestürzt: {}", e))
}

/// Übernehmen: Nummer frisch ziehen (nicht die aus der Liste, die kann alt sein),
/// Titel nach der Regel, dann Ordner umbenennen bzw. lose FLP in einen neuen Ordner.
/// Gibt den neuen Ordner zurück.
#[tauri::command]
pub async fn neu_uebernehmen(pfad: String, titel: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let roots = production_roots();
        let sample_root = samples_root();
        neu_uebernehmen_in(&roots, sample_root.as_deref(), Path::new(&pfad), &titel, &fl_fenstertitel())
    })
    .await
    .map_err(|e| format!("Übernehmen abgestürzt: {}", e))?
}

/// Namen, unter denen FL das Projekt im Fenstertitel zeigt: Ordnername und jede FLP darin.
pub(super) fn fl_namen(pfad: &Path) -> Vec<String> {
    if pfad.is_file() {
        return pfad.file_stem().map(|s| s.to_string_lossy().to_string()).into_iter().collect();
    }
    let mut n: Vec<String> = pfad.file_name().map(|s| s.to_string_lossy().to_string()).into_iter().collect();
    n.extend(std::fs::read_dir(pfad).into_iter().flatten().flatten().map(|e| e.path())
        .filter(|p| is_flp(p)).filter_map(|p| p.file_stem().map(|s| s.to_string_lossy().to_string())));
    n
}

/// Wohin es geht: (Ziel, neuer Name, alter Name). Prüft Ort, FL und Belegung, ändert nichts.
pub(super) fn neu_ziel(roots: &[String], sample_root: Option<&Path>, pfad: &Path, titel: &str, fl: &Option<String>) -> Result<(PathBuf, String, String), String> {
    let root = pfad.parent().ok_or("Kein Elternordner")?;
    let sample = sample_root.is_some_and(|s| s == root);
    if !sample && !roots.iter().any(|r| Path::new(r) == root) {
        return Err("Liegt weder in der Produktion noch in 06_SAMPLES".into());
    }
    if fl_namen(pfad).iter().any(|n| in_fl(fl, n)) {
        return Err("In FL offen. Erst ein anderes Projekt öffnen oder FL schließen.".into());
    }
    let alt = if pfad.is_file() { pfad.file_stem() } else { pfad.file_name() }
        .ok_or("Kein Name")?.to_string_lossy().to_string();
    let titel = crate::utils::schoener_name(titel, sample);
    let nummer = if sample { format!("S{:04}", hoechste_sample_nummer(root) + 1) }
        else { format!("{}{:04}", PROJECT_PREFIX, highest_project_number(roots) + 1) };
    let neu = sanitize_filename_part(&if titel.is_empty() { nummer } else { format!("{} - {}", nummer, titel) });
    let ziel = root.join(&neu);
    if ziel.exists() { return Err(format!("„{}“ gibt es schon", neu)); }
    Ok((ziel, neu, alt))
}

/// Lose FLP in einen neuen Ordner, die FLP heißt wie er; gleichnamige Exporte ziehen mit.
pub(super) fn lose_flp_einordnen(pfad: &Path, ziel: &Path, neu: &str, alt: &str) -> Result<(), String> {
    let root = pfad.parent().ok_or("Kein Elternordner")?;
    std::fs::create_dir(ziel).map_err(|e| format!("Ordner nicht anlegbar: {}", e))?;
    std::fs::rename(pfad, ziel.join(format!("{}.flp", neu)))
        .map_err(|e| { let _ = std::fs::remove_dir(ziel); format!("FLP nicht verschiebbar: {}", e) })?;
    for e in std::fs::read_dir(root).into_iter().flatten().flatten() {
        let p = e.path();
        if p.is_file() && p.file_stem().is_some_and(|s| s.to_string_lossy() == alt) {
            let _ = std::fs::rename(&p, ziel.join(e.file_name()));
        }
    }
    Ok(())
}

pub(super) fn neu_uebernehmen_in(roots: &[String], sample_root: Option<&Path>, pfad: &Path, titel: &str, fl: &Option<String>) -> Result<String, String> {
    let (ziel, neu, alt) = neu_ziel(roots, sample_root, pfad, titel, fl)?;
    // Titel ohne Nummer, so wie er im Ordnernamen steht
    let titel_neu = neu.split_once(" - ").map(|(_, t)| t.to_string()).unwrap_or_default();
    if pfad.is_file() {
        if ist_spur(pfad) { beats_nachziehen(lose_spuren_einordnen(pfad, &ziel, &titel_neu)?); }
        else {
            lose_flp_einordnen(pfad, &ziel, &neu, &alt)?;
            if sample_root != pfad.parent() { exporte_benennen(&ziel, &alt, &titel_neu, 0); }
            // Sample-FLP: Spuren mit demselben Titel gehören dazu
            else { beats_nachziehen(lose_spuren_einordnen(pfad, &ziel, &titel_neu)?); }
        }
        return Ok(ziel.to_string_lossy().to_string());
    }
    let sample = sample_root.is_some_and(|s| Some(s) == pfad.parent());
    let alt_titel = crate::utils::schoener_name(&alt, true);
    // Ordner: derselbe Weg wie das Nachrücken (Protokoll, FLP-Pfade, DB-Zeilen)
    let r = apply_steps(vec![MergeStep {
        from: pfad.to_string_lossy().to_string(),
        to: ziel.to_string_lossy().to_string(),
        old_name: alt, new_name: neu, date: None,
    }], None)?;
    if r.moved == 0 || !r.failed.is_empty() {
        return Err(if r.failed.is_empty() { "Nicht umbenannt".into() } else { r.failed.join("; ") });
    }
    if sample {
        // Wer das Sample schon in einem Beat benutzt, zeigt noch auf den alten Ordner
        let mut wege = vec![(pfad.to_path_buf(), ziel.clone())];
        if !titel_neu.is_empty() {
            wege.extend(spuren_benennen(&ziel, &alt_titel, &titel_neu).into_iter()
                .map(|(von, nach)| (pfad.join(von.file_name().unwrap_or_default()), nach)));
        }
        beats_nachziehen(wege);
    }
    if !sample {
        exporte_benennen(&ziel, &alt_titel, &titel_neu, 0);
        let _ = std::fs::create_dir(ziel.join(crate::utils::STEMS_PROJEKT));
    }
    Ok(ziel.to_string_lossy().to_string())
}

/// Stems eines Projekts auf die Regel bringen: `DRUMS - TITEL [130 F#min]_stem.wav`.
/// Was im Ordner `Stems` liegt, ist ein Stem, egal wie FL die Datei genannt hat;
/// `STEM - x.wav` aus dem Root zieht dorthin. FL schreibt Einzelspuren als
/// `getippt_Spur.wav`: der gemeinsame Anfang bis zum `_` fällt weg, der Rest ist
/// die Spur. Erst wenn der Ordner `ruhe_sek` ruht, sonst träfe es einen laufenden
/// Export. Ohne Titel im Ordnernamen passiert nichts. Gibt die Zahl der Umbenannten zurück.
pub(super) fn stems_benennen(projekt: &Path, ruhe_sek: u64) -> usize {
    let ordner = projekt.file_name().unwrap_or_default().to_string_lossy().to_string();
    let Some(titel) = parse_project_id(&ordner).and_then(|id| id.name).filter(|t| !t.trim().is_empty()) else { return 0 };
    let stems = projekt.join(crate::utils::STEMS_PROJEKT);
    let audio = |d: &Path| -> Vec<PathBuf> {
        std::fs::read_dir(d).into_iter().flatten().flatten().map(|e| e.path())
            .filter(|p| p.is_file() && p.extension().and_then(|e| e.to_str()).is_some_and(crate::utils::is_audio_extension))
            .collect()
    };
    let alt_praefix = |s: &str| s.get(..7).is_some_and(|a| a.eq_ignore_ascii_case("stem - "));
    for p in audio(projekt).into_iter().filter(|p| alt_praefix(&stamm(p))) {
        let ziel = stems.join(p.file_name().unwrap_or_default());
        if std::fs::create_dir_all(&stems).is_ok() && !ziel.exists() { let _ = std::fs::rename(&p, &ziel); }
    }
    // Was `_stem` schon trägt, ist fertig
    let offen: Vec<PathBuf> = audio(&stems).into_iter()
        .filter(|p| crate::utils::export_zusatz(&stamm(p)).as_deref() != Some("stem")).collect();
    let jetzt = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let juengste = offen.iter().filter_map(|p| file_modified_secs(p)).max().unwrap_or(0);
    if offen.is_empty() || jetzt.saturating_sub(juengste) < ruhe_sek { return 0; }

    // Gemeinsamer Anfang der FL-Namen, zurückgeschnitten auf das letzte `_`.
    // `STEM - x` trägt seine Spur schon und zählt dabei nicht mit.
    let fl: Vec<String> = offen.iter().map(|p| stamm(p)).filter(|s| !alt_praefix(s)).collect();
    let gemeinsam: String = match fl.as_slice() {
        [] => String::new(),
        [einer] => einer.rsplit_once('_').map(|(a, _)| format!("{}_", a)).unwrap_or_default(),
        _ => {
            let erster: Vec<char> = fl[0].chars().collect();
            let n = fl.iter().map(|s| s.chars().zip(&erster).take_while(|(a, b)| a == *b).count()).min().unwrap_or(0);
            let anfang: String = erster[..n].iter().collect();
            anfang.rfind('_').map(|i| anfang[..=i].to_string()).unwrap_or_default()
        }
    };
    let mut umbenannt = 0;
    for p in &offen {
        let s = stamm(p);
        let name = if alt_praefix(&s) { &s[7..] } else { &s[gemeinsam.len()..] };
        let spur = name.replace('_', " ").trim_matches([' ', '-']).to_uppercase();
        if spur.is_empty() { continue; }
        let ext = p.extension().unwrap_or_default().to_string_lossy().to_lowercase();
        let ziel = stems.join(sanitize_filename_part(&format!("{} - {}_stem.{}", spur, titel.trim(), ext)));
        if !ziel.exists() && std::fs::rename(p, &ziel).is_ok() { umbenannt += 1; }
    }
    umbenannt
}

/// Exporte im Projektordner auf den Titel bringen: WAV immer `_untagged`, MP3 immer
/// `_tagged` (Stephan, 16.11.2026), ein eigener Zusatz (`_mix`) bleibt. Nur Dateien,
/// die zum Beat gehören: sie tragen den Titel oder heißen wie FLP bzw. Ordner (so
/// nennt FL den Export von sich aus). Alles andere, Stems und ältere Fassungen
/// (`_2`) bleiben liegen. Erst wenn die Datei `ruhe_sek` ruht.
pub(super) fn exporte_benennen(ordner: &Path, alt_titel: &str, titel: &str, ruhe_sek: u64) {
    let ohne_klammer = |t: &str| crate::utils::schoener_name(t, false).split(" [").next().unwrap_or("").to_string();
    let titel = titel.split('_').next().unwrap_or("");
    if ohne_klammer(titel).is_empty() { return; }
    // So nennt FL einen Export von sich aus: wie die FLP bzw. der Ordner
    let fl = fl_namen(ordner);
    let jetzt = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    for p in std::fs::read_dir(ordner).into_iter().flatten().flatten().map(|e| e.path()) {
        let ext = p.extension().unwrap_or_default().to_string_lossy().to_lowercase();
        if !matches!(ext.as_str(), "wav" | "mp3") { continue; }
        let stem = stamm(&p);
        if !p.is_file() || crate::utils::ist_stem(&stem) { continue; }
        // Ältere Fassungen (`…_2`) bleiben, wie sie sind
        if stem.rsplit_once('_').is_some_and(|(_, z)| !z.is_empty() && z.chars().all(|c| c.is_ascii_digit())) && !fl.contains(&stem) { continue; }
        let geaendert = file_modified_secs(&p).unwrap_or(0);
        if jetzt.saturating_sub(geaendert) < ruhe_sek { continue; }
        let basis = match crate::utils::export_zusatz(&stem) {
            Some(_) if !fl.contains(&stem) => stem.rsplit_once('_').map_or(stem.as_str(), |(b, _)| b),
            _ => stem.as_str(),
        };
        let t = ohne_klammer(basis);
        let gehoert_dazu = fl.iter().any(|n| n.eq_ignore_ascii_case(basis)) || t == ohne_klammer(alt_titel) || t == ohne_klammer(titel);
        if !gehoert_dazu { continue; }
        let etikett = crate::utils::export_etikett(if fl.contains(&stem) { "" } else { &stem }, &ext);
        let name = sanitize_filename_part(&format!("{}{}.{}", titel, etikett, ext));
        let ziel = ordner.join(&name);
        if ziel == p { continue; }
        // Nur Groß/Klein anders: Windows meldet das Ziel als vorhanden, umbenennen geht trotzdem
        let nur_schreibweise = p.file_name().is_some_and(|n| n.to_string_lossy().eq_ignore_ascii_case(&name));
        if ziel.exists() && !nur_schreibweise {
            // Neu exportiert: die neue Datei bekommt den Namen, die bisherige eine Nummer
            // ponytail: nächste freie Nummer, also nicht streng nach Alter sortiert
            if geaendert <= file_modified_secs(&ziel).unwrap_or(0) { continue; }
            let Some(frei) = (2..100).map(|i| ordner.join(sanitize_filename_part(&format!("{}{}_{}.{}", titel, etikett, i, ext)))).find(|z| !z.exists()) else { continue };
            if std::fs::rename(&ziel, &frei).is_err() { continue; }
        }
        let _ = std::fs::rename(&p, &ziel);
    }
}

/// „S0012 Nachtzug" → 12. Nur ein großes S mit Ziffern direkt dahinter.
pub(super) fn sample_number(ordner: &str) -> Option<u32> {
    let ziffern: String = ordner.strip_prefix('S')?.chars().take_while(|c| c.is_ascii_digit()).collect();
    ziffern.parse().ok()
}
