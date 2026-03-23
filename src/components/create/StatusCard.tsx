// src/components/create/StatusCard.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Production Status Card - Idea/WIP/Finished/Sold
// ═══════════════════════════════════════════════════════════════════════════════

import { C, STATUS_ITEMS } from "../../lib/theme";
import { Card, Label } from "../ui";

interface StatusCardProps {
  status: string;
  setStatus: (v: string) => void;
  editMode: boolean;
}

export function StatusCard({ status, setStatus, editMode }: StatusCardProps) {
  return (
    <Card accent={C.tertiary}>
      <Label>Production Status</Label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {STATUS_ITEMS.map((item) => {
          const isActive = status === item.key;
          return (
            <button
              key={item.key}
              onClick={() => editMode && setStatus(item.key)}
              disabled={!editMode}
              style={{
                padding: "12px 8px", borderRadius: 6,
                fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase",
                border: "none", borderBottom: `2px solid ${isActive ? item.color : "transparent"}`,
                background: isActive ? C.surfaceContainerHighest : C.surfaceContainer,
                color: isActive ? item.color : C.onSurfaceVariant,
                cursor: editMode ? "pointer" : "not-allowed",
                opacity: editMode ? 1 : 0.6,
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
