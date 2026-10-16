import { describe, it, expect } from "vitest";
import { kapitelVorschlagen } from "./kapitelVorschlag";

/** Ein Song aus Abschnitten: [Takte, Lautstärke, mit Bass?]. Rauschen für
 *  die Höhen, ein 60-Hz-Sinus als Bass. */
function song(teile: [number, number, boolean][], bpm: number, rate = 8000) {
  const takt = Math.round(rate * 240 / bpm);
  const n = teile.reduce((s, [t]) => s + t * takt, 0);
  const sig = new Float32Array(n);
  let i = 0, zufall = 1;
  for (const [takte, laut, bass] of teile) {
    for (let k = 0; k < takte * takt; k++, i++) {
      zufall = (zufall * 16807) % 2147483647;
      const rausch = (zufall / 2147483647 - 0.5) * laut;
      sig[i] = rausch + (bass ? 0.5 * Math.sin(2 * Math.PI * 60 * i / rate) : 0);
    }
  }
  return sig;
}

describe("kapitelVorschlagen", () => {
  it("findet Grenzen auf dem Raster und benennt Intro, Hook, Verse, Outro", () => {
    const bpm = 140;               // 1 Takt = 1,714 s
    const sig = song([
      [8, 0.1, false],             // Intro
      [16, 0.8, true],             // Hook
      [16, 0.3, true],             // Verse
      [16, 0.8, true],             // Hook
      [8, 0.1, false],             // Outro
    ], bpm);
    const t = (takte: number) => Math.floor(takte * 240 / bpm);
    expect(kapitelVorschlagen(sig, 8000, bpm)).toEqual([
      { seconds: 0, label: "Intro" },
      { seconds: t(8), label: "Hook" },
      { seconds: t(24), label: "Verse 1" },
      { seconds: t(40), label: "Hook" },
      { seconds: t(56), label: "Outro" },
    ]);
  });

  it("ein gleichförmiger Beat bleibt ein Kapitel", () => {
    expect(kapitelVorschlagen(song([[32, 0.5, true]], 140), 8000, 140)).toEqual([
      { seconds: 0, label: "Intro" },
    ]);
  });
});
