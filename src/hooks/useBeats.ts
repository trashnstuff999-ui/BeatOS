// src/hooks/useBeats.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Custom Hook for Browse Tab - ALL FILTERS ARE SERVER-SIDE
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
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

// ─── Hook Return Type ───────────────────────────────────────────────────────

interface UseBeatsReturn {
  // Data
  beats: Beat[];
  selectedBeat: Beat | null;
  
  // Loading State
  isLoading: boolean;
  error: string | null;
  
  // Filters
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  resetFilters: () => void;
  
  // Sorting
  sort: SortState;
  setSort: (column: SortColumn) => void;
  
  // Pagination
  pagination: PaginationState;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  totalPages: number;
  
  // Selection
  selectBeat: (beat: Beat | null) => void;
  
  // Actions
  refresh: () => Promise<void>;
  toggleFavorite: (beatId: string) => Promise<void>;
  updateStatus: (beatId: string, status: BeatStatus) => Promise<void>;
  updateBeat: (params: UpdateBeatParams) => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Hook Implementation
// ═══════════════════════════════════════════════════════════════════════════════

export function useBeats(): UseBeatsReturn {
  // ─── State ─────────────────────────────────────────────────────────────────
  const [beats, setBeats] = useState<Beat[]>([]);
  const [selectedBeat, setSelectedBeat] = useState<Beat | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [sort, setSortState] = useState<SortState>(DEFAULT_SORT);
  const [pagination, setPagination] = useState<PaginationState>(DEFAULT_PAGINATION);
  
  // Track previous filter values to detect changes
  const prevFiltersRef = useRef<string>("");

  // ─── Load Beats from DB (ALL FILTERS SERVER-SIDE) ──────────────────────────
  const loadBeats = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Parse BPM values
      const bpmMin = filters.bpmMin ? parseInt(filters.bpmMin) : null;
      const bpmMax = filters.bpmMax ? parseInt(filters.bpmMax) : null;
      
      // ALL filters go to server
      const result = await invoke<{ beats: Beat[]; total_count: number }>("get_beats_paginated", {
        search: filters.search || null,
        statusFilter: filters.status !== "all" ? filters.status : null,
        onlyFavs: filters.onlyFavs,
        keyFilter: filters.keys.length > 0 ? filters.keys : null,
        bpmMin: isNaN(bpmMin!) ? null : bpmMin,
        bpmMax: isNaN(bpmMax!) ? null : bpmMax,
        sortColumn: sort.column,
        sortDirection: sort.direction,
        limit: pagination.pageSize,
        offset: (pagination.page - 1) * pagination.pageSize,
      });
      
      setBeats(result.beats);
      setPagination(prev => ({ ...prev, totalCount: result.total_count }));
      
      // Update selected beat if it's in the new results
      if (selectedBeat) {
        const updated = result.beats.find(b => b.id === selectedBeat.id);
        if (updated) {
          setSelectedBeat(updated);
        }
      }
    } catch (e) {
      console.error("Failed to load beats:", e);
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, [
    filters.search, 
    filters.status, 
    filters.onlyFavs, 
    filters.keys, 
    filters.bpmMin, 
    filters.bpmMax,
    sort, 
    pagination.page, 
    pagination.pageSize,
    selectedBeat?.id
  ]);

  // Load on mount and when any filter/sort/page changes
  useEffect(() => {
    loadBeats();
  }, [loadBeats]);

  // Reset to page 1 when filters change (but not when page changes)
  useEffect(() => {
    const currentFilters = JSON.stringify({
      search: filters.search,
      status: filters.status,
      onlyFavs: filters.onlyFavs,
      keys: filters.keys,
      bpmMin: filters.bpmMin,
      bpmMax: filters.bpmMax,
    });
    
    if (prevFiltersRef.current && prevFiltersRef.current !== currentFilters) {
      setPagination(prev => ({ ...prev, page: 1 }));
    }
    
    prevFiltersRef.current = currentFilters;
  }, [filters.search, filters.status, filters.onlyFavs, filters.keys, filters.bpmMin, filters.bpmMax]);

  // ─── Total Pages ───────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(pagination.totalCount / pagination.pageSize));

