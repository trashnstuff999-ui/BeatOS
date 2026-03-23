// src/pages/Studio.tsx — 1:1 nach Stitch HTML Export
import { useState } from "react";
import {
  RefreshCw, Search, Bell, Star, MoreVertical,
  FileAudio, ExternalLink, Copy, Trash2,
  Filter, ArrowUpDown, ChevronDown, RotateCcw
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
  primaryDim:             "#ed9412",
  tertiary:               "#9492ff",
  error:                  "#ff7351",
  errorDim:               "#d53d18",
  onSurface:              "#ffffff",
  onSurfaceVariant:       "#adaaaa",
  onSecondaryFixedVar:    "#5c5b5b",
  onPrimary:              "#4e2d00",
  secondary:              "#e4e2e1",
  outlineVariant:         "#484847",
  exported:               "#10b981",
  border10:               "rgba(72,72,71,0.10)",
  border15:               "rgba(72,72,71,0.15)",
  border20:               "rgba(72,72,71,0.20)",
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────
type ExportStatus = "exported" | "not_exported" | "needs_update";

type Project = {
  id: string;
  name: string;
  key: string;
  bpm: number;
  priority: boolean;
  exportStatus: ExportStatus;
  modified: string;
  path: string;
  notes: string;
};

// ── Mock Data ─────────────────────────────────────────────────────────────────
const MOCK_PROJECTS: Project[] = [
  { id: "1", name: "Midnight_Drive_V4.flp",   key: "Cm",  bpm: 128, priority: true,  exportStatus: "exported",      modified: "2h ago",       path: "/Volumes/Studio_SSD/Projects/2023/Midnight_Drive_V4.flp",   notes: "" },
  { id: "2", name: "Neon_Clouds_Ideas.flp",   key: "F#m", bpm: 140, priority: false, exportStatus: "not_exported",  modified: "Yesterday",    path: "/Volumes/Studio_SSD/Projects/2023/Neon_Clouds_Ideas.flp",   notes: "" },
  { id: "3", name: "Heavy_Sub_Bounce.flp",    key: "Am",  bpm: 95,  priority: true,  exportStatus: "needs_update",  modified: "4d ago",       path: "/Volumes/Studio_SSD/Projects/2023/Drafts/Heavy_Sub_Bounce.flp", notes: "" },
  { id: "4", name: "Drill_Sample_Chop.flp",   key: "G#m", bpm: 144, priority: false, exportStatus: "exported",      modified: "1w ago",       path: "/Volumes/Studio_SSD/Projects/2023/Drill_Sample_Chop.flp",   notes: "" },
  { id: "5", name: "LoFi_Tape_Session.flp",   key: "Dm",  bpm: 85,  priority: false, exportStatus: "not_exported",  modified: "2w ago",       path: "/Volumes/Studio_SSD/Projects/2022/LoFi_Tape_Session.flp",   notes: "" },
];

// ── Export Status Badge ────────────────────────────────────────────────────────
function ExportBadge({ status }: { status: ExportStatus }) {
  const cfg = {
    exported:     { label: "Exported",     color: C.exported,        bg: C.surfaceContainerHighest, dot: C.exported,        glow: "rgba(16,185,129,0.5)",  border: C.border10 },
    not_exported: { label: "Not Exported", color: C.onSurfaceVariant, bg: C.surfaceContainerHighest, dot: "rgba(173,170,170,0.4)", glow: "none", border: C.border10 },
    needs_update: { label: "Needs Update", color: C.primary,          bg: "rgba(253,161,36,0.10)",   dot: C.primary,         glow: "rgba(253,161,36,0.8)",  border: "rgba(253,161,36,0.20)" },
  }[status];

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "4px 12px", borderRadius: 9999,
      background: cfg.bg, border: `1px solid ${cfg.border}`,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: cfg.dot,
        boxShadow: cfg.glow !== "none" ? `0 0 6px ${cfg.glow}` : "none",
        animation: status === "needs_update" ? "pulse 2s infinite" : "none",
      }} />
      <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: cfg.color }}>
        {cfg.label}
      </span>
    </div>
  );
}

