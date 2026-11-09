import { describe, expect, it } from "vitest";
import { aufteilen } from "./GelbAnsicht";
import type { Fund, FundDatei } from "../../types/fundstuecke";

const datei = (path: string, titel: string | null, key: string | null, bpm: number | null, flp = false): FundDatei =>
  ({ path, size: 1, modified: 0, flp, im_archiv: false, titel, key, bpm });
const fund = (grund: string, dateien: FundDatei[]): Fund => ({
  id: null, titel: "Destiny", key: null, bpm: null, ampel: "gelb", grund, archiv: null, nur_hier: dateien.length,
  fertig: null, dateien, weg: false,
});

describe("aufteilen", () => {
  it("trennt zwei Songs gleichen Titels nach Key und BPM", () => {
    const teile = aufteilen(fund("Key/BPM uneinheitlich", [
      datei("a.mp3", "Destiny", "F#m", 140),
      datei("b.mp3", "Destiny", "Dm", 181),
      datei("c.mp3", "Destiny", "F#m", 140),
      datei("Destiny.flp", null, null, null, true),
    ]));
    expect(teile).toHaveLength(3);
    expect(teile.find(t => t.key === "F#m")?.dateien.map(d => d.path)).toEqual(["a.mp3", "c.mp3"]);
    expect(teile.find(t => t.key === "Dm")?.bpm).toBe(181);
    // Die FLP ohne Angabe bleibt ein eigener Teil, nichts wird geraten
    expect(teile.find(t => t.dateien[0].flp)?.dateien).toHaveLength(1);
  });

  it("lässt andere Gründe zusammen", () => {
    const f = fund("ohne Nummer", [datei("a.mp3", "X", "Am", 120), datei("b.mp3", "X", "Cm", 120)]);
    expect(aufteilen(f)).toEqual([f]);
  });
});
