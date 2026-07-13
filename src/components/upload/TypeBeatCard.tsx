// src/components/upload/TypeBeatCard.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Type-Beat info card: main artists, also-fits artists, genre tags.
// Auto-saves 500ms after the last keystroke. Presets live alongside.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";
import { Tag, ChevronDown, Plus, Trash2, Check, Loader2, X, Youtube, Music2 } from "lucide-react";
import { C, commonStyles } from "../../lib/theme";
import { Card, Label } from "../ui";
import { api } from "../../lib/api";
import type { UploadBeatInfo, TypeBeatPreset } from "../../types/upload";

interface TypeBeatCardProps {
  beat: UploadBeatInfo;
  onSaved: () => void;   // parent refreshes upload data so {{}} placeholders use new values
}

type SaveState = "idle" | "saving" | "saved";

export function TypeBeatCard({ beat, onSaved }: TypeBeatCardProps) {
  const [main, setMain]                   = useState(beat.type_beat_main      ?? "");
  const [alsoFits, setAlsoFits]           = useState(beat.type_beat_also_fits ?? "");
  const [genreTags, setGenreTags]         = useState(beat.genre_tags          ?? "");
  const [youtubeTags, setYoutubeTags]     = useState(beat.youtube_tags        ?? "");
  const [soundcloudTags, setSoundcloudTags] = useState(beat.soundcloud_tags   ?? "");
  const [saveState, setSaveState]         = useState<SaveState>("idle");

  // Reset drafts when the user switches beat
  useEffect(() => {
    setMain(beat.type_beat_main      ?? "");
    setAlsoFits(beat.type_beat_also_fits ?? "");
    setGenreTags(beat.genre_tags     ?? "");
    setYoutubeTags(beat.youtube_tags ?? "");
    setSoundcloudTags(beat.soundcloud_tags ?? "");
    setSaveState("idle");
  }, [beat.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced auto-save
  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    const handle = setTimeout(async () => {
      setSaveState("saving");
      try {
        await api.upload.updateTypeBeatInfo(beat.id, main, alsoFits, genreTags, youtubeTags, soundcloudTags);
        setSaveState("saved");
        onSaved();
        setTimeout(() => setSaveState(s => s === "saved" ? "idle" : s), 1500);
      } catch (e) {
        console.error("[TypeBeatCard] save failed:", e);
        setSaveState("idle");
      }
    }, 500);
    return () => clearTimeout(handle);
  }, [main, alsoFits, genreTags, youtubeTags, soundcloudTags]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card accent={C.primary}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <Label>Type-Beat Info</Label>
        <SaveIndicator state={saveState} />
      </div>

      <PresetBar
        currentMain={main}
        currentAlsoFits={alsoFits}
        currentGenreTags={genreTags}
        currentYoutubeTags={youtubeTags}
        currentSoundcloudTags={soundcloudTags}
        onApply={(p) => {
          setMain(p.main_artists);
          setAlsoFits(p.also_fits ?? "");
          setGenreTags(p.genre_tags ?? "");
          setYoutubeTags(p.youtube_tags ?? "");
          setSoundcloudTags(p.soundcloud_tags ?? "");
        }}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
        <Field
          label="Main Artists"
          value={main}
          onChange={setMain}
          placeholder="Dro Kenji x Juice WRLD"
        />
        <Field
          label="Also Fits"
          value={alsoFits}
          onChange={setAlsoFits}
          placeholder="Lil Peep, Convolk, Scorey"
        />
        <Field
          label="Genre Tags"
          value={genreTags}
          onChange={setGenreTags}
          placeholder="Dark Melodic Trap"
        />
        <PlatformTagsField
          label="SoundCloud Tags"
          icon={Music2}
          iconColor="#ff7700"
          value={soundcloudTags}
          onChange={setSoundcloudTags}
          hint="optional · default-Tags aus Settings werden ergänzt · max 9 · leer = auto"
          placeholder={
`Dro Kenji Type Beat
Juice WRLD Type Beat
Sad Guitar
Dreamy`
          }
        />
        <PlatformTagsField
          label="YouTube Tags"
          icon={Youtube}
          iconColor="#ff0033"
          value={youtubeTags}
          onChange={setYoutubeTags}
          hint={`optional · {{YEAR}} wird ersetzt · leer = auto`}
          placeholder={
`juice wrld type beat, dro kenji type beat, guardin type beat,
sad guitar type beat, emo trap type beat, melodic sad trap,
free type beat {{YEAR}}, lil skies type beat, ...`
          }
        />
      </div>
    </Card>
  );
}

