// src/pages/Browse.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Browse Page - Modular Architecture with Server-Side Pagination & Filtering
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Loader2, AlertCircle, LayoutGrid, List, Shuffle } from "lucide-react";
import { C } from "../lib/theme";
import { useBeats } from "../hooks/useBeats";
import type { FilterState } from "../types/browse";
import {
  BrowseHeader,
  FilterBar,
  BeatTable,
  DetailPanel,
  EditBeatModal,
  Pagination,
} from "../components/browse";
import { BeatGrid } from "../components/browse/BeatGrid";
import type { Beat, UpdateBeatParams } from "../types/browse";
import { useAudioPlayerContext } from "../contexts/AudioPlayerContext";
import { useSettings } from "../contexts/SettingsContext";

export default function Browse() {
  const location = useLocation();
  const initialFilters = (location.state as { initialFilters?: Partial<FilterState> } | null)?.initialFilters;

  // ─── Data & Actions from Hook ──────────────────────────────────────────────
  const {
    beats,  // Already filtered by server!
    selectedBeat,
    isLoading,
    error,
    filters,
    setFilters,
    resetFilters,
    sort,
    setSort,
    pagination,
    setPage,
    setPageSize,
    totalPages,
    selectBeat,
    refresh,
    toggleFavorite,
    updateStatus,
    updateBeat,
    deleteBeat,
    getCoverUrl,
    uploadBadges,
  } = useBeats(initialFilters);

  const { playBeat, setQueue } = useAudioPlayerContext();
  const { settings } = useSettings();

  // ─── Edit Modal State ──────────────────────────────────────────────────────
  const [editModalBeat, setEditModalBeat] = useState<Beat | null>(null);

  // ─── View Mode: Tabelle ⇄ Cover-Grid (persistiert) ─────────────────────────
  const [viewMode, setViewMode] = useState<"table" | "grid">(
    () => (localStorage.getItem("beatos_browse_view") === "grid" ? "grid" : "table")
  );
  useEffect(() => { localStorage.setItem("beatos_browse_view", viewMode); }, [viewMode]);

  // ─── Panel Animation: keep last beat visible during slide-out ─────────────
  const [displayBeat, setDisplayBeat] = useState<Beat | null>(null);
  useEffect(() => {
    if (selectedBeat) setDisplayBeat(selectedBeat);
  }, [selectedBeat]);

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const handleSelectBeat = (beat: Beat) => {
    selectBeat(beat);
  };

  const handlePlayBeat = (beat: Beat) => {
    // Die aktuell gefilterte Liste wird zur Hör-Queue (Skip-Buttons im Player)
    setQueue(beats);
    playBeat(beat, getCoverUrl(beat.id));
  };

  const handleRandomBeat = () => {
    if (beats.length === 0) return;
    const random = beats[Math.floor(Math.random() * beats.length)];
    setQueue(beats);
    playBeat(random, getCoverUrl(random.id));
    selectBeat(random);
  };

  const handleOpenEditModal = (beat: Beat) => {
    setEditModalBeat(beat);
  };

  const handleCloseEditModal = () => {
    setEditModalBeat(null);
  };

  const handleSaveFromModal = async (params: UpdateBeatParams) => {
    await updateBeat(params);
    setEditModalBeat(null);
  };

  // ─── Layout Calculation ────────────────────────────────────────────────────
  const PANEL_WIDTH = selectedBeat ? 400 : 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{
      height: "100%",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      background: C.background,
      marginRight: PANEL_WIDTH,
      transition: "margin-right 0.3s ease",
    }}>
      {/* ═══════════════════════════════════════════════════════════════════════
          Header (Fixed)
      ═══════════════════════════════════════════════════════════════════════ */}
      <BrowseHeader
        search={filters.search}
        onSearchChange={value => setFilters(prev => ({ ...prev, search: value }))}
        onRefresh={refresh}
        isLoading={isLoading}
      />

      {/* ═══════════════════════════════════════════════════════════════════════
          Main Content (Scrollable)
      ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        overflowX: "hidden",
        display: "flex",
        flexDirection: "column",
      }}>
        {/* Inner content with padding */}
        <div style={{
          padding: 32,
          display: "flex",
          flexDirection: "column",
          gap: 24,
          minHeight: "min-content",
        }}>
          {/* Filter Bar */}
          <FilterBar
            filters={filters}
            onChange={setFilters}
            onReset={resetFilters}
            resultCount={pagination.totalCount}
          />

          {/* Loading State */}
          {isLoading && (
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 48,
            }}>
              <Loader2
                size={24}
                color={C.primary}
                style={{ animation: "spin 1s linear infinite" }}
              />
              <span style={{ marginLeft: 12, color: C.onSurfaceVariant }}>
                Loading beats...
              </span>
            </div>
          )}

          {/* Error State */}
          {error && !isLoading && (
            <div style={{
              padding: 16,
              borderRadius: 8,
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}>
              <AlertCircle size={20} color="#ef4444" />
              <span style={{ color: "#ef4444", fontSize: 13 }}>{error}</span>
            </div>
          )}

          {/* View toolbar: Tabelle ⇄ Grid + Zufalls-Beat */}
          {!isLoading && !error && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                display: "flex", gap: 2,
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${C.border15}`,
                borderRadius: 7, padding: 2,
              }}>
                {([["table", List, "Tabelle"], ["grid", LayoutGrid, "Cover-Grid"]] as const).map(([mode, Icon, label]) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    title={label}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "5px 11px",
                      background: viewMode === mode ? C.surfaceContainerHigh : "transparent",
                      border: "none", borderRadius: 5,
                      cursor: "pointer",
                      fontSize: 10, fontWeight: 700,
                      color: viewMode === mode ? C.onSurface : C.onSecondaryFixedVar,
                      textTransform: "uppercase", letterSpacing: "0.04em",
                    }}
                  >
                    <Icon size={12} strokeWidth={2} />
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ flex: 1 }} />
              <button
                onClick={handleRandomBeat}
                disabled={beats.length === 0}
                title="Zufälligen Beat aus der aktuellen Liste abspielen"
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", borderRadius: 7,
                  background: "transparent",
                  border: `1px solid ${C.border15}`,
                  color: C.onSurfaceVariant,
                  cursor: beats.length === 0 ? "not-allowed" : "pointer",
                  fontSize: 10, fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.04em",
                  opacity: beats.length === 0 ? 0.5 : 1,
                }}
              >
                <Shuffle size={12} strokeWidth={2} />
                Zufall
              </button>
            </div>
          )}

          {/* Beats: Tabelle oder Cover-Grid */}
          {!isLoading && !error && (
            viewMode === "table" ? (
              <BeatTable
                beats={beats}
                selectedBeatId={selectedBeat?.id || null}
                onSelectBeat={handleSelectBeat}
                onToggleFavorite={toggleFavorite}
                onPlayBeat={handlePlayBeat}
                sort={sort}
                onSort={setSort}
                uploadBadges={uploadBadges}
              />
            ) : (
              <BeatGrid
                beats={beats}
                selectedBeatId={selectedBeat?.id || null}
                onSelectBeat={handleSelectBeat}
                onToggleFavorite={toggleFavorite}
                onPlayBeat={handlePlayBeat}
                getCoverUrl={getCoverUrl}
                uploadBadges={uploadBadges}
              />
            )
          )}

          {/* Pagination - inside scrollable area */}
          {!isLoading && !error && pagination.totalCount > 0 && (
            <Pagination
              pagination={pagination}
              totalPages={totalPages}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          )}

          {/* Bottom spacer for comfortable scrolling */}
          <div style={{ height: 32, flexShrink: 0 }} />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          Detail Panel (Read-Only + Status Toggles)
      ═══════════════════════════════════════════════════════════════════════ */}
      {displayBeat && (
        <DetailPanel
          beat={displayBeat}
          isOpen={!!selectedBeat}
          onClose={() => selectBeat(null)}
          onToggleFavorite={toggleFavorite}
          onUpdateStatus={updateStatus}
          onOpenEditModal={handleOpenEditModal}
          preloadedCoverUrl={selectedBeat ? getCoverUrl(selectedBeat.id) : null}
          onUpdateTags={async (beatId, tags) => {
            await updateBeat({ id: beatId, tags: tags.join(", ") });
          }}
          onDelete={async (b) => {
            if (!settings.archivePath) {
              throw new Error("Archive path is not configured. Open Settings to set it.");
            }
            await deleteBeat(b.id, settings.archivePath);
          }}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          Edit Modal
      ═══════════════════════════════════════════════════════════════════════ */}
      {editModalBeat && (
        <EditBeatModal
          beat={editModalBeat}
          isOpen={true}
          onClose={handleCloseEditModal}
          onSave={handleSaveFromModal}
        />
      )}

      {/* Keyframes */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
