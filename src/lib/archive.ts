// src/lib/archive.ts
// ═══════════════════════════════════════════════════════════════════════════════
// BeatOS Archive Utilities
// Only helper functions - Rust commands are called directly via invoke()
// ═══════════════════════════════════════════════════════════════════════════════

import { open } from "@tauri-apps/plugin-dialog";

// ─────────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────────

function getMonthName(monthIndex: number): string {
  return new Date(2000, monthIndex, 1)
    .toLocaleString("en-US", { month: "long" })
    .toUpperCase();
}

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
  const monthName = getMonthName(month);
  return `${year}/${monthNum}_${monthName}`;
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