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
import { Disc3, FolderKanban, BrushCleaning, Image as ImageIcon } from "lucide-react";
import { C, radius } from "../lib/theme";
import { PageHeader, PageBody } from "../components/ui";
import { useSettings, parseProductionPaths } from "../contexts/SettingsContext";
import { ProjectsPane } from "../components/studio/ProjectsPane";
import { AssetsPane } from "../components/studio/AssetsPane";
import { INSPECTOR_WIDTH } from "../components/studio/ProjectInspector";
import type { StudioProject } from "../types/studio";

type StudioTab = "projects" | "cleanup" | "assets";

export default function Studio() {
  const { settings } = useSettings();
  const [tab, setTab] = useState<StudioTab>("projects");
  // Der letzte Scan — der Assets-Tab braucht ihn als Zielliste beim Zuweisen.
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const productionPaths = useMemo(
    () => parseProductionPaths(settings.productionPath),
    [settings.productionPath],
  );

  return (
    // data-app-flaeche: ein Klick auf den Hintergrund schliesst den Inspector
    // (siehe hooks/useKlickDaneben.ts).
    <div data-app-flaeche style={{
      height: "100%",
      display: "flex", flexDirection: "column",
      overflow: "hidden",
      background: C.background,
    }}>
      {/* Header with tabs */}
      <PageHeader icon={Disc3} title="Studio">
        {/* Tab switch */}
        <div style={{
          display: "flex", gap: 2,
          background: "rgba(255,255,255,0.03)",
          border: `1px solid ${C.border15}`,
          borderRadius: radius.control, padding: 2,
        }}>
          <TabBtn
            icon={FolderKanban}
            label="Projekte"
            active={tab === "projects"}
            onClick={() => setTab("projects")}
          />
          <TabBtn
            icon={BrushCleaning}
            label="Aufräumen"
            active={tab === "cleanup"}
            onClick={() => setTab("cleanup")}
          />
          <TabBtn
            icon={ImageIcon}
            label="Assets"
            active={tab === "assets"}
            onClick={() => setTab("assets")}
          />
        </div>
      </PageHeader>

      {/* Content */}
      {/* Das Projekt-Panel schwebt rechts. Solange es offen ist, rückt der
          Inhalt um seine Breite ein — vorher deckte es den rechten Rand der
          Liste zu („Sc…", „In den Papierko…"). */}
      <div style={{
        flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
        paddingRight: tab !== "assets" && inspectorOpen ? INSPECTOR_WIDTH : 0,
        transition: "padding-right 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)",
      }}>
      {/* Das Inbox-Raster nutzt die ganze Breite — mehr Kacheln pro Reihe.
          Die Projektlisten bleiben auf Lesebreite. */}
      <PageBody width={tab === "assets" ? "full" : "wide"}>
        {/* Beide Panes bleiben montiert: der Assets-Tab braucht die Projektliste
            beim Zuweisen, und ein Tabwechsel darf keinen Scan wegwerfen. */}
        <div style={{ display: tab !== "assets" ? "block" : "none" }}>
          <ProjectsPane
            productionPaths={productionPaths}
            refreshKey={refreshKey}
            onProjects={setProjects}
            onInspectorOpen={setInspectorOpen}
            view={tab === "cleanup" ? "cleanup" : "work"}
          />
        </div>
        <div style={{ display: tab === "assets" ? "block" : "none" }}>
          <AssetsPane
            assetPath={settings.assetPath}
            projects={projects}
            active={tab === "assets"}
            onAssigned={() => setRefreshKey(k => k + 1)}
          />
        </div>
        <div style={{ height: 40 }} />
      </PageBody>
      </div>
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
        border: "none", borderRadius: radius.control,
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
