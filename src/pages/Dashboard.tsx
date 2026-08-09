// src/pages/Dashboard.tsx — Aktionszentrale: "Was steht heute an?" + Analytics
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  RefreshCw, Archive, Play, Sparkles, Piano, Star, Music,
  CalendarClock, Rocket, Disc3, Flame, ArrowRight, Upload as UploadIcon,
} from "lucide-react";
import { api } from "../lib/api";
import type { Stats, DashboardActions } from "../types/stats";
import { MAJOR_KEYS, MINOR_KEYS } from "../types/browse";
import type { Beat } from "../types/browse";
import { useAudioPlayerContext } from "../contexts/AudioPlayerContext";
import { C, commonStyles, STUDIO_STATUS_CONFIG, STATUS_ITEMS } from "../lib/theme";
import { getTagCategoryFromDb, TAG_COLORS, type TagCategory } from "../lib/tags";
import { StatusPill } from "../components/Tagpill";
import { Select } from "../components/ui";

// ── Aktions-Karte: eine Zahl, eine Handlung, ein Klick ───────────────────────
function ActionCard({ title, value, hint, icon, color, onClick }: {
  title: string; value: number; hint: string;
  icon: React.ReactNode; color: string; onClick: () => void;
}) {
  const active = value > 0;
  return (
    <button
      onClick={onClick}
      style={{
        ...commonStyles.card,
        textAlign: "left",
        padding: 18,
        border: `1px solid ${active ? `${color}35` : C.border10}`,
        boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        cursor: "pointer",
        transition: "border-color 0.2s, transform 0.15s",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = `${color}70`; e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = active ? `${color}35` : C.border10; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ color, display: "flex" }}>{icon}</span>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: C.onSurfaceVariant }}>
          {title}
        </span>
        <ArrowRight size={11} color={C.onSecondaryFixedVar} style={{ marginLeft: "auto" }} />
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, color: active ? C.onSurface : C.onSecondaryFixedVar, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: C.onSecondaryFixedVar, marginTop: 6 }}>{hint}</div>
    </button>
  );
}

// ── Upload-Rhythmus: 8-Wochen-Balken + Serie ─────────────────────────────────
function RhythmCard({ actions }: { actions: DashboardActions }) {
  const weeks = actions.uploads_per_week;
  const max = Math.max(1, ...weeks.map(w => w.count));
  return (
    <div style={{
      ...commonStyles.card, padding: 18,
      boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Flame size={14} color={actions.current_streak_weeks > 0 ? C.primary : C.onSecondaryFixedVar} />
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: C.onSurfaceVariant }}>
          Upload-Rhythmus
        </span>
        <span style={{
          marginLeft: "auto",
          fontSize: 10, fontWeight: 700,
          color: actions.current_streak_weeks > 0 ? C.primary : C.onSecondaryFixedVar,
        }}>
          {actions.current_streak_weeks > 0
            ? `${actions.current_streak_weeks} ${actions.current_streak_weeks === 1 ? "Woche" : "Wochen"} Serie`
            : "keine Serie"}
        </span>
      </div>
      {/* Hoehen in Prozent statt fester Pixel — so fuellen die Balken die Karte,
          statt in einem 44px-Streifen zu kleben. */}
      <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 5, minHeight: 56 }}>
        {weeks.map((w, i) => {
          const isCurrent = i === weeks.length - 1;
          const h = w.count === 0 ? "6%" : `${Math.max((w.count / max) * 100, 14)}%`;
          return (
            <div
              key={w.week_start}
              title={`Woche ab ${w.week_start}: ${w.count} Upload${w.count === 1 ? "" : "s"}`}
              style={{
                flex: 1, height: h, borderRadius: 3,
                background: w.count === 0
                  ? "rgba(255,255,255,0.06)"
                  : isCurrent ? C.primary : "rgba(253,161,36,0.45)",
                transition: "height 0.2s",
              }}
            />
          );
        })}
      </div>
      <div style={{ fontSize: 9, color: C.onSecondaryFixedVar, marginTop: 6 }}>
        letzte 8 Wochen · aktuelle Woche rechts
      </div>
    </div>
  );
}

