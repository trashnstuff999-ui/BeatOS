// src/components/studio/ProjectRow.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// One Studio project row. Row click = pick as asset-assignment target;
// every inner control stops propagation. Play = audio preview (export in
// the global player), Disc = open newest FLP in the DAW, Info = inspector.
//
// Layout: one loud line (song title from the export, folder name as
// fallback), one dimmed meta line. Pipeline/status/actions sit in fixed
// columns so they line up across rows; actions fade in on hover — only
// "Archivieren" stays visible for projects that are ready.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { Star, FolderOpen, Play, Archive, Zap, Disc3, Info, HardDrive, Folder } from "lucide-react";
import { C, STUDIO_STATUS_CONFIG } from "../../lib/theme";
import { formatRelativeTime } from "../../lib/time";
import { projectDisplayName, projectFolderLabel } from "../../types/studio";
import type { StudioProject, StudioStatus } from "../../types/studio";

const STATUS_ORDER: StudioStatus[] = ["idea", "wip", "exported", "ready"];

// Fixed column widths — keep the right half aligned across all rows
const COL_PIPELINE = 104;
const COL_STATUS = 258;
const COL_ACTIONS = 218;

interface ProjectRowProps {
  project: StudioProject;
  isSelected: boolean;
  dimmed?: boolean;
  onSelect: () => void;
  onPatch: (patch: Partial<Pick<StudioProject, "status" | "priority" | "notes">>) => void;
  onOpenDaw: () => void;
  onPreview: () => void;
  onInspect: () => void;
  onOpenFolder: () => void;
  onArchive: () => void;
}

