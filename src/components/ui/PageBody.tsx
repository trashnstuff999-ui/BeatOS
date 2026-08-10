// src/components/ui/PageBody.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Der scrollende Inhaltsbereich unter der Kopfzeile.
//
// Vorher hatte jede Seite ihre eigene Maximalbreite — 1400 (Studio), 1500
// (Create), 1720 (Upload), 1800 (Dashboard), 720 (Settings/Support), Browse
// unbegrenzt — bei zwei verschiedenen Innenabstaenden. Beim Tab-Wechsel
// verschob sich dadurch der ganze Inhalt.
//
// Es bleiben drei Breiten, und die unterscheiden sich aus einem Grund:
//   wide    — Standard. Raster, Tabellen, Karten.
//   reading — Formulare und Fliesstext. 1600px breite Eingabefelder liest niemand.
//   full    — randlos, wenn das Raster jede Spalte braucht (Cover-Grid in Browse).
// ═══════════════════════════════════════════════════════════════════════════════

import React from "react";

const WIDTHS = {
  wide: 1600,
  reading: 720,
  full: undefined,
} as const;

interface PageBodyProps {
  width?: keyof typeof WIDTHS;
  /** Abstand zwischen den direkten Kindern. */
  gap?: number;
  children: React.ReactNode;
  ref?: React.Ref<HTMLDivElement>;
}

export function PageBody({ width = "wide", gap = 24, children, ref }: PageBodyProps) {
  return (
    <div ref={ref} style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
      <div style={{
        maxWidth: WIDTHS[width],
        // Breite Raster mittig, damit sie auf grossen Monitoren nicht am Rand
        // kleben. Die Lesespalte NICHT — die steht links, direkt neben der
        // Sektions-Navigation. Zentriert schwaemme ein 720px-Formular sonst
        // allein in der Mitte eines 2400px-Fensters.
        margin: width === "reading" ? undefined : "0 auto",
        padding: "32px 48px",
        display: "flex", flexDirection: "column", gap,
      }}>
        {children}
      </div>
    </div>
  );
}
