// src/components/create/dialogs/DuplicateDialog.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Duplicate Beat Found Dialog
// ═══════════════════════════════════════════════════════════════════════════════

import { AlertCircle, Plus } from "lucide-react";
import { C } from "../../../lib/theme";

interface DuplicateDialogProps {
  duplicateType: "id" | "name_key_bpm";
  existingId: string;
  existingName: string;
  onCreateV2: () => void;
  onCancel: () => void;
}

export function DuplicateDialog({
  duplicateType,
  existingId,
  existingName,
  onCreateV2,
  onCancel,
}: DuplicateDialogProps) {
  const isDuplicateId = duplicateType === "id";

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
        width: 420, maxWidth: "90vw",
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
          {isDuplicateId ? "Catalog ID Already Exists" : "Similar Beat Found"}
        </h3>

        {/* Message */}
        <p style={{ fontSize: 13, color: C.onSurfaceVariant, lineHeight: 1.6, margin: 0, marginBottom: 8 }}>
          {isDuplicateId ? (
            <>
              A beat with ID <strong style={{ color: C.primary }}>#{existingId}</strong> already exists in your archive:
            </>
          ) : (
            <>
              A beat with similar title, key, and BPM already exists:
            </>
          )}
        </p>

        {/* Existing Beat Info */}
        <div style={{
          background: C.surfaceContainer, borderRadius: 8, padding: 12,
          marginBottom: 20, border: `1px solid ${C.border15}`,
        }}>
          <span style={{ fontSize: 12, color: C.onSurfaceVariant }}>
            <strong style={{ color: C.onSurface }}>#{existingId}</strong> — {existingName}
          </span>
        </div>

        <p style={{ fontSize: 13, color: C.onSurfaceVariant, lineHeight: 1.6, margin: 0, marginBottom: 24 }}>
          Would you like to create this as a <strong style={{ color: C.mint }}>V2 version</strong> with a new ID?
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
            onClick={onCreateV2}
            style={{
              padding: "10px 20px", borderRadius: 6,
              fontSize: 12, fontWeight: 600,
              background: C.primary,
              border: "none",
              color: "#4e2d00",
              cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <Plus size={14} />
            Create as V2
          </button>
        </div>
      </div>
    </div>
  );
}
