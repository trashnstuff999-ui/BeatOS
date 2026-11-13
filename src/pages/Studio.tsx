// src/pages/Studio.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Studio: deine eigene Musik in Arbeit. Projekte, Samples und Aufräumen als
// Tabs. Die Asset-Inbox (Exporte aus Photoshop/Premiere, die einem Projekt
// zugewiesen werden wollen) ist kein Tab mehr, sondern ein Knopf mit Zahl in
// der Projekte-Leiste, der nur erscheint, wenn dort etwas liegt.
// Projekt-Flow: hier starten → exportieren → Assets zuweisen → „Archivieren"
// springt in den Create-Flow; nach der Archivierung verschwindet das Projekt
// (Quellordner wandert in den Papierkorb).
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useMemo, useEffect, useCallback } from "react";
import { Disc3, FolderKanban, BrushCleaning, Image as ImageIcon, AudioLines, History } from "lucide-react";
import { C } from "../lib/theme";
import { api } from "../lib/api";
import { PageHeader, PageBody, Segmented, Button } from "../components/ui";
import { useSettings, parseProductionPaths } from "../contexts/SettingsContext";
import { useFocusRefresh } from "../hooks/useFocusRefresh";
import { ProjectsPane } from "../components/studio/ProjectsPane";
import { AssetsPane } from "../components/studio/AssetsPane";
import { SamplesPane } from "../components/studio/SamplesPane";
import { AlteIdeenPane } from "../components/studio/AlteIdeenPane";
import { INSPECTOR_WIDTH } from "../components/studio/ProjectInspector";
import "../components/studio/studio-wucht.css";
import type { StudioProject } from "../types/studio";

type StudioTab = "projects" | "samples" | "ideen" | "cleanup" | "assets";

export default function Studio() {
  const { settings } = useSettings();
  const [tab, setTab] = useState<StudioTab>("projects");
  // Der letzte Scan — die Assets-Ansicht braucht ihn als Zielliste beim Zuweisen.
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const productionPaths = useMemo(
    () => parseProductionPaths(settings.productionPath),
    [settings.productionPath],
  );

  // Wie viel in der Asset-Inbox liegt: nur die Zahl für den Knopf. Ein
  // Ordner-Listing, neu beim Tabwechsel (nach dem Zuweisen) und beim Zurückwechseln.
  const [assetCount, setAssetCount] = useState(0);
  const zaehleAssets = useCallback(() => {
    if (!settings.assetPath.trim()) { setAssetCount(0); return; }
    api.studio.scanAssetInbox(settings.assetPath)
      .then(a => setAssetCount(a.length))
      .catch(() => setAssetCount(0));
  }, [settings.assetPath]);
  useEffect(zaehleAssets, [zaehleAssets, tab]);
  useFocusRefresh(zaehleAssets);

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
        <Segmented
          label="Bereich im Studio"
          value={tab}
          onChange={setTab}
          options={[
            { value: "projects", label: "Projekte", icon: FolderKanban },
            { value: "samples", label: "Samples", icon: AudioLines },
            { value: "ideen", label: "Alte Ideen", icon: History },
            { value: "cleanup", label: "Aufräumen", icon: BrushCleaning },
          ]}
        />
      </PageHeader>

      {/* Content */}
      {/* Das Projekt-Panel schwebt rechts. Solange es offen ist, rückt der
          Inhalt um seine Breite ein — vorher deckte es den rechten Rand der
          Liste zu („Sc…", „In den Papierko…").
          Ohne Transition: animiert brach das Cover-Raster (auto-fill) mitten in
          der Bewegung mehrmals um, die Kacheln sprangen. Jetzt stellt sich die
          Breite einmal um, und das Panel gleitet darüber. */}
      <div style={{
        flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
        paddingRight: (tab === "projects" || tab === "cleanup") && inspectorOpen ? INSPECTOR_WIDTH : 0,
      }}>
      {/* Das Inbox-Raster nutzt die ganze Breite — mehr Kacheln pro Reihe.
          Die Projektlisten bleiben auf Lesebreite. */}
      <PageBody width={tab === "assets" ? "full" : "wide"}>
        {/* Beide Panes bleiben montiert: die Assets-Ansicht braucht die
            Projektliste beim Zuweisen, und ein Tabwechsel darf keinen Scan wegwerfen. */}
        <div style={{ display: tab === "projects" || tab === "cleanup" ? "block" : "none" }}>
          <ProjectsPane
            productionPaths={productionPaths}
            refreshKey={refreshKey}
            onProjects={setProjects}
            onInspectorOpen={setInspectorOpen}
            view={tab === "cleanup" ? "cleanup" : "work"}
            extraActions={assetCount > 0 && (
              <Button size="sm" variant="secondary" icon={ImageIcon} onClick={() => setTab("assets")} title="Neue Exporte zuweisen">
                Assets
                <span style={{ fontWeight: 700, color: C.primary }}>{assetCount}</span>
              </Button>
            )}
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
        {tab === "samples" && <SamplesPane />}
        {tab === "ideen" && <AlteIdeenPane onGeholt={() => setRefreshKey(k => k + 1)} />}
        <div style={{ height: 40 }} />
      </PageBody>
      </div>
    </div>
  );
}
