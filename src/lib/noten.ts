// src/lib/noten.ts
// Notennamen, Tonart und Akkorde für die MIDI-Vorschau im Samples-Tab.
// Schreibweise wie in Stephans Dateinamen: immer Kreuze (F#min, G#min).

/** [Start, Länge, Tonhöhe] in Ticks, wie `midi_noten` sie liefert */
export type Note = [number, number, number];

const NAMEN = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const B_NAMEN = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/** Tonhöhe → Name mit Oktave wie in FL Studio: 60 ist C5. */
export const notenName = (tonhoehe: number) => `${NAMEN[((tonhoehe % 12) + 12) % 12]}${Math.floor(tonhoehe / 12)}`;

export const istSchwarzeTaste = (tonhoehe: number) => NAMEN[((tonhoehe % 12) + 12) % 12].length > 1;

/** „F#min“, „Bm“, „C“ → Grundton (0..11), Dur oder Moll und der Rest hinter dem Ton. */
function tonart(key: string): { grund: number; moll: boolean; rest: string } | null {
  const m = /^([A-Ga-g])([#b]?)(.*)$/.exec(key.trim());
  if (!m) return null;
  const ton = m[1].toUpperCase() + m[2];
  const grund = Math.max(NAMEN.indexOf(ton), B_NAMEN.indexOf(ton));
  return grund < 0 ? null : { grund, moll: /^\s*m(?!aj)/i.test(m[3]), rest: m[3] };
}

/** Tonart um Halbtöne versetzt: („F#min“, 3) → „Amin“. Unlesbares bleibt, wie es ist. */
export function tonartPlus(key: string, halbtoene: number): string {
  const t = tonart(key);
  return t ? NAMEN[(t.grund + halbtoene + 120) % 12] + t.rest : key;
}

/** Gleiche Tonart oder Paralleltonart (F#min und A). Unlesbares passt nie. */
export function passtTonart(a: string, b: string): boolean {
  const x = tonart(a), y = tonart(b);
  // Moll auf seine Dur-Parallele gebracht: drei Halbtöne höher
  const dur = (t: { grund: number; moll: boolean }) => (t.grund + (t.moll ? 3 : 0)) % 12;
  return !!x && !!y && dur(x) === dur(y);
}

/** Gleiches, halbes oder doppeltes Tempo, auf 1 BPM genau. */
export const passtTempo = (a: number, b: number) => [a, a * 2, a / 2].some(t => Math.abs(t - b) <= 1);

const DUR = [0, 2, 4, 5, 7, 9, 11];
const MOLL = [0, 2, 3, 5, 7, 8, 10];

/** Liegt die Tonhöhe in der Tonleiter? Ohne lesbare Tonart gilt alles als drin. */
export function inTonart(tonhoehe: number, key: string | null): boolean {
  const t = key ? tonart(key) : null;
  return !t || (t.moll ? MOLL : DUR).includes((tonhoehe - t.grund + 120) % 12);
}

/** Länge als Notenwert: 96 Ticks bei 96 je Viertel → „1/4“, vier Viertel → „1 Takt“. */
export function laengeText(ticks: number, ppq: number): string {
  if (!ppq) return "";
  const n = Math.round(ticks / (ppq / 4)); // Sechzehntel
  if (n < 1) return "unter 1/16";
  if (n % 16 === 0) return n === 16 ? "1 Takt" : `${n / 16} Takte`;
  const ggt = (a: number, b: number): number => (b ? ggt(b, a % b) : a);
  const t = ggt(n, 16);
  return `${n / t}/${16 / t}`;
}

/** Akkordformen als Abstände zum Grundton. Die Reihenfolge entscheidet bei
 *  gleichem Tonvorrat: das Einfachere zuerst. */
const FORMEN: [string, number[]][] = [
  ["", [0, 4, 7]], ["m", [0, 3, 7]], ["sus4", [0, 5, 7]], ["sus2", [0, 2, 7]], ["dim", [0, 3, 6]], ["aug", [0, 4, 8]],
  ["7", [0, 4, 7, 10]], ["maj7", [0, 4, 7, 11]], ["m7", [0, 3, 7, 10]], ["6", [0, 4, 7, 9]], ["m6", [0, 3, 7, 9]],
  ["add9", [0, 2, 4, 7]], ["madd9", [0, 2, 3, 7]], ["dim7", [0, 3, 6, 9]], ["m7b5", [0, 3, 6, 10]],
  ["mMaj7", [0, 3, 7, 11]], ["7sus4", [0, 5, 7, 10]], ["aug7", [0, 4, 8, 10]],
  ["9", [0, 2, 4, 7, 10]], ["maj9", [0, 2, 4, 7, 11]], ["m9", [0, 2, 3, 7, 10]], ["6/9", [0, 2, 4, 7, 9]],
  ["m11", [0, 3, 5, 7, 10]], ["7b9", [0, 1, 4, 7, 10]], ["7#9", [0, 3, 4, 7, 10]], ["13", [0, 4, 7, 9, 10]],
  ["m11", [0, 2, 3, 5, 7, 10]], ["maj7#11", [0, 4, 6, 7, 11]],
];

/** Der Akkord aus allem, was zwischen `a` und `b` klingt. `genau`: der Tonvorrat
 *  deckt sich mit einer Form, sonst ist es die nächstliegende.
 *
 *  Töne zählen nach Dauer, kurze Durchgangstöne (unter einem Zehntel des
 *  längsten) fallen raus. Zuerst wird eine Form gesucht, die genau diese Töne
 *  hat, mit dem Basston als Grundton zuerst: so wird aus C E G A über C ein C6
 *  und über A ein Am7. Liegt der Grundton nicht im Bass, steht der Bass hinter
 *  dem Schrägstrich. Danach dasselbe ohne Quinte, die in Voicings oft fehlt.
 *  Einstimmiges (Bass, Melodie) gilt nur als Akkord, wenn es ein vollständiger
 *  Drei- oder Vierklang ist, sonst steht der Ton da, der am längsten klingt. */
function akkordIn(noten: Note[], a: number, b: number): { name: string; genau: boolean; mehrstimmig: boolean } | null {
  const drin = noten.filter(([s, l]) => s < b && s + l > a);
  if (drin.length === 0) return null;
  const w = new Array<number>(12).fill(0);
  for (const [s, l, t] of drin) w[t % 12] += Math.min(s + l, b) - Math.max(s, a);
  const laengster = Math.max(...w);
  const toene = w.flatMap((v, pc) => (v >= laengster * 0.1 ? [pc] : []));
  const bass = Math.min(...drin.filter(n => toene.includes(n[2] % 12)).map(n => n[2])) % 12;
  const staerkster = toene.reduce((x, pc) => (w[pc] > w[x] ? pc : x), bass);
  const mehrstimmig = Math.max(...drin.map(([s]) => drin.filter(([s2, l2]) => s2 <= s && s2 + l2 > s).length)) >= 3;
  const name = (grund: number, form: string) => NAMEN[grund] + form + (grund === bass ? "" : `/${NAMEN[bass]}`);

  if (toene.length < 3) {
    const quinte = toene.length === 2 && toene.includes((bass + 7) % 12);
    return { name: quinte ? `${NAMEN[bass]}5` : NAMEN[staerkster], genau: true, mehrstimmig };
  }
  const wurzeln = [bass, ...toene.filter(pc => pc !== bass)];
  for (const ohneQuinte of [false, true]) {
    if (ohneQuinte && !mehrstimmig) break;
    for (const grund of wurzeln) {
      for (const [n, form] of FORMEN) {
        if (!mehrstimmig && form.length > 4) continue;
        if (ohneQuinte && (form.length < 4 || !form.includes(7))) continue;
        const f = ohneQuinte ? form.filter(x => x !== 7) : form;
        if (f.length === toene.length && f.every(x => toene.includes((grund + x) % 12))) {
          return { name: name(grund, n), genau: true, mehrstimmig };
        }
      }
    }
  }
  if (!mehrstimmig) return { name: NAMEN[staerkster], genau: true, mehrstimmig };

  // Keine Form passt genau: die mit den meisten Treffern und wenigsten Fremdtönen
  const summe = w.reduce((x, y) => x + y, 0);
  let best = "", bestWert = -Infinity;
  for (const grund of wurzeln) {
    for (const [n, form] of FORMEN) {
      let wert = 0;
      w.forEach((v, pc) => { wert += form.includes((pc - grund + 12) % 12) ? v : -v; });
      wert = wert / summe - 0.15 * form.filter(x => !toene.includes((grund + x) % 12)).length + (grund === bass ? 0.05 : 0);
      if (wert > bestWert) { bestWert = wert; best = name(grund, n); }
    }
  }
  return { name: best, genau: false, mehrstimmig };
}

/** Je Takt (4/4) der Akkord. Wechselt er zur Taktmitte und beide Hälften sind
 *  eindeutig, stehen beide da („C#m C#m11“). Leerer Takt: „“. */
export function akkorde(noten: Note[], ppq: number, takte: number): string[] {
  const takt = ppq * 4;
  return Array.from({ length: takt ? takte : 0 }, (_, i) => {
    const a = i * takt, mitte = a + takt / 2, b = a + takt;
    const ganz = akkordIn(noten, a, b);
    if (!ganz) return "";
    const h1 = akkordIn(noten, a, mitte), h2 = akkordIn(noten, mitte, b);
    if (h1?.genau && h2?.genau && h1.mehrstimmig && h2.mehrstimmig) {
      return h1.name === h2.name ? h1.name : `${h1.name} ${h2.name}`;
    }
    return ganz.name;
  });
}
