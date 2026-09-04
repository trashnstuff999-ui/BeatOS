// src/components/studio/ProjectInspector.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Right-side detail panel for one Studio project.
// Öffnet sich per Zeilenklick — das ist der Weg „erst Projekt, dann Datei".
// Die Gegenrichtung steht im Assets-Tab.
//
// Reihenfolge nach Häufigkeit, nicht nach Datenmodell: Status (samt dem Satz,
// WARUM er so ist) → Zuweisen → FLP-Versionen → Notizen. Das Zuweisen stand
// vorher ganz unten und damit unter dem Falz — genau die Arbeit, für die man
// das Panel aufmacht.
//
// Kein zweites Bild derselben Sache: die Asset-Ampel ist raus, die drei Slots
// sagen dasselbe und man kann sie anklicken.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";
import {
  X, Star, StickyNote, Disc3, FolderOpen, Archive, Check, Loader2, FileMusic, Folder, Pencil, HardDrive, Plus, AlertTriangle,
} from "lucide-react";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { C, STUDIO_STATUS_CONFIG } from "../../lib/theme";
import { api } from "../../lib/api";
import { Button, PAGE_HEADER_HEIGHT } from "../ui";
import { formatRelativeTime } from "../../lib/time";
import { useAudioPlayerContext } from "../../contexts/AudioPlayerContext";
import { useSettings } from "../../contexts/SettingsContext";
import { useFolderAssets } from "../../hooks/useFolderAssets";
import { BeatAssetsCard } from "../BeatAssetsCard";
import { PLAYER_HEIGHT } from "../GlobalAudioPlayer";
import { ManualStatusToggles } from "./ProjectRow";
import { deriveStage, isManualStatus, projectDisplayName } from "../../types/studio";
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
  /** Benennt Ordner (und gleichnamige FLPs) um */
  onRename: (newName: string) => void;
  onArchive: () => void;
  onClose: () => void;
  /** Nach einer Zuweisung: Projekte neu scannen (Asset-Ampel ändert sich) */
  onAssetsChanged: () => void;
}

