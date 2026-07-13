// src/components/upload/PlannerStrip.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// 14-day upload planner strip — answers "which days still need beats?".
// Free days render as inviting dashed "+" slots; busy days show platform
// dots. Clicking a day (with a beat selected) opens a small popover to
// schedule that beat on a platform — this calls the SAME command as the
// date field in UploadStatusCard (update_upload_status, draft → scheduled).
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";
import { CalendarDays, Plus, Check } from "lucide-react";
import { C, PLATFORM_CONFIG, type PlatformKey } from "../../lib/theme";
import { api } from "../../lib/api";
import type { ScheduleEntry, UploadPlatformRow } from "../../types/upload";

const DAYS_SHOWN = 14;
const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const PLATFORMS: PlatformKey[] = ["beatstars", "soundcloud", "youtube"];

interface PlannerStripProps {
  /** Bump to reload (e.g. after a status/date change) */
  refreshKey: number;
  /** Currently selected beat — enables click-to-schedule */
  beatId: string | null;
  beatName: string | null;
  uploads: UploadPlatformRow[] | null;
  onChanged: () => void;
}

interface DayCell {
  iso: string;
  weekday: string;
  dayOfMonth: number;
  isToday: boolean;
  isWeekend: boolean;
  entries: ScheduleEntry[];
}

