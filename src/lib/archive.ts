// src/lib/archive.ts
// ═══════════════════════════════════════════════════════════════════════════════
// BeatOS Archivierungslogik
// Wrapper für Rust-Commands + Helper-Funktionen
// ═══════════════════════════════════════════════════════════════════════════════

import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

// ─────────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────────

/** Parsed beat folder information */
export interface ParsedBeatFolder {
  /** Detected beat name from filename */
  name: string;
  /** Musical key (e.g. "Cm", "F#m") */
  key: string | null;
  /** BPM */
  bpm: number | null;
  /** FLP project file path */
  flpPath: string | null;
  /** Creation date from FLP file */
  createdDate: string | null;
  /** Year-Month string for folder structure (e.g. "2025/03_MARCH") */
  yearMonth: string;
  /** Audio files found (sorted by mtime, newest first) */
  audioFiles: AudioFileInfo[];
  /** All files in the folder */
  allFiles: string[];
  /** Source folder path */
  sourcePath: string;
}

export interface AudioFileInfo {
  path: string;
  name: string;
  extension: string;
  size: number;
  modifiedAt: string;
}

/** Data needed to archive a beat */
export interface ArchiveBeatData {
  /** Beat ID (from get_next_beat_id) */
  id: number;
  /** Beat name */
  name: string;
  /** Musical key */
  key: string | null;
  /** BPM */
  bpm: number | null;
  /** Production status */
  status: string;
  /** Tags as comma-separated string */
  tags: string;
  /** Internal notes */
  notes: string;
  /** Cover image source path (will be moved to 02_VISUALS) */
  coverSourcePath: string | null;
  /** Source folder path */
  sourceFolderPath: string;
  /** Target year-month (e.g. "2025/03_MARCH") */
  yearMonth: string;
  /** Created date from FLP */
  createdDate: string | null;
}

/** Result of archive operation */
export interface ArchiveResult {
  success: boolean;
  /** Final archive path */
  archivePath: string | null;
  /** Beat ID */
  beatId: number;
  /** Error message if failed */
  error: string | null;
  /** Files that were moved */
  movedFiles: string[];
}

/** Stats returned from scan_archive */
export interface ScanArchiveResult {
  found: number;
  imported: number;
  skipped: number;
  errors: string[];
}

/** Stats returned from fix_dates */
export interface FixDatesResult {
  updated: number;
  not_found: number;
  no_flp: number;
  errors: string[];
}

// ─────────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────────

/** Month names for folder structure */
const MONTH_NAMES = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

/** Subfolder structure for archived beats */
export const ARCHIVE_SUBFOLDERS = {
  audio: "01_AUDIO",
  visuals: "02_VISUALS",
  projects: "03_PROJECTS",
} as const;

/** File extensions by category */
export const FILE_CATEGORIES: Record<string, readonly string[]> = {
  audio: [".wav", ".mp3", ".flac", ".aiff", ".ogg", ".m4a"],
  project: [".flp", ".als", ".logic", ".ptx", ".rpp"],
  visual: [".jpg", ".jpeg", ".png", ".webp", ".gif", ".psd", ".ai"],
  midi: [".mid", ".midi"],
  stems: [".wav", ".flac"], // Stems are audio but go in separate folder
};

// ─────────────────────────────────────────────────────────────────────────────────
// Folder Selection
// ─────────────────────────────────────────────────────────────────────────────────

/**
 * Open folder picker dialog
 * @returns Selected folder path or null if cancelled
 */
export async function selectBeatFolder(): Promise<string | null> {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select Beat Folder",
    });
    
    return selected as string | null;
  } catch (err) {
    console.error("Failed to open folder dialog:", err);
    return null;
  }
}

/**
 * Open file picker for cover image
 * @returns Selected file path or null if cancelled
 */
