// src/components/upload/ConvertFilenamesDialog.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Dry-run preview + apply UI for the filename-convention converter.
// Shows old → new for every detected file, marks collisions / noops, and lets
// the user apply only after they've reviewed the plan.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import {
  X, ArrowRight, FileAudio, FileVideo, FileImage, FolderTree,
  Check, AlertTriangle, Minus, Loader2, RefreshCw, Wand2,
} from "lucide-react";
import { C } from "../../lib/theme";
import { api } from "../../lib/api";
import type { RenamePlan, RenameOp, RenameKind } from "../../types/upload";

interface ConvertFilenamesDialogProps {
  beatId: string;
  onClose: () => void;
  onApplied: () => void;
}

export function ConvertFilenamesDialog({ beatId, onClose, onApplied }: ConvertFilenamesDialogProps) {
  const [plan, setPlan]           = useState<RenamePlan | null>(null);
  const [isLoading, setLoading]   = useState(false);
  const [isApplying, setApplying] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [done, setDone]           = useState<string | null>(null);

  const loadPlan = async () => {
    setLoading(true);
    setError(null);
    try {
      setPlan(await api.upload.planFilenameConvention(beatId));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPlan(); }, [beatId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApply = async () => {
    setApplying(true);
    setError(null);
    try {
      const result = await api.upload.applyFilenameConvention(beatId);
      const parts: string[] = [];
      if (result.renamed > 0) parts.push(`${result.renamed} file${result.renamed === 1 ? "" : "s"} renamed`);
      if (result.noops   > 0) parts.push(`${result.noops} already named correctly`);
      if (result.errors.length > 0) parts.push(`${result.errors.length} error${result.errors.length === 1 ? "" : "s"}`);
      setDone(parts.join(" · ") || "Nothing to do");
      onApplied();
      // Reload plan so the dialog reflects new state (everything should be noops now)
      await loadPlan();
      if (result.errors.length > 0) {
        setError(result.errors.join("\n"));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setApplying(false);
    }
  };

  const renames    = plan?.operations.filter(o => o.status === "rename")    ?? [];
  const collisions = plan?.operations.filter(o => o.status === "collision") ?? [];
  const noops      = plan?.operations.filter(o => o.status === "noop")      ?? [];
  const skipped    = plan?.skipped ?? [];

  return (
    <div
      onClick={onClose}
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
          width: "100%", maxWidth: 760, maxHeight: "85vh",
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
            background: "rgba(148,146,255,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Wand2 size={18} color={C.tertiary ?? "#9492ff"} strokeWidth={2} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.onSurface, marginBottom: 2 }}>
              Convert filenames to convention
            </div>
            <div style={{ fontSize: 11, color: C.onSurfaceVariant }}>
              Files are renamed in place. Nothing is overwritten — collisions are flagged below.
            </div>
          </div>
          <button
            onClick={loadPlan}
            disabled={isLoading || isApplying}
            title="Re-scan the beat folder and recompute the plan"
            style={iconBtn(isLoading || isApplying)}
          >
            <RefreshCw size={14} strokeWidth={1.75} />
          </button>
          <button
            onClick={onClose}
            disabled={isApplying}
            style={iconBtn(isApplying)}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 18 }}>
          {isLoading && !plan && <LoadingState />}

          {plan && (
            <>
              {/* Stat strip */}
              <div style={{ display: "flex", gap: 8 }}>
                <StatChip color="#34d399" label="To rename" value={renames.length}    />
                <StatChip color={C.onSecondaryFixedVar} label="Already OK" value={noops.length} />
                <StatChip color="#e5484d" label="Collisions" value={collisions.length} />
                <StatChip color="#fda124" label="Skipped" value={skipped.length} dim />
              </div>

              {/* Rename rows */}
              {renames.length > 0 && (
                <Section title="Will rename" color="#34d399">
                  {renames.map(op => <OpRow key={`${op.subdir ?? "/"}/${op.from}`} op={op} />)}
                </Section>
              )}

              {/* Collisions */}
              {collisions.length > 0 && (
                <Section title="Blocked — target name already taken" color="#e5484d">
                  {collisions.map(op => <OpRow key={`${op.subdir ?? "/"}/${op.from}`} op={op} />)}
                </Section>
              )}

              {/* Already-correct rows (collapsed by default look) */}
              {noops.length > 0 && (
                <Section title="Already named correctly" color={C.onSecondaryFixedVar} muted>
                  {noops.map(op => <OpRow key={`${op.subdir ?? "/"}/${op.from}`} op={op} />)}
                </Section>
              )}

              {/* Skipped (additional MP3s, missing MP4 metadata, etc.) */}
              {skipped.length > 0 && (
                <Section title="Skipped" color="#fda124" muted>
                  {skipped.map(s => (
                    <div key={s.file} style={skipRowStyle}>
                      <Minus size={12} color="#fda124" strokeWidth={2} />
                      <span style={{ fontFamily: "monospace", color: C.onSurface, marginRight: 8 }}>{s.file}</span>
                      <span style={{ color: C.onSurfaceVariant, fontSize: 11 }}>· {s.reason}</span>
                    </div>
                  ))}
                </Section>
              )}

              {plan.operations.length === 0 && skipped.length === 0 && (
                <div style={{
                  padding: "24px 20px", textAlign: "center",
                  background: C.surfaceContainerLowest,
                  border: `1px dashed ${C.border20}`,
                  borderRadius: 8,
                  fontSize: 12, color: C.onSurfaceVariant,
                }}>
                  No matching files found in this beat folder.
                </div>
              )}
            </>
          )}

          {/* Banners */}
          {done && (
            <div style={bannerStyle("#34d399")}>
              <Check size={14} strokeWidth={2.5} />
              {done}
            </div>
          )}
          {error && (
            <div style={bannerStyle("#e5484d")}>
              <AlertTriangle size={14} strokeWidth={2} />
              <span style={{ whiteSpace: "pre-wrap" }}>{error}</span>
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
            onClick={onClose}
            disabled={isApplying}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              background: C.surfaceContainerHigh,
              border: `1px solid ${C.border20}`,
              cursor: isApplying ? "not-allowed" : "pointer",
              fontSize: 12, fontWeight: 700, color: C.onSurface,
              opacity: isApplying ? 0.5 : 1,
            }}
          >
            Close
          </button>
          <button
            onClick={handleApply}
            disabled={!plan?.has_work || isApplying || isLoading}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              background: (!plan?.has_work || isApplying) ? C.surfaceContainerHigh : (C.tertiary ?? "#9492ff"),
              border: (!plan?.has_work || isApplying) ? `1px solid ${C.border20}` : "none",
              cursor: (!plan?.has_work || isApplying || isLoading) ? "not-allowed" : "pointer",
              fontSize: 12, fontWeight: 700,
              color: (!plan?.has_work || isApplying) ? C.onSecondaryFixedVar : "#fff",
              opacity: (!plan?.has_work) ? 0.5 : 1,
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {isApplying
              ? <><Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} /> Renaming…</>
              : <><Wand2 size={13} strokeWidth={2} /> Apply {renames.length > 0 ? `(${renames.length})` : ""}</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Section({ title, color, children, muted }: {
  title: string;
  color: string;
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        fontSize: 10, fontWeight: 700,
        color, letterSpacing: "0.1em", textTransform: "uppercase",
        marginBottom: 8,
        opacity: muted ? 0.7 : 1,
      }}>
        {title}
      </div>
      <div style={{
        background: C.surfaceContainerLowest,
        border: `1px solid ${C.border15}`,
        borderRadius: 8,
        padding: 6,
        display: "flex", flexDirection: "column", gap: 2,
        opacity: muted ? 0.85 : 1,
      }}>
        {children}
      </div>
    </div>
  );
}

const KIND_META: Record<RenameKind, { icon: React.ElementType; label: string; color: string }> = {
  mp3:        { icon: FileAudio,  label: "MP3",       color: "#fda124" },
  wav:        { icon: FileAudio,  label: "WAV",       color: "#fda124" },
  mp4:        { icon: FileVideo,  label: "MP4",       color: "#9492ff" },
  cover:      { icon: FileImage,  label: "Cover",     color: "#34d399" },
  thumbnail:  { icon: FileImage,  label: "Thumbnail", color: "#34d399" },
  flp:        { icon: FolderTree, label: "FLP",       color: "#ff5577" },
  flp_master: { icon: FolderTree, label: "FLP·master",color: "#ff5577" },
  flp_old:    { icon: FolderTree, label: "FLP·old",   color: "#ff5577" },
};

function OpRow({ op }: { op: RenameOp }) {
  const meta = KIND_META[op.kind] ?? KIND_META.mp3;
  const Icon = meta.icon;
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "92px minmax(0, 1fr) 14px minmax(0, 1fr)",
      alignItems: "center",
      gap: 8,
      padding: "6px 10px",
      borderRadius: 5,
      fontSize: 11,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: meta.color, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", fontSize: 9 }}>
        <Icon size={11} strokeWidth={1.75} />
        {meta.label}
      </div>
      <div style={{
        fontFamily: "monospace", color: C.onSurfaceVariant,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }} title={pathLabel(op.subdir, op.from)}>
        {pathLabel(op.subdir, op.from)}
      </div>
      <ArrowRight size={12} color={C.onSecondaryFixedVar} strokeWidth={2} />
      <div style={{
        fontFamily: "monospace",
        color: op.status === "collision" ? "#e5484d" : C.onSurface,
        fontWeight: op.status === "rename" ? 600 : 400,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }} title={pathLabel(op.subdir, op.to)}>
        {pathLabel(op.subdir, op.to)}
      </div>
    </div>
  );
}

