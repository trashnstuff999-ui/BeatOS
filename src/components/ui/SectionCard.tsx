// src/components/upload/SectionCard.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Card shell for the Upload tab: icon + Title-Case header + right action slot.
// Replaces the old <Card accent> (right accent bar, uppercase micro label).
// Micro-uppercase labels stay reserved for field labels INSIDE the cards —
// section headers read as real titles, which is what creates hierarchy.
// ═══════════════════════════════════════════════════════════════════════════════

import React from "react";
import { C } from "../../lib/theme";

interface SectionCardProps {
  icon?: React.ElementType;
  title: string;
  /** Right-aligned header slot for icon buttons etc. */
  actions?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function SectionCard({ icon: Icon, title, actions, children, style }: SectionCardProps) {
  return (
    <section style={{
      background: C.surfaceContainerLow,
      border: `1px solid ${C.border10}`,
      borderRadius: 12,
      padding: 20,
      boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
      ...style,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        marginBottom: 16,
      }}>
        {Icon && <Icon size={13} color={C.onSecondaryFixedVar} strokeWidth={1.75} />}
        {/* Eine Stufe leiser als der Inhalt: die Karte grenzt sich durch ihre
            Flaeche schon ab. Vorher war die Ueberschrift genauso laut wie das,
            worum es in der Karte geht. */}
        <h3 style={{
          margin: 0, flex: 1,
          fontSize: 11, fontWeight: 700,
          color: C.onSurfaceVariant,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}>
          {title}
        </h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Small icon button for SectionCard action slots. */
export function SectionIconBtn({ icon: Icon, title, onClick, disabled }: {
  icon: React.ElementType;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        width: 26, height: 26, borderRadius: 6,
        background: "transparent",
        border: `1px solid ${C.border15}`,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: C.onSurfaceVariant,
        opacity: disabled ? 0.5 : 1,
        transition: "border-color 0.15s, color 0.15s",
      }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.borderColor = C.border30; e.currentTarget.style.color = C.onSurface; } }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border15; e.currentTarget.style.color = C.onSurfaceVariant; }}
    >
      <Icon size={13} strokeWidth={1.75} />
    </button>
  );
}
