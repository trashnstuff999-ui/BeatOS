// src/components/Sidebar.tsx

import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LayoutGrid, LibraryBig, Music, Upload as UploadIcon, Settings, HelpCircle, Pin, PinOff } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { C, STUDIO_STATUS_CONFIG, alpha, radius } from "../lib/theme";
import { SIDEBAR_WIDTH } from "../lib/constants";
import type { StudioStatusCounts } from "../types/studio";

// Die Namen folgen dem Wortschatz, den die App in ihren deutschen Texten
// ohnehin benutzt: „Archiv" steht schon in der Pipeline-Karte und in „Im Archiv
// oeffnen", und „Upload" ist hier ein deutsches Substantiv (Upload-Planung,
// Upload-Rhythmus) — deshalb bleibt der Tab „Upload" und wird nicht „Hochladen".
const NAV = [
  { to: "/",       icon: LayoutGrid,  label: "Übersicht"  },
  { to: "/browse", icon: LibraryBig,  label: "Archiv"     },
  { to: "/upload", icon: UploadIcon,  label: "Upload"     },
  { to: "/studio", icon: Music,       label: "Studio"     },
];

const BOTTOM_NAV = [
  { to: "/settings", icon: Settings,   label: "Einstellungen" },
  { to: "/support",  icon: HelpCircle, label: "Hilfe"         },
];

const LS_PINNED = "beatos_always_on_top";

