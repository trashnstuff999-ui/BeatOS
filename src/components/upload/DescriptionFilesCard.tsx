// src/components/upload/DescriptionFilesCard.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// 3-tab editor for the Beatstars / SoundCloud / YouTube description files.
// Loads rendered templates from backend, lets user edit per-tab, then saves
// each tab (or all) into {beat_folder}/{platform}.txt at the beat root.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import {
  ShoppingBag, Music2, Youtube, Copy, Save, RefreshCw, FolderOpen,
  Check, AlertCircle, Loader2, FileText, ChevronDown,
} from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { C, PLATFORM_CONFIG } from "../../lib/theme";
import { SectionCard, SectionIconBtn } from "../ui/SectionCard";
import { api } from "../../lib/api";
import type { UploadPlatform, UploadDescriptions, UploadFilesState } from "../../types/upload";

import { extractTitle, extractDescription, extractTags, countTags } from "../../lib/descriptions";

interface DescriptionFilesCardProps {
  beatId: string;
  uploadFiles: UploadFilesState;   // from AssetCheck — shows on-disk state per file
  onSaved: () => void;             // parent re-fetches data so the file-status indicators update
  // Re-render trigger: bump this number whenever something that affects the
  // rendered output changes (type-beat fields, upload status URL, etc.) and
  // the card will auto re-render.
  rerenderKey: number;
}

type TabKey = UploadPlatform;
type Banner = { kind: "ok" | "err"; msg: string } | null;

const TABS: Array<{ key: TabKey; label: string; icon: React.ElementType; color: string; file: string }> = [
  { key: "beatstars",  label: "Beatstars",  icon: ShoppingBag, color: PLATFORM_CONFIG.beatstars.color,  file: "beatstars.txt"  },
  { key: "soundcloud", label: "SoundCloud", icon: Music2,      color: PLATFORM_CONFIG.soundcloud.color, file: "soundcloud.txt" },
  { key: "youtube",    label: "YouTube",    icon: Youtube,     color: PLATFORM_CONFIG.youtube.color,    file: "youtube.txt"    },
];

