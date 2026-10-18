// src/components/browse/DetailPanel.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Archiv-Detailpanel — der Datensatz selbst, nicht seine Vorschau.
//
// Vorher standen dieselben fünf Werte an drei Stellen: in der Tabellenzeile, im
// Panel (als Anzeige) und noch einmal im „Beat bearbeiten"-Modal (als Formular).
// Das Modal ist gelöscht; geändert wird hier, wo der Beat steht.
//
// Zwei Sorten Änderung, bewusst verschieden behandelt:
//   sofort         — Status, Uploads, Tags, Favorit. Ein Klick, ein Schreibvorgang.
//   mit Speichern  — Name, Tempo, Tonart, Notiz, Verkauft an. Getippter Text
//                    braucht einen Punkt, an dem er fertig ist.
//
// Warum Name, Tempo und Tonart zusammengehören: der Ordnername auf der Platte
// wird aus genau diesen drei Werten gebaut („0421 - Titel [Cm 140]", siehe
// sync_beat_folder in rename.rs). Nach dem Speichern heißt der Ordner also
// anders als der Beat. Deshalb fragt das Panel danach einmal im Trockenlauf
// nach und bietet das Angleichen genau dort an — statt als Dauerknopf im Fuß,
// wo es aussah wie beliebige Wartung.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";
import {
  X, Heart, FolderOpen, Music, Plus, Trash2, AlertTriangle,
  FolderTree, Upload as UploadIcon, FileMusic, CopyPlus,
} from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { api } from "../../lib/api";
import { revealItemInDir, openPath } from "@tauri-apps/plugin-opener";
import { C, alpha, radius } from "../../lib/theme";
import { BROWSE_PANEL_WIDTH } from "../../lib/constants";
import { PLAYER_HEIGHT } from "../GlobalAudioPlayer";
import { TagPill } from "../Tagpill";
import { useAudioPlayerContext } from "../../contexts/AudioPlayerContext";
import type { Beat, BeatStatus, EditFormState, UpdateBeatParams } from "../../types/browse";
import { parseTags, isFavorite, beatToEditForm } from "../../types/browse";
import { STATUS_CONFIG, STATUS_ITEMS } from "../../lib/theme";
import { Segmented } from "../ui";
import { getTagCategoryFromDb, sortTagsByCategory } from "../../lib/tags";
import { useTagManager } from "../../contexts/TagManagerContext";
import { useSettings, parseProductionPaths } from "../../contexts/SettingsContext";
import { useDialog } from "../../contexts/DialogContext";
import { UploadPlatformGrid } from "../upload/UploadStatusCard";
import type { UploadPlatformRow } from "../../types/upload";

interface DetailPanelProps {
  beat: Beat;
  isOpen: boolean;
  onClose: () => void;
  onToggleFavorite: (beatId: string) => void;
  onUpdateStatus: (beatId: string, status: BeatStatus) => void;
  /** Name, Tempo, Tonart, Notiz, Verkauft an — gesammelt, auf Knopfdruck. */
  onSaveBeat: (params: UpdateBeatParams) => Promise<void>;
  preloadedCoverUrl?: string | null;
  onUpdateTags?: (beatId: string, tags: string[]) => void;
  onDelete?: (beat: Beat) => Promise<void>;
  /** Läuft nach jeder Upload-Änderung — damit die Plattform-Punkte in Raster
   *  und Tabelle nicht stehen bleiben, während das Panel schon weiter ist. */
  onUploadsChanged?: () => void;
  /** Läuft nach dem Angleichen. Hier ist der volle Refresh richtig: Ordner-
   *  und Dateinamen ändern sich, also auch der Pfad zum Cover. */
  onRenamed?: () => void;
  /** Diesen Beat im Upload-Tab öffnen — dort steht alles Ausführliche:
   *  Beschreibungen, Type-Beat, Asset-Ampel. */
  onOpenInUpload?: (beat: Beat) => void;
}

/** Eingabefelder, die wie Text aussehen, bis man sie anfasst.
 *
 *  Ein Panel voller Rahmen wäre wieder eine Maske; ein Feld ohne jeden Hinweis
 *  wäre unfindbar. Deshalb: im Ruhezustand nichts, unter dem Zeiger eine
 *  Andeutung, im Fokus eine echte Fläche. `-hell` ist dieselbe Idee auf dem
 *  Cover, wo der Untergrund ein Foto ist und Weiß auf Weiß nicht funktioniert. */
