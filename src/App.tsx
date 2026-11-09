// src/App.tsx

import { useState, useEffect, useCallback, useMemo } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import { SIDEBAR_WIDTH } from "./lib/constants";
import { C } from "./lib/theme";
import { api } from "./lib/api";
import { useFocusRefresh } from "./hooks/useFocusRefresh";
import type { StudioStatusCounts } from "./types/studio";
import Dashboard from "./pages/Dashboard";
import Browse from "./pages/Browse";
import Create from "./pages/Create";
import Studio from "./pages/Studio";
import Kuenstler from "./pages/Kuenstler";
import Upload from "./pages/Upload";
import Video from "./pages/Video";
import { Settings } from "./pages/Settings";
import { Support } from "./pages/Placeholder";
import { useBeatCount } from "./hooks/useStats";
import { SettingsProvider, useSettings, parseProductionPaths } from "./contexts/SettingsContext";
import { AudioPlayerProvider } from "./contexts/AudioPlayerContext";
import { VideoProvider } from "./contexts/VideoContext";
import { GlobalAudioPlayer, PLAYER_HEIGHT } from "./components/GlobalAudioPlayer";
import { useAudioPlayerContext } from "./contexts/AudioPlayerContext";
import { TagManagerProvider, useTagManager } from "./contexts/TagManagerContext";
import { DialogProvider } from "./contexts/DialogContext";
import { AllTagsModal } from "./components/create/dialogs/AllTagsModal";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Schnellsuche } from "./components/Schnellsuche";

function AppRoutes() {
  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <>
      <Routes>
        <Route path="/" element={<ErrorBoundary fallbackLabel="Fehler in der Übersicht"><Dashboard /></ErrorBoundary>} />
        <Route path="/browse" element={<ErrorBoundary fallbackLabel="Fehler im Archiv"><Browse /></ErrorBoundary>} />
        <Route path="/studio" element={<ErrorBoundary fallbackLabel="Fehler im Studio"><Studio /></ErrorBoundary>} />
        <Route path="/kuenstler" element={<ErrorBoundary fallbackLabel="Fehler bei den Künstlern"><Kuenstler /></ErrorBoundary>} />
        <Route path="/upload" element={<ErrorBoundary fallbackLabel="Fehler im Upload"><Upload /></ErrorBoundary>} />
        <Route path="/video" element={<ErrorBoundary fallbackLabel="Fehler im Video-Tab"><Video /></ErrorBoundary>} />
        <Route path="/settings"element={<ErrorBoundary fallbackLabel="Fehler in den Einstellungen"><Settings /></ErrorBoundary>} />
        <Route path="/support" element={<ErrorBoundary fallbackLabel="Fehler in der Hilfe"><Support /></ErrorBoundary>} />
      </Routes>

      {/* Create — always mounted, hidden when not active */}
      <div style={{ display: currentPath === "/create" ? "block" : "none", height: "100%" }}>
        <ErrorBoundary fallbackLabel="Fehler beim Anlegen">
          <Create />
        </ErrorBoundary>
      </div>
    </>
  );
}

function GlobalTagManager() {
  const { isOpen, params, closeTagManager } = useTagManager();
  if (!isOpen || !params) return null;
  return (
    <AllTagsModal
      initialSelected={params.initialSelected}
      onConfirm={params.onConfirm}
      onClose={closeTagManager}
      editMode={params.editMode ?? true}
    />
  );
}

/**
 * Was im Studio ansteht: fertig zum Archivieren (grün) und selbst vorgemerkt
 * (orange). Die Zahl der Inbox-Dateien stand hier mal — sie mischte Cover,
 * Thumbnails und Videos zu einer Zahl, aus der keine Handlung folgte.
 *
 * Reine DB-Abfrage, deshalb darf sie bei jedem Fensterwechsel und bei jedem
 * Tabwechsel neu laufen. Den Stand schreibt der Studio-Scan.
 */
function useStudioCounts(): StudioStatusCounts {
  const [counts, setCounts] = useState<StudioStatusCounts>({ ready: 0, wip: 0 });
  const { settings } = useSettings();
  const { pathname } = useLocation();
  // Dieselben Ordner, die auch der Scan abläuft — sonst zählt die Zahl
  // Projekte mit, die die Liste nicht mehr zeigt (z.B. geparkte).
  const roots = useMemo(
    () => parseProductionPaths(settings.productionPath),
    [settings.productionPath],
  );

  const load = useCallback(() => {
    api.studio.statusCounts(roots)
      .then(setCounts)
      .catch(() => setCounts({ ready: 0, wip: 0 }));
  }, [roots]);

  useEffect(() => { load(); }, [load, pathname]);
  useFocusRefresh(load);
  return counts;
}

function AppContent() {
  const beatCount = useBeatCount();
  const studioCounts = useStudioCounts();
  const { currentBeat } = useAudioPlayerContext();
  // Die Übersicht hat ihren eigenen Player in „Als Nächstes" — die Leiste
  // taucht ab und fährt wieder rein, sobald man den Tab verlässt.
  const playerVersteckt = useLocation().pathname === "/";
  const playerVisible = !!currentBeat && !playerVersteckt;

  return (
    <div style={{ height: "100vh", width: "100vw", overflow: "hidden", background: C.background }}>
      <Sidebar beatCount={beatCount} studioCounts={studioCounts} />
      <main style={{
        marginLeft: SIDEBAR_WIDTH,
        height: "100vh",
        overflow: "hidden",
        paddingBottom: playerVisible ? PLAYER_HEIGHT : 0,
        transition: "padding-bottom 0.3s ease",
        boxSizing: "border-box",
      }}>
        <AppRoutes />
      </main>
      <GlobalAudioPlayer versteckt={playerVersteckt} />
      <GlobalTagManager />
      <Schnellsuche />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      {/* DialogProvider ganz aussen: auch der SettingsProvider muss melden
          koennen, wenn ein Wert nicht in die Datenbank kam. Er selbst haengt
          an nichts weiter als Modal und Button. */}
      <DialogProvider>
        <SettingsProvider>
          <AudioPlayerProvider>
            <VideoProvider>
              <TagManagerProvider>
                <AppContent />
              </TagManagerProvider>
            </VideoProvider>
          </AudioPlayerProvider>
        </SettingsProvider>
      </DialogProvider>
    </BrowserRouter>
  );
}
