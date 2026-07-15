// src/components/studio/AssetsPane.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Studio → Assets: the export inbox (Photoshop/Premiere drop covers,
// thumbnails and videos into the configured asset folder).
//
// Assets that share a number in their filename (Cover_17 + Thumbnail_17)
// are shown as a GROUP and can be assigned in one click. The target project
// is picked in the Projects tab (row click) — the banner here shows it.
// Assignment MOVES the file(s) into the project folder root so the
// Create-tab parser picks them up and archives them with the beat.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Image as ImageIcon, Film, RefreshCw, Loader2, Search, FolderInput,
  Check, Layers, Crosshair, X,
} from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { C } from "../../lib/theme";
import { api } from "../../lib/api";
import { projectDisplayName } from "../../types/studio";
import type { AssetFile, StudioProject } from "../../types/studio";

const ROLE_META: Record<AssetFile["guessed_role"], { label: string; color: string }> = {
  cover:     { label: "Cover",     color: "#34d399" },
  thumbnail: { label: "Thumbnail", color: "#9492ff" },
  video:     { label: "Video",     color: "#ff7351" },
  image:     { label: "Bild",      color: "#8a8a89" },
};

/** Group key = last number in the filename ("Cover_17.png" → "17"). */
function extractGroupKey(name: string): string | null {
  const matches = name.match(/\d+/g);
  return matches ? matches[matches.length - 1] : null;
}

interface AssetGroup {
  key: string;
  items: AssetFile[];
}

interface AssetsPaneProps {
  assetPath: string;
  projects: StudioProject[];
  /** Im Projekte-Tab gewähltes Ziel-Projekt */
  selectedProject: StudioProject | null;
  onClearSelection: () => void;
  /** parent bumps project scan after an assignment (asset flags change) */
  onAssigned: () => void;
}

