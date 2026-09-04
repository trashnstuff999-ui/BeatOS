// src/components/studio/AssetsPane.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Studio → Assets: der Export-Ordner als Raster. Vorher war die Inbox nur
// innerhalb eines Slot-Modals sichtbar, gefiltert auf einen Slot — die Frage
// „was liegt eigentlich rum?" war in der App nicht stellbar.
//
// Klick auf eine Kachel öffnet die Projektwahl. Der umgekehrte Weg (erst
// Projekt, dann Datei) steht weiter im Inspector über BeatAssetsCard.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo } from "react";
import { Images, Film, RefreshCw, Loader2, FolderOpen, Settings } from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useNavigate } from "react-router-dom";
import { C } from "../../lib/theme";
import { api } from "../../lib/api";
import { formatRelativeTime } from "../../lib/time";
import { useFocusRefresh } from "../../hooks/useFocusRefresh";
import { EmptyState, Button, IconButton } from "../ui";
import { AssetImage } from "../AssetPickerDialog";
import { AssignToProjectDialog } from "./AssignToProjectDialog";
import type { AssetFile, StudioProject } from "../../types/studio";

type KindFilter = "all" | "image" | "video";

const KIND_LABEL: Record<KindFilter, string> = {
  all: "Alle", image: "Bilder", video: "Videos",
};

interface AssetsPaneProps {
  assetPath: string;
  /** Ziele für die Zuweisung — der letzte Scan aus dem Projekte-Tab */
  projects: StudioProject[];
  /** Nach einer Zuweisung: Projekte neu scannen (Asset-Ampel ändert sich) */
  onAssigned: () => void;
  /** Ist der Tab gerade offen? Der Pane bleibt montiert, wenn er es nicht ist. */
  active?: boolean;
}

export function AssetsPane({ assetPath, projects, onAssigned, active = true }: AssetsPaneProps) {
  const navigate = useNavigate();
  const [assets, setAssets] = useState<AssetFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<KindFilter>("all");
  const [picked, setPicked] = useState<AssetFile | null>(null);

  const scan = useCallback(async () => {
    if (!assetPath.trim()) {
      setAssets([]);
      setError("Kein Asset-Pfad gesetzt — in den Einstellungen unter „Pfade“ den Export-Ordner wählen.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      setAssets(await api.studio.scanAssetInbox(assetPath));
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, [assetPath]);

  // Erst einlesen, wenn der Tab auch offen ist — und dann bei jedem Aufklappen
  // neu, weil der Fokus-Refresh darunter geschwiegen hat, solange er zu war.
  useEffect(() => { if (active) scan(); }, [active, scan]);

  // Neuer Export aus Photoshop/Premiere → nach dem Zurückwechseln sichtbar.
  // Nur für den sichtbaren Tab: beide Panes bleiben montiert, sonst lief bei
  // jedem Alt-Tab aus FL die Inbox mit, die gerade niemand ansieht.
  useFocusRefresh(() => { if (active && !isLoading) scan(); });

  const visible = useMemo(
    () => assets.filter(a => kind === "all" || a.kind === kind),
    [assets, kind],
  );

  const counts = useMemo(() => ({
    all: assets.length,
    image: assets.filter(a => a.kind === "image").length,
    video: assets.filter(a => a.kind === "video").length,
  }), [assets]);

  return (
    <div style={{
      background: C.surfaceContainerLow,
      border: `1px solid ${C.border10}`,
      borderRadius: 12,
      overflow: "hidden",
    }}>
      {/* Kopf */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 16px",
        borderBottom: `1px solid ${C.border10}`,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.onSurface }}>
          {assets.length} {assets.length === 1 ? "Datei" : "Dateien"} in der Inbox
        </span>
        <span
          title={assetPath}
          style={{
            fontSize: 10, color: C.onSecondaryFixedVar,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260,
          }}
        >
          {assetPath.split(/[/\\]/).filter(Boolean).pop()}
        </span>

        <div style={{ flex: 1 }} />

        {/* Art-Filter */}
        <div style={{
          display: "flex", gap: 2,
          background: "rgba(255,255,255,0.03)",
          border: `1px solid ${C.border15}`,
          borderRadius: 7, padding: 2,
        }}>
          {(["all", "image", "video"] as const).map(k => (
            <button
              key={k}
              onClick={() => setKind(k)}
              style={{
                padding: "4px 11px",
                background: kind === k ? C.surfaceContainerHigh : "transparent",
                border: "none", borderRadius: 5, cursor: "pointer",
                fontSize: 10, fontWeight: 700,
                color: kind === k ? C.onSurface : C.onSecondaryFixedVar,
              }}
            >
              {KIND_LABEL[k]} {counts[k]}
            </button>
          ))}
        </div>

        <IconButton
          icon={FolderOpen}
          size={28}
          onClick={() => { if (assetPath.trim()) revealItemInDir(assetPath).catch(() => {}); }}
          disabled={!assetPath.trim()}
          title="Asset-Ordner im Explorer öffnen"
        />
        <IconButton
          icon={isLoading ? Loader2 : RefreshCw}
          size={28}
          onClick={scan}
          disabled={isLoading}
          title="Inbox neu einlesen"
        />
      </div>

      {error && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
          padding: "14px 16px", fontSize: 12, color: C.error,
        }}>
          <span>{error}</span>
          {!assetPath.trim() && (
            <Button size="sm" icon={Settings} onClick={() => navigate("/settings")}>
              Zu den Einstellungen
            </Button>
          )}
        </div>
      )}

      {!error && !isLoading && assets.length === 0 && (
        <EmptyState
          variant="inline"
          icon={Images}
          title="Die Inbox ist leer"
          description="Cover, Thumbnails und Videos, die du in den Asset-Ordner exportierst, tauchen hier auf."
        />
      )}

      {!error && visible.length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(168px, 1fr))",
          gap: 12,
          padding: 16,
        }}>
          {visible.map(a => (
            <AssetCard key={a.path} asset={a} onClick={() => setPicked(a)} />
          ))}
        </div>
      )}

      {!error && assets.length > 0 && visible.length === 0 && (
        <EmptyState variant="inline" title="Keine Datei dieser Art in der Inbox." />
      )}

      {picked && (
        <AssignToProjectDialog
          file={picked}
          projects={projects}
          assetRoot={assetPath}
          onAssigned={() => { scan(); onAssigned(); }}
          onClose={() => setPicked(null)}
        />
      )}
    </div>
  );
}

// ─── Eine Inbox-Kachel ───────────────────────────────────────────────────────

function AssetCard({ asset, onClick }: { asset: AssetFile; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={`${asset.name} — Klick weist die Datei einem Projekt zu`}
      style={{
        background: C.surfaceContainerLowest,
        border: `1px solid ${hovered ? `${C.primary}60` : C.border15}`,
        borderRadius: 10,
        overflow: "hidden",
        cursor: "pointer",
        padding: 0, textAlign: "left",
        transform: hovered ? "translateY(-2px)" : "none",
        transition: "border-color 0.15s, transform 0.12s",
      }}
    >
      <div style={{
        aspectRatio: "1 / 1",
        background: C.surfaceContainerHigh,
        display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden", position: "relative",
      }}>
        {asset.kind === "image"
          ? <AssetImage path={asset.path} />
          : <Film size={28} color={C.onSecondaryFixedVar} strokeWidth={1.25} />}

        {hovered && (
          <div style={{
            position: "absolute", inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, fontWeight: 700, color: "#fff",
            letterSpacing: "0.05em", textTransform: "uppercase",
          }}>
            Zuweisen
          </div>
        )}
      </div>
      <div style={{ padding: "8px 10px 9px" }}>
        <div style={{
          fontSize: 10, fontFamily: "monospace", color: C.onSurface,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {asset.name}
        </div>
        <div style={{ fontSize: 9.5, color: C.onSecondaryFixedVar, marginTop: 3 }}>
          {formatRelativeTime(asset.modified_secs)}
        </div>
      </div>
    </button>
  );
}
