// src/components/UnsavedChangesDialog.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Dialog shown when user tries to leave Create with unsaved changes
// ═══════════════════════════════════════════════════════════════════════════════

import { AlertCircle, Save, Trash2 } from "lucide-react";
import { C } from "../lib/theme";

interface UnsavedChangesDialogProps {
  onApply: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export function UnsavedChangesDialog({
  onApply,
  onDiscard,
  onCancel,
}: UnsavedChangesDialogProps) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.surfaceContainerHigh,
          borderRadius: 16,
          border: `1px solid ${C.border20}`,
          padding: 28,
          width: "100%",
          maxWidth: 440,
          boxShadow: "0 25px 80px rgba(0, 0, 0, 0.6)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: "rgba(253, 161, 36, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AlertCircle size={24} color={C.primary} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.onSurface }}>
              Unsaved Changes
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: C.onSurfaceVariant, marginTop: 2 }}>
              You have unsaved changes in Create
            </p>
          </div>
        </div>

        {/* Message */}
        <p
          style={{
            fontSize: 14,
            color: C.onSurfaceVariant,
            lineHeight: 1.6,
            margin: "0 0 24px",
          }}
        >
          Would you like to save your changes before leaving? Unsaved data will be lost if you discard.
        </p>

        {/* Buttons */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              padding: "11px 20px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              background: "transparent",
              border: `1px solid ${C.border30}`,
              color: C.onSurfaceVariant,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          
          <button
            onClick={onDiscard}
            style={{
              padding: "11px 20px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              color: "#ef4444",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Trash2 size={14} />
            Discard
          </button>
          
          <button
            onClick={onApply}
            style={{
              padding: "11px 20px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              background: C.mint,
              border: "none",
              color: "#064e3b",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Save size={14} />
            Save & Leave
          </button>
        </div>
      </div>
    </div>
  );
}
