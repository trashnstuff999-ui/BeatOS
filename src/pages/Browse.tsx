// src/pages/Browse.tsx — 1:1 nach Stitch HTML Export
import { useState } from "react";
import {
  RefreshCw, Bell, Search, FolderOpen, Heart,
  Music, RotateCcw, Filter, X, Play, Pause, Volume2, Repeat
} from "lucide-react";

// ── Tokens ────────────────────────────────────────────────────────────────────
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
  onTertiary:             "#120076",
  onSurface:              "#ffffff",
  onSurfaceVariant:       "#adaaaa",
  onSecondaryFixedVar:    "#5c5b5b",
  outlineVariant:         "#484847",
  error:                  "#ff7351",
  border10:               "rgba(72,72,71,0.10)",
  border15:               "rgba(72,72,71,0.15)",
  border20:               "rgba(72,72,71,0.20)",
  onPrimary:              "#4e2d00",
} as const;

// ── Mock Data ─────────────────────────────────────────────────────────────────
type Beat = {
  id: string; name: string; key: string; bpm: number;
  status: "idea" | "wip" | "finished" | "sold";
  tags: string[]; favorite: boolean; notes: string;
};

const MOCK_BEATS: Beat[] = [
  { id: "#BT-1284", name: "Midnight Echoes",    key: "A Minor", bpm: 140, status: "wip",      tags: ["TRAP","DARK","HEAVY"], favorite: true,  notes: "" },
  { id: "#BT-1283", name: "Silicon Valley Bass", key: "F# Major",bpm: 128, status: "finished", tags: ["BASS","TECH"],         favorite: false, notes: "" },
  { id: "#BT-1282", name: "Dark Matter",         key: "C Minor", bpm: 145, status: "idea",     tags: ["DARK","CINEMATIC"],    favorite: false, notes: "" },
  { id: "#BT-1281", name: "Golden Hour",         key: "G Major", bpm: 98,  status: "sold",     tags: ["MELODIC","CHILL"],     favorite: true,  notes: "" },
  { id: "#BT-1280", name: "Neon Drift",          key: "D Minor", bpm: 132, status: "wip",      tags: ["PHONK","808"],         favorite: false, notes: "" },
];

const STATUS_CFG = {
  idea:     { label: "IDEA",     color: C.tertiary,        bg: "rgba(148,146,255,0.15)", border: "rgba(148,146,255,0.20)" },
  wip:      { label: "WIP",      color: C.primary,         bg: "rgba(253,161,36,0.15)",  border: "rgba(253,161,36,0.20)"  },
  finished: { label: "FINISHED", color: "#22c55e",         bg: "rgba(34,197,94,0.15)",   border: "rgba(34,197,94,0.20)"   },
  sold:     { label: "SOLD",     color: C.primaryContainer, bg: "rgba(228,140,3,0.15)",  border: "rgba(228,140,3,0.20)"   },
} as const;

