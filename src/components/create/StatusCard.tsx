// src/components/create/StatusCard.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Production Status Card - Idea/WIP/Finished/Sold
// ═══════════════════════════════════════════════════════════════════════════════

import { C, STATUS_ITEMS } from "../../lib/theme";
import { Card, Label } from "../ui";

interface StatusCardProps {
  status: string;
  setStatus: (v: string) => void;
}

export function StatusCard({ status, setStatus }: StatusCardProps) {
  return (
    <Card accent={C.tertiary}>
      <Label>Production Status</Label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {STATUS_ITEMS.map((item) => {
          const isActive = status === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setStatus(item.key)}
              style={{
                padding: "12px 8px", borderRadius: 6,
                fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase",
                border: "none", borderBottom: `2px solid ${isActive ? item.color : "transparent"}`,
                background: isActive ? C.surfaceContainerHighest : C.surfaceContainer,
                color: isActive ? item.color : C.onSurfaceVariant,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
