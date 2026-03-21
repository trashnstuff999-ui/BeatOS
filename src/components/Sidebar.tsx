// src/components/Sidebar.tsx — 1:1 nach Stitch HTML
import { NavLink } from "react-router-dom";

// Stitch exakt: Material Symbols Icons als Text-Fallback mit Lucide
import {
  LayoutGrid, LibraryBig, PlusSquare, Music, Settings, HelpCircle
} from "lucide-react";

const C = {
  bg:          "#131313",
  active_bg:   "#1a1919",
  active_text: "#F89D1F",
  text:        "#adaaaa",
  primary:     "#fda124",
  container:   "#1a1919",
  highest:     "#262626",
  border:      "rgba(72,72,71,0.15)",
};

const NAV = [
  { to: "/",       icon: LayoutGrid,  label: "Dashboard" },
  { to: "/browse", icon: LibraryBig,  label: "Browse"    },
  { to: "/create", icon: PlusSquare,  label: "Create"    },
  { to: "/studio", icon: Music,       label: "Studio"    },
];

const BOTTOM_NAV = [
  { to: "/settings", icon: Settings,   label: "Settings" },
  { to: "/support",  icon: HelpCircle, label: "Support"  },
];

export default function Sidebar({ beatCount }: { beatCount: number }) {
  return (
    <aside style={{
      position: "fixed", left: 0, top: 0,
      height: "100vh", width: 260,
      background: C.bg,
      display: "flex", flexDirection: "column",
      padding: 16, gap: 8,
      zIndex: 50,
    }}>
      {/* Logo — exakt nach Stitch */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 8px", marginBottom: 24 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 8,
          background: C.container,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "inset 0 0 10px rgba(253,161,36,0.1)",
        }}>
          {/* graphic_eq equivalent */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#fda124">
            <rect x="2" y="10" width="3" height="10" rx="1"/>
            <rect x="7" y="6" width="3" height="14" rx="1"/>
            <rect x="12" y="3" width="3" height="17" rx="1"/>
            <rect x="17" y="7" width="3" height="13" rx="1"/>
          </svg>
        </div>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.03em", color: "#F89D1F", lineHeight: 1 }}>BeatOS</h1>
          <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: "#adaaaa", fontWeight: 500, marginTop: 2 }}>Precision Console</p>
        </div>
      </div>

      {/* Main nav */}
      <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === "/"} style={{ textDecoration: "none" }}>
            {({ isActive }) => (
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 16px", borderRadius: 6,
                  fontSize: 14, fontWeight: 500, letterSpacing: "-0.01em",
                  color: isActive ? C.active_text : C.text,
                  background: isActive ? C.active_bg : "transparent",
                  boxShadow: isActive ? "0 0 8px rgba(248,157,31,0.2)" : "none",
                  cursor: "pointer", transition: "all 0.15s",
                  userSelect: "none",
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.color = "#ffffff";
                    e.currentTarget.style.background = C.active_bg;
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.color = C.text;
                    e.currentTarget.style.background = "transparent";
                  }
                }}
              >
                <Icon size={18} strokeWidth={1.5} />
                {label}
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom section */}
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, display: "flex", flexDirection: "column", gap: 4 }}>
        {/* Beat count box */}
        <div style={{ padding: "8px 16px", marginBottom: 8 }}>
          <div style={{
            background: "rgba(38,38,38,0.5)", borderRadius: 8, padding: 12,
          }}>
            <p style={{ fontSize: 10, color: "#adaaaa", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 4 }}>Total Beats</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: C.primary }}>{beatCount.toLocaleString()}</p>
          </div>
        </div>

        {BOTTOM_NAV.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} style={{ textDecoration: "none" }}>
            <div
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 16px", borderRadius: 6,
                fontSize: 14, fontWeight: 500, letterSpacing: "-0.01em",
                color: C.text, cursor: "pointer", transition: "all 0.15s",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = "#ffffff";
                e.currentTarget.style.background = C.active_bg;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = C.text;
                e.currentTarget.style.background = "transparent";
              }}
            >
              <Icon size={18} strokeWidth={1.5} />
              {label}
            </div>
          </NavLink>
        ))}
      </div>
    </aside>
  );
}