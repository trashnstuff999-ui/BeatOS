import { describe, it, expect } from "vitest";
import { parseRhythmus, wochenstand, naechsterFreierTag } from "./planung";

// Freitag, 16.10.2026
const HEUTE = new Date(2026, 9, 16);
const MO_MI_FR = [1, 3, 5];

describe("Upload-Rhythmus", () => {
  it("liest die Wochentage", () => {
    expect(parseRhythmus("5,1, 3")).toEqual([1, 3, 5]);
    expect(parseRhythmus("")).toEqual([]);
    expect(parseRhythmus("9,x,2")).toEqual([2]);
  });

  it("zählt die Woche Mo–So und nennt, was ab heute noch offen ist", () => {
    // Mo 12. belegt, Mi 14. leer (vorbei), Fr 16. leer (heute)
    const s = wochenstand(MO_MI_FR, new Set(["2026-10-12"]), HEUTE);
    expect(s).toEqual({ soll: 3, geplant: 1, offen: ["2026-10-16"] });
  });

  it("schlägt den nächsten freien Rhythmus-Tag vor", () => {
    expect(naechsterFreierTag(MO_MI_FR, new Set(), HEUTE)).toBe("2026-10-16");
    expect(naechsterFreierTag(MO_MI_FR, new Set(["2026-10-16"]), HEUTE)).toBe("2026-10-19");
    expect(naechsterFreierTag([], new Set(), HEUTE)).toBeNull();
  });
});
