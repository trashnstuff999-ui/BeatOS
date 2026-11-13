// src/components/browse/ArchivBand.tsx
// Look „Wucht": das Zahlenband über dem Archiv. Groß die Treffer, daneben die
// Beats je Status (ein Klick filtert danach), rechts der Zufall.

import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { C, STATUS_CONFIG, STATUS_ITEMS, alpha } from "../../lib/theme";
import type { BeatStatus } from "../../types/browse";

export function ArchivBand({ anzahl, gefiltert, status, onStatus, onZufall, refreshKey }: {
  /** Treffer mit den aktuellen Filtern */
  anzahl: number;
  /** Suche oder Filter aktiv: dann heißt die Zahl „Treffer“ */
  gefiltert: boolean;
  status: BeatStatus | "all";
  onStatus: (s: BeatStatus | "all") => void;
  onZufall: () => void;
  refreshKey: unknown;
}) {
  const [jeStatus, setJeStatus] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    let ab = false;
    api.stats.get(null)
      .then(s => { if (!ab) setJeStatus(s.by_status); })
      .catch(() => {});
    return () => { ab = true; };
  }, [refreshKey]);

  return (
    <section aria-label="Archiv in Zahlen" style={{
      display: "flex", alignItems: "center", gap: 26, flexWrap: "wrap",
      padding: "22px 26px", borderRadius: 24,
      background: `color-mix(in srgb, ${C.primary} 6%, ${C.surfaceContainerLow})`,
      border: `1px solid ${alpha(C.primary, 0.28)}`,
      boxShadow: `0 14px 38px -14px ${alpha(C.primary, 0.35)}`,
    }}>
      <div style={{
        fontSize: "clamp(48px, 6vw, 80px)", fontWeight: 700, lineHeight: 0.9, color: C.primary,
        textShadow: `0 0 19px ${alpha(C.primary, 0.3)}`, fontVariantNumeric: "tabular-nums",
      }}>
        {anzahl}
      </div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.onSurface }}>{gefiltert ? "Treffer" : "Beats im Archiv"}</div>
      </div>
      <div role="group" aria-label="Nach Status filtern" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginLeft: "auto" }}>
        {STATUS_ITEMS.map(({ key, label }) => {
          const farbe = STATUS_CONFIG[key].color;
          const an = status === key;
          return (
            <button key={key} className="ar-sk" aria-pressed={an}
              onClick={() => onStatus(an ? "all" : key as BeatStatus)}
              title={an ? "Filter entfernen" : `Nur ${label}`}
              style={{
                "--c": farbe,
                border: `1px solid ${C.border30}`, background: "rgba(14,14,14,0.55)", borderRadius: 16,
                padding: "12px 16px", minWidth: 104, textAlign: "left", cursor: "pointer", fontFamily: "inherit",
              } as React.CSSProperties}>
              <b style={{ display: "block", fontSize: 28, lineHeight: 1, color: farbe }}>{jeStatus ? jeStatus[key] ?? 0 : "–"}</b>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.onSurfaceVariant }}>{label}</span>
            </button>
          );
        })}
      </div>
      <button className="ar-zufall" onClick={onZufall} disabled={anzahl === 0} title="Zufälliger Beat" style={{
        height: 56, padding: "0 20px", borderRadius: 16, border: "none",
        background: C.primary, color: C.onPrimary, fontSize: 15, fontWeight: 800, fontFamily: "inherit",
        display: "inline-flex", alignItems: "center", gap: 10, cursor: anzahl === 0 ? "default" : "pointer",
        opacity: anzahl === 0 ? 0.5 : 1,
        boxShadow: `0 10px 24px -10px ${alpha(C.primary, 0.64)}`,
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
          <rect x="3" y="3" width="18" height="18" rx="4" />
          <circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" />
          <circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" />
          <circle cx="12" cy="12" r="1.3" fill="currentColor" />
        </svg>
        Zufall
      </button>
    </section>
  );
}
