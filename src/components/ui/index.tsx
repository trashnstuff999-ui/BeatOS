// src/components/ui/index.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Shared UI Components
// Status pills live in components/Tagpill.tsx (StatusPill) — single source
// for status colors is STATUS_CONFIG in lib/theme.ts.
// ═══════════════════════════════════════════════════════════════════════════════

import React from "react";
import { C } from "../../lib/theme";

// ─── Card ───────────────────────────────────────────────────────────────────

interface CardProps {
  children: React.ReactNode;
  accent: string;
  style?: React.CSSProperties;
}

export function Card({ children, accent, style }: CardProps) {
  return (
    <section style={{
      background: C.surfaceContainerLow,
      borderRadius: 12,
      padding: 24,
      borderRight: `4px solid ${accent}`,
      boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
      ...style,
    }}>
      {children}
    </section>
  );
}

// ─── Label ──────────────────────────────────────────────────────────────────

interface LabelProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function Label({ children, style }: LabelProps) {
  return (
    <label style={{
      fontSize: 10, fontWeight: 700,
      letterSpacing: "0.15em", textTransform: "uppercase",
      color: C.onSecondaryFixedVar,
      marginBottom: 12,
      display: "block",
      ...style,
    }}>
      {children}
    </label>
  );
}
