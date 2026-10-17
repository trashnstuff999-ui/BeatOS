// src/lib/planung.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Upload-Rhythmus: an welchen Wochentagen hochgeladen werden soll, wie viele
// davon diese Woche schon belegt sind und welcher Tag als nächster frei ist.
// Reine Funktionen über ISO-Daten (YYYY-MM-DD) — die Planungs-Leiste rechnet
// damit, der Test prüft sie ohne Kalender.
// ═══════════════════════════════════════════════════════════════════════════════

/** "1,3,5" → [1, 3, 5] (0 = So … 6 = Sa). Ungültiges fällt weg. */
export function parseRhythmus(text: string): number[] {
  return [...new Set(text.split(",").map(t => Number(t.trim())))]
    .filter(n => Number.isInteger(n) && n >= 0 && n <= 6 && text.trim() !== "")
    .sort((a, b) => a - b);
}

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

/** Montag der Woche, in der `d` liegt. */
export function wochenanfang(d: Date): Date {
  return addDays(d, -((d.getDay() + 6) % 7));
}

/** Diese Woche (Mo–So): wie viele Rhythmus-Tage es gibt, wie viele belegt
 *  sind, und welche ab heute noch leer sind. */
export function wochenstand(rhythmus: number[], belegt: Set<string>, heute: Date) {
  const tage = Array.from({ length: 7 }, (_, i) => addDays(wochenanfang(heute), i))
    .filter(d => rhythmus.includes(d.getDay()));
  const heuteIso = toISO(heute);
  return {
    soll: tage.length,
    geplant: tage.filter(d => belegt.has(toISO(d))).length,
    offen: tage.map(toISO).filter(iso => iso >= heuteIso && !belegt.has(iso)),
  };
}

/** Der nächste Rhythmus-Tag ab heute, an dem noch nichts geplant ist —
 *  höchstens `reichweite` Tage voraus. */
export function naechsterFreierTag(rhythmus: number[], belegt: Set<string>, heute: Date, reichweite = 14): string | null {
  for (let i = 0; i < reichweite; i++) {
    const d = addDays(heute, i);
    if (rhythmus.includes(d.getDay()) && !belegt.has(toISO(d))) return toISO(d);
  }
  return null;
}
