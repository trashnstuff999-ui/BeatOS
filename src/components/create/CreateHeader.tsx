// src/components/create/CreateHeader.tsx

import { RefreshCw, Search, Bell, RotateCcw } from "lucide-react";
import { C, commonStyles } from "../../lib/theme";

interface CreateHeaderProps {
  hasData: boolean;
  onResetClick: () => void;
}

export function CreateHeader({ hasData, onResetClick }: CreateHeaderProps) {
  return (
    <header style={{
      height: 64, flexShrink: 0,
      ...commonStyles.glassHeader,
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "0 32px",
      borderBottom: `1px solid ${C.border15}`,
      zIndex: 40,
    }}>
      {/* Left: Title + Reset */}
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: C.onSurface }}>
          Create
        </span>

        {hasData && (
          <button
            onClick={onResetClick}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: 4,
              fontSize: 10, fontWeight: 600, letterSpacing: "0.05em",
              background: "transparent",
              border: `1px solid ${C.border30}`,
              color: C.onSurfaceVariant,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            <RotateCcw size={12} />
            Reset
          </button>
        )}
      </div>

      {/* Right: Icons */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, color: C.onSurfaceVariant }}>
        <RefreshCw size={18} strokeWidth={1.5} style={{ cursor: "pointer" }} />
        <Search size={18} strokeWidth={1.5} style={{ cursor: "pointer" }} />
        <div style={{ position: "relative" }}>
          <Bell size={18} strokeWidth={1.5} style={{ cursor: "pointer" }} />
          <span style={{ position: "absolute", top: 0, right: 0, width: 8, height: 8, background: C.primary, borderRadius: "50%", border: `2px solid ${C.background}` }} />
        </div>
      </div>
    </header>
  );
}
