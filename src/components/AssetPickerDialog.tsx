// src/components/AssetPickerDialog.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Pick a single asset from the export inbox and move it into a target folder.
// Filtered per slot: the Cover slot shows images with "cover" in the name,
// the Thumbnail slot images with "thumb", the Video slot video files.
// No group detection — every file is picked individually.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from "react";
import {
  X, Search, Loader2, Image as ImageIcon, Film,
} from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { C } from "../lib/theme";
import { api } from "../lib/api";
import type { AssetFile } from "../types/studio";

export type AssetSlotKind = "cover" | "thumbnail" | "video";

const SLOT_META: Record<AssetSlotKind, { label: string; aspect: string; empty: string }> = {
  cover:     { label: "Cover",     aspect: "1 / 1",  empty: "Kein Bild mit \"cover\" im Namen im Asset-Ordner." },
  thumbnail: { label: "Thumbnail", aspect: "16 / 9", empty: "Kein Bild mit \"thumbnail\" im Namen im Asset-Ordner." },
  video:     { label: "Video",     aspect: "16 / 9", empty: "Kein Video im Asset-Ordner." },
};

/** True if this inbox file belongs into the given slot. */
function matchesSlot(a: AssetFile, slot: AssetSlotKind): boolean {
  if (slot === "video") return a.kind === "video";
  if (a.kind !== "image") return false;
  const n = a.name.toLowerCase();
  return slot === "thumbnail" ? n.includes("thumb") : n.includes("cover");
}

interface AssetPickerDialogProps {
  /** Ordner, in den die Datei verschoben wird (Beat-/Projektordner) */
  targetDir: string;
  /** Konfigurierter Asset-Ordner (Guard im Backend) */
  assetRoot: string;
  slot: AssetSlotKind;
  title?: string;
  onAssigned: (count: number) => void;
  onClose: () => void;
}

export function AssetPickerDialog({
  targetDir, assetRoot, slot, title = "Asset zuweisen", onAssigned, onClose,
}: AssetPickerDialogProps) {
  const [assets, setAssets] = useState<AssetFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const meta = SLOT_META[slot];

  const scan = useCallback(async () => {
    if (!assetRoot.trim()) {
      setError("Kein Asset-Pfad gesetzt — in den Settings unter 'Asset Path' den Export-Ordner wählen.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      setAssets(await api.studio.scanAssetInbox(assetRoot));
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, [assetRoot]);

  useEffect(() => { scan(); }, [scan]);

  // Escape schließt
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const visible = assets.filter(a => {
    if (!matchesSlot(a, slot)) return false;
    if (query.trim() && !a.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
    return true;
  });
  visible.sort((a, b) => b.modified_secs - a.modified_secs);

  const assign = async (file: AssetFile) => {
    setBusy(true);
    try {
      await api.studio.assignAsset(file.path, assetRoot, targetDir);
      onAssigned(1);
      onClose();
    } catch (e) {
      setError(`Zuweisen fehlgeschlagen: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 110,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.surfaceContainerHigh,
          borderRadius: 16,
          width: 720, maxWidth: "92vw",
          maxHeight: "86vh",
          display: "flex", flexDirection: "column",
          border: `1px solid ${C.border20}`,
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "16px 20px",
          borderBottom: `1px solid ${C.border10}`,
        }}>
          {slot === "video"
            ? <Film size={15} color={C.primary} strokeWidth={2} />
            : <ImageIcon size={15} color={C.primary} strokeWidth={2} />}
          <span style={{ fontSize: 14, fontWeight: 700, color: C.onSurface }}>{title}</span>
          <span style={{ fontSize: 10, color: C.onSecondaryFixedVar }}>
            → {targetDir.split(/[/\\]/).filter(Boolean).pop()}
          </span>
          <div style={{ flex: 1 }} />
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: C.surfaceContainerLowest,
            border: `1px solid ${C.border15}`,
            borderRadius: 8, padding: "6px 10px", width: 200,
          }}>
            <Search size={12} color={C.onSecondaryFixedVar} />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Datei suchen…"
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: C.onSurface, fontSize: 12 }}
            />
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: C.onSurfaceVariant, display: "flex", padding: 4 }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {error && (
            <div style={{
              padding: "12px 14px", borderRadius: 8, marginBottom: 14,
              background: "rgba(229,72,77,0.10)", border: "1px solid rgba(229,72,77,0.35)",
              fontSize: 12, color: "#e5484d",
            }}>
              {error}
            </div>
          )}

          {isLoading && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 40, fontSize: 12, color: C.onSurfaceVariant }}>
              <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> Inbox wird gelesen…
            </div>
          )}

          {!isLoading && !error && visible.length === 0 && (
            <div style={{ padding: "40px 20px", textAlign: "center", fontSize: 12, color: C.onSurfaceVariant, lineHeight: 1.6 }}>
              {query.trim() ? "Keine Datei passt zur Suche." : meta.empty}
            </div>
          )}

          {visible.length > 0 && (
            <div style={{
              display: "grid",
              gridTemplateColumns: slot === "cover"
                ? "repeat(auto-fill, minmax(150px, 1fr))"
                : "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 12,
            }}>
              {visible.map(a => (
                <FileCard key={a.path} asset={a} aspect={meta.aspect} busy={busy} onAssign={() => assign(a)} />
              ))}
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Ein Datei-Card ──────────────────────────────────────────────────────────

function FileCard({ asset, aspect, busy, onAssign }: {
  asset: AssetFile;
  aspect: string;
  busy: boolean;
  onAssign: () => void;
}) {
  return (
    <button
      onClick={onAssign}
      disabled={busy}
      title={asset.name}
      style={{
        background: C.surfaceContainerLowest,
        border: `1px solid ${C.border15}`,
        borderRadius: 10,
        overflow: "hidden",
        cursor: busy ? "wait" : "pointer",
        padding: 0, textAlign: "left",
        transition: "border-color 0.15s, transform 0.12s",
      }}
      onMouseEnter={e => { if (!busy) { e.currentTarget.style.borderColor = C.primary + "60"; e.currentTarget.style.transform = "translateY(-2px)"; } }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border15; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      <div style={{
        aspectRatio: aspect,
        background: C.surfaceContainerHigh,
        display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden",
      }}>
        {asset.kind === "image"
          ? <AssetImage path={asset.path} />
          : <Film size={26} color={C.onSecondaryFixedVar} strokeWidth={1.25} />
        }
      </div>
      <div style={{
        fontSize: 10, fontFamily: "monospace", color: C.onSurface,
        padding: "8px 10px",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {asset.name}
      </div>
    </button>
  );
}

/** Image via asset protocol, base64 fallback; whole image visible (contain). */
function AssetImage({ path }: { path: string }) {
  const [src, setSrc] = useState<string>(() => convertFileSrc(path.replace(/\\/g, "/")));
  const [failed, setFailed] = useState(false);
  const triedBase64 = useRef(false);

  const handleError = async () => {
    if (triedBase64.current) { setFailed(true); return; }
    triedBase64.current = true;
    try {
      setSrc(await api.create.readImageFile(path));
    } catch {
      setFailed(true);
    }
  };

  if (failed) {
    return <ImageIcon size={26} color={C.onSecondaryFixedVar} strokeWidth={1.25} />;
  }
  return (
    <img
      src={src}
      onError={handleError}
      alt=""
      loading="lazy"
      decoding="async"
      style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
    />
  );
}
