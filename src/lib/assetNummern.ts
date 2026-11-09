// src/lib/assetNummern.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Studio → Assets: Covers und Thumbnails per Klick durchnummerieren.
// Regeln (Stephan, 26.10.2026):
//   • Nach Alter: das neueste ist _1, Cover_5 ist älter als Cover_2
//   • Covers und Thumbnails getrennt: jede Reihe zählt nur gegen sich selbst
//   • Rolle kommt aus dem Namen („…cover…", „…thumb…"), Videos bleiben, wie sie sind
// Nach Zuweisen oder Löschen schließt Rust die Lücken (luecken_schliessen),
// die Reihenfolge bleibt dabei.
// ═══════════════════════════════════════════════════════════════════════════════

export type Rolle = "cover" | "thumbnail";

export interface Bild {
  pfad: string;
  name: string;
  secs: number;
  rolle: Rolle;
}

export interface Umbenennung {
  pfad: string;
  alt: string;
  neu: string;
}

const endung = (name: string) => (name.includes(".") ? name.slice(name.lastIndexOf(".")) : "");
const zielName = (rolle: Rolle, nr: number, name: string) =>
  `${rolle === "cover" ? "Cover" : "Thumbnail"}_${nr}${endung(name).toLowerCase()}`;

/** Was umbenannt werden muss. Ringtausch (Cover_1 ↔ Cover_2) löst Rust über
 *  Zwischennamen auf, die Reihenfolge der Liste ist darum egal. */
export function planeNummern(bilder: Bild[]): Umbenennung[] {
  const plan: Umbenennung[] = [];
  for (const rolle of ["cover", "thumbnail"] as const) {
    bilder
      .filter(b => b.rolle === rolle)
      .sort((a, b) => b.secs - a.secs || a.name.localeCompare(b.name))
      .forEach((b, i) => {
        const neu = zielName(rolle, i + 1, b.name);
        if (neu !== b.name) plan.push({ pfad: b.pfad, alt: b.name, neu });
      });
  }
  return plan;
}
