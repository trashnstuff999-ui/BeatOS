// src/pages/Dashboard.tsx — Live DB Version
import { useState, useEffect } from "react";
import { RefreshCw, Wrench, Bell, Archive, TrendingUp, Heart, Music, Play } from "lucide-react";
import { getStats, normalizeStatus, type Stats } from "../lib/Database";

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
function StatusBreakdown({ stats }: { stats: Stats }) {
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
          <div key={key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "-0.02em", color: C.onSurfaceVariant }}>
              <span>{label}</span><span>{count}</span>
            </div>
            <div style={{ height: 8, background: C.surfaceContainerHighest, borderRadius: 999, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.round((count / total) * 100)}%`, background: color, borderRadius: 999 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Top 5 Keys ────────────────────────────────────────────────────────────────
function TopKeys({ stats }: { stats: Stats }) {
  const keys = stats.top_keys;
  const max  = Math.max(...keys.map(k => k.count), 1);
  const [hov, setHov] = useState<number | null>(null);
  const barColors = [C.primary, "#3b82f6", "#22c55e", "#a855f7", "#ef4444"];

  return (
    <div style={{ background: C.surfaceContainer, padding: 24, borderRadius: 12, border: `1px solid ${C.border10}`, transition: "border-color 0.2s" }} {...cardHover}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSurface }}>Top 5 Keys</h4>
        <span style={{ color: C.onSurfaceVariant, fontSize: 16 }}>≡</span>
      </div>
      {keys.length === 0 ? (
        <p style={{ color: C.onSecondaryFixedVar, fontSize: 12, textAlign: "center", padding: "20px 0" }}>No key data</p>
      ) : (
        <>
          {/* Balken — flex:1 für responsive Breite, aber max-width für Eleganz */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 120, marginBottom: 16 }}>
            {keys.map(({ key, count }, i) => {
              const color = barColors[i % barColors.length];
              const isHov = hov === i;
              return (
                <div key={key} style={{ flex: 1, maxWidth: 56, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 6, cursor: "pointer" }}
                  onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}>
                  <span style={{ fontSize: 10, color: isHov ? color : C.onSurfaceVariant, fontFamily: "monospace", fontWeight: isHov ? 700 : 400, transition: "all 0.15s" }}>{count}</span>
                  <div style={{ width: "100%", height: `${(count / max) * 100}%`, background: color, borderRadius: "3px 3px 0 0", minHeight: 4, opacity: isHov ? 1 : 0.75, transition: "opacity 0.15s, box-shadow 0.15s", boxShadow: isHov ? `0 0 12px ${color}60` : "none" }} />
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            {keys.map(({ key }, i) => (
              <span key={key} style={{ flex: 1, maxWidth: 56, textAlign: "center", fontSize: 11, fontWeight: 600, color: hov === i ? barColors[i % barColors.length] : C.onSurfaceVariant, transition: "color 0.15s" }}>{key}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Beats Per Month ───────────────────────────────────────────────────────────
function BeatsPerMonth({ stats }: { stats: Stats }) {
  const data = stats.beats_per_month;
  const max  = Math.max(...data.map(d => d.count), 1);
  const [hov, setHov] = useState<number | null>(null);

  const monthLabel = (s: string) =>
    ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"]
    [parseInt(s.split("-")[1] ?? "1") - 1] ?? s;

  const CHART_H = 130;

  return (
    <div style={{ background: C.surfaceContainer, padding: 24, borderRadius: 12, border: `1px solid ${C.border10}`, transition: "border-color 0.2s" }} {...cardHover}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSurface }}>Beats Per Month</h4>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.primary }} />
          <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.onSurfaceVariant }}>Current Year</span>
        </div>
      </div>

      {/* Bars — flex layout, responsive width */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: CHART_H, marginBottom: 8 }}>
        {data.map(({ month, count }, i) => {
          const isHov = hov === i;
          const barH  = count > 0 ? Math.max((count / max) * CHART_H, 4) : 2;
          return (
            <div key={month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", cursor: count > 0 ? "pointer" : "default" }}
              onMouseEnter={() => count > 0 && setHov(i)}
              onMouseLeave={() => setHov(null)}
            >
              {/* Count above bar */}
              <span style={{
                fontSize: 8, fontFamily: "monospace", marginBottom: 2,
                color: isHov ? C.primary : C.onSurfaceVariant,
                opacity: count > 0 ? 1 : 0,
                fontWeight: isHov ? 700 : 400,
                transition: "all 0.15s",
                lineHeight: 1,
              }}>{count > 0 ? count : ""}</span>
              {/* Bar */}
              <div style={{
                width: "70%",   // 70% der Zelle = Luft zwischen Balken + nicht zu breit
                height: barH,
                background: count > 0 ? C.primary : C.surfaceContainerHighest,
                borderRadius: "2px 2px 0 0",
                opacity: isHov ? 1 : count > 0 ? 0.72 : 0.25,
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
            flex: 1, textAlign: "center", fontSize: 8,
            color: hov === i ? C.primary : C.onSecondaryFixedVar,
            textTransform: "uppercase",
            fontWeight: hov === i ? 700 : 400,
            transition: "color 0.15s",
          }}>{monthLabel(month)}</span>
        ))}
      </div>
    </div>
  );
}

// ── Top Tags ──────────────────────────────────────────────────────────────────
function TopTags({ stats }: { stats: Stats }) {
  const tagColors = [C.primary, "#3b82f6", "#22c55e", "#a855f7", "#ef4444", "#06b6d4", "#f97316", "#84cc16", "#ec4899"];
  return (
    <div style={{ background: C.surfaceContainer, padding: 24, borderRadius: 12, border: `1px solid ${C.border10}`, height: "100%", transition: "border-color 0.2s" }} {...cardHover}>
      <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSurface, marginBottom: 24 }}>Top Tags</h4>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {stats.top_tags.map(({ tag }, i) => {
          const color = tagColors[i % tagColors.length];
          return (
            <span key={tag} style={{
              padding: "6px 12px", background: C.surfaceContainerHighest, borderRadius: 9999,
              fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em",
              color: i === 0 ? C.primary : C.onSurfaceVariant,
              border: i === 0 ? `1px solid rgba(253,161,36,0.2)` : "none",
              cursor: "pointer", transition: "all 0.15s",
            }}
              onMouseEnter={e => { e.currentTarget.style.color = color; e.currentTarget.style.border = `1px solid ${color}40`; }}
              onMouseLeave={e => { e.currentTarget.style.color = i === 0 ? C.primary : C.onSurfaceVariant; e.currentTarget.style.border = i === 0 ? `1px solid rgba(253,161,36,0.2)` : "none"; }}
            >
              #{tag}
            </span>
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

  const load = async () => {
    setLoading(true); setError(null);
    try { setStats(await getStats()); }
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
        <button onClick={load} style={{ padding: "8px 24px", background: C.primary, color: C.onPrimary, border: "none", borderRadius: 6, fontWeight: 700, cursor: "pointer" }}>Retry</button>
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
          <button onClick={load} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, fontSize: 10, fontWeight: 700, border: `1px solid ${C.border10}`, color: C.onSurfaceVariant, background: "transparent", cursor: "pointer", letterSpacing: "0.05em" }}>
            <RefreshCw size={12} /> REFRESH
          </button>
          <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, fontSize: 10, fontWeight: 700, border: "none", cursor: "pointer", letterSpacing: "0.05em", background: "rgba(255,115,81,0.1)", color: "#ff7351" }}>
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
          <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <StatusBreakdown stats={stats} />
            <TopKeys stats={stats} />
          </section>

          {/* Analytics Row 2 */}
          <section style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 20 }}>
            <BeatsPerMonth stats={stats} />
            <TopTags stats={stats} />
          </section>

          {/* Latest Beats */}
          <LatestBeats stats={stats} />
        </div>
      </div>
    </div>
  );
}