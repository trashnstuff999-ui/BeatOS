// src/types/browse.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Type Definitions for Browse Tab
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Beat (from DB) ─────────────────────────────────────────────────────────

export interface Beat {
  id: string;
  name: string;
  path: string | null;
  bpm: number | null;
  key: string | null;
  status: BeatStatus | null;
  tags: string | null;  // Comma-separated in DB
  favorite: number | null;  // 0 or 1 in SQLite
  created_date: string | null;
  modified_date: string | null;
  notes: string | null;
  sold_to: string | null;
  has_artwork: number | null;
  has_video: number | null;
}

export type BeatStatus = "idea" | "wip" | "finished" | "sold";

// ─── Sort State ─────────────────────────────────────────────────────────────

export type SortColumn = "id" | "name" | "key" | "bpm" | "status";
export type SortDirection = "asc" | "desc";

export interface SortState {
  column: SortColumn;
  direction: SortDirection;
}

export const DEFAULT_SORT: SortState = {
  column: "id",
  direction: "desc",  // Höchste ID (neueste) zuerst
};

// ─── Pagination State ───────────────────────────────────────────────────────

export interface PaginationState {
  page: number;
  pageSize: number;
  totalCount: number;
}

export const DEFAULT_PAGINATION: PaginationState = {
  page: 1,
  pageSize: 50,
  totalCount: 0,
};

// ─── Filter State ───────────────────────────────────────────────────────────

export interface FilterState {
  search: string;
  status: BeatStatus | "all";
  keys: string[];  // Multi-select: ["Cm", "Dm", "Em"] etc.
  bpmMin: string;
  bpmMax: string;
  onlyFavs: boolean;
}

export const DEFAULT_FILTERS: FilterState = {
  search: "",
  status: "all",
  keys: [],  // Leer = alle Keys
  bpmMin: "",
  bpmMax: "",
  onlyFavs: false,
};

// ─── Key Options für Multi-Select ───────────────────────────────────────────

export const MINOR_KEYS = ["Am", "Bm", "Cm", "Dm", "Em", "Fm", "Gm", "A#m", "C#m", "D#m", "F#m", "G#m"];
export const MAJOR_KEYS = ["A", "B", "C", "D", "E", "F", "G", "A#", "C#", "D#", "F#", "G#"];

// ─── Edit Modal State ───────────────────────────────────────────────────────

export interface EditFormState {
  name: string;
  bpm: string;
  key: string;
  tags: string[];
  notes: string;
  sold_to: string;
}

export interface EditModalState {
  isOpen: boolean;
  beat: Beat | null;
  form: EditFormState;
  isDirty: boolean;
  isSaving: boolean;
  error: string | null;
}


// ─── Update Params (for API) ────────────────────────────────────────────────

export interface UpdateBeatParams {
  id: string;
  name?: string;
  bpm?: number | null;
  key?: string | null;
  status?: BeatStatus;
  tags?: string;
  notes?: string;
  favorite?: boolean;
  sold_to?: string | null;
}

// ─── Status Config — re-exported from lib/theme (single source of truth) ────
export { STATUS_CONFIG } from "../lib/theme";
export type { StatusConfig } from "../lib/theme";

// ─── Helper Functions ───────────────────────────────────────────────────────

/** Parse comma-separated tags string to array */
export function parseTags(tagsString: string | null): string[] {
  if (!tagsString) return [];
  return tagsString.split(",").map(t => t.trim()).filter(t => t.length > 0);
}

/** Convert tags array to comma-separated string */
export function stringifyTags(tags: string[]): string {
  return tags.join(", ");
}

/** Check if beat is favorited */
export function isFavorite(beat: Beat): boolean {
  return beat.favorite === 1;
}

/** Create EditFormState from Beat */
export function beatToEditForm(beat: Beat): EditFormState {
  return {
    name: beat.name,
    bpm: beat.bpm?.toString() || "",
    key: beat.key || "",
    tags: parseTags(beat.tags),
    notes: beat.notes || "",
    sold_to: beat.sold_to || "",
  };
}

/** Check if form has changed from original beat */
export function isFormDirty(form: EditFormState, originalBeat: Beat): boolean {
  const original = beatToEditForm(originalBeat);
  return (
    form.name !== original.name ||
    form.bpm !== original.bpm ||
    form.key !== original.key ||
    form.notes !== original.notes ||
    form.sold_to !== original.sold_to ||
    JSON.stringify(form.tags) !== JSON.stringify(original.tags)
  );
}

/** Normalize key for comparison (handle variations like "C#m", "C# minor", "C#min") */
export function normalizeKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace("minor", "m")
    .replace("min", "m")
    .replace("major", "")
    .replace("maj", "");
}
