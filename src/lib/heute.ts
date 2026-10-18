// src/lib/heute.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Rechenregeln für Übersicht → Heute: die Woche als sieben Tage, welcher Beat
// als Nächstes dran ist und welche Studio-Projekte liegen geblieben sind.
// Reine Funktionen — der Test prüft sie ohne Kalender und ohne Backend.
// ═══════════════════════════════════════════════════════════════════════════════

import { addDays, toISO } from "./planung";
import type { ScheduleEntry, QueueBeat } from "../types/upload";
import type { StudioProject } from "../types/studio";

export interface TagBeat {
  id: string;
  name: string;
  cover: string | null;
  /** Hochgeladen, sobald eine Plattform es ist. */
  hochgeladen: boolean;
}

export interface TagZelle {
  iso: string;
  /** 0 = So … 6 = Sa, wie Date.getDay() und der Rhythmus. */
  wochentag: number;
  uploadTag: boolean;
  heute: boolean;
  vorbei: boolean;
  /** Ein Eintrag je Beat — drei Plattformen am selben Tag sind ein Upload. */
  beats: TagBeat[];
}

/** Mo–So ab `montag`, mit den Beats aus dem Terminplan. */
export function woche(montag: Date, rhythmus: number[], eintraege: ScheduleEntry[], heute: Date): TagZelle[] {
  const heuteIso = toISO(heute);
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(montag, i);
    const iso = toISO(d);
    const beats: TagBeat[] = [];
    for (const e of eintraege) {
      if (e.date !== iso) continue;
      const da = beats.find(b => b.id === e.beat_id);
      if (da) da.hochgeladen ||= e.status === "uploaded";
      else beats.push({ id: e.beat_id, name: e.beat_name, cover: e.cover, hochgeladen: e.status === "uploaded" });
    }
    return {
      iso, wochentag: d.getDay(), uploadTag: rhythmus.includes(d.getDay()),
      heute: iso === heuteIso, vorbei: iso < heuteIso, beats,
    };
  });
}

/** Wem am wenigsten fehlt; bei Gleichstand der älteste. */
export function alsNaechstes(queue: QueueBeat[]): QueueBeat | null {
  return [...queue].sort((a, b) =>
    a.fehlt.length - b.fehlt.length
    || (a.created_date ?? "").localeCompare(b.created_date ?? ""),
  )[0] ?? null;
}

/** „In Arbeit", seit `tage` Tagen nicht gespeichert — die zuletzt
 *  liegen gebliebenen zuerst: die sind noch am ehesten zu retten. */
export function liegengeblieben(projekte: StudioProject[], jetztSek: number, tage = 30): StudioProject[] {
  const grenze = jetztSek - tage * 86400;
  return projekte
    .filter(p => p.status === "wip" && p.modified_secs > 0 && p.modified_secs < grenze)
    .sort((a, b) => b.modified_secs - a.modified_secs);
}

const KURZ = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** [1, 3, 5] → "Mo, Mi und Fr" */
export function tageAufzaehlen(wochentage: number[]): string {
  const namen = wochentage.map(t => KURZ[t]);
  return namen.length <= 1 ? namen.join("") : `${namen.slice(0, -1).join(", ")} und ${namen[namen.length - 1]}`;
}
