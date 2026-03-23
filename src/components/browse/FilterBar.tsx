// src/components/browse/FilterBar.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Advanced Filtering Bar with Multi-Select Key Filter
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { Filter, RotateCcw, Heart, ChevronDown, X } from "lucide-react";
import { C } from "../../lib/theme";
import type { FilterState, BeatStatus } from "../../types/browse";
import { MINOR_KEYS, MAJOR_KEYS } from "../../types/browse";

interface FilterBarProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  onReset: () => void;
  resultCount: number;
}

export function FilterBar({ filters, onChange, onReset, resultCount }: FilterBarProps) {
  const [keyDropdownOpen, setKeyDropdownOpen] = useState(false);

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

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.15em",
    color: C.onSecondaryFixedVar,
  };

  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    onChange({ ...filters, [key]: value });
  };

  const toggleKey = (key: string) => {
    const newKeys = filters.keys.includes(key)
      ? filters.keys.filter(k => k !== key)
      : [...filters.keys, key];
    updateFilter("keys", newKeys);
  };

  const clearKeys = () => {
    updateFilter("keys", []);
    setKeyDropdownOpen(false);
  };

  return (
    <section style={{
      background: C.surfaceContainerLow,
      borderRadius: 8,
      padding: 16,
      border: `1px solid ${C.border10}`,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Filter size={14} color={C.primary} strokeWidth={1.5} />
          <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "-0.02em", color: C.onSurface, margin: 0 }}>
            Advanced Filtering
          </h3>
          <span style={{ fontSize: 10, color: C.onSecondaryFixedVar }}>
            ({resultCount} beats)
          </span>
        </div>
        <button
          onClick={onReset}
          style={{
            fontSize: 10,
            color: C.onSurfaceVariant,
            background: "none",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
            textTransform: "uppercase",
            fontWeight: 700,
            letterSpacing: "0.15em",
          }}
          onMouseEnter={e => (e.currentTarget.style.color = C.onSurface)}
          onMouseLeave={e => (e.currentTarget.style.color = C.onSurfaceVariant)}
        >
          Reset All <RotateCcw size={12} />
        </button>
      </div>

      {/* Filter Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr 1fr 1fr", gap: 24 }}>
        {/* Status */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={labelStyle}>Status</label>
          <select
            value={filters.status}
            onChange={e => updateFilter("status", e.target.value as BeatStatus | "all")}
            style={inputStyle}
          >
            <option value="all">All Statuses</option>
            <option value="idea">Idea</option>
            <option value="wip">WIP</option>
            <option value="finished">Finished</option>
            <option value="sold">Sold</option>
          </select>
        </div>

        {/* Musical Key - Multi-Select Dropdown */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, position: "relative" }}>
          <label style={labelStyle}>Musical Key</label>
          <button
            onClick={() => setKeyDropdownOpen(!keyDropdownOpen)}
            style={{
              ...inputStyle,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <span style={{ 
              overflow: "hidden", 
              textOverflow: "ellipsis", 
              whiteSpace: "nowrap",
              flex: 1,
            }}>
              {filters.keys.length === 0 
                ? "Any Key" 
                : filters.keys.length <= 3 
                  ? filters.keys.join(", ")
                  : `${filters.keys.length} keys selected`
              }
            </span>
            <ChevronDown size={14} style={{ 
              transform: keyDropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
              flexShrink: 0,
            }} />
          </button>

          {/* Dropdown */}
          {keyDropdownOpen && (
            <>
              {/* Backdrop */}
              <div 
                style={{ position: "fixed", inset: 0, zIndex: 49 }}
                onClick={() => setKeyDropdownOpen(false)}
              />
              
              {/* Dropdown Content */}
              <div style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                marginTop: 4,
                background: C.surfaceContainerHighest,
                border: `1px solid ${C.border20}`,
                borderRadius: 8,
                padding: 12,
                zIndex: 50,
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                maxHeight: 320,
                overflowY: "auto",
              }}>
                {/* Clear Button */}
                {filters.keys.length > 0 && (
                  <button
                    onClick={clearKeys}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      marginBottom: 12,
                      background: "rgba(239,68,68,0.1)",
                      border: "1px solid rgba(239,68,68,0.3)",
                      borderRadius: 4,
                      color: "#ef4444",
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                    }}
                  >
                    <X size={12} /> Clear Selection ({filters.keys.length})
                  </button>
                )}

                {/* Minor Keys */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ 
                    fontSize: 9, 
                    fontWeight: 700, 
                    color: C.tertiary, 
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginBottom: 8,
                  }}>
                    Minor
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {MINOR_KEYS.map(key => {
                      const isSelected = filters.keys.includes(key);
                      return (
                        <button
                          key={key}
                          onClick={() => toggleKey(key)}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: "pointer",
                            background: isSelected ? C.tertiary : C.surfaceContainer,
                            color: isSelected ? "#000" : C.onSurfaceVariant,
                            border: `1px solid ${isSelected ? C.tertiary : C.border10}`,
                            transition: "all 0.15s",
                          }}
                        >
                          {key}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Major Keys */}
                <div>
                  <div style={{ 
                    fontSize: 9, 
                    fontWeight: 700, 
                    color: C.primary, 
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginBottom: 8,
                  }}>
                    Major
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {MAJOR_KEYS.map(key => {
                      const isSelected = filters.keys.includes(key);
                      return (
                        <button
                          key={key}
                          onClick={() => toggleKey(key)}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: "pointer",
                            background: isSelected ? C.primary : C.surfaceContainer,
                            color: isSelected ? "#000" : C.onSurfaceVariant,
                            border: `1px solid ${isSelected ? C.primary : C.border10}`,
                            transition: "all 0.15s",
                          }}
                        >
                          {key}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* BPM Range */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={labelStyle}>BPM Range</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number"
              placeholder="MIN"
              value={filters.bpmMin}
              onChange={e => updateFilter("bpmMin", e.target.value)}
              style={{ ...inputStyle, width: "50%" }}
            />
            <input
              type="number"
              placeholder="MAX"
              value={filters.bpmMax}
              onChange={e => updateFilter("bpmMax", e.target.value)}
              style={{ ...inputStyle, width: "50%" }}
            />
          </div>
        </div>

        {/* Favorites */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={labelStyle}>Favorites</label>
          <button
            onClick={() => updateFilter("onlyFavs", !filters.onlyFavs)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 2,
              background: filters.onlyFavs ? "rgba(253,161,36,0.15)" : C.surfaceContainerLowest,
              border: filters.onlyFavs ? "1px solid rgba(253,161,36,0.3)" : "1px solid transparent",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              color: filters.onlyFavs ? C.primary : C.onSurfaceVariant,
            }}
          >
            <Heart
              size={12}
              fill={filters.onlyFavs ? C.primary : "none"}
              color={filters.onlyFavs ? C.primary : C.onSurfaceVariant}
              strokeWidth={1.5}
            />
            Only Favs
          </button>
        </div>
      </div>
    </section>
  );
}
