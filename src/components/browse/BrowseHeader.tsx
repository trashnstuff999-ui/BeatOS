// src/components/browse/BrowseHeader.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Header with Search, Refresh, and User Avatar
// ═══════════════════════════════════════════════════════════════════════════════

import { RefreshCw, Bell, Search } from "lucide-react";
import { C } from "../../lib/theme";

interface BrowseHeaderProps {
  search: string;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  isLoading?: boolean;
}

export function BrowseHeader({ search, onSearchChange, onRefresh, isLoading }: BrowseHeaderProps) {
  const inputStyle: React.CSSProperties = {
    background: C.surfaceContainerLowest,
    border: "none",
    borderRadius: 2,
    padding: "8px 10px",
    paddingLeft: 36,
    width: 256,
    letterSpacing: "0.15em",
    fontSize: 12,
    fontWeight: 500,
    color: C.onSurface,
    outline: "none",
  };

  return (
    <header style={{
      height: 64,
      flexShrink: 0,
      background: "rgba(14,14,14,0.7)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "0 32px",
      borderBottom: `1px solid ${C.border15}`,
    }}>
      {/* Title */}
      <h2 style={{
        fontSize: 18,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.15em",
        color: C.primary,
        margin: 0,
      }}>
        Archive
      </h2>

      {/* Right Side */}
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        {/* Search */}
        <div style={{ position: "relative" }}>
          <Search
            size={14}
            color={C.onSurfaceVariant}
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
            }}
          />
          <input
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="SEARCH CATALOG..."
            style={inputStyle}
            onFocus={e => (e.currentTarget.style.boxShadow = `0 0 0 1px ${C.primary}`)}
            onBlur={e => (e.currentTarget.style.boxShadow = "none")}
          />
        </div>

        {/* Icons */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, color: C.onSurfaceVariant }}>
          <RefreshCw
            size={18}
            strokeWidth={1.5}
            style={{
              cursor: isLoading ? "not-allowed" : "pointer",
              opacity: isLoading ? 0.5 : 1,
              animation: isLoading ? "spin 1s linear infinite" : "none",
            }}
            onClick={isLoading ? undefined : onRefresh}
            onMouseEnter={e => {
              if (!isLoading) e.currentTarget.style.color = C.onSurface;
            }}
            onMouseLeave={e => {
              if (!isLoading) e.currentTarget.style.color = C.onSurfaceVariant;
            }}
          />
          <Bell
            size={18}
            strokeWidth={1.5}
            style={{ cursor: "pointer" }}
            onMouseEnter={e => (e.currentTarget.style.color = C.onSurface)}
            onMouseLeave={e => (e.currentTarget.style.color = C.onSurfaceVariant)}
          />
          <div style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: C.surfaceContainerHighest,
            border: `1px solid ${C.border20}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
            color: C.primary,
          }}>
            JD
          </div>
        </div>
      </div>

      {/* Keyframes for spinner */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </header>
  );
}
