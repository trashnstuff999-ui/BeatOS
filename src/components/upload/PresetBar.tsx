// src/components/upload/PresetBar.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Preset chips row for the Type-Beat card.
// Presets are always visible as a horizontal chip list (sorted by use_count
// in the backend) — one click applies. "Save" opens a small popover that
// captures the current five fields under a label. Same commands/DB as before.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, X, Youtube, Music2, Bookmark } from "lucide-react";
import { C, PLATFORM_CONFIG } from "../../lib/theme";
import { api } from "../../lib/api";
import type { TypeBeatPreset } from "../../types/upload";

interface PresetBarProps {
  currentMain: string;
  currentAlsoFits: string;
  currentGenreTags: string;
  currentYoutubeTags: string;
  currentSoundcloudTags: string;
  onApply: (p: TypeBeatPreset) => void;
}

export function PresetBar({
  currentMain,
  currentAlsoFits,
  currentGenreTags,
  currentYoutubeTags,
  currentSoundcloudTags,
  onApply,
}: PresetBarProps) {
  const [presets, setPresets]     = useState<TypeBeatPreset[]>([]);
  const [saveLabel, setSaveLabel] = useState("");
  const [showSave, setShowSave]   = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try { setPresets(await api.upload.getPresets()); }
    catch (e) { console.error("[Presets] load failed:", e); }
  };
  useEffect(() => { load(); }, []);

  // Close save popover on outside click
  useEffect(() => {
    if (!showSave) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setShowSave(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSave]);

  const handleApply = async (p: TypeBeatPreset) => {
    onApply(p);
    try {
      await api.upload.bumpPresetUse(p.id);
      load();
    } catch (e) { console.error("[Presets] bump failed:", e); }
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm("Preset löschen?")) return;
    try {
      await api.upload.deletePreset(id);
      load();
    } catch (err) { alert(`Preset konnte nicht gelöscht werden: ${String(err)}`); }
  };

  const handleSave = async () => {
    setError(null);
    const label = saveLabel.trim();
    if (!label) { setError("Label fehlt"); return; }
    if (!currentMain.trim()) { setError("Erst Main Artists setzen"); return; }
    try {
      await api.upload.savePreset({
        label,
        main_artists:    currentMain.trim(),
        also_fits:       currentAlsoFits.trim()       || null,
        genre_tags:      currentGenreTags.trim()      || null,
        youtube_tags:    currentYoutubeTags.trim()    || null,
        soundcloud_tags: currentSoundcloudTags.trim() || null,
      });
      setSaveLabel("");
      setShowSave(false);
      load();
    } catch (err) {
      setError(String(err));
    }
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Own strip with micro label — visually distinct from the data chips below */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
        background: C.surfaceContainerLowest,
        border: `1px solid ${C.border10}`,
        borderRadius: 8,
        padding: "7px 10px",
      }}>
        <span style={{
          display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
          fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
          color: C.onSecondaryFixedVar, textTransform: "uppercase",
          marginRight: 4,
        }}>
          <Bookmark size={10} strokeWidth={2} />
          Presets
        </span>

        {presets.length === 0 && (
          <span style={{ fontSize: 10, color: C.onSecondaryFixedVar }}>
            Noch keine — aktuelle Infos mit „+" sichern
          </span>
        )}

        {presets.map(p => {
          const hovered = hoveredId === p.id;
          return (
            <button
              key={p.id}
              onClick={() => handleApply(p)}
              onMouseEnter={() => setHoveredId(p.id)}
              onMouseLeave={() => setHoveredId(null)}
              title={[
                p.main_artists,
                p.also_fits && `also fits: ${p.also_fits}`,
                p.genre_tags,
              ].filter(Boolean).join("\n")}
              style={{
                // Ghost/outline — Aktion, klar unterscheidbar von soliden Daten-Chips
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "4px 10px",
                background: hovered ? C.primary + "12" : "transparent",
                border: `1px solid ${hovered ? C.primary + "50" : C.border30}`,
                borderRadius: 9999,
                fontSize: 11, fontWeight: 600,
                color: hovered ? C.primary : C.onSurfaceVariant,
                cursor: "pointer",
                transition: "all 0.15s",
                maxWidth: 220,
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.label}
              </span>
              {p.soundcloud_tags && <Music2 size={9} color={PLATFORM_CONFIG.soundcloud.color} strokeWidth={2.5} />}
              {p.youtube_tags && <Youtube size={9} color={PLATFORM_CONFIG.youtube.color} strokeWidth={2.5} />}
              {p.use_count > 0 && (
                <span style={{ fontSize: 9, color: C.onSecondaryFixedVar, fontWeight: 500 }}>
                  {p.use_count}×
                </span>
              )}
              {hovered && (
                <span
                  role="button"
                  onClick={(e) => handleDelete(e, p.id)}
                  title="Preset löschen"
                  style={{ display: "flex", color: C.onSecondaryFixedVar }}
                  onMouseEnter={e => { e.currentTarget.style.color = "#e5484d"; e.stopPropagation(); }}
                  onMouseLeave={e => { e.currentTarget.style.color = C.onSecondaryFixedVar; }}
                >
                  <Trash2 size={10} />
                </span>
              )}
            </button>
          );
        })}

        {/* Save current as preset */}
        <button
          onClick={() => { setShowSave(s => !s); setError(null); }}
          title="Aktuelle Infos als Preset speichern"
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 24, height: 24, borderRadius: 9999, flexShrink: 0,
            background: showSave ? C.primary + "20" : "transparent",
            border: `1px dashed ${showSave ? C.primary + "60" : C.border30}`,
            color: showSave ? C.primary : C.onSecondaryFixedVar,
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          <Plus size={13} strokeWidth={2.5} />
        </button>
      </div>

      {/* Save popover */}
      {showSave && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0,
          marginTop: 6,
          background: C.surfaceContainer,
          border: `1px solid ${C.border20}`,
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          zIndex: 10,
          padding: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ flex: 1, fontSize: 10, fontWeight: 700, color: C.onSecondaryFixedVar, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Aktuelle Infos als Preset speichern
            </span>
            <button
              onClick={() => { setShowSave(false); setError(null); }}
              style={{ background: "transparent", border: "none", cursor: "pointer", color: C.onSecondaryFixedVar, display: "flex" }}
            >
              <X size={12} />
            </button>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              autoFocus
              value={saveLabel}
              onChange={e => setSaveLabel(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
              placeholder="Preset-Name (z.B. Dro Kenji x Juice WRLD - dark)"
              style={{
                flex: 1,
                padding: "8px 12px",
                fontSize: 12,
                background: C.surfaceContainerLowest,
                border: `1px solid ${C.border20}`,
                borderRadius: 6,
                outline: "none",
                color: C.onSurface,
              }}
            />
            <button
              onClick={handleSave}
              style={{
                padding: "8px 14px",
                fontSize: 11, fontWeight: 700,
                background: C.primary,
                border: "none", borderRadius: 6,
                color: C.onPrimary,
                cursor: "pointer",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              Save
            </button>
          </div>
          {error && (
            <div style={{ marginTop: 8, fontSize: 11, color: "#e5484d" }}>{error}</div>
          )}
          <div style={{ marginTop: 8, fontSize: 10, color: C.onSecondaryFixedVar, lineHeight: 1.4 }}>
            Speichert Main Artists, Also Fits, Genres, SoundCloud- und YouTube-Tags.
          </div>
        </div>
      )}
    </div>
  );
}
