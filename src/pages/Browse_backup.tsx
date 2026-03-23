// src/pages/Browse.tsx — DB-Connected Version
// ═══════════════════════════════════════════════════════════════════════════════
// Features:
// - Echte Daten aus SQLite DB via Tauri invoke
// - Filter: Status, BPM Range, Favorites, Search
// - Detail Panel mit Beat Inspector
// - Favorite Toggle mit DB-Update
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  RefreshCw, Bell, Search, FolderOpen, Heart,
  Music, RotateCcw, Filter, X, Play, Pause, Volume2, Repeat,
  Loader2, AlertCircle
} from "lucide-react";
import { C } from "../lib/theme";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Beat {
  id: string;
  name: string;
  path: string | null;
  bpm: number | null;
  key: string | null;
  status: string | null;
  tags: string | null;
  favorite: number | null;  // 0 or 1
  created_date: string | null;
  modified_date: string | null;
  notes: string | null;
  sold_to: string | null;
  has_artwork: number | null;
  has_video: number | null;
}

// ─── Status Config ───────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  idea:     { label: "IDEA",     color: C.tertiary,   bg: "rgba(148,146,255,0.15)", border: "rgba(148,146,255,0.20)" },
  wip:      { label: "WIP",      color: C.primary,    bg: "rgba(253,161,36,0.15)",  border: "rgba(253,161,36,0.20)"  },
  finished: { label: "FINISHED", color: "#22c55e",    bg: "rgba(34,197,94,0.15)",   border: "rgba(34,197,94,0.20)"   },
  sold:     { label: "SOLD",     color: "#e48c03",    bg: "rgba(228,140,3,0.15)",   border: "rgba(228,140,3,0.20)"   },
};

// ─── Status Pill ─────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string | null }) {
  const cfg = STATUS_CFG[status || "idea"] || STATUS_CFG.idea;
  return (
    <span style={{
      padding: "2px 10px", borderRadius: 9999,
      fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
    }}>{cfg.label}</span>
  );
}

// ─── Detail Panel ────────────────────────────────────────────────────────────

interface DetailPanelProps {
  beat: Beat;
  onClose: () => void;
  onUpdate: (beat: Beat) => void;
}

