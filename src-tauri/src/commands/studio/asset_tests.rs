// src-tauri/src/commands/studio/asset_tests.rs

    use super::*;

    #[test]
    fn assets_umbenennen_nur_im_ordner_und_ohne_ueberschreiben() {
        let basis = std::env::temp_dir().join(format!("beatos_assets_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&basis);
        let media = basis.join("MEDIA");
        std::fs::create_dir_all(&media).unwrap();
        for n in ["cover9.png", "thumbnail9.png", "Cover_2.png", "x.png"] { std::fs::write(media.join(n), b"x").unwrap(); }
        std::fs::write(basis.join("draussen.png"), b"x").unwrap();
        let p = |n: &str| media.join(n).to_string_lossy().to_string();
        let u = |pfad: String, neu: &str| AssetUmbenennung { pfad, neu: neu.into() };

        let erg = rename_assets(media.to_string_lossy().to_string(), vec![
            u(p("cover9.png"), "Cover_9.png"),
            u(p("x.png"), "Cover_2.png"),
            u(basis.join("draussen.png").to_string_lossy().to_string(), "Cover_3.png"),
            u(p("thumbnail9.png"), r"..\weg.png"),
        ]);
        assert!(erg[0].ok && media.join("Cover_9.png").is_file());
        assert!(!erg[1].ok && media.join("x.png").is_file(), "vorhandenes Ziel bleibt");
        assert!(!erg[2].ok && basis.join("draussen.png").is_file(), "außerhalb wird nichts angefasst");
        // Trenner werden entfernt — die Datei bleibt in MEDIA, nichts landet darüber
        assert!(!basis.join("weg.png").exists() && !media.join("thumbnail9.png").exists());
        assert!(std::fs::read_dir(&media).unwrap().count() == 4, "{erg:?}");
        let _ = std::fs::remove_dir_all(&basis);
    }

    #[test]
    fn assets_ringtausch_klappt() {
        let media = std::env::temp_dir().join(format!("beatos_ringtausch_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&media);
        std::fs::create_dir_all(&media).unwrap();
        std::fs::write(media.join("Cover_1.png"), b"alt").unwrap();
        std::fs::write(media.join("Cover_2.png"), b"neu").unwrap();
        let p = |n: &str| media.join(n).to_string_lossy().to_string();
        let erg = rename_assets(media.to_string_lossy().to_string(), vec![
            AssetUmbenennung { pfad: p("Cover_1.png"), neu: "Cover_2.png".into() },
            AssetUmbenennung { pfad: p("Cover_2.png"), neu: "Cover_1.png".into() },
        ]);
        assert!(erg.iter().all(|e| e.ok), "{erg:?}");
        assert_eq!(std::fs::read(media.join("Cover_1.png")).unwrap(), b"neu");
        assert_eq!(std::fs::read(media.join("Cover_2.png")).unwrap(), b"alt");
        let _ = std::fs::remove_dir_all(&media);
    }

    #[test]
    fn nach_zuweisen_rutschen_die_nummern_nach() {
        let basis = std::env::temp_dir().join(format!("beatos_nachruecken_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&basis);
        let media = basis.join("MEDIA");
        let beat = basis.join("Beat");
        std::fs::create_dir_all(&media).unwrap();
        std::fs::create_dir_all(&beat).unwrap();
        for n in ["Cover_1.png", "Thumbnail_1.png", "cover2.png", "thumbnail2.png", "Cover_5.jpg", "home again_video.mp4", "Logo.png"] {
            std::fs::write(media.join(n), b"x").unwrap();
        }
        assign_asset_to_project(
            media.join("Cover_1.png").to_string_lossy().to_string(), media.to_string_lossy().to_string(),
            beat.to_string_lossy().to_string(), Some("cover".into()),
        ).unwrap();
        // Covers rutschen für sich nach, die Thumbnails bleiben
        let mut namen: Vec<String> = std::fs::read_dir(&media).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().to_string()).collect();
        namen.sort();
        assert_eq!(namen, vec!["Cover_1.png", "Cover_2.jpg", "Logo.png", "Thumbnail_1.png", "Thumbnail_2.png", "home again_video.mp4"]);

        assign_asset_to_project(
            media.join("Thumbnail_1.png").to_string_lossy().to_string(), media.to_string_lossy().to_string(),
            beat.to_string_lossy().to_string(), Some("thumbnail".into()),
        ).unwrap();
        let mut namen: Vec<String> = std::fs::read_dir(&media).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().to_string()).collect();
        namen.sort();
        assert_eq!(namen, vec!["Cover_1.png", "Cover_2.jpg", "Logo.png", "Thumbnail_1.png", "home again_video.mp4"],
            "Thumbnail_2 rutscht auf 1, Videos und Unnummeriertes bleiben");
        let _ = std::fs::remove_dir_all(&basis);
    }

    #[test]
    fn ersetzen_bild_zurueck_video_weg() {
        let basis = std::env::temp_dir().join(format!("beatos_ersetzen_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&basis);
        let (media, beat) = (basis.join("MEDIA"), basis.join("Beat"));
        std::fs::create_dir_all(&media).unwrap();
        std::fs::create_dir_all(&beat).unwrap();
        for n in ["neu_cover.png", "neu.mp4"] { std::fs::write(media.join(n), b"x").unwrap(); }
        for n in ["alt_cover.png", "alt.mp4"] { std::fs::write(beat.join(n), b"x").unwrap(); }
        let s = |p: &Path| p.to_string_lossy().to_string();
        assign_asset_to_project(s(&media.join("neu_cover.png")), s(&media), s(&beat), Some("cover".into())).unwrap();
        assign_asset_to_project(s(&media.join("neu.mp4")), s(&media), s(&beat), Some("video".into())).unwrap();
        assert!(media.join("alt_cover.png").is_file(), "altes Cover zurück in den Asset-Ordner");
        assert!(!media.join("alt.mp4").exists() && !beat.join("alt.mp4").exists(), "altes Video im Papierkorb");
        assert!(beat.join("neu.mp4").is_file() && beat.join("neu_cover.png").is_file());
        let _ = std::fs::remove_dir_all(&basis);
    }
