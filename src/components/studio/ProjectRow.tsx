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
import { Star, Play, Folder, StickyNote } from "lucide-react";
import { C, STUDIO_STATUS_CONFIG, alpha, radius } from "../../lib/theme";
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
const SLOT = 40;       // Breite einer Zelle — die Kopfzeile benutzt dieselbe
const GROUP_GAP = 14;  // Luft zwischen den Gruppen — doppelt so viel wie innerhalb,
                       // sonst liest man die Gruppierung nicht mehr

// Fixed column widths — keep the right half aligned across all rows
const COL_PIPELINE = 5 * SLOT + 2 * GROUP_GAP;
// Nur noch die Pille: die Handschalter und Aktionen stehen beschriftet im
// Panel. Doppelt in der Zeile machten sie die Liste unruhig.
const COL_STATUS = 130;

interface ProjectRowProps {
  project: StudioProject;
  /** Der Inspector steht gerade auf dieser Zeile */
  isOpen: boolean;
  /** Teil der Mehrfachauswahl (Strg- oder Shift-Klick) */
  isSelected?: boolean;
  dimmed?: boolean;
  onPatch: (patch: Partial<Pick<StudioProject, "status" | "priority" | "notes">>) => void;
  onPreview: () => void;
  /** Zeilenklick — öffnet Details; mit Strg/Shift wählt er stattdessen aus */
  onOpen: (e: React.MouseEvent) => void;
}

export function ProjectRow({
  project: p, isOpen, isSelected, dimmed,
  onPatch, onPreview, onOpen,
}: ProjectRowProps) {
  const [hovered, setHovered] = useState(false);
  const canPreview = p.has_mp3 || p.has_wav;
  const title = projectDisplayName(p);
  const folderLabel = projectFolderLabel(p);
  // „Project_0861" sagt nichts. Ohne Export-Titel steht die erste Zeile der
  // Notiz darunter — damit erkennt man das Projekt wieder. Mit Titel nicht:
  // da reicht der Titel, und die Zeile bleibt ruhig.
  const noteLine = p.song_name?.trim()
    ? null
    : p.notes?.split("\n").map(l => l.trim()).find(Boolean) ?? null;
  const isDiscard = p.status === "discard";
  const status = STUDIO_STATUS_CONFIG[p.status] ?? STUDIO_STATUS_CONFIG.idea;

  return (
    <div
      // data-auswahl: ein Klick auf eine Zeile waehlt das naechste Projekt,
      // er schliesst den Inspector nicht (useKlickDaneben).
      data-auswahl
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title="Details, Notizen und Assets öffnen — mit Strg oder Shift auswählen"
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "13px 16px",
        borderTop: `1px solid ${C.border10}`,
        background: isSelected
          ? alpha(C.primary, 0.12)
          : isOpen
          ? alpha(C.primary, 0.06)
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
          background: canPreview ? alpha(C.mint, 0.10) : "transparent",
          border: `1px solid ${canPreview ? alpha(C.mint, 0.40) : C.border10}`,
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
              fontSize: 15, fontWeight: 700, color: C.onSurface,
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
          fontSize: 12, color: C.onSurfaceVariant,
          overflow: "hidden", whiteSpace: "nowrap",
        }}>
          {joinWithDots([
            noteLine && (
              <span
                title={p.notes ?? undefined}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  color: C.onSurface, minWidth: 0, maxWidth: 360,
                }}
              >
                <StickyNote size={11} strokeWidth={1.75} style={{ flexShrink: 0 }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{noteLine}</span>
              </span>
            ),
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
          padding: "4px 11px", borderRadius: radius.full,
          background: status.bg,
          color: status.color,
          fontSize: 11, fontWeight: 700,
          letterSpacing: "0.04em", textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: status.color }} />
          {status.label}
        </span>

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
                {/* Vorhanden: grüne Plakette. Fehlt: lesbar, aber leise —
                    vorher 10px bei 22 % Deckkraft, praktisch unsichtbar. */}
                <span style={{
                  fontSize: 11, letterSpacing: "0.02em",
                  fontWeight: 700,
                  padding: "2px 5px", borderRadius: radius.control,
                  background: has ? alpha(C.mint, 0.14) : "transparent",
                  color: has ? C.mint : C.onSecondaryFixedVar,
                  opacity: has ? 1 : 0.45,
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
              padding: gross ? "5px 11px" : "3px 9px", borderRadius: radius.full,
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


