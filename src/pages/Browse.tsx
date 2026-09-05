// src/pages/Browse.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Browse Page - Modular Architecture with Server-Side Pagination & Filtering
// ═══════════════════════════════════════════════════════════════════════════════

import { useCallback, useRef, useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Loader2, AlertCircle, LayoutGrid, List, Shuffle, RotateCcw, LibraryBig } from "lucide-react";
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
import { PageBody, EmptyState, Button } from "../components/ui";
import type { Beat, UpdateBeatParams, SortColumn } from "../types/browse";
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

  // ─── Der Streifen unter dem Detailpanel zaehlt nicht als sichtbar ─────────
  // Das Panel liegt fix ueber der rechten Seite; scrollIntoView kennt es nicht
  // und haelt eine verdeckte Karte fuer sichtbar. scroll-padding-right nimmt
  // dem Browser genau diese Breite aus dem Sichtfeld — dann holt er die Karte
  // von selbst darunter hervor. Nur im Raster: eine Tabellenzeile reicht immer
  // bis unter das Panel, die wuerde sonst bei jedem Klick nach links wandern.
  // Muss vor den beiden Scroll-Effekten stehen, sonst greift es erst beim
  // naechsten Klick.
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    if (selectedBeat && viewMode === "grid") {
      sc.style.scrollPaddingRight = `${BROWSE_PANEL_WIDTH}px`;
    } else {
      sc.style.scrollPaddingRight = "";
      sc.scrollTo({ left: 0, behavior: "smooth" }); // Panel zu: wieder buendig
    }
  }, [selectedBeat, viewMode]);

  // ─── Beat ins Bild holen ──────────────────────────────────────────────────
  // Nur wenn er auf dieser Seite liegt; "nearest" ruehrt sich nicht, wenn er
  // ohnehin sichtbar ist — ein Klick auf eine sichtbare Zeile scrollt also nicht.
  // Beat-IDs sind numerische Strings aus der DB, daher kein Escaping noetig.
  const scrollBeatIntoView = useCallback((beatId: string | undefined) => {
    if (!beatId) return;
    scrollRef.current
      ?.querySelector(`[data-beat-id="${beatId}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, []);

  // Laufender Beat (z.B. wenn der Player weiterspringt)
  useEffect(() => { scrollBeatIntoView(currentBeat?.id); }, [currentBeat?.id, scrollBeatIntoView]);
  // Auswahl — sonst waeren die Pfeiltasten ausserhalb des Sichtfelds nutzlos
  useEffect(() => { scrollBeatIntoView(selectedBeat?.id); }, [selectedBeat?.id, scrollBeatIntoView]);

  // ─── Layout Calculation ────────────────────────────────────────────────────
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
      // Kein marginRight fuer das Detailpanel: das Panel liegt fixed darueber.
      // Vorher schob es die Seite in 300 ms zur Seite — Margin ist Layout, also
      // rechnete der Browser in jedem Frame das Cover-Raster neu und liess dabei
      // ganze Reihen umbrechen. Das war das Zusammensacken der Vorschaubilder.
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
      {/* „full": das Cover-Raster braucht jede Spalte, deshalb keine
          Maximalbreite — Innenabstand und Abstaende kommen trotzdem aus
          derselben Quelle wie auf allen anderen Seiten. */}
      <PageBody ref={scrollRef} width="full">
          {/* Eine Bedienreihe statt zwei. Filter, Ansicht, Sortierung und
              Zufall standen untereinander und kosteten zwei Reihen Hoehe —
              also eine Cover-Reihe weniger auf dem Schirm. */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <FilterBar
                filters={filters}
                onChange={setFilters}
                onReset={resetFilters}
                resultCount={pagination.totalCount}
              />
            </div>

            {!isInitialLoad && !error && (
              <>
                {/* Sortierung — es gab sie bisher nur in der Tabelle. Im
                    Cover-Raster musste man die Ansicht wechseln, also genau
                    die verlassen, in der man visuell sucht. */}
                <select
                  value={`${sort.column}:${sort.direction}`}
                  onChange={e => {
                    const [column, direction] = e.target.value.split(":");
                    setSort(column as SortColumn, direction as "asc" | "desc");
                  }}
                  title="Sortierung"
                  style={{
                    padding: "6px 10px", borderRadius: 7,
                    background: C.surfaceContainer,
                    border: `1px solid ${C.border15}`,
                    color: C.onSurfaceVariant,
                    fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                    cursor: "pointer", outline: "none", flexShrink: 0,
                  }}
                >
                  <option value="id:desc">Neueste zuerst</option>
                  <option value="id:asc">Älteste zuerst</option>
                  <option value="name:asc">Titel A–Z</option>
                  <option value="bpm:asc">Tempo aufsteigend</option>
                  <option value="bpm:desc">Tempo absteigend</option>
                  <option value="key:asc">Tonart</option>
                  <option value="status:asc">Status</option>
                </select>

                <div style={{
                  display: "flex", gap: 2, flexShrink: 0,
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
                        fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                        color: viewMode === mode ? C.onSurface : C.onSecondaryFixedVar,
                      }}
                    >
                      <Icon size={12} strokeWidth={2} />
                      {label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleRandomBeat}
                  disabled={pagination.totalCount === 0}
                  title="Zufälligen Beat aus allen Treffern abspielen"
                  style={{
                    display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
                    padding: "6px 12px", borderRadius: 7,
                    background: "transparent",
                    border: `1px solid ${C.border15}`,
                    color: C.onSurfaceVariant,
                    cursor: pagination.totalCount === 0 ? "not-allowed" : "pointer",
                    fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                    opacity: pagination.totalCount === 0 ? 0.5 : 1,
                  }}
                >
                  <Shuffle size={12} strokeWidth={2} />
                  Zufall
                </button>
              </>
            )}
          </div>

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
                Beats werden geladen …
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
                <BrowseEmptyState hasFilters={hasActiveFilters} onReset={resetFilters} />
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
                  // Monatsueberschriften nur bei chronologischer Sicht. Nach
                  // Tempo oder Tonart sortiert waeren sie gelogen — dann steht
                  // ein Beat aus Mai zwischen zweien aus August.
                  // Die Nummer ist der chronologische Schluessel: sie wird
                  // beim Archivieren fortlaufend vergeben.
                  gruppiereNachMonat={sort.column === "id"}
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

          {/* Luft nach unten — und nach rechts: die Ueberbreite ist der Platz,
              in den eine vom Detailpanel verdeckte Karte gescrollt wird. Sie
              haengt an diesem Streifen statt am Raster, damit das Raster gleich
              breit bleibt und nichts umbricht. */}
          <div style={{ height: 32, flexShrink: 0, width: `calc(100% + ${BROWSE_PANEL_WIDTH}px)` }} />
      </PageBody>

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
              throw new Error("Kein Archiv-Ordner gesetzt. Unter Einstellungen festlegen.");
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
function BrowseEmptyState({ hasFilters, onReset }: { hasFilters: boolean; onReset: () => void }) {
  return (
    <EmptyState
      icon={LibraryBig}
      title={hasFilters ? "Keine Beats passen zu diesen Filtern." : "Noch keine Beats im Archiv."}
      description={hasFilters ? undefined : "Lege unter „Neuer Beat“ deinen ersten Beat an."}
      action={hasFilters && (
        <Button variant="secondary" size="sm" icon={RotateCcw} onClick={onReset}>
          Filter zurücksetzen
        </Button>
      )}
    />
  );
}
