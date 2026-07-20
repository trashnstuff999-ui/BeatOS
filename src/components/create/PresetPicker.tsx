// src/components/create/PresetPicker.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Read-only type-beat preset picker for the Create flow. Applying a preset
// here writes the type-beat fields directly with archive_beat, so a fresh
// beat lands in the Upload tab with "Infos ✓" and the MP4 rename works.
// Same presets/commands as the Upload tab (get_type_beat_presets).
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";
import { Bookmark, ChevronDown, X, Youtube, Music2 } from "lucide-react";
import { C, PLATFORM_CONFIG } from "../../lib/theme";
import { SectionCard } from "../ui/SectionCard";
import { api } from "../../lib/api";
import type { TypeBeatPreset } from "../../types/upload";

interface PresetPickerProps {
  selected: TypeBeatPreset | null;
  onSelect: (p: TypeBeatPreset | null) => void;
}

export function PresetPicker({ selected, onSelect }: PresetPickerProps) {
  const [presets, setPresets] = useState<TypeBeatPreset[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.upload.getPresets().then(setPresets).catch(() => setPresets([]));
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handlePick = async (p: TypeBeatPreset) => {
    onSelect(p);
    setOpen(false);
    try { await api.upload.bumpPresetUse(p.id); } catch { /* Zähler ist nice-to-have */ }
  };

  return (
    <SectionCard icon={Bookmark} title="Type-Beat Preset">
    <div ref={containerRef} style={{ position: "relative" }}>
      {selected ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "9px 12px",
          background: C.primary + "10",
          border: `1px solid ${C.primary}40`,
          borderRadius: 8,
        }}>
          <Bookmark size={12} color={C.primary} strokeWidth={2} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: C.onSurface, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selected.label}
          </span>
          {selected.soundcloud_tags && <Music2 size={10} color={PLATFORM_CONFIG.soundcloud.color} />}
          {selected.youtube_tags && <Youtube size={10} color={PLATFORM_CONFIG.youtube.color} />}
          <button
            onClick={() => onSelect(null)}
            title="Preset abwählen"
            style={{ background: "none", border: "none", cursor: "pointer", color: C.onSurfaceVariant, display: "flex", padding: 2 }}
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            width: "100%",
            display: "flex", alignItems: "center", gap: 8,
            padding: "9px 12px",
            background: C.surfaceContainerLowest,
            border: `1px solid ${open ? C.primary + "50" : C.border20}`,
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 12, color: C.onSurfaceVariant,
          }}
        >
          <Bookmark size={12} strokeWidth={2} />
          <span style={{ flex: 1, textAlign: "left" }}>
            Preset wählen (optional)
            {presets.length > 0 && <span style={{ color: C.onSecondaryFixedVar, marginLeft: 6 }}>({presets.length})</span>}
          </span>
          <ChevronDown size={13} style={{ transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "rotate(0)" }} />
        </button>
      )}

      {open && !selected && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0,
          marginTop: 4,
          background: C.surfaceContainer,
          border: `1px solid ${C.border20}`,
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
          zIndex: 15,
          maxHeight: 260,
          overflowY: "auto",
        }}>
          {presets.length === 0 && (
            <div style={{ padding: 12, fontSize: 11, color: C.onSurfaceVariant, textAlign: "center" }}>
              Noch keine Presets — im Upload-Tab anlegen.
            </div>
          )}
          {presets.map(p => (
            <button
              key={p.id}
              onClick={() => handlePick(p)}
              style={{
                width: "100%",
                display: "block",
                padding: "9px 12px",
                background: "transparent", border: "none",
                borderBottom: `1px solid ${C.border10}`,
                cursor: "pointer", textAlign: "left",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = C.surfaceContainerHigh; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: C.onSurface }}>{p.label}</div>
              <div style={{ fontSize: 10, color: C.onSurfaceVariant, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.main_artists}{p.genre_tags ? ` · ${p.genre_tags}` : ""}
              </div>
            </button>
          ))}
        </div>
      )}
      <div style={{ fontSize: 10, color: C.onSecondaryFixedVar, marginTop: 8, lineHeight: 1.5 }}>
        {selected
          ? "Artists, Genres und Plattform-Tags werden mit archiviert."
          : "Optional — spart das Nachtragen im Upload-Tab."}
      </div>
    </div>
    </SectionCard>
  );
}
