// src/components/create/dialogs/SuccessDialog.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Archive Success Dialog
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { CheckCircle, FolderOpen, Trash2, AlertTriangle, Upload } from "lucide-react";
import { C } from "../../../lib/theme";
import { api } from "../../../lib/api";
import { useSettings } from "../../../contexts/SettingsContext";

interface SuccessDialogProps {
  archivePath: string;
  beatId: string;
  filesCopied: number;
  sourceFolder: string;
  warning: string | null;
  /** true = Quelle wurde bereits automatisch in den Papierkorb verschoben */
  sourceTrashed: boolean;
  onClose: () => void;
}

export function SuccessDialog({
  archivePath,
  beatId,
  filesCopied,
  sourceFolder,
  warning,
  sourceTrashed,
  onClose,
}: SuccessDialogProps) {
  const { settings } = useSettings();
  const navigate = useNavigate();
  const folderName = archivePath.split(/[/\\]/).pop() || archivePath;

  // "idle" → Button sichtbar, "done" → erledigt, "error" → Meldung anzeigen
  const [trashState, setTrashState] = useState<"idle" | "busy" | "done" | "error">(
    sourceTrashed ? "done" : "idle"
  );
  const [trashError, setTrashError] = useState<string | null>(null);

  const handleGoToUpload = () => {
    onClose();
    navigate("/upload", { state: { beatId } });
  };

  const handleOpenFolder = async () => {
    try {
      // revealItemInDir öffnet den Explorer und markiert den Ordner
      await revealItemInDir(archivePath);
    } catch (e) {
      console.error("Failed to open folder:", e);
    }
  };

  const handleTrashSource = async () => {
    if (!confirm(
      `Quellordner in den Papierkorb verschieben?\n\n${sourceFolder}\n\n` +
      `Alle Dateien wurden bereits verifiziert ins Archiv kopiert. ` +
      `Der Ordner landet im Papierkorb (kein endgültiges Löschen).`
    )) return;
    setTrashState("busy");
    try {
      await api.archive.trashSourceFolder(sourceFolder, settings.archivePath);
      setTrashState("done");
    } catch (e) {
      setTrashError(String(e));
      setTrashState("error");
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

        {/* Warnung aus dem Archivieren (z.B. Auto-Rename) */}
        {warning && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 8,
            background: "rgba(253,161,36,0.08)", border: "1px solid rgba(253,161,36,0.25)",
            borderRadius: 8, padding: 12, marginBottom: 16,
          }}>
            <AlertTriangle size={14} color="#fda124" style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 11, color: "#fda124", lineHeight: 1.5 }}>{warning}</span>
          </div>
        )}

        {/* Quellordner-Cleanup (Opt-in) */}
        <div style={{
          background: C.surfaceContainer, borderRadius: 8, padding: 12,
          marginBottom: 24, border: `1px solid ${C.border15}`,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, color: C.onSurfaceVariant, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
              Quellordner aufräumen
            </div>
            <div style={{ fontSize: 11, color: C.onSurfaceVariant, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {sourceFolder}
            </div>
            {trashState === "error" && (
              <div style={{ fontSize: 10, color: C.error, marginTop: 4 }}>{trashError}</div>
            )}
          </div>
          {trashState === "done" ? (
            <span style={{ fontSize: 11, color: C.mint, display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <CheckCircle size={13} /> Im Papierkorb
            </span>
          ) : (
            <button
              onClick={handleTrashSource}
              disabled={trashState === "busy"}
              style={{
                padding: "8px 14px", borderRadius: 6, flexShrink: 0,
                fontSize: 11, fontWeight: 600,
                background: "transparent",
                border: `1px solid ${C.border30}`,
                color: C.onSurfaceVariant,
                cursor: trashState === "busy" ? "wait" : "pointer",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <Trash2 size={13} />
              In Papierkorb
            </button>
          )}
        </div>

        {/* Buttons — primary action: continue into the upload flow */}
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
            Ordner öffnen
          </button>
          <button
            onClick={onClose}
            style={{
              padding: "10px 20px", borderRadius: 6,
              fontSize: 12, fontWeight: 600,
              background: "transparent",
              border: `1px solid ${C.border30}`,
              color: C.onSurfaceVariant,
              cursor: "pointer",
            }}
          >
            Fertig
          </button>
          <button
            onClick={handleGoToUpload}
            style={{
              padding: "10px 20px", borderRadius: 6,
              fontSize: 12, fontWeight: 700,
              background: C.primary,
              border: "none",
              color: C.onPrimary,
              cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <Upload size={14} strokeWidth={2} />
            → Upload vorbereiten
          </button>
        </div>
      </div>
    </div>
  );
}