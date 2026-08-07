// src/components/studio/ProjectsPane.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Studio → Projekte: search/filter toolbar, collapsible status sections
// (Bereit → Exportiert → In Arbeit → Idee → Lange inaktiv), audio preview
// via the global player, and the notes inspector. Filtering, grouping and
// sorting are pure client-side derivations over one scan result.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, Loader2, ChevronDown, Moon } from "lucide-react";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { C, STUDIO_STATUS_CONFIG } from "../../lib/theme";
import { api } from "../../lib/api";
import { daysSince } from "../../lib/time";
import { useAudioPlayerContext } from "../../contexts/AudioPlayerContext";
import { useSettings } from "../../contexts/SettingsContext";
import { ProjectsToolbar, type SortMode } from "./ProjectsToolbar";
import { ProjectRow } from "./ProjectRow";
import { ProjectInspector } from "./ProjectInspector";
import { projectDisplayName } from "../../types/studio";
import type { StudioProject, StudioStatus } from "../../types/studio";
import type { Beat } from "../../types/browse";

/** Ideen ohne Aktivität länger als das gelten als "Lange inaktiv" */
const STALE_DAYS = 30;

type SectionKey = StudioStatus | "stale";

const SECTION_ORDER: SectionKey[] = ["ready", "exported", "wip", "idea", "stale"];
const SECTION_META: Record<SectionKey, { label: string; color: string }> = {
  ready:    { label: STUDIO_STATUS_CONFIG.ready.label,    color: STUDIO_STATUS_CONFIG.ready.color },
  exported: { label: STUDIO_STATUS_CONFIG.exported.label, color: STUDIO_STATUS_CONFIG.exported.color },
  wip:      { label: STUDIO_STATUS_CONFIG.wip.label,      color: STUDIO_STATUS_CONFIG.wip.color },
  idea:     { label: STUDIO_STATUS_CONFIG.idea.label,     color: STUDIO_STATUS_CONFIG.idea.color },
  stale:    { label: "Lange inaktiv",                     color: "#8a8a89" },
};

const LS_COLLAPSED = "beatos_studio_collapsed";
const LS_SORT = "beatos_studio_sort";

function loadCollapsed(): Set<SectionKey> {
  try {
    const raw = localStorage.getItem(LS_COLLAPSED);
    if (raw) return new Set(JSON.parse(raw) as SectionKey[]);
  } catch { /* fallthrough to default */ }
  return new Set<SectionKey>(["idea", "stale"]);
}

function loadSort(): SortMode {
  const raw = localStorage.getItem(LS_SORT);
  return (raw === "modified" || raw === "priority" || raw === "name" || raw === "oldest") ? raw : "modified";
}

interface ProjectsPaneProps {
  productionPaths: string[];
  refreshKey: number;
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
  const { playBeat } = useAudioPlayerContext();
  const { settings } = useSettings();

  // Filters & view state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StudioStatus | null>(null);
  const [onlyPriority, setOnlyPriority] = useState(false);
  const [rootFilter, setRootFilter] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>(loadSort);
  const [collapsed, setCollapsed] = useState<Set<SectionKey>>(loadCollapsed);
  const [inspectorPath, setInspectorPath] = useState<string | null>(null);

  useEffect(() => { localStorage.setItem(LS_SORT, sortMode); }, [sortMode]);
  useEffect(() => {
    localStorage.setItem(LS_COLLAPSED, JSON.stringify([...collapsed]));
  }, [collapsed]);

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

  // Junk-Projekt in den Papierkorb (wiederherstellbar). Rückfrage, dann
  // optimistisch aus der Liste nehmen; die Auswahl/Inspector ggf. lösen.
  const handleTrash = async (p: StudioProject) => {
    const name = projectDisplayName(p);
    const ok = window.confirm(
      `„${name}" in den Papierkorb verschieben?\n\n` +
      `Der komplette Projektordner wandert in den Windows-Papierkorb ` +
      `(wiederherstellbar):\n${p.path}`
    );
    if (!ok) return;
    try {
      await api.archive.trashSourceFolder(p.path, settings.archivePath);
      const remaining = projects.filter(x => x.path !== p.path);
      setProjects(remaining);
      onProjects?.(remaining);
      if (selectedPath === p.path) onSelectPath?.(null);
      if (inspectorPath === p.path) setInspectorPath(null);
    } catch (e) {
      alert(`Löschen fehlgeschlagen: ${String(e)}`);
    }
  };

  // Audio preview: pseudo-beat over the project folder — get_beat_audio_path
  // scans the folder root and finds the exported MP3/WAV.
  const handlePreview = (p: StudioProject) => {
    const pseudoBeat: Beat = {
      id: `studio:${p.path}`,
      name: projectDisplayName(p),
      path: p.path,
      bpm: p.bpm, key: p.key,
      status: null, tags: null, favorite: null,
      created_date: null, modified_date: null,
      notes: null, sold_to: null, has_artwork: null, has_video: null,
    };
    playBeat(pseudoBeat);
  };

  // ── Derivations: counts → filter → group → sort ────────────────────────────
  const counts = {
    all: projects.length,
    idea: projects.filter(p => p.status === "idea").length,
    wip: projects.filter(p => p.status === "wip").length,
    exported: projects.filter(p => p.status === "exported").length,
    ready: projects.filter(p => p.status === "ready").length,
  };