export function PlannerStrip({ refreshKey, beatId, beatName, uploads, onChanged }: PlannerStripProps) {
  const [days, setDays] = useState<DayCell[]>(() => buildDays([]));
  const [error, setError] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [isScheduling, setIsScheduling] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const from = toISO(new Date());
    const to = toISO(addDays(new Date(), DAYS_SHOWN - 1));
    api.upload.getSchedule(from, to)
      .then(entries => { if (!cancelled) { setDays(buildDays(entries)); setError(null); } })
      .catch(e => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  // Close popover on outside click / beat change
  useEffect(() => {
    if (!openDay) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpenDay(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openDay]);
  useEffect(() => { setOpenDay(null); }, [beatId]);

  // Same semantics as UploadStatusCard.handleScheduledChange:
  // set scheduled_at, promote draft → scheduled, keep everything else.
  const scheduleOn = async (platform: PlatformKey, dateIso: string) => {
    if (!beatId || !uploads) return;
    const row = uploads.find(u => u.platform === platform);
    if (!row) return;
    setIsScheduling(true);
    try {
      await api.upload.updateUploadStatus({
        beat_id:      beatId,
        platform,
        status:       row.status === "draft" ? "scheduled" : row.status,
        scheduled_at: dateIso,
        uploaded_at:  row.uploaded_at,
        url:          row.url,
      });
      setOpenDay(null);
      onChanged();
    } catch (e) {
      console.error("[Planner] schedule failed:", e);
    } finally {
      setIsScheduling(false);
    }
  };

  const canSchedule = Boolean(beatId && uploads);

  return (
    <div ref={containerRef} style={{
      background: C.surfaceContainerLow,
      border: `1px solid ${C.border10}`,
      borderRadius: 12,
      padding: "14px 18px",
      position: "relative",
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
          {PLATFORMS.map(p => (
            <span key={p} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: C.onSecondaryFixedVar }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: PLATFORM_CONFIG[p].color }} />
              {PLATFORM_CONFIG[p].short}
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
          const dayPlatforms = [...new Set(day.entries.map(e => e.platform))];
          const isOpen = openDay === day.iso;
          const tooltip = busy
            ? day.entries.map(e => `${e.beat_name} · ${PLATFORM_CONFIG[e.platform].label} (${e.status})`).join("\n")
            : canSchedule
              ? `frei — klicken, um „${beatName}" hier zu planen`
              : "frei — Beat wählen, um zu planen";
          return (
            <div key={day.iso} style={{ position: "relative" }}>
              <button
                title={`${day.weekday} ${day.iso}\n${tooltip}`}
                onClick={() => canSchedule && setOpenDay(isOpen ? null : day.iso)}
                style={{
                  width: "100%",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                  padding: "8px 2px",
                  borderRadius: 8,
                  background: busy
                    ? C.surfaceContainerHigh
                    : day.isWeekend ? "rgba(255,255,255,0.02)" : "transparent",
                  border: day.isToday
                    ? `1px solid ${C.primary}80`
                    : isOpen
                      ? `1px solid ${C.border30}`
                      : `1px solid ${busy ? C.border15 : "transparent"}`,
                  cursor: canSchedule ? "pointer" : "default",
                  transition: "background 0.15s, transform 0.1s",
                }}
                onMouseEnter={e => { if (canSchedule && !busy) e.currentTarget.style.background = C.surfaceContainerHighest ?? C.surfaceContainerHigh; }}
                onMouseLeave={e => { if (!busy) e.currentTarget.style.background = day.isWeekend ? "rgba(255,255,255,0.02)" : "transparent"; }}
              >
                <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", color: day.isToday ? C.primary : C.onSecondaryFixedVar, textTransform: "uppercase" }}>
                  {day.isToday ? "Heute" : day.weekday}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: day.isToday ? C.primary : busy ? C.onSurface : C.onSurfaceVariant }}>
                  {day.dayOfMonth}
                </span>
                {busy ? (
                  <span style={{ display: "flex", gap: 3, minHeight: 10, alignItems: "center" }}>
                    {dayPlatforms.map(p => (
                      <span key={p} style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: PLATFORM_CONFIG[p].color,
                      }} />
                    ))}
                  </span>
                ) : (
                  // Free day = inviting slot, not a disabled cell
                  <span style={{
                    width: 10, height: 10, borderRadius: "50%",
                    border: `1px dashed ${C.border30}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Plus size={7} color={C.onSecondaryFixedVar} strokeWidth={2} />
                  </span>
                )}
              </button>

              {/* Schedule popover */}
              {isOpen && canSchedule && (
                <div style={{
                  position: "absolute", top: "100%", left: "50%",
                  transform: "translateX(-50%)",
                  marginTop: 6,
                  minWidth: 190,
                  background: C.surfaceContainer,
                  border: `1px solid ${C.border20}`,
                  borderRadius: 8,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                  zIndex: 20,
                  padding: 10,
                }}>
                  <div style={{
                    fontSize: 10, fontWeight: 600, color: C.onSurfaceVariant,
                    marginBottom: 8, lineHeight: 1.4,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    „{beatName}" planen · {day.weekday} {day.dayOfMonth}.
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {PLATFORMS.map(p => {
                      const row = uploads!.find(u => u.platform === p);
                      const alreadyHere = row?.scheduled_at === day.iso;
                      return (
                        <button
                          key={p}
                          disabled={isScheduling || alreadyHere}
                          onClick={() => scheduleOn(p, day.iso)}
                          style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "6px 9px",
                            background: alreadyHere ? "rgba(52,211,153,0.08)" : C.surfaceContainerLowest,
                            border: `1px solid ${alreadyHere ? "rgba(52,211,153,0.30)" : C.border15}`,
                            borderRadius: 6,
                            cursor: isScheduling || alreadyHere ? "default" : "pointer",
                            fontSize: 11, fontWeight: 600,
                            color: C.onSurface,
                            opacity: isScheduling ? 0.6 : 1,
                          }}
                        >
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: PLATFORM_CONFIG[p].color }} />
                          {PLATFORM_CONFIG[p].label}
                          {alreadyHere && <Check size={11} color={C.mint} strokeWidth={2.5} style={{ marginLeft: "auto" }} />}
                          {row?.scheduled_at && !alreadyHere && (
                            <span style={{ marginLeft: "auto", fontSize: 9, color: C.onSecondaryFixedVar }}>
                              {row.scheduled_at.slice(5)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
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
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
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
