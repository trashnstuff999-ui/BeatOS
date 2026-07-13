// src/components/upload/AssetChecklistCard.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Read-only view of what's present in the beat folder.
// Source of truth = filesystem (scanned in get_upload_data).
// Collapsed to a single status line when everything is present; auto-expands
// (missing items first) when something is wrong. The description-files block
// moved out — the DescriptionFilesCard tabs and the header "Files" step
// already cover it.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import {
  CheckCircle2, XCircle, FileAudio, FileImage, FileVideo,
  FolderOpen, FolderTree, RefreshCw, Wand2, ChevronDown, ListChecks,
} from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { C } from "../../lib/theme";
import { SectionCard, SectionIconBtn } from "./SectionCard";
import type { AssetCheck } from "../../types/upload";

interface AssetChecklistCardProps {
  assets: AssetCheck;
  beatPath: string;
  onRefresh: () => void;
  onConvert: () => void;
}

type Row = {
  label: string;
  filename: string | null;
  icon: React.ElementType;
};

export function AssetChecklistCard({ assets, beatPath, onRefresh, onConvert }: AssetChecklistCardProps) {
  const allRows: Row[] = [
    { label: "MP3",       filename: assets.mp3,       icon: FileAudio },
    { label: "WAV",       filename: assets.wav,       icon: FileAudio },
    { label: "FLP",       filename: assets.flp,       icon: FolderTree },
    { label: "Cover",     filename: assets.cover,     icon: FileImage },
    { label: "Thumbnail", filename: assets.thumbnail, icon: FileImage },
    { label: "Video MP4", filename: assets.video,     icon: FileVideo },
  ];

  const missing = allRows.filter(r => r.filename === null);
  const present = allRows.filter(r => r.filename !== null);
  const allOk = missing.length === 0;

  // Auto-expand when something is missing; collapse when complete.
  const [open, setOpen] = useState(!allOk);
  useEffect(() => { setOpen(!allOk); }, [allOk]);

  const handleOpen = async () => {
    if (!beatPath) return;
    try { await revealItemInDir(beatPath); } catch {}
  };

  return (
    <SectionCard
      icon={ListChecks}
      title="Assets"
      actions={
        <div style={{ display: "flex", gap: 6 }}>
          <SectionIconBtn icon={RefreshCw} title="Ordner neu scannen" onClick={onRefresh} />
          <SectionIconBtn icon={FolderOpen} title="Beat-Ordner öffnen" onClick={handleOpen} />
        </div>
      }
    >
      {/* Status line — the whole card in one glance */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%",
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 12px",
          background: allOk ? "rgba(52,211,153,0.07)" : "rgba(255,115,81,0.06)",
          border: `1px solid ${allOk ? "rgba(52,211,153,0.25)" : "rgba(255,115,81,0.25)"}`,
          borderRadius: 8,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {allOk
          ? <CheckCircle2 size={15} color={C.mint} strokeWidth={2} />
          : <XCircle size={15} color={C.error} strokeWidth={2} />
        }
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: allOk ? C.mint : C.error }}>
          {allOk
            ? `Alle Assets bereit · ${present.length}/${allRows.length}`
            : `${missing.length} fehlt: ${missing.map(m => m.label).join(", ")}`
          }
        </span>
        <ChevronDown
          size={13}
          color={C.onSecondaryFixedVar}
          style={{ transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "rotate(0)" }}
        />
      </button>

      {open && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 3 }}>
          {/* Missing first — that's what needs attention */}
          {[...missing, ...present].map(row => <AssetRow key={row.label} {...row} />)}

          {/* Demoted convert action — rarely needed since auto-rename */}
          <button
            onClick={onConvert}
            style={{
              marginTop: 10,
              alignSelf: "flex-start",
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 10px",
              background: "transparent",
              border: `1px solid ${C.border20}`,
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 10, fontWeight: 600,
              color: C.onSurfaceVariant,
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.border30; e.currentTarget.style.color = C.onSurface; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border20; e.currentTarget.style.color = C.onSurfaceVariant; }}
          >
            <Wand2 size={11} strokeWidth={2} />
            Dateinamen konventionieren
          </button>
        </div>
      )}
    </SectionCard>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function AssetRow({ label, filename, icon: Icon }: Row) {
  const ok = filename !== null;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "7px 10px",
      background: ok ? C.surfaceContainerLowest : "rgba(255,115,81,0.04)",
      border: `1px solid ${ok ? C.border10 : "rgba(255,115,81,0.20)"}`,
      borderRadius: 7,
    }}>
      {ok
        ? <CheckCircle2 size={14} color={C.mint} strokeWidth={2} />
        : <XCircle size={14} color={C.error} strokeWidth={1.75} />
      }
      <Icon size={12} color={C.onSecondaryFixedVar} strokeWidth={1.5} />
      <span style={{
        fontSize: 10, fontWeight: 700, color: ok ? C.onSurfaceVariant : C.error,
        letterSpacing: "0.05em", textTransform: "uppercase",
        width: 72, flexShrink: 0,
      }}>
        {label}
      </span>
      <span style={{
        flex: 1, minWidth: 0,
        fontSize: 11,
        fontFamily: "monospace",
        color: ok ? C.onSurface : C.onSecondaryFixedVar,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        opacity: ok ? 0.9 : 0.6,
      }}>
        {filename ?? "fehlt"}
      </span>
    </div>
  );
}
