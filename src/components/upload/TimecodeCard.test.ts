// src/components/upload/TimecodeCard.test.ts
// Der Block ist Speicherformat UND Anzeigeformat — er muss verlustfrei hin
// und zurück gehen, sonst verliert eine Marke beim nächsten Öffnen ihre Zeit.

import { describe, it, expect } from "vitest";
import { mmss, parseMmss, parseBlock, naechsterName } from "./TimecodeCard";

describe("mmss / parseMmss", () => {
  it("schreibt und liest dieselbe Zeit", () => {
    for (const s of [0, 7, 62, 600, 3800]) {
      expect(parseMmss(mmss(s))).toBe(s);
    }
  });

  it("schreibt wie YouTube", () => {
    expect(mmss(0)).toBe("0:00");
    expect(mmss(62)).toBe("1:02");
    expect(mmss(3800)).toBe("1:03:20");
  });

  it("weist zurueck, was keine Zeit ist", () => {
    expect(parseMmss("Intro")).toBeNull();
    expect(parseMmss("90")).toBeNull();          // ohne Doppelpunkt
    expect(parseMmss("1:2:3:4")).toBeNull();
    expect(parseMmss("-1:00")).toBeNull();
  });
});

describe("parseBlock", () => {
  it("liest zurueck, was gespeichert wurde", () => {
    expect(parseBlock("0:00 Intro\n0:24 Pre-Hook\n1:02 Verse 1")).toEqual([
      { seconds: 0,  label: "Intro" },
      { seconds: 24, label: "Pre-Hook" },
      { seconds: 62, label: "Verse 1" },
    ]);
  });

  it("nimmt Beschriftungen mit Leerzeichen und Sonderzeichen", () => {
    expect(parseBlock("1:00 Pre-Hook / Hook")).toEqual([
      { seconds: 60, label: "Pre-Hook / Hook" },
    ]);
  });

  it("ueberspringt Zeilen ohne Zeit, statt zu stolpern", () => {
    expect(parseBlock("⏱ Chapters:\n0:00 Intro")).toEqual([
      { seconds: 0, label: "Intro" },
    ]);
  });

  it("leer bleibt leer", () => {
    expect(parseBlock(null)).toEqual([]);
    expect(parseBlock("   ")).toEqual([]);
  });
});

describe("naechsterName", () => {
  it("nummeriert Verse durch", () => {
    expect(naechsterName("Verse", [])).toBe("Verse 1");
    expect(naechsterName("Verse", ["Intro", "Verse 1"])).toBe("Verse 2");
    expect(naechsterName("Verse", ["Verse 1", "Verse 2"])).toBe("Verse 3");
  });

  it("laesst Hook und Pre-Hook in Ruhe", () => {
    expect(naechsterName("Hook", ["Hook"])).toBe("Hook");
    expect(naechsterName("Pre-Hook", ["Pre-Hook"])).toBe("Pre-Hook");
    expect(naechsterName("Intro", ["Intro"])).toBe("Intro");
  });
});
