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
import { C, STUDIO_VERLAUF, alpha } from "../../lib/theme";
import { api } from "../../lib/api";
import { formatRelativeTime, zeitText } from "../../lib/time";
import { useFocusRefresh } from "../../hooks/useFocusRefresh";
import { EmptyState, Button, IconButton } from "../ui";
import { planeNummern, type Rolle } from "../../lib/assetNummern";
import { AssetImage, AssetVideo } from "../AssetPickerDialog";
import { AssignToProjectDialog } from "./AssignToProjectDialog";
import type { AssetFile, StudioProject } from "../../types/studio";

type KindFilter = "all" | "image" | "video";

const KIND_LABEL: Record<KindFilter, string> = {
  all: "Alle", image: "Bilder", video: "Videos",
};

// Look „Wucht“: jede Art ihre Leuchtfarbe (aus den Studio-Verläufen)
const ABSCHNITTE: { rolle: AssetFile["guessed_role"]; titel: string; format: string; breite: number; farbe: string }[] = [
  { rolle: "cover",     titel: "Cover",          format: "1:1",  breite: 200, farbe: STUDIO_VERLAUF.priority.glow },
  { rolle: "thumbnail", titel: "Thumbnails",     format: "16:9", breite: 300, farbe: STUDIO_VERLAUF.wip.glow },
  { rolle: "video",     titel: "Videos",         format: "16:9", breite: 300, farbe: STUDIO_VERLAUF.exported.glow },
  { rolle: "image",     titel: "Weitere Bilder", format: "ohne cover/thumb im Namen", breite: 300, farbe: STUDIO_VERLAUF.idea.glow },
];