const FELD_CSS = `
  .beatos-feld {
    width: 100%; box-sizing: border-box;
    padding: 4px 7px; margin: -4px -7px;
    background: transparent;
    border: 1px solid transparent; border-radius: 6px;
    color: ${C.onSurface}; font: inherit; outline: none;
    transition: background 0.15s, border-color 0.15s;
  }
  .beatos-feld:hover  { background: rgba(255,255,255,0.05); }
  .beatos-feld:focus  { background: ${C.surfaceContainer}; border-color: ${C.primary}66; }
  .beatos-feld::placeholder { color: ${C.onSecondaryFixedVar}; }
  .beatos-feld-hell        { color: #fff; }
  .beatos-feld-hell:hover  { background: rgba(0,0,0,0.35); }
  .beatos-feld-hell:focus  { background: rgba(0,0,0,0.6); border-color: rgba(255,255,255,0.4); }
  .beatos-feld-hell::placeholder { color: rgba(255,255,255,0.5); }
`;

export function DetailPanel({
  beat,
  isOpen,
  onClose,
  onToggleFavorite,
  onUpdateStatus,
  onSaveBeat,
  preloadedCoverUrl,
  onUpdateTags,
  onDelete,
  onUploadsChanged,
  onRenamed,
  onOpenInUpload,
}: DetailPanelProps) {
  const fav = isFavorite(beat);
  const { openTagManager } = useTagManager();

  const [localTags, setLocalTags] = useState<string[]>(parseTags(beat.tags));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setConfirmDelete(false);
    setIsDeleting(false);
    setDeleteError(null);
  }, [beat.id]);

  const handleDeleteConfirm = async () => {
    if (!onDelete || isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(beat);
      // Parent will close panel via selection clear; nothing further needed here.
    } catch (e) {
      setDeleteError(String(e));
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    setLocalTags(parseTags(beat.tags));
  }, [beat.id, beat.tags]);

  // ── Entwurf: die getippten Felder ─────────────────────────────────────────
  // Abhängig von den Werten, nicht vom Objekt: nach einer Tag- oder
  // Status-Änderung lädt das Archiv neu und reicht ein neues `beat`-Objekt
  // durch. Hinge der Entwurf daran, wäre halbfertig getippter Text weg.
  const [form, setForm] = useState<EditFormState>(() => beatToEditForm(beat));
  const [isSaving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setForm(beatToEditForm(beat));
    setSaveError(null);
  }, [beat.id, beat.name, beat.bpm, beat.key, beat.notes, beat.sold_to]);

  const original = beatToEditForm(beat);
  // Tags bleiben bewusst außen vor: sie werden sofort geschrieben, nicht
  // gesammelt. Stünden sie im Entwurf, meldete die Leiste „ungespeichert",
  // während die Änderung längst in der DB steht.
  const namensfelderGeaendert =
    form.name !== original.name || form.bpm !== original.bpm || form.key !== original.key;
  const dirty =
    namensfelderGeaendert || form.notes !== original.notes || form.sold_to !== original.sold_to;

  const setFeld = <K extends keyof EditFormState>(key: K, value: EditFormState[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const verwerfen = () => { setForm(beatToEditForm(beat)); setSaveError(null); };

  const speichern = async () => {
    if (!dirty || isSaving) return;
    setSaving(true);
    setSaveError(null);
    const nameRelevant = namensfelderGeaendert;
    try {
      await onSaveBeat({
        id:      beat.id,
        // Ein leerer Name würde den Ordnernamen zerstören — leer heißt hier
        // „nicht geändert", nicht „lösch den Titel".
        name:    form.name.trim() || beat.name,
        // `update_beat` laesst null aus dem Update heraus ("nicht geaendert"),
        // deshalb loescht die Tonart ein leerer String statt null — den lesen
        // Anzeige und Ordnername gleich als "keine Tonart".
        // ponytail: das Tempo laesst sich damit nicht leeren; dafuer muesste
        // update_beat null von "weggelassen" unterscheiden koennen.
        bpm:     form.bpm.trim() ? parseFloat(form.bpm) : null,
        key:     form.key.trim(),
        notes:   form.notes,
        sold_to: form.sold_to.trim() || null,
      });
      if (nameRelevant) await ordnerPruefen();
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  };

  // ── Ordnername gegen die DB-Werte prüfen ──────────────────────────────────
  // Trockenlauf, schreibt nichts: er meldet den Zielnamen und wie viele
  // Dateien danebenliegen. Nur nach einer Änderung an Name/Tempo/Tonart —
  // bei jedem Klick im Archiv wäre es ein Verzeichnis-Scan pro Auswahl.
  // ponytail: Altbestand (nie angeglichene Beats) faellt damit durch; dafuer
  // gibt es den Stapellauf im Kopf der Seite.
  const [ordnerZiel, setOrdnerZiel] = useState<string | null>(null);
  const [angleichBusy, setAngleichBusy] = useState(false);
  const [angleichFehler, setAngleichFehler] = useState<string | null>(null);

  useEffect(() => { setOrdnerZiel(null); setAngleichFehler(null); }, [beat.id]);

  const ordnerPruefen = async () => {
    try {
      const [r] = await api.archive.syncFolders([beat.id], true);
      const zuTun = !!r && !r.error && (r.from !== r.to || r.files_renamed > 0);
      setOrdnerZiel(zuTun ? r.to : null);
    } catch {
      // Kein Hinweis ist besser als ein falscher.
      setOrdnerZiel(null);
    }
  };

  const angleichen = async () => {
    setAngleichBusy(true);
    setAngleichFehler(null);
    try {
      const [r] = await api.archive.syncFolders([beat.id], false);
      if (!r || r.error) {
        setAngleichFehler(r?.error ?? "Kein Ergebnis");
      } else {
        setOrdnerZiel(null);
        onRenamed?.();
      }
    } catch (e) {
      setAngleichFehler(String(e));
    } finally {
      setAngleichBusy(false);
    }
  };

  /** Enter speichert, Escape verwirft — in einzeiligen Feldern. */
  const tastatur = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === "Enter" && e.currentTarget.tagName !== "TEXTAREA") {
      e.preventDefault();
      speichern();
    } else if (e.key === "Escape") {
      e.stopPropagation();   // sonst schließt Browse gleich die Auswahl mit
      verwerfen();
      e.currentTarget.blur();
    }
  };

  // ── Uploads nachtragen, ohne den Tab zu wechseln ──────────────────────────
  // `get_upload_data` liefert immer alle drei Plattformen — auch für einen
  // Beat, zu dem noch gar nichts erfasst ist. Genau das ist der Fall, um den
  // es hier geht: im Archiv stehen Beats als "nicht hochgeladen", die längst
  // öffentlich sind.
  const [uploads, setUploads] = useState<UploadPlatformRow[] | null>(null);
  // Der Rückweg nach FL: ohne ihn hiess es Explorer → 01_SAVEFILES → Doppelklick.
  const [flpPath, setFlpPath] = useState<string | null>(null);
  const { settings } = useSettings();
  const { melde } = useDialog();
  const [versionBusy, setVersionBusy] = useState(false);

  // Remix/neue Fassung: die FLP des Beats als Vorlage für ein frisches
  // Studio-Projekt — derselbe Weg wie „Neues Projekt“, nur ohne Dateidialog.
  // Kopiert wird nur die eine FLP (master vor neuester), keine Backups.
  const handleNewVersion = async () => {
    if (!flpPath || versionBusy) return;
    const roots = parseProductionPaths(settings.productionPath);
    if (roots.length === 0) {
      melde("Kein Produktions-Ordner gesetzt — Einstellungen → Pfade.", "fehler");
      return;
    }
    setVersionBusy(true);
    try {
      // Name bleibt neutral (auch zum Flippen alter Samples gedacht, da soll
      // der Klon nicht auffallen) — die Herkunft steht nur in der Notiz.
      const name = await api.studio.nextProjectName(roots);
      const flp = await api.studio.createProject(roots[0], name, flpPath);
      const ordner = flp.slice(0, Math.max(flp.lastIndexOf("\\"), flp.lastIndexOf("/")));
      // "idea" ist kein Hand-Status — die Automatik rechnet weiter selbst.
      await api.studio.updateProject(ordner, "idea", 0, `Neue Version von „${beat.name}“ (Archiv)`)
        .catch(() => {});  // Notiz ist Beiwerk, das Projekt steht trotzdem
      melde(`„${name}“ im Studio angelegt — öffnet in FL`, "erfolg");
      await openPath(flp).catch(e => melde(`FL öffnet „${name}“ nicht: ${String(e)}`, "fehler"));
    } catch (e) {
      melde(`Neue Version fehlgeschlagen: ${String(e)}`, "fehler");
    } finally {
      setVersionBusy(false);
    }
  };
  const [uploadsNonce, setUploadsNonce] = useState(0);
  const geladenerBeat = useRef<string | null>(null);

  useEffect(() => {
    // Zugeklapptes Panel nichts laden lassen: `beat` bleibt während der
    // Schließ-Animation stehen.
    if (!isOpen) return;
    let cancelled = false;
    // Nur beim Beat-Wechsel leeren. Nach einer eigenen Änderung nachzuladen
    // und dabei auf `null` zu gehen riss den ganzen Upload-Block ab und baute
    // ihn neu auf — mit „wird geladen …" dazwischen und einer Animation, die
    // bei jedem Klick von vorn lief. Die Zeilen bleiben jetzt stehen und
    // bekommen nur neue Werte.
    if (geladenerBeat.current !== beat.id) {
      setUploads(null);
      setFlpPath(null);
      geladenerBeat.current = beat.id;
    }
    (async () => {
      try {
        const data = await api.upload.getData(beat.id);
        if (!cancelled) { setUploads(data.uploads); setFlpPath(data.assets.flp_path); }
      } catch {
        // Beim Durchklicken darf ein einzelner Fehlschlag das Panel nicht
        // sprengen — dann bleibt die Zeile eben leer.
        if (!cancelled) setUploads([]);
      }
    })();
    return () => { cancelled = true; };
  }, [beat.id, isOpen, uploadsNonce]);

  const handleUploadsChanged = () => {
    onUploadsChanged?.();            // Punkte im Raster nachziehen
    setUploadsNonce(n => n + 1);     // und die eigene Anzeige neu holen
  };

  const handleOpenTagManager = () => {
    openTagManager({
      initialSelected: localTags,
      onConfirm: (newTags) => {
        setLocalTags(newTags);
        onUpdateTags?.(beat.id, newTags);
      },
      editMode: true,
    });
  };

  const handleRemoveTag = (tag: string) => {
    const newTags = localTags.filter(t => t !== tag);
    setLocalTags(newTags);
    onUpdateTags?.(beat.id, newTags);
  };

  // 1. Use cover from global player if this beat is the active one
  const { coverUrl: playerCoverUrl, currentBeat: playerBeat } = useAudioPlayerContext();
  const playerCover = playerBeat?.id === beat.id ? playerCoverUrl : null;

  // 2. Fallback: load cover locally for whichever beat is displayed
  const [localCoverUrl, setLocalCoverUrl] = useState<string | null>(preloadedCoverUrl ?? null);

  useEffect(() => {
    // Instantly use preloaded URL if available, otherwise fetch
    if (preloadedCoverUrl) {
      setLocalCoverUrl(preloadedCoverUrl);
      return;
    }
    setLocalCoverUrl(null);
    if (!beat.path) return;
    let cancelled = false;
    (async () => {
      try {
        const coverPath = await api.audio.getCoverPath(beat.path!);
        if (!cancelled && coverPath) {
          setLocalCoverUrl(convertFileSrc(coverPath.replace(/\\/g, "/")));
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [beat.id, preloadedCoverUrl]);

  const coverUrl = playerCover ?? localCoverUrl ?? null;
  const playerActive = !!playerBeat;

  const handleOpenFolder = async () => {
    if (beat.path) {
      try { await revealItemInDir(beat.path); } catch {}
    }
  };

  // „Verkauft an" nur, wenn es zur Sache gehört — oder schon etwas drinsteht,
  // sonst verschwände ein gefülltes Feld beim Zurückstellen des Status.
  const zeigeKaeufer = beat.status === "sold" || !!form.sold_to;

  return (
    // data-panel: die eigene Flaeche — Klicks hier drin sind nicht „daneben"
    // (siehe hooks/useKlickDaneben.ts).
    <aside data-panel style={{
      position: "fixed",
      right: 0,
      top: 0,
      height: playerActive ? `calc(100vh - ${PLAYER_HEIGHT}px)` : "100vh",
      width: BROWSE_PANEL_WIDTH,
      background: C.background,
      display: "flex",
      flexDirection: "column",
      zIndex: 50,
      borderLeft: `1px solid ${C.border15}`,
      transform: isOpen ? "translateX(0)" : "translateX(100%)",
      transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    }}>
      <style>{FELD_CSS}</style>

      {/* Favorit und Schließen liegen über allem, nicht im Scrollbereich: das
          Schließkreuz muss auch erreichbar sein, wenn man bei der Notiz steht.
          Favorit gehört zur Identität des Beats, nicht in den Aktionsfuß. */}
      <div style={{ position: "absolute", top: 12, right: 12, zIndex: 20, display: "flex", gap: 8 }}>
        <button
          onClick={() => onToggleFavorite(beat.id)}
          title={fav ? "Favorit entfernen" : "Als Favorit merken"}
          style={coverKnopf}
        >
          <Heart size={16} fill={fav ? C.primary : "none"} color={fav ? C.primary : "rgba(255,255,255,0.85)"} strokeWidth={1.75} />
        </button>
        <button onClick={onClose} title="Schließen" style={coverKnopf}>
          <X size={16} color="rgba(255,255,255,0.85)" />
        </button>
      </div>

      {/* ── Scrollable Body ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>

        {/* ── Cover trägt den Namen ───────────────────────────────────────────
            Das Bild ist der Kopf, nicht ein Abschnitt darin: keine Beschriftung
            „Cover", kein zweiter Kasten für den Namen. Höhe gedeckelt, damit
            auf einem kleinen Bildschirm nicht das halbe Panel Bild ist. */}
        <div style={{
          position: "relative",
          width: "100%",
          height: "min(400px, 40vh)",
          flexShrink: 0,
          background: `linear-gradient(135deg, ${C.surfaceContainer} 0%, ${C.surfaceContainerHighest} 60%, ${C.surfaceContainerLow} 100%)`,
        }}>
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Music size={56} color="rgba(255,255,255,0.08)" strokeWidth={1} />
          </div>
          {coverUrl && (
            <img
              src={coverUrl}
              alt={beat.name}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
              onError={e => { e.currentTarget.style.display = "none"; }}
            />
          )}

          {/* Verlauf: oben genug für die Knöpfe, unten genug für den Namen.
              Ohne ihn ist Weiß auf hellem Artwork unlesbar. */}
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 26%, rgba(0,0,0,0.10) 52%, rgba(0,0,0,0.90) 100%)",
            pointerEvents: "none",
          }} />

          {/* Name direkt auf dem Bild — anklicken und tippen. */}
          <div style={{ position: "absolute", left: 13, right: 13, bottom: 12 }}>
            <input
              className="beatos-feld beatos-feld-hell"
              value={form.name}
              onChange={e => setFeld("name", e.target.value)}
              onKeyDown={tastatur}
              title="Beat-Name — klicken zum Ändern"
              style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em" }}
            />
            <div style={{
              marginTop: 6, marginLeft: 1,
              fontSize: 12, fontFamily: "monospace",
              color: "rgba(255,255,255,0.6)",
            }}>
              #{beat.id}{beat.created_date ? ` · ${datumKurz(beat.created_date)}` : ""}
            </div>
          </div>
        </div>

        {/* ── Tempo und Tonart ────────────────────────────────────────────────
            Eine Zeile statt zweier beschrifteter Kästen. Die Einheit steht am
            Wert, das reicht als Beschriftung. */}
        <div style={{
          display: "flex", alignItems: "center", gap: 18,
          padding: "14px 20px",
          borderBottom: `1px solid ${C.border10}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={miniLabel}>BPM</span>
            <input
              className="beatos-feld"
              value={form.bpm}
              onChange={e => setFeld("bpm", e.target.value)}
              onKeyDown={tastatur}
              placeholder="—"
              inputMode="numeric"
              style={{ width: 58, fontSize: 14, fontWeight: 600 }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={miniLabel}>Tonart</span>
            <input
              className="beatos-feld"
              value={form.key}
              onChange={e => setFeld("key", e.target.value)}
              onKeyDown={tastatur}
              placeholder="—"
              style={{ width: 72, fontSize: 14, fontWeight: 600 }}
            />
          </div>
        </div>

        {/* ── Ordner hinkt hinterher ──────────────────────────────────────────
            Erscheint nur, wenn es wirklich etwas zu tun gibt — der Trockenlauf
            hat nachgesehen. Deshalb braucht es keinen Dauerknopf mehr. */}
        {ordnerZiel && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 20px",
            background: alpha(C.primary, 0.08),
            borderBottom: `1px solid ${C.border10}`,
          }}>
            <FolderTree size={14} color={C.primary} strokeWidth={1.75} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: C.onSurfaceVariant }}>Ordner heißt noch anders</div>
              <div
                title={ordnerZiel}
                style={{
                  fontSize: 11, fontFamily: "monospace", color: C.primary,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              >
                {ordnerZiel}
              </div>
            </div>
            <button
              onClick={angleichen}
              disabled={angleichBusy}
              title="Ordner- und Dateinamen dieses Beats auf das Schema ziehen"
              style={{
                flexShrink: 0, padding: "7px 12px", borderRadius: radius.control,
                background: alpha(C.primary, 0.15),
                border: `1px solid ${alpha(C.primary, 0.35)}`,
                cursor: angleichBusy ? "wait" : "pointer",
                fontSize: 12, fontWeight: 700, fontFamily: "inherit", color: C.primary,
              }}
            >
              {angleichBusy ? "läuft …" : "Angleichen"}
            </button>
          </div>
        )}
        {angleichFehler && <Fehler text={angleichFehler} />}

        {/* ── Metadaten ───────────────────────────────────────────────────────── */}
        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Status — ein Band aus vier Segmenten statt vier Kacheln. */}
          <Segmented
            full
            label="Status"
            // Ohne Status ist nichts gewählt — "" passt auf keine Option.
            value={(beat.status ?? "") as BeatStatus}
            onChange={key => onUpdateStatus(beat.id, key)}
            // STATUS_CONFIG ist Record<string, …>, damit FilterBar auch mit
            // "all" indizieren kann; die vier Schlüssel hier sind genau BeatStatus.
            options={STATUS_ITEMS.map(({ key, label }) => ({ value: key as BeatStatus, label, color: STATUS_CONFIG[key].color }))}
          />

          {zeigeKaeufer && (
            <div>
              <div style={labelStyle}>Verkauft an</div>
              <input
                className="beatos-feld"
                value={form.sold_to}
                onChange={e => setFeld("sold_to", e.target.value)}
                onKeyDown={tastatur}
                placeholder="Artist / Label"
                style={{ fontSize: 13 }}
              />
            </div>
          )}

          {/* Uploads — dieselbe Bedienung wie im Upload-Tab, derselbe
              Schreibweg. Steht direkt unter dem Beat-Status, weil beide
              zusammen gelesen werden: fertig, und wo liegt es draußen? */}
          <div>
            <div style={labelStyle}>Uploads</div>
            {uploads
              ? <UploadPlatformGrid
                  beatId={beat.id}
                  uploads={uploads}
                  onChanged={handleUploadsChanged}
                  flach
                />
              : <div style={{ fontSize: 12, color: C.onSecondaryFixedVar, padding: "6px 0" }}>
                  wird geladen …
                </div>}
          </div>

          {/* Tags — das „+" ist so groß wie eine Pille und steht am Ende der
              Reihe. Vorher stand dort „Tags verwalten" als Textpille, die man
              für einen Tag hielt oder ganz übersah. */}
          <div>
            <div style={labelStyle}>Tags</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {sortTagsByCategory(localTags, (tag) => getTagCategoryFromDb(tag) ?? "custom").map(tag => (
                <TagPill key={tag} tag={tag} size="sm" removable onRemove={() => handleRemoveTag(tag)} />
              ))}
              <button
                onClick={handleOpenTagManager}
                title="Tags verwalten"
                style={{
                  width: 26, height: 22, borderRadius: radius.full,
                  border: `1px dashed ${C.border30}`,
                  background: "transparent", cursor: "pointer",
                  color: C.onSurfaceVariant,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                <Plus size={13} strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* Notiz — immer da, auch leer. Vorher war der Block unsichtbar,
              solange nichts drinstand: eine Notiz anlegen ging nur im Modal. */}
          <div>
            <div style={labelStyle}>Notiz</div>
            <textarea
              className="beatos-feld"
              value={form.notes}
              onChange={e => setFeld("notes", e.target.value)}
              onKeyDown={tastatur}
              rows={3}
              placeholder="Plugins, Inspiration, verwendete Samples …"
              style={{ fontSize: 12, lineHeight: 1.6, resize: "vertical" }}
            />
          </div>
        </div>
      </div>

      {saveError && <Fehler text={saveError} />}

      {/* ── Speicherleiste — nur wenn es etwas zu speichern gibt ─────────────── */}
      {dirty && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 20px",
          borderTop: `1px solid ${C.border10}`,
          background: C.surfaceContainerLow,
        }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: C.primary }}>
            ● Ungespeichert
          </span>
          <button
            onClick={verwerfen}
            disabled={isSaving}
            style={{
              padding: "8px 12px", borderRadius: radius.control,
              background: "transparent", border: `1px solid ${C.border20}`,
              cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit",
              color: C.onSurfaceVariant,
            }}
          >
            Verwerfen
          </button>
          <button
            onClick={speichern}
            disabled={isSaving}
            style={{
              padding: "8px 14px", borderRadius: radius.control,
              background: C.primary, border: "none",
              cursor: isSaving ? "wait" : "pointer",
              fontSize: 12, fontWeight: 700, fontFamily: "inherit", color: C.onPrimary,
              opacity: isSaving ? 0.7 : 1,
            }}
          >
            {isSaving ? "Speichern …" : "Speichern"}
          </button>
        </div>
      )}

      {/* ── Zurück nach FL: dieselbe FLP öffnen oder als neues Projekt ──────── */}
      <div style={{
        display: "flex", gap: 8,
        padding: "12px 20px 0",
        borderTop: `1px solid ${C.border10}`,
        background: C.background,
      }}>
        <button
          onClick={() => flpPath && openPath(flpPath).catch(() => {})}
          disabled={!flpPath}
          title={flpPath ? `${flpPath.split(/[/\\]/).pop()} — in FL Studio öffnen` : "Keine FLP im Beat-Ordner"}
          style={flButtonStyle(Boolean(flpPath))}
        >
          <FileMusic size={14} strokeWidth={1.5} />
          In FL öffnen
        </button>
        <button
          onClick={handleNewVersion}
          disabled={!flpPath || versionBusy}
          title={flpPath ? "Neues Studio-Projekt mit dieser FLP als Vorlage — für Remixe und neue Fassungen" : "Keine FLP im Beat-Ordner"}
          style={flButtonStyle(Boolean(flpPath) && !versionBusy)}
        >
          <CopyPlus size={14} strokeWidth={1.5} />
          {versionBusy ? "Lege an …" : "Neue Version"}
        </button>
      </div>

      {/* ── Fuß: ein Weg nach vorn, ein Weg zur Platte, ein Papierkorb ──────── */}
      {/* Kein eigener Strich: die FL-Zeile darüber gehört zum selben Fuß. */}
      <div style={{
        display: "flex", gap: 8,
        padding: "8px 20px 12px",
        background: C.background,
      }}>
        <button
          onClick={() => onOpenInUpload?.(beat)}
          disabled={!onOpenInUpload}
          title="Im Upload-Tab öffnen — Beschreibungen, Type-Beat, Assets"
          style={{
            flex: 1, minWidth: 0, padding: "11px 12px",
            borderRadius: radius.card, background: C.primary, border: "none",
            cursor: onOpenInUpload ? "pointer" : "default",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            fontSize: 12, fontWeight: 700, fontFamily: "inherit", color: C.onPrimary,
            whiteSpace: "nowrap",
            opacity: onOpenInUpload ? 1 : 0.4,
          }}
        >
          <UploadIcon size={14} strokeWidth={1.75} />
          Im Upload öffnen
        </button>

        <button
          onClick={handleOpenFolder}
          title="Beat-Ordner im Explorer zeigen"
          style={{
            padding: "11px 14px",
            borderRadius: radius.card, background: C.surfaceContainerHigh,
            border: `1px solid ${C.border20}`, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 7,
            fontSize: 12, fontWeight: 700, fontFamily: "inherit", color: C.onSurface,
            whiteSpace: "nowrap",
          }}
        >
          <FolderOpen size={14} strokeWidth={1.5} />
          Ordner
        </button>

        {/* Selten und zerstörend: klein, aber auffindbar — nicht als
            gleichbreiter Balken neben „Ordner öffnen". */}
        {onDelete && (
          <button
            onClick={() => setConfirmDelete(true)}
            title="Beat löschen"
            style={{
              width: 42, flexShrink: 0,
              borderRadius: radius.card, background: "transparent",
              border: `1px solid ${DELETE_BORDER}`, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: DELETE_COLOR,
            }}
          >
            <Trash2 size={15} strokeWidth={1.75} />
          </button>
        )}
      </div>

      {/* ── Löschen bestätigen ──────────────────────────────────────────────── */}
      {confirmDelete && (
        <div
          onClick={() => !isDeleting && setConfirmDelete(false)}
          style={{
            position: "absolute", inset: 0, zIndex: 30,
            background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 340,
              background: C.surfaceContainer,
              borderRadius: radius.card,
              border: `1px solid ${C.border20}`,
              padding: 20,
              display: "flex", flexDirection: "column", gap: 14,
            }}
          >
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{
                width: 36, height: 36, flexShrink: 0,
                borderRadius: radius.control,
                background: `${DELETE_COLOR}22`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <AlertTriangle size={18} color={DELETE_COLOR} strokeWidth={2} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.onSurface, marginBottom: 4 }}>
                  Diesen Beat löschen?
                </div>
                <div style={{ fontSize: 12, color: C.onSurfaceVariant, lineHeight: 1.5 }}>
                  <strong style={{ color: C.onSurface }}>#{beat.id}</strong> — {beat.name}
                </div>
              </div>
            </div>

            <div style={{
              padding: 10, borderRadius: radius.control,
              background: C.surfaceContainerHigh,
              fontSize: 12, color: C.onSurfaceVariant, lineHeight: 1.5,
            }}>
              Der Ordner wandert in den <strong style={{ color: C.onSurface }}>Papierkorb</strong>, der Eintrag verschwindet aus der Bibliothek. Aus dem Papierkorb lässt sich beides zurückholen.
              {beat.path && (
                <div style={{
                  marginTop: 8, fontSize: 11, fontFamily: "monospace",
                  color: C.onSecondaryFixedVar, wordBreak: "break-all",
                }}>
                  {beat.path}
                </div>
              )}
            </div>

            {deleteError && (
              <div style={{
                padding: 10, borderRadius: radius.control,
                background: `${DELETE_COLOR}15`,
                border: `1px solid ${DELETE_BORDER}`,
                fontSize: 12, color: DELETE_COLOR, lineHeight: 1.5,
                whiteSpace: "pre-wrap",
              }}>
                {deleteError}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={isDeleting}
                style={{
                  flex: 1, padding: "10px 12px",
                  borderRadius: radius.control,
                  background: C.surfaceContainerHigh,
                  border: `1px solid ${C.border20}`,
                  cursor: isDeleting ? "not-allowed" : "pointer",
                  fontSize: 12, fontWeight: 700, fontFamily: "inherit", color: C.onSurface,
                  opacity: isDeleting ? 0.5 : 1,
                }}
              >
                Abbrechen
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                style={{
                  flex: 1, padding: "10px 12px",
                  borderRadius: radius.control,
                  background: DELETE_COLOR,
                  border: "none",
                  cursor: isDeleting ? "wait" : "pointer",
                  fontSize: 12, fontWeight: 700, fontFamily: "inherit", color: "#fff",
                  opacity: isDeleting ? 0.7 : 1,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                <Trash2 size={13} strokeWidth={2} />
                {isDeleting ? "Wird gelöscht …" : "In den Papierkorb"}
              </button>
            </div>
          </div>
        </div>
      )}

    </aside>
  );
}

// ─── Helfer ─────────────────────────────────────────────────────────────────

function Fehler({ text }: { text: string }) {
  return (
    <div style={{
      padding: "10px 20px",
      background: `${DELETE_COLOR}15`,
      borderTop: `1px solid ${DELETE_BORDER}`,
      fontSize: 12, color: DELETE_COLOR, lineHeight: 1.5,
      whiteSpace: "pre-wrap",
    }}>
      {text}
    </div>
  );
}

/** "2025-05-01" → "01.05.2025". Andere Formate bleiben, wie sie sind. */
function datumKurz(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

const DELETE_COLOR = C.error;
const DELETE_BORDER = alpha(C.error, 0.35);

const coverKnopf: React.CSSProperties = {
  width: 30, height: 30, borderRadius: radius.control,
  background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)",
  border: "none", cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: C.onSecondaryFixedVar,
  marginBottom: 6,
};

const miniLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: C.onSecondaryFixedVar,
  flexShrink: 0,
};

function flButtonStyle(aktiv: boolean): React.CSSProperties {
  return {
    flex: 1, minWidth: 0, padding: "11px 12px",
    borderRadius: radius.card, background: C.surfaceContainerHigh,
    border: `1px solid ${C.border20}`, cursor: aktiv ? "pointer" : "default",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
    fontSize: 12, fontWeight: 700, fontFamily: "inherit", color: C.onSurface,
    whiteSpace: "nowrap",
    opacity: aktiv ? 1 : 0.4,
  };
}
