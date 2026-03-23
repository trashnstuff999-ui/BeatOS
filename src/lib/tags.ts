// src/lib/tags.ts
// ═══════════════════════════════════════════════════════════════════════════════
// BeatOS Tag System — Zentrale Tag-Verwaltung für alle Komponenten
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
    text: "#f59e0b",  // Amber
    bg: "rgba(245,158,11,0.10)",
    border: "rgba(245,158,11,0.30)",
  },
  other: {
    text: "#c084fc",
    bg: "rgba(192,132,252,0.10)",
    border: "rgba(192,132,252,0.30)",
  },
};

// ─────────────────────────────────────────────────────────────────────────────────
// Keyword Detection Sets
// ─────────────────────────────────────────────────────────────────────────────────

// EXAKTE Genre-Keywords (müssen exakt matchen)
const GENRE_EXACT = new Set([
  "emo", "trap", "drill", "phonk", "rage", "plugg", "pluggnb", "cloud",
  "dnb", "edm", "rnb", "r&b", "lofi", "lo-fi", "pop",
]);

// Alle Genre-Keywords (für Substring-Match)
const GENRE_KEYWORDS = new Set([
  "trap", "hiphop", "hip-hop", "rap", "boom-bap", "boombap", "old-school",
  "memphis", "crunk", "southern", "east-coast", "west-coast", "g-funk",
  "drill", "uk-drill", "ny-drill", "chicago-drill", "brooklyn-drill",
  "phonk", "drift-phonk", "brazilian-phonk", "memphis-phonk",
  "rage", "rage-beat", "plugg", "pluggnb", "plug", "detroit",
  "flint", "scam-rap", "tread", "jerk",
  "cloud", "cloud-rap", "opium", "hyperpop", "digicore", "glitchcore", "webcore",
  "emo-rap", "sad-rap", "melodic-rap",
  "juice-wrld", "juicewrld", "lil-peep", "lilpeep", "xxxtentacion",
  "trippie", "trippie-redd", "iann-dior",
  "rnb", "r&b", "soul", "neo-soul", "alt-rnb", "alternative-rnb",
  "pnb-rock", "6lack", "bryson-tiller", "frank-ocean",
  "edm", "house", "deep-house", "tech-house", "progressive",
  "techno", "minimal", "industrial", "ebm",
  "trance", "psytrance", "progressive-trance",
  "dubstep", "brostep", "riddim", "tearout",
  "dnb", "drum-and-bass", "jungle", "liquid", "neurofunk",
  "garage", "uk-garage", "2-step", "speed-garage",
  "bass", "future-bass", "wave", "hardwave",
  "future", "future-bounce",
  "lofi", "lo-fi", "chillhop", "jazzhop", "study-beats",
  "chillwave", "downtempo", "trip-hop", "abstract",
  "synthwave", "retrowave", "outrun", "darksynth",
  "vaporwave", "future-funk", "city-pop",
  "darkwave", "coldwave", "post-punk", "goth",
  "rock", "alt-rock", "alternative-rock", "indie", "indie-rock",
  "punk", "pop-punk", "emo-rock", "post-hardcore", "screamo", "metalcore",
  "grunge", "nirvana",
  "metal", "nu-metal", "heavy-metal", "deathcore",
  "hardcore", "beatdown",
  "pop", "dance-pop", "electropop", "synth-pop",
  "indie-pop", "bedroom-pop", "dream-pop", "art-pop",
  "darkpop", "alt-pop", "alternative-pop",
  "k-pop", "j-pop",
  "afrobeats", "afropop", "afrotrap", "afro", "amapiano",
  "dancehall", "reggae", "dub", "ska",
  "reggaeton", "latin", "latin-trap", "dembow", "baile-funk",
  "uk", "grime", "uk-rap", "british",
  "french", "german", "spanish",
  "jazz", "jazz-rap", "smooth-jazz", "bebop", "fusion",
  "blues", "delta-blues", "chicago-blues",
  "classical", "orchestral", "cinematic", "film-score",
  "neo-classical", "chamber", "baroque",
  "gospel", "spiritual", "church",
  "country", "country-trap", "folk", "americana",
  "bluegrass", "acoustic", "singer-songwriter",
  "ballad", "power-ballad",
  "ambient", "drone", "soundscape", "atmospheric",
  "experimental", "avant-garde", "noise", "glitch",
]);