// ─── Small "this preset includes a curated SC / YT tag list" badge ─────────

function PlatformBadge({ icon: Icon, label, color, tooltip }: {
  icon: React.ElementType;
  label: string;
  color: string;
  tooltip: string;
}) {
  return (
    <span
      title={tooltip}
      style={{
        display: "inline-flex", alignItems: "center", gap: 3,
        fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
        padding: "1px 6px", borderRadius: 3,
        background: `${color}1f`,
        color,
      }}
    >
      <Icon size={9} strokeWidth={2.5} /> {label}
    </span>
  );
}

// ─── Platform-specific tag textarea (used for SoundCloud + YouTube) ─────────

function PlatformTagsField({ label, icon: Icon, iconColor, value, onChange, hint, placeholder }: {
  label: string;
  icon: React.ElementType;
  iconColor: string;
  value: string;
  onChange: (v: string) => void;
  hint: string;
  placeholder: string;
}) {
  return (
    <div>
      <label style={{
        display: "flex", alignItems: "center", gap: 6,
        fontSize: 9, fontWeight: 700,
        color: C.onSecondaryFixedVar,
        textTransform: "uppercase", letterSpacing: "0.1em",
        marginBottom: 6,
      }}>
        <Icon size={11} strokeWidth={2} color={iconColor} />
        {label}
        <span style={{
          marginLeft: "auto",
          fontSize: 9, fontWeight: 500,
          letterSpacing: "0.03em", textTransform: "none",
          color: C.onSecondaryFixedVar, opacity: 0.7,
        }}>
          {hint}
        </span>
      </label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={5}
        spellCheck={false}
        style={{
          width: "100%",
          padding: "10px 14px",
          fontSize: 12,
          fontFamily: "monospace",
          lineHeight: 1.5,
          background: C.surfaceContainerLowest,
          border: `1px solid ${C.border20}`,
          borderRadius: 8,
          outline: "none",
          color: C.onSurface,
          resize: "vertical",
          minHeight: 80,
          boxSizing: "border-box",
          whiteSpace: "pre-wrap",
        }}
      />
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Field({ label, value, onChange, placeholder }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label style={{
        fontSize: 9, fontWeight: 700,
        color: C.onSecondaryFixedVar,
        textTransform: "uppercase", letterSpacing: "0.1em",
        display: "block", marginBottom: 6,
      }}>
        {label}
      </label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          ...commonStyles.input,
          width: "100%",
          padding: "11px 14px",
          fontSize: 13,
          background: C.surfaceContainerLowest,
          border: `1px solid ${C.border20}`,
          borderRadius: 8,
          outline: "none",
          color: C.onSurface,
        }}
      />
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving") return (
    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: C.onSurfaceVariant }}>
      <Loader2 size={11} style={{ animation: "spin 0.8s linear infinite" }} />
      Saving…
    </span>
  );
  if (state === "saved") return (
    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: C.mint }}>
      <Check size={11} strokeWidth={2.5} />
      Saved
    </span>
  );
  return null;
}

// ─── Preset Bar ─────────────────────────────────────────────────────────────

