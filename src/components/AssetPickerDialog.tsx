// src/components/AssetPickerDialog.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Pick assets from the export inbox and move them into a target folder.
// Groups (Cover_17 + Thumbnail_17 …) are assigned in one click; singles can
// be picked individually. Used by the Create tab so covers get attached
// before archiving — the Studio assets tab keeps its own batch view.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from "react";
import {
  X, Search, Loader2, Image as ImageIcon, Film, Layers, FolderInput, Check,
} from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { C } from "../lib/theme";
import { api } from "../lib/api";
import { groupAssets, type AssetGroup } from "../lib/assetGroups";
import type { AssetFile } from "../types/studio";

const ROLE_META: Record<AssetFile["guessed_role"], { label: string; color: string }> = {
  cover:     { label: "Cover",     color: "#34d399" },
  thumbnail: { label: "Thumbnail", color: "#9492ff" },
  video:     { label: "Video",     color: "#ff7351" },
  image:     { label: "Bild",      color: "#8a8a89" },
};

interface AssetPickerDialogProps {
  /** Ordner, in den die Dateien verschoben werden (Beat-/Projektordner) */
  targetDir: string;
  /** Konfigurierter Asset-Ordner (Guard im Backend) */
  assetRoot: string;
  /** null = alles zeigen, "video" = nur Videos, "image" = nur Bilder */
  filterKind?: "image" | "video" | null;
  title?: string;
  onAssigned: (count: number) => void;
  onClose: () => void;
}

export function AssetPickerDialog({
  targetDir, assetRoot, filterKind = null, title = "Assets zuweisen", onAssigned, onClose,
}: AssetPickerDialogProps) {
  const [assets, setAssets] = useState<AssetFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

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
    if (filterKind && a.kind !== filterKind) return false;
    if (query.trim() && !a.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
    return true;
  });
  const { groups, singles } = groupAssets(visible);

  const assign = async (files: AssetFile[]) => {
    setBusy(true);
    try {
      for (const f of files) {
        await api.studio.assignAsset(f.path, assetRoot, targetDir);
      }
      onAssigned(files.length);
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
          <FolderInput size={15} color={C.primary} strokeWidth={2} />
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
              {query.trim()
                ? "Keine Datei passt zur Suche."
                : filterKind === "video"
                  ? "Kein Video im Asset-Ordner."
                  : "Inbox ist leer. Exporte aus Photoshop / Premiere landen hier."}
            </div>
          )}

          {/* Gruppen zuerst */}
          {groups.length > 0 && (
            <>
              <SectionLabel>Gruppen — ein Klick weist alles zu</SectionLabel>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                gap: 12, marginBottom: 20,
              }}>
                {groups.map(g => (
                  <GroupCard key={g.key} group={g} busy={busy} onAssign={() => assign(g.items)} />
                ))}
              </div>
            </>
          )}

          {/* Einzeldateien */}
          {singles.length > 0 && (
            <>
              <SectionLabel>Einzelne Dateien</SectionLabel>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                gap: 10,
              }}>
                {singles.map(a => (
                  <SingleCard key={a.path} asset={a} busy={busy} onAssign={() => assign([a])} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Bausteine ───────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
      textTransform: "uppercase", color: C.onSecondaryFixedVar,
      marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

function GroupCard({ group, busy, onAssign }: { group: AssetGroup; busy: boolean; onAssign: () => void }) {
  const roleOrder = { cover: 0, thumbnail: 1, image: 2, video: 3 };
  const items = [...group.items].sort((a, b) => roleOrder[a.guessed_role] - roleOrder[b.guessed_role]);

  return (
    <button
      onClick={onAssign}
      disabled={busy}
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
      <div style={{ display: "flex", gap: 1, height: 110, background: C.surfaceContainerHigh }}>
        {items.slice(0, 3).map(item => (
          <div key={item.path} style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            {item.kind === "image"
              ? <AssetImage path={item.path} />
              : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Film size={22} color={C.onSecondaryFixedVar} strokeWidth={1.25} />
                </div>
            }
            <span style={{
              position: "absolute", bottom: 4, left: 4,
              fontSize: 7, fontWeight: 700, letterSpacing: "0.05em",
              padding: "1px 5px", borderRadius: 3, textTransform: "uppercase",
              background: "rgba(0,0,0,0.7)",
              color: ROLE_META[item.guessed_role].color,
            }}>
              {ROLE_META[item.guessed_role].label}
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px" }}>
        <Layers size={12} color={C.primary} strokeWidth={2} />
        <span style={{ fontSize: 12, fontWeight: 700, color: C.onSurface }}>Gruppe {group.key}</span>
        <span style={{ fontSize: 10, color: C.onSecondaryFixedVar }}>{group.items.length} Dateien</span>
        <span style={{
          marginLeft: "auto", display: "flex", alignItems: "center", gap: 4,
          fontSize: 10, fontWeight: 700, color: C.primary,
        }}>
          {busy ? <Loader2 size={11} style={{ animation: "spin 0.8s linear infinite" }} /> : <Check size={11} strokeWidth={2.5} />}
          Zuweisen
        </span>
      </div>
    </button>
  );
}

function SingleCard({ asset, busy, onAssign }: { asset: AssetFile; busy: boolean; onAssign: () => void }) {
  const role = ROLE_META[asset.guessed_role];
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
      <div style={{ height: 88, background: C.surfaceContainerHigh, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {asset.kind === "image"
          ? <AssetImage path={asset.path} />
          : <Film size={22} color={C.onSecondaryFixedVar} strokeWidth={1.25} />
        }
      </div>
      <div style={{ padding: "8px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{
            fontSize: 8, fontWeight: 700, letterSpacing: "0.05em",
            padding: "1px 5px", borderRadius: 9999, textTransform: "uppercase",
            background: `${role.color}18`, color: role.color, flexShrink: 0,
          }}>
            {role.label}
          </span>
        </div>
        <div style={{
          fontSize: 10, fontFamily: "monospace", color: C.onSurface, marginTop: 5,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {asset.name}
        </div>
      </div>
    </button>
  );
}

/** Image via asset protocol, base64 fallback when the path is outside scope. */
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
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <ImageIcon size={22} color={C.onSecondaryFixedVar} strokeWidth={1.25} />
      </div>
    );
  }
  return (
    <img
      src={src}
      onError={handleError}
      alt=""
      loading="lazy"
      decoding="async"
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
    />
  );
}
