// src/components/create/dialogs/ConfirmDialog.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Rueckfrage bei ungespeicherten Aenderungen.
// ═══════════════════════════════════════════════════════════════════════════════

import { AlertCircle, Save } from "lucide-react";
import { C } from "../../../lib/theme";
import { Modal, Button } from "../../ui";

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
    <Modal
      icon={AlertCircle}
      title="Ungespeicherte Änderungen"
      onClose={onCancel}
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>Abbrechen</Button>
          <Button variant="danger" onClick={onDiscard}>Verwerfen</Button>
          {showApply && onApply && (
            <Button variant="primary" icon={Save} onClick={onApply}>
              Übernehmen
            </Button>
          )}
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 13, color: C.onSurfaceVariant, lineHeight: 1.6 }}>
        {message}
      </p>
    </Modal>
  );
}
