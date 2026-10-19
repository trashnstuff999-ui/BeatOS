// src/lib/werkbank.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Die Werkbank im Studio: was einem Projekt bis zum Upload noch fehlt, und der
// eine Satz darüber („2 Beats sind bereit fürs Archiv.").
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

/** „Cover, Thumbnail und Video" */
export function aufzaehlen(teile: string[]): string {
  return teile.length <= 1 ? (teile[0] ?? "") : `${teile.slice(0, -1).join(", ")} und ${teile[teile.length - 1]}`;
}

export function werkbankSatz(projekte: StudioProject[], titel: (p: StudioProject) => string): { kopf: string; unter: string } {
  const bereit = projekte.filter(p => p.status === "ready").length;
  const kopf = bereit === 0 ? "Gerade ist nichts bereit fürs Archiv."
    : bereit === 1 ? "1 Beat ist bereit fürs Archiv."
    : `${bereit} Beats sind bereit fürs Archiv.`;

  // Die zwei, denen am wenigsten fehlt — da lohnt der nächste Handgriff.
  // Cover/Thumbnail/Video sind alle sächlich: „das Video", „das Cover".
  const fast = projekte
    .filter(p => p.status === "exported")
    .map(p => ({ p, f: fehlt(p) }))
    .sort((a, b) => a.f.length - b.f.length || b.p.modified_secs - a.p.modified_secs)
    .slice(0, 2)
    .map(({ p, f }, i) =>
      `${i === 0 ? "Bei" : "bei"} ${titel(p)} ${f.length === 1 ? `fehlt nur noch das ${f[0]}` : `fehlen ${aufzaehlen(f)}`}`);
  const teile: string[] = [];
  if (fast.length > 0) teile.push(`${fast.join(", ")}.`);
  const wip = projekte.filter(p => p.status === "wip").length;
  if (wip > 0) teile.push(`${wip === 1 ? "Ein Projekt hast" : `${wip} Projekte hast`} du zum Überarbeiten vorgemerkt.`);
  return { kopf, unter: teile.join(" ") };
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
