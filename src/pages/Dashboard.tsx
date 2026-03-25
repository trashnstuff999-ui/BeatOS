// src/pages/Dashboard.tsx — Live DB Version with Centralized Tag System
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, Wrench, Bell, Archive, TrendingUp, Heart, Music, Play } from "lucide-react";
import { getStats, normalizeStatus, type Stats } from "../lib/Database";
import { invoke } from "@tauri-apps/api/core";

// ═══════════════════════════════════════════════════════════════════════════
// Import Centralized Tag System
// ═══════════════════════════════════════════════════════════════════════════
import { getTagCategory, TAG_COLORS, type TagCategory } from "../lib/tags";

// ═══════════════════════════════════════════════════════════════════════════
// Design Tokens
// ═══════════════════════════════════════════════════════════════════════════
const C = {
  background:             "#0e0e0e",
  surfaceContainerLow:    "#131313",
  surfaceContainer:       "#1a1919",
  surfaceContainerHigh:   "#201f1f",
  surfaceContainerHighest:"#262626",
  surfaceContainerLowest: "#000000",
  primary:                "#fda124",
  primaryContainer:       "#e48c03",
  tertiary:               "#9492ff",
  error:                  "#ff7351",
  onSurface:              "#ffffff",
  onSurfaceVariant:       "#adaaaa",
  onSecondaryFixedVar:    "#5c5b5b",
  outlineVariant:         "#484847",
  border10:               "rgba(72,72,71,0.10)",
  border15:               "rgba(72,72,71,0.15)",
  onPrimary:              "#4e2d00",
} as const;

const STATUS_CFG = {
  finished: { text: "#4ade80", bg: "rgba(74,222,128,0.10)", border: "rgba(74,222,128,0.20)" },
  wip:      { text: "#e48c03", bg: "rgba(228,140,3,0.10)",  border: "rgba(228,140,3,0.20)"  },
  idea:     { text: "#9492ff", bg: "rgba(148,146,255,0.10)",border: "rgba(148,146,255,0.20)"},
  sold:     { text: "#ef4444", bg: "rgba(239,68,68,0.10)",  border: "rgba(239,68,68,0.20)"  },
} as const;

