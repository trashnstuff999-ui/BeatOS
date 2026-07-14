// src/lib/time.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Relative time formatting (German) — used by the Studio project list;
// `now` is injectable for tests.
// ═══════════════════════════════════════════════════════════════════════════════

const MIN = 60;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export function nowSecs(): number {
  return Math.floor(Date.now() / 1000);
}

/** Whole days between `secs` and now (0 for today). */
export function daysSince(secs: number, now: number = nowSecs()): number {
  if (secs <= 0) return 0;
  return Math.max(0, Math.floor((now - secs) / DAY));
}

/** "gerade eben", "vor 5 Min.", "vor 2 Std.", "gestern", "vor 6 Tagen",
 *  "vor 3 Wochen", "vor 4 Monaten", "vor 2 Jahren" */
export function formatRelativeTime(secs: number, now: number = nowSecs()): string {
  if (secs <= 0) return "—";
  const diff = Math.max(0, now - secs);

  if (diff < MIN) return "gerade eben";
  if (diff < HOUR) return `vor ${Math.floor(diff / MIN)} Min.`;
  if (diff < DAY) return `vor ${Math.floor(diff / HOUR)} Std.`;
  if (diff < 2 * DAY) return "gestern";
  if (diff < WEEK) return `vor ${Math.floor(diff / DAY)} Tagen`;
  if (diff < MONTH) {
    const weeks = Math.floor(diff / WEEK);
    return weeks === 1 ? "vor 1 Woche" : `vor ${weeks} Wochen`;
  }
  if (diff < YEAR) {
    const months = Math.floor(diff / MONTH);
    return months === 1 ? "vor 1 Monat" : `vor ${months} Monaten`;
  }
  const years = Math.floor(diff / YEAR);
  return years === 1 ? "vor 1 Jahr" : `vor ${years} Jahren`;
}