const INSTRUMENT_KEYWORDS = new Set([
  "808", "808s", "drums", "drum", "percussion", "perc",
  "hi-hats", "hihats", "hats", "snare", "kick", "clap",
  "trap-drums", "live-drums", "acoustic-drums", "breakbeat",
  "rimshot", "tom", "cymbal", "shaker", "tambourine",
  "sub-bass", "sub", "808-bass", "reese",
  "synth-bass", "wobble", "growl",
  "piano", "keys", "keyboard", "rhodes", "wurlitzer",
  "organ", "church-organ", "b3", "electric-piano", "epiano",
  "grand-piano", "upright",
  "synth", "synthesizer", "analog", "digital",
  "pad", "pads", "ambient-pad", "lush",
  "lead", "synth-lead", "supersaw", "saw",
  "pluck", "plucks", "arp", "arpeggio", "arpeggiated",
  "stab", "stabs", "chord-stab",
  "strings", "violin", "viola", "cello", "contrabass",
  "orchestra", "orchestral-strings", "string-section",
  "pizzicato", "legato", "staccato", "tremolo",
  "harp", "harpsichord",
  "brass", "horn", "horns", "trumpet", "trombone", "tuba",
  "saxophone", "sax", "alto-sax", "tenor-sax",
  "flute", "clarinet", "oboe", "bassoon",
  "guitar", "acoustic-guitar", "electric-guitar", "clean-guitar",
  "distorted", "distortion", "overdrive", "crunch",
  "riff", "power-chord", "palm-mute", "shred",
  "fingerpick", "fingerstyle", "nylon",
  "ukulele", "banjo", "mandolin",
  "vocal", "vocals", "voice", "vox", "acapella",
  "choir", "choral", "chorus", "harmony", "harmonies",
  "vocal-chop", "vocal-sample", "vocal-hook",
  "autotune", "vocoder", "talkbox",
  "sample", "sampled", "loop", "loops", "chop", "chopped",
  "vinyl", "dusty", "vintage", "retro",
  "foley", "fx", "sfx", "sound-design",
  "bell", "bells", "chime", "glockenspiel", "xylophone", "marimba",
  "kalimba", "music-box", "celesta",
  "sitar", "tabla", "ethnic", "world",
  "chord", "chords", "progression",
]);

const VIBE_KEYWORDS = new Set([
  "emotional", "emotive", "feelsy", "in-my-feels", "melodic",
  "happy", "joyful", "joy", "uplifting", "euphoric", "bliss",
  "sad", "sadness", "crying", "tearful", "heartbreak", "heartbroken",
  "angry", "furious", "aggressive", "violent",
  "anxious", "anxiety", "nervous", "paranoid", "tense", "tension",
  "peaceful", "serene", "tranquil", "zen", "meditative",
  "hopeful", "hope", "inspiring", "inspirational", "motivated",
  "romantic", "love", "loving", "sensual", "intimate", "seductive",
  "lonely", "alone", "isolated", "solitude", "longing",
  "confident", "swagger", "cocky", "flex", "braggadocious",
  "nostalgic", "nostalgia", "memories", "throwback", "reminiscent",
  "melancholic", "melancholy", "bittersweet", "wistful",
  "energetic", "energy", "hype", "hyped", "turnt", "lit",
  "calm", "chill", "relaxed", "relaxing", "laid-back", "mellow",
  "intense", "intensity", "explosive", "powerful", "hard",
  "soft", "gentle", "tender", "delicate", "subtle",
  "heavy", "crushing", "massive", "huge", "big",
  "light", "airy", "floating", "weightless",
  "dark", "darkness", "sinister", "evil", "demonic", "devilish",
  "bright", "sunny", "warm", "summer", "tropical",
  "cold", "icy", "frozen", "winter", "arctic",
  "moody", "mood", "spacey", "cosmic",
  "dreamy", "dream", "surreal", "ethereal", "otherworldly",
  "mysterious", "mystery", "enigmatic", "cryptic",
  "epic", "cinematic", "dramatic", "theatrical", "grandiose",
  "raw", "gritty", "dirty", "grimey", "grimy", "street",
  "clean", "polished", "crisp", "pristine", "refined",
  "bouncy", "bounce", "groovy", "groove", "funky",
  "smooth", "silky", "buttery", "creamy",
  "hard-hitting", "punchy", "banging", "slapping",
  "trippy", "psychedelic", "wavy", "wavey",
  "catchy", "hooky", "earworm", "memorable",
  "hypnotic", "trance-like", "repetitive", "loopy",
  "glitchy", "degraded",
  "lush", "rich", "full", "thick", "dense",
  "sparse", "minimal", "minimalist", "stripped",
  "triumphant", "victorious", "anthemic",
  "haunting", "eerie", "spooky", "creepy", "unsettling",
  "late-night", "night", "midnight", "nocturnal", "after-hours",
  "morning", "sunrise", "dawn", "early",
  "sunset", "dusk", "evening", "golden-hour",
  "rainy", "rain", "stormy", "thunder",
  "futuristic", "sci-fi", "cyberpunk",
  "classic", "old-school",
]);

