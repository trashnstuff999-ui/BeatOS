// src/components/studio/ProjectRow.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// One Studio project row. Zeilenklick öffnet den Inspector — das ist die
// Absicht, die man fast immer hat. Jedes innere Bedienelement stoppt die
// Weitergabe. Play = Export im globalen Player, Disc = neueste FLP in FL.
//
// Layout: one loud line (song title from the export, folder name as
// fallback), one dimmed meta line. Pipeline/status/actions sit in fixed
// columns so they line up across rows; actions fade in on hover — only
// "Archivieren" stays visible for projects that are ready.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { Star, FolderOpen, Play, Archive, Disc3, Folder, Trash2, Copy, Check } from "lucide-react";
import { C, STUDIO_STATUS_CONFIG } from "../../lib/theme";
import { formatRelativeTime } from "../../lib/time";
import { deriveStage, projectDisplayName, projectFolderLabel, MANUAL_STATUSES } from "../../types/studio";
import type { StudioProject } from "../../types/studio";

// ─── Asset-Spalte: eine feste Zelle pro Datei ────────────────────────────────
// Die fünf Dateien in Pipeline-Reihenfolge, gruppiert nach Audio · Bild · Video
// — dieselbe Reihenfolge, aus der deriveStage() die Stufe rechnet.
const ASSET_GROUPS: Array<Array<[keyof StudioProject, string]>> = [
  [["has_mp3", "MP3"], ["has_wav", "WAV"]],
  [["has_cover", "Cover"], ["has_thumbnail", "Thumbnail"]],
  [["has_video", "Video"]],
];
const SLOT = 26;       // Breite einer Zelle — die Kopfzeile benutzt dieselbe
const GROUP_GAP = 14;  // Luft zwischen den Gruppen — doppelt so viel wie innerhalb,
                       // sonst liest man die Gruppierung nicht mehr

// Fixed column widths — keep the right half aligned across all rows
const COL_PIPELINE = 5 * SLOT + 2 * GROUP_GAP;
const COL_STATUS = 272;
const COL_ACTIONS = 250;

interface ProjectRowProps {
  project: StudioProject;
  /** Der Inspector steht gerade auf dieser Zeile */
  isOpen: boolean;
  /** Teil der Mehrfachauswahl (Strg- oder Shift-Klick) */
  isSelected?: boolean;
  dimmed?: boolean;
  onPatch: (patch: Partial<Pick<StudioProject, "status" | "priority" | "notes">>) => void;
  onOpenDaw: () => void;
  onPreview: () => void;
  /** Zeilenklick — öffnet Details; mit Strg/Shift wählt er stattdessen aus */
  onOpen: (e: React.MouseEvent) => void;
  onOpenFolder: () => void;
  onArchive: () => void;
  onTrash: () => void;
}

