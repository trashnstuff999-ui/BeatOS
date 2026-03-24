// src-tauri/src/db/mod.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Database Module - Connection & Models
// ═══════════════════════════════════════════════════════════════════════════════

mod connection;
mod models;

pub use connection::{get_db_path, open_db, init_db};
pub use models::*;