export default function Sidebar({ beatCount, studioCounts }: {
  beatCount: number;
  /** „Bereit" und „Überarbeiten" — die zwei Zahlen am Studio-Tab */
  studioCounts?: StudioStatusCounts;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [pinned, setPinned] = useState(() => localStorage.getItem(LS_PINNED) === "1");

  // Beim Start wiederherstellen und bei jedem Umschalten anwenden
  useEffect(() => {
    localStorage.setItem(LS_PINNED, pinned ? "1" : "0");
    getCurrentWindow().setAlwaysOnTop(pinned).catch(e =>
      console.error("[Sidebar] setAlwaysOnTop failed:", e));
  }, [pinned]);

  const handleNavClick = (to: string) => {
    if (location.pathname !== to) navigate(to);
  };

  return (
    // data-app-flaeche: ein Klick hierhin heisst „ich bin woanders" — offene
    // Detailpanels schliessen sich daraufhin (siehe Browse.tsx).
    <aside data-app-flaeche style={{
      position: "fixed", left: 0, top: 0,
      height: "100vh", width: SIDEBAR_WIDTH,
      // Eine Stufe ueber dem Inhalt (#1a1919 statt #131313 auf #0e0e0e). Vorher
      // lagen nur fuenf RGB-Punkte dazwischen — die Navigation schwamm ohne
      // erkennbare Kante im Inhalt, und eine 1px-Linie bei 15 % reichte dafuer
      // nicht. Alles, was hier drin sitzt, liegt entsprechend eine Stufe hoeher.
      background: C.surfaceContainer,
      borderRight: `1px solid ${C.border15}`,
      display: "flex", flexDirection: "column",
      padding: 16, gap: 8,
      zIndex: 50,
    }}>
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 8px", marginBottom: 24 }}>
        <div style={{
          width: 40, height: 40, borderRadius: radius.control,
          background: C.surfaceContainerHigh,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `inset 0 0 10px ${alpha(C.primary, 0.1)}`,
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill={C.primary}>
            <rect x="2" y="10" width="3" height="10" rx="1"/>
            <rect x="7" y="6" width="3" height="14" rx="1"/>
            <rect x="12" y="3" width="3" height="17" rx="1"/>
            <rect x="17" y="7" width="3" height="13" rx="1"/>
          </svg>
        </div>
        {/* Ohne Untertitel: „Precision Console" sagt nichts, was die App nicht
            selbst zeigt, und stand in jedem Tab dauerhaft im Blick. */}
        <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.03em", color: C.primary, lineHeight: 1 }}>BeatOS</h1>
      </div>

      {/* Main nav */}
      <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        {NAV.map(({ to, icon: Icon, label }) => {
          // „Neuer Beat“ ist ein Schritt im Studio, kein eigener Tab — dort bleibt
          // das Studio markiert, damit man weiss, wo man ist.
          const isActive = location.pathname === to
            || (to === "/studio" && location.pathname === "/create");
          return (
            <button
              key={to}
              onClick={() => handleNavClick(to)}
              // aria-current: Vorlesehilfen sagen damit „aktuelle Seite" —
              // die Amber-Faerbung allein sagt das nur, wer sie sieht.
              aria-current={isActive ? "page" : undefined}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 16px", borderRadius: radius.control,
                fontSize: 14, fontWeight: 500, letterSpacing: "-0.01em",
                fontFamily: "inherit", textAlign: "left", width: "100%",
                border: "none",
                color: isActive ? C.primary : C.onSurfaceVariant,
                background: isActive ? C.surfaceContainerHigh : "transparent",
                boxShadow: isActive ? `0 0 8px ${alpha(C.primary, 0.2)}` : "none",
                cursor: "pointer", transition: "all 0.15s",
                userSelect: "none",
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  e.currentTarget.style.color = C.onSurface;
                  e.currentTarget.style.background = C.surfaceContainerHigh;
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
              {/* Was im Studio ansteht: fertig zum Archivieren und selbst
                  vorgemerkt. Dieselben Farben wie die Status-Pillen in der
                  Liste — die Zahl ist damit ohne Legende lesbar. */}
              {to === "/studio" && studioCounts && (
                <span style={{ marginLeft: "auto", display: "flex", gap: 5 }}>
                  <CountPill status="ready" value={studioCounts.ready} />
                  <CountPill status="wip" value={studioCounts.wip} />
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div style={{ borderTop: `1px solid ${C.border15}`, paddingTop: 16, display: "flex", flexDirection: "column", gap: 4 }}>
        {/* Beat count — eine Zahl braucht keinen Kasten */}
        <div style={{
          display: "flex", alignItems: "baseline", gap: 8,
          padding: "4px 16px 12px",
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.primary }}>
            {beatCount.toLocaleString()}
          </span>
          <span style={{ fontSize: 10, color: C.onSurfaceVariant, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Beats
          </span>
        </div>

        {/* Immer im Vordergrund — damit BeatOS neben FL Studio offen bleibt */}
        <BottomRow
          icon={pinned ? Pin : PinOff}
          label={pinned ? "Immer vorn: an" : "Immer vorn: aus"}
          active={pinned}
          onClick={() => setPinned(p => !p)}
        />

        {BOTTOM_NAV.map(({ to, icon: Icon, label }) => (
          <BottomRow key={to} icon={Icon} label={label} onClick={() => handleNavClick(to)} />
        ))}
      </div>
    </aside>
  );
}

function BottomRow({ icon: Icon, label, active = false, onClick }: {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  const idle = active ? C.primary : C.onSurfaceVariant;
  return (
    <button
      onClick={onClick}
      aria-pressed={active || undefined}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 16px", borderRadius: radius.control,
        fontSize: 14, fontWeight: 500, letterSpacing: "-0.01em",
        fontFamily: "inherit", textAlign: "left", width: "100%",
        border: "none",
        color: idle,
        background: active ? C.surfaceContainerHigh : "transparent",
        cursor: "pointer", transition: "all 0.15s",
        userSelect: "none",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.color = active ? C.primary : C.onSurface;
        e.currentTarget.style.background = C.surfaceContainerHigh;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.color = idle;
        e.currentTarget.style.background = active ? C.surfaceContainerHigh : "transparent";
      }}
    >
      <Icon size={18} strokeWidth={1.5} />
      {label}
    </button>
  );
}

/**
 * Eine der zwei Studio-Zahlen. Null bleibt leer statt eine „0" hinzustellen —
 * nichts zu tun ist keine Meldung wert.
 */
function CountPill({ status, value }: { status: "ready" | "wip"; value: number }) {
  if (value <= 0) return null;
  const m = STUDIO_STATUS_CONFIG[status];
  return (
    <span
      title={`${value} ${value === 1 ? "Projekt" : "Projekte"} auf „${m.label}“`}
      style={{
        padding: "1px 7px", borderRadius: radius.full,
        background: m.bg, color: m.color,
        fontSize: 10, fontWeight: 700,
      }}
    >
      {value}
    </span>
  );
}
