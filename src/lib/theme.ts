// src/lib/theme.ts
// ═══════════════════════════════════════════════════════════════════════════════
// BeatOS Design System — Zentrale Design Tokens
// Eine Quelle der Wahrheit für alle Farben, Spacing, etc.
// ═══════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────────
// Color Tokens
// ─────────────────────────────────────────────────────────────────────────────────

export const colors = {
  // ── Background Hierarchy (dunkel → hell) ───────────────────────────────────
  background:              "#0e0e0e",
  // Nicht reines Schwarz. #000000 lag 14 Stufen unter dem Seitenhintergrund,
  // waehrend alle anderen Schritte gleichmaessig rund 7 auseinanderliegen —
  // alles, was diese Flaeche benutzte, las sich dadurch als ausgestanztes
  // Loch statt als Element. Jetzt Teil derselben Reihe.
  surfaceContainerLowest:  "#0a0a0a",
  surfaceContainerLow:     "#131313",
  surfaceContainer:        "#1a1919",
  surfaceContainerHigh:    "#201f1f",
  surfaceContainerHighest: "#262626",

  // ── Primary (Amber/Orange) ─────────────────────────────────────────────────
  primary:          "#fda124",
  primaryContainer: "#e48c03",
  onPrimary:        "#4e2d00",

  // ── Secondary/Tertiary ─────────────────────────────────────────────────────
  tertiary:   "#9492ff",  // Lila — für Idea Status, Akzente
  mint:       "#34d399",  // Mint/Grün — für Tags, Success
  error:      "#ff7351",  // Rot/Orange — für Errors, Sold Status

  // ── Text Hierarchy ─────────────────────────────────────────────────────────
  onSurface:           "#ffffff",  // Primary text
  onSurfaceVariant:    "#adaaaa",  // Secondary text
  onSecondaryFixedVar: "#5c5b5b",  // Muted text, labels

  // ── Borders ────────────────────────────────────────────────────────────────
  outlineVariant: "#484847",
  border10:       "rgba(72,72,71,0.10)",
  border15:       "rgba(72,72,71,0.15)",
  border20:       "rgba(72,72,71,0.20)",
  border30:       "rgba(72,72,71,0.30)",
} as const;

// Shorthand alias für Komponenten
export const C = colors;

// ─────────────────────────────────────────────────────────────────────────────────
// Upload: Plattform- & Status-Farben — EINZIGE Quelle für den Upload-Bereich.
// Regeln: Plattformfarben nur an Icons/Punkten (kleine Flächen); Status nur aus
// der Status-Skala; Amber (primary) exklusiv für Primäraktionen + "Scheduled".
// ─────────────────────────────────────────────────────────────────────────────────

export type PlatformKey = "beatstars" | "soundcloud" | "youtube";

export const PLATFORM_CONFIG: Record<PlatformKey, { label: string; short: string; color: string }> = {
  // Magenta statt #ff3366 — war im Planner nicht von YouTube-Rot unterscheidbar
  beatstars:  { label: "Beatstars",  short: "BS", color: "#f43f8e" },
  soundcloud: { label: "SoundCloud", short: "SC", color: "#ff7700" },
  youtube:    { label: "YouTube",    short: "YT", color: "#ff0033" },
};

export const UPLOAD_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft:     { label: "Entwurf",     color: "#8a8a89", bg: "rgba(255,255,255,0.04)" },
  scheduled: { label: "Geplant", color: "#fda124", bg: "rgba(253,161,36,0.12)" },
  uploaded:  { label: "Hochgeladen",  color: "#34d399", bg: "rgba(52,211,153,0.12)" },
};

/**
 * Studio-Status. Die Stufe Idee → Exportiert → Bereit rechnet der Scan aus den
 * Dateien im Ordner; „Überarbeiten" und „Kann weg" vergibst nur du von Hand.
 *
 * „Kann weg" ist bewusst das Leiseste auf der Seite, nicht das Lauteste: bei
 * hundert markierten Projekten wäre eine Liste voll roter Pillen unlesbar und
 * die Warnung wertlos. Rot bleibt dem Papierkorb-Knopf, der wirklich etwas tut.
 */
export const STUDIO_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  idea:     { label: "Idee",         color: "#8a8a89", bg: "rgba(255,255,255,0.04)" },
  wip:      { label: "Überarbeiten", color: "#fda124", bg: "rgba(253,161,36,0.12)" },
  exported: { label: "Exportiert",   color: "#9492ff", bg: "rgba(148,146,255,0.12)" },
  ready:    { label: "Bereit",       color: "#34d399", bg: "rgba(52,211,153,0.12)" },
  discard:  { label: "Kann weg",     color: "#6b6a72", bg: "rgba(255,255,255,0.03)" },
};

// ─────────────────────────────────────────────────────────────────────────────────
// Status Configuration
// ─────────────────────────────────────────────────────────────────────────────────

