// src/components/upload/PlaceholderCard.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Placeholder for cards that will be implemented in Phase C / D.
// Renders the title + a "Coming soon" hint so the layout is already correct.
// ═══════════════════════════════════════════════════════════════════════════════

import { Lock } from "lucide-react";
import { C, radius } from "../../lib/theme";
import { Card, Label } from "../ui";

interface PlaceholderCardProps {
  title: string;
  phase: string;
  description: string;
}

export function PlaceholderCard({ title, phase, description }: PlaceholderCardProps) {
  return (
    <Card accent={C.border20}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <Label>{title}</Label>
        <span style={{
          fontSize: 10, fontWeight: 700,
          letterSpacing: "0.1em", textTransform: "uppercase",
          color: C.onSecondaryFixedVar,
          padding: "3px 8px",
          background: C.surfaceContainerLowest,
          border: `1px solid ${C.border15}`,
          borderRadius: radius.control,
        }}>
          {phase}
        </span>
      </div>
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "16px 18px",
        background: C.surfaceContainerLowest,
        border: `1px dashed ${C.border20}`,
        borderRadius: radius.control,
      }}>
        <Lock size={16} color={C.onSecondaryFixedVar} strokeWidth={1.5} />
        <span style={{ fontSize: 12, color: C.onSurfaceVariant, lineHeight: 1.5 }}>
          {description}
        </span>
      </div>
    </Card>
  );
}
