// src/pages/Dashboard.tsx — 1:1 nach Stitch HTML Export
import { useState } from "react";
import { RefreshCw, Wrench, Bell, Play } from "lucide-react";
import { mockStats, type Beat } from "../lib/mockData";

// ── Stitch Design Tokens (exakt aus tailwind.config im HTML) ─────────────────
const C = {
  background:            "#0e0e0e",
  surface:               "#0e0e0e",
  surfaceContainerLow:   "#131313",
  surfaceContainer:      "#1a1919",
  surfaceContainerHigh:  "#201f1f",
  surfaceContainerHighest: "#262626",
  primary:               "#fda124",
  primaryContainer:      "#e48c03",
  tertiary:              "#9492ff",
  tertiaryContainer:     "#6760fd",
  error:                 "#ff7351",
  onSurface:             "#ffffff",
  onSurfaceVariant:      "#adaaaa",
  onSecondaryFixedVar:   "#5c5b5b",
  outlineVariant:        "#484847",
  border5:               "rgba(72,72,71,0.05)",
  border10:              "rgba(72,72,71,0.10)",
  border15:              "rgba(72,72,71,0.15)",
} as const;

// ── Status config — exakt nach Stitch-Tabelle ─────────────────────────────────
const STATUS_CFG: Record<string, { text: string; bg: string; border: string }> = {
  finished: { text: "#4ade80", bg: "rgba(74,222,128,0.10)", border: "rgba(74,222,128,0.20)" },
  wip:      { text: C.primaryContainer, bg: "rgba(228,140,3,0.10)", border: "rgba(228,140,3,0.20)" },
  idea:     { text: C.tertiary, bg: "rgba(148,146,255,0.10)", border: "rgba(148,146,255,0.20)" },
  sold:     { text: C.primary, bg: "rgba(253,161,36,0.10)", border: "rgba(253,161,36,0.20)" },
};

