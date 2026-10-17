import { describe, it, expect } from "vitest";
import { exportNamen } from "./descriptions";

// Die BeatStars-Vorlage, gerendert für CALL ME
const BEATSTARS = `BEATSTARS TITEL:
CALL ME - Dro Kenji x Juice WRLD Type Beat 2026
────────────────────────────

PREMIERE PRO EXPORTNAME (Video):
Dro Kenji x Juice WRLD Type Beat 2026 - CALL ME - Hard Guitar Type Beat

ALBUMCOVER EXPORT:
CALL ME_Cover_2000x2000.png

THUMBNAIL EXPORT:
CALL ME_THUMBNAIL_1920x1080.png
`;

describe("exportNamen", () => {
  it("liest die Paare Überschrift + Name aus der Vorlage", () => {
    expect(exportNamen(BEATSTARS)).toEqual([
      { label: "PREMIERE PRO EXPORTNAME (Video)", wert: "Dro Kenji x Juice WRLD Type Beat 2026 - CALL ME - Hard Guitar Type Beat" },
      { label: "ALBUMCOVER EXPORT", wert: "CALL ME_Cover_2000x2000.png" },
      { label: "THUMBNAIL EXPORT", wert: "CALL ME_THUMBNAIL_1920x1080.png" },
    ]);
  });

  it("Tags und leere Überschriften sind keine Exportnamen", () => {
    expect(exportNamen("TITEL:\nX\n\nLEER:\n\nTAGS:\na, b\n")).toEqual([]);
  });
});
