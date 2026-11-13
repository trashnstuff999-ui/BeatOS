// src/components/studio/AufraeumListe.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Aufräumen: eine Leiste oben, nach Jahr gruppiert, pro Zeile „Zurück zu Projekte" und
// „Kann weg". Zurück nimmt die Idee aus der Liste (sie bleibt eine Idee),
// Kann weg merkt sie für den Papierkorb vor — gelöscht wird erst gesammelt
// über die Leiste unten.
// ═══════════════════════════════════════════════════════════════════════════════

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
  /** Zuletzt in FL geöffnet, wird wie eine Auswahl markiert */
  inFlPath: string | null;
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
}

export function AufraeumListe({
  inaktiv, vorgemerkt, filter, onFilter, sort, onSort, gruppen, onMore,
  inspectorPath, inFlPath, selected, onOpen, onPreview, onOpenDaw, onKeep, onToss,
  skizzen, skizzenGrenze, onSkizzenGrenze, onSkizzenVormerken,
}: AufraeumListeProps) {
  return (
    <section aria-label="Aufräumen" style={{ margin: "0 16px", padding: 24, borderRadius: 22, border: `1px solid ${C.border30}`, background: C.surfaceContainerLow, marginTop: 12, maxWidth: 1100 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        paddingBottom: 14, borderBottom: `1px solid ${C.border20}`,
      }}>
        <Segmented
          label="Was zeigen"
          value={filter}
          onChange={onFilter}
          options={[
            { value: "alle", label: `Lange inaktiv · ${inaktiv + vorgemerkt}` },
            { value: "discard", label: `Verwerfen · ${vorgemerkt}` },
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
        {/* Skizzen: älter als ein Jahr, kein Export, keine Notiz, kurze Arbeitszeit */}
        {filter === "alle" && (<>
          <span style={{ fontSize: 13, color: C.onSurfaceVariant }}>Arbeitszeit unter</span>
          <Segmented
            label="Arbeitszeit unter"
            value={String(skizzenGrenze)}
            onChange={v => onSkizzenGrenze(Number(v))}
            options={[
              { value: "15", label: "15 min" },
              { value: "20", label: "20 min" },
              { value: "30", label: "30 min" },
            ]}
          />
          <Button size="sm" variant="ghost" onClick={onSkizzenVormerken} disabled={skizzen.length === 0}
            title="Älter als ein Jahr, ohne Export und Notiz">
            {`${skizzen.length} vormerken`}
          </Button>
        </>)}
      </div>

      {gruppen.map(g => (
        <div key={g.key} style={{ paddingTop: 22 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, paddingBottom: 8 }}>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.onSurface }}>{g.label}</h3>
            <span style={{ fontSize: 13, color: C.onSecondaryFixedVar }}>{g.total} {g.total === 1 ? "Projekt" : "Projekte"}</span>
          </div>
          {g.items.map((p, i) => (
            <AufraeumZeile
              key={p.path}
              index={i}
              project={p}
              markiert={inspectorPath === p.path || inFlPath === p.path || selected.has(p.path)}
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
              className="sw-mehr"
              style={{
                "--c": C.primary,
                margin: "8px 0 0 52px", padding: "8px 18px", border: `1px solid ${C.border30}`, borderRadius: 999,
                background: "transparent", color: C.onSurfaceVariant, fontSize: 13, fontWeight: 700, cursor: "pointer",
              } as React.CSSProperties}
            >
              Alle {g.total} anzeigen
            </button>
          )}
        </div>
      ))}
    </section>
  );
}

function AufraeumZeile({ index, project: p, markiert, onOpen, onPreview, onOpenDaw, onKeep, onToss }: {
  index: number;
  project: StudioProject;
  markiert: boolean;
  onOpen: (e: React.MouseEvent) => void;
  onPreview: () => void;
  onOpenDaw: () => void;
  onKeep: () => void;
  onToss: () => void;
}) {
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
  ].filter(Boolean).join(" · ");

  return (
    <div
      data-auswahl
      className="sw-zl"
      style={{ display: "flex", alignItems: "center", gap: 4, opacity: weg ? 0.7 : 1, "--i": Math.min(index, 20) } as React.CSSProperties}
    >
      <button
        className={canDaw ? "sw-zp sw-zp-fl" : "sw-zp"}
        onClick={() => { if (canPreview) onPreview(); else if (canDaw) onOpenDaw(); }}
        disabled={!kannWas}
        aria-label={canPreview ? "Export anhören" : canDaw ? "In FL öffnen" : "Keine FLP im Ordner"}
        title={canPreview ? "Anhören" : canDaw ? "In FL öffnen" : "Keine FLP"}
        style={{
          flex: "0 0 36px", width: 36, height: 36, borderRadius: "50%", border: "none",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: canPreview ? alpha(C.mint, 0.14) : canDaw ? alpha(C.primary, 0.14) : "transparent",
          color: canPreview ? C.mint : canDaw ? C.primary : C.surfaceContainerHighest,
          cursor: kannWas ? "pointer" : "default",
        }}
      >
        {canDaw
          ? <Disc3 size={14} strokeWidth={1.75} />
          : <Play size={12} fill="currentColor" strokeWidth={1.5} style={{ marginLeft: 1 }} />}
      </button>
      <button
        className="sw-zb"
        onClick={onOpen}
        title="Details · Strg/Shift: auswählen"
        style={{
          flex: 1, minWidth: 0, minHeight: 54, display: "flex", alignItems: "center", gap: 12,
          padding: "0 12px 0 16px", border: "none", borderRadius: 12, textAlign: "left", color: "inherit",
          cursor: "pointer", userSelect: "none",
          background: markiert ? alpha(C.primary, 0.10) : "transparent",
          boxShadow: markiert ? `inset 3px 0 0 ${C.primary}` : "none",
        }}
      >
        <span className="sw-nr" style={{ flex: "0 0 52px", fontFamily: "'JetBrains Mono', Consolas, monospace", fontSize: 13, color: C.onSecondaryFixedVar }}>
          {nummer ?? ""}
        </span>
        <span style={{ flex: "1 1 auto", minWidth: 0, display: "flex", alignItems: "baseline", gap: 10, overflow: "hidden" }}>
          <span title={notiz && !titel ? p.notes ?? undefined : undefined} style={{
            fontSize: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0, maxWidth: "60%",
            fontWeight: titel ? 700 : 600, color: titel ? C.onSurface : C.onSurfaceVariant,
            textDecoration: weg ? "line-through" : "none", textDecorationColor: alpha(C.error, 0.6),
          }}>
            {kopf}
          </span>
          <span style={{ fontSize: 13, color: C.onSecondaryFixedVar, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{neben}</span>
        </span>
        {/* Eigene Spalte, rechtsbündig — so liest man sie untereinander */}
        <span title="Arbeitszeit" style={{
          flex: "0 0 96px", textAlign: "right", whiteSpace: "nowrap", fontSize: 13, fontWeight: 600,
          fontVariantNumeric: "tabular-nums", color: p.work_minutes != null ? C.onSurface : C.onSecondaryFixedVar,
        }}>
          {p.work_minutes != null ? arbeitszeit(p.work_minutes) : "–"}
        </span>
        <span title={p.modified_date ?? undefined} style={{ flex: "0 0 120px", textAlign: "right", fontSize: 13, color: C.onSecondaryFixedVar, whiteSpace: "nowrap" }}>
          {formatRelativeTime(p.modified_secs)}
        </span>
      </button>
      <div style={{ display: "flex", gap: 6, flex: "0 0 auto", paddingLeft: 8 }}>
        <Pille onClick={onKeep} farbe={C.mint} an={false} title="Aus dem Aufräumen nehmen">
          Zurück zu Projekte
        </Pille>
        <Pille onClick={onToss} farbe={C.error} an={weg} title={weg ? "Nicht löschen" : "Zum Löschen vormerken"}>
          Verwerfen
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
      className="sw-pille"
      style={{
        "--c": farbe,
        minHeight: 34, padding: "0 12px", borderRadius: 999, cursor: "pointer",
        fontSize: 12, fontWeight: 600,
        border: `1px solid ${an ? farbe : C.border20}`,
        background: an ? alpha(farbe, 0.12) : "transparent",
        color: an ? farbe : C.onSurfaceVariant,
      } as React.CSSProperties}
    >
      {children}
    </button>
  );
}
