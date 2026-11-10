// src/components/studio/ProjectInspector.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Right-side detail panel for one Studio project.
// Öffnet sich per Zeilenklick — das ist der Weg „erst Projekt, dann Datei".
// Die Gegenrichtung steht im Assets-Tab.
//
// Reihenfolge wie auf der Werkbank: großes Cover → „Weg zum Upload" (die fünf
// Dateien als Checkliste, fehlende direkt „Aus Assets") → Status → FLP-Versionen
// → Notizen.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";
import {
  X, Star, StickyNote, Disc3, FolderOpen, Archive, Check, Loader2, FileMusic, Plus, AlertTriangle,
  Copy, Trash2, Upload as UploadIcon, AudioLines, PenLine, Clock, Play, MoreHorizontal,
} from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useNavigate } from "react-router-dom";
import { C, STUDIO_STATUS_CONFIG, alpha, radius } from "../../lib/theme";
import { api } from "../../lib/api";
import { Button, IconButton, Dropdown, MenuePunkt, PAGE_HEADER_HEIGHT } from "../ui";
import { arbeitszeit } from "../../lib/werkbank";
import { formatRelativeTime } from "../../lib/time";
import { useAudioPlayerContext } from "../../contexts/AudioPlayerContext";
import { useSettings } from "../../contexts/SettingsContext";
import { useDialog } from "../../contexts/DialogContext";
import { useFolderAssets, type FolderAssets } from "../../hooks/useFolderAssets";
import { AssetPickerDialog, type AssetSlotKind } from "../AssetPickerDialog";
import { PLAYER_HEIGHT } from "../GlobalAudioPlayer";
import { ManualStatusToggles } from "./ProjectRow";
import { CoverPlatzhalter } from "./CoverPlatzhalter";
import { deriveStage, isManualStatus, projectDisplayName, projectExportName, projectFolderLabel } from "../../types/studio";
import type { StudioProject } from "../../types/studio";

// GENAU die Endungen, die das Backend liest (utils/files.rs). Weiter gefasst
// hieß: eine .tif oder .wmv wanderte in den Projektordner und war dort
// unsichtbar — der Scan zählt sie nicht als Cover/Video, Create findet sie
// nicht, und gemeldet wurde auch nichts.
const IMAGE_EXT = ["png", "jpg", "jpeg", "webp", "gif"];
const VIDEO_EXT = ["mp4", "mov", "webm", "mkv", "avi"];

const extOf = (path: string) => path.split(".").pop()?.toLowerCase() ?? "";

/** Nur Bilder und Videos — alles andere gehört nicht in einen Asset-Slot. */
const isAssetFilePath = (path: string) =>
  IMAGE_EXT.includes(extOf(path)) || VIDEO_EXT.includes(extOf(path));

/** Dieselbe Regel wie im Zuweisen-Dialog: Video, „thumb", sonst Cover. */
function slotForFile(path: string): "cover" | "thumbnail" | "video" {
  if (VIDEO_EXT.includes(extOf(path))) return "video";
  return (path.split(/[/\\]/).pop() ?? "").toLowerCase().includes("thumb") ? "thumbnail" : "cover";
}

/** Die Dateien, aus denen die automatische Stufe entsteht — in dieser Reihenfolge. */
const STAGE_FILES: Array<[keyof StudioProject, string]> = [
  ["has_mp3", "MP3"],
  ["has_wav", "WAV"],
  ["has_cover", "Cover"],
  ["has_thumbnail", "Thumbnail"],
  ["has_video", "Video"],
];