function pathLabel(subdir: string | null, file: string): string {
  return subdir ? `${subdir}/${file}` : file;
}

function StatChip({ label, value, color, dim }: { label: string; value: number; color: string; dim?: boolean }) {
  return (
    <div style={{
      flex: 1,
      padding: "8px 12px",
      borderRadius: 6,
      background: C.surfaceContainerLowest,
      border: `1px solid ${color}40`,
      opacity: value === 0 ? (dim ? 0.4 : 0.6) : 1,
    }}>
      <div style={{ fontSize: 16, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 9, fontWeight: 700, color: C.onSurfaceVariant, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 4 }}>
        {label}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{
      padding: "40px 20px",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
      color: C.onSurfaceVariant, fontSize: 12,
    }}>
      <Loader2 size={20} style={{ animation: "spin 0.8s linear infinite" }} />
      Building plan…
    </div>
  );
}

function bannerStyle(color: string): React.CSSProperties {
  return {
    display: "flex", alignItems: "flex-start", gap: 8,
    padding: "10px 12px",
    background: `${color}1a`,
    border: `1px solid ${color}59`,
    borderRadius: 6,
    fontSize: 11, color,
    lineHeight: 1.5,
  };
}

function iconBtn(disabled?: boolean): React.CSSProperties {
  return {
    width: 28, height: 28, borderRadius: 6,
    background: C.surfaceContainerLowest,
    border: `1px solid ${C.border15}`,
    cursor: disabled ? "not-allowed" : "pointer",
    color: C.onSurfaceVariant,
    display: "flex", alignItems: "center", justifyContent: "center",
    opacity: disabled ? 0.5 : 1,
  };
}

const skipRowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8,
  padding: "6px 10px",
  fontSize: 11,
  borderRadius: 5,
};
