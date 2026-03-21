// src/lib/database.ts
// TypeScript Interface für Tauri DB-Commands
// Alle Funktionen rufen Rust-Commands auf — kein direkter DB-Zugriff im Frontend

import { invoke } from "@tauri-apps/api/core";

// ── Types — spiegeln die Rust-Structs wider ───────────────────────────────────

export interface Beat {
  id: string;
  name: string;
  path?: string;
  bpm?: number;
  key?: string;
  status: "idea" | "wip" | "finished" | "sold";
  tags?: string;           // kommasepariert: "Trap, Dark, Heavy"
  favorite?: number;       // 0 oder 1 (SQLite hat kein bool)
  created_date?: string;
  modified_date?: string;
  notes?: string;
  sold_to?: string;
  has_artwork?: number;
  has_video?: number;
}

export interface Stats {
  total: number;
  this_month: number;
  favorites: number;
  avg_bpm: number;
  by_status: {
    idea: number;
    wip: number;
    finished: number;
    sold: number;
  };
  top_keys: { key: string; count: number }[];
  top_tags: { tag: string; count: number }[];
  beats_per_month: { month: string; count: number }[];
  recent_beats: Beat[];
  available_years: number[];
  selected_year: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Tags-String → Array */
export function parseTags(tags?: string): string[] {
  if (!tags) return [];
  return tags.split(",").map(t => t.trim()).filter(Boolean);
}

/** Favorite number → boolean */
export function isFavorite(fav?: number): boolean {
  return fav === 1;
}

/** Beat status normalisieren */
export function normalizeStatus(status?: string): Beat["status"] {
  const s = (status ?? "").toLowerCase();
  if (s === "idea" || s === "wip" || s === "finished" || s === "sold") {
    return s as Beat["status"];
  }
  return "idea";
}

// ── API Functions ─────────────────────────────────────────────────────────────

/** Dashboard-Stats laden */
export async function getStats(year?: number): Promise<Stats> {
  return invoke<Stats>("get_stats", { year: year ?? null });
}

/** Beat-Liste laden (Browse-Tab) */
export async function getBeats(options?: {
  search?: string;
  statusFilter?: string;
  onlyFavs?: boolean;
  limit?: number;
  offset?: number;
}): Promise<Beat[]> {
  return invoke<Beat[]>("get_beats", {
    search:       options?.search ?? null,
    statusFilter: options?.statusFilter ?? null,
    onlyFavs:     options?.onlyFavs ?? false,
    limit:        options?.limit ?? 50,
    offset:       options?.offset ?? 0,
  });
}

/** Gesamtanzahl Beats */
export async function getBeatCount(): Promise<number> {
  return invoke<number>("get_beat_count");
}