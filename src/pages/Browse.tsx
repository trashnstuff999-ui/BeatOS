// src/pages/Browse.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Browse Page - Modular Architecture with Server-Side Pagination & Filtering
// ═══════════════════════════════════════════════════════════════════════════════

import { useCallback, useRef, useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2, AlertCircle, LayoutGrid, List, Shuffle, RotateCcw, LibraryBig } from "lucide-react";
import { C, alpha, radius } from "../lib/theme";
import { BROWSE_PANEL_WIDTH } from "../lib/constants";
import { useBeats } from "../hooks/useBeats";
import { DEFAULT_FILTERS, type FilterState } from "../types/browse";
import {
  BrowseHeader,
  FilterBar,
  BeatTable,
  DetailPanel,
  Pagination,
  MigrateArchiveDialog,
  type AngleichModus,
} from "../components/browse";
import { BeatGrid } from "../components/browse/BeatGrid";
import { PageBody, EmptyState, Button, Select, Segmented } from "../components/ui";
import type { Beat, SortColumn } from "../types/browse";
import { useAudioPlayerContext } from "../contexts/AudioPlayerContext";
import { useSettings } from "../contexts/SettingsContext";
import { useKlickDaneben } from "../hooks/useKlickDaneben";
import { useTagManager } from "../contexts/TagManagerContext";


const SORT_OPTIONS = [
  { value: "created_date:desc", label: "Neueste zuerst" },
  { value: "created_date:asc", label: "Älteste zuerst" },
  { value: "id:desc", label: "Zuletzt archiviert" },
  { value: "id:asc", label: "Zuerst archiviert" },
  { value: "name:asc", label: "Titel A–Z" },
  { value: "bpm:asc", label: "Tempo aufsteigend" },
  { value: "bpm:desc", label: "Tempo absteigend" },
  { value: "key:asc", label: "Tonart" },
  { value: "status:asc", label: "Status" },
];

