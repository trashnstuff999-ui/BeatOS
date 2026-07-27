// src/components/studio/AssetsPane.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Studio → Assets: pick a project in the Projects tab, then assign its
// Cover / Thumbnail / Video here via three slots. Assigning moves the file
// out of the asset inbox into the project folder (BeatAssetsCard + the shared
// AssetPickerDialog handle the inbox scan and the move).
// ═══════════════════════════════════════════════════════════════════════════════

import { Crosshair, X } from "lucide-react";
import { C } from "../../lib/theme";
import { projectDisplayName } from "../../types/studio";
import { useFolderAssets } from "../../hooks/useFolderAssets";
import { BeatAssetsCard } from "../BeatAssetsCard";
import type { StudioProject } from "../../types/studio";

interface AssetsPaneProps {
  assetPath: string;
  /** Im Projekte-Tab gewähltes Ziel-Projekt */
  selectedProject: StudioProject | null;
  onClearSelection: () => void;
  /** parent bumps project scan after an assignment (asset flags change) */
  onAssigned: () => void;
}

export function AssetsPane({ assetPath, selectedProject, onClearSelection, onAssigned }: AssetsPaneProps) {
  const folderAssets = useFolderAssets(selectedProject?.path ?? null);

  return (
    <div style={{
      background: C.surfaceContainerLow,
      border: `1px solid ${C.border10}`,
      borderRadius: 12,
    }}>
      {/* Target banner — the project picked in the Projects tab */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 16px",
        borderBottom: `1px solid ${C.border10}`,
        background: selectedProject ? "rgba(253,161,36,0.06)" : "transparent",
      }}>
        <Crosshair size={13} color={selectedProject ? C.primary : C.onSecondaryFixedVar} strokeWidth={2} />
        {selectedProject ? (
          <>
            <span style={{ fontSize: 11, color: C.onSurfaceVariant }}>Assets für:</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.primary }}>
              {projectDisplayName(selectedProject)}
            </span>
            <button
              onClick={onClearSelection}
              title="Auswahl aufheben"
              style={{ background: "none", border: "none", cursor: "pointer", color: C.onSurfaceVariant, display: "flex", padding: 2 }}
            >
              <X size={12} />
            </button>
          </>
        ) : (
          <span style={{ fontSize: 11, color: C.onSecondaryFixedVar }}>
            Kein Projekt gewählt — im Projekte-Tab eine Zeile anklicken.
          </span>
        )}
      </div>

      {selectedProject ? (
        <div style={{ padding: 16 }}>
          <BeatAssetsCard
            assets={folderAssets.assets}
            folderPath={selectedProject.path}
            assetPath={assetPath}
            isRefreshing={folderAssets.isRefreshing}
            onRefresh={() => { folderAssets.refresh(); onAssigned(); }}
            title="Cover & Assets"
            showArchiveWarning={false}
          />
        </div>
      ) : (
        <div style={{ padding: "48px 20px", textAlign: "center", fontSize: 12, color: C.onSurfaceVariant, lineHeight: 1.6 }}>
          Wähle im Projekte-Tab ein Projekt, um Cover, Thumbnail und Video
          zuzuweisen. Die Exporte werden aus deinem Asset-Ordner in den
          Projektordner verschoben.
        </div>
      )}
    </div>
  );
}
