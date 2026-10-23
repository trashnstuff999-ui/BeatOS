// src/lib/werkbank.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Die Werkbank im Studio: was einem Projekt bis zum Upload noch fehlt.
// ═══════════════════════════════════════════════════════════════════════════════

import type { StudioProject } from "../types/studio";

/** Die fünf Dateien in Pipeline-Reihenfolge — dieselbe wie deriveStage(). */
export const SCHRITTE: Array<[keyof StudioProject, string]> = [
  ["has_mp3", "MP3"], ["has_wav", "WAV"],
  ["has_cover", "Cover"], ["has_thumbnail", "Thumbnail"], ["has_video", "Video"],
];

export function fehlt(p: StudioProject): string[] {
  return SCHRITTE.filter(([k]) => !p[k]).map(([, label]) => label);
}

// ─── Ideen-Liste ─────────────────────────────────────────────────────────────

/** „Project_0861 - Hell & Heaven" → Nummer „0861", Titel „Hell & Heaven".
 *  Ohne Export-Titel und ohne Namen im Ordner: titel = null („ohne Titel"). */
export function ideeName(p: StudioProject): { nummer: string | null; titel: string | null } {
  const ordner = p.parsed_name || p.name;
  const m = ordner.match(/^#?(?:project_)?(\d+)\s*[-–_]?\s*(.*)$/i);
  const rest = m ? m[2].trim() : ordner;
  return { nummer: m ? m[1] : null, titel: p.song_name?.trim() || rest || null };
}

export interface IdeenGruppe { key: string; label: string; items: StudioProject[] }

/** Nach Monat (Neueste/Älteste) oder Anfangsbuchstabe (A–Z). Die Reihenfolge
 *  der Projekte bleibt, wie sie hereinkommt — sortiert wird vorher. */
export function ideenGruppen(items: StudioProject[], nachName: boolean): IdeenGruppe[] {
  const gruppen: IdeenGruppe[] = [];
  for (const p of items) {
    let key: string, label: string;
    if (nachName) {
      const t = ideeName(p).titel ?? "";
      key = label = /^[a-zäöü]/i.test(t) ? t[0].toUpperCase() : "#";
    } else {
      const d = new Date(p.modified_secs * 1000);
      key = `${d.getFullYear()}-${d.getMonth()}`;
      label = d.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
    }
    const g = gruppen[gruppen.length - 1];
    if (g && g.key === key) g.items.push(p);
    else gruppen.push({ key, label, items: [p] });
  }
  return gruppen;
}

/** „12 min", „1 h 20 min", „3 h" */
export function arbeitszeit(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Skizzen-Vorschlag im Aufräumen: alt, kurz angefasst, nie exportiert, ohne
 *  Notiz. Eine Notiz heißt: da hatte ich etwas vor — die bleibt draußen. */
export function skizzen(items: StudioProject[], grenzeMin: number, jetztSek = Date.now() / 1000): StudioProject[] {
  return items.filter(p =>
    p.status === "idea" && !p.has_mp3 && !p.has_wav && !p.notes?.trim() &&
    p.work_minutes != null && p.work_minutes < grenzeMin &&
    jetztSek - p.modified_secs > 365 * 86_400);
}

/** Aufräumen nach Arbeitszeit: feste Spannen, ohne Zeit ans Ende. Die
 *  Reihenfolge der Spannen folgt der Sortierung, die hereinkommt. */
const SPANNEN: Array<[number, string]> = [
  [15, "Unter 15 min"], [30, "15–30 min"], [60, "30–60 min"], [120, "1–2 h"], [Infinity, "Über 2 h"],
];
export function zeitGruppen(items: StudioProject[]): IdeenGruppe[] {
  const gruppen: IdeenGruppe[] = [];
  for (const p of items) {
    const label = p.work_minutes == null ? "Ohne Zeitangabe"
      : SPANNEN.find(([bis]) => p.work_minutes! < bis)![1];
    const g = gruppen[gruppen.length - 1];
    if (g && g.label === label) g.items.push(p);
    else gruppen.push({ key: label, label, items: [p] });
  }
  return gruppen;
}

/** Aufräumen: nach Jahr der letzten Änderung. Wie oben — sortiert wird vorher. */
export function jahresGruppen(items: StudioProject[]): IdeenGruppe[] {
  const gruppen: IdeenGruppe[] = [];
  for (const p of items) {
    const key = String(new Date(p.modified_secs * 1000).getFullYear());
    const g = gruppen[gruppen.length - 1];
    if (g && g.key === key) g.items.push(p);
    else gruppen.push({ key, label: key, items: [p] });
  }
  return gruppen;
}
