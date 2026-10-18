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
import { Images, Play, RefreshCw, Loader2, FolderOpen, Settings, Trash2, ListOrdered, CheckSquare, Check, X, ArrowRight } from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useNavigate } from "react-router-dom";
import { C, radius } from "../../lib/theme";
import { api } from "../../lib/api";
import { formatRelativeTime } from "../../lib/time";
import { useFocusRefresh } from "../../hooks/useFocusRefresh";
import { EmptyState, Button, IconButton, Modal, Segmented } from "../ui";
import { bildHash, nummerAusName, planeNummern, rolleAusMassen, rolleAusName, type Bild, type Umbenennung } from "../../lib/assetNummern";
import { AssetImage, AssetVideo } from "../AssetPickerDialog";
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
  // Mehrfachauswahl zum Aufräumen (null = aus)
  const [auswahl, setAuswahl] = useState<Set<string> | null>(null);
  const [nummernOffen, setNummernOffen] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);

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
            <Button size="sm" variant="secondary" icon={ListOrdered} disabled={counts.image === 0}
              title="Covers und Thumbnails fortlaufend nummerieren — Paare bekommen dieselbe Nummer"
              onClick={() => setNummernOffen(true)}>
              Nummerieren …
            </Button>
            <Button size="sm" variant="secondary" icon={CheckSquare} disabled={assets.length === 0}
              title="Mehrere Dateien auswählen und in den Papierkorb legen"
              onClick={() => setAuswahl(new Set())}>
              Auswählen
            </Button>
          </>
        )}

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

      {meldung && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px 0", fontSize: 12, color: C.error }}>
          <span style={{ flex: 1 }}>{meldung}</span>
          <IconButton icon={X} size={24} title="Ausblenden" onClick={() => setMeldung(null)} />
        </div>
      )}

      {nummernOffen && (
        <NummerDialog
          bilder={assets.filter(a => a.kind === "image")}
          assetPath={assetPath}
          onClose={geaendert => { setNummernOffen(false); if (geaendert) scan(); }}
        />
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
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 12,
          padding: 16,
          alignItems: "start",
        }}>
          {visible.map(a => (
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

function AssetCard({ asset, onClick, auswahl, onLoeschen }: {
  asset: AssetFile;
  onClick: () => void;
  /** Im Auswahl-Modus: ist die Kachel angehakt? (null = kein Auswahl-Modus) */
  auswahl: boolean | null;
  onLoeschen: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const markiert = auswahl === true;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={auswahl !== null ? `${asset.name} — Klick wählt aus` : `${asset.name} — Klick weist die Datei einem Projekt zu`}
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
        {asset.kind === "image"
          ? <AssetImage key={`${asset.modified_secs}-${asset.size}`} path={asset.path} stand={`${asset.modified_secs}-${asset.size}`} />
          : <AssetVideo path={asset.path} />}

        {asset.kind === "video" && (
          <span style={{
            position: "absolute", inset: 0, margin: "auto", width: 44, height: 44, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)",
            border: "1px solid rgba(255,255,255,0.35)", pointerEvents: "none",
          }}>
            <Play size={18} color="#fff" fill="#fff" style={{ marginLeft: 2 }} />
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

// ─── Nummerieren: Vorschau, umbenannt wird erst beim Klick ───────────────────

function NummerDialog({ bilder: bilderBeimOeffnen, assetPath, onClose }: {
  bilder: AssetFile[];
  assetPath: string;
  onClose: (geaendert: boolean) => void;
}) {
  // Beim Öffnen festhalten — ein Fokus-Refresh im Tab soll nicht neu vergleichen.
  const [bilder] = useState(bilderBeimOeffnen);
  const [plan, setPlan] = useState<Umbenennung[] | null>(null);
  const [an, setAn] = useState<Record<string, boolean>>({});
  const [laeuft, setLaeuft] = useState(false);
  const [ergebnis, setErgebnis] = useState<{ pfad: string; ok: boolean; meldung: string }[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  // Nur Bilder ohne Nummer werden geladen und verglichen — die mit Nummer
  // behalten sie ohnehin.
  useEffect(() => {
    let ab = false;
    (async () => {
      const liste: Bild[] = [];
      for (const b of bilder) {
        const bild: Bild = { pfad: b.path, name: b.name, secs: b.modified_secs, rolle: rolleAusName(b.name), hash: null };
        if (!nummerAusName(b.name)) {
          try {
            const m = await bildHash(await api.create.readImageFile(b.path));
            bild.hash = m.hash;
            bild.rolle ??= rolleAusMassen(m.breite, m.hoehe);
          } catch { /* nicht lesbar: bleibt ohne Vergleich, nur Zeit */ }
        }
        liste.push(bild);
      }
      if (!ab) setPlan(planeNummern(liste));
    })().catch(e => { if (!ab) setFehler(String(e)); });
    return () => { ab = true; };
  }, [bilder]);

  // Unsichere Paare sind Vorschläge — standardmäßig aus.
  const gewaehlt = (plan ?? []).filter(u => an[u.pfad] ?? !u.unsicher);
  const standVon = (pfad: string) => { const b = bilder.find(x => x.path === pfad); return b ? `${b.modified_secs}-${b.size}` : undefined; };

  const umbenennen = async () => {
    setLaeuft(true);
    try { setErgebnis(await api.studio.renameAssets(assetPath, gewaehlt.map(u => ({ pfad: u.pfad, neu: u.neu })))); }
    catch (e) { setFehler(String(e)); }
    finally { setLaeuft(false); }
  };

  return (
    <Modal
      icon={ListOrdered}
      title="Covers und Thumbnails nummerieren"
      subtitle="Lückenlos ab 1, Reihenfolge bleibt, Neues kommt hinten dran. Gleiches Motiv → gleiche Nummer."
      width={640}
      onClose={() => onClose(!!ergebnis)}
      closeOnBackdrop={!laeuft}
      footer={ergebnis ? (
        <Button variant="primary" onClick={() => onClose(true)}>Schließen</Button>
      ) : (
        <>
          <Button variant="ghost" onClick={() => onClose(false)}>Abbrechen</Button>
          <Button variant="primary" icon={ListOrdered} loading={laeuft} disabled={gewaehlt.length === 0} onClick={umbenennen}>
            {gewaehlt.length === 1 ? "1 Datei umbenennen" : `${gewaehlt.length} Dateien umbenennen`}
          </Button>
        </>
      )}
    >
      {fehler && <div style={{ fontSize: 12, color: C.error, marginBottom: 8 }}>{fehler}</div>}
      {!plan && !fehler && <div style={{ fontSize: 12, color: C.onSecondaryFixedVar }}>Vergleiche die Bilder …</div>}
      {plan && plan.length === 0 && !ergebnis && (
        <div style={{ fontSize: 12, color: C.onSecondaryFixedVar }}>Alles ist schon nummeriert.</div>
      )}
      {plan && plan.length > 0 && !ergebnis && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 380, overflowY: "auto" }}>
          {plan.map(u => (
            <label key={u.pfad} style={{
              display: "grid", gridTemplateColumns: "18px 44px minmax(0, 1fr) 14px minmax(0, 1fr)", alignItems: "center", gap: 10,
              padding: "6px 10px", borderRadius: radius.control, cursor: "pointer", fontSize: 12,
              background: C.surfaceContainerLow,
            }}>
              <input type="checkbox" checked={an[u.pfad] ?? !u.unsicher} style={{ accentColor: C.primary }}
                onChange={e => setAn(v => ({ ...v, [u.pfad]: e.target.checked }))} />
              <span style={{ width: 44, height: 28, borderRadius: 4, overflow: "hidden", background: C.surfaceContainerHigh }}>
                <AssetImage path={u.pfad} fit="cover" stand={standVon(u.pfad)} />
              </span>
              <span style={{ color: C.onSurfaceVariant, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.alt}</span>
              <ArrowRight size={12} color={C.onSecondaryFixedVar} />
              <span style={{ color: C.onSurface, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                title={u.unsicher ? "Nur über die Exportzeit gepaart — das Bild sieht anders aus. Prüfen, bevor du es anhakst." : undefined}>
                {u.neu}{u.unsicher && <span style={{ color: C.primary, fontWeight: 400 }}> · unsicher</span>}
              </span>
            </label>
          ))}
        </div>
      )}
      {ergebnis && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {ergebnis.map(e => (
            <div key={e.pfad} style={{ display: "flex", gap: 8, fontSize: 12, color: e.ok ? C.mint : C.error }}>
              {e.ok ? <Check size={13} /> : <X size={13} />}
              <span style={{ color: C.onSurface }}>{e.pfad.split(/[\/]/).pop()}</span>
              <span>{e.ok ? `→ ${e.meldung}` : e.meldung}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