function StatusPill({ status }: { status: Beat["status"] }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.idea;
  return (
    <span style={{
      padding: "4px 8px", borderRadius: 4,
      fontSize: 9, fontWeight: 800,
      textTransform: "uppercase", letterSpacing: "0.05em",
      background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}`,
    }}>{status}</span>
  );
}

// ── KPI Card — exakt nach Stitch ─────────────────────────────────────────────
function KpiCard({ title, value, badgeText, badgeColor, badgeBg, icon }: {
  title: string; value: string | number;
  badgeText: string; badgeColor: string; badgeBg: string;
  icon: React.ReactNode;
}) {
  return (
    <div style={{
      background: C.surfaceContainerLow,
      padding: 20, borderRadius: 12,
      border: `1px solid ${C.border5}`,
      boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
    }}>
      {/* Top: label + icon */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSurfaceVariant }}>
          {title}
        </span>
        <span style={{ color: badgeColor, display: "flex" }}>{icon}</span>
      </div>
      {/* Value + badge */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <h3 style={{ fontSize: 30, fontWeight: 700, color: C.onSurface, lineHeight: 1 }}>
          {typeof value === "number" ? value.toLocaleString() : value}
        </h3>
        <span style={{
          fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "-0.02em",
          padding: "2px 6px", borderRadius: 4,
          color: badgeColor, background: badgeBg,
        }}>{badgeText}</span>
      </div>
    </div>
  );
}

// ── Status Breakdown ──────────────────────────────────────────────────────────
function StatusBreakdown() {
  const { by_status, total } = mockStats;
  const bars = [
    { key: "idea",     label: "Idea",     color: C.tertiary,        count: by_status.idea },
    { key: "wip",      label: "WIP",      color: C.primary,         count: by_status.wip },
    { key: "finished", label: "Finished", color: "#22c55e",         count: by_status.finished },
    { key: "sold",     label: "Sold",     color: C.primaryContainer, count: by_status.sold },
  ];

  return (
    <div style={{ background: C.surfaceContainer, padding: 24, borderRadius: 12, border: `1px solid ${C.border10}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSurface }}>
          Status Breakdown
        </h4>
        <span style={{ color: C.onSurfaceVariant, fontSize: 18, lineHeight: 1 }}>⋮</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {bars.map(({ key, label, color, count }) => {
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "-0.02em", color: C.onSurfaceVariant }}>
                <span>{label}</span>
                <span>{count}</span>
              </div>
              <div style={{ height: 8, width: "100%", background: C.surfaceContainerHighest, borderRadius: 999, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 999 }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Top 5 Keys — vertical bars ────────────────────────────────────────────────
function TopKeys() {
  const { top_keys } = mockStats;
  // Stitch: bars at different heights representing relative values
  // Colors from Stitch chart_colors
  const barColors = ["#fda124", "#9492ff", "#22c55e", "#9492ff", "#ff7351"];

  const max = Math.max(...top_keys.map(([, v]) => v));

  return (
    <div style={{ background: C.surfaceContainer, padding: 24, borderRadius: 12, border: `1px solid ${C.border10}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSurface }}>
          Top 5 Keys
        </h4>
        <span style={{ color: C.onSurfaceVariant, fontSize: 16 }}>≡</span>
      </div>

      {/* Vertical bars */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 120, marginBottom: 16 }}>
        {top_keys.map(([key, count], i) => {
          const heightPct = (count / max) * 100;
          return (
            <div key={key} style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 0 }}>
              {/* Count above bar */}
              <span style={{ fontSize: 10, color: C.onSurfaceVariant, marginBottom: 6, fontFamily: "monospace" }}>{count}</span>
              {/* Bar */}
              <div style={{
                width: "100%",
                height: `${heightPct}%`,
                background: barColors[i],
                borderRadius: "3px 3px 0 0",
                minHeight: 4,
              }} />
            </div>
          );
        })}
      </div>

      {/* Key labels */}
      <div style={{ display: "flex", gap: 12 }}>
        {top_keys.map(([key]) => (
          <span key={key} style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: 600, color: C.onSurfaceVariant }}>
            {key}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Beats Per Month — vertical bars ──────────────────────────────────────────
// Stitch uses exact pixel heights: h-16=64px h-24=96px h-32=128px h-28=112px etc
// We map data to these relative heights
function BeatsPerMonth() {
  const { beats_per_month } = mockStats;
  const max = Math.max(...beats_per_month.map(([, v]) => v));
  const CHART_H = 160;

  const monthLabels = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  return (
    <div style={{ background: C.surfaceContainer, padding: 24, borderRadius: 12, border: `1px solid ${C.border10}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSurface }}>
          Beats Per Month
        </h4>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.primary }} />
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.onSurfaceVariant }}>
            Current Year
          </span>
        </div>
      </div>

      {/* Bars */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: CHART_H }}>
        {beats_per_month.map(([month, count]) => {
          const heightPct = max > 0 && count > 0 ? (count / max) * 100 : 0;
          // Stitch: active months = primary, future/empty = surface-container-highest
          const isActive = count > 15;
          const opacity = isActive ? 1 : count > 0 ? 0.6 : 1;
          const bg = isActive
            ? (count === max ? C.primary : `rgba(253,161,36,${0.5 + (count/max)*0.5})`)
            : C.surfaceContainerHighest;

          return (
            <div key={month} style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end" }}>
              <div style={{
                width: "100%",
                height: `${Math.max(heightPct, count > 0 ? 4 : 2)}%`,
                background: bg,
                borderRadius: "2px 2px 0 0",
                opacity,
                transition: "opacity 0.15s",
                cursor: "pointer",
              }} />
            </div>
          );
        })}
      </div>

      {/* Month labels */}
      <div style={{
        display: "flex", justifyContent: "space-between",
        marginTop: 16,
        fontSize: 10, fontWeight: 700, textTransform: "uppercase",
        color: C.onSecondaryFixedVar, letterSpacing: "0.15em",
        padding: "0 2px",
      }}>
        {monthLabels.map(m => <span key={m}>{m}</span>)}
      </div>
    </div>
  );
}

