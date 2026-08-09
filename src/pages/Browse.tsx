// src/pages/Browse.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Browse Page - Modular Architecture with Server-Side Pagination & Filtering
// ═══════════════════════════════════════════════════════════════════════════════

import { useCallback, useRef, useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Loader2, AlertCircle, LayoutGrid, List, Shuffle, RotateCcw } from "lucide-react";
import { C } from "../lib/theme";
import { BROWSE_PANEL_WIDTH } from "../lib/constants";
import { useBeats } from "../hooks/useBeats";
import { DEFAULT_FILTERS, type FilterState } from "../types/browse";
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
import { useTagManager } from "../contexts/TagManagerContext";

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
    preloadCovers,
    uploadBadges,
    getFilteredBeats,
    queryKey,
  } = useBeats(initialFilters);

  const { playBeat, setQueue, currentBeat, togglePlay } = useAudioPlayerContext();
  const { settings } = useSettings();
  const { isOpen: tagManagerOpen } = useTagManager();

  // ─── Edit Modal State ──────────────────────────────────────────────────────
  const [editModalBeat, setEditModalBeat] = useState<Beat | null>(null);

  // ─── View Mode: Tabelle ⇄ Cover-Grid (persistiert) ─────────────────────────
  const [viewMode, setViewMode] = useState<"table" | "grid">(
    () => (localStorage.getItem("beatos_browse_view") === "grid" ? "grid" : "table")
  );
  useEffect(() => { localStorage.setItem("beatos_browse_view", viewMode); }, [viewMode]);

  // ─── Cover nur laden, wenn sie auch gezeigt werden ────────────────────────
  // Jedes Cover ist ein Verzeichnis-Scan; in der Tabelle sieht man keins.
  useEffect(() => {
    if (viewMode === "grid") preloadCovers(beats);
  }, [viewMode, beats, preloadCovers]);

  // ─── Nach neuem Ergebnis nach oben ────────────────────────────────────────
  // Sonst landet man nach "Weiter" unten auf der neuen Seite.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [queryKey, pagination.page]);

  // ─── Panel Animation: keep last beat visible during slide-out ─────────────
  const [displayBeat, setDisplayBeat] = useState<Beat | null>(null);
  useEffect(() => {
    if (selectedBeat) setDisplayBeat(selectedBeat);
  }, [selectedBeat]);

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const handleSelectBeat = useCallback((beat: Beat) => {
    selectBeat(beat);
  }, [selectBeat]);

  const handlePlayBeat = useCallback((beat: Beat) => {
    // Sofort starten, Queue kommt gleich nach — sonst wartet der Klick auf die
    // Abfrage der vollen Trefferliste.
    playBeat(beat, getCoverUrl(beat.id));
    getFilteredBeats().then(setQueue);
  }, [playBeat, getCoverUrl, getFilteredBeats, setQueue]);

  const handleRandomBeat = useCallback(async () => {
    // Zieht aus allen Treffern, nicht nur aus der sichtbaren Seite.
    const all = await getFilteredBeats();
    if (all.length === 0) return;
    const random = all[Math.floor(Math.random() * all.length)];
    setQueue(all);
    playBeat(random, getCoverUrl(random.id));
    selectBeat(random);
  }, [getFilteredBeats, setQueue, playBeat, getCoverUrl, selectBeat]);

  const handleOpenEditModal = useCallback((beat: Beat) => {
    setEditModalBeat(beat);
  }, []);

  const handleCloseEditModal = useCallback(() => {
    setEditModalBeat(null);
  }, []);

  const handleSaveFromModal = useCallback(async (params: UpdateBeatParams) => {
    await updateBeat(params);
    setEditModalBeat(null);
  }, [updateBeat]);

  // ─── Tastatur: Escape schliesst, Pfeile waehlen, Leertaste spielt ─────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Nicht dazwischenfunken, waehrend getippt wird oder ein Dialog offen ist
      // — die haben eigene Tastenbelegungen.
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (editModalBeat || tagManagerOpen) return;

      if (e.key === "Escape") {
        selectBeat(null);
        return;
      }

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (beats.length === 0) return;
        e.preventDefault(); // sonst scrollt die Liste zusaetzlich
        const idx = beats.findIndex(b => b.id === selectedBeat?.id);
        if (idx < 0) {
          selectBeat(beats[0]);
        } else {
          const step = e.key === "ArrowDown" ? 1 : -1;
          selectBeat(beats[Math.min(Math.max(idx + step, 0), beats.length - 1)]);
        }
        return;
      }

      if (e.key === " ") {
        e.preventDefault(); // sonst springt die Seite eine Bildhoehe weiter
        if (currentBeat) togglePlay();
        else if (selectedBeat) handlePlayBeat(selectedBeat);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [beats, selectedBeat, editModalBeat, tagManagerOpen, selectBeat, currentBeat, togglePlay, handlePlayBeat]);

  // ─── Beat ins Bild holen ──────────────────────────────────────────────────
  // Nur wenn er auf dieser Seite liegt; "nearest" ruehrt sich nicht, wenn er
  // ohnehin sichtbar ist — ein Klick auf eine sichtbare Zeile scrollt also nicht.
  // Beat-IDs sind numerische Strings aus der DB, daher kein Escaping noetig.
  const scrollBeatIntoView = useCallback((beatId: string | undefined) => {
    if (!beatId) return;
    scrollRef.current
      ?.querySelector(`[data-beat-id="${beatId}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  // Laufender Beat (z.B. wenn der Player weiterspringt)
  useEffect(() => { scrollBeatIntoView(currentBeat?.id); }, [currentBeat?.id, scrollBeatIntoView]);
  // Auswahl — sonst waeren die Pfeiltasten ausserhalb des Sichtfelds nutzlos
  useEffect(() => { scrollBeatIntoView(selectedBeat?.id); }, [selectedBeat?.id, scrollBeatIntoView]);

  // ─── Layout Calculation ────────────────────────────────────────────────────
  const PANEL_WIDTH = selectedBeat ? BROWSE_PANEL_WIDTH : 0;
  // Nur solange noch nie etwas geladen wurde — danach wird gedimmt statt geleert.
  const isInitialLoad = isLoading && beats.length === 0;
  // Feldweise vergleichen, nicht die ganzen Objekte als JSON: ein alter
  // sessionStorage-Stand kann Zusatzfelder mitbringen und wuerde sonst immer
  // als "gefiltert" gelten.
  const hasActiveFilters = (Object.keys(DEFAULT_FILTERS) as (keyof FilterState)[])
    .some(k => String(filters[k]) !== String(DEFAULT_FILTERS[k]));

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
      <div ref={scrollRef} style={{
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

          {/* Erster Ladevorgang: hier gibt es noch nichts zu zeigen.
              Jedes weitere Laden dimmt nur die stehende Liste (siehe unten) —
              sie wegzuwerfen liess das Layout bei jedem Tastendruck springen. */}
          {isInitialLoad && (
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
          {!isInitialLoad && !error && (
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
                disabled={pagination.totalCount === 0}
                title="Zufälligen Beat aus allen Treffern abspielen"
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", borderRadius: 7,
                  background: "transparent",
                  border: `1px solid ${C.border15}`,
                  color: C.onSurfaceVariant,
                  cursor: pagination.totalCount === 0 ? "not-allowed" : "pointer",
                  fontSize: 10, fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.04em",
                  opacity: pagination.totalCount === 0 ? 0.5 : 1,
                }}
              >
                <Shuffle size={12} strokeWidth={2} />
                Zufall
              </button>
            </div>
          )}

          {/* Beats: Tabelle oder Cover-Grid.
              Bleibt beim Nachladen stehen und wird nur ausgegraut — das haelt
              Layout und Scrollposition ruhig. */}
          {!isInitialLoad && !error && (
            <div style={{
              display: "flex", flexDirection: "column", gap: 24,
              opacity: isLoading ? 0.45 : 1,
              pointerEvents: isLoading ? "none" : "auto",
              transition: "opacity 0.15s",
            }}>
              {beats.length === 0 ? (
                <EmptyState hasFilters={hasActiveFilters} onReset={resetFilters} />
              ) : viewMode === "table" ? (
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
              )}

              {pagination.totalCount > 0 && (
                <Pagination
                  pagination={pagination}
                  totalPages={totalPages}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                />
              )}
            </div>
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

    </div>
  );
}

/** Leer ist nicht gleich leer — "nichts gefunden" braucht einen Ausweg. */
function EmptyState({ hasFilters, onReset }: { hasFilters: boolean; onReset: () => void }) {
  return (
    <div style={{
      padding: 48, textAlign: "center", borderRadius: 10,
      background: "#181717",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
    }}>
      <div style={{ color: C.onSurfaceVariant, fontSize: 13 }}>
        {hasFilters
          ? "Keine Beats passen zu diesen Filtern."
          : "Noch keine Beats in der Bibliothek."}
      </div>
      {hasFilters && (
        <button
          onClick={onReset}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 14px", borderRadius: 7,
            background: "transparent",
            border: `1px solid ${C.border30}`,
            color: C.onSurface, cursor: "pointer",
            fontSize: 10, fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.04em",
          }}
        >
          <RotateCcw size={12} strokeWidth={2} />
          Filter zurücksetzen
        </button>
      )}
    </div>
  );
}
