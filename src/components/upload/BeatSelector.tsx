// src/components/upload/BeatSelector.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Searchable dropdown for picking an archived beat in the Upload tab.
// Re-uses the existing get_beats command (server-side search).
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";
import { Search, ChevronDown, X } from "lucide-react";
import { api } from "../../lib/api";
import { C } from "../../lib/theme";
import type { Beat } from "../../types/browse";

interface BeatSelectorProps {
  selectedBeat: Beat | null;
  onSelect: (beat: Beat | null) => void;
}

export function BeatSelector({ selectedBeat, onSelect }: BeatSelectorProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Beat[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setIsLoading(true);
      try {
        const beats = await api.beats.getAll({
          search: query || null,
          onlyFavs: false,
          limit: 25,
          offset: 0,
        });
        if (!cancelled) setResults(beats);
      } catch (e) {
        console.error("[BeatSelector] search failed:", e);
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, open]);

  const handlePick = (b: Beat) => {
    onSelect(b);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", maxWidth: 640 }}>
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 16px",
          background: C.surfaceContainer,
          border: `1px solid ${open ? C.primary + "60" : C.border20}`,
          borderRadius: 10,
          cursor: "pointer",
          color: selectedBeat ? C.onSurface : C.onSurfaceVariant,
          fontSize: 13,
          textAlign: "left",
          transition: "border-color 0.15s",
        }}
      >
        <Search size={16} color={C.onSurfaceVariant} strokeWidth={1.75} />
        {selectedBeat ? (
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <strong style={{ color: C.primary, marginRight: 8 }}>#{selectedBeat.id}</strong>
            {selectedBeat.name}
            {(selectedBeat.bpm || selectedBeat.key) && (
              <span style={{ color: C.onSecondaryFixedVar, marginLeft: 8, fontSize: 11 }}>
                {selectedBeat.key || "—"} · {selectedBeat.bpm || "—"} BPM
              </span>
            )}
          </span>
        ) : (
          <span style={{ flex: 1 }}>Select a beat to prepare for upload…</span>
        )}
        {selectedBeat && (
          <span
            onClick={e => { e.stopPropagation(); onSelect(null); }}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 22, height: 22, borderRadius: 4,
              cursor: "pointer", color: C.onSurfaceVariant,
            }}
            title="Clear selection"
          >
            <X size={14} />
          </span>
        )}
        <ChevronDown
          size={16}
          color={C.onSurfaceVariant}
          strokeWidth={1.75}
          style={{
            transition: "transform 0.15s",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 4px)",
          left: 0, right: 0,
          background: C.surfaceContainer,
          border: `1px solid ${C.border20}`,
          borderRadius: 10,
          boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
          zIndex: 20,
          maxHeight: 380,
          display: "flex",
          flexDirection: "column",
        }}>
          {/* Search input */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 14px",
            borderBottom: `1px solid ${C.border10}`,
          }}>
            <Search size={14} color={C.onSurfaceVariant} />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by ID, title, key, tag…"
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: C.onSurface,
                fontSize: 13,
              }}
            />
          </div>

          {/* Results */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {isLoading && (
              <div style={{ padding: 14, fontSize: 12, color: C.onSurfaceVariant, textAlign: "center" }}>
                Searching…
              </div>
            )}
            {!isLoading && results.length === 0 && (
              <div style={{ padding: 14, fontSize: 12, color: C.onSurfaceVariant, textAlign: "center" }}>
                No beats found.
              </div>
            )}
            {!isLoading && results.map(b => (
              <div
                key={b.id}
                onClick={() => handlePick(b)}
                style={{
                  padding: "10px 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  cursor: "pointer",
                  borderBottom: `1px solid ${C.border10}`,
                  fontSize: 13,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = C.surfaceContainerHigh; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{
                  fontFamily: "monospace", color: C.primary, fontWeight: 700,
                  width: 56, flexShrink: 0,
                }}>
                  #{b.id}
                </span>
                <span style={{
                  flex: 1, minWidth: 0,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  color: C.onSurface,
                }}>
                  {b.name}
                </span>
                <span style={{
                  color: C.onSecondaryFixedVar, fontSize: 11,
                  fontFamily: "monospace", flexShrink: 0,
                }}>
                  {b.key || "—"} · {b.bpm ?? "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
