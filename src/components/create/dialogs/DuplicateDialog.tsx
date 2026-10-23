// src/components/create/dialogs/DuplicateDialog.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// „Den gibt es schon" — beim Archivieren, bevor etwas geschrieben wird.
// ═══════════════════════════════════════════════════════════════════════════════

import { AlertTriangle, Plus } from "lucide-react";
import { C, radius } from "../../../lib/theme";
import { Modal, Button } from "../../ui";

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
  const istIdTreffer = duplicateType === "id";

  return (
    <Modal
      icon={AlertTriangle}
      title={istIdTreffer ? "Katalognummer ist vergeben" : "Ähnlicher Beat gefunden"}
      onClose={onCancel}
      width={440}
      // Hier wird archiviert oder nicht — ein Klick daneben ist keine Antwort.
      closeOnBackdrop={false}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>Abbrechen</Button>
          <Button variant="primary" icon={Plus} onClick={onCreateV2}>Als V2 anlegen</Button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 13, color: C.onSurfaceVariant, lineHeight: 1.65 }}>
        {istIdTreffer
          ? <>Unter <strong style={{ color: C.primary }}>#{existingId}</strong> liegt bereits ein Beat im Archiv:</>
          : <>Ein Beat mit ähnlichem Titel, gleicher Tonart und gleichem Tempo liegt schon im Archiv:</>}
      </p>

      <div style={{
        background: C.surfaceContainer,
        borderRadius: radius.control,
        padding: 12,
        border: `1px solid ${C.border15}`,
        fontSize: 12, color: C.onSurfaceVariant,
      }}>
        <strong style={{ color: C.onSurface }}>#{existingId}</strong> {existingName}
      </div>

      <p style={{ margin: 0, fontSize: 13, color: C.onSurfaceVariant, lineHeight: 1.65 }}>
        Als <strong style={{ color: C.mint }}>V2</strong> mit der nächsten freien Nummer anlegen?
      </p>
    </Modal>
  );
}
