// src/pages/Browse.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Browse Page - Modular Architecture with Server-Side Pagination & Filtering
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Loader2, AlertCircle } from "lucide-react";
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
import type { Beat, UpdateBeatParams } from "../types/browse";

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
    getCoverUrl,
  } = useBeats(initialFilters);

  // ─── Edit Modal State ──────────────────────────────────────────────────────
  const [editModalBeat, setEditModalBeat] = useState<Beat | null>(null);

  // ─── Panel Animation: keep last beat visible during slide-out ─────────────
  const [displayBeat, setDisplayBeat] = useState<Beat | null>(null);
  useEffect(() => {
    if (selectedBeat) setDisplayBeat(selectedBeat);
  }, [selectedBeat]);

  // ─── Handlers ──────────────────────────────────────────────────────────────
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
  const PANEL_WIDTH = selectedBeat ? 360 : 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{
      height: "100vh",
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

          {/* Beat Table with Sortable Headers */}
          {!isLoading && !error && (
            <BeatTable
              beats={beats}
              selectedBeatId={selectedBeat?.id || null}
              onSelectBeat={selectBeat}
              onToggleFavorite={toggleFavorite}
              sort={sort}
              onSort={setSort}
            />
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
