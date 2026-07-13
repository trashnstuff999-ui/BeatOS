// src/hooks/useStats.test.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Tests for useBeatCount hook
// ═══════════════════════════════════════════════════════════════════════════════

import { renderHook, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useBeatCount } from "./useStats";

const mockInvoke = vi.mocked(invoke);

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
