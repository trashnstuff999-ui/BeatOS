// src/hooks/useStats.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Hook for fetching live statistics from the database
// Replaces mockStats with real data
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Stats {
  total: number;
  thisMonth: number;
  favorites: number;
  avgBpm: number;
  byStatus: Record<string, number>;
  topKeys: Array<{ key: string; count: number }>;
  topTags: Array<{ tag: string; count: number }>;
  beatsPerMonth: Array<{ month: string; count: number }>;
  recentBeats: Array<{ id: string; name: string; createdDate: string }>;
  availableYears: number[];
  selectedYear: number;
}

interface UseStatsReturn {
  stats: Stats | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const DEFAULT_STATS: Stats = {
  total: 0,
  thisMonth: 0,
  favorites: 0,
  avgBpm: 0,
  byStatus: {},
  topKeys: [],
  topTags: [],
  beatsPerMonth: [],
  recentBeats: [],
  availableYears: [],
  selectedYear: new Date().getFullYear(),
};

export function useStats(): UseStatsReturn {
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Call the Rust get_stats command
      const result = await invoke<{
        total: number;
        this_month: number;
        favorites: number;
        avg_bpm: number;
        by_status: Record<string, number>;
        top_keys: Array<{ key: string; count: number }>;
        top_tags: Array<{ tag: string; count: number }>;
        beats_per_month: Array<{ month: string; count: number }>;
        recent_beats: Array<{ id: string; name: string; created_date: string }>;
        available_years: number[];
        selected_year: number;
      }>("get_stats", { year: null });
      
      // Map snake_case to camelCase
      setStats({
        total: result.total,
        thisMonth: result.this_month,
        favorites: result.favorites,
        avgBpm: result.avg_bpm,
        byStatus: result.by_status,
        topKeys: result.top_keys,
        topTags: result.top_tags,
        beatsPerMonth: result.beats_per_month,
        recentBeats: result.recent_beats.map(b => ({
          id: b.id,
          name: b.name,
          createdDate: b.created_date,
        })),
        availableYears: result.available_years,
        selectedYear: result.selected_year,
      });
    } catch (e) {
      console.error("Failed to fetch stats:", e);
      setError(String(e));
      // Use defaults on error so UI doesn't break
      setStats(DEFAULT_STATS);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    stats,
    isLoading,
    error,
    refresh: fetchStats,
  };
}

// Simple hook that just returns the total count (for Sidebar)
export function useBeatCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    invoke<number>("get_beat_count")
      .then(setCount)
      .catch(() => setCount(0));
  }, []);

  return count;
}