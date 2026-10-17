// src/components/upload/PlannerStrip.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Planung: die nächsten 14 Tage, die Beats ohne Termin und der Upload-Rhythmus.
//
// • Warteschlange links: Beats der letzten 180 Tage ohne Termin, mit Cover.
//   Auf einen Tag ziehen plant sie für alle noch offenen Plattformen ein.
// • Tage zeigen die Covers der geplanten Beats statt farbiger Punkte; ein
//   Klick auf ein Cover öffnet den Beat im Upload-Tab.
// • Rhythmus (z. B. Mo/Mi/Fr): leere Rhythmus-Tage sind gestrichelt, oben
//   steht, wie viele diese Woche noch fehlen, und für den gewählten Beat der
//   nächste freie Tag.
//
// Gezogen wird mit Maus-Ereignissen statt HTML5-Drag-and-Drop — dasselbe wie
// beim Chip-Ziehen (ChipListEditor): Tauri schaltet das HTML5-Ziehen im
// Fenster zugunsten des Datei-Drops ab.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";
import { Check, Music, CalendarPlus } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { C, PLATFORM_CONFIG, type PlatformKey, alpha, radius } from "../../lib/theme";
import { api } from "../../lib/api";
import { useSettings } from "../../contexts/SettingsContext";
import { Button } from "../ui/Button";
import { parseRhythmus, wochenstand, naechsterFreierTag, toISO, addDays, wochenanfang } from "../../lib/planung";
import type { ScheduleEntry, UploadPlatformRow, QueueBeat } from "../../types/upload";

const DAYS_SHOWN = 14;
const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
/** Reihenfolge der Rhythmus-Knöpfe: Mo zuerst, wie im Kalender. */
const WOCHE = [1, 2, 3, 4, 5, 6, 0];
const PLATFORMS: PlatformKey[] = ["beatstars", "soundcloud", "youtube"];

interface PlannerStripProps {
  /** Bump to reload (e.g. after a status/date change) */
  refreshKey: number;
  /** Currently selected beat — enables click-to-schedule */
  beatId: string | null;
  beatName: string | null;
  uploads: UploadPlatformRow[] | null;
  onChanged: () => void;
  /** Einen Beat im Upload-Tab öffnen (Klick auf Cover oder Warteschlange). */
  onSelectBeat: (beatId: string) => void;
}

interface DayCell {
  iso: string;
  weekday: string;
  dayOfMonth: number;
  isToday: boolean;
  isWeekend: boolean;
  /** Ein Eintrag je Beat — die Plattformen hängen daran. */
  beats: { id: string; name: string; cover: string | null; plattformen: PlatformKey[] }[];
}

const bild = (pfad: string) => convertFileSrc(pfad.replace(/\\/g, "/"));

