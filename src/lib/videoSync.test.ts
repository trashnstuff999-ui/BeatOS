import { describe, it, expect } from "vitest";
import { abgleich } from "./videoSync";

describe("abgleich", () => {
  it("großer Abstand beim Laufen: springt etwas voraus", () => {
    const k = abgleich(0, 84, 167, true);
    expect(k.ziel).toBeCloseTo(84.08);
    expect(k.laufen).toBe(true);
  });

  it("kleiner Abstand: holt über die Geschwindigkeit auf, ohne Sprung", () => {
    const vorn = abgleich(10.1, 10, 167, true);
    expect(vorn.ziel).toBeNull();
    expect(vorn.rate).toBeLessThan(1);
    expect(abgleich(9.9, 10, 167, true).rate).toBeGreaterThan(1);
    expect(abgleich(9, 9.2, 167, true).rate).toBe(1.05);   // gedeckelt
  });

  it("synchron: normale Geschwindigkeit", () => {
    expect(abgleich(10.01, 10, 167, true)).toEqual({ ziel: null, rate: 1, laufen: true });
  });

  it("im Stand sitzt das Bild genau auf dem Ton", () => {
    expect(abgleich(10, 10.1, 167, false)).toEqual({ ziel: 10.1, rate: 1, laufen: false });
    expect(abgleich(10, 10.01, 167, false).ziel).toBeNull();
  });

  it("Ton länger als das Video: letztes Bild bleibt stehen", () => {
    expect(abgleich(120, 130, 120, true)).toEqual({ ziel: null, rate: 1, laufen: false });
  });
});

describe("abgleich nach einem langsamen Sprung", () => {
  it("springt nicht erneut, solange das Video nur um den Vorlauf vorn liegt", () => {
    // Sprung dauert 0,6 s → Vorlauf 0,63; direkt danach liegt das Video 0,3 s vorn
    expect(abgleich(10.3, 10, 167, true, 0.63).ziel).toBeNull();
    // hinten liegen heißt weiterhin springen — mit dem gemessenen Vorlauf
    expect(abgleich(9, 10, 167, true, 0.63).ziel).toBeCloseTo(10.63);
  });
});