// ── Top Tags — pills ─────────────────────────────────────────────────────────
// Stitch: first tag = primary, rest = on-surface-variant
function TopTags() {
  const { top_tags } = mockStats;

  return (
    <div style={{ background: C.surfaceContainer, padding: 24, borderRadius: 12, border: `1px solid ${C.border10}` }}>
      <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSurface, marginBottom: 24 }}>
        Top Tags
      </h4>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {top_tags.map(([tag], i) => {
          const isFirst = i === 0;
          return (
            <span
              key={tag}
              style={{
                padding: "6px 12px",
                background: C.surfaceContainerHighest,
                borderRadius: 9999,
                fontSize: 10, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.08em",
                color: isFirst ? C.primary : C.onSurfaceVariant,
                border: isFirst ? `1px solid rgba(253,161,36,0.2)` : "none",
                cursor: "pointer", transition: "all 0.15s",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = isFirst ? C.primary : "#2c2c2c";
                e.currentTarget.style.color = isFirst ? "#4e2d00" : "#ffffff";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = C.surfaceContainerHighest;
                e.currentTarget.style.color = isFirst ? C.primary : C.onSurfaceVariant;
              }}
            >
              #{tag}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── Latest Beats Table ────────────────────────────────────────────────────────
function LatestBeats() {
  const { recent_beats } = mockStats;
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  return (
    <section style={{ background: C.surfaceContainer, borderRadius: 12, border: `1px solid ${C.border10}`, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "24px 24px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.border10}` }}>
        <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSurface }}>
          Latest Beats
        </h4>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, fontWeight: 700, color: C.onSurfaceVariant, textTransform: "uppercase", letterSpacing: "0.15em", cursor: "pointer" }}>
          <span>View All</span>
          <span>›</span>
        </div>
      </div>

      {/* Table */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "rgba(19,19,19,0.5)" }}>
            {["Name", "Key", "BPM", "Status", "Date"].map(h => (
              <th key={h} style={{
                padding: "16px 24px",
                fontSize: 10, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.15em",
                color: C.onSurfaceVariant,
                textAlign: h === "Date" ? "right" : "left",
                fontFamily: "Inter, sans-serif",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {recent_beats.map((beat, i) => (
            <tr
              key={beat.id}
              style={{
                borderTop: `1px solid rgba(72,72,71,0.05)`,
                background: hoveredRow === i ? "rgba(32,31,31,0.5)" : "transparent",
                transition: "background 0.15s",
                cursor: "pointer",
              }}
              onMouseEnter={() => setHoveredRow(i)}
              onMouseLeave={() => setHoveredRow(null)}
            >
              {/* Name + play */}
              <td style={{ padding: "16px 24px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 4,
                    background: hoveredRow === i ? "rgba(253,161,36,0.2)" : C.surfaceContainerHighest,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "background 0.15s",
                  }}>
                    <Play
                      size={14}
                      fill={hoveredRow === i ? C.primary : C.onSurfaceVariant}
                      color={hoveredRow === i ? C.primary : C.onSurfaceVariant}
                    />
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: C.onSurface }}>{beat.name}</span>
                </div>
              </td>
              <td style={{ padding: "16px 24px", fontSize: 12, fontFamily: "monospace", color: C.onSurfaceVariant }}>{beat.key}</td>
              <td style={{ padding: "16px 24px", fontSize: 12, fontFamily: "monospace", color: C.onSurfaceVariant }}>{beat.bpm}</td>
              <td style={{ padding: "16px 24px" }}><StatusPill status={beat.status} /></td>
              <td style={{ padding: "16px 24px", fontSize: 12, fontFamily: "monospace", color: C.onSurfaceVariant, textAlign: "right" }}>{beat.created_date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ── Dashboard Page ────────────────────────────────────────────────────────────
export default function Dashboard() {
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", background: C.background }}>

      {/* TopNavBar — fixed, exakt nach Stitch */}
      <header style={{
        position: "sticky", top: 0,
        height: 64,
        background: "rgba(14,14,14,0.7)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "0 32px",
        zIndex: 40,
        borderBottom: `1px solid ${C.border15}`,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <h2 style={{ fontWeight: 600, fontSize: 18, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSurface, fontFamily: "Inter, sans-serif" }}>
            Dashboard
          </h2>
          <div style={{ height: 16, width: 1, background: "rgba(72,72,71,0.3)" }} />
          <p style={{ fontSize: 12, color: C.onSurfaceVariant, fontWeight: 500, textTransform: "uppercase", letterSpacing: "-0.02em" }}>
            System Status: Nominal
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "6px 12px", borderRadius: 2,
            background: C.surfaceContainer,
            color: C.onSurfaceVariant,
            fontSize: 12, fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.08em",
            border: "none", cursor: "pointer", transition: "all 0.15s",
          }}
            onMouseEnter={e => { e.currentTarget.style.background = C.surfaceContainerHigh; e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={e => { e.currentTarget.style.background = C.surfaceContainer; e.currentTarget.style.color = C.onSurfaceVariant; }}
          >
            <RefreshCw size={14} />
            Refresh
          </button>

          <button style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "6px 12px", borderRadius: 2,
            background: "rgba(255,115,81,0.1)",
            color: C.error,
            fontSize: 12, fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.08em",
            border: "none", cursor: "pointer", transition: "all 0.15s",
          }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,115,81,0.2)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,115,81,0.1)"; }}
          >
            <Wrench size={14} />
            System Repair
          </button>

          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: C.surfaceContainerHighest,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", transition: "all 0.15s",
          }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 0 0 2px rgba(253,161,36,0.5)"; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}
          >
            <Bell size={14} color={C.onSurfaceVariant} />
          </div>
        </div>
      </header>

      {/* Scrollable page content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 32, display: "flex", flexDirection: "column", gap: 32 }}>

        {/* KPI Cards — 4 columns */}
        <section style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}>
          <KpiCard
            title="Total Archived" value={mockStats.total}
            badgeText="+12%" badgeColor={C.primary} badgeBg={`rgba(253,161,36,0.1)`}
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>}
          />
          <KpiCard
            title="New This Month" value={mockStats.this_month}
            badgeText="Peak" badgeColor={C.tertiary} badgeBg={`rgba(148,146,255,0.1)`}
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.tertiary} strokeWidth="1.5"><path d="M12 2v4M12 2l3 3M12 2l-3 3"/><rect x="3" y="6" width="18" height="4" rx="1"/><path d="M5 10v10a1 1 0 001 1h12a1 1 0 001-1V10"/></svg>}
          />
          <KpiCard
            title="Favorites" value={mockStats.favorites}
            badgeText="High" badgeColor={C.error} badgeBg={`rgba(255,115,81,0.1)`}
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill={C.error} stroke={C.error} strokeWidth="1.5"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>}
          />
          <KpiCard
            title="Average BPM" value={mockStats.avg_bpm}
            badgeText="bpm" badgeColor={C.onSurfaceVariant} badgeBg="transparent"
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.onSurfaceVariant} strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
          />
        </section>

        {/* Charts row 1 — 2 equal columns */}
        <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <StatusBreakdown />
          <TopKeys />
        </section>

        {/* Charts row 2 — beats wider, tags narrower */}
        <section style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 24 }}>
          <BeatsPerMonth />
          <TopTags />
        </section>

        {/* Latest Beats */}
        <LatestBeats />

      </div>
    </div>
  );
}