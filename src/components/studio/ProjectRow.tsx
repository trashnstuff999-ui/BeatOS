// src/components/studio/ProjectRow.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Was von der alten Projektzeile übrig ist: die Asset-Pipeline (Zuweisen-Dialog)
// und die zwei Handschalter (Inspector). Die Zeile selbst ist seit der Werkbank
// weg — Projekte stehen als Kacheln, Ideen und Aufräumen als ruhige Listen.
// ═══════════════════════════════════════════════════════════════════════════════

import { C, STUDIO_STATUS_CONFIG, alpha, radius } from "../../lib/theme";
import { deriveStage, MANUAL_STATUSES } from "../../types/studio";
import type { StudioProject } from "../../types/studio";

// ─── Asset-Spalte: eine feste Zelle pro Datei ────────────────────────────────
// Die fünf Dateien in Pipeline-Reihenfolge, gruppiert nach Audio · Bild · Video
// — dieselbe Reihenfolge, aus der deriveStage() die Stufe rechnet.
const ASSET_GROUPS: Array<Array<[keyof StudioProject, string]>> = [
  [["has_mp3", "MP3"], ["has_wav", "WAV"]],
  [["has_cover", "Cover"], ["has_thumbnail", "Thumbnail"]],
  [["has_video", "Video"]],
];
const SLOT = 40;       // Breite einer Zelle — die Kopfzeile benutzt dieselbe
const GROUP_GAP = 14;  // Luft zwischen den Gruppen — doppelt so viel wie innerhalb,
                       // sonst liest man die Gruppierung nicht mehr


// ─── Asset pipeline: MP3 · WAV | Cover · Thumbnail | Video ───────────────────

/**
 * Keine Symbole, keine Kopfzeile: in jeder Zelle steht der Dateiname selbst.
 * Was im Ordner liegt, steht in Mint und fett da; was fehlt, tritt so weit
 * zurück, dass die 841 Ideen-Zeilen ruhig bleiben. Damit beschriftet sich
 * jede Zeile selbst — es gibt keine Legende mehr, die gegen die Spalte
 * driften könnte (daher kam „EXPARTVID").
 */
export function AssetPipeline({ project: p }: { project: StudioProject }) {
  const tooltip = ASSET_GROUPS.flat()
    .map(([key, label]) => `${label} ${p[key] ? "✓" : "fehlt"}`)
    .join(" · ");

  return (
    <div title={tooltip} style={{ display: "flex", gap: GROUP_GAP, flexShrink: 0, cursor: "default" }}>
      {ASSET_GROUPS.map((group, i) => (
        <div key={i} style={{ display: "flex" }}>
          {group.map(([key, label]) => {
            const has = !!p[key];
            return (
              <div key={label} style={{ width: SLOT, display: "flex", justifyContent: "center" }}>
                {/* Vorhanden: grüne Plakette. Fehlt: lesbar, aber leise —
                    vorher 10px bei 22 % Deckkraft, praktisch unsichtbar. */}
                <span style={{
                  fontSize: 12, letterSpacing: "0.02em",
                  fontWeight: 700,
                  padding: "2px 5px", borderRadius: radius.control,
                  background: has ? alpha(C.mint, 0.14) : "transparent",
                  color: has ? C.mint : C.onSecondaryFixedVar,
                  opacity: has ? 1 : 0.45,
                }}>
                  {label.slice(0, 3).toUpperCase()}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── Die zwei Status, die du selbst vergibst ─────────────────────────────────

/**
 * Denselben Knopf nochmal drücken gibt das Projekt an die Automatik zurück.
 * Idee/Exportiert/Bereit haben keinen Knopf: die machst du mit Dateien im
 * Ordner, nicht mit einem Klick.
 *
 * Eine Wahrheit, zwei Größen: die Zeile hat wenig Platz und zeigt nur das Wort,
 * das Panel hat Platz und schreibt „… aufheben" dazu. Vorher stand beides samt
 * Tooltips wortgleich in zwei Dateien.
 */
export function ManualStatusToggles({ project: p, onPatch, variant }: {
  project: StudioProject;
  onPatch: (patch: Pick<StudioProject, "status">) => void;
  variant: "row" | "panel";
}) {
  const gross = variant === "panel";
  return (
    <div style={{ display: "flex", gap: gross ? 8 : 4 }}>
      {MANUAL_STATUSES.map(s => {
        const active = p.status === s;
        const m = STUDIO_STATUS_CONFIG[s];
        return (
          <button
            key={s}
            onClick={(e) => {
              // In der Zeile liegt darunter der Zeilenklick, der den Inspector öffnet
              e.stopPropagation();
              onPatch({ status: active ? deriveStage(p) : s });
            }}
            title={active
              ? `„${m.label}“ aufheben`
              : s === "wip"
                ? "Überarbeiten"
                : "Zum Löschen vormerken"}
            style={{
              padding: gross ? "5px 11px" : "3px 9px", borderRadius: radius.full,
              background: active ? m.bg : "transparent",
              border: `1px solid ${active ? m.color : C.border20}`,
              color: active ? m.color : C.onSecondaryFixedVar,
              fontSize: gross ? 11 : 10, fontWeight: 600,
              cursor: "pointer", whiteSpace: "nowrap",
              transition: "all 0.15s",
            }}
          >
            {active && gross ? `${m.label} aufheben` : m.label}
          </button>
        );
      })}
    </div>
  );
}


