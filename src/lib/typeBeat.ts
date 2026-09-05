// src/lib/typeBeat.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Serialization helpers for the structured Upload-tab inputs.
//
// The DB keeps the type-beat fields as plain freetext (backward compatible,
// same columns as before). The chip editors work on string[] and these
// helpers convert both ways:
//   main artists : ["A","B"]        ⇄ "A x B"    ({{TYPE_BEAT_MAIN}} in titles)
//   also fits    : ["A","B"]        ⇄ "A, B"
//   genres       : ["G1","G2"]      ⇄ "G1 | G2"  ({{GENRE_TAGS}} in titles)
//
// The parsers MUST stay tolerant of legacy freetext (mixed separators) and
// mirror the Rust side: split_artists (render.rs) splits on comma / " x " /
// " X " / " & "; split_csv splits on comma and "|".
// ═══════════════════════════════════════════════════════════════════════════════

/** Mirror of Rust split_artists: comma, " x ", " X ", " & " (with spaces). */
export function parseArtists(s: string | null | undefined): string[] {
  if (!s || !s.trim()) return [];
  return s
    .split(",")
    .flatMap(chunk =>
      chunk
        .split(" X ").join(" x ")
        .split(" & ").join(" x ")
        .split(" x ")
    )
    .map(p => p.trim())
    .filter(Boolean);
}

/** Mirror of Rust split_csv: pipe and comma. */
export function parseGenres(s: string | null | undefined): string[] {
  if (!s || !s.trim()) return [];
  return s
    .split(/[|,]/)
    .map(p => p.trim())
    .filter(Boolean);
}

/** "A x B x C" — all main artists joined into the title. */
export function joinArtists(rows: string[]): string {
  return clean(rows).join(" x ");
}

/** "A, B, C" — also-fits list (Rust split_artists handles commas). */
export function joinAlsoFits(rows: string[]): string {
  return clean(rows).join(", ");
}

/** "G1 | G2" — genre phrases, pipe-separated as shown in titles. */
export function joinGenres(rows: string[]): string {
  return clean(rows).join(" | ");
}

function clean(rows: string[]): string[] {
  return rows.map(r => r.trim()).filter(Boolean);
}

/** Einen Eintrag innerhalb einer Liste verschieben.
 *
 *  Kern der Zieh-Sortierung in `ChipListEditor`. Ausserhalb liegende Indizes
 *  geben die Liste unveraendert zurueck, statt `undefined` einzufuegen —
 *  waehrend eines Ziehvorgangs kann der Zeiger neben der Liste landen.
 */
export function verschiebe<T>(liste: T[], von: number, nach: number): T[] {
  if (von === nach) return liste;
  if (von < 0 || nach < 0 || von >= liste.length || nach >= liste.length) return liste;
  const neu = [...liste];
  const [eintrag] = neu.splice(von, 1);
  neu.splice(nach, 0, eintrag);
  return neu;
}
