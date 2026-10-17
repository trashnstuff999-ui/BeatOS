// src/components/Schnellsuche.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Strg+K: Beats und Projekte von überall suchen.
//
//   Enter       Beat → Archiv (ausgewählt), Projekt → Studio (Inspector offen)
//   Strg+Enter  Beat → Upload-Tab
//   ↑ ↓         Auswahl, Esc schließt
//
// Beats kommen aus der Datenbanksuche (wie die Suche im Upload-Kopf). Projekte
// aus einem Studio-Scan, der beim ersten Öffnen im Hintergrund läuft und für
// die Sitzung gemerkt wird — beim nächsten Öffnen wird er still aufgefrischt.
// ═══════════════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Music, Disc3, Upload as UploadIcon, CornerDownLeft } from "lucide-react";
import { C, alpha, radius } from "../lib/theme";
import { api } from "../lib/api";
import { useSettings, parseProductionPaths } from "../contexts/SettingsContext";
import { useEscapeStack } from "./ui";
import { projectDisplayName } from "../types/studio";
import type { Beat } from "../types/browse";
import type { StudioProject } from "../types/studio";

type Treffer =
  | { art: "beat"; beat: Beat }
  | { art: "projekt"; projekt: StudioProject };

/** Für die Sitzung gemerkt — der Scan geht über viele Ordner. */
let projekteZwischenstand: StudioProject[] | null = null;

export function Schnellsuche() {
  const [offen, setOffen] = useState(false);

  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOffen(o => !o);
      }
    };
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, []);

  return offen ? <Fenster onClose={() => setOffen(false)} /> : null;
}