// ── Pipeline-Funnel: Studio → Archiv → Geplant → Live ────────────────────────
const STUDIO_STAGES = ["idea", "wip", "exported", "ready"] as const;

function PipelineFunnel({ stats, actions, onNavigate, onFilter }: {
  stats: Stats;
  actions: DashboardActions;
  onNavigate: (path: string) => void;
  onFilter: (filter: object) => void;
}) {
  // Summe und Aufschluesselung aus derselben Quelle — sonst passt die grosse Zahl
  // nicht zur Zeile darunter, sobald ein weiterer Studio-Status dazukommt.
  const studioCounts = STUDIO_STAGES.map(s => actions.studio_by_status[s] ?? 0);
  const studioTotal = studioCounts.reduce((a, b) => a + b, 0);

  const stages: Array<{ label: string; value: number; detail: React.ReactNode; icon: React.ReactNode; color: string; path: string }> = [
    {
      label: "Studio", value: studioTotal,
      detail: STUDIO_STAGES.map((s, i) => `${studioCounts[i]} ${STUDIO_STATUS_CONFIG[s].label}`).join(" · "),
      icon: <Disc3 size={15} />, color: "#9492ff", path: "/studio",
    },
    {
      label: "Archiv", value: stats.total,
      detail: (
        <>
          {stats.this_month} neu diesen Monat ·{" "}
          <span
            onClick={e => { e.stopPropagation(); onFilter({ onlyFavs: true }); }}
            style={{ color: C.error, fontWeight: 700, cursor: "pointer" }}
          >
            {stats.favorites} Favoriten
          </span>
        </>
      ),
      icon: <Archive size={15} />, color: C.primary, path: "/browse",
    },
    {
      label: "Geplant", value: actions.scheduled_total,
      detail: `${actions.scheduled_next_7} in den nächsten 7 Tagen`,
      icon: <CalendarClock size={15} />, color: "#fda124", path: "/upload",
    },
    {
      label: "Veröffentlicht", value: actions.published_beats,
      detail: "Beats mit mind. 1 Upload",
      icon: <UploadIcon size={15} />, color: C.mint, path: "/upload",
    },
  ];

  return (
    <div style={{
      ...commonStyles.card,
      boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
      padding: "18px 24px",
      display: "flex", alignItems: "center", gap: 10,
    }}>
      {stages.map((stage, i) => (
        <div key={stage.label} style={{ display: "contents" }}>
          {i > 0 && <ArrowRight size={16} color={C.onSecondaryFixedVar} style={{ flexShrink: 0, opacity: 0.5 }} />}
          <button
            onClick={() => onNavigate(stage.path)}
            style={{
              flex: 1, textAlign: "left",
              background: "transparent", border: "none",
              cursor: "pointer", padding: "6px 10px", borderRadius: 8,
              transition: "background 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = C.surfaceContainerHigh; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 7, color: stage.color, marginBottom: 6 }}>
              {stage.icon}
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.onSurfaceVariant }}>
                {stage.label}
              </span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.onSurface, lineHeight: 1 }}>{stage.value}</div>
            <div style={{ fontSize: 9, color: C.onSecondaryFixedVar, marginTop: 5 }}>{stage.detail}</div>
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Status-Verteilung ─────────────────────────────────────────────────────────
function StatusBreakdown({ stats, onNavigate }: { stats: Stats; onNavigate: (filter: object) => void }) {
  // Labels und Farben aus STATUS_CONFIG — dieselbe Quelle wie die Status-Pillen
  // in Browse und in "Zuletzt hinzugefuegt". Vorher stand "Sold" hier auf
  // #ef4444, die Pille daneben auf #ff7351.
  const bars = STATUS_ITEMS.map(s => ({
    ...s,
    count: stats.by_status[s.key as keyof Stats["by_status"]] ?? 0,
  }));
  // Nenner = Summe der gezeigten Balken. stats.total zaehlt auch Beats mit
  // unbekanntem Status — damit haetten die Prozente nie 100 % ergeben.
  const total = bars.reduce((sum, b) => sum + b.count, 0) || 1;
  return (
    <div style={{ ...commonStyles.card, background: C.surfaceContainer, padding: 24, transition: "border-color 0.2s", display: "flex", flexDirection: "column" }} {...commonStyles.cardHoverHandlers}>
      <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSurface, marginBottom: 20, flexShrink: 0 }}>Status-Verteilung</h4>
      {/* Die Zeilen verteilen sich ueber die volle Kartenhoehe — die Karte wird
          neben "Tonarten" gestreckt und stand vorher unten leer. */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-around" }}>
        {bars.map(({ key, label, color, count }) => (
          <div key={key}
            style={{ display: "flex", flexDirection: "column", gap: 8, padding: "8px 10px", borderRadius: 8, cursor: "pointer", transition: "background 0.15s", margin: "0 -10px" }}
            onMouseEnter={e => (e.currentTarget.style.background = `${color}12`)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            onClick={() => onNavigate({ status: key })}
          >
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "-0.02em", color: C.onSurfaceVariant }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />
                {label}
              </span>
              <span>{count}</span>
            </div>
            <div style={{ height: 10, background: C.surfaceContainerHighest, borderRadius: 999, overflow: "hidden" }}>
              {/* Mindestens 1.5 %, sonst verschwindet "Sold" mit 2 von 204 zu
                  einem unsichtbaren Splitter. */}
              <div style={{ height: "100%", width: count === 0 ? 0 : `${Math.max((count / total) * 100, 1.5)}%`, background: color, borderRadius: 999, transition: "width 0.6s ease" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tonarten ──────────────────────────────────────────────────────────────────
// Welche Tonarten es gibt, steht in types/browse.ts — dieselbe Liste, die der
// Browse-Filter anbietet. Hier nur die chromatische Reihenfolge fuers Diagramm.
const CHROMATIC_ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const byChromatic = (a: string, b: string) =>
  CHROMATIC_ROOTS.indexOf(a.replace(/m$/, "")) - CHROMATIC_ROOTS.indexOf(b.replace(/m$/, ""));

const MAJOR_CHROMATIC = [...MAJOR_KEYS].sort(byChromatic);
const MINOR_CHROMATIC = [...MINOR_KEYS].sort(byChromatic);

/** "Others" ist die Gegenmenge: alles, was in keiner der beiden Listen steht.
 *  Dadurch kann kein Wert mehr lautlos verschwinden — frueher fielen Eintraege
 *  wie "Db" durch alle drei Ansichten, weil sie als Dur galten, aber in der
 *  Kreuz-Liste fehlten. */
const CANONICAL_KEYS = new Set<string>([...MAJOR_KEYS, ...MINOR_KEYS]);

/** Ein Farbton, Helligkeit nach Haeufigkeit: die Farbe kodiert damit die Zahl
 *  statt nur die Position. Vorher lagen hier zwoelf willkuerliche Farbtoene —
 *  Cm war nicht "oranger" als Dm, die Farbe trug schlicht keine Information. */
function keyShade(ratio: number): string {
  const t = 0.35 + 0.65 * ratio;                       // nie bis zur Unsichtbarkeit
  const mix = (fg: number) => Math.round(38 + (fg - 38) * t);   // 38 = Kartenraster
  return `rgb(${mix(253)}, ${mix(161)}, ${mix(36)})`;  // Ziel: C.primary #fda124
}

// ── Balkendiagramm ────────────────────────────────────────────────────────────
// Gemeinsame Basis fuer "Top Keys" und "Beats pro Monat": Zahl ueber dem Balken,
// Beschriftung darunter, Balken auf 0 bleiben als Stummel sichtbar.
// Die Hoehen sind Prozent der Zeile — das setzt voraus, dass der Eltern-Container
// eine aufgeloeste Hoehe hat (hier ueber flex: 1).

export interface Bar {
  /** Stabiler React-Key und Nutzlast fuers Klicken. */
  key: string;
  label: string;
  count: number;
}

/** Damit zwei Balken nicht den halben Kartenbreite einnehmen. Bei zwoelf
 *  Balken greift die Grenze nicht — die sind ohnehin schmaler. */
const BAR_MAX_WIDTH = 120;

function BarChart({ data, color, onBarClick }: {
  data: Bar[];
  /** Ein String faerbt alle Balken gleich, eine Funktion je Balken. */
  color: string | ((bar: Bar, index: number) => string);
  onBarClick?: (bar: Bar) => void;
}) {
  const [hov, setHov] = useState<number | null>(null);
  const max = Math.max(...data.map(d => d.count), 1);
  const colorAt = (bar: Bar, i: number) => (typeof color === "string" ? color : color(bar, i));

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 4, flex: 1, marginBottom: 8 }}>
        {data.map((bar, i) => {
          const c         = colorAt(bar, i);
          const isEmpty   = bar.count === 0;
          const isHov     = hov === i;
          const clickable = !!onBarClick && !isEmpty;
          return (
            <div key={bar.key}
              title={`${bar.label}: ${bar.count}`}
              style={{ flex: 1, maxWidth: BAR_MAX_WIDTH, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 4, padding: "0 2px", cursor: clickable ? "pointer" : "default" }}
              onMouseEnter={() => !isEmpty && setHov(i)}
              onMouseLeave={() => setHov(null)}
              onClick={() => clickable && onBarClick(bar)}
            >
              <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "monospace", color: isHov ? c : C.onSurfaceVariant, opacity: isEmpty ? 0 : 1, transition: "all 0.15s", lineHeight: 1 }}>
                {bar.count}
              </span>
              <div style={{
                width: "100%",
                height: isEmpty ? "2%" : `${Math.max((bar.count / max) * 100, 3)}%`,
                background: isEmpty ? C.surfaceContainerHighest : c,
                borderRadius: "3px 3px 0 0",
                opacity: isEmpty ? 0.4 : isHov ? 1 : 0.75,
                transition: "opacity 0.15s, box-shadow 0.15s",
                boxShadow: isHov ? `0 0 12px ${c}70` : "none",
              }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 4, flexShrink: 0 }}>
        {data.map((bar, i) => (
          <span key={bar.key} style={{
            flex: 1, maxWidth: BAR_MAX_WIDTH, textAlign: "center", fontSize: 9, fontWeight: 700,
            color: hov === i ? colorAt(bar, i) : bar.count === 0 ? C.onSecondaryFixedVar : C.onSurfaceVariant,
            transition: "color 0.15s", lineHeight: 1.2, overflow: "hidden",
          }}>
            {bar.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Tonarten ──────────────────────────────────────────────────────────────────
const KEY_MODES = [
  { value: "major",  label: "Dur" },
  { value: "minor",  label: "Moll" },
  { value: "others", label: "Sonstige" },
] as const;

function TopKeys({ stats, onNavigate }: { stats: Stats; onNavigate: (filter: object) => void }) {
  const [keyMode, setKeyMode] = useState<(typeof KEY_MODES)[number]["value"]>("minor");

  // Dur/Moll: alle 12 Balken, Luecken mit 0 gefuellt. Sonstige: die Gegenmenge.
  const bars: Bar[] =
    keyMode === "others"
      ? stats.top_keys
          .filter(k => !CANONICAL_KEYS.has(k.key))
          .map(k => ({ key: k.key, label: k.key, count: k.count }))
      : (keyMode === "major" ? MAJOR_CHROMATIC : MINOR_CHROMATIC)
          .map(k => ({ key: k, label: k, count: stats.top_keys.find(x => x.key === k)?.count ?? 0 }));

  return (
    <div style={{ ...commonStyles.card, background: C.surfaceContainer, padding: "16px 20px", transition: "border-color 0.2s", display: "flex", flexDirection: "column", overflow: "hidden" }} {...commonStyles.cardHoverHandlers}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSurface }}>Tonarten</h4>
        <Select value={keyMode} options={KEY_MODES} onChange={setKeyMode} />
      </div>

      {bars.length === 0 ? (
        <p style={{ color: C.onSecondaryFixedVar, fontSize: 12, textAlign: "center", padding: "20px 0" }}>
          Keine Beats in dieser Gruppe
        </p>
      ) : (
        <BarChart
          key={keyMode}                       /* Hover-Zustand beim Wechsel zuruecksetzen */
          data={bars}
          color={bar => keyShade(bar.count / Math.max(...bars.map(b => b.count), 1))}
          onBarClick={bar => onNavigate({ keys: [bar.key] })}
        />
      )}
    </div>
  );
}

// ── Beats pro Monat ───────────────────────────────────────────────────────────
const MONTHS = ["JAN","FEB","MÄR","APR","MAI","JUN","JUL","AUG","SEP","OKT","NOV","DEZ"];

function BeatsPerMonth({ stats, onYearChange }: {
  stats: Stats;
  onYearChange: (year: number) => void;
}) {
  // "2026-03" → "MÄR"
  const bars: Bar[] = stats.beats_per_month.map(({ month, count }) => ({
    key: month,
    label: MONTHS[parseInt(month.split("-")[1] ?? "1") - 1] ?? month,
    count,
  }));

  const years = stats.available_years.map(y => ({ value: String(y), label: String(y) }));

  return (
    <div style={{
      ...commonStyles.card, background: C.surfaceContainer, padding: 24,
      transition: "border-color 0.2s",
      minHeight: 360, display: "flex", flexDirection: "column", boxSizing: "border-box",
    }} {...commonStyles.cardHoverHandlers}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexShrink: 0 }}>
        <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSurface }}>Beats pro Monat</h4>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.primary, flexShrink: 0 }} />
          <Select
            value={String(stats.selected_year)}
            options={years}
            onChange={v => onYearChange(parseInt(v))}
          />
        </div>
      </div>

      <BarChart data={bars} color={C.primary} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Top Tags — Category rows with icons, like Create tab
// ══════════════════════════════════════════════════════════════════════════════
const TAG_ROW_ORDER = ["genre", "vibe", "instrument", "other"] as const;
type TagRow = (typeof TAG_ROW_ORDER)[number];

// "custom" wird beim Gruppieren auf "other" gemappt — hier stehen nur die Zeilen, die wirklich rendern.
const TAG_ROW_META: Record<TagRow, { label: string; icon: React.ReactNode }> = {
  genre:      { label: "Genre",       icon: <Music size={11} /> },
  vibe:       { label: "Vibe",        icon: <Sparkles size={11} /> },
  instrument: { label: "Instrumente", icon: <Piano size={11} /> },
  other:      { label: "Eigene",      icon: <Star size={11} /> },
};

function TopTags({ stats, onNavigate }: { stats: Stats; onNavigate: (filter: object) => void }) {
  const grouped = Object.fromEntries(TAG_ROW_ORDER.map(cat => [cat, [] as typeof stats.top_tags])) as Record<TagRow, typeof stats.top_tags>;
  for (const item of stats.top_tags) {
    const cat: TagCategory = getTagCategoryFromDb(item.tag) ?? "custom";
    grouped[cat === "custom" ? "other" : cat].push(item);
  }
  TAG_ROW_ORDER.forEach(cat => grouped[cat].sort((a, b) => b.count - a.count));

  return (
    <div style={{ ...commonStyles.card, background: C.surfaceContainer, padding: 24, transition: "border-color 0.2s", minHeight: 360, boxSizing: "border-box" }} {...commonStyles.cardHoverHandlers}>
      <div style={{ marginBottom: 18 }}>
        <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSurface }}>Top-Tags</h4>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {TAG_ROW_ORDER.map(cat => {
          const row = grouped[cat].slice(0, 5);
          if (row.length === 0) return null;
          const colors = TAG_COLORS[cat];
          const meta = TAG_ROW_META[cat];
          return (
            <div key={cat}>
              {/* Category label with icon */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, color: colors.text }}>
                {meta.icon}
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.13em" }}>
                  {meta.label}
                </span>
              </div>
              {/* Tag pills — nowrap, overflow hidden, # prefix, uppercase */}
              <div style={{ display: "flex", gap: 6, flexWrap: "nowrap", overflow: "hidden" }}>
                {row.map(({ tag }) => (
                  <span
                    key={tag}
                    onClick={() => onNavigate({ search: tag })}
                    style={{
                      padding: "4px 12px",
                      background: colors.bg,
                      borderRadius: 9999,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      color: colors.text,
                      border: `1px solid ${colors.border}`,
                      cursor: "pointer",
                      transition: "filter 0.15s, transform 0.15s",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.filter = "brightness(1.3)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                    onMouseLeave={e => { e.currentTarget.style.filter = "brightness(1)"; e.currentTarget.style.transform = "translateY(0)"; }}
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Zuletzt hinzugefuegt ─────────────────────────────────────────────────────
/** `onOpen()` ohne Beat oeffnet das Archiv ungefiltert. */
function LatestBeats({ stats, onOpen }: { stats: Stats; onOpen: (beat?: Beat) => void }) {
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const { playBeat, setQueue, currentBeat } = useAudioPlayerContext();
  const beats = stats.recent_beats;
  // Der Name bekommt eine Obergrenze und die letzte Spalte schluckt den Rest —
  // sonst schob "1fr" die Metadaten auf breiten Monitoren ans andere Ende des
  // Bildschirms und man musste fuer eine Zeile quer ueber den Schirm lesen.
  const grid  = "44px minmax(180px, 520px) 80px 70px 110px 110px 1fr";

  const play = (beat: Beat) => {
    setQueue(beats);          // weiter/zurueck bleibt in dieser Liste
    playBeat(beat);
  };

  return (
    <section style={{ ...commonStyles.card, background: C.surfaceContainer, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "24px 24px 16px", borderBottom: `1px solid ${C.border10}` }}>
        <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSurface }}>Zuletzt hinzugefügt</h4>
        <button
          onClick={() => onOpen()}
          style={{ fontSize: 11, fontWeight: 700, color: C.primary, background: "none", border: "none", cursor: "pointer" }}
        >
          ALLE ANZEIGEN ›
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: grid, padding: "8px 24px", background: "rgba(19,19,19,0.5)", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.onSecondaryFixedVar }}>
        <span /><span>Name</span><span>Tonart</span><span>BPM</span><span>Status</span><span style={{ textAlign: "right" }}>Datum</span><span />
      </div>
      {beats.map((beat, i) => {
        const isCurrent = currentBeat?.id === beat.id;
        const active = hoveredRow === i || isCurrent;
        return (
          <div key={beat.id}
            onClick={() => onOpen(beat)}
            title="Im Archiv öffnen"
            style={{ display: "grid", gridTemplateColumns: grid, padding: "14px 24px", alignItems: "center", borderTop: i > 0 ? `1px solid rgba(72,72,71,0.05)` : undefined, cursor: "pointer", background: hoveredRow === i ? C.surfaceContainerHigh : "transparent", transition: "background 0.15s" }}
            onMouseEnter={() => setHoveredRow(i)} onMouseLeave={() => setHoveredRow(null)}>
            <button
              onClick={e => { e.stopPropagation(); play(beat); }}
              title={`${beat.name} abspielen`}
              style={{
                width: 28, height: 28, borderRadius: "50%", padding: 0,
                background: isCurrent ? C.primary : C.surfaceContainerHighest,
                border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background 0.15s",
              }}
            >
              <Play size={10}
                fill={isCurrent ? C.onPrimary : active ? C.onSurface : C.onSurfaceVariant}
                color={isCurrent ? C.onPrimary : active ? C.onSurface : C.onSurfaceVariant} />
            </button>
            <span style={{ fontSize: 13, fontWeight: 600, color: isCurrent ? C.primary : C.onSurface, paddingRight: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{beat.name}</span>
            <span style={{ fontSize: 12, color: C.onSurfaceVariant }}>{beat.key ?? "–"}</span>
            <span style={{ fontSize: 12, color: C.onSurfaceVariant }}>{beat.bpm ?? "–"}</span>
            <span><StatusPill status={beat.status ?? "idea"} /></span>
            <span style={{ fontSize: 11, color: C.onSurfaceVariant, textAlign: "right", fontFamily: "monospace" }}>{(beat.created_date ?? "").slice(0, 10)}</span>
            <span />
          </div>
        );
      })}
      {beats.length === 0 && (
        <div style={{ padding: 40, textAlign: "center", color: C.onSecondaryFixedVar, fontSize: 13 }}>Noch keine Beats im Archiv</div>
      )}
    </section>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [stats, setStats]     = useState<Stats | null>(null);
  const [actions, setActions] = useState<DashboardActions | null>(null);
  const [busy, setBusy]       = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const navigate = useNavigate();
  const handleNavigate = useCallback((filter: object) => {
    navigate("/browse", { state: { initialFilters: filter } });
  }, [navigate]);

  // Nur die zuletzt gestartete Anfrage darf schreiben — sonst kann bei schnellem
  // Klicken eine aeltere Antwort die neuere ueberschreiben.
  const reqId = useRef(0);

  /** `yearOnly`: nur die jahresabhaengigen Zahlen nachladen. Die Aktions-Kacheln
   *  haengen nicht vom Jahr ab und bleiben beim Jahreswechsel unangetastet. */
  const load = useCallback(async (year: number | null, yearOnly = false) => {
    const id = ++reqId.current;
    setBusy(true); setError(null);
    try {
      const [s, a] = await Promise.all([
        api.stats.get(year),
        yearOnly ? null : api.stats.getDashboardActions(),
      ]);
      if (id !== reqId.current) return;   // eine neuere Anfrage hat uebernommen
      setStats(s);
      if (a) setActions(a);
    }
    catch (e) { if (id === reqId.current) setError(String(e)); }
    finally  { if (id === reqId.current) setBusy(false); }
  }, []);

  useEffect(() => { load(null); }, [load]);

  // Vollbild-Spinner nur, solange ueberhaupt nichts da ist. Beim Nachladen
  // bleiben die Zahlen stehen — sonst flackert die ganze Seite beim Jahreswechsel.
  if (busy && !stats) return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: C.background }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 40, height: 40, border: `3px solid ${C.surfaceContainerHighest}`, borderTopColor: C.primary, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
        <p style={{ fontSize: 12, color: C.onSurfaceVariant }}>Datenbank wird geladen …</p>
      </div>
    </div>
  );

  // Vollbild-Fehler nur, wenn es nichts anzuzeigen gibt. Schlaegt erst ein
  // spaeteres Nachladen fehl, bleibt das Dashboard stehen und meldet es im Header.
  if (error && !stats) return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: C.background }}>
      <div style={{ textAlign: "center", maxWidth: 400 }}>
        <p style={{ fontSize: 14, color: C.error, marginBottom: 8, fontWeight: 700 }}>Datenbankfehler</p>
        <p style={{ fontSize: 12, color: C.onSurfaceVariant, marginBottom: 24, fontFamily: "monospace", background: C.surfaceContainerLow, padding: 16, borderRadius: 8 }}>{error}</p>
        <button onClick={() => load(null)} style={{ padding: "8px 24px", background: C.primary, color: C.onPrimary, border: "none", borderRadius: 6, fontWeight: 700, cursor: "pointer" }}>Erneut versuchen</button>
      </div>
    </div>
  );

  if (!stats) return null;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: C.background }}>
      {/* Header — entrümpelt: System Repair lebt jetzt in den Settings */}
      <header style={{ height: 64, flexShrink: 0, ...commonStyles.glassHeader, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 32px", borderBottom: `1px solid ${C.border15}` }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: C.onSurface }}>Dashboard</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Fehler beim Nachladen — die angezeigten Zahlen bleiben stehen */}
          {error && (
            <span
              title={error}
              style={{
                fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
                color: C.error, background: "rgba(255,115,81,0.12)",
                border: "1px solid rgba(255,115,81,0.35)",
                padding: "4px 10px", borderRadius: 6,
                maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              Nicht aktualisiert
            </span>
          )}
          <button
            onClick={() => load(stats.selected_year)}
            disabled={busy}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, fontSize: 10, fontWeight: 700, border: `1px solid ${C.border10}`, color: C.onSurfaceVariant, background: "transparent", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1, letterSpacing: "0.05em" }}
          >
            <RefreshCw size={12} style={busy ? { animation: "spin 0.8s linear infinite" } : undefined} /> AKTUALISIEREN
          </button>
        </div>
      </header>

      {/* Scrollable content — MAX-WIDTH zentriert für Fullscreen */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{
          maxWidth: 1800,      // nie breiter als 1800px
          margin: "0 auto",   // zentriert auf großen Monitoren
          padding: "24px 32px",
          display: "flex", flexDirection: "column", gap: 24,
        }}>
          {/* Aktions-Zeile: Was steht heute an? */}
          {actions && (
            <section style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
              <ActionCard
                title="Diese Woche geplant"
                value={actions.scheduled_next_7}
                hint="Uploads in den nächsten 7 Tagen"
                icon={<CalendarClock size={14} />}
                color="#fda124"
                onClick={() => navigate("/upload")}
              />
              <ActionCard
                title="Fertig, ohne Termin"
                value={actions.finished_unscheduled}
                hint="fertige Beats ohne Upload-Plan"
                icon={<Rocket size={14} />}
                color="#f43f8e"
                onClick={() => handleNavigate({ status: "finished", unpublishedOnly: true })}
              />
              <ActionCard
                title="Studio bereit"
                value={actions.studio_ready}
                hint="Projekte bereit zum Archivieren"
                icon={<Disc3 size={14} />}
                color="#9492ff"
                onClick={() => navigate("/studio")}
              />
              <RhythmCard actions={actions} />
            </section>
          )}

          {/* Pipeline: der ganze Workflow auf einen Blick — trägt auch Total, Neu, Favoriten, Live */}
          {actions && (
            <PipelineFunnel
              stats={stats}
              actions={actions}
              onNavigate={(p) => navigate(p)}
              onFilter={handleNavigate}
            />
          )}

          {/* Analytics Row 1 */}
          <section style={{ display: "grid", gridTemplateColumns: "2fr 3fr", gap: 20, alignItems: "stretch" }}>
            <StatusBreakdown stats={stats} onNavigate={handleNavigate} />
            <TopKeys stats={stats} onNavigate={handleNavigate} />
          </section>

          {/* Analytics Row 2 */}
          <section style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 20 }}>
            <BeatsPerMonth stats={stats} onYearChange={(yr) => load(yr, true)} />
            <TopTags stats={stats} onNavigate={handleNavigate} />
          </section>

          {/* Zuletzt hinzugefügt */}
          <LatestBeats
            stats={stats}
            onOpen={(beat) => beat ? handleNavigate({ search: beat.name }) : navigate("/browse")}
          />
        </div>
      </div>
    </div>
  );
}