// ── Status Pill ───────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: Beat["status"] }) {
  const cfg = STATUS_CFG[status];
  return (
    <span style={{
      padding: "2px 10px", borderRadius: 9999,
      fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
    }}>{cfg.label}</span>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────────────
function DetailPanel({ beat, onClose }: { beat: Beat; onClose: () => void }) {
  const [name, setName]     = useState(beat.name);
  const [bpm, setBpm]       = useState(String(beat.bpm));
  const [key, setKey]       = useState(beat.key);
  const [status, setStatus] = useState(beat.status);
  const [tags, setTags]     = useState(beat.tags);
  const [notes, setNotes]   = useState(beat.notes);
  const [newTag, setNewTag] = useState("");
  const [addingTag, setAddingTag] = useState(false);
  const [playing, setPlaying]    = useState(false);
  const [fav, setFav]            = useState(beat.favorite);

  const statusItems: { key: Beat["status"]; label: string }[] = [
    { key: "idea", label: "Idea" }, { key: "wip", label: "WIP" },
    { key: "finished", label: "Fin" }, { key: "sold", label: "Sold" },
  ];

  return (
    <aside style={{
      position: "fixed", right: 0, top: 0,
      height: "100vh", width: 360,
      background: C.background,
      display: "flex", flexDirection: "column",
      zIndex: 50, borderLeft: `1px solid ${C.border15}`,
    }}>

      {/* Player area — full bleed cover */}
      <div style={{ position: "relative", height: 240, flexShrink: 0 }}>
        {/* Cover background */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(135deg, #1a1919 0%, #262626 60%, #131313 100%)",
        }} />
        {/* Gradient overlay */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(0deg, rgba(14,14,14,1) 0%, rgba(14,14,14,0.6) 50%, rgba(14,14,14,0.3) 100%)",
        }} />

        {/* Player content */}
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column",
          justifyContent: "flex-end", padding: 24, gap: 16,
        }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.primary }}>
              Beat Inspector
            </h2>
            <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.6)" }}>
              {beat.id}
            </span>
          </div>

          {/* Play button */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <button
              onClick={() => setPlaying(!playing)}
              style={{
                width: 56, height: 56, borderRadius: "50%",
                background: C.primary, border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 0 20px rgba(253,161,36,0.4)",
                transition: "transform 0.1s",
              }}
            >
              {playing
                ? <Pause size={24} fill={C.onPrimary} color={C.onPrimary} />
                : <Play  size={24} fill={C.onPrimary} color={C.onPrimary} style={{ marginLeft: 2 }} />
              }
            </button>
          </div>

          {/* Seek bar */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 2, cursor: "pointer", position: "relative" }}>
              <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: "40%", background: C.primary, borderRadius: 2 }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.6)", textTransform: "uppercase" }}>
              <span>01:12</span><span>03:45</span>
            </div>
          </div>

          {/* Controls */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Repeat size={14} color="rgba(255,255,255,0.7)" strokeWidth={1.5} style={{ cursor: "pointer" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Volume2 size={14} color="rgba(255,255,255,0.7)" strokeWidth={1.5} />
              <div style={{ width: 80, height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 2, cursor: "pointer", position: "relative" }}>
                <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: "70%", background: C.primary, borderRadius: 2 }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 32, background: C.background }}>

        {/* Name / BPM / Key */}
        <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSecondaryFixedVar }}>Name</label>
            <input
              value={name} onChange={e => setName(e.target.value)}
              style={{
                width: "100%", background: C.surfaceContainerLow,
                border: `1px solid ${C.border10}`, borderRadius: 4,
                padding: "8px 12px", fontSize: 14, fontWeight: 600,
                color: C.onSurface, outline: "none", fontFamily: "Inter, sans-serif",
                boxSizing: "border-box", transition: "border-color 0.2s",
              }}
              onFocus={e => (e.currentTarget.style.borderColor = C.primary)}
              onBlur={e => (e.currentTarget.style.borderColor = C.border10)}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {[
              { label: "BPM", value: bpm, set: setBpm, type: "number" },
              { label: "Key", value: key, set: setKey, type: "text"   },
            ].map(({ label, value, set, type }) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSecondaryFixedVar }}>{label}</label>
                <input
                  type={type} value={value} onChange={e => set(e.target.value)}
                  style={{
                    width: "100%", background: C.surfaceContainerLow,
                    border: `1px solid ${C.border10}`, borderRadius: 4,
                    padding: "8px 12px", fontSize: 14, fontWeight: 600,
                    color: C.onSurface, outline: "none", fontFamily: "Inter, sans-serif",
                    boxSizing: "border-box", transition: "border-color 0.2s",
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = C.primary)}
                  onBlur={e => (e.currentTarget.style.borderColor = C.border10)}
                />
              </div>
            ))}
          </div>
        </section>

        {/* Status Console */}
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSecondaryFixedVar }}>Status Console</label>
          <div style={{
            display: "flex", padding: 4,
            background: C.surfaceContainerLow,
            borderRadius: 4, border: `1px solid ${C.border10}`,
          }}>
            {statusItems.map(({ key: k, label }) => {
              const isActive = status === k;
              const cfg = STATUS_CFG[k];
              return (
                <button
                  key={k}
                  onClick={() => setStatus(k)}
                  style={{
                    flex: 1, padding: "6px 4px",
                    fontSize: 9, fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.15em",
                    border: "none", borderRadius: 3, cursor: "pointer",
                    background: isActive ? cfg.color : "transparent",
                    color: isActive ? (k === "wip" ? C.onPrimary : "#000") : C.onSurfaceVariant,
                    transition: "all 0.15s", fontFamily: "Inter, sans-serif",
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = C.onSurface; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = C.onSurfaceVariant; }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Metadata Tags */}
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSecondaryFixedVar }}>Metadata Tags</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {tags.map(tag => (
              <span key={tag} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 12px", background: C.surfaceContainerLow,
                border: `1px solid ${C.border10}`, borderRadius: 9999,
                fontSize: 10, fontWeight: 700, color: C.onSurface,
              }}>
                {tag}
                <button
                  onClick={() => setTags(tags.filter(t => t !== tag))}
                  style={{ background: "none", border: "none", cursor: "pointer", color: C.onSurfaceVariant, display: "flex", padding: 0 }}
                  onMouseEnter={e => (e.currentTarget.style.color = C.error)}
                  onMouseLeave={e => (e.currentTarget.style.color = C.onSurfaceVariant)}
                >
                  <X size={12} />
                </button>
              </span>
            ))}

            {addingTag ? (
              <input
                autoFocus
                value={newTag}
                onChange={e => setNewTag(e.target.value.toUpperCase())}
                onKeyDown={e => {
                  if (e.key === "Enter" && newTag.trim()) {
                    setTags([...tags, newTag.trim()]);
                    setNewTag(""); setAddingTag(false);
                  }
                  if (e.key === "Escape") { setNewTag(""); setAddingTag(false); }
                }}
                onBlur={() => { setNewTag(""); setAddingTag(false); }}
                placeholder="TAG NAME"
                style={{
                  padding: "6px 12px", background: C.surfaceContainerLow,
                  border: `1px solid ${C.primary}`, borderRadius: 9999,
                  fontSize: 10, fontWeight: 700, color: C.onSurface,
                  outline: "none", width: 90, fontFamily: "Inter, sans-serif",
                }}
              />
            ) : (
              <button
                onClick={() => setAddingTag(true)}
                style={{
                  padding: "6px 12px", borderRadius: 9999,
                  border: `1px dashed rgba(253,161,36,0.4)`,
                  fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                  color: C.primary, background: "transparent", cursor: "pointer",
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(253,161,36,0.05)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                + Add Tag
              </button>
            )}
          </div>
        </section>

        {/* Production Notes */}
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSecondaryFixedVar }}>Production Notes</label>
          <textarea
            value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Add session notes, plugin chain details, or arrangement ideas..."
            rows={4}
            style={{
              width: "100%", background: C.surfaceContainerLow,
              border: `1px solid ${C.border10}`, borderRadius: 4,
              padding: 16, fontSize: 12, color: C.onSurfaceVariant,
              resize: "none", outline: "none",
              fontFamily: "Inter, sans-serif", lineHeight: 1.6,
              boxSizing: "border-box", transition: "border-color 0.2s",
            }}
            onFocus={e => (e.currentTarget.style.borderColor = C.primary)}
            onBlur={e => (e.currentTarget.style.borderColor = C.border10)}
          />
        </section>
      </div>

      {/* Footer */}
      <div style={{
        padding: 24, background: C.surfaceContainerLow,
        borderTop: `1px solid ${C.border15}`,
        display: "flex", gap: 12,
      }}>
        <button style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
          padding: "14px 0", background: C.primary,
          color: C.onPrimary, fontWeight: 700, fontSize: 10,
          textTransform: "uppercase", letterSpacing: "0.15em",
          border: "none", borderRadius: 6, cursor: "pointer",
          boxShadow: "0 4px 15px rgba(253,161,36,0.25)",
          fontFamily: "Inter, sans-serif",
        }}>
          <FolderOpen size={18} strokeWidth={1.5} /> Open Folder
        </button>
        <button
          onClick={() => setFav(!fav)}
          style={{
            width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center",
            background: C.background, border: `1px solid ${C.border20}`,
            borderRadius: 6, cursor: "pointer", transition: "all 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "rgba(253,161,36,0.1)")}
          onMouseLeave={e => (e.currentTarget.style.background = C.background)}
        >
          <Heart size={18} fill={fav ? C.primary : "none"} color={C.primary} strokeWidth={1.5} />
        </button>
      </div>
    </aside>
  );
}