export function ProjectRow({
  project: p, isSelected, dimmed,
  onSelect, onPatch, onOpenDaw, onPreview, onInspect, onOpenFolder, onArchive,
}: ProjectRowProps) {
  const [hovered, setHovered] = useState(false);
  const exportDetected = (p.has_mp3 || p.has_wav) && (p.status === "idea" || p.status === "wip");
  const canPreview = p.has_mp3 || p.has_wav;
  const title = projectDisplayName(p);
  const folderLabel = projectFolderLabel(p);
  const isReady = p.status === "ready";

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={isSelected ? "Ausgewählt — Assets-Tab weist diesem Projekt zu" : "Klick wählt das Projekt für die Asset-Zuweisung"}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "13px 16px",
        borderTop: `1px solid ${C.border10}`,
        background: isSelected
          ? "rgba(253,161,36,0.06)"
          : hovered ? "rgba(255,255,255,0.02)" : "transparent",
        boxShadow: isSelected ? `inset 3px 0 0 ${C.primary}` : "none",
        cursor: "pointer",
        opacity: dimmed ? 0.55 : 1,
        transition: "background 0.15s, opacity 0.15s",
      }}
    >
      {/* Priority star */}
      <button
        onClick={(e) => { e.stopPropagation(); onPatch({ priority: p.priority ? 0 : 1 }); }}
        title={p.priority ? "Priorität entfernen" : "Als Priorität markieren"}
        style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 2, flexShrink: 0 }}
      >
        <Star
          size={15}
          color={p.priority ? C.primary : C.onSecondaryFixedVar}
          fill={p.priority ? C.primary : "none"}
          strokeWidth={1.75}
        />
      </button>

      {/* Audio preview (export) */}
      <button
        onClick={(e) => { e.stopPropagation(); if (canPreview) onPreview(); }}
        disabled={!canPreview}
        title={canPreview ? "Export anhören" : "Kein Audio-Export im Ordner"}
        style={{
          width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
          background: canPreview ? "rgba(52,211,153,0.10)" : "transparent",
          border: `1px solid ${canPreview ? "rgba(52,211,153,0.40)" : C.border10}`,
          color: canPreview ? C.mint : C.onSecondaryFixedVar,
          cursor: canPreview ? "pointer" : "default",
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: canPreview ? 1 : 0.35,
        }}
      >
        <Play size={11} fill={canPreview ? C.mint : "none"} strokeWidth={1.5} style={{ marginLeft: 1 }} />
      </button>

      {/* ── Line 1: title · Line 2: everything secondary ─────────────────── */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            title={title}
            style={{
              fontSize: 14, fontWeight: 700, color: C.onSurface,
              letterSpacing: "-0.01em",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            {title}
          </span>
          {exportDetected && (
            <button
              onClick={(e) => { e.stopPropagation(); onPatch({ status: "exported" }); }}
              title="MP3/WAV im Ordner gefunden — Klick setzt Status auf Exportiert"
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 8px", borderRadius: 9999,
                background: "rgba(148,146,255,0.12)",
                border: "1px solid rgba(148,146,255,0.35)",
                color: "#9492ff", fontSize: 9, fontWeight: 700,
                cursor: "pointer", flexShrink: 0,
              }}
            >
              <Zap size={9} strokeWidth={2.5} /> Export erkannt
            </button>
          )}
        </div>

        <div style={{
          display: "flex", alignItems: "center", gap: 7,
          marginTop: 4,
          fontSize: 10, color: C.onSecondaryFixedVar,
          overflow: "hidden", whiteSpace: "nowrap",
        }}>
          {folderLabel && (
            <span
              title={`Ordner: ${folderLabel}`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                overflow: "hidden", textOverflow: "ellipsis", maxWidth: 190,
              }}
            >
              <Folder size={9} strokeWidth={1.75} />
              {folderLabel}
            </span>
          )}
          {p.key && <MetaItem>{p.key}</MetaItem>}
          {p.bpm != null && <MetaItem>{p.bpm} BPM</MetaItem>}
          <MetaItem title={p.modified_date ?? undefined}>{formatRelativeTime(p.modified_secs)}</MetaItem>
          {p.flp_count > 1 && <MetaItem>{p.flp_count} FLPs</MetaItem>}
          <MetaItem title={p.root}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140 }}>
              <HardDrive size={9} /> {p.root.split(/[/\\]/).filter(Boolean).pop()}
            </span>
          </MetaItem>
        </div>
      </div>

      {/* Asset pipeline — fixed column */}
      <div style={{ width: COL_PIPELINE, flexShrink: 0, display: "flex", justifyContent: "center" }}>
        <AssetPipeline project={p} />
      </div>

      {/* Status segments — fixed column */}
      <div style={{
        width: COL_STATUS, flexShrink: 0,
        display: "flex", gap: 2,
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${C.border15}`,
        borderRadius: 7, padding: 2,
        boxSizing: "border-box",
      }}>
        {STATUS_ORDER.map(s => {
          const active = p.status === s;
          const m = STUDIO_STATUS_CONFIG[s];
          return (
            <button
              key={s}
              onClick={(e) => { e.stopPropagation(); onPatch({ status: s }); }}
              title={m.label}
              style={{
                flex: 1,
                padding: "3px 4px",
                background: active ? m.bg : "transparent",
                border: "none", borderRadius: 5,
                cursor: "pointer",
                fontSize: 9, fontWeight: 700,
                color: active ? m.color : C.onSecondaryFixedVar,
                letterSpacing: "0.04em", textTransform: "uppercase",
                transition: "all 0.15s",
                whiteSpace: "nowrap",
              }}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Actions — fixed column, fade in on hover */}
      <div style={{
        width: COL_ACTIONS, flexShrink: 0,
        display: "flex", gap: 6, justifyContent: "flex-end",
      }}>
        <div style={{
          display: "flex", gap: 6,
          opacity: hovered ? 1 : 0,
          pointerEvents: hovered ? "auto" : "none",
          transition: "opacity 0.15s",
        }}>
          <RowBtn icon={Disc3} title="In FL Studio öffnen (neueste FLP)" onClick={onOpenDaw} accent />
          <RowBtn icon={Info} title="Details & Notizen" onClick={onInspect} />
          <RowBtn icon={FolderOpen} title="Ordner im Explorer öffnen" onClick={onOpenFolder} />
        </div>
        {/* Ready projects keep their call to action visible */}
        <div style={{
          opacity: isReady || hovered ? 1 : 0,
          pointerEvents: isReady || hovered ? "auto" : "none",
          transition: "opacity 0.15s",
        }}>
          <button
            onClick={(e) => { e.stopPropagation(); onArchive(); }}
            title="In den Create-Flow übernehmen und archivieren"
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "6px 10px", borderRadius: 6,
              background: isReady ? C.primary : "transparent",
              border: `1px solid ${isReady ? C.primary : C.border15}`,
              color: isReady ? C.onPrimary : C.onSurfaceVariant,
              cursor: "pointer",
              fontSize: 10, fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            <Archive size={11} strokeWidth={2} />
            Archivieren
          </button>
        </div>
      </div>
    </div>
  );
}

/** Meta item with a leading separator dot. */
function MetaItem({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <>
      <span style={{ opacity: 0.4 }}>·</span>
      <span title={title} style={{ flexShrink: 0 }}>{children}</span>
    </>
  );
}

// ─── Asset pipeline: Export · Artwork · Video ────────────────────────────────

type PipeState = "done" | "partial" | "missing";

export function AssetPipeline({ project: p, large }: { project: StudioProject; large?: boolean }) {
  const exportState: PipeState = p.has_mp3 && p.has_wav ? "done" : (p.has_mp3 || p.has_wav) ? "partial" : "missing";
  const artworkState: PipeState = p.has_cover && p.has_thumbnail ? "done" : (p.has_cover || p.has_thumbnail) ? "partial" : "missing";
  const videoState: PipeState = p.has_video ? "done" : "missing";

  const tooltip = [
    `Export: MP3 ${p.has_mp3 ? "✓" : "—"} · WAV ${p.has_wav ? "✓" : "—"}`,
    `Artwork: Cover ${p.has_cover ? "✓" : "—"} · Thumbnail ${p.has_thumbnail ? "✓" : "—"}`,
    `Video: ${p.has_video ? "✓" : "—"}`,
  ].join("\n");

  const size = large ? 14 : 9;

  return (
    <div title={tooltip} style={{ display: "flex", gap: large ? 18 : 10, flexShrink: 0, cursor: "default" }}>
      {([["EXP", exportState], ["ART", artworkState], ["VID", videoState]] as const).map(([label, state]) => (
        <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <span style={{
            width: size, height: size, borderRadius: "50%",
            background: state === "done" ? C.mint : state === "partial" ? "transparent" : "rgba(255,255,255,0.06)",
            border: state === "partial" ? `2px solid ${C.primary}` : state === "missing" ? `1px solid ${C.border20}` : "none",
            boxSizing: "border-box",
          }} />
          <span style={{
            fontSize: large ? 9 : 7, fontWeight: 700, letterSpacing: "0.06em",
            color: state === "done" ? C.mint : state === "partial" ? C.primary : C.onSecondaryFixedVar,
            opacity: state === "missing" ? 0.55 : 1,
          }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

function RowBtn({ icon: Icon, title, onClick, accent }: {
  icon: React.ElementType;
  title: string;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      style={{
        width: 28, height: 28, borderRadius: 6,
        background: "transparent",
        border: `1px solid ${accent ? C.primary + "50" : C.border15}`,
        cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: accent ? C.primary : C.onSurfaceVariant,
      }}
    >
      <Icon size={13} strokeWidth={1.75} />
    </button>
  );
}
