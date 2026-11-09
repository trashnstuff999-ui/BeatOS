// src/components/studio/Werkbank.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Die Werkbank: ein Regal pro Stufe (Bereit, Exportiert, Überarbeiten), jedes
// Projekt eine Cover-Kachel. Statt fünf Datei-Spalten pro Zeile ein Balken aus
// fünf Strichen und darunter, was fehlt. Die vielen Ideen bleiben eine Liste
// darunter — die Werkbank ist für die ~30, an denen du wirklich sitzt.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { CoverPlatzhalter } from "./CoverPlatzhalter";
import { ChevronDown, Hourglass, Play, Star } from "lucide-react";
import { C, alpha } from "../../lib/theme";
import { formatRelativeTime } from "../../lib/time";
import { SCHRITTE, fehlt } from "../../lib/werkbank";
import { projectDisplayName } from "../../types/studio";
import type { StudioProject } from "../../types/studio";

const KACHEL = 168;

export interface Regal {
  key: string;
  label: string;
  hint: string;
  color: string;
  items: StudioProject[];
}

interface WerkbankProps {
  regale: Regal[];
  inspectorPath: string | null;
  selected: Set<string>;
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

export function Werkbank({ regale, inspectorPath, selected, onOpen, onPreview, onAufraeumen }: WerkbankProps) {
  const [offen, setOffen] = useState<Set<string>>(new Set());
  const [zu, setZu] = useState<Set<string>>(ladeZu);
  const umklappen = (key: string) => setZu(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    try { localStorage.setItem(LS_ZU, JSON.stringify([...next])); } catch { /* nur Komfort */ }
    return next;
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 36, padding: "24px 16px 28px" }}>
      {regale.map(r => {
        const alle = offen.has(r.key);
        const eingeklappt = zu.has(r.key);
        const gezeigt = alle ? r.items : r.items.slice(0, REGAL_LIMIT);
        return (
        <section key={r.key} aria-label={r.label}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: eingeklappt ? 0 : 14, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>
              <button
                onClick={() => umklappen(r.key)}
                aria-expanded={!eingeklappt}
                title={eingeklappt ? "Aufklappen" : "Zuklappen"}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: 0, border: "none",
                  background: "none", cursor: "pointer", fontFamily: "inherit", color: C.onSurface,
                }}
              >
                <ChevronDown size={14} color={C.onSurfaceVariant}
                  style={{ transition: "transform 0.15s", transform: eingeklappt ? "rotate(-90deg)" : "none" }} />
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: r.color }} />
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>{r.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.onSurfaceVariant }}>{r.items.length}</span>
              </button>
            </h2>
            <span style={{ fontSize: 13, color: C.onSecondaryFixedVar }}>{r.hint}</span>
          </div>
          {/* Umbrechen statt seitwärts scrollen — Reihen füllen die Breite */}
          {!eingeklappt && <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, ${KACHEL}px)`, gap: "26px 22px" }}>
            {gezeigt.map(p => (
              <Kachel
                key={p.path}
                project={p}
                color={r.color}
                isOpen={inspectorPath === p.path}
                isSelected={selected.has(p.path)}
                onOpen={e => onOpen(p, e)}
                onPreview={() => onPreview(p)}
                onAufraeumen={() => onAufraeumen(p)}
              />
            ))}
          </div>}
          {!eingeklappt && r.items.length > REGAL_LIMIT && (
            <button
              onClick={() => setOffen(prev => {
                const next = new Set(prev);
                if (alle) next.delete(r.key); else next.add(r.key);
                return next;
              })}
              style={{
                marginTop: 14, padding: "8px 0", background: "none", border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: 600, color: C.onSurfaceVariant,
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

function Kachel({ project: p, color, isOpen, isSelected, onOpen, onPreview, onAufraeumen }: {
  project: StudioProject;
  color: string;
  isOpen: boolean;
  isSelected: boolean;
  onOpen: (e: React.MouseEvent) => void;
  onPreview: () => void;
  onAufraeumen: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [bildKaputt, setBildKaputt] = useState(false);
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

  return (
    <div
      // data-auswahl: wie die Zeile — ein Klick hier schliesst den Inspector nicht
      data-auswahl
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        // content-box: die 8 px Rand kommen zur Kachel dazu, sonst ragt das Cover rechts aus dem Rahmen
        position: "relative", width: KACHEL, boxSizing: "content-box",
        padding: 8, margin: -8, borderRadius: 14,
        background: markiert ? alpha(C.primary, isSelected ? 0.12 : 0.06) : "transparent",
        boxShadow: markiert ? `inset 0 0 0 1.5px ${C.primary}` : "none",
        transition: "background 0.15s",
      }}
    >
      <button
        onClick={onOpen}
        title="Details · Strg/Shift: auswählen"
        style={{
          width: KACHEL, background: "none", border: "none", padding: 0, textAlign: "left",
          color: "inherit", cursor: "pointer", display: "flex", flexDirection: "column", gap: 4,
          userSelect: "none",
        }}
      >
        <div style={{
          position: "relative", width: KACHEL, height: KACHEL, borderRadius: 10, overflow: "hidden",
          transform: hovered ? "translateY(-3px)" : "none", transition: "transform 0.15s",
        }}>
          {bild ? (
            <img src={bild} alt="" onError={() => setBildKaputt(true)}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          ) : (
            <CoverPlatzhalter />
          )}
          {/* Die fünf Striche als Leiste an der Cover-Unterkante, nur beim
              Drüberfahren — sie brauchen so keinen eigenen Platz im Regal. */}
          <span aria-hidden style={{
            position: "absolute", left: 0, right: 0, bottom: 0, display: "flex", gap: 2,
            background: "rgba(14,14,14,0.75)", padding: "3px 0 0",
            opacity: hovered || markiert ? 1 : 0, transition: "opacity 0.15s",
          }}>
            {SCHRITTE.map(([k, label]) => (
              <span key={label} style={{ flex: 1, height: 4, background: p[k] ? color : C.surfaceContainerHighest }} />
            ))}
          </span>
        </div>
        <span title={title} style={{ marginTop: 6, fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </span>
        {meta && <span style={{ fontSize: 12, color: C.onSurfaceVariant }}>{meta}</span>}
        <span title={zeile} style={{
          fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          color: p.status === "ready" ? C.mint : p.status === "exported" ? color : C.onSurfaceVariant,
        }}>
          {zeile}
        </span>
      </button>

      {p.priority > 0 && (
        <span title="Priorität" style={{
          position: "absolute", top: 16, left: 16, width: 26, height: 26, borderRadius: "50%",
          background: "rgba(14,14,14,0.75)", display: "flex", alignItems: "center", justifyContent: "center",
          pointerEvents: "none",
        }}>
          <Star size={13} color={C.primary} fill={C.primary} strokeWidth={1.75} />
        </span>
      )}

      {/* Oben rechts, nur beim Drüberfahren — Gegenstück zum Stern oben links */}
      <button
        onClick={onAufraeumen}
        aria-label="Ins Aufräumen"
        title="Ins Aufräumen"
        tabIndex={hovered ? 0 : -1}
        style={{
          position: "absolute", top: 16, right: 16, width: 30, height: 30, borderRadius: "50%", border: "none",
          background: "rgba(14,14,14,0.75)", color: C.onSurface, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: hovered ? 1 : 0, transition: "opacity 0.15s",
        }}
      >
        <Hourglass size={14} strokeWidth={1.75} />
      </button>

      {canPreview && (
        <button
          onClick={onPreview}
          aria-label={`${title} anhören`}
          title="Export anhören"
          style={{
            position: "absolute", top: 8 + KACHEL - 50, left: 8 + KACHEL - 50,
            width: 40, height: 40, borderRadius: "50%", border: "none",
            background: C.primary, boxShadow: "0 6px 18px rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            opacity: hovered ? 1 : 0, transition: "opacity 0.15s",
          }}
        >
          <Play size={15} color={C.onPrimary} fill={C.onPrimary} strokeWidth={1.5} style={{ marginLeft: 2 }} />
        </button>
      )}
    </div>
  );
}
