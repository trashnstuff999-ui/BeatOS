// src/App.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// BeatOS App - Fixed: Uses live stats instead of mockStats
// ═══════════════════════════════════════════════════════════════════════════════

import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import Browse from "./pages/Browse";
import Create from "./pages/Create";
import Studio from "./pages/Studio";
import { Settings, Support } from "./pages/Placeholder";
import { useBeatCount } from "./hooks/useStats";

// Wrapper component that uses CSS visibility instead of unmounting
// This preserves state across tab switches
function PersistentRoutes() {
  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <>
      {/* Dashboard - always mounted, hidden when not active */}
      <div style={{ 
        display: currentPath === "/" ? "block" : "none",
        height: "100%",
      }}>
        <Dashboard />
      </div>

      {/* Browse - always mounted */}
      <div style={{ 
        display: currentPath === "/browse" ? "block" : "none",
        height: "100%",
      }}>
        <Browse />
      </div>

      {/* Create - always mounted (most important for state persistence!) */}
      <div style={{ 
        display: currentPath === "/create" ? "block" : "none",
        height: "100%",
      }}>
        <Create />
      </div>

      {/* Studio - always mounted */}
      <div style={{ 
        display: currentPath === "/studio" ? "block" : "none",
        height: "100%",
      }}>
        <Studio />
      </div>

      {/* Settings & Support - can use normal Routes since they don't need persistence */}
      {(currentPath === "/settings" || currentPath === "/support") && (
        <Routes>
          <Route path="/settings" element={<Settings />} />
          <Route path="/support" element={<Support />} />
        </Routes>
      )}
    </>
  );
}

function AppContent() {
  // Live beat count from database
  const beatCount = useBeatCount();

  return (
    <div style={{ height: "100vh", width: "100vw", overflow: "hidden", background: "#0e0e0e" }}>
      <Sidebar beatCount={beatCount} />
      <main style={{ marginLeft: 260, height: "100vh", overflow: "hidden" }}>
        <PersistentRoutes />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}