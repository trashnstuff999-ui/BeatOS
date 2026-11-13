import { describe, it, expect } from "vitest";
import { spitzenAus, kapitelFarbe } from "./Zeitleiste";
import { STUDIO_VERLAUF } from "../../lib/theme";

describe("Zeitleiste", () => {
  it("zeigt Lautheit: lautestes Stück 1, leises sichtbar kleiner, Stille 0", () => {
    // Drei Stücke à 4 Samples: laut, 12 dB leiser (Faktor ~0,25), still.
    const kanal = new Float32Array([0.8, -0.8, 0.8, -0.8, 0.2, -0.2, 0.2, -0.2, 0, 0, 0, 0]);
    const s = spitzenAus(kanal, 3);
    expect(s[0]).toBeCloseTo(1, 5);
    expect(s[1]).toBeGreaterThan(0.05);
    expect(s[1]).toBeLessThan(0.6);
    expect(s[2]).toBe(0);
  });
  it("färbt Abschnitte nach Namen", () => {
    expect(kapitelFarbe("Pre-Hook / Hook")).toBe(STUDIO_VERLAUF.priority.glow);
    expect(kapitelFarbe("Outro")).toBe(STUDIO_VERLAUF.idea.glow);
    expect(kapitelFarbe("Verse 2")).toBe(STUDIO_VERLAUF.exported.glow);
  });
});
