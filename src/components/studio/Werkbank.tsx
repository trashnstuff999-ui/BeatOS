// src/components/studio/Werkbank.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Die Werkbank: ein Regal pro Stufe (Priorität, Bereit, Exportiert, Überarbeiten),
// jedes Projekt eine Cover-Kachel. Statt fünf Datei-Spalten pro Zeile ein Balken
// aus fünf Strichen und darunter, was fehlt. Die vielen Ideen bleiben eine Liste
// darunter — die Werkbank ist für die ~30, an denen du wirklich sitzt.
// Look „Wucht": Hover, Leuchten und Bewegung in studio-wucht.css.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { CoverPlatzhalter } from "./CoverPlatzhalter";
import { ChevronDown, Hourglass, Pause, Play, Star } from "lucide-react";
import { C, type StudioVerlauf } from "../../lib/theme";
import { formatRelativeTime } from "../../lib/time";
import { SCHRITTE, fehlt } from "../../lib/werkbank";
import { projectDisplayName } from "../../types/studio";
import type { StudioProject } from "../../types/studio";

const KACHEL = 200;

export interface Regal {
  key: string;
  label: string;
  hint: string;
  verlauf: StudioVerlauf;
  items: StudioProject[];
}

interface WerkbankProps {
  regale: Regal[];
  inspectorPath: string | null;
  selected: Set<string>;
  /** Pfad des Projekts, das gerade im Player läuft */
  playingPath: string | null;
  onOpen: (p: StudioProject, e: React.MouseEvent) => void;
  onPreview: (p: StudioProject) => void;
  onAufraeumen: (p: StudioProject) => void;
}

/** So viele Kacheln zeigt ein Regal, bevor „Alle N anzeigen" kommt (~2 Reihen). */
const REGAL_LIMIT = 12;

/** Zugeklappte Regale, über Neustarts gemerkt. */
const LS_ZU = "beatos_werkbank_zu";

function ladeZu(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(LS_ZU) ?? "[]")); } catch { return new Set(); }
}