export function ProjectInspector({ project: p, onPatch, onRename, onArchive, onClose, onAssetsChanged }: ProjectInspectorProps) {
  const { currentBeat } = useAudioPlayerContext();
  const { settings } = useSettings();
  const playerVisible = !!currentBeat;
  const folderAssets = useFolderAssets(p.path);

  // ── Notes: local draft, 600ms debounced save ───────────────────────────────
  const [notes, setNotes] = useState(p.notes ?? "");
  /** Leeres Feld aufgeklappt, weil auf „Notiz hinzufügen" geklickt wurde. */
  const [notesOpen, setNotesOpen] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const lastSavedRef = useRef(p.notes ?? "");
  // Noch nicht geschriebener Text, solange der Debounce läuft. Die Closure hält
  // das onPatch aus dem Render, in dem getippt wurde — sie zeigt also auf das
  // Projekt, zu dem der Text gehört, auch wenn längst ein anderes offen ist.
  const flushRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setNotes(p.notes ?? "");
    setNotesOpen(false);
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

  // ── Umbenennen: Ordnername als Entwurf, Enter/Blur schreibt ────────────────
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(p.name);

  useEffect(() => {
    setIsEditingName(false);
    setNameDraft(p.name);
  }, [p.path]); // eslint-disable-line react-hooks/exhaustive-deps

  // Enter löst blur aus — so gibt es nur einen Weg, der wirklich speichert.
  const commitName = () => {
    setIsEditingName(false);
    const next = nameDraft.trim();
    if (next && next !== p.name) onRename(next);
    else setNameDraft(p.name);
  };

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
        setDuplicate(`#${r.existing_id} „${r.existing_name}“`);
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
            alert(
              `Nichts übernommen — in einen Slot passen nur:\n` +
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
        if (fehler.length > 0) alert(`Nicht übernommen:\n\n${fehler.join("\n")}`);
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
    <aside style={{
      position: "fixed",
      top: PAGE_HEADER_HEIGHT, right: 0,
      bottom: playerVisible ? PLAYER_HEIGHT : 0,
      // 440: breit genug, dass Status-Pille und die zwei Handschalter auf eine
      // Zeile passen und der Cover-Slot kein Hochformat wird.
      width: 440,
      background: C.surfaceContainerLow,
      borderLeft: `1px solid ${C.border15}`,
      boxShadow: "-12px 0 40px rgba(0,0,0,0.35)",
      zIndex: 40,
      display: "flex", flexDirection: "column",
      outline: dropActive ? `2px dashed ${C.primary}` : "none",
      outlineOffset: -2,
    }}>
      {/* Nur solange etwas über dem Fenster hängt — sagt, wo es landet. */}
      {(dropActive || dropping) && (
        <div style={{
          // Über dem ganzen Fenster, nicht nur über dem Panel: solange der
          // Inspector offen ist, ist er das Ziel — egal wo man loslässt.
          position: "fixed", inset: 0, zIndex: 2,
          background: "rgba(14,14,14,0.88)",
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
          <div style={{ fontSize: 11, color: C.onSurfaceVariant, lineHeight: 1.5 }}>
            Bilder und Videos landen im Projektordner. „thumb" im Namen wird
            Thumbnail, ein Video das Video, alles andere das Cover.
          </div>
        </div>
      )}
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        padding: "16px 18px 12px",
        borderBottom: `1px solid ${C.border10}`,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* B5: Der Titel kommt aus dem Export-Dateinamen, der Stift bearbeitet
              den ORDNER. Vorher standen beide in einer Zeile — man benannte um
              und oben änderte sich nichts. Jetzt sitzt der Stift an der
              Ordnerzeile, und die steht immer da, auch wenn sie gleich heißt. */}
          {/* Der Hinweis zum Export-Titel war eine Dauer-Fußnote unter jedem
              Projekt. Er erklärt etwas, das man einmal lernt — also Tooltip. */}
          <div
            title={p.song_name?.trim()
              ? "Titel kommt aus dem Export — zum Ändern die MP3/WAV umbenennen"
              : undefined}
            style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, lineHeight: 1.3, wordBreak: "break-word" }}
          >
            {title}
          </div>

          {duplicate && (
            <div
              title="Nur ein Hinweis — archivieren lässt sich das Projekt trotzdem"
              style={{
                display: "flex", alignItems: "center", gap: 5, marginTop: 5,
                fontSize: 10, color: C.primary,
              }}
            >
              <AlertTriangle size={10} strokeWidth={2} style={{ flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                Im Archiv gibt es {duplicate} schon
              </span>
            </div>
          )}

          {isEditingName ? (
            <div style={{ marginTop: 6 }}>
              <div style={{
                fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
                textTransform: "uppercase", color: C.onSecondaryFixedVar, marginBottom: 4,
              }}>
                Ordnername
              </div>
              <input
                autoFocus
                value={nameDraft}
                onChange={e => setNameDraft(e.target.value)}
                onBlur={commitName}
                onKeyDown={e => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") {
                    // Sonst schließt der Esc-Handler des Inspectors gleich mit
                    e.stopPropagation();
                    setNameDraft(p.name);
                    setIsEditingName(false);
                  }
                }}
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "5px 8px",
                  fontSize: 12, fontFamily: "monospace",
                  color: C.onSurface,
                  background: C.surfaceContainerLowest,
                  border: `1px solid ${C.primary}`,
                  borderRadius: 6, outline: "none",
                }}
              />
            </div>
          ) : (
            <button
              onClick={() => { setNameDraft(p.name); setIsEditingName(true); }}
              title="Ordner umbenennen — gleichnamige FLPs ziehen mit. Der Songtitel kommt aus dem Export und bleibt."
              style={{
                display: "flex", alignItems: "center", gap: 5,
                marginTop: 5, padding: "3px 7px 3px 5px",
                background: "transparent",
                border: `1px solid ${C.border15}`,
                borderRadius: 6, cursor: "pointer",
                fontSize: 10, color: C.onSecondaryFixedVar,
                maxWidth: "100%", textAlign: "left",
              }}
            >
              <Folder size={9} strokeWidth={1.75} style={{ flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.name}
              </span>
              <Pencil size={9} strokeWidth={1.75} style={{ flexShrink: 0, marginLeft: "auto" }} />
            </button>
          )}
          {/* Vier umrandete Pillen lasen sich als Knopfleiste, obwohl nichts
              davon anklickbar ist. Eine ruhige Zeile mit Trennpunkten sagt
              dasselbe und lässt den Ordner-Knopf darüber als einzigen
              Bedienpunkt stehen. */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6, marginTop: 7, flexWrap: "wrap",
            fontSize: 10, color: C.onSecondaryFixedVar,
          }}>
            {p.key && <><span>{p.key}</span><Dot /></>}
            {p.bpm != null && <><span>{p.bpm} BPM</span><Dot /></>}
            <span title={p.modified_date ?? undefined}>{formatRelativeTime(p.modified_secs)}</span>
            <Dot />
            {/* Steht seit Q3 nicht mehr in jeder Zeile — hier ist der Ort dafür. */}
            <span title={p.root} style={{ display: "inline-flex", alignItems: "center", gap: 3, minWidth: 0 }}>
              <HardDrive size={9} strokeWidth={1.75} style={{ flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.root.split(/[/\\]/).filter(Boolean).pop()}
              </span>
            </span>
          </div>
        </div>
        <button
          onClick={() => onPatch({ priority: p.priority ? 0 : 1 })}
          title={p.priority ? "Priorität entfernen" : "Als Priorität markieren"}
          style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 2 }}
        >
          <Star size={16} color={p.priority ? C.primary : C.onSecondaryFixedVar} fill={p.priority ? C.primary : "none"} strokeWidth={1.75} />
        </button>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", color: C.onSurfaceVariant, display: "flex", padding: 2 }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 18 }}>

        {/* Status — hier steht auch, warum er so ist. Die Stufe kommt aus den
            Dateien, also sagt der Inspector, welche noch fehlt. */}
        <StatusSection project={p} onPatch={onPatch} />

        {/* Die Arbeit, für die man das Panel aufmacht. Die Karte kommt ohne
            eigene Fläche, sonst steckt eine Karte in einem Panel derselben
            Farbe und zieht nur eine Linie ein.
            Überschrift benennt, Knöpfe handeln: „Zuweisen" stand vorher als
            Titel UND auf jedem leeren Slot — viermal dasselbe Wort. */}
        <BeatAssetsCard
          assets={folderAssets.assets}
          folderPath={p.path}
          assetPath={settings.assetPath}
          isRefreshing={folderAssets.isRefreshing}
          onRefresh={() => { folderAssets.refresh(); onAssetsChanged(); }}
          title="Bilder & Video"
          showArchiveWarning={false}
          style={{ background: "transparent", border: "none", padding: 0, boxShadow: "none" }}
        />

        {/* FLP-Versionen — eine Zeile pro Version statt einer Karte. Meistens
            sind es zwei, und man will nur eine davon öffnen. */}
        <section>
          <SectionLabel>FLP-Versionen ({p.flps.length})</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {p.flps.map((flp, i) => (
              <button
                key={flp.path}
                onClick={() => openPath(flp.path).catch(e => alert(`FLP konnte nicht geöffnet werden: ${String(e)}`))}
                title={`${flp.name} — in FL Studio öffnen`}
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
                  fontSize: 11, fontFamily: "monospace", color: C.onSurface,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {flp.name}
                </span>
                {i === 0 && (
                  <span style={{
                    flexShrink: 0,
                    padding: "1px 6px", borderRadius: 9999,
                    background: `${C.primary}18`, color: C.primary,
                    fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                  }}>
                    NEUESTE
                  </span>
                )}
                <span
                  title={flp.modified_date ?? undefined}
                  style={{ flexShrink: 0, fontSize: 10, color: C.onSecondaryFixedVar }}
                >
                  {formatRelativeTime(flp.modified_secs)}
                </span>
                <Disc3 size={12} strokeWidth={1.75} color={C.onSecondaryFixedVar} style={{ flexShrink: 0 }} />
              </button>
            ))}
          </div>
        </section>

        {/* Notizen — 841 von 865 Projekten haben keine. Ein leeres Rechteck
            als zweitgrößtes Element im Panel war das teuerste Nichts darin. */}
        <section>
          {/* Überschrift nur, wenn auch ein Feld darunter steht — sonst sagte
              „NOTIZEN" dasselbe wie der Knopf direkt darunter. */}
          {(notes || notesOpen) && (
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
          )}
          {notes || notesOpen ? (
            <textarea
              autoFocus={notesOpen && !notes}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              // Escape verlässt erst das Feld; der Esc-Handler des Inspectors
              // hätte sonst mitten im Tippen das ganze Panel zugemacht.
              onKeyDown={e => {
                if (e.key === "Escape") { e.stopPropagation(); e.currentTarget.blur(); }
              }}
              placeholder={'z.B. "Hook neu einspielen", "für Artist X gedacht" …'}
              rows={3}
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: 12, lineHeight: 1.55,
                background: C.surfaceContainerLowest,
                border: `1px solid ${C.border15}`,
                borderRadius: 8,
                outline: "none",
                color: C.onSurface,
                resize: "vertical",
                minHeight: 66,
                boxSizing: "border-box",
              }}
            />
          ) : (
            <button
              onClick={() => setNotesOpen(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 10px", width: "100%",
                background: "transparent",
                border: `1px dashed ${C.border20}`,
                borderRadius: 8, cursor: "pointer",
                fontSize: 11, color: C.onSecondaryFixedVar, textAlign: "left",
              }}
            >
              <Plus size={11} strokeWidth={2} />
              Notiz hinzufügen
            </button>
          )}
        </section>
      </div>

      {/* Footer actions */}
      <div style={{
        flexShrink: 0,
        display: "flex", gap: 8,
        padding: "12px 18px",
        borderTop: `1px solid ${C.border10}`,
      }}>
        <button
          onClick={() => revealItemInDir(p.path).catch(() => {})}
          style={{
            flex: 1,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            padding: "9px 12px", borderRadius: 7,
            background: "transparent", border: `1px solid ${C.border20}`,
            color: C.onSurfaceVariant, cursor: "pointer",
            fontSize: 11, fontWeight: 600,
          }}
        >
          <FolderOpen size={12} strokeWidth={1.75} />
          Ordner
        </button>
        <Button variant="primary" size="sm" icon={Archive} onClick={onArchive} style={{ flex: 1 }}>
          Archivieren
        </Button>
      </div>
    </aside>
  );
}

