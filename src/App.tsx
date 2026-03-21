// src/App.tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import Browse from "./pages/Browse";
import Create from "./pages/Create";
import Studio from "./pages/Studio";
import { Settings, Support } from "./pages/Placeholder";
import { mockStats } from "./lib/mockData";

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ height: "100vh", width: "100vw", overflow: "hidden", background: "#0e0e0e" }}>
        <Sidebar beatCount={mockStats.total} />
        <main style={{ marginLeft: 260, height: "100vh", overflow: "hidden" }}>
          <Routes>
            <Route path="/"         element={<Dashboard />} />
            <Route path="/browse"   element={<Browse />} />
            <Route path="/create"   element={<Create />} />
            <Route path="/studio"   element={<Studio />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/support"  element={<Support />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}