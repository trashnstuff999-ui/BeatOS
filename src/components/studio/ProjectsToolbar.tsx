// src/components/studio/ProjectsToolbar.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Suche, Knöpfe und (bei mehreren Produktions-Ordnern) die Wurzel-Chips für die
// Studio-Projektliste. Status-Chips und Sortier-Menü sind raus: in Projekte
// teilen die Regale ein, im Aufräumen der Umschalter Lange inaktiv / Kann weg.
// ═══════════════════════════════════════════════════════════════════════════════

import { Search, X } from "lucide-react";
import { C, radius } from "../../lib/theme";

export type SortMode = "modified" | "name" | "oldest";

interface ProjectsToolbarProps {
  search: string;
  onSearch: (v: string) => void;
  roots: string[];
  rootFilter: string | null;
  onRootFilter: (r: string | null) => void;
  /** Knöpfe rechts neben der Suche (Scan, Neues Projekt …) */
  children?: React.ReactNode;
}

export function ProjectsToolbar({ search, onSearch, roots, rootFilter, onRootFilter, children }: ProjectsToolbarProps) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 12,
      padding: "4px 16px 8px",
    }}>
      {/* Row 1: Suche groß links, Knöpfe rechts — eine Zeile statt zwei Leisten */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <label className="sw-such" style={{
          flex: "1 1 260px", maxWidth: 460, height: 44, boxSizing: "border-box",
          display: "flex", alignItems: "center", gap: 9,
          background: C.surfaceContainer,
          border: `1px solid ${C.border30}`,
          borderRadius: 12,
          padding: "0 12px",
        }}>
          <Search size={14} color={C.onSecondaryFixedVar} />
          <input
            value={search}
            onChange={e => onSearch(e.target.value)}
            aria-label="Projekte durchsuchen"
            placeholder="Titel, Notiz, Tonart, BPM …"
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              color: C.onSurface, fontSize: 13,
            }}
          />
          {search && (
            <button
              onClick={() => onSearch("")}
              style={{ background: "none", border: "none", cursor: "pointer", color: C.onSecondaryFixedVar, display: "flex", padding: 0 }}
            >
              <X size={11} />
            </button>
          )}
        </label>
        <div style={{ flex: 1 }} />
        {children}
      </div>

      {/* Row 2: Wurzeln — nur, wenn es mehr als einen Produktions-Ordner gibt */}
      {roots.length > 1 && (
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {roots.map(r => {
          const label = r.split(/[/\\]/).filter(Boolean).pop() ?? r;
          return (
            <FilterChip
              key={r}
              label={label}
              active={rootFilter === r}
              onClick={() => onRootFilter(rootFilter === r ? null : r)}
            />
          );
        })}
      </div>
      )}
    </div>
  );
}

// ─── Chip ────────────────────────────────────────────────────────────────────

function FilterChip({ label, active, onClick }: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const accent = C.onSurface;
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "5px 12px",
        borderRadius: radius.full,
        background: active ? `${accent}18` : "transparent",
        border: `1px solid ${active ? `${accent}55` : C.border15}`,
        color: active ? accent : C.onSurfaceVariant,
        cursor: "pointer",
        fontSize: 12, fontWeight: 600,
        transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  );
}