export function AssetsPane({ assetPath, projects, selectedProject, onClearSelection, onAssigned }: AssetsPaneProps) {
  const [assets, setAssets] = useState<AssetFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [openPickerFor, setOpenPickerFor] = useState<string | null>(null); // group key or asset path

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

  // ── Grouping: same trailing number = one group ─────────────────────────────
  const groupMap = new Map<string, AssetFile[]>();
  const singles: AssetFile[] = [];
  for (const a of assets) {
    const key = extractGroupKey(a.name);
    if (key === null) { singles.push(a); continue; }
    const list = groupMap.get(key) ?? [];
    list.push(a);
    groupMap.set(key, list);
  }
  const groups: AssetGroup[] = [];
  for (const [key, items] of groupMap) {
    if (items.length >= 2) groups.push({ key, items });
    else singles.push(...items);
  }
  groups.sort((a, b) => Math.max(...b.items.map(i => i.modified_secs)) - Math.max(...a.items.map(i => i.modified_secs)));

  // ── Assignment ─────────────────────────────────────────────────────────────
  const assignFiles = async (files: AssetFile[], project: StudioProject, label: string) => {
    setIsAssigning(true);
    try {
      for (const f of files) {
        await api.studio.assignAsset(f.path, assetPath, project.path);
      }
      setOpenPickerFor(null);
      setToast(`${label} → ${projectDisplayName(project)}`);
      setTimeout(() => setToast(null), 2800);
      scan();
      onAssigned();
    } catch (e) {
      alert(`Zuweisen fehlgeschlagen: ${String(e)}`);
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <div style={{
      background: C.surfaceContainerLow,
      border: `1px solid ${C.border10}`,
      borderRadius: 12,
    }}>
      {/* Toolbar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 16px",
        borderBottom: `1px solid ${C.border10}`,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.onSurface }}>
          {groups.length > 0 && `${groups.length} Gruppen · `}{assets.length} Assets
        </span>
        <span title={assetPath} style={{ fontSize: 10, color: C.onSecondaryFixedVar, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }}>
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

      {/* Target banner — the project picked in the Projects tab */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 16px",
        borderBottom: `1px solid ${C.border10}`,
        background: selectedProject ? "rgba(253,161,36,0.06)" : "transparent",
      }}>
        <Crosshair size={13} color={selectedProject ? C.primary : C.onSecondaryFixedVar} strokeWidth={2} />
        {selectedProject ? (
          <>
            <span style={{ fontSize: 11, color: C.onSurfaceVariant }}>Zuweisen an:</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.primary }}>
              {projectDisplayName(selectedProject)}
            </span>
            <button
              onClick={onClearSelection}
              title="Auswahl aufheben"
              style={{ background: "none", border: "none", cursor: "pointer", color: C.onSurfaceVariant, display: "flex", padding: 2 }}
            >
              <X size={12} />
            </button>
          </>
        ) : (
          <span style={{ fontSize: 11, color: C.onSecondaryFixedVar }}>
            Kein Ziel gewählt — im Projekte-Tab eine Zeile anklicken, dann hier mit einem Klick zuweisen
          </span>
        )}
      </div>

      {error && <div style={{ padding: "14px 16px", fontSize: 12, color: C.error }}>{error}</div>}

      {!error && !isLoading && assets.length === 0 && (
        <div style={{ padding: "40px 16px", textAlign: "center", fontSize: 12, color: C.onSurfaceVariant, lineHeight: 1.6 }}>
          Inbox ist leer. Exporte aus Photoshop / Premiere Pro, die in deinem
          Asset-Ordner landen, erscheinen hier — Cover_17 + Thumbnail_17
          werden automatisch als Gruppe erkannt.
        </div>
      )}

      {(groups.length > 0 || singles.length > 0) && (
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Groups first — the main flow */}
          {groups.length > 0 && (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 12,
            }}>
              {groups.map(g => (
                <GroupCard
                  key={g.key}
                  group={g}
                  projects={projects}
                  selectedProject={selectedProject}
                  isAssigning={isAssigning}
                  pickerOpen={openPickerFor === `group:${g.key}`}
                  onTogglePicker={() => setOpenPickerFor(openPickerFor === `group:${g.key}` ? null : `group:${g.key}`)}
                  onAssign={(project) => assignFiles(g.items, project, `Gruppe ${g.key} (${g.items.length} Dateien)`)}
                />
              ))}
            </div>
          )}

          {/* Ungrouped singles */}
          {singles.length > 0 && (
            <div>
              {groups.length > 0 && (
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: C.onSecondaryFixedVar, marginBottom: 8 }}>
                  Einzelne Dateien
                </div>
              )}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
                gap: 12,
              }}>
                {singles.map(a => (
                  <SingleCard
                    key={a.path}
                    asset={a}
                    projects={projects}
                    selectedProject={selectedProject}
                    isAssigning={isAssigning}
                    pickerOpen={openPickerFor === a.path}
                    onTogglePicker={() => setOpenPickerFor(openPickerFor === a.path ? null : a.path)}
                    onAssign={(project) => assignFiles([a], project, a.name)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Group card: Cover_17 + Thumbnail_17 (+ Video_17) as one unit ───────────

function GroupCard({ group, projects, selectedProject, isAssigning, pickerOpen, onTogglePicker, onAssign }: {
  group: AssetGroup;
  projects: StudioProject[];
  selectedProject: StudioProject | null;
  isAssigning: boolean;
  pickerOpen: boolean;
  onTogglePicker: () => void;
  onAssign: (p: StudioProject) => void;
}) {
  // Show cover first, then thumbnail, then the rest
  const roleOrder = { cover: 0, thumbnail: 1, image: 2, video: 3 };
  const items = [...group.items].sort((a, b) => roleOrder[a.guessed_role] - roleOrder[b.guessed_role]);

  return (
    <div style={{ position: "relative" }}>
      <div style={{
        background: C.surfaceContainerLowest,
        border: `1px solid ${C.border15}`,
        borderRadius: 10,
        overflow: "hidden",
      }}>
        {/* Previews side by side */}
        <div style={{ display: "flex", gap: 1, height: 120, background: C.surfaceContainerHigh }}>
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
                background: "rgba(0,0,0,0.65)",
                color: ROLE_META[item.guessed_role].color,
              }}>
                {ROLE_META[item.guessed_role].label}
              </span>
            </div>
          ))}
        </div>

        {/* Info + action */}
        <div style={{ padding: "9px 12px", display: "flex", alignItems: "center", gap: 8 }}>
          <Layers size={12} color={C.primary} strokeWidth={2} />
          <span style={{ fontSize: 12, fontWeight: 700, color: C.onSurface }}>
            Gruppe {group.key}
          </span>
          <span style={{ fontSize: 10, color: C.onSecondaryFixedVar }}>
            {group.items.length} Dateien
          </span>
          <div style={{ flex: 1 }} />
          <AssignButton
            selectedProject={selectedProject}
            isAssigning={isAssigning}
            pickerOpen={pickerOpen}
            onTogglePicker={onTogglePicker}
            onAssign={onAssign}
          />
        </div>
      </div>

      {pickerOpen && !selectedProject && (
        <ProjectPickerPopover projects={projects} onPick={onAssign} onClose={onTogglePicker} />
      )}
    </div>
  );
}

