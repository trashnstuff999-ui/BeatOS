// src-tauri/src/commands/upload/mod.rs
// ═══════════════════════════════════════════════════════════════════════════════
// Upload-Tab Commands — split into focused submodules:
//   templates  — default description templates on disk
//   read       — get_upload_data + live asset scan
//   write      — type-beat info, upload status, presets
//   migration  — legacy 01_AUDIO/02_VISUALS/... flattening
//   rename     — filename-convention plan/apply engine
//   render     — description rendering + hashtag generator
// ═══════════════════════════════════════════════════════════════════════════════

mod templates;
mod read;
mod write;
mod migration;
mod rename;
mod render;

pub use templates::*;
pub use read::*;
pub use write::*;
pub use migration::*;
pub use rename::*;
pub use render::*;

pub(crate) const PLATFORMS: [&str; 3] = ["beatstars", "soundcloud", "youtube"];
pub(crate) const VALID_STATUSES: [&str; 3] = ["draft", "scheduled", "uploaded"];
pub(crate) const SOUNDCLOUD_TAG_LIMIT: usize = 9;
