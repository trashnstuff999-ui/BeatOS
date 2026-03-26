// src/lib/tags.ts
// ═══════════════════════════════════════════════════════════════════════════════
// BeatOS Tag System — DB-first, no keyword heuristics
// ═══════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────────

export type TagCategory = "genre" | "vibe" | "instrument" | "custom" | "other";

export interface TagColors {
  text: string;
  bg: string;
  border: string;
}

export interface TagPreset {
  tag: string;
  category: TagCategory;
}

export interface CustomTag {
  id: number;
  tag: string;
  display_name: string;
  category: TagCategory;
  usage_count: number;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────────
// Color Definitions per Category
// ─────────────────────────────────────────────────────────────────────────────────

export const TAG_COLORS: Record<TagCategory, TagColors> = {
  genre: {
    text: "#fda124",
    bg: "rgba(253,161,36,0.10)",
    border: "rgba(253,161,36,0.30)",
  },
  vibe: {
    text: "#60a5fa",
    bg: "rgba(96,165,250,0.10)",
    border: "rgba(96,165,250,0.30)",
  },
  instrument: {
    text: "#34d399",
    bg: "rgba(52,211,153,0.10)",
    border: "rgba(52,211,153,0.30)",
  },
  custom: {
    text: "#c084fc",
    bg: "rgba(192,132,252,0.10)",
    border: "rgba(192,132,252,0.30)",
  },
  other: {
    text: "#c084fc",
    bg: "rgba(192,132,252,0.10)",
    border: "rgba(192,132,252,0.30)",
  },
};

// ─────────────────────────────────────────────────────────────────────────────────
// DB Category Cache — module-level singleton, updated by useTags on every load
// ─────────────────────────────────────────────────────────────────────────────────

let _customTagsCache: CustomTag[] = [];

export function updateCustomTagsCache(tags: CustomTag[]): void {
  _customTagsCache = tags;
}

/** Returns the DB-stored category for a tag, or null if not found. */
export function getTagCategoryFromDb(tag: string): TagCategory | null {
  const lower = tag.toLowerCase().trim();
  const found = _customTagsCache.find(
    t => t.tag === lower || t.display_name.toLowerCase() === lower
  );
  return found?.category ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────────
// Core Functions
// ─────────────────────────────────────────────────────────────────────────────────

export function getTagColors(tag: string): TagColors {
  const category = getTagCategoryFromDb(tag) ?? "custom";
  return TAG_COLORS[category];
}

export function getTagInfo(tag: string): { category: TagCategory; colors: TagColors } {
  const category = getTagCategoryFromDb(tag) ?? "custom";
  return { category, colors: TAG_COLORS[category] };
}

// ─────────────────────────────────────────────────────────────────────────────────
// Preset Tags — used for one-time DB seeding on first app launch
// ─────────────────────────────────────────────────────────────────────────────────

export const PRESET_TAGS: Record<Exclude<TagCategory, "custom">, string[]> = {
  genre: [
    "Trap", "Drill", "Phonk", "Rage", "Pluggnb", "Opium",
    "Emo-Rap", "Sad-Rap", "Cloud",
    "Pop", "Pop-Punk", "Rock", "Grunge", "Indie", "Alternative-Rock",
    "R&B", "Soul", "Neo-Soul",
    "Lo-Fi", "Ambient", "Synthwave", "Hyperpop",
    "Boom-Bap", "Cinematic", "Orchestral", "Afrobeats", "Latin",
  ],
  vibe: [
    "Dark", "Sad", "Emotional", "Melancholic", "Lonely", "Melodic",
    "Hype", "Aggressive", "Heavy", "Hard", "Intense",
    "Chill", "Dreamy", "Smooth", "Mellow", "Relaxed",
    "Moody", "Atmospheric", "Epic", "Cinematic",
    "Bouncy", "Groovy", "Trippy", "Raw", "Gritty",
    "Nostalgic", "Triumphant", "Haunting", "Late-Night",
  ],
  instrument: [
    "808", "Hard-Drums", "Live-Drums", "Percussion",
    "Piano", "Keys", "Rhodes", "Organ",
    "Synth", "Pad", "Lead", "Pluck", "Arp",
    "Strings", "Violin", "Cello", "Orchestra",
    "Guitar", "Electric-Guitar", "Acoustic-Guitar", "Distorted",
    "Vocals", "Choir", "Vocal-Chops",
    "Brass", "Flute", "Bell", "Sample",
  ],
  other: [
    "Type-Beat", "Fast", "Slow", "Mid-Tempo",
    "Minimalist", "Complex", "Experimental",
    "Freestyle", "Hook", "Verse", "Intro", "Outro",
  ],
};

// ─────────────────────────────────────────────────────────────────────────────────
// Search Functions
// ─────────────────────────────────────────────────────────────────────────────────

/** Search tags from DB cache only — all tags are DB records. */
export function searchAllTags(query: string, customTags: CustomTag[]): TagPreset[] {
  const q = query.toLowerCase();
  return customTags
    .filter(ct => ct.display_name.toLowerCase().includes(q))
    .map(ct => ({ tag: ct.display_name, category: ct.category }));
}

// ─────────────────────────────────────────────────────────────────────────────────
// Tag Normalization
// ─────────────────────────────────────────────────────────────────────────────────

export function normalizeTag(tag: string): string {
  return tag
    .trim()
    .split(/[-\s]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("-");
}

export function normalizeTagForDb(tag: string): string {
  return tag.trim().toLowerCase();
}

export function parseTagString(tagString: string | null | undefined): string[] {
  if (!tagString) return [];
  return tagString
    .split(",")
    .map(t => normalizeTag(t.trim()))
    .filter(t => t.length > 0);
}

export function tagsToString(tags: string[]): string {
  return tags.map(normalizeTagForDb).join(", ");
}

const CATEGORY_ORDER: Record<string, number> = { genre: 0, vibe: 1, instrument: 2, custom: 3, other: 3 };

export function sortTagsByCategory(
  tags: string[],
  getCategory: (tag: string) => string
): string[] {
  return [...tags].sort((a, b) =>
    (CATEGORY_ORDER[getCategory(a)] ?? 3) - (CATEGORY_ORDER[getCategory(b)] ?? 3)
  );
}

// ─────────────────────────────────────────────────────────────────────────────────
// Category Labels & Icons
// ─────────────────────────────────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<TagCategory, string> = {
  genre: "Genre",
  vibe: "Vibe",
  instrument: "Instrument",
  custom: "Custom",
  other: "Custom",
};

export const CATEGORY_ICONS: Record<TagCategory, string> = {
  genre: "Music",
  vibe: "Sparkles",
  instrument: "Piano",
  custom: "Star",
  other: "Tag",
};
