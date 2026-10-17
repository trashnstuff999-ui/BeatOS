// src/components/ui/index.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Shared UI Components
// Status pills live in components/Tagpill.tsx (StatusPill) — single source
// for status colors is STATUS_CONFIG in lib/theme.ts.
// ═══════════════════════════════════════════════════════════════════════════════

import React from "react";
import { C, radius } from "../../lib/theme";

export { Button, IconButton } from "./Button";
export type { ButtonVariant, ButtonSize } from "./Button";
export { Modal, useEscapeStack } from "./Modal";
export { PageHeader, PAGE_HEADER_HEIGHT } from "./PageHeader";
export { PageBody } from "./PageBody";
export { EmptyState } from "./EmptyState";
export { SectionCard, SectionIconBtn } from "./SectionCard";
export { Dropdown, Select } from "./Dropdown";
export { Segmented } from "./Segmented";
export type { SegmentedOption } from "./Segmented";

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
      borderRadius: radius.card,
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
      fontSize: 11, fontWeight: 700,
      letterSpacing: "0.08em", textTransform: "uppercase",
      color: C.onSecondaryFixedVar,
      marginBottom: 12,
      display: "block",
      ...style,
    }}>
      {children}
    </label>
  );
}
