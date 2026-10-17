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
import { C, alpha, radius } from "../../lib/theme";
import { api } from "../../lib/api";
import { computeReadySteps } from "../../lib/uploadReady";
import { IconButton } from "../ui/Button";
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

  // Erstes Genre als Stimmungs-Chip: sagt auf einen Blick, was für ein Beat
  // das ist. Der Rest steht in der Type-Beat-Karte darunter.
  //
  // „Type Beat" fliegt raus — in einem Chip neben Tonart und Tempo ist das
  // Füllwort, „Sad Guitar" sagt dasselbe in der Hälfte der Breite.
  const stimmung = (data?.beat.genre_tags ?? "")
    .split(/[|,]/)[0]
    .replace(/\s*type\s*beats?\s*$/i, "")
    .trim() || null;

  // Länge kommt aus der Audiodatei selbst — dafür braucht es kein Backend,
  // das Abspielelement kennt sie, sobald es die Kopfdaten gelesen hat.
  const laenge = useTrackLength(data?.beat.path ?? null);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div style={{
        position: "relative", overflow: "hidden",
        background: C.surfaceContainerLow,
        border: `1px solid ${open ? C.primary + "50" : C.border10}`,
        borderRadius: radius.card,
        boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        transition: "border-color 0.15s",
      }}>
      {/* Das Cover färbt die Karte: verschwommen, gedämpft, nach rechts
          auslaufend. So hat jeder Beat seine eigene Stimmung — der Kopf soll
          nach dem Beat aussehen, nicht nach einem Formular. */}
      {coverUrl && (
        <>
          <div aria-hidden style={{
            position: "absolute", inset: -60,
            backgroundImage: `url("${coverUrl}")`,
            backgroundSize: "cover", backgroundPosition: "center",
            filter: "blur(60px) saturate(1.3)",
            opacity: 0.28,
            pointerEvents: "none",
          }} />
          <div aria-hidden style={{
            position: "absolute", inset: 0,
            background: `linear-gradient(90deg, transparent 0%, ${alpha(C.surfaceContainerLow, 0.85)} 75%)`,
            pointerEvents: "none",
          }} />
        </>
      )}

      <div style={{
        position: "relative",
        display: "flex", alignItems: beatId ? "stretch" : "center", gap: 24,
        padding: 20,
      }}>
        {/* Cover — groß, sobald ein Beat gewählt ist */}
        <div style={{
          width: beatId ? 152 : 56, height: beatId ? 152 : 56,
          borderRadius: beatId ? radius.card : radius.control, flexShrink: 0,
          background: C.surfaceContainerHigh,
          border: `1px solid ${C.border15}`,
          boxShadow: coverUrl ? "0 14px 36px rgba(0,0,0,0.5)" : "none",
          display: "flex", alignItems: "center", justifyContent: "center",
          overflow: "hidden",
        }}>
          {coverUrl
            ? <img src={coverUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <Music size={beatId ? 36 : 22} color={C.onSecondaryFixedVar} strokeWidth={1.5} />
          }
        </div>

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            {/* Title — click opens the picker */}
            <button
              onClick={() => setOpen(o => !o)}
              title={title ? "Beat wechseln" : "Beat wählen"}
              style={{
                flex: 1, minWidth: 0,
                display: "flex", alignItems: "center", gap: 8,
                background: "transparent", border: "none",
                cursor: "pointer", textAlign: "left", padding: 0,
              }}
            >
              <span style={{
                fontSize: beatId ? 26 : 20, fontWeight: 700,
                color: title ? C.onSurface : C.onSurfaceVariant,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                lineHeight: 1.2, letterSpacing: "-0.01em",
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
            </button>

            {/* Clear selection */}
            {selectedBeat && (
              <IconButton icon={X} size={28} onClick={() => onSelect(null)} title="Auswahl aufheben" />
            )}
          </div>

          {/* Eine Zeile statt fünf Pillen — dieselben Angaben, ruhiger. */}
          <div style={{ fontSize: 12, color: C.onSurfaceVariant, display: "flex", flexWrap: "wrap", gap: 8 }}>
            {beatId
              ? [
                  <span key="id" style={{ fontFamily: "monospace" }}>#{beatId}</span>,
                  key && <span key="key">{key}</span>,
                  bpm != null && <span key="bpm">{bpm} BPM</span>,
                  laenge && <span key="len" style={{ fontVariantNumeric: "tabular-nums" }}>{laenge}</span>,
                  stimmung && <span key="mood">{stimmung}</span>,
                ].filter(Boolean).flatMap((el, i) => i === 0 ? [el] : [
                  <span key={`sep${i}`} style={{ color: C.onSecondaryFixedVar }}>·</span>, el,
                ])
              : <span style={{ fontSize: 11, color: C.onSecondaryFixedVar }}>
                  Archivierten Beat suchen und für den Upload vorbereiten
                </span>
            }
          </div>

          {/* „Bin ich fertig?" — die wichtigste Frage auf dieser Seite, als
              stille Zeile unter dem Titel. */}
          {steps && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginTop: 2 }}>
              {missingSteps.length === 0 ? (
                <span style={{ display: "flex", alignItems: "center", gap: 6, color: C.mint, fontWeight: 600 }}>
                  <CheckCircle2 size={14} strokeWidth={2} />
                  Bereit zum Hochladen
                </span>
              ) : (
                <>
                  <span style={{ color: C.onSecondaryFixedVar }}>Es fehlt</span>
                  {missingSteps.map((step, i) => (
                    <span key={step.key} title={step.detail} style={{ color: C.onSurface, cursor: "help" }}>
                      {step.label}{i < missingSteps.length - 1 ? "," : ""}
                    </span>
                  ))}
                  <span style={{
                    color: C.onSecondaryFixedVar, fontVariantNumeric: "tabular-nums", marginLeft: 4,
                  }}>
                    {doneCount}/{steps.length}
                  </span>
                </>
              )}
            </div>
          )}

          {/* Asset-Kacheln: gehören zu „wie weit bin ich" — unten in der Spalte */}
          {children && (
            <div style={{ marginTop: "auto", paddingTop: 12 }}>
              {children}
            </div>
          )}
        </div>
      </div>
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
          borderRadius: radius.card,
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
              <button
                key={b.id}
                onClick={() => handlePick(b)}
                title={`#${b.id} ${b.name} auswählen`}
                style={{
                  padding: "10px 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  cursor: "pointer",
                  width: "100%", textAlign: "left",
                  background: "none",
                  border: "none",
                  borderBottom: `1px solid ${C.border10}`,
                  fontSize: 13, fontFamily: "inherit",
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
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Länge des Beats als „2:54".
 *
 *  Ohne Backend: der Pfad zur Audiodatei kommt aus `get_beat_audio_path`, die
 *  Dauer liest ein Audio-Element aus den Kopfdaten der Datei. `preload
 *  metadata` laedt dafuer nur den Anfang, nicht den ganzen Track.
 */
function useTrackLength(beatPath: string | null): string | null {
  const [laenge, setLaenge] = useState<string | null>(null);

  useEffect(() => {
    setLaenge(null);
    if (!beatPath) return;
    let abgebrochen = false;

    api.audio.getAudioPath(beatPath)
      .then(pfad => {
        if (abgebrochen || !pfad) return;
        const el = new Audio();
        el.preload = "metadata";
        el.src = convertFileSrc(pfad.replace(/\\/g, "/"));
        el.addEventListener("loadedmetadata", () => {
          if (abgebrochen || !isFinite(el.duration)) return;
          const s = Math.round(el.duration);
          setLaenge(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
        });
        // Fehlschlaege sind kein Drama — dann fehlt eben ein Chip.
        el.addEventListener("error", () => {});
      })
      .catch(() => {});

    return () => { abgebrochen = true; };
  }, [beatPath]);

  return laenge;
}