const ART_FARBE: Record<KindFilter, string> = {
  all: C.onSurface, image: STUDIO_VERLAUF.priority.glow, video: STUDIO_VERLAUF.exported.glow,
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

  const knopf: React.CSSProperties = {
    height: 42, display: "inline-flex", alignItems: "center", gap: 8, padding: "0 16px", borderRadius: 12,
    border: `1px solid ${C.border30}`, background: C.surfaceContainer, color: C.onSurface,
    fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 30, paddingTop: 8 }}>
      {/* Kopf: die große Zahl, rechts die Arten als Filter, darunter die Knöpfe */}
      <section aria-label="Inbox" style={{
        "--c": C.primary,
        padding: "28px 30px", borderRadius: 24, display: "flex", gap: 30, alignItems: "center", flexWrap: "wrap",
        background: `color-mix(in srgb, ${C.primary} 7%, ${C.surfaceContainerLow})`,
        border: `1px solid ${alpha(C.primary, 0.35)}`,
        boxShadow: `0 14px 38px -14px ${alpha(C.primary, 0.35)}`,
      } as React.CSSProperties}>
        <div style={{
          fontSize: "clamp(56px, 7vw, 96px)", fontWeight: 700, lineHeight: 0.9, color: C.primary,
          textShadow: `0 0 19px ${alpha(C.primary, 0.32)}`,
        }}>
          {assets.length}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.onSurface }}>
            {assets.length === 1 ? "Datei wartet auf ein Projekt" : "Dateien warten auf ein Projekt"}
          </div>
          <div title={assetPath} style={{
            marginTop: 4, fontSize: 12, fontFamily: "'JetBrains Mono', Consolas, monospace", color: C.onSecondaryFixedVar,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 320,
          }}>
            {assetPath.split(/[/\\]/).filter(Boolean).pop()}
          </div>
        </div>
        <div role="group" aria-label="Art" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginLeft: "auto" }}>
          {(["all", "image", "video"] as const).map(k => (
            <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k} className="sw-art" style={{
              "--c": ART_FARBE[k],
              border: `1px solid ${C.border30}`, background: "rgba(14,14,14,0.55)", borderRadius: 16,
              padding: "12px 16px", minWidth: 110, textAlign: "left", cursor: "pointer", fontFamily: "inherit",
            } as React.CSSProperties}>
              <b style={{ display: "block", fontSize: 30, lineHeight: 1, color: ART_FARBE[k] }}>{counts[k]}</b>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.onSurfaceVariant }}>{KIND_LABEL[k]}</span>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", width: "100%", alignItems: "center" }}>
          {auswahl ? (
            <>
              <button className="sw-bk" disabled={auswahl.size === 0} onClick={() => loeschen([...auswahl])} style={{
                ...knopf, "--c": C.error, background: C.error, borderColor: C.error, color: "#2a0a00",
                boxShadow: `0 8px 24px -8px color-mix(in srgb, ${C.error} 64%, transparent)`, opacity: auswahl.size === 0 ? 0.5 : 1,
                cursor: auswahl.size === 0 ? "default" : "pointer",
              } as React.CSSProperties}>
                <Trash2 size={15} strokeWidth={2} />
                {auswahl.size === 1 ? "1 in den Papierkorb" : `${auswahl.size} in den Papierkorb`}
              </button>
              <button className="sw-bk" onClick={() => setAuswahl(null)} style={knopf}>Fertig</button>
            </>
          ) : (
            <>
              <button className="sw-bk" onClick={nummerieren}
                disabled={nummeriertGerade || !assets.some(a => a.guessed_role === "cover" || a.guessed_role === "thumbnail")}
                title="Neuestes = 1, Cover und Thumbnails getrennt" style={knopf}>
                {nummeriertGerade ? <Loader2 size={15} style={{ animation: "spin 0.8s linear infinite" }} /> : <ListOrdered size={15} />}
                Nummerieren
              </button>
              <button className="sw-bk" onClick={() => setAuswahl(new Set())} disabled={assets.length === 0}
                title="Mehrere auswählen" style={knopf}>
                <CheckSquare size={15} />Auswählen
              </button>
            </>
          )}
          <button className="sw-bk" onClick={() => { if (assetPath.trim()) openPath(assetPath).catch(() => {}); }}
            disabled={!assetPath.trim()} title="Asset-Ordner im Explorer öffnen" style={knopf}>
            <FolderOpen size={15} />Ordner öffnen
          </button>
          <button className="sw-bk" onClick={scan} disabled={isLoading} title="Inbox neu einlesen" style={knopf}>
            {isLoading ? <Loader2 size={15} style={{ animation: "spin 0.8s linear infinite" }} /> : <RefreshCw size={15} />}
            Neu einlesen
          </button>
        </div>
      </section>

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: 12, color: C.error }}>
          <span>{error}</span>
          {!assetPath.trim() && (
            <Button size="sm" icon={Settings} onClick={() => navigate("/settings")}>
              Zu den Einstellungen
            </Button>
          )}
        </div>
      )}

      {meldung && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.error }}>
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
        <div style={{
          display: "flex", flexDirection: "column", gap: 40, padding: 24, borderRadius: 22,
          border: `1px solid ${C.border30}`, background: C.surfaceContainerLow,
        }}>
          {ABSCHNITTE.map(({ rolle, titel, format, breite, farbe }) => {
            const liste = visible.filter(a => a.guessed_role === rolle);
            if (liste.length === 0) return null;
            return (
              <section key={rolle} aria-label={titel} style={{ "--c": farbe } as React.CSSProperties}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
                  <span className="sw-punkt" style={{ width: 12, height: 12, borderRadius: "50%", background: farbe, alignSelf: "center" }} />
                  <h2 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: C.onSurface }}>{titel}</h2>
                  <span style={{ fontSize: 20, fontWeight: 700, color: farbe }}>{liste.length}</span>
                  <span style={{ fontSize: 14, color: C.onSecondaryFixedVar }}>{format}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${breite}px, 1fr))`, gap: "26px 22px" }}>
                  {liste.map((a, i) => (
                    <AssetCard
                      key={a.path}
                      index={i}
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

function AssetCard({ index, asset, onClick, auswahl, onLoeschen }: {
  index: number;
  asset: AssetFile;
  onClick: () => void;
  /** Im Auswahl-Modus: ist die Kachel angehakt? (null = kein Auswahl-Modus) */
  auswahl: boolean | null;
  onLoeschen: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [dauer, setDauer] = useState<number | null>(null);
  const [fortschritt, setFortschritt] = useState(0);
  const markiert = auswahl === true;
  const waehlen = auswahl !== null;
  const spielt = hovered && asset.kind === "video";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setFortschritt(0); }}
      title={waehlen ? `${asset.name} · auswählen` : `${asset.name} · Projekt zuweisen`}
      data-an={markiert}
      className="sw-ak"
      style={{
        "--i": Math.min(index, 20),
        display: "flex", flexDirection: "column", gap: 4, minWidth: 0,
        cursor: "pointer", textAlign: "left", outline: "none",
      } as React.CSSProperties}
    >
      {/* Cover quadratisch, Thumbnails und Videos 16:9. Bilder ohne „cover“/
          „thumb“ im Namen bleiben 16:9 und bekommen notfalls Balken. */}
      <div className="sw-ab" style={{
        aspectRatio: asset.guessed_role === "cover" ? "1 / 1" : "16 / 9",
        background: C.surfaceContainerHigh, borderRadius: 16,
        overflow: "hidden", position: "relative",
        boxShadow: "0 10px 26px -14px rgba(0,0,0,0.8)",
      }}>
        {/* Absolut, sonst drückt die Bildhöhe die Box aus dem Format */}
        <div className="sw-ab-inhalt" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {asset.kind === "image"
            ? <AssetImage key={`${asset.modified_secs}-${asset.size}`} path={asset.path} stand={`${asset.modified_secs}-${asset.size}`}
                fit={asset.guessed_role === "cover" ? "cover" : "contain"} />
            : <AssetVideo path={asset.path} onDauer={setDauer} spielen={spielt} onFortschritt={setFortschritt} />}
        </div>

        {/* Abzeichen unten rechts wie bei YouTube; beim Anspielen weicht es dem Balken */}
        {asset.kind === "video" && (
          <span style={{
            position: "absolute", right: 10, bottom: 10,
            display: "flex", alignItems: "center", gap: 5, padding: "3px 8px 3px 6px",
            borderRadius: 6, background: "rgba(0,0,0,0.75)",
            fontSize: 12, fontWeight: 700, color: "#fff", pointerEvents: "none",
            opacity: spielt ? 0 : 1, transition: "opacity 0.2s",
          }}>
            <Play size={10} color="#fff" fill="#fff" />
            {dauer != null ? zeitText(dauer) : "Video"}
          </span>
        )}
        {spielt && (
          <span aria-hidden style={{
            position: "absolute", left: 0, bottom: 0, height: 3, width: `${fortschritt * 100}%`,
            background: "var(--c)", boxShadow: "0 0 8px color-mix(in srgb, var(--c) 64%, transparent)",
          }} />
        )}

        {waehlen && (
          <span className="sw-haken" style={{
            position: "absolute", top: 10, left: 10, width: 26, height: 26, borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: markiert ? C.primary : "rgba(0,0,0,0.55)",
            border: `2px solid ${markiert ? C.primary : "rgba(255,255,255,0.7)"}`,
            transform: markiert ? "scale(1.15)" : "none",
          }}>
            {markiert && <Check size={14} color={C.onPrimary} strokeWidth={3} />}
          </span>
        )}
        {!waehlen && (<>
          <span aria-hidden className="sw-zuw" style={{
            position: "absolute", left: "50%", bottom: 14, padding: "9px 18px", borderRadius: 999,
            background: "var(--c)", color: "#111", fontSize: 13, fontWeight: 800, whiteSpace: "nowrap",
            boxShadow: "0 8px 21px -5px color-mix(in srgb, var(--c) 64%, transparent)", pointerEvents: "none",
          }}>
            Zuweisen
          </span>
          <button
            className="sw-weg"
            onClick={e => { e.stopPropagation(); onLoeschen(); }}
            aria-label="In den Papierkorb"
            title="In den Papierkorb"
            tabIndex={hovered ? 0 : -1}
            style={{
              position: "absolute", top: 10, right: 10, width: 34, height: 34, borderRadius: "50%", border: "none",
              background: "rgba(10,10,10,0.72)", color: C.onSurface, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <Trash2 size={15} strokeWidth={1.75} />
          </button>
        </>)}
      </div>
      <div style={{
        marginTop: 8, fontSize: 13, fontFamily: "'JetBrains Mono', Consolas, monospace", color: C.onSurface,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {asset.name}
      </div>
      <div style={{ fontSize: 13, color: C.onSurfaceVariant }}>
        {formatRelativeTime(asset.modified_secs)}
      </div>
    </div>
  );
}
