// src/hooks/useStats.test.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Tests for useStats and useBeatCount hooks
// ═══════════════════════════════════════════════════════════════════════════════

import { renderHook, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useStats, useBeatCount } from "./useStats";

const mockInvoke = vi.mocked(invoke);

const MOCK_STATS_RESPONSE = {
  total: 42,
  this_month: 5,
  favorites: 7,
  avg_bpm: 140.5,
  by_status: { idea: 10, wip: 8, finished: 20, sold: 4 },
  top_keys: [{ key: "Am", count: 12 }, { key: "Cm", count: 8 }],
  top_tags: [{ tag: "trap", count: 15 }],
  beats_per_month: [{ month: "2026-01", count: 3 }],
  recent_beats: [{ id: "BOS-001", name: "Dark Vibes", created_date: "2026-01-15" }],
  available_years: [2025, 2026],
  selected_year: 2026,
};

describe("useStats", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it("loads stats from backend and maps snake_case to camelCase", async () => {
    mockInvoke.mockResolvedValueOnce(MOCK_STATS_RESPONSE);

    const { result } = renderHook(() => useStats());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.stats).toMatchObject({
      total: 42,
      thisMonth: 5,
      favorites: 7,
      avgBpm: 140.5,
      byStatus: { idea: 10, wip: 8, finished: 20, sold: 4 },
      topKeys: [{ key: "Am", count: 12 }, { key: "Cm", count: 8 }],
      recentBeats: [{ id: "BOS-001", name: "Dark Vibes", createdDate: "2026-01-15" }],
    });
  });

  it("falls back to default stats on backend error", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("DB connection failed"));

    const { result } = renderHook(() => useStats());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).not.toBeNull();
    expect(result.current.stats).toMatchObject({
      total: 0,
      thisMonth: 0,
      favorites: 0,
    });
  });

  it("calls get_stats with year: null", async () => {
    mockInvoke.mockResolvedValueOnce(MOCK_STATS_RESPONSE);

    renderHook(() => useStats());

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("get_stats", { year: null }));
  });
});

describe("useBeatCount", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it("returns beat count from backend", async () => {
    mockInvoke.mockResolvedValueOnce(99);

    const { result } = renderHook(() => useBeatCount());

    await waitFor(() => expect(result.current).toBe(99));
    expect(mockInvoke).toHaveBeenCalledWith("get_beat_count");
  });

  it("returns 0 on backend error", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("offline"));

    const { result } = renderHook(() => useBeatCount());

    await waitFor(() => expect(result.current).toBe(0));
  });
});
