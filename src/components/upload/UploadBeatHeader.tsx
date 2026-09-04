// src/components/upload/UploadBeatHeader.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// The anchor AND entry point of the Upload tab: cover, big title, key/bpm
// pills, ready progress — plus the integrated beat picker (searchable
// dropdown, formerly the standalone BeatSelector). Uses the same
// get_beats-backed search; selection state lives in Upload.tsx.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";
import { Music, CheckCircle2, Search, ChevronDown, X } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { C } from "../../lib/theme";
import { api } from "../../lib/api";
import { computeReadySteps } from "../../lib/uploadReady";
import type { UploadData } from "../../types/upload";
import type { Beat } from "../../types/browse";

interface UploadBeatHeaderProps {
  selectedBeat: Beat | null;
  onSelect: (beat: Beat | null) => void;
  data: UploadData | null;
  /** Wird unter der Kopfzeile in dieselbe Karte gehaengt (Asset-Ampel). */
  children?: React.ReactNode;
}

export function UploadBeatHeader({ selectedBeat, onSelect, data, children }: UploadBeatHeaderProps) {
  const steps = data ? computeReadySteps(data) : null;
  const doneCount = steps?.filter(s => s.done).length ?? 0;
  const missingSteps = steps?.filter(s => !s.done) ?? [];

  // ── Cover via asset protocol (stale-guard like AudioPlayerContext) ────────
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const currentPathRef = useRef<string | null>(null);
  useEffect(() => {
    const path = data?.beat.path ?? null;
    currentPathRef.current = path;
    setCoverUrl(null);
    if (!path) return;
    (async () => {
      try {
        const p = await api.audio.getCoverPath(path);
        if (currentPathRef.current !== path) return;
        if (p) setCoverUrl(convertFileSrc(p.replace(/\\/g, "/")));
      } catch { /* cover is optional */ }
    })();
  }, [data?.beat.path]);

  // ── Beat search dropdown (moved in from BeatSelector) ─────────────────────
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Beat[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setIsSearching(true);
      try {
        const beats = await api.beats.getAll({ search: query || null, onlyFavs: false, limit: 25, offset: 0 });
        if (!cancelled) setResults(beats);
      } catch (e) {
        console.error("[BeatHeader] search failed:", e);
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, open]);

  const handlePick = (b: Beat) => {
    onSelect(b);
    setQuery("");
    setOpen(false);
  };

  const title = data?.beat.name || selectedBeat?.name || null;
  const beatId = data?.beat.id || selectedBeat?.id || null;
  const key = data?.beat.key ?? selectedBeat?.key ?? null;
  const bpm = data?.beat.bpm ?? selectedBeat?.bpm ?? null;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div style={{
        background: C.surfaceContainerLow,
        border: `1px solid ${open ? C.primary + "50" : C.border10}`,
        borderRadius: 12,
        boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        transition: "border-color 0.15s",
      }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 20,
        padding: "16px 20px",
      }}>
        {/* Cover */}
        <div style={{
          width: 56, height: 56, borderRadius: 8, flexShrink: 0,
          background: C.surfaceContainerHigh,
          border: `1px solid ${C.border15}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          overflow: "hidden",
        }}>
          {coverUrl
            ? <img src={coverUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <Music size={22} color={C.onSecondaryFixedVar} strokeWidth={1.5} />
          }
        </div>

        {/* Title + meta — click opens the picker */}
        <button
          onClick={() => setOpen(o => !o)}
          title={title ? "Beat wechseln" : "Beat wählen"}
          style={{
            flex: 1, minWidth: 0,
            display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 5,
            background: "transparent", border: "none",
            cursor: "pointer", textAlign: "left", padding: 0,
          }}
        >
          <span style={{
            display: "flex", alignItems: "center", gap: 8, maxWidth: "100%",
          }}>
            <span style={{
              fontSize: 20, fontWeight: 700,
              color: title ? C.onSurface : C.onSurfaceVariant,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              lineHeight: 1.25,
            }}>
              {title ?? "Beat wählen…"}
            </span>
            <ChevronDown
              size={16}
              color={C.onSurfaceVariant}
              strokeWidth={2}
              style={{
                flexShrink: 0,
                transition: "transform 0.15s",
                transform: open ? "rotate(180deg)" : "rotate(0)",
              }}
            />
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {beatId
              ? <>
                  <MetaPill mono>#{beatId}</MetaPill>
                  {key && <MetaPill>{key}</MetaPill>}
                  {bpm != null && <MetaPill>{bpm} BPM</MetaPill>}
                </>
              : <span style={{ fontSize: 11, color: C.onSecondaryFixedVar }}>
                  Archivierten Beat suchen und für den Upload vorbereiten
                </span>
            }
          </span>
        </button>

        {/* Clear selection */}
        {selectedBeat && (
          <button
            onClick={() => onSelect(null)}
            title="Auswahl aufheben"
            style={{
              width: 26, height: 26, borderRadius: 6, flexShrink: 0,
              background: "transparent", border: `1px solid ${C.border15}`,
              cursor: "pointer", color: C.onSurfaceVariant,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <X size={13} />
          </button>
        )}

        {/* Fortschritt als Satz statt als vier Symbole: „bin ich fertig?" ist
            die wichtigste Frage auf dieser Seite und war bisher nur durch
            Abscannen von vier Haken zu beantworten. */}
        {steps && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            {missingSteps.length === 0 ? (
              <span style={{
                display: "flex", alignItems: "center", gap: 8,
                fontSize: 13, fontWeight: 700, color: C.mint,
              }}>
                <CheckCircle2 size={16} strokeWidth={2} />
                Bereit zum Hochladen
              </span>
            ) : (
              <>
                <span style={{ fontSize: 12, color: C.onSurfaceVariant }}>Es fehlt</span>
                {missingSteps.map(step => (
                  <MetaPill key={step.key} title={step.detail}>{step.label}</MetaPill>
                ))}
                <span style={{
                  fontSize: 12, fontWeight: 700, color: C.onSecondaryFixedVar,
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {doneCount}/{steps.length}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Asset-Ampel: gehoert zu „wie weit bin ich", nicht in eine eigene Karte */}
      {children && (
        <div style={{ padding: "0 20px 16px", borderTop: `1px solid ${C.border10}`, paddingTop: 14 }}>
          {children}
        </div>
      )}
      </div>

      {/* ── Picker dropdown ─────────────────────────────────────────────────── */}
      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 4px)",
          left: 0,
          width: "min(640px, 100%)",
          background: C.surfaceContainer,
          border: `1px solid ${C.border20}`,
          borderRadius: 10,
          boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
          zIndex: 30,
          maxHeight: 380,
          display: "flex",
          flexDirection: "column",
        }}>
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
              placeholder="Suche nach ID, Titel, Tonart, Tag …"
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

          <div style={{ overflowY: "auto", flex: 1 }}>
            {isSearching && (
              <div style={{ padding: 14, fontSize: 12, color: C.onSurfaceVariant, textAlign: "center" }}>
                Suche…
              </div>
            )}
            {!isSearching && results.length === 0 && (
              <div style={{ padding: 14, fontSize: 12, color: C.onSurfaceVariant, textAlign: "center" }}>
                Keine Beats gefunden.
              </div>
            )}
            {!isSearching && results.map(b => (
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

function MetaPill({ children, mono, title }: { children: React.ReactNode; mono?: boolean; title?: string }) {
  return (
    <span title={title} style={{
      padding: "2px 9px",
      borderRadius: 9999,
      fontSize: 10, fontWeight: 600,
      fontFamily: mono ? "monospace" : undefined,
      background: "rgba(255,255,255,0.04)",
      border: `1px solid ${C.border15}`,
      color: C.onSurfaceVariant,
    }}>
      {children}
    </span>
  );
}
