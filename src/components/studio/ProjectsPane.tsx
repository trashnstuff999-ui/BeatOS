// src/components/studio/ProjectsPane.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Studio → Projekte: search/filter toolbar, collapsible sections
// (Priorität → Bereit → Exportiert → Überarbeiten → Idee → Lange inaktiv →
// Kann weg), audio preview via the global player, and the inspector.
// Zeilenklick öffnet den Inspector — dort hängen Notizen, FLP-Versionen und die
// Asset-Slots. Filtering, grouping and sorting are pure client-side derivations
// over one scan result.
//
// Gelöscht wird nur an EINER Stelle: der Aufräum-Leiste ganz unten, die
// erscheint, sobald etwas als „Kann weg" markiert ist.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, Loader2, ChevronDown, Moon, Star, FolderKanban, FilePlus2, FolderInput, Trash2, X, Settings } from "lucide-react";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { C, STUDIO_STATUS_CONFIG } from "../../lib/theme";
import { api } from "../../lib/api";
import { daysSince } from "../../lib/time";
import { useAudioPlayerContext } from "../../contexts/AudioPlayerContext";
import { useSettings } from "../../contexts/SettingsContext";
import { useFocusRefresh } from "../../hooks/useFocusRefresh";
import { ProjectsToolbar, type SortMode } from "./ProjectsToolbar";
import { EmptyState, Button, IconButton } from "../ui";
import { MergeProjectsDialog } from "./MergeProjectsDialog";
import { ProjectRow } from "./ProjectRow";
import { ProjectInspector } from "./ProjectInspector";
import { deriveStage, projectDisplayName, studioBeatId } from "../../types/studio";
import type { StudioProject, StudioStatus } from "../../types/studio";
import type { Beat } from "../../types/browse";

/** Ideen ohne Aktivität länger als das gelten als "Lange inaktiv" */
const STALE_DAYS = 30;

/** So viele Zeilen zeigt eine Sektion, bevor sie „… weitere anzeigen" anbietet. */
const SECTION_LIMIT = 50;

type SectionKey = StudioStatus | "stale" | "priority";

const SECTION_ORDER: SectionKey[] = ["priority", "ready", "exported", "wip", "idea", "stale", "discard"];
const SECTION_META: Record<SectionKey, { label: string; color: string }> = {
  priority: { label: "Priorität",                         color: "#fda124" },
  ready:    { label: STUDIO_STATUS_CONFIG.ready.label,    color: STUDIO_STATUS_CONFIG.ready.color },
  exported: { label: STUDIO_STATUS_CONFIG.exported.label, color: STUDIO_STATUS_CONFIG.exported.color },
  wip:      { label: STUDIO_STATUS_CONFIG.wip.label,      color: STUDIO_STATUS_CONFIG.wip.color },
  idea:     { label: STUDIO_STATUS_CONFIG.idea.label,     color: STUDIO_STATUS_CONFIG.idea.color },
  stale:    { label: "Lange inaktiv",                     color: "#8a8a89" },
  discard:  { label: STUDIO_STATUS_CONFIG.discard.label,  color: STUDIO_STATUS_CONFIG.discard.color },
};

const LS_COLLAPSED = "beatos_studio_collapsed";
const LS_SORT = "beatos_studio_sort";

function loadCollapsed(): Set<SectionKey> {
  try {
    const raw = localStorage.getItem(LS_COLLAPSED);
    if (raw) return new Set(JSON.parse(raw) as SectionKey[]);
  } catch { /* fallthrough to default */ }
  return new Set<SectionKey>(["idea", "stale", "discard"]);
}

function loadSort(): SortMode {
  const raw = localStorage.getItem(LS_SORT);
  // Ein alter gespeicherter Wert ("priority") fällt hier auf den Standard zurück.
  return (raw === "modified" || raw === "name" || raw === "oldest") ? raw : "modified";
}

