// src/components/browse/FilterBar.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Die Bedienleiste ueber dem Archiv: Filter links, Ansicht/Sortierung rechts.
//
// Vorher lag die Leiste als Kasten *neben* den Bedienknoepfen in einer
// Flex-Zeile mit alignItems:center. Aufgeklappt wuchs der Kasten auf ~150px,
// die Knoepfe blieben 32px — und schwebten auf halber Hoehe daneben. Jetzt
// sitzt alles in einer Kopfzeile fester Hoehe, das Filter-Raster klappt
// darunter ueber die volle Breite auf (und hat dadurch die ~400px mehr Platz,
// die es vorher an die Knoepfe verloren hat).
// ═══════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect } from "react";
import { Filter, RotateCcw, Heart, ChevronDown, X, UploadCloud } from "lucide-react";
import { C, radius, STATUS_CONFIG, alpha } from "../../lib/theme";
import { Dropdown, Select } from "../ui";
import type { FilterState, BeatStatus } from "../../types/browse";
import { MINOR_KEYS, MAJOR_KEYS } from "../../types/browse";

interface FilterBarProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  onReset: () => void;
  resultCount: number;
  /** Sortierung, Ansichtsumschalter, Zufall — teilen sich die Kopfzeile. */
  actions?: React.ReactNode;
}

const STATUS_OPTIONS = [
  { value: "all" as const, label: "Alle Status" },
  { value: "idea" as const, label: "Idee" },
  { value: "wip" as const, label: "In Arbeit" },
  { value: "finished" as const, label: "Fertig" },
  { value: "sold" as const, label: "Verkauft" },
];

/** Aktive Filter als einzeln abwerfbare Chips — sichtbar auch wenn eingeklappt. */
function activeChips(filters: FilterState, set: (patch: Partial<FilterState>) => void) {
  const chips: { label: string; clear: () => void }[] = [];

  if (filters.search) {
    chips.push({ label: `Suche: ${filters.search}`, clear: () => set({ search: "" }) });
  }
  if (filters.status !== "all") {
    chips.push({
      label: STATUS_CONFIG[filters.status]?.label ?? filters.status,
      clear: () => set({ status: "all" }),
    });
  }
  for (const key of filters.keys) {
    chips.push({ label: key, clear: () => set({ keys: filters.keys.filter(k => k !== key) }) });
  }
  if (filters.bpmMin || filters.bpmMax) {
    const label = filters.bpmMin && filters.bpmMax
      ? `BPM ${filters.bpmMin}–${filters.bpmMax}`
      : filters.bpmMin ? `BPM ab ${filters.bpmMin}` : `BPM bis ${filters.bpmMax}`;
    chips.push({ label, clear: () => set({ bpmMin: "", bpmMax: "" }) });
  }
  if (filters.onlyFavs) {
    chips.push({ label: "Favoriten", clear: () => set({ onlyFavs: false }) });
  }
  if (filters.unpublishedOnly) {
    chips.push({ label: "Unveröffentlicht", clear: () => set({ unpublishedOnly: false }) });
  }

  return chips;
}

