// src/components/ui/index.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Shared UI Components
// Status pills live in components/Tagpill.tsx (StatusPill) — single source
// for status colors is STATUS_CONFIG in lib/theme.ts.
// ═══════════════════════════════════════════════════════════════════════════════

import React from "react";
import { C } from "../../lib/theme";

export { Button, IconButton } from "./Button";
export type { ButtonVariant, ButtonSize } from "./Button";
export { Modal } from "./Modal";
export { PageHeader, PAGE_HEADER_HEIGHT } from "./PageHeader";
export { PageBody } from "./PageBody";
export { EmptyState } from "./EmptyState";
export { SectionCard, SectionIconBtn } from "./SectionCard";

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

// ─── Select ─────────────────────────────────────────────────────────────────
// Dunkles Dropdown mit eigenem Chevron (appearance: none blendet das native aus).

interface SelectProps<T extends string> {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}

export function Select<T extends string>({ value, options, onChange }: SelectProps<T>) {
  return (
    <div style={{ position: "relative" }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value as T)}
        style={{
          background: C.surfaceContainerHighest,
          border: `1px solid ${C.border20}`,
          borderRadius: 6,
          padding: "4px 28px 4px 10px",
          fontSize: 11, fontWeight: 700,
          color: C.primary,
          appearance: "none", cursor: "pointer", outline: "none",
        }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}
            style={{ background: C.surfaceContainerHighest, color: C.onSurface }}>
            {o.label}
          </option>
        ))}
      </select>
      <div style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    </div>
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
