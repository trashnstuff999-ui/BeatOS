// src/components/create/dialogs/SuccessDialog.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Archive Success Dialog
// ═══════════════════════════════════════════════════════════════════════════════

import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { CheckCircle, FolderOpen } from "lucide-react";
import { C } from "../../../lib/theme";

interface SuccessDialogProps {
  archivePath: string;
  beatId: string;
  filesCopied: number;
  onClose: () => void;
}

export function SuccessDialog({
  archivePath,
  beatId,
  filesCopied,
  onClose,
}: SuccessDialogProps) {
  const folderName = archivePath.split(/[/\\]/).pop() || archivePath;

  const handleOpenFolder = async () => {
    try {
      // revealItemInDir öffnet den Explorer und markiert den Ordner
      await revealItemInDir(archivePath);
    } catch (e) {
      console.error("Failed to open folder:", e);
    }
  };

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
        width: 460, maxWidth: "90vw",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        border: `1px solid ${C.border20}`,
      }}>
        {/* Success Icon */}
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: "rgba(52,211,153,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 24,
        }}>
          <CheckCircle size={28} color={C.mint} />
        </div>

        {/* Title */}
        <h3 style={{ fontSize: 20, fontWeight: 700, color: C.onSurface, margin: 0, marginBottom: 8 }}>
          Beat Archived Successfully!
        </h3>

        {/* Subtitle */}
        <p style={{ fontSize: 13, color: C.onSurfaceVariant, margin: 0, marginBottom: 24 }}>
          Your beat has been organized into the archive structure.
        </p>

        {/* Stats */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12,
          marginBottom: 24,
        }}>
          <div style={{
            background: C.surfaceContainer, borderRadius: 10, padding: 16,
            textAlign: "center", border: `1px solid ${C.border10}`,
          }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: C.primary }}>{beatId}</div>
            <div style={{ fontSize: 10, color: C.onSurfaceVariant, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 4 }}>Beat ID</div>
          </div>
          <div style={{
            background: C.surfaceContainer, borderRadius: 10, padding: 16,
            textAlign: "center", border: `1px solid ${C.border10}`,
          }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: C.mint }}>{filesCopied}</div>
            <div style={{ fontSize: 10, color: C.onSurfaceVariant, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 4 }}>Files Copied</div>
          </div>
          <div style={{
            background: C.surfaceContainer, borderRadius: 10, padding: 16,
            textAlign: "center", border: `1px solid ${C.border10}`,
          }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: C.tertiary }}>✓</div>
            <div style={{ fontSize: 10, color: C.onSurfaceVariant, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 4 }}>Verified</div>
          </div>
        </div>

        {/* Archive Path */}
        <div style={{
          background: C.surfaceContainer, borderRadius: 8, padding: 12,
          marginBottom: 24, border: `1px solid ${C.border15}`,
        }}>
          <div style={{ fontSize: 10, color: C.onSurfaceVariant, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Archive Location</div>
          <div style={{ fontSize: 12, color: C.onSurface, fontFamily: "monospace", wordBreak: "break-all" }}>{folderName}</div>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={handleOpenFolder}
            style={{
              padding: "10px 20px", borderRadius: 6,
              fontSize: 12, fontWeight: 600,
              background: "transparent",
              border: `1px solid ${C.border30}`,
              color: C.onSurfaceVariant,
              cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <FolderOpen size={14} />
            Open Folder
          </button>
          <button
            onClick={onClose}
            style={{
              padding: "10px 20px", borderRadius: 6,
              fontSize: 12, fontWeight: 600,
              background: C.mint,
              border: "none",
              color: "#064e3b",
              cursor: "pointer",
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}