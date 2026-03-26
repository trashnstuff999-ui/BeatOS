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
use commands::{
    // Stats commands
    get_stats,
    get_beat_count,
    get_date_sample,
    // Beat CRUD commands
    get_beats,
    get_beats_paginated,
    toggle_favorite,
    update_beat_status,
    update_beat,
    get_beat_by_id,
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
    // Create commands
    get_next_beat_id,
    parse_beat_folder_for_create,
    read_image_file,
    // Audio commands
    get_beat_audio_path,
    get_beat_cover_path,
    read_audio_file,
    get_beat_cover_base64,
    get_beat_audio_for_streaming,
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
    }
    
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            // Stats
            get_stats,
            get_beat_count,
            get_date_sample,
            // Beat CRUD
            get_beats,
            get_beats_paginated,
            toggle_favorite,
            update_beat_status,
            update_beat,
            get_beat_by_id,
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
            // Create
            get_next_beat_id,
            parse_beat_folder_for_create,
            read_image_file,
            // Audio
            get_beat_audio_path,
            get_beat_cover_path,
            read_audio_file,
            get_beat_cover_base64,
            get_beat_audio_for_streaming,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
