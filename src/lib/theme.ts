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
  surfaceContainerLowest:  "#000000",
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
    label: "Idea",
    color: "#9492ff",
    bg: "rgba(148,146,255,0.10)",
    border: "rgba(148,146,255,0.20)",
  },
  wip: {
    key: "wip",
    label: "WIP",
    color: "#fda124",
    bg: "rgba(253,161,36,0.10)",
    border: "rgba(253,161,36,0.20)",
  },
  finished: {
    key: "finished",
    label: "Finished",
    color: "#22c55e",
    bg: "rgba(34,197,94,0.10)",
    border: "rgba(34,197,94,0.20)",
  },
  sold: {
    key: "sold",
    label: "Sold",
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
// Spacing System (8px Grid)
// ─────────────────────────────────────────────────────────────────────────────────

export const spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
} as const;

// ─────────────────────────────────────────────────────────────────────────────────
// Border Radius
// ─────────────────────────────────────────────────────────────────────────────────

export const radius = {
  sm:   4,
  md:   8,
  lg:   12,
  xl:   16,
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
    borderRadius: radius.lg,
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
  input: {
    background: colors.surfaceContainerLowest,
    border: `1px solid ${colors.border20}`,
    borderRadius: radius.md,
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