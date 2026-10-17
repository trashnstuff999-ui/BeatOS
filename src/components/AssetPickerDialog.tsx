// src/components/AssetPickerDialog.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Pick a single asset from the export inbox and move it into a target folder.
// Gefiltert pro Slot: der Video-Slot zeigt Videos, die Bild-Slots zeigen Bilder
// mit passendem Marker im Namen ("cover"/"thumb") — und zusätzlich alle Bilder
// ohne Marker, denn das ist der Normalfall und sonst wären sie unerreichbar.
// Keine Gruppenerkennung — jede Datei wird einzeln gewählt.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search, Loader2, Image as ImageIcon, Film,
} from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { C, radius, alpha } from "../lib/theme";
import { Modal, Button } from "./ui";
import { api } from "../lib/api";
import type { AssetFile } from "../types/studio";

export type AssetSlotKind = "cover" | "thumbnail" | "video";

const SLOT_META: Record<AssetSlotKind, { label: string; aspect: string; empty: string }> = {
  cover:     { label: "Cover",     aspect: "1 / 1",  empty: "Kein Bild im Asset-Ordner." },
  thumbnail: { label: "Thumbnail", aspect: "16 / 9", empty: "Kein Bild im Asset-Ordner." },
  video:     { label: "Video",     aspect: "16 / 9", empty: "Kein Video im Asset-Ordner." },
};

/** True if this inbox file belongs into the given slot. */
function matchesSlot(a: AssetFile, slot: AssetSlotKind): boolean {
  if (slot === "video") return a.kind === "video";
  if (a.kind !== "image") return false;
  const n = a.name.toLowerCase();
  const isThumb = n.includes("thumb");
  const isCover = n.includes("cover");
  // Ein Bild ohne Marker im Namen — der Normalfall bei Photoshop-Exporten —
  // gehört in beide Bild-Slots. Filterte man streng nach dem Namen, wäre so
  // eine Datei in der ganzen App nicht zuweisbar.
  if (!isThumb && !isCover) return true;
  return slot === "thumbnail" ? isThumb : isCover;
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
      setError("Kein Asset-Pfad gesetzt — in den Einstellungen unter „Pfade“ den Export-Ordner wählen.");
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

  const visible = assets.filter(a => {
    if (!matchesSlot(a, slot)) return false;
    if (query.trim() && !a.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
    return true;
  });
  // Namenstreffer zuerst ("… cover.png" für den Cover-Slot), dann das Neueste
  const named = (a: AssetFile) => (a.guessed_role === slot ? 0 : 1);
  visible.sort((a, b) => named(a) - named(b) || b.modified_secs - a.modified_secs);

  const assign = async (file: AssetFile) => {
    setBusy(true);
    try {
      await api.studio.assignAsset(file.path, assetRoot, targetDir, slot);
      onAssigned(1);
      onClose();
    } catch (e) {
      setError(`Zuweisen fehlgeschlagen: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      icon={slot === "video" ? Film : ImageIcon}
      title={title}
      subtitle={`→ ${targetDir.split(/[/\\]/).filter(Boolean).pop()}`}
      onClose={onClose}
      width={720}
      footerLeft={
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: C.surfaceContainer,
          border: `1px solid ${C.border15}`,
          borderRadius: radius.control, padding: "6px 10px", width: 220,
        }}>
          <Search size={12} color={C.onSecondaryFixedVar} />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Datei suchen …"
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              color: C.onSurface, fontSize: 12, fontFamily: "inherit",
            }}
          />
        </div>
      }
      footer={<Button variant="secondary" onClick={onClose}>Schließen</Button>}
    >
      {error && (
        <div style={{
          padding: "12px 14px", borderRadius: radius.control,
          background: alpha(C.error, 0.10), border: `1px solid ${alpha(C.error, 0.35)}`,
          fontSize: 12, color: C.error,
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
    </Modal>
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
        background: C.surfaceContainerHighest,
        border: `1px solid ${C.border15}`,
        borderRadius: radius.card,
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
          : <AssetVideo path={asset.path} />
        }
      </div>
      <div style={{
        fontSize: 11, fontFamily: "monospace", color: C.onSurface,
        padding: "8px 10px",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {asset.name}
      </div>
    </button>
  );
}

/** Image via asset protocol, base64 fallback. Standard: ganz sichtbar
 *  (contain) — zum Aussuchen. Die Slots füllen randlos (cover).
 *  Auch von der Studio-Inbox genutzt. */
export function AssetImage({ path, fit = "contain" }: { path: string; fit?: "contain" | "cover" }) {
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
      style={{ width: "100%", height: "100%", objectFit: fit, display: "block" }}
    />
  );
}

/** Erstes Bild eines Videos statt eines Film-Symbols. Lädt nur die Metadaten;
 *  `#t=1` springt hinter das Schwarzbild, mit dem viele Videos anfangen. Kann der
 *  WebView das Format nicht (manche .mov), bleibt das Symbol. */
export function AssetVideo({ path, fit = "contain" }: { path: string; fit?: "contain" | "cover" }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <Film size={26} color={C.onSecondaryFixedVar} strokeWidth={1.25} />;
  }
  return (
    <video
      src={`${convertFileSrc(path.replace(/\\/g, "/"))}#t=1`}
      preload="metadata"
      muted
      playsInline
      onError={() => setFailed(true)}
      style={{ width: "100%", height: "100%", objectFit: fit, display: "block", pointerEvents: "none" }}
    />
  );
}
