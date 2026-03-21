// src/lib/tags.ts
// ═══════════════════════════════════════════════════════════════════════════════
// BeatOS Tag System — Zentrale Tag-Verwaltung für alle Komponenten
// ═══════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────────

export type TagCategory = "genre" | "vibe" | "instrument" | "other";

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
  other: {
    text: "#c084fc",
    bg: "rgba(192,132,252,0.10)",
    border: "rgba(192,132,252,0.30)",
  },
};

// ─────────────────────────────────────────────────────────────────────────────────
// Keyword Detection Sets
// Diese werden verwendet um Tags automatisch zu kategorisieren
// WICHTIG: Exakte Matches werden zuerst geprüft, dann Substring-Matches
// ─────────────────────────────────────────────────────────────────────────────────

// EXAKTE Genre-Keywords (müssen exakt matchen oder am Wortanfang/-ende stehen)
const GENRE_EXACT = new Set([
  "emo", "trap", "drill", "phonk", "rage", "plugg", "pluggnb", "cloud",
  "dnb", "edm", "rnb", "r&b", "lofi", "lo-fi",
]);

// Alle Genre-Keywords (für Substring-Match)
const GENRE_KEYWORDS = new Set([
  // ── Hip-Hop / Rap Core ─────────────────────────────────────────────────────
  "trap", "hiphop", "hip-hop", "rap", "boom-bap", "boombap", "old-school",
  "memphis", "crunk", "southern", "east-coast", "west-coast", "g-funk",
  
  // ── Modern Trap Subgenres ──────────────────────────────────────────────────
  "drill", "uk-drill", "ny-drill", "chicago-drill", "brooklyn-drill",
  "phonk", "drift-phonk", "brazilian-phonk", "memphis-phonk",
  "rage", "rage-beat", "plugg", "pluggnb", "plug", "detroit",
  "flint", "scam-rap", "tread", "jerk",
  
  // ── Cloud / Ethereal ───────────────────────────────────────────────────────
  "cloud", "cloud-rap", "opium", "hyperpop", "digicore", "glitchcore", "webcore",
  
  // ── Emo / Alternative Rap (WICHTIG: "emo-rap" nicht "emo" allein für Substring)
  "emo-rap", "sad-rap", "melodic-rap",
  "juice-wrld", "juicewrld", "lil-peep", "lilpeep", "xxxtentacion",
  "trippie", "trippie-redd", "iann-dior",
  
  // ── R&B / Soul ─────────────────────────────────────────────────────────────
  "rnb", "r&b", "soul", "neo-soul", "alt-rnb", "alternative-rnb",
  "pnb-rock", "6lack", "bryson-tiller", "frank-ocean",
  
  // ── Electronic / EDM ───────────────────────────────────────────────────────
  "edm", "house", "deep-house", "tech-house", "progressive",
  "techno", "minimal", "industrial", "ebm",
  "trance", "psytrance", "progressive-trance",
  "dubstep", "brostep", "riddim", "tearout",
  "dnb", "drum-and-bass", "jungle", "liquid", "neurofunk",
  "garage", "uk-garage", "2-step", "speed-garage",
  "bass", "future-bass", "wave", "hardwave",
  "future", "future-bounce",
  
  // ── Lo-Fi / Chill ──────────────────────────────────────────────────────────
  "lofi", "lo-fi", "chillhop", "jazzhop", "study-beats",
  "chillwave", "downtempo", "trip-hop", "abstract",
  
  // ── Synthwave / Retro ──────────────────────────────────────────────────────
  "synthwave", "retrowave", "outrun", "darksynth",
  "vaporwave", "future-funk", "city-pop",
  "darkwave", "coldwave", "post-punk", "goth",
  
  // ── Rock / Punk / Metal ────────────────────────────────────────────────────
  "rock", "alt-rock", "alternative-rock", "indie", "indie-rock",
  "punk", "pop-punk", "emo-rock", "post-hardcore", "screamo", "metalcore",
  "grunge", "nirvana",
  "metal", "nu-metal", "heavy-metal", "deathcore",
  "hardcore", "beatdown",
  
  // ── Pop ────────────────────────────────────────────────────────────────────
  "pop", "dance-pop", "electropop", "synth-pop",
  "indie-pop", "bedroom-pop", "dream-pop", "art-pop",
  "darkpop", "alt-pop", "alternative-pop",
  "k-pop", "j-pop",
  
  // ── World / Regional ───────────────────────────────────────────────────────
  "afrobeats", "afropop", "afrotrap", "afro", "amapiano",
  "dancehall", "reggae", "dub", "ska",
  "reggaeton", "latin", "latin-trap", "dembow", "baile-funk",
  "uk", "grime", "uk-rap", "british",
  "french", "german", "spanish",
  
  // ── Jazz / Blues / Classical ───────────────────────────────────────────────
  "jazz", "jazz-rap", "smooth-jazz", "bebop", "fusion",
  "blues", "delta-blues", "chicago-blues",
  "classical", "orchestral", "cinematic", "film-score",
  "neo-classical", "chamber", "baroque",
  "gospel", "spiritual", "church",
  
  // ── Country / Folk / Acoustic ──────────────────────────────────────────────
  "country", "country-trap", "folk", "americana",
  "bluegrass", "acoustic", "singer-songwriter",
  "ballad", "power-ballad",
  
  // ── Ambient / Experimental ─────────────────────────────────────────────────
  "ambient", "drone", "soundscape", "atmospheric",
  "experimental", "avant-garde", "noise", "glitch",
]);

