// src/components/create/CreateAssetsCard.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Cover / Thumbnail / Video direkt im Create-Flow zuweisen — damit nichts
// ohne Artwork ins Archiv wandert. Zuweisen verschiebt die Datei aus dem
// Asset-Ordner in den Beat-Ordner (gleicher Command wie im Studio-Tab);
// Cover+Thumbnail kommen als Gruppe in einem Klick.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { Images, Film, Plus, RefreshCw, Loader2, AlertTriangle } from "lucide-react";
import { C } from "../../lib/theme";
import { SectionCard } from "../ui/SectionCard";
import { AssetPickerDialog } from "../AssetPickerDialog";

export interface CreateAssets {
  /** base64-Vorschau des Covers (aus read_image_file) */
  coverPreview: string | null;
  coverPath: string | null;
  thumbnailPreview: string | null;
  thumbnailPath: string | null;
  videoPath: string | null;
}

interface CreateAssetsCardProps {
  assets: CreateAssets;
  /** Beat-Ordner (Ziel der Zuweisung) — null solange kein Ordner gewählt ist */
  sourceFolderPath: string | null;
  assetPath: string;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export function CreateAssetsCard({
  assets, sourceFolderPath, assetPath, isRefreshing, onRefresh,
}: CreateAssetsCardProps) {
  const [picker, setPicker] = useState<null | { kind: "image" | "video"; title: string }>(null);

  const noFolder = !sourceFolderPath;
  const noAssetPath = !assetPath.trim();
  const missingCover = !assets.coverPath;

  return (
    <SectionCard
      icon={Images}
      title="Cover & Assets"
      actions={
        <button
          onClick={onRefresh}
          disabled={noFolder || isRefreshing}
          title="Ordner neu einlesen"
          style={{
            width: 26, height: 26, borderRadius: 6,
            background: "transparent",
            border: `1px solid ${C.border15}`,
            cursor: noFolder ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: C.onSurfaceVariant,
            opacity: noFolder ? 0.5 : 1,
          }}
        >
          {isRefreshing
            ? <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />
            : <RefreshCw size={13} strokeWidth={1.75} />}
        </button>
      }
    >
      {/* Warnhinweis, solange kein Cover da ist */}
      {!noFolder && missingCover && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "9px 12px", marginBottom: 12,
          background: "rgba(253,161,36,0.08)",
          border: "1px solid rgba(253,161,36,0.30)",
          borderRadius: 8,
          fontSize: 11, color: C.primary,
        }}>
          <AlertTriangle size={13} strokeWidth={2} />
          Kein Cover zugewiesen — beim Archivieren wird nachgefragt.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <AssetSlot
          label="Cover"
          preview={assets.coverPreview}
          fileName={fileNameOf(assets.coverPath)}
          disabled={noFolder || noAssetPath}
          onPick={() => setPicker({ kind: "image", title: "Cover & Thumbnail zuweisen" })}
        />
        <AssetSlot
          label="Thumbnail"
          preview={assets.thumbnailPreview}
          fileName={fileNameOf(assets.thumbnailPath)}
          disabled={noFolder || noAssetPath}
          onPick={() => setPicker({ kind: "image", title: "Cover & Thumbnail zuweisen" })}
        />
        <AssetSlot
          label="Video"
          preview={null}
          icon={Film}
          fileName={fileNameOf(assets.videoPath)}
          disabled={noFolder || noAssetPath}
          onPick={() => setPicker({ kind: "video", title: "Video zuweisen" })}
        />
      </div>

      <div style={{ fontSize: 10, color: C.onSecondaryFixedVar, marginTop: 10, lineHeight: 1.5 }}>
        {noFolder
          ? "Erst einen Beat-Ordner wählen."
          : noAssetPath
            ? "Kein Asset-Pfad in den Settings gesetzt — dort den Export-Ordner (04_UPLOAD) eintragen."
            : "Cover + Thumbnail mit gleicher Nummer werden als Gruppe zugewiesen. Die Dateien wandern in den Beat-Ordner."}
      </div>

      {picker && sourceFolderPath && (
        <AssetPickerDialog
          targetDir={sourceFolderPath}
          assetRoot={assetPath}
          filterKind={picker.kind}
          title={picker.title}
          onAssigned={() => onRefresh()}
          onClose={() => setPicker(null)}
        />
      )}
    </SectionCard>
  );
}

// ─── Ein Slot ────────────────────────────────────────────────────────────────

function AssetSlot({ label, preview, fileName, icon: Icon, disabled, onPick }: {
  label: string;
  preview: string | null;
  fileName: string | null;
  icon?: React.ElementType;
  disabled: boolean;
  onPick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const filled = Boolean(fileName);

  return (
    <div>
      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
        textTransform: "uppercase", color: C.onSecondaryFixedVar,
        marginBottom: 6,
      }}>
        {label}
      </div>
      <button
        onClick={onPick}
        disabled={disabled}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title={filled ? `${fileName} — Klick zum Ersetzen` : disabled ? undefined : `${label} zuweisen`}
        style={{
          width: "100%", aspectRatio: "1 / 1",
          background: filled ? C.surfaceContainerHigh : "transparent",
          border: filled
            ? `1px solid ${C.border20}`
            : `1px dashed ${disabled ? C.border15 : C.border30}`,
          borderRadius: 10,
          cursor: disabled ? "not-allowed" : "pointer",
          padding: 0, overflow: "hidden", position: "relative",
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: disabled ? 0.45 : 1,
          transition: "border-color 0.15s",
        }}
      >
        {preview ? (
          <img src={preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : filled ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: C.mint }}>
            {Icon ? <Icon size={22} strokeWidth={1.5} /> : <Images size={22} strokeWidth={1.5} />}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: C.onSecondaryFixedVar }}>
            <Plus size={18} strokeWidth={2} />
            <span style={{ fontSize: 9, fontWeight: 600 }}>Zuweisen</span>
          </div>
        )}

        {/* Hover-Overlay über gefüllten Slots */}
        {filled && hovered && !disabled && (
          <div style={{
            position: "absolute", inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, fontWeight: 700, color: "#fff",
            letterSpacing: "0.05em", textTransform: "uppercase",
          }}>
            Ersetzen
          </div>
        )}
      </button>
      <div
        title={fileName ?? undefined}
        style={{
          fontSize: 9, marginTop: 5,
          fontFamily: "monospace",
          color: filled ? C.onSurfaceVariant : C.onSecondaryFixedVar,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          opacity: filled ? 1 : 0.6,
        }}
      >
        {fileName ?? "—"}
      </div>
    </div>
  );
}

function fileNameOf(path: string | null): string | null {
  if (!path) return null;
  return path.split(/[/\\]/).filter(Boolean).pop() ?? null;
}
