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
  FolderOpen, FolderTree, RefreshCw, Wand2, ChevronDown, ListChecks, X,
} from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { convertFileSrc } from "@tauri-apps/api/core";
import { C } from "../../lib/theme";
import { SectionCard, SectionIconBtn } from "../ui/SectionCard";
import { api } from "../../lib/api";
import type { AssetCheck } from "../../types/upload";

interface AssetChecklistCardProps {
  assets: AssetCheck;
  beatPath: string;
  onRefresh: () => void;
  onConvert: () => void;
  /** Ohne eigene Karte rendern — haengt im Upload-Tab unter der Kopfzeile. */
  bare?: boolean;
}

type Row = {
  label: string;
  filename: string | null;
  icon: React.ElementType;
};

export function AssetChecklistCard({ assets, beatPath, onRefresh, onConvert, bare = false }: AssetChecklistCardProps) {
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

  // Image preview overlay (Cover / Thumbnail rows)
  const [preview, setPreview] = useState<{ label: string; path: string } | null>(null);

  const handleRowClick = (row: Row) => {
    if (!row.filename || !beatPath) return;
    // Trenner aus dem Pfad selbst ablesen statt fest annehmen: die Bibliothek
    // kann unter Windows wie unter macOS liegen, und „/pfad\datei.wav" ist
    // auf keinem von beiden ein Pfad.
    const sep = beatPath.includes("\\") ? "\\" : "/";
    const fullPath = `${beatPath}${sep}${row.filename}`;
    if (row.label === "Cover" || row.label === "Thumbnail") {
      setPreview({ label: row.label, path: fullPath });
    } else if (row.label === "Video MP4") {
      revealItemInDir(fullPath).catch(() => {});
    }
  };

  const handleOpen = async () => {
    if (!beatPath) return;
    try { await revealItemInDir(beatPath); } catch {}
  };

  const body = (
    <>
      {/* Fortschritt statt Statuszeile: ein Segment je Datei, gefüllt was da
          ist. Man sieht die Lücke, statt sie aus „4/6" zu erschließen — und
          beim Ablegen der nächsten Datei füllt sich sichtbar eins mehr.
          Daneben die Aktionen mit Beschriftung: „Namen konvertieren" lag
          vorher im zugeklappten Teil und war praktisch unauffindbar. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={() => setOpen(o => !o)}
          title={open ? "Liste zuklappen" : "Alle Dateien zeigen"}
          style={{
            flex: 1, minWidth: 0,
            display: "flex", alignItems: "center", gap: 12,
            padding: "9px 12px",
            background: "transparent",
            border: `1px solid ${C.border15}`,
            borderRadius: 8,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span style={{ display: "flex", gap: 3, flexShrink: 0 }}>
            {allRows.map(r => (
              <span
                key={r.label}
                title={r.filename ? `${r.label}: ${r.filename}` : `${r.label} fehlt`}
                style={{
                  width: 22, height: 5, borderRadius: 3,
                  background: r.filename ? C.mint : C.border20,
                }}
              />
            ))}
          </span>

          <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: allOk ? C.mint : C.onSurface }}>
            {allOk
              ? "Alle Dateien da"
              : `${present.length} von ${allRows.length} — es fehlt ${missing.map(m => m.label).join(", ")}`
            }
          </span>

          <ChevronDown
            size={13}
            color={C.onSecondaryFixedVar}
            style={{ transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "rotate(0)" }}
          />
        </button>

        {/* Im rahmenlosen Modus tragen die Aktionen keine Kartenkopfzeile mehr
            — sie stehen direkt neben dem Fortschritt. */}
        {bare && (
          <>
            <button
              onClick={onConvert}
              title="Dateinamen im Beat-Ordner auf das Namensschema bringen"
              style={{
                display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
                padding: "8px 12px", borderRadius: 7,
                background: "transparent",
                border: `1px solid ${C.border20}`,
                color: C.onSurfaceVariant, cursor: "pointer",
                fontSize: 11, fontWeight: 600, fontFamily: "inherit",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.border30; e.currentTarget.style.color = C.onSurface; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border20; e.currentTarget.style.color = C.onSurfaceVariant; }}
            >
              <Wand2 size={12} strokeWidth={2} />
              Namen konvertieren
            </button>
            <SectionIconBtn icon={RefreshCw} title="Ordner neu scannen" onClick={onRefresh} />
            <SectionIconBtn icon={FolderOpen} title="Beat-Ordner öffnen" onClick={handleOpen} />
          </>
        )}
      </div>

      {open && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 3 }}>
          {/* Missing first — that's what needs attention */}
          {[...missing, ...present].map(row => (
            <AssetRow key={row.label} {...row} onClick={() => handleRowClick(row)} />
          ))}

          {/* Nur in der Kartenansicht: rahmenlos steht der Knopf oben
              neben dem Fortschritt, wo man ihn auch findet. */}
          {!bare && (
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
            )}
        </div>
      )}

      {/* Image preview overlay */}
      {preview && (
        <div
          onClick={() => setPreview(null)}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 100, cursor: "zoom-out",
          }}
        >
          <div style={{ position: "relative", maxWidth: "80vw", maxHeight: "82vh" }}>
            <PreviewImage path={preview.path} />
            <div style={{
              position: "absolute", top: -34, left: 0, right: 0,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.onSurface, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                {preview.label}
              </span>
              <span style={{ flex: 1 }} />
              <X size={16} color={C.onSurfaceVariant} />
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (bare) return body;

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
      {body}
    </SectionCard>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Full-size preview via asset protocol, base64 fallback outside the scope. */
function PreviewImage({ path }: { path: string }) {
  const [src, setSrc] = useState<string>(() => convertFileSrc(path.replace(/\\/g, "/")));
  const [triedBase64, setTriedBase64] = useState(false);

  const handleError = async () => {
    if (triedBase64) return;
    setTriedBase64(true);
    try { setSrc(await api.create.readImageFile(path)); } catch { /* bleibt leer */ }
  };

  return (
    <img
      src={src}
      onError={handleError}
      alt=""
      style={{
        maxWidth: "80vw", maxHeight: "82vh",
        borderRadius: 10, border: `1px solid ${C.border30}`,
        boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        display: "block",
      }}
    />
  );
}

function AssetRow({ label, filename, icon: Icon, onClick }: Row & { onClick?: () => void }) {
  const ok = filename !== null;
  const clickable = ok && (label === "Cover" || label === "Thumbnail" || label === "Video MP4");
  return (
    <div
      onClick={clickable ? onClick : undefined}
      title={clickable ? (label === "Video MP4" ? "Im Explorer zeigen" : "Vorschau anzeigen") : undefined}
      style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "7px 10px",
      background: ok ? C.surfaceContainerLowest : "rgba(255,115,81,0.04)",
      border: `1px solid ${ok ? C.border10 : "rgba(255,115,81,0.20)"}`,
      borderRadius: 7,
      cursor: clickable ? "pointer" : "default",
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
