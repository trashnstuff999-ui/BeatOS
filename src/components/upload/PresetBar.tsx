// src/components/upload/PresetBar.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Preset picker for the Type-Beat card — ONE dropdown button (user choice:
// compact beats always-visible chips). The dropdown lists presets (sorted by
// use_count in the backend, apply on click, delete per row) and carries the
// "save current as preset" form at its bottom. Same commands/DB as always.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, ChevronDown, Youtube, Music2, Bookmark } from "lucide-react";
import { C, PLATFORM_CONFIG } from "../../lib/theme";
import { Button } from "../ui";
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
  const [open, setOpen]           = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const [showSave, setShowSave]   = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try { setPresets(await api.upload.getPresets()); }
    catch (e) { console.error("[Presets] load failed:", e); }
  };
  useEffect(() => { load(); }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setShowSave(false);
        setError(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleApply = async (p: TypeBeatPreset) => {
    onApply(p);
    setOpen(false);
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
      {/* Ein Werkzeug der Karte, kein Eingabefeld.
          Vorher: volle Breite, gefuellt, orange, Pfeil rechts — die Gestalt
          eines Auswahlfeldes, aber der Inhalt eines Befehls („Preset waehlen"
          statt eines Wertes). Nach dem Abflachen der Karte war es ausserdem
          das einzige gefuellte Element zwischen lauter Haarlinien.
          Jetzt ein knapper Knopf in der Kartenkopfzeile, wie „Vorlagen
          bearbeiten" bei den Beschreibungen. */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Artists, Genres und Tags auf einen Schlag setzen"
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "5px 10px",
          background: "transparent",
          border: `1px solid ${open ? C.primary + "60" : C.border15}`,
          borderRadius: 7,
          cursor: "pointer",
          fontSize: 11, fontWeight: 600, fontFamily: "inherit",
          color: open ? C.primary : C.onSurfaceVariant,
          whiteSpace: "nowrap",
          transition: "border-color 0.15s, color 0.15s",
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.color = C.onSurface; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.color = C.onSurfaceVariant; }}
      >
        <Bookmark size={12} strokeWidth={2} />
        Presets
        {presets.length > 0 && (
          <span style={{ opacity: 0.6 }}>({presets.length})</span>
        )}
        <ChevronDown
          size={12}
          style={{ transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "rotate(0)" }}
        />
      </button>

      {/* Dropdown — rechtsbuendig unter dem Knopf, mit eigener Breite: in der
          Kopfzeile gibt es keine volle Kartenbreite mehr zum Ausrichten. */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0, width: 340,
          background: C.surfaceContainer,
          border: `1px solid ${C.border20}`,
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          zIndex: 15,
          maxHeight: 320,
          display: "flex", flexDirection: "column",
        }}>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {presets.length === 0 && (
              <div style={{ padding: 14, fontSize: 11, color: C.onSurfaceVariant, textAlign: "center" }}>
                Noch keine Presets — unten die aktuellen Infos als Preset sichern.
              </div>
            )}
            {presets.map(p => (
              <div
                key={p.id}
                onClick={() => handleApply(p)}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "10px 12px",
                  cursor: "pointer",
                  borderBottom: `1px solid ${C.border10}`,
                  fontSize: 12,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = C.surfaceContainerHigh; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <span style={{ fontWeight: 700, color: C.onSurface }}>{p.label}</span>
                    {p.soundcloud_tags && (
                      <Music2 size={10} color={PLATFORM_CONFIG.soundcloud.color} strokeWidth={2.5} />
                    )}
                    {p.youtube_tags && (
                      <Youtube size={10} color={PLATFORM_CONFIG.youtube.color} strokeWidth={2.5} />
                    )}
                    {p.use_count > 0 && (
                      <span style={{ fontSize: 10, color: C.onSecondaryFixedVar, fontWeight: 500 }}>
                        {p.use_count}×
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: C.onSurfaceVariant, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.main_artists}
                    {p.also_fits && <span style={{ color: C.onSecondaryFixedVar }}> · also fits {p.also_fits}</span>}
                  </div>
                  {p.genre_tags && (
                    <div style={{ fontSize: 10, color: C.onSecondaryFixedVar, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.genre_tags}
                    </div>
                  )}
                </div>
                <button
                  onClick={(e) => handleDelete(e, p.id)}
                  title="Preset löschen"
                  style={{
                    flexShrink: 0,
                    width: 22, height: 22, borderRadius: 4,
                    background: "transparent", border: "none",
                    cursor: "pointer", color: C.onSecondaryFixedVar,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = "#e5484d"; }}
                  onMouseLeave={e => { e.currentTarget.style.color = C.onSecondaryFixedVar; }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>

          {/* Save current as preset — lives at the bottom of the dropdown */}
          <div style={{ borderTop: `1px solid ${C.border15}`, padding: 10, flexShrink: 0 }}>
            {!showSave ? (
              <button
                onClick={() => { setShowSave(true); setError(null); }}
                style={{
                  width: "100%",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: "8px 10px",
                  background: "transparent",
                  border: `1px dashed ${C.border30}`,
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 10, fontWeight: 600,
                  color: C.onSurfaceVariant,
                }}
              >
                <Plus size={12} strokeWidth={2.5} />
                Aktuelle Infos als Preset speichern
              </button>
            ) : (
              <div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    autoFocus
                    value={saveLabel}
                    onChange={e => setSaveLabel(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
                    placeholder="Preset-Name …"
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
                  <Button variant="primary" size="sm" onClick={handleSave}>
                    Speichern
                  </Button>
                </div>
                {error && (
                  <div style={{ marginTop: 6, fontSize: 11, color: "#e5484d" }}>{error}</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
