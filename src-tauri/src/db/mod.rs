// src-tauri/src/db/mod.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Database Module - Connection & Models
// ═══════════════════════════════════════════════════════════════════════════════

mod connection;
mod models;
pub mod relocate;

pub use connection::{open_db, init_db, backup_db, backup_target_path, get_db_path};
pub use models::*;