function StatusPill({ status }: { status: string }) {
  const s = (normalizeStatus(status) ?? "idea") as keyof typeof STATUS_CFG;
  const cfg = STATUS_CFG[s] ?? STATUS_CFG.idea;
  return (
    <span style={{ padding: "3px 10px", borderRadius: 4, fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}>
      {s}
    </span>
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

// ── Key Expansion + Classification ────────────────────────────────────────────
function expandKey(raw: string): string {
  const s = raw.trim();
  const isMinor = /m$/i.test(s) && !/maj/i.test(s);
  const root = isMinor ? s.slice(0, -1) : s;
  const rootUp = root.charAt(0).toUpperCase() + root.slice(1);
  return `${rootUp} ${isMinor ? "MINOR" : "MAJOR"}`;
}

function keyType(raw: string): "major" | "minor" | "others" {
  const s = raw.trim();
  if (!s) return "others";
  if (/m$/i.test(s) && !/maj/i.test(s)) return "minor";
  if (/^[A-Ga-g][#b]?$/.test(s)) return "major";
  return "others";
}

// ── Top Keys ──────────────────────────────────────────────────────────────────
function TopKeys({ stats, onNavigate }: { stats: Stats; onNavigate: (filter: object) => void }) {
  const [hov, setHov] = useState<number | null>(null);
  const [keyMode, setKeyMode] = useState<"major" | "minor" | "others">("major");

  const allKeys = stats.top_keys;
  const keys = allKeys.filter(k => keyType(k.key) === keyMode);
  const max  = Math.max(...keys.map(k => k.count), 1);

  const barColors = [C.primary, "#3b82f6", "#22c55e", "#a855f7", "#ef4444",
                     "#f97316", "#06b6d4", "#ec4899", "#84cc16", "#eab308",
                     "#8b5cf6", "#14b8a6", "#f43f5e"];

  const scrollRef = (el: HTMLDivElement | null) => {
    if (!el) return;
    el.onwheel = (e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
  };

  const BAR_W = 52;
  const BAR_GAP = 10;
  const needsScroll = keys.length > 8;
  const totalW = needsScroll ? keys.length * (BAR_W + BAR_GAP) : undefined;

  return (
    <div style={{ background: C.surfaceContainer, padding: "16px 20px", borderRadius: 12, border: `1px solid ${C.border10}`, transition: "border-color 0.2s", display: "flex", flexDirection: "column", overflow: "hidden" }} {...cardHover}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSurface }}>Top Keys</h4>
        {/* Mode Dropdown */}
        <div style={{ position: "relative" }}>
          <select
            value={keyMode}
            onChange={e => { setKeyMode(e.target.value as typeof keyMode); setHov(null); }}
            style={{
              background: C.surfaceContainerHighest,
              border: `1px solid rgba(72,72,71,0.20)`,
              borderRadius: 6, padding: "4px 28px 4px 10px",
              fontSize: 11, fontWeight: 700, color: C.primary,
              appearance: "none", cursor: "pointer", outline: "none",
            }}
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

      {keys.length === 0 ? (
        <p style={{ color: C.onSecondaryFixedVar, fontSize: 12, textAlign: "center", padding: "20px 0" }}>
          No {keyMode} key data
        </p>
      ) : (
        <div ref={scrollRef} style={{ overflowX: "auto", overflowY: "hidden", flex: 1, paddingBottom: 4,
          scrollbarWidth: "thin", scrollbarColor: `${C.surfaceContainerHighest} transparent` }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: BAR_GAP, height: 160, marginBottom: 10, minWidth: totalW }}>
            {keys.map(({ key, count }, i) => {
              const color = barColors[i % barColors.length];
              const isHov = hov === i;
              const barH  = Math.max((count / max) * 160, 4);
              return (
                <div key={key}
                  style={{ width: BAR_W, flexShrink: 0, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 5, cursor: "pointer" }}
                  onMouseEnter={() => setHov(i)}
                  onMouseLeave={() => setHov(null)}
                  onClick={() => onNavigate({ keys: [key] })}>
                  <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "monospace", color: isHov ? color : C.onSurfaceVariant, transition: "all 0.15s", lineHeight: 1 }}>
                    {count}
                  </span>
                  <div style={{
                    width: "100%", height: barH,
                    background: color, borderRadius: "3px 3px 0 0",
                    opacity: isHov ? 1 : 0.78,
                    transition: "opacity 0.15s, box-shadow 0.15s",
                    boxShadow: isHov ? `0 0 14px ${color}70` : "none",
                  }} />
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: BAR_GAP, minWidth: totalW }}>
            {keys.map(({ key }, i) => (
              <span key={key} style={{
                width: BAR_W, flexShrink: 0,
                textAlign: "center", fontSize: 9, fontWeight: 700,
                color: hov === i ? barColors[i % barColors.length] : C.onSurfaceVariant,
                transition: "color 0.15s", lineHeight: 1.2,
                whiteSpace: "normal", wordBreak: "break-word",
              }}>
                {expandKey(key)}
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
  const CHART_H = 165;

  return (
    <div style={{ background: C.surfaceContainer, padding: 24, borderRadius: 12, border: `1px solid ${C.border10}`, transition: "border-color 0.2s" }} {...cardHover}>
      {/* Header + Jahr-Dropdown */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSurface }}>Beats Per Month</h4>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Dot */}
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.primary, flexShrink: 0 }} />
          {/* Dropdown */}
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
            {/* Chevron */}
            <div style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
          </div>
        </div>
      </div>

      {/* Bars */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: CHART_H, marginBottom: 8 }}>
        {data.map(({ month, count }, i) => {
          const isHov = hov === i;
          const barH = count > 0 ? Math.max((count / max) * CHART_H, 4) : 0;
          return (
            <div key={month}
              style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 4, cursor: "pointer", padding: "0 2px" }}
              onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}>
              {/* Count */}
              <span style={{
                fontSize: 11, fontWeight: 700, fontFamily: "monospace",
                color: isHov ? C.primary : C.onSurfaceVariant,
                opacity: count > 0 ? 1 : 0,
                transition: "all 0.15s", lineHeight: 1,
              }}>
                {count}
              </span>
              {/* Bar */}
              <div style={{
                width: "100%", height: barH,
                background: C.primary, borderRadius: "3px 3px 0 0",
                opacity: isHov ? 1 : 0.72,
                transition: "all 0.15s",
                boxShadow: isHov ? `0 0 10px ${C.primary}50` : "none",
              }} />
            </div>
          );
        })}
      </div>

      {/* Month labels */}
      <div style={{ display: "flex", gap: 4 }}>
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
// Top Tags — 4 category rows, sorted by usage, max 5 per row
// ══════════════════════════════════════════════════════════════════════════════
const TAG_ROW_ORDER: TagCategory[] = ["genre", "vibe", "instrument", "other"];
const TAG_ROW_LABELS: Record<TagCategory, string> = {
  genre: "Genre", vibe: "Vibe", instrument: "Instr", custom: "Custom", other: "Custom",
};

function TopTags({ stats, onNavigate }: { stats: Stats; onNavigate: (filter: object) => void }) {
  // Group tags by category, sort each bucket by count desc, cap at 5
  const grouped = Object.fromEntries(TAG_ROW_ORDER.map(cat => [cat, [] as typeof stats.top_tags])) as Record<TagCategory, typeof stats.top_tags>;
  for (const item of stats.top_tags) {
    const cat = getTagCategory(item.tag);
    const bucket = cat === "custom" ? "other" : cat;
    if (grouped[bucket]) grouped[bucket].push(item);
    else grouped["other"].push(item);
  }
  TAG_ROW_ORDER.forEach(cat => grouped[cat].sort((a, b) => b.count - a.count));

  return (
    <div style={{ background: C.surfaceContainer, padding: 24, borderRadius: 12, border: `1px solid ${C.border10}`, height: "100%", transition: "border-color 0.2s" }} {...cardHover}>
      <div style={{ marginBottom: 18 }}>
        <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSurface }}>Top Tags</h4>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {TAG_ROW_ORDER.map(cat => {
          const row = grouped[cat].slice(0, 5);
          if (row.length === 0) return null;
          const colors = TAG_COLORS[cat];
          return (
            <div key={cat} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* Row label */}
              <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: colors.text, width: 36, flexShrink: 0, opacity: 0.8 }}>
                {TAG_ROW_LABELS[cat]}
              </span>
              {/* Tag pills */}
              <div style={{ display: "flex", gap: 6, flexWrap: "nowrap", overflow: "hidden" }}>
                {row.map(({ tag }) => (
                  <span key={tag}
                    onClick={() => onNavigate({ search: tag })}
                    style={{
                      padding: "4px 10px",
                      background: colors.bg,
                      borderRadius: 9999,
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: colors.text,
                      border: `1px solid ${colors.border}`,
                      cursor: "pointer",
                      transition: "filter 0.15s, transform 0.15s",
                      whiteSpace: "nowrap",
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
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const navigate = useNavigate();
  const handleNavigate = useCallback((filter: object) => {
    navigate("/browse", { state: { initialFilters: filter } });
  }, [navigate]);

  const load = async (year?: number) => {
    setLoading(true); setError(null);
    try { setStats(await getStats(year)); }
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
      {/* Header */}
      <header style={{ height: 64, flexShrink: 0, background: "rgba(14,14,14,0.7)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 32px", borderBottom: `1px solid ${C.border15}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, letterSpacing: "0.05em", color: C.onSurface }}>DASHBOARD</h1>
          <span style={{ fontSize: 10, color: C.onSecondaryFixedVar, letterSpacing: "0.05em" }}>SYSTEM STATUS: NOMINAL</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => load()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, fontSize: 10, fontWeight: 700, border: `1px solid ${C.border10}`, color: C.onSurfaceVariant, background: "transparent", cursor: "pointer", letterSpacing: "0.05em" }}>
            <RefreshCw size={12} /> REFRESH
          </button>
          <button
            onClick={async () => {
              if (!confirm("System Repair wird:\n1. Fehlende Beats importieren\n2. Alle create_dates aus FLP-Dateien neu lesen\n\nDB-Backup vorhanden?")) return;
              // Schritt 1: Fehlende Beats scannen
              const scan = await invoke<{found:number,imported:number,skipped:number,errors:string[]}>("scan_archive");
              // Schritt 2: Alle Dates fixen
              const fix = await invoke<{updated:number,not_found:number,no_flp:number,errors:string[]}>("fix_dates");
              alert(
                `System Repair abgeschlossen\n\n` +
                `── Scan ──\nGefunden: ${scan.found}  Importiert: ${scan.imported}  Übersprungen: ${scan.skipped}\n\n` +
                `── Dates ──\nAktualisiert: ${fix.updated}  Nicht gefunden: ${fix.not_found}  Ohne FLP: ${fix.no_flp}\n\n` +
                `Fehler: ${[...scan.errors, ...fix.errors].length}`
              );
              load();
            }}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, fontSize: 10, fontWeight: 700, border: "none", cursor: "pointer", letterSpacing: "0.05em", background: "rgba(255,115,81,0.1)", color: "#ff7351" }}>
            <Wrench size={12} /> SYSTEM REPAIR
          </button>
          <button style={{ width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${C.border10}`, background: "transparent", cursor: "pointer", color: C.onSurfaceVariant }}>
            <Bell size={14} />
          </button>
        </div>
      </header>

      {/* Scrollable content — MAX-WIDTH zentriert für Fullscreen */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{
          maxWidth: 1400,      // nie breiter als 1400px
          margin: "0 auto",   // zentriert auf großen Monitoren
          padding: "24px 32px",
          display: "flex", flexDirection: "column", gap: 24,
        }}>
          {/* KPI Row */}
          <section style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
            <KpiCard title="Total Archived" value={stats.total}             badgeText="+beats" badgeColor="#22c55e" icon={<Archive size={15} />} />
            <KpiCard title="New This Month" value={stats.this_month}        badgeText="month"  badgeColor="#3b82f6" icon={<TrendingUp size={15} />} />
            <KpiCard title="Favorites"      value={stats.favorites}         badgeText="fav"    badgeColor="#ef4444" icon={<Heart size={15} />} />
            <KpiCard title="Average BPM"    value={Math.round(stats.avg_bpm)} badgeText="bpm"  badgeColor="#a855f7" icon={<Music size={15} />} />
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