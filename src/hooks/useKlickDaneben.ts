// src/hooks/useKlickDaneben.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Ein offenes Seitenpanel schließt, wenn man daneben klickt.
//
// Die Panels (Archiv-Detailpanel, Studio-Inspector) liegen fix über der rechten
// Seite. Sie zuzuklappen ging nur über Esc oder das Kreuz — ein Klick daneben
// tat schlicht nichts, obwohl das die naheliegende Geste ist.
//
// Drei Markierungen im DOM steuern das, statt einer Liste von Sonderfällen:
//
//   data-app-flaeche  Hier heißt ein Klick „ich bin woanders": die Seite selbst
//                     und die Seitenleiste. Bewusst NICHT der Player unten —
//                     wer die Lautstärke zieht, hört zu und ist nicht fertig.
//   data-panel        Das Panel selbst. Klicks darin sind nicht „daneben".
//   data-auswahl      Ein Eintrag der Liste. Ein Klick darauf wählt den
//                     nächsten aus, das Panel zieht mit, statt zuzugehen.
//
// Dazu, ohne eigene Markierung: Bedienelemente (Knopf, Link, Eingabe, Auswahl,
// sortierbarer Spaltenkopf) und alles in einem Dialog (`data-modal`) — was dort
// passiert, geht die Seite darunter nichts an.
// ═══════════════════════════════════════════════════════════════════════════════

import { useEffect, useRef } from "react";

/** Was ein Klick treffen kann, ohne dass er „daneben" heißt. */
const NICHT_DANEBEN = [
  "[data-panel]",
  "[data-auswahl]",
  "[data-beat-id]",
  "[data-modal]",
  "button",
  "a",
  "input",
  "select",
  "textarea",
  '[role="button"]',
].join(", ");

export function useKlickDaneben(offen: boolean, onClose: () => void) {
  // Der Rückruf steckt in einer Ref, damit der Zuhörer nicht bei jedem Render
  // ab- und wieder angemeldet wird — die Aufrufer geben ihn meist als frische
  // Pfeilfunktion herein.
  const gemerkt = useRef(onClose);
  useEffect(() => { gemerkt.current = onClose; });

  useEffect(() => {
    if (!offen) return;
    const daneben = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el?.closest("[data-app-flaeche]") && !el.closest(NICHT_DANEBEN);
    };
    // Ein „click" landet beim Loslassen auf dem gemeinsamen Vorfahren von
    // Drücken und Loslassen. Wer in der Notiz Text markiert und neben dem
    // Panel loslässt, erzeugt so einen Klick auf die Seite — das Panel ging
    // zu. Deshalb zählt nur, wenn auch das DRÜCKEN schon daneben war.
    let gedruecktDaneben = false;
    const aufDruecken = (e: MouseEvent) => { gedruecktDaneben = daneben(e.target); };
    const aufKlick = (e: MouseEvent) => {
      if (gedruecktDaneben && daneben(e.target)) gemerkt.current();
      gedruecktDaneben = false;
    };
    // Am document: die Seitenleiste hängt in App.tsx und liegt gar nicht unter
    // der Seite, die das Panel zeigt.
    document.addEventListener("mousedown", aufDruecken);
    document.addEventListener("click", aufKlick);
    return () => {
      document.removeEventListener("mousedown", aufDruecken);
      document.removeEventListener("click", aufKlick);
    };
  }, [offen]);
}
