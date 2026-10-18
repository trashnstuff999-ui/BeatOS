// src/lib/kuenstler.ts — kleine Regeln für Künstler-Projekte (docs/kuenstler-projekte.md)

/** Nur Buchstaben und Ziffern, klein — „Heartbreak Highlights" und
 *  „heartbreak highlights_vocals" sollen sich finden. */
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** Windows-Pfade vergleichbar machen: Groß/klein, „/" oder „\", doppelte Trenner. */
export const pfadSchluessel = (p: string) => p.toLowerCase().replace(/[\\/]+/g, "\\");

/** Gehört die Datei aus den Downloads zu diesem Song? Der Dateiname enthält
 *  den Songnamen — Künstlernamen stehen in Downloads meist nicht drin. */
export function passtZumSong(datei: string, song: string): boolean {
  const s = norm(song);
  if (s.length < 3) return false;
  return norm(datei.replace(/\.[^.]+$/, "")).includes(s);
}
