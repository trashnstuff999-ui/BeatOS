// src/types/studio.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Studio tab shapes — mirror the Rust structs in commands/studio.rs
// ═══════════════════════════════════════════════════════════════════════════════

export type StudioStatus = "idea" | "wip" | "exported" | "ready";

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
  parsed_name: string;
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