// ── Project Inspector (Right Panel) ──────────────────────────────────────────
function ProjectInspector({ project }: { project: Project; onClose: () => void }) {
  const [exportStatus, setExportStatus] = useState<ExportStatus>(project.exportStatus);
  const [notes, setNotes]               = useState(project.notes);
  const [priority, setPriority]         = useState(project.priority);

  return (
    <aside style={{
      position: "fixed", top: 0, right: 0,
      height: "100vh", width: 350,
      background: C.surfaceContainerLow,
      borderLeft: `1px solid ${C.border10}`,
      zIndex: 30, paddingTop: 64,
      display: "flex", flexDirection: "column",
    }}>
      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 32 }}>

        {/* Header */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.primary }}>
              Project Inspector
            </span>
            <button
              onClick={() => setPriority(!priority)}
              style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}
            >
              <Star
                size={18} strokeWidth={1.5}
                fill={priority ? C.primary : "none"}
                color={C.primary}
              />
            </button>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: C.onSurface, letterSpacing: "-0.02em", lineHeight: 1.3 }}>
            {project.name}
          </h2>
        </div>

        {/* BPM + Key grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { label: "BPM", value: String(project.bpm) },
            { label: "Key", value: project.key },
          ].map(({ label, value }) => (
            <div
              key={label}
              style={{
                background: C.surfaceContainerHighest, padding: 16, borderRadius: 12,
                border: `1px solid ${C.border10}`, textAlign: "center", cursor: "pointer",
                transition: "border-color 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(253,161,36,0.3)")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = C.border10)}
            >
              <p style={{ fontSize: 10, color: C.onSurfaceVariant, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 4, fontWeight: 700 }}>{label}</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: C.onSurface }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <button style={{
            width: "100%", padding: "12px 0",
            background: `linear-gradient(145deg, ${C.primary}, ${C.primaryContainer})`,
            color: C.onPrimary, fontWeight: 700, fontSize: 14,
            border: "none", borderRadius: 8, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            boxShadow: "0 4px 15px rgba(253,161,36,0.1)",
            fontFamily: "Inter, sans-serif", transition: "opacity 0.15s",
          }}
            onMouseEnter={e => (e.currentTarget.style.opacity = "0.9")}
            onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
          >
            <ExternalLink size={18} strokeWidth={1.5} /> Open in DAW
          </button>

          <button style={{
            width: "100%", padding: "12px 0",
            background: C.surfaceContainerHighest,
            border: `1px solid ${C.border20}`,
            color: C.onSurface, fontWeight: 600, fontSize: 14,
            borderRadius: 8, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            fontFamily: "Inter, sans-serif", transition: "background 0.15s",
          }}
            onMouseEnter={e => (e.currentTarget.style.background = "#2c2c2c")}
            onMouseLeave={e => (e.currentTarget.style.background = C.surfaceContainerHighest)}
          >
            <Copy size={18} strokeWidth={1.5} /> Copy Path
          </button>
        </div>

        {/* File Location */}
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSecondaryFixedVar, display: "block", marginBottom: 8 }}>
            File Location
          </label>
          <div style={{
            background: C.surfaceContainerLowest, padding: 12, borderRadius: 8,
            border: `1px solid ${C.border10}`,
          }}>
            <p style={{ fontSize: 11, fontFamily: "monospace", color: C.onSurfaceVariant, wordBreak: "break-all", lineHeight: 1.5 }}>
              {project.path}
            </p>
          </div>
        </div>

        {/* Export Integrity */}
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSecondaryFixedVar, display: "block", marginBottom: 8 }}>
            Export Integrity
          </label>
          <div style={{ position: "relative" }}>
            <select
              value={exportStatus}
              onChange={e => setExportStatus(e.target.value as ExportStatus)}
              style={{
                width: "100%", background: C.surfaceContainerHighest,
                border: `1px solid ${C.border20}`, color: C.onSurface,
                fontSize: 14, padding: "12px 40px 12px 16px", borderRadius: 8,
                appearance: "none", outline: "none", cursor: "pointer",
                fontFamily: "Inter, sans-serif",
              }}
            >
              <option value="needs_update">⚠️ Needs Update</option>
              <option value="exported">✅ Exported</option>
              <option value="not_exported">⚪ Not Exported</option>
            </select>
            <ChevronDown size={16} color={C.onSurfaceVariant} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          </div>
        </div>

        {/* Producer Notes */}
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSecondaryFixedVar, display: "block", marginBottom: 8 }}>
            Producer Notes (Autosaved)
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Mix notes, plugin chains to remember..."
            rows={5}
            style={{
              width: "100%", background: C.surfaceContainerLowest,
              border: `1px solid ${C.border20}`, borderRadius: 8,
              padding: 16, fontSize: 14, color: C.onSurfaceVariant,
              resize: "none", outline: "none",
              fontFamily: "Inter, sans-serif", lineHeight: 1.6,
              boxSizing: "border-box", transition: "border-color 0.2s",
            }}
            onFocus={e => (e.currentTarget.style.borderColor = "rgba(253,161,36,0.4)")}
            onBlur={e => (e.currentTarget.style.borderColor = C.border20)}
          />
        </div>
      </div>

      {/* Footer — Delete */}
      <div style={{ padding: 24, background: C.surfaceContainer, borderTop: `1px solid ${C.border10}` }}>
        <button style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "10px 0", borderRadius: 8,
          border: `1px solid rgba(213,61,24,0.2)`,
          background: "transparent", color: C.errorDim,
          fontWeight: 600, fontSize: 14, cursor: "pointer",
          fontFamily: "Inter, sans-serif", transition: "all 0.15s",
        }}
          onMouseEnter={e => { e.currentTarget.style.color = C.error; e.currentTarget.style.background = "rgba(185,41,2,0.1)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = C.errorDim; e.currentTarget.style.background = "transparent"; }}
        >
          <Trash2 size={18} strokeWidth={1.5} /> Delete Project Reference
        </button>
      </div>
    </aside>
  );
}