interface ProjectInspectorProps {
  project: StudioProject;
  /** Gibt zurück, ob geschrieben wurde — das Häkchen an den Notizen hängt daran. */
  onPatch: (patch: Partial<Pick<StudioProject, "status" | "priority" | "notes">>) => void | Promise<boolean>;
  onArchive: () => void;
  /** Neueste FLP in FL Studio öffnen */
  onOpenDaw: () => void;
  /** Projektordner in den Papierkorb (mit Rückfrage) */
  onTrash: () => void;
  /** Export im globalen Player abspielen */
  onPreview: () => void;
  /** Dialog „Beat benennen" öffnen (Name, Tonart, BPM) */
  onRename: () => void;
  /** Projektordner nach 06_SAMPLES (mit Rückfrage) */
  onToSamples: () => void;
  onClose: () => void;
  /** Nach einer Zuweisung: Projekte neu scannen (Asset-Ampel ändert sich) */
  onAssetsChanged: () => void;
  /** Gleitet gerade hinaus — sieht man noch, bedient man nicht mehr. */
  closing?: boolean;
}

/** Breite des Panels — die Studio-Seite hält rechts genau so viel frei. */
export const INSPECTOR_WIDTH = 500;

export function ProjectInspector({ project: p, onPatch, onArchive, onOpenDaw, onTrash, onToSamples, onPreview, onRename, onClose, onAssetsChanged, closing = false }: ProjectInspectorProps) {
  const { currentBeat } = useAudioPlayerContext();
  const { settings } = useSettings();
  const navigate = useNavigate();

  // Liegt das Projekt schon im Archiv? Dann führt der Hauptknopf in den
  // Upload-Tab statt ein zweites Mal ins Archiv. Derselbe Abgleich wie beim
  // Zusammenführen (match_projects_to_archive), ohne Datei-für-Datei-Vergleich.
  // Nur eindeutige Treffer — bei mehreren Beats mit dem Titel bleibt es beim
  // Archivieren-Knopf.
  const [archivBeatId, setArchivBeatId] = useState<string | null>(null);
  useEffect(() => {
    setArchivBeatId(null);
    if (!settings.archivePath) return;
    let abgebrochen = false;
    api.studio.matchArchive([p.path], settings.archivePath, false)
      .then(([t]) => {
        if (abgebrochen || !t || !t.archive_folder || t.catalog_id == null || t.matched_by === "ambiguous") return;
        setArchivBeatId(String(t.catalog_id).padStart(4, "0"));
      })
      .catch(() => {});
    return () => { abgebrochen = true; };
  }, [p.path, settings.archivePath]);
  const playerVisible = !!currentBeat;
  const folderAssets = useFolderAssets(p.path);
  const [picker, setPicker] = useState<AssetSlotKind | null>(null);

  // ── Notes: local draft, 600ms debounced save ───────────────────────────────
  const [notes, setNotes] = useState(p.notes ?? "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const lastSavedRef = useRef(p.notes ?? "");
  // Noch nicht geschriebener Text, solange der Debounce läuft. Die Closure hält
  // das onPatch aus dem Render, in dem getippt wurde — sie zeigt also auf das
  // Projekt, zu dem der Text gehört, auch wenn längst ein anderes offen ist.
  const flushRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setNotes(p.notes ?? "");
    lastSavedRef.current = p.notes ?? "";
    setSaveState("idle");
    // Schließen (Escape, X) oder Wechsel auf ein anderes Projekt darf den
    // letzten Tastendruck nicht verschlucken.
    return () => { flushRef.current?.(); };
  }, [p.path]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (notes === lastSavedRef.current) {
      flushRef.current = null;
      return;
    }
    const save = () => {
      const result = onPatch({ notes: notes.trim() || null });
      lastSavedRef.current = notes;
      flushRef.current = null;
      return result;
    };
    flushRef.current = save;
    const handle = setTimeout(async () => {
      setSaveState("saving");
      // „Gespeichert" erst, wenn es das auch ist — vorher stand das Häkchen
      // selbst dann da, wenn der Schreibversuch danach scheiterte.
      const ok = await save();
      if (ok === false) { setSaveState("idle"); return; }
      setSaveState("saved");
      setTimeout(() => setSaveState(s => (s === "saved" ? "idle" : s)), 1500);
    }, 600);
    return () => clearTimeout(handle);
  }, [notes]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Gibt es den Titel im Archiv schon? ─────────────────────────────────────
  // Kein Blocker, nur ein Hinweis: Dopplungen fallen sonst erst beim
  // Archivieren auf, wenn der Beat längst fertig ist. Die 0 als Katalognummer
  // schaltet die ID-Prüfung des Commands aus — hier geht es nur um den Namen.
  const title = projectDisplayName(p);
  const [duplicate, setDuplicate] = useState<string | null>(null);
  useEffect(() => {
    setDuplicate(null);
    if (!title.trim()) return;
    let abgelöst = false;
    api.archive.checkDuplicate(0, title, p.key, p.bpm)
      .then(r => {
        if (abgelöst || !r.has_duplicate || r.duplicate_type === "id") return;
        setDuplicate(`B${r.existing_id} „${r.existing_name}“`);
      })
      .catch(() => {});
    return () => { abgelöst = true; };
  }, [title, p.key, p.bpm]);

  // ── Drag & Drop: Datei ins offene Projekt ziehen ───────────────────────────
  // Der kurze Weg für den Moment nach dem Photoshop-Export: Fenster daneben,
  // Datei rüberziehen, fertig. Der Slot kommt aus dem Dateinamen — dieselbe
  // Regel wie im Zuweisen-Dialog. Liegt die Datei außerhalb der Inbox, kopiert
  // das Backend statt zu verschieben.
  const [dropActive, setDropActive] = useState(false);
  const [dropping, setDropping] = useState(false);
  const { melde } = useDialog();
  useEffect(() => {
    let stop: (() => void) | undefined;
    let entfernt = false;
    // Ohne Tauri-Fenster (Test, `vite dev` im Browser) gibt es kein Drag & Drop
    // — das darf das Panel nicht mitreißen.
    if (!("__TAURI_INTERNALS__" in window)) return;
    try {
      getCurrentWebview().onDragDropEvent(async event => {
        if (event.payload.type === "over") { setDropActive(true); return; }
        if (event.payload.type === "leave") { setDropActive(false); return; }

        setDropActive(false);
        const dateien = event.payload.paths.filter(isAssetFilePath);
        if (dateien.length === 0) {
          // Stumm liegenlassen hieße: „das Fenster hat's geschluckt". Sagen,
          // was durchgeht — es ist dieselbe Liste, die der Ordner später liest.
          if (event.payload.paths.length > 0) {
            melde(
              `Nicht übernommen. Erlaubt:\n` +
              `${IMAGE_EXT.join(", ")} · ${VIDEO_EXT.join(", ")}`
            );
          }
          return;
        }

        setDropping(true);
        const fehler: string[] = [];
        for (const datei of dateien) {
          try {
            await api.studio.assignAsset(datei, settings.assetPath, p.path, slotForFile(datei));
          } catch (e) {
            fehler.push(`${datei.split(/[/\\]/).pop()}: ${String(e)}`);
          }
        }
        setDropping(false);
        folderAssets.refresh();
        onAssetsChanged();
        if (fehler.length > 0) melde(`Nicht übernommen:\n\n${fehler.join("\n")}`);
      }).then(unlisten => {
        if (entfernt) unlisten(); else stop = unlisten;
      }).catch(e => console.error("[ProjectInspector] Drag & Drop nicht verfügbar:", e));
    } catch (e) {
      console.error("[ProjectInspector] Drag & Drop nicht verfügbar:", e);
    }

    return () => { entfernt = true; stop?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.path, settings.assetPath]);

  // ── Close on Escape ────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    // data-panel: Klicks hier drin sind nicht „daneben" (useKlickDaneben).
    <aside data-panel style={{
      position: "fixed",
      top: PAGE_HEADER_HEIGHT, right: 0,
      bottom: playerVisible ? PLAYER_HEIGHT : 0,
      // 500: Status-Pille und Handschalter passen auf eine Zeile, und neben
      // dem Cover bleibt Thumbnail und Video genug Breite, um sie zu erkennen.
      width: INSPECTOR_WIDTH,
      background: C.surfaceContainerLow,
      borderLeft: `1px solid ${C.border15}`,
      boxShadow: "-12px 0 40px rgba(0,0,0,0.35)",
      zIndex: 40,
      display: "flex", flexDirection: "column",
      outline: dropActive ? `2px dashed ${C.primary}` : "none",
      outlineOffset: -2,
      // Herein per Keyframe beim Einhängen, hinaus per Transition — vorher war
      // es einfach da bzw. weg, und die Liste daneben sprang mit.
      animation: "panelIn 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)",
      transform: closing ? "translateX(100%)" : "translateX(0)",
      transition: "transform 0.2s cubic-bezier(0.4, 0, 1, 1)",
      pointerEvents: closing ? "none" : undefined,
    }}>
      {/* Nur solange etwas über dem Fenster hängt — sagt, wo es landet. */}
      {(dropActive || dropping) && (
        <div style={{
          // Über dem ganzen Fenster, nicht nur über dem Panel: solange der
          // Inspector offen ist, ist er das Ziel — egal wo man loslässt.
          position: "fixed", inset: 0, zIndex: 2,
          background: alpha(C.background, 0.88),
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 8,
          padding: 24, textAlign: "center",
        }}>
          {dropping
            ? <Loader2 size={22} color={C.primary} style={{ animation: "spin 0.8s linear infinite" }} />
            : <Plus size={22} color={C.primary} strokeWidth={2} />}
          <div style={{ fontSize: 13, fontWeight: 700, color: C.onSurface }}>
            {dropping ? "Wird übernommen …" : `Ablegen für „${title}“`}
          </div>
          <div style={{ fontSize: 12, color: C.onSurfaceVariant, lineHeight: 1.5 }}>
            Bilder und Videos landen im Projektordner. „thumb" im Namen wird
            Thumbnail, ein Video das Video, alles andere das Cover.
          </div>
        </div>
      )}
      {/* Kopf: kleines Cover neben Titel und Angaben. Vorher stand das Cover
          quadratisch über die ganze Breite und schob Notizen und Versionen
          aus dem ersten Blick. */}
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 14,
        padding: "16px 18px 14px",
        borderBottom: `1px solid ${C.border10}`,
      }}>
        <KleinesCover
          preview={folderAssets.assets.coverPreview}
          title={title}
          disabled={!settings.assetPath.trim()}
          onPick={() => setPicker("cover")}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
            <div
              title={p.song_name?.trim() ? "Titel aus dem Export" : undefined}
              style={{ fontSize: 18, fontWeight: 700, color: C.onSurface, lineHeight: 1.25, wordBreak: "break-word", minWidth: 0 }}
            >
              {title}
            </div>
            <IconButton icon={PenLine} size={26} title="Beat benennen" aria-label="Beat benennen" onClick={onRename} />
          </div>

          {duplicate && (
            <div
              title="Nur Hinweis"
              style={{
                display: "flex", alignItems: "center", gap: 6, marginTop: 6,
                fontSize: 12, color: C.primary,
              }}
            >
              <AlertTriangle size={12} strokeWidth={2} style={{ flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                Im Archiv gibt es {duplicate} schon
              </span>
            </div>
          )}

          {/* Tonart/BPM und Ordner · Alter immer auf zwei Zeilen — in einer
              Zeile hing es vom Platz ab und brach mal so, mal so. */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {p.key && <MetaChip>{p.key}</MetaChip>}
            {p.bpm != null && <MetaChip>{p.bpm} BPM</MetaChip>}
            {/* Ohne Tonart oder BPM gäbe es sonst nichts anzuklicken */}
            {(!p.key || p.bpm == null) && (
              <Button variant="ghost" size="sm" onClick={onRename} style={{ color: C.primary, padding: "3px 8px" }}>
                {!p.key && p.bpm == null ? "Tonart & BPM setzen" : !p.key ? "Tonart setzen" : "BPM setzen"}
              </Button>
            )}
            {p.work_minutes != null && (
              <span title="Arbeitszeit in FL" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: C.onSurfaceVariant }}>
                <Clock size={12} strokeWidth={1.75} />{arbeitszeit(p.work_minutes)}
              </span>
            )}
          </div>
          <div
            title={`${p.path}${p.modified_date ? `
Zuletzt bearbeitet: ${p.modified_date}` : ""}`}
            style={{ marginTop: 6, fontSize: 12, color: C.onSurfaceVariant, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {[projectFolderLabel(p), formatRelativeTime(p.modified_secs)].filter(Boolean).join(" · ")}
          </div>
        </div>
        <button
          onClick={() => onPatch({ priority: p.priority ? 0 : 1 })}
          title={p.priority ? "Priorität entfernen" : "Als Priorität markieren"}
          style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 2 }}
        >
          <Star size={16} color={p.priority ? C.primary : C.onSecondaryFixedVar} fill={p.priority ? C.primary : "none"} strokeWidth={1.75} />
        </button>
        <IconButton icon={X} size={28} title="Schließen" onClick={onClose} />
      </div>

      {/* Eine Knopfreihe: die Hauptwege beschriftet, der Rest hinter „⋯"
          (Designregel Sammelknöpfe). */}
      <InspectorActions
        archivBeatId={archivBeatId}
        onUpload={() => archivBeatId && navigate("/upload", { state: { beatId: archivBeatId } })}
        canPreview={p.has_mp3 || p.has_wav}
        onPreview={onPreview}
        canOpenDaw={Boolean(p.newest_flp)}
        exportName={projectExportName(p)}
        onOpenDaw={onOpenDaw}
        onArchive={onArchive}
        onRename={onRename}
        onOpenFolder={() => openPath(p.path).catch(() => {})}
        onTrash={onTrash}
        onToSamples={onToSamples}
      />

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Notizen zuerst: das ist, was man hier am häufigsten anfasst. */}
        <section>
          <SectionLabel
              right={
                saveState === "saving" ? <Loader2 size={10} style={{ animation: "spin 0.8s linear infinite" }} />
                : saveState === "saved" ? <span style={{ display: "flex", alignItems: "center", gap: 4, color: C.mint }}><Check size={10} strokeWidth={3} /> Gespeichert</span>
                : null
              }
            >
              <StickyNote size={10} strokeWidth={2} style={{ marginRight: 4 }} />
              Notizen
            </SectionLabel>
          <NotesField
            value={notes}
            onChange={e => setNotes(e.target.value)}
            // Escape verlässt erst das Feld; der Esc-Handler des Inspectors
            // hätte sonst mitten im Tippen das ganze Panel zugemacht.
            onKeyDown={e => {
              if (e.key === "Escape") { e.stopPropagation(); e.currentTarget.blur(); }
            }}
          />
        </section>

        {/* Status und darunter die fünf Dateien als Plaketten. Was fehlt,
            holt ein Klick auf die Plakette (Assets oder zurück in FL). */}
        <StatusSection project={p} onPatch={onPatch}>
          <DateiPlaketten
            project={p}
            assets={folderAssets.assets}
            noAssetPath={!settings.assetPath.trim()}
            onPick={setPicker}
            onOpenDaw={onOpenDaw}
          />
        </StatusSection>

        {/* FLP-Versionen — eine Zeile pro Version statt einer Karte. Meistens
            sind es zwei, und man will nur eine davon öffnen. */}
        <section>
          <SectionLabel>FLP-Versionen ({p.flps.length})</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {p.flps.map((flp, i) => (
              <button
                key={flp.path}
                onClick={() => openPath(flp.path).catch(e => melde(`FLP konnte nicht geöffnet werden: ${String(e)}`))}
                title={`${flp.name} öffnen`}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 8px",
                  background: "transparent", border: "none",
                  borderTop: i === 0 ? "none" : `1px solid ${C.border10}`,
                  cursor: "pointer", textAlign: "left", width: "100%",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >
                <FileMusic size={12} color={i === 0 ? C.primary : C.onSecondaryFixedVar} strokeWidth={1.75} style={{ flexShrink: 0 }} />
                <span style={{
                  flex: 1, minWidth: 0,
                  fontSize: 12, fontFamily: "monospace", color: C.onSurface,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {flp.name}
                </span>
                {i === 0 && (
                  <span style={{
                    flexShrink: 0,
                    padding: "1px 6px", borderRadius: radius.full,
                    background: `${C.primary}18`, color: C.primary,
                    fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
                  }}>
                    NEUESTE
                  </span>
                )}
                <span
                  title={flp.modified_date ?? undefined}
                  style={{ flexShrink: 0, fontSize: 11, color: C.onSecondaryFixedVar }}
                >
                  {formatRelativeTime(flp.modified_secs)}
                </span>
                <Disc3 size={12} strokeWidth={1.75} color={C.onSecondaryFixedVar} style={{ flexShrink: 0 }} />
              </button>
            ))}
          </div>
        </section>
      </div>

      {picker && (
        <AssetPickerDialog
          targetDir={p.path}
          assetRoot={settings.assetPath}
          slot={picker}
          title={`${SLOT_TITLE[picker]} zuweisen`}
          onAssigned={() => { folderAssets.refresh(); onAssetsChanged(); }}
          onClose={() => setPicker(null)}
        />
      )}
    </aside>
  );
}

