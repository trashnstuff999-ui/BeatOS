// src/types/studio.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Studio tab shapes — mirror the Rust structs in commands/studio.rs
// ═══════════════════════════════════════════════════════════════════════════════

export type StudioStatus = "idea" | "wip" | "exported" | "ready" | "discard";

/** Die zwei Status, die du selbst vergibst — alles andere rechnet der Scan. */
export const MANUAL_STATUSES = ["wip", "discard"] as const;
export type ManualStatus = (typeof MANUAL_STATUSES)[number];

export function isManualStatus(s: StudioStatus): s is ManualStatus {
  return (MANUAL_STATUSES as readonly string[]).includes(s);
}

/**
 * Dieselbe Regel wie derive_stage in commands/studio.rs. Gebraucht wird sie
 * hier, wenn du einen Handstatus wieder abwählst: dann gilt sofort wieder die
 * automatische Stufe, ohne auf den nächsten Scan zu warten.
 */
export function deriveStage(p: StudioProject): StudioStatus {
  if (!(p.has_mp3 && p.has_wav)) return "idea";
  return p.has_cover && p.has_thumbnail && p.has_video ? "ready" : "exported";
}

/**
 * Ein Studio-Projekt im globalen Player: der Player will einen Beat, das
 * Studio hat nur einen Ordner. Die ID trägt den Pfad, damit die Queue Zeilen
 * wiederfindet — angezeigt wird sie nie, dafür gibt es isStudioBeatId.
 */
export const studioBeatId = (path: string) => `studio:${path}`;
export const isStudioBeatId = (id: string) => id.startsWith("studio:");

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

/** Die zwei Zahlen am Studio-Tab. */
export interface StudioStatusCounts {
  ready: number;
  wip: number;
}

// ─── Produktions-Ordner zusammenführen ───────────────────────────────────────

export interface MergeStep {
  from: string;
  to: string;
  old_name: string;
  new_name: string;
  /** Datum der ältesten FLP */
  date: string | null;
}

export interface MergeSkip {
  path: string;
  name: string;
  reason: string;
}

/** Ein vergangener Lauf, aus seinem Protokoll gelesen. */
export interface MergeRun {
  log_path: string;
  date: string;
  steps: number;
  target: string;
  /** Wie viele der damaligen Zielordner heute noch dort liegen */
  present: number;
}

/** Eine Nummer, die mehr als einem Ordner gehört. */
export interface DuplicateId {
  number: number;
  dirs: string[];
}

export interface MergePlan {
  target: string;
  steps: MergeStep[];
  skipped: MergeSkip[];
  /** Mehrfach vergebene Nummern — der Lauf löst sie auf, die Liste warnt vorher. */
  duplicates: DuplicateId[];
}

// ─── Archiv-Abgleich ─────────────────────────────────────────────────────────

export interface MissingFile {
  relative_path: string;
  size: number;
  /** FL-Autosave aus Backup/ — kein Arbeitsverlust */
  is_backup: boolean;
}

export interface ProjectArchiveStatus {
  project_path: string;
  project_name: string;
  /** null = kein Treffer im Archiv, also ein lebendes Projekt */
  archive_folder: string | null;
  archive_path: string | null;
  catalog_id: number | null;
  matched_by: "title" | "titleandkeybpm" | "ambiguous" | null;
  missing: MissingFile[];
  /** Fehlende Dateien ohne Autosaves — entscheidet, ob weggeräumt werden darf */
  missing_important: number;
  compared: number;
}

export interface MergeReport {
  moved: number;
  failed: string[];
  /** Protokoll für das Rückgängigmachen */
  log_path: string | null;
  /** Weitere Ablageorte desselben Protokolls */
  log_copies: string[];
  /** Lesbare Liste im Zielordner, direkt neben den Ordnern */
  summary_path: string | null;
  db_backup: string | null;
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

// ─── Parken: fertige Beats aus der Produktion nehmen ─────────────────────────

export interface ParkSkip {
  name: string;
  reason: string;
}

export interface ParkReport {
  park_dir: string;
  moved: number;
  /** Ordner, die die erneute Prüfung nicht bestanden haben */
  skipped: ParkSkip[];
  failed: string[];
  log_path: string | null;
  log_copies: string[];
  summary_path: string | null;
  db_backup: string | null;
}
