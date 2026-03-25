// src/hooks/useBeats.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Custom Hook for Browse Tab - ALL FILTERS SERVER-SIDE
// FIXED: No double-loading on filter change
// FIXED: Selection does NOT trigger reload
// FIXED: List scroll position preserved on selection
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import type {
  Beat,
  BeatStatus,
  FilterState,
  SortState,
  SortColumn,
  PaginationState,
  UpdateBeatParams,
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
  setSort: (column: SortColumn) => void;
  pagination: PaginationState;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  totalPages: number;
  selectBeat: (beat: Beat | null) => void;
  refresh: () => Promise<void>;
  toggleFavorite: (beatId: string) => Promise<void>;
  updateStatus: (beatId: string, status: BeatStatus) => Promise<void>;
  updateBeat: (params: UpdateBeatParams) => Promise<void>;
  getCoverUrl: (beatId: string) => string | null;
}

export function useBeats(initialFilters?: Partial<FilterState>): UseBeatsReturn {
  const [beats, setBeats] = useState<Beat[]>([]);
  const [selectedBeat, setSelectedBeat] = useState<Beat | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({ ...DEFAULT_FILTERS, ...initialFilters });
  const [sort, setSortState] = useState<SortState>(DEFAULT_SORT);
  const [pagination, setPagination] = useState<PaginationState>(DEFAULT_PAGINATION);

  // Refs mirror state for use in callbacks without being deps
  // (avoids recreating toggleFavorite/updateStatus on every beats/selection change)
  const beatsRef = useRef<Beat[]>([]);
  const selectedBeatIdRef = useRef<string | null>(null);
  useEffect(() => { beatsRef.current = beats; }, [beats]);
  useEffect(() => { selectedBeatIdRef.current = selectedBeat?.id ?? null; }, [selectedBeat]);

  // ─── Cover URL Cache ──────────────────────────────────────────────────────────
  // Preloads cover URLs for visible beats so DetailPanel shows them instantly
  const coverCacheRef = useRef<Map<string, string>>(new Map());

  const preloadCovers = useCallback(async (beatsToLoad: Beat[]) => {
    // Only fetch uncached beats that have a path and artwork
    const uncached = beatsToLoad.filter(b => b.path && b.has_artwork === 1 && !coverCacheRef.current.has(b.id));
    if (uncached.length === 0) return;
    await Promise.allSettled(
      uncached.map(async (beat) => {
        try {
          const coverPath = await invoke<string | null>("get_beat_cover_path", { beatPath: beat.path });
          coverCacheRef.current.set(beat.id, coverPath ? convertFileSrc(coverPath.replace(/\\/g, "/")) : "");
        } catch { /* ignore individual failures */ }
      })
    );
  }, []);

  const getCoverUrl = useCallback((beatId: string): string | null => {
    const cached = coverCacheRef.current.get(beatId);
    return cached ? cached : null; // "" (no cover) and undefined (not loaded yet) both return null
  }, []);

  // Track filter changes to detect when we need to reset page
  const prevFiltersRef = useRef<string>(JSON.stringify(DEFAULT_FILTERS));
  const loadIdRef = useRef(0); // Prevent stale responses

  // ─── Load Beats (internal, called by effect) ─────────────────────────────────
  const loadBeatsInternal = useCallback(async (
    currentFilters: FilterState,
    currentSort: SortState,
    currentPage: number,
    currentPageSize: number,
  ) => {
    const loadId = ++loadIdRef.current;
    setIsLoading(true);
    setError(null);
    
    try {
      const bpmMin = currentFilters.bpmMin ? parseInt(currentFilters.bpmMin) : null;
      const bpmMax = currentFilters.bpmMax ? parseInt(currentFilters.bpmMax) : null;
      
      const result = await invoke<{ beats: Beat[]; total_count: number }>("get_beats_paginated", {
        search: currentFilters.search || null,
        statusFilter: currentFilters.status !== "all" ? currentFilters.status : null,
        onlyFavs: currentFilters.onlyFavs,
        keyFilter: currentFilters.keys.length > 0 ? currentFilters.keys : null,
        bpmMin: isNaN(bpmMin!) ? null : bpmMin,
        bpmMax: isNaN(bpmMax!) ? null : bpmMax,
        sortColumn: currentSort.column,
        sortDirection: currentSort.direction,
        limit: currentPageSize,
        offset: (currentPage - 1) * currentPageSize,
      });
      
      // Ignore stale responses
      if (loadId !== loadIdRef.current) return;
      
      setBeats(result.beats);
      setPagination(prev => ({ ...prev, totalCount: result.total_count }));
      preloadCovers(result.beats);
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
  // Combines filter-change detection + page reset + loading into ONE effect
  useEffect(() => {
    const currentFiltersJson = JSON.stringify({
      search: filters.search,
      status: filters.status,
      onlyFavs: filters.onlyFavs,
      keys: filters.keys,
      bpmMin: filters.bpmMin,
      bpmMax: filters.bpmMax,
    });
    
    const filtersChanged = prevFiltersRef.current !== currentFiltersJson;
    prevFiltersRef.current = currentFiltersJson;
    
    // If filters changed and we're not on page 1, reset to page 1
    // This will trigger another run of this effect with page=1
    if (filtersChanged && pagination.page !== 1) {
      setPagination(prev => ({ ...prev, page: 1 }));
      return; // Don't load yet - wait for page reset to trigger next effect run
    }
    
    // Load with current state
    loadBeatsInternal(filters, sort, pagination.page, pagination.pageSize);
  }, [
    filters.search,
    filters.status,
    filters.onlyFavs,
    filters.keys,
    filters.bpmMin,
    filters.bpmMax,
    sort.column,
    sort.direction,
    pagination.page,
    pagination.pageSize,
    loadBeatsInternal,
  ]);

  const totalPages = Math.max(1, Math.ceil(pagination.totalCount / pagination.pageSize));

  const resetFilters = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  const setSort = useCallback((column: SortColumn) => {
    setSortState(prev => ({
      column,
      direction: prev.column === column 
        ? (prev.direction === "asc" ? "desc" : "asc")
        : (column === "id" ? "desc" : "asc")
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

  // ─── Toggle Favorite (Optimistic) ──────────────────────────────────────────
  const toggleFavorite = useCallback(async (beatId: string) => {
    // Use ref to avoid `beats` as dep (would recreate on every page/filter change)
    const beat = beatsRef.current.find(b => b.id === beatId);
    if (!beat) return;

    const newFavorite = beat.favorite !== 1;

    // Optimistic update
    setBeats(prev => prev.map(b =>
      b.id === beatId ? { ...b, favorite: newFavorite ? 1 : 0 } : b
    ));
    if (selectedBeatIdRef.current === beatId) {
      setSelectedBeat(prev => prev ? { ...prev, favorite: newFavorite ? 1 : 0 } : null);
    }

    try {
      await invoke("toggle_favorite", { beatId, favorite: newFavorite });
    } catch (e) {
      // Revert on error
      setBeats(prev => prev.map(b =>
        b.id === beatId ? { ...b, favorite: beat.favorite } : b
      ));
      if (selectedBeatIdRef.current === beatId) {
        setSelectedBeat(prev => prev ? { ...prev, favorite: beat.favorite } : null);
      }
      console.error("Failed to toggle favorite:", e);
    }
  }, []); // stable — reads state via refs at call-time

  // ─── Update Status (Optimistic) ────────────────────────────────────────────
  const updateStatus = useCallback(async (beatId: string, status: BeatStatus) => {
    // Use ref to avoid `beats` as dep
    const beat = beatsRef.current.find(b => b.id === beatId);
    if (!beat) return;

    const oldStatus = beat.status;

    // Optimistic update
    setBeats(prev => prev.map(b =>
      b.id === beatId ? { ...b, status } : b
    ));
    if (selectedBeatIdRef.current === beatId) {
      setSelectedBeat(prev => prev ? { ...prev, status } : null);
    }

    try {
      await invoke("update_beat_status", { beatId, status });
    } catch (e) {
      // Revert on error
      setBeats(prev => prev.map(b =>
        b.id === beatId ? { ...b, status: oldStatus } : b
      ));
      if (selectedBeatIdRef.current === beatId) {
        setSelectedBeat(prev => prev ? { ...prev, status: oldStatus } : null);
      }
      console.error("Failed to update status:", e);
    }
  }, []); // stable — reads state via refs at call-time

  // ─── Update Beat (Full) ────────────────────────────────────────────────────
  const updateBeat = useCallback(async (params: UpdateBeatParams) => {
    await invoke("update_beat", { params });
    // Reload to get fresh data
    loadBeatsInternal(filters, sort, pagination.page, pagination.pageSize);
  }, [filters, sort, pagination.page, pagination.pageSize, loadBeatsInternal]);

  // ─── Manual Refresh ────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    await loadBeatsInternal(filters, sort, pagination.page, pagination.pageSize);
  }, [filters, sort, pagination.page, pagination.pageSize, loadBeatsInternal]);

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
    refresh,
    toggleFavorite,
    updateStatus,
    updateBeat,
    getCoverUrl,
  };
}