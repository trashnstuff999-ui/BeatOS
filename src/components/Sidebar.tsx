// src/components/Sidebar.tsx

import { useLocation, useNavigate } from "react-router-dom";
import { LayoutGrid, LibraryBig, PlusSquare, Music, Settings, HelpCircle } from "lucide-react";
import { C } from "../lib/theme";
import { SIDEBAR_WIDTH } from "../lib/constants";

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
  const location = useLocation();
  const navigate = useNavigate();

  const handleNavClick = (to: string) => {
    if (location.pathname !== to) navigate(to);
  };

  return (
    <aside style={{
      position: "fixed", left: 0, top: 0,
      height: "100vh", width: SIDEBAR_WIDTH,
      background: C.surfaceContainerLow,
      display: "flex", flexDirection: "column",
      padding: 16, gap: 8,
      zIndex: 50,
    }}>
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 8px", marginBottom: 24 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 8,
          background: C.surfaceContainer,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "inset 0 0 10px rgba(253,161,36,0.1)",
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#fda124">
            <rect x="2" y="10" width="3" height="10" rx="1"/>
            <rect x="7" y="6" width="3" height="14" rx="1"/>
            <rect x="12" y="3" width="3" height="17" rx="1"/>
            <rect x="17" y="7" width="3" height="13" rx="1"/>
          </svg>
        </div>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.03em", color: C.primary, lineHeight: 1 }}>BeatOS</h1>
          <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: C.onSurfaceVariant, fontWeight: 500, marginTop: 2 }}>Precision Console</p>
        </div>
      </div>

      {/* Main nav */}
      <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        {NAV.map(({ to, icon: Icon, label }) => {
          const isActive = to === "/" ? location.pathname === "/" : location.pathname === to;
          return (
            <div
              key={to}
              onClick={() => handleNavClick(to)}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 16px", borderRadius: 6,
                fontSize: 14, fontWeight: 500, letterSpacing: "-0.01em",
                color: isActive ? C.primary : C.onSurfaceVariant,
                background: isActive ? C.surfaceContainer : "transparent",
                boxShadow: isActive ? "0 0 8px rgba(248,157,31,0.2)" : "none",
                cursor: "pointer", transition: "all 0.15s",
                userSelect: "none",
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  e.currentTarget.style.color = "#ffffff";
                  e.currentTarget.style.background = C.surfaceContainer;
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  e.currentTarget.style.color = C.onSurfaceVariant;
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              <Icon size={18} strokeWidth={1.5} />
              {label}
            </div>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div style={{ borderTop: `1px solid ${C.border15}`, paddingTop: 16, display: "flex", flexDirection: "column", gap: 4 }}>
        {/* Beat count */}
        <div style={{ padding: "8px 16px", marginBottom: 8 }}>
          <div style={{ background: "rgba(38,38,38,0.5)", borderRadius: 8, padding: 12 }}>
            <p style={{ fontSize: 10, color: C.onSurfaceVariant, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 4 }}>Total Beats</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: C.primary }}>{beatCount.toLocaleString()}</p>
          </div>
        </div>

        {BOTTOM_NAV.map(({ to, icon: Icon, label }) => (
          <div
            key={to}
            onClick={() => handleNavClick(to)}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 16px", borderRadius: 6,
              fontSize: 14, fontWeight: 500, letterSpacing: "-0.01em",
              color: C.onSurfaceVariant, cursor: "pointer", transition: "all 0.15s",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = C.onSurface;
              e.currentTarget.style.background = C.surfaceContainer;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = C.onSurfaceVariant;
              e.currentTarget.style.background = "transparent";
            }}
          >
            <Icon size={18} strokeWidth={1.5} />
            {label}
          </div>
        ))}
      </div>
    </aside>
  );
}
