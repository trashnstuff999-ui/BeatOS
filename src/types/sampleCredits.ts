// src/types/sampleCredits.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Sample-Credits — fremde Samples in der Beschreibung nennen
// ═══════════════════════════════════════════════════════════════════════════════
// Spiegelt src-tauri/src/commands/sample_credits.rs.

/** Ein Eintrag im Adressbuch der Sample-Geber. */
export interface SampleProducer {
  /** `null` heißt: neu anlegen */
  id: number | null;
  name: string;
  instagram_url: string;
  beatstars_url: string;
  soundcloud_url: string;
  youtube_url: string;
  /** Auf wie vielen Beats er genannt ist — nur beim Lesen gefüllt */
  use_count: number;
}

/** Ein Sample-Geber an einem bestimmten Beat. */
export interface BeatSampleCredit {
  producer_id: number;
  /** Freitext: „Guitarsample", „Drumloop". Wechselt von Beat zu Beat. */
  contribution: string;
  /** Nur beim Lesen gefüllt, kommt aus dem Adressbuch */
  producer_name: string;
}

export const LEERER_PRODUZENT: SampleProducer = {
  id: null,
  name: "",
  instagram_url: "",
  beatstars_url: "",
  soundcloud_url: "",
  youtube_url: "",
  use_count: 0,
};
