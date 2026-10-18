import { describe, it, expect } from "vitest";
import { heatmap, tonart, zirkel, durchlauf, wachstum } from "./statistik";

describe("Heatmap", () => {
  // So 18.10.2026
  const zellen = heatmap([["2026-10-12", 1], ["2026-09-28", 2]], new Date(2026, 9, 18));
  it("hat 52 volle Wochen ab einem Montag und endet am Sonntag dieser Woche", () => {
    expect(zellen).toHaveLength(364);
    expect(new Date(`${zellen[0].iso}T12:00:00`).getDay()).toBe(1);
    expect(zellen[363].iso).toBe("2026-10-18");
    expect(zellen.find(z => z.iso === "2026-09-28")?.anzahl).toBe(2);
  });
  it("markiert Tage nach heute als Zukunft", () => {
    const mi = heatmap([], new Date(2026, 9, 14));
    expect(mi[363].zukunft).toBe(true);
    expect(mi.find(z => z.iso === "2026-10-14")?.zukunft).toBe(false);
  });
});

describe("Tonarten", () => {
  it("liest Schreibweisen einheitlich", () => {
    expect(tonart("F#m")).toEqual({ grund: "F#", moll: true });
    expect(tonart("Emin")).toEqual({ grund: "E", moll: true });
    expect(tonart("Bb")).toEqual({ grund: "A#", moll: false });
    expect(tonart("No Key No")).toBeNull();
  });
  it("legt sie in den Zirkel und zählt den Rest", () => {
    const z = zirkel([{ key: "Am", count: 34 }, { key: "Em", count: 17 }, { key: "Emin", count: 1 }, { key: "C", count: 1 }, { key: "NoKey", count: 1 }]);
    expect(z.moll[0]).toBe(34);
    expect(z.moll[1]).toBe(18);
    expect(z.dur[0]).toBe(1);
    expect(z.ohne).toBe(1);
  });
});

it("Durchlaufzeit: Median und Stufen", () => {
  const d = durchlauf([0, 1, 4, 9, 33, 200]);
  expect(d.median).toBe(6.5);
  expect(d.stufen.map(s => s.anzahl)).toEqual([2, 1, 1, 1, 1]);
  expect(durchlauf([]).median).toBeNull();
});

it("Wachstum füllt Monatslücken und summiert", () => {
  expect(wachstum([["2025-11", 2], ["2026-02", 3]])).toEqual([
    { monat: "2025-11", neu: 2, summe: 2 },
    { monat: "2025-12", neu: 0, summe: 2 },
    { monat: "2026-01", neu: 0, summe: 2 },
    { monat: "2026-02", neu: 3, summe: 5 },
  ]);
});