// ─────────────────────────────────────────────────────────────────────────────────
// Core Functions
// ─────────────────────────────────────────────────────────────────────────────────

export function getTagCategory(tag: string): TagCategory {
  const lower = tag.toLowerCase().trim();
  
  // 1. Vibe-Keywords zuerst (schützt "emotional" vor "emo")
  if (VIBE_KEYWORDS.has(lower)) return "vibe";
  
  // 2. Exakte Genre-Keywords
  if (GENRE_EXACT.has(lower)) return "genre";
  
  // 3. Word-Boundary-Matching für Genre
  for (const kw of GENRE_EXACT) {
    const regex = new RegExp(`(^|[^a-z])${kw}([^a-z]|$)`, "i");
    if (regex.test(lower)) return "genre";
  }
  
  // 4. Substring-Matches für längere Genre-Keywords
  for (const kw of GENRE_KEYWORDS) {
    if (kw.length >= 4 && lower.includes(kw)) return "genre";
  }
  
  // 5. Instrument-Keywords
  for (const kw of INSTRUMENT_KEYWORDS) {
    if (lower.includes(kw)) return "instrument";
  }
  
  // 6. Vibe-Keywords (Substring)
  for (const kw of VIBE_KEYWORDS) {
    if (lower.includes(kw)) return "vibe";
  }
  
  return "other";
}

export function getTagColors(tag: string): TagColors {
  const category = getTagCategory(tag);
  return TAG_COLORS[category];
}

export function getTagInfo(tag: string): { category: TagCategory; colors: TagColors } {
  const category = getTagCategory(tag);
  return { category, colors: TAG_COLORS[category] };
}

// ─────────────────────────────────────────────────────────────────────────────────
// Preset Tags for Quick-Add UI
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

export const ALL_PRESETS: TagPreset[] = (
  Object.entries(PRESET_TAGS) as [Exclude<TagCategory, "custom">, string[]][]
).flatMap(([category, tags]) =>
  tags.map(tag => ({ tag, category }))
);

export const ALL_PRESET_NAMES: string[] = ALL_PRESETS.map(p => p.tag);

// ─────────────────────────────────────────────────────────────────────────────────
// Search Functions
// ─────────────────────────────────────────────────────────────────────────────────

export function searchPresetTags(query: string): TagPreset[] {
  if (!query.trim()) return ALL_PRESETS;
  const lower = query.toLowerCase();
  return ALL_PRESETS.filter(preset => preset.tag.toLowerCase().includes(lower));
}

export function searchAllTags(query: string, customTags: CustomTag[]): TagPreset[] {
  const presets = searchPresetTags(query);
  
  const customPresets: TagPreset[] = customTags
    .filter(ct => ct.display_name.toLowerCase().includes(query.toLowerCase()))
    .map(ct => ({ tag: ct.display_name, category: ct.category }));
  
  const presetNames = new Set(presets.map(p => p.tag.toLowerCase()));
  const uniqueCustom = customPresets.filter(cp => !presetNames.has(cp.tag.toLowerCase()));
  
  return [...presets, ...uniqueCustom];
}

export function searchPresetTagsGrouped(query: string): Record<TagCategory, string[]> {
  const filtered = searchPresetTags(query);
  const result: Record<TagCategory, string[]> = {
    genre: [], vibe: [], instrument: [], custom: [], other: [],
  };
  for (const preset of filtered) {
    result[preset.category].push(preset.tag);
  }
  return result;
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

// ─────────────────────────────────────────────────────────────────────────────────
// Category Labels & Icons
// ─────────────────────────────────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<TagCategory, string> = {
  genre: "Genre",
  vibe: "Vibe",
  instrument: "Instrument",
  custom: "Custom",
  other: "Other",
};

export const CATEGORY_ICONS: Record<TagCategory, string> = {
  genre: "Music",
  vibe: "Sparkles",
  instrument: "Piano",
  custom: "Star",
  other: "Tag",
};

// ─────────────────────────────────────────────────────────────────────────────────
// Custom Tag Helpers
// ─────────────────────────────────────────────────────────────────────────────────

export function isPresetTag(tag: string): boolean {
  const lower = tag.toLowerCase();
  return ALL_PRESETS.some(p => p.tag.toLowerCase() === lower);
}

export function prepareCustomTagForDb(tag: string): {
  tag: string;
  display_name: string;
  category: TagCategory;
} {
  const displayName = normalizeTag(tag);
  const detectedCategory = getTagCategory(tag);
  
  // Custom Tags bekommen "custom" wenn sie keine bekannte Kategorie matchen
  const category = detectedCategory === "other" && !isPresetTag(tag) 
    ? "custom" as TagCategory
    : detectedCategory;
  
  return {
    tag: normalizeTagForDb(tag),
    display_name: displayName,
    category,
  };
}