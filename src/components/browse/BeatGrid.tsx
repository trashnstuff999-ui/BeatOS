// src/components/browse/BeatGrid.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Cover-grid view for Browse — visual library browsing. Uses the same
// cover cache (getCoverUrl) and platform badges as the table; click selects
// (opens the detail panel), the overlay button plays.
// ═══════════════════════════════════════════════════════════════════════════════

import { memo } from "react";
import { Heart, Play, Pause, Loader2, Music } from "lucide-react";
import { C } from "../../lib/theme";
import { StatusPill } from "../Tagpill";
import { PlatformDots } from "./BeatTable";
import { useAudioPlayerContext } from "../../contexts/AudioPlayerContext";
import type { Beat, UploadBadgeMap } from "../../types/browse";

interface BeatGridProps {
  beats: Beat[];
  selectedBeatId: string | null;
  onSelectBeat: (beat: Beat) => void;
  onToggleFavorite: (beatId: string) => void;
  onPlayBeat: (beat: Beat) => void;
  getCoverUrl: (beatId: string) => string | null;
  uploadBadges: UploadBadgeMap;
}

export function BeatGrid({
  beats, selectedBeatId, onSelectBeat, onToggleFavorite, onPlayBeat, getCoverUrl, uploadBadges,
}: BeatGridProps) {
  if (beats.length === 0) {
    return (
      <div style={{
        padding: 48, textAlign: "center",
        color: C.onSecondaryFixedVar, fontSize: 13, fontStyle: "italic",
        background: "#181717", borderRadius: 10,
      }}>
        No beats found
      </div>
    );
  }

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
      gap: 14,
    }}>
      {beats.map(beat => (
        <GridCard
          key={beat.id}
          beat={beat}
          isSelected={selectedBeatId === beat.id}
          coverUrl={getCoverUrl(beat.id)}
          badges={uploadBadges[beat.id]}
          onSelect={() => onSelectBeat(beat)}
          onToggleFavorite={() => onToggleFavorite(beat.id)}
          onPlay={() => onPlayBeat(beat)}
        />
      ))}
    </div>
  );
}

const GridCard = memo(function GridCard({ beat, isSelected, coverUrl, badges, onSelect, onToggleFavorite, onPlay }: {
  beat: Beat;
  isSelected: boolean;
  coverUrl: string | null;
  badges: UploadBadgeMap[string] | undefined;
  onSelect: () => void;
  onToggleFavorite: () => void;
  onPlay: () => void;
}) {
  const isFav = beat.favorite === 1;
  const { currentBeat, isPlaying, isLoading, togglePlay } = useAudioPlayerContext();
  const isCurrentBeat = currentBeat?.id === beat.id;
  const isThisPlaying = isCurrentBeat && isPlaying;
  const isThisLoading = isCurrentBeat && isLoading;

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCurrentBeat) togglePlay();
    else onPlay();
  };

  return (
    <div
      onClick={onSelect}
      style={{
        background: isSelected ? C.surfaceContainerHigh : C.surfaceContainerLow,
        border: `1px solid ${isSelected ? C.border30 : C.border10}`,
        borderRadius: 10,
        overflow: "hidden",
        cursor: "pointer",
        transition: "border-color 0.15s, transform 0.12s",
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.borderColor = C.border30; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.borderColor = isSelected ? C.border30 : C.border10; }}
    >
      {/* Cover */}
      <div style={{
        position: "relative",
        aspectRatio: "1 / 1",
        background: C.surfaceContainerHigh,
        display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden",
      }}>
        {coverUrl
          ? <img
              src={coverUrl}
              alt=""
              loading="lazy"
              decoding="async"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          : <Music size={32} color={C.onSecondaryFixedVar} strokeWidth={1.25} />
        }
        {/* Play overlay */}
        <button
          onClick={handlePlay}
          style={{
            position: "absolute", right: 8, bottom: 8,
            width: 34, height: 34, borderRadius: "50%",
            background: isCurrentBeat ? C.primary : "rgba(0,0,0,0.65)",
            border: `1px solid ${isCurrentBeat ? C.primary : "rgba(255,255,255,0.2)"}`,
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            backdropFilter: "blur(4px)",
          }}
        >
          {isThisLoading
            ? <Loader2 size={14} color={isCurrentBeat ? C.onPrimary : "#fff"} style={{ animation: "spin 1s linear infinite" }} />
            : isThisPlaying
              ? <Pause size={14} fill={isCurrentBeat ? C.onPrimary : "#fff"} color={isCurrentBeat ? C.onPrimary : "#fff"} />
              : <Play size={14} fill={isCurrentBeat ? C.onPrimary : "#fff"} color={isCurrentBeat ? C.onPrimary : "#fff"} style={{ marginLeft: 2 }} />
          }
        </button>
        {/* Fav */}
        <button
          onClick={e => { e.stopPropagation(); onToggleFavorite(); }}
          style={{
            position: "absolute", right: 8, top: 8,
            background: "rgba(0,0,0,0.5)", border: "none",
            borderRadius: 6, padding: 5,
            cursor: "pointer", display: "flex",
            backdropFilter: "blur(4px)",
          }}
        >
          <Heart size={13} strokeWidth={1.75} fill={isFav ? C.primary : "none"} color={isFav ? C.primary : "#fff"} />
        </button>
      </div>

      {/* Info */}
      <div style={{ padding: "10px 12px" }}>
        <div style={{
          fontSize: 12, fontWeight: 700, color: C.onSurface,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {beat.name}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: 10, color: C.onSecondaryFixedVar }}>
          <span style={{ fontFamily: "monospace", color: C.primary, fontWeight: 700 }}>#{beat.id}</span>
          {beat.key && <span>{beat.key}</span>}
          {beat.bpm != null && <span>{beat.bpm}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
          <StatusPill status={beat.status ?? "idea"} size="sm" />
          <PlatformDots badges={badges} />
        </div>
      </div>
    </div>
  );
});