function DetailPanel({ beat, onClose, onUpdate }: DetailPanelProps) {
  const [name, setName] = useState(beat.name);
  const [bpm, setBpm] = useState(String(beat.bpm || ""));
  const [key, setKey] = useState(beat.key || "");
  const [status, setStatus] = useState(beat.status || "idea");
  const [tags, setTags] = useState<string[]>(beat.tags ? beat.tags.split(", ").filter(t => t) : []);
  const [notes, setNotes] = useState(beat.notes || "");
  const [newTag, setNewTag] = useState("");
  const [addingTag, setAddingTag] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [fav, setFav] = useState(beat.favorite === 1);

  const statusItems: { key: string; label: string }[] = [
    { key: "idea", label: "Idea" },
    { key: "wip", label: "WIP" },
    { key: "finished", label: "Fin" },
    { key: "sold", label: "Sold" },
  ];

  const handleFavToggle = async () => {
    const newFav = !fav;
    setFav(newFav);
    try {
      await invoke("toggle_favorite", { beatId: beat.id, favorite: newFav });
      onUpdate({ ...beat, favorite: newFav ? 1 : 0 });
    } catch (e) {
      console.error("Failed to toggle favorite:", e);
      setFav(!newFav); // Revert on error
    }
  };

  return (
    <aside style={{
      position: "fixed", right: 0, top: 0,
      height: "100vh", width: 360,
      background: C.background,
      display: "flex", flexDirection: "column",
      zIndex: 50, borderLeft: `1px solid ${C.border15}`,
    }}>
      {/* Player area */}
      <div style={{ position: "relative", height: 240, flexShrink: 0 }}>
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(135deg, #1a1919 0%, #262626 60%, #131313 100%)",
        }} />
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(0deg, rgba(14,14,14,1) 0%, rgba(14,14,14,0.6) 50%, rgba(14,14,14,0.3) 100%)",
        }} />

        <div style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column",
          justifyContent: "flex-end", padding: 24, gap: 16,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.primary }}>
              Beat Inspector
            </h2>
            <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.6)" }}>
              #{beat.id}
            </span>
          </div>

          <div style={{ display: "flex", justifyContent: "center" }}>
            <button
              onClick={() => setPlaying(!playing)}
              style={{
                width: 56, height: 56, borderRadius: "50%",
                background: C.primary, border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 0 20px rgba(253,161,36,0.4)",
              }}
            >
              {playing
                ? <Pause size={24} fill="#4e2d00" color="#4e2d00" />
                : <Play size={24} fill="#4e2d00" color="#4e2d00" style={{ marginLeft: 2 }} />
              }
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 2, position: "relative" }}>
              <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: "40%", background: C.primary, borderRadius: 2 }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.6)" }}>
              <span>00:00</span><span>--:--</span>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Repeat size={14} color="rgba(255,255,255,0.7)" strokeWidth={1.5} />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Volume2 size={14} color="rgba(255,255,255,0.7)" strokeWidth={1.5} />
              <div style={{ width: 80, height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 2, position: "relative" }}>
                <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: "70%", background: C.primary, borderRadius: 2 }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 32 }}>
        {/* Name / BPM / Key */}
        <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSecondaryFixedVar }}>Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              style={{
                width: "100%", background: C.surfaceContainerLow,
                border: `1px solid ${C.border10}`, borderRadius: 4,
                padding: "8px 12px", fontSize: 14, fontWeight: 600,
                color: C.onSurface, outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSecondaryFixedVar }}>BPM</label>
              <input
                type="number"
                value={bpm}
                onChange={e => setBpm(e.target.value)}
                style={{
                  width: "100%", background: C.surfaceContainerLow,
                  border: `1px solid ${C.border10}`, borderRadius: 4,
                  padding: "8px 12px", fontSize: 14, fontWeight: 600,
                  color: C.onSurface, outline: "none", boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSecondaryFixedVar }}>Key</label>
              <input
                value={key}
                onChange={e => setKey(e.target.value)}
                style={{
                  width: "100%", background: C.surfaceContainerLow,
                  border: `1px solid ${C.border10}`, borderRadius: 4,
                  padding: "8px 12px", fontSize: 14, fontWeight: 600,
                  color: C.onSurface, outline: "none", boxSizing: "border-box",
                }}
              />
            </div>
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
                    color: isActive ? (k === "wip" ? "#4e2d00" : "#000") : C.onSurfaceVariant,
                    transition: "all 0.15s",
                  }}
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
                    setNewTag("");
                    setAddingTag(false);
                  }
                  if (e.key === "Escape") {
                    setNewTag("");
                    setAddingTag(false);
                  }
                }}
                onBlur={() => { setNewTag(""); setAddingTag(false); }}
                placeholder="TAG NAME"
                style={{
                  padding: "6px 12px", background: C.surfaceContainerLow,
                  border: `1px solid ${C.primary}`, borderRadius: 9999,
                  fontSize: 10, fontWeight: 700, color: C.onSurface,
                  outline: "none", width: 90,
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
                }}
              >
                + Add Tag
              </button>
            )}
          </div>
        </section>

        {/* Notes */}
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSecondaryFixedVar }}>Production Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={4}
            placeholder="Add notes about plugins, inspiration, etc..."
            style={{
              width: "100%", background: C.surfaceContainerLow,
              border: `1px solid ${C.border10}`, borderRadius: 4,
              padding: "12px", fontSize: 12, color: C.onSurface,
              outline: "none", resize: "none", boxSizing: "border-box",
              lineHeight: 1.6,
            }}
          />
        </section>

        {/* Path Info */}
        {beat.path && (
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSecondaryFixedVar }}>Archive Path</label>
            <div style={{
              padding: 12, background: C.surfaceContainerLow,
              borderRadius: 4, border: `1px solid ${C.border10}`,
              fontSize: 10, fontFamily: "monospace", color: C.onSurfaceVariant,
              wordBreak: "break-all",
            }}>
              {beat.path}
            </div>
          </section>
        )}

        {/* Created Date */}
        {beat.created_date && (
          <div style={{ fontSize: 10, color: C.onSecondaryFixedVar }}>
            Created: {beat.created_date}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: 16, borderTop: `1px solid ${C.border10}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <button
          onClick={onClose}
          style={{
            padding: "8px 16px", borderRadius: 4,
            background: C.surfaceContainerHighest,
            border: `1px solid ${C.border20}`,
            fontSize: 11, fontWeight: 600, color: C.onSurfaceVariant,
            cursor: "pointer",
          }}
        >
          Close
        </button>
        <button
          onClick={handleFavToggle}
          style={{
            width: 40, height: 40, borderRadius: 8,
            background: fav ? "rgba(253,161,36,0.15)" : C.background,
            border: `1px solid ${fav ? "rgba(253,161,36,0.3)" : C.border20}`,
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <Heart size={18} fill={fav ? C.primary : "none"} color={C.primary} strokeWidth={1.5} />
        </button>
      </div>
    </aside>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Browse Page
// ═══════════════════════════════════════════════════════════════════════════════

export default function Browse() {
  // ─── Data State ────────────────────────────────────────────────────────────
  const [beats, setBeats] = useState<Beat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ─── Filter State ──────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterKey, setFilterKey] = useState("any");
  const [bpmMin, setBpmMin] = useState("");
  const [bpmMax, setBpmMax] = useState("");
  const [onlyFavs, setOnlyFavs] = useState(false);

  // ─── UI State ──────────────────────────────────────────────────────────────
  const [selectedBeat, setSelectedBeat] = useState<Beat | null>(null);

  // ─── Load Beats ────────────────────────────────────────────────────────────
  const loadBeats = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await invoke<Beat[]>("get_beats", {
        search: search || null,
        statusFilter: filterStatus !== "all" ? filterStatus : null,
        onlyFavs,
        limit: 100,
        offset: 0,
      });
      setBeats(result);
      
      // Select first beat if none selected
      if (!selectedBeat && result.length > 0) {
        setSelectedBeat(result[0]);
      }
    } catch (e) {
      console.error("Failed to load beats:", e);
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, [search, filterStatus, onlyFavs]);

  // Load on mount and when filters change
  useEffect(() => {
    loadBeats();
  }, [loadBeats]);

  // ─── Client-side BPM Filtering ─────────────────────────────────────────────
  const filtered = beats.filter(b => {
    if (bpmMin && b.bpm && b.bpm < parseInt(bpmMin)) return false;
    if (bpmMax && b.bpm && b.bpm > parseInt(bpmMax)) return false;
    if (filterKey !== "any" && b.key) {
      // Simple key matching
      if (!b.key.toLowerCase().includes(filterKey.toLowerCase())) return false;
    }
    return true;
  });

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const toggleFav = async (id: string) => {
    const beat = beats.find(b => b.id === id);
    if (!beat) return;
    
    const newFav = beat.favorite !== 1;
    
    // Optimistic update
    setBeats(prev => prev.map(b => 
      b.id === id ? { ...b, favorite: newFav ? 1 : 0 } : b
    ));
    
    try {
      await invoke("toggle_favorite", { beatId: id, favorite: newFav });
    } catch (e) {
      console.error("Failed to toggle favorite:", e);
      // Revert on error
      setBeats(prev => prev.map(b => 
        b.id === id ? { ...b, favorite: beat.favorite } : b
      ));
    }
  };

  const handleBeatUpdate = (updatedBeat: Beat) => {
    setBeats(prev => prev.map(b => b.id === updatedBeat.id ? updatedBeat : b));
    setSelectedBeat(updatedBeat);
  };

  const resetFilters = () => {
    setFilterStatus("all");
    setFilterKey("any");
    setBpmMin("");
    setBpmMax("");
    setOnlyFavs(false);
  };

  // ─── Styles ────────────────────────────────────────────────────────────────
  const PANEL_W = selectedBeat ? 360 : 0;
  const inputStyle: React.CSSProperties = {
    background: C.surfaceContainerLowest,
    border: "none",
    borderRadius: 2,
    padding: "8px 10px",
    fontSize: 11,
    fontWeight: 500,
    color: C.onSurface,
    outline: "none",
    width: "100%",
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ 
      height: "100vh", 
      display: "flex", 
      flexDirection: "column", 
      overflow: "hidden", 
      background: C.background, 
      marginRight: PANEL_W, 
      transition: "margin-right 0.3s" 
    }}>
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
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="SEARCH CATALOG..."
              style={{ ...inputStyle, paddingLeft: 36, width: 256, letterSpacing: "0.15em", fontSize: 12 }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16, color: C.onSurfaceVariant }}>
            <RefreshCw 
              size={18} 
              strokeWidth={1.5} 
              style={{ cursor: "pointer" }} 
              onClick={loadBeats}
            />
            <Bell size={18} strokeWidth={1.5} style={{ cursor: "pointer" }} />
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
              <span style={{ fontSize: 10, color: C.onSecondaryFixedVar }}>
                ({filtered.length} beats)
              </span>
            </div>
            <button
              onClick={resetFilters}
              style={{
                fontSize: 10, color: C.onSurfaceVariant, background: "none",
                border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.15em",
              }}
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
                <option value="C">C Major / Am</option>
                <option value="G">G Major / Em</option>
                <option value="D">D Major / Bm</option>
                <option value="F">F Major / Dm</option>
                <option value="A">A Major / F#m</option>
              </select>
            </div>

            {/* BPM Range */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSecondaryFixedVar }}>BPM Range</label>
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
                  cursor: "pointer",
                  fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                  color: onlyFavs ? C.primary : C.onSurfaceVariant,
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
                color: C.onSurfaceVariant, border: "none",
              }}>
                <Music size={12} strokeWidth={1.5} /> Show Artwork
              </button>
            </div>
          </div>
        </section>

        {/* Loading State */}
        {isLoading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 48 }}>
            <Loader2 size={24} color={C.primary} style={{ animation: "spin 1s linear infinite" }} />
            <span style={{ marginLeft: 12, color: C.onSurfaceVariant }}>Loading beats...</span>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div style={{
            padding: 16, borderRadius: 8,
            background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <AlertCircle size={20} color="#ef4444" />
            <span style={{ color: "#ef4444", fontSize: 13 }}>{error}</span>
          </div>
        )}

        {/* Beat Table */}
        {!isLoading && !error && (
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
                      <td style={{ padding: 16, fontSize: 12, fontFamily: "monospace", color: C.primary, fontWeight: 700 }}>
                        #{beat.id}
                      </td>
                      <td style={{ padding: 16 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: 4,
                            background: C.surfaceContainerHighest,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            <Music size={12} color={C.onSurfaceVariant} strokeWidth={1.5} />
                          </div>
                          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em", color: C.onSurface }}>
                            {beat.name}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: 16, fontSize: 12, fontWeight: 500, color: C.onSurfaceVariant }}>
                        {beat.key || "—"}
                      </td>
                      <td style={{ padding: 16, fontSize: 12, fontWeight: 500, color: C.onSurfaceVariant }}>
                        {beat.bpm || "—"}
                      </td>
                      <td style={{ padding: 16, textAlign: "center" }}>
                        <StatusPill status={beat.status} />
                      </td>
                      <td style={{ padding: 16, textAlign: "right" }}>
                        <button
                          onClick={e => { e.stopPropagation(); toggleFav(beat.id); }}
                          style={{ background: "none", border: "none", cursor: "pointer", display: "inline-flex" }}
                        >
                          <Heart
                            size={20} strokeWidth={1.5}
                            fill={beat.favorite === 1 ? C.primary : "none"}
                            color={beat.favorite === 1 ? C.primary : C.onSurfaceVariant}
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
        )}
      </div>

      {/* Keyframes for spinner */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {/* Detail Panel */}
      {selectedBeat && (
        <DetailPanel 
          beat={selectedBeat} 
          onClose={() => setSelectedBeat(null)} 
          onUpdate={handleBeatUpdate}
        />
      )}
    </div>
  );
}