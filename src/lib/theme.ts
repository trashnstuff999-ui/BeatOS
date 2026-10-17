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
  /** Schrift auf einer Mint-Vollflaeche — das Gegenstueck zu onPrimary. */
  onMint:     "#064e3b",
  error:      "#ff7351",  // Rot/Orange — für Errors, Sold Status

  // ── Text Hierarchy ─────────────────────────────────────────────────────────
  onSurface:           "#ffffff",  // Primary text
  onSurfaceVariant:    "#adaaaa",  // Secondary text
  // Gedämpfter Text, Beschriftungen. War #5c5b5b — 2,7 : 1 auf den Karten,
  // bei 10–11 px neben FL Studio kaum zu lesen. #8a8786 erreicht 5,2 : 1 auf
  // Karten (#131313) und 4,9 : 1 auf Feldern (#1a1919), über der Grenze von
  // 4,5 : 1 für kleinen Text, und bleibt eine sichtbare Stufe unter #adaaaa.
  onSecondaryFixedVar: "#8a8786",

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
  scheduled: { label: "Geplant", color: colors.primary, bg: alpha(colors.primary, 0.12) },
  uploaded:  { label: "Hochgeladen",  color: colors.mint, bg: alpha(colors.mint, 0.12) },
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
  wip:      { label: "Überarbeiten", color: colors.primary, bg: alpha(colors.primary, 0.12) },
  exported: { label: "Exportiert",   color: colors.tertiary, bg: alpha(colors.tertiary, 0.12) },
  ready:    { label: "Bereit",       color: colors.mint, bg: alpha(colors.mint, 0.12) },
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
    color: colors.tertiary,
    bg: alpha(colors.tertiary, 0.10),
    border: alpha(colors.tertiary, 0.20),
  },
  wip: {
    key: "wip",
    label: "In Arbeit",
    color: colors.primary,
    bg: alpha(colors.primary, 0.10),
    border: alpha(colors.primary, 0.20),
  },
  finished: {
    key: "finished",
    label: "Fertig",
    color: "#22c55e",
    bg: alpha(colors.mint, 0.10),
    border: alpha(colors.mint, 0.20),
  },
  sold: {
    key: "sold",
    label: "Verkauft",
    color: colors.error,
    bg: alpha(colors.error, 0.10),
    border: alpha(colors.error, 0.20),
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
// Akzent als weiche Flaeche
//
// Das haeufigste Muster der App: eine Akzentfarbe als getoenter Kasten mit
// farbigem Rand und farbigem Text. Es stand rund neunzig Mal als ausgeschriebenes
// `rgba(253,161,36,0.12)` im Code — die Grundfarbe war damit an neunzig Stellen
// dupliziert, und `C.primary` zu aendern haette nichts davon erreicht.
//
// Zwei Rollen, an die sich neue Stellen halten sollen:
//   Flaeche  0.10 – 0.12   der getoente Hintergrund
//   Rand     0.30 – 0.35   die Kante darum
// Alles darueber (Hover, Vollton) ausdruecklich hinschreiben.
// ─────────────────────────────────────────────────────────────────────────────────

/** `alpha(C.primary, 0.12)` → `rgba(253,161,36,0.12)`. Nimmt #rgb und #rrggbb. */
export function alpha(farbe: string, a: number): string {
  const h = farbe.replace("#", "");
  const voll = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const n = parseInt(voll, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Die zwei Standardrollen auf einmal — deckt den Normalfall ohne Zahlen ab. */
export function akzent(farbe: string) {
  return {
    flaeche: alpha(farbe, 0.12),
    rand:    alpha(farbe, 0.32),
    text:    farbe,
  };
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

/**
 * Die Groessen, die die App wirklich benutzt.
 *
 * Der Block stand hier vorher mit einer erfundenen Skala (10/12/14/16/18/24/30)
 * und wurde von keiner einzigen Stelle importiert — waehrend im Code 18
 * verschiedene Groessen standen, darunter 8 px und 9 px. Ausgerechnet 11, die
 * haeufigste Groesse der App, fehlte in der Liste.
 *
 * Jetzt steht hier, was gilt. Geschrieben wird weiter als Zahl (`fontSize: 11`)
 * — 470 Stellen auf `typography.klein` umzuhaengen kostet Aufwand und aendert
 * kein Pixel. Der Wert dieser Liste ist die Regel, nicht die Umleitung:
 *
 *   10   Beschriftungen in Grossbuchstaben, Zaehler
 *   11   Bedienelemente, Tabellenzellen — der Standardfall
 *   12   Fliesstext, Eingabefelder
 *   13   Dialogtext
 *   14   Kartenueberschriften
 *   20   Zahlen, die fuer sich stehen (Kennzahlen, Beat-Titel)
 *   30+  nur das Dashboard, fuer die eine grosse Zahl
 *
 * Alles darunter ist auf einem dunklen Hintergrund nicht mehr lesbar.
 *
 * Beschriftungen in Grossbuchstaben: fett (700), Buchstabenabstand IMMER
 * 0.08em — vorher standen sieben verschiedene Werte von 0.04 bis 0.15em fuer
 * dieselbe Art Beschriftung. Einzige Ausnahme: der Seitentitel (0.2em).
 */
export const typography = {
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
  fontMono:   "Consolas, Monaco, 'Courier New', monospace",

  label:   10,
  control: 11,
  body:    12,
  dialog:  13,
  heading: 14,
  display: 20,
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
    fontSize: typography.label,
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