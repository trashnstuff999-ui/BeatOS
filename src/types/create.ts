// src/types/create.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Type Definitions for Create Tab
// ═══════════════════════════════════════════════════════════════════════════════

export interface AudioFileInfo {
  path: string;
  name: string;
  extension: string;
  size: number;
  modified_at: string;
  is_untagged: boolean;
}

export interface FlpFileInfo {
  path: string;
  name: string;
  size: number;
  modified_at: string;
  is_master: boolean;
  is_newest: boolean;
}

export interface ParsedBeatFolder {
  name: string;
  key: string | null;
  bpm: number | null;
  flp_path: string | null;
  flp_files: FlpFileInfo[];
  created_date: string | null;
  year_month: string;
  audio_files: AudioFileInfo[];
  all_files: string[];
  cover_path: string | null;
  source_path: string;
  suggested_id: number;
}

export interface SavedBeatState {
  title: string;
  key: string;
  bpm: string;
  catalogId: string;
  status: string;
  notes: string;
  selectedFile: string;
  selectedFlp: string;
  sourceFolderPath: string | null;
  createdDate: string | null;
  yearMonth: string;
  audioFiles: AudioFileInfo[];
  flpFiles: FlpFileInfo[];
  coverImage: string | null;
  coverSourcePath: string | null;
  tags: string[];
}

export type ConfirmAction = "switch-to-view" | "reset" | "navigate-away";

// ─── Archive Types ──────────────────────────────────────────────────────────

export interface DuplicateCheckResult {
  has_duplicate: boolean;
  duplicate_type: "id" | "name_key_bpm" | null;
  existing_id: string | null;
  existing_name: string | null;
}

export interface ArchiveBeatParams {
  source_folder: string;
  title: string;
  key: string | null;
  bpm: number | null;
  catalog_id: number;
  status: string;
  tags: string;
  notes: string;
  source_audio_path: string;
  source_flp_path: string;
  cover_path: string | null;
  year_month: string;
  archive_base_path: string;
}

export interface ArchiveResult {
  success: boolean;
  archive_path: string;
  beat_id: string;
  files_copied: number;
  error: string | null;
}

// ─── Dialog States ──────────────────────────────────────────────────────────

export interface ConfirmDialogState {
  show: boolean;
  action: ConfirmAction;
  message: string;
}

export interface DuplicateDialogState {
  show: boolean;
  duplicateType: "id" | "name_key_bpm";
  existingId: string;
  existingName: string;
}

export interface SuccessDialogState {
  show: boolean;
  archivePath: string;
  beatId: string;
  filesCopied: number;
}

// ─── Form State ─────────────────────────────────────────────────────────────

export interface CreateFormState {
  title: string;
  key: string;
  bpm: string;
  catalogId: string;
  status: string;
  notes: string;
  selectedFile: string;
  selectedFlp: string;
  sourceFolderPath: string | null;
  createdDate: string | null;
  yearMonth: string;
  audioFiles: AudioFileInfo[];
  flpFiles: FlpFileInfo[];
  coverImage: string | null;
  coverSourcePath: string | null;
}
