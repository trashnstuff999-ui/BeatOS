// src/components/studio/ProjectsPane.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Studio → Projekte: Werkbank (Cover-Regale) + Ideen-Liste, oder Aufräumen
// (Lange inaktiv / Kann weg nach Jahr). Audio preview via the global player,
// and the inspector. Zeilenklick öffnet den Inspector — dort hängen Notizen,
// FLP-Versionen und der Weg zum Upload. Filtering, grouping and sorting are
// pure client-side derivations over one scan result.
//
// Gelöscht wird nur an EINER Stelle: der Aufräum-Leiste ganz unten, die
// erscheint, sobald etwas als „Kann weg" markiert ist.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { RefreshCw, Star, FolderKanban, FolderInput, FolderPlus, CopyPlus, Trash2, X, Settings, ListOrdered, AudioLines, Plus, Wrench } from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { open } from "@tauri-apps/plugin-dialog";
import { C, STUDIO_STATUS_CONFIG, alpha } from "../../lib/theme";
import { api } from "../../lib/api";
import { daysSince } from "../../lib/time";
import { useAudioPlayerContext } from "../../contexts/AudioPlayerContext";
import { useSettings, samplesOrdner } from "../../contexts/SettingsContext";
import { useDialog } from "../../contexts/DialogContext";
import { useFocusRefresh } from "../../hooks/useFocusRefresh";
import { useKlickDaneben } from "../../hooks/useKlickDaneben";
import { ProjectsToolbar, type SortMode } from "./ProjectsToolbar";
import { EmptyState, Button, IconButton, Dropdown, MenuePunkt } from "../ui";
import { useNeuesSample } from "./SamplesPane";
import { VorlagenPunkte, MenueGruppe } from "./VorlagenPunkte";
import { NeuesZeile } from "./NeuesZeile";
import { useFlVorlagen } from "../../hooks/useFlVorlagen";
import { MergeProjectsDialog } from "./MergeProjectsDialog";
import { BenennenDialog } from "./BenennenDialog";
import { ProjectInspector } from "./ProjectInspector";
import { Werkbank } from "./Werkbank";
import { IdeenListe } from "./IdeenListe";
import { AufraeumListe, type AufraeumFilter, type AufraeumSort } from "./AufraeumListe";
import { ideenGruppen, jahresGruppen, zeitGruppen, ideeName, skizzen } from "../../lib/werkbank";
import { deriveStage, projectDisplayName, studioBeatId } from "../../types/studio";
import type { StudioProject, StudioStatus } from "../../types/studio";
import type { Beat } from "../../types/browse";

/** Ideen ohne Aktivität länger als das gelten als "Lange inaktiv" */
const STALE_DAYS = 30;

/** Arbeiten: woran du gerade sitzt. Aufräumen: Lange inaktiv + Kann weg. */
export type StudioView = "work" | "cleanup";
const CLEANUP_SECTIONS: SectionKey[] = ["stale", "discard"];

/** Diese Sektionen stehen in der Projekte-Ansicht als Cover-Regal (Werkbank). */
const SHELF_SECTIONS: SectionKey[] = ["priority", "ready", "exported", "wip"];
const SHELF_HINT: Partial<Record<SectionKey, string>> = {
  priority: "Beats mit viel Potenzial",
  ready:    "bereit zum Hochladen",
  exported: "fertig, Assets unvollständig",
  wip:      "brauchen Feinschliff",
};

/** So viele Ideen zeigt eine Monatsgruppe, bevor „Alle N anzeigen" kommt. */
const IDEEN_LIMIT = 8;

/** So viele Zeilen zeigt ein Jahr im Aufräumen, bevor „Alle N anzeigen" kommt. */
const JAHR_LIMIT = 50;

type SectionKey = StudioStatus | "stale" | "priority";

const SECTION_ORDER: SectionKey[] = ["priority", "ready", "exported", "wip", "idea", "stale", "discard"];
const SECTION_META: Record<SectionKey, { label: string; color: string }> = {
  priority: { label: "Priorität",                         color: C.primary },
  ready:    { label: STUDIO_STATUS_CONFIG.ready.label,    color: STUDIO_STATUS_CONFIG.ready.color },
  exported: { label: STUDIO_STATUS_CONFIG.exported.label, color: STUDIO_STATUS_CONFIG.exported.color },
  wip:      { label: STUDIO_STATUS_CONFIG.wip.label,      color: STUDIO_STATUS_CONFIG.wip.color },
  idea:     { label: STUDIO_STATUS_CONFIG.idea.label,     color: STUDIO_STATUS_CONFIG.idea.color },
  stale:    { label: "Lange inaktiv",                     color: "#8a8a89" },
  discard:  { label: STUDIO_STATUS_CONFIG.discard.label,  color: STUDIO_STATUS_CONFIG.discard.color },
};

