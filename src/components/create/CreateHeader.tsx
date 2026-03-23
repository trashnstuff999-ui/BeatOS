// src/components/create/CreateHeader.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Header with View/Edit Toggle, Apply/Reset, and Title
// ═══════════════════════════════════════════════════════════════════════════════

import { RefreshCw, Search, Bell, RotateCcw, Save } from "lucide-react";
import { C, commonStyles } from "../../lib/theme";

interface CreateHeaderProps {
  editMode: boolean;
  isDirty: boolean;
  hasData: boolean;
  onModeSwitch: (mode: "VIEW" | "EDIT") => void;
  onResetClick: () => void;
  onApply: () => void;
}

export function CreateHeader({
  editMode,
  isDirty,
  hasData,
  onModeSwitch,
  onResetClick,
  onApply,
}: CreateHeaderProps) {
  return (
    <header style={{
      height: 64, flexShrink: 0,
      ...commonStyles.glassHeader,
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "0 32px",
      borderBottom: `1px solid ${C.border15}`,
      zIndex: 40,
    }}>
      {/* Left: View/Edit Toggle + Apply/Reset + Title */}
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        {/* View/Edit Toggle */}
        <div style={{ display: "flex", background: C.surfaceContainerHighest, borderRadius: 6, padding: 3, gap: 2 }}>
          {(["VIEW", "EDIT"] as const).map((mode) => {
            const isActive = (mode === "EDIT") === editMode;
            return (
              <button
                key={mode}
                onClick={() => onModeSwitch(mode)}
                style={{
                  padding: "8px 20px", borderRadius: 4,
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
                  border: "none", cursor: "pointer",
                  transition: "all 0.2s ease-out",
                  background: isActive ? C.primary : "transparent",
                  color: isActive ? "#4e2d00" : C.onSurfaceVariant,
                }}
              >
                {mode}
              </button>
            );
          })}
        </div>

        {/* Apply / Reset Buttons */}
        {hasData && (
          <div style={{ display: "flex", gap: 8, marginLeft: 8 }}>
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
            <button
              onClick={onApply}
              disabled={!isDirty}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 12px", borderRadius: 4,
                fontSize: 10, fontWeight: 600, letterSpacing: "0.05em",
                background: isDirty ? C.mint : "transparent",
                border: isDirty ? "none" : `1px solid ${C.border20}`,
                color: isDirty ? "#064e3b" : C.onSecondaryFixedVar,
                cursor: isDirty ? "pointer" : "not-allowed",
                opacity: isDirty ? 1 : 0.5,
                transition: "all 0.15s",
              }}
            >
              <Save size={12} />
              Apply
            </button>

            {/* Unsaved Indicator */}
            {isDirty && (
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "0 8px",
                fontSize: 9, fontWeight: 600,
                color: C.primary,
              }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.primary, animation: "pulse 2s infinite" }} />
                Unsaved
              </div>
            )}
          </div>
        )}

        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: C.onSurfaceVariant }}>
          Archive Portal
        </span>
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