export function DescriptionFilesCard({
  beatId, uploadFiles, onSaved, rerenderKey,
}: DescriptionFilesCardProps) {
  const [active, setActive] = useState<TabKey>("beatstars");
  const [drafts, setDrafts] = useState<UploadDescriptions | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving]   = useState(false);
  const [banner, setBanner]       = useState<Banner>(null);
  // Per-tab "user has edited this tab" flag — used to avoid clobbering manual
  // edits when something else triggers a re-render upstream.
  const [dirty, setDirty] = useState<Record<TabKey, boolean>>({
    beatstars: false, soundcloud: false, youtube: false,
  });

  const renderFromBackend = async (force = false) => {
    setIsLoading(true);
    setBanner(null);
    try {
      const rendered = await api.upload.renderDescriptions(beatId);
      setDrafts(prev => {
        if (!prev || force) return rendered;
        // Preserve fields the user has manually edited.
        return {
          beatstars:  dirty.beatstars  ? prev.beatstars  : rendered.beatstars,
          soundcloud: dirty.soundcloud ? prev.soundcloud : rendered.soundcloud,
          youtube:    dirty.youtube    ? prev.youtube    : rendered.youtube,
        };
      });
      if (force) setDirty({ beatstars: false, soundcloud: false, youtube: false });
    } catch (e) {
      setBanner({ kind: "err", msg: String(e) });
    } finally {
      setIsLoading(false);
    }
  };

  // Load on beat change OR when upstream signals re-render needed.
  useEffect(() => {
    if (!beatId) return;
    renderFromBackend(false);
  }, [beatId, rerenderKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset drafts + dirty when beat changes (handled by reload but we also
  // want dirty flags cleared)
  useEffect(() => {
    setDirty({ beatstars: false, soundcloud: false, youtube: false });
    setBanner(null);
  }, [beatId]);

  const setDraft = (key: TabKey, value: string) => {
    setDrafts(prev => prev ? { ...prev, [key]: value } : prev);
    setDirty(prev => ({ ...prev, [key]: true }));
  };

  const handleCopy = async () => {
    if (!drafts) return;
    try {
      await navigator.clipboard.writeText(drafts[active]);
      setBanner({ kind: "ok", msg: `Copied ${TABS.find(t => t.key === active)?.label} to clipboard` });
      setTimeout(() => setBanner(b => (b?.kind === "ok" ? null : b)), 2200);
    } catch (e) {
      setBanner({ kind: "err", msg: `Clipboard failed: ${e}` });
    }
  };

  const handleCopyTitle = async () => {
    if (!drafts) return;
    try {
      await navigator.clipboard.writeText(extractTitle(drafts[active]));
      setBanner({ kind: "ok", msg: "Titel kopiert" });
      setTimeout(() => setBanner(b => (b?.kind === "ok" ? null : b)), 2200);
    } catch (e) {
      setBanner({ kind: "err", msg: `Clipboard failed: ${e}` });
    }
  };

  const handleCopyDescription = async () => {
    if (!drafts) return;
    try {
      await navigator.clipboard.writeText(extractDescription(drafts[active]));
      setBanner({ kind: "ok", msg: "Beschreibung kopiert" });
      setTimeout(() => setBanner(b => (b?.kind === "ok" ? null : b)), 2200);
    } catch (e) {
      setBanner({ kind: "err", msg: `Clipboard failed: ${e}` });
    }
  };

  const handleCopyTags = async () => {
    if (!drafts) return;
    try {
      await navigator.clipboard.writeText(extractTags(drafts[active]));
      setBanner({ kind: "ok", msg: "Tags kopiert" });
      setTimeout(() => setBanner(b => (b?.kind === "ok" ? null : b)), 2200);
    } catch (e) {
      setBanner({ kind: "err", msg: `Clipboard failed: ${e}` });
    }
  };

  const persist = async (which: "current" | "all") => {
    if (!drafts) return;
    setIsSaving(true);
    setBanner(null);
    try {
      await api.upload.saveDescriptions({
        beat_id:    beatId,
        beatstars:  (which === "all" || active === "beatstars")  ? drafts.beatstars  : null,
        soundcloud: (which === "all" || active === "soundcloud") ? drafts.soundcloud : null,
        youtube:    (which === "all" || active === "youtube")    ? drafts.youtube    : null,
      });
      if (which === "all") {
        setDirty({ beatstars: false, soundcloud: false, youtube: false });
        setBanner({ kind: "ok", msg: "Saved all 3 description files to the beat folder" });
      } else {
        setDirty(prev => ({ ...prev, [active]: false }));
        setBanner({ kind: "ok", msg: `Saved ${TABS.find(t => t.key === active)?.file}` });
      }
      onSaved();
      setTimeout(() => setBanner(b => (b?.kind === "ok" ? null : b)), 2500);
    } catch (e) {
      setBanner({ kind: "err", msg: `Save failed: ${e}` });
    } finally {
      setIsSaving(false);
    }
  };

  const openTemplatesFolder = async () => {
    try {
      const dir = await api.upload.getTemplatesDir();
      await revealItemInDir(dir);
    } catch (e) {
      setBanner({ kind: "err", msg: `Cannot open templates folder: ${e}` });
    }
  };

  // Editor collapsed by default — the title panel is the main output.
  // Stays open while the active tab has unsaved edits so nothing hides.
  const [editorOpen, setEditorOpen] = useState(false);

  const activeContent = drafts?.[active] ?? "";
  const activeTabMeta = TABS.find(t => t.key === active)!;
  const activeTitle = extractTitle(activeContent);
  const activeDescription = extractDescription(activeContent);
  const activeTags = extractTags(activeContent);
  const activeTagCount = countTags(activeTags);
  const showEditor = editorOpen || dirty[active];
  const fileExistsMap: Record<TabKey, boolean> = {
    beatstars:  uploadFiles.beatstars_txt,
    soundcloud: uploadFiles.soundcloud_txt,
    youtube:    uploadFiles.youtube_txt,
  };

  return (
    <SectionCard
      icon={FileText}
      title="Descriptions"
      actions={
        <div style={{ display: "flex", gap: 6 }}>
          <SectionIconBtn
            icon={RefreshCw}
            title="Alle 3 Tabs neu aus Templates rendern (verwirft ungespeicherte Edits)"
            onClick={() => renderFromBackend(true)}
            disabled={isLoading}
          />
          <SectionIconBtn
            icon={FolderOpen}
            title="Template-Ordner im Explorer öffnen"
            onClick={openTemplatesFolder}
          />
        </div>
      }
    >

      {/* ─── Tab strip ───────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        {TABS.map(tab => {
          const isActive = active === tab.key;
          const exists = fileExistsMap[tab.key];
          const isDirty = dirty[tab.key];
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActive(tab.key)}
              style={{
                flex: 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "9px 12px",
                background: isActive ? C.surfaceContainer : C.surfaceContainerLowest,
                border: `1px solid ${isActive ? tab.color + "60" : C.border15}`,
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 11, fontWeight: 700,
                color: isActive ? tab.color : C.onSurfaceVariant,
                letterSpacing: "0.05em", textTransform: "uppercase",
                position: "relative",
              }}
            >
              <Icon size={13} strokeWidth={1.75} />
              {tab.label}
              {isDirty && (
                <span title="Unsaved edits" style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: "#fda124",
                }} />
              )}
              {exists && !isDirty && (
                <Check size={11} color={C.mint} strokeWidth={2.5} />
              )}
            </button>
          );
        })}
      </div>

      {/* ─── Title panel — the headline output, always visible ──────────── */}
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        padding: "12px 14px",
        background: C.surfaceContainerLowest,
        border: `1px solid ${C.border15}`,
        borderRadius: 8,
        marginBottom: 10,
      }}>
        <activeTabMeta.icon size={14} color={activeTabMeta.color} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
            textTransform: "uppercase", color: C.onSecondaryFixedVar,
            marginBottom: 4,
          }}>
            Titel
          </div>
          <div style={{
            fontSize: 13, fontWeight: 600, color: C.onSurface,
            lineHeight: 1.45, wordBreak: "break-word",
          }}>
            {isLoading
              ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.onSurfaceVariant }}>
                  <Loader2 size={12} style={{ animation: "spin 0.8s linear infinite" }} /> Rendering…
                </span>
              : (activeTitle || <span style={{ color: C.onSecondaryFixedVar }}>—</span>)
            }
          </div>
        </div>
        <SmallBtn icon={Copy} label="Titel kopieren" onClick={handleCopyTitle} disabled={!drafts || isLoading} />
      </div>

      {/* ─── Description panel — copy without opening the raw text ──────── */}
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        padding: "12px 14px",
        background: C.surfaceContainerLowest,
        border: `1px solid ${C.border15}`,
        borderRadius: 8,
        marginBottom: 10,
      }}>
        <FileText size={14} color={C.onSecondaryFixedVar} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
            textTransform: "uppercase", color: C.onSecondaryFixedVar,
            marginBottom: 4,
          }}>
            Beschreibung
          </div>
          <div style={{
            fontSize: 11, color: C.onSurfaceVariant,
            lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical" as const,
            overflow: "hidden",
          }}>
            {isLoading
              ? "Rendering…"
              : (activeDescription || <span style={{ color: C.onSecondaryFixedVar }}>—</span>)
            }
          </div>
        </div>
        <SmallBtn icon={Copy} label="Beschreibung kopieren" onClick={handleCopyDescription} disabled={!drafts || isLoading} />
      </div>

      {/* ─── Tags panel — SC capped at 9, YouTube comma list ─────────────── */}
      {activeTags && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "12px 14px",
          background: C.surfaceContainerLowest,
          border: `1px solid ${C.border15}`,
          borderRadius: 8,
          marginBottom: 10,
        }}>
          <activeTabMeta.icon size={14} color={activeTabMeta.color} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
              textTransform: "uppercase", color: C.onSecondaryFixedVar,
              marginBottom: 4,
            }}>
              Tags
              <span style={{
                padding: "1px 7px", borderRadius: 9999,
                fontWeight: 600, letterSpacing: "0.02em", textTransform: "none",
                background: active === "soundcloud" && activeTagCount > 9
                  ? "rgba(255,115,81,0.15)"
                  : `${activeTabMeta.color}15`,
                color: active === "soundcloud" && activeTagCount > 9 ? C.error : activeTabMeta.color,
              }}>
                {active === "soundcloud" ? `${activeTagCount}/9` : activeTagCount}
              </span>
            </div>
            <div style={{
              fontSize: 11, color: C.onSurfaceVariant, fontFamily: "monospace",
              lineHeight: 1.5, wordBreak: "break-word",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical" as const,
              overflow: "hidden",
            }}>
              {activeTags.split(/\r?\n/).join("  ")}
            </div>
          </div>
          <SmallBtn icon={Copy} label="Tags kopieren" onClick={handleCopyTags} disabled={!drafts || isLoading} />
        </div>
      )}

      {/* ─── Full text — collapsed by default ───────────────────────────── */}
      <button
        onClick={() => setEditorOpen(o => !o)}
        style={{
          width: "100%",
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 12px",
          background: "transparent",
          border: `1px solid ${C.border10}`,
          borderRadius: 8,
          cursor: "pointer",
          fontSize: 10, fontWeight: 600,
          color: C.onSurfaceVariant,
          letterSpacing: "0.04em",
        }}
      >
        <ChevronDown
          size={12}
          style={{ transition: "transform 0.15s", transform: showEditor ? "rotate(180deg)" : "rotate(0)" }}
        />
        Volltext anzeigen & bearbeiten
        {dirty[active] && (
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, color: "#fda124" }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#fda124" }} />
            ungespeicherte Änderungen
          </span>
        )}
      </button>

      {showEditor && (
        <div style={{ position: "relative", marginTop: 8 }}>
          <textarea
            value={activeContent}
            onChange={e => setDraft(active, e.target.value)}
            spellCheck={false}
            style={{
              width: "100%",
              minHeight: 460,
              padding: "12px 14px",
              background: C.surfaceContainerLowest,
              border: `1px solid ${C.border20}`,
              borderRadius: 8,
              outline: "none",
              color: C.onSurface,
              fontFamily: "monospace",
              fontSize: 12,
              lineHeight: 1.55,
              resize: "vertical",
              boxSizing: "border-box",
              whiteSpace: "pre-wrap",
            }}
          />
          {isLoading && (
            <div style={{
              position: "absolute", inset: 0,
              background: "rgba(0,0,0,0.35)", backdropFilter: "blur(2px)",
              display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 8,
              color: C.onSurfaceVariant,
              fontSize: 11, fontWeight: 600,
              letterSpacing: "0.05em", textTransform: "uppercase",
            }}>
              <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite", marginRight: 8 }} />
              Rendering…
            </div>
          )}
        </div>
      )}

      {/* ─── Action bar — ONE primary action: Save All ───────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
        <FileTag tab={activeTabMeta} exists={fileExistsMap[active]} isDirty={dirty[active]} />
        <div style={{ flex: 1 }} />
        <SmallBtn icon={Copy} label="Text" onClick={handleCopy} disabled={!drafts} title="Kompletten Text kopieren" />
        <SmallBtn
          icon={Save}
          label={activeTabMeta.label}
          onClick={() => persist("current")}
          disabled={!drafts || isSaving}
          title={`Nur ${activeTabMeta.file} speichern`}
        />
        <SmallBtn
          icon={Save}
          label="Save All (3 Dateien)"
          onClick={() => persist("all")}
          disabled={!drafts || isSaving}
          primary
        />
      </div>

      {/* ─── Banner ──────────────────────────────────────────────────────── */}
      {banner && (
        <div style={{
          marginTop: 10,
          padding: "8px 12px",
          background: banner.kind === "ok" ? "rgba(52,211,153,0.10)" : "rgba(229,72,77,0.10)",
          border: `1px solid ${banner.kind === "ok" ? "rgba(52,211,153,0.35)" : "rgba(229,72,77,0.35)"}`,
          borderRadius: 6,
          display: "flex", alignItems: "center", gap: 8,
          fontSize: 11,
          color: banner.kind === "ok" ? "#34d399" : "#e5484d",
        }}>
          {banner.kind === "ok"
            ? <Check size={12} strokeWidth={2.5} />
            : <AlertCircle size={12} strokeWidth={2} />
          }
          {banner.msg}
        </div>
      )}
    </SectionCard>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function SmallBtn({ icon: Icon, label, onClick, disabled, primary, title }: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "7px 12px",
        background: primary ? C.primary : C.surfaceContainerLowest,
        border: primary ? "none" : `1px solid ${C.border20}`,
        borderRadius: 6,
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 10, fontWeight: 700,
        color: primary ? C.onPrimary : C.onSurfaceVariant,
        letterSpacing: "0.05em", textTransform: "uppercase",
        opacity: disabled ? 0.5 : 1,
        whiteSpace: "nowrap",
      }}
    >
      <Icon size={11} strokeWidth={2} />
      {label}
    </button>
  );
}

function FileTag({ tab, exists, isDirty }: {
  tab: { file: string; color: string };
  exists: boolean;
  isDirty: boolean;
}) {
  const status = isDirty ? "edited"
    : exists ? "saved"
    : "not yet written";
  const color = isDirty ? "#fda124" : exists ? C.mint : C.onSecondaryFixedVar;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      fontSize: 10, color: C.onSurfaceVariant,
    }}>
      <FileText size={11} color={C.onSecondaryFixedVar} strokeWidth={1.5} />
      <span style={{ fontFamily: "monospace" }}>{tab.file}</span>
      <span style={{ color, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>
        · {status}
      </span>
    </div>
  );
}
