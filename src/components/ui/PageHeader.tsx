// src/components/ui/PageHeader.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Die eine Kopfzeile. Vorher hatte jede Seite ihre eigene Kopie: Dashboard 18px
// ohne Icon, Browse/Create/Upload/Studio 12px mit Icon, Settings ohne Icon,
// Support in Title-Case und ganz anderer Hoehe. Beim Tab-Wechsel sprang die
// Ueberschrift dadurch in Groesse und Position.
// ═══════════════════════════════════════════════════════════════════════════════

import React from "react";
import { C, commonStyles } from "../../lib/theme";

export const PAGE_HEADER_HEIGHT = 64;

interface PageHeaderProps {
  icon?: React.ElementType;
  title: string;
  /** Direkt neben dem Titel — Tabs, Reset-Button, Zaehler. */
  children?: React.ReactNode;
  /** Rechtsbuendig am Ende der Zeile. */
  actions?: React.ReactNode;
}

export function PageHeader({ icon: Icon, title, children, actions }: PageHeaderProps) {
  return (
    <header style={{
      height: PAGE_HEADER_HEIGHT, flexShrink: 0,
      ...commonStyles.glassHeader,
      display: "flex", alignItems: "center", gap: 20,
      padding: "0 32px",
      borderBottom: `1px solid ${C.border15}`,
      zIndex: 40,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        {Icon && <Icon size={16} color={C.primary} strokeWidth={1.75} />}
        <h1 style={{
          margin: 0,
          fontSize: 12, fontWeight: 700,
          letterSpacing: "0.2em", textTransform: "uppercase",
          color: C.onSurfaceVariant,
        }}>
          {title}
        </h1>
      </div>

      {children}

      <div style={{ flex: 1 }} />

      {actions && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </header>
  );
}