  // ─── Reset Filters ─────────────────────────────────────────────────────────
  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  // ─── Set Sort ──────────────────────────────────────────────────────────────
  const setSort = useCallback((column: SortColumn) => {
    setSortState(prev => {
      if (prev.column === column) {
        // Toggle direction
        return { column, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      // New column, default to desc for ID, asc for others
      return { column, direction: column === "id" ? "desc" : "asc" };
    });
  }, []);

  // ─── Set Page ──────────────────────────────────────────────────────────────
  const setPage = useCallback((page: number) => {
    setPagination(prev => ({ ...prev, page: Math.max(1, Math.min(page, totalPages)) }));
  }, [totalPages]);

  // ─── Set Page Size ─────────────────────────────────────────────────────────
  const setPageSize = useCallback((pageSize: number) => {
    setPagination(prev => ({ ...prev, pageSize, page: 1 }));
  }, []);

  // ─── Select Beat ───────────────────────────────────────────────────────────
  const selectBeat = useCallback((beat: Beat | null) => {
    setSelectedBeat(beat);
  }, []);

  // ─── Toggle Favorite ───────────────────────────────────────────────────────
  const toggleFavorite = useCallback(async (beatId: string) => {
    const beat = beats.find(b => b.id === beatId);
    if (!beat) return;
    
    const newFavorite = beat.favorite !== 1;
    
    // Optimistic update
    setBeats(prev => prev.map(b => 
      b.id === beatId ? { ...b, favorite: newFavorite ? 1 : 0 } : b
    ));
    
    if (selectedBeat?.id === beatId) {
      setSelectedBeat(prev => prev ? { ...prev, favorite: newFavorite ? 1 : 0 } : null);
    }
    
    try {
      await invoke("toggle_favorite", { beatId, favorite: newFavorite });
    } catch (e) {
      console.error("Failed to toggle favorite:", e);
      // Revert on error
      setBeats(prev => prev.map(b => 
        b.id === beatId ? { ...b, favorite: beat.favorite } : b
      ));
      if (selectedBeat?.id === beatId) {
        setSelectedBeat(prev => prev ? { ...prev, favorite: beat.favorite } : null);
      }
    }
  }, [beats, selectedBeat?.id]);

  // ─── Update Status ─────────────────────────────────────────────────────────
  const updateStatus = useCallback(async (beatId: string, status: BeatStatus) => {
    const beat = beats.find(b => b.id === beatId);
    if (!beat) return;
    
    const oldStatus = beat.status;
    
    // Optimistic update
    setBeats(prev => prev.map(b => 
      b.id === beatId ? { ...b, status } : b
    ));
    
    if (selectedBeat?.id === beatId) {
      setSelectedBeat(prev => prev ? { ...prev, status } : null);
    }
    
    try {
      await invoke("update_beat_status", { beatId, status });
    } catch (e) {
      console.error("Failed to update status:", e);
      // Revert on error
      setBeats(prev => prev.map(b => 
        b.id === beatId ? { ...b, status: oldStatus } : b
      ));
      if (selectedBeat?.id === beatId) {
        setSelectedBeat(prev => prev ? { ...prev, status: oldStatus } : null);
      }
    }
  }, [beats, selectedBeat?.id]);

  // ─── Update Beat (Full Update from Edit Modal) ─────────────────────────────
  const updateBeat = useCallback(async (params: UpdateBeatParams) => {
    const beat = beats.find(b => b.id === params.id);
    if (!beat) return;
    
    try {
      await invoke("update_beat", { params });
      
      // Refresh to get updated data
      await loadBeats();
    } catch (e) {
      console.error("Failed to update beat:", e);
      throw e;
    }
  }, [beats, loadBeats]);

  // ─── Refresh ───────────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    await loadBeats();
  }, [loadBeats]);

  // ─── Return ────────────────────────────────────────────────────────────────
  return {
    // Data - no more client-side filtering, beats ARE the filtered beats
    beats,
    selectedBeat,
    
    // Loading State
    isLoading,
    error,
    
    // Filters
    filters,
    setFilters,
    resetFilters,
    
    // Sorting
    sort,
    setSort,
    
    // Pagination
    pagination,
    setPage,
    setPageSize,
    totalPages,
    
    // Selection
    selectBeat,
    
    // Actions
    refresh,
    toggleFavorite,
    updateStatus,
    updateBeat,
  };
}
