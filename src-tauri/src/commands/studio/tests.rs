// src-tauri/src/commands/studio/tests.rs

    use super::{
        derive_stage, duplicate_project_ids, ensure_slot_marker, faellt_ins_aufraeumen, flp_work_minutes_from, is_manual_status, is_orphan_row,
        parse_project_id, repath_studio_rows, resolve_status, scan_project_dir, MergeStep,
        STUDIO_STATUSES,
    };

    #[test]
    fn nur_alte_ideen_ohne_stern_fallen_ins_aufraeumen() {
        let jetzt = 100 * 86_400;
        let alt = jetzt - 31 * 86_400;
        let frisch = jetzt - 2 * 86_400;
        assert!(faellt_ins_aufraeumen("idea", 0, alt, jetzt));
        assert!(!faellt_ins_aufraeumen("idea", 0, frisch, jetzt));
        assert!(!faellt_ins_aufraeumen("idea", 1, alt, jetzt), "Stern bleibt draußen");
        assert!(!faellt_ins_aufraeumen("exported", 0, alt, jetzt));
        assert!(!faellt_ins_aufraeumen("idea", 0, 0, jetzt), "ohne Datum nicht");
    }

    /// Jede Schreibweise, die im echten Bestand vorkommt, muss ihre Nummer
    /// hergeben — sonst fällt der Ordner still aus dem Zusammenführen heraus.
    #[test]
    fn parser_kennt_alle_schreibweisen_im_bestand() {
        let id = |s: &str| parse_project_id(s).map(|i| (i.number, i.name));

        // Das neue System
        assert_eq!(id("Project_0243"), Some((243, None)));
        assert_eq!(id("project_243"), Some((243, None)), "Groß-/Kleinschreibung egal");
        // Schema A: der Name muss mitkommen
        assert_eq!(id("Project_0243 - MEMORIES"), Some((243, Some("MEMORIES".into()))));
        assert_eq!(id("Project_25 - lil peep ninteen"), Some((25, Some("lil peep ninteen".into()))));
        // Reine Nummern und das Rautenschema
        assert_eq!(id("0857"), Some((857, None)));
        assert_eq!(id("0857 - Kopie"), Some((857, Some("Kopie".into()))));
        assert_eq!(id("#Project_75"), Some((75, None)));
        // Das alte System
        assert_eq!(
            id("[701] One Sided Love - 125 Cm"),
            Some((701, Some("One Sided Love - 125 Cm".into())))
        );
        assert_eq!(id("[64] Past Master"), Some((64, Some("Past Master".into()))));

        // Ohne Nummer im Namen: bleibt unangetastet
        assert_eq!(id("NO MORE RUNNING"), None);
        assert_eq!(id("#Project_test"), None);
        assert_eq!(id("Samples"), None);
        // Der gemeinsame Sample-Ordner der alten Eimer darf keine ID bekommen
        assert_eq!(id("[000]Samples"), None);
        // Unsinnszahlen entführen die Nummernvergabe nicht
        assert_eq!(id("2222222"), None);
    }

    /// Das Protokoll ist die einzige Aufzeichnung, welcher Ordner wohin wurde.
    /// Es muss an jedem erreichbaren Ort liegen — und nach dem Lauf überall
    /// auf das eingedampft sein, was wirklich passiert ist.
    #[test]
    fn protokoll_liegt_an_mehreren_orten_und_wird_ueberall_nachgezogen() {
        let root = std::env::temp_dir().join(format!("beatos_log_{}", std::process::id()));
        let bibliothek = root.join("bibliothek");
        let lokal = root.join("lokal");
        std::fs::create_dir_all(&bibliothek).unwrap();
        std::fs::create_dir_all(&lokal).unwrap();

        let schritt = |name: &str| MergeStep {
            from: format!("C:\\ALT\\{}", name),
            to: format!("C:\\PROD\\{}", name),
            old_name: name.to_string(),
            new_name: name.to_string(),
            date: None,
        };
        let geplant = vec![schritt("A"), schritt("B"), schritt("C")];

        let dirs = vec![bibliothek.clone(), lokal.clone()];
        let paths = super::write_merge_log_to(&dirs, &geplant);
        assert_eq!(paths.len(), 2, "das Protokoll muss an BEIDEN Orten liegen");

        // Vor dem Lauf steht der ganze Plan drin
        for p in &paths {
            let inhalt = std::fs::read_to_string(p).unwrap();
            assert!(inhalt.contains("\"old_name\": \"C\""), "Plan unvollständig in {}", p);
        }

        // Nach dem Lauf: nur A und B kamen durch
        let mut failed = Vec::new();
        let erledigt = vec![schritt("A"), schritt("B")];
        super::rewrite_merge_logs(&paths, &erledigt, &mut failed);
        assert!(failed.is_empty(), "Nachziehen sollte klappen: {:?}", failed);

        for p in &paths {
            let inhalt = std::fs::read_to_string(p).unwrap();
            assert!(inhalt.contains("\"old_name\": \"A\""));
            assert!(
                !inhalt.contains("\"old_name\": \"C\""),
                "C ist nie passiert und darf nicht mehr im Protokoll stehen ({})",
                p
            );
        }

        // Ein unerreichbarer Ort darf den anderen nicht mitreißen, muss aber
        // gemeldet werden — ein stilles Scheitern wäre hier das Schlimmste.
        let mut failed2 = Vec::new();
        let mut mit_kaputtem = paths.clone();
        mit_kaputtem.push(root.join("gibt-es-nicht").join("x.json").to_string_lossy().to_string());
        super::rewrite_merge_logs(&mit_kaputtem, &erledigt, &mut failed2);
        assert_eq!(failed2.len(), 1, "der unerreichbare Ort muss gemeldet werden");

        // Ohne Schritte kein Protokoll
        assert!(super::write_merge_log_to(&dirs, &[]).is_empty());

        std::fs::remove_dir_all(&root).ok();
    }

    /// Handprobe: den Plan über den echten Bestand rechnen, ohne etwas zu
    /// bewegen. `plan_production_merge` liest nur.
    ///
    /// ```text
    /// BEATOS_ROOTS="A;B;C" BEATOS_TARGET="A" \
    ///   cargo test --lib plan_handprobe -- --ignored --nocapture
    /// ```
    #[test]
    #[ignore]
    fn plan_handprobe_am_echten_bestand() {
        let (Ok(roots), Ok(target)) = (
            std::env::var("BEATOS_ROOTS"),
            std::env::var("BEATOS_TARGET"),
        ) else {
            eprintln!("BEATOS_ROOTS und BEATOS_TARGET setzen — übersprungen");
            return;
        };
        let paths: Vec<String> = roots.split(';').map(|s| s.trim().to_string()).collect();

        // Wenn ein Archivpfad gesetzt ist: erst abgleichen, dann die
        // nachweislich vollständig archivierten aus dem Lauf nehmen. Genau das
        // macht der Dialog auch — hier sieht man das Ergebnis in Zahlen.
        let exclude: Vec<String> = match std::env::var("BEATOS_ARCHIVE") {
            Ok(archive) => {
                let res = crate::commands::archive_match::match_projects_for_test(
                    &paths,
                    std::path::Path::new(&archive),
                    true,
                );
                res.into_iter()
                    .filter(|r| {
                        r.archive_folder.is_some()
                            && r.missing_important == 0
                            && r.matched_by
                                != Some(crate::commands::archive_match::MatchKind::Ambiguous)
                    })
                    .map(|r| r.project_path)
                    .collect()
            }
            Err(_) => Vec::new(),
        };
        println!("  ausgenommen (vollständig archiviert): {}", exclude.len());

        let plan = super::plan_production_merge(paths, target.clone(), exclude).unwrap();

        let verschieben = plan.steps.iter().filter(|s| s.from != s.to).count();
        println!("\n── Plan-Handprobe ───────────────────────────");
        println!("  Ziel:                     {}", plan.target);
        println!("  Projekte im Lauf:         {}", plan.steps.len());
        println!("    davon verschoben:       {}", verschieben);
        println!("    davon nur umbenannt:    {}", plan.steps.len() - verschieben);
        println!("  bleiben liegen:           {}", plan.skipped.len());
        println!("  doppelte Nummern:         {}", plan.duplicates.len());

        let mut gruende: std::collections::HashMap<&str, usize> = std::collections::HashMap::new();
        for s in &plan.skipped {
            *gruende.entry(s.reason.as_str()).or_default() += 1;
        }
        for (grund, n) in &gruende {
            println!("    „{}“: {}", grund, n);
        }

        println!("\n  Erste zehn Schritte (ältester zuerst):");
        for s in plan.steps.iter().take(10) {
            println!("    {:<44} → {}", super::truncate(&s.old_name, 42), s.new_name);
        }
        println!("\n  Letzte drei:");
        for s in plan.steps.iter().rev().take(3) {
            println!("    {:<44} → {}", super::truncate(&s.old_name, 42), s.new_name);
        }

        // Kein Zielname darf doppelt vorkommen — sonst überschreibt der Lauf
        // sich selbst (er bricht zwar ab, aber das wäre ein halbes Ergebnis).
        let mut namen: Vec<&str> = plan.steps.iter().map(|s| s.new_name.as_str()).collect();
        namen.sort();
        let vorher = namen.len();
        namen.dedup();
        println!("\n  Zielnamen eindeutig:      {}", if namen.len() == vorher { "ja" } else { "NEIN" });
        assert_eq!(namen.len(), vorher, "doppelte Zielnamen im Plan");
        println!("─────────────────────────────────────────────\n");
    }

    /// Geparkt wird nur, was der Befehl SELBST nachgeprüft hat. Die Liste aus
    /// der Oberfläche ist ein Vorschlag — zwischen Abgleich und Klick können
    /// Minuten liegen, und in der Zeit kann sich ein Ordner geändert haben.
    #[test]
    fn parken_prueft_selbst_nach_und_verschiebt_nur_das_geprueffte() {
        let tmp = std::env::temp_dir().join(format!("beatos_park_{}", std::process::id()));
        let prod = tmp.join("PROD");
        let archiv = tmp.join("ARCHIV/2026/05_MAY");
        let park = tmp.join("_ARCHIVIERT");

        // Vollständig archiviert: darf geparkt werden
        let fertig = prod.join("Project_1");
        std::fs::create_dir_all(&fertig).unwrap();
        std::fs::write(fertig.join("GOODBYES.mp3"), b"audio").unwrap();
        std::fs::write(fertig.join("Project_1.flp"), b"projekt").unwrap();
        let a1 = archiv.join("0897 - GOODBYES [F#m 130]/01_AUDIO");
        std::fs::create_dir_all(&a1).unwrap();
        std::fs::write(a1.join("GOODBYES.mp3"), b"audio").unwrap();
        std::fs::write(a1.join("Project_1.flp"), b"projekt").unwrap();

        // Archiviert, aber die Arbeits-FLP fehlt dort: darf NICHT geparkt werden
        let unfertig = prod.join("Project_2");
        std::fs::create_dir_all(&unfertig).unwrap();
        std::fs::write(unfertig.join("HOLLOW.mp3"), b"audio2").unwrap();
        std::fs::write(unfertig.join("Project_2.flp"), b"NUR HIER").unwrap();
        let a2 = archiv.join("0895 - HOLLOW [Fm 159]/01_AUDIO");
        std::fs::create_dir_all(&a2).unwrap();
        std::fs::write(a2.join("HOLLOW.mp3"), b"audio2").unwrap();

        let report = super::park_blocking(
            &[
                fertig.to_string_lossy().to_string(),
                unfertig.to_string_lossy().to_string(),
            ],
            tmp.join("ARCHIV").to_string_lossy().as_ref(),
            park.to_string_lossy().as_ref(),
        )
        .unwrap();

        assert_eq!(report.moved, 1, "nur der vollständige zieht um");
        assert_eq!(report.skipped.len(), 1);
        assert_eq!(report.skipped[0].name, "Project_2");
        assert!(report.skipped[0].reason.contains("fehlen im Archiv"), "{:?}", report.skipped[0]);

        // Der geprüfte liegt im Parkordner, der andere unangetastet in PROD
        assert!(park.join("Project_1").is_dir(), "Project_1 sollte geparkt sein");
        assert!(!fertig.exists(), "Project_1 darf nicht mehr in PROD liegen");
        assert!(unfertig.join("Project_2.flp").is_file(), "Project_2 bleibt vollständig liegen");

        // Nichts gelöscht: die Datei ist mitgezogen, nicht verschwunden
        assert_eq!(
            std::fs::read(park.join("Project_1/Project_1.flp")).unwrap(),
            b"projekt"
        );

        std::fs::remove_dir_all(&tmp).ok();
    }

    /// Ein Parkordner innerhalb eines Projekts wäre ein Rekursionsunfall.
    #[test]
    fn parkordner_darf_nicht_im_projekt_liegen() {
        let tmp = std::env::temp_dir().join(format!("beatos_parkbad_{}", std::process::id()));
        let proj = tmp.join("PROD/Project_1");
        std::fs::create_dir_all(&proj).unwrap();

        let err = super::park_blocking(
            &[proj.to_string_lossy().to_string()],
            tmp.join("ARCHIV").to_string_lossy().as_ref(),
            proj.join("_ARCHIVIERT").to_string_lossy().as_ref(),
        )
        .unwrap_err();
        assert!(err.contains("liegt im Projekt"), "{}", err);

        // Eine Ebene höher ist genauso falsch: der Elternordner eines Projekts
        // IST der Produktions-Root, und ein Parkordner darin wird beim nächsten
        // Scan zu einem Projekt mit allem Geparkten darin. Passiert mit einem
        // Pfad, der auf „\" endet — dann schneidet der Dialog den falschen
        // Abschnitt ab.
        let err = super::park_blocking(
            &[proj.to_string_lossy().to_string()],
            tmp.join("ARCHIV").to_string_lossy().as_ref(),
            tmp.join("PROD/_ARCHIVIERT").to_string_lossy().as_ref(),
        )
        .unwrap_err();
        assert!(err.contains("liegt im Produktions-Ordner"), "{}", err);

        std::fs::remove_dir_all(&tmp).ok();
    }

    /// Vollständig archivierte Ordner sollen keine Nummer verbrauchen. Der
    /// Ausschluss muss deshalb VOR der Vergabe greifen — sonst bliebe eine
    /// Lücke, und genau die wollte man vermeiden.
    #[test]
    fn ausgeschlossene_ordner_verbrauchen_keine_nummer() {
        let tmp = std::env::temp_dir().join(format!("beatos_excl_{}", std::process::id()));
        let target = tmp.join("PROD");
        std::fs::create_dir_all(&target).unwrap();

        make_project(&target.join("Project_1"), "a.flp", 400); // ältester
        make_project(&target.join("Project_2"), "b.flp", 300); // wird ausgenommen
        make_project(&target.join("Project_3"), "c.flp", 200);
        make_project(&target.join("Project_4"), "d.flp", 100); // jüngster

        let plan = super::plan_production_merge(
            vec![target.to_string_lossy().to_string()],
            target.to_string_lossy().to_string(),
            vec![target.join("Project_2").to_string_lossy().to_string()],
        )
        .unwrap();

        let namen: Vec<(&str, &str)> = plan
            .steps
            .iter()
            .map(|s| (s.old_name.as_str(), s.new_name.as_str()))
            .collect();
        assert_eq!(
            namen,
            vec![
                ("Project_1", "P0001"),
                ("Project_3", "P0002"),
                ("Project_4", "P0003"),
            ],
            "lückenlos durchnummeriert, der ausgenommene zählt nicht mit"
        );

        let raus = plan.skipped.iter().find(|s| s.name == "Project_2").unwrap();
        assert_eq!(raus.reason, "vollständig archiviert");

        // Schreibweise des Pfads darf keine Rolle spielen — sonst greift der
        // Ausschluss auf Windows still nicht.
        let plan2 = super::plan_production_merge(
            vec![target.to_string_lossy().to_string()],
            target.to_string_lossy().to_string(),
            vec![target.join("PROJECT_2").to_string_lossy().to_string().replace('\\', "/")],
        )
        .unwrap();
        assert_eq!(plan2.steps.len(), 3, "Groß/Klein und Schrägstriche egal");

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    /// Ein Protokoll wird zum Eintrag in der Läufe-Liste. Entscheidend ist
    /// `present`: nur was heute noch am Zielort liegt, lässt sich zurückdrehen.
    /// Ein bereits rückgängig gemachter Lauf muss sich selbst als leer melden.
    #[test]
    fn vergangener_lauf_meldet_wie_viel_davon_noch_steht() {
        let root = std::env::temp_dir().join(format!("beatos_runs_{}", std::process::id()));
        let ziel = root.join("PROD");
        std::fs::create_dir_all(&ziel).unwrap();
        // Zwei von drei Zielordnern liegen noch da
        std::fs::create_dir_all(ziel.join("Project_0001")).unwrap();
        std::fs::create_dir_all(ziel.join("Project_0002")).unwrap();

        let schritt = |n: &str| MergeStep {
            from: root.join("ALT").join(n).to_string_lossy().to_string(),
            to: ziel.join(n).to_string_lossy().to_string(),
            old_name: n.to_string(),
            new_name: n.to_string(),
            date: None,
        };
        let steps = vec![schritt("Project_0001"), schritt("Project_0002"), schritt("Project_0003")];

        let log = root.join("merge_2026-08-30_1756512345.json");
        std::fs::write(&log, serde_json::to_string_pretty(&steps).unwrap()).unwrap();

        let run = super::read_merge_run(&log, "merge_2026-08-30_1756512345.json").unwrap();
        assert_eq!(run.date, "2026-08-30");
        assert_eq!(run.steps, 3);
        assert_eq!(run.present, 2, "nur zwei Zielordner existieren noch");
        assert_eq!(run.target, ziel.to_string_lossy().to_string());

        // Nach einem Rückgängig ist nichts mehr am Zielort — der Eintrag
        // bleibt sichtbar, meldet aber ehrlich 0.
        std::fs::remove_dir_all(ziel.join("Project_0001")).unwrap();
        std::fs::remove_dir_all(ziel.join("Project_0002")).unwrap();
        let run = super::read_merge_run(&log, "merge_2026-08-30_1756512345.json").unwrap();
        assert_eq!(run.present, 0);

        // Kaputte oder leere Protokolle tauchen gar nicht erst auf
        let leer = root.join("merge_2026-01-01_1.json");
        std::fs::write(&leer, "[]").unwrap();
        assert!(super::read_merge_run(&leer, "merge_2026-01-01_1.json").is_none());
        let kaputt = root.join("merge_2026-01-02_2.json");
        std::fs::write(&kaputt, "kein json").unwrap();
        assert!(super::read_merge_run(&kaputt, "merge_2026-01-02_2.json").is_none());

        std::fs::remove_dir_all(&root).ok();
    }

    /// Die Liste im Zielordner ist die Aufzeichnung, die ohne App, ohne
    /// Datenbank und ohne Protokolldatei lesbar bleibt.
    #[test]
    fn lesbare_liste_landet_im_zielordner() {
        let dir = std::env::temp_dir().join(format!("beatos_summary_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();

        let done = vec![
            MergeStep {
                from: "C:\\ALT\\[701] One Sided Love - 125 Cm".into(),
                to: "C:\\PROD\\Project_0001 - One Sided Love - 125 Cm".into(),
                old_name: "[701] One Sided Love - 125 Cm".into(),
                new_name: "Project_0001 - One Sided Love - 125 Cm".into(),
                date: Some("2024-08-01".into()),
            },
            MergeStep {
                from: "C:\\PROD\\Project_242".into(),
                to: "C:\\PROD\\Project_0002".into(),
                old_name: "Project_242".into(),
                new_name: "Project_0002".into(),
                date: None,
            },
        ];

        let path = super::write_merge_summary(&dir, &done, "zusammengeführt").expect("Liste muss geschrieben werden");
        let text = std::fs::read_to_string(&path).unwrap();

        // Beide Zuordnungen müssen drinstehen — das ist der ganze Zweck
        assert!(text.contains("[701] One Sided Love - 125 Cm"), "alter Name fehlt:\n{}", text);
        assert!(text.contains("Project_0001 - One Sided Love - 125 Cm"), "neuer Name fehlt");
        assert!(text.contains("Project_242"));
        assert!(text.contains("Project_0002"));
        // Der Unterstrich sortiert die Datei im Explorer nach oben
        assert!(
            std::path::Path::new(&path).file_name().unwrap().to_string_lossy().starts_with("_beatos-umbenannt_"),
            "unerwarteter Dateiname: {}",
            path
        );

        // Ohne Schritte gibt es nichts zu dokumentieren
        assert!(super::write_merge_summary(&dir, &[], "zusammengeführt").is_none());

        std::fs::remove_dir_all(&dir).ok();
    }

    /// Sehr lange Ordnernamen dürfen die Spalten nicht sprengen, aber auch
    /// nicht unkenntlich werden.
    #[test]
    fn lange_namen_werden_gekuerzt_nicht_verschluckt() {
        assert_eq!(super::truncate("kurz", 10), "kurz");
        let lang = "a".repeat(60);
        let gekuerzt = super::truncate(&lang, 10);
        assert_eq!(gekuerzt.chars().count(), 10);
        assert!(gekuerzt.ends_with('…'));
        // Umlaute zählen als ein Zeichen, nicht als zwei Bytes
        assert_eq!(super::truncate("äöüäöüäöüäöü", 5).chars().count(), 5);
    }

    /// Zwei Welten, dieselbe Nummer, verschiedene Beats — das muss auffallen,
    /// bevor irgendetwas verschoben wird.
    #[test]
    fn doppelt_vergebene_nummern_werden_gefunden() {
        let root = std::env::temp_dir().join(format!("beatos_dup_{}", std::process::id()));
        let alt = root.join("alt");
        let neu = root.join("neu");
        for d in [
            alt.join("[102] Irgendwas - 140 Am"),
            alt.join("Project_25"),
            neu.join("Project_0102 - MEMORIES"),
            neu.join("Project_0243"),
            neu.join("NO MORE RUNNING"),
        ] {
            std::fs::create_dir_all(&d).unwrap();
        }

        let paths = vec![
            alt.to_string_lossy().to_string(),
            neu.to_string_lossy().to_string(),
        ];
        let dups = duplicate_project_ids(&paths);

        // 102 gibt es zweimal, 25 und 243 je einmal, NO MORE RUNNING gar nicht
        assert_eq!(dups.len(), 1, "genau eine doppelte Nummer erwartet: {:?}", dups);
        assert_eq!(dups[0].0, 102);
        assert_eq!(dups[0].1.len(), 2);

        std::fs::remove_dir_all(&root).ok();
    }

    /// Ein Bild ohne "thumb" im Namen muss den Marker bekommen, sonst liest der
    /// Zielordner es als Cover zurück und der Thumbnail-Slot bleibt leer.
    #[test]
    fn thumbnail_bekommt_seinen_marker() {
        assert_eq!(ensure_slot_marker("MEMORIES.png", Some("thumbnail")), "MEMORIES_thumbnail.png");
        // Marker schon da (in jeder Schreibweise) → Name bleibt unangetastet
        assert_eq!(ensure_slot_marker("Art_Thumbnail.jpg", Some("thumbnail")), "Art_Thumbnail.jpg");
        // "thumb" reicht dem Upload-Tab nicht — er sucht "thumbnail"
        assert_eq!(ensure_slot_marker("art_thumb.jpg", Some("thumbnail")), "art_thumb_thumbnail.jpg");
        // Cover bekommt seinen Marker genauso, sonst sieht der Upload-Tab es nicht
        assert_eq!(ensure_slot_marker("MEMORIES.png", Some("cover")), "MEMORIES_cover.png");
        assert_eq!(ensure_slot_marker("X_Cover_2000x2000.png", Some("cover")), "X_Cover_2000x2000.png");
        assert_eq!(ensure_slot_marker("clip.mp4", Some("video")), "clip.mp4");
        assert_eq!(ensure_slot_marker("MEMORIES.png", None), "MEMORIES.png");
        // Datei ohne Endung
        assert_eq!(ensure_slot_marker("bild", Some("thumbnail")), "bild_thumbnail");
    }

    /// Eine nicht erreichbare Platte darf keine Notizen löschen.
    #[test]
    fn verwaist_ist_nur_was_unter_einem_lesbaren_root_fehlt() {
        let root = std::env::temp_dir().join(format!("beatos_orphan_{}", std::process::id()));
        let lebt = root.join("Project_0001");
        std::fs::create_dir_all(&lebt).unwrap();

        // Ordner weg, Root lesbar → Zeile darf weg
        assert!(is_orphan_row(&root.join("Project_0002")));
        // Ordner da (auch ohne FLP) → Zeile bleibt
        assert!(!is_orphan_row(&lebt));
        // Root nicht erreichbar (Platte ab, Pfad raus aus den Einstellungen)
        assert!(!is_orphan_row(&root.join("weg").join("Project_0003")));

        std::fs::remove_dir_all(&root).ok();
    }

    /// Die Stufe kommt aus den Dateien: MP3+WAV = exportiert, dazu Cover,
    /// Thumbnail und Video = bereit. Alles andere bleibt Idee.
    #[test]
    fn stufe_kommt_aus_den_dateien() {
        //        mp3    wav    cover  thumb  video   erwartet
        let faelle = [
            (false, false, false, false, false, "idea"),
            (true,  false, true,  true,  true,  "idea"),     // nur MP3 reicht nicht
            (false, true,  true,  true,  true,  "idea"),     // nur WAV auch nicht
            (true,  true,  false, false, false, "exported"),
            (true,  true,  true,  true,  false, "exported"), // Video fehlt
            (true,  true,  true,  false, true,  "exported"), // Thumbnail fehlt
            (true,  true,  false, true,  true,  "exported"), // Cover fehlt
            (true,  true,  true,  true,  true,  "ready"),
        ];
        for (mp3, wav, cover, thumb, video, erwartet) in faelle {
            assert_eq!(
                derive_stage(mp3, wav, cover, thumb, video),
                erwartet,
                "mp3={mp3} wav={wav} cover={cover} thumb={thumb} video={video}"
            );
        }
    }

    /// Von Hand gesetzt schlägt die Automatik — sonst überschreibt der
    /// Fokus-Scan „Überarbeiten" und „Kann weg" beim nächsten Fensterwechsel.
    #[test]
    fn handvergabe_ueberlebt_den_scan() {
        assert_eq!(resolve_status(Some("wip"), "ready"), "wip");
        assert_eq!(resolve_status(Some("discard"), "ready"), "discard");
        // Automatik-Werte werden neu gerechnet, auch abwärts
        assert_eq!(resolve_status(Some("ready"), "exported"), "exported");
        assert_eq!(resolve_status(Some("idea"), "ready"), "ready");
        assert_eq!(resolve_status(None, "exported"), "exported");
        // Alles, was nicht in MANUAL_STATUSES steht, gehört der Automatik
        assert!(STUDIO_STATUSES.iter().all(|s| is_manual_status(s) || resolve_status(Some(s), "idea") == "idea"));
    }

    /// Beim Umnummerieren tauschen Projekte ihre Namen — dabei darf keine
    /// Zeile verschwinden.
    #[test]
    fn repath_ueberlebt_den_namenstausch() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE studio_projects (
                path TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'idea',
                priority INTEGER NOT NULL DEFAULT 0, notes TEXT)",
            [],
        )
        .unwrap();
        // Artist-Songs, die diese Projekte als „Mein Beat" haben, ziehen mit
        conn.execute("CREATE TABLE artist_songs (path TEXT PRIMARY KEY, beat_id TEXT, projekt TEXT)", []).unwrap();
        for (p, n) in [(r"C:\P\Project_5", "alt"), (r"C:\P\Project_0005", "besetzt")] {
            conn.execute(
                "INSERT INTO studio_projects (path, notes) VALUES (?1, ?2)",
                rusqlite::params![p, n],
            )
            .unwrap();
            conn.execute("INSERT INTO artist_songs (path, projekt) VALUES (?1, ?2)", rusqlite::params![n, p]).unwrap();
        }

        let step = |from: &str, to: &str| MergeStep {
            from: from.to_string(),
            to: to.to_string(),
            old_name: String::new(),
            new_name: String::new(),
            date: None,
        };
        // Project_5 → Project_0005 und der bisherige Project_0005 → Project_0012
        repath_studio_rows(
            &mut conn,
            &[
                step(r"C:\P\Project_5", r"C:\P\Project_0005"),
                step(r"C:\P\Project_0005", r"C:\P\Project_0012"),
            ],
        )
        .unwrap();

        let notiz = |p: &str| -> Option<String> {
            conn.query_row(
                "SELECT notes FROM studio_projects WHERE path = ?1",
                rusqlite::params![p],
                |r| r.get(0),
            )
            .ok()
        };
        assert_eq!(notiz(r"C:\P\Project_0005").as_deref(), Some("alt"));
        assert_eq!(notiz(r"C:\P\Project_0012").as_deref(), Some("besetzt"), "Zeile nicht verschluckt");
        let anzahl: i64 = conn
            .query_row("SELECT COUNT(*) FROM studio_projects", [], |r| r.get(0))
            .unwrap();
        assert_eq!(anzahl, 2);

        let projekt = |song: &str| -> Option<String> {
            conn.query_row("SELECT projekt FROM artist_songs WHERE path = ?1", [song], |r| r.get(0)).unwrap()
        };
        assert_eq!(projekt("alt").as_deref(), Some(r"C:\P\Project_0005"));
        assert_eq!(projekt("besetzt").as_deref(), Some(r"C:\P\Project_0012"), "Verknüpfungen nicht vertauscht");
        // Archiviert: aus dem Projekt wird der Katalog-Beat
        crate::commands::artists::projekt_ist_beat(&conn, r"c:\p\project_0012", "B0404").unwrap();
        let beat: Option<String> = conn.query_row("SELECT beat_id FROM artist_songs WHERE path = 'besetzt'", [], |r| r.get(0)).unwrap();
        assert_eq!((beat.as_deref(), projekt("besetzt")), (Some("B0404"), None));
    }


    #[test]
    fn liest_die_arbeitszeit_aus_der_flp() {
        // Header, dann ein paar Events — darunter wie in FL 2026 eins, das ein
        // Event-Leser falsch zählt (0xac + 3 Bytes) — und Event 237
        let mut b = b"FLhd".to_vec();
        b.extend(6u32.to_le_bytes());
        b.extend([0u8; 6]);
        b.extend(b"FLdt");
        b.extend(0u32.to_le_bytes());
        b.extend([9, 1, 0xac, 1, 1, 0]);
        b.extend([199, 3, b'a', b'b', b'c']);
        b.push(237);
        b.push(16);
        b.extend(45000.0f64.to_le_bytes());
        b.extend((90.0f64 / 1440.0).to_le_bytes()); // 90 Minuten
        assert_eq!(flp_work_minutes_from(&b), Some(90));
        assert_eq!(flp_work_minutes_from(b"keine flp"), None);
        assert_eq!(flp_work_minutes_from(&b[..b.len() - 4]), None, "abgeschnitten");
    }

    #[test]
    fn detects_flp_project_with_assets() {
        let tmp = std::env::temp_dir().join(format!("beatos_studio_test_{}", std::process::id()));
        let proj = tmp.join("MEMORIES [156 Fm]");
        let save = proj.join("01_SAVEFILES");
        std::fs::create_dir_all(&save).unwrap();
        std::fs::write(save.join("memories_v3.FLP"), b"flp").unwrap();
        std::fs::write(proj.join("MEMORIES [156 Fm].mp3"), b"mp3").unwrap();
        std::fs::write(proj.join("MEMORIES_Cover.png"), b"png").unwrap();
        std::fs::write(proj.join("MEMORIES_Thumbnail.png"), b"png").unwrap();

        let p = scan_project_dir(&proj, "root").expect("project detected");
        assert_eq!(p.parsed_name, "MEMORIES");
        assert_eq!(p.key.as_deref(), Some("Fm"));
        assert_eq!(p.bpm, Some(156));
        assert!(p.has_mp3 && !p.has_wav);
        assert!(p.has_cover && p.has_thumbnail && !p.has_video);
        assert_eq!(p.flp_count, 1);
        assert!(p.newest_flp.as_deref().unwrap().to_lowercase().ends_with(".flp"));
        assert_eq!(p.flps.len(), 1);
        assert_eq!(p.flps[0].name.to_lowercase(), "memories_v3.flp");

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn song_name_comes_from_export_and_fills_key_bpm() {
        let tmp = std::env::temp_dir().join(format!("beatos_studio_song_{}", std::process::id()));
        // Folder name carries no title info — the export does.
        let proj = tmp.join("project_187");
        std::fs::create_dir_all(&proj).unwrap();
        std::fs::write(proj.join("session.flp"), b"flp").unwrap();
        std::fs::write(proj.join("MEMORIES [156 Fm]_tagged.mp3"), b"mp3").unwrap();

        let p = scan_project_dir(&proj, "root").expect("project detected");
        assert_eq!(p.song_name.as_deref(), Some("MEMORIES"));
        assert_eq!(p.key.as_deref(), Some("Fm"), "Key aus dem Dateinamen");
        assert_eq!(p.bpm, Some(156), "BPM aus dem Dateinamen");
        assert_eq!(p.parsed_name, "project_187", "Ordnername bleibt erhalten");

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn folder_key_bpm_wins_over_export_and_mp3_wins_over_wav() {
        let tmp = std::env::temp_dir().join(format!("beatos_studio_song2_{}", std::process::id()));
        let proj = tmp.join("0042 - DRIFT [Am 140]");
        std::fs::create_dir_all(&proj).unwrap();
        std::fs::write(proj.join("session.flp"), b"flp").unwrap();
        std::fs::write(proj.join("OLD NAME [90 Cm].wav"), b"wav").unwrap();
        std::fs::write(proj.join("DRIFT FINAL [140 Am].mp3"), b"mp3").unwrap();

        let p = scan_project_dir(&proj, "root").expect("project detected");
        assert_eq!(p.song_name.as_deref(), Some("DRIFT FINAL"), "MP3 schlägt WAV");
        assert_eq!(p.key.as_deref(), Some("Am"));
        assert_eq!(p.bpm, Some(140));

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn no_export_means_no_song_name() {
        let tmp = std::env::temp_dir().join(format!("beatos_studio_song3_{}", std::process::id()));
        let proj = tmp.join("Skizze");
        std::fs::create_dir_all(&proj).unwrap();
        std::fs::write(proj.join("session.flp"), b"flp").unwrap();

        let p = scan_project_dir(&proj, "root").expect("project detected");
        assert!(p.song_name.is_none());

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn backup_folder_flps_are_ignored() {
        let tmp = std::env::temp_dir().join(format!("beatos_studio_backup_{}", std::process::id()));
        let proj = tmp.join("DRIFT [140 Am]");
        let backup = proj.join("Backup");
        std::fs::create_dir_all(&backup).unwrap();
        std::fs::write(proj.join("drift_v2.flp"), b"flp").unwrap();
        // Autosave im Backup-Ordner — darf weder zählen noch "neueste" werden
        std::fs::write(backup.join("drift (autosaved at 12-34).flp"), b"flp").unwrap();

        let p = scan_project_dir(&proj, "root").expect("project detected");
        assert_eq!(p.flp_count, 1, "Backup-FLPs dürfen nicht mitzählen");
        assert!(p.newest_flp.as_deref().unwrap().ends_with("drift_v2.flp"));
        assert_eq!(p.flps.len(), 1);

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn folder_without_flp_is_not_a_project() {
        let tmp = std::env::temp_dir().join(format!("beatos_studio_test2_{}", std::process::id()));
        let proj = tmp.join("Nur Bilder");
        std::fs::create_dir_all(&proj).unwrap();
        std::fs::write(proj.join("cover.png"), b"png").unwrap();

        assert!(scan_project_dir(&proj, "root").is_none());

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn assign_asset_moves_with_collision_suffix() {
        let tmp = std::env::temp_dir().join(format!("beatos_assign_test_{}", std::process::id()));
        let inbox = tmp.join("inbox");
        let proj = tmp.join("proj");
        std::fs::create_dir_all(&inbox).unwrap();
        std::fs::create_dir_all(&proj).unwrap();
        std::fs::write(inbox.join("Cover.png"), b"neu").unwrap();
        std::fs::write(proj.join("Cover.png"), b"alt").unwrap(); // collision

        let dest = super::assign_asset_to_project(
            inbox.join("Cover.png").to_string_lossy().to_string(),
            inbox.to_string_lossy().to_string(),
            proj.to_string_lossy().to_string(),
            None,
        ).unwrap();

        assert!(dest.ends_with("Cover_2.png"), "got: {}", dest);
        assert!(!inbox.join("Cover.png").exists(), "source must be moved away");
        assert_eq!(std::fs::read(proj.join("Cover_2.png")).unwrap(), b"neu");
        assert_eq!(std::fs::read(proj.join("Cover.png")).unwrap(), b"alt");

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    /// Ersetzen: die alte Datei geht zurück in die Inbox, der andere Slot bleibt.
    #[test]
    fn assign_asset_ersetzt_und_bringt_alte_zurueck() {
        let tmp = std::env::temp_dir().join(format!("beatos_replace_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        let inbox = tmp.join("inbox");
        let proj = tmp.join("proj");
        std::fs::create_dir_all(&inbox).unwrap();
        std::fs::create_dir_all(&proj).unwrap();
        std::fs::write(proj.join("A_cover.png"), b"alt").unwrap();
        std::fs::write(proj.join("A_thumbnail.png"), b"thumb").unwrap();
        std::fs::write(proj.join("song.mp3"), b"audio").unwrap();
        std::fs::write(inbox.join("B.png"), b"neu").unwrap();

        let dest = super::assign_asset_to_project(
            inbox.join("B.png").to_string_lossy().to_string(),
            inbox.to_string_lossy().to_string(),
            proj.to_string_lossy().to_string(),
            Some("cover".into()),
        ).unwrap();

        assert!(dest.ends_with("B_cover.png"), "got: {}", dest);
        assert!(!proj.join("A_cover.png").exists(), "alte Datei muss raus");
        assert_eq!(std::fs::read(inbox.join("A_cover.png")).unwrap(), b"alt", "…und zurück in die Inbox");
        assert!(proj.join("A_thumbnail.png").exists(), "Thumbnail bleibt unberührt");
        assert!(proj.join("song.mp3").exists());
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn create_project_copies_template_and_refuses_duplicates() {
        let tmp = std::env::temp_dir().join(format!("beatos_create_proj_{}", std::process::id()));
        let root = tmp.join("root");
        std::fs::create_dir_all(&root).unwrap();
        let template = tmp.join("Template.flp");
        std::fs::write(&template, b"flp-bytes").unwrap();
        let alt = std::time::SystemTime::now() - std::time::Duration::from_secs(400 * 86_400);
        std::fs::File::options().write(true).open(&template).unwrap().set_modified(alt).unwrap();

        let flp = super::create_project_folder(
            root.to_string_lossy().to_string(),
            "  MEIN SONG: Teil 1  ".to_string(), // wird bereinigt und getrimmt
            template.to_string_lossy().to_string(),
        )
        .unwrap();

        let dir = root.join("MEIN SONG Teil 1");
        // FLP im Root wie bei jedem Studio-Projekt — kein 01_SAVEFILES
        assert_eq!(flp, dir.join("MEIN SONG Teil 1.flp").to_string_lossy());
        assert!(!dir.join("01_SAVEFILES").exists());
        assert_eq!(std::fs::read(&flp).unwrap(), b"flp-bytes");
        // Der Scan muss das neue Projekt sofort sehen
        let p = scan_project_dir(&dir, "root").unwrap();
        // Frisch datiert, nicht mit dem Alter der Vorlage
        let jetzt = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
        assert!(jetzt - p.modified_secs < 60);

        // Zweiter Anlauf mit demselben Namen darf nichts überschreiben
        let again = super::create_project_folder(
            root.to_string_lossy().to_string(),
            "MEIN SONG Teil 1".to_string(),
            template.to_string_lossy().to_string(),
        );
        assert!(again.is_err());

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn neues_erkennen_und_lose_flp_einordnen() {
        let tmp = std::env::temp_dir().join(format!("beatos_neues_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        let prod = tmp.join("prod");
        let samples = tmp.join("06_SAMPLES");
        for d in [prod.join("P0005"), prod.join("_IDEEN"), prod.join("dont cry 150 bm"), prod.join("leer"), samples.join("S0002 Alt"), samples.join("pads - x 140 am")] {
            std::fs::create_dir_all(d).unwrap();
        }
        std::fs::write(prod.join("dont cry 150 bm").join("dont cry 150 bm.flp"), b"x").unwrap();
        std::fs::write(prod.join("P0005").join("P0005.flp"), b"x").unwrap();
        std::fs::write(samples.join("pads - x 140 am").join("a.flp"), b"x").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(prod.join("no way 140 am.flp"), b"x").unwrap();
        std::fs::write(prod.join("no way 140 am.mp3"), b"x").unwrap();
        let roots = vec![prod.to_string_lossy().to_string()];

        let neu = super::neues_in(&prod, false, 5, &None);
        let kurz: Vec<_> = neu.iter().map(|n| format!("{} {} {}", n.nummer, n.titel, n.lose)).collect();
        assert_eq!(kurz, ["P0006 DONT CRY [150 Bmin] false", "P0007 NO WAY [140 Amin] true"]);
        let s = super::neues_in(&samples, true, 2, &None);
        assert_eq!(s.len(), 1);
        assert_eq!(format!("{} {}", s[0].nummer, s[0].titel), "S0003 PAD - X [140 Amin]");

        // FL zeigt das Projekt im Titel → gesperrt, sonst frei
        let fl = Some("dont cry 150 bm - fl studio 2024".to_string());
        assert!(super::neues_in(&prod, false, 5, &fl)[0].in_fl);
        assert!(super::neu_ziel(&roots, Some(&samples), &prod.join("dont cry 150 bm"), "x", &fl).is_err());
        let (ziel, name, _) = super::neu_ziel(&roots, Some(&samples), &prod.join("dont cry 150 bm"), "dont cry 151 bm", &None).unwrap();
        assert_eq!(name, "P0006 - DONT CRY [151 Bmin]");
        assert_eq!(ziel, prod.join("P0006 - DONT CRY [151 Bmin]"));
        assert!(super::neu_ziel(&roots, Some(&samples), &tmp.join("woanders"), "x", &None).is_err());

        // Lose FLP: neuer Ordner, FLP heißt wie er, MP3 zieht mit
        let flp = prod.join("no way 140 am.flp");
        let (ziel, name, alt) = super::neu_ziel(&roots, Some(&samples), &flp, "no way 140 am", &None).unwrap();
        super::lose_flp_einordnen(&flp, &ziel, &name, &alt).unwrap();
        assert!(ziel.join("P0006 - NO WAY [140 Amin].flp").is_file());
        assert!(ziel.join("no way 140 am.mp3").is_file());
        assert!(!flp.exists());

        // Exporte heißen danach wie der Titel: WAV _untagged, MP3 _tagged; Fremdes bleibt
        for n in ["no way - am 140.wav", "STEM - Drums.wav", "no way 140 am_v2.wav", "hook.wav"] { std::fs::write(ziel.join(n), b"x").unwrap(); }
        super::exporte_benennen(&ziel, &alt, "NO WAY [140 Amin]", 0);
        for n in ["NO WAY [140 Amin]_tagged.mp3", "NO WAY [140 Amin]_untagged.wav", "STEM - Drums.wav", "no way 140 am_v2.wav", "hook.wav"] {
            assert!(ziel.join(n).is_file(), "{}", n);
        }
        assert!(!ziel.join("no way 140 am.mp3").exists());
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn spur_name_auch_mit_titel_vorn() {
        let t = "NO MORE TIME [160 Emaj]";
        assert_eq!(super::spur_name("NO MORE TIME - Piano", t, t), "KEYS - NO MORE TIME [160 Emaj]");
        assert_eq!(super::spur_name("Keys - runaway - Dm 158", "RUNAWAY [158 Dmin]", "RUNAWAY [158 Dmin]"), "KEYS - RUNAWAY [158 Dmin]");
    }

    #[test]
    fn lose_sample_flp_nimmt_ihre_spuren_mit() {
        let tmp = std::env::temp_dir().join(format!("beatos_sflp_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        let samples = tmp.join("06_SAMPLES");
        std::fs::create_dir_all(samples.join("S0044 - ALT")).unwrap();
        for n in ["gtr - sunrise - f#m 132.wav", "gtr - sunrise - f#m 132_raw.wav", "gtr - sunrise - f#m 132.mid", "pad - anderes 120 am.wav"] {
            std::fs::write(samples.join(n), b"x").unwrap();
        }
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(samples.join("sunrise - f#m 132.flp"), b"x").unwrap();

        let s = super::neues_in(&samples, true, 44, &None);
        let mut kurz: Vec<_> = s.iter().map(|n| n.titel.clone()).collect();
        kurz.sort();
        assert_eq!(kurz, ["ANDERES [120 Amin]", "SUNRISE [132 F#min]"], "Sunrise ist eine Zeile");
        let sunrise = s.iter().find(|n| n.titel.starts_with("SUNRISE")).unwrap();
        assert_eq!(sunrise.dateien, ["gtr - sunrise - f#m 132.mid", "gtr - sunrise - f#m 132.wav", "gtr - sunrise - f#m 132_raw.wav", "sunrise - f#m 132.flp"]);
        assert_eq!(s.iter().find(|n| n.titel.starts_with("ANDERES")).unwrap().dateien, ["pad - anderes 120 am.wav"]);

        let flp = samples.join("sunrise - f#m 132.flp");
        let ziel = std::path::PathBuf::from(super::neu_uebernehmen_in(&[], Some(&samples), &flp, "sunrise - f#m 132", &None).unwrap());
        assert_eq!(ziel, samples.join("S0045 - SUNRISE [132 F#min]"));
        for n in ["S0045 - SUNRISE [132 F#min].flp", "GTR - SUNRISE [132 F#min].wav", "GTR - SUNRISE [132 F#min]_raw.wav", "GTR - SUNRISE [132 F#min].mid"] {
            assert!(ziel.join(n).is_file(), "{}", n);
        }
        assert!(samples.join("pad - anderes 120 am.wav").is_file(), "fremde Spur bleibt");
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn sample_aus_losen_spuren_zaehlt_ohne_flp() {
        let tmp = std::env::temp_dir().join(format!("beatos_ohneflp_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        let s = tmp.join("S0044 - IM NOT READY [130 F#min]");
        std::fs::create_dir_all(&s).unwrap();
        std::fs::create_dir_all(tmp.join("S0045 - LEER")).unwrap();
        std::fs::write(s.join("PAD - IM NOT READY [130 F#min].wav"), "x").unwrap();
        assert!(scan_project_dir(&s, "").is_none(), "Projekte brauchen weiter eine FLP");
        let p = super::scan_dir(&s, "", true).expect("Sample ohne FLP");
        assert!(p.newest_flp.is_none() && p.bpm.is_some_and(|b| b as i64 == 130) && p.has_wav);
        assert!(super::scan_dir(&tmp.join("S0045 - LEER"), "", true).is_none());
        std::fs::write(tmp.join("S0045 - LEER").join("LEAD.mid"), "x").unwrap();
        assert!(super::scan_dir(&tmp.join("S0045 - LEER"), "", true).is_some(), "nur MIDI zählt auch");
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn stems_im_ordner_bekommen_spur_und_titel() {
        let tmp = std::env::temp_dir().join(format!("beatos_stems_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        let p = tmp.join("P0776 - IM NOT READY [130 F#min]");
        let stems = p.join("Stems");
        std::fs::create_dir_all(&stems).unwrap();
        // FL: getippter Name + `_` + Mixerspur; dazu ein alter `STEM - x` im Root und der Export
        for f in ["Stems/im not ready_Drums.wav", "Stems/im not ready_808 Sub.wav", "Stems/im not ready_Master.wav",
                  "STEM - Melody.wav", "IM NOT READY [130 F#min]_untagged.wav"] {
            std::fs::write(p.join(f), b"x").unwrap();
        }
        assert_eq!(super::stems_benennen(&p, 3600), 0, "frisch exportiert: noch nichts anfassen");
        assert_eq!(super::stems_benennen(&p, 0), 4);
        for f in ["DRUMS", "808 SUB", "MASTER", "MELODY"] {
            assert!(stems.join(format!("{} - IM NOT READY [130 F#min]_stem.wav", f)).is_file(), "{}", f);
        }
        assert!(p.join("IM NOT READY [130 F#min]_untagged.wav").is_file());
        assert_eq!(super::stems_benennen(&p, 0), 0, "zweimal: nichts mehr zu tun");

        // Neu aus FL exportiert (heißt wie die FLP): bekommt den Namen, die bisherige WAV eine Nummer
        let t = "IM NOT READY [130 F#min]";
        std::fs::write(p.join(format!("P0776 - {t}.flp")), b"x").unwrap();
        let alt = std::fs::File::options().write(true).open(p.join(format!("{t}_untagged.wav"))).unwrap();
        alt.set_modified(std::time::SystemTime::now() - std::time::Duration::from_secs(3600)).unwrap();
        for f in [format!("P0776 - {t}.wav"), format!("P0776 - {t}.mp3"), "im not ready 130 f#m_mix.wav".into(), "fremd.wav".into()] {
            std::fs::write(p.join(f), b"neu").unwrap();
        }
        super::exporte_benennen(&p, t, t, 3600);
        assert!(p.join(format!("P0776 - {t}.wav")).is_file(), "frisch: noch nichts anfassen");
        super::exporte_benennen(&p, t, t, 0);
        assert_eq!(std::fs::read(p.join(format!("{t}_untagged.wav"))).unwrap(), b"neu");
        for f in [format!("{t}_untagged_2.wav"), format!("{t}_tagged.mp3"), format!("{t}_mix.wav"), "fremd.wav".into()] {
            assert!(p.join(&f).is_file(), "{}", f);
        }
        // Ohne Titel im Ordnernamen wird nichts benannt
        let ohne = tmp.join("P0777");
        std::fs::create_dir_all(ohne.join("Stems")).unwrap();
        std::fs::write(ohne.join("Stems/x_Drums.wav"), b"x").unwrap();
        assert_eq!(super::stems_benennen(&ohne, 0), 0);
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn midi_noten_mit_start_laenge_tonhoehe() {
        // Eine Spur, 96 Ticks je Viertel: C4 von 0 bis 96, E4 von 96 bis 144 (Ende per NoteOn vel 0)
        let mut m = b"MThd\x00\x00\x00\x06\x00\x00\x00\x01\x00\x60MTrk\x00\x00\x00\x14".to_vec();
        m[21] = 0x1A; // Spurlänge mit Tempo-Event
        m.extend([0x00, 0xFF, 0x51, 0x03, 0x06, 0x1A, 0x80]); // 400 000 µs je Viertel = 150 BPM
        m.extend([0x00, 0x90, 60, 100, 0x60, 0x80, 60, 0, 0x00, 0x90, 64, 100, 0x30, 0x90, 64, 0, 0x00, 0xFF, 0x2F, 0x00]);
        let v = super::noten_aus_midi(&m);
        assert_eq!(v.noten, [[0, 96, 60], [96, 48, 64]]);
        assert_eq!((v.ppq, v.bpm), (96, Some(150.0)));
        assert!(super::noten_aus_midi(b"kaputt").noten.is_empty());
        // FL schreibt das Tempo roh ins Event (Stephans KEYS LEAD: ff 51 03 00 00 91)
        assert_eq!(super::tempo_aus_midi(0x91), Some(145.0));
        assert_eq!(super::tempo_aus_midi(5), None);
    }

    #[test]
    fn beat_aus_sample_kopiert_die_wavs_nach_audio() {
        let tmp = std::env::temp_dir().join(format!("beatos_beat_aus_sample_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        let sample = tmp.join("S0041 - NO ROOM [145 F#min]");
        std::fs::create_dir_all(tmp.join("Produktion")).unwrap();
        std::fs::create_dir_all(&sample).unwrap();
        for f in ["BASS - NO ROOM [145 F#min].wav", "BASS - NO ROOM [145 F#min].mid", "NO ROOM [145 F#min].wav", "NO ROOM [145 F#min].mp3", "S0041.flp"] {
            std::fs::write(sample.join(f), b"x").unwrap();
        }
        std::fs::write(tmp.join("Beat.flp"), b"flp").unwrap();
        let roots = vec![tmp.join("Produktion").to_string_lossy().to_string()];
        let flp = super::beat_aus_sample_in(&roots, &sample, tmp.join("Beat.flp").to_string_lossy().to_string()).unwrap();
        let audio = std::path::Path::new(&flp).parent().unwrap().join("Audio");
        let mut drin: Vec<String> = std::fs::read_dir(&audio).unwrap().flatten().map(|e| e.file_name().to_string_lossy().to_string()).collect();
        drin.sort();
        assert_eq!(drin, ["BASS - NO ROOM [145 F#min].wav", "NO ROOM [145 F#min].wav"]);
        assert!(sample.join("NO ROOM [145 F#min].wav").is_file(), "das Sample bleibt, wie es ist");
        assert!(super::beat_aus_sample_in(&[], &sample, String::new()).is_err());
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn alte_samples_nachziehen_mit_vorschau() {
        let tmp = std::env::temp_dir().join(format!("beatos_nachziehen_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        let voll = tmp.join("S0039 - RUNAWAY [158 Dmin]");
        let ohne = tmp.join("S0033 - MORNING SUN");
        for (o, dateien) in [(&voll, &["bass-guitar - runaway - Dm 158.wav", "runaway - Dm 158.wav", "S0039 - RUNAWAY [158 Dmin].flp"][..]), (&ohne, &["loop.wav"][..])] {
            std::fs::create_dir_all(o).unwrap();
            for f in dateien { std::fs::write(o.join(f), b"x").unwrap(); }
        }
        let root = tmp.to_string_lossy().to_string();
        let ordner = "S0039 - RUNAWAY [158 Dmin]".to_string();
        let soll = vec![
            [ordner.clone(), "bass-guitar - runaway - Dm 158.wav".into(), "GTR BASS - RUNAWAY [158 Dmin].wav".into()],
            [ordner.clone(), "runaway - Dm 158.wav".into(), "RUNAWAY [158 Dmin].wav".into()],
        ];
        let mut vorschau = super::samples_nachziehen(root.clone(), false);
        vorschau.sort();
        assert_eq!(vorschau, soll);
        assert!(voll.join("runaway - Dm 158.wav").is_file(), "Vorschau benennt nichts um");

        assert_eq!(super::samples_nachziehen(root.clone(), true).len(), 2);
        assert!(voll.join("GTR BASS - RUNAWAY [158 Dmin].wav").is_file());
        assert!(voll.join("RUNAWAY [158 Dmin].wav").is_file());
        assert!(voll.join("S0039 - RUNAWAY [158 Dmin].flp").is_file());
        assert!(ohne.join("loop.wav").is_file(), "ohne Tempo und Tonart bleibt alles");
        assert!(super::samples_nachziehen(root, false).is_empty());
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn midi_transponieren_und_takte_ausschneiden() {
        // 96 Ticks je Viertel, ein Takt = 384. C in Takt 1, E von Takt 2 bis in Takt 3, G in Takt 3
        let mut m = b"MThd       `MTrk    ".to_vec();
        let spur = [
            0x00, 0x90, 60, 100, 0x60, 0x80, 60, 0,       // C: 0..96
            0x82, 0x20, 0x90, 64, 100,                    // E ab 384
            0x83, 0x00, 0x90, 67, 100,                    // G ab 768
            0x60, 0x80, 64, 0, 0x00, 0x80, 67, 0,         // beide enden bei 864
            0x00, 0xFF, 0x2F, 0x00,
        ];
        m[21] = spur.len() as u8;
        m.extend(spur);
        assert_eq!(super::noten_aus_midi(&m).noten, [[0, 96, 60], [384, 480, 64], [768, 96, 67]]);

        let hoeher = super::midi_umbauen(&m, 3, None).unwrap();
        assert_eq!(super::noten_aus_midi(&hoeher).noten, [[0, 96, 63], [384, 480, 67], [768, 96, 70]]);

        // Nur Takt 2: das E beginnt bei 0 und endet an der Taktgrenze, C und G fehlen
        let takt2 = super::midi_umbauen(&m, 0, Some((1, 2))).unwrap();
        assert_eq!(super::noten_aus_midi(&takt2).noten, [[0, 384, 64]]);
        assert!(super::midi_umbauen(b"kaputt", 0, None).is_err());
    }

    #[test]
    fn lose_spuren_und_spurnamen_im_sample() {
        let tmp = std::env::temp_dir().join(format!("beatos_spuren_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        let samples = tmp.join("06_SAMPLES");
        let ordner = samples.join("S0040 - NO ROOM FOR EMOTIONS [145 F#min]");
        std::fs::create_dir_all(&ordner).unwrap();
        for f in ["Bass-GTR - Blue Hour - 150 bm.wav", "Nylon-Gtr - blue hour - 150 bm.wav", "bell - GHOST TOWN - G#m 127 .wav", "Metal-Sample_1.mp3", "notiz.txt"] {
            std::fs::write(samples.join(f), b"x").unwrap();
        }
        for f in ["keys lead.wav", "keys lead.mid", "bass.wav", "NO ROOM FOR EMOTIONS - 145 F#m.wav", "NO ROOM FOR EMOTIONS - 145 F#m.flp"] {
            std::fs::write(ordner.join(f), b"x").unwrap();
        }

        // Eine Zeile je Titel, mit Anzahl
        let neu = super::neues_in(&samples, true, 40, &None);
        let mut kurz: Vec<_> = neu.iter().map(|n| format!("{} {}", n.titel, n.spuren)).collect();
        kurz.sort();
        assert_eq!(kurz, ["BLUE HOUR [150 Bmin] 2", "GHOST TOWN [127 G#min] 1", "METAL-SAMPLE 1"]);
        // Frisch geschrieben: nichts geht von selbst. Ohne Tempo und Tonart nie.
        assert!(neu.iter().all(|n| !n.fertig));
        assert!(super::komplett("BLUE HOUR [150 Bmin]"));
        assert!(!super::komplett("HIHAT [150]") && !super::komplett("METAL-SAMPLE") && !super::komplett("[150 Bmin]"));
        // Tempo aus der FLP, wenn keins im Namen steht (Event 156, Wert mal 1000)
        let mut flp = b"FLhd\x06\x00\x00\x00\x00\x00\x01\x00\x60\x00FLdt\x05\x00\x00\x00\x9c".to_vec();
        flp.extend(140_000u32.to_le_bytes());
        std::fs::write(samples.join("dont cry.flp"), &flp).unwrap();
        assert_eq!(super::mit_flp_tempo("DONT CRY_2".into(), &samples.join("dont cry.flp")), "DONT CRY [140]_2");
        assert_eq!(super::mit_flp_tempo("DONT CRY [150 Bmin]".into(), &samples.join("dont cry.flp")), "DONT CRY [150 Bmin]");
        std::fs::remove_file(samples.join("dont cry.flp")).unwrap();

        // Einordnen: beide Blue-Hour-Spuren in einen Ordner, voll benannt
        let ziel = samples.join("S0041 - BLUE HOUR [150 Bmin]");
        super::lose_spuren_einordnen(&samples.join("Nylon-Gtr - blue hour - 150 bm.wav"), &ziel, "BLUE HOUR [150 Bmin]").unwrap();
        assert!(ziel.join("GTR BASS - BLUE HOUR [150 Bmin].wav").is_file());
        assert!(ziel.join("GTR NYLON - BLUE HOUR [150 Bmin].wav").is_file());
        assert!(samples.join("bell - GHOST TOWN - G#m 127 .wav").is_file());

        // Spuren im Ordner: kurz exportiert, voll benannt; WAV und MIDI bleiben ein Paar
        let t = "NO ROOM FOR EMOTIONS [145 F#min]";
        super::spuren_benennen(&ordner, t, t);
        for f in ["KEYS LEAD - NO ROOM FOR EMOTIONS [145 F#min].wav", "KEYS LEAD - NO ROOM FOR EMOTIONS [145 F#min].mid",
                  "BASS - NO ROOM FOR EMOTIONS [145 F#min].wav", "NO ROOM FOR EMOTIONS [145 F#min].wav", "S0040 - NO ROOM FOR EMOTIONS [145 F#min].flp"] {
            assert!(ordner.join(f).is_file(), "{f}");
        }
        // Aufklappen: WAV und MIDI mit gleichem Namen sind eine Spur
        let sp = super::sample_spuren(ordner.to_string_lossy().to_string());
        assert_eq!(sp.len(), 3);
        assert_eq!(sp[1].name, "KEYS LEAD - NO ROOM FOR EMOTIONS [145 F#min]");
        assert!(sp[1].audio.as_deref().is_some_and(|a| a.ends_with(".wav")) && sp[1].midi.is_some());
        assert!(sp[0].midi.is_none());
        // Zweiter Lauf ändert nichts mehr
        super::spuren_benennen(&ordner, t, t);
        assert_eq!(std::fs::read_dir(&ordner).unwrap().count(), 5);
        assert_eq!(super::spur_name("GTR NYLON - BLUE HOUR [150 Bmin]_LEFT", "x", "BLUE HOUR [150 Bmin]"), "GTR NYLON - BLUE HOUR [150 Bmin]_LEFT");
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn fl_vorlagen_liest_jede_flp_je_typ() {
        let tmp = std::env::temp_dir().join(format!("beatos_vorlagen_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("Beat")).unwrap();
        std::fs::create_dir_all(tmp.join("Sample")).unwrap();
        std::fs::write(tmp.join("Beat").join("START_2.flp"), b"x").unwrap();
        std::fs::write(tmp.join("Beat").join("START.flp"), b"x").unwrap();
        std::fs::write(tmp.join("Beat").join("notiz.txt"), b"x").unwrap();
        std::fs::write(tmp.join("lose.flp"), b"x").unwrap(); // ohne Typ-Ordner: nicht im Menü
        let v = super::fl_vorlagen(tmp.to_string_lossy().to_string());
        let namen: Vec<_> = v.iter().map(|x| format!("{}/{}", x.ordner, x.name)).collect();
        assert_eq!(namen, ["Beat/START", "Beat/START_2"]);
        assert!(super::fl_vorlagen(tmp.join("fehlt").to_string_lossy().to_string()).is_empty());
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn create_sample_numbers_on_and_creates_root() {
        let tmp = std::env::temp_dir().join(format!("beatos_samples_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        let root = tmp.join("06_SAMPLES");
        let template = tmp.join("Sample.flp");
        std::fs::create_dir_all(&tmp).unwrap();
        std::fs::write(&template, b"flp-bytes").unwrap();
        let r = root.to_string_lossy().to_string();
        let t = template.to_string_lossy().to_string();

        // Ordner fehlt noch → wird angelegt, Nummer 1, ohne Namen
        let flp = super::create_sample(r.clone(), "  ".into(), t.clone()).unwrap();
        assert!(flp.ends_with("S0001.flp"));
        std::fs::create_dir_all(root.join("Stems")).unwrap();         // kein S mit Zahl
        std::fs::create_dir_all(root.join("S0009 Alt")).unwrap();
        let flp = super::create_sample(r, "Nachtzug".into(), t).unwrap();
        assert!(flp.ends_with("S0010 Nachtzug\\S0010 Nachtzug.flp") || flp.ends_with("S0010 Nachtzug/S0010 Nachtzug.flp"));

        // Projekt rüberschieben: nächste Nummer, gleichnamige FLP zieht mit, Export bleibt
        let projekt = tmp.join("prod").join("Project_0243");
        std::fs::create_dir_all(&projekt).unwrap();
        std::fs::write(projekt.join("Project_0243.flp"), b"flp").unwrap();
        std::fs::write(projekt.join("MEMORIES - [Am 140].wav"), b"wav").unwrap();
        let ziel = super::move_dir_to_samples(&projekt, &root.to_string_lossy(), "MEMORIES").unwrap();
        assert_eq!(ziel, root.join("S0011 MEMORIES"));
        assert!(!projekt.exists());
        assert!(ziel.join("S0011 MEMORIES.flp").is_file());
        assert!(ziel.join("MEMORIES - [Am 140].wav").is_file());
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn beat_benennen_ordnername_bleibt_beim_zweiten_mal_gleich() {
        let basis = super::beat_basisname("MEMORIES", Some("Am"), Some(140));
        assert_eq!(basis, "MEMORIES [140 Amin]");
        let einmal = super::beat_ordnername("Project_243", &basis);
        assert_eq!(einmal, "P0243 - MEMORIES [140 Amin]");
        assert_eq!(super::beat_ordnername(&einmal, &basis), einmal);
        assert_eq!(super::beat_ordnername("NO MORE RUNNING", "X [140]"), "X [140]");
        assert_eq!(super::beat_basisname("X", None, None), "X");
        assert_eq!(super::beat_basisname("X", Some("Cm"), None), "X [Cmin]");
    }

    #[test]
    fn beat_benennen_exporte_und_nur_neueste_flp() {
        use std::time::{Duration, SystemTime};
        let tmp = std::env::temp_dir().join(format!("beatos_benennen_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        let dir = tmp.join("Project_0796");
        std::fs::create_dir_all(&dir).unwrap();
        let schreibe = |name: &str, alter_h: u64| {
            let p = dir.join(name);
            std::fs::write(&p, b"FLhd").unwrap();
            let t = SystemTime::now() - Duration::from_secs(alter_h * 3600);
            std::fs::File::options().write(true).open(&p).unwrap().set_modified(t).unwrap();
        };
        schreibe("Project_797.flp", 1);
        schreibe("hook_v3.flp", 48);
        schreibe("bounce.mp3", 1);
        schreibe("alt.mp3", 24);
        schreibe("mix_untagged.wav", 1);
        schreibe("STEM - Drums.wav", 1);
        schreibe("demo_mix.wav", 1);
        schreibe("cover.png", 1);

        let plan = super::plan_rename(&dir, "MEMORIES", Some("Am"), Some(140)).unwrap();
        assert_eq!(plan.folder_to, "P0796 - MEMORIES [140 Amin]");
        let ziele: Vec<(&str, &str)> = plan.files.iter().map(|o| (o.from.as_str(), o.to.as_str())).collect();
        assert_eq!(ziele, vec![
            ("Project_797.flp", "MEMORIES [140 Amin].flp"),
            ("alt.mp3", "MEMORIES [140 Amin]_tagged_2.mp3"),
            ("bounce.mp3", "MEMORIES [140 Amin]_tagged.mp3"),
            ("demo_mix.wav", "MEMORIES [140 Amin]_mix.wav"),
            ("mix_untagged.wav", "MEMORIES [140 Amin]_untagged.wav"),
        ]);
        assert!(super::plan_rename(&dir, "  ", None, None).is_err());
        assert!(super::plan_rename(&dir, "X", Some("Qm"), None).is_err());
        assert!(super::plan_rename(&dir, "X", None, Some(20)).is_err());

        let neu = super::apply_rename(&dir, "MEMORIES", Some("Am"), Some(140)).unwrap();
        assert_eq!(neu, tmp.join("P0796 - MEMORIES [140 Amin]"));
        for f in ["MEMORIES [140 Amin].flp", "hook_v3.flp", "MEMORIES [140 Amin]_tagged.mp3", "MEMORIES [140 Amin]_tagged_2.mp3",
                  "MEMORIES [140 Amin]_untagged.wav", "MEMORIES [140 Amin]_mix.wav", "STEM - Drums.wav", "cover.png"] {
            assert!(neu.join(f).is_file(), "{f} fehlt");
        }
        // Zweimal hintereinander: nichts mehr zu tun
        assert!(super::plan_rename(&neu, "MEMORIES", Some("Am"), Some(140)).unwrap().files.is_empty());
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn next_project_name_is_max_plus_one_across_roots() {
        let tmp = std::env::temp_dir().join(format!("beatos_next_name_{}", std::process::id()));
        let a = tmp.join("a");
        let b = tmp.join("b");
        std::fs::create_dir_all(a.join("Project_134")).unwrap();
        std::fs::create_dir_all(a.join("MEMORIES")).unwrap();          // ohne Nummer
        std::fs::create_dir_all(a.join("Project_alt")).unwrap();       // keine Zahl
        std::fs::create_dir_all(b.join("project_205")).unwrap();       // andere Schreibweise
        std::fs::create_dir_all(b.join("Project_192")).unwrap();

        let roots = vec![a.to_string_lossy().to_string(), b.to_string_lossy().to_string()];
        assert_eq!(super::next_project_name(roots).unwrap(), "P0206");
        // Leerer Ordner → fängt bei 1 an
        assert_eq!(
            super::next_project_name(vec![tmp.join("leer").to_string_lossy().to_string()]).unwrap(),
            "P0001"
        );

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn close_gaps_keeps_order_and_names() {
        let tmp = std::env::temp_dir().join(format!("beatos_gaps_{}", std::process::id()));
        let root = tmp.join("prod");
        for d in ["Project_0001", "Project_0003 - MEMORIES", "Project_0004", "Project_0007", "NO MORE RUNNING"] {
            std::fs::create_dir_all(root.join(d)).unwrap();
        }
        std::fs::write(root.join("Project_0004").join("Project_0004.flp"), b"x").unwrap();
        let roots = vec![root.to_string_lossy().to_string()];

        let steps = super::plan_close_gaps(&roots);
        let neu: Vec<&str> = steps.iter().map(|s| s.new_name.as_str()).collect();
        assert_eq!(neu, ["P0001", "P0002 - MEMORIES", "P0003", "P0004"]);

        // Kette 3→2, 4→3, 7→4 auf der Platte — die Zwischennamen fangen das ab
        let (done, failed) = super::merge_steps_on_disk(&steps);
        assert!(failed.is_empty(), "{:?}", failed);
        // Alle vier: drei Nummern rücken, und Project_0001 bekommt das neue Schema
        assert_eq!(done.len(), 4);
        assert!(root.join("P0003").join("P0003.flp").is_file());
        assert!(root.join("P0001").is_dir() && root.join("P0002 - MEMORIES").is_dir() && root.join("P0004").is_dir());
        assert!(["Project_0001", "Project_0003 - MEMORIES", "Project_0004", "Project_0007"].iter().all(|d| !root.join(d).exists()));
        assert!(root.join("NO MORE RUNNING").is_dir());
        assert!(super::plan_close_gaps(&roots).is_empty());

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn alte_idee_wird_naechstes_projekt() {
        let tmp = std::env::temp_dir().join(format!("beatos_ideen_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        let root = tmp.join("prod");
        std::fs::create_dir_all(root.join("P0003")).unwrap();
        let idee = root.join("_IDEEN").join("2021").join("[248] FEAR - Bpm 130 - Dm");
        std::fs::create_dir_all(&idee).unwrap();
        // FLP mit Tempo 130 (Event 156 = BPM · 1000)
        let mut flp = b"FLhd".to_vec();
        flp.extend(6u32.to_le_bytes()); flp.extend([0u8; 6]);
        flp.extend(b"FLdt"); flp.extend(5u32.to_le_bytes()); flp.push(156); flp.extend(130_000u32.to_le_bytes());
        std::fs::write(idee.join("FEAR.flp"), &flp).unwrap();
        let roots = vec![root.to_string_lossy().to_string()];

        // Die Liste zeigt sie mit Tempo, der Projekt-Scan kennt `_IDEEN` nicht als Nummer
        let ideen = super::alte_ideen_in(&roots);
        assert_eq!((ideen.len(), ideen[0].bpm), (1, Some(130)));
        assert_eq!(super::highest_project_number(&roots), 3);

        let schritt = super::idee_schritt(&roots, &idee).unwrap();
        assert_eq!(schritt.new_name, "P0004 - 248 FEAR - Bpm 130 - Dm");
        let (done, failed) = super::merge_steps_on_disk(&[schritt]);
        assert!(failed.is_empty() && done.len() == 1, "{failed:?}");
        assert!(root.join("P0004 - 248 FEAR - Bpm 130 - Dm").join("FEAR.flp").is_file());
        assert!(super::alte_ideen_in(&roots).is_empty());
        // Nur was in _IDEEN/<Jahr>/ liegt
        assert!(super::idee_schritt(&roots, &root.join("P0003")).is_err());

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn nachruecken_zieht_flp_pfade_mit() {
        let tmp = std::env::temp_dir().join(format!("beatos_gaps_flp_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        let root = tmp.join("prod");
        // P0001 ist frei: Project_0002 rückt nach. Daneben ein Projekt, das nach dem Nachrücken
        // den alten Namen trägt und eine gleichnamige Datei hat — die darf es nie werden.
        let alt = root.join("Project_0002");
        std::fs::create_dir_all(alt.join("Audio")).unwrap();
        std::fs::write(alt.join("Audio").join("Pattern 1 (consolidated).wav"), b"meins").unwrap();
        std::fs::create_dir_all(root.join("Project_0003").join("Audio")).unwrap();
        std::fs::write(root.join("Project_0003").join("Audio").join("Pattern 1 (consolidated).wav"), b"fremd").unwrap();
        let verweis = alt.join("Audio").join("Pattern 1 (consolidated).wav").to_string_lossy().to_string();
        let mut flp = b"FLhd".to_vec();
        flp.extend(6u32.to_le_bytes()); flp.extend([0u8; 6]);
        let ev = crate::commands::flp::pfad_ereignis(&verweis);
        flp.extend(b"FLdt"); flp.extend((ev.len() as u32).to_le_bytes()); flp.extend(ev);
        std::fs::write(alt.join("Project_0002.flp"), &flp).unwrap();

        let steps = super::plan_close_gaps(&[root.to_string_lossy().to_string()]);
        let (done, failed) = super::merge_steps_on_disk(&steps);
        assert!(failed.is_empty(), "{failed:?}");
        for s in &done { crate::commands::pfadreparatur::eigener_ordner(std::path::Path::new(&s.to)).unwrap(); }

        let neu = root.join("P0001");
        let flp = std::fs::read_dir(&neu).unwrap().flatten().map(|e| e.path()).find(|p| p.extension().is_some_and(|x| x == "flp")).unwrap();
        let pfade = crate::commands::flp::audio_pfade(&std::fs::read(flp).unwrap());
        assert_eq!(pfade.len(), 1);
        assert_eq!(std::fs::read(&pfade[0]).unwrap(), b"meins", "zeigt auf die eigene Aufnahme: {}", pfade[0]);
        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn create_project_without_template_leaves_no_folder() {
        let tmp = std::env::temp_dir().join(format!("beatos_create_proj2_{}", std::process::id()));
        let root = tmp.join("root");
        std::fs::create_dir_all(&root).unwrap();

        let res = super::create_project_folder(
            root.to_string_lossy().to_string(),
            "Ohne Vorlage".to_string(),
            tmp.join("gibtsnicht.flp").to_string_lossy().to_string(),
        );
        assert!(res.is_err());
        assert!(!root.join("Ohne Vorlage").exists(), "kein halber Ordner");

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    /// Legt ein Projekt mit einer FLP an, deren Zeitstempel gesetzt ist.
    fn make_project(dir: &std::path::Path, flp: &str, age_days: u64) {
        let saves = dir.join("01_SAVEFILES");
        std::fs::create_dir_all(&saves).unwrap();
        let f = saves.join(flp);
        std::fs::write(&f, b"flp").unwrap();
        let when = std::time::SystemTime::now() - std::time::Duration::from_secs(age_days * 86_400);
        let file = std::fs::File::options().write(true).open(&f).unwrap();
        file.set_modified(when).unwrap();
    }

    #[test]
    fn plan_numbers_by_age_and_keeps_the_name_part() {
        let tmp = std::env::temp_dir().join(format!("beatos_merge_plan_{}", std::process::id()));
        let target = tmp.join("01_ACTIVE_PRODUCTION");
        let other = tmp.join("700-799");
        std::fs::create_dir_all(&target).unwrap();
        std::fs::create_dir_all(&other).unwrap();

        make_project(&target.join("Project_5"), "Project_5.flp", 400);   // ältester
        make_project(&target.join("Project_9"), "Project_9.flp", 10);    // jüngster
        make_project(&other.join("Project_236"), "Project_236.flp", 100); // Mitte
        // Seit dem erweiterten Parser laufen diese beiden mit statt still
        // hinten runterzufallen — das alte System benutzt genau diese Schemata.
        make_project(&other.join("#Project_1"), "x.flp", 50);
        make_project(&other.join("[701] One Sided Love - 125 Cm"), "y.flp", 200);
        // Bleiben liegen:
        make_project(&other.join("NO MORE RUNNING"), "z.flp", 60); // keine Nummer im Namen
        std::fs::create_dir_all(other.join("Project_77")).unwrap(); // ohne FLP
        std::fs::write(other.join("untitled.flp"), b"flp").unwrap(); // lose Datei

        let plan = super::plan_production_merge(
            vec![other.to_string_lossy().to_string()],
            target.to_string_lossy().to_string(),
            vec![],
        )
        .unwrap();

        let names: Vec<(&str, &str)> = plan
            .steps
            .iter()
            .map(|s| (s.old_name.as_str(), s.new_name.as_str()))
            .collect();
        assert_eq!(
            names,
            vec![
                ("Project_5", "P0001"),
                ("[701] One Sided Love - 125 Cm", "P0002 - One Sided Love - 125 Cm"),
                ("Project_236", "P0003"),
                ("#Project_1", "P0004"),
                ("Project_9", "P0005"),
            ],
            "ältester Beat bekommt die 1, und der Namensteil zieht mit"
        );
        assert!(plan.steps.iter().all(|s| s.to.starts_with(&target.to_string_lossy().to_string())));

        let skipped: Vec<&str> = plan.skipped.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(skipped, vec!["NO MORE RUNNING", "Project_77"]);
        assert!(plan.skipped.iter().any(|s| s.reason.contains("keine FLP")));
        assert!(plan.skipped.iter().any(|s| s.reason.contains("keine Nummer")));

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn apply_swaps_names_without_collision_and_undo_restores() {
        let tmp = std::env::temp_dir().join(format!("beatos_merge_apply_{}", std::process::id()));
        let target = tmp.join("target");
        let other = tmp.join("other");
        std::fs::create_dir_all(&target).unwrap();
        std::fs::create_dir_all(&other).unwrap();

        // Project_0001 existiert schon und muss selbst zu Project_0002 werden —
        // genau der Fall, an dem ein einphasiges Umbenennen scheitern würde.
        make_project(&target.join("Project_0001"), "Project_0001.flp", 5);
        make_project(&other.join("Project_42"), "Project_42.flp", 900);
        std::fs::write(target.join("Project_0001").join("notiz.txt"), b"bleibt").unwrap();

        let plan = super::plan_production_merge(
            vec![other.to_string_lossy().to_string()],
            target.to_string_lossy().to_string(),
            vec![],
        )
        .unwrap();
        assert_eq!(plan.steps.len(), 2);

        let (done, failed) = super::merge_steps_on_disk(&plan.steps);
        assert!(failed.is_empty(), "unerwartet fehlgeschlagen: {:?}", failed);
        assert_eq!(done.len(), 2);

        // Der alte Beat steht vorn, der junge dahinter — samt FLP-Namen
        assert!(target.join("P0001/01_SAVEFILES/P0001.flp").exists());
        assert!(target.join("P0002/01_SAVEFILES/P0002.flp").exists());
        assert!(target.join("P0002/notiz.txt").exists(), "Inhalt zieht mit");
        assert!(!other.join("Project_42").exists());
        // Keine Zwischennamen übrig
        assert!(!std::fs::read_dir(&target).unwrap().filter_map(|e| e.ok())
            .any(|e| e.file_name().to_string_lossy().starts_with(".beatos_merge_")));

        // Rückwärts abspielen stellt den Ausgangszustand wieder her
        let back: Vec<super::MergeStep> = done
            .into_iter()
            .map(|s| super::MergeStep {
                from: s.to, to: s.from,
                old_name: s.new_name, new_name: s.old_name,
                date: s.date,
            })
            .collect();
        let (undone, failed) = super::merge_steps_on_disk(&back);
        assert!(failed.is_empty(), "Rückgängig fehlgeschlagen: {:?}", failed);
        assert_eq!(undone.len(), 2);

        assert!(other.join("Project_42/01_SAVEFILES/Project_42.flp").exists());
        assert!(target.join("Project_0001/01_SAVEFILES/Project_0001.flp").exists());
        assert!(target.join("Project_0001/notiz.txt").exists());
        assert!(!target.join("Project_0002").exists());

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn apply_never_overwrites_an_occupied_target() {
        let tmp = std::env::temp_dir().join(format!("beatos_merge_guard_{}", std::process::id()));
        let target = tmp.join("target");
        std::fs::create_dir_all(&target).unwrap();
        make_project(&target.join("Project_7"), "Project_7.flp", 3);
        // Fremder Ordner belegt den Zielnamen und darf nicht verschwinden
        std::fs::create_dir_all(target.join("Project_0001")).unwrap();
        std::fs::write(target.join("Project_0001").join("wichtig.txt"), b"fremd").unwrap();

        let steps = vec![super::MergeStep {
            from: target.join("Project_7").to_string_lossy().to_string(),
            to: target.join("Project_0001").to_string_lossy().to_string(),
            old_name: "Project_7".to_string(),
            new_name: "Project_0001".to_string(),
            date: None,
        }];
        let (done, failed) = super::merge_steps_on_disk(&steps);

        assert!(done.is_empty());
        assert_eq!(failed.len(), 1);
        assert!(failed[0].contains("belegt"), "got: {}", failed[0]);
        // Nichts überschrieben, nichts verloren — der Ordner wartet unter dem
        // Zwischennamen auf den Nutzer
        assert_eq!(std::fs::read(target.join("Project_0001/wichtig.txt")).unwrap(), b"fremd");
        assert!(std::fs::read_dir(&target).unwrap().filter_map(|e| e.ok())
            .any(|e| e.file_name().to_string_lossy().starts_with(".beatos_merge_")));

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    /// `mergeClasses.ts` liest diese Texte: „archiviert" färbt die Zeile grün,
    /// „keine FLP" grau, alles andere gilt als „keine Nummer". Wer hier
    /// umformuliert, verschiebt stumm Farben und Zahlen im Merge-Dialog —
    /// also stehen die drei Wörter hier fest.
    #[test]
    fn die_uebersprungen_gruende_bleiben_wie_der_dialog_sie_liest() {
        let tmp = std::env::temp_dir().join(format!("beatos_gruende_{}", std::process::id()));
        let root = tmp.join("PROD");
        std::fs::create_dir_all(&root).unwrap();

        make_project(&root.join("Project_1"), "a.flp", 400);
        make_project(&root.join("Project_2"), "b.flp", 300);
        std::fs::create_dir_all(root.join("NO MORE RUNNING")).unwrap(); // ohne Nummer
        std::fs::create_dir_all(root.join("Project_9")).unwrap(); // ohne FLP

        let roots = vec![root.to_string_lossy().to_string()];
        let ziel = root.to_string_lossy().to_string();
        let plan = super::plan_production_merge(
            roots,
            ziel,
            vec![root.join("Project_1").to_string_lossy().to_string()],
        )
        .unwrap();

        let grund = |name: &str| {
            plan.skipped
                .iter()
                .find(|s| s.name == name)
                .map(|s| s.reason.clone())
                .unwrap_or_else(|| panic!("{} steht nicht in den Übersprungenen", name))
        };

        // buildMergeRows: .includes("archiviert") → archived_complete
        assert!(grund("Project_1").contains("archiviert"), "{}", grund("Project_1"));
        // buildMergeRows: .includes("keine FLP") → no_flp
        assert!(grund("Project_9").contains("keine FLP"), "{}", grund("Project_9"));
        // alles andere → no_number
        let ohne_nummer = grund("NO MORE RUNNING");
        assert!(!ohne_nummer.contains("archiviert") && !ohne_nummer.contains("keine FLP"),
                "{}", ohne_nummer);

        std::fs::remove_dir_all(&tmp).ok();
    }

    /// Das Parken hielt sich an `missing` statt an `missing_important` und
    /// übersprang damit Ordner, die der Dialog vorher als vollständig gezählt
    /// und angekündigt hatte — es genügte ein FL-Autosave aus einer Sitzung
    /// nach dem Archivieren.
    #[test]
    fn parken_stolpert_nicht_ueber_fl_autosaves() {
        use crate::commands::archive_match::{MatchKind, MissingFile, ProjectArchiveStatus};

        let status = |missing: Vec<MissingFile>, wichtig: usize| ProjectArchiveStatus {
            project_path: r"C:\PROD\Project_0042".into(),
            project_name: "Project_0042".into(),
            archive_folder: Some("0042 - MEMORIES [Am 140]".into()),
            archive_path: Some(r"C:\ARCHIV\2026\08_AUGUST\0042".into()),
            catalog_id: Some(42),
            matched_by: Some(MatchKind::Title),
            missing,
            missing_important: wichtig,
            compared: 12,
        };
        let autosave = || MissingFile {
            relative_path: r"Backup\Project_0042 (autosaved).flp".into(),
            size: 1024,
            is_backup: true,
        };
        let arbeitsdatei = || MissingFile {
            relative_path: r"01_SAVEFILES\hook_v3.flp".into(),
            size: 2048,
            is_backup: false,
        };

        // Der Fall, um den es geht: nur ein Autosave fehlt → darf weg
        assert_eq!(super::park_skip_reason(&status(vec![autosave()], 0)), None);
        // Nichts fehlt → darf weg
        assert_eq!(super::park_skip_reason(&status(vec![], 0)), None);
        // Echte Arbeitsdatei fehlt → bleibt liegen, und die Meldung sagt warum
        assert_eq!(
            super::park_skip_reason(&status(vec![arbeitsdatei(), autosave()], 1)),
            Some("1 Arbeitsdatei(en) fehlen im Archiv".to_string())
        );

        // Die beiden anderen Gründe bleiben, wie sie waren
        let mut ohne_treffer = status(vec![], 0);
        ohne_treffer.archive_folder = None;
        assert_eq!(
            super::park_skip_reason(&ohne_treffer),
            Some("nicht im Archiv gefunden".to_string())
        );
        let mut mehrdeutig = status(vec![], 0);
        mehrdeutig.matched_by = Some(MatchKind::Ambiguous);
        assert_eq!(
            super::park_skip_reason(&mehrdeutig),
            Some("Zuordnung nicht eindeutig".to_string())
        );
    }

    /// Die Zahl am Studio-Tab zählte 43 „Überarbeiten", die Liste zeigte 42:
    /// die 43. Zeile war ein nach `_ARCHIVIERT` geparktes Projekt. Der Ordner
    /// existiert noch und die Zeile hängt (absichtlich) am neuen Pfad, gescannt
    /// wird er aber nie wieder — also darf er auch nicht mitzählen.
    #[test]
    fn zaehlung_nimmt_nur_was_auch_gescannt_wird() {
        let root = r"C:\Users\kismo\OneDrive\Dokumente\._BEAT LIBRARY\01_ACTIVE_PRODUCTION";
        let roots = vec![root.to_string(), "  ".to_string()];

        assert!(super::liegt_in_roots(&format!(r"{}\Project_0515", root), &roots));

        // Der echte Fall aus dem Bestand
        assert!(!super::liegt_in_roots(
            r"C:\Users\kismo\OneDrive\Dokumente\._BEAT LIBRARY\_ARCHIVIERT\Project_174",
            &roots,
        ));

        // Groß-/Kleinschreibung, Schrägstriche und ein Schluss-Backslash am Root
        assert!(super::liegt_in_roots(
            &format!("{}/project_0515", root.to_lowercase()),
            &vec![format!(r"{}\", root)],
        ));

        // Der Root selbst ist kein Projekt, und ein Ordner daneben mit
        // demselben Namensanfang gehört nicht dazu
        assert!(!super::liegt_in_roots(root, &roots));
        assert!(!super::liegt_in_roots(&format!("{}_ALT\\Project_1", root), &roots));

        // Ohne Roots zählt nichts — sonst zählte die Zahl bei leeren
        // Einstellungen plötzlich den gesamten Bestand
        assert!(!super::liegt_in_roots(&format!(r"{}\Project_0515", root), &[]));
    }

    /// Von außerhalb der Inbox (Drag & Drop) wird kopiert, nicht verschoben —
    /// das Original bleibt liegen, wo es lag.
    #[test]
    fn assign_asset_kopiert_von_ausserhalb() {
        let tmp = std::env::temp_dir().join(format!("beatos_assign_test2_{}", std::process::id()));
        let inbox = tmp.join("inbox");
        let outside = tmp.join("outside");
        let proj = tmp.join("proj");
        std::fs::create_dir_all(&inbox).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::create_dir_all(&proj).unwrap();
        std::fs::write(outside.join("x.png"), b"x").unwrap();

        let res = super::assign_asset_to_project(
            outside.join("x.png").to_string_lossy().to_string(),
            inbox.to_string_lossy().to_string(),
            proj.to_string_lossy().to_string(),
            None,
        );
        assert!(res.is_ok(), "Drag & Drop von außerhalb darf ankommen");
        assert!(proj.join("x.png").is_file(), "Kopie liegt im Projekt");
        assert!(outside.join("x.png").exists(), "Original bleibt liegen");

        std::fs::remove_dir_all(&tmp).unwrap();
    }