/** Ein Projektordner als Beat für den globalen Player. */
function toPseudoBeat(p: StudioProject): Beat {
  return {
    id: studioBeatId(p.path),
    name: projectDisplayName(p),
    path: p.path,
    bpm: p.bpm, key: p.key,
    status: null, tags: null, favorite: null,
    created_date: null, modified_date: null,
    notes: null, sold_to: null, has_artwork: null, has_video: null,
  };
}

interface ProjectsPaneProps {
  productionPaths: string[];
  refreshKey: number;
  onProjects?: (projects: StudioProject[]) => void;
}

export function ProjectsPane({ productionPaths, refreshKey, onProjects }: ProjectsPaneProps) {
  const [projects, setProjects] = useState<StudioProject[]>([]);
  /** Der aktuelle Stand — auch in einer Closure aus einem älteren Render. */
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { playBeat, setQueue } = useAudioPlayerContext();
  const { settings } = useSettings();

  // Filters & view state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StudioStatus | null>(null);
  const [onlyPriority, setOnlyPriority] = useState(false);
  const [rootFilter, setRootFilter] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>(loadSort);
  const [collapsed, setCollapsed] = useState<Set<SectionKey>>(loadCollapsed);
  /** Sektionen, in denen „… weitere anzeigen" schon gedrückt wurde. */
  const [expanded, setExpanded] = useState<Set<SectionKey>>(new Set());
  /** Mehrfachauswahl (Projektpfade) und der Ankerpunkt für Shift-Klick. */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [inspectorPath, setInspectorPath] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [showMerge, setShowMerge] = useState(false);

  useEffect(() => { localStorage.setItem(LS_SORT, sortMode); }, [sortMode]);
  useEffect(() => {
    localStorage.setItem(LS_COLLAPSED, JSON.stringify([...collapsed]));
  }, [collapsed]);

  const scan = useCallback(async () => {
    if (productionPaths.length === 0) {
      setProjects([]);
      setError("Kein Produktions-Pfad gesetzt — in den Settings unter 'Active Production Paths' hinzufügen.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      setProjects(await api.studio.scanProjects(productionPaths));
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productionPaths.join("\n")]);

  // Der Assets-Tab wählt sein Ziel aus dieser Liste — er bekommt sie an EINER
  // Stelle, statt an jeder Mutation einzeln. Sonst vergisst der nächste neue
  // Pfad die Meldung nach oben.
  useEffect(() => { onProjects?.(projects); }, [projects]); // eslint-disable-line react-hooks/exhaustive-deps

  // Was nicht mehr in der Liste steht, kann auch nicht ausgewählt sein — sonst
  // sagt die Leiste „5 ausgewählt", geschrieben werden aber vier.
  useEffect(() => {
    setSelected(prev => {
      if (prev.size === 0) return prev;
      const da = new Set(projects.map(p => p.path));
      if ([...prev].every(path => da.has(path))) return prev;
      return new Set([...prev].filter(path => da.has(path)));
    });
  }, [projects]);

  useEffect(() => { scan(); }, [scan, refreshKey]);

  // Nach dem Export in FL zurückwechseln → Liste ist schon aktuell
  // ponytail: scannt alle Roots komplett neu; bei großen Roots auf einen
  // echten Datei-Watcher (notify-Crate) umstellen.
  //
  // Nicht, solange der Zusammenführen-Dialog offen ist: dort liegen die Ordner
  // mitten im Lauf unter einem Zwischennamen. Ein Scan hielte sie in diesem
  // Moment für gelöscht und räumte ihre Zeile samt Status und Notizen weg —
  // der Umzug fände hinterher nichts mehr, was er umhängen könnte.
  useFocusRefresh(() => { if (!isLoading && !showMerge) scan(); });

  // Optimistic update, revert on error.
  //
  // Immer über prev => …, nie über die Liste aus dem Render: zwischen dem Klick
  // und hier kann ein Scan gelandet sein (Fokuswechsel aus FL, Asset-Zuweisung,
  // 600 ms Notiz-Debounce). Aus der alten Liste gebaut, würde dieser Klick
  // dessen Ergebnis wieder wegwerfen — gelöschte Projekte kämen zurück, frisch
  // erkannte Exporte verschwänden.
  //
  // Aus demselben Grund darf auch `p` nicht die Vorlage sein: der Notiz-Debounce
  // im Inspector hält die Zeile aus dem Render, in dem getippt wurde. Wer in
  // diesen 600 ms den Stern setzt, sah ihn danach wieder ausgehen — die Notiz
  // schrieb die alte Priorität zurück. Also die AKTUELLE Zeile nachschlagen und
  // nur das patchen, was dieser Aufruf wirklich ändert.
  const patchProject = async (p: StudioProject, patch: Partial<Pick<StudioProject, "status" | "priority" | "notes">>) => {
    const aktuell = projectsRef.current.find(x => x.path === p.path) ?? p;
    const next = { ...aktuell, ...patch };
    const swap = (list: StudioProject[], to: StudioProject) =>
      list.map(x => x.path === p.path ? to : x);
    setProjects(prev => swap(prev, next));
    try {
      await api.studio.updateProject(next.path, next.status, next.priority, next.notes);
      return true;
    } catch (e) {
      setProjects(prev => swap(prev, aktuell));
      alert(`Speichern fehlgeschlagen: ${String(e)}`);
      return false;
    }
  };

  // Neues Projekt: Nummer ziehen, Ordner + Template-FLP anlegen, in FL öffnen.
  // Kein Name-Dialog — der Name kommt später über den Inspector.
  const newProjectRoot = rootFilter ?? productionPaths[0] ?? "";

  // Die Nummer läuft über ALLE Produktions-Roots (Einstellungen → Pfade), nicht
  // nur über den Ziel-Ordner. Vorab anzeigen, damit die Zahl niemanden überrascht.
  const [nextName, setNextName] = useState("");
  useEffect(() => {
    api.studio.nextProjectName(productionPaths)
      .then(setNextName)
      .catch(() => setNextName(""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productionPaths.join("\n"), projects.length]);

  const handleNewProject = async () => {
    if (!settings.flpTemplatePath.trim()) {
      alert("Keine Template-FLP gesetzt — in den Einstellungen unter „Pfade“ eine Start-FLP wählen.");
      return;
    }
    setIsCreating(true);
    try {
      const name = await api.studio.nextProjectName(productionPaths);
      const flp = await api.studio.createProject(newProjectRoot, name, settings.flpTemplatePath);
      try { await openPath(flp); }
      catch (e) { alert(`„${name}“ liegt bereit, FL öffnet es nicht: ${String(e)}`); }
      scan();
    } catch (e) {
      alert(`Projekt konnte nicht angelegt werden: ${String(e)}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleRename = async (p: StudioProject, newName: string) => {
    if (newName.trim() === p.name) return;
    try {
      const newPath = await api.studio.renameProject(p.path, newName.trim());
      // Die Zeile im selben Zug auf den neuen Pfad ziehen, nicht erst mit dem
      // Scan: sonst zeigt der Inspector einen Render lang auf einen Pfad, den
      // es in der Liste noch nicht gibt — das Panel ging zu und wieder auf.
      // Alles Übrige (parsed_name, FLP-Pfade) holt der Scan gleich nach.
      const neuerName = newPath.split(/[/\\]/).filter(Boolean).pop() ?? newName.trim();
      setProjects(prev => prev.map(x =>
        x.path === p.path ? { ...x, path: newPath, name: neuerName } : x));
      if (inspectorPath === p.path) setInspectorPath(newPath);
      scan();
    } catch (e) {
      alert(`Umbenennen fehlgeschlagen: ${String(e)}`);
    }
  };

  const handleOpenDaw = async (p: StudioProject) => {
    if (!p.newest_flp) return;
    try { await openPath(p.newest_flp); }
    catch (e) { alert(`FLP konnte nicht geöffnet werden: ${String(e)}`); }
  };

  const handleArchive = (p: StudioProject) => {
    navigate("/create", { state: { sourceFolder: p.path } });
  };

  // Junk-Projekt in den Papierkorb (wiederherstellbar). Rückfrage, dann
  // optimistisch aus der Liste nehmen; die Auswahl/Inspector ggf. lösen.
  const handleTrash = async (p: StudioProject) => {
    const name = projectDisplayName(p);
    const ok = window.confirm(
      `„${name}" in den Papierkorb verschieben?\n\n` +
      `Der komplette Projektordner wandert in den Windows-Papierkorb ` +
      `(wiederherstellbar):\n${p.path}`
    );
    if (!ok) return;
    try {
      await api.archive.trashSourceFolder(p.path, settings.archivePath);
      setProjects(prev => prev.filter(x => x.path !== p.path));
      if (inspectorPath === p.path) setInspectorPath(null);
    } catch (e) {
      alert(`Löschen fehlgeschlagen: ${String(e)}`);
    }
  };

  // Alle „Kann weg"-Ordner auf einmal in den Papierkorb, danach anbieten, die
  // Nummern nachrücken zu lassen. Das Umnummerieren macht der vorhandene
  // Zusammenführen-Dialog — er zeigt jeden Schritt vorher und kann ihn
  // rückgängig machen, das muss hier niemand nachbauen.
  const handleTrashMarked = async () => {
    const n = discardable.length;
    const namen = discardable.slice(0, 8).map(p => `• ${projectDisplayName(p)}`).join("\n");
    const rest = n > 8 ? `\n… und ${n - 8} weitere` : "";
    const ok = window.confirm(
      `${n} ${n === 1 ? "Projekt" : "Projekte"} in den Papierkorb verschieben?\n\n${namen}${rest}\n\n` +
      `Die kompletten Ordner wandern in den Windows-Papierkorb und lassen sich von dort zurückholen.`
    );
    if (!ok) return;

    setIsCleaning(true);
    const weg = new Set<string>();
    const fehler: string[] = [];
    for (const p of discardable) {
      try {
        await api.archive.trashSourceFolder(p.path, settings.archivePath);
        weg.add(p.path);
      } catch (e) {
        fehler.push(`${projectDisplayName(p)}: ${String(e)}`);
      }
    }
    setProjects(prev => prev.filter(x => !weg.has(x.path)));
    if (inspectorPath && weg.has(inspectorPath)) setInspectorPath(null);
    setIsCleaning(false);

    if (fehler.length > 0) {
      alert(
        `${weg.size} im Papierkorb, ${fehler.length} nicht:\n\n${fehler.join("\n")}\n\n` +
        `Die übrigen bleiben markiert — Leiste nochmal drücken, wenn die Ursache weg ist.`
      );
      return;
    }
    if (weg.size > 0 && window.confirm(
      `${weg.size} ${weg.size === 1 ? "Ordner ist" : "Ordner sind"} im Papierkorb.\n\n` +
      `Jetzt die Projektnummern lückenlos nachrücken lassen? ` +
      `Der nächste Schritt zeigt erst eine Vorschau, bevor etwas umbenannt wird.`
    )) {
      setShowMerge(true);
    }
  };

  // ── Derivations: filter → counts → group → sort ────────────────────────────

  // Alles außer dem Status-Filter. Die Status-Chips zählen über diese Menge,
  // damit ihre Zahlen zu dem passen, was ein Klick tatsächlich zeigt — vorher
  // zählten sie global weiter und widersprachen der Liste darunter.
  const q = search.trim().toLowerCase();
  const preStatus = projects.filter(p => {
    if (onlyPriority && !p.priority) return false;
    if (rootFilter && p.root !== rootFilter) return false;
    if (q) {
      // Songtitel zuerst — danach sucht man, nicht nach "project_187".
      // Notizen zählen mit: „für Artist X" ist genau das, was man später sucht.
      const hay = `${p.song_name ?? ""} ${p.parsed_name} ${p.name} ${p.key ?? ""} ${p.bpm ?? ""} ${p.notes ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const counts = {
    all: preStatus.length,
    idea: preStatus.filter(p => p.status === "idea").length,
    wip: preStatus.filter(p => p.status === "wip").length,
    exported: preStatus.filter(p => p.status === "exported").length,
    ready: preStatus.filter(p => p.status === "ready").length,
    discard: preStatus.filter(p => p.status === "discard").length,
  };

  // Alle vorgemerkten Projekte — unabhängig von Suche und Filtern, sonst räumt
  // die Leiste unten je nach Sucheingabe mal mehr und mal weniger weg.
  const discardable = projects.filter(p => p.status === "discard");

  const visible = statusFilter
    ? preStatus.filter(p => p.status === statusFilter)
    : preStatus;

  // Jedes Projekt gehört in genau eine Sektion. Der Stern schlägt alles: er ist
  // die Merkliste, und die gehört nach oben — "Idee" und "Lange inaktiv" sind
  // beide standardmäßig zugeklappt, ein markiertes Projekt wäre dort weg.
  const sectionOf = (p: StudioProject): SectionKey => {
    // Aussortiert schlägt den Stern: ein vorgemerktes Projekt gehört nach
    // unten, auch wenn es früher mal eine Priorität war.
    if (p.status === "discard") return "discard";
    if (p.priority) return "priority";
    if (p.status === "idea" && daysSince(p.modified_secs) > STALE_DAYS) return "stale";
    return p.status;
  };

  // B4: „Priorität zuerst" ist raus. Der Modus sortierte nur INNERHALB einer
  // Sektion, die Sektionsreihenfolge liegt aber fest — er tat also sichtbar
  // nichts. Seit es die Sektion „Priorität" ganz oben gibt, ist seine Aufgabe
  // ohnehin erledigt. Ein Modus, der nichts bewirkt, ist schlimmer als keiner.
  const sortFn = (a: StudioProject, b: StudioProject): number => {
    switch (sortMode) {
      case "name":   return projectDisplayName(a).localeCompare(projectDisplayName(b), "de");
      case "oldest": return a.modified_secs - b.modified_secs;
      default:       return b.modified_secs - a.modified_secs;
    }
  };

  const sections = SECTION_ORDER
    .map(key => ({
      key,
      meta: SECTION_META[key],
      items: visible.filter(p => sectionOf(p) === key).sort(sortFn),
    }))
    .filter(s => s.items.length > 0);

  // Suche und Status-Filter klappen alles auf: was übrig bleibt, will man sehen.
  const forcedOpen = statusFilter !== null || q.length > 0;
  const isSectionOpen = (key: SectionKey) => forcedOpen || !collapsed.has(key);

  // Eine Sektion zeigt erst SECTION_LIMIT Zeilen. Ohne die Grenze rendert ein
  // einzelner Buchstabe in der Suche mehrere hundert Zeilen mit je sechs
  // Knöpfen — die Liste klappt ja beim Suchen komplett auf.
  const shownItems = (s: { key: SectionKey; items: StudioProject[] }) =>
    expanded.has(s.key) ? s.items : s.items.slice(0, SECTION_LIMIT);

  // Genau die Zeilen, die dastehen — in der Reihenfolge der Liste. Daraus wird
  // die Hör-Queue, damit „Weiter" das nächste Projekt meint und nicht die
  // Browse-Liste von vorhin.
  const rows = sections.flatMap(s => isSectionOpen(s.key) ? shownItems(s) : []);

  const toggleSection = (key: SectionKey) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Audio preview: pseudo-beat over the project folder — get_beat_audio_path
  // scans the folder root and finds the exported MP3/WAV. Die ganze sichtbare
  // Liste kommt als Queue mit: hören → Stern oder „Kann weg" → Weiter.
  const handlePreview = (p: StudioProject) => {
    setQueue(rows.filter(x => x.has_mp3 || x.has_wav).map(toPseudoBeat));
    playBeat(toPseudoBeat(p));
  };

  // ── Mehrfachauswahl: Strg-Klick nimmt einzeln dazu, Shift-Klick die Spanne ──
  // Kein Kästchen in jeder Zeile — der Griff ist derselbe wie im Explorer, und
  // der einfache Klick öffnet weiterhin den Inspector.
  const handleRowClick = (p: StudioProject, e: React.MouseEvent) => {
    const to = rows.findIndex(x => x.path === p.path);
    if (e.shiftKey && to >= 0) {
      // Ist der Anker nicht mehr sichtbar (Filter gewechselt, Projekt weg),
      // fängt hier eine neue Spanne an. Vorher fiel der Klick auf „einfacher
      // Klick" zurück und warf die ganze Auswahl weg.
      const from = anchor ? rows.findIndex(x => x.path === anchor) : -1;
      const [a, b] = from < 0 ? [to, to] : from < to ? [from, to] : [to, from];
      if (from < 0) setAnchor(p.path);
      // Der Inspector geht zu: sonst stehen seine Knöpfe für EIN Projekt
      // neben der Leiste für die Auswahl, und beide heißen „Kann weg".
      setInspectorPath(null);
      setSelected(prev => {
        const next = new Set(prev);
        rows.slice(a, b + 1).forEach(x => next.add(x.path));
        return next;
      });
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      setAnchor(p.path);
      setInspectorPath(null);
      setSelected(prev => {
        const next = new Set(prev);
        if (next.has(p.path)) next.delete(p.path); else next.add(p.path);
        return next;
      });
      return;
    }
    setAnchor(p.path);
    setSelected(new Set());
    setInspectorPath(inspectorPath === p.path ? null : p.path);
  };

  // Eine Änderung für die ganze Auswahl. Optimistisch wie patchProject, aber
  // die Fehler werden gesammelt gemeldet statt einzeln weggeklickt.
  const patchSelected = async (patch: (p: StudioProject) => Partial<StudioProject>) => {
    const targets = projectsRef.current.filter(p => selected.has(p.path));
    if (targets.length === 0) return;
    const patched = new Map(targets.map(p => [p.path, { ...p, ...patch(p) }]));
    setProjects(prev => prev.map(p => patched.get(p.path) ?? p));
    setSelected(new Set());

    const fehler: string[] = [];
    for (const p of patched.values()) {
      try {
        await api.studio.updateProject(p.path, p.status, p.priority, p.notes);
      } catch (e) {
        fehler.push(`${projectDisplayName(p)}: ${String(e)}`);
      }
    }
    if (fehler.length > 0) {
      alert(`${fehler.length} von ${targets.length} nicht gespeichert:\n\n${fehler.join("\n")}`);
      scan();
    }
  };

  const inspectorProject = inspectorPath
    ? projects.find(p => p.path === inspectorPath) ?? null
    : null;

  return (
    <div style={{
      background: C.surfaceContainerLow,
      border: `1px solid ${C.border10}`,
      borderRadius: 12,
      overflow: "hidden",
    }}>
      {/* Top bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 16px",
        borderBottom: `1px solid ${C.border10}`,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.onSurface }}>
          {projects.length} Projekte
        </span>
        <span style={{ fontSize: 10, color: C.onSecondaryFixedVar }}>
          aus {productionPaths.length} {productionPaths.length === 1 ? "Pfad" : "Pfaden"}
        </span>
        <div style={{ flex: 1 }} />
        <IconButton
          icon={FolderInput}
          size={28}
          onClick={() => setShowMerge(true)}
          disabled={productionPaths.length === 0}
          title="Produktions-Ordner zusammenführen und nach Alter neu nummerieren"
        />
        <Button
          size="sm"
          variant="primary"
          icon={FilePlus2}
          onClick={handleNewProject}
          loading={isCreating}
          disabled={productionPaths.length === 0}
          title={`${nextName || "Nächstes Projekt"} in ${newProjectRoot} anlegen und in FL öffnen\nNummer läuft über alle Produktions-Ordner`}
        >
          Neues Projekt
          {nextName && <span style={{ opacity: 0.65, fontWeight: 600 }}>{nextName}</span>}
        </Button>
        <button
          onClick={scan}
          disabled={isLoading}
          title="Neu scannen"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 12px", borderRadius: 6,
            background: "transparent", border: `1px solid ${C.border15}`,
            color: C.onSurfaceVariant, cursor: "pointer",
            fontSize: 10, fontWeight: 600,
          }}
        >
          {isLoading
            ? <Loader2 size={11} style={{ animation: "spin 0.8s linear infinite" }} />
            : <RefreshCw size={11} />}
          Scan
        </button>
      </div>

      {/* Search / filter / sort */}
      <ProjectsToolbar
        search={search}
        onSearch={setSearch}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
        counts={counts}
        onlyPriority={onlyPriority}
        onOnlyPriority={setOnlyPriority}
        roots={productionPaths}
        rootFilter={rootFilter}
        onRootFilter={setRootFilter}
        sortMode={sortMode}
        onSortMode={setSortMode}
      />

      {error && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
          padding: "14px 16px", fontSize: 12, color: C.error,
        }}>
          <span>{error}</span>
          {/* Ein fehlender Pfad ist kein Fehler, sondern eine offene Einstellung —
              also auch ein Weg dorthin und nicht nur ein Satz. */}
          {productionPaths.length === 0 && (
            <Button size="sm" icon={Settings} onClick={() => navigate("/settings")}>
              Zu den Einstellungen
            </Button>
          )}
        </div>
      )}

      {!error && !isLoading && projects.length === 0 && (
        <EmptyState
          variant="inline"
          icon={FolderKanban}
          title="Keine FLP-Projekte gefunden"
          description="Ein Projekt ist ein Ordner mit mindestens einer .flp-Datei."
        />
      )}

      {!error && !isLoading && projects.length > 0 && visible.length === 0 && (
        <EmptyState variant="inline" title="Kein Projekt passt zu den Filtern." />
      )}

      {/* Sections */}
      {sections.map(section => {
        const isCollapsed = !isSectionOpen(section.key);
        const shown = shownItems(section);
        const hidden = section.items.length - shown.length;
        return (
          <div key={section.key}>
            <button
              onClick={() => !forcedOpen && toggleSection(section.key)}
              style={{
                width: "100%",
                display: "flex", alignItems: "center", gap: 8,
                padding: "9px 16px",
                background: "rgba(255,255,255,0.02)",
                border: "none",
                borderTop: `1px solid ${C.border10}`,
                cursor: forcedOpen ? "default" : "pointer",
                textAlign: "left",
              }}
            >
              {section.key === "stale"
                ? <Moon size={10} color={section.meta.color} strokeWidth={2} />
                : section.key === "priority"
                ? <Star size={10} color={section.meta.color} fill={section.meta.color} strokeWidth={2} />
                : <span style={{ width: 7, height: 7, borderRadius: "50%", background: section.meta.color }} />
              }
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
                textTransform: "uppercase", color: C.onSurfaceVariant,
              }}>
                {section.meta.label}
              </span>
              <span style={{ fontSize: 10, color: C.onSecondaryFixedVar }}>
                {section.items.length}
              </span>
              <div style={{ flex: 1 }} />
              {!forcedOpen && (
                <ChevronDown
                  size={12}
                  color={C.onSecondaryFixedVar}
                  style={{ transition: "transform 0.15s", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0)" }}
                />
              )}
            </button>

            {!isCollapsed && shown.map(p => (
              <ProjectRow
                key={p.path}
                project={p}
                isOpen={inspectorPath === p.path}
                isSelected={selected.has(p.path)}
                dimmed={section.key === "stale"}
                onPatch={patch => patchProject(p, patch)}
                onOpenDaw={() => handleOpenDaw(p)}
                onPreview={() => handlePreview(p)}
                onOpen={e => handleRowClick(p, e)}
                onOpenFolder={() => revealItemInDir(p.path).catch(() => {})}
                onArchive={() => handleArchive(p)}
                onTrash={() => handleTrash(p)}
              />
            ))}

            {!isCollapsed && hidden > 0 && (
              <button
                onClick={() => setExpanded(prev => new Set(prev).add(section.key))}
                style={{
                  width: "100%",
                  padding: "10px 16px",
                  background: "transparent",
                  border: "none", borderTop: `1px solid ${C.border10}`,
                  cursor: "pointer", textAlign: "left",
                  fontSize: 11, fontWeight: 600, color: C.onSurfaceVariant,
                }}
              >
                … {hidden} {hidden === 1 ? "weiteres Projekt" : "weitere Projekte"} anzeigen
              </button>
            )}
          </div>
        );
      })}

      {/* Solange etwas ausgewählt ist, gehört die Fußleiste der Auswahl — sonst
          stünden zwei Leisten übereinander und man drückt die falsche. */}
      {selected.size > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 16px",
          borderTop: `1px solid ${C.border20}`,
          background: "rgba(253,161,36,0.06)",
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.onSurface }}>
            {selected.size} ausgewählt
          </div>
          <div style={{ flex: 1 }} />
          <Button size="sm" icon={Star} onClick={() => patchSelected(() => ({ priority: 1 }))}>
            Priorität
          </Button>
          <Button size="sm" icon={Trash2} onClick={() => patchSelected(() => ({ status: "discard" }))}>
            Kann weg
          </Button>
          <Button
            size="sm"
            onClick={() => patchSelected(p => ({ status: deriveStage(p), priority: 0 }))}
            title="Handstatus und Stern entfernen — dann gilt wieder die automatische Stufe"
          >
            Zurücksetzen
          </Button>
          <IconButton icon={X} size={28} onClick={() => setSelected(new Set())} title="Auswahl aufheben" />
        </div>
      )}

      {/* Aufräumen — der einzige laute Moment im Studio, und der einzige Weg,
          auf dem mehrere Ordner auf einmal verschwinden. Steht am Fuß der
          Liste, direkt unter dem, was er wegräumt. */}
      {selected.size === 0 && discardable.length > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 16px",
          borderTop: `1px solid ${C.border20}`,
          background: "rgba(255,255,255,0.02)",
        }}>
          <Trash2 size={14} color={STUDIO_STATUS_CONFIG.discard.color} strokeWidth={1.75} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.onSurface }}>
              {discardable.length} {discardable.length === 1 ? "Projekt kann" : "Projekte können"} weg
            </div>
            <div style={{ fontSize: 10, color: C.onSecondaryFixedVar, marginTop: 2 }}>
              Die Ordner landen im Windows-Papierkorb. Danach können die Nummern nachrücken.
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <Button
            variant="danger"
            size="sm"
            icon={Trash2}
            loading={isCleaning}
            onClick={handleTrashMarked}
          >
            In den Papierkorb
          </Button>
        </div>
      )}

      {showMerge && (
        <MergeProjectsDialog
          roots={productionPaths}
          archivePath={settings.archivePath}
          onClose={() => setShowMerge(false)}
          onDone={() => { setInspectorPath(null); scan(); }}
        />
      )}

      {/* Inspector */}
      {inspectorProject && (
        <ProjectInspector
          project={inspectorProject}
          onPatch={patch => patchProject(inspectorProject, patch)}
          onRename={name => handleRename(inspectorProject, name)}
          onArchive={() => handleArchive(inspectorProject)}
          onClose={() => setInspectorPath(null)}
          onAssetsChanged={scan}
        />
      )}
    </div>
  );
}
