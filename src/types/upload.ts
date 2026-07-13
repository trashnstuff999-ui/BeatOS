// src/types/upload.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Upload tab data shapes — must mirror the Rust structs in
// src-tauri/src/commands/upload.rs
// ═══════════════════════════════════════════════════════════════════════════════

export type UploadPlatform = "beatstars" | "soundcloud" | "youtube";
export type UploadStatus = "draft" | "scheduled" | "uploaded";

export interface UploadBeatInfo {
  id: string;
  name: string;
  path: string;
  bpm: number | null;
  key: string | null;
  type_beat_main: string | null;
  type_beat_also_fits: string | null;
  genre_tags: string | null;
  youtube_tags: string | null;
  soundcloud_tags: string | null;
}

export interface UploadFilesState {
  beatstars_txt: boolean;
  soundcloud_txt: boolean;
  youtube_txt: boolean;
}

export interface AssetCheck {
  mp3: string | null;
  wav: string | null;
  flp: string | null;
  cover: string | null;
  thumbnail: string | null;
  video: string | null;
  upload_files: UploadFilesState;
}

export interface UploadPlatformRow {
  platform: UploadPlatform;
  status: UploadStatus;
  scheduled_at: string | null;
  uploaded_at: string | null;
  url: string | null;
}

export interface UploadData {
  beat: UploadBeatInfo;
  assets: AssetCheck;
  uploads: UploadPlatformRow[];
}

export interface TypeBeatPreset {
  id: number;
  label: string;
  main_artists: string;
  also_fits: string | null;
  genre_tags: string | null;
  youtube_tags: string | null;
  soundcloud_tags: string | null;
  use_count: number;
}

export interface SaveTypeBeatPresetParams {
  label: string;
  main_artists: string;
  also_fits: string | null;
  genre_tags: string | null;
  youtube_tags: string | null;
  soundcloud_tags: string | null;
}

export interface UpdateUploadStatusParams {
  beat_id: string;
  platform: UploadPlatform;
  status: UploadStatus;
  scheduled_at: string | null;
  uploaded_at: string | null;
  url: string | null;
}

export interface UploadDescriptions {
  beatstars: string;
  soundcloud: string;
  youtube: string;
}

export interface SaveUploadDescriptionsParams {
  beat_id: string;
  beatstars: string | null;
  soundcloud: string | null;
  youtube: string | null;
}

export interface LegacyMove {
  from_subdir: string;   // "01_AUDIO" | "02_VISUALS" | "04_UPLOAD"
  file_name: string;
  is_dir: boolean;       // true for nested folders like "Backup/"
}

export interface LegacyStructure {
  is_legacy: boolean;
  has_01_audio: boolean;
  has_02_visuals: boolean;
  has_03_projects: boolean;
  has_04_upload: boolean;
  has_01_savefiles: boolean;
  planned_moves: LegacyMove[];
  collisions: string[];
  savefiles_conflict: boolean;
}

export interface MigrationResult {
  moved_files: number;
  renamed_savefiles: boolean;
  removed_subfolders: string[];
}

export type RenameStatus = "rename" | "noop" | "collision";
export type RenameKind = "mp3" | "wav" | "mp4" | "cover" | "thumbnail" | "flp" | "flp_master" | "flp_old";

export interface RenameOp {
  from: string;
  to: string;
  kind: RenameKind;
  status: RenameStatus;
  subdir: string | null;
}

export interface SkippedFile {
  file: string;
  kind: string;
  reason: string;
}

export interface RenamePlan {
  operations: RenameOp[];
  skipped: SkippedFile[];
  has_work: boolean;
}

export interface RenameResult {
  renamed: number;
  noops: number;
  errors: string[];
}
