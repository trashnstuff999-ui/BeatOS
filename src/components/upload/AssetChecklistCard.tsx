// src/components/upload/AssetChecklistCard.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Read-only view of what's present in the beat folder.
// Source of truth = filesystem (scanned in get_upload_data).
// ═══════════════════════════════════════════════════════════════════════════════

import { CheckCircle2, XCircle, FileAudio, FileImage, FileVideo, FolderOpen, FolderTree, RefreshCw, Wand2 } from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { C } from "../../lib/theme";
import { Card, Label } from "../ui";
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
  const audioRows: Row[] = [
    { label: "MP3",       filename: assets.mp3, icon: FileAudio },
    { label: "WAV",       filename: assets.wav, icon: FileAudio },
    { label: "FLP",       filename: assets.flp, icon: FolderTree },
  ];
  const visualRows: Row[] = [
    { label: "Cover",     filename: assets.cover,     icon: FileImage },
    { label: "Thumbnail", filename: assets.thumbnail, icon: FileImage },
    { label: "Video MP4", filename: assets.video,     icon: FileVideo },
  ];

  const uploadFolder = assets.upload_files;

  const handleOpen = async () => {
    if (!beatPath) return;
    try { await revealItemInDir(beatPath); } catch {}
  };

  return (
    <Card accent={C.mint}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <Label>Asset Checklist</Label>
        <div style={{ display: "flex", gap: 6 }}>
          <IconBtn icon={RefreshCw} title="Re-scan folder" onClick={onRefresh} />
          <IconBtn icon={FolderOpen} title="Open beat folder" onClick={handleOpen} />
        </div>
      </div>

      <RowGroup title="AUDIO + PROJECT" rows={audioRows} />
      <div style={{ height: 12 }} />
      <RowGroup title="VISUALS" rows={visualRows} />

      <div style={{
        marginTop: 16, padding: "12px 14px",
        background: C.surfaceContainerLowest,
        border: `1px solid ${C.border15}`,
        borderRadius: 8,
      }}>
        <div style={{
          fontSize: 9, fontWeight: 700, color: C.onSecondaryFixedVar,
          textTransform: "uppercase", letterSpacing: "0.15em",
          marginBottom: 8,
        }}>
          Description files
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <MiniRow ok={uploadFolder.beatstars_txt}  label="beatstars.txt" />
          <MiniRow ok={uploadFolder.soundcloud_txt} label="soundcloud.txt" />
          <MiniRow ok={uploadFolder.youtube_txt}    label="youtube.txt" />
        </div>
      </div>

      {/* Convert CTA */}
      <button
        onClick={onConvert}
        style={{
          marginTop: 16,
          width: "100%",
          padding: "11px 14px",
          background: "rgba(148,146,255,0.10)",
          border: "1px solid rgba(148,146,255,0.35)",
          borderRadius: 8,
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          fontSize: 11, fontWeight: 700,
          color: C.tertiary ?? "#9492ff",
          letterSpacing: "0.05em", textTransform: "uppercase",
        }}
      >
        <Wand2 size={13} strokeWidth={2} />
        Convert filenames to convention
      </button>
    </Card>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function RowGroup({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div>
      <div style={{
        fontSize: 9, fontWeight: 700, color: C.onSecondaryFixedVar,
        textTransform: "uppercase", letterSpacing: "0.15em",
        marginBottom: 8,
      }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {rows.map(row => <AssetRow key={row.label} {...row} />)}
      </div>
    </div>
  );
}

function AssetRow({ label, filename, icon: Icon }: Row) {
  const ok = filename !== null;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 12px",
      background: ok ? C.surfaceContainerLowest : "transparent",
      border: `1px solid ${ok ? C.border15 : "transparent"}`,
      borderRadius: 8,
    }}>
      {ok
        ? <CheckCircle2 size={16} color={C.mint} strokeWidth={2} />
        : <XCircle size={16} color={C.onSecondaryFixedVar} strokeWidth={1.5} />
      }
      <Icon size={14} color={C.onSecondaryFixedVar} strokeWidth={1.5} />
      <span style={{
        fontSize: 11, fontWeight: 700, color: C.onSurfaceVariant,
        letterSpacing: "0.05em", textTransform: "uppercase",
        width: 80, flexShrink: 0,
      }}>
        {label}
      </span>
      <span style={{
        flex: 1, minWidth: 0,
        fontSize: 12,
        fontFamily: "monospace",
        color: ok ? C.onSurface : C.onSecondaryFixedVar,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        opacity: ok ? 1 : 0.5,
      }}>
        {filename ?? "—"}
      </span>
    </div>
  );
}

function MiniRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
      {ok
        ? <CheckCircle2 size={13} color={C.mint} strokeWidth={2} />
        : <XCircle size={13} color={C.onSecondaryFixedVar} strokeWidth={1.5} />
      }
      <span style={{
        fontFamily: "monospace",
        color: ok ? C.onSurface : C.onSecondaryFixedVar,
        opacity: ok ? 1 : 0.5,
      }}>
        {label}
      </span>
    </div>
  );
}

function IconBtn({ icon: Icon, title, onClick }: { icon: React.ElementType; title: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 28, height: 28, borderRadius: 6,
        background: C.surfaceContainerLowest,
        border: `1px solid ${C.border15}`,
        cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: C.onSurfaceVariant,
      }}
    >
      <Icon size={13} strokeWidth={1.5} />
    </button>
  );
}
