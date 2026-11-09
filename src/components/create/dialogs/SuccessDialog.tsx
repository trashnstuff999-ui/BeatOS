// src/components/create/dialogs/SuccessDialog.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Nach dem Archivieren: was entstanden ist, und wo es weitergeht.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { openPath } from "@tauri-apps/plugin-opener";
import { CheckCircle, FolderOpen, Trash2, AlertTriangle, Upload } from "lucide-react";
import { C, radius, alpha } from "../../../lib/theme";
import { api } from "../../../lib/api";
import { useSettings } from "../../../contexts/SettingsContext";
import { useDialog } from "../../../contexts/DialogContext";
import { Modal, Button } from "../../ui";

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
  const { frage, melde } = useDialog();
  const navigate = useNavigate();
  const folderName = archivePath.split(/[/\\]/).pop() || archivePath;

  // "idle" → Button sichtbar, "done" → erledigt, "error" → Meldung anzeigen
  const [trashState, setTrashState] = useState<"idle" | "busy" | "done" | "error">(
    sourceTrashed ? "done" : "idle"
  );
  const [trashError, setTrashError] = useState<string | null>(null);

  // Fertig heisst: zurück ins Studio, wo das nächste Projekt wartet.
  const handleDone = () => {
    onClose();
    navigate("/studio");
  };

  const handleGoToUpload = () => {
    onClose();
    navigate("/upload", { state: { beatId } });
  };

  const handleOpenFolder = async () => {
    try {
      await openPath(archivePath);
    } catch (e) {
      melde(`Ordner konnte nicht geöffnet werden: ${String(e)}`);
    }
  };

  const handleTrashSource = async () => {
    const ok = await frage({
      titel: "Quellordner in den Papierkorb?",
      text: `${sourceFolder}\n\n` +
            `Alle Dateien wurden bereits verifiziert ins Archiv kopiert. ` +
            `Der Ordner landet im Papierkorb, wird also nicht endgültig gelöscht.`,
      bestaetigen: "In den Papierkorb",
      gefahr: true,
    });
    if (!ok) return;
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
    <Modal
      icon={CheckCircle}
      title="Beat archiviert"
      subtitle="Im Archiv einsortiert"
      onClose={onClose}
      width={480}
      footer={
        <>
          <Button variant="ghost" icon={FolderOpen} onClick={handleOpenFolder}>Ordner öffnen</Button>
          <Button variant="secondary" onClick={handleDone}>Fertig</Button>
          <Button variant="primary" icon={Upload} onClick={handleGoToUpload}>Upload vorbereiten</Button>
        </>
      }
    >
      {/* Drei Zahlen zum Vorgang */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <Kennzahl wert={beatId} farbe={C.primary} label="Beat-Nummer" />
        <Kennzahl wert={String(filesCopied)} farbe={C.mint} label="Dateien kopiert" />
        <Kennzahl wert="✓" farbe={C.tertiary} label="Geprüft" />
      </div>

      {/* Wohin */}
      <Kasten label="Liegt jetzt in">
        <div style={{ fontSize: 12, color: C.onSurface, fontFamily: "monospace", wordBreak: "break-all" }}>
          {folderName}
        </div>
      </Kasten>

      {/* Warnung aus dem Archivieren (z.B. Auto-Rename) */}
      {warning && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 8,
          background: alpha(C.primary, 0.08),
          border: `1px solid ${alpha(C.primary, 0.25)}`,
          borderRadius: radius.control, padding: 12,
        }}>
          <AlertTriangle size={14} color={C.primary} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12, color: C.primary, lineHeight: 1.5 }}>{warning}</span>
        </div>
      )}

      {/* Quellordner-Cleanup */}
      <Kasten label="Quellordner aufräumen" rechts={
        trashState === "done" ? (
          <span style={{ fontSize: 12, color: C.mint, display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <CheckCircle size={13} /> Im Papierkorb
          </span>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            icon={Trash2}
            loading={trashState === "busy"}
            onClick={handleTrashSource}
          >
            In den Papierkorb
          </Button>
        )
      }>
        <div style={{
          fontSize: 12, color: C.onSurfaceVariant, fontFamily: "monospace",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {sourceFolder}
        </div>
        {trashState === "error" && (
          <div style={{ fontSize: 11, color: C.error, marginTop: 4 }}>{trashError}</div>
        )}
      </Kasten>
    </Modal>
  );
}

function Kennzahl({ wert, farbe, label }: { wert: string; farbe: string; label: string }) {
  return (
    <div style={{
      background: C.surfaceContainer,
      borderRadius: radius.control, padding: 16,
      textAlign: "center", border: `1px solid ${C.border10}`,
    }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: farbe }}>{wert}</div>
      <div style={{
        fontSize: 11, color: C.onSurfaceVariant, marginTop: 4,
        textTransform: "uppercase", letterSpacing: "0.08em",
      }}>
        {label}
      </div>
    </div>
  );
}

function Kasten({ label, children, rechts }: {
  label: string;
  children: React.ReactNode;
  rechts?: React.ReactNode;
}) {
  return (
    <div style={{
      background: C.surfaceContainer,
      borderRadius: radius.control, padding: 12,
      border: `1px solid ${C.border15}`,
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 11, color: C.onSurfaceVariant, marginBottom: 5,
          textTransform: "uppercase", letterSpacing: "0.08em",
        }}>
          {label}
        </div>
        {children}
      </div>
      {rechts}
    </div>
  );
}
