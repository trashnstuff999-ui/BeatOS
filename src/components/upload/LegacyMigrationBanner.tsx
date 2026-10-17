// src/components/upload/LegacyMigrationBanner.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Detects beats with the old 01_AUDIO/02_VISUALS/03_PROJECTS/04_UPLOAD layout
// and offers a one-click migration to the new flat structure:
//   • move contents of 01_AUDIO, 02_VISUALS, 04_UPLOAD into the root
//   • rename 03_PROJECTS → 01_SAVEFILES
//   • move all but the newest MP3/WAV out of the root into 02_OLD
// Nothing is overwritten — collisions abort the migration before any file moves.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { AlertCircle, ArrowRightLeft, Check, FolderOpen, Folder, File } from "lucide-react";
import { C, radius, alpha } from "../../lib/theme";
import { Modal, Button } from "../ui";
import { api } from "../../lib/api";
import type { LegacyStructure } from "../../types/upload";

interface LegacyMigrationBannerProps {
  beatId: string;
  /// Bumps when the beat data is refreshed elsewhere so we re-check too.
  refreshKey: number;
  onMigrated: () => void;
}

export function LegacyMigrationBanner({ beatId, refreshKey, onMigrated }: LegacyMigrationBannerProps) {
  const [plan, setPlan]         = useState<LegacyStructure | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [dialogOpen, setOpen]   = useState(false);
  const [isMigrating, setMig]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [success, setSuccess]   = useState<string | null>(null);

  // Re-check whenever beat changes or parent signals data update
  useEffect(() => {
    if (!beatId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.upload.checkLegacyStructure(beatId)
      .then(p => { if (!cancelled) setPlan(p); })
      .catch(e => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [beatId, refreshKey]);

  const handleMigrate = async () => {
    setMig(true);
    setError(null);
    try {
      const result = await api.upload.migrateLegacyBeatStructure(beatId);
      const parts: string[] = [];
      if (result.moved_files > 0)         parts.push(`${result.moved_files} Datei(en) verschoben`);
      if (result.renamed_savefiles)       parts.push("03_PROJECTS → 01_SAVEFILES");
      if (result.removed_subfolders.length) parts.push(`${result.removed_subfolders.join(", ")} entfernt`);
      if (result.moved_to_old > 0)          parts.push(`${result.moved_to_old} ältere MP3/WAV → 02_OLD`);
      setSuccess(parts.length > 0 ? parts.join(" · ") : "Nichts zu migrieren");
      setOpen(false);
      onMigrated();
      setTimeout(() => setSuccess(null), 4000);
    } catch (e) {
      setError(String(e));
    } finally {
      setMig(false);
    }
  };

  // Nothing to show: loading state silently, or beat already on new layout
  if (isLoading || !plan || !plan.is_legacy) {
    // Still show the success toast briefly even after the banner disappears
    if (success) {
      return <SuccessToast text={success} />;
    }
    return null;
  }

  const moveSummary = summarizePlan(plan);
  const blocked = plan.collisions.length > 0 || plan.savefiles_conflict;

  return (
    <>
      <div style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "12px 16px",
        background: blocked ? alpha(C.error, 0.08) : alpha(C.primary, 0.08),
        border: `1px solid ${blocked ? alpha(C.error, 0.30) : alpha(C.primary, 0.30)}`,
        borderRadius: radius.card,
      }}>
        <AlertCircle
          size={18}
          color={blocked ? C.error : C.primary}
          strokeWidth={1.75}
          style={{ flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: blocked ? C.error : C.primary, marginBottom: 2 }}>
            Alte Ordnerstruktur erkannt
          </div>
          <div style={{ fontSize: 12, color: C.onSurfaceVariant, lineHeight: 1.4 }}>
            {moveSummary}
          </div>
        </div>
        <button
          onClick={() => setOpen(true)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 14px",
            background: blocked ? C.surfaceContainerHigh : C.primary,
            border: blocked ? `1px solid ${C.border20}` : "none",
            borderRadius: radius.control,
            cursor: "pointer",
            fontSize: 12, fontWeight: 700,
            color: blocked ? C.onSurfaceVariant : C.onPrimary,
            letterSpacing: "0.08em", textTransform: "uppercase",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          <ArrowRightLeft size={12} strokeWidth={2} />
          {blocked ? "Prüfen" : "Migrieren"}
        </button>
      </div>

      {success && <SuccessToast text={success} />}
      {dialogOpen && (
        <MigrationDialog
          plan={plan}
          isMigrating={isMigrating}
          error={error}
          onCancel={() => { if (!isMigrating) { setOpen(false); setError(null); } }}
          onConfirm={handleMigrate}
        />
      )}
    </>
  );
}

// ─── Plan summary text ─────────────────────────────────────────────────────

function summarizePlan(p: LegacyStructure): string {
  const parts: string[] = [];
  if (p.planned_moves.length > 0) {
    const subdirs = new Set(p.planned_moves.map(m => m.from_subdir));
    const folderCount = p.planned_moves.filter(m => m.is_dir).length;
    const itemWord = p.planned_moves.length === 1 ? "Eintrag" : "Einträge";
    const folderHint = folderCount > 0 ? ` (davon ${folderCount} Ordner)` : "";
    parts.push(`${p.planned_moves.length} ${itemWord} aus ${[...subdirs].join(", ")} wandern in den Hauptordner${folderHint}`);
  }
  if (p.has_03_projects && !p.savefiles_conflict) {
    parts.push("03_PROJECTS → 01_SAVEFILES");
  }
  if (p.savefiles_conflict) {
    parts.push("⚠️ 03_PROJECTS und 01_SAVEFILES existieren beide — muss von Hand zusammengeführt werden");
  }
  if (p.collisions.length > 0) {
    parts.push(`⚠️ ${p.collisions.length} Namenskonflikt(e) mit dem Hauptordner`);
  }
  return parts.join(" · ") || "Nichts zu migrieren";
}

// ─── Confirmation dialog ───────────────────────────────────────────────────

function MigrationDialog({ plan, isMigrating, error, onCancel, onConfirm }: {
  plan: LegacyStructure;
  isMigrating: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const blocked = plan.collisions.length > 0 || plan.savefiles_conflict;
  const movesBySubdir = groupBy(plan.planned_moves, m => m.from_subdir);

  return (
    <Modal
      icon={ArrowRightLeft}
      title="Ordnerstruktur migrieren"
      subtitle="Dateien werden verschoben (umbenannt), nie kopiert und gelöscht. Nichts wird überschrieben."
      onClose={onCancel}
      width={580}
      // Laeuft die Migration, darf ein Klick daneben nicht schliessen.
      closeOnBackdrop={!isMigrating}
      footer={
        <>
          <Button variant="secondary" disabled={isMigrating} onClick={onCancel}>Abbrechen</Button>
          <Button
            variant="primary"
            icon={ArrowRightLeft}
            loading={isMigrating}
            disabled={blocked}
            onClick={onConfirm}
          >
            {isMigrating ? "Wird migriert …" : "Migration anwenden"}
          </Button>
        </>
      }
    >
      {/* Blockers first */}
          {plan.savefiles_conflict && (
            <BlockBox color={C.error} title="03_PROJECTS/ und 01_SAVEFILES/ existieren beide">
              Beide Ordner können nach der Migration nicht nebeneinander bestehen. Führe sie von Hand im
              Explorer zusammen (alles aus 03_PROJECTS nach 01_SAVEFILES verschieben, dann den leeren
              03_PROJECTS-Ordner löschen) und öffne diesen Dialog danach erneut.
            </BlockBox>
          )}

          {plan.collisions.length > 0 && (
            <BlockBox color={C.error} title={`${plan.collisions.length} Namenskonflikt(e)`}>
              Diese Dateien liegen sowohl in einem alten Unterordner als auch im Hauptordner des Beats.
              Die Migration bricht ab, weil das Verschieben die Datei im Hauptordner stillschweigend
              überschreiben würde. Bitte zuerst von Hand auflösen:
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12, fontFamily: "monospace", color: C.onSurface }}>
                {plan.collisions.map(c => <li key={c}>{c}</li>)}
              </ul>
            </BlockBox>
          )}

          {/* Folder-by-folder move plan */}
          {Object.entries(movesBySubdir).map(([subdir, moves]) => (
            <div key={subdir}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                fontSize: 11, fontWeight: 700,
                color: C.onSecondaryFixedVar,
                letterSpacing: "0.08em", textTransform: "uppercase",
                marginBottom: 8,
              }}>
                <FolderOpen size={11} strokeWidth={1.5} />
                {subdir}/ → root
                <span style={{ marginLeft: "auto", color: C.onSurfaceVariant, fontWeight: 500 }}>
                  {moves.length} file{moves.length === 1 ? "" : "s"}
                </span>
              </div>
              <div style={{
                background: C.surfaceContainerLowest,
                border: `1px solid ${C.border15}`,
                borderRadius: radius.control,
                padding: "8px 12px",
                maxHeight: 140, overflowY: "auto",
                fontSize: 12, fontFamily: "monospace", color: C.onSurface,
                lineHeight: 1.6,
              }}>
                {moves.map(m => (
                  <div key={m.file_name} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {m.is_dir
                      ? <Folder size={11} color={C.primary} strokeWidth={1.75} style={{ flexShrink: 0 }} />
                      : <File size={11} color={C.onSecondaryFixedVar} strokeWidth={1.5} style={{ flexShrink: 0 }} />
                    }
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                      {m.file_name}{m.is_dir ? "/" : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Rename step */}
          {plan.has_03_projects && !plan.savefiles_conflict && (
            <div>
              <div style={{
                fontSize: 11, fontWeight: 700,
                color: C.onSecondaryFixedVar,
                letterSpacing: "0.08em", textTransform: "uppercase",
                marginBottom: 8,
              }}>
                Ordner wird umbenannt
              </div>
              <div style={{
                padding: "10px 12px",
                background: C.surfaceContainerLowest,
                border: `1px solid ${C.border15}`,
                borderRadius: radius.control,
                fontSize: 12, fontFamily: "monospace", color: C.onSurface,
              }}>
                03_PROJECTS/ → 01_SAVEFILES/
              </div>
            </div>
          )}

          {/* Aufräum-Schritt: läuft immer mit, hat aber keine Vorschau —
              welche Datei die neueste ist, steht erst nach dem Flatten fest. */}
          <div style={{ fontSize: 12, color: C.onSurfaceVariant, lineHeight: 1.5 }}>
            Danach bleibt im Root nur die neueste MP3 und die neueste WAV — ältere
            Audio-Dateien wandern mit ihrem Originalnamen nach 02_OLD/.
          </div>

      {error && (
        <div style={{
          padding: "10px 12px",
          background: alpha(C.error, 0.10),
          border: `1px solid ${alpha(C.error, 0.35)}`,
          borderRadius: radius.control,
          fontSize: 12, color: C.error, lineHeight: 1.5,
          whiteSpace: "pre-wrap",
        }}>
          {error}
        </div>
      )}
    </Modal>
  );
}

// ─── Sub-bits ──────────────────────────────────────────────────────────────

function BlockBox({ color, title, children }: { color: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: "12px 14px",
      background: `${color}14`,
      border: `1px solid ${color}59`,
      borderRadius: radius.control,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        fontSize: 12, fontWeight: 700, color, marginBottom: 6,
      }}>
        <AlertCircle size={13} strokeWidth={2} />
        {title}
      </div>
      <div style={{ fontSize: 12, color: C.onSurfaceVariant, lineHeight: 1.5 }}>
        {children}
      </div>
    </div>
  );
}

function SuccessToast({ text }: { text: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 14px",
      background: alpha(C.mint, 0.10),
      border: `1px solid ${alpha(C.mint, 0.35)}`,
      borderRadius: radius.card,
      fontSize: 12, color: C.mint,
    }}>
      <Check size={14} strokeWidth={2.5} />
      Migration erfolgreich — {text}
    </div>
  );
}

function groupBy<T, K extends string>(items: T[], keyFn: (item: T) => K): Record<K, T[]> {
  return items.reduce((acc, item) => {
    const k = keyFn(item);
    (acc[k] ||= []).push(item);
    return acc;
  }, {} as Record<K, T[]>);
}
