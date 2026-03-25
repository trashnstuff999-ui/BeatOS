// src/components/browse/BeatTable.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Beat Table with Sortable Headers
// ═══════════════════════════════════════════════════════════════════════════════

import { memo } from "react";
import { Music, Heart, ArrowUp, ArrowDown } from "lucide-react";
import { C } from "../../lib/theme";
import type { Beat, BeatStatus, SortState, SortColumn } from "../../types/browse";
import { STATUS_CONFIG } from "../../types/browse";

interface BeatTableProps {
  beats: Beat[];
  selectedBeatId: string | null;
  onSelectBeat: (beat: Beat) => void;
  onToggleFavorite: (beatId: string) => void;
  sort: SortState;
  onSort: (column: SortColumn) => void;
}

// ─── Status Pill ─────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: BeatStatus | null }) {
  const cfg = STATUS_CONFIG[(status as BeatStatus) || "idea"] || STATUS_CONFIG.idea;
  return (
    <span style={{
      padding: "2px 10px",
      borderRadius: 9999,
      fontSize: 9,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      background: cfg.bg,
      color: cfg.color,
      border: `1px solid ${cfg.border}`,
    }}>
      {cfg.label}
    </span>
  );
}

// ─── Sortable Header ─────────────────────────────────────────────────────────

interface SortableHeaderProps {
  label: string;
  column: SortColumn;
  currentSort: SortState;
  onSort: (column: SortColumn) => void;
  align?: "left" | "center" | "right";
}

function SortableHeader({ label, column, currentSort, onSort, align = "left" }: SortableHeaderProps) {
  const isActive = currentSort.column === column;
  
  return (
    <th
      onClick={() => onSort(column)}
      style={{
        padding: 16,
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.15em",
        color: isActive ? C.primary : C.onSecondaryFixedVar,
        textAlign: align,
        cursor: "pointer",
        userSelect: "none",
        transition: "color 0.15s",
      }}
      onMouseEnter={e => {
        if (!isActive) e.currentTarget.style.color = C.onSurface;
      }}
      onMouseLeave={e => {
        if (!isActive) e.currentTarget.style.color = C.onSecondaryFixedVar;
      }}
    >
      <div style={{ 
        display: "flex", 
        alignItems: "center", 
        gap: 4,
        justifyContent: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start",
      }}>
        {label}
        {isActive && (
          currentSort.direction === "asc" 
            ? <ArrowUp size={12} /> 
            : <ArrowDown size={12} />
        )}
      </div>
    </th>
  );
}

// ─── Beat Row (memoized) ──────────────────────────────────────────────────────

interface BeatRowProps {
  beat: Beat;
  index: number;
  isSelected: boolean;
  onSelectBeat: (beat: Beat) => void;
  onToggleFavorite: (beatId: string) => void;
}

const BeatRow = memo(function BeatRow({ beat, index, isSelected, onSelectBeat, onToggleFavorite }: BeatRowProps) {
  const isFav = beat.favorite === 1;
  return (
    <tr
      onClick={() => onSelectBeat(beat)}
      style={{
        borderTop: index > 0 ? "1px solid rgba(72,72,71,0.05)" : undefined,
        background: isSelected ? "rgba(26,25,25,0.5)" : "transparent",
        cursor: "pointer",
        transition: "background 0.15s",
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = C.surfaceContainer; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
    >
      {/* ID */}
      <td style={{ padding: 16, fontSize: 12, fontFamily: "monospace", color: C.primary, fontWeight: 700 }}>
        #{beat.id}
      </td>

      {/* Name */}
      <td style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 4, background: C.surfaceContainerHighest, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Music size={12} color={C.onSurfaceVariant} strokeWidth={1.5} />
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em", color: C.onSurface }}>
            {beat.name}
          </span>
        </div>
      </td>

      {/* Key */}
      <td style={{ padding: 16, fontSize: 12, fontWeight: 500, color: C.onSurfaceVariant }}>
        {beat.key || "—"}
      </td>

      {/* BPM */}
      <td style={{ padding: 16, fontSize: 12, fontWeight: 500, color: C.onSurfaceVariant }}>
        {beat.bpm || "—"}
      </td>

      {/* Status */}
      <td style={{ padding: 16, textAlign: "center" }}>
        <StatusPill status={beat.status as BeatStatus} />
      </td>

      {/* Favorite Action */}
      <td style={{ padding: 16, textAlign: "right" }}>
        <button
          onClick={e => { e.stopPropagation(); onToggleFavorite(beat.id); }}
          style={{ background: "none", border: "none", cursor: "pointer", display: "inline-flex", padding: 4 }}
        >
          <Heart size={20} strokeWidth={1.5} fill={isFav ? C.primary : "none"} color={isFav ? C.primary : C.onSurfaceVariant} />
        </button>
      </td>
    </tr>
  );
});

// ─── Beat Table ──────────────────────────────────────────────────────────────

export function BeatTable({ 
  beats, 
  selectedBeatId, 
  onSelectBeat, 
  onToggleFavorite,
  sort,
  onSort,
}: BeatTableProps) {
  return (
    <section style={{
      background: C.surfaceContainerLowest,
      borderRadius: 8,
      overflow: "hidden",
      border: `1px solid ${C.border10}`,
    }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: C.surfaceContainerLow, borderBottom: `1px solid ${C.border10}` }}>
            <SortableHeader label="ID" column="id" currentSort={sort} onSort={onSort} />
            <SortableHeader label="Name" column="name" currentSort={sort} onSort={onSort} />
            <SortableHeader label="Key" column="key" currentSort={sort} onSort={onSort} />
            <SortableHeader label="BPM" column="bpm" currentSort={sort} onSort={onSort} />
            <SortableHeader label="Status" column="status" currentSort={sort} onSort={onSort} align="center" />
            <th style={{
              padding: 16,
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              color: C.onSecondaryFixedVar,
              textAlign: "right",
            }}>
              Action
            </th>
          </tr>
        </thead>
        <tbody>
          {beats.map((beat, i) => (
            <BeatRow
              key={beat.id}
              beat={beat}
              index={i}
              isSelected={selectedBeatId === beat.id}
              onSelectBeat={onSelectBeat}
              onToggleFavorite={onToggleFavorite}
            />
          ))}

          {/* Empty State */}
          {beats.length === 0 && (
            <tr>
              <td
                colSpan={6}
                style={{
                  padding: 48,
                  textAlign: "center",
                  color: C.onSecondaryFixedVar,
                  fontSize: 13,
                  fontStyle: "italic",
                }}
              >
                No beats found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
