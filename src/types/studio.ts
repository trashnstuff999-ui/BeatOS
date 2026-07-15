// src/types/studio.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Studio tab shapes — mirror the Rust structs in commands/studio.rs
// ═══════════════════════════════════════════════════════════════════════════════

export type StudioStatus = "idea" | "wip" | "exported" | "ready";

/** Was in der Liste groß steht: Songtitel wenn exportiert, sonst Ordnername. */
export function projectDisplayName(p: StudioProject): string {
  return p.song_name?.trim() || p.parsed_name || p.name;
}

/** Ordnername als Sekundär-Info — null, wenn er nichts Neues sagt. */
export function projectFolderLabel(p: StudioProject): string | null {
  const song = p.song_name?.trim();
  if (!song) return null;
  const folder = p.parsed_name || p.name;
  return folder.toLowerCase() === song.toLowerCase() ? null : folder;
}

export interface FlpEntry {
  path: string;
  name: string;
  modified_secs: number;
  modified_date: string | null;
}

export interface StudioProject {
  path: string;
  name: string;
  root: string;
  /** Ordnername ohne [Key BPM] */
  parsed_name: string;
  /** Songtitel aus der exportierten MP3/WAV — null, wenn noch nichts exportiert */
  song_name: string | null;
  key: string | null;
  bpm: number | null;
  newest_flp: string | null;
  flp_count: number;
  /** Alle FLP-Versionen, neueste zuerst */
  flps: FlpEntry[];
  modified_date: string | null;
  modified_secs: number;
  has_mp3: boolean;
  has_wav: boolean;
  has_cover: boolean;
  has_thumbnail: boolean;
  has_video: boolean;
  status: StudioStatus;
  priority: number;
  notes: string | null;
}

export interface AssetFile {
  path: string;
  name: string;
  kind: "image" | "video";
  guessed_role: "cover" | "thumbnail" | "video" | "image";
  size: number;
  modified_date: string | null;
  modified_secs: number;
}
