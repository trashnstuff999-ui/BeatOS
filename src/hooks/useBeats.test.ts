// src/hooks/useBeats.test.ts
// Die Abfrage-Signatur entscheidet, ob ein Filter überhaupt ein Reload auslöst
// und ob auf Seite 1 zurückgesprungen wird. Fehlte dort ein Feld, war der
// Filter still wirkungslos (so passiert mit `unpublishedOnly`).

import { describe, it, expect } from "vitest";
import { querySignature } from "./useBeats";
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
