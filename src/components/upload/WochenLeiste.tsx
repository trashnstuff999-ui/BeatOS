// src/components/upload/WochenLeiste.tsx
// In der zugeklappten Planungs-Leiste: die nächsten Tage mit je einem
// Leuchtpunkt pro geplantem oder hochgeladenem Upload. Nur Anzeige — ein Klick
// auf die Leiste klappt die Planung auf.

import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { C, PLATFORM_CONFIG } from "../../lib/theme";
import { addDays, toISO } from "../../lib/planung";
import type { ScheduleEntry } from "../../types/upload";

const TAGE = 10;
const WOCHENTAG = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

export function WochenLeiste({ refreshKey }: { refreshKey: number }) {
  const [eintraege, setEintraege] = useState<ScheduleEntry[]>([]);
  const heute = new Date();
  const von = toISO(heute);

  useEffect(() => {
    let ab = false;
    api.upload.getSchedule(von, toISO(addDays(new Date(), TAGE - 1)))
      .then(e => { if (!ab) setEintraege(e ?? []); })
      .catch(() => {});
    return () => { ab = true; };
  }, [von, refreshKey]);

  return (
    <span style={{ display: "flex", gap: 6, minWidth: 0, overflow: "hidden" }}>
      {Array.from({ length: TAGE }, (_, i) => {
        const d = addDays(heute, i);
        const iso = toISO(d);
        const anTag = eintraege.filter(e => e.date === iso);
        return (
          <span
            key={iso}
            className="ul-tag"
            title={anTag.length ? anTag.map(e => `${PLATFORM_CONFIG[e.platform].label}: ${e.beat_name}`).join("\n") : undefined}
            style={{
              minWidth: 60, padding: "5px 8px", borderRadius: 12, textAlign: "center",
              fontSize: 11, fontWeight: 700, letterSpacing: 0, textTransform: "none",
              color: i === 0 ? C.onSurface : C.onSurfaceVariant,
              background: C.surfaceContainer,
              border: `1px solid ${i === 0 ? C.primary : C.border30}`,
              boxShadow: i === 0 ? `0 0 0 1px color-mix(in srgb, ${C.primary} 64%, transparent)` : "none",
            }}
          >
            {WOCHENTAG[d.getDay()]} {d.getDate()}.
            <span style={{ display: "flex", justifyContent: "center", gap: 3, marginTop: 4, height: 8 }}>
              {anTag.map((e, j) => {
                const f = PLATFORM_CONFIG[e.platform].color;
                return <i key={j} style={{ width: 8, height: 8, borderRadius: "50%", background: f, boxShadow: `0 0 6px color-mix(in srgb, ${f} 64%, transparent)` }} />;
              })}
            </span>
          </span>
        );
      })}
    </span>
  );
}
