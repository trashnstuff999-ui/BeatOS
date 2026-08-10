// src/components/upload/LegacyMigrationBanner.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Detects beats with the old 01_AUDIO/02_VISUALS/03_PROJECTS/04_UPLOAD layout
// and offers a one-click migration to the new flat structure:
//   • move contents of 01_AUDIO, 02_VISUALS, 04_UPLOAD into the root
//   • rename 03_PROJECTS → 01_SAVEFILES
// Nothing is overwritten — collisions abort the migration before any file moves.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { AlertCircle, ArrowRightLeft, Check, X, FolderOpen, Folder, File, Loader2 } from "lucide-react";
import { C } from "../../lib/theme";
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
        background: blocked ? "rgba(229,72,77,0.08)" : "rgba(253,161,36,0.08)",
        border: `1px solid ${blocked ? "rgba(229,72,77,0.30)" : "rgba(253,161,36,0.30)"}`,
        borderRadius: 10,
      }}>
        <AlertCircle
          size={18}
          color={blocked ? "#e5484d" : "#fda124"}
          strokeWidth={1.75}
          style={{ flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: blocked ? "#e5484d" : "#fda124", marginBottom: 2 }}>
            Alte Ordnerstruktur erkannt
          </div>
          <div style={{ fontSize: 11, color: C.onSurfaceVariant, lineHeight: 1.4 }}>
            {moveSummary}
          </div>
        </div>
        <button
          onClick={() => setOpen(true)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 14px",
            background: blocked ? C.surfaceContainerHigh : "#fda124",
            border: blocked ? `1px solid ${C.border20}` : "none",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 11, fontWeight: 700,
            color: blocked ? C.onSurfaceVariant : "#4e2d00",
            letterSpacing: "0.05em", textTransform: "uppercase",
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
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 580, maxHeight: "85vh",
          background: C.surfaceContainer,
          borderRadius: 12,
          border: `1px solid ${C.border20}`,
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "16px 20px",
          borderBottom: `1px solid ${C.border15}`,
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{
            width: 36, height: 36, flexShrink: 0,
            borderRadius: 8,
            background: blocked ? "rgba(229,72,77,0.15)" : "rgba(253,161,36,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <ArrowRightLeft size={18} color={blocked ? "#e5484d" : "#fda124"} strokeWidth={2} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.onSurface, marginBottom: 2 }}>
              Ordnerstruktur migrieren
            </div>
            <div style={{ fontSize: 11, color: C.onSurfaceVariant }}>
              Dateien werden verschoben (umbenannt), nie kopiert und gelöscht. Nichts wird überschrieben.
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={isMigrating}
            style={{
              background: "transparent", border: "none",
              cursor: isMigrating ? "not-allowed" : "pointer",
              color: C.onSurfaceVariant,
              display: "flex", padding: 4,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Blockers first */}
          {plan.savefiles_conflict && (
            <BlockBox color="#e5484d" title="03_PROJECTS/ und 01_SAVEFILES/ existieren beide">
              Beide Ordner können nach der Migration nicht nebeneinander bestehen. Führe sie von Hand im
              Explorer zusammen (alles aus 03_PROJECTS nach 01_SAVEFILES verschieben, dann den leeren
              03_PROJECTS-Ordner löschen) und öffne diesen Dialog danach erneut.
            </BlockBox>
          )}

          {plan.collisions.length > 0 && (
            <BlockBox color="#e5484d" title={`${plan.collisions.length} Namenskonflikt(e)`}>
              Diese Dateien liegen sowohl in einem alten Unterordner als auch im Hauptordner des Beats.
              Die Migration bricht ab, weil das Verschieben die Datei im Hauptordner stillschweigend
              überschreiben würde. Bitte zuerst von Hand auflösen:
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 11, fontFamily: "monospace", color: C.onSurface }}>
                {plan.collisions.map(c => <li key={c}>{c}</li>)}
              </ul>
            </BlockBox>
          )}

          {/* Folder-by-folder move plan */}
          {Object.entries(movesBySubdir).map(([subdir, moves]) => (
            <div key={subdir}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                fontSize: 10, fontWeight: 700,
                color: C.onSecondaryFixedVar,
                letterSpacing: "0.1em", textTransform: "uppercase",
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
                borderRadius: 6,
                padding: "8px 12px",
                maxHeight: 140, overflowY: "auto",
                fontSize: 11, fontFamily: "monospace", color: C.onSurface,
                lineHeight: 1.6,
              }}>
                {moves.map(m => (
                  <div key={m.file_name} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {m.is_dir
                      ? <Folder size={11} color="#fda124" strokeWidth={1.75} style={{ flexShrink: 0 }} />
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
                fontSize: 10, fontWeight: 700,
                color: C.onSecondaryFixedVar,
                letterSpacing: "0.1em", textTransform: "uppercase",
                marginBottom: 8,
              }}>
                Ordner wird umbenannt
              </div>
              <div style={{
                padding: "10px 12px",
                background: C.surfaceContainerLowest,
                border: `1px solid ${C.border15}`,
                borderRadius: 6,
                fontSize: 12, fontFamily: "monospace", color: C.onSurface,
              }}>
                03_PROJECTS/ → 01_SAVEFILES/
              </div>
            </div>
          )}

          {error && (
            <div style={{
              padding: "10px 12px",
              background: "rgba(229,72,77,0.10)",
              border: "1px solid rgba(229,72,77,0.35)",
              borderRadius: 6,
              fontSize: 11, color: "#e5484d", lineHeight: 1.5,
              whiteSpace: "pre-wrap",
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 20px",
          borderTop: `1px solid ${C.border15}`,
          display: "flex", gap: 8, justifyContent: "flex-end",
        }}>
          <button
            onClick={onCancel}
            disabled={isMigrating}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              background: C.surfaceContainerHigh,
              border: `1px solid ${C.border20}`,
              cursor: isMigrating ? "not-allowed" : "pointer",
              fontSize: 12, fontWeight: 700, color: C.onSurface,
              opacity: isMigrating ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={blocked || isMigrating}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              background: blocked ? C.surfaceContainerHigh : "#fda124",
              border: blocked ? `1px solid ${C.border20}` : "none",
              cursor: (blocked || isMigrating) ? "not-allowed" : "pointer",
              fontSize: 12, fontWeight: 700,
              color: blocked ? C.onSecondaryFixedVar : "#4e2d00",
              opacity: blocked ? 0.5 : 1,
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {isMigrating
              ? <><Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} /> Migrating…</>
              : <><ArrowRightLeft size={13} strokeWidth={2} /> Apply Migration</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-bits ──────────────────────────────────────────────────────────────

function BlockBox({ color, title, children }: { color: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: "12px 14px",
      background: `${color}14`,
      border: `1px solid ${color}59`,
      borderRadius: 8,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        fontSize: 12, fontWeight: 700, color, marginBottom: 6,
      }}>
        <AlertCircle size={13} strokeWidth={2} />
        {title}
      </div>
      <div style={{ fontSize: 11, color: C.onSurfaceVariant, lineHeight: 1.5 }}>
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
      background: "rgba(52,211,153,0.10)",
      border: "1px solid rgba(52,211,153,0.35)",
      borderRadius: 10,
      fontSize: 12, color: "#34d399",
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
