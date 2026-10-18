// src/lib/assetNummern.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Studio → Assets: Covers und Thumbnails fortlaufend nummerieren, damit man
// sieht, was zusammengehört (Cover_9 ↔ Thumbnail_9). Wunsch vom 18.10.2026,
// Regeln in docs/TODO.md:
//   • Lückenlos ab 1, Reihenfolge bleibt („cover2", „cover9" → Cover_1, Cover_2);
//     nach Zuweisen oder Löschen rutscht der Rest automatisch nach
//   • Paare per Bildvergleich (dHash, beim Thumbnail der mittlere Ausschnitt),
//     zweites Signal die Exportzeit — nur über die Zeit gepaart heißt „unsicher"
//   • Videos werden nicht nummeriert
// ═══════════════════════════════════════════════════════════════════════════════

export type Rolle = "cover" | "thumbnail";

export interface Bild {
  pfad: string;
  name: string;
  secs: number;
  /** Aus dem Namen oder aus dem Seitenverhältnis; null = weder noch. */
  rolle: Rolle | null;
  /** dHash als 64 Zeichen „0"/„1" — nur für Bilder ohne Nummer nötig. */
  hash: string | null;
}

export interface Umbenennung {
  pfad: string;
  alt: string;
  neu: string;
  nr: number;
  /** Nur über die Exportzeit gepaart, nicht übers Bild — Vorschlag. */
  unsicher: boolean;
}

/** „cover9.png", „Cover_9.png", „thumbnail 12.jpg", „thumb-3.png" → Rolle und Nummer. */
export function nummerAusName(name: string): { rolle: Rolle; nr: number } | null {
  const m = name.match(/^(cover|thumbnail|thumb)[ _-]?(\d+)(?:\.[^.]+)?$/i);
  if (!m) return null;
  return { rolle: m[1].toLowerCase() === "cover" ? "cover" : "thumbnail", nr: Number(m[2]) };
}

/** Rolle aus dem Namen („…cover…", „…thumb…"). */
export function rolleAusName(name: string): Rolle | null {
  const n = name.toLowerCase();
  if (n.includes("thumb")) return "thumbnail";
  if (n.includes("cover")) return "cover";
  return null;
}

/** Rolle aus dem Seitenverhältnis: quadratisch = Cover, breit = Thumbnail. */
export function rolleAusMassen(breite: number, hoehe: number): Rolle | null {
  if (!breite || !hoehe) return null;
  const r = breite / hoehe;
  if (Math.abs(r - 1) < 0.05) return "cover";
  if (r > 1.5 && r < 2) return "thumbnail";
  return null;
}

export function hamming(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) d++;
  return d + Math.abs(a.length - b.length);
}

/** Bis hierhin gilt ein Bildvergleich als „dasselbe Motiv" (von 64 Bits). */
export const AEHNLICH = 12;
/** Exportzeit nah genug für einen unsicheren Vorschlag. */
export const ZEITFENSTER = 15 * 60;

const endung = (name: string) => (name.includes(".") ? name.slice(name.lastIndexOf(".")) : "");
const zielName = (rolle: Rolle, nr: number, name: string) =>
  `${rolle === "cover" ? "Cover" : "Thumbnail"}_${nr}${endung(name).toLowerCase()}`;

/** Was umbenannt werden soll. Die Reihe ist lückenlos ab 1: Wird Cover_1 einem
 *  Beat zugewiesen (oder gelöscht), rutscht Cover_2 auf 1 nach — die Nummer
 *  heißt nur „wartet auf einen Beat" (Stephan, 18.10.2026). Die Reihenfolge
 *  bleibt, Neues kommt hinten dran. Die Liste ist nach neuer Nummer sortiert:
 *  so abgearbeitet, ist jeder Zielname frei, bevor er gebraucht wird. */
export function planeNummern(bilder: Bild[]): Umbenennung[] {
  const plan: Umbenennung[] = [];
  const ohne: Bild[] = [];
  const mitNummer: { b: Bild; rolle: Rolle; nr: number }[] = [];
  for (const b of bilder) {
    const n = nummerAusName(b.name);
    if (n) mitNummer.push({ b, ...n });
    else if (b.rolle) ohne.push(b);
  }
  // Alte Nummern → 1, 2, 3 … in derselben Reihenfolge; ein Paar bleibt ein Paar.
  const reihe = [...new Set(mitNummer.map(m => m.nr))].sort((a, b) => a - b);
  for (const m of mitNummer) {
    const nr = reihe.indexOf(m.nr) + 1;
    const neu = zielName(m.rolle, nr, m.b.name);
    if (neu !== m.b.name) plan.push({ pfad: m.b.pfad, alt: m.b.name, neu, nr, unsicher: false });
  }
  let max = reihe.length;

  const nachZeit = (a: Bild, b: Bild) => a.secs - b.secs;
  const covers = ohne.filter(b => b.rolle === "cover").sort(nachZeit);
  const thumbs = ohne.filter(b => b.rolle === "thumbnail").sort(nachZeit);
  const frei = new Set(thumbs);

  for (const c of covers) {
    // Erst übers Bild, sonst über die Zeit
    let partner: Bild | null = null;
    let unsicher = false;
    let bester = Infinity;
    for (const t of frei) {
      if (c.hash && t.hash) {
        const d = hamming(c.hash, t.hash);
        if (d <= AEHNLICH && d < bester) { bester = d; partner = t; }
      }
    }
    if (!partner) {
      const nah = [...frei].filter(t => Math.abs(t.secs - c.secs) <= ZEITFENSTER)
        .sort((a, b) => Math.abs(a.secs - c.secs) - Math.abs(b.secs - c.secs))[0];
      if (nah) { partner = nah; unsicher = true; }
    }
    const nr = ++max;
    plan.push({ pfad: c.pfad, alt: c.name, neu: zielName("cover", nr, c.name), nr, unsicher });
    if (partner) {
      frei.delete(partner);
      plan.push({ pfad: partner.pfad, alt: partner.name, neu: zielName("thumbnail", nr, partner.name), nr, unsicher });
    }
  }
  for (const t of thumbs.filter(t => frei.has(t))) {
    const nr = ++max;
    plan.push({ pfad: t.pfad, alt: t.name, neu: zielName("thumbnail", nr, t.name), nr, unsicher: false });
  }
  return plan.sort((a, b) => a.nr - b.nr || a.neu.localeCompare(b.neu));
}

/** dHash eines Bildes (9×8 Graustufen, je Zeile „links heller als rechts").
 *  Beim Thumbnail zählt der mittlere quadratische Ausschnitt — dort liegt
 *  dasselbe Motiv wie auf dem Cover. `src` muss ein data:-URL sein, sonst
 *  darf das Canvas nicht gelesen werden. */
export async function bildHash(src: string): Promise<{ hash: string; breite: number; hoehe: number }> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const w = img.naturalWidth, h = img.naturalHeight;
  // Mittleres Quadrat: beim Cover das ganze Bild, beim Thumbnail die Mitte.
  const seite = Math.min(w, h);
  const sx = (w - seite) / 2, sy = (h - seite) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = 9; canvas.height = 8;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas nicht verfügbar");
  ctx.drawImage(img, sx, sy, seite, seite, 0, 0, 9, 8);
  const d = ctx.getImageData(0, 0, 9, 8).data;
  const grau = (x: number, y: number) => { const i = (y * 9 + x) * 4; return d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; };
  let hash = "";
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) hash += grau(x, y) > grau(x + 1, y) ? "1" : "0";
  return { hash, breite: w, hoehe: h };
}
