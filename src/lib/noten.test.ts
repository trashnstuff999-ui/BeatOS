import { describe, it, expect } from "vitest";
import { akkorde, inTonart, laengeText, notenName, passtTempo, passtTonart, tonartPlus, type Note } from "./noten";

// 96 Ticks je Viertel, ein Takt = 384
const dreiklang = (takt: number, ...toene: number[]): Note[] => toene.map(t => [takt * 384, 384, t]);

describe("noten", () => {
  it("nennt Töne wie FL und versetzt Tonarten", () => {
    expect(notenName(60)).toBe("C5");
    expect(notenName(66)).toBe("F#5");
    expect(tonartPlus("F#min", 3)).toBe("Amin");
    expect(tonartPlus("Bbm", -2)).toBe("G#m");
    expect(tonartPlus("???", 2)).toBe("???");
  });

  it("prüft Töne gegen die Tonleiter", () => {
    expect(inTonart(66, "F#min")).toBe(true);  // F#
    expect(inTonart(69, "F#min")).toBe(true);  // A
    expect(inTonart(70, "F#min")).toBe(false); // A#
    expect(inTonart(70, "F#maj")).toBe(true);
    expect(inTonart(70, null)).toBe(true);
  });

  it("findet passende Tonarten und Tempi", () => {
    expect(passtTonart("F#min", "f#m")).toBe(true);
    expect(passtTonart("F#min", "A")).toBe(true);    // Paralleltonart
    expect(passtTonart("F#min", "F#")).toBe(false);
    expect(passtTonart("F#min", "")).toBe(false);
    expect(passtTempo(150, 75)).toBe(true);
    expect(passtTempo(70, 140)).toBe(true);
    expect(passtTempo(150, 145)).toBe(false);
  });

  it("schreibt Längen als Notenwert", () => {
    expect(laengeText(96, 96)).toBe("1/4");
    expect(laengeText(144, 96)).toBe("3/8");
    expect(laengeText(768, 96)).toBe("2 Takte");
  });

  it("erkennt auch reiche Akkorde, Umkehrungen und Wechsel zur Taktmitte", () => {
    const halb = (takt: number, zweite: boolean, ...toene: number[]): Note[] =>
      toene.map(t => [takt * 384 + (zweite ? 192 : 0), 192, t]);
    const noten: Note[] = [
      ...dreiklang(0, 60, 62, 64, 67),      // C D E G
      ...dreiklang(1, 60, 64, 67, 69),      // C E G A über C
      ...dreiklang(2, 57, 60, 64, 67),      // dieselben Töne über A
      ...dreiklang(3, 60, 63, 66, 69),      // C Eb Gb A
      ...dreiklang(4, 60, 64, 70),          // C E Bb: Septakkord ohne Quinte
      ...dreiklang(5, 60, 67),              // C G
      // angeschlagen wie auf der Gitarre: jede Saite ein paar Ticks später
      [6 * 384, 384, 54], [6 * 384 + 2, 380, 66], [6 * 384 + 5, 378, 73], [6 * 384 + 10, 374, 81],
      ...halb(7, false, 49, 64, 68), ...halb(7, true, 49, 64, 68, 66, 71), // C#m, dann mit F# und B
    ];
    expect(akkorde(noten, 96, 8)).toEqual(["Cadd9", "C6", "Am7", "Cdim7", "C7", "C5", "F#m", "C#m C#m11"]);
  });

  it("erkennt Akkorde je Takt, bei einzelnen Tönen den Ton", () => {
    const noten: Note[] = [
      ...dreiklang(0, 54, 57, 61),      // F# A C#
      ...dreiklang(1, 57, 62, 66),      // A D F#: D-Dur in Umkehrung
      ...dreiklang(2, 57, 61, 64, 67),  // A C# E G
      [3 * 384, 288, 42], [3 * 384 + 288, 96, 45], // Bass: F#, kurz A
    ];
    expect(akkorde(noten, 96, 5)).toEqual(["F#m", "D/A", "A7", "F#", ""]);
  });
});