export function PlannerStrip({ refreshKey, beatId, beatName, uploads, onChanged, onSelectBeat }: PlannerStripProps) {
  const { settings, updateSettings } = useSettings();
  const rhythmus = parseRhythmus(settings.uploadDays);

  const [eintraege, setEintraege] = useState<ScheduleEntry[]>([]);
  const [queue, setQueue] = useState<QueueBeat[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [isScheduling, setIsScheduling] = useState(false);
  const [neuLaden, setNeuLaden] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Ab Montag dieser Woche laden: der Wochenstand zählt auch die Tage, die
  // schon vorbei sind. Gezeigt werden die Tage ab heute.
  useEffect(() => {
    let cancelled = false;
    const heute = new Date();
    Promise.all([
      api.upload.getSchedule(toISO(wochenanfang(heute)), toISO(addDays(heute, DAYS_SHOWN - 1))),
      api.upload.getQueue(),
    ])
      .then(([e, q]) => { if (!cancelled) { setEintraege(e); setQueue(q); setError(null); } })
      .catch(e => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, [refreshKey, neuLaden]);

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

  const nachAenderung = () => { setNeuLaden(k => k + 1); onChanged(); };

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
      nachAenderung();
    } catch (e) {
      console.error("[Planner] schedule failed:", e);
    } finally {
      setIsScheduling(false);
    }
  };

  /** Alle offenen Plattformen eines Beats auf einen Tag. */
  const releaseAm = async (id: string, dateIso: string) => {
    setIsScheduling(true);
    try {
      await api.upload.scheduleRelease(id, dateIso);
      setOpenDay(null);
      nachAenderung();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsScheduling(false);
    }
  };

  const rhythmusUmschalten = (tag: number) => {
    const neu = rhythmus.includes(tag) ? rhythmus.filter(t => t !== tag) : [...rhythmus, tag];
    updateSettings({ uploadDays: neu.sort((a, b) => a - b).join(",") });
  };

  // ── Ziehen aus der Warteschlange ────────────────────────────────────────
  const [zug, setZug] = useState<{ beat: QueueBeat; x: number; y: number; ziel: string | null } | null>(null);

  const starteZiehen = (beat: QueueBeat) => (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY };
    let aktiv = false;
    let ziel: string | null = null;
    const vorher = document.body.style.cursor;

    const bewegen = (ev: MouseEvent) => {
      if (!aktiv && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return;
      aktiv = true;
      document.body.style.cursor = "grabbing";
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("[data-tag]");
      ziel = el?.dataset.tag ?? null;
      setZug({ beat, x: ev.clientX, y: ev.clientY, ziel });
    };
    const aufraeumen = () => {
      setZug(null);
      document.body.style.cursor = vorher;
      document.removeEventListener("mousemove", bewegen);
      document.removeEventListener("mouseup", loslassen);
      document.removeEventListener("keydown", taste);
    };
    const loslassen = () => {
      const war = aktiv;
      aufraeumen();
      if (!war) { onSelectBeat(beat.id); return; }     // nur geklickt: Beat öffnen
      if (ziel) releaseAm(beat.id, ziel);
      // Den Klick nach dem Ziehen schlucken (wie beim Chip-Ziehen).
      const schlucken = (c: MouseEvent) => { c.stopPropagation(); c.preventDefault(); };
      window.addEventListener("click", schlucken, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", schlucken, { capture: true }), 0);
    };
    const taste = (k: KeyboardEvent) => { if (k.key === "Escape") { aktiv = false; ziel = null; aufraeumen(); } };

    document.addEventListener("mousemove", bewegen);
    document.addEventListener("mouseup", loslassen);
    document.addEventListener("keydown", taste);
  };

  // ── Ableitungen ─────────────────────────────────────────────────────────
  const heute = new Date();
  const belegt = new Set(eintraege.map(e => e.date));
  const woche = wochenstand(rhythmus, belegt, heute);
  const days = buildDays(eintraege, heute);
  const canSchedule = Boolean(beatId && uploads);
  // Der gewählte Beat hat noch keinen Termin → nächsten freien Rhythmus-Tag anbieten.
  const ohneTermin = canSchedule && !uploads!.some(u => u.scheduled_at || u.status === "uploaded");
  const vorschlag = ohneTermin && rhythmus.length ? naechsterFreierTag(rhythmus, belegt, heute, DAYS_SHOWN) : null;
  const vorschlagText = vorschlag
    ? `${WEEKDAYS[new Date(vorschlag + "T00:00").getDay()]} ${Number(vorschlag.slice(8))}.${Number(vorschlag.slice(5, 7))}.`
    : "";

  return (
    <div ref={containerRef} style={{ position: "relative", display: "flex", flexDirection: "column", gap: 12 }}>
      {/* ── Kopfzeile: Rhythmus, Wochenstand, Vorschlag ─────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: C.onSecondaryFixedVar }}>Upload-Tage</span>
        <div role="group" aria-label="Upload-Rhythmus" style={{ display: "flex", gap: 2 }}>
          {WOCHE.map(t => {
            const an = rhythmus.includes(t);
            return (
              <button
                key={t}
                aria-pressed={an}
                onClick={() => rhythmusUmschalten(t)}
                title={an ? `${WEEKDAYS[t]} ist Upload-Tag — klicken zum Entfernen` : `${WEEKDAYS[t]} als Upload-Tag festlegen`}
                style={{
                  width: 30, padding: "4px 0", borderRadius: radius.control,
                  border: `1px solid ${an ? alpha(C.primary, 0.5) : C.border15}`,
                  background: an ? alpha(C.primary, 0.14) : "transparent",
                  color: an ? C.primary : C.onSecondaryFixedVar,
                  fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
                }}
              >
                {WEEKDAYS[t]}
              </button>
            );
          })}
        </div>

        {rhythmus.length > 0 && (
          <span style={{ fontSize: 12, color: woche.offen.length ? C.onSurface : C.mint }}>
            {woche.offen.length === 0
              ? `Diese Woche erledigt · ${woche.geplant} von ${woche.soll}`
              : `Diese Woche: ${woche.geplant} von ${woche.soll} geplant · noch ${woche.offen.length} ${woche.offen.length === 1 ? "Upload" : "Uploads"}`}
          </span>
        )}

        <span style={{ flex: 1 }} />
        {error && <span style={{ fontSize: 12, color: C.error }}>{error}</span>}
        {vorschlag && beatId && (
          <Button
            variant="secondary" size="sm" icon={CalendarPlus}
            loading={isScheduling}
            onClick={() => releaseAm(beatId, vorschlag)}
            title={`„${beatName}" am nächsten freien Upload-Tag für alle Plattformen einplanen`}
          >
            „{beatName}" am {vorschlagText} planen
          </Button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16, alignItems: "start" }}>
        {/* ── Warteschlange ──────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.onSecondaryFixedVar }}>
            Ohne Termin ({queue.length})
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflowY: "auto" }}>
            {queue.length === 0 && (
              <span style={{ fontSize: 12, color: C.onSecondaryFixedVar, padding: "6px 0" }}>
                Alle Beats der letzten 180 Tage haben einen Termin.
              </span>
            )}
            {queue.map(b => (
              <div
                key={b.id}
                onMouseDown={starteZiehen(b)}
                title={`Auf einen Tag ziehen, um „${b.name}" einzuplanen · Klick öffnet den Beat`}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: 4, borderRadius: radius.control,
                  background: zug?.beat.id === b.id ? C.surfaceContainerHigh : "transparent",
                  opacity: zug?.beat.id === b.id ? 0.5 : 1,
                  cursor: "grab", userSelect: "none",
                }}
                onMouseEnter={e => { if (!zug) e.currentTarget.style.background = C.surfaceContainerHigh; }}
                onMouseLeave={e => { if (!zug) e.currentTarget.style.background = "transparent"; }}
              >
                <Cover pfad={b.cover} groesse={32} />
                <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.onSurface, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {b.name}
                  </span>
                  <span style={{ fontSize: 11, color: b.fehlt.length ? C.primary : C.mint }}>
                    {b.fehlt.length ? `fehlt: ${b.fehlt.join(", ")}` : "bereit"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Die nächsten 14 Tage ───────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${DAYS_SHOWN}, minmax(0, 1fr))`, gap: 4 }}>
          {days.map(day => {
            const busy = day.beats.length > 0;
            const isOpen = openDay === day.iso;
            const rhythmusTag = rhythmus.includes(new Date(day.iso + "T00:00").getDay());
            const fehlt = rhythmusTag && !busy;
            const ziel = zug?.ziel === day.iso;
            return (
              <div key={day.iso} style={{ position: "relative", minWidth: 0 }}>
                <div
                  data-tag={day.iso}
                  role="button"
                  tabIndex={0}
                  title={
                    busy ? day.beats.map(b => `${b.name} · ${b.plattformen.map(p => PLATFORM_CONFIG[p].label).join(", ")}`).join("\n")
                    : fehlt ? "Upload-Tag — noch nichts geplant"
                    : canSchedule ? `frei — klicken, um „${beatName}" hier zu planen` : "frei"
                  }
                  onClick={() => canSchedule && setOpenDay(isOpen ? null : day.iso)}
                  onKeyDown={e => { if (e.key === "Enter" && canSchedule) setOpenDay(isOpen ? null : day.iso); }}
                  style={{
                    minHeight: 104,
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                    padding: "10px 2px",
                    borderRadius: radius.control,
                    background: ziel ? alpha(C.primary, 0.16)
                      : busy ? C.surfaceContainerHigh
                      : day.isWeekend ? "rgba(255,255,255,0.02)" : "transparent",
                    border: ziel ? `1px solid ${C.primary}`
                      : fehlt ? `1px dashed ${alpha(C.primary, 0.55)}`
                      : day.isToday ? `1px solid ${alpha(C.primary, 0.5)}`
                      : `1px solid ${busy || isOpen ? C.border15 : "transparent"}`,
                    cursor: canSchedule ? "pointer" : "default",
                    transition: "background 0.12s, border-color 0.12s",
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: day.isToday ? C.primary : C.onSecondaryFixedVar }}>
                    {day.isToday ? "Heute" : day.weekday}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: day.isToday ? C.primary : busy ? C.onSurface : C.onSurfaceVariant }}>
                    {day.dayOfMonth}
                  </span>
                  {day.beats.slice(0, 2).map(b => (
                    <button
                      key={b.id}
                      onClick={e => { e.stopPropagation(); onSelectBeat(b.id); }}
                      title={`${b.name} öffnen`}
                      style={{ padding: 0, border: "none", background: "none", cursor: "pointer", borderRadius: 4 }}
                    >
                      <Cover pfad={b.cover} groesse={30} />
                    </button>
                  ))}
                  {day.beats.length > 2 && (
                    <span style={{ fontSize: 11, color: C.onSecondaryFixedVar }}>+{day.beats.length - 2}</span>
                  )}
                </div>

                {/* Einplanen per Klick — wie bisher, plus „Alle Plattformen" */}
                {isOpen && canSchedule && (
                  <div style={{
                    position: "absolute", bottom: "100%", left: "50%",
                    transform: "translateX(-50%)", marginBottom: 6,
                    minWidth: 200,
                    background: C.surfaceContainer,
                    border: `1px solid ${C.border20}`,
                    borderRadius: radius.control,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                    zIndex: 20, padding: 10,
                    display: "flex", flexDirection: "column", gap: 4,
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.onSurfaceVariant, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      „{beatName}" · {day.weekday} {day.dayOfMonth}.
                    </div>
                    <Button variant="primary" size="sm" icon={CalendarPlus} disabled={isScheduling} onClick={() => releaseAm(beatId!, day.iso)}>
                      Alle Plattformen
                    </Button>
                    {PLATFORMS.map(p => {
                      const row = uploads!.find(u => u.platform === p);
                      const alreadyHere = row?.scheduled_at === day.iso;
                      return (
                        <Button
                          key={p}
                          variant="ghost" size="sm"
                          disabled={isScheduling || alreadyHere}
                          onClick={() => scheduleOn(p, day.iso)}
                          style={{ justifyContent: "flex-start" }}
                        >
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: PLATFORM_CONFIG[p].color }} />
                          {PLATFORM_CONFIG[p].label}
                          {alreadyHere && <Check size={11} color={C.mint} strokeWidth={2.5} style={{ marginLeft: "auto" }} />}
                          {row?.scheduled_at && !alreadyHere && (
                            <span style={{ marginLeft: "auto", fontSize: 11, color: C.onSecondaryFixedVar }}>
                              {row.scheduled_at.slice(5)}
                            </span>
                          )}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Das Abbild am Zeiger */}
      {zug && (
        <div style={{
          position: "fixed", left: zug.x + 12, top: zug.y + 12, zIndex: 1000,
          display: "flex", alignItems: "center", gap: 8,
          padding: "6px 10px 6px 6px", borderRadius: radius.control,
          background: C.surfaceContainerHighest,
          border: `1px solid ${zug.ziel ? C.primary : C.border20}`,
          boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
          pointerEvents: "none", fontSize: 12, fontWeight: 600, color: C.onSurface,
        }}>
          <Cover pfad={zug.beat.cover} groesse={26} />
          {zug.beat.name}
          {zug.ziel && (
            <span style={{ color: C.primary, fontWeight: 600 }}>
              → {WEEKDAYS[new Date(zug.ziel + "T00:00").getDay()]} {Number(zug.ziel.slice(8))}.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Cover({ pfad, groesse }: { pfad: string | null; groesse: number }) {
  return (
    <span style={{
      width: groesse, height: groesse, flexShrink: 0, borderRadius: 4, overflow: "hidden",
      background: C.surfaceContainerHighest,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {pfad
        ? <img src={bild(pfad)} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <Music size={Math.round(groesse * 0.45)} color={C.onSecondaryFixedVar} strokeWidth={1.5} />}
    </span>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildDays(entries: ScheduleEntry[], heute: Date): DayCell[] {
  const heuteIso = toISO(heute);
  return Array.from({ length: DAYS_SHOWN }, (_, i) => {
    const d = addDays(heute, i);
    const iso = toISO(d);
    const beats = new Map<string, DayCell["beats"][number]>();
    for (const e of entries.filter(x => x.date === iso)) {
      const b = beats.get(e.beat_id) ?? { id: e.beat_id, name: e.beat_name, cover: e.cover, plattformen: [] };
      b.plattformen.push(e.platform as PlatformKey);
      beats.set(e.beat_id, b);
    }
    return {
      iso,
      weekday: WEEKDAYS[d.getDay()],
      dayOfMonth: d.getDate(),
      isToday: iso === heuteIso,
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
      beats: [...beats.values()],
    };
  });
}
