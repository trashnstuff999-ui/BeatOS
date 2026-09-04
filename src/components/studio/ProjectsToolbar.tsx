// src/components/studio/ProjectsToolbar.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Search, status chips (with counts), priority toggle, root chips and the
// sort dropdown for the Studio project list. Pure controlled UI — all state
// lives in ProjectsPane, filtering is a client-side derivation.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";
import { Search, Star, ArrowUpDown, ChevronDown, X } from "lucide-react";
import { C, STUDIO_STATUS_CONFIG } from "../../lib/theme";
import type { StudioStatus } from "../../types/studio";

export type SortMode = "modified" | "name" | "oldest";

// „Priorität zuerst" gab es hier mal. Es sortierte nur innerhalb einer Sektion
// und tat damit sichtbar nichts — die Sektion „Priorität" ganz oben in der
// Liste erledigt die Aufgabe seither richtig.
export const SORT_LABELS: Record<SortMode, string> = {
  modified: "Zuletzt bearbeitet",
  name: "Name A–Z",
  oldest: "Älteste zuerst",
};

// „Kann weg" steht am Ende, hinter allem, was noch Arbeit werden kann.
const STATUS_ORDER: StudioStatus[] = ["idea", "wip", "exported", "ready", "discard"];

interface ProjectsToolbarProps {
  search: string;
  onSearch: (v: string) => void;
  statusFilter: StudioStatus | null;
  onStatusFilter: (s: StudioStatus | null) => void;
  counts: Record<StudioStatus, number> & { all: number };
  onlyPriority: boolean;
  onOnlyPriority: (v: boolean) => void;
  roots: string[];
  rootFilter: string | null;
  onRootFilter: (r: string | null) => void;
  sortMode: SortMode;
  onSortMode: (m: SortMode) => void;
}

export function ProjectsToolbar({
  search, onSearch,
  statusFilter, onStatusFilter,
  counts,
  onlyPriority, onOnlyPriority,
  roots, rootFilter, onRootFilter,
  sortMode, onSortMode,
}: ProjectsToolbarProps) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 8,
      padding: "10px 16px",
      borderBottom: `1px solid ${C.border10}`,
    }}>
      {/* Row 1: search + sort */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          flex: 1, maxWidth: 340,
          display: "flex", alignItems: "center", gap: 8,
          background: C.surfaceContainerLowest,
          border: `1px solid ${C.border15}`,
          borderRadius: 8,
          padding: "7px 11px",
        }}>
          <Search size={12} color={C.onSecondaryFixedVar} />
          <input
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder="Projekt, Tonart, BPM …"
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              color: C.onSurface, fontSize: 12,
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
        </div>
        <div style={{ flex: 1 }} />
        <SortDropdown value={sortMode} onChange={onSortMode} />
      </div>

      {/* Row 2: status chips + priority + roots */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <FilterChip
          label={`Alle (${counts.all})`}
          active={statusFilter === null}
          onClick={() => onStatusFilter(null)}
        />
        {STATUS_ORDER.map(s => {
          const m = STUDIO_STATUS_CONFIG[s];
          return (
            <FilterChip
              key={s}
              label={`${m.label} (${counts[s]})`}
              active={statusFilter === s}
              color={m.color}
              dot
              onClick={() => onStatusFilter(statusFilter === s ? null : s)}
            />
          );
        })}

        <span style={{ width: 1, height: 16, background: C.border15, margin: "0 4px" }} />

        <FilterChip
          label="Priorität"
          icon={<Star size={10} fill={onlyPriority ? C.primary : "none"} strokeWidth={2} />}
          active={onlyPriority}
          color={C.primary}
          onClick={() => onOnlyPriority(!onlyPriority)}
        />

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
      </div>
    </div>
  );
}

// ─── Chip ────────────────────────────────────────────────────────────────────

function FilterChip({ label, active, onClick, color, dot, icon }: {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
  dot?: boolean;
  icon?: React.ReactNode;
}) {
  const accent = color ?? C.onSurface;
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "4px 10px",
        borderRadius: 9999,
        background: active ? `${accent}18` : "transparent",
        border: `1px solid ${active ? `${accent}55` : C.border15}`,
        color: active ? accent : C.onSurfaceVariant,
        cursor: "pointer",
        fontSize: 10, fontWeight: 600,
        transition: "all 0.15s",
      }}
    >
      {icon}
      {dot && <span style={{ width: 5, height: 5, borderRadius: "50%", background: color }} />}
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
          padding: "6px 11px", borderRadius: 7,
          background: "transparent",
          border: `1px solid ${open ? C.border30 : C.border15}`,
          color: C.onSurfaceVariant, cursor: "pointer",
          fontSize: 10, fontWeight: 600,
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
          borderRadius: 8,
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
                fontSize: 11, fontWeight: m === value ? 700 : 500,
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
