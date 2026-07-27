// src/components/create/CreateSidePanel.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Ausklappbare rechte Leiste im Create-Tab für Tags + Notizen — hält die
// zwei Hauptspalten aufgeräumt. Schließt per Escape, Klick daneben (außer
// der Tag-Manager ist offen) oder dem Toggle im Header. Weicht der
// Player-Leiste aus wie der Studio-Inspector.
// ═══════════════════════════════════════════════════════════════════════════════

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { C } from "../../lib/theme";
import { useAudioPlayerContext } from "../../contexts/AudioPlayerContext";
import { useTagManager } from "../../contexts/TagManagerContext";
import { TagsCard } from "./TagsCard";
import { NotesCard } from "./NotesCard";

interface CreateSidePanelProps {
  tagsHook: React.ComponentProps<typeof TagsCard>["tagsHook"];
  onShowAllTags: () => void;
  notes: string;
  setNotes: (v: string) => void;
  onClose: () => void;
}

export function CreateSidePanel({ tagsHook, onShowAllTags, notes, setNotes, onClose }: CreateSidePanelProps) {
  const { currentBeat } = useAudioPlayerContext();
  const { isOpen: tagManagerOpen } = useTagManager();
  const panelRef = useRef<HTMLElement>(null);
  const playerVisible = !!currentBeat;

  // Escape schließt
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Klick daneben schließt — außer der Tag-Manager (eigenes Overlay) ist offen
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tagManagerOpen) return;
      const target = e.target as HTMLElement;
      // Der Header-Toggle regelt das Öffnen/Schließen selbst
      if (target.closest("[data-create-sidebar-toggle]")) return;
      if (!panelRef.current?.contains(target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, tagManagerOpen]);

  return (
    <aside
      ref={panelRef}
      style={{
        position: "fixed",
        top: 64, right: 0,
        bottom: playerVisible ? 80 : 0,
        width: 400, maxWidth: "92vw",
        background: C.surfaceContainerLow,
        borderLeft: `1px solid ${C.border15}`,
        boxShadow: "-12px 0 40px rgba(0,0,0,0.35)",
        zIndex: 40,
        display: "flex", flexDirection: "column",
      }}
    >
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "14px 18px",
        borderBottom: `1px solid ${C.border10}`,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.onSurface }}>
          Tags & Notizen
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={onClose}
          title="Schließen (Esc)"
          style={{ background: "none", border: "none", cursor: "pointer", color: C.onSurfaceVariant, display: "flex", padding: 2 }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Inhalt */}
      <div style={{ flex: 1, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 20 }}>
        <TagsCard tagsHook={tagsHook} onShowAllTags={onShowAllTags} />
        <NotesCard notes={notes} setNotes={setNotes} />
      </div>
    </aside>
  );
}
