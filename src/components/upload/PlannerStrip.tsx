// src/components/upload/PlannerStrip.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// 14-day upload planner strip — answers "which days still need beats?"
// at a glance. Days with scheduled/uploaded entries show platform dots,
// empty days render dimmed ("frei"). Display-only in v1; the full calendar
// view will build on the same get_upload_schedule command.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { CalendarDays } from "lucide-react";
import { C } from "../../lib/theme";
import { api } from "../../lib/api";
import type { ScheduleEntry, UploadPlatform } from "../../types/upload";

const DAYS_SHOWN = 14;
const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

const PLATFORM_COLOR: Record<UploadPlatform, string> = {
  beatstars:  "#ff3366",
  soundcloud: "#ff7700",
  youtube:    "#ff0033",
};

interface PlannerStripProps {
  /** Bump to reload (e.g. after a status/date change) */
  refreshKey: number;
}

interface DayCell {
  iso: string;        // YYYY-MM-DD
  weekday: string;    // Mo, Di, ...
  dayOfMonth: number;
  isToday: boolean;
  entries: ScheduleEntry[];
}

export function PlannerStrip({ refreshKey }: PlannerStripProps) {
  const [days, setDays] = useState<DayCell[]>(() => buildDays([]));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const from = toISO(new Date());
    const to = toISO(addDays(new Date(), DAYS_SHOWN - 1));
    api.upload.getSchedule(from, to)
      .then(entries => { if (!cancelled) { setDays(buildDays(entries)); setError(null); } })
      .catch(e => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  return (
    <div style={{
      background: C.surfaceContainerLow,
      border: `1px solid ${C.border10}`,
      borderRadius: 12,
      padding: "14px 18px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <CalendarDays size={13} color={C.onSecondaryFixedVar} strokeWidth={2} />
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.15em",
          textTransform: "uppercase", color: C.onSecondaryFixedVar,
        }}>
          Upload-Planung — nächste {DAYS_SHOWN} Tage
        </span>
        {error && (
          <span style={{ marginLeft: "auto", fontSize: 10, color: C.error }}>{error}</span>
        )}
        <span style={{ marginLeft: error ? 0 : "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {(Object.keys(PLATFORM_COLOR) as UploadPlatform[]).map(p => (
            <span key={p} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: C.onSecondaryFixedVar }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: PLATFORM_COLOR[p] }} />
              {p === "beatstars" ? "BS" : p === "soundcloud" ? "SC" : "YT"}
            </span>
          ))}
        </span>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${DAYS_SHOWN}, 1fr)`,
        gap: 4,
      }}>
        {days.map(day => {
          const busy = day.entries.length > 0;
          const platforms = [...new Set(day.entries.map(e => e.platform))];
          const tooltip = busy
            ? day.entries.map(e => `${e.beat_name} · ${e.platform} (${e.status})`).join("\n")
            : "frei — noch kein Upload geplant";
          return (
            <div
              key={day.iso}
              title={`${day.weekday} ${day.iso}\n${tooltip}`}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                padding: "8px 2px",
                borderRadius: 8,
                background: busy ? C.surfaceContainerHigh : "transparent",
                border: day.isToday
                  ? `1px solid ${C.primary}70`
                  : `1px solid ${busy ? C.border15 : "transparent"}`,
                opacity: busy || day.isToday ? 1 : 0.45,
                transition: "opacity 0.15s",
                cursor: "default",
              }}
            >
              <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", color: day.isToday ? C.primary : C.onSecondaryFixedVar, textTransform: "uppercase" }}>
                {day.weekday}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: day.isToday ? C.primary : C.onSurface }}>
                {day.dayOfMonth}
              </span>
              <span style={{ display: "flex", gap: 3, minHeight: 6 }}>
                {platforms.map(p => (
                  <span key={p} style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: PLATFORM_COLOR[p],
                  }} />
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildDays(entries: ScheduleEntry[]): DayCell[] {
  const byDate = new Map<string, ScheduleEntry[]>();
  for (const e of entries) {
    const list = byDate.get(e.date) ?? [];
    list.push(e);
    byDate.set(e.date, list);
  }
  const today = new Date();
  const todayIso = toISO(today);
  return Array.from({ length: DAYS_SHOWN }, (_, i) => {
    const d = addDays(today, i);
    const iso = toISO(d);
    return {
      iso,
      weekday: WEEKDAYS[d.getDay()],
      dayOfMonth: d.getDate(),
      isToday: iso === todayIso,
      entries: byDate.get(iso) ?? [],
    };
  });
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
