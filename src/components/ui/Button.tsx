// src/components/ui/Button.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Der eine Button. Vorher gab es 142 handgestylte <button>-Elemente mit zehn
// Radien und sechzehn Schriftgroessen — deshalb sah dieselbe Aktion auf zwei
// Seiten verschieden aus.
//
// Regel fuer die Varianten:
//   primary   — genau eine pro Bildschirm. Die Handlung, um die es hier geht.
//   secondary — begleitende Handlung mit Rahmen (Abbrechen, Verwerfen).
//   ghost     — Nebensache ohne Rahmen (Icon-Leisten, Kopfzeilen).
//   danger    — loescht oder verwirft unwiederbringlich.
// ═══════════════════════════════════════════════════════════════════════════════

import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { C, radius } from "../../lib/theme";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Lucide-Icon links vom Text. Waehrend `loading` durch den Spinner ersetzt. */
  icon?: React.ElementType;
  /** Zeigt den Spinner und sperrt den Button. */
  loading?: boolean;
  children?: React.ReactNode;
}

const SIZES = {
  sm: { padding: "6px 12px",  fontSize: 11, gap: 6, icon: 13 },
  md: { padding: "10px 20px", fontSize: 12, gap: 8, icon: 14 },
} as const;

/** [Ruhe, Hover] je Variante. Deaktiviert wird weiter unten einheitlich gesetzt. */
const VARIANTS: Record<ButtonVariant, { rest: React.CSSProperties; hover: React.CSSProperties; weight: number }> = {
  primary: {
    rest:  { background: C.primary, color: C.onPrimary, border: "1px solid transparent" },
    hover: { background: C.primaryContainer },
    weight: 700,
  },
  secondary: {
    rest:  { background: "transparent", color: C.onSurfaceVariant, border: `1px solid ${C.border30}` },
    hover: { color: C.onSurface, borderColor: C.outlineVariant },
    weight: 600,
  },
  ghost: {
    rest:  { background: "transparent", color: C.onSurfaceVariant, border: "1px solid transparent" },
    hover: { background: C.surfaceContainerHigh, color: C.onSurface },
    weight: 600,
  },
  danger: {
    rest:  { background: "rgba(255,115,81,0.10)", color: C.error, border: "1px solid rgba(255,115,81,0.30)" },
    hover: { background: "rgba(255,115,81,0.18)", borderColor: "rgba(255,115,81,0.50)" },
    weight: 600,
  },
};

export function Button({
  variant = "secondary",
  size = "md",
  icon: Icon,
  loading = false,
  disabled,
  children,
  style,
  ...rest
}: ButtonProps) {
  const [hover, setHover] = useState(false);
  const s = SIZES[size];
  const v = VARIANTS[variant];
  const isOff = disabled || loading;

  // Deaktiviert: primary verliert die Flaeche (sonst schreit ein toter Button
  // genauso laut wie ein lebender), der Rest wird nur blasser.
  const offStyle: React.CSSProperties =
    variant === "primary"
      ? { background: C.surfaceContainer, color: C.onSecondaryFixedVar, border: "1px solid transparent" }
      : { opacity: 0.45 };

  return (
    <button
      {...rest}
      disabled={isOff}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        gap: s.gap,
        padding: s.padding,
        borderRadius: radius.control,
        fontSize: s.fontSize,
        fontWeight: v.weight,
        fontFamily: "inherit",
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
        cursor: isOff ? "not-allowed" : "pointer",
        transition: "background 0.15s, border-color 0.15s, color 0.15s",
        ...v.rest,
        ...(hover && !isOff ? v.hover : null),
        ...(isOff ? offStyle : null),
        ...style,
      }}
    >
      {loading
        ? <Loader2 size={s.icon} style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
        : Icon && <Icon size={s.icon} strokeWidth={1.75} style={{ flexShrink: 0 }} />}
      {children}
    </button>
  );
}

/** Quadratischer Button, der nur ein Icon traegt (Schliessen, Refresh, Papierkorb). */
export function IconButton({
  icon: Icon,
  variant = "ghost",
  size = 32,
  disabled,
  style,
  ...rest
}: Omit<ButtonProps, "size" | "children" | "icon" | "loading"> & {
  icon: React.ElementType;
  /** Kantenlaenge in px. */
  size?: number;
}) {
  const [hover, setHover] = useState(false);
  const v = VARIANTS[variant];

  return (
    <button
      {...rest}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: size, height: size, padding: 0,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        borderRadius: radius.control,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 0.15s, border-color 0.15s, color 0.15s",
        ...v.rest,
        ...(hover && !disabled ? v.hover : null),
        ...(disabled ? { opacity: 0.45 } : null),
        ...style,
      }}
    >
      <Icon size={Math.round(size * 0.45)} strokeWidth={1.75} />
    </button>
  );
}
