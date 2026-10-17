// src/components/upload/ConvertFilenamesDialog.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Dry-run preview + apply UI for the filename-convention converter.
// Shows old → new for every detected file, marks collisions / noops, and lets
// the user apply only after they've reviewed the plan.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import {
  ArrowRight, FileAudio, FileVideo, FileImage, FolderTree,
  Check, AlertTriangle, Minus, Loader2, RefreshCw, Wand2,
} from "lucide-react";
import { C, radius } from "../../lib/theme";
import { Modal, Button } from "../ui";
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
      if (result.renamed > 0) parts.push(`${result.renamed} Datei${result.renamed === 1 ? "" : "en"} umbenannt`);
      if (result.noops   > 0) parts.push(`${result.noops} schon korrekt benannt`);
      if (result.errors.length > 0) parts.push(`${result.errors.length} Fehler`);
      setDone(parts.join(" · ") || "Nichts zu tun");
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
    <Modal
      icon={Wand2}
      title="Dateinamen ins Namensschema bringen"
      subtitle="Dateien werden an Ort und Stelle umbenannt. Nichts wird überschrieben — Konflikte stehen unten."
      onClose={onClose}
      width={760}
      // Laeuft gerade ein Umbenennen, darf ein Klick daneben nicht schliessen.
      closeOnBackdrop={!isApplying}
      footerLeft={
        <Button
          variant="ghost"
          size="sm"
          icon={RefreshCw}
          disabled={isLoading || isApplying}
          onClick={loadPlan}
          title="Beat-Ordner neu einlesen und Plan neu berechnen"
        >
          Neu einlesen
        </Button>
      }
      footer={
        <>
          <Button variant="secondary" disabled={isApplying} onClick={onClose}>Schließen</Button>
          <Button
            variant="primary"
            icon={Wand2}
            loading={isApplying}
            disabled={!plan?.has_work || isLoading}
            onClick={handleApply}
          >
            {isApplying
              ? "Wird umbenannt …"
              : `Anwenden${renames.length > 0 ? ` (${renames.length})` : ""}`}
          </Button>
        </>
      }
    >
      {isLoading && !plan && <LoadingState />}

      {plan && (
        <>
          {/* Stat strip */}
          <div style={{ display: "flex", gap: 8 }}>
            <StatChip color={C.mint} label="Umzubenennen" value={renames.length}    />
            <StatChip color={C.onSecondaryFixedVar} label="Schon korrekt" value={noops.length} />
            <StatChip color={C.error} label="Konflikte" value={collisions.length} />
            <StatChip color={C.primary} label="Übersprungen" value={skipped.length} dim />
          </div>

          {/* Rename rows */}
          {renames.length > 0 && (
            <Section title="Wird umbenannt / aufgeräumt" color={C.mint}>
              {renames.map(op => <OpRow key={`${op.subdir ?? "/"}/${op.from}`} op={op} />)}
            </Section>
          )}

          {/* Collisions */}
          {collisions.length > 0 && (
            <Section title="Blockiert — Zielname schon vergeben" color={C.error}>
              {collisions.map(op => <OpRow key={`${op.subdir ?? "/"}/${op.from}`} op={op} />)}
            </Section>
          )}

          {/* Already-correct rows (collapsed by default look) */}
          {noops.length > 0 && (
            <Section title="Schon korrekt benannt" color={C.onSecondaryFixedVar} muted>
              {noops.map(op => <OpRow key={`${op.subdir ?? "/"}/${op.from}`} op={op} />)}
            </Section>
          )}

          {/* Skipped (additional MP3s, missing MP4 metadata, etc.) */}
          {skipped.length > 0 && (
            <Section title="Übersprungen" color={C.primary} muted>
              {skipped.map(s => (
                <div key={s.file} style={skipRowStyle}>
                  <Minus size={12} color={C.primary} strokeWidth={2} />
                  <span style={{ fontFamily: "monospace", color: C.onSurface, marginRight: 8 }}>{s.file}</span>
                  <span style={{ color: C.onSurfaceVariant, fontSize: 12 }}>· {s.reason}</span>
                </div>
              ))}
            </Section>
          )}

          {plan.operations.length === 0 && skipped.length === 0 && (
            <div style={{
              padding: "24px 20px", textAlign: "center",
              background: C.surfaceContainerHigh,
              border: `1px dashed ${C.border20}`,
              borderRadius: radius.control,
              fontSize: 12, color: C.onSurfaceVariant,
            }}>
              Keine passenden Dateien in diesem Beat-Ordner.
            </div>
          )}
        </>
      )}

      {/* Banners */}
      {done && (
        <div style={bannerStyle(C.mint)}>
          <Check size={14} strokeWidth={2.5} />
          {done}
        </div>
      )}
      {error && (
        <div style={bannerStyle(C.error)}>
          <AlertTriangle size={14} strokeWidth={2} />
          <span style={{ whiteSpace: "pre-wrap" }}>{error}</span>
        </div>
      )}
    </Modal>
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
        fontSize: 11, fontWeight: 700,
        color, letterSpacing: "0.08em", textTransform: "uppercase",
        marginBottom: 8,
        opacity: muted ? 0.7 : 1,
      }}>
        {title}
      </div>
      <div style={{
        background: C.surfaceContainerHigh,
        border: `1px solid ${C.border15}`,
        borderRadius: radius.control,
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
  mp3:        { icon: FileAudio,  label: "MP3",       color: C.primary },
  wav:        { icon: FileAudio,  label: "WAV",       color: C.primary },
  mp4:        { icon: FileVideo,  label: "MP4",       color: C.tertiary },
  cover:      { icon: FileImage,  label: "Cover",     color: C.mint },
  thumbnail:  { icon: FileImage,  label: "Thumbnail", color: C.mint },
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
      borderRadius: radius.control,
      fontSize: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: meta.color, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", fontSize: 11 }}>
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
        color: op.status === "collision" ? C.error : C.onSurface,
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
      borderRadius: radius.control,
      background: C.surfaceContainerHigh,
      border: `1px solid ${color}40`,
      opacity: value === 0 ? (dim ? 0.4 : 0.6) : 1,
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.onSurfaceVariant, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 4 }}>
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
      Plan wird erstellt …
    </div>
  );
}

function bannerStyle(color: string): React.CSSProperties {
  return {
    display: "flex", alignItems: "flex-start", gap: 8,
    padding: "10px 12px",
    background: `${color}1a`,
    border: `1px solid ${color}59`,
    borderRadius: radius.control,
    fontSize: 12, color,
    lineHeight: 1.5,
  };
}


const skipRowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8,
  padding: "6px 10px",
  fontSize: 12,
  borderRadius: radius.control,
};
