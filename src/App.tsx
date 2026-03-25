// src/App.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// BeatOS App - With Navigation Guard for Create Tab
// Only Create stays persistent, other tabs unmount normally
// ═══════════════════════════════════════════════════════════════════════════════

import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import Browse from "./pages/Browse";
import Create from "./pages/Create";
import Studio from "./pages/Studio";
import { Settings, Support } from "./pages/Placeholder";
import { useBeatCount } from "./hooks/useStats";
import { NavigationGuardProvider } from "./contexts/NavigationGuardContext";

// ═══════════════════════════════════════════════════════════════════════════════
// Routes - Only Create stays persistent
// ═══════════════════════════════════════════════════════════════════════════════

function AppRoutes() {
  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <>
      {/* Normal Routes - unmount when not active */}
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/browse" element={<Browse />} />
        <Route path="/studio" element={<Studio />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/support" element={<Support />} />
      </Routes>

      {/* Create - always mounted, hidden when not active (preserves form state) */}
      <div
        style={{
          display: currentPath === "/create" ? "block" : "none",
          height: "100%",
        }}
      >
        <Create />
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// App Content
// ═══════════════════════════════════════════════════════════════════════════════

function AppContent() {
  const beatCount = useBeatCount();

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        background: "#0e0e0e",
      }}
    >
      <Sidebar beatCount={beatCount} />
      <main
        style={{
          marginLeft: 260,
          height: "100vh",
          overflow: "hidden",
        }}
      >
        <AppRoutes />
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// App Root
// ═══════════════════════════════════════════════════════════════════════════════

export default function App() {
  return (
    <BrowserRouter>
      <NavigationGuardProvider>
        <AppContent />
      </NavigationGuardProvider>
    </BrowserRouter>
  );
}