// ── Studio Page ───────────────────────────────────────────────────────────────
export default function Studio() {
  const [projects, setProjects]   = useState(MOCK_PROJECTS);
  const [search, setSearch]       = useState("");
  const [selected, setSelected]   = useState<Project | null>(MOCK_PROJECTS[2]);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  const filtered = projects.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.key.toLowerCase().includes(search.toLowerCase()) ||
    String(p.bpm).includes(search)
  );

  const togglePriority = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setProjects(prev => prev.map(p => p.id === id ? { ...p, priority: !p.priority } : p));
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, priority: !prev.priority } : null);
  };

  const PANEL_W = selected ? 350 : 0;

  return (
    <div style={{
      height: "100vh", display: "flex", flexDirection: "column",
      overflow: "hidden", background: C.background,
      marginRight: PANEL_W, transition: "margin-right 0.3s",
    }}>

      {/* Header */}
      <header style={{
        height: 64, flexShrink: 0,
        background: "rgba(14,14,14,0.7)",
        backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "0 32px", borderBottom: `1px solid ${C.border15}`,
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: C.onSecondaryFixedVar }}>
          Studio Path: /users/producer/daw/projects
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, color: C.onSurfaceVariant }}>
            <RefreshCw size={18} strokeWidth={1.5} style={{ cursor: "pointer" }}
              onMouseEnter={e => (e.currentTarget.style.color = C.onSurface)}
              onMouseLeave={e => (e.currentTarget.style.color = C.onSurfaceVariant)}
            />
            <Search size={18} strokeWidth={1.5} style={{ cursor: "pointer" }}
              onMouseEnter={e => (e.currentTarget.style.color = C.onSurface)}
              onMouseLeave={e => (e.currentTarget.style.color = C.onSurfaceVariant)}
            />
            <div style={{ position: "relative" }}>
              <Bell size={18} strokeWidth={1.5} style={{ cursor: "pointer" }} />
              <span style={{ position: "absolute", top: 0, right: 0, width: 8, height: 8, background: C.primary, borderRadius: "50%" }} />
            </div>
          </div>

          {/* Avatar */}
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: `linear-gradient(135deg, ${C.primary}, ${C.primaryContainer})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 700, color: C.onPrimary,
          }}>JD</div>
        </div>
      </header>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>

        {/* Scan bar */}
        <section style={{ padding: "32px 32px 16px" }}>
          <div style={{
            background: C.surfaceContainerLow, padding: 24, borderRadius: 12,
            border: `1px solid ${C.border10}`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div style={{ flex: 1, marginRight: 32 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: C.onSurface, letterSpacing: "-0.01em" }}>
                  Studio Path Synchronization
                </h3>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "-0.02em", color: C.primary }}>
                  78% Indexed
                </span>
              </div>
              <div style={{ height: 6, background: C.surfaceContainerHighest, borderRadius: 3, overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: "78%", background: C.primary, borderRadius: 3,
                  boxShadow: "0 0 10px rgba(253,161,36,0.4)",
                }} />
              </div>
            </div>

            <button style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 20px", borderRadius: 8,
              background: `linear-gradient(135deg, ${C.primary}, ${C.primaryContainer})`,
              color: C.onPrimary, fontWeight: 600, fontSize: 14,
              border: "none", cursor: "pointer",
              boxShadow: "0 4px 15px rgba(253,161,36,0.1)",
              fontFamily: "Inter, sans-serif", transition: "opacity 0.15s",
            }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.9")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
            >
              <RotateCcw size={16} strokeWidth={1.5} /> Scan Studio Paths
            </button>
          </div>
        </section>

        {/* Registry section */}
        <section style={{ flex: 1, display: "flex", flexDirection: "column", padding: "0 32px 32px" }}>

          {/* Search + filter bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
            <div style={{ flex: 1, position: "relative" }}>
              <Search size={18} color={C.onSurfaceVariant} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search .flp projects by name, key or BPM..."
                style={{
                  width: "100%", background: C.surfaceContainerLowest,
                  border: `1px solid ${C.border20}`, borderRadius: 8,
                  paddingLeft: 40, paddingRight: 16, paddingTop: 10, paddingBottom: 10,
                  fontSize: 14, color: C.onSurface, outline: "none",
                  fontFamily: "Inter, sans-serif", boxSizing: "border-box",
                  transition: "border-color 0.2s",
                }}
                onFocus={e => (e.currentTarget.style.borderColor = "rgba(253,161,36,0.4)")}
                onBlur={e => (e.currentTarget.style.borderColor = C.border20)}
              />
            </div>

            {[
              { icon: <Filter size={14} strokeWidth={1.5} />, label: "All Status" },
              { icon: <ArrowUpDown size={14} strokeWidth={1.5} />, label: "Priority" },
            ].map(({ icon, label }) => (
              <button key={label} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 16px", borderRadius: 8,
                background: C.surfaceContainerHigh, border: `1px solid ${C.border10}`,
                fontSize: 12, fontWeight: 600, color: C.onSurfaceVariant,
                cursor: "pointer", fontFamily: "Inter, sans-serif", transition: "color 0.15s",
              }}
                onMouseEnter={e => (e.currentTarget.style.color = C.onSurface)}
                onMouseLeave={e => (e.currentTarget.style.color = C.onSurfaceVariant)}
              >
                {icon} {label}
              </button>
            ))}
          </div>

          {/* List header */}
          <div style={{
            display: "grid", gridTemplateColumns: "5fr 2fr 1fr 3fr 1fr",
            padding: "8px 16px",
            fontSize: 10, fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.15em", color: C.onSecondaryFixedVar,
            borderBottom: `1px solid ${C.border10}`, marginBottom: 8,
          }}>
            <span>Project Name</span>
            <span style={{ textAlign: "center" }}>Key / BPM</span>
            <span style={{ textAlign: "center" }}>Priority</span>
            <span style={{ textAlign: "right" }}>Export Status</span>
            <span />
          </div>

          {/* Project list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {filtered.map(project => {
              const isSelected = selected?.id === project.id;
              const isHovered  = hoveredRow === project.id;

              return (
                <div
                  key={project.id}
                  onClick={() => setSelected(project)}
                  onMouseEnter={() => setHoveredRow(project.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                  style={{
                    display: "grid", gridTemplateColumns: "5fr 2fr 1fr 3fr 1fr",
                    alignItems: "center", padding: "12px 16px", borderRadius: 8,
                    cursor: "pointer", transition: "all 0.15s",
                    background: isSelected
                      ? "rgba(26,25,25,0.6)"
                      : isHovered ? "rgba(32,31,31,0.6)" : "rgba(26,25,25,0.4)",
                    border: isSelected
                      ? `1px solid rgba(253,161,36,0.2)`
                      : isHovered ? `1px solid ${C.border10}` : "1px solid transparent",
                    boxShadow: isSelected ? `0 0 0 1px rgba(253,161,36,0.1)` : "none",
                  }}
                >
                  {/* Name + icon */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 6,
                      background: isSelected ? "rgba(253,161,36,0.2)" : C.surfaceContainerHighest,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "background 0.15s",
                      color: isSelected ? C.primary : C.onSurfaceVariant,
                    }}>
                      <FileAudio size={18} strokeWidth={1.5} />
                    </div>
                    <div>
                      <p style={{
                        fontSize: 14, fontWeight: 600,
                        color: isSelected || isHovered ? C.primary : C.onSurface,
                        transition: "color 0.15s", letterSpacing: "-0.01em",
                      }}>{project.name}</p>
                      <p style={{ fontSize: 10, color: C.onSurfaceVariant, marginTop: 2 }}>
                        Modified {project.modified}
                      </p>
                    </div>
                  </div>

                  {/* Key / BPM */}
                  <div style={{ textAlign: "center", fontSize: 12, fontWeight: 500, color: C.secondary }}>
                    {project.key} / {project.bpm}
                  </div>

                  {/* Priority star */}
                  <div style={{ textAlign: "center" }}>
                    <button
                      onClick={e => togglePriority(project.id, e)}
                      style={{ background: "none", border: "none", cursor: "pointer", display: "inline-flex" }}
                    >
                      <Star
                        size={16} strokeWidth={1.5}
                        fill={project.priority ? C.primary : "none"}
                        color={project.priority ? C.primary : C.onSecondaryFixedVar}
                      />
                    </button>
                  </div>

                  {/* Export status */}
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <ExportBadge status={project.exportStatus} />
                  </div>

                  {/* More menu */}
                  <div style={{ textAlign: "right", opacity: isHovered || isSelected ? 1 : 0, transition: "opacity 0.15s" }}>
                    <button style={{ background: "none", border: "none", cursor: "pointer", color: C.onSurfaceVariant, display: "inline-flex" }}>
                      <MoreVertical size={16} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Project Inspector */}
      {selected && <ProjectInspector project={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}