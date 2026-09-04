// src/components/BeatAssetsCard.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Cover / Thumbnail / Video slots for a beat or studio-project folder.
// Assigning opens the shared AssetPickerDialog (moves the file out of the
// asset inbox into the folder). Used by the Create tab (before archiving)
// and the Studio assets tab (for the selected project).
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { Images, Film, Plus, RefreshCw, Loader2, AlertTriangle } from "lucide-react";
import { C } from "../lib/theme";
import { SectionCard } from "./ui/SectionCard";
import { AssetPickerDialog, type AssetSlotKind } from "./AssetPickerDialog";
import type { FolderAssets } from "../hooks/useFolderAssets";

const SLOT_TITLE: Record<AssetSlotKind, string> = {
  cover: "Cover", thumbnail: "Thumbnail", video: "Video",
};

interface BeatAssetsCardProps {
  assets: FolderAssets;
  /** Ordner (Ziel der Zuweisung) — null solange kein Ordner gewählt ist */
  folderPath: string | null;
  assetPath: string;
  isRefreshing: boolean;
  onRefresh: () => void;
  title?: string;
  /** Create: Hinweis, dass beim Archivieren nachgefragt wird. Studio: aus. */
  showArchiveWarning?: boolean;
  /** Karten-Chrome anpassen — der Studio-Inspector nimmt sie ganz weg. */
  style?: React.CSSProperties;
}

export function BeatAssetsCard({
  assets, folderPath, assetPath, isRefreshing, onRefresh,
  title = "Cover & Assets", showArchiveWarning = true, style,
}: BeatAssetsCardProps) {
  const [picker, setPicker] = useState<null | { slot: AssetSlotKind }>(null);

  const noFolder = !folderPath;
  const noAssetPath = !assetPath.trim();
  const missingCover = !assets.coverPath;

  return (
    <SectionCard
      icon={Images}
      title={title}
      style={style}
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
      {/* Warnhinweis, solange kein Cover da ist (nur im Create-Flow) */}
      {showArchiveWarning && !noFolder && missingCover && (
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

      {/* Cover (1:1) links groß, Thumbnail + Video (16:9) rechts gestapelt.
          Die Cover-Spalte ist breiter, damit das Quadrat so hoch wird wie
          die zwei 16:9-Slots — und der Cover-Slot füllt die volle Zellenhöhe,
          sodass die Unterkanten links/rechts exakt bündig sind. */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 10, alignItems: "stretch" }}>
        <AssetSlot
          label="Cover"
          fill
          preview={assets.coverPreview}
          fileName={fileNameOf(assets.coverPath)}
          disabled={noFolder || noAssetPath}
          onPick={() => setPicker({ slot: "cover" })}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <AssetSlot
            label="Thumbnail"
            aspect="16 / 9"
            preview={assets.thumbnailPreview}
            fileName={fileNameOf(assets.thumbnailPath)}
            disabled={noFolder || noAssetPath}
            onPick={() => setPicker({ slot: "thumbnail" })}
          />
          <AssetSlot
            label="Video"
            aspect="16 / 9"
            preview={null}
            icon={Film}
            fileName={fileNameOf(assets.videoPath)}
            disabled={noFolder || noAssetPath}
            onPick={() => setPicker({ slot: "video" })}
          />
        </div>
      </div>

      <div style={{ fontSize: 10, color: C.onSecondaryFixedVar, marginTop: 10, lineHeight: 1.5 }}>
        {noFolder
          ? "Erst einen Ordner wählen."
          : noAssetPath
            ? "Kein Asset-Pfad in den Settings gesetzt — dort den Media-Ordner eintragen."
            : "Die gewählte Datei wandert in den Projektordner."}
      </div>

      {picker && folderPath && (
        <AssetPickerDialog
          targetDir={folderPath}
          assetRoot={assetPath}
          slot={picker.slot}
          title={`${SLOT_TITLE[picker.slot]} zuweisen`}
          onAssigned={() => onRefresh()}
          onClose={() => setPicker(null)}
        />
      )}
    </SectionCard>
  );
}

// ─── Ein Slot ────────────────────────────────────────────────────────────────

function AssetSlot({ label, aspect, fill, preview, fileName, icon: Icon, disabled, onPick }: {
  label: string;
  /** Festes Seitenverhältnis (z.B. "16 / 9"); ignoriert wenn fill gesetzt ist */
  aspect?: string;
  /** Füllt die volle Höhe der Grid-Zelle statt eines festen Seitenverhältnisses */
  fill?: boolean;
  preview: string | null;
  fileName: string | null;
  icon?: React.ElementType;
  disabled: boolean;
  onPick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const filled = Boolean(fileName);

  return (
    <div style={fill ? { display: "flex", flexDirection: "column", height: "100%" } : undefined}>
      {/* Feldbeschriftung, nicht Abschnittsüberschrift: GROSSBUCHSTABEN sind in
          diesem Panel für Abschnitte reserviert. Standen beide gleich da, las
          sich der Slot als eigener Abschnitt. */}
      <div style={{
        fontSize: 10, fontWeight: 600,
        color: C.onSecondaryFixedVar,
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
          width: "100%",
          ...(fill ? { flex: 1, minHeight: 180 } : { aspectRatio: aspect }),
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
          <img src={preview} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
        ) : filled ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: C.mint }}>
            {Icon ? <Icon size={22} strokeWidth={1.5} /> : <Images size={22} strokeWidth={1.5} />}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: C.onSecondaryFixedVar }}>
            <Plus size={18} strokeWidth={2} />
            <span style={{ fontSize: 10, fontWeight: 600 }}>Zuweisen</span>
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
      {/* Kein Platzhalter-Strich unter leeren Slots — drei Gedankenstriche
          sagten nichts, was der gestrichelte Rahmen nicht schon sagt. */}
      {filled && (
        <div
          title={fileName ?? undefined}
          style={{
            fontSize: 10, marginTop: 5,
            fontFamily: "monospace",
            color: C.onSurfaceVariant,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >
          {fileName}
        </div>
      )}
    </div>
  );
}

function fileNameOf(path: string | null): string | null {
  if (!path) return null;
  return path.split(/[/\\]/).filter(Boolean).pop() ?? null;
}
