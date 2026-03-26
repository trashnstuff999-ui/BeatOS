// src/components/create/NotesCard.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Notes Card - Internal production notes
// ═══════════════════════════════════════════════════════════════════════════════

import { C, commonStyles } from "../../lib/theme";
import { Card, Label } from "../ui";

interface NotesCardProps {
  notes: string;
  setNotes: (v: string) => void;
}

export function NotesCard({ notes, setNotes }: NotesCardProps) {
  return (
    <Card accent={C.onSecondaryFixedVar}>
      <Label>Internal Production Notes</Label>
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Add details about plugins used, inspiration, or intended artists..."
        rows={4}
        style={{
          ...commonStyles.input,
          width: "100%",
          padding: 16,
          fontSize: 14,
          resize: "none",
          lineHeight: 1.6,
          boxSizing: "border-box",
        }}
      />
    </Card>
  );
}
