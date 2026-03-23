// src/components/browse/DetailPanel.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Detail Panel with Functional Audio Player
// ═══════════════════════════════════════════════════════════════════════════════

import { useRef } from "react";
import { 
  X, Heart, Edit3, Play, Pause, Volume2, VolumeX, 
  Repeat, FolderOpen, Loader2, Music 
} from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { C } from "../../lib/theme";
import { TagPill } from "./TagPill";
import { useAudioPlayer } from "../../hooks/useAudioPlayer";
import type { Beat, BeatStatus } from "../../types/browse";
import { STATUS_CONFIG, parseTags, isFavorite } from "../../types/browse";

interface DetailPanelProps {
  beat: Beat;
  onClose: () => void;
  onToggleFavorite: (beatId: string) => void;
  onUpdateStatus: (beatId: string, status: BeatStatus) => void;
  onOpenEditModal: (beat: Beat) => void;
}

export function DetailPanel({
  beat,
  onClose,
  onToggleFavorite,
  onUpdateStatus,
  onOpenEditModal,
}: DetailPanelProps) {
  const fav = isFavorite(beat);
  const tags = parseTags(beat.tags);
  const seekBarRef = useRef<HTMLDivElement>(null);
  const volumeBarRef = useRef<HTMLDivElement>(null);

  // ─── Audio Player Hook ─────────────────────────────────────────────────────
  const {
    isPlaying,
    isLoading,
    isLooped,
    isMuted,
    volume,
    coverUrl,
    error: audioError,
    progress,
    currentTimeFormatted,
    durationFormatted,
    togglePlay,
    toggleLoop,
    toggleMute,
    seekPercent,
    setVolume,
  } = useAudioPlayer({ beatPath: beat.path });

  // ─── Seek Handler ──────────────────────────────────────────────────────────
  const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!seekBarRef.current) return;
    const rect = seekBarRef.current.getBoundingClientRect();
    const percent = ((e.clientX - rect.left) / rect.width) * 100;
    seekPercent(Math.max(0, Math.min(100, percent)));
  };

  // ─── Volume Handler ────────────────────────────────────────────────────────
  const handleVolumeClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!volumeBarRef.current) return;
    const rect = volumeBarRef.current.getBoundingClientRect();
    const vol = (e.clientX - rect.left) / rect.width;
    setVolume(Math.max(0, Math.min(1, vol)));
  };

  // ─── Status Items ──────────────────────────────────────────────────────────
  const statusItems: { key: BeatStatus; label: string }[] = [
    { key: "idea", label: "Idea" },
    { key: "wip", label: "WIP" },
    { key: "finished", label: "Fin" },
    { key: "sold", label: "Sold" },
  ];

  const handleOpenFolder = async () => {
    if (beat.path) {
      try {
        await revealItemInDir(beat.path);
      } catch (e) {
        console.error("Failed to open folder:", e);
      }
    }
  };

  return (
    <aside style={{
      position: "fixed",
      right: 0,
      top: 0,
      height: "100vh",
      width: 360,
      background: C.background,
      display: "flex",
      flexDirection: "column",
      zIndex: 50,
      borderLeft: `1px solid ${C.border15}`,
    }}>
      {/* ═══════════════════════════════════════════════════════════════════════
          Player Section with Cover Art
      ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        {/* Cover Art Container (1:1 aspect ratio) */}
        <div style={{
          position: "relative",
          width: "100%",
          paddingTop: "100%", // 1:1 aspect ratio
          background: C.surfaceContainerLowest,
          overflow: "hidden",
        }}>
          {/* Cover Image or Placeholder */}
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={beat.name}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
              onError={(e) => {
                // Hide broken image, placeholder will show through
                e.currentTarget.style.display = "none";
              }}
            />
          ) : null}
          {/* Placeholder (always rendered behind image) */}
          <div style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(135deg, #1a1919 0%, #262626 60%, #131313 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 0,
          }}>
            <Music size={64} color="rgba(255,255,255,0.1)" strokeWidth={1} />
          </div>

          {/* Gradient Overlay */}
          <div style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(0deg, rgba(14,14,14,1) 0%, rgba(14,14,14,0.4) 40%, rgba(14,14,14,0) 70%)",
            pointerEvents: "none",
          }} />

          {/* Close Button */}
          <button
            onClick={onClose}
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              background: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(8px)",
              border: "none",
              borderRadius: 6,
              padding: 8,
              cursor: "pointer",
              display: "flex",
            }}
          >
            <X size={16} color="rgba(255,255,255,0.8)" />
          </button>

          {/* Play/Pause Button - Centered */}
          <button
            onClick={togglePlay}
            disabled={isLoading || !!audioError}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: isLoading ? C.surfaceContainerHigh : C.primary,
              border: "none",
              cursor: isLoading || audioError ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
              opacity: audioError ? 0.5 : 1,
              transition: "transform 0.15s, box-shadow 0.15s",
            }}
            onMouseEnter={e => {
              if (!isLoading && !audioError) {
                e.currentTarget.style.transform = "translate(-50%, -50%) scale(1.05)";
                e.currentTarget.style.boxShadow = "0 6px 32px rgba(253,161,36,0.4)";
              }
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = "translate(-50%, -50%) scale(1)";
              e.currentTarget.style.boxShadow = "0 4px 24px rgba(0,0,0,0.5)";
            }}
          >
            {isLoading ? (
              <Loader2 size={28} color="#4e2d00" style={{ animation: "spin 1s linear infinite" }} />
            ) : isPlaying ? (
              <Pause size={28} fill="#4e2d00" color="#4e2d00" />
            ) : (
              <Play size={28} fill="#4e2d00" color="#4e2d00" style={{ marginLeft: 3 }} />
            )}
          </button>

          {/* Controls Overlay (Bottom) */}
          <div style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}>
            {/* Seek Bar */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div
                ref={seekBarRef}
                onClick={handleSeekClick}
                style={{
                  height: 6,
                  background: "rgba(255,255,255,0.15)",
                  borderRadius: 3,
                  cursor: "pointer",
                  position: "relative",
                }}
              >
                {/* Progress */}
                <div style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  height: "100%",
                  width: `${progress}%`,
                  background: C.primary,
                  borderRadius: 3,
                  transition: "width 0.1s linear",
                }} />
                {/* Thumb */}
                <div style={{
                  position: "absolute",
                  top: "50%",
                  left: `${progress}%`,
                  transform: "translate(-50%, -50%)",
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: C.primary,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                  opacity: isPlaying ? 1 : 0.7,
                }} />
              </div>
              {/* Time Display */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 10,
                fontFamily: "monospace",
                color: "rgba(255,255,255,0.7)",
              }}>
                <span>{currentTimeFormatted}</span>
                <span>{durationFormatted}</span>
              </div>
            </div>

            {/* Loop & Volume */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {/* Loop Button */}
              <button
                onClick={toggleLoop}
                style={{
                  background: isLooped ? "rgba(253,161,36,0.2)" : "transparent",
                  border: isLooped ? `1px solid ${C.primary}` : "1px solid transparent",
                  borderRadius: 4,
                  padding: 6,
                  cursor: "pointer",
                  display: "flex",
                }}
              >
                <Repeat 
                  size={14} 
                  color={isLooped ? C.primary : "rgba(255,255,255,0.6)"} 
                  strokeWidth={1.5} 
                />
              </button>

              {/* Volume */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  onClick={toggleMute}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    padding: 0,
                  }}
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX size={14} color="rgba(255,255,255,0.6)" strokeWidth={1.5} />
                  ) : (
                    <Volume2 size={14} color="rgba(255,255,255,0.6)" strokeWidth={1.5} />
                  )}
                </button>
                <div
                  ref={volumeBarRef}
                  onClick={handleVolumeClick}
                  style={{
                    width: 80,
                    height: 4,
                    background: "rgba(255,255,255,0.15)",
                    borderRadius: 2,
                    cursor: "pointer",
                    position: "relative",
                  }}
                >
                  <div style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    height: "100%",
                    width: `${(isMuted ? 0 : volume) * 100}%`,
                    background: C.primary,
                    borderRadius: 2,
                  }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Audio Error Display */}
        {audioError && (
          <div style={{
            position: "absolute",
            bottom: 80,
            left: 20,
            right: 20,
            padding: "8px 12px",
            background: "rgba(239,68,68,0.2)",
            border: "1px solid rgba(239,68,68,0.4)",
            borderRadius: 6,
            fontSize: 10,
            color: "#ef4444",
            textAlign: "center",
          }}>
            {audioError}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          Scrollable Content
      ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}>
        {/* Beat ID + Name */}
        <section>
          <div style={{
            fontSize: 10,
            fontFamily: "monospace",
            color: C.primary,
            marginBottom: 4,
          }}>
            #{beat.id}
          </div>
          <h3 style={{
            fontSize: 20,
            fontWeight: 700,
            color: C.onSurface,
            margin: 0,
            letterSpacing: "-0.02em",
          }}>
            {beat.name}
          </h3>
        </section>

        {/* BPM / Key */}
        <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              color: C.onSecondaryFixedVar,
              marginBottom: 4,
            }}>
              BPM
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: C.onSurface }}>
              {beat.bpm || "—"}
            </div>
          </div>
          <div>
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              color: C.onSecondaryFixedVar,
              marginBottom: 4,
            }}>
              Key
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: C.onSurface }}>
              {beat.key || "—"}
            </div>
          </div>
        </section>

        {/* Status Console */}
        <section>
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            color: C.onSecondaryFixedVar,
            marginBottom: 8,
          }}>
            Status
          </div>
          <div style={{
            display: "flex",
            padding: 4,
            background: C.surfaceContainerLow,
            borderRadius: 4,
            border: `1px solid ${C.border10}`,
          }}>
            {statusItems.map(({ key, label }) => {
              const isActive = beat.status === key;
              const cfg = STATUS_CONFIG[key];
              return (
                <button
                  key={key}
                  onClick={() => onUpdateStatus(beat.id, key)}
                  style={{
                    flex: 1,
                    padding: "8px 4px",
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    border: "none",
                    borderRadius: 3,
                    cursor: "pointer",
                    background: isActive ? cfg.color : "transparent",
                    color: isActive ? (key === "wip" || key === "sold" ? "#000" : "#fff") : C.onSurfaceVariant,
                    transition: "all 0.15s",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Tags */}
        <section>
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            color: C.onSecondaryFixedVar,
            marginBottom: 8,
          }}>
            Tags
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {tags.length > 0 ? (
              tags.map(tag => <TagPill key={tag} tag={tag} size="sm" />)
            ) : (
              <span style={{ fontSize: 12, color: C.onSecondaryFixedVar, fontStyle: "italic" }}>
                No tags
              </span>
            )}
          </div>
        </section>

        {/* Notes */}
        {beat.notes && (
          <section>
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              color: C.onSecondaryFixedVar,
              marginBottom: 8,
            }}>
              Notes
            </div>
            <div style={{
              padding: 12,
              background: C.surfaceContainerLow,
              borderRadius: 6,
              border: `1px solid ${C.border10}`,
              fontSize: 12,
              color: C.onSurface,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}>
              {beat.notes}
            </div>
          </section>
        )}

        {/* Path */}
        {beat.path && (
          <section>
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              color: C.onSecondaryFixedVar,
              marginBottom: 8,
            }}>
              Archive Path
            </div>
            <button
              onClick={handleOpenFolder}
              style={{
                width: "100%",
                padding: 12,
                background: C.surfaceContainerLow,
                borderRadius: 6,
                border: `1px solid ${C.border10}`,
                fontSize: 10,
                fontFamily: "monospace",
                color: C.onSurfaceVariant,
                textAlign: "left",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                wordBreak: "break-all",
              }}
            >
              <FolderOpen size={14} color={C.primary} />
              {beat.path.split(/[/\\]/).pop()}
            </button>
          </section>
        )}

        {/* Created Date */}
        {beat.created_date && (
          <div style={{ fontSize: 10, color: C.onSecondaryFixedVar }}>
            Created: {beat.created_date}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          Footer
      ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{
        padding: 16,
        borderTop: `1px solid ${C.border10}`,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
      }}>
        {/* Favorite Toggle */}
        <button
          onClick={() => onToggleFavorite(beat.id)}
          style={{
            width: 44,
            height: 44,
            borderRadius: 8,
            background: fav ? "rgba(253,161,36,0.15)" : C.surfaceContainerHigh,
            border: `1px solid ${fav ? "rgba(253,161,36,0.3)" : C.border20}`,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Heart size={20} fill={fav ? C.primary : "none"} color={C.primary} strokeWidth={1.5} />
        </button>

        {/* Edit Button */}
        <button
          onClick={() => onOpenEditModal(beat)}
          style={{
            flex: 1,
            padding: "12px 20px",
            borderRadius: 8,
            background: C.primary,
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            fontSize: 12,
            fontWeight: 700,
            color: "#4e2d00",
          }}
        >
          <Edit3 size={16} />
          Edit Beat
        </button>
      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </aside>
  );
}