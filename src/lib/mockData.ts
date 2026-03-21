// src/lib/mockData.ts
// Temporary mock data — will be replaced by Tauri SQLite calls

export interface Beat {
  id: string;
  name: string;
  key: string;
  bpm: number;
  status: "idea" | "wip" | "finished" | "sold";
  tags: string[];
  created_date: string;
  is_favorite: boolean;
}

export interface Stats {
  total: number;
  this_month: number;
  favorites: number;
  avg_bpm: number;
  by_status: Record<string, number>;
  top_keys: [string, number][];
  top_tags: [string, number][];
  beats_per_month: [string, number][];
  recent_beats: Beat[];
}

export const mockStats: Stats = {
  total: 1284,
  this_month: 42,
  favorites: 156,
  avg_bpm: 138,
  by_status: {
    idea: 342,
    wip: 489,
    finished: 215,
    sold: 238,
  },
  top_keys: [
    ["Am", 312],
    ["Cm", 278],
    ["F#m", 241],
    ["Dm", 198],
    ["Gm", 176],
  ],
  top_tags: [
    ["DarkTrap", 89],
    ["Melodic", 76],
    ["Phonk", 64],
    ["LoFi", 58],
    ["808Heavy", 51],
    ["Vinyl", 44],
    ["Experimental", 38],
    ["Cinematic", 33],
    ["Hard", 29],
  ],
  beats_per_month: [
    ["2025-01", 18],
    ["2025-02", 24],
    ["2025-03", 31],
    ["2025-04", 45],
    ["2025-05", 52],
    ["2025-06", 48],
    ["2025-07", 12],
    ["2025-08", 8],
    ["2025-09", 5],
    ["2025-10", 3],
    ["2025-11", 0],
    ["2025-12", 0],
  ],
  recent_beats: [
    { id: "1284", name: "Dark Trap Vibe", key: "Am", bpm: 140, status: "finished", tags: ["Trap"], created_date: "2024-03-01", is_favorite: false },
    { id: "1283", name: "Neon Horizon", key: "Cm", bpm: 128, status: "wip", tags: ["Melodic"], created_date: "2024-02-28", is_favorite: true },
    { id: "1282", name: "Concrete Jungle", key: "F#m", bpm: 95, status: "idea", tags: ["Drill"], created_date: "2024-02-25", is_favorite: false },
    { id: "1281", name: "Golden Era", key: "Gm", bpm: 92, status: "sold", tags: ["Boom Bap"], created_date: "2024-02-20", is_favorite: true },
    { id: "1280", name: "Midnight Drift", key: "Dm", bpm: 145, status: "finished", tags: ["Phonk"], created_date: "2024-02-18", is_favorite: false },
  ],
};

export const STATUS_CONFIG = {
  idea:     { label: "IDEA",     color: "var(--status-idea)",     bg: "var(--status-idea-bg)" },
  wip:      { label: "WIP",      color: "var(--status-wip)",      bg: "var(--status-wip-bg)" },
  finished: { label: "FINISHED", color: "var(--status-finished)", bg: "var(--status-finished-bg)" },
  sold:     { label: "SOLD",     color: "var(--status-sold)",     bg: "var(--status-sold-bg)" },
} as const;
