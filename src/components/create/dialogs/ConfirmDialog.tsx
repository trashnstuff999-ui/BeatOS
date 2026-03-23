// src/components/create/dialogs/ConfirmDialog.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Confirmation Dialog for Unsaved Changes
// ═══════════════════════════════════════════════════════════════════════════════

import { AlertCircle, Save } from "lucide-react";
import { C } from "../../../lib/theme";

interface ConfirmDialogProps {
  message: string;
  onDiscard: () => void;
  onApply?: () => void;
  onCancel: () => void;
  showApply?: boolean;
}

export function ConfirmDialog({
  message,
  onDiscard,
  onApply,
  onCancel,
  showApply = true,
}: ConfirmDialogProps) {
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 100,
    }}>
      <div style={{
        background: C.surfaceContainerHigh,
        borderRadius: 16, padding: 28,
        width: 400, maxWidth: "90vw",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        border: `1px solid ${C.border20}`,
      }}>
        {/* Icon */}
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: "rgba(251,191,36,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 20,
        }}>
          <AlertCircle size={24} color="#fbbf24" />
        </div>

        {/* Title */}
        <h3 style={{ fontSize: 18, fontWeight: 700, color: C.onSurface, margin: 0, marginBottom: 12 }}>
          Unsaved Changes
        </h3>

        {/* Message */}
        <p style={{ fontSize: 13, color: C.onSurfaceVariant, lineHeight: 1.6, margin: 0, marginBottom: 24 }}>
          {message}
        </p>

        {/* Buttons */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onCancel}
            style={{
              padding: "10px 20px", borderRadius: 6,
              fontSize: 12, fontWeight: 600,
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
              padding: "10px 20px", borderRadius: 6,
              fontSize: 12, fontWeight: 600,
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              color: "#ef4444",
              cursor: "pointer",
            }}
          >
            Discard
          </button>
          {showApply && onApply && (
            <button
              onClick={onApply}
              style={{
                padding: "10px 20px", borderRadius: 6,
                fontSize: 12, fontWeight: 600,
                background: C.mint,
                border: "none",
                color: "#064e3b",
                cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <Save size={14} />
              Apply & Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