const INSTRUMENT_KEYWORDS = new Set([
  // ── Drums / Percussion ─────────────────────────────────────────────────────
  "808", "808s", "drums", "drum", "percussion", "perc",
  "hi-hats", "hihats", "hats", "snare", "kick", "clap",
  "trap-drums", "live-drums", "acoustic-drums", "breakbeat",
  "rimshot", "tom", "cymbal", "shaker", "tambourine",
  
  // ── Bass ───────────────────────────────────────────────────────────────────
  "sub-bass", "sub", "808-bass", "reese",
  "synth-bass", "wobble", "growl",
  
  // ── Keys / Piano ───────────────────────────────────────────────────────────
  "piano", "keys", "keyboard", "rhodes", "wurlitzer",
  "organ", "church-organ", "b3", "electric-piano", "epiano",
  "grand-piano", "upright",
  
  // ── Synths ─────────────────────────────────────────────────────────────────
  "synth", "synthesizer", "analog", "digital",
  "pad", "pads", "ambient-pad", "lush",
  "lead", "synth-lead", "supersaw", "saw",
  "pluck", "plucks", "arp", "arpeggio", "arpeggiated",
  "stab", "stabs", "chord-stab",
  
  // ── Strings ────────────────────────────────────────────────────────────────
  "strings", "violin", "viola", "cello", "contrabass",
  "orchestra", "orchestral-strings", "string-section",
  "pizzicato", "legato", "staccato", "tremolo",
  "harp", "harpsichord",
  
  // ── Brass / Woodwinds ──────────────────────────────────────────────────────
  "brass", "horn", "horns", "trumpet", "trombone", "tuba",
  "saxophone", "sax", "alto-sax", "tenor-sax",
  "flute", "clarinet", "oboe", "bassoon",
  
  // ── Guitar ─────────────────────────────────────────────────────────────────
  "guitar", "acoustic-guitar", "electric-guitar", "clean-guitar",
  "distorted", "distortion", "overdrive", "crunch",
  "riff", "power-chord", "palm-mute", "shred",
  "fingerpick", "fingerstyle", "nylon",
  "ukulele", "banjo", "mandolin",
  
  // ── Vocals / Choir ─────────────────────────────────────────────────────────
  "vocal", "vocals", "voice", "vox", "acapella",
  "choir", "choral", "chorus", "harmony", "harmonies",
  "vocal-chop", "vocal-sample", "vocal-hook",
  "autotune", "vocoder", "talkbox",
  
  // ── Samples / Loops ────────────────────────────────────────────────────────
  "sample", "sampled", "loop", "loops", "chop", "chopped",
  "vinyl", "dusty", "vintage", "retro",
  "foley", "fx", "sfx", "sound-design",
  
  // ── Specific Elements ──────────────────────────────────────────────────────
  "bell", "bells", "chime", "glockenspiel", "xylophone", "marimba",
  "kalimba", "music-box", "celesta",
  "sitar", "tabla", "ethnic", "world",
  "chord", "chords", "progression",
]);

