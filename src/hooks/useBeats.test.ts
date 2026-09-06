// src/hooks/useBeats.test.ts
// Die Abfrage-Signatur entscheidet, ob ein Filter überhaupt ein Reload auslöst
// und ob auf Seite 1 zurückgesprungen wird. Fehlte dort ein Feld, war der
// Filter still wirkungslos (so passiert mit `unpublishedOnly`).

import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { querySignature, useBeats } from "./useBeats";
import { DEFAULT_FILTERS, DEFAULT_SORT } from "../types/browse";
import type { FilterState } from "../types/browse";

/**
 * Pro Filter-Feld ein abweichender Wert. Der Record-Typ erzwingt Vollständigkeit:
 * ein neues Feld in FilterState lässt tsc hier fehlschlagen, bevor es still
 * wirkungslos in der UI landen kann.
 */
const CHANGED: Record<keyof FilterState, Partial<FilterState>> = {
  search: { search: "trap" },
  status: { status: "wip" },
  keys: { keys: ["Cm"] },
  bpmMin: { bpmMin: "120" },
  bpmMax: { bpmMax: "160" },
  onlyFavs: { onlyFavs: true },
  unpublishedOnly: { unpublishedOnly: true },
};

const base = querySignature(DEFAULT_FILTERS, DEFAULT_SORT);

describe("querySignature", () => {
  it.each(Object.keys(CHANGED) as (keyof FilterState)[])(
    "ändert sich, wenn %s sich ändert",
    (field) => {
      const changed = querySignature({ ...DEFAULT_FILTERS, ...CHANGED[field] }, DEFAULT_SORT);
      expect(changed).not.toBe(base);
    },
  );

  it("ändert sich bei Sortierspalte und -richtung", () => {
    expect(querySignature(DEFAULT_FILTERS, { ...DEFAULT_SORT, column: "name" })).not.toBe(base);
    expect(querySignature(DEFAULT_FILTERS, { ...DEFAULT_SORT, direction: "asc" })).not.toBe(base);
  });

  it("bleibt gleich bei identischen Werten aus einem neuen Objekt", () => {
    expect(querySignature({ ...DEFAULT_FILTERS, keys: [] }, { ...DEFAULT_SORT })).toBe(base);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Ein Klick auf „hochgeladen" im Side-Panel darf nicht das ganze Raster neu
// laden. `refresh` (der Aktualisieren-Knopf) leert absichtlich den Cover-Cache
// — daran gehängt flackerte bei jeder Statusänderung jedes Cover.
// ─────────────────────────────────────────────────────────────────────────────

describe("refreshUploadBadges", () => {
  it("holt nur die Badges, ohne die Beats neu zu laden", async () => {
    const mockInvoke = vi.mocked(invoke);
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_beats_paginated") {
        return { beats: [{ id: "0842", name: "NUR HEUTE" }], total_count: 1 };
      }
      if (cmd === "get_upload_badges") return [];
      return undefined;
    });

    const { result } = renderHook(() => useBeats());
    await waitFor(() => expect(result.current.beats).toHaveLength(1));

    mockInvoke.mockClear();
    await act(async () => { await result.current.refreshUploadBadges(); });

    expect(mockInvoke).toHaveBeenCalledWith("get_upload_badges", { beatIds: ["0842"] });
    expect(mockInvoke).not.toHaveBeenCalledWith("get_beats_paginated", expect.anything());
  });
});