export function FilterBar({ filters, onChange, onReset, resultCount, actions }: FilterBarProps) {
  // Eingeklappt spart ~150px ueber der Liste; die Chips zeigen trotzdem, was aktiv ist.
  const [open, setOpen] = useState(() => localStorage.getItem("beatos_browse_filters_open") === "1");
  useEffect(() => {
    localStorage.setItem("beatos_browse_filters_open", open ? "1" : "0");
  }, [open]);

  const inputStyle: React.CSSProperties = {
    background: C.surfaceContainer,
    border: `1px solid ${C.border15}`,
    borderRadius: radius.control,
    padding: "7px 10px",
    fontSize: 11,
    fontWeight: 600,
    color: C.onSurface,
    outline: "none",
    width: "100%",
    fontFamily: "inherit",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: C.onSecondaryFixedVar,
  };

  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    onChange({ ...filters, [key]: value });
  };

  const chips = activeChips(filters, patch => onChange({ ...filters, ...patch }));

  const toggleKey = (key: string) => {
    const newKeys = filters.keys.includes(key)
      ? filters.keys.filter(k => k !== key)
      : [...filters.keys, key];
    updateFilter("keys", newKeys);
  };

  const keyLabel = filters.keys.length === 0
    ? "Alle Tonarten"
    : filters.keys.length <= 3
      ? filters.keys.join(", ")
      : `${filters.keys.length} Tonarten gewählt`;

  return (
    <section style={{
      background: C.surfaceContainerLow,
      borderRadius: radius.card,
      border: `1px solid ${C.border10}`,
      padding: "10px 12px",
    }}>
      {/* ── Kopfzeile: feste Hoehe, damit die Knoepfe rechts nicht mitwachsen ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 32 }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
            padding: "6px 10px", borderRadius: radius.control,
            background: open ? C.surfaceContainerHigh : "transparent",
            border: `1px solid ${open ? C.border20 : "transparent"}`,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          <Filter size={13} color={C.primary} strokeWidth={2} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.onSurface }}>
            Filter
          </span>
          <ChevronDown
            size={13}
            color={C.onSecondaryFixedVar}
            style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}
          />
        </button>

        <span style={{ fontSize: 11, fontWeight: 600, color: C.onSecondaryFixedVar, flexShrink: 0 }}>
          {resultCount} Beats
        </span>

        {chips.length > 0 && (
          <button
            onClick={onReset}
            title="Alle Filter zurücksetzen"
            style={{
              display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
              fontSize: 11, fontWeight: 600,
              color: C.onSurfaceVariant, background: "none", border: "none", cursor: "pointer",
              fontFamily: "inherit",
            }}
            onMouseEnter={e => (e.currentTarget.style.color = C.onSurface)}
            onMouseLeave={e => (e.currentTarget.style.color = C.onSurfaceVariant)}
          >
            <RotateCcw size={12} /> Zurücksetzen
          </button>
        )}

        <div style={{ flex: 1, minWidth: 0 }} />

        {actions}
      </div>

      {/* ── Aktive Filter — auch im eingeklappten Zustand sichtbar ── */}
      {chips.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {chips.map(chip => (
            <button
              key={chip.label}
              onClick={chip.clear}
              title="Filter entfernen"
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "3px 8px", borderRadius: radius.full,
                background: alpha(C.primary, 0.12),
                border: `1px solid ${alpha(C.primary, 0.3)}`,
                color: C.primary, cursor: "pointer",
                fontSize: 10, fontWeight: 700, letterSpacing: "0.03em",
                maxWidth: 240, fontFamily: "inherit",
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {chip.label}
              </span>
              <X size={11} strokeWidth={2.5} style={{ flexShrink: 0 }} />
            </button>
          ))}
        </div>
      )}

      {/* ── Filter-Raster: volle Breite, unter der Kopfzeile ── */}
      {open && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1.5fr 1fr 1.2fr",
          gap: 20,
          marginTop: 14,
          paddingTop: 14,
          borderTop: `1px solid ${C.border10}`,
        }}>
          {/* Status */}
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <label style={labelStyle}>Status</label>
            <Select
              value={filters.status}
              options={STATUS_OPTIONS}
              onChange={v => updateFilter("status", v as BeatStatus | "all")}
              triggerStyle={{ ...inputStyle, display: "flex" }}
            />
          </div>

          {/* Tonart — mehrere gleichzeitig, deshalb eigenes Feld statt Select */}
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <label style={labelStyle}>Tonart</label>
            <Dropdown
              label={keyLabel}
              triggerStyle={{ ...inputStyle, display: "flex", color: filters.keys.length ? C.onSurface : C.onSurfaceVariant }}
              panelStyle={{ padding: 12 }}
            >
              {() => (
                <>
                  {filters.keys.length > 0 && (
                    <button
                      onClick={() => updateFilter("keys", [])}
                      style={{
                        width: "100%", padding: "7px 12px", marginBottom: 12,
                        background: alpha(C.error, 0.10),
                        border: `1px solid ${alpha(C.error, 0.30)}`,
                        borderRadius: radius.control,
                        color: C.error, fontSize: 10, fontWeight: 700,
                        cursor: "pointer", fontFamily: "inherit",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                      }}
                    >
                      <X size={12} /> Auswahl leeren ({filters.keys.length})
                    </button>
                  )}

                  {([["Moll", MINOR_KEYS, C.tertiary], ["Dur", MAJOR_KEYS, C.primary]] as const).map(([titel, keys, farbe]) => (
                    <div key={titel} style={{ marginBottom: titel === "Moll" ? 12 : 0 }}>
                      <div style={{
                        fontSize: 10, fontWeight: 700, color: farbe,
                        textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8,
                      }}>
                        {titel}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {keys.map(key => {
                          const isSelected = filters.keys.includes(key);
                          return (
                            <button
                              key={key}
                              onClick={() => toggleKey(key)}
                              style={{
                                padding: "4px 10px",
                                borderRadius: radius.control - 1,
                                fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                                cursor: "pointer",
                                background: isSelected ? farbe : C.surfaceContainer,
                                color: isSelected ? "#000" : C.onSurfaceVariant,
                                border: `1px solid ${isSelected ? farbe : C.border15}`,
                                transition: "all 0.15s",
                              }}
                            >
                              {key}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </Dropdown>
          </div>

          {/* BPM-Bereich */}
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <label style={labelStyle}>BPM-Bereich</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="number"
                placeholder="min."
                value={filters.bpmMin}
                onChange={e => updateFilter("bpmMin", e.target.value)}
                style={{ ...inputStyle, width: "50%" }}
              />
              <input
                type="number"
                placeholder="max."
                value={filters.bpmMax}
                onChange={e => updateFilter("bpmMax", e.target.value)}
                style={{ ...inputStyle, width: "50%" }}
              />
            </div>
          </div>

          {/* Schnellschalter */}
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <label style={labelStyle}>Nur zeigen</label>
            <div style={{ display: "flex", gap: 8 }}>
              {([
                ["onlyFavs", Heart, "Favs", C.primary, alpha(C.primary, 0.15), alpha(C.primary, 0.35), 1] as const,
                ["unpublishedOnly", UploadCloud, "Unveröffentlicht", C.mint, alpha(C.mint, 0.12), alpha(C.mint, 0.35), 1.5] as const,
              ]).map(([key, Icon, label, farbe, bg, rand, wachs]) => {
                const an = filters[key];
                return (
                  <button
                    key={key}
                    onClick={() => updateFilter(key, !an)}
                    title={key === "unpublishedOnly" ? "Nur Beats, die auf keiner Plattform hochgeladen wurden" : undefined}
                    style={{
                      flex: wachs,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      padding: "7px 10px",
                      borderRadius: radius.control,
                      background: an ? bg : C.surfaceContainer,
                      border: `1px solid ${an ? rand : C.border15}`,
                      cursor: "pointer",
                      fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                      fontFamily: "inherit",
                      color: an ? farbe : C.onSurfaceVariant,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <Icon
                      size={12}
                      fill={key === "onlyFavs" && an ? farbe : "none"}
                      color={an ? farbe : C.onSurfaceVariant}
                      strokeWidth={1.75}
                    />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
