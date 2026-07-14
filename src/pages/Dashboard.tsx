// src/pages/Dashboard.tsx — Aktionszentrale: "Was steht heute an?" + Analytics
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  RefreshCw, Archive, TrendingUp, Heart, Play, Sparkles, Piano, Star, Music,
  CalendarClock, Rocket, Disc3, Flame, ArrowRight, Upload as UploadIcon,
} from "lucide-react";
import { api } from "../lib/api";
import type { Stats, DashboardActions } from "../types/stats";
import { C, commonStyles, STUDIO_STATUS_CONFIG } from "../lib/theme";
import { getTagCategoryFromDb, TAG_COLORS, type TagCategory } from "../lib/tags";
import { StatusPill } from "../components/Tagpill";

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
        textAlign: "left",
        background: C.surfaceContainerLow,
        padding: 18, borderRadius: 12,
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
      background: C.surfaceContainerLow, padding: 18, borderRadius: 12,
      border: `1px solid ${C.border10}`, boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
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
      <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 5, minHeight: 44 }}>
        {weeks.map((w, i) => {
          const isCurrent = i === weeks.length - 1;
          const h = w.count === 0 ? 3 : Math.max(6, Math.round((w.count / max) * 44));
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
function PipelineFunnel({ stats, actions, onNavigate }: {
  stats: Stats;
  actions: DashboardActions;
  onNavigate: (path: string) => void;
}) {
  const studioTotal = Object.values(actions.studio_by_status).reduce((a, b) => a + b, 0);
  const stages: Array<{ label: string; value: number; detail: string; icon: React.ReactNode; color: string; path: string }> = [
    {
      label: "Studio", value: studioTotal,
      detail: (["idea", "wip", "exported", "ready"] as const)
        .map(s => `${actions.studio_by_status[s] ?? 0} ${STUDIO_STATUS_CONFIG[s].label}`)
        .join(" · "),
      icon: <Disc3 size={15} />, color: "#9492ff", path: "/studio",
    },
    {
      label: "Archiv", value: stats.total,
      detail: `${stats.this_month} neu diesen Monat`,
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
      background: C.surfaceContainerLow, borderRadius: 12,
      border: `1px solid ${C.border10}`, boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
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

// ── Hover helper ──────────────────────────────────────────────────────────────
const cardHover = {
  onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) =>
    (e.currentTarget.style.borderColor = "rgba(72,72,71,0.30)"),
  onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) =>
    (e.currentTarget.style.borderColor = "rgba(72,72,71,0.10)"),
};

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ title, value, badgeText, badgeColor, icon }: {
  title: string; value: string | number; badgeText: string; badgeColor: string; icon: React.ReactNode;
}) {
  return (
    <div style={{ background: C.surfaceContainerLow, padding: 20, borderRadius: 12, border: `1px solid ${C.border10}`, boxShadow: "0 1px 3px rgba(0,0,0,0.3)", cursor: "pointer", transition: "border-color 0.2s, transform 0.15s" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(253,161,36,0.3)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border10; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSurfaceVariant }}>{title}</span>
        <span style={{ color: badgeColor, display: "flex" }}>{icon}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <h3 style={{ fontSize: 30, fontWeight: 700, color: C.onSurface, lineHeight: 1 }}>
          {typeof value === "number" ? value.toLocaleString() : value}
        </h3>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "-0.02em", padding: "2px 6px", borderRadius: 4, color: badgeColor, background: `${badgeColor}20` }}>
          {badgeText}
        </span>
      </div>
    </div>
  );
}