export function Werkbank({ regale, inspectorPath, selected, playingPath, onOpen, onPreview, onAufraeumen }: WerkbankProps) {
  const [offen, setOffen] = useState<Set<string>>(new Set());
  const [zu, setZu] = useState<Set<string>>(ladeZu);
  const umklappen = (key: string) => setZu(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    try { localStorage.setItem(LS_ZU, JSON.stringify([...next])); } catch { /* nur Komfort */ }
    return next;
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 46, padding: "8px 16px 40px" }}>
      {regale.map(r => {
        const alle = offen.has(r.key);
        const eingeklappt = zu.has(r.key);
        const gezeigt = alle ? r.items : r.items.slice(0, REGAL_LIMIT);
        const c = r.verlauf.glow;
        return (
        <section key={r.key} id={`regal-${r.key}`} aria-label={r.label}
          style={{ "--c": c, scrollMarginTop: 16 } as React.CSSProperties}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: eingeklappt ? 0 : 18, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>
              <button
                onClick={() => umklappen(r.key)}
                aria-expanded={!eingeklappt}
                title={eingeklappt ? "Aufklappen" : "Zuklappen"}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: 0, border: "none",
                  background: "none", cursor: "pointer", fontFamily: "inherit", color: C.onSurface,
                }}
              >
                <ChevronDown size={18} strokeWidth={2.5} color={C.onSecondaryFixedVar} className="sw-pfeil"
                  style={{ transform: eingeklappt ? "rotate(-90deg)" : "none" }} />
                <span className="sw-punkt" style={{ width: 12, height: 12, borderRadius: "50%", background: c }} />
                <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.01em" }}>{r.label}</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: c }}>{r.items.length}</span>
              </button>
            </h2>
            <span style={{ fontSize: 14, color: C.onSecondaryFixedVar }}>{r.hint}</span>
          </div>
          {/* Umbrechen statt seitwärts scrollen — Reihen füllen die Breite */}
          {!eingeklappt && <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, ${KACHEL}px)`, gap: "30px 24px" }}>
            {gezeigt.map((p, i) => (
              <Kachel
                key={p.path}
                index={i}
                project={p}
                verlauf={r.verlauf}
                isOpen={inspectorPath === p.path}
                isSelected={selected.has(p.path)}
                spielt={playingPath === p.path}
                onOpen={e => onOpen(p, e)}
                onPreview={() => onPreview(p)}
                onAufraeumen={() => onAufraeumen(p)}
              />
            ))}
          </div>}
          {!eingeklappt && r.items.length > REGAL_LIMIT && (
            <button
              className="sw-mehr"
              onClick={() => setOffen(prev => {
                const next = new Set(prev);
                if (alle) next.delete(r.key); else next.add(r.key);
                return next;
              })}
              style={{
                marginTop: 18, padding: "8px 18px", background: "none", borderRadius: 999,
                border: `1px solid ${C.border30}`, cursor: "pointer",
                fontSize: 13, fontWeight: 700, color: C.onSurfaceVariant,
              }}
            >
              {alle ? "Weniger anzeigen" : `Alle ${r.items.length} anzeigen`}
            </button>
          )}
        </section>
        );
      })}
    </div>
  );
}

const DUNKEL = "rgba(10,10,10,0.72)";

function Kachel({ index, project: p, verlauf, isOpen, isSelected, spielt, onOpen, onPreview, onAufraeumen }: {
  index: number;
  project: StudioProject;
  verlauf: StudioVerlauf;
  isOpen: boolean;
  isSelected: boolean;
  spielt: boolean;
  onOpen: (e: React.MouseEvent) => void;
  onPreview: () => void;
  onAufraeumen: () => void;
}) {
  const [bildKaputt, setBildKaputt] = useState(false);
  const c = verlauf.glow;
  const title = projectDisplayName(p);
  const canPreview = p.has_mp3 || p.has_wav;
  const bild = p.cover_path && !bildKaputt ? convertFileSrc(p.cover_path.replace(/\\/g, "/")) : null;
  // Kein Datum hier — das steht schon in der Zeile darunter
  const meta = [p.key, p.bpm != null ? `${p.bpm} BPM` : null].filter(Boolean).join(" · ");
  const fehlend = fehlt(p);
  const notiz = p.notes?.split("\n").map(l => l.trim()).find(Boolean) ?? null;
  const zeile = p.status === "ready" ? `alles da · ${formatRelativeTime(p.modified_secs)}`
    : p.status === "wip" ? (notiz ?? `fehlt: ${fehlend.join(", ")}`)
    : p.status === "exported" ? `fehlt: ${fehlend.join(", ")}`
    : (notiz ?? formatRelativeTime(p.modified_secs));
  const markiert = isOpen || isSelected;
  const grau = (p.status === "wip" && notiz) || p.status === "idea";

  return (
    <div
      // data-auswahl: wie die Zeile — ein Klick hier schliesst den Inspector nicht
      data-auswahl
      data-an={markiert}
      data-spielt={spielt}
      className="sw-kachel"
      style={{ position: "relative", width: KACHEL, "--i": index } as React.CSSProperties}
    >
      <button
        onClick={onOpen}
        title="Details · Strg/Shift: auswählen"
        style={{
          width: KACHEL, background: "none", border: "none", padding: 0, textAlign: "left",
          color: "inherit", cursor: "pointer", display: "flex", flexDirection: "column", gap: 5,
          userSelect: "none",
        }}
      >
        <div className="sw-kc" style={{
          position: "relative", width: KACHEL, height: KACHEL, borderRadius: 16, overflow: "hidden",
          boxShadow: "0 10px 26px -14px rgba(0,0,0,0.8)",
        }}>
          {bild ? (
            <img src={bild} alt="" onError={() => setBildKaputt(true)}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          ) : (
            <CoverPlatzhalter verlauf={verlauf} />
          )}
          {/* Die fünf Striche an der Cover-Unterkante, nur beim Drüberfahren */}
          <span aria-hidden className="sw-striche" style={{
            position: "absolute", left: 0, right: 0, bottom: 0, display: "flex", gap: 3,
            background: "rgba(10,10,10,0.8)", padding: "7px 8px",
          }}>
            {SCHRITTE.map(([k, label]) => (
              <span key={label} className={p[k] ? "sw-strich-an" : undefined}
                style={{ flex: 1, height: 5, borderRadius: 3, background: p[k] ? c : "rgba(255,255,255,0.18)" }} />
            ))}
          </span>
          <span aria-hidden className="sw-eq" style={{
            position: "absolute", left: 12, bottom: 28, gap: 3, alignItems: "flex-end", height: 26,
          }}>
            <i /><i /><i /><i />
          </span>
        </div>
        <span title={title} style={{ marginTop: 8, fontSize: 16, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </span>
        {meta && <span style={{ fontSize: 13, color: C.onSurfaceVariant }}>{meta}</span>}
        <span title={zeile} style={{
          fontSize: 13, fontWeight: grau ? 500 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          color: grau ? C.onSecondaryFixedVar : c,
        }}>
          {zeile}
        </span>
      </button>

      {p.priority > 0 && (
        <span title="Priorität" className="sw-stern" style={{
          position: "absolute", top: 10, left: 10, width: 32, height: 32, borderRadius: "50%",
          background: DUNKEL, display: "flex", alignItems: "center", justifyContent: "center",
          pointerEvents: "none",
        }}>
          <Star size={14} color={C.primary} fill={C.primary} strokeWidth={1.75} />
        </span>
      )}

      {/* Oben rechts, nur beim Drüberfahren — Gegenstück zum Stern oben links */}
      <button
        onClick={onAufraeumen}
        aria-label="Ins Aufräumen"
        title="Ins Aufräumen"
        className="sw-sand"
        style={{
          position: "absolute", top: 10, right: 10, width: 32, height: 32, borderRadius: "50%", border: "none",
          background: DUNKEL, color: C.onSurface, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <Hourglass size={14} strokeWidth={1.75} />
      </button>

      {canPreview && (
        <button
          onClick={onPreview}
          aria-label={`${title} anhören`}
          title="Export anhören"
          className="sw-play"
          style={{
            position: "absolute", top: KACHEL - 50 - 26, left: KACHEL - 50 - 12,
            width: 50, height: 50, borderRadius: "50%", border: "none",
            background: c, boxShadow: `0 8px 21px -5px color-mix(in srgb, ${c} 64%, transparent)`,
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}
        >
          {spielt
            ? <Pause size={18} color="#111" fill="#111" strokeWidth={1.5} />
            : <Play size={18} color="#111" fill="#111" strokeWidth={1.5} style={{ marginLeft: 2 }} />}
        </button>
      )}
    </div>
  );
}
