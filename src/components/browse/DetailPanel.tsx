// src/components/browse/DetailPanel.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Detail Panel — Artwork + Metadata (audio is in GlobalAudioPlayer)
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { X, Heart, FolderOpen, Music, Tag, Edit3, Trash2, AlertTriangle } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { api } from "../../lib/api";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { C } from "../../lib/theme";
import { BROWSE_PANEL_WIDTH } from "../../lib/constants";
import { TagPill } from "../Tagpill";
import { useAudioPlayerContext } from "../../contexts/AudioPlayerContext";
import type { Beat, BeatStatus } from "../../types/browse";
import { parseTags, isFavorite } from "../../types/browse";
// STATUS_ITEMS kommt aus lib/theme — hier stand vorher eine eigene Kopie der
// Liste, die als einzige Stelle noch englische Labels zeigte, waehrend die
// Pillen daneben schon deutsch waren.
import { STATUS_CONFIG, STATUS_ITEMS } from "../../lib/theme";
import { getTagCategoryFromDb, sortTagsByCategory } from "../../lib/tags";
import { useTagManager } from "../../contexts/TagManagerContext";

interface DetailPanelProps {
  beat: Beat;
  isOpen: boolean;
  onClose: () => void;
  onToggleFavorite: (beatId: string) => void;
  onUpdateStatus: (beatId: string, status: BeatStatus) => void;
  onOpenEditModal: (beat: Beat) => void;
  preloadedCoverUrl?: string | null;
  onUpdateTags?: (beatId: string, tags: string[]) => void;
  onDelete?: (beat: Beat) => Promise<void>;
}

