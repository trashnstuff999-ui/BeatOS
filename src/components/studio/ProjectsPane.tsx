// src/components/studio/ProjectsPane.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Studio → Projekte: every started FLP project across all production roots.
// Star = priority, 4-step status segments, asset dots, open-in-DAW,
// "→ Archivieren" jumps into the Create flow with the folder preloaded.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Star, FolderOpen, Play, Archive, RefreshCw, Zap, Loader2, HardDrive,
} from "lucide-react";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { C, STUDIO_STATUS_CONFIG } from "../../lib/theme";
import { api } from "../../lib/api";
import type { StudioProject, StudioStatus } from "../../types/studio";

const STATUS_ORDER: StudioStatus[] = ["idea", "wip", "exported", "ready"];

interface ProjectsPaneProps {
  productionPaths: string[];
  /** bump to trigger a rescan from outside */
  refreshKey: number;
  /** share scan results upward (AssetsPane braucht die Projektliste) */
  onProjects?: (projects: StudioProject[]) => void;
  /** Auswahl fürs Asset-Zuweisen: Klick auf eine Zeile wählt das Projekt */
  selectedPath?: string | null;
  onSelectPath?: (path: string | null) => void;
}

export function ProjectsPane({ productionPaths, refreshKey, onProjects, selectedPath, onSelectPath }: ProjectsPaneProps) {
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const scan = useCallback(async () => {
    if (productionPaths.length === 0) {
      setProjects([]);
      setError("Kein Produktions-Pfad gesetzt — in den Settings unter 'Active Production Paths' hinzufügen.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.studio.scanProjects(productionPaths);
      setProjects(result);
      onProjects?.(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productionPaths.join("\n")]);

  useEffect(() => { scan(); }, [scan, refreshKey]);

  const patchProject = async (p: StudioProject, patch: Partial<Pick<StudioProject, "status" | "priority" | "notes">>) => {
    const next = { ...p, ...patch };
    // Optimistic update, revert on error
    setProjects(prev => prev.map(x => x.path === p.path ? next : x));
    try {
      await api.studio.updateProject(next.path, next.status, next.priority, next.notes);
    } catch (e) {
      setProjects(prev => prev.map(x => x.path === p.path ? p : x));
      alert(`Speichern fehlgeschlagen: ${String(e)}`);
    }
  };

  const handleOpenDaw = async (p: StudioProject) => {
    if (!p.newest_flp) return;
    try { await openPath(p.newest_flp); }
    catch (e) { alert(`FLP konnte nicht geöffnet werden: ${String(e)}`); }
  };

  const handleArchive = (p: StudioProject) => {
    navigate("/create", { state: { sourceFolder: p.path } });
  };

  return (
    <div style={{
      background: C.surfaceContainerLow,
      border: `1px solid ${C.border10}`,
      borderRadius: 12,
      overflow: "hidden",
    }}>
      {/* Toolbar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 16px",
        borderBottom: `1px solid ${C.border10}`,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.onSurface }}>
          {projects.length} Projekte
        </span>
        <span style={{ fontSize: 10, color: C.onSecondaryFixedVar }}>
          aus {productionPaths.length} {productionPaths.length === 1 ? "Pfad" : "Pfaden"}
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={scan}
          disabled={isLoading}
          title="Neu scannen"
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

      {error && (
        <div style={{ padding: "14px 16px", fontSize: 12, color: C.error }}>{error}</div>
      )}

      {!error && !isLoading && projects.length === 0 && (
        <div style={{ padding: "40px 16px", textAlign: "center", fontSize: 12, color: C.onSurfaceVariant }}>
          Keine FLP-Projekte gefunden. Projekte = Ordner mit mindestens einer .flp-Datei.
        </div>
      )}

      {projects.map((p, i) => {
        const exportDetected = (p.has_mp3 || p.has_wav) && (p.status === "idea" || p.status === "wip");
        const isSelected = selectedPath === p.path;
        return (
          <div
            key={p.path}
            onClick={() => onSelectPath?.(isSelected ? null : p.path)}
            title={isSelected ? "Ausgewählt — Assets-Tab weist diesem Projekt zu" : "Klick wählt das Projekt für die Asset-Zuweisung"}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 16px",
              borderTop: i > 0 ? `1px solid ${C.border10}` : "none",
              background: isSelected ? "rgba(253,161,36,0.06)" : "transparent",
              boxShadow: isSelected ? `inset 3px 0 0 ${C.primary}` : "none",
              cursor: "pointer",
              transition: "background 0.15s",
            }}
          >
            {/* Priority star */}
            <button
              onClick={(e) => { e.stopPropagation(); patchProject(p, { priority: p.priority ? 0 : 1 }); }}
              title={p.priority ? "Priorität entfernen" : "Als Priorität markieren"}
              style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 2 }}
            >
              <Star
                size={15}
                color={p.priority ? C.primary : C.onSecondaryFixedVar}
                fill={p.priority ? C.primary : "none"}
                strokeWidth={1.75}
              />
            </button>

            {/* Name + meta */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  fontSize: 13, fontWeight: 600, color: C.onSurface,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {p.parsed_name || p.name}
                </span>
                {exportDetected && (
                  <button
                    onClick={(e) => { e.stopPropagation(); patchProject(p, { status: "exported" }); }}
                    title="MP3/WAV im Ordner gefunden — Klick setzt Status auf Exportiert"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      padding: "2px 8px", borderRadius: 9999,
                      background: "rgba(148,146,255,0.12)",
                      border: "1px solid rgba(148,146,255,0.35)",
                      color: "#9492ff", fontSize: 9, fontWeight: 700,
                      cursor: "pointer", flexShrink: 0,
                    }}
                  >
                    <Zap size={9} strokeWidth={2.5} /> Export erkannt
                  </button>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3, fontSize: 10, color: C.onSecondaryFixedVar }}>
                {p.key && <span>{p.key}</span>}
                {p.bpm != null && <span>{p.bpm} BPM</span>}
                {p.modified_date && <span>· {p.modified_date}</span>}
                {p.flp_count > 1 && <span>· {p.flp_count} FLPs</span>}
                <span title={p.root} style={{ display: "inline-flex", alignItems: "center", gap: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>
                  <HardDrive size={9} /> {p.root.split(/[/\\]/).pop()}
                </span>
              </div>
            </div>

            {/* Asset dots */}
            <div style={{ display: "flex", gap: 5, flexShrink: 0 }} title={
              `MP3 ${p.has_mp3 ? "✓" : "—"} · WAV ${p.has_wav ? "✓" : "—"} · Cover ${p.has_cover ? "✓" : "—"} · Thumbnail ${p.has_thumbnail ? "✓" : "—"} · Video ${p.has_video ? "✓" : "—"}`
            }>
              {([["MP3", p.has_mp3], ["WAV", p.has_wav], ["COV", p.has_cover], ["THB", p.has_thumbnail], ["VID", p.has_video]] as const).map(([label, ok]) => (
                <span key={label} style={{
                  fontSize: 7, fontWeight: 700, letterSpacing: "0.05em",
                  padding: "2px 4px", borderRadius: 3,
                  background: ok ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.03)",
                  color: ok ? C.mint : C.onSecondaryFixedVar,
                  opacity: ok ? 1 : 0.5,
                }}>
                  {label}
                </span>
              ))}
            </div>

            {/* Status segments */}
            <div style={{
              display: "flex", gap: 2, flexShrink: 0,
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${C.border15}`,
              borderRadius: 7, padding: 2,
            }}>
              {STATUS_ORDER.map(s => {
                const active = p.status === s;
                const m = STUDIO_STATUS_CONFIG[s];
                return (
                  <button
                    key={s}
                    onClick={(e) => { e.stopPropagation(); patchProject(p, { status: s }); }}
                    title={m.label}
                    style={{
                      padding: "3px 8px",
                      background: active ? m.bg : "transparent",
                      border: "none", borderRadius: 5,
                      cursor: "pointer",
                      fontSize: 9, fontWeight: 700,
                      color: active ? m.color : C.onSecondaryFixedVar,
                      letterSpacing: "0.04em", textTransform: "uppercase",
                      transition: "all 0.15s",
                    }}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <RowBtn icon={Play} title="In DAW öffnen (neueste FLP)" onClick={() => handleOpenDaw(p)} accent />
              <RowBtn icon={FolderOpen} title="Ordner im Explorer öffnen" onClick={() => revealItemInDir(p.path).catch(() => {})} />
              <button
                onClick={(e) => { e.stopPropagation(); handleArchive(p); }}
                title="In den Create-Flow übernehmen und archivieren"
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "6px 10px", borderRadius: 6,
                  background: p.status === "ready" ? C.primary : "transparent",
                  border: `1px solid ${p.status === "ready" ? C.primary : C.border15}`,
                  color: p.status === "ready" ? C.onPrimary : C.onSurfaceVariant,
                  cursor: "pointer",
                  fontSize: 10, fontWeight: 700,
                }}
              >
                <Archive size={11} strokeWidth={2} />
                Archivieren
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RowBtn({ icon: Icon, title, onClick, accent }: {
  icon: React.ElementType;
  title: string;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      style={{
        width: 28, height: 28, borderRadius: 6,
        background: "transparent",
        border: `1px solid ${accent ? C.primary + "50" : C.border15}`,
        cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: accent ? C.primary : C.onSurfaceVariant,
      }}
    >
      <Icon size={13} strokeWidth={1.75} />
    </button>
  );
}