// ── Browse Page ───────────────────────────────────────────────────────────────
export default function Browse() {
  const [search, setSearch]       = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterKey, setFilterKey] = useState("any");
  const [bpmMin, setBpmMin]       = useState("");
  const [bpmMax, setBpmMax]       = useState("");
  const [onlyFavs, setOnlyFavs]   = useState(false);
  const [selectedBeat, setSelectedBeat] = useState<Beat | null>(MOCK_BEATS[0]);
  const [beats, setBeats]         = useState(MOCK_BEATS);

  const filtered = beats.filter(b => {
    if (search && !b.name.toLowerCase().includes(search.toLowerCase()) && !b.id.includes(search)) return false;
    if (filterStatus !== "all" && b.status !== filterStatus) return false;
    if (onlyFavs && !b.favorite) return false;
    if (bpmMin && b.bpm < parseInt(bpmMin)) return false;
    if (bpmMax && b.bpm > parseInt(bpmMax)) return false;
    return true;
  });

  const toggleFav = (id: string) => {
    setBeats(prev => prev.map(b => b.id === id ? { ...b, favorite: !b.favorite } : b));
  };

  const PANEL_W = selectedBeat ? 360 : 0;
  const inputStyle = {
    background: C.surfaceContainerLowest, border: "none", borderRadius: 2,
    padding: "8px 10px", fontSize: 11, fontWeight: 500, color: C.onSurface,
    outline: "none", fontFamily: "Inter, sans-serif", width: "100%",
    transition: "box-shadow 0.2s",
  };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", background: C.background, marginRight: PANEL_W, transition: "margin-right 0.3s" }}>

      {/* Header */}
      <header style={{
        height: 64, flexShrink: 0,
        background: "rgba(14,14,14,0.7)",
        backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "0 32px", borderBottom: `1px solid ${C.border15}`,
      }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.15em", color: C.primary }}>
          Archive
        </h2>

        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {/* Search */}
          <div style={{ position: "relative" }}>
            <Search size={14} color={C.onSurfaceVariant} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="SEARCH CATALOG..."
              style={{
                ...inputStyle, paddingLeft: 36, width: 256,
                letterSpacing: "0.15em", fontSize: 12,
              }}
              onFocus={e => (e.currentTarget.style.boxShadow = `0 0 0 1px ${C.primary}`)}
              onBlur={e => (e.currentTarget.style.boxShadow = "none")}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16, color: C.onSurfaceVariant }}>
            <RefreshCw size={18} strokeWidth={1.5} style={{ cursor: "pointer" }}
              onMouseEnter={e => (e.currentTarget.style.color = C.onSurface)}
              onMouseLeave={e => (e.currentTarget.style.color = C.onSurfaceVariant)}
            />
            <Bell size={18} strokeWidth={1.5} style={{ cursor: "pointer" }}
              onMouseEnter={e => (e.currentTarget.style.color = C.onSurface)}
              onMouseLeave={e => (e.currentTarget.style.color = C.onSurfaceVariant)}
            />
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: C.surfaceContainerHighest,
              border: `1px solid ${C.border20}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700, color: C.primary,
            }}>JD</div>
          </div>
        </div>
      </header>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 32, display: "flex", flexDirection: "column", gap: 24 }}>

        {/* Advanced Filtering */}
        <section style={{
          background: C.surfaceContainerLow, borderRadius: 8,
          padding: 16, border: `1px solid ${C.border10}`,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Filter size={14} color={C.primary} strokeWidth={1.5} />
              <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "-0.02em", color: C.onSurface }}>
                Advanced Filtering
              </h3>
            </div>
            <button
              onClick={() => { setFilterStatus("all"); setFilterKey("any"); setBpmMin(""); setBpmMax(""); setOnlyFavs(false); }}
              style={{
                fontSize: 10, color: C.onSurfaceVariant, background: "none",
                border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.15em",
                fontFamily: "Inter, sans-serif", transition: "color 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.color = C.onSurface)}
              onMouseLeave={e => (e.currentTarget.style.color = C.onSurfaceVariant)}
            >
              Reset All <RotateCcw size={12} />
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 24 }}>
            {/* Status */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSecondaryFixedVar }}>Status</label>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={inputStyle}>
                <option value="all">All Statuses</option>
                <option value="idea">Idea</option>
                <option value="wip">WIP</option>
                <option value="finished">Finished</option>
                <option value="sold">Sold</option>
              </select>
            </div>

            {/* Musical Key */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSecondaryFixedVar }}>Musical Key</label>
              <select value={filterKey} onChange={e => setFilterKey(e.target.value)} style={inputStyle}>
                <option value="any">Any Key</option>
                <option>C Major / A Minor</option>
                <option>G Major / E Minor</option>
                <option>D Major / B Minor</option>
              </select>
            </div>

            {/* BPM Range */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSecondaryFixedVar }}>BPM Range (80-160)</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="number" placeholder="MIN" value={bpmMin} onChange={e => setBpmMin(e.target.value)} style={{ ...inputStyle, width: "50%" }} />
                <input type="number" placeholder="MAX" value={bpmMax} onChange={e => setBpmMax(e.target.value)} style={{ ...inputStyle, width: "50%" }} />
              </div>
            </div>

            {/* Favorites */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSecondaryFixedVar }}>Favorites</label>
              <button
                onClick={() => setOnlyFavs(!onlyFavs)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 12px", borderRadius: 2,
                  background: onlyFavs ? "rgba(253,161,36,0.15)" : C.surfaceContainerLowest,
                  border: onlyFavs ? `1px solid rgba(253,161,36,0.3)` : "1px solid transparent",
                  cursor: "pointer", transition: "all 0.15s",
                  fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                  color: onlyFavs ? C.primary : C.onSurfaceVariant,
                  fontFamily: "Inter, sans-serif",
                }}
              >
                <Heart size={12} fill={onlyFavs ? C.primary : "none"} color={onlyFavs ? C.primary : C.onSurfaceVariant} strokeWidth={1.5} />
                Only Favs
              </button>
            </div>

            {/* View Mode */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSecondaryFixedVar }}>View Mode</label>
              <button style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 12px", borderRadius: 2,
                background: C.surfaceContainerLowest, cursor: "pointer",
                fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                color: C.onSurfaceVariant, border: "none", fontFamily: "Inter, sans-serif",
                transition: "background 0.15s",
              }}
                onMouseEnter={e => (e.currentTarget.style.background = C.surfaceContainerHighest)}
                onMouseLeave={e => (e.currentTarget.style.background = C.surfaceContainerLowest)}
              >
                <Music size={12} strokeWidth={1.5} /> Show Artwork
              </button>
            </div>
          </div>
        </section>

        {/* Beat Table */}
        <section style={{ background: C.surfaceContainerLowest, borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border10}` }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: C.surfaceContainerLow, borderBottom: `1px solid ${C.border10}` }}>
                {["ID", "Name", "Key", "BPM", "Status", "Action"].map((h, i) => (
                  <th key={h} style={{
                    padding: 16, fontSize: 10, fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.15em",
                    color: C.onSecondaryFixedVar,
                    textAlign: i === 4 ? "center" : i === 5 ? "right" : "left",
                    fontFamily: "Inter, sans-serif",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((beat, i) => {
                const isSelected = selectedBeat?.id === beat.id;
                return (
                  <tr
                    key={beat.id}
                    onClick={() => setSelectedBeat(beat)}
                    style={{
                      borderTop: i > 0 ? `1px solid rgba(72,72,71,0.05)` : undefined,
                      background: isSelected ? "rgba(26,25,25,0.5)" : "transparent",
                      cursor: "pointer", transition: "background 0.15s",
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = C.surfaceContainer; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                  >
                    <td style={{ padding: 16, fontSize: 12, fontFamily: "monospace", color: C.primary, fontWeight: 700 }}>{beat.id}</td>
                    <td style={{ padding: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 4,
                          background: C.surfaceContainerHighest,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <Music size={12} color={C.onSurfaceVariant} strokeWidth={1.5} />
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em", color: C.onSurface }}>{beat.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: 16, fontSize: 12, fontWeight: 500, color: C.onSurfaceVariant }}>{beat.key}</td>
                    <td style={{ padding: 16, fontSize: 12, fontWeight: 500, color: C.onSurfaceVariant }}>{beat.bpm}</td>
                    <td style={{ padding: 16, textAlign: "center" }}><StatusPill status={beat.status} /></td>
                    <td style={{ padding: 16, textAlign: "right" }}>
                      <button
                        onClick={e => { e.stopPropagation(); toggleFav(beat.id); }}
                        style={{ background: "none", border: "none", cursor: "pointer", display: "inline-flex" }}
                      >
                        <Heart
                          size={20} strokeWidth={1.5}
                          fill={beat.favorite ? C.primary : "none"}
                          color={beat.favorite ? C.primary : C.onSurfaceVariant}
                        />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 48, textAlign: "center", color: C.onSecondaryFixedVar, fontSize: 13, fontStyle: "italic" }}>
                    No beats found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>

      {/* Detail Panel */}
      {selectedBeat && <DetailPanel beat={selectedBeat} onClose={() => setSelectedBeat(null)} />}
    </div>
  );
}