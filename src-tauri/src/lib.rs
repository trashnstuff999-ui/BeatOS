// src-tauri/src/lib.rs
// ═══════════════════════════════════════════════════════════════════════════════
// BeatOS Tauri Backend - Entry Point
// ═══════════════════════════════════════════════════════════════════════════════
//
// Modular structure:
// ├── db/           - Database connection, models, migrations
// ├── commands/     - All Tauri commands (beats, stats, tags, archive, create, audio)
// └── utils/        - Helper functions (date, files, parsing)
//
// ═══════════════════════════════════════════════════════════════════════════════
mod db;
mod commands;
mod utils;
use db::init_db;
use commands::ensure_default_templates;
use commands::{
    // Stats commands
    get_stats,
    get_beat_count,
    get_dashboard_actions, get_stats_details,
    // Beat CRUD commands
    get_beats,
    get_beats_paginated,
    toggle_favorite,
    update_beat_status,
    update_beat,
    get_beat_by_id,
    delete_beat,
    get_upload_badges,
    // Tags commands
    get_custom_tags,
    save_custom_tag,
    save_custom_tags_batch,
    delete_custom_tag,
    rename_custom_tag,
    search_custom_tags,
    // Archive commands
    scan_archive,
    fix_dates,
    check_beat_duplicate,
    archive_beat,
    preview_archive_path,
    trash_source_folder,
    // Create commands
    get_next_beat_id,
    parse_beat_folder_for_create,
    list_import_folders,
    read_image_file,
    // Audio commands
    get_beat_audio_path,
    get_beat_video_path,
    get_beat_cover_path,
    get_beat_cover_thumb,
    get_file_mtime,
    read_flp_markers,
    kanal_liste,
    upload_daten,
    upload_nacherfassen,
    scan_artists,
    create_artists_root,
    artists_altbestand,
    artists_umziehen,
    set_artist_song,
    create_artist,
    create_artist_song,
    artist_downloads,
    artist_assets_fuellen,
    artist_abgeben,
    artist_wieder_oeffnen,
    artist_pfade_reparieren,
    artist_ordner_aufraeumen,
    set_artist_beat,
    set_artist_nur_master,
    set_artist_erledigt,
    artist_beat_kopieren,
    set_artist_links,
    create_artist_release,
    artist_song_verschieben,
    artist_zusammenfuehren_plan,
    artist_zusammenfuehren,
    artist_kein_song,
    set_artist_reihenfolge,
    set_artist_session,
    artist_umbenennen,
    set_artist_farbe,
    set_artist_geplant,
    set_artist_features,
    set_artist_bild,
    artist_bild_holen,
    // Settings commands
    get_settings,
    save_settings,
    get_backup_info,
    backup_db_now,
    // Umzug der Bibliothek (Anker)
    relocate_status,
    relocate_preview,
    relocate_apply,
    // Sample-Credits
    get_sample_producers,
    save_sample_producer,
    delete_sample_producer,
    get_beat_sample_credits,
    set_beat_sample_credits,
    // Studio commands
    scan_studio_projects,
    update_studio_project,
    set_studio_kept,
    set_studio_aufraeumen,
    studio_status_counts,
    create_project_folder,
    create_sample,
    fl_vorlagen,
    scan_neues,
    neu_uebernehmen,
    scan_samples,
    scan_alte_ideen,
    idee_in_produktion,
    move_to_samples,
    plan_project_rename,
    apply_project_rename,
    next_project_name,
    plan_production_merge,
    apply_production_merge,
    undo_production_merge,
    scan_asset_inbox,
    rename_assets,
    trash_assets,
    assign_asset_to_project,
    match_projects_to_archive,
    scan_fundstuecke,
    einsammeln,
    einsammeln_rueckgaengig,
    fund_weg,
    fund_zum_artist,
    artist_ordner_altbestand,
    artist_ordner_kopieren,
    export_merge_preview,
    list_merge_runs,
    park_archived_projects,
    close_project_gaps,
    // Upload commands (Phase A: bootstrap, B: read, C: write, D: render+save)
    get_templates_dir,
    read_template,
    write_template,
    preview_template,
    get_upload_data,
    get_upload_schedule,
    get_upload_queue,
    schedule_release,
    unschedule_release,
    set_upload_skip,
    update_type_beat_info,
    update_beat_timecodes,
    update_upload_status,
    get_type_beat_presets,
    save_type_beat_preset,
    delete_type_beat_preset,
    bump_preset_use,
    render_upload_descriptions,
    save_upload_descriptions,
    get_description_state,
    set_description_override,
    check_legacy_structure,
    migrate_legacy_beat_structure,
    migrate_beat_structures,
    plan_filename_convention,
    apply_filename_convention,
    clean_old_exports,
    sync_beat_folders,
};
// ══════════════════════════════════════════════════════════════════════════════
// ENTRY POINT
// ══════════════════════════════════════════════════════════════════════════════
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize database schema ONCE at startup
    if let Err(e) = init_db() {
        eprintln!("WARNING: Database initialization failed: {}", e);
        // Continue anyway - individual commands will fail with proper errors
    } else {
        // Snapshot the local DB back into the OneDrive folder in the
        // background so a machine loss never loses the library index.
        std::thread::spawn(|| {
            if let Err(e) = db::backup_db() {
                eprintln!("WARNING: DB backup failed: {}", e);
            }
        });
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // Merkt sich Größe und Position des Fensters über Neustarts hinweg —
        // Voraussetzung dafür, BeatOS dauerhaft neben FL Studio liegen zu haben.
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            // Write default upload templates on first launch. Never overwrites
            // existing files, so a user-edited template survives app restarts.
            if let Err(e) = ensure_default_templates(app.handle()) {
                eprintln!("WARNING: Failed to bootstrap upload templates: {}", e);
            }
            // Der komplette Asset-Scope wird hier zur Laufzeit gesetzt, aus den
            // eingestellten Pfaden — Archiv, Produktions-Roots und Asset-Inbox.
            //
            // Früher stand das Archiv als einkompilierter Pfad in
            // tauri.conf.json. Das war aus zwei Gründen falsch: es band die App
            // an einen Rechner, und seit die Bibliothek umziehen kann (siehe
            // db::relocate) wäre der Pfad nach dem ersten Ankertausch tot —
            // Cover und Audio hätten stumm nicht mehr geladen.
            //
            // Frontend fällt auf base64 (read_image_file) zurück, wenn ein Pfad
            // doch nicht abgedeckt ist.
            {
                use tauri::Manager;
                let scope = app.asset_protocol_scope();
                if let Ok(settings) = commands::get_settings() {
                    let mut dirs: Vec<String> = Vec::new();
                    if let Some(archive) = settings.get("archive_path") {
                        if !archive.trim().is_empty() {
                            dirs.push(archive.trim().to_string());
                        }
                    }
                    if let Some(prod) = settings.get("production_path") {
                        dirs.extend(
                            prod.split(['\n', ';'])
                                .map(str::trim)
                                .filter(|s| !s.is_empty())
                                .map(String::from),
                        );
                    }
                    if let Some(asset) = settings.get("asset_path") {
                        if !asset.trim().is_empty() {
                            dirs.push(asset.trim().to_string());
                        }
                    }
                    // Künstler-Ordner (Profilbilder): eigener Pfad oder
                    // 05_ARTISTS neben dem Archiv — wie kuenstlerOrdner() im Frontend.
                    let kuenstler = settings.get("artists_path").map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
                        .or_else(|| settings.get("archive_path")
                            .and_then(|a| std::path::Path::new(a.trim()).parent().map(|p| p.join("05_ARTISTS").to_string_lossy().to_string())));
                    dirs.extend(kuenstler);
                    // Samples zum Reinhören: 06_SAMPLES neben dem Archiv (samplesOrdner())
                    dirs.extend(settings.get("archive_path")
                        .and_then(|a| std::path::Path::new(a.trim()).parent().map(|p| p.join("06_SAMPLES").to_string_lossy().to_string())));
                    // Cover-Vorschauen (get_beat_cover_thumb) liegen neben der Datenbank
                    dirs.extend(db::get_db_path().parent().map(|p| p.join("thumbs").to_string_lossy().to_string()));
                    for dir in dirs {
                        if let Err(e) = scope.allow_directory(&dir, true) {
                            eprintln!("WARNING: cannot extend asset scope for {}: {}", dir, e);
                        }
                    }
                }
            }
            // Alte Nummer und Begonnen für Beats nachtragen, die sie noch nicht
            // haben (Bibliothek-Umbau). Nur lesend auf der Platte, im Hintergrund.
            std::thread::spawn(|| match commands::herkunft_nachtragen() {
                Ok(n) if n > 0 => eprintln!("Herkunft nachgetragen: {} Beats", n),
                Ok(_) => {}
                Err(e) => eprintln!("WARNING: Herkunft nachtragen: {}", e),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Stats
            get_stats,
            get_beat_count,
            get_dashboard_actions,
            get_stats_details,
            // Beat CRUD
            get_beats,
            get_beats_paginated,
            toggle_favorite,
            update_beat_status,
            update_beat,
            get_beat_by_id,
            delete_beat,
            get_upload_badges,
            // Tags
            get_custom_tags,
            save_custom_tag,
            save_custom_tags_batch,
            delete_custom_tag,
            rename_custom_tag,
            search_custom_tags,
            // Archive
            scan_archive,
            fix_dates,
            check_beat_duplicate,
            archive_beat,
            preview_archive_path,
            trash_source_folder,
            // Create
            get_next_beat_id,
            parse_beat_folder_for_create,
            list_import_folders,
            read_image_file,
            // Audio
            get_beat_audio_path,
            get_beat_video_path,
            get_beat_cover_path,
            get_beat_cover_thumb,
            get_file_mtime,
            read_flp_markers,
            kanal_liste,
            upload_daten,
            upload_nacherfassen,
            scan_artists,
            create_artists_root,
            artists_altbestand,
            artists_umziehen,
            set_artist_song,
            create_artist,
            create_artist_song,
            artist_downloads,
            artist_assets_fuellen,
            artist_abgeben,
            artist_wieder_oeffnen,
            artist_pfade_reparieren,
            artist_ordner_aufraeumen,
            set_artist_beat,
            set_artist_nur_master,
            set_artist_erledigt,
            artist_beat_kopieren,
            set_artist_links,
            create_artist_release,
            artist_song_verschieben,
            artist_zusammenfuehren_plan,
            artist_zusammenfuehren,
            artist_kein_song,
            set_artist_reihenfolge,
            set_artist_session,
            artist_umbenennen,
            set_artist_farbe,
            set_artist_geplant,
            set_artist_features,
            set_artist_bild,
            artist_bild_holen,
            // Settings
            get_settings,
            save_settings,
            get_backup_info,
            backup_db_now,
            relocate_status,
            relocate_preview,
            relocate_apply,
            get_sample_producers,
            save_sample_producer,
            delete_sample_producer,
            get_beat_sample_credits,
            set_beat_sample_credits,
            // Studio
            scan_studio_projects,
            update_studio_project,
            set_studio_kept,
            set_studio_aufraeumen,
            studio_status_counts,
            create_project_folder,
            create_sample,
            fl_vorlagen,
            scan_neues,
            neu_uebernehmen,
            scan_samples,
            scan_alte_ideen,
            idee_in_produktion,
            move_to_samples,
            plan_project_rename,
            apply_project_rename,
            next_project_name,
            plan_production_merge,
            apply_production_merge,
            undo_production_merge,
            scan_asset_inbox,
            rename_assets,
            trash_assets,
            assign_asset_to_project,
            match_projects_to_archive,
            scan_fundstuecke,
            einsammeln,
            einsammeln_rueckgaengig,
            fund_weg,
            fund_zum_artist,
            artist_ordner_altbestand,
            artist_ordner_kopieren,
            export_merge_preview,
            list_merge_runs,
            park_archived_projects,
            close_project_gaps,
            // Upload (Phase A + B + C + D)
            get_templates_dir,
            read_template,
            write_template,
            preview_template,
            get_upload_data,
            get_upload_schedule,
            get_upload_queue,
            schedule_release,
            unschedule_release,
            set_upload_skip,
            update_type_beat_info,
            update_beat_timecodes,
            update_upload_status,
            get_type_beat_presets,
            save_type_beat_preset,
            delete_type_beat_preset,
            bump_preset_use,
            render_upload_descriptions,
            save_upload_descriptions,
            get_description_state,
            set_description_override,
            check_legacy_structure,
            migrate_legacy_beat_structure,
            migrate_beat_structures,
            plan_filename_convention,
            apply_filename_convention,
            clean_old_exports,
            sync_beat_folders,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
