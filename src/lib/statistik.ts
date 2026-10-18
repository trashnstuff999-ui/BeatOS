// src/lib/statistik.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Rechenregeln für Übersicht → Statistik: Jahres-Heatmap, Quintenzirkel,
// Durchlaufzeit und Archiv-Wachstum. Reine Funktionen, mit Test.
// ═══════════════════════════════════════════════════════════════════════════════

import { addDays, toISO, wochenanfang } from "./planung";

/** 52 Wochen × 7 Tage bis zum Sonntag dieser Woche, spaltenweise (Mo zuerst). */
export function heatmap(tage: [string, number][], heute: Date) {
  const anzahl = new Map(tage);
  const start = addDays(wochenanfang(heute), -51 * 7);
  const heuteIso = toISO(heute);
  return Array.from({ length: 52 * 7 }, (_, i) => {
    const iso = toISO(addDays(start, i));
    return { iso, anzahl: anzahl.get(iso) ?? 0, zukunft: iso > heuteIso };
  });
}

const KREUZ: Record<string, string> = { Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#" };

/** "F#m", "Emin", "Bb" → einheitlich mit Kreuz; Unlesbares → null. */
export function tonart(roh: string): { grund: string; moll: boolean } | null {
  const m = roh.trim().match(/^([A-Ga-g])([#b]?)\s*(m|min|moll|minor)?$/);
  if (!m) return null;
  const grund = m[1].toUpperCase() + m[2];
  return { grund: KREUZ[grund] ?? grund, moll: !!m[3] };
}

/** Quintenzirkel ab C (oben), im Uhrzeigersinn; Moll innen als Paralleltonart. */
export const DUR_ZIRKEL = ["C", "G", "D", "A", "E", "B", "F#", "C#", "G#", "D#", "A#", "F"];
export const MOLL_ZIRKEL = ["A", "E", "B", "F#", "C#", "G#", "D#", "A#", "F", "C", "G", "D"];

export function zirkel(keys: { key: string; count: number }[]) {
  const dur = new Array(12).fill(0) as number[];
  const moll = new Array(12).fill(0) as number[];
  let ohne = 0;
  for (const k of keys) {
    const t = tonart(k.key);
    const i = t ? (t.moll ? MOLL_ZIRKEL : DUR_ZIRKEL).indexOf(t.grund) : -1;
    if (!t || i < 0) ohne += k.count;
    else (t.moll ? moll : dur)[i] += k.count;
  }
  return { dur, moll, ohne };
}

export const DURCHLAUF_STUFEN = [
  { bis: 1, label: "am selben / nächsten Tag" },
  { bis: 7, label: "in der ersten Woche" },
  { bis: 30, label: "im ersten Monat" },
  { bis: 90, label: "nach 1–3 Monaten" },
  { bis: Infinity, label: "nach über 3 Monaten" },
];

export function durchlauf(tage: number[]) {
  const sortiert = [...tage].sort((a, b) => a - b);
  const mitte = sortiert.length
    ? sortiert.length % 2 ? sortiert[(sortiert.length - 1) / 2] : (sortiert[sortiert.length / 2 - 1] + sortiert[sortiert.length / 2]) / 2
    : null;
  const stufen = DURCHLAUF_STUFEN.map((s, i) => ({
    label: s.label,
    anzahl: sortiert.filter(t => t <= s.bis && (i === 0 || t > DURCHLAUF_STUFEN[i - 1].bis)).length,
  }));
  return { median: mitte, stufen };
}

/** Monate lückenlos vom ersten bis zum letzten, mit laufender Summe. */
export function wachstum(monate: [string, number][]) {
  if (monate.length === 0) return [];
  const anzahl = new Map(monate);
  const [jahr0, mon0] = monate[0][0].split("-").map(Number);
  const [jahr1, mon1] = monate[monate.length - 1][0].split("-").map(Number);
  const out: { monat: string; neu: number; summe: number }[] = [];
  let summe = 0;
  for (let j = jahr0, m = mon0; j < jahr1 || (j === jahr1 && m <= mon1); m === 12 ? (j++, m = 1) : m++) {
    const monat = `${j}-${String(m).padStart(2, "0")}`;
    const neu = anzahl.get(monat) ?? 0;
    summe += neu;
    out.push({ monat, neu, summe });
  }
  return out;
}
