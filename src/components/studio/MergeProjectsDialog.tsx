// src/components/studio/MergeProjectsDialog.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Alle Projektordner aus allen Produktions-Ordnern in einen einzigen
// zusammenführen und nach Alter neu durchnummerieren (ältester = 0001).
//
// Vier Schritte, und erst der letzte fasst etwas an:
//   Vorschau   → jede Zeile alt → neu, dazu was liegen bleibt
//   Abgleich   → welche Ordner sind schon archiviert, welche tragen noch Arbeit
//   Ausführen  → gesperrt, bis der Abgleich gelaufen ist
//   Bericht    → wo die Protokolle liegen, plus Rückgängig
//
// Vergangene Läufe stehen unten in der Liste — der Weg zurück überlebt das
// Schließen des Dialogs und den Neustart der App.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo } from "react";
import { FolderInput, AlertTriangle, Undo2, CheckCircle2, ScanSearch, FileDown, Loader2, Archive } from "lucide-react";
import { C } from "../../lib/theme";
import { api } from "../../lib/api";
import { Modal, Button } from "../ui";
import {
  buildMergeRows, buildPreviewCsv, countByClass,
  MERGE_CLASSES, MERGE_CLASS_ORDER,
  type MergeClassKey, type MergeRow,
} from "./mergeClasses";
import type { MergePlan, MergeReport, MergeRun, ParkReport, ProjectArchiveStatus } from "../../types/studio";

interface MergeProjectsDialogProps {
  /** Alle konfigurierten Produktions-Ordner */
  roots: string[];
  /** Archiv-Wurzel für den Abgleich */
  archivePath: string;
  onClose: () => void;
  /** Nach Ausführen oder Rückgängig: Liste neu einlesen */
  onDone: () => void;
}