/**
 * Status im Inspector: die gültige Pille, ein Satz warum, und darunter die
 * zwei Markierungen, die du selbst setzt. Der Satz ist der Punkt — im Studio
 * fragt man sich sonst, warum ein Projekt auf „Exportiert" hängenbleibt, und
 * die Antwort ist immer eine fehlende Datei.
 */
function StatusSection({ project: p, onPatch }: {
  project: StudioProject;
  onPatch: (patch: Partial<Pick<StudioProject, "status" | "priority" | "notes">>) => void;
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
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0,
          padding: "5px 11px", borderRadius: 9999,
          background: status.bg, color: status.color,
          fontSize: 10, fontWeight: 700,
          letterSpacing: "0.04em", textTransform: "uppercase",
        }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: status.color }} />
          {status.label}
        </span>
        <div style={{ flex: 1 }} />
        <ManualStatusToggles project={p} onPatch={onPatch} variant="panel" />
      </div>
      <p style={{ margin: "9px 0 0", fontSize: 11, lineHeight: 1.5, color: C.onSurfaceVariant }}>
        {reason}
      </p>
    </section>
  );
}

function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center",
      fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
      textTransform: "uppercase", color: C.onSecondaryFixedVar,
      marginBottom: 8,
    }}>
      {children}
      <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>{right}</span>
    </div>
  );
}

/** Trennpunkt in der Meta-Zeile. */
function Dot() {
  return <span style={{ opacity: 0.45 }}>·</span>;
}
