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
import { Images, Play, RefreshCw, Loader2, FolderOpen, Settings, Trash2, ListOrdered, CheckSquare, Check, X } from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { useNavigate } from "react-router-dom";
import { C, radius } from "../../lib/theme";
import { api } from "../../lib/api";
import { formatRelativeTime, zeitText } from "../../lib/time";
import { useFocusRefresh } from "../../hooks/useFocusRefresh";
import { EmptyState, Button, IconButton, Segmented } from "../ui";
import { planeNummern, type Rolle } from "../../lib/assetNummern";
import { AssetImage, AssetVideo } from "../AssetPickerDialog";
import { AssignToProjectDialog } from "./AssignToProjectDialog";
import type { AssetFile, StudioProject } from "../../types/studio";

type KindFilter = "all" | "image" | "video";

const KIND_LABEL: Record<KindFilter, string> = {
  all: "Alle", image: "Bilder", video: "Videos",
};

const ABSCHNITTE: { rolle: AssetFile["guessed_role"]; titel: string; format: string; breite: number }[] = [
  { rolle: "cover",     titel: "Cover",          format: "1:1",  breite: 200 },
  { rolle: "thumbnail", titel: "Thumbnails",     format: "16:9", breite: 300 },
  { rolle: "video",     titel: "Videos",         format: "16:9", breite: 300 },
  { rolle: "image",     titel: "Weitere Bilder", format: "ohne cover/thumb im Namen", breite: 300 },
];

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
  // Mehrfachauswahl zum Aufräumen (null = aus)
  const [auswahl, setAuswahl] = useState<Set<string> | null>(null);
  const [nummeriertGerade, setNummeriertGerade] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);

  // Ein Klick, keine Vorschau: umbenennen ist harmlos und jederzeit wiederholbar.
  const nummerieren = async () => {
    const plan = planeNummern(assets
      .filter(a => a.guessed_role === "cover" || a.guessed_role === "thumbnail")
      .map(a => ({ pfad: a.path, name: a.name, secs: a.modified_secs, rolle: a.guessed_role as Rolle })));
    if (plan.length === 0) return;
    setNummeriertGerade(true);
    try {
      const schief = (await api.studio.renameAssets(assetPath, plan.map(u => ({ pfad: u.pfad, neu: u.neu })))).filter(e => !e.ok);
      setMeldung(schief.length ? `Nicht umbenannt: ${schief.map(e => `${e.pfad.split(/[\\/]/).pop()} (${e.meldung})`).join("; ")}` : null);
    } catch (e) {
      setMeldung(String(e));
    }
    setNummeriertGerade(false);
    scan();
  };

  // In den Papierkorb — wiederholbar, darum ohne Rückfrage. Die Nummern
  // rutschen danach in Rust nach (luecken_schliessen), wie nach dem Zuweisen.
  const loeschen = async (pfade: string[]) => {
    try {
      const schief = (await api.studio.trashAssets(assetPath, pfade)).filter(e => !e.ok);
      setMeldung(schief.length ? `Nicht gelöscht: ${schief.map(e => `${e.pfad.split(/[\\/]/).pop()} (${e.meldung})`).join("; ")}` : null);
    } catch (e) {
      setMeldung(String(e));
    }
    setAuswahl(null);
    scan();
  };

  const scan = useCallback(async () => {
    if (!assetPath.trim()) {
      setAssets([]);
      setError("Kein Asset-Pfad (Einstellungen → Pfade)");
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
      borderRadius: radius.card,
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
            fontSize: 11, color: C.onSecondaryFixedVar,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260,
          }}
        >
          {assetPath.split(/[/\\]/).filter(Boolean).pop()}
        </span>

        <div style={{ flex: 1 }} />

        {/* Art-Filter */}
        <Segmented
          label="Art"
          value={kind}
          onChange={setKind}
          options={(["all", "image", "video"] as const).map(k => ({ value: k, label: `${KIND_LABEL[k]} ${counts[k]}` }))}
        />

        {auswahl ? (
          <>
            <Button size="sm" variant="danger" icon={Trash2} disabled={auswahl.size === 0} onClick={() => loeschen([...auswahl])}>
              {auswahl.size === 1 ? "1 in den Papierkorb" : `${auswahl.size} in den Papierkorb`}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAuswahl(null)}>Fertig</Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="secondary" icon={ListOrdered} loading={nummeriertGerade}
              disabled={!assets.some(a => a.guessed_role === "cover" || a.guessed_role === "thumbnail")}
              title="Neuestes = 1, Cover und Thumbnails getrennt"
              onClick={nummerieren}>
              Nummerieren
            </Button>
            <Button size="sm" variant="secondary" icon={CheckSquare} disabled={assets.length === 0}
              title="Mehrere auswählen"
              onClick={() => setAuswahl(new Set())}>
              Auswählen
            </Button>
          </>
        )}

        <IconButton
          icon={FolderOpen}
          size={28}
          onClick={() => { if (assetPath.trim()) openPath(assetPath).catch(() => {}); }}
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

      {meldung && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px 0", fontSize: 12, color: C.error }}>
          <span style={{ flex: 1 }}>{meldung}</span>
          <IconButton icon={X} size={24} title="Ausblenden" onClick={() => setMeldung(null)} />
        </div>
      )}

      {!error && !isLoading && assets.length === 0 && (
        <EmptyState
          variant="inline"
          icon={Images}
          title="Die Inbox ist leer"
          description="Exporte im Asset-Ordner erscheinen hier"
        />
      )}

      {/* Nach Art getrennt: jeder Abschnitt hat ein Format, so bleiben die
          Reihen gleich hoch. Bilder ohne „cover“/„thumb“ stehen unter Weitere. */}
      {!error && visible.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: 16 }}>
          {ABSCHNITTE.map(({ rolle, titel, format, breite }) => {
            const liste = visible.filter(a => a.guessed_role === rolle);
            if (liste.length === 0) return null;
            return (
              <section key={rolle} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.onSurfaceVariant }}>
                  <span style={{ color: C.onSurface }}>{titel}</span>
                  <span>{liste.length} · {format}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${breite}px, 1fr))`, gap: 12 }}>
                  {liste.map(a => (
                    <AssetCard
                      key={a.path}
                      asset={a}
                      auswahl={auswahl ? auswahl.has(a.path) : null}
                      onClick={() => auswahl
                        ? setAuswahl(s => { const n = new Set(s); if (n.has(a.path)) n.delete(a.path); else n.add(a.path); return n; })
                        : setPicked(a)}
                      onLoeschen={() => loeschen([a.path])}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {!error && assets.length > 0 && visible.length === 0 && (
        <EmptyState variant="inline" title="Nichts in dieser Kategorie" />
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

function AssetCard({ asset, onClick, auswahl, onLoeschen }: {
  asset: AssetFile;
  onClick: () => void;
  /** Im Auswahl-Modus: ist die Kachel angehakt? (null = kein Auswahl-Modus) */
  auswahl: boolean | null;
  onLoeschen: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [dauer, setDauer] = useState<number | null>(null);
  const markiert = auswahl === true;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={auswahl !== null ? `${asset.name} · auswählen` : `${asset.name} · Projekt zuweisen`}
      style={{
        background: C.surfaceContainerLowest,
        border: `1px solid ${markiert ? C.primary : hovered ? `${C.primary}60` : C.border15}`,
        borderRadius: radius.card,
        overflow: "hidden",
        cursor: "pointer",
        padding: 0, textAlign: "left",
        transform: hovered && auswahl === null ? "translateY(-2px)" : "none",
        transition: "border-color 0.15s, transform 0.12s",
      }}
    >
      {/* Cover quadratisch, Thumbnails und Videos 16:9. Bilder ohne „cover“/
          „thumb“ im Namen bleiben 16:9 und bekommen notfalls Balken. */}
      <div style={{
        aspectRatio: asset.guessed_role === "cover" ? "1 / 1" : "16 / 9",
        background: C.surfaceContainerHigh,
        display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden", position: "relative",
      }}>
        {/* Absolut, sonst drückt die Bildhöhe die Box aus dem Format */}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {asset.kind === "image"
            ? <AssetImage key={`${asset.modified_secs}-${asset.size}`} path={asset.path} stand={`${asset.modified_secs}-${asset.size}`}
                fit={asset.guessed_role === "cover" ? "cover" : "contain"} />
            : <AssetVideo path={asset.path} onDauer={setDauer} />}
        </div>

        {/* Abzeichen unten rechts wie bei YouTube — verdeckt keinen Titel im Bild */}
        {asset.kind === "video" && (
          <span style={{
            position: "absolute", right: 8, bottom: 8,
            display: "flex", alignItems: "center", gap: 5, padding: "3px 8px 3px 6px",
            borderRadius: 6, background: "rgba(0,0,0,0.75)",
            fontSize: 12, fontWeight: 700, color: "#fff", pointerEvents: "none",
          }}>
            <Play size={10} color="#fff" fill="#fff" />
            {dauer != null ? zeitText(dauer) : "Video"}
          </span>
        )}

        {hovered && auswahl === null && (
          <div style={{
            position: "absolute", inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 700, color: "#fff",
            letterSpacing: "0.08em", textTransform: "uppercase",
          }}>
            Zuweisen
          </div>
        )}
        {auswahl !== null && (
          <span style={{
            position: "absolute", top: 8, left: 8, width: 20, height: 20, borderRadius: 5,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: markiert ? C.primary : "rgba(0,0,0,0.55)",
            border: `1.5px solid ${markiert ? C.primary : "rgba(255,255,255,0.7)"}`,
          }}>
            {markiert && <Check size={13} color={C.onPrimary} strokeWidth={3} />}
          </span>
        )}
        {hovered && auswahl === null && (
          <span style={{ position: "absolute", top: 6, right: 6 }} onClick={e => e.stopPropagation()}>
            <IconButton icon={Trash2} size={28} variant="danger" title="In den Papierkorb" onClick={onLoeschen} />
          </span>
        )}
      </div>
      <div style={{ padding: "9px 12px 10px" }}>
        <div style={{
          fontSize: 12, fontFamily: "monospace", color: C.onSurface,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {asset.name}
        </div>
        <div style={{ fontSize: 12, color: C.onSurfaceVariant, marginTop: 3 }}>
          {formatRelativeTime(asset.modified_secs)}
        </div>
      </div>
    </div>
  );
}
