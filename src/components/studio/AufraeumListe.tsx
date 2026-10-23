// src/components/studio/AufraeumListe.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Aufräumen: ein Satz oben, nach Jahr gruppiert, pro Zeile „Behalten" und
// „Kann weg". Behalten nimmt die Idee aus der Liste (sie bleibt eine Idee),
// Kann weg merkt sie für den Papierkorb vor — gelöscht wird erst gesammelt
// über die Leiste unten.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { Disc3, Play } from "lucide-react";
import { C, alpha } from "../../lib/theme";
import { formatRelativeTime } from "../../lib/time";
import { arbeitszeit, ideeName } from "../../lib/werkbank";
import { Button, Segmented } from "../ui";
import type { GezeigteGruppe } from "./IdeenListe";
import type { StudioProject } from "../../types/studio";

export type AufraeumFilter = "alle" | "discard";
/** Nach Datum (Gruppen: Jahr) oder nach Arbeitszeit (Gruppen: Zeitspanne) */
export type AufraeumSort = "neu" | "alt" | "kurz" | "lang";

interface AufraeumListeProps {
  /** Lange inaktive Ideen, die noch nicht entschieden sind */
  inaktiv: number;
  vorgemerkt: number;
  filter: AufraeumFilter;
  onFilter: (f: AufraeumFilter) => void;
  sort: AufraeumSort;
  onSort: (s: AufraeumSort) => void;
  gruppen: GezeigteGruppe[];
  onMore: (key: string) => void;
  inspectorPath: string | null;
  selected: Set<string>;
  onOpen: (p: StudioProject, e: React.MouseEvent) => void;
  onPreview: (p: StudioProject) => void;
  /** Ohne Export: Projekt zum Reinhören direkt in FL öffnen */
  onOpenDaw: (p: StudioProject) => void;
  onKeep: (p: StudioProject) => void;
  onToss: (p: StudioProject) => void;
  /** Vorschlag: alte, kurz angefasste Ideen ohne Export (noch nicht vorgemerkt) */
  skizzen: StudioProject[];
  skizzenGrenze: number;
  onSkizzenGrenze: (min: number) => void;
  onSkizzenVormerken: () => void;
  /** Lücken schließen, Zusammenführen — rechts neben dem Umschalter */
  children?: React.ReactNode;
}

export function AufraeumListe({
  inaktiv, vorgemerkt, filter, onFilter, sort, onSort, gruppen, onMore,
  inspectorPath, selected, onOpen, onPreview, onOpenDaw, onKeep, onToss,
  skizzen, skizzenGrenze, onSkizzenGrenze, onSkizzenVormerken, children,
}: AufraeumListeProps) {
  return (
    <section aria-label="Aufräumen" style={{ padding: "20px 16px 0" }}>
      {/* Die offensichtlichen Fälle auf einen Schlag — als schlichte Zeile, nur
          wenn es welche gibt. Gelöscht wird erst über die Leiste unten. */}
      {filter === "alle" && skizzen.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <span title="Ideen mit Notiz bleiben draußen. Vorgemerkt heißt noch nicht gelöscht."
            style={{ fontSize: 13, color: C.onSurfaceVariant }}>
            {`${skizzen.length} ${skizzen.length === 1 ? "Skizze" : "Skizzen"}: unter ${skizzenGrenze} min in FL, älter als ein Jahr, nie exportiert`}
          </span>
          <Segmented
            label="Grenze für Skizzen"
            value={String(skizzenGrenze)}
            onChange={v => onSkizzenGrenze(Number(v))}
            options={[
              { value: "15", label: "15 min" },
              { value: "20", label: "20 min" },
              { value: "30", label: "30 min" },
            ]}
          />
          <Button size="sm" variant="ghost" onClick={onSkizzenVormerken}>
            {`Alle ${skizzen.length} vormerken`}
          </Button>
        </div>
      )}

      <div style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        paddingBottom: 12, borderBottom: `1px solid ${C.border20}`,
      }}>
        <Segmented
          label="Was zeigen"
          value={filter}
          onChange={onFilter}
          options={[
            { value: "alle", label: `Lange inaktiv · ${inaktiv + vorgemerkt}` },
            { value: "discard", label: `Kann weg · ${vorgemerkt}` },
          ]}
        />
        <Segmented
          label="Sortierung"
          value={sort}
          onChange={onSort}
          options={[
            { value: "neu", label: "Neueste" },
            { value: "alt", label: "Älteste" },
            { value: "kurz", label: "Kürzeste" },
            { value: "lang", label: "Längste" },
          ]}
        />
        <div style={{ flex: 1 }} />
        {children}
      </div>

      {gruppen.map(g => (
        <div key={g.key} style={{ paddingTop: 20 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, paddingBottom: 6 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.onSurface }}>{g.label}</h3>
            <span style={{ fontSize: 13, color: C.onSecondaryFixedVar }}>{g.total} {g.total === 1 ? "Projekt" : "Projekte"}</span>
          </div>
          {g.items.map(p => (
            <AufraeumZeile
              key={p.path}
              project={p}
              markiert={inspectorPath === p.path || selected.has(p.path)}
              onOpen={e => onOpen(p, e)}
              onPreview={() => onPreview(p)}
              onOpenDaw={() => onOpenDaw(p)}
              onKeep={() => onKeep(p)}
              onToss={() => onToss(p)}
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
              Alle {g.total} anzeigen
            </button>
          )}
        </div>
      ))}
    </section>
  );
}