// ─── Single asset card ───────────────────────────────────────────────────────

function SingleCard({ asset, projects, selectedProject, isAssigning, pickerOpen, onTogglePicker, onAssign }: {
  asset: AssetFile;
  projects: StudioProject[];
  selectedProject: StudioProject | null;
  isAssigning: boolean;
  pickerOpen: boolean;
  onTogglePicker: () => void;
  onAssign: (p: StudioProject) => void;
}) {
  const role = ROLE_META[asset.guessed_role];
  return (
    <div style={{ position: "relative" }}>
      <div style={{
        background: C.surfaceContainerLowest,
        border: `1px solid ${C.border15}`,
        borderRadius: 10,
        overflow: "hidden",
      }}>
        <div style={{ height: 100, background: C.surfaceContainerHigh, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          {asset.kind === "image"
            ? <AssetImage path={asset.path} />
            : <Film size={24} color={C.onSecondaryFixedVar} strokeWidth={1.25} />
          }
        </div>
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
          <div style={{ display: "flex", alignItems: "center", marginTop: 6 }}>
            <span style={{ fontSize: 9, color: C.onSecondaryFixedVar }}>
              {formatSize(asset.size)}
            </span>
            <div style={{ flex: 1 }} />
            <AssignButton
              selectedProject={selectedProject}
              isAssigning={isAssigning}
              pickerOpen={pickerOpen}
              onTogglePicker={onTogglePicker}
              onAssign={onAssign}
            />
          </div>
        </div>
      </div>

      {pickerOpen && !selectedProject && (
        <ProjectPickerPopover projects={projects} onPick={onAssign} onClose={onTogglePicker} />
      )}
    </div>
  );
}

// ─── Shared: assign button (direct when a target is picked) ─────────────────

function AssignButton({ selectedProject, isAssigning, pickerOpen, onTogglePicker, onAssign }: {
  selectedProject: StudioProject | null;
  isAssigning: boolean;
  pickerOpen: boolean;
  onTogglePicker: () => void;
  onAssign: (p: StudioProject) => void;
}) {
  const direct = selectedProject !== null;
  return (
    <button
      onClick={() => direct ? onAssign(selectedProject!) : onTogglePicker()}
      disabled={isAssigning}
      title={direct
        ? `Zuweisen an „${projectDisplayName(selectedProject!)}"`
        : "Projekt wählen und zuweisen"}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "5px 10px", borderRadius: 6,
        background: direct ? C.primary : (pickerOpen ? C.primary + "20" : "transparent"),
        border: `1px solid ${direct ? C.primary : (pickerOpen ? C.primary + "50" : C.border20)}`,
        color: direct ? C.onPrimary : (pickerOpen ? C.primary : C.onSurfaceVariant),
        cursor: isAssigning ? "wait" : "pointer",
        fontSize: 9, fontWeight: 700,
        opacity: isAssigning ? 0.6 : 1,
      }}
    >
      {isAssigning
        ? <Loader2 size={10} style={{ animation: "spin 0.8s linear infinite" }} />
        : <FolderInput size={10} strokeWidth={2} />}
      Zuweisen
    </button>
  );
}

// ─── Shared: project picker popover (fallback without selection) ─────────────

function ProjectPickerPopover({ projects, onPick, onClose }: {
  projects: StudioProject[];
  onPick: (p: StudioProject) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = projects.filter(p =>
    !query.trim() || projectDisplayName(p).toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div ref={containerRef} style={{
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
            onClick={() => onPick(p)}
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
              {projectDisplayName(p)}
            </span>
            {p.key && <span style={{ fontSize: 9, color: C.onSecondaryFixedVar, flexShrink: 0 }}>{p.key}</span>}
            {p.bpm != null && <span style={{ fontSize: 9, color: C.onSecondaryFixedVar, flexShrink: 0 }}>{p.bpm}</span>}
          </button>
        ))}
      </div>
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
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <ImageIcon size={24} color={C.onSecondaryFixedVar} strokeWidth={1.25} />
      </div>
    );
  }
  return (
    <img
      src={src}
      onError={handleError}
      alt=""
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
    />
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
