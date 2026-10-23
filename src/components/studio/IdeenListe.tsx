// src/components/studio/IdeenListe.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Die vielen Ideen unter der Werkbank: nach Monat (oder A–Z) gruppiert, eine
// ruhige Zeile pro Projekt — Play, Nummer, Titel oder Notiz, Tonart/BPM, Alter.
// Keine Datei-Spalten und keine Status-Pille: bei Ideen wären die alle leer.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { Hourglass, Play } from "lucide-react";
import { C, alpha } from "../../lib/theme";
import { formatRelativeTime } from "../../lib/time";
import { ideeName } from "../../lib/werkbank";
import { Button, Segmented } from "../ui";
import type { SortMode } from "./ProjectsToolbar";
import type { StudioProject } from "../../types/studio";

export interface GezeigteGruppe {
  key: string;
  label: string;
  total: number;
  items: StudioProject[];
}

interface IdeenListeProps {
  gruppen: GezeigteGruppe[];
  total: number;
  sortMode: SortMode;
  onSortMode: (m: SortMode) => void;
  onMore: (key: string) => void;
  inspectorPath: string | null;
  selected: Set<string>;
  onOpen: (p: StudioProject, e: React.MouseEvent) => void;
  onPreview: (p: StudioProject) => void;
  onAufraeumen: (p: StudioProject) => void;
}

export function IdeenListe({ gruppen, total, sortMode, onSortMode, onMore, inspectorPath, selected, onOpen, onPreview, onAufraeumen }: IdeenListeProps) {
  return (
    <section aria-label="Ideen" style={{ padding: "8px 16px 0" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        paddingBottom: 12, borderBottom: `1px solid ${C.border20}`,
      }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.onSecondaryFixedVar }} />
        <h2 style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: C.onSurface }}>IDEEN</h2>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.onSurfaceVariant }}>{total}</span>
        <span style={{ fontSize: 13, color: C.onSecondaryFixedVar }}>angefangen, noch nicht exportiert</span>
        <div style={{ flex: 1 }} />
        <Segmented
          label="Sortierung der Ideen"
          value={sortMode}
          onChange={onSortMode}
          options={[
            { value: "modified", label: "Neueste" },
            { value: "oldest", label: "Älteste" },
            { value: "name", label: "A–Z" },
          ]}
        />
      </div>

      {gruppen.map(g => (
        <div key={g.key} style={{ paddingTop: 20 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, paddingBottom: 6 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.onSurface }}>{g.label}</h3>
            <span style={{ fontSize: 13, color: C.onSecondaryFixedVar }}>{g.total} {g.total === 1 ? "Idee" : "Ideen"}</span>
          </div>
          {g.items.map(p => (
            <IdeeZeile
              key={p.path}
              project={p}
              markiert={inspectorPath === p.path || selected.has(p.path)}
              onOpen={e => onOpen(p, e)}
              onPreview={() => onPreview(p)}
              onAufraeumen={() => onAufraeumen(p)}
            />
          ))}
          {g.total > g.items.length && (
            <button
              onClick={() => onMore(g.key)}
              style={{
                marginTop: 2, minHeight: 36, padding: "0 12px 0 52px", border: "none", borderRadius: 8,
                background: "transparent", color: C.onSurfaceVariant, fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              Alle {g.total} aus {g.label} anzeigen
            </button>
          )}
        </div>
      ))}
    </section>
  );
}

function IdeeZeile({ project: p, markiert, onOpen, onPreview, onAufraeumen }: {
  project: StudioProject;
  markiert: boolean;
  onOpen: (e: React.MouseEvent) => void;
  onPreview: () => void;
  onAufraeumen: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const { nummer, titel } = ideeName(p);
  const canPreview = p.has_mp3 || p.has_wav;
  const notiz = p.notes?.split("\n").map(l => l.trim()).find(Boolean) ?? null;
  const keyBpm = [p.key, p.bpm != null ? `${p.bpm} BPM` : null].filter(Boolean).join(" · ");

  return (
    <div
      data-auswahl
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: "flex", alignItems: "center", gap: 4 }}
    >
      <button
        onClick={() => { if (canPreview) onPreview(); }}
        disabled={!canPreview}
        aria-label={canPreview ? "Export anhören" : "Noch kein Export"}
        title={canPreview ? "Export anhören" : "Kein Audio-Export im Ordner"}
        style={{
          flex: "0 0 36px", width: 36, height: 36, borderRadius: "50%", border: "none",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: canPreview ? alpha(C.mint, 0.10) : "transparent",
          color: canPreview ? C.mint : C.surfaceContainerHighest,
          cursor: canPreview ? "pointer" : "default",
        }}
      >
        <Play size={12} fill="currentColor" strokeWidth={1.5} style={{ marginLeft: 1 }} />
      </button>
      <button
        onClick={onOpen}
        title="Details, Notizen und Assets öffnen — mit Strg oder Shift auswählen"
        style={{
          flex: 1, minWidth: 0, minHeight: 44, display: "flex", alignItems: "center", gap: 12,
          padding: "0 12px", border: "none", borderRadius: 8, textAlign: "left", color: "inherit",
          cursor: "pointer", userSelect: "none",
          background: markiert ? alpha(C.primary, 0.08) : hovered ? "rgba(255,255,255,0.03)" : "transparent",
          boxShadow: markiert ? `inset 3px 0 0 ${C.primary}` : "none",
        }}
      >
        <span style={{ flex: "0 0 44px", fontFamily: "'JetBrains Mono', Consolas, monospace", fontSize: 12, color: C.onSecondaryFixedVar }}>
          {nummer ?? ""}
        </span>
        <span style={{ flex: "1 1 auto", minWidth: 0, display: "flex", alignItems: "baseline", gap: 10, overflow: "hidden" }}>
          <span style={{
            fontSize: 14, whiteSpace: "nowrap", flexShrink: 0, maxWidth: "60%", overflow: "hidden", textOverflow: "ellipsis",
            fontWeight: titel ? 700 : 500, color: titel ? C.onSurface : C.onSecondaryFixedVar,
          }}>
            {titel ?? "ohne Titel"}
          </span>
          {/* Notiz nur ohne Titel — mit Titel erkennt man das Projekt schon (Scheibe 7) */}
          {notiz && !titel && (
            <span title={p.notes ?? undefined} style={{ fontSize: 13, color: C.onSecondaryFixedVar, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {notiz}
            </span>
          )}
        </span>
        <span style={{ flex: "0 0 110px", fontSize: 13, color: C.onSurfaceVariant, textAlign: "right", whiteSpace: "nowrap" }}>
          {keyBpm}
        </span>
        <span title={p.modified_date ?? undefined} style={{ flex: "0 0 110px", fontSize: 13, color: C.onSecondaryFixedVar, textAlign: "right", whiteSpace: "nowrap" }}>
          {formatRelativeTime(p.modified_secs)}
        </span>
      </button>
      {/* Nur beim Drüberfahren — Platz bleibt, damit die Zeile nicht springt */}
      <span style={{ flex: "0 0 auto", opacity: hovered ? 1 : 0, transition: "opacity 0.15s" }}>
        <Button variant="ghost" size="sm" icon={Hourglass} onClick={onAufraeumen} tabIndex={hovered ? 0 : -1}
          title="Ins Aufräumen schieben — dort entscheiden, ob es bleibt oder weg kann">
          Ins Aufräumen
        </Button>
      </span>
    </div>
  );
}