export function ProjectRow({
  project: p, isOpen, isSelected, dimmed,
  onPatch, onOpenDaw, onPreview, onOpen, onOpenFolder, onArchive, onTrash,
}: ProjectRowProps) {
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const canPreview = p.has_mp3 || p.has_wav;
  const title = projectDisplayName(p);

  // Der Name, unter dem der Export gespeichert gehört: „TITEL [Am 140]" — genau
  // die Schreibweise, die parse_audio_filename später wieder auseinandernimmt.
  const keyBpm = [p.key, p.bpm].filter(x => x != null && x !== "").join(" ");
  const exportName = keyBpm ? `${title} [${keyBpm}]` : title;
  const copyExportName = async () => {
    try {
      await navigator.clipboard.writeText(exportName);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (e) {
      alert(`Kopieren fehlgeschlagen: ${String(e)}`);
    }
  };
  const folderLabel = projectFolderLabel(p);
  const isReady = p.status === "ready";
  const isDiscard = p.status === "discard";
  const status = STUDIO_STATUS_CONFIG[p.status] ?? STUDIO_STATUS_CONFIG.idea;

  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title="Details, Notizen und Assets öffnen — mit Strg oder Shift auswählen"
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "13px 16px",
        borderTop: `1px solid ${C.border10}`,
        background: isSelected
          ? "rgba(253,161,36,0.12)"
          : isOpen
          ? "rgba(253,161,36,0.06)"
          : hovered ? "rgba(255,255,255,0.02)" : "transparent",
        boxShadow: isSelected || isOpen ? `inset 3px 0 0 ${C.primary}` : "none",
        cursor: "pointer",
        // Aussortiertes tritt zurück — es steht nur noch da, bis der
        // Papierkorb-Lauf es abholt.
        opacity: isSelected ? 1 : dimmed ? 0.55 : isDiscard && !hovered ? 0.5 : 1,
        // Sonst markiert Shift-Klick quer über die Liste den Text mit
        userSelect: "none",
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
          {/* „Export erkannt" ist weg: den Sprung auf Exportiert macht jetzt
              der Scan selbst, sobald MP3 und WAV im Ordner liegen. */}
        </div>

        {/* Der Trennpunkt steht ZWISCHEN den Angaben, nicht vor jeder: ohne
            Export gibt es keinen Ordner-Label, und die Zeile fing mit „· " an. */}
        <div style={{
          display: "flex", alignItems: "center", gap: 7,
          marginTop: 4,
          fontSize: 10, color: C.onSecondaryFixedVar,
          overflow: "hidden", whiteSpace: "nowrap",
        }}>
          {joinWithDots([
            folderLabel && (
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
            ),
            p.key && <span>{p.key}</span>,
            p.bpm != null && <span>{p.bpm} BPM</span>,
            <span title={p.modified_date ?? undefined}>{formatRelativeTime(p.modified_secs)}</span>,
            p.flp_count > 1 && <span>{p.flp_count} FLPs</span>,
          ])}
          {/* Q3: Der Produktions-Root stand in jeder Zeile gleich da und trennte
              nichts. Er lebt als Filter-Chip in der Toolbar und im Inspector. */}
        </div>
      </div>

      {/* Asset pipeline — fixed column */}
      <div style={{ width: COL_PIPELINE, flexShrink: 0, display: "flex", justifyContent: "center" }}>
        <AssetPipeline project={p} />
      </div>

      {/* Der gültige Status steht immer als Pille da — GROSS, weil er ein
          Zustand ist. Daneben erscheinen bei Hover die zwei Dinge, die du
          selbst entscheidest, in Satzschreibung, weil es Handlungen sind.
          Idee/Exportiert/Bereit haben keinen Knopf mehr: die machst du mit
          Dateien im Ordner, nicht mit einem Klick. */}
      <div style={{
        width: COL_STATUS, flexShrink: 0, boxSizing: "border-box",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0,
          padding: "3px 10px", borderRadius: 9999,
          background: status.bg,
          color: status.color,
          fontSize: 10, fontWeight: 700,
          letterSpacing: "0.04em", textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: status.color }} />
          {status.label}
        </span>

        {/* Echtes Ein- und Ausblenden, nicht nur opacity: unsichtbare Knöpfe
            blieben sonst mit Tab erreichbar. Die Spalte hat feste Breite, es
            springt also trotzdem nichts. */}
        {(hovered || isOpen) && (
          <ManualStatusToggles project={p} onPatch={onPatch} variant="row" />
        )}
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
          <RowBtn
            icon={copied ? Check : Copy}
            title={copied ? "Kopiert" : `Exportnamen kopieren: ${exportName}`}
            onClick={copyExportName}
          />
          <RowBtn icon={FolderOpen} title="Ordner im Explorer öffnen" onClick={onOpenFolder} />
          <RowBtn icon={Trash2} title="Projektordner in den Papierkorb" onClick={onTrash} danger />
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

/** Vorhandene Angaben mit „·" verbinden — leere fallen samt Punkt weg. */
function joinWithDots(items: React.ReactNode[]): React.ReactNode[] {
  return items
    .filter(Boolean)
    .map((item, i) => (
      <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
        {i > 0 && <span style={{ opacity: 0.4 }}>·</span>}
        {item}
      </span>
    ));
}

// ─── Asset pipeline: MP3 · WAV | Cover · Thumbnail | Video ───────────────────

/**
 * Keine Symbole, keine Kopfzeile: in jeder Zelle steht der Dateiname selbst.
 * Was im Ordner liegt, steht in Mint und fett da; was fehlt, tritt so weit
 * zurück, dass die 841 Ideen-Zeilen ruhig bleiben. Damit beschriftet sich
 * jede Zeile selbst — es gibt keine Legende mehr, die gegen die Spalte
 * driften könnte (daher kam „EXPARTVID").
 */
export function AssetPipeline({ project: p }: { project: StudioProject }) {
  const tooltip = ASSET_GROUPS.flat()
    .map(([key, label]) => `${label} ${p[key] ? "✓" : "fehlt"}`)
    .join(" · ");

  return (
    <div title={tooltip} style={{ display: "flex", gap: GROUP_GAP, flexShrink: 0, cursor: "default" }}>
      {ASSET_GROUPS.map((group, i) => (
        <div key={i} style={{ display: "flex" }}>
          {group.map(([key, label]) => {
            const has = !!p[key];
            return (
              <div key={label} style={{ width: SLOT, display: "flex", justifyContent: "center" }}>
                <span style={{
                  fontSize: 9, letterSpacing: "0.02em",
                  fontWeight: has ? 700 : 500,
                  color: has ? C.mint : C.onSecondaryFixedVar,
                  opacity: has ? 1 : 0.22,
                }}>
                  {label.slice(0, 3).toUpperCase()}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── Die zwei Status, die du selbst vergibst ─────────────────────────────────

/**
 * Denselben Knopf nochmal drücken gibt das Projekt an die Automatik zurück.
 * Idee/Exportiert/Bereit haben keinen Knopf: die machst du mit Dateien im
 * Ordner, nicht mit einem Klick.
 *
 * Eine Wahrheit, zwei Größen: die Zeile hat wenig Platz und zeigt nur das Wort,
 * das Panel hat Platz und schreibt „… aufheben" dazu. Vorher stand beides samt
 * Tooltips wortgleich in zwei Dateien.
 */
export function ManualStatusToggles({ project: p, onPatch, variant }: {
  project: StudioProject;
  onPatch: (patch: Pick<StudioProject, "status">) => void;
  variant: "row" | "panel";
}) {
  const gross = variant === "panel";
  return (
    <div style={{ display: "flex", gap: gross ? 8 : 4 }}>
      {MANUAL_STATUSES.map(s => {
        const active = p.status === s;
        const m = STUDIO_STATUS_CONFIG[s];
        return (
          <button
            key={s}
            onClick={(e) => {
              // In der Zeile liegt darunter der Zeilenklick, der den Inspector öffnet
              e.stopPropagation();
              onPatch({ status: active ? deriveStage(p) : s });
            }}
            title={active
              ? `„${m.label}“ aufheben — dann gilt wieder die automatische Stufe`
              : s === "wip"
                ? "Merken: da will ich nochmal ran"
                : "Zum Löschen vormerken — weg ist der Ordner erst mit dem Papierkorb-Lauf"}
            style={{
              padding: gross ? "5px 11px" : "3px 9px", borderRadius: 9999,
              background: active ? m.bg : "transparent",
              border: `1px solid ${active ? m.color : C.border20}`,
              color: active ? m.color : C.onSecondaryFixedVar,
              fontSize: gross ? 11 : 10, fontWeight: 600,
              cursor: "pointer", whiteSpace: "nowrap",
              transition: "all 0.15s",
            }}
          >
            {active && gross ? `${m.label} aufheben` : m.label}
          </button>
        );
      })}
    </div>
  );
}

function RowBtn({ icon: Icon, title, onClick, accent, danger }: {
  icon: React.ElementType;
  title: string;
  onClick: () => void;
  accent?: boolean;
  danger?: boolean;
}) {
  const [h, setH] = useState(false);
  const color = danger ? C.error : accent ? C.primary : C.onSurfaceVariant;
  const border = danger ? C.error + (h ? "" : "40") : accent ? C.primary + "50" : C.border15;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      title={title}
      style={{
        width: 28, height: 28, borderRadius: 6,
        background: danger && h ? "rgba(229,72,77,0.12)" : "transparent",
        border: `1px solid ${border}`,
        cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        color,
      }}
    >
      <Icon size={13} strokeWidth={1.75} />
    </button>
  );
}
