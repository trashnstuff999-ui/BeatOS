// src-tauri/src/commands/mod.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Tauri Commands Module
// ═══════════════════════════════════════════════════════════════════════════════

mod beats;
mod stats;
mod tags;
mod archive;
mod archive_match;
mod fundstuecke;
mod einsammeln;
mod create;
mod audio;
mod flp;
pub(crate) mod pfadreparatur;
mod nummerieren;
mod klammern;
mod kanal;
mod artists;
mod relocate;
pub(crate) mod sample_credits;
mod settings;
mod studio;
mod upload;

pub use beats::*;
pub use stats::*;
pub use tags::*;
pub use archive::*;
pub use archive_match::*;
pub use fundstuecke::*;
pub use einsammeln::*;
pub use create::*;
pub use audio::*;
pub use flp::*;
pub use kanal::*;
pub use artists::*;
pub use relocate::*;
pub use sample_credits::*;
pub use settings::*;
pub use studio::*;
pub use upload::*;
