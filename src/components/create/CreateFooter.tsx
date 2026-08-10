// src/components/create/CreateFooter.tsx

import { FolderOpen, Network, Loader2 } from "lucide-react";
import { C } from "../../lib/theme";
import { Button } from "../ui";

interface CreateFooterProps {
  isLoading: boolean;
  isArchiving: boolean;
  sourceFolderPath: string | null;
  title: string;
  autoRename: boolean;
  onAutoRenameChange: (value: boolean) => void;
  trashSource: boolean;
  onTrashSourceChange: (value: boolean) => void;
  onSelectFolder: () => void;
  onCreateBeatstructure: () => void;
}

export function CreateFooter({
  isLoading,
  isArchiving,
  sourceFolderPath,
  title,
  autoRename,
  onAutoRenameChange,
  trashSource,
  onTrashSourceChange,
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
            ? "Beat wird archiviert …"
            : isLoading
              ? "Ordner wird gelesen …"
              : sourceFolderPath
                ? `Quelle: ${sourceFolderPath.split(/[/\\]/).pop()}`
                : "Ordner wählen, um zu starten"
          }
        </span>
      </div>

      {/* Right: Buttons */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {/* Auto-Rename Toggle */}
        <label style={{
          display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
          fontSize: 11, fontWeight: 600, letterSpacing: "0.05em",
          color: autoRename ? C.onSurface : C.onSurfaceVariant, userSelect: "none",
        }}>
          <input
            type="checkbox"
            checked={autoRename}
            onChange={e => onAutoRenameChange(e.target.checked)}
            style={{ accentColor: C.primary, width: 14, height: 14, cursor: "pointer" }}
          />
          Autom. umbenennen
        </label>

        {/* Source cleanup toggle — move semantics for the studio workflow */}
        <label
          title="Nach verifizierter Archivierung wandert der Quellordner in den Papierkorb (wiederherstellbar)"
          style={{
            display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
            fontSize: 11, fontWeight: 600, letterSpacing: "0.05em",
            color: trashSource ? C.onSurface : C.onSurfaceVariant, userSelect: "none",
          }}
        >
          <input
            type="checkbox"
            checked={trashSource}
            onChange={e => onTrashSourceChange(e.target.checked)}
            style={{ accentColor: C.primary, width: 14, height: 14, cursor: "pointer" }}
          />
          Quelle aufräumen
        </label>

        {/* Nur sichtbar, wenn schon ein Ordner gewaehlt ist — dann heisst der
            Knopf faktisch „anderen Ordner nehmen". Im Leerzustand bietet die
            Karte in der Seitenmitte dieselbe Handlung als Primaeraktion an;
            vorher standen beide gleichzeitig da, beide in Amber. */}
        {sourceFolderPath && (
          <Button
            variant="secondary"
            icon={FolderOpen}
            onClick={onSelectFolder}
            disabled={isLoading}
          >
            Ordner wechseln
          </Button>
        )}

        <Button
          variant="primary"
          icon={Network}
          loading={isArchiving}
          disabled={!canCreate}
          onClick={onCreateBeatstructure}
          style={{ padding: "10px 28px" }}
        >
          {isArchiving ? "Archiviere …" : "Beat anlegen"}
        </Button>
      </div>
    </footer>
  );
}
