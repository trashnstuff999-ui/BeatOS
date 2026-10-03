// src/components/browse/upload-luecke.test.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Wann zeigt eine Karte im Raster die drei Plattform-Punkte?
//
// Die Punkte sind dort keine Anzeige, sondern eine Meldung: „hier fehlt noch
// was". Stünden sie überall, wären sie Textur — genau wie die Status-Pille
// „Fertig", die aus demselben Grund nur noch bei der Ausnahme steht.
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { hatUploadLuecke } from "./BeatTable";
import type { UploadBadge } from "../../types/browse";

const badge = (platform: string, status: string): UploadBadge =>
  ({ beat_id: "0842", platform, status } as UploadBadge);

const ALLE_DREI = [
  badge("beatstars", "uploaded"),
  badge("soundcloud", "uploaded"),
  badge("youtube", "uploaded"),
];

describe("Upload-Lücke", () => {
  it("schweigt, wenn alles draußen ist", () => {
    expect(hatUploadLuecke(ALLE_DREI, "finished")).toBe(false);
  });

  it("meldet, was auf SoundCloud liegt, aber nicht auf YouTube", () => {
    expect(hatUploadLuecke([badge("soundcloud", "uploaded")], "finished")).toBe(true);
  });

  it("zählt „geplant“ nicht als erledigt", () => {
    const fast = [
      badge("beatstars", "uploaded"),
      badge("soundcloud", "uploaded"),
      badge("youtube", "scheduled"),
    ];
    expect(hatUploadLuecke(fast, "finished")).toBe(true);
  });

  it("meldet den fertigen Beat, der nirgends hochgeladen ist", () => {
    expect(hatUploadLuecke(undefined, "finished")).toBe(true);
    expect(hatUploadLuecke([], "finished")).toBe(true);
  });

  it("lässt den Beat in Ruhe, der noch in Arbeit ist", () => {
    // Der häufigste Fall im Archiv — hier wäre die Meldung falsch: es fehlt
    // nichts, es ist nur noch nicht so weit.
    expect(hatUploadLuecke(undefined, "wip")).toBe(false);
    expect(hatUploadLuecke(undefined, "idea")).toBe(false);
    expect(hatUploadLuecke(undefined, null)).toBe(false);
  });
});
