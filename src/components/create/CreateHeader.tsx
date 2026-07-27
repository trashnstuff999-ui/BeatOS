// src/components/create/CreateHeader.tsx

import { Tag, RotateCcw } from "lucide-react";
import { C, commonStyles } from "../../lib/theme";

interface CreateHeaderProps {
  hasData: boolean;
  onResetClick: () => void;
  tagCount: number;
  hasNotes: boolean;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export function CreateHeader({ hasData, onResetClick, tagCount, hasNotes, sidebarOpen, onToggleSidebar }: CreateHeaderProps) {
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

      {/* Right: Tags & Notizen ausklappen */}
      <button
        onClick={onToggleSidebar}
        data-create-sidebar-toggle
        title="Tags & Notizen"
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 14px", borderRadius: 8,
          fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
          background: sidebarOpen ? C.surfaceContainerHigh : "transparent",
          border: `1px solid ${sidebarOpen ? C.border30 : C.border15}`,
          color: sidebarOpen ? C.onSurface : C.onSurfaceVariant,
          cursor: "pointer",
          transition: "all 0.15s",
        }}
      >
        <Tag size={14} strokeWidth={2} />
        Tags & Notizen
        {tagCount > 0 && (
          <span style={{
            minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9,
            background: C.primary, color: C.onPrimary,
            fontSize: 10, fontWeight: 800,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {tagCount}
          </span>
        )}
        {tagCount === 0 && hasNotes && (
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.primary }} />
        )}
      </button>
    </header>
  );
}
