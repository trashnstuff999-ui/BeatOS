// src/App.tsx

import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import { SIDEBAR_WIDTH } from "./lib/constants";
import Dashboard from "./pages/Dashboard";
import Browse from "./pages/Browse";
import Create from "./pages/Create";
import Studio from "./pages/Studio";
import { Settings } from "./pages/Settings";
import { Support } from "./pages/Placeholder";
import { useBeatCount } from "./hooks/useStats";
import { SettingsProvider } from "./contexts/SettingsContext";
import { AudioPlayerProvider } from "./contexts/AudioPlayerContext";
import { GlobalAudioPlayer } from "./components/GlobalAudioPlayer";
import { useAudioPlayerContext } from "./contexts/AudioPlayerContext";
import { TagManagerProvider, useTagManager } from "./contexts/TagManagerContext";
import { AllTagsModal } from "./components/create/dialogs/AllTagsModal";

function AppRoutes() {
  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/browse" element={<Browse />} />
        <Route path="/studio" element={<Studio />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/support" element={<Support />} />
      </Routes>

      {/* Create — always mounted, hidden when not active */}
      <div style={{ display: currentPath === "/create" ? "block" : "none", height: "100%" }}>
        <Create />
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

function AppContent() {
  const beatCount = useBeatCount();
  const { currentBeat } = useAudioPlayerContext();
  const playerVisible = !!currentBeat;

  return (
    <div style={{ height: "100vh", width: "100vw", overflow: "hidden", background: "#0e0e0e" }}>
      <Sidebar beatCount={beatCount} />
      <main style={{
        marginLeft: SIDEBAR_WIDTH,
        height: "100vh",
        overflow: "hidden",
        paddingBottom: playerVisible ? 80 : 0,
        boxSizing: "border-box",
      }}>
        <AppRoutes />
      </main>
      <GlobalAudioPlayer />
      <GlobalTagManager />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SettingsProvider>
        <AudioPlayerProvider>
          <TagManagerProvider>
            <AppContent />
          </TagManagerProvider>
        </AudioPlayerProvider>
      </SettingsProvider>
    </BrowserRouter>
  );
}
