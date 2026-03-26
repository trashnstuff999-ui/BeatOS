// src/components/create/CreateFooter.tsx

import { FolderOpen, Network, Loader2 } from "lucide-react";
import { C } from "../../lib/theme";

interface CreateFooterProps {
  isLoading: boolean;
  isArchiving: boolean;
  sourceFolderPath: string | null;
  title: string;
  onSelectFolder: () => void;
  onCreateBeatstructure: () => void;
}

export function CreateFooter({
  isLoading,
  isArchiving,
  sourceFolderPath,
  title,
  onSelectFolder,
  onCreateBeatstructure,
}: CreateFooterProps) {
  const canCreate = sourceFolderPath && title && !isArchiving;

  return (
    <footer style={{
      height: 80, flexShrink: 0,
      background: "rgba(19,19,19,0.8)",
      backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
      borderTop: `1px solid ${C.border15}`,
      padding: "0 32px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
    }}>
      {/* Left: Status */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, color: C.onSurfaceVariant }}>
        {isLoading || isArchiving ? (
          <Loader2 size={18} strokeWidth={1.5} style={{ animation: "spin 1s linear infinite" }} />
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/>
          </svg>
        )}
        <span style={{ fontSize: 12, fontWeight: 500 }}>
          {isArchiving
            ? "Archiving beat..."
            : isLoading
              ? "Parsing folder..."
              : sourceFolderPath
                ? `Source: ${sourceFolderPath.split(/[/\\]/).pop()}`
                : "Select a folder to get started"
          }
        </span>
      </div>

      {/* Right: Buttons */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <button
          onClick={onSelectFolder}
          disabled={isLoading}
          style={{
            padding: "10px 24px", borderRadius: 8,
            fontSize: 14, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase",
            display: "flex", alignItems: "center", gap: 8,
            color: C.primary, background: "transparent", border: "none",
            cursor: isLoading ? "not-allowed" : "pointer",
            opacity: isLoading ? 0.5 : 1,
            transition: "background 0.15s",
          }}
          onMouseEnter={e => !isLoading && (e.currentTarget.style.background = "rgba(253,161,36,0.05)")}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
        >
          <FolderOpen size={16} strokeWidth={1.5} />
          SELECT FOLDER
        </button>

        <button
          disabled={!canCreate}
          onClick={onCreateBeatstructure}
          style={{
            padding: "10px 32px", borderRadius: 8,
            fontSize: 14, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase",
            display: "flex", alignItems: "center", gap: 8,
            color: canCreate ? "#fff" : C.onSecondaryFixedVar,
            background: canCreate ? C.primary : C.surfaceContainerHighest,
            border: `1px solid ${C.border10}`,
            cursor: canCreate ? "pointer" : "not-allowed",
            transition: "all 0.2s",
          }}
        >
          {isArchiving ? (
            <Loader2 size={16} strokeWidth={1.5} style={{ animation: "spin 1s linear infinite" }} />
          ) : (
            <Network size={16} strokeWidth={1.5} />
          )}
          {isArchiving ? "ARCHIVING..." : "CREATE BEATSTRUCTURE"}
        </button>
      </div>
    </footer>
  );
}