const LS_SORT = "beatos_studio_sort";

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
  /** Panel auf/zu — die Studio-Seite macht rechts dafür Platz. */
  onInspectorOpen?: (open: boolean) => void;
  /** Arbeitsliste oder Aufräumen — dieselben Daten, ein Scan. */
  view?: StudioView;
  /** Weitere Knöpfe vor „Neu" (der Assets-Knopf mit Zahl aus der Studio-Seite) */
  extraActions?: React.ReactNode;
}

export function ProjectsPane({ productionPaths, refreshKey, onProjects, onInspectorOpen, view = "work", extraActions }: ProjectsPaneProps) {
  const neuesSample = useNeuesSample();
  const { von: vorlagenVon } = useFlVorlagen();
  const [projects, setProjects] = useState<StudioProject[]>([]);
  /** Der aktuelle Stand — auch in einer Closure aus einem älteren Render. */
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { playBeat, setQueue } = useAudioPlayerContext();
  const { settings } = useSettings();
  const { frage, melde } = useDialog();

  // Filters & view state
  const [search, setSearch] = useState("");
  /** Aufräumen: alles oder nur das Vorgemerkte. */
  const [aufraeumFilter, setAufraeumFilter] = useState<AufraeumFilter>("alle");
  const [aufraeumSort, setAufraeumSort] = useState<AufraeumSort>("neu");
  /** Unter so vielen Minuten Arbeitszeit gilt eine alte Idee als Skizze. */
  const [skizzenGrenze, setSkizzenGrenze] = useState(20);
  const [rootFilter, setRootFilter] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>(loadSort);
  /** Monats- (Ideen) und Jahresgruppen (Aufräumen), die schon ganz aufgeklappt sind. */
  const [ideenOffen, setIdeenOffen] = useState<Set<string>>(new Set());
  /** Mehrfachauswahl (Projektpfade) und der Ankerpunkt für Shift-Klick. */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [inspectorPath, setInspectorPath] = useState<string | null>(null);
  /** Zuletzt in FL geöffnet — bleibt markiert, damit man sieht, woran man sitzt */
  const [inFlPath, setInFlPath] = useState<string | null>(null);
  // Klick daneben — in die Projektliste oder in die Seitenleiste — schliesst
  // den Inspector. Dieselbe Geste wie im Archiv.
  useKlickDaneben(!!inspectorPath, () => setInspectorPath(null));

  // Von außen vorgewählt (Strg+K-Suche): den Inspector dieses Projekts öffnen,
  // sobald der Scan es geliefert hat — einmal, nicht bei jedem Neuladen.
  const location = useLocation();
  const vorwahl = (location.state as { projektPfad?: string } | null)?.projektPfad;
  const vorgewaehlt = useRef<string | null>(null);
  useEffect(() => {
    if (!vorwahl || vorgewaehlt.current === vorwahl) return;
    if (!projects.some(p => p.path === vorwahl)) return;
    vorgewaehlt.current = vorwahl;
    setInspectorPath(vorwahl);
  }, [projects, vorwahl]);
  const [isCreating, setIsCreating] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  /** „Beat benennen" offen für dieses Projekt. Liegt hier und nicht im Panel:
   *  dessen transform würde den Dialog auf die Panelbreite einsperren. */
  const [benennen, setBenennen] = useState<StudioProject | null>(null);

  useEffect(() => { localStorage.setItem(LS_SORT, sortMode); }, [sortMode]);

  const scan = useCallback(async () => {
    if (productionPaths.length === 0) {
      setProjects([]);
      setError("Kein Produktions-Pfad (Einstellungen → Pfade)");
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
      melde(`Speichern fehlgeschlagen: ${String(e)}`);
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

  // Vorlage aus FL/Beat oder eine beliebige FLP („Aus Vorlage"). create_project_folder
  // kopiert sie und benennt sie nach dem Projekt, der alte Name ist damit weg.
  const handleNewProject = async (template: string) => {
    setIsCreating(true);
    try {
      const name = await api.studio.nextProjectName(productionPaths);
      const flp = await api.studio.createProject(newProjectRoot, name, template);
      try { await openPath(flp); }
      catch (e) { melde(`„${name}“ liegt bereit, FL öffnet es nicht: ${String(e)}`); }
      scan();
    } catch (e) {
      melde(`Projekt konnte nicht angelegt werden: ${String(e)}`);
    } finally {
      setIsCreating(false);
    }
  };

  // Vorlage aussuchen: der native Dateidialog startet im Archiv, nimmt aber
  // jede FLP — ein eigener Beat-Picker waere eine zweite Liste, die dasselbe kann.
  const handleNewFromFlp = async () => {
    const quelle = await open({
      multiple: false,
      title: "FLP als Vorlage fuer das neue Projekt waehlen",
      defaultPath: settings.archivePath || newProjectRoot,
      filters: [{ name: "FL Studio Projekt", extensions: ["flp"] }],
    }).catch(() => null);
    if (typeof quelle === "string") handleNewProject(quelle);
  };

  const handleOpenDaw = async (p: StudioProject) => {
    if (!p.newest_flp) return;
    // Aus dem Aufräumen geöffnet: festhalten, sonst macht FL das Projekt
    // „frisch" und es rutscht zu den Ideen, bevor entschieden ist.
    if (sectionOf(p) === "stale" && !p.aufraeumen) handleAufraeumen(p);
    setInFlPath(p.path);
    try { await openPath(p.newest_flp); }
    catch (e) { melde(`FLP konnte nicht geöffnet werden: ${String(e)}`); }
  };

  const handleArchive = (p: StudioProject) => {
    navigate("/create", { state: { sourceFolder: p.path } });
  };

  // Junk-Projekt in den Papierkorb (wiederherstellbar). Rückfrage, dann
  // optimistisch aus der Liste nehmen; die Auswahl/Inspector ggf. lösen.
  const handleTrash = async (p: StudioProject) => {
    const name = projectDisplayName(p);
    const ok = await frage({
      titel: "In den Papierkorb verschieben?",
      text: `„${name}"\n\nDer komplette Projektordner wandert in den Windows-Papierkorb ` +
            `und lässt sich von dort zurückholen:\n${p.path}\n\n` +
            `Die Nummern dahinter rücken nach.`,
      bestaetigen: "In den Papierkorb",
      gefahr: true,
    });
    if (!ok) return;
    try {
      const nichtNachgerueckt = await api.archive.trashSourceFolder(p.path, settings.archivePath);
      setProjects(prev => prev.filter(x => x.path !== p.path));
      if (inspectorPath === p.path) setInspectorPath(null);
      zeigeNachruecken(nichtNachgerueckt);
      scan(); // die Ordner dahinter heißen jetzt anders
    } catch (e) {
      melde(`Löschen fehlgeschlagen: ${String(e)}`);
    }
  };

  // War eigentlich nur eine Melodie: ab nach 06_SAMPLES als „S0012 Titel".
  // Danach EIN Nachrücken für alle, wie beim Papierkorb.
  const handleToSamples = async (targets: StudioProject[]) => {
    const root = samplesOrdner(settings.archivePath);
    if (!root) { melde("Kein Archiv-Ordner (Einstellungen → Pfade)"); return; }
    const n = targets.length;
    if (n === 0) return;
    const namen = targets.slice(0, 8).map(p => `• ${projectDisplayName(p)}`).join("\n");
    const ok = await frage({
      titel: n === 1 ? "Zu den Samples verschieben?" : `${n} Projekte zu den Samples verschieben?`,
      text: `${namen}${n > 8 ? `\n… und ${n - 8} weitere` : ""}\n\n` +
            `Ziel: ${root}\nNotizen und Stern fallen weg. Die Nummern dahinter rücken nach.`,
      bestaetigen: "Verschieben",
    });
    if (!ok) return;

    setSelected(new Set());
    setIsCleaning(true);
    const weg = new Set<string>();
    const fehler: string[] = [];
    for (const p of targets) {
      try {
        await api.studio.moveToSamples(p.path, root, ideeName(p).titel ?? "");
        weg.add(p.path);
      } catch (e) {
        fehler.push(`${projectDisplayName(p)}: ${String(e)}`);
      }
    }
    setProjects(prev => prev.filter(x => !weg.has(x.path)));
    if (inspectorPath && weg.has(inspectorPath)) setInspectorPath(null);
    if (weg.size > 0) {
      try { zeigeNachruecken((await api.studio.closeGaps()).failed); }
      catch (e) { melde(`Nachrücken fehlgeschlagen: ${String(e)}`); }
      scan();
    }
    setIsCleaning(false);
    if (fehler.length > 0) melde(`Nicht verschoben:\n${fehler.join("\n")}`);
    else melde(`${weg.size} ${weg.size === 1 ? "Projekt" : "Projekte"} in Samples`, "erfolg");
  };

  const zeigeNachruecken = (fehler: string[]) => {
    if (fehler.length > 0) {
      melde(`Nicht alle nachgerückt (Projekt in FL offen?):\n${fehler.join("\n")}`);
    }
  };

  // Knopf für Ordner, die im Explorer gelöscht wurden — dort merkt BeatOS nichts.
  const handleCloseGaps = async () => {
    setIsCleaning(true);
    try {
      const r = await api.studio.closeGaps();
      zeigeNachruecken(r.failed);
      if (r.failed.length === 0) {
        melde(r.moved === 0 ? "Keine Lücken"
                            : `${r.moved} ${r.moved === 1 ? "Projekt ist" : "Projekte sind"} nachgerückt.`,
              r.moved === 0 ? "info" : "erfolg");
      }
      if (r.moved > 0) { setInspectorPath(null); scan(); }
    } catch (e) {
      melde(`Nachrücken fehlgeschlagen: ${String(e)}`);
    } finally {
      setIsCleaning(false);
    }
  };

  // Alle „Kann weg"-Ordner auf einmal in den Papierkorb, danach EIN Nachrücken
  // für alle — nicht eins pro Ordner, das wären hunderte Umbenennungen je Stück.
  const handleTrashMarked = async () => {
    const n = discardable.length;
    const namen = discardable.slice(0, 8).map(p => `• ${projectDisplayName(p)}`).join("\n");
    const rest = n > 8 ? `\n… und ${n - 8} weitere` : "";
    const ok = await frage({
      titel: `${n} ${n === 1 ? "Projekt" : "Projekte"} in den Papierkorb?`,
      text: `${namen}${rest}\n\n` +
            `Die kompletten Ordner wandern in den Windows-Papierkorb und lassen sich von dort zurückholen.`,
      bestaetigen: "In den Papierkorb",
      gefahr: true,
    });
    if (!ok) return;

    setIsCleaning(true);
    const weg = new Set<string>();
    const fehler: string[] = [];
    for (const p of discardable) {
      try {
        await api.archive.trashSourceFolder(p.path, settings.archivePath, false);
        weg.add(p.path);
      } catch (e) {
        fehler.push(`${projectDisplayName(p)}: ${String(e)}`);
      }
    }
    setProjects(prev => prev.filter(x => !weg.has(x.path)));
    if (inspectorPath && weg.has(inspectorPath)) setInspectorPath(null);
    if (weg.size > 0) {
      try { zeigeNachruecken((await api.studio.closeGaps()).failed); }
      catch (e) { melde(`Nachrücken fehlgeschlagen: ${String(e)}`); }
      scan();
    }
    setIsCleaning(false);

    if (fehler.length > 0) {
      await frage({
        titel: `${weg.size} im Papierkorb, ${fehler.length} nicht`,
        text: `${fehler.join("\n")}\n\n` +
              `Die übrigen bleiben markiert.`,
        bestaetigen: "Verstanden",
        nurHinweis: true,
      });
    }
  };

  // ── Derivations: filter → counts → group → sort ────────────────────────────

  // Alles außer dem Status-Filter. Die Status-Chips zählen über diese Menge,
  // damit ihre Zahlen zu dem passen, was ein Klick tatsächlich zeigt — vorher
  // zählten sie global weiter und widersprachen der Liste darunter.
  const q = search.trim().toLowerCase();
  // Jedes Projekt gehört in genau eine Sektion. Der Stern schlägt alles: er ist
  // die Merkliste, und die gehört nach oben — "Idee" und "Lange inaktiv" sind
  // beide standardmäßig zugeklappt, ein markiertes Projekt wäre dort weg.
  const sectionOf = (p: StudioProject): SectionKey => {
    // Aussortiert schlägt den Stern: ein vorgemerktes Projekt gehört nach
    // unten, auch wenn es früher mal eine Priorität war.
    if (p.status === "discard") return "discard";
    // Fest im Aufräumen: bleibt dort, egal wie frisch FL das Projekt gemacht hat
    if (p.aufraeumen) return "stale";
    // Seit der Werkbank bleibt ein Stern-Projekt in seinem Regal (vorn, mit
    // Marke); eigene Sektion nur für Ideen mit Stern — die hätten sonst kein Regal.
    if (p.status !== "idea") return p.status;
    if (p.priority) return "priority";
    // „Behalten" im Aufräumen: bleibt eine Idee, auch wenn sie alt ist
    if (!p.kept && daysSince(p.modified_secs) > STALE_DAYS) return "stale";
    return "idea";
  };

  // Arbeiten und Aufräumen sind zwei Listen: ~30 Projekte, an denen du sitzt,
  // gegen ~800, die entschieden werden wollen. Vorher hing beides untereinander.
  const inView = (p: StudioProject) =>
    CLEANUP_SECTIONS.includes(sectionOf(p)) === (view === "cleanup");

  // Regale klappen in der Werkbank selbst zu (gemerkt), gefiltert wird hier nicht.
  const isShelf = (key: SectionKey) => view === "work" && SHELF_SECTIONS.includes(key);

  const preStatus = projects.filter(p => {
    if (!inView(p)) return false;
    if (rootFilter && p.root !== rootFilter) return false;
    if (q) {
      // Songtitel zuerst — danach sucht man, nicht nach "project_187".
      // Notizen zählen mit: „für Artist X" ist genau das, was man später sucht.
      const hay = `${p.song_name ?? ""} ${p.parsed_name} ${p.name} ${p.key ?? ""} ${p.bpm ?? ""} ${p.notes ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Alle vorgemerkten Projekte — unabhängig von Suche und Filtern, sonst räumt
  // die Leiste unten je nach Sucheingabe mal mehr und mal weniger weg.
  const discardable = projects.filter(p => p.status === "discard");

  // Umschalter und Liste zählen dieselbe (gesuchte) Menge.
  const vorgemerkt = preStatus.filter(p => p.status === "discard").length;
  const filtered = view === "cleanup" && aufraeumFilter === "discard";
  const visible = filtered ? preStatus.filter(p => p.status === "discard") : preStatus;

  // B4: „Priorität zuerst" ist raus. Der Modus sortierte nur INNERHALB einer
  // Sektion, die Sektionsreihenfolge liegt aber fest — er tat also sichtbar
  // nichts. Seit es die Sektion „Priorität" ganz oben gibt, ist seine Aufgabe
  // ohnehin erledigt. Ein Modus, der nichts bewirkt, ist schlimmer als keiner.
  const sortFn = (a: StudioProject, b: StudioProject): number => {
    switch (sortMode) {
      // Nach dem Titel ohne „Project_0861 - " davor; ohne Titel ans Ende
      case "name":   return (ideeName(a).titel ?? "￿").localeCompare(ideeName(b).titel ?? "￿", "de");
      case "oldest": return a.modified_secs - b.modified_secs;
      default:       return b.modified_secs - a.modified_secs;
    }
  };

  const sections = SECTION_ORDER
    .map(key => ({
      key,
      meta: SECTION_META[key],
      // Im Regal steht der Stern vorn — er ist die Merkliste
      items: visible.filter(p => sectionOf(p) === key)
        .sort((a, b) => (isShelf(key) ? b.priority - a.priority : 0) || sortFn(a, b)),
    }))
    .filter(s => s.items.length > 0);

  // Ideen in der Projekte-Ansicht: nach Monat/Buchstabe, je Gruppe erst
  // IDEEN_LIMIT Zeilen. Suche zeigt alles — was übrig bleibt, will man sehen.
  const ideen = view === "work" ? sections.find(s => s.key === "idea") : undefined;
  const ideenGezeigt = ideen
    ? ideenGruppen(ideen.items, sortMode === "name").map(g => ({
        key: g.key, label: g.label, total: g.items.length,
        items: q || ideenOffen.has(g.key) ? g.items : g.items.slice(0, IDEEN_LIMIT),
      }))
    : [];

  // Aufräumen: Lange inaktiv und Kann weg in EINER Liste, neueste zuerst, nach
  // Jahr. Vorgemerkte stehen durchgestrichen dazwischen, wo sie hingehören.
  // Nach Zeit: ohne Zeitangabe immer ans Ende, bei gleicher Zeit das Neuere zuerst.
  const nachZeit = (a: StudioProject, b: StudioProject, richtung: 1 | -1) =>
    (a.work_minutes == null ? 1 : 0) - (b.work_minutes == null ? 1 : 0) ||
    richtung * ((a.work_minutes ?? 0) - (b.work_minutes ?? 0)) || b.modified_secs - a.modified_secs;
  const aufraeumSortiert = [...visible].sort((a, b) =>
    aufraeumSort === "alt" ? a.modified_secs - b.modified_secs
    : aufraeumSort === "kurz" ? nachZeit(a, b, 1)
    : aufraeumSort === "lang" ? nachZeit(a, b, -1)
    : b.modified_secs - a.modified_secs);
  const aufraeumGezeigt = view === "cleanup"
    ? (aufraeumSort === "kurz" || aufraeumSort === "lang" ? zeitGruppen : jahresGruppen)(aufraeumSortiert).map(g => ({
        key: `jahr-${g.key}`, label: g.label, total: g.items.length,
        items: q || ideenOffen.has(`jahr-${g.key}`) ? g.items : g.items.slice(0, JAHR_LIMIT),
      }))
    : [];

  // Genau die Zeilen, die dastehen — in der Reihenfolge der Liste. Daraus wird
  // die Hör-Queue, damit „Weiter" das nächste Projekt meint und nicht die
  // Browse-Liste von vorhin.
  const rows = view === "cleanup"
    ? aufraeumGezeigt.flatMap(g => g.items)
    : sections.flatMap(s => s === ideen ? ideenGezeigt.flatMap(g => g.items) : isShelf(s.key) ? s.items : []);

  // „Behalten": raus aus dem Aufräumen. War es vorgemerkt, gilt wieder die
  // automatische Stufe — behalten heißt auch: nicht löschen.
  const handleKeep = async (p: StudioProject) => {
    const vorher = projectsRef.current.find(x => x.path === p.path) ?? p;
    const swap = (to: StudioProject) => setProjects(prev => prev.map(x => x.path === p.path ? to : x));
    swap({ ...vorher, kept: true, aufraeumen: false, status: vorher.status === "discard" ? deriveStage(vorher) : vorher.status });
    try {
      await api.studio.setKept(p.path, true);
      if (vorher.status === "discard") {
        await api.studio.updateProject(p.path, deriveStage(vorher), vorher.priority, vorher.notes);
      }
    } catch (e) {
      swap(vorher);
      melde(`Speichern fehlgeschlagen: ${String(e)}`);
    }
  };

  // „Ins Aufräumen": fest dorthin, unabhängig vom Alter. Hebt Behalten auf.
  const handleAufraeumen = async (p: StudioProject) => {
    const vorher = projectsRef.current.find(x => x.path === p.path) ?? p;
    const swap = (to: StudioProject) => setProjects(prev => prev.map(x => x.path === p.path ? to : x));
    swap({ ...vorher, kept: false, aufraeumen: true });
    try { await api.studio.setAufraeumen(p.path); }
    catch (e) {
      swap(vorher);
      melde(`Speichern fehlgeschlagen: ${String(e)}`);
    }
  };

  // Über die gesuchte Menge — was die Suche ausblendet, wird nicht mit vorgemerkt.
  const skizzenVorschlag = view === "cleanup" ? skizzen(preStatus, skizzenGrenze) : [];

  // „Kann weg" schaltet um: vormerken oder zurück zur automatischen Stufe.
  const handleToss = (p: StudioProject) =>
    patchProject(p, { status: p.status === "discard" ? deriveStage(p) : "discard" });

  // ── Tastatur: dieselbe Belegung wie im Archiv ──────────────────────────────
  // Die Zeilen waren nur mit der Maus erreichbar — anders als im Archiv, wo
  // Pfeiltasten laengst durch die Liste gehen. Hier lief dieselbe Geste ins
  // Leere, obwohl `rows` die sichtbare Liste ohnehin schon flach vorliegen hat.
  //
  // Ein <button> um die Zeile ging nicht: sie traegt selbst Knoepfe (Stern,
  // Papierkorb, Archivieren), verschachtelte Buttons sind ungueltig.
  useEffect(() => {
    const aufTaste = (e: KeyboardEvent) => {
      const ziel = e.target as HTMLElement | null;
      if (ziel && (ziel.isContentEditable || /^(INPUT|TEXTAREA)$/.test(ziel.tagName))) return;
      if (showMerge) return;                     // der Dialog hat eigene Tasten
      if (rows.length === 0) return;

      if (e.key === "Escape") { setInspectorPath(null); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;

      e.preventDefault();                        // sonst scrollt die Seite mit
      const i = rows.findIndex(p => p.path === inspectorPath);
      if (i < 0) { setInspectorPath(rows[0].path); return; }
      const schritt = e.key === "ArrowDown" ? 1 : -1;
      setInspectorPath(rows[Math.min(Math.max(i + schritt, 0), rows.length - 1)].path);
    };
    window.addEventListener("keydown", aufTaste);
    return () => window.removeEventListener("keydown", aufTaste);
  }, [rows, inspectorPath, showMerge]);

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
  const patchSelected = (patch: (p: StudioProject) => Partial<StudioProject>) => {
    setSelected(new Set());
    return patchMany(projectsRef.current.filter(p => selected.has(p.path)), patch);
  };

  const patchMany = async (targets: StudioProject[], patch: (p: StudioProject) => Partial<StudioProject>) => {
    if (targets.length === 0) return;
    const patched = new Map(targets.map(p => [p.path, { ...p, ...patch(p) }]));
    setProjects(prev => prev.map(p => patched.get(p.path) ?? p));

    const fehler: string[] = [];
    for (const p of patched.values()) {
      try {
        await api.studio.updateProject(p.path, p.status, p.priority, p.notes);
      } catch (e) {
        fehler.push(`${projectDisplayName(p)}: ${String(e)}`);
      }
    }
    if (fehler.length > 0) {
      await frage({
        titel: `${fehler.length} von ${targets.length} nicht gespeichert`,
        text: fehler.join("\n"),
        bestaetigen: "Verstanden",
        nurHinweis: true,
      });
      scan();
    }
  };

  const inspectorProject = inspectorPath
    ? projects.find(p => p.path === inspectorPath) ?? null
    : null;
  const inspectorOpen = Boolean(inspectorProject);
  // Das zuletzt gezeigte Projekt, für die 220 ms des Hinausgleitens.
  const [leaving, setLeaving] = useState<StudioProject | null>(null);
  useEffect(() => {
    if (inspectorProject) { setLeaving(inspectorProject); return; }
    const t = setTimeout(() => setLeaving(null), 220);
    return () => clearTimeout(t);
  }, [inspectorProject]);
  const panelProject = inspectorProject ?? leaving;
  // Layout-Effekt: die Seite rückt im selben Frame ein, in dem das Panel
  // erscheint. Mit useEffect fuhr das Panel einen Frame allein los.
  useLayoutEffect(() => { onInspectorOpen?.(inspectorOpen); }, [inspectorOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keine Karte drumherum: die Werkbank steht wie im Mockup direkt auf der Seite.
  return (
    <div>
      {/* Kopf: eine Zeile — Suche groß links, rechts die Knöpfe, „Neues Projekt"
          als Hauptknopf. Vorher zwei Leisten (Zähler + Knöpfe, dann Suche +
          Chips + Sortierung); die Regale sind jetzt die Einteilung. */}
      <div style={{ maxWidth: view === "cleanup" ? 1100 : undefined }}>
      <ProjectsToolbar
        search={search}
        onSearch={setSearch}
        roots={productionPaths}
        rootFilter={rootFilter}
        onRootFilter={setRootFilter}
      >
        <IconButton icon={RefreshCw} onClick={scan} disabled={isLoading} title="Ordner neu einlesen" aria-label="Scan" />
        {/* Selten gebrauchte Ordner-Werkzeuge hinter einem Knopf statt zwei */}
        {view === "cleanup" ? (
          <Dropdown
            label={<><Wrench size={13} strokeWidth={1.75} />Werkzeuge</>}
            align="right" panelWidth={280}
            disabled={productionPaths.length === 0 || isCleaning}
          >
            {close => (<>
              <MenuePunkt icon={ListOrdered} label="Lücken schließen" hint="Nummern lückenlos nachrücken"
                onClick={() => { close(); handleCloseGaps(); }} />
              <MenuePunkt icon={FolderInput} label="Zusammenführen" hint="Ordner vereinen, nach Alter nummerieren"
                onClick={() => { close(); setShowMerge(true); }} />
            </>)}
          </Dropdown>
        ) : (<>
          {extraActions}
          {/* Alles, was etwas Neues anlegt, unter einem Knopf */}
          <Dropdown
            variant="primary"
            label={<><Plus size={14} strokeWidth={2} />Neu</>}
            align="right" panelWidth={300}
            disabled={isCreating}
          >
            {close => (<>
              <MenueGruppe>{nextName ? `Beat · ${nextName}` : "Beat"}</MenueGruppe>
              <VorlagenPunkte vorlagen={productionPaths.length === 0 ? [] : vorlagenVon("beat")} ordner="Beat"
                onPick={v => { close(); handleNewProject(v); }} />
              <MenueGruppe>Sample</MenueGruppe>
              <VorlagenPunkte vorlagen={vorlagenVon("sample")} ordner="Sample"
                onPick={v => { close(); neuesSample(v); }} />
              <MenueGruppe>Künstler</MenueGruppe>
              <VorlagenPunkte vorlagen={vorlagenVon("kuenstler")} ordner="Recording oder FL/Mix-Master"
                onPick={v => { close(); navigate("/kuenstler", { state: { neuerSong: v } }); }} />
              <div style={{ height: 1, background: C.border20, margin: "6px 4px" }} />
              <MenuePunkt icon={CopyPlus} label="Aus Vorlage" hint="Kopie einer vorhandenen FLP"
                disabled={productionPaths.length === 0}
                onClick={() => { close(); handleNewFromFlp(); }} />
              <MenuePunkt icon={FolderPlus} label="Ordner archivieren" hint="Externen Ordner ins Archiv"
                onClick={() => { close(); navigate("/create"); }} />
            </>)}
          </Dropdown>
        </>)}
      </ProjectsToolbar>
      </div>

      {view === "work" && <NeuesZeile onUebernommen={scan} />}
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
          description="Ordner mit mindestens einer FLP"
        />
      )}

      {!error && !isLoading && projects.length > 0 && visible.length === 0 && (
        <EmptyState variant="inline" title="Keine Treffer" />
      )}

      {sections.some(s => isShelf(s.key)) && (
        <Werkbank
          regale={sections.filter(s => isShelf(s.key)).map(s => ({
            key: s.key, label: s.meta.label, color: s.meta.color,
            hint: SHELF_HINT[s.key] ?? "", items: s.items,
          }))}
          inspectorPath={inspectorPath}
          selected={selected}
          onOpen={handleRowClick}
          onPreview={handlePreview}
          onAufraeumen={handleAufraeumen}
        />
      )}

      {ideen && (
        <IdeenListe
          gruppen={ideenGezeigt}
          total={ideen.items.length}
          sortMode={sortMode}
          onSortMode={setSortMode}
          onMore={key => setIdeenOffen(prev => new Set(prev).add(key))}
          inspectorPath={inspectorPath}
          selected={selected}
          onOpen={handleRowClick}
          onPreview={handlePreview}
          onAufraeumen={handleAufraeumen}
        />
      )}

      {view === "cleanup" && projects.length > 0 && (
        <AufraeumListe
          inaktiv={preStatus.length - vorgemerkt}
          vorgemerkt={vorgemerkt}
          filter={aufraeumFilter}
          onFilter={setAufraeumFilter}
          sort={aufraeumSort}
          onSort={setAufraeumSort}
          gruppen={aufraeumGezeigt}
          onMore={key => setIdeenOffen(prev => new Set(prev).add(key))}
          inspectorPath={inspectorPath}
          inFlPath={inFlPath}
          selected={selected}
          onOpen={handleRowClick}
          onPreview={handlePreview}
          onOpenDaw={handleOpenDaw}
          onKeep={handleKeep}
          onToss={handleToss}
          skizzen={skizzenVorschlag}
          skizzenGrenze={skizzenGrenze}
          onSkizzenGrenze={setSkizzenGrenze}
          onSkizzenVormerken={() => patchMany(skizzenVorschlag, () => ({ status: "discard" }))}
        />
      )}

      {/* Solange etwas ausgewählt ist, gehört die Fußleiste der Auswahl — sonst
          stünden zwei Leisten übereinander und man drückt die falsche. */}
      {selected.size > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 16px",
          borderTop: `1px solid ${C.border20}`,
          background: alpha(C.primary, 0.06),
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
          <Button size="sm" icon={AudioLines} onClick={() => handleToSamples(projectsRef.current.filter(p => selected.has(p.path)))}>
            Zu Samples
          </Button>
          <Button
            size="sm"
            onClick={() => patchSelected(p => ({ status: deriveStage(p), priority: 0 }))}
            title="Status und Stern entfernen"
          >
            Zurücksetzen
          </Button>
          <IconButton icon={X} size={28} onClick={() => setSelected(new Set())} title="Auswahl aufheben" />
        </div>
      )}

      {/* Aufräumen — der einzige laute Moment im Studio, und der einzige Weg,
          auf dem mehrere Ordner auf einmal verschwinden. Schwebt unten über
          der Liste, damit man bei 600 Zeilen nicht erst ans Ende scrollt. */}
      {view === "cleanup" && selected.size === 0 && discardable.length > 0 && (
        <div style={{
          position: "sticky", bottom: 16, zIndex: 5,
          display: "flex", alignItems: "center", gap: 12,
          margin: "28px 16px 0", padding: "14px 18px",
          borderRadius: 12,
          background: C.surfaceContainerHigh,
          border: `1px solid ${C.border20}`,
          boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
        }}>
          <Trash2 size={14} color={STUDIO_STATUS_CONFIG.discard.color} strokeWidth={1.75} />
          <div style={{ fontSize: 13, fontWeight: 700, color: C.onSurface }}>
            {discardable.length} {discardable.length === 1 ? "Projekt kann" : "Projekte können"} weg
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

      {/* Inspector — schliesst auch, wenn man daneben klickt. Beim Schliessen
          bleibt das letzte Projekt kurz stehen, damit es hinausgleiten kann. */}
      {panelProject && (
        <ProjectInspector
          project={panelProject}
          closing={!inspectorProject}
          onPatch={patch => patchProject(panelProject, patch)}
          onArchive={() => handleArchive(panelProject)}
          onOpenDaw={() => handleOpenDaw(panelProject)}
          onTrash={() => handleTrash(panelProject)}
          onToSamples={() => handleToSamples([panelProject])}
          onPreview={() => handlePreview(panelProject)}
          onRename={() => setBenennen(panelProject)}
          onClose={() => setInspectorPath(null)}
          onAssetsChanged={scan}
        />
      )}

      {benennen && (
        <BenennenDialog
          project={benennen}
          onClose={() => setBenennen(null)}
          // Die Zeile sofort auf den neuen Pfad umhängen, sonst gleitet das
          // Panel bis zum nächsten Scan hinaus und wieder herein.
          onRenamed={neu => {
            const alt = benennen.path;
            setProjects(prev => prev.map(x => x.path === alt ? { ...x, path: neu } : x));
            if (inspectorPath === alt) setInspectorPath(neu);
            scan();
          }}
        />
      )}
    </div>
  );
}
