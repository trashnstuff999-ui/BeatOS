// src/lib/kapitelVorschlag.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Kapitel aus dem Audio vorschlagen.
//
// Abschnitte in Beats wechseln auf einem Raster von 4 Takten, und ein neuer
// Abschnitt klingt anders: Drums setzen ein oder fallen weg, der Bass kommt,
// die Höhen gehen auf. Deshalb pro Takt drei Pegel (gesamt, tief, hoch), dann
// je 4 Takte gemittelt — wo sich zwei Nachbarblöcke deutlich unterscheiden,
// liegt eine Grenze.
//
// Die Namen sind geraten: die lauteste Gruppe heißt
// Hook, ein leiserer Anfang Intro, ein leiseres Ende Outro, der Rest Verse.
// Wo die Grenzen liegen, trifft das gut; was ein Teil IST, weiß nur der
// Produzent — der Vorschlag ist zum Korrigieren da.
// ═══════════════════════════════════════════════════════════════════════════════

import type { Timecode } from "../types/upload";

const BLOCK = 4;          // Takte pro Block
const MIN_TAKTE = 8;      // kürzester Abschnitt
const MIN_SEKUNDEN = 10;  // YouTube verwirft kürzere Kapitel
const AEHNLICH_DB = 2.5;  // Abschnitte, die so nah beieinander liegen, sind „derselbe Teil"
// ponytail: feste Schwelle statt Statistik — Mittelwert+Streuung lag hinter den
// grossen Spruengen (Intro→Hook, 25 dB) und verschluckte Hook→Verse (5 dB).
// Bei sehr gleichfoermigen Mixen ggf. senken.
const GRENZE_DB = 3;

const db = (x: number) => 10 * Math.log10(x + 1e-10);

/** Pegel pro Takt: [gesamt, tief, hoch] in dB. */
function taktPegel(signal: Float32Array, rate: number, bpm: number): number[][] {
  const taktLen = Math.round(rate * 240 / bpm);
  const takte = Math.floor(signal.length / taktLen);
  // Einpolige Filter: grob, aber für „ist der Bass da" genügt es.
  const aTief = Math.exp(-2 * Math.PI * 150 / rate);
  const aHoch = Math.exp(-2 * Math.PI * 4000 / rate);
  let tief = 0, glatt = 0;
  const out: number[][] = [];
  for (let t = 0; t < takte; t++) {
    let sG = 0, sT = 0, sH = 0;
    for (let i = t * taktLen; i < (t + 1) * taktLen; i++) {
      const x = signal[i];
      tief = (1 - aTief) * x + aTief * tief;
      glatt = (1 - aHoch) * x + aHoch * glatt;
      const hoch = x - glatt;
      sG += x * x; sT += tief * tief; sH += hoch * hoch;
    }
    out.push([db(sG / taktLen), db(sT / taktLen), db(sH / taktLen)]);
  }
  return out;
}

const mittel = (zeilen: number[][]) =>
  zeilen[0].map((_, k) => zeilen.reduce((s, z) => s + z[k], 0) / zeilen.length);
const abstand = (a: number[], b: number[]) =>
  Math.sqrt(a.reduce((s, x, k) => s + (x - b[k]) ** 2, 0) / a.length);

export function kapitelVorschlagen(signal: Float32Array, rate: number, bpm: number): Timecode[] {
  const takt = 240 / bpm;
  const pegel = taktPegel(signal, rate, bpm);
  const bloecke: number[][] = [];
  for (let i = 0; i + BLOCK <= pegel.length; i += BLOCK) bloecke.push(mittel(pegel.slice(i, i + BLOCK)));
  if (bloecke.length < 2) return [{ seconds: 0, label: "Intro" }];

  // Grenze zwischen Block i-1 und i, bewertet nach dem Unterschied.
  const kandidaten = bloecke.slice(1)
    .map((b, j) => ({ block: j + 1, wert: abstand(bloecke[j], b) }));

  const minBloecke = Math.ceil(Math.max(MIN_TAKTE, MIN_SEKUNDEN / takt) / BLOCK);
  const grenzen: number[] = [0];
  for (const k of [...kandidaten].sort((a, b) => b.wert - a.wert)) {
    if (k.wert < GRENZE_DB) break;
    if (k.block < minBloecke || bloecke.length - k.block < minBloecke) continue;
    if (grenzen.every(g => Math.abs(g - k.block) >= minBloecke)) grenzen.push(k.block);
  }
  grenzen.sort((a, b) => a - b);

  // Abschnitte mit ihrem Klang
  const teile = grenzen.map((g, i) => {
    const ende = grenzen[i + 1] ?? bloecke.length;
    return { block: g, klang: mittel(bloecke.slice(g, ende)) };
  });

  // Gruppen: Abschnitte, die gleich klingen
  const gruppe: number[] = [];
  teile.forEach((t, i) => {
    const gleich = teile.findIndex((u, j) => j < i && abstand(t.klang, u.klang) < AEHNLICH_DB);
    gruppe.push(gleich >= 0 ? gruppe[gleich] : i);
  });
  const laut = (i: number) => teile[i].klang[0];
  if (teile.length === 1) return [{ seconds: 0, label: "Intro" }];
  const lautester = teile.map((_, i) => i).sort((a, b) => laut(b) - laut(a))[0];
  const hookGruppe = gruppe[lautester];
  const hookLaut = laut(lautester);

  let verse = 0;
  return teile.map((t, i) => {
    let label: string;
    if (gruppe[i] === hookGruppe) label = "Hook";
    else if (i === 0 && laut(i) < hookLaut) label = "Intro";
    else if (i === teile.length - 1 && laut(i) < hookLaut) label = "Outro";
    else label = `Verse ${++verse}`;
    return { seconds: Math.floor(t.block * BLOCK * takt), label };
  });
}
