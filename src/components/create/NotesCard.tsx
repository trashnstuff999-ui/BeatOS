// src/components/create/NotesCard.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Notes Card - Internal production notes
// ═══════════════════════════════════════════════════════════════════════════════

import { C, commonStyles } from "../../lib/theme";
import { Card, Label } from "../ui";

interface NotesCardProps {
  notes: string;
  setNotes: (v: string) => void;
  editMode: boolean;
}

export function NotesCard({ notes, setNotes, editMode }: NotesCardProps) {
  const getInputStyle = (base: React.CSSProperties): React.CSSProperties => ({
    ...base,
    opacity: editMode ? 1 : 0.6,
    cursor: editMode ? "text" : "not-allowed",
  });

  return (
    <Card accent={C.onSecondaryFixedVar}>
      <Label>Internal Production Notes</Label>
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Add details about plugins used, inspiration, or intended artists..."
        rows={4}
        disabled={!editMode}
        style={getInputStyle({ 
          ...commonStyles.input, 
          width: "100%", 
          padding: 16, 
          fontSize: 14, 
          resize: "none", 
          lineHeight: 1.6, 
          boxSizing: "border-box" 
        })}
      />
    </Card>
  );
}
