// src/components/create/NotesCard.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Notes Card - Internal production notes
// ═══════════════════════════════════════════════════════════════════════════════

import { commonStyles } from "../../lib/theme";
import { SectionCard } from "../ui/SectionCard";
import { StickyNote } from "lucide-react";

interface NotesCardProps {
  notes: string;
  setNotes: (v: string) => void;
}

export function NotesCard({ notes, setNotes }: NotesCardProps) {
  return (
    <SectionCard icon={StickyNote} title="Notizen">
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
    </SectionCard>
  );
}
