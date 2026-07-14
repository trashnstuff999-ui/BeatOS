// src/components/studio/ProjectRow.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// One Studio project row. Row click = pick as asset-assignment target;
// every inner control stops propagation. Play = audio preview (export in
// the global player), Disc = open newest FLP in the DAW, Info = inspector.
// ═══════════════════════════════════════════════════════════════════════════════

import { Star, FolderOpen, Play, Archive, Zap, Disc3, Info, HardDrive } from "lucide-react";
import { C, STUDIO_STATUS_CONFIG } from "../../lib/theme";
import { formatRelativeTime } from "../../lib/time";
import type { StudioProject, StudioStatus } from "../../types/studio";

const STATUS_ORDER: StudioStatus[] = ["idea", "wip", "exported", "ready"];

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
  const exportDetected = (p.has_mp3 || p.has_wav) && (p.status === "idea" || p.status === "wip");
  const canPreview = p.has_mp3 || p.has_wav;

  return (
    <div
      onClick={onSelect}
      title={isSelected ? "Ausgewählt — Assets-Tab weist diesem Projekt zu" : "Klick wählt das Projekt für die Asset-Zuweisung"}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "11px 16px",
        borderTop: `1px solid ${C.border10}`,
        background: isSelected ? "rgba(253,161,36,0.06)" : "transparent",
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

      {/* Name + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: 13, fontWeight: 600, color: C.onSurface,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {p.parsed_name || p.name}
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
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3, fontSize: 10, color: C.onSecondaryFixedVar }}>
          {p.key && <span>{p.key}</span>}
          {p.bpm != null && <span>{p.bpm} BPM</span>}
          <span title={p.modified_date ?? undefined}>· {formatRelativeTime(p.modified_secs)}</span>
          {p.flp_count > 1 && <span>· {p.flp_count} FLPs</span>}
          <span title={p.root} style={{ display: "inline-flex", alignItems: "center", gap: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
            <HardDrive size={9} /> {p.root.split(/[/\\]/).filter(Boolean).pop()}
          </span>
        </div>
      </div>

      {/* Asset pipeline */}
      <AssetPipeline project={p} />

      {/* Status segments */}
      <div style={{
        display: "flex", gap: 2, flexShrink: 0,
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${C.border15}`,
        borderRadius: 7, padding: 2,
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
                padding: "3px 8px",
                background: active ? m.bg : "transparent",
                border: "none", borderRadius: 5,
                cursor: "pointer",
                fontSize: 9, fontWeight: 700,
                color: active ? m.color : C.onSecondaryFixedVar,
                letterSpacing: "0.04em", textTransform: "uppercase",
                transition: "all 0.15s",
              }}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <RowBtn icon={Disc3} title="In FL Studio öffnen (neueste FLP)" onClick={onOpenDaw} accent />
        <RowBtn icon={Info} title="Details & Notizen" onClick={onInspect} />
        <RowBtn icon={FolderOpen} title="Ordner im Explorer öffnen" onClick={onOpenFolder} />
        <button
          onClick={(e) => { e.stopPropagation(); onArchive(); }}
          title="In den Create-Flow übernehmen und archivieren"
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "6px 10px", borderRadius: 6,
            background: p.status === "ready" ? C.primary : "transparent",
            border: `1px solid ${p.status === "ready" ? C.primary : C.border15}`,
            color: p.status === "ready" ? C.onPrimary : C.onSurfaceVariant,
            cursor: "pointer",
            fontSize: 10, fontWeight: 700,
          }}
        >
          <Archive size={11} strokeWidth={2} />
          Archivieren
        </button>
      </div>
    </div>
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