function AufraeumZeile({ project: p, markiert, onOpen, onPreview, onOpenDaw, onKeep, onToss }: {
  project: StudioProject;
  markiert: boolean;
  onOpen: (e: React.MouseEvent) => void;
  onPreview: () => void;
  onOpenDaw: () => void;
  onKeep: () => void;
  onToss: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const { nummer, titel } = ideeName(p);
  const canPreview = p.has_mp3 || p.has_wav;
  // Ohne Export hört man in FL rein — der Knopf öffnet dann die neueste FLP
  const canDaw = !canPreview && !!p.newest_flp;
  const kannWas = canPreview || canDaw;
  const weg = p.status === "discard";
  const notiz = p.notes?.split("\n").map(l => l.trim()).find(Boolean) ?? null;
  const kopf = titel ?? notiz ?? "ohne Titel";
  const neben = [
    p.flp_count > 1 ? `${p.flp_count} Versionen` : null,
    p.key, p.bpm != null ? `${p.bpm} BPM` : null,
    canPreview ? null : "kein Export",
  ].filter(Boolean).join(" · ");

  return (
    <div
      data-auswahl
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: "flex", alignItems: "center", gap: 4, opacity: weg ? 0.7 : 1 }}
    >
      <button
        onClick={() => { if (canPreview) onPreview(); else if (canDaw) onOpenDaw(); }}
        disabled={!kannWas}
        aria-label={canPreview ? "Export anhören" : canDaw ? "In FL öffnen" : "Keine FLP im Ordner"}
        title={canPreview ? "Export anhören" : canDaw ? "Kein Export — in FL öffnen und reinhören" : "Weder Export noch FLP im Ordner"}
        style={{
          flex: "0 0 36px", width: 36, height: 36, borderRadius: "50%", border: "none",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: canPreview ? alpha(C.mint, 0.10) : canDaw ? alpha(C.primary, 0.10) : "transparent",
          color: canPreview ? C.mint : canDaw ? C.primary : C.surfaceContainerHighest,
          cursor: kannWas ? "pointer" : "default",
        }}
      >
        {canDaw
          ? <Disc3 size={14} strokeWidth={1.75} />
          : <Play size={12} fill="currentColor" strokeWidth={1.5} style={{ marginLeft: 1 }} />}
      </button>
      <button
        onClick={onOpen}
        title="Details, Notizen und Assets öffnen — mit Strg oder Shift auswählen"
        style={{
          flex: 1, minWidth: 0, minHeight: 48, display: "flex", alignItems: "center", gap: 12,
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
          <span title={notiz && !titel ? p.notes ?? undefined : undefined} style={{
            fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0, maxWidth: "60%",
            fontWeight: titel ? 700 : 600, color: titel ? C.onSurface : C.onSurfaceVariant,
            textDecoration: weg ? "line-through" : "none", textDecorationColor: alpha(C.error, 0.6),
          }}>
            {kopf}
          </span>
          <span style={{ fontSize: 13, color: C.onSecondaryFixedVar, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{neben}</span>
        </span>
        {/* Eigene Spalte, rechtsbündig — so liest man sie untereinander */}
        <span title="Arbeitszeit in FL Studio" style={{
          flex: "0 0 96px", textAlign: "right", whiteSpace: "nowrap", fontSize: 13, fontWeight: 600,
          fontVariantNumeric: "tabular-nums", color: p.work_minutes != null ? C.onSurface : C.onSecondaryFixedVar,
        }}>
          {p.work_minutes != null ? arbeitszeit(p.work_minutes) : "–"}
        </span>
        <span title={p.modified_date ?? undefined} style={{ flex: "0 0 150px", textAlign: "right", fontSize: 13, color: C.onSecondaryFixedVar, whiteSpace: "nowrap" }}>
          zuletzt {formatRelativeTime(p.modified_secs)}
        </span>
      </button>
      <div style={{ display: "flex", gap: 6, flex: "0 0 auto", paddingLeft: 8 }}>
        <Pille onClick={onKeep} farbe={C.mint} an={false} title="Bleibt eine Idee, steht aber nicht mehr im Aufräumen">
          Behalten
        </Pille>
        <Pille onClick={onToss} farbe={C.error} an={weg} title={weg ? "Doch nicht löschen" : "Zum Löschen vormerken"}>
          Kann weg
        </Pille>
      </div>
    </div>
  );
}

function Pille({ an, farbe, onClick, title, children }: {
  an: boolean;
  farbe: string;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={an}
      title={title}
      style={{
        minHeight: 34, padding: "0 12px", borderRadius: 999, cursor: "pointer",
        fontSize: 12, fontWeight: 600,
        border: `1px solid ${an ? farbe : C.border20}`,
        background: an ? alpha(farbe, 0.12) : "transparent",
        color: an ? farbe : C.onSurfaceVariant,
      }}
    >
      {children}
    </button>
  );
}
