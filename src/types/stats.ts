// src/types/stats.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Dashboard statistics — mirrors the Rust Stats struct (snake_case wire format)
// ═══════════════════════════════════════════════════════════════════════════════

import type { Beat } from "./browse";

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
