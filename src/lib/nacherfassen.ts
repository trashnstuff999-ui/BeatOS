// src/lib/nacherfassen.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Uploads nacherfassen: Videos/Tracks der eigenen Kanäle den Beats zuordnen.
//
// Die Titel folgen einem festen Muster — der Beat-Name steht in
// Anführungszeichen: `[FREE] Lil Peep x Juice WRLD Type Beat "DONT WANNA BE"`
// bzw. `[FREE] "DONT WANNA BE" Lil Peep x … Type Beat 2026`. Zugeordnet wird
// über diesen Namen, unabhängig von Groß-/Kleinschreibung und Satzzeichen.
// Ohne Anführungszeichen muss der ganze Titel exakt ein Beat-Name sein.
// ═══════════════════════════════════════════════════════════════════════════════

export interface KanalEintrag {
  id: string;
  titel: string;
  url: string;
  aufrufe: number | null;
}

/** Der Beat-Name aus einem Titel: der Text in Anführungszeichen. */
export function nameAusTitel(titel: string): string | null {
  const m = titel.match(/["“”„]([^"“”„]+)["“”„]/);
  return m ? m[1].trim() : null;
}

/** Vergleichsform: nur Buchstaben und Ziffern, groß. „Don't Wanna Be" = „DONT WANNA BE". */
export const vergleichsform = (s: string) => s.toUpperCase().replace(/[^\p{L}\p{N}]/gu, "");

/** Alle Beats, deren Name zum Titel passt — 0 (keiner), 1 (eindeutig) oder mehr.
 *  Ohne Anführungszeichen zählt der ganze Titel: ältere SoundCloud-Tracks
 *  heißen schlicht „EDGE" oder „GHOST". Der Name muss trotzdem exakt passen. */
export function kandidaten<B extends { id: string; name: string }>(titel: string, beats: B[]): B[] {
  const name = nameAusTitel(titel) ?? titel;
  const ziel = vergleichsform(name);
  return ziel ? beats.filter(b => vergleichsform(b.name) === ziel) : [];
}

/** Für den Abgleich von Links aus Liste und Datumsabfrage. Bei YouTube
 *  zählt die Video-ID — sie steht im Parameter (?v=…), der sonst wegfiele. */
export function linkSchluessel(url: string): string {
  const yt = url.match(/(?:[?&]v=|youtu\.be\/|\/shorts\/)([\w-]{11})/);
  if (yt) return `yt:${yt[1]}`;
  return url.trim().toLowerCase().replace(/[?#].*$/, "").replace(/\/+$/, "").replace(/^https?:\/\/(www\.|m\.)?/, "");
}
