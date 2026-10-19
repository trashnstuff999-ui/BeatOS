// src/components/studio/ProjectsToolbar.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Search, status chips (with counts), priority toggle, root chips and the
// sort dropdown for the Studio project list. Pure controlled UI — all state
// lives in ProjectsPane, filtering is a client-side derivation.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";
import { Search, ArrowUpDown, ChevronDown, X } from "lucide-react";
import { C, radius } from "../../lib/theme";

export type SortMode = "modified" | "name" | "oldest";

// „Priorität zuerst" gab es hier mal. Es sortierte nur innerhalb einer Sektion
// und tat damit sichtbar nichts — die Sektion „Priorität" ganz oben in der
// Liste erledigt die Aufgabe seither richtig.
export const SORT_LABELS: Record<SortMode, string> = {
  modified: "Zuletzt bearbeitet",
  name: "Name A–Z",
  oldest: "Älteste zuerst",
};

/** Ein Filter-Chip = eine Sektion der Liste, mit derselben Zahl wie ihr Kopf. */
export interface SectionChip {
  key: string;
  label: string;
  color: string;
  count: number;
}

interface ProjectsToolbarProps {
  search: string;
  onSearch: (v: string) => void;
  /** Die Sektionen dieser Ansicht — Chips und Sektionsköpfe zählen dasselbe. */
  chips: SectionChip[];
  total: number;
  active: string | null;
  onActive: (key: string | null) => void;
  roots: string[];
  rootFilter: string | null;
  onRootFilter: (r: string | null) => void;
  sortMode: SortMode;
  onSortMode: (m: SortMode) => void;
  /** Chips + Sortierung: nur noch im Aufräumen — in Projekte sind die Regale die Einteilung */
  showFilters: boolean;
  /** Knöpfe rechts neben der Suche (Scan, Neues Projekt …) */
  children?: React.ReactNode;
}

export function ProjectsToolbar({
  search, onSearch,
  chips, total, active, onActive,
  roots, rootFilter, onRootFilter,
  sortMode, onSortMode,
  showFilters, children,
}: ProjectsToolbarProps) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 12,
      padding: "4px 16px 8px",
    }}>
      {/* Row 1: Suche groß links, Knöpfe rechts — eine Zeile statt zwei Leisten */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <label style={{
          flex: "1 1 260px", maxWidth: 440, height: 40, boxSizing: "border-box",
          display: "flex", alignItems: "center", gap: 9,
          background: C.surfaceContainer,
          border: `1px solid ${C.border20}`,
          borderRadius: 8,
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

      {/* Row 2: Chips + Wurzeln + Sortierung — nur, wenn es etwas zu filtern gibt */}
      {(showFilters || roots.length > 1) && (
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {showFilters && <>
        <FilterChip
          label={`Alle (${total})`}
          active={active === null}
          onClick={() => onActive(null)}
        />
        {chips.map(c => (
          <FilterChip
            key={c.key}
            label={`${c.label} (${c.count})`}
            active={active === c.key}
            color={c.color}
            dot
            onClick={() => onActive(active === c.key ? null : c.key)}
          />
        ))}
        </>}

        {roots.length > 1 && (
          <>
            <span style={{ width: 1, height: 16, background: C.border15, margin: "0 4px" }} />
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
          </>
        )}
        {showFilters && <><div style={{ flex: 1 }} /><SortDropdown value={sortMode} onChange={onSortMode} /></>}
      </div>
      )}
    </div>
  );
}

// ─── Chip ────────────────────────────────────────────────────────────────────

function FilterChip({ label, active, onClick, color, dot }: {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
  dot?: boolean;
}) {
  const accent = color ?? C.onSurface;
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
      {dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />}
      {label}
    </button>
  );
}

// ─── Sort dropdown ───────────────────────────────────────────────────────────

function SortDropdown({ value, onChange }: { value: SortMode; onChange: (m: SortMode) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 11px", borderRadius: radius.control,
          background: "transparent",
          border: `1px solid ${open ? C.border30 : C.border15}`,
          color: C.onSurfaceVariant, cursor: "pointer",
          fontSize: 12, fontWeight: 600,
        }}
      >
        <ArrowUpDown size={11} strokeWidth={2} />
        {SORT_LABELS[value]}
        <ChevronDown size={11} style={{ transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "rotate(0)" }} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0,
          minWidth: 170,
          background: C.surfaceContainer,
          border: `1px solid ${C.border20}`,
          borderRadius: radius.control,
          boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
          zIndex: 15,
          overflow: "hidden",
        }}>
          {(Object.keys(SORT_LABELS) as SortMode[]).map(m => (
            <button
              key={m}
              onClick={() => { onChange(m); setOpen(false); }}
              style={{
                width: "100%",
                padding: "8px 12px",
                background: m === value ? C.surfaceContainerHigh : "transparent",
                border: "none",
                cursor: "pointer", textAlign: "left",
                fontSize: 12, fontWeight: m === value ? 700 : 500,
                color: m === value ? C.onSurface : C.onSurfaceVariant,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = C.surfaceContainerHigh; }}
              onMouseLeave={e => { e.currentTarget.style.background = m === value ? C.surfaceContainerHigh : "transparent"; }}
            >
              {SORT_LABELS[m]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