const SLOT_TITLE: Record<AssetSlotKind, string> = { cover: "Cover", thumbnail: "Thumbnail", video: "Video" };

const fileNameOf = (path: string | null) => path?.split(/[/\\]/).filter(Boolean).pop() ?? null;

/** Das Cover klein neben dem Titel, ohne Cover der Platzhalter.
 *  Klick: Cover aus den Assets holen. */
function KleinesCover({ preview, title, disabled, onPick }: {
  preview: string | null;
  title: string;
  disabled: boolean;
  onPick: () => void;
}) {
  return (
    <button
      onClick={onPick}
      disabled={disabled}
      title={disabled ? "Kein Asset-Pfad (Einstellungen → Pfade)"
        : preview ? "Cover ersetzen" : "Cover zuweisen"}
      style={{
        width: 96, height: 96, flexShrink: 0,
        padding: 0, overflow: "hidden", borderRadius: radius.card,
        background: "transparent", border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "block",
      }}
    >
      {preview ? (
        <img src={preview} alt={`Cover ${title}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <CoverPlatzhalter />
      )}
    </button>
  );
}

/** Die fünf Dateien bis „Bereit" als eine Zeile Plaketten. Vorhandene in Mint
 *  (Klick bei Bild/Video: ersetzen), fehlende umrandet: Klick holt Bild oder
 *  Video aus den Assets, bei MP3/WAV geht es zurück in FL. */
function DateiPlaketten({ project: p, assets, noAssetPath, onPick, onOpenDaw }: {
  project: StudioProject;
  assets: FolderAssets;
  noAssetPath: boolean;
  onPick: (slot: AssetSlotKind) => void;
  onOpenDaw: () => void;
}) {
  // Bilder und Video aus dem frisch gelesenen Ordner, nicht aus dem Scan —
  // nach einer Zuweisung hakt die Plakette sofort ab.
  const plaketten: Array<{ label: string; da: boolean; datei: string | null; slot?: AssetSlotKind }> = [
    { label: "MP3", da: p.has_mp3, datei: null },
    { label: "WAV", da: p.has_wav, datei: null },
    { label: "Cover", da: !!assets.coverPath, datei: fileNameOf(assets.coverPath), slot: "cover" },
    { label: "Thumbnail", da: !!assets.thumbnailPath, datei: fileNameOf(assets.thumbnailPath), slot: "thumbnail" },
    { label: "Video", da: !!assets.videoPath, datei: fileNameOf(assets.videoPath), slot: "video" },
  ];
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
      {plaketten.map(r => {
        const aktion = r.slot
          ? (noAssetPath ? undefined : () => onPick(r.slot!))
          : (!r.da && p.newest_flp ? onOpenDaw : undefined);
        const titel = r.slot
          ? (noAssetPath ? "Kein Asset-Pfad (Einstellungen → Pfade)" : r.da ? `${r.datei} · ersetzen` : "Aus Assets")
          : (r.da ? `${r.label} da` : "In FL exportieren");
        return (
          <button
            key={r.label}
            type="button"
            onClick={aktion}
            disabled={!aktion}
            title={titel}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "4px 10px", borderRadius: radius.full,
              fontSize: 12, fontWeight: 700, fontFamily: "inherit",
              background: r.da ? alpha(C.mint, 0.14) : "transparent",
              color: r.da ? C.mint : C.onSurfaceVariant,
              border: r.da ? "1px solid transparent" : `1px dashed ${C.outlineVariant}`,
              cursor: aktion ? "pointer" : "default",
            }}
          >
            {r.da ? <Check size={11} strokeWidth={3} /> : <Plus size={11} strokeWidth={2.5} />}
            {r.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Status im Inspector: die gültige Pille, die zwei Markierungen, die du
 * selbst setzt, und darunter (children) die Dateien, aus denen er entsteht.
 * Warum er so ist, steht im Tooltip der Pille.
 */
function StatusSection({ project: p, onPatch, children }: {
  project: StudioProject;
  onPatch: (patch: Partial<Pick<StudioProject, "status" | "priority" | "notes">>) => void;
  children?: React.ReactNode;
}) {
  const stage = deriveStage(p);
  const manual = isManualStatus(p.status);
  const status = STUDIO_STATUS_CONFIG[p.status] ?? STUDIO_STATUS_CONFIG.idea;
  const missing = STAGE_FILES.filter(([k]) => !p[k]).map(([, label]) => label);

  const reason = manual
    ? `Von dir gesetzt. Ohne die Markierung: ${STUDIO_STATUS_CONFIG[stage].label}.`
    : missing.length === 0
      ? "Alles da: MP3, WAV, Cover, Thumbnail und Video liegen im Ordner."
      : `Bis „Bereit“ fehlt noch: ${missing.join(", ")}.`;

  return (
    <section>
      <SectionLabel>Status</SectionLabel>
      {/* Zustand und die zwei Handschalter auf einer Zeile — sie gehören
          zusammen, und das Panel hat die Breite dafür. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span title={reason} style={{
          display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0,
          padding: "5px 11px", borderRadius: radius.full, cursor: "help",
          background: status.bg, color: status.color,
          fontSize: 11, fontWeight: 700,
          letterSpacing: "0.08em", textTransform: "uppercase",
        }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: status.color }} />
          {status.label}
        </span>
        <div style={{ flex: 1 }} />
        <ManualStatusToggles project={p} onPatch={onPatch} variant="panel" />
      </div>
      {children}
    </section>
  );
}

function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center",
      fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
      textTransform: "uppercase", color: C.onSecondaryFixedVar,
      marginBottom: 8,
    }}>
      {children}
      <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>{right}</span>
    </div>
  );
}

/** Tonart und BPM — die zwei Angaben, nach denen man ein Projekt wiedererkennt. */
function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      flexShrink: 0, padding: "3px 10px", borderRadius: radius.full,
      background: C.surfaceContainerHigh, border: `1px solid ${C.border15}`,
      fontSize: 12, fontWeight: 700, color: C.onSurface,
    }}>
      {children}
    </span>
  );
}

/** Eine Reihe: Anhören, In FL, Archivieren (oder Upload-Tab) beschriftet,
 *  alles Seltene hinter „⋯" (Designregel Sammelknöpfe). */
function InspectorActions({ archivBeatId, onUpload, canPreview, onPreview, canOpenDaw, exportName, onOpenDaw, onArchive, onRename, onOpenFolder, onTrash, onToSamples }: {
  /** Schon archiviert als dieser Beat — dann „Im Upload-Tab" statt „Archivieren". */
  archivBeatId: string | null;
  onUpload: () => void;
  canPreview: boolean;
  onPreview: () => void;
  canOpenDaw: boolean;
  exportName: string;
  onOpenDaw: () => void;
  onArchive: () => void;
  onRename: () => void;
  onOpenFolder: () => void;
  onTrash: () => void;
  onToSamples: () => void;
}) {
  const { melde } = useDialog();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportName);
      melde(`Kopiert: ${exportName}`, "erfolg");
    } catch (e) {
      melde(`Kopieren fehlgeschlagen: ${String(e)}`);
    }
  };
  return (
    <div style={{
      flexShrink: 0, display: "flex", gap: 8, alignItems: "center",
      padding: "12px 18px",
      borderBottom: `1px solid ${C.border10}`,
    }}>
      <Button variant="secondary" size="sm" icon={Play} onClick={onPreview} disabled={!canPreview}
        title={canPreview ? "Export anhören" : "Kein Audio-Export im Ordner"}>
        Anhören
      </Button>
      <Button variant="secondary" size="sm" icon={Disc3} onClick={onOpenDaw} disabled={!canOpenDaw} style={{ flex: 1 }}>
        In FL öffnen
      </Button>
      {archivBeatId ? (
        <Button variant="primary" size="sm" icon={UploadIcon} onClick={onUpload} style={{ flex: 1 }}
          title={`Archiviert als B${archivBeatId}`}>
          Im Upload-Tab
        </Button>
      ) : (
        <Button variant="primary" size="sm" icon={Archive} onClick={onArchive} style={{ flex: 1 }}>
          Archivieren
        </Button>
      )}
      <Dropdown label={<MoreHorizontal size={14} />} title="Mehr" align="right" panelWidth={250}
        triggerStyle={{ padding: "6px 8px" }}>
        {close => (<>
          <MenuePunkt icon={PenLine} label="Beat benennen" hint="Name, Tonart und BPM"
            onClick={() => { close(); onRename(); }} />
          <MenuePunkt icon={Copy} label="Exportname kopieren" hint={exportName}
            onClick={() => { close(); copy(); }} />
          <MenuePunkt icon={FolderOpen} label="Im Explorer zeigen"
            onClick={() => { close(); onOpenFolder(); }} />
          <MenuePunkt icon={AudioLines} label="Zu Samples" hint="Nach 06_SAMPLES verschieben"
            onClick={() => { close(); onToSamples(); }} />
          <MenuePunkt icon={Trash2} label="In den Papierkorb"
            onClick={() => { close(); onTrash(); }} />
        </>)}
      </Dropdown>
    </div>
  );
}

/** Wie hoch das Notizfeld ist — einmal gezogen, gilt es für jedes Projekt. */
const LS_NOTES_HEIGHT = "beatos_studio_notes_height";

function NotesField({ value, onChange, onKeyDown }: {
  value: string;
  onChange: React.ChangeEventHandler<HTMLTextAreaElement>;
  onKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement>;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [height] = useState(() => {
    try { return Number(localStorage.getItem(LS_NOTES_HEIGHT)) || 120; } catch { return 120; }
  });
  // Der Griff unten rechts ändert die Höhe ohne eigenes Ereignis — der
  // ResizeObserver sieht es und merkt sich den neuen Wert.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (el.offsetHeight > 0) {
        try { localStorage.setItem(LS_NOTES_HEIGHT, String(el.offsetHeight)); } catch { /* egal */ }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      placeholder={'z.B. "Hook neu einspielen", "für Artist X gedacht" …'}
      style={{
        width: "100%",
        height,
        padding: "10px 12px",
        fontSize: 13, lineHeight: 1.55,
        background: C.surfaceContainerLowest,
        border: `1px solid ${C.border15}`,
        borderRadius: radius.control,
        outline: "none",
        color: C.onSurface,
        resize: "vertical",
        minHeight: 66,
        boxSizing: "border-box",
      }}
    />
  );
}
