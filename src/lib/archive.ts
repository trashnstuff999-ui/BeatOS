// src/lib/archive.ts
// ═══════════════════════════════════════════════════════════════════════════════
// BeatOS Archive Utilities
// Only helper functions - Rust commands are called directly via invoke()
// ═══════════════════════════════════════════════════════════════════════════════

import { open } from "@tauri-apps/plugin-dialog";

// ─────────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
] as const;

// ─────────────────────────────────────────────────────────────────────────────────
// Dialog Functions
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
 * Generate preview path for archive destination
 * @returns e.g. "/ARCHIVE/2025/03_MARCH/0042 - Midnight Drift [Cm 140]/"
 */
export function generatePreviewPath(
  id: number,
  name: string,
  key: string | null,
  bpm: number | null,
  yearMonth: string
): string {
  const idStr = String(id).padStart(4, "0");
  const cleanName = name.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, " ").trim();
  
  const parts: string[] = [];
  if (key) parts.push(key.toUpperCase());
  if (bpm) parts.push(String(bpm));
  const suffix = parts.length > 0 ? ` [${parts.join(" ")}]` : "";
  
  return `/ARCHIVE/${yearMonth}/${idStr} - ${cleanName}${suffix}/`;
}

/**
 * Format file size for display
 * @param bytes File size in bytes
 * @returns e.g. "1.5 MB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}