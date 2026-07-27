// src/pages/Studio.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Studio — the start of the workflow: every started FLP project across the
// configured production roots, plus the asset inbox (exports from
// Photoshop/Premiere waiting to be assigned to a project).
// Projekt-Flow: hier starten → exportieren → Assets zuweisen → „Archivieren"
// springt in den Create-Flow; nach der Archivierung verschwindet das Projekt
// (Quellordner wandert in den Papierkorb).
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useMemo } from "react";
import { Disc3, FolderKanban, Image as ImageIcon } from "lucide-react";
import { C, commonStyles } from "../lib/theme";
import { useSettings, parseProductionPaths } from "../contexts/SettingsContext";
import { ProjectsPane } from "../components/studio/ProjectsPane";
import { AssetsPane } from "../components/studio/AssetsPane";
import type { StudioProject } from "../types/studio";

type StudioTab = "projects" | "assets";

export default function Studio() {
  const { settings } = useSettings();
  const [tab, setTab] = useState<StudioTab>("projects");
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  // Ziel-Projekt für die Asset-Zuweisung (Klick auf eine Projekt-Zeile)
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const selectedProject = projects.find(p => p.path === selectedPath) ?? null;

  const productionPaths = useMemo(
    () => parseProductionPaths(settings.productionPath),
    [settings.productionPath],
  );

  return (
    <div style={{
      height: "100%",
      display: "flex", flexDirection: "column",
      overflow: "hidden",
      background: C.background,
    }}>
      {/* Header with tabs */}
      <header style={{
        height: 64, flexShrink: 0,
        ...commonStyles.glassHeader,
        display: "flex", alignItems: "center", gap: 20,
        padding: "0 32px",
        borderBottom: `1px solid ${C.border15}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Disc3 size={16} color={C.primary} strokeWidth={1.75} />
          <span style={{
            fontSize: 12, fontWeight: 700,
            letterSpacing: "0.2em", textTransform: "uppercase",
            color: C.onSurfaceVariant,
          }}>
            Studio
          </span>
        </div>

        {/* Tab switch */}
        <div style={{
          display: "flex", gap: 2,
          background: "rgba(255,255,255,0.03)",
          border: `1px solid ${C.border15}`,
          borderRadius: 8, padding: 2,
        }}>
          <TabBtn
            icon={FolderKanban}
            label="Projekte"
            active={tab === "projects"}
            onClick={() => setTab("projects")}
          />
          <TabBtn
            icon={ImageIcon}
            label="Assets"
            active={tab === "assets"}
            onClick={() => setTab("assets")}
          />
        </div>
      </header>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "32px 48px" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto" }}>
          {/* Both panes stay mounted: the assign popover needs the project
              list, and switching tabs must not lose scan state. */}
          <div style={{ display: tab === "projects" ? "block" : "none" }}>
            <ProjectsPane
              productionPaths={productionPaths}
              refreshKey={refreshKey}
              onProjects={setProjects}
              selectedPath={selectedPath}
              onSelectPath={setSelectedPath}
            />
          </div>
          <div style={{ display: tab === "assets" ? "block" : "none" }}>
            <AssetsPane
              assetPath={settings.assetPath}
              selectedProject={selectedProject}
              onClearSelection={() => setSelectedPath(null)}
              onAssigned={() => setRefreshKey(k => k + 1)}
            />
          </div>
          <div style={{ height: 40 }} />
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function TabBtn({ icon: Icon, label, active, onClick }: {
  icon: React.ElementType;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "6px 14px",
        background: active ? C.surfaceContainerHigh : "transparent",
        border: "none", borderRadius: 6,
        cursor: "pointer",
        fontSize: 11, fontWeight: 700,
        letterSpacing: "0.05em", textTransform: "uppercase",
        color: active ? C.onSurface : C.onSecondaryFixedVar,
        transition: "all 0.15s",
      }}
    >
      <Icon size={12} strokeWidth={2} />
      {label}
    </button>
  );
}