export async function selectCoverImage(): Promise<string | null> {
  try {
    const selected = await open({
      directory: false,
      multiple: false,
      title: "Select Cover Image",
      filters: [
        {
          name: "Images",
          extensions: ["jpg", "jpeg", "png", "webp", "gif"],
        },
      ],
    });
    
    return selected as string | null;
  } catch (err) {
    console.error("Failed to open file dialog:", err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────────
// Beat Parsing
// ─────────────────────────────────────────────────────────────────────────────────

/**
 * Parse a beat folder to extract metadata
 * Calls Rust backend to analyze folder contents
 */
export async function parseBeatFolder(folderPath: string): Promise<ParsedBeatFolder> {
  return await invoke<ParsedBeatFolder>("parse_beat_folder", { folderPath });
}

/**
 * Get the next available beat ID
 */
export async function getNextBeatId(): Promise<number> {
  return await invoke<number>("get_next_beat_id");
}

// ─────────────────────────────────────────────────────────────────────────────────
// Archiving
// ─────────────────────────────────────────────────────────────────────────────────

/**
 * Archive a beat - move files and create DB entry
 */
export async function archiveBeat(data: ArchiveBeatData): Promise<ArchiveResult> {
  return await invoke<ArchiveResult>("archive_beat", { data });
}

/**
 * Scan archive folder for untracked beats and import them
 */
export async function scanArchive(): Promise<ScanArchiveResult> {
  return await invoke<ScanArchiveResult>("scan_archive");
}

/**
 * Fix all beat dates by re-reading FLP creation times
 */
export async function fixAllDates(): Promise<FixDatesResult> {
  return await invoke<FixDatesResult>("fix_dates");
}

// ─────────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────────

/**
 * Generate year-month folder string from date
 * @param date Date object or ISO string
 * @returns e.g. "2025/03_MARCH"
 */
export function getYearMonthFolder(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-indexed
  const monthNum = String(month + 1).padStart(2, "0");
  const monthName = MONTH_NAMES[month];
  
  return `${year}/${monthNum}_${monthName}`;
}

/**
 * Generate the full archive folder name
 * @returns e.g. "0042 - Midnight Drift [Cm 140]"
 */
export function generateArchiveFolderName(
  id: number,
  name: string,
  key: string | null,
  bpm: number | null
): string {
  const idStr = String(id).padStart(4, "0");
  const cleanName = sanitizeFolderName(name);
  
  // Build key/bpm suffix
  const parts: string[] = [];
  if (key) parts.push(key.toUpperCase());
  if (bpm) parts.push(String(bpm));
  
  const suffix = parts.length > 0 ? ` [${parts.join(" ")}]` : "";
  
  return `${idStr} - ${cleanName}${suffix}`;
}

/**
 * Sanitize a string for use as folder name
 */
export function sanitizeFolderName(name: string): string {
  return name
    // Remove/replace invalid characters
    .replace(/[<>:"/\\|?*]/g, "")
    // Replace multiple spaces with single space
    .replace(/\s+/g, " ")
    // Trim
    .trim()
    // Title case (optional)
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Parse beat name from filename
 * Handles formats like:
 * - "Beat Name [Cm 140].mp3"
 * - "Beat_Name_V3_140BPM.wav"
 * - "Beat Name.flp"
 */
export function parseNameFromFilename(filename: string): {
  name: string;
  key: string | null;
  bpm: number | null;
} {
  // Remove extension
  const withoutExt = filename.replace(/\.[^.]+$/, "");
  
  // Try to extract [KEY BPM] pattern
  const bracketMatch = withoutExt.match(/^(.+?)\s*\[([A-Ga-g][#b]?m?)\s+(\d+)\]$/);
  if (bracketMatch) {
    return {
      name: bracketMatch[1].trim(),
      key: bracketMatch[2],
      bpm: parseInt(bracketMatch[3], 10),
    };
  }
  
  // Try to extract BPM from end (e.g. "_140BPM" or "_140")
  const bpmMatch = withoutExt.match(/^(.+?)[-_](\d{2,3})(?:BPM)?$/i);
  if (bpmMatch) {
    return {
      name: cleanupName(bpmMatch[1]),
      key: null,
      bpm: parseInt(bpmMatch[2], 10),
    };
  }
  
  // Just return cleaned name
  return {
    name: cleanupName(withoutExt),
    key: null,
    bpm: null,
  };
}

/**
 * Clean up a name string (remove version suffixes, underscores, etc.)
 */
function cleanupName(name: string): string {
  return name
    // Replace underscores with spaces
    .replace(/_/g, " ")
    // Remove version suffixes like "V3", "v2", "Final"
    .replace(/\s*(v\d+|final|master|mix|demo)\s*$/i, "")
    // Remove multiple spaces
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Get file category based on extension
 */
export function getFileCategory(
  filename: string
): "audio" | "project" | "visual" | "midi" | "other" {
  const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0] || "";
  
  if (FILE_CATEGORIES.audio.includes(ext)) return "audio";
  if (FILE_CATEGORIES.project.includes(ext)) return "project";
  if (FILE_CATEGORIES.visual.includes(ext)) return "visual";
  if (FILE_CATEGORIES.midi.includes(ext)) return "midi";
  
  return "other";
}

/**
 * Get the target subfolder for a file
 */
export function getTargetSubfolder(filename: string): string {
  const category = getFileCategory(filename);
  
  switch (category) {
    case "audio":
      return ARCHIVE_SUBFOLDERS.audio;
    case "visual":
      return ARCHIVE_SUBFOLDERS.visuals;
    case "project":
    case "midi":
      return ARCHIVE_SUBFOLDERS.projects;
    default:
      return ARCHIVE_SUBFOLDERS.projects; // Default: projects folder
  }
}

// ─────────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate beat data before archiving
 */
export function validateBeatData(data: Partial<ArchiveBeatData>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!data.name?.trim()) {
    errors.push("Beat name is required");
  }
  
  if (!data.sourceFolderPath) {
    errors.push("Source folder is required");
  }
  
  if (!data.id || data.id < 1) {
    errors.push("Valid beat ID is required");
  }

  // Warnings (not blocking)
  if (!data.key) {
    warnings.push("No key specified — consider adding one");
  }
  
  if (!data.bpm) {
    warnings.push("No BPM specified — consider adding one");
  }
  
  if (!data.tags) {
    warnings.push("No tags added — tags help with organization");
  }
  
  if (!data.coverSourcePath) {
    warnings.push("No cover image — beat will use default artwork");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────────────────
// Preview Path Generation
// ─────────────────────────────────────────────────────────────────────────────────

/**
 * Generate preview path for display (before archiving)
 */
export function generatePreviewPath(
  id: number,
  name: string,
  key: string | null,
  bpm: number | null,
  yearMonth: string
): string {
  const folderName = generateArchiveFolderName(id, name, key, bpm);
  return `/ARCHIVE/${yearMonth}/${folderName}/`;
}