export function MergeProjectsDialog({ roots, archivePath, onClose, onDone }: MergeProjectsDialogProps) {
  const [target, setTarget] = useState(roots[0] ?? "");
  const [plan, setPlan] = useState<MergePlan | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<MergeReport | null>(null);

  // Archiv-Abgleich: teuer, deshalb ausdrücklich angestoßen — und Pflicht,
  // bevor irgendetwas ausgeführt werden darf.
  const [archive, setArchive] = useState<ProjectArchiveStatus[] | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [exportedTo, setExportedTo] = useState<string | null>(null);
  const [parked, setParked] = useState<ParkReport | null>(null);

  // Der Parkordner liegt neben den Produktions-Ordnern, nicht darin: sonst
  // erschiene er beim nächsten Scan als ein Projekt mit hunderten FLPs.
  const parkDir = useMemo(() => {
    const erster = roots[0] ?? "";
    const trenner = erster.includes("\\") ? "\\" : "/";
    const eltern = erster.slice(0, erster.lastIndexOf(trenner));
    return `${eltern}${trenner}_ARCHIVIERT`;
  }, [roots]);

  // Vergangene Läufe aus den Protokolldateien. Ohne sie wäre der Weg zurück
  // weg, sobald dieser Dialog zugeht.
  const [runs, setRuns] = useState<MergeRun[]>([]);
  const loadRuns = () => { api.studio.listMergeRuns().then(setRuns).catch(() => setRuns([])); };
  useEffect(loadRuns, []);

  // Vorschau bei jedem Zielwechsel neu rechnen — sie ändert nichts auf der Platte
  useEffect(() => {
    if (!target) return;
    setPlan(null);
    setArchive(null);
    setExportedTo(null);
    setError(null);
    setIsBusy(true);
    api.studio.planMerge(roots, target, [])
      .then(setPlan)
      .catch(e => setError(String(e)))
      .finally(() => setIsBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, roots.join("\n")]);

  const moves = plan?.steps.filter(s => s.from !== s.to) ?? [];
  const renames = plan?.steps.filter(s => s.from === s.to) ?? [];

  const rows = useMemo(
    () => (plan ? buildMergeRows(plan, archive ?? []) : []),
    [plan, archive],
  );
  const counts = useMemo(() => countByClass(rows), [rows]);

  const runArchiveCheck = async () => {
    if (!archivePath.trim()) {
      setError("Kein Archiv-Pfad in den Einstellungen gesetzt — ohne ihn kann nicht abgeglichen werden.");
      return;
    }
    setIsChecking(true);
    setError(null);
    try {
      const status = await api.studio.matchArchive(roots, archivePath, true);
      setArchive(status);

      // Nachweislich vollständig archivierte Ordner aus dem Lauf nehmen: sie
      // brauchen keine Nummer und sollen keine verbrauchen. Unsichere
      // Zuordnungen bleiben drin — im Zweifel mitziehen statt liegenlassen.
      const raus = status
        .filter(s => s.archive_folder && s.missing_important === 0 && s.matched_by !== "ambiguous")
        .map(s => s.project_path);

      // Neu planen, sonst hätte die Nummerierung Lücken an den Stellen der
      // ausgenommenen Ordner.
      if (raus.length > 0) {
        setPlan(await api.studio.planMerge(roots, target, raus));
      }
    } catch (e) {
      setError(`Archiv-Abgleich fehlgeschlagen: ${String(e)}`);
    } finally {
      setIsChecking(false);
    }
  };

  /** Die nachweislich fertigen Beats aus der Produktion nehmen. */
  const parkArchived = async () => {
    const kandidaten = (archive ?? [])
      .filter(s => s.archive_folder && s.missing_important === 0 && s.matched_by !== "ambiguous")
      .map(s => s.project_path);
    if (kandidaten.length === 0) return;

    const ok = window.confirm(
      `${kandidaten.length} vollständig archivierte Projekte nach\n${parkDir}\nverschieben?\n\n` +
      `Sie sind Byte für Byte mit dem Archiv verglichen — dort fehlt keine einzige\n` +
      `Datei. Gelöscht wird nichts: es ist ein Umzug, mit Protokoll und Rückgängig.\n\n` +
      `Danach sind sie aus der Studio-Liste raus und liegen an einem Ort beisammen.`
    );
    if (!ok) return;

    setIsBusy(true);
    setError(null);
    try {
      const r = await api.studio.parkArchived(kandidaten, archivePath, parkDir);
      setParked(r);
      loadRuns();
      onDone();
      // Nach dem Umzug stimmt weder Plan noch Abgleich noch — beides neu holen
      setArchive(null);
      setPlan(await api.studio.planMerge(roots, target, []));
    } catch (e) {
      setError(`Parken fehlgeschlagen: ${String(e)}`);
    } finally {
      setIsBusy(false);
    }
  };

  const exportPreview = async () => {
    if (!plan) return;
    try {
      setExportedTo(await api.studio.exportPreview(buildPreviewCsv(rows, plan)));
    } catch (e) {
      setError(`Bericht nicht schreibbar: ${String(e)}`);
    }
  };

  const run = async () => {
    if (!plan) return;
    const heikel = counts.archived_incomplete;
    const ok = window.confirm(
      `${plan.steps.length} Projekte werden neu nummeriert, davon ${moves.length} nach\n${target} verschoben.\n\n` +
      (counts.archived_complete > 0
        ? `${counts.archived_complete} vollständig archivierte Ordner bleiben liegen und\n` +
          `verbrauchen keine Nummer.\n\n`
        : "") +
      (heikel > 0
        ? `ACHTUNG: ${heikel} davon sind bereits archiviert und tragen trotzdem noch\n` +
          `Arbeitsdateien, die es im Archiv nicht gibt. Sie ziehen mit um — es geht\n` +
          `nichts verloren —, aber sieh sie dir hinterher an.\n\n`
        : "") +
      `FL Studio sollte dabei geschlossen sein.\n` +
      `Bei vielen Ordnern lohnt es sich, die OneDrive-Synchronisierung zu pausieren.\n\n` +
      `Ein Protokoll wird geschrieben — der Vorgang lässt sich danach rückgängig machen.`
    );
    if (!ok) return;
    setIsBusy(true);
    setError(null);
    try {
      setReport(await api.studio.applyMerge(plan.steps));
      onDone();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsBusy(false);
    }
  };

  /** Einen Lauf zurückdrehen — den gerade gemachten oder einen aus der Liste. */
  const undoLog = async (logPath: string, frage: string) => {
    if (!window.confirm(frage)) return;
    setIsBusy(true);
    setError(null);
    try {
      setReport(await api.studio.undoMerge(logPath));
      loadRuns();
      onDone();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsBusy(false);
    }
  };

  const undo = () => {
    if (!report?.log_path) return;
    undoLog(report.log_path, "Alle Ordner wieder auf ihre alten Namen und Pfade zurücksetzen?");
  };

  return (
    <Modal
      title="Produktions-Ordner zusammenführen"
      subtitle="Alle Project_-Ordner in einen Ordner, neu nummeriert nach Alter"
      icon={FolderInput}
      onClose={onClose}
      width={720}
      closeOnBackdrop={!isBusy}
      footer={
        report ? (
          <>
            {report.log_path && (
              <Button variant="secondary" icon={Undo2} onClick={undo} loading={isBusy}>
                Rückgängig
              </Button>
            )}
            <Button variant="primary" onClick={onClose}>Fertig</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={isBusy}>Abbrechen</Button>
            <Button
              variant="secondary"
              icon={FileDown}
              onClick={exportPreview}
              disabled={!plan || plan.steps.length === 0}
              title="Den Trockenlauf als CSV in die Bibliothek schreiben"
            >
              Bericht speichern
            </Button>
            {/* Ausführen erst nach dem Abgleich: ohne ihn ist unbekannt, welche
                Ordner schon archiviert sind und welche noch Arbeit tragen. */}
            <Button
              variant="primary"
              icon={FolderInput}
              onClick={run}
              loading={isBusy}
              disabled={!plan || plan.steps.length === 0 || !archive}
              title={archive ? undefined : "Erst den Archiv-Abgleich laufen lassen"}
            >
              {moves.length} verschieben, {plan?.steps.length ?? 0} umbenennen
            </Button>
          </>
        )
      }
    >
      {error && <Note tone="error">{error}</Note>}

      {/* Doppelt vergebene Nummern: der Lauf löst sie auf — aber vorher soll
          sichtbar sein, wie groß das Problem im Bestand tatsächlich ist. */}
      {plan && plan.duplicates.length > 0 && (
        <Note tone="warn">
          <strong>{plan.duplicates.length} Nummern sind mehrfach vergeben</strong> —{" "}
          {plan.duplicates.slice(0, 8).map(d => d.number).join(", ")}
          {plan.duplicates.length > 8 && " …"}. Verschiedene Beats tragen dieselbe ID.
          Das Umnummerieren nach Alter löst genau das auf.
        </Note>
      )}

      {report ? (
        <Report report={report} />
      ) : (
        <>
          <div>
            <Label>Zielordner</Label>
            <select
              value={target}
              onChange={e => setTarget(e.target.value)}
              disabled={isBusy}
              style={{
                width: "100%", padding: "9px 12px", marginTop: 6,
                fontSize: 12, fontFamily: "inherit",
                background: C.surfaceContainerLowest,
                border: `1px solid ${C.border20}`,
                borderRadius: 7, color: C.onSurface, outline: "none",
              }}
            >
              {roots.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {isBusy && !plan && <Note>Vorschau wird berechnet …</Note>}

          {plan && (
            <>
              <Note tone="warn">
                <b>{plan.steps.length} Projekte</b> werden neu nummeriert — der älteste wird
                Project_0001. Davon wandern <b>{moves.length}</b> in den Zielordner,
                {" "}{renames.length} liegen schon dort. Es wird nichts überschrieben:
                ein belegter Name lässt den Schritt scheitern statt Daten zu verlieren.
                FL Studio vorher schließen.
              </Note>

              {/* Der Abgleich ist die Bedingung fürs Ausführen — deshalb steht
                  er als eigener Schritt hier und nicht versteckt. */}
              {!archive ? (
                <div style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 14px", borderRadius: 8,
                  background: C.surfaceContainerLowest,
                  border: `1px dashed ${C.border30}`,
                }}>
                  <div style={{ flex: 1, fontSize: 12, lineHeight: 1.6, color: C.onSurfaceVariant }}>
                    <strong style={{ color: C.onSurface }}>Noch nicht mit dem Archiv abgeglichen.</strong>{" "}
                    Ohne ihn ist unbekannt, welche dieser Ordner längst fertige Beats sind
                    und welche davon noch Arbeit tragen, die im Archiv fehlt.
                    {isChecking
                      ? " Läuft — jede Datei wird gelesen, das dauert ein bis zwei Minuten."
                      : ` Der Vergleich liest jede Datei: rund ${Math.max(1, Math.round((plan?.steps.length ?? 0) / 650))} Minute${(plan?.steps.length ?? 0) > 975 ? "n" : ""}.`}
                  </div>
                  <Button
                    variant="secondary"
                    icon={isChecking ? Loader2 : ScanSearch}
                    onClick={runArchiveCheck}
                    loading={isChecking}
                  >
                    Abgleichen
                  </Button>
                </div>
              ) : (
                <>
                  <ClassSummary counts={counts} />
                  {counts.archived_complete > 0 && (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "12px 14px", borderRadius: 8,
                      background: `${C.mint}0e`,
                      border: `1px solid ${C.mint}33`,
                    }}>
                      <div style={{ flex: 1, fontSize: 12, lineHeight: 1.6, color: C.onSurfaceVariant }}>
                        <strong style={{ color: C.onSurface }}>
                          {counts.archived_complete} fertige Beats liegen noch in der Produktion.
                        </strong>{" "}
                        Byte für Byte mit dem Archiv verglichen — dort fehlt nichts. Verschieben
                        nach <code style={{ fontSize: 11 }}>_ARCHIVIERT</code> holt sie aus der
                        Studio-Liste und legt sie an einen Ort. Umzug, kein Löschen.
                      </div>
                      <Button
                        variant="secondary"
                        icon={Archive}
                        onClick={parkArchived}
                        loading={isBusy}
                      >
                        Parken
                      </Button>
                    </div>
                  )}
                </>
              )}

              {parked && (
                <Note tone={parked.failed.length ? "warn" : "ok"}>
                  <b>{parked.moved} Projekte</b> nach <code>{parked.park_dir}</code> verschoben.
                  {parked.skipped.length > 0 && (
                    <> {parked.skipped.length} blieben liegen, weil die erneute Prüfung sie
                    nicht bestätigt hat.</>
                  )}
                  {parked.failed.length > 0 && <> {parked.failed.length} Schritte kamen nicht durch.</>}
                  {parked.log_path && <><br />Protokoll: <code>{parked.log_path}</code> — rückgängig über die Läufe-Liste unten.</>}
                </Note>
              )}

              {rows.length > 0 && <ClassTable rows={rows} checked={!!archive} />}

              {exportedTo && (
                <Note tone="ok">
                  Bericht geschrieben: <code>{exportedTo}</code>
                </Note>
              )}

              {runs.length > 0 && (
                <PastRuns runs={runs} busy={isBusy} onUndo={undoLog} />
              )}
            </>
          )}
        </>
      )}
    </Modal>
  );
}

/**
 * Was früher schon zusammengeführt wurde, mit dem Weg zurück.
 *
 * Der Knopf hing vorher am offenen Dialog: zu, App zu — und das Rückgängig war
 * nur noch von Hand über die JSON-Datei zu finden. Hier steht es auch morgen
 * noch, gelesen aus den Protokollen auf der Platte.
 */
function PastRuns({ runs, busy, onUndo }: {
  runs: MergeRun[];
  busy: boolean;
  onUndo: (logPath: string, frage: string) => void;
}) {
  return (
    <details>
      <summary style={{ cursor: "pointer", fontSize: 12, color: C.onSurfaceVariant }}>
        {runs.length} frühere{runs.length === 1 ? "r Lauf" : " Läufe"} — mit Rückgängig
      </summary>
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
        {runs.map(r => {
          const zurueckdrehbar = r.present > 0;
          return (
            <div
              key={r.log_path}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 12px", borderRadius: 8,
                background: C.surfaceContainerLowest,
                border: `1px solid ${C.border15}`,
                opacity: zurueckdrehbar ? 1 : 0.6,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: C.onSurface }}>
                  {r.date} · {r.steps} Projekte
                  {zurueckdrehbar
                    ? r.present < r.steps && (
                        <span style={{ color: C.primary }}>
                          {" "}· nur noch {r.present} am Zielort
                        </span>
                      )
                    : <span style={{ color: C.onSecondaryFixedVar }}> · schon zurückgedreht</span>}
                </div>
                <div
                  title={r.log_path}
                  style={{
                    fontSize: 10, color: C.onSecondaryFixedVar, fontFamily: "monospace",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                >
                  {r.target}
                </div>
              </div>
              <Button
                variant="secondary"
                icon={Undo2}
                disabled={busy || !zurueckdrehbar}
                onClick={() => onUndo(
                  r.log_path,
                  `Lauf vom ${r.date} zurückdrehen?\n\n` +
                  `${r.present} von ${r.steps} Ordnern liegen noch am Zielort und wandern ` +
                  `auf ihre alten Namen und Pfade zurück.\n\n` +
                  `FL Studio sollte dabei geschlossen sein.`
                )}
                title={zurueckdrehbar ? undefined : "Am Zielort liegt nichts mehr aus diesem Lauf"}
              >
                Rückgängig
              </Button>
            </div>
          );
        })}
      </div>
    </details>
  );
}

