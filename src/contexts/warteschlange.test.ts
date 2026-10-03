// src/contexts/warteschlange.test.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Der Weg durch die Hör-Warteschlange — die gefilterte Archivliste, die beim
// Abspielen mitgegeben wird.
//
// Der Unterschied, um den es geht: der Skip-Knopf darf am Listenende vorn
// weiterlaufen, der automatische Übergang am Ende eines Beats nicht. Sonst
// spielt die App von selbst endlos durchs ganze Archiv.
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { naechsterEintrag } from "./AudioPlayerContext";

const LISTE = [{ path: "A" }, { path: "B" }, { path: "C" }];

describe("Warteschlange", () => {
  it("geht einen weiter", () => {
    expect(naechsterEintrag(LISTE, "A", 1, false)?.path).toBe("B");
    expect(naechsterEintrag(LISTE, "B", -1, true)?.path).toBe("A");
  });

  it("hört am Listenende auf, wenn der Beat von selbst zu Ende ist", () => {
    expect(naechsterEintrag(LISTE, "C", 1, false)).toBeNull();
  });

  it("läuft am Listenende vorn weiter, wenn man auf Weiter drückt", () => {
    expect(naechsterEintrag(LISTE, "C", 1, true)?.path).toBe("A");
    expect(naechsterEintrag(LISTE, "A", -1, true)?.path).toBe("C");
  });

  it("kommt mit einem Beat klar, der nicht mehr in der Liste steht", () => {
    // Filter gewechselt, während etwas lief: der Knopf fängt vorn an,
    // von selbst passiert nichts.
    expect(naechsterEintrag(LISTE, "weg", 1, true)?.path).toBe("A");
    expect(naechsterEintrag(LISTE, "weg", 1, false)).toBeNull();
  });

  it("kommt mit einer leeren Liste klar", () => {
    expect(naechsterEintrag([], "A", 1, true)).toBeNull();
    expect(naechsterEintrag([{ path: "A" }], "A", 1, false)).toBeNull();
  });
});
