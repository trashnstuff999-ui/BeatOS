// src/lib/videoSync.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Video-Tab: das stumme Video folgt dem Ton. Der Ton ist der Taktgeber — er
// läuft beim Tab-Wechsel ungestört weiter, nur das Bild gleicht sich an.
//
// Kleine Abstände holt das Video auf, indem es minimal schneller oder
// langsamer läuft (unsichtbar). Erst ab SPRUNG springt es hart — nach dem
// Öffnen des Tabs, nach einem Sprung in der Zeitleiste, beim Wiederholen.
// Reine Funktion — der Test prüft sie ohne Video-Element.
// ═══════════════════════════════════════════════════════════════════════════════

/** Ab diesem Abstand (s) springt das Video, statt aufzuholen. */
export const SPRUNG = 0.25;
/** Im Stand genauer: beim Ziehen in der Zeitleiste soll das Bild sitzen. */
const SPRUNG_STEHEND = 0.04;
/** Springen dauert einen Moment — so weit voraus landen, der Rest holt sich
 *  ein. Nur der Startwert: der Video-Tab misst, wie lange ein Sprung wirklich
 *  dauert. Mit festen 0,08 s jagte ein langsamer Sprung dem Ton hinterher —
 *  angekommen, war der Ton schon wieder zu weit, und es sprang endlos. */
export const VORLAUF = 0.08;
/** Darunter gilt es als synchron. */
const RUHE = 0.02;

export interface Abgleich {
  /** Dorthin springen, sonst null. */
  ziel: number | null;
  /** Abspielgeschwindigkeit des Videos. */
  rate: number;
  /** Soll das Video laufen? */
  laufen: boolean;
}

export function abgleich(video: number, audio: number, laenge: number, laeuft: boolean, vorlauf = VORLAUF): Abgleich {
  // Ton länger als das Video: das letzte Bild bleibt stehen.
  if (audio >= laenge) return { ziel: null, rate: 1, laufen: false };
  const abstand = video - audio;
  // Direkt nach einem Sprung liegt das Video bis zu `vorlauf` vorn — das ist
  // gewollt und kein Grund, gleich wieder zu springen.
  if (abstand > Math.max(SPRUNG, vorlauf + RUHE) || abstand < -(laeuft ? SPRUNG : SPRUNG_STEHEND)
      || (!laeuft && abstand > SPRUNG_STEHEND)) {
    return { ziel: laeuft ? Math.min(audio + vorlauf, laenge) : audio, rate: 1, laufen: laeuft };
  }
  if (!laeuft || Math.abs(abstand) < RUHE) return { ziel: null, rate: 1, laufen: laeuft };
  // Vorn → langsamer, hinten → schneller; höchstens 5 %, das hört und sieht man nicht.
  return { ziel: null, rate: Math.max(0.95, Math.min(1.05, 1 - abstand)), laufen: true };
}