/** Farbe pro Klasse — dieselbe Skala wie im Studio: Amber warnt, Mint ist gut. */
const CLASS_COLOR: Record<MergeClassKey, string> = {
  archived_incomplete: C.primary,
  archived_complete: C.mint,
  live: C.tertiary,
  no_number: C.onSecondaryFixedVar,
  no_flp: C.onSecondaryFixedVar,
};

function ClassSummary({ counts }: { counts: Record<MergeClassKey, number> }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {MERGE_CLASS_ORDER.filter(k => counts[k] > 0).map(k => (
        <div
          key={k}
          style={{
            display: "flex", alignItems: "baseline", gap: 10,
            padding: "9px 12px", borderRadius: 8,
            background: `${CLASS_COLOR[k]}0e`,
            border: `1px solid ${CLASS_COLOR[k]}33`,
          }}
        >
          <span style={{
            fontFamily: "monospace", fontSize: 14, fontWeight: 700,
            color: CLASS_COLOR[k], minWidth: 34, textAlign: "right",
          }}>
            {counts[k]}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.onSurface }}>
              {MERGE_CLASSES[k].label}
            </div>
            <div style={{ fontSize: 11, color: C.onSecondaryFixedVar, lineHeight: 1.5 }}>
              {MERGE_CLASSES[k].action}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ClassTable({ rows, checked }: { rows: MergeRow[]; checked: boolean }) {
  // Nach Klasse gruppiert, das Heikelste zuerst
  const ordered = MERGE_CLASS_ORDER.flatMap(k => rows.filter(r => r.klass === k));
  return (
    <div style={{
      maxHeight: 300, overflowY: "auto",
      border: `1px solid ${C.border15}`, borderRadius: 8,
    }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr>
            {["Ordner", "Wird zu", checked ? "Im Archiv" : "Älteste FLP"].map(h => (
              <th key={h} style={{
                position: "sticky", top: 0,
                textAlign: "left", padding: "7px 10px",
                background: C.surfaceContainerHigh,
                borderBottom: `1px solid ${C.border15}`,
                fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
                textTransform: "uppercase", color: C.onSecondaryFixedVar,
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordered.map(r => (
            <tr key={r.path}>
              <td style={cell} title={r.path}>
                <span style={{
                  display: "inline-block", width: 6, height: 6, borderRadius: "50%",
                  background: CLASS_COLOR[r.klass], marginRight: 7,
                }} />
                <span style={{ fontFamily: "monospace" }}>{r.name}</span>
              </td>
              <td style={{
                ...cell,
                fontFamily: "monospace",
                color: r.newName ? C.primary : C.onSecondaryFixedVar,
              }}>
                {r.newName ?? "— bleibt liegen"}
              </td>
              <td style={{ ...cell, color: C.onSecondaryFixedVar }}>
                {!checked
                  ? (r.date ?? "—")
                  : r.missingImportant > 0
                    ? <span style={{ color: C.primary }}>
                        {r.archiveFolder} · {r.missingImportant} Datei(en) nur hier
                      </span>
                    : (r.archiveFolder ?? "—")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Report({ report }: { report: MergeReport }) {
  return (
    <>
      <Note tone={report.failed.length ? "warn" : "ok"}>
        <b>{report.moved} Projekte</b> umgezogen und umbenannt.
        {report.failed.length > 0 && ` ${report.failed.length} Schritte kamen nicht durch.`}
      </Note>

      {report.failed.length > 0 && (
        <div style={{ maxHeight: 180, overflowY: "auto", fontSize: 11, color: C.error, lineHeight: 1.6 }}>
          {report.failed.map((f, i) => <div key={i}>{f}</div>)}
        </div>
      )}

      {/* Wo die Aufzeichnungen liegen. Bewusst ausgeschrieben statt versteckt:
          wer in einem Jahr sucht, sucht genau danach. */}
      <div style={{ fontSize: 11, color: C.onSecondaryFixedVar, lineHeight: 1.8 }}>
        {report.db_backup && <div>DB-Sicherung: <code>{report.db_backup}</code></div>}
        {report.log_path ? (
          <>
            <div>Protokoll: <code>{report.log_path}</code></div>
            {report.log_copies.map(p => (
              <div key={p}>Kopie: <code>{p}</code></div>
            ))}
          </>
        ) : (
          <div>Kein Protokoll geschrieben — es wurde nichts verschoben.</div>
        )}
        {report.summary_path && (
          <div>Lesbare Liste im Zielordner: <code>{report.summary_path}</code></div>
        )}
      </div>

      {report.moved > 0 && report.log_copies.length === 0 && (
        <Note tone="warn">
          Das Protokoll liegt nur an <b>einem</b> Ort. Sichere es, bevor du
          weiterarbeitest — es ist die einzige Aufzeichnung, welcher Ordner
          wohin wurde.
        </Note>
      )}
    </>
  );
}

const cell: React.CSSProperties = {
  padding: "6px 10px",
  borderBottom: `1px solid ${C.border10}`,
  color: C.onSurface,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: 240,
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
      textTransform: "uppercase", color: C.onSecondaryFixedVar,
    }}>
      {children}
    </span>
  );
}

function Note({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" | "error" | "ok" }) {
  const color = tone === "error" ? C.error : tone === "warn" ? C.primary : tone === "ok" ? C.mint : C.onSurfaceVariant;
  const Icon = tone === "ok" ? CheckCircle2 : AlertTriangle;
  return (
    <div style={{
      display: "flex", gap: 10,
      padding: "11px 13px", borderRadius: 8,
      background: `${color}12`,
      border: `1px solid ${color}33`,
      fontSize: 12, lineHeight: 1.6, color: C.onSurface,
    }}>
      {tone !== "info" && <Icon size={14} color={color} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 2 }} />}
      <div>{children}</div>
    </div>
  );
}
