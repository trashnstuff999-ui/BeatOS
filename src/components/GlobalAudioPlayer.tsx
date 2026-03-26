// src/components/GlobalAudioPlayer.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Spotify-style Global Audio Player — fixed bottom bar
// ═══════════════════════════════════════════════════════════════════════════════

import { useRef, useCallback } from "react";
import {
  Play, Pause, SkipBack, SkipForward, Repeat,
  Volume2, VolumeX, Loader2, Music, Shuffle,
} from "lucide-react";
import { C } from "../lib/theme";
import { SIDEBAR_WIDTH } from "../lib/constants";
import { useAudioPlayerContext } from "../contexts/AudioPlayerContext";

const PLAYER_HEIGHT = 80;

export function GlobalAudioPlayer() {
  const {
    currentBeat, coverUrl, isPlaying, isLoading, isLooped, isMuted,
    volume, progress, currentTimeFormatted, durationFormatted, error,
    togglePlay, toggleLoop, toggleMute, seekPercent, setVolume,
  } = useAudioPlayerContext();

  const seekBarRef = useRef<HTMLDivElement>(null);
  const volumeBarRef = useRef<HTMLDivElement>(null);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!seekBarRef.current) return;
    const rect = seekBarRef.current.getBoundingClientRect();
    seekPercent(Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)));
  }, [seekPercent]);

  const handleVolume = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!volumeBarRef.current) return;
    const rect = volumeBarRef.current.getBoundingClientRect();
    setVolume((e.clientX - rect.left) / rect.width);
  }, [setVolume]);

  if (!currentBeat) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: 0,
      left: SIDEBAR_WIDTH,
      right: 0,
      height: PLAYER_HEIGHT,
      background: "#0a0a0a",
      borderTop: `1px solid ${C.border15}`,
      display: "flex",
      alignItems: "center",
      padding: "0 24px",
      gap: 0,
      zIndex: 100,
    }}>
      {/* ── Left: Cover + Info ───────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, width: 280, flexShrink: 0 }}>
        {/* Cover */}
        <div style={{
          width: 48, height: 48, borderRadius: 4, flexShrink: 0,
          background: C.surfaceContainerHighest, overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {coverUrl ? (
            <img src={coverUrl} alt={currentBeat.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <Music size={18} color={C.onSurfaceVariant} strokeWidth={1.5} />
          )}
        </div>

        {/* Info */}
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 700, color: C.onSurface,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {currentBeat.name}
          </div>
          <div style={{ fontSize: 11, color: C.onSecondaryFixedVar, marginTop: 2 }}>
            #{currentBeat.id}
            {currentBeat.bpm ? ` • ${currentBeat.bpm} BPM` : ""}
          </div>
        </div>
      </div>

      {/* ── Center: Controls + Progress ──────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        {/* Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <IconBtn><Shuffle size={15} color={C.onSecondaryFixedVar} strokeWidth={1.5} /></IconBtn>
          <IconBtn><SkipBack size={18} color={C.onSurfaceVariant} strokeWidth={1.5} /></IconBtn>

          {/* Play / Pause */}
          <button
            onClick={togglePlay}
            disabled={isLoading || !!error}
            style={{
              width: 36, height: 36, borderRadius: "50%",
              background: isLoading ? C.surfaceContainerHigh : C.onSurface,
              border: "none", cursor: isLoading || error ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              opacity: error ? 0.4 : 1, transition: "transform 0.1s",
              flexShrink: 0,
            }}
          >
            {isLoading
              ? <Loader2 size={16} color="#0e0e0e" style={{ animation: "spin 1s linear infinite" }} />
              : isPlaying
                ? <Pause size={16} fill="#0e0e0e" color="#0e0e0e" />
                : <Play size={16} fill="#0e0e0e" color="#0e0e0e" style={{ marginLeft: 2 }} />
            }
          </button>

          <IconBtn><SkipForward size={18} color={C.onSurfaceVariant} strokeWidth={1.5} /></IconBtn>
          <IconBtn onClick={toggleLoop}>
            <Repeat size={15} color={isLooped ? C.primary : C.onSecondaryFixedVar} strokeWidth={1.5} />
          </IconBtn>
        </div>

        {/* Progress bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", maxWidth: 480 }}>
          <span style={{ fontSize: 10, color: C.onSecondaryFixedVar, fontFamily: "monospace", minWidth: 32, textAlign: "right" }}>
            {currentTimeFormatted}
          </span>
          <div
            ref={seekBarRef}
            onClick={handleSeek}
            style={{
              flex: 1, height: 4, background: C.surfaceContainerHighest,
              borderRadius: 2, cursor: "pointer", position: "relative",
            }}
          >
            <div style={{
              position: "absolute", left: 0, top: 0, height: "100%",
              width: `${progress}%`, background: C.primary, borderRadius: 2,
            }} />
            <div style={{
              position: "absolute", top: "50%", left: `${progress}%`,
              transform: "translate(-50%, -50%)",
              width: 10, height: 10, borderRadius: "50%",
              background: C.primary,
              opacity: isPlaying ? 1 : 0.7,
            }} />
          </div>
          <span style={{ fontSize: 10, color: C.onSecondaryFixedVar, fontFamily: "monospace", minWidth: 32 }}>
            {durationFormatted}
          </span>
        </div>
      </div>

      {/* ── Right: Volume ────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, width: 200, justifyContent: "flex-end", flexShrink: 0 }}>
        <IconBtn onClick={toggleMute}>
          {isMuted || volume === 0
            ? <VolumeX size={16} color={C.onSecondaryFixedVar} strokeWidth={1.5} />
            : <Volume2 size={16} color={C.onSecondaryFixedVar} strokeWidth={1.5} />
          }
        </IconBtn>
        <div
          ref={volumeBarRef}
          onClick={handleVolume}
          style={{
            width: 80, height: 4, background: C.surfaceContainerHighest,
            borderRadius: 2, cursor: "pointer", position: "relative",
          }}
        >
          <div style={{
            position: "absolute", left: 0, top: 0, height: "100%",
            width: `${(isMuted ? 0 : volume) * 100}%`,
            background: C.primary, borderRadius: 2,
          }} />
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function IconBtn({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 4 }}
    >
      {children}
    </button>
  );
}

export const GLOBAL_PLAYER_HEIGHT = PLAYER_HEIGHT;