function Fenster({ onClose }: { onClose: () => void }) {
  useEscapeStack(onClose);
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [suche, setSuche] = useState("");
  const [beats, setBeats] = useState<Beat[]>([]);
  const [projekte, setProjekte] = useState<StudioProject[]>(projekteZwischenstand ?? []);
  const [auswahl, setAuswahl] = useState(0);
  const listeRef = useRef<HTMLDivElement>(null);

  // Projekte einmal scannen (bzw. auffrischen) — die Beats warten nicht darauf.
  useEffect(() => {
    const roots = parseProductionPaths(settings.productionPath);
    if (roots.length === 0) return;
    let abgebrochen = false;
    api.studio.scanProjects(roots)
      .then(p => { projekteZwischenstand = p; if (!abgebrochen) setProjekte(p); })
      .catch(() => {});
    return () => { abgebrochen = true; };
  }, [settings.productionPath]);

  useEffect(() => {
    let abgebrochen = false;
    const t = setTimeout(() => {
      api.beats.getAll({ search: suche.trim() || null, onlyFavs: false, limit: 8, offset: 0 })
        .then(b => { if (!abgebrochen) setBeats(b); })
        .catch(() => { if (!abgebrochen) setBeats([]); });
    }, 120);
    return () => { abgebrochen = true; clearTimeout(t); };
  }, [suche]);

  const q = suche.trim().toLowerCase();
  const projektTreffer = q
    ? projekte.filter(p => projectDisplayName(p).toLowerCase().includes(q) || p.name.toLowerCase().includes(q)).slice(0, 5)
    : [];
  const treffer: Treffer[] = [
    ...beats.map(beat => ({ art: "beat" as const, beat })),
    ...projektTreffer.map(projekt => ({ art: "projekt" as const, projekt })),
  ];

  useEffect(() => { setAuswahl(0); }, [suche]);
  useEffect(() => {
    listeRef.current?.querySelector<HTMLElement>(`[data-index="${auswahl}"]`)?.scrollIntoView({ block: "nearest" });
  }, [auswahl]);

  const oeffnen = (t: Treffer, upload = false) => {
    onClose();
    if (t.art === "beat") {
      if (upload) navigate("/upload", { state: { beatId: t.beat.id } });
      // Die ID als Suche: dann steht der Beat sicher in der geladenen Liste
      // (das Archiv wählt nur vor, was geladen ist).
      else navigate("/browse", { state: { initialBeatId: t.beat.id, initialFilters: { search: t.beat.id } } });
    } else {
      navigate("/studio", { state: { projektPfad: t.projekt.path } });
    }
  };

  const taste = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setAuswahl(a => Math.min(a + 1, treffer.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAuswahl(a => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && treffer[auswahl]) { e.preventDefault(); oeffnen(treffer[auswahl], e.ctrlKey || e.metaKey); }
  };

  return (
    <div
      data-modal
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
        display: "flex", justifyContent: "center", alignItems: "flex-start",
        paddingTop: "14vh",
      }}
    >
      <div style={{
        width: 620, maxWidth: "calc(100vw - 32px)",
        background: C.surfaceContainer, border: `1px solid ${C.border20}`,
        borderRadius: radius.card, boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        overflow: "hidden",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: `1px solid ${C.border10}` }}>
          <Search size={16} color={C.onSurfaceVariant} />
          <input
            autoFocus
            value={suche}
            onChange={e => setSuche(e.target.value)}
            onKeyDown={taste}
            placeholder="Beat oder Projekt suchen — Titel, ID, Tonart …"
            aria-label="Schnellsuche"
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              color: C.onSurface, fontSize: 15, fontFamily: "inherit",
            }}
          />
          <kbd style={{ fontSize: 11, color: C.onSecondaryFixedVar, border: `1px solid ${C.border20}`, borderRadius: 4, padding: "1px 6px" }}>Esc</kbd>
        </div>

        <div ref={listeRef} style={{ maxHeight: 420, overflowY: "auto", padding: 6 }}>
          {treffer.length === 0 && (
            <div style={{ padding: 16, fontSize: 12, color: C.onSecondaryFixedVar, textAlign: "center" }}>
              {q ? "Nichts gefunden." : "Tippen, um zu suchen."}
            </div>
          )}
          {treffer.map((t, i) => {
            const an = i === auswahl;
            const istBeat = t.art === "beat";
            const Icon = istBeat ? Music : Disc3;
            const titel = istBeat ? t.beat.name : projectDisplayName(t.projekt);
            const neben = istBeat
              ? `#${t.beat.id} · ${t.beat.key || "—"} · ${t.beat.bpm ?? "—"} BPM`
              : `Projekt · ${t.projekt.name}`;
            return (
              <div
                key={istBeat ? `b${t.beat.id}` : `p${t.projekt.path}`}
                data-index={i}
                onMouseEnter={() => setAuswahl(i)}
                onClick={() => oeffnen(t)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "9px 10px", borderRadius: radius.control, cursor: "pointer",
                  background: an ? alpha(C.primary, 0.12) : "transparent",
                }}
              >
                <Icon size={15} color={an ? C.primary : C.onSecondaryFixedVar} strokeWidth={1.75} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.onSurface, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {titel}
                  </div>
                  <div style={{ fontSize: 11, color: C.onSecondaryFixedVar, fontFamily: istBeat ? "monospace" : undefined }}>
                    {neben}
                  </div>
                </div>
                {an && (
                  <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: C.onSecondaryFixedVar }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <CornerDownLeft size={11} /> {istBeat ? "Archiv" : "Studio"}
                    </span>
                    {istBeat && (
                      <button
                        onClick={e => { e.stopPropagation(); oeffnen(t, true); }}
                        title="Im Upload-Tab öffnen (Strg+Enter)"
                        style={{
                          display: "flex", alignItems: "center", gap: 4,
                          padding: "2px 6px", borderRadius: 4, cursor: "pointer",
                          background: "transparent", border: `1px solid ${C.border20}`,
                          color: C.onSurfaceVariant, fontSize: 11, fontFamily: "inherit",
                        }}
                      >
                        <UploadIcon size={11} /> Upload · Strg+↵
                      </button>
                    )}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
