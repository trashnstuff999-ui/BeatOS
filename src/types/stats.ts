// src/types/stats.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Dashboard statistics — mirrors the Rust Stats struct (snake_case wire format)
// ═══════════════════════════════════════════════════════════════════════════════

import type { Beat } from "./browse";

export interface WeekCount {
  week_start: string; // Montag, YYYY-MM-DD
  count: number;
}

/** "Was steht heute an?" — Aktions-Zahlen fürs Dashboard */
export interface DashboardActions {
  scheduled_next_7: number;
  finished_unscheduled: number;
  studio_ready: number;
  published_beats: number;
  scheduled_total: number;
  studio_by_status: Record<string, number>;
  uploads_per_week: WeekCount[];
  current_streak_weeks: number;
}

export interface Stats {
  total: number;
  this_month: number;
  favorites: number;
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