export function DetailPanel({
  beat,
  isOpen,
  onClose,
  onToggleFavorite,
  onUpdateStatus,
  onOpenEditModal,
  preloadedCoverUrl,
  onUpdateTags,
  onDelete,
}: DetailPanelProps) {
  const fav = isFavorite(beat);
  const { openTagManager } = useTagManager();

  const [localTags, setLocalTags] = useState<string[]>(parseTags(beat.tags));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setConfirmDelete(false);
    setIsDeleting(false);
    setDeleteError(null);
  }, [beat.id]);

  const handleDeleteConfirm = async () => {
    if (!onDelete || isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(beat);
      // Parent will close panel via selection clear; nothing further needed here.
    } catch (e) {
      setDeleteError(String(e));
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    setLocalTags(parseTags(beat.tags));
  }, [beat.id, beat.tags]);

  const handleOpenTagManager = () => {
    openTagManager({
      initialSelected: localTags,
      onConfirm: (newTags) => {
        setLocalTags(newTags);
        onUpdateTags?.(beat.id, newTags);
      },
      editMode: true,
    });
  };

  const handleRemoveTag = (tag: string) => {
    const newTags = localTags.filter(t => t !== tag);
    setLocalTags(newTags);
    onUpdateTags?.(beat.id, newTags);
  };

  // 1. Use cover from global player if this beat is the active one
  const { coverUrl: playerCoverUrl, currentBeat: playerBeat } = useAudioPlayerContext();
  const playerCover = playerBeat?.id === beat.id ? playerCoverUrl : null;

  // 2. Fallback: load cover locally for whichever beat is displayed
  const [localCoverUrl, setLocalCoverUrl] = useState<string | null>(preloadedCoverUrl ?? null);

  useEffect(() => {
    // Instantly use preloaded URL if available, otherwise fetch
    if (preloadedCoverUrl) {
      setLocalCoverUrl(preloadedCoverUrl);
      return;
    }
    setLocalCoverUrl(null);
    if (!beat.path) return;
    let cancelled = false;
    (async () => {
      try {
        const coverPath = await api.audio.getCoverPath(beat.path!);
        if (!cancelled && coverPath) {
          setLocalCoverUrl(convertFileSrc(coverPath.replace(/\\/g, "/")));
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [beat.id, preloadedCoverUrl]);

  const coverUrl = playerCover ?? localCoverUrl ?? null;
  const playerActive = !!playerBeat;

  const handleOpenFolder = async () => {
    if (beat.path) {
      try { await revealItemInDir(beat.path); } catch {}
    }
  };

  return (
    <aside style={{
      position: "fixed",
      right: 0,
      top: 0,
      height: playerActive ? "calc(100vh - 80px)" : "100vh",
      width: BROWSE_PANEL_WIDTH,
      background: C.background,
      display: "flex",
      flexDirection: "column",
      zIndex: 50,
      borderLeft: `1px solid ${C.border15}`,
      transform: isOpen ? "translateX(0)" : "translateX(100%)",
      transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    }}>
      {/* Close */}
      <button
        onClick={onClose}
        style={{
          position: "absolute", top: 16, right: 16, zIndex: 20,
          background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)",
          border: "none", borderRadius: 6, padding: 8, cursor: "pointer", display: "flex",
        }}
      >
        <X size={16} color="rgba(255,255,255,0.8)" />
      </button>

      {/* ── Scrollable Body ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 0 }}>

        {/* ── Artwork Section ────────────────────────────────────────────────── */}
        <div style={{ padding: "24px 20px 8px" }}>
          <div style={{
            fontSize: 10, fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.15em", color: C.onSecondaryFixedVar, marginBottom: 10,
          }}>
            Cover
          </div>
          <div style={{
            width: "100%", paddingTop: "100%", position: "relative",
            borderRadius: 10, overflow: "hidden",
            background: "linear-gradient(135deg, #1a1919 0%, #262626 60%, #131313 100%)",
          }}>
            {/* Placeholder */}
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Music size={56} color="rgba(255,255,255,0.08)" strokeWidth={1} />
            </div>
            {/* Cover */}
            {coverUrl && (
              <img
                src={coverUrl}
                alt={beat.name}
                style={{
                  position: "absolute", inset: 0,
                  width: "100%", height: "100%", objectFit: "cover",
                }}
                onError={e => { e.currentTarget.style.display = "none"; }}
              />
            )}
          </div>
        </div>

        {/* ── Metadata ───────────────────────────────────────────────────────── */}
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Project Name */}
          <div>
            <div style={labelStyle}>Beat-Name</div>
            <div style={fieldStyle}>{beat.name}</div>
          </div>

          {/* BPM + Key */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={labelStyle}>BPM</div>
              <div style={fieldStyle}>{beat.bpm || "—"}</div>
            </div>
            <div>
              <div style={labelStyle}>Tonart</div>
              <div style={fieldStyle}>{beat.key || "—"}</div>
            </div>
          </div>

          {/* Status Selection */}
          <div>
            <div style={labelStyle}>Status</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 6 }}>
              {STATUS_ITEMS.map(({ key, label }) => {
                const isActive = beat.status === key;
                const cfg = STATUS_CONFIG[key];
                return (
                  <button
                    key={key}
                    // STATUS_CONFIG ist Record<string, …>, damit FilterBar auch
                    // mit "all" indizieren kann; die vier Schluessel hier sind
                    // genau BeatStatus.
                    onClick={() => onUpdateStatus(beat.id, key as BeatStatus)}
                    style={{
                      padding: "10px 8px",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      border: isActive ? `1.5px solid ${cfg.color}` : `1px solid ${C.border20}`,
                      borderRadius: 8,
                      cursor: "pointer",
                      background: isActive ? `${cfg.color}18` : C.surfaceContainerLow,
                      color: isActive ? cfg.color : C.onSurfaceVariant,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 7,
                      transition: "all 0.15s",
                    }}
                  >
                    <span style={{
                      width: 7, height: 7, borderRadius: "50%",
                      background: cfg.color, flexShrink: 0,
                    }} />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tags */}
          <div>
            <div style={labelStyle}>Tags</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {sortTagsByCategory(localTags, (tag) => getTagCategoryFromDb(tag) ?? "custom").map(tag => (
                <TagPill key={tag} tag={tag} size="sm" removable onRemove={() => handleRemoveTag(tag)} />
              ))}
              <button
                onClick={handleOpenTagManager}
                style={{
                  padding: "4px 10px", borderRadius: 9999,
                  border: `1px solid ${C.border20}`,
                  background: C.surfaceContainerLow, cursor: "pointer",
                  fontSize: 10, fontWeight: 700, color: C.onSurfaceVariant,
                  display: "flex", alignItems: "center", gap: 4,
                  letterSpacing: "0.05em", textTransform: "uppercase",
                }}>
                <Tag size={10} strokeWidth={2} />
                Tags verwalten
              </button>
            </div>
          </div>

          {/* Notes */}
          {beat.notes && (
            <div>
              <div style={labelStyle}>Notizen</div>
              <div style={{
                marginTop: 6, padding: 12,
                background: C.surfaceContainerLow,
                borderRadius: 8, border: `1px solid ${C.border10}`,
                fontSize: 12, color: C.onSurface, lineHeight: 1.6, whiteSpace: "pre-wrap",
              }}>
                {beat.notes}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <div style={{
        padding: "12px 20px",
        borderTop: `1px solid ${C.border10}`,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        background: C.background,
      }}>
        {/* Edit Beat */}
        <button
          onClick={() => onOpenEditModal(beat)}
          style={{
            width: "100%", padding: "13px 16px",
            borderRadius: 10, background: C.primary,
            border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            fontSize: 12, fontWeight: 700, color: C.onPrimary,
          }}
        >
          <Edit3 size={15} />
          Beat bearbeiten
        </button>

        {/* Open Folder + Favorite */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleOpenFolder}
            style={{
              flex: 1, padding: "11px 16px",
              borderRadius: 10, background: C.surfaceContainerHigh,
              border: `1px solid ${C.border20}`,
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              fontSize: 12, fontWeight: 700, color: C.onSurface,
            }}
          >
            <FolderOpen size={15} color={C.onSurface} strokeWidth={1.5} />
            Ordner öffnen
          </button>

          <button
            onClick={() => onToggleFavorite(beat.id)}
            style={{
              width: 46, height: 46, borderRadius: 10,
              background: fav ? "rgba(253,161,36,0.15)" : C.surfaceContainerHigh,
              border: `1px solid ${fav ? "rgba(253,161,36,0.35)" : C.border20}`,
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Heart size={20} fill={fav ? C.primary : "none"} color={C.primary} strokeWidth={1.5} />
          </button>
        </div>

        {/* Delete Beat */}
        {onDelete && (
          <button
            onClick={() => setConfirmDelete(true)}
            style={{
              width: "100%", padding: "10px 16px",
              borderRadius: 10,
              background: "transparent",
              border: `1px solid ${DELETE_BORDER}`,
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              fontSize: 11, fontWeight: 700, color: DELETE_COLOR,
              letterSpacing: "0.08em", textTransform: "uppercase",
              marginTop: 4,
            }}
          >
            <Trash2 size={13} strokeWidth={1.75} />
            Beat löschen
          </button>
        )}
      </div>

      {/* ── Delete Confirmation Overlay ─────────────────────────────────────── */}
      {confirmDelete && (
        <div
          onClick={() => !isDeleting && setConfirmDelete(false)}
          style={{
            position: "absolute", inset: 0, zIndex: 30,
            background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 340,
              background: C.surfaceContainer,
              borderRadius: 12,
              border: `1px solid ${C.border20}`,
              padding: 20,
              display: "flex", flexDirection: "column", gap: 14,
            }}
          >
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{
                width: 36, height: 36, flexShrink: 0,
                borderRadius: 8,
                background: `${DELETE_COLOR}22`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <AlertTriangle size={18} color={DELETE_COLOR} strokeWidth={2} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.onSurface, marginBottom: 4 }}>
                  Delete this beat?
                </div>
                <div style={{ fontSize: 12, color: C.onSurfaceVariant, lineHeight: 1.5 }}>
                  <strong style={{ color: C.onSurface }}>#{beat.id}</strong> — {beat.name}
                </div>
              </div>
            </div>

            <div style={{
              padding: 10, borderRadius: 8,
              background: C.surfaceContainerLow,
              fontSize: 11, color: C.onSurfaceVariant, lineHeight: 1.5,
            }}>
              The folder will be moved to the system <strong style={{ color: C.onSurface }}>Recycle Bin</strong> and the entry removed from the library. You can restore the files from the Recycle Bin if needed.
              {beat.path && (
                <div style={{
                  marginTop: 8, fontSize: 10, fontFamily: "monospace",
                  color: C.onSecondaryFixedVar, wordBreak: "break-all",
                }}>
                  {beat.path}
                </div>
              )}
            </div>

            {deleteError && (
              <div style={{
                padding: 10, borderRadius: 8,
                background: `${DELETE_COLOR}15`,
                border: `1px solid ${DELETE_BORDER}`,
                fontSize: 11, color: DELETE_COLOR, lineHeight: 1.5,
                whiteSpace: "pre-wrap",
              }}>
                {deleteError}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={isDeleting}
                style={{
                  flex: 1, padding: "10px 12px",
                  borderRadius: 8,
                  background: C.surfaceContainerHigh,
                  border: `1px solid ${C.border20}`,
                  cursor: isDeleting ? "not-allowed" : "pointer",
                  fontSize: 12, fontWeight: 700, color: C.onSurface,
                  opacity: isDeleting ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                style={{
                  flex: 1, padding: "10px 12px",
                  borderRadius: 8,
                  background: DELETE_COLOR,
                  border: "none",
                  cursor: isDeleting ? "wait" : "pointer",
                  fontSize: 12, fontWeight: 700, color: "#fff",
                  opacity: isDeleting ? 0.7 : 1,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                <Trash2 size={13} strokeWidth={2} />
                {isDeleting ? "Wird gelöscht …" : "In den Papierkorb"}
              </button>
            </div>
          </div>
        </div>
      )}

    </aside>
  );
}

const DELETE_COLOR = "#e5484d";
const DELETE_BORDER = "rgba(229,72,77,0.35)";

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.15em",
  color: C.onSecondaryFixedVar,
  marginBottom: 6,
};

const fieldStyle: React.CSSProperties = {
  padding: "11px 14px",
  background: C.surfaceContainerLow,
  borderRadius: 8,
  border: `1px solid ${C.border15}`,
  fontSize: 14,
  fontWeight: 600,
  color: C.onSurface,
};
