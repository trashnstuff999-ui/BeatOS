// src/hooks/useBeats.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Custom Hook for Browse Tab - ALL FILTERS SERVER-SIDE
// FIXED: No double-loading on filter change
// FIXED: Selection does NOT trigger reload
// FIXED: List scroll position preserved on selection
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { api } from "../lib/api";
import { convertFileSrc } from "@tauri-apps/api/core";
import type {
  Beat,
  BeatStatus,
  FilterState,
  SortState,
  SortColumn,
  PaginationState,
  UpdateBeatParams,
  UploadBadgeMap,
} from "../types/browse";
import {
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  DEFAULT_PAGINATION,
} from "../types/browse";

interface UseBeatsReturn {
  beats: Beat[];
  selectedBeat: Beat | null;
  isLoading: boolean;
  error: string | null;
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  resetFilters: () => void;
  sort: SortState;
  setSort: (column: SortColumn, direction?: "asc" | "desc") => void;
  pagination: PaginationState;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  totalPages: number;
  selectBeat: (beat: Beat | null) => void;
  refresh: () => Promise<void>;
  toggleFavorite: (beatId: string) => Promise<void>;
  updateStatus: (beatId: string, status: BeatStatus) => Promise<void>;
  updateBeat: (params: UpdateBeatParams) => Promise<void>;
  deleteBeat: (beatId: string, archiveBasePath: string) => Promise<{ folder_trashed: boolean }>;
  getCoverUrl: (beatId: string) => string | null;
  /** Cover für diese Beats vorladen — nur aufrufen, wenn sie auch gezeigt werden */
  preloadCovers: (beats: Beat[]) => void;
  /** Plattform-Badges (scheduled/uploaded) der aktuellen Seite */
  uploadBadges: UploadBadgeMap;
  /** Alle Treffer der aktuellen Filter — nicht nur die Seite (Hör-Queue, Zufall) */
  getFilteredBeats: () => Promise<Beat[]>;
  /** Wechselt, sobald ein anderes Ergebnis geladen wird (z.B. für Scroll-Reset) */
  queryKey: string;
}

// Filter/Sortierung/Seite überleben einen Tab-Wechsel — Browse wird beim
// Verlassen der Route abgeräumt, und alles neu einzustellen nervt.
const SESSION_KEY = "beatos_browse_query";

interface StoredQuery {
  filters: FilterState;
  sort: SortState;
  pageSize: number;
  page: number;
}

function loadStoredQuery(): Partial<StoredQuery> {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "{}");
  } catch {
    return {};
  }
}

/** Query-Parameter für get_beats_paginated — eine Quelle für Seite und Queue. */
function buildQuery(filters: FilterState, sort: SortState, limit: number, offset: number) {
  const bpmMin = filters.bpmMin ? parseInt(filters.bpmMin) : null;
  const bpmMax = filters.bpmMax ? parseInt(filters.bpmMax) : null;
  return {
    search: filters.search || null,
    statusFilter: filters.status !== "all" ? filters.status : null,
    onlyFavs: filters.onlyFavs,
    keyFilter: filters.keys.length > 0 ? filters.keys : null,
    bpmMin: isNaN(bpmMin!) ? null : bpmMin,
    bpmMax: isNaN(bpmMax!) ? null : bpmMax,
    sortColumn: sort.column,
    sortDirection: sort.direction,
    limit,
    offset,
    unpublishedOnly: filters.unpublishedOnly || undefined,
  };
}

/**
 * Alles, was ein Reload auslöst, in einem String. Muss JEDES Feld enthalten,
 * das in buildQuery landet — sonst wirkt ein Filter nicht (siehe unpublishedOnly).
 * Suche ist hier bereits gedebounct.
 */
export function querySignature(filters: FilterState, sort: SortState): string {
  return JSON.stringify([
    filters.search,
    filters.status,
    filters.onlyFavs,
    filters.keys,
    filters.bpmMin,
    filters.bpmMax,
    filters.unpublishedOnly,
    sort.column,
    sort.direction,
  ]);
}