export default function Browse() {
  const location = useLocation();
  const navigate = useNavigate();
  const navState = location.state as {
    initialFilters?: Partial<FilterState>;
    /** Beat, der nach dem Laden gleich ausgewaehlt sein soll (Deep-Link). */
    initialBeatId?: string;
  } | null;
  const initialFilters = navState?.initialFilters;

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
    refreshUploadBadges,
    getFilteredBeats,
    queryKey,
  } = useBeats(initialFilters);

  const { playBeat, setQueue, currentBeat, togglePlay } = useAudioPlayerContext();
  const { settings } = useSettings();
  const { isOpen: tagManagerOpen } = useTagManager();

  const [angleich, setAngleich] = useState<AngleichModus | null>(null);

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

  // Klick daneben — ins Archiv oder in die Seitenleiste — schliesst das Panel.
  // Die Regel steht im Hook.
  useKlickDaneben(!!selectedBeat, () => selectBeat(null));

  // Deep-Link mit Beat: aus der Uebersicht heisst der Knopf „Im Archiv oeffnen"
  // — er filterte aber nur nach dem Namen und liess das Detailpanel zu. Jetzt
  // ist der Beat auch wirklich ausgewaehlt, sobald die Liste da ist.
  const beatGewaehlt = useRef(false);

  // Neuer Deep-Link, während das Archiv schon offen ist (Strg+K aus dem
  // Archiv heraus): die Seite bleibt geladen, also die Vorgaben selbst
  // übernehmen und die Auswahl neu zulassen. Beim ersten Laden erledigt das
  // useBeats(initialFilters) — der erste Durchlauf wird übersprungen.
  const ersterLink = useRef(location.key);
  useEffect(() => {
    if (location.key === ersterLink.current) return;
    beatGewaehlt.current = false;
    if (navState?.initialFilters) setFilters(f => ({ ...f, ...navState.initialFilters }));
  }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (beatGewaehlt.current || !navState?.initialBeatId) return;
    const treffer = beats.find(b => b.id === navState.initialBeatId);
    if (!treffer) return;
    beatGewaehlt.current = true;
    selectBeat(treffer);
  }, [beats, navState?.initialBeatId, selectBeat]);

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

  // ─── Tastatur: Escape schliesst, Pfeile waehlen, Leertaste spielt ─────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Nicht dazwischenfunken, waehrend getippt wird oder ein Dialog offen ist
      // — die haben eigene Tastenbelegungen.
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (tagManagerOpen) return;

      if (e.key === "Escape") {
        selectBeat(null);
        return;
      }

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        // Mit Shift regelt der Player die Lautstaerke — dann nicht auch noch
        // die Auswahl verschieben.
        if (e.shiftKey) return;
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
        // Laeuft schon etwas, gehoert die Leertaste dem Player (er horcht
        // selbst mit) — hier bliebe sonst ein zweites Umschalten, und beides
        // zusammen hebt sich auf. Hier bleibt nur der Fall „noch nichts
        // laeuft": dann startet die Auswahl.
        if (currentBeat) return;
        if (!selectedBeat) return;
        e.preventDefault(); // sonst springt die Seite eine Bildhoehe weiter
        handlePlayBeat(selectedBeat);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [beats, selectedBeat, tagManagerOpen, selectBeat, currentBeat, togglePlay, handlePlayBeat]);

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
    <div data-app-flaeche style={{
      height: "100%",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      background: C.background,
      // Geteilte Ansicht: die Seite gibt dem Detailpanel seinen Platz ab —
      // sofort, ohne Übergang. Animiert rechnete der Browser das Cover-Raster
      // in jedem Frame neu (das „Zusammensacken"); ein einziger Umbruch fällt
      // nicht auf. Vorher lag das Panel über dem Raster und die Seite wurde
      // seitwärts geschoben, um die verdeckte Karte zu zeigen — dabei rutschten
      // Filterleiste, Suchfeld und die linke Spalte aus dem Bild.
      paddingRight: selectedBeat ? BROWSE_PANEL_WIDTH : 0,
    }}>
      {/* ═══════════════════════════════════════════════════════════════════════
          Header (Fixed)
      ═══════════════════════════════════════════════════════════════════════ */}
      <BrowseHeader
        search={filters.search}
        onSearchChange={value => setFilters(prev => ({ ...prev, search: value }))}
        onRefresh={refresh}
        isLoading={isLoading}
        onMigrate={() => setAngleich("struktur")}
        onRename={() => setAngleich("namen")}
      />

      {/* ═══════════════════════════════════════════════════════════════════════
          Main Content (Scrollable)
      ═══════════════════════════════════════════════════════════════════════ */}
      {/* „full": das Cover-Raster braucht jede Spalte, deshalb keine
          Maximalbreite — Innenabstand und Abstaende kommen trotzdem aus
          derselben Quelle wie auf allen anderen Seiten. */}
      <PageBody ref={scrollRef} width="full">
          {/* Eine Bedienreihe statt zwei. Filter, Ansicht, Sortierung und
              Zufall stehen in derselben Kopfzeile fester Hoehe; das
              Filter-Raster klappt darunter ueber die volle Breite auf. */}
          {/* Klicks bleiben in der Bedienreihe: hier wird eingestellt, nicht
              „ins Leere" geklickt — ein Griff daneben soll nicht das Panel
              zumachen. */}
          <div onClick={e => e.stopPropagation()}>
            <FilterBar
              filters={filters}
              onChange={setFilters}
              onReset={resetFilters}
              resultCount={pagination.totalCount}
              actions={!isInitialLoad && !error && (
                <>
                  {/* Sortierung — es gab sie bisher nur in der Tabelle. Im
                      Cover-Raster musste man die Ansicht wechseln, also genau
                      die verlassen, in der man visuell sucht. */}
                  {/* Zwei verschiedene Zeitachsen, und sie laufen auseinander:
                      die Nummer sagt, wann archiviert wurde, das Datum kommt
                      aus der FLP und sagt, wann produziert wurde. Nur die
                      Datums-Sortierung passt zu den Monatsueberschriften. */}
                  <Select
                    value={`${sort.column}:${sort.direction}`}
                    options={SORT_OPTIONS}
                    onChange={v => {
                      const [column, direction] = v.split(":");
                      setSort(column as SortColumn, direction as "asc" | "desc");
                    }}
                    title="Sortierung"
                    align="right"
                    panelWidth={220}
                    triggerStyle={{ padding: "6px 10px", color: C.onSurfaceVariant }}
                  />

                  <Segmented
                    label="Ansicht"
                    value={viewMode}
                    onChange={setViewMode}
                    options={[
                      { value: "table", label: "Tabelle", icon: List },
                      { value: "grid", label: "Cover-Grid", icon: LayoutGrid },
                    ]}
                  />

                  <Button size="sm" variant="secondary" icon={Shuffle} disabled={pagination.totalCount === 0}
                    title="Zufälliger Beat" style={{ flexShrink: 0 }} onClick={handleRandomBeat}>
                    Zufall
                  </Button>
                </>
              )}
            />
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
              borderRadius: radius.control,
              background: alpha(C.error, 0.1),
              border: `1px solid ${alpha(C.error, 0.3)}`,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}>
              <AlertCircle size={20} color={C.error} />
              <span style={{ color: C.error, fontSize: 13 }}>{error}</span>
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
                  // Nur wenn nach demselben Feld sortiert wird, nach dem
                  // gruppiert wird. Anfangs hing das an der Nummer — falsch:
                  // die Nummer zaehlt die Archivierung, das Datum kommt aus
                  // der FLP. Dadurch kam derselbe Monat mehrfach vor.
                  gruppiereNachMonat={sort.column === "created_date"}
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

          {/* Luft nach unten */}
          <div style={{ height: 32, flexShrink: 0 }} />
      </PageBody>

      {/* ═══════════════════════════════════════════════════════════════════════
          Detailpanel — hier wird der Beat auch bearbeitet
      ═══════════════════════════════════════════════════════════════════════ */}
      {displayBeat && (
        <DetailPanel
          beat={displayBeat}
          isOpen={!!selectedBeat}
          onClose={() => selectBeat(null)}
          onToggleFavorite={toggleFavorite}
          onUpdateStatus={updateStatus}
          onSaveBeat={updateBeat}
          preloadedCoverUrl={selectedBeat ? getCoverUrl(selectedBeat.id) : null}
          onUpdateTags={async (beatId, tags) => {
            await updateBeat({ id: beatId, tags: tags.join(", ") });
          }}
          onUploadsChanged={refreshUploadBadges}
          onRenamed={refresh}
          onOpenInUpload={(b) => navigate("/upload", { state: { beatId: b.id } })}
          onDelete={async (b) => {
            if (!settings.archivePath) {
              throw new Error("Kein Archiv-Ordner gesetzt. Unter Einstellungen festlegen.");
            }
            await deleteBeat(b.id, settings.archivePath);
          }}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          Angleichen — Struktur und Namen als zwei getrennte Läufe
      ═══════════════════════════════════════════════════════════════════════ */}
      {angleich && (
        <MigrateArchiveDialog
          modus={angleich}
          onClose={() => setAngleich(null)}
          onDone={refresh}
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
      description={hasFilters ? undefined : "Archiviere im Studio deinen ersten Beat."}
      action={hasFilters && (
        <Button variant="secondary" size="sm" icon={RotateCcw} onClick={onReset}>
          Filter zurücksetzen
        </Button>
      )}
    />
  );
}
