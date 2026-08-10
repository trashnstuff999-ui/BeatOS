// src/components/ui/EmptyState.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// „Hier ist noch nichts". Vorher hatte jede Stelle ihre eigene Fassung: zwei
// davon auf pechschwarzem #000 mit 80px Polsterung (die wirkten wie Loecher im
// Layout), eine auf hartkodiertem #181717, zwei als nackter Text ohne Flaeche.
//
// Zwei Varianten, weil es zwei echte Faelle gibt:
//   card   — der Bereich ist als Ganzes leer (eigene Flaeche, gestrichelter Rand)
//   inline — leer INNERHALB einer Karte, die schon einen Rahmen hat (nur Text)
//
// Die Hoehe kommt vom Inhalt. Ein leerer Zustand soll melden, dass etwas fehlt,
// nicht den halben Bildschirm besetzen.
// ═══════════════════════════════════════════════════════════════════════════════

import React from "react";
import { C, radius } from "../../lib/theme";

interface EmptyStateProps {
  icon?: React.ElementType;
  title: string;
  description?: React.ReactNode;
  /** Genau eine Handlung, meist ein <Button variant="primary">. */
  action?: React.ReactNode;
  variant?: "card" | "inline";
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = "card",
}: EmptyStateProps) {
  const isCard = variant === "card";

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      gap: 10,
      padding: isCard ? "48px 24px" : "32px 16px",
      textAlign: "center",
      ...(isCard ? {
        background: C.surfaceContainerLow,
        border: `1px dashed ${C.border20}`,
        borderRadius: radius.card,
      } : null),
    }}>
      {Icon && <Icon size={28} color={C.onSecondaryFixedVar} strokeWidth={1.25} />}

      <div style={{ fontSize: 13, fontWeight: 600, color: C.onSurface }}>
        {title}
      </div>

      {description && (
        <div style={{
          fontSize: 12, color: C.onSurfaceVariant,
          lineHeight: 1.6, maxWidth: 420,
        }}>
          {description}
        </div>
      )}

      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  );
}