function PresetBar({ currentMain, currentAlsoFits, currentGenreTags, currentYoutubeTags, currentSoundcloudTags, onApply }: {
  currentMain: string;
  currentAlsoFits: string;
  currentGenreTags: string;
  currentYoutubeTags: string;
  currentSoundcloudTags: string;
  onApply: (p: TypeBeatPreset) => void;
}) {
  const [presets, setPresets]     = useState<TypeBeatPreset[]>([]);
  const [openList, setOpenList]   = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const [showSave, setShowSave]   = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try { setPresets(await api.upload.getPresets()); }
    catch (e) { console.error("[Presets] load failed:", e); }
  };
  useEffect(() => { load(); }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!openList) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpenList(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openList]);

  const handleApply = async (p: TypeBeatPreset) => {
    onApply(p);
    setOpenList(false);
    try {
      await api.upload.bumpPresetUse(p.id);
      load();
    } catch (e) { console.error("[Presets] bump failed:", e); }
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm("Delete this preset?")) return;
    try {
      await api.upload.deletePreset(id);
      load();
    } catch (err) { console.error("[Presets] delete failed:", err); }
  };

  const handleSave = async () => {
    setError(null);
    const label = saveLabel.trim();
    if (!label) { setError("Label required"); return; }
    if (!currentMain.trim()) { setError("Set Main Artists first"); return; }
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
    <div ref={containerRef} style={{ display: "flex", gap: 8, position: "relative" }}>
      {/* Preset picker */}
      <button
        onClick={() => { setOpenList(o => !o); setShowSave(false); }}
        style={{
          flex: 1,
          display: "flex", alignItems: "center", gap: 8,
          padding: "9px 12px",
          background: C.surfaceContainerLowest,
          border: `1px solid ${openList ? C.primary + "60" : C.border20}`,
          borderRadius: 8,
          cursor: "pointer",
          fontSize: 11, fontWeight: 600,
          color: C.onSurfaceVariant,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        <Tag size={12} strokeWidth={1.75} />
        <span style={{ flex: 1, textAlign: "left" }}>
          Apply Preset {presets.length > 0 && <span style={{ color: C.onSecondaryFixedVar, marginLeft: 4 }}>({presets.length})</span>}
        </span>
        <ChevronDown size={12} style={{ transition: "transform 0.15s", transform: openList ? "rotate(180deg)" : "rotate(0)" }} />
      </button>

      {/* Save as preset toggle */}
      <button
        onClick={() => { setShowSave(s => !s); setOpenList(false); setError(null); }}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "9px 12px",
          background: showSave ? C.primary + "20" : C.surfaceContainerLowest,
          border: `1px solid ${showSave ? C.primary + "60" : C.border20}`,
          borderRadius: 8,
          cursor: "pointer",
          fontSize: 11, fontWeight: 600,
          color: showSave ? C.primary : C.onSurfaceVariant,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        <Plus size={12} strokeWidth={2} />
        Save
      </button>

      {/* Dropdown */}
      {openList && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0,
          marginTop: 4,
          background: C.surfaceContainer,
          border: `1px solid ${C.border20}`,
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          zIndex: 10,
          maxHeight: 280,
          overflowY: "auto",
        }}>
          {presets.length === 0 && (
            <div style={{ padding: 14, fontSize: 11, color: C.onSurfaceVariant, textAlign: "center" }}>
              No presets yet. Save the current Type-Beat info as a preset to reuse it later.
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
                    <PlatformBadge icon={Music2} label="SC" color="#ff7700" tooltip="Includes a curated SoundCloud tag list" />
                  )}
                  {p.youtube_tags && (
                    <PlatformBadge icon={Youtube} label="YT" color="#ff5577" tooltip="Includes a curated YouTube tag list" />
                  )}
                </div>
                <div style={{ fontSize: 11, color: C.onSurfaceVariant, lineHeight: 1.4 }}>
                  {p.main_artists}
                  {p.also_fits && <span style={{ color: C.onSecondaryFixedVar }}> · also fits {p.also_fits}</span>}
                </div>
                {p.genre_tags && (
                  <div style={{ fontSize: 10, color: C.onSecondaryFixedVar, marginTop: 2 }}>
                    {p.genre_tags}
                  </div>
                )}
              </div>
              <button
                onClick={(e) => handleDelete(e, p.id)}
                title="Delete preset"
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
      )}

      {/* Save form */}
      {showSave && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0,
          marginTop: 4,
          background: C.surfaceContainer,
          border: `1px solid ${C.border20}`,
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          zIndex: 10,
          padding: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ flex: 1, fontSize: 10, fontWeight: 700, color: C.onSecondaryFixedVar, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Save current as preset
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
              placeholder="Preset label (e.g. Dro Kenji x Juice WRLD - dark)"
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
            Captures Main Artists, Also Fits, Genre Tags, SoundCloud Tags and YouTube Tags.
          </div>
        </div>
      )}
    </div>
  );
}