const VIBE_KEYWORDS = new Set([
  // ── Emotional Spectrum (WICHTIG: "emotional" hier, nicht in genre) ─────────
  "emotional", "emotive", "feelsy", "in-my-feels",
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
  
  // ── Energy Levels ──────────────────────────────────────────────────────────
  "energetic", "energy", "hype", "hyped", "turnt", "lit",
  "calm", "chill", "relaxed", "relaxing", "laid-back", "mellow",
  "intense", "intensity", "explosive", "powerful", "hard",
  "soft", "gentle", "tender", "delicate", "subtle",
  "heavy", "crushing", "massive", "huge", "big",
  "light", "airy", "floating", "weightless",
  
  // ── Atmosphere ─────────────────────────────────────────────────────────────
  "dark", "darkness", "sinister", "evil", "demonic", "devilish",
  "bright", "sunny", "warm", "summer", "tropical",
  "cold", "icy", "frozen", "winter", "arctic",
  "moody", "mood", "spacey", "cosmic",
  "dreamy", "dream", "surreal", "ethereal", "otherworldly",
  "mysterious", "mystery", "enigmatic", "cryptic",
  "epic", "cinematic", "dramatic", "theatrical", "grandiose",
  "raw", "gritty", "dirty", "grimey", "grimy", "street",
  "clean", "polished", "crisp", "pristine", "refined",
  
  // ── Descriptive ────────────────────────────────────────────────────────────
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
  
  // ── Time / Era ─────────────────────────────────────────────────────────────
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

/**
 * Kategorisiert einen Tag basierend auf Keywords.
 * 
 * WICHTIG: Verwendet Word-Boundary-Matching für kurze Keywords wie "emo"
 * um False Positives wie "emotional" → genre zu vermeiden.
 * 
 * @example
 * getTagCategory("trap")       // → "genre"
 * getTagCategory("emo-rap")    // → "genre"
 * getTagCategory("emo")        // → "genre" (exakter Match)
 * getTagCategory("emotional")  // → "vibe" (NICHT genre!)
 * getTagCategory("dark")       // → "vibe"
 * getTagCategory("808")        // → "instrument"
 */
export function getTagCategory(tag: string): TagCategory {
  const lower = tag.toLowerCase().trim();
  
  // 1. Zuerst: Exakte Matches für Vibe-Keywords prüfen
  //    (um "emotional" vor "emo" zu schützen)
  if (VIBE_KEYWORDS.has(lower)) return "vibe";
  
  // 2. Exakte Genre-Keywords (kurze, problematische wie "emo")
  if (GENRE_EXACT.has(lower)) return "genre";
  
  // 3. Word-Boundary-Matching für Genre
  //    "emo-rap" matched "emo" am Wortanfang
  //    "emotional" matched NICHT "emo" (kein Boundary nach "emo")
  for (const kw of GENRE_EXACT) {
    // Prüfe ob Keyword am Anfang steht gefolgt von Nicht-Buchstabe
    const regex = new RegExp(`(^|[^a-z])${kw}([^a-z]|$)`, "i");
    if (regex.test(lower)) return "genre";
  }
  
  // 4. Normale Substring-Matches für längere Genre-Keywords
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

/**
 * Gibt die Farben für einen Tag zurück
 */
export function getTagColors(tag: string): TagColors {
  const category = getTagCategory(tag);
  return TAG_COLORS[category];
}

/**
 * Gibt sowohl Kategorie als auch Farben zurück
 */
export function getTagInfo(tag: string): { category: TagCategory; colors: TagColors } {
  const category = getTagCategory(tag);
  return {
    category,
    colors: TAG_COLORS[category],
  };
}

// ─────────────────────────────────────────────────────────────────────────────────
// Preset Tags for Quick-Add UI
// Kuratierte Liste der häufigsten/nützlichsten Tags
// ─────────────────────────────────────────────────────────────────────────────────

export const PRESET_TAGS: Record<TagCategory, string[]> = {
  genre: [
    // Row 1: Trap & Subgenres
    "Trap", "Drill", "Phonk", "Rage", "Pluggnb", "Opium",
    // Row 2: Melodic / Emo
    "Melodic", "Emo-Rap", "Sad-Rap", "Cloud",
    // Row 3: Alternative
    "Pop-Punk", "Rock", "Grunge", "Indie", "Alternative-Rock",
    // Row 4: R&B / Soul
    "R&B", "Soul", "Neo-Soul",
    // Row 5: Electronic
    "Lo-Fi", "Ambient", "Synthwave", "Hyperpop",
    // Row 6: Other popular
    "Boom-Bap", "Cinematic", "Orchestral", "Afrobeats", "Latin",
  ],
  
  vibe: [
    // Emotional
    "Dark", "Sad", "Emotional", "Melancholic", "Lonely",
    // Energy
    "Hype", "Aggressive", "Heavy", "Hard", "Intense",
    // Chill
    "Chill", "Dreamy", "Smooth", "Mellow", "Relaxed",
    // Atmosphere
    "Moody", "Atmospheric", "Epic", "Cinematic",
    // Descriptive
    "Bouncy", "Groovy", "Trippy", "Raw", "Gritty",
    // Other
    "Nostalgic", "Triumphant", "Haunting", "Late-Night",
  ],
  
  instrument: [
    // Drums
    "808", "Hard-Drums", "Live-Drums", "Percussion",
    // Keys
    "Piano", "Keys", "Rhodes", "Organ",
    // Synths
    "Synth", "Pad", "Lead", "Pluck", "Arp",
    // Strings
    "Strings", "Violin", "Cello", "Orchestra",
    // Guitar
    "Guitar", "Electric-Guitar", "Acoustic-Guitar", "Distorted",
    // Vocals
    "Vocals", "Choir", "Vocal-Chops",
    // Other
    "Brass", "Flute", "Bell", "Sample",
  ],
  
  other: [
    // Artist Type-Beats
    "Type-Beat",
    // Tempo/Energy descriptors
    "Fast", "Slow", "Mid-Tempo",
    // Production style
    "Minimalist", "Complex", "Experimental",
    // Use case
    "Freestyle", "Hook", "Verse", "Intro", "Outro",
  ],
};

/**
 * Flache Liste aller Preset-Tags mit ihrer Kategorie
 */
export const ALL_PRESETS: TagPreset[] = (
  Object.entries(PRESET_TAGS) as [TagCategory, string[]][]
).flatMap(([category, tags]) =>
  tags.map(tag => ({ tag, category }))
);

/**
 * Nur die Tag-Namen als flache Liste
 */
export const ALL_PRESET_NAMES: string[] = ALL_PRESETS.map(p => p.tag);

// ─────────────────────────────────────────────────────────────────────────────────
// Search / Filter Functions
// ─────────────────────────────────────────────────────────────────────────────────

/**
 * Filtert Preset-Tags basierend auf Sucheingabe
 */
export function searchPresetTags(query: string): TagPreset[] {
  if (!query.trim()) return ALL_PRESETS;
  
  const lower = query.toLowerCase();
  return ALL_PRESETS.filter(preset =>
    preset.tag.toLowerCase().includes(lower)
  );
}

/**
 * Kombiniert Presets mit Custom Tags und filtert
 */
export function searchAllTags(query: string, customTags: CustomTag[]): TagPreset[] {
  const presets = searchPresetTags(query);
  
  // Custom Tags zu TagPreset konvertieren
  const customPresets: TagPreset[] = customTags
    .filter(ct => ct.display_name.toLowerCase().includes(query.toLowerCase()))
    .map(ct => ({ tag: ct.display_name, category: ct.category }));
  
  // Duplikate entfernen (Presets haben Priorität)
  const presetNames = new Set(presets.map(p => p.tag.toLowerCase()));
  const uniqueCustom = customPresets.filter(
    cp => !presetNames.has(cp.tag.toLowerCase())
  );
  
  return [...presets, ...uniqueCustom];
}

/**
 * Filtert und gruppiert nach Kategorie
 */
export function searchPresetTagsGrouped(query: string): Record<TagCategory, string[]> {
  const filtered = searchPresetTags(query);
  
  const result: Record<TagCategory, string[]> = {
    genre: [],
    vibe: [],
    instrument: [],
    other: [],
  };
  
  for (const preset of filtered) {
    result[preset.category].push(preset.tag);
  }
  
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────────
// Tag Normalization
// ─────────────────────────────────────────────────────────────────────────────────

/**
 * Normalisiert einen Tag für konsistente Anzeige
 * - Trimmed
 * - Title Case für Display
 * 
 * @example
 * normalizeTag("emo rap")     // → "Emo-Rap"
 * normalizeTag("DARK")        // → "Dark"
 * normalizeTag("pop-punk")    // → "Pop-Punk"
 */
export function normalizeTag(tag: string): string {
  return tag
    .trim()
    .split(/[-\s]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("-");
}

/**
 * Normalisiert für DB-Speicherung (lowercase)
 */
export function normalizeTagForDb(tag: string): string {
  return tag.trim().toLowerCase();
}

/**
 * Parsed einen komma-separierten Tag-String aus der DB
 */
export function parseTagString(tagString: string | null | undefined): string[] {
  if (!tagString) return [];
  return tagString
    .split(",")
    .map(t => normalizeTag(t.trim()))
    .filter(t => t.length > 0);
}

/**
 * Konvertiert Tag-Array zu komma-separiertem String für DB
 */
export function tagsToString(tags: string[]): string {
  return tags.map(normalizeTagForDb).join(", ");
}

// ─────────────────────────────────────────────────────────────────────────────────
// Category Display Names & Icons
// ─────────────────────────────────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<TagCategory, string> = {
  genre: "Genre",
  vibe: "Vibe",
  instrument: "Instrument",
  other: "Other",
};

/**
 * Lucide icon name for each category
 */
export const CATEGORY_ICONS: Record<TagCategory, string> = {
  genre: "Music",
  vibe: "Sparkles",
  instrument: "Piano",
  other: "Tag",
};

// ─────────────────────────────────────────────────────────────────────────────────
// Custom Tag Helpers (für DB-Integration)
// ─────────────────────────────────────────────────────────────────────────────────

/**
 * Prüft ob ein Tag bereits in Presets existiert
 */
export function isPresetTag(tag: string): boolean {
  const lower = tag.toLowerCase();
  return ALL_PRESETS.some(p => p.tag.toLowerCase() === lower);
}

/**
 * Bereitet einen Custom Tag für DB-Insert vor
 */
export function prepareCustomTagForDb(tag: string): {
  tag: string;
  display_name: string;
  category: TagCategory;
} {
  const displayName = normalizeTag(tag);
  return {
    tag: normalizeTagForDb(tag),
    display_name: displayName,
    category: getTagCategory(tag),
  };
}