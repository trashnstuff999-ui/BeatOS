// src/components/ui/index.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Shared UI Components
// ═══════════════════════════════════════════════════════════════════════════════

import React from "react";
import { C, commonStyles } from "../../lib/theme";

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

// ─── InputWrapper ───────────────────────────────────────────────────────────

interface InputWrapperProps {
  label: string;
  children: React.ReactNode;
}

export function InputWrapper({ label, children }: InputWrapperProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Label style={{ marginBottom: 0 }}>{label}</Label>
      {children}
    </div>
  );
}

// ─── SmallInput ─────────────────────────────────────────────────────────────

interface SmallInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  style?: React.CSSProperties;
}

export function SmallInput({ value, onChange, disabled, placeholder, style }: SmallInputProps) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      style={{
        ...commonStyles.input,
        padding: "10px 14px",
        fontSize: 14,
        fontWeight: 500,
        opacity: disabled ? 0.6 : 1,
        cursor: disabled ? "not-allowed" : "text",
        ...style,
      }}
    />
  );
}

// ─── Badge ──────────────────────────────────────────────────────────────────

interface BadgeProps {
  children: React.ReactNode;
  color?: string;
  background?: string;
  style?: React.CSSProperties;
}

export function Badge({ children, color = C.onSurfaceVariant, background = C.surfaceContainerHighest, style }: BadgeProps) {
  return (
    <span style={{
      fontSize: 9,
      fontWeight: 600,
      letterSpacing: "0.05em",
      textTransform: "uppercase",
      padding: "3px 8px",
      borderRadius: 4,
      color,
      background,
      ...style,
    }}>
      {children}
    </span>
  );
}

// ─── Status Badge ───────────────────────────────────────────────────────────

interface StatusBadgeProps {
  status: "idea" | "wip" | "finished" | "sold";
}

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  idea: { color: "#95a5a6", bg: "rgba(149,165,166,0.15)" },
  wip: { color: "#fda124", bg: "rgba(253,161,36,0.15)" },
  finished: { color: "#34d399", bg: "rgba(52,211,153,0.15)" },
  sold: { color: "#ef4444", bg: "rgba(239,68,68,0.15)" },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.idea;
  return (
    <Badge color={colors.color} background={colors.bg}>
      {status}
    </Badge>
  );
}
