// src/components/browse/BeatTable.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Beat Table — Card-style rows with spacing
// ═══════════════════════════════════════════════════════════════════════════════

import { memo } from "react";
import { Heart, ArrowUp, ArrowDown, Play, Pause, Loader2 } from "lucide-react";
import { C, STATUS_CONFIG } from "../../lib/theme";
import type { Beat, BeatStatus, SortState, SortColumn } from "../../types/browse";
import { useAudioPlayerContext } from "../../contexts/AudioPlayerContext";

interface BeatTableProps {
  beats: Beat[];
  selectedBeatId: string | null;
  onSelectBeat: (beat: Beat) => void;
  onToggleFavorite: (beatId: string) => void;
  onPlayBeat: (beat: Beat) => void;
  sort: SortState;
  onSort: (column: SortColumn) => void;
}

// ─── Status Pill ─────────────────────────────────────────────────────────────

const StatusPill = memo(function StatusPill({ status }: { status: BeatStatus | null }) {
  const cfg = STATUS_CONFIG[(status as BeatStatus) || "idea"] || STATUS_CONFIG.idea;
  return (
    <span style={{
      padding: "3px 10px",
      borderRadius: 9999,
      fontSize: 9,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      background: cfg.bg,
      color: cfg.color,
      border: `1px solid ${cfg.border}`,
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
});

// ─── Column Header ────────────────────────────────────────────────────────────

interface ColHeaderProps {
  label: string;
  column: SortColumn;
  currentSort: SortState;
  onSort: (column: SortColumn) => void;
  flex?: number;
  align?: "left" | "center" | "right";
}

function ColHeader({ label, column, currentSort, onSort, flex = 1, align = "left" }: ColHeaderProps) {
  const isActive = currentSort.column === column;
  return (
    <div
      onClick={() => onSort(column)}
      style={{
        flex,
        fontSize: 10, fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "0.15em",
        color: isActive ? C.primary : C.onSecondaryFixedVar,
        cursor: "pointer", userSelect: "none",
        display: "flex", alignItems: "center", gap: 4,
        justifyContent: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start",
      }}
      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = C.onSurface; }}
      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = C.onSecondaryFixedVar; }}
    >
      {label}
      {isActive && (currentSort.direction === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
    </div>
  );
}

// ─── Beat Row ─────────────────────────────────────────────────────────────────

interface BeatRowProps {
  beat: Beat;
  isSelected: boolean;
  onSelectBeat: (beat: Beat) => void;
  onToggleFavorite: (beatId: string) => void;
  onPlayBeat: (beat: Beat) => void;
}

const BeatRow = memo(function BeatRow({ beat, isSelected, onSelectBeat, onToggleFavorite, onPlayBeat }: BeatRowProps) {
  const isFav = beat.favorite === 1;
  const { currentBeat, isPlaying, isLoading, togglePlay } = useAudioPlayerContext();
  const isCurrentBeat = currentBeat?.id === beat.id;
  const isThisPlaying = isCurrentBeat && isPlaying;
  const isThisLoading = isCurrentBeat && isLoading;

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCurrentBeat) {
      togglePlay();
    } else {
      onPlayBeat(beat);
    }
  };

  return (
    <div
      onClick={() => onSelectBeat(beat)}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "14px 20px",
        borderRadius: 10,
        background: isSelected ? C.surfaceContainerHigh : C.surfaceContainerLow,
        border: isSelected ? `1px solid ${C.border30}` : "1px solid transparent",
        cursor: "pointer",
        transition: "background 0.12s, border-color 0.12s",
        gap: 0,
      }}
      onMouseEnter={e => {
        if (!isSelected) (e.currentTarget as HTMLElement).style.background = C.surfaceContainer;
      }}
      onMouseLeave={e => {
        if (!isSelected) (e.currentTarget as HTMLElement).style.background = C.surfaceContainerLow;
      }}
    >
      {/* Play Button */}
      <div style={{ width: 44, flexShrink: 0 }}>
        <button
          onClick={handlePlay}
          style={{
            width: 30, height: 30, borderRadius: "50%",
            background: isCurrentBeat ? C.primary : C.surfaceContainerHighest,
            border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background 0.15s",
            flexShrink: 0,
          }}
        >
          {isThisLoading
            ? <Loader2 size={13} color={isCurrentBeat ? C.onPrimary : C.onSurfaceVariant} style={{ animation: "spin 1s linear infinite" }} />
            : isThisPlaying
              ? <Pause size={13} fill={isCurrentBeat ? C.onPrimary : C.onSurfaceVariant} color={isCurrentBeat ? C.onPrimary : C.onSurfaceVariant} />
              : <Play size={13} fill={isCurrentBeat ? C.onPrimary : C.onSurfaceVariant} color={isCurrentBeat ? C.onPrimary : C.onSurfaceVariant} style={{ marginLeft: 2 }} />
          }
        </button>
      </div>

      {/* ID */}
      <div style={{ width: 80, flexShrink: 0, fontSize: 11, fontFamily: "monospace", color: C.primary, fontWeight: 700 }}>
        #{beat.id}
      </div>

      {/* Name */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <span style={{
          fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em", color: C.onSurface,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {beat.name}
        </span>
      </div>

      {/* Key */}
      <div style={{ width: 90, flexShrink: 0, fontSize: 12, fontWeight: 500, color: C.onSurfaceVariant }}>
        {beat.key || "—"}
      </div>

      {/* BPM */}
      <div style={{ width: 60, flexShrink: 0, fontSize: 12, fontWeight: 500, color: C.onSurfaceVariant }}>
        {beat.bpm || "—"}
      </div>

      {/* Status */}
      <div style={{ width: 100, flexShrink: 0, display: "flex", justifyContent: "center" }}>
        <StatusPill status={beat.status as BeatStatus} />
      </div>

      {/* Favorite */}
      <div style={{ width: 44, flexShrink: 0, display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={e => { e.stopPropagation(); onToggleFavorite(beat.id); }}
          style={{ background: "none", border: "none", cursor: "pointer", display: "inline-flex", padding: 4 }}
        >
          <Heart size={18} strokeWidth={1.5} fill={isFav ? C.primary : "none"} color={isFav ? C.primary : C.onSurfaceVariant} />
        </button>
      </div>
    </div>
  );
});

// ─── Beat Table ──────────────────────────────────────────────────────────────

export function BeatTable({ beats, selectedBeatId, onSelectBeat, onToggleFavorite, onPlayBeat, sort, onSort }: BeatTableProps) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {/* Header Row */}
      <div style={{
        display: "flex", alignItems: "center",
        padding: "0 20px 8px",
        gap: 0,
      }}>
        {/* Play column spacer */}
        <div style={{ width: 44, flexShrink: 0 }} />
        <div style={{ width: 80, flexShrink: 0 }}>
          <ColHeader label="ID" column="id" currentSort={sort} onSort={onSort} />
        </div>
        <div style={{ flex: 1 }}>
          <ColHeader label="Beat Name" column="name" currentSort={sort} onSort={onSort} />
        </div>
        <div style={{ width: 90, flexShrink: 0 }}>
          <ColHeader label="Key" column="key" currentSort={sort} onSort={onSort} />
        </div>
        <div style={{ width: 60, flexShrink: 0 }}>
          <ColHeader label="BPM" column="bpm" currentSort={sort} onSort={onSort} />
        </div>
        <div style={{ width: 100, flexShrink: 0, display: "flex", justifyContent: "center" }}>
          <ColHeader label="Status" column="status" currentSort={sort} onSort={onSort} align="center" />
        </div>
        <div style={{
          width: 44, flexShrink: 0, textAlign: "right",
          fontSize: 10, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.15em", color: C.onSecondaryFixedVar,
          display: "flex", justifyContent: "flex-end",
        }}>
          Fav
        </div>
      </div>

      {/* Rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {beats.map(beat => (
          <BeatRow
            key={beat.id}
            beat={beat}
            isSelected={selectedBeatId === beat.id}
            onSelectBeat={onSelectBeat}
            onToggleFavorite={onToggleFavorite}
            onPlayBeat={onPlayBeat}
          />
        ))}

        {beats.length === 0 && (
          <div style={{
            padding: 48, textAlign: "center",
            color: C.onSecondaryFixedVar, fontSize: 13, fontStyle: "italic",
            background: "#181717", borderRadius: 10,
          }}>
            No beats found
          </div>
        )}
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </section>
  );
}