  const q = search.trim().toLowerCase();
  const visible = projects.filter(p => {
    if (statusFilter && p.status !== statusFilter) return false;
    if (onlyPriority && !p.priority) return false;
    if (rootFilter && p.root !== rootFilter) return false;
    if (q) {
      // Songtitel zuerst — danach sucht man, nicht nach "project_187"
      const hay = `${p.song_name ?? ""} ${p.parsed_name} ${p.name} ${p.key ?? ""} ${p.bpm ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const isStale = (p: StudioProject) =>
    p.status === "idea" && daysSince(p.modified_secs) > STALE_DAYS;

  const sortFn = (a: StudioProject, b: StudioProject): number => {
    switch (sortMode) {
      case "priority": return b.priority - a.priority || b.modified_secs - a.modified_secs;
      case "name":     return projectDisplayName(a).localeCompare(projectDisplayName(b), "de");
      case "oldest":   return a.modified_secs - b.modified_secs;
      default:         return b.modified_secs - a.modified_secs;
    }
  };

  const sections = SECTION_ORDER
    .map(key => ({
      key,
      meta: SECTION_META[key],
      items: visible
        .filter(p => key === "stale" ? isStale(p) : (p.status === key && !isStale(p)))
        .sort(sortFn),
    }))
    .filter(s => s.items.length > 0);

  const toggleSection = (key: SectionKey) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const inspectorProject = inspectorPath
    ? projects.find(p => p.path === inspectorPath) ?? null
    : null;

  return (
    <div style={{
      background: C.surfaceContainerLow,
      border: `1px solid ${C.border10}`,
      borderRadius: 12,
      overflow: "hidden",
    }}>
      {/* Top bar */}
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

      {/* Search / filter / sort */}
      <ProjectsToolbar
        search={search}
        onSearch={setSearch}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
        counts={counts}
        onlyPriority={onlyPriority}
        onOnlyPriority={setOnlyPriority}
        roots={productionPaths}
        rootFilter={rootFilter}
        onRootFilter={setRootFilter}
        sortMode={sortMode}
        onSortMode={setSortMode}
      />

      {error && (
        <div style={{ padding: "14px 16px", fontSize: 12, color: C.error }}>{error}</div>
      )}

      {!error && !isLoading && projects.length === 0 && (
        <div style={{ padding: "40px 16px", textAlign: "center", fontSize: 12, color: C.onSurfaceVariant }}>
          Keine FLP-Projekte gefunden. Projekte = Ordner mit mindestens einer .flp-Datei.
        </div>
      )}

      {!error && !isLoading && projects.length > 0 && visible.length === 0 && (
        <div style={{ padding: "30px 16px", textAlign: "center", fontSize: 12, color: C.onSurfaceVariant }}>
          Kein Projekt passt zu den Filtern.
        </div>
      )}

      {/* Sections */}
      {sections.map(section => {
        const forcedOpen = statusFilter !== null || q.length > 0;
        const isCollapsed = !forcedOpen && collapsed.has(section.key);
        return (
          <div key={section.key}>
            <button
              onClick={() => !forcedOpen && toggleSection(section.key)}
              style={{
                width: "100%",
                display: "flex", alignItems: "center", gap: 8,
                padding: "9px 16px",
                background: "rgba(255,255,255,0.02)",
                border: "none",
                borderTop: `1px solid ${C.border10}`,
                cursor: forcedOpen ? "default" : "pointer",
                textAlign: "left",
              }}
            >
              {section.key === "stale"
                ? <Moon size={10} color={section.meta.color} strokeWidth={2} />
                : <span style={{ width: 7, height: 7, borderRadius: "50%", background: section.meta.color }} />
              }
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
                textTransform: "uppercase", color: C.onSurfaceVariant,
              }}>
                {section.meta.label}
              </span>
              <span style={{ fontSize: 10, color: C.onSecondaryFixedVar }}>
                {section.items.length}
              </span>
              <div style={{ flex: 1 }} />
              {!forcedOpen && (
                <ChevronDown
                  size={12}
                  color={C.onSecondaryFixedVar}
                  style={{ transition: "transform 0.15s", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0)" }}
                />
              )}
            </button>

            {!isCollapsed && section.items.map(p => (
              <ProjectRow
                key={p.path}
                project={p}
                isSelected={selectedPath === p.path}
                dimmed={section.key === "stale"}
                onSelect={() => onSelectPath?.(selectedPath === p.path ? null : p.path)}
                onPatch={patch => patchProject(p, patch)}
                onOpenDaw={() => handleOpenDaw(p)}
                onPreview={() => handlePreview(p)}
                onInspect={() => setInspectorPath(inspectorPath === p.path ? null : p.path)}
                onOpenFolder={() => revealItemInDir(p.path).catch(() => {})}
                onArchive={() => handleArchive(p)}
                onTrash={() => handleTrash(p)}
              />
            ))}
          </div>
        );
      })}

      {/* Inspector */}
      {inspectorProject && (
        <ProjectInspector
          project={inspectorProject}
          onPatch={patch => patchProject(inspectorProject, patch)}
          onArchive={() => handleArchive(inspectorProject)}
          onClose={() => setInspectorPath(null)}
        />
      )}
    </div>
  );
}