export function useBeats(initialFilters?: Partial<FilterState>): UseBeatsReturn {
  // Gespeicherter Stand aus der Session; ein explizites initialFilters
  // (Drill-down vom Dashboard) sticht ihn.
  const stored = useRef(loadStoredQuery()).current;
  const restored = initialFilters ? null : stored;

  const [beats, setBeats] = useState<Beat[]>([]);
  const [selectedBeat, setSelectedBeat] = useState<Beat | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(
    { ...DEFAULT_FILTERS, ...restored?.filters, ...initialFilters }
  );
  const [sort, setSortState] = useState<SortState>(restored?.sort ?? DEFAULT_SORT);
  const [pagination, setPagination] = useState<PaginationState>({
    ...DEFAULT_PAGINATION,
    pageSize: stored.pageSize ?? DEFAULT_PAGINATION.pageSize,
    page: restored?.page ?? DEFAULT_PAGINATION.page,
  });
  const [uploadBadges, setUploadBadges] = useState<UploadBadgeMap>({});

  // Spiegel für Callbacks, die stabil bleiben müssen: toggleFavorite und
  // updateStatus gehen als Props bis in jede Zeile, und dort greift memo nur,
  // solange ihre Identität steht. Zusaetzlich liest findBeat hierueber die
  // Auswahl, die nicht mehr auf der Seite liegen muss.
  const beatsRef = useRef<Beat[]>([]);
  const selectedBeatRef = useRef<Beat | null>(null);
  useEffect(() => { beatsRef.current = beats; }, [beats]);
  useEffect(() => { selectedBeatRef.current = selectedBeat; }, [selectedBeat]);

  /**
   * Beat nachschlagen. Die Auswahl kann durch Filter- oder Seitenwechsel von
   * der aktuellen Seite gerutscht sein, während das Detail-Panel sie noch
   * zeigt — dann muss Favorit/Status trotzdem funktionieren.
   */
  const findBeat = useCallback((beatId: string): Beat | null => {
    const onPage = beatsRef.current.find(b => b.id === beatId);
    if (onPage) return onPage;
    const sel = selectedBeatRef.current;
    return sel?.id === beatId ? sel : null;
  }, []);

  // ─── Cover URL Cache (LRU) ───────────────────────────────────────────────────
  // Muss deutlich groesser als eine Seite sein (pageSize geht bis 100), sonst
  // raeumt jeder Seitenwechsel den kompletten Cache leer und laedt alles neu.
  const COVER_CACHE_MAX = 400;
  const coverCacheRef = useRef<Map<string, string>>(new Map());

  // Der Cache liegt in einer Ref, damit preloadCovers stabil bleibt und den
  // aktuellen Stand lesen kann. Preis dafür: ein Zähler, der nach einer Ladung
  // einmal neu rendert, sonst kämen die Cover im Grid nie an.
  const [, setCoverVersion] = useState(0);

  const preloadCovers = useCallback(async (beatsToLoad: Beat[]) => {
    // No has_artwork gate: the DB flag can be stale for old beats, the
    // filesystem scan in get_beat_cover_path is the source of truth.
    const cache = coverCacheRef.current;
    const uncached = beatsToLoad.filter(b => b.path && !cache.has(b.id));
    if (uncached.length === 0) return;
    await Promise.allSettled(
      uncached.map(async (beat) => {
        try {
          const coverPath = await api.audio.getCoverPath(beat.path!);
          if (cache.size >= COVER_CACHE_MAX) cache.delete(cache.keys().next().value!); // ältesten raus
          // "" = geprüft, kein Cover da. Verhindert, dass wir es erneut suchen.
          cache.set(beat.id, coverPath ? convertFileSrc(coverPath.replace(/\\/g, "/")) : "");
        } catch { /* ignore individual failures */ }
      })
    );
    setCoverVersion(v => v + 1);
  }, []);

  const getCoverUrl = useCallback(
    (beatId: string): string | null => coverCacheRef.current.get(beatId) || null,
    [],
  );

  // ─── Getippte Felder debouncen (300ms) ───────────────────────────────────────
  // Suche UND BPM: "140" tippen loeste sonst drei komplette Abfragen aus.
  const [typed, setTyped] = useState({
    search: filters.search, bpmMin: filters.bpmMin, bpmMax: filters.bpmMax,
  });
  useEffect(() => {
    const t = setTimeout(
      () => setTyped({ search: filters.search, bpmMin: filters.bpmMin, bpmMax: filters.bpmMax }),
      300,
    );
    return () => clearTimeout(t);
  }, [filters.search, filters.bpmMin, filters.bpmMax]);

  // Getipptes ist gedebounct, Klick-Filter (Status, Keys, Toggles) greifen sofort.
  const effectiveFilters = useMemo(() => ({ ...filters, ...typed }), [filters, typed]);
  const sig = querySignature(effectiveFilters, sort);

  // Signatur der zuletzt geladenen Abfrage — erkennt, wann auf Seite 1 zurück.
  const prevSigRef = useRef<string | null>(null);
  const loadIdRef = useRef(0); // Prevent stale responses

  // Argumente des letzten Ladevorgangs, damit refresh()/updateBeat() exakt
  // dieselbe Abfrage wiederholen (und nicht die ungedebouncte Suche benutzen).
  const lastLoadRef = useRef<{
    filters: FilterState; sort: SortState; page: number; pageSize: number;
  } | null>(null);

  // Volle Trefferliste (Hör-Queue), gültig für genau eine Abfrage-Signatur.
  const queueCacheRef = useRef<{ sig: string; beats: Beat[] } | null>(null);

  // Platform badges for the visible page (scheduled/uploaded per beat)
  const loadUploadBadges = useCallback(async (beatIds: string[], loadId: number) => {
    try {
      const badges = await api.beats.getUploadBadges(beatIds);
      if (loadId !== loadIdRef.current) return;
      const map: UploadBadgeMap = {};
      for (const b of badges) {
        (map[b.beat_id] ??= []).push(b);
      }
      setUploadBadges(map);
    } catch { /* badges sind nice-to-have */ }
  }, []);

  // ─── Load Beats (internal, called by effect) ─────────────────────────────────
  const loadBeatsInternal = useCallback(async (
    currentFilters: FilterState,
    currentSort: SortState,
    currentPage: number,
    currentPageSize: number,
  ) => {
    const loadId = ++loadIdRef.current;
    lastLoadRef.current = {
      filters: currentFilters, sort: currentSort,
      page: currentPage, pageSize: currentPageSize,
    };
    setIsLoading(true);
    setError(null);

    try {
      const result = await api.beats.getPaginated(
        buildQuery(currentFilters, currentSort, currentPageSize, (currentPage - 1) * currentPageSize)
      );

      // Ignore stale responses
      if (loadId !== loadIdRef.current) return;

      setBeats(result.beats);
      setPagination(prev => ({ ...prev, totalCount: result.total_count }));
      // Auswahl auf den frischen Datensatz ziehen — sonst zeigt das Detail-Panel
      // nach dem Bearbeiten weiter die alten Werte. Fällt der Beat aus dem
      // Ergebnis, bleibt die alte Kopie stehen statt das Panel zuzuschlagen.
      setSelectedBeat(prev => (prev ? result.beats.find(b => b.id === prev.id) ?? prev : prev));
      // Kein Cover-Preload hier: in der Tabelle wird kein Cover gezeigt, das
      // waeren bis zu 100 Verzeichnis-Scans fuer nichts. Das Grid ruft
      // preloadCovers selbst auf.
      loadUploadBadges(result.beats.map(b => b.id), loadId);
    } catch (e) {
      if (loadId !== loadIdRef.current) return;
      console.error("Failed to load beats:", e);
      setError(String(e));
    } finally {
      if (loadId === loadIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // ─── Single Effect for Loading ───────────────────────────────────────────────
  // Hängt nur an `sig` — jede Abfrage-Änderung ändert die Signatur, aber ein
  // bloßer Identitätswechsel von `filters` (jeder Tastendruck in der Suche)
  // nicht. Sonst würde der Debounce nichts bringen.
  useEffect(() => {
    // Sortierung zählt mit: sonst bleibt man auf Seite 7 der neuen Reihenfolge.
    const queryChanged = prevSigRef.current !== null && prevSigRef.current !== sig;
    prevSigRef.current = sig;

    if (queryChanged && pagination.page !== 1) {
      setPagination(prev => ({ ...prev, page: 1 }));
      return; // der Page-Wechsel triggert diesen Effect gleich erneut
    }

    loadBeatsInternal(effectiveFilters, sort, pagination.page, pagination.pageSize);
  }, [sig, pagination.page, pagination.pageSize, loadBeatsInternal]);

  // Stand für den nächsten Tab-Wechsel sichern (Beats selbst nicht — die sind
  // beim Zurückkommen sowieso frisch zu holen).
  useEffect(() => {
    const query: StoredQuery = {
      filters: effectiveFilters, sort,
      page: pagination.page, pageSize: pagination.pageSize,
    };
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(query)); } catch { /* voll o.ä. */ }
  }, [sig, pagination.page, pagination.pageSize]);

  const totalPages = Math.max(1, Math.ceil(pagination.totalCount / pagination.pageSize));

  const resetFilters = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  /** Ohne `direction`: Klick auf denselben Tabellenkopf dreht die Richtung um.
   *  Mit `direction`: die Auswahl im Browse-Raster setzt beides direkt, denn
   *  dort steht „Neueste zuerst" und „Älteste zuerst" als je eigener Eintrag. */
  const setSort = useCallback((column: SortColumn, direction?: "asc" | "desc") => {
    setSortState(prev => ({
      column,
      direction: direction ?? (prev.column === column
        ? (prev.direction === "asc" ? "desc" : "asc")
        : (column === "id" ? "desc" : "asc")),
    }));
  }, []);

  const setPage = useCallback((page: number) => {
    setPagination(prev => ({ ...prev, page: Math.max(1, Math.min(page, totalPages)) }));
  }, [totalPages]);

  const setPageSize = useCallback((pageSize: number) => {
    setPagination(prev => ({ ...prev, pageSize, page: 1 }));
  }, []);

  // Select beat - NO RELOAD!
  const selectBeat = useCallback((beat: Beat | null) => {
    setSelectedBeat(beat);
  }, []);

  // ─── Volle Trefferliste für Hör-Queue und Zufall ───────────────────────────
  // Die Seite ist die falsche Grundlage: Skip am Seitenende sprang sonst zurück
  // auf Beat 1 statt auf Seite 2, und "Zufall" zog aus 50 statt aus allen.
  // Wird erst beim ersten Abspielen geholt und pro Filter einmal behalten.
  const getFilteredBeats = useCallback(async (): Promise<Beat[]> => {
    if (queueCacheRef.current?.sig === sig) return queueCacheRef.current.beats;
    try {
      // ponytail: holt alle Treffer auf einmal (LIMIT -1 = kein Limit in SQLite).
      // Bei ~10k Beats unkritisch; wird die Bibliothek deutlich groesser, hier
      // auf ein schlankes id+path-Command umstellen.
      const result = await api.beats.getPaginated(buildQuery(effectiveFilters, sort, -1, 0));
      queueCacheRef.current = { sig, beats: result.beats };
      return result.beats;
    } catch (e) {
      console.error("Failed to load queue:", e);
      return beatsRef.current; // Fallback: wenigstens die aktuelle Seite
    }
  }, [sig]); // effectiveFilters/sort sind durch sig abgedeckt

  /** Optimistisches Feld-Update auf Liste UND Auswahl in einem Rutsch. */
  const patchBeat = useCallback((beatId: string, patch: Partial<Beat>) => {
    setBeats(prev => prev.map(b => (b.id === beatId ? { ...b, ...patch } : b)));
    setSelectedBeat(prev => (prev?.id === beatId ? { ...prev, ...patch } : prev));
  }, []);

  // ─── Toggle Favorite (Optimistic) ──────────────────────────────────────────
  const toggleFavorite = useCallback(async (beatId: string) => {
    const beat = findBeat(beatId);
    if (!beat) return;

    const newFavorite = beat.favorite !== 1;
    patchBeat(beatId, { favorite: newFavorite ? 1 : 0 });

    try {
      await api.beats.toggleFavorite(beatId, newFavorite);
      queueCacheRef.current = null;
    } catch (e) {
      patchBeat(beatId, { favorite: beat.favorite }); // Revert
      console.error("Failed to toggle favorite:", e);
    }
  }, [findBeat, patchBeat]); // stable — reads state via refs at call-time

  // ─── Update Status (Optimistic) ────────────────────────────────────────────
  const updateStatus = useCallback(async (beatId: string, status: BeatStatus) => {
    const beat = findBeat(beatId);
    if (!beat) return;

    const oldStatus = beat.status;
    patchBeat(beatId, { status });

    try {
      await api.beats.updateStatus(beatId, status);
      queueCacheRef.current = null;
    } catch (e) {
      patchBeat(beatId, { status: oldStatus }); // Revert
      console.error("Failed to update status:", e);
    }
  }, [findBeat, patchBeat]); // stable — reads state via refs at call-time

  // ─── Reload: wiederholt exakt die letzte Abfrage ───────────────────────────
  // Nicht `filters` neu bauen — dessen `search` ist ungedebounct und würde ein
  // anderes Ergebnis laden als das, was gerade auf dem Schirm steht.
  const reload = useCallback(async () => {
    const last = lastLoadRef.current;
    if (!last) return;
    // Der Refresh-Knopf ist auch die Handbremse für veraltete Cover: der Cache
    // merkt von sich aus nicht, wenn sich ein Artwork auf der Platte ändert.
    coverCacheRef.current.clear();
    await loadBeatsInternal(last.filters, last.sort, last.page, last.pageSize);
  }, [loadBeatsInternal]);

  // ─── Update Beat (Full) ────────────────────────────────────────────────────
  const updateBeat = useCallback(async (params: UpdateBeatParams) => {
    try {
      await api.beats.update(params);
    } catch (e) {
      console.error("[useBeats] Failed to update beat:", e);
      return;
    }
    queueCacheRef.current = null;
    await reload();
  }, [reload]);

  // ─── Delete Beat (folder -> recycle bin, then DB row) ──────────────────────
  const deleteBeat = useCallback(async (beatId: string, archiveBasePath: string) => {
    const result = await api.beats.delete(beatId, archiveBasePath);
    setBeats(prev => prev.filter(b => b.id !== beatId));
    setSelectedBeat(prev => (prev?.id === beatId ? null : prev));
    setPagination(prev => ({ ...prev, totalCount: Math.max(0, prev.totalCount - 1) }));
    queueCacheRef.current = null;
    return result;
  }, []);

  return {
    beats,
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
    refresh: reload,
    toggleFavorite,
    updateStatus,
    updateBeat,
    deleteBeat,
    getCoverUrl,
    preloadCovers,
    uploadBadges,
    getFilteredBeats,
    queryKey: sig,
  };
}