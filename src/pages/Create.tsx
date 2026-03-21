// src/pages/Create.tsx — 1:1 nach Stitch HTML Export
import { useState } from "react";
import { RefreshCw, Search, Bell, FolderOpen, Network, FileAudio, Timer, Info } from "lucide-react";

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
  onSurface:              "#ffffff",
  onSurfaceVariant:       "#adaaaa",
  onSecondaryFixedVar:    "#5c5b5b",
  outlineVariant:         "#484847",
  border10:               "rgba(72,72,71,0.10)",
  border15:               "rgba(72,72,71,0.15)",
  border20:               "rgba(72,72,71,0.20)",
  border30:               "rgba(72,72,71,0.30)",
} as const;

// Status button config
const STATUS_ITEMS = [
  { key: "idea",     label: "Idea",     color: C.tertiary },
  { key: "wip",      label: "WIP",      color: C.primary },
  { key: "finished", label: "Finished", color: "#22c55e" },
  { key: "sold",     label: "Sold",     color: "#ff7351" },
] as const;

// Mock source files
const SOURCE_FILES = [
  "Midnight_Drift_V3_140BPM.wav",
  "Midnight_Drift_Master_Final.mp3",
  "Midnight_Drift_V1_Sketch.wav",
];

export default function Create() {
  const [title, setTitle]   = useState("");
  const [key, setKey]       = useState("");
  const [bpm, setBpm]       = useState("");
  const [catalogId, setCatalogId] = useState("");
  const [status, setStatus] = useState<string>("idea");
  const [notes, setNotes]   = useState("");
  const [selectedFile, setSelectedFile] = useState(SOURCE_FILES[0]);

  // Live preview values
  const previewTitle  = title     || "MIDNIGHT DRIFT";
  const previewKey    = key       || "C min";
  const previewBpm    = bpm       || "140 BPM";
  const previewId     = catalogId || "#8241";

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", background: C.background }}>

      {/* TopNavBar — ARCHIVE PORTAL */}
      <header style={{
        height: 64, flexShrink: 0,
        background: "rgba(14,14,14,0.7)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "0 32px",
        borderBottom: `1px solid ${C.border15}`,
        zIndex: 40,
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: C.onSurfaceVariant }}>
          Archive Portal
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, color: C.onSurfaceVariant }}>
            {[RefreshCw, Search].map((Icon, i) => (
              <Icon
                key={i} size={18} strokeWidth={1.5}
                style={{ cursor: "pointer", transition: "color 0.15s" }}
                onMouseEnter={e => (e.currentTarget.style.color = C.primary)}
                onMouseLeave={e => (e.currentTarget.style.color = C.onSurfaceVariant)}
              />
            ))}
            {/* Bell with orange dot */}
            <div style={{ position: "relative" }}>
              <Bell size={18} strokeWidth={1.5} style={{ cursor: "pointer" }} />
              <span style={{ position: "absolute", top: 0, right: 0, width: 8, height: 8, background: C.primary, borderRadius: "50%", border: `2px solid ${C.background}` }} />
            </div>
          </div>

          {/* Avatar */}
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: C.surfaceContainerHighest,
            border: `1px solid ${C.border30}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden",
          }}>
            <span style={{ fontSize: 13, color: C.onSurfaceVariant, fontWeight: 700 }}>U</span>
          </div>
        </div>
      </header>

      {/* Scrollable main */}
      <div style={{ flex: 1, overflowY: "auto", padding: 32, paddingBottom: 100 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", gap: 40 }}>

          {/* ── Left: 60% ─────────────────────────────────────────────────── */}
          <div style={{ flex: "0 0 60%", display: "flex", flexDirection: "column", gap: 24 }}>

            {/* Beat Information Card — primary right border */}
            <section style={{
              background: C.surfaceContainerLow, borderRadius: 12, padding: 24,
              borderRight: `4px solid ${C.primary}`,
              boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
              display: "flex", flexDirection: "column", gap: 24,
            }}>
              {/* Track Title */}
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: C.onSecondaryFixedVar, textTransform: "uppercase", letterSpacing: "0.15em", display: "block", marginBottom: 8 }}>
                  Track Title
                </label>
                <div style={{
                  display: "flex", alignItems: "center",
                  background: C.surfaceContainerLowest, borderRadius: 8,
                  border: `1px solid ${C.border20}`,
                  paddingRight: 16, transition: "border-color 0.2s",
                }}>
                  <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="ENTER BEAT NAME..."
                    style={{
                      flex: 1, background: "transparent", border: "none", outline: "none",
                      padding: 16, fontSize: 20, fontWeight: 500, letterSpacing: "-0.02em",
                      color: C.onSurface, fontFamily: "Inter, sans-serif",
                    }}
                    onFocus={e => e.currentTarget.parentElement!.style.borderColor = C.primary}
                    onBlur={e => e.currentTarget.parentElement!.style.borderColor = C.border20}
                  />
                  <button style={{ background: "none", border: "none", cursor: "pointer", color: C.onSurfaceVariant, display: "flex" }}
                    onMouseEnter={e => (e.currentTarget.style.color = C.primary)}
                    onMouseLeave={e => (e.currentTarget.style.color = C.onSurfaceVariant)}
                  >
                    {/* lock_open icon */}
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <path d="M7 11V7a5 5 0 019.9-1"/>
                    </svg>
                  </button>
                </div>
              </div>

              {/* Key / BPM / Catalog ID — right aligned */}
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "flex-end", gap: 16 }}>
                {[
                  { label: "Key",        value: key,       set: setKey,       placeholder: "C min", w: 80,  mono: false },
                  { label: "BPM",        value: bpm,       set: setBpm,       placeholder: "140",   w: 80,  mono: false },
                  { label: "Catalog ID", value: catalogId, set: setCatalogId, placeholder: "#8241", w: 96,  mono: true  },
                ].map(({ label, value, set, placeholder, w, mono }) => (
                  <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    <label style={{ fontSize: 9, fontWeight: 700, color: C.onSecondaryFixedVar, textTransform: "uppercase", letterSpacing: "-0.02em" }}>
                      {label}
                    </label>
                    <input
                      value={value}
                      onChange={e => set(e.target.value)}
                      placeholder={placeholder}
                      style={{
                        width: w, background: C.surfaceContainerLowest,
                        border: `1px solid ${C.border20}`, borderRadius: 6,
                        padding: "8px 8px", fontSize: 14,
                        textAlign: "center", textTransform: "uppercase",
                        letterSpacing: "0.15em", outline: "none",
                        color: C.onSurface, fontFamily: mono ? "monospace" : "Inter, sans-serif",
                        transition: "border-color 0.2s",
                      }}
                      onFocus={e => (e.currentTarget.style.borderColor = C.primary)}
                      onBlur={e => (e.currentTarget.style.borderColor = C.border20)}
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* Production Status Card — tertiary right border */}
            <section style={{
              background: C.surfaceContainerLow, borderRadius: 12, padding: 24,
              borderRight: `4px solid ${C.tertiary}`,
            }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: C.onSecondaryFixedVar, textTransform: "uppercase", letterSpacing: "0.15em", display: "block", marginBottom: 16 }}>
                Production Status
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {STATUS_ITEMS.map(({ key: k, label, color }) => {
                  const isActive = status === k;
                  return (
                    <button
                      key={k}
                      onClick={() => setStatus(k)}
                      style={{
                        padding: "12px 8px", borderRadius: 6,
                        fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase",
                        border: "none", borderBottom: `2px solid ${isActive ? color : "transparent"}`,
                        background: isActive ? C.surfaceContainerHighest : C.surfaceContainer,
                        color: isActive ? color : C.onSurfaceVariant,
                        cursor: "pointer", transition: "all 0.15s",
                        fontFamily: "Inter, sans-serif",
                      }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = C.surfaceContainerHighest; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = C.surfaceContainer; }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Source Files Card — outline right border */}
            <section style={{
              background: C.surfaceContainerLow, borderRadius: 12, padding: 24,
              borderRight: `4px solid ${C.outlineVariant}`,
            }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: C.onSecondaryFixedVar, textTransform: "uppercase", letterSpacing: "0.15em", display: "block", marginBottom: 16 }}>
                Source Files (Detected)
              </label>

              {/* Select dropdown */}
              <div style={{ position: "relative" }}>
                <select
                  value={selectedFile}
                  onChange={e => setSelectedFile(e.target.value)}
                  style={{
                    width: "100%", background: C.surfaceContainerLowest,
                    border: `1px solid ${C.border20}`, borderRadius: 8,
                    padding: "16px 48px 16px 16px",
                    fontSize: 14, color: C.onSurfaceVariant,
                    appearance: "none", cursor: "pointer", outline: "none",
                    fontFamily: "Inter, sans-serif",
                    transition: "border-color 0.2s",
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = C.primary)}
                  onBlur={e => (e.currentTarget.style.borderColor = C.border20)}
                >
                  {SOURCE_FILES.map(f => <option key={f} style={{ background: C.surfaceContainerHighest }}>{f}</option>)}
                </select>
                <div style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: C.onSurfaceVariant }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
              </div>

              {/* File meta pills */}
              <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                {[
                  { icon: <FileAudio size={12} />, text: "24-bit PCM" },
                  { icon: <Timer size={12} />,     text: "03:42" },
                ].map(({ icon, text }) => (
                  <span key={text} style={{
                    padding: "4px 8px", background: C.surfaceContainerHighest, borderRadius: 4,
                    fontSize: 9, fontWeight: 700, color: C.onSurfaceVariant,
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                    {icon} {text}
                  </span>
                ))}
              </div>
            </section>

            {/* Notes Card — outline right border */}
            <section style={{
              background: C.surfaceContainerLow, borderRadius: 12, padding: 24,
              borderRight: `4px solid ${C.outlineVariant}`,
            }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: C.onSecondaryFixedVar, textTransform: "uppercase", letterSpacing: "0.15em", display: "block", marginBottom: 16 }}>
                Internal Production Notes
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Add details about plugins used, inspiration, or intended artists..."
                rows={4}
                style={{
                  width: "100%", background: C.surfaceContainerLowest,
                  border: `1px solid ${C.border20}`, borderRadius: 8,
                  padding: 16, fontSize: 14, color: C.onSurface,
                  resize: "none", outline: "none",
                  fontFamily: "Inter, sans-serif", lineHeight: 1.6,
                  transition: "border-color 0.2s",
                  boxSizing: "border-box",
                }}
                onFocus={e => (e.currentTarget.style.borderColor = C.primary)}
                onBlur={e => (e.currentTarget.style.borderColor = C.border20)}
              />
            </section>
          </div>

          {/* ── Right: 40% — sticky preview ───────────────────────────────── */}
          <div style={{ flex: "0 0 40%", position: "sticky", top: 0, alignSelf: "flex-start" }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: C.primary, textTransform: "uppercase", letterSpacing: "0.3em", display: "block", marginBottom: 16 }}>
              Registry Preview
            </label>

            {/* Preview Card */}
            <div style={{ background: C.surfaceContainer, borderRadius: 12, overflow: "hidden", boxShadow: "0 25px 50px rgba(0,0,0,0.5)", border: `1px solid ${C.border10}` }}>
              {/* Cover area — aspect-square */}
              <div style={{ position: "relative", paddingBottom: "100%", background: C.surfaceContainerHighest }}>
                {/* Gradient overlay */}
                <div style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(to top, #000000 0%, transparent 50%, transparent 100%)",
                  zIndex: 1,
                }} />

                {/* Placeholder cover art */}
                <div style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(135deg, #1a1919 0%, #262626 50%, #1a1919 100%)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="rgba(253,161,36,0.15)" strokeWidth="0.5">
                    <circle cx="12" cy="12" r="10"/>
                    <circle cx="12" cy="12" r="3"/>
                    <line x1="12" y1="2" x2="12" y2="22"/>
                    <line x1="2" y1="12" x2="22" y2="12"/>
                  </svg>
                </div>

                {/* Catalog ID badge — top right */}
                <div style={{
                  position: "absolute", top: 16, right: 16, zIndex: 2,
                  background: C.primary, color: "#4e2d00",
                  fontSize: 10, fontWeight: 900,
                  padding: "4px 8px", borderRadius: 4,
                }}>
                  {previewId}
                </div>

                {/* Title + meta — bottom left overlay */}
                <div style={{ position: "absolute", bottom: 16, left: 16, right: 16, zIndex: 2 }}>
                  <h3 style={{ fontSize: 24, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em", color: "#fff", marginBottom: 6, lineHeight: 1 }}>
                    {previewTitle.toUpperCase()}
                  </h3>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 500, color: C.onSurfaceVariant }}>
                    <span>{previewKey}</span>
                    <div style={{ width: 4, height: 4, borderRadius: "50%", background: C.primary }} />
                    <span>{previewBpm} BPM</span>
                  </div>
                </div>
              </div>

              {/* Path row */}
              <div style={{ padding: 16, background: C.surfaceContainerLow }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, fontFamily: "monospace", color: C.onSecondaryFixedVar }}>
                  <FolderOpen size={14} strokeWidth={1.5} />
                  <span>/ARCHIVE/2024/TRAP/MIDNIGHT_DRIFT/</span>
                </div>
              </div>
            </div>

            {/* Info tip */}
            <div style={{
              marginTop: 24, padding: 16, borderRadius: 8,
              background: "rgba(148,146,255,0.05)",
              border: `1px solid rgba(148,146,255,0.10)`,
              display: "flex", gap: 16, alignItems: "flex-start",
            }}>
              <Info size={18} color={C.tertiary} strokeWidth={1.5} style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 12, color: C.onSurfaceVariant, lineHeight: 1.6 }}>
                BeatOS will automatically generate standardized subfolders for Stems, MIDI, and Masters once structured.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Action Bar — fixed */}
      <footer style={{
        height: 80, flexShrink: 0,
        background: "rgba(19,19,19,0.8)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderTop: `1px solid ${C.border15}`,
        padding: "0 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        {/* Left: status */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, color: C.onSurfaceVariant }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/>
          </svg>
          <span style={{ fontSize: 12, fontWeight: 500, letterSpacing: "-0.01em" }}>Ready for serialization</span>
        </div>

        {/* Right: buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* SELECT FOLDER — ghost primary */}
          <button style={{
            padding: "10px 24px", borderRadius: 8,
            fontSize: 14, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase",
            display: "flex", alignItems: "center", gap: 8,
            color: C.primary, background: "transparent", border: "none",
            cursor: "pointer", transition: "background 0.15s",
            fontFamily: "Inter, sans-serif",
          }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(253,161,36,0.05)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <FolderOpen size={16} strokeWidth={1.5} />
            SELECT FOLDER
          </button>

          {/* CREATE BEATSTRUCTURE — disabled */}
          <button
            disabled
            style={{
              padding: "10px 32px", borderRadius: 8,
              fontSize: 14, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase",
              display: "flex", alignItems: "center", gap: 8,
              color: C.onSecondaryFixedVar,
              background: C.surfaceContainerHighest,
              border: `1px solid ${C.border10}`,
              cursor: "not-allowed",
              fontFamily: "Inter, sans-serif",
            }}
          >
            <Network size={16} strokeWidth={1.5} />
            CREATE BEATSTRUCTURE
          </button>
        </div>
      </footer>
    </div>
  );
}