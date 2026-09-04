// src/components/studio/AssignToProjectDialog.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Die Gegenrichtung zum AssetPickerDialog: dort wählt man vom Projekt aus eine
// Datei, hier von der Datei aus ein Projekt. Das ist der Weg, den man nach dem
// Photoshop-Export tatsächlich geht — „wohin gehört dieses Bild?".
//
// Die Ampel pro Zeile zeigt dabei, wem noch etwas fehlt: eine leere ART-Kugel
// ist die Antwort auf die Frage, ohne dass man sie stellen muss.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useMemo } from "react";
import { Search, Loader2, Film, Image as ImageIcon } from "lucide-react";
import { C, STUDIO_STATUS_CONFIG } from "../../lib/theme";
import { api } from "../../lib/api";
import { Modal } from "../ui";
import { AssetImage, type AssetSlotKind } from "../AssetPickerDialog";
import { AssetPipeline } from "./ProjectRow";
import { projectDisplayName } from "../../types/studio";
import { formatRelativeTime } from "../../lib/time";
import type { AssetFile, StudioProject } from "../../types/studio";

const SLOT_LABEL: Record<AssetSlotKind, string> = {
  cover: "Cover", thumbnail: "Thumbnail", video: "Video",
};

/** So viele Projekte stehen zur Wahl; der Rest wartet auf die Suche. */
const LIMIT = 60;

/** Vorschlag aus dem Dateinamen — "…thumb…" wird Thumbnail, sonst Cover. */
function defaultSlot(file: AssetFile): AssetSlotKind {
  if (file.kind === "video") return "video";
  return file.guessed_role === "thumbnail" ? "thumbnail" : "cover";
}

/** Wörter, die in jedem zweiten Export stehen und nichts unterscheiden. */
const NOISE = new Set([
  "cover", "thumb", "thumbnail", "video", "artwork", "art", "final", "export",
  "kopie", "copy", "neu", "new", "png", "jpg", "jpeg", "webp", "mp4", "mov",
]);

const words = (s: string) =>
  s.toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .split(/[^a-z0-9äöüß]+/i)
    .filter(w => w.length > 2 && !NOISE.has(w));

/**
 * Wie viele Wörter Dateiname und Projekt gemeinsam haben. Nach dem Export aus
 * Photoshop heißt die Datei meistens wie der Song oder trägt die Projektnummer
 * — dann steht das richtige Projekt oben statt irgendwo in 300 Zeilen.
 */
function matchScore(fileWords: string[], p: StudioProject): number {
  const target = new Set(words(`${p.song_name ?? ""} ${p.parsed_name} ${p.name}`));
  return fileWords.filter(w => target.has(w)).length;
}

interface AssignToProjectDialogProps {
  file: AssetFile;
  projects: StudioProject[];
  /** Konfigurierter Asset-Ordner (Guard im Backend) */
  assetRoot: string;
  onAssigned: () => void;
  onClose: () => void;
}

export function AssignToProjectDialog({
  file, projects, assetRoot, onAssigned, onClose,
}: AssignToProjectDialogProps) {
  const [slot, setSlot] = useState<AssetSlotKind>(() => defaultSlot(file));
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isVideo = file.kind === "video";

  // Namenstreffer zuerst, dann zuletzt bearbeitet — das gesuchte Projekt ist
  // entweder das, wie die Datei heißt, oder das, an dem man gerade war.
  // Die Suche greift auf Songtitel und Ordnernamen.
  const { visible, total, scores } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const fileWords = words(file.name);
    const scores = new Map(projects.map(p => [p.path, matchScore(fileWords, p)]));
    const hits = projects.filter(p =>
      !q || `${p.song_name ?? ""} ${p.parsed_name} ${p.name}`.toLowerCase().includes(q));
    const sorted = hits.sort((a, b) =>
      (scores.get(b.path)! - scores.get(a.path)!) || (b.modified_secs - a.modified_secs));
    return { visible: sorted.slice(0, LIMIT), total: hits.length, scores };
  }, [projects, query, file.name]);

  const assign = async (p: StudioProject) => {
    setBusy(p.path);
    setError(null);
    try {
      await api.studio.assignAsset(file.path, assetRoot, p.path, slot);
      onAssigned();
      onClose();
    } catch (e) {
      setError(`Zuweisen fehlgeschlagen: ${String(e)}`);
      setBusy(null);
    }
  };

  return (
    <Modal
      title={file.name}
      subtitle={`Als ${SLOT_LABEL[slot]} in ein Projekt verschieben`}
      icon={isVideo ? Film : ImageIcon}
      onClose={onClose}
      width={640}
      closeOnBackdrop={!busy}
    >
      {error && (
        <div style={{
          padding: "10px 12px", borderRadius: 8, marginBottom: 14,
          background: "rgba(255,115,81,0.10)", border: `1px solid ${C.error}55`,
          fontSize: 12, color: C.error,
        }}>
          {error}
        </div>
      )}

      {/* Vorschau + Slot-Wahl */}
      <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
        <div style={{
          width: 108, height: 108, flexShrink: 0,
          background: C.surfaceContainerLowest,
          border: `1px solid ${C.border15}`,
          borderRadius: 10, overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {isVideo
            ? <Film size={28} color={C.onSecondaryFixedVar} strokeWidth={1.25} />
            : <AssetImage path={file.path} />}
        </div>

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
            textTransform: "uppercase", color: C.onSecondaryFixedVar,
          }}>
            Als was zuweisen
          </div>

          {isVideo ? (
            <div style={{ fontSize: 12, color: C.onSurfaceVariant }}>
              Videodatei — geht in den Video-Slot.
            </div>
          ) : (
            <div style={{
              display: "flex", gap: 2,
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${C.border15}`,
              borderRadius: 7, padding: 2,
            }}>
              {(["cover", "thumbnail"] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSlot(s)}
                  style={{
                    flex: 1, padding: "6px 4px",
                    background: slot === s ? `${C.primary}20` : "transparent",
                    border: "none", borderRadius: 5, cursor: "pointer",
                    fontSize: 11, fontWeight: 700,
                    color: slot === s ? C.primary : C.onSecondaryFixedVar,
                  }}
                >
                  {SLOT_LABEL[s]}
                </button>
              ))}
            </div>
          )}

          <div style={{ fontSize: 10, color: C.onSecondaryFixedVar, lineHeight: 1.5 }}>
            Die Datei wird aus dem Asset-Ordner in den Projektordner verschoben.
            {slot === "thumbnail" && " Fehlt „thumbnail\" im Namen, wird es ergänzt."}
          </div>
        </div>
      </div>

      {/* Projektsuche */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        background: C.surfaceContainerLowest,
        border: `1px solid ${C.border15}`,
        borderRadius: 8, padding: "8px 11px", marginBottom: 10,
      }}>
        <Search size={12} color={C.onSecondaryFixedVar} />
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Projekt suchen …"
          style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: C.onSurface, fontSize: 12 }}
        />
      </div>

      <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        {visible.length === 0 && (
          <div style={{ padding: "28px 16px", textAlign: "center", fontSize: 12, color: C.onSurfaceVariant }}>
            {projects.length === 0
              ? "Keine Projekte geladen — erst im Projekte-Tab scannen."
              : "Kein Projekt passt zur Suche."}
          </div>
        )}
        {visible.map(p => (
          <ProjectChoice
            key={p.path}
            project={p}
            matches={(scores.get(p.path) ?? 0) > 0}
            busy={busy === p.path}
            disabled={busy !== null}
            onClick={() => assign(p)}
          />
        ))}
      </div>

      {/* Stumm abzuschneiden hieß: „mein Projekt ist weg". */}
      {total > visible.length && (
        <div style={{ paddingTop: 10, fontSize: 10, color: C.onSecondaryFixedVar, textAlign: "center" }}>
          {visible.length} von {total} — für die übrigen die Suche benutzen
        </div>
      )}
    </Modal>
  );
}

function ProjectChoice({ project: p, matches, busy, disabled, onClick }: {
  project: StudioProject;
  /** Der Dateiname nennt dieses Projekt */
  matches: boolean;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const status = STUDIO_STATUS_CONFIG[p.status] ?? STUDIO_STATUS_CONFIG.idea;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        width: "100%", padding: "9px 12px",
        background: hovered && !disabled ? "rgba(253,161,36,0.07)" : "transparent",
        border: `1px solid ${hovered && !disabled ? `${C.primary}45` : "transparent"}`,
        borderRadius: 7,
        cursor: disabled ? "default" : "pointer",
        textAlign: "left",
        opacity: disabled && !busy ? 0.45 : 1,
      }}
    >
      <span style={{
        width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
        background: status.color,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12.5, fontWeight: 600, color: C.onSurface,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {projectDisplayName(p)}
        </div>
        <div style={{ fontSize: 10, color: matches ? C.primary : C.onSecondaryFixedVar, marginTop: 1 }}>
          {matches ? "passt zum Dateinamen" : formatRelativeTime(p.modified_secs)}
        </div>
      </div>
      {busy
        ? <Loader2 size={13} color={C.primary} style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
        : <AssetPipeline project={p} />}
    </button>
  );
}
