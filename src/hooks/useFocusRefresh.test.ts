// src/hooks/useFocusRefresh.test.ts

import { renderHook } from "@testing-library/react";
import { useFocusRefresh } from "./useFocusRefresh";

const focus = () => window.dispatchEvent(new Event("focus"));

describe("useFocusRefresh", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("drosselt: erst nach minMs wieder", () => {
    const fn = vi.fn();
    renderHook(() => useFocusRefresh(fn, 10_000));

    focus();                        // direkt nach Mount → zu früh
    expect(fn).toHaveBeenCalledTimes(0);

    vi.advanceTimersByTime(10_001);
    focus();
    expect(fn).toHaveBeenCalledTimes(1);

    focus();                        // sofort nochmal → gedrosselt
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(10_001);
    focus();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("hängt nach dem Unmount nicht mehr am Fenster", () => {
    const fn = vi.fn();
    const { unmount } = renderHook(() => useFocusRefresh(fn, 0));
    unmount();
    focus();
    expect(fn).not.toHaveBeenCalled();
  });
});
