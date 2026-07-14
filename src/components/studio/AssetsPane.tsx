// src/components/studio/AssetsPane.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Studio → Assets: the export inbox (Photoshop/Premiere drop covers,
// thumbnails and videos into the configured asset folder). Each asset can be
// assigned to a project — the file is MOVED into the project folder root so
// the Create-tab parser picks it up and archives it with the beat.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from "react";
import { Image as ImageIcon, Film, RefreshCw, Loader2, Search, FolderInput, Check } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { C } from "../../lib/theme";
import { api } from "../../lib/api";
import type { AssetFile, StudioProject } from "../../types/studio";

const ROLE_META: Record<AssetFile["guessed_role"], { label: string; color: string }> = {
  cover:     { label: "Cover",     color: "#34d399" },
  thumbnail: { label: "Thumbnail", color: "#9492ff" },
  video:     { label: "Video",     color: "#ff7351" },
  image:     { label: "Bild",      color: "#8a8a89" },
};

interface AssetsPaneProps {
  assetPath: string;
  projects: StudioProject[];
  /** parent bumps project scan after an assignment (asset flags change) */
  onAssigned: () => void;
}

export function AssetsPane({ assetPath, projects, onAssigned }: AssetsPaneProps) {
  const [assets, setAssets] = useState<AssetFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [openFor, setOpenFor] = useState<string | null>(null); // asset path with open assign popover

  const scan = useCallback(async () => {
    if (!assetPath.trim()) {
      setAssets([]);
      setError("Kein Asset-Pfad gesetzt — in den Settings unter 'Asset Path' den Export-Ordner wählen.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      setAssets(await api.studio.scanAssetInbox(assetPath));
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, [assetPath]);

  useEffect(() => { scan(); }, [scan]);

  const handleAssign = async (asset: AssetFile, project: StudioProject) => {
    try {
      await api.studio.assignAsset(asset.path, assetPath, project.path);
      setOpenFor(null);
      setToast(`${asset.name} → ${project.parsed_name || project.name}`);
      setTimeout(() => setToast(null), 2600);
      scan();
      onAssigned();
    } catch (e) {
      alert(`Zuweisen fehlgeschlagen: ${String(e)}`);
    }
  };

  return (
    <div style={{
      background: C.surfaceContainerLow,
      border: `1px solid ${C.border10}`,
      borderRadius: 12,
      overflow: "visible",
    }}>
      {/* Toolbar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 16px",
        borderBottom: `1px solid ${C.border10}`,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.onSurface }}>
          {assets.length} Assets in der Inbox
        </span>
        <span title={assetPath} style={{ fontSize: 10, color: C.onSecondaryFixedVar, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 320 }}>
          {assetPath || "—"}
        </span>
        <div style={{ flex: 1 }} />
        {toast && (
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.mint }}>
            <Check size={12} strokeWidth={2.5} /> {toast}
          </span>
        )}
        <button
          onClick={scan}
          disabled={isLoading}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 12px", borderRadius: 6,
            background: "transparent", border: `1px solid ${C.border15}`,
            color: C.onSurfaceVariant, cursor: "pointer",
            fontSize: 10, fontWeight: 600,
          }}
        >
          {isLoading
            ? <Loader2 size={11} style={{ animation: "spin 0.8s linear infinite" }} />
            : <RefreshCw size={11} />}
          Scan
        </button>
      </div>

      {error && <div style={{ padding: "14px 16px", fontSize: 12, color: C.error }}>{error}</div>}

      {!error && !isLoading && assets.length === 0 && (
        <div style={{ padding: "40px 16px", textAlign: "center", fontSize: 12, color: C.onSurfaceVariant, lineHeight: 1.6 }}>
          Inbox ist leer. Exporte aus Photoshop / Premiere Pro, die in deinem
          Asset-Ordner landen, erscheinen hier — und lassen sich dann einem
          Projekt zuweisen (die Datei wandert in den Projektordner).
        </div>
      )}

      {/* Asset grid */}
      {assets.length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
          gap: 12,
          padding: 16,
        }}>
          {assets.map(a => (
            <AssetCard
              key={a.path}
              asset={a}
              projects={projects}
              isOpen={openFor === a.path}
              onToggle={() => setOpenFor(openFor === a.path ? null : a.path)}
              onAssign={p => handleAssign(a, p)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Asset card with assign popover ─────────────────────────────────────────

function AssetCard({ asset, projects, isOpen, onToggle, onAssign }: {
  asset: AssetFile;
  projects: StudioProject[];
  isOpen: boolean;
  onToggle: () => void;
  onAssign: (p: StudioProject) => void;
}) {
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const role = ROLE_META[asset.guessed_role];

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) onToggle();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const filtered = projects.filter(p =>
    !query.trim() || (p.parsed_name || p.name).toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div style={{
        background: C.surfaceContainerLowest,
        border: `1px solid ${C.border15}`,
        borderRadius: 10,
        overflow: "hidden",
      }}>
        {/* Preview */}
        <div style={{
          height: 110,
          background: C.surfaceContainerHigh,
          display: "flex", alignItems: "center", justifyContent: "center",
          overflow: "hidden",
        }}>
          {asset.kind === "image" ? (
            <AssetImage path={asset.path} />
          ) : (
            <Film size={26} color={C.onSecondaryFixedVar} strokeWidth={1.25} />
          )}
        </div>

        {/* Info */}
        <div style={{ padding: "8px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              fontSize: 8, fontWeight: 700, letterSpacing: "0.06em",
              padding: "1px 6px", borderRadius: 9999, textTransform: "uppercase",
              background: `${role.color}18`, color: role.color, flexShrink: 0,
            }}>
              {role.label}
            </span>
            <span title={asset.name} style={{
              flex: 1, minWidth: 0, fontSize: 10, color: C.onSurface,
              fontFamily: "monospace",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {asset.name}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
            <span style={{ fontSize: 9, color: C.onSecondaryFixedVar }}>
              {formatSize(asset.size)}{asset.modified_date ? ` · ${asset.modified_date}` : ""}
            </span>
            <div style={{ flex: 1 }} />
            <button
              onClick={onToggle}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "4px 9px", borderRadius: 6,
                background: isOpen ? C.primary + "20" : "transparent",
                border: `1px solid ${isOpen ? C.primary + "50" : C.border20}`,
                color: isOpen ? C.primary : C.onSurfaceVariant,
                cursor: "pointer",
                fontSize: 9, fontWeight: 700,
              }}
            >
              <FolderInput size={10} strokeWidth={2} />
              Zuweisen
            </button>
          </div>
        </div>
      </div>

      {/* Assign popover */}
      {isOpen && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0,
          marginTop: 4,
          background: C.surfaceContainer,
          border: `1px solid ${C.border20}`,
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          zIndex: 20,
          maxHeight: 240,
          display: "flex", flexDirection: "column",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderBottom: `1px solid ${C.border10}` }}>
            <Search size={11} color={C.onSurfaceVariant} />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Projekt suchen…"
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: C.onSurface, fontSize: 11 }}
            />
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {filtered.length === 0 && (
              <div style={{ padding: 12, fontSize: 10, color: C.onSurfaceVariant, textAlign: "center" }}>
                Kein Projekt gefunden.
              </div>
            )}
            {filtered.map(p => (
              <button
                key={p.path}
                onClick={() => onAssign(p)}
                style={{
                  width: "100%",
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 10px",
                  background: "transparent", border: "none",
                  borderBottom: `1px solid ${C.border10}`,
                  cursor: "pointer", textAlign: "left",
                  fontSize: 11, color: C.onSurface,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = C.surfaceContainerHigh; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.parsed_name || p.name}
                </span>
                {p.key && <span style={{ fontSize: 9, color: C.onSecondaryFixedVar, flexShrink: 0 }}>{p.key}</span>}
                {p.bpm != null && <span style={{ fontSize: 9, color: C.onSecondaryFixedVar, flexShrink: 0 }}>{p.bpm}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
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
    return <ImageIcon size={26} color={C.onSecondaryFixedVar} strokeWidth={1.25} />;
  }
  return (
    <img
      src={src}
      onError={handleError}
      alt=""
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