// ── Status Breakdown ──────────────────────────────────────────────────────────
function StatusBreakdown({ stats, onNavigate }: { stats: Stats; onNavigate: (filter: object) => void }) {
  const total = stats.total || 1;
  const bars = [
    { key: "idea",     label: "Idea",     color: C.tertiary,  count: stats.by_status.idea },
    { key: "wip",      label: "WIP",      color: C.primary,   count: stats.by_status.wip },
    { key: "finished", label: "Finished", color: "#22c55e",   count: stats.by_status.finished },
    { key: "sold",     label: "Sold",     color: "#ef4444",   count: stats.by_status.sold },
  ];
  return (
    <div style={{ background: C.surfaceContainer, padding: 24, borderRadius: 12, border: `1px solid ${C.border10}`, transition: "border-color 0.2s" }} {...cardHover}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSurface }}>Status Breakdown</h4>
        <span style={{ color: C.onSurfaceVariant, fontSize: 18 }}>⋮</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
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
            <div style={{ height: 8, background: C.surfaceContainerHighest, borderRadius: 999, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.round((count / total) * 100)}%`, background: color, borderRadius: 999, transition: "width 0.6s ease" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Key Classification ─────────────────────────────────────────────────────────
function keyType(raw: string): "major" | "minor" | "others" {
  const s = raw.trim();
  if (!s) return "others";
  if (/m$/i.test(s) && !/maj/i.test(s)) return "minor";
  if (/^[A-Ga-g][#b]?$/.test(s)) return "major";
  return "others";
}

// Canonical chromatic order
const CHROMATIC_MAJOR = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const CHROMATIC_MINOR = ["Cm", "C#m", "Dm", "D#m", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "A#m", "Bm"];
const BAR_COLORS = [C.primary, "#3b82f6", "#22c55e", "#a855f7", "#ef4444",
                    "#f97316", "#06b6d4", "#ec4899", "#84cc16", "#eab308",
                    "#8b5cf6", "#14b8a6"];

// ── Top Keys ──────────────────────────────────────────────────────────────────
function TopKeys({ stats, onNavigate }: { stats: Stats; onNavigate: (filter: object) => void }) {
  const [hov, setHov] = useState<number | null>(null);
  const [keyMode, setKeyMode] = useState<"major" | "minor" | "others">("minor");

  const allKeys = stats.top_keys;

  // Build display list: all 12 for major/minor (fill gaps with 0), raw for others
  const displayKeys: { key: string; count: number }[] =
    keyMode === "major" ? CHROMATIC_MAJOR.map(k => ({ key: k, count: allKeys.find(x => x.key === k)?.count ?? 0 })) :
    keyMode === "minor" ? CHROMATIC_MINOR.map(k => ({ key: k, count: allKeys.find(x => x.key === k)?.count ?? 0 })) :
    allKeys.filter(k => keyType(k.key) === "others");

  const max = Math.max(...displayKeys.map(k => k.count), 1);

  return (
    <div style={{ background: C.surfaceContainer, padding: "16px 20px", borderRadius: 12, border: `1px solid ${C.border10}`, transition: "border-color 0.2s", display: "flex", flexDirection: "column", overflow: "hidden" }} {...cardHover}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSurface }}>Top Keys</h4>
        <div style={{ position: "relative" }}>
          <select
            value={keyMode}
            onChange={e => { setKeyMode(e.target.value as typeof keyMode); setHov(null); }}
            style={{ background: C.surfaceContainerHighest, border: `1px solid rgba(72,72,71,0.20)`, borderRadius: 6, padding: "4px 28px 4px 10px", fontSize: 11, fontWeight: 700, color: C.primary, appearance: "none", cursor: "pointer", outline: "none" }}
          >
            <option value="major" style={{ background: C.surfaceContainerHighest, color: C.onSurface }}>Major</option>
            <option value="minor" style={{ background: C.surfaceContainerHighest, color: C.onSurface }}>Minor</option>
            <option value="others" style={{ background: C.surfaceContainerHighest, color: C.onSurface }}>Others</option>
          </select>
          <div style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
        </div>
      </div>

      {displayKeys.length === 0 ? (
        <p style={{ color: C.onSecondaryFixedVar, fontSize: 12, textAlign: "center", padding: "20px 0" }}>No {keyMode} key data</p>
      ) : (
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {/* Bars row — flex:1 fills all remaining space */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, flex: 1, marginBottom: 8 }}>
            {displayKeys.map(({ key, count }, i) => {
              const color   = BAR_COLORS[i % BAR_COLORS.length];
              const isEmpty = count === 0;
              const isHov   = hov === i;
              // Heights as % of the flex container — works because parent has resolved height via flex:1
              const barPct  = isEmpty ? "3%" : `${Math.max((count / max) * 100, 2)}%`;
              return (
                <div key={key}
                  style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 4, cursor: isEmpty ? "default" : "pointer" }}
                  onMouseEnter={() => !isEmpty && setHov(i)}
                  onMouseLeave={() => setHov(null)}
                  onClick={() => !isEmpty && onNavigate({ keys: [key] })}>
                  {/* Count label — hidden for 0 */}
                  <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "monospace", color: isHov ? color : C.onSurfaceVariant, opacity: isEmpty ? 0 : 1, transition: "all 0.15s", lineHeight: 1 }}>
                    {count}
                  </span>
                  {/* Bar */}
                  <div style={{
                    width: "100%", height: barPct,
                    background: isEmpty ? C.surfaceContainerHighest : color,
                    borderRadius: "3px 3px 0 0",
                    opacity: isEmpty ? 0.4 : isHov ? 1 : 0.78,
                    transition: "opacity 0.15s, box-shadow 0.15s",
                    boxShadow: isHov ? `0 0 12px ${color}70` : "none",
                  }} />
                </div>
              );
            })}
          </div>
          {/* Labels */}
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            {displayKeys.map(({ key, count }, i) => (
              <span key={key} style={{
                flex: 1, textAlign: "center", fontSize: 9, fontWeight: 700,
                color: hov === i ? BAR_COLORS[i % BAR_COLORS.length] : count === 0 ? C.onSecondaryFixedVar : C.onSurfaceVariant,
                transition: "color 0.15s", lineHeight: 1.2,
                overflow: "hidden",
              }}>
                {key}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Beats Per Month ───────────────────────────────────────────────────────────
function BeatsPerMonth({ stats, onYearChange }: {
  stats: Stats;
  onYearChange: (year: number) => void;
}) {
  const data  = stats.beats_per_month;
  const max   = Math.max(...data.map(d => d.count), 1);
  const [hov, setHov] = useState<number | null>(null);

  const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const monthLabel = (s: string) => MONTHS[parseInt(s.split("-")[1] ?? "1") - 1] ?? s;

  return (
    <div style={{
      background: C.surfaceContainer, padding: 24, borderRadius: 12,
      border: `1px solid ${C.border10}`, transition: "border-color 0.2s",
      minHeight: 360, display: "flex", flexDirection: "column", boxSizing: "border-box",
    }} {...cardHover}>
      {/* Header + Jahr-Dropdown */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexShrink: 0 }}>
        <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSurface }}>Beats Per Month</h4>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.primary, flexShrink: 0 }} />
          <div style={{ position: "relative" }}>
            <select
              value={stats.selected_year}
              onChange={e => onYearChange(parseInt(e.target.value))}
              style={{
                background: C.surfaceContainerHighest,
                border: `1px solid rgba(72,72,71,0.20)`,
                borderRadius: 6, padding: "4px 28px 4px 10px",
                fontSize: 11, fontWeight: 700, color: C.primary,
                appearance: "none", cursor: "pointer", outline: "none",
              }}
            >
              {stats.available_years.map(y => (
                <option key={y} value={y} style={{ background: C.surfaceContainerHighest, color: C.onSurface }}>{y}</option>
              ))}
            </select>
            <div style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
          </div>
        </div>
      </div>

      {/* Bars — flex: 1 fills remaining card height */}
      <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 4, marginBottom: 8 }}>
        {data.map(({ month, count }, i) => {
          const isHov = hov === i;
          const isEmpty = count === 0;
          const barPct = isEmpty ? 1.5 : Math.max((count / max) * 100, 3);
          return (
            <div key={month}
              style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 4, cursor: isEmpty ? "default" : "pointer", padding: "0 2px" }}
              onMouseEnter={() => !isEmpty && setHov(i)} onMouseLeave={() => setHov(null)}>
              <span style={{
                fontSize: 11, fontWeight: 700, fontFamily: "monospace",
                color: isHov ? C.primary : C.onSurfaceVariant,
                opacity: isEmpty ? 0 : 1,
                transition: "all 0.15s", lineHeight: 1,
              }}>
                {count}
              </span>
              <div style={{
                width: "100%", height: `${barPct}%`,
                background: isEmpty ? C.surfaceContainerHighest : C.primary,
                borderRadius: "3px 3px 0 0",
                opacity: isEmpty ? 0.4 : isHov ? 1 : 0.72,
                transition: "all 0.15s",
                boxShadow: isHov ? `0 0 10px ${C.primary}50` : "none",
              }} />
            </div>
          );
        })}
      </div>

      {/* Month labels */}
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        {data.map(({ month }, i) => (
          <span key={month} style={{
            flex: 1, textAlign: "center", fontSize: 9,
            color: hov === i ? C.primary : C.onSurfaceVariant,
            textTransform: "uppercase", fontWeight: hov === i ? 700 : 500,
            letterSpacing: "0.04em", transition: "color 0.15s",
          }}>{monthLabel(month)}</span>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Top Tags — Category rows with icons, like Create tab
// ══════════════════════════════════════════════════════════════════════════════
const TAG_ROW_ORDER: TagCategory[] = ["genre", "vibe", "instrument", "other"];

const TAG_ROW_META: Record<TagCategory, { label: string; icon: React.ReactNode }> = {
  genre:      { label: "Genre",       icon: <Music size={11} /> },
  vibe:       { label: "Vibe",        icon: <Sparkles size={11} /> },
  instrument: { label: "Instruments", icon: <Piano size={11} /> },
  custom:     { label: "Custom",      icon: <Star size={11} /> },
  other:      { label: "Custom",      icon: <Star size={11} /> },
};

function TopTags({ stats, onNavigate }: { stats: Stats; onNavigate: (filter: object) => void }) {
  const grouped = Object.fromEntries(TAG_ROW_ORDER.map(cat => [cat, [] as typeof stats.top_tags])) as Record<TagCategory, typeof stats.top_tags>;
  for (const item of stats.top_tags) {
    const cat = getTagCategoryFromDb(item.tag) ?? "custom";
    const bucket = cat === "custom" ? "other" : cat;
    if (grouped[bucket]) grouped[bucket].push(item);
    else grouped["other"].push(item);
  }
  TAG_ROW_ORDER.forEach(cat => grouped[cat].sort((a, b) => b.count - a.count));

  return (
    <div style={{ background: C.surfaceContainer, padding: 24, borderRadius: 12, border: `1px solid ${C.border10}`, transition: "border-color 0.2s", minHeight: 360, boxSizing: "border-box" }} {...cardHover}>
      <div style={{ marginBottom: 18 }}>
        <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSurface }}>Top Tags</h4>
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

// ── Latest Beats ──────────────────────────────────────────────────────────────
function LatestBeats({ stats }: { stats: Stats }) {
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const beats = stats.recent_beats;
  const grid  = "44px 1fr 70px 60px 100px 100px";

  return (
    <section style={{ background: C.surfaceContainer, borderRadius: 12, border: `1px solid ${C.border10}`, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "24px 24px 16px", borderBottom: `1px solid ${C.border10}` }}>
        <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSurface }}>Latest Beats</h4>
        <button style={{ fontSize: 11, fontWeight: 700, color: C.primary, background: "none", border: "none", cursor: "pointer" }}>VIEW ALL ›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: grid, padding: "8px 24px", background: "rgba(19,19,19,0.5)", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.onSecondaryFixedVar }}>
        <span /><span>Name</span><span>Key</span><span>BPM</span><span>Status</span><span style={{ textAlign: "right" }}>Date</span>
      </div>
      {beats.map((beat, i) => (
        <div key={beat.id} style={{ display: "grid", gridTemplateColumns: grid, padding: "14px 24px", alignItems: "center", borderTop: i > 0 ? `1px solid rgba(72,72,71,0.05)` : undefined, cursor: "pointer", background: hoveredRow === i ? C.surfaceContainerHigh : "transparent", transition: "background 0.15s" }}
          onMouseEnter={() => setHoveredRow(i)} onMouseLeave={() => setHoveredRow(null)}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.surfaceContainerHighest, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Play size={10} fill={C.onSurfaceVariant} color={C.onSurfaceVariant} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.onSurface, paddingRight: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{beat.name}</span>
          <span style={{ fontSize: 12, color: C.onSurfaceVariant }}>{beat.key ?? "–"}</span>
          <span style={{ fontSize: 12, color: C.onSurfaceVariant }}>{beat.bpm ?? "–"}</span>
          <span><StatusPill status={beat.status ?? "idea"} /></span>
          <span style={{ fontSize: 11, color: C.onSurfaceVariant, textAlign: "right", fontFamily: "monospace" }}>{(beat.created_date ?? "").slice(0, 10)}</span>
        </div>
      ))}
      {beats.length === 0 && (
        <div style={{ padding: 40, textAlign: "center", color: C.onSecondaryFixedVar, fontSize: 13 }}>No beats found</div>
      )}
    </section>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [stats, setStats]     = useState<Stats | null>(null);
  const [actions, setActions] = useState<DashboardActions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const navigate = useNavigate();
  const handleNavigate = useCallback((filter: object) => {
    navigate("/browse", { state: { initialFilters: filter } });
  }, [navigate]);

  const load = async (year?: number) => {
    setLoading(true); setError(null);
    try {
      const [s, a] = await Promise.all([
        api.stats.get(year ?? null),
        api.stats.getDashboardActions(),
      ]);
      setStats(s);
      setActions(a);
    }
    catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: C.background }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 40, height: 40, border: `3px solid ${C.surfaceContainerHighest}`, borderTopColor: C.primary, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
        <p style={{ fontSize: 12, color: C.onSurfaceVariant }}>Loading database...</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (error) return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: C.background }}>
      <div style={{ textAlign: "center", maxWidth: 400 }}>
        <p style={{ fontSize: 14, color: C.error, marginBottom: 8, fontWeight: 700 }}>Database Error</p>
        <p style={{ fontSize: 12, color: C.onSurfaceVariant, marginBottom: 24, fontFamily: "monospace", background: C.surfaceContainerLow, padding: 16, borderRadius: 8 }}>{error}</p>
        <button onClick={() => load()} style={{ padding: "8px 24px", background: C.primary, color: C.onPrimary, border: "none", borderRadius: 6, fontWeight: 700, cursor: "pointer" }}>Retry</button>
      </div>
    </div>
  );

  if (!stats) return null;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: C.background }}>
      {/* Header — entrümpelt: System Repair lebt jetzt in den Settings */}
      <header style={{ height: 64, flexShrink: 0, ...commonStyles.glassHeader, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 32px", borderBottom: `1px solid ${C.border15}` }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: C.onSurface }}>Dashboard</h1>
        <button onClick={() => load()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, fontSize: 10, fontWeight: 700, border: `1px solid ${C.border10}`, color: C.onSurfaceVariant, background: "transparent", cursor: "pointer", letterSpacing: "0.05em" }}>
          <RefreshCw size={12} /> REFRESH
        </button>
      </header>

      {/* Scrollable content — MAX-WIDTH zentriert für Fullscreen */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{
          maxWidth: 1400,      // nie breiter als 1400px
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

          {/* Pipeline: der ganze Workflow auf einen Blick */}
          {actions && (
            <PipelineFunnel stats={stats} actions={actions} onNavigate={(p) => navigate(p)} />
          )}

          {/* KPI Row */}
          <section style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
            <KpiCard title="Total Archived" value={stats.total}             badgeText="+beats" badgeColor="#22c55e" icon={<Archive size={15} />} />
            <KpiCard title="New This Month" value={stats.this_month}        badgeText="month"  badgeColor="#3b82f6" icon={<TrendingUp size={15} />} />
            <KpiCard title="Favorites"      value={stats.favorites}         badgeText="fav"    badgeColor="#ef4444" icon={<Heart size={15} />} />
            <KpiCard title="Veröffentlicht" value={actions?.published_beats ?? 0} badgeText="live" badgeColor="#34d399" icon={<UploadIcon size={15} />} />
          </section>

          {/* Analytics Row 1 */}
          <section style={{ display: "grid", gridTemplateColumns: "2fr 3fr", gap: 20, alignItems: "stretch" }}>
            <StatusBreakdown stats={stats} onNavigate={handleNavigate} />
            <TopKeys stats={stats} onNavigate={handleNavigate} />
          </section>

          {/* Analytics Row 2 */}
          <section style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 20 }}>
            <BeatsPerMonth stats={stats} onYearChange={(yr) => load(yr)} />
            <TopTags stats={stats} onNavigate={handleNavigate} />
          </section>

          {/* Latest Beats */}
          <LatestBeats stats={stats} />
        </div>
      </div>
    </div>
  );
}