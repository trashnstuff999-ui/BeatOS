// src/lib/kuenstler.ts — kleine Regeln für Künstler-Projekte (docs/kuenstler-projekte.md)

/** Nur Buchstaben und Ziffern, klein — „Heartbreak Highlights" und
 *  „heartbreak highlights_vocals" sollen sich finden. */
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** Wo ein Song steht — ein Satz statt sechs Häkchen. `schritt` zählt die
 *  erledigten der vier Etappen Vocals → Mix → Master → Abgegeben. */
export function songStand(s: { fertig: boolean; warten: boolean; vocals: boolean; mix: boolean; master: boolean }):
  { text: string; schritt: number; ton: "fertig" | "warten" | "offen" | "bereit" } {
  const schritt = s.fertig ? 4 : s.master ? 3 : s.mix ? 2 : s.vocals ? 1 : 0;
  if (s.fertig) return { text: "Abgegeben", schritt, ton: "fertig" };
  if (s.warten) return { text: "Warte auf Künstler", schritt, ton: "warten" };
  if (!s.vocals) return { text: "Vocals fehlen", schritt, ton: "offen" };
  if (!s.mix && !s.master) return { text: "Mix offen", schritt, ton: "offen" };
  if (!s.master) return { text: "Master offen", schritt, ton: "offen" };
  return { text: "Bereit zum Abgeben", schritt, ton: "bereit" };
}

/** Windows-Pfade vergleichbar machen: Groß/klein, „/" oder „\", doppelte Trenner. */
export const pfadSchluessel = (p: string) => p.toLowerCase().replace(/[\\/]+/g, "\\");

/** Gehört die Datei aus den Downloads zu diesem Song? Der Dateiname enthält
 *  den Songnamen — Künstlernamen stehen in Downloads meist nicht drin. */
export function passtZumSong(datei: string, song: string): boolean {
  const s = norm(song);
  if (s.length < 3) return false;
  return norm(datei.replace(/\.[^.]+$/, "")).includes(s);
}