export interface StatusConfig {
  key: string;
  label: string;
  color: string;
  bg: string;
  border: string;
}

export const STATUS_CONFIG: Record<string, StatusConfig> = {
  idea: {
    key: "idea",
    label: "Idee",
    color: "#9492ff",
    bg: "rgba(148,146,255,0.10)",
    border: "rgba(148,146,255,0.20)",
  },
  wip: {
    key: "wip",
    label: "In Arbeit",
    color: "#fda124",
    bg: "rgba(253,161,36,0.10)",
    border: "rgba(253,161,36,0.20)",
  },
  finished: {
    key: "finished",
    label: "Fertig",
    color: "#22c55e",
    bg: "rgba(34,197,94,0.10)",
    border: "rgba(34,197,94,0.20)",
  },
  sold: {
    key: "sold",
    label: "Verkauft",
    color: "#ff7351",
    bg: "rgba(255,115,81,0.10)",
    border: "rgba(255,115,81,0.20)",
  },
} as const;

// Array für Iteration (z.B. Status-Buttons)
export const STATUS_ITEMS = Object.values(STATUS_CONFIG);

// Helper um Status zu normalisieren
export function normalizeStatus(status: string | null | undefined): keyof typeof STATUS_CONFIG {
  if (!status) return "idea";
  const lower = status.toLowerCase().trim();
  if (lower in STATUS_CONFIG) return lower as keyof typeof STATUS_CONFIG;
  return "idea";
}

// ─────────────────────────────────────────────────────────────────────────────────
// Border Radius — drei Stufen, mehr braucht die App nicht.
// Vorher lagen im Code zehn verschiedene Werte (2,4,5,6,7,8,9,10,12,14,16), weil
// jede Komponente ihren eigenen erfunden hat. Wer hier einen vierten Wert
// vermisst, greift zur naechstliegenden Stufe.
// ─────────────────────────────────────────────────────────────────────────────────

export const radius = {
  /** Buttons, Inputs, Chips, kleine Icon-Flaechen */
  control: 6,
  /** Karten, Panels, Dialoge */
  card: 12,
  /** Pillen, Punkte, Avatare */
  full: 9999,
} as const;

// ─────────────────────────────────────────────────────────────────────────────────
// Typography
// ─────────────────────────────────────────────────────────────────────────────────

export const typography = {
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
  fontMono:   "Consolas, Monaco, 'Courier New', monospace",
  
  // Font Sizes
  xs:   10,
  sm:   12,
  base: 14,
  lg:   16,
  xl:   18,
  xxl:  24,
  hero: 30,
} as const;

// ─────────────────────────────────────────────────────────────────────────────────
// Common Styles (wiederverwendbare Style-Objekte)
// ─────────────────────────────────────────────────────────────────────────────────

export const commonStyles = {
  // Glassmorphism Header
  glassHeader: {
    background: "rgba(14,14,14,0.7)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
  } as React.CSSProperties,

  // Card Base
  card: {
    background: colors.surfaceContainerLow,
    borderRadius: radius.card,
    border: `1px solid ${colors.border10}`,
  } as React.CSSProperties,

  // Hover Border Effect
  cardHoverHandlers: {
    onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => {
      e.currentTarget.style.borderColor = colors.border30;
    },
    onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => {
      e.currentTarget.style.borderColor = colors.border10;
    },
  },

  // Input Base
  /** Eingabefelder.
   *
   *  Regel: **ein Feld hebt sich von seiner Karte ab, es versinkt nicht
   *  darin.** Karten liegen auf `surfaceContainerLow`, Felder also eine Stufe
   *  darueber. Vorher stand hier `surfaceContainerLowest` — auf einer Karte
   *  ergab das ein schwarzes Loch, und weil dieser Stil ueberall eingebunden
   *  ist, zog sich der Effekt durch die ganze App.
   *
   *  Die einzige Ausnahme sind Felder, die selbst schon auf
   *  `surfaceContainer` liegen (etwa in den Status-Kacheln des Upload-Tabs).
   *  Dort setzt die Stelle den Hintergrund selbst — entscheidend ist der
   *  Abstand zur eigenen Umgebung, nicht der absolute Wert. */
  input: {
    background: colors.surfaceContainer,
    border: `1px solid ${colors.border20}`,
    borderRadius: radius.control,
    color: colors.onSurface,
    fontFamily: typography.fontFamily,
    outline: "none",
    transition: "border-color 0.2s",
  } as React.CSSProperties,

  // Label Base
  label: {
    fontSize: typography.xs,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.15em",
    color: colors.onSecondaryFixedVar,
  } as React.CSSProperties,
} as const;

// ─────────────────────────────────────────────────────────────────────────────────
// Type Exports
// ─────────────────────────────────────────────────────────────────────────────────

export type StatusKey = keyof typeof STATUS_CONFIG;
export type Colors = typeof colors;