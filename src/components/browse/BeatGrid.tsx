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
  // Einmal abonnieren, nicht pro Karte — siehe Kommentar in BeatTable.
  const { currentBeat, isPlaying, isLoading, togglePlay } = useAudioPlayerContext();

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
      gap: 14,
    }}>
      {beats.map(beat => {
        const isCurrentBeat = currentBeat?.id === beat.id;
        return (
          <GridCard
            key={beat.id}
            beat={beat}
            isSelected={selectedBeatId === beat.id}
            isCurrentBeat={isCurrentBeat}
            isThisPlaying={isCurrentBeat && isPlaying}
            isThisLoading={isCurrentBeat && isLoading}
            coverUrl={getCoverUrl(beat.id)}
            badges={uploadBadges[beat.id]}
            onSelectBeat={onSelectBeat}
            onToggleFavorite={onToggleFavorite}
            onPlayBeat={onPlayBeat}
            onTogglePlay={togglePlay}
          />
        );
      })}
    </div>
  );
}

// Handler kommen als stabile Referenzen rein, nicht als frische Arrow-Funktion
// pro Karte — sonst ist das memo hier wirkungslos.
const GridCard = memo(function GridCard({
  beat, isSelected, isCurrentBeat, isThisPlaying, isThisLoading, coverUrl, badges,
  onSelectBeat, onToggleFavorite, onPlayBeat, onTogglePlay,
}: {
  beat: Beat;
  isSelected: boolean;
  isCurrentBeat: boolean;
  isThisPlaying: boolean;
  isThisLoading: boolean;
  coverUrl: string | null;
  badges: UploadBadgeMap[string] | undefined;
  onSelectBeat: (beat: Beat) => void;
  onToggleFavorite: (beatId: string) => void;
  onPlayBeat: (beat: Beat) => void;
  onTogglePlay: () => void;
}) {
  const isFav = beat.favorite === 1;

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCurrentBeat) onTogglePlay();
    else onPlayBeat(beat);
  };

  return (
    <div
      data-beat-id={beat.id}
      onClick={() => onSelectBeat(beat)}
      onDoubleClick={e => {
        if ((e.target as HTMLElement).closest("button")) return;
        onPlayBeat(beat);
      }}
      style={{
        background: isSelected ? C.surfaceContainerHigh : C.surfaceContainerLow,
        border: `1px solid ${isCurrentBeat ? C.primary : isSelected ? C.border30 : C.border10}`,
        borderRadius: 10,
        overflow: "hidden",
        cursor: "pointer",
        transition: "border-color 0.15s, transform 0.12s",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = "translateY(-2px)";
        if (!isCurrentBeat) e.currentTarget.style.borderColor = C.border30;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = "translateY(0)";
        // Der laufende Beat behaelt seinen Rahmen, sonst geht die Markierung
        // nach dem ersten Hover verloren.
        e.currentTarget.style.borderColor =
          isCurrentBeat ? C.primary : isSelected ? C.border30 : C.border10;
      }}
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
          onClick={e => { e.stopPropagation(); onToggleFavorite(beat.id); }}
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
          fontSize: 12, fontWeight: 700,
          color: isCurrentBeat ? C.primary : C.onSurface,
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
