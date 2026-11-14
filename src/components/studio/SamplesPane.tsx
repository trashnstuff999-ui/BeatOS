// src/components/studio/SamplesPane.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Studio → Samples: eigene Loops und Ideen in 06_SAMPLES. Eine Karte pro Sample:
// Play, Nummer, Name, Kürzel der Spuren, Tonart, BPM, Alter. Klick öffnet die
// Fokusansicht: die Liste weicht, nur dieses Sample bleibt, seine Spuren
// untereinander auf einem Takt-Raster, mit MIDI als Noten, sonst als Welle,
// rechts Griffe zum Ziehen nach FL. Kein Status, keine DB: der Ordner ist die ganze Wahrheit.
// ═══════════════════════════════════════════════════════════════════════════════

import { createContext, useContext, useState, useEffect, useCallback, useId, useMemo, useRef } from "react";
import { ArrowLeft, AudioLines, ChevronLeft, ChevronRight, GripVertical, Pause, Play, RefreshCw, Square, Volume2, VolumeX } from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { convertFileSrc } from "@tauri-apps/api/core";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { C, alpha, radius } from "../../lib/theme";
import { api } from "../../lib/api";
import { formatRelativeTime } from "../../lib/time";
import { useSettings, samplesOrdner } from "../../contexts/SettingsContext";
import { useDialog } from "../../contexts/DialogContext";
import { useAudioPlayerContext } from "../../contexts/AudioPlayerContext";
import { useFocusRefresh } from "../../hooks/useFocusRefresh";
import { NeuesZeile } from "./NeuesZeile";
import { Button, IconButton, EmptyState, Dropdown, Segmented } from "../ui";
import { useFlVorlagen } from "../../hooks/useFlVorlagen";
import { VorlagenPunkte } from "./VorlagenPunkte";
import { ladeWelle } from "../upload/Zeitleiste";
import { akkorde, inTonart, istSchwarzeTaste, laengeText, notenName, passtTempo, passtTonart, tonartPlus, type Note } from "../../lib/noten";
import { studioBeatId } from "../../types/studio";
import type { StudioProject } from "../../types/studio";
import type { Beat } from "../../types/browse";

type Spur = Awaited<ReturnType<typeof api.studio.sampleSpuren>>[number];

const MONO = "'JetBrains Mono', Consolas, monospace";

/** Stephans Kürzel (wie KUERZEL in parsing.rs), jedes mit fester Farbe. */
const KUERZEL_FARBE: Record<string, string> = {
  GTR: "#fda124", KEYS: "#9492ff", BELL: "#34d399", PAD: "#5cc8ff", SYNTH: "#e879f9", VOX: "#f9a8d4",
  DRUMS: "#facc15", "808": "#f43f5e", FX: "#94a3b8", BASS: "#ff6f6f", LEAD: "#2dd4bf",
};

/** Gelernte Kürzel (Einstellung `sampleKuerzel`) in die Tabelle aufnehmen. Die
 *  Farbe hängt fest am Wort. `-WORT` heißt: gefragt, ist kein Kürzel. */
const LERN_FARBEN = ["#a3e635", "#fb923c", "#38bdf8", "#c084fc", "#f472b6", "#fde047"];
export function lerneKuerzel(liste: string) {
  for (const w of liste.split(",")) {
    if (w && !w.startsWith("-") && !(w in KUERZEL_FARBE)) {
      KUERZEL_FARBE[w] = LERN_FARBEN[[...w].reduce((s, c) => s + c.charCodeAt(0), 0) % LERN_FARBEN.length];
    }
  }
}

/** `GTR ACOUSTIC - BLUE HOUR [150 Bmin]` → Kürzel GTR, Sorte ACOUSTIC. Ohne
 *  Spur-Teil vor dem Titel (`BLUE HOUR [150 Bmin]`, `Name - [Cm 140]`) ist es der Export: null. */
export function spurTeile(name: string): { kuerzel: string | null; sorte: string } | null {
  const m = /^(.+?) - (?!\[)/.exec(name);
  if (!m) return null;
  const [erstes, ...rest] = m[1].split(" ");
  return erstes in KUERZEL_FARBE ? { kuerzel: erstes, sorte: rest.join(" ") } : { kuerzel: null, sorte: m[1] };
}

/** „S0012 Nachtzug" → Nummer und Name. Ohne Namen steht der Export-Titel da. */
export function sampleName(p: StudioProject): { nummer: string | null; titel: string | null } {
  // „S0040 - BLUE HOUR“: der Trenner gehört nicht zum Titel
  const m = /^(S\d+)\s*(?:-\s*)?(.*)$/.exec(p.parsed_name);
  if (!m) return { nummer: null, titel: p.parsed_name };
  return { nummer: m[1], titel: m[2].trim() || p.song_name || null };
}

function toBeat(p: StudioProject): Beat {
  return {
    id: studioBeatId(p.path),
    name: sampleName(p).titel ?? p.name,
    path: p.path,
    bpm: p.bpm, key: p.key,
    status: null, tags: null, favorite: null,
    created_date: null, modified_date: null,
    notes: null, sold_to: null, has_artwork: null, has_video: null,
  };
}

/** „Neues Sample": Name abfragen, Ordner + Sample-Vorlage anlegen, in FL öffnen.
 *  Auch im „Neu"-Menü der Projekte. Gibt zurück, ob etwas angelegt wurde. */
export function useNeuesSample() {
  const { settings } = useSettings();
  const { frage, melde } = useDialog();
  return async (template: string): Promise<boolean> => {
    const root = samplesOrdner(settings.archivePath);
    if (!root) { melde("Kein Archiv-Ordner (Einstellungen → Pfade)"); return false; }
    let name = "";
    const ok = await frage({
      titel: "Neues Sample",
      text: (
        <input
          autoFocus placeholder="Name (optional)"
          onChange={e => { name = e.target.value; }}
          style={{
            width: "100%", padding: "8px 10px", fontSize: 13, fontFamily: "inherit",
            background: C.surfaceContainerLowest, color: C.onSurface, outline: "none",
            border: `1px solid ${C.border20}`, borderRadius: radius.control, boxSizing: "border-box",
          }}
        />
      ),
      bestaetigen: "Anlegen",
    });
    if (!ok) return false;
    try {
      const flp = await api.studio.createSample(root, name, template);
      try { await openPath(flp); }
      catch (e) { melde(`Sample liegt bereit, FL öffnet es nicht: ${String(e)}`); }
      return true;
    } catch (e) {
      melde(`Sample konnte nicht angelegt werden: ${String(e)}`);
      return false;
    }
  };
}

export function SamplesPane() {
  const { settings, updateSettings } = useSettings();
  lerneKuerzel(settings.sampleKuerzel);
  const { frage, melde } = useDialog();
  const { playBeat, setQueue } = useAudioPlayerContext();
  const root = samplesOrdner(settings.archivePath);
  const [samples, setSamples] = useState<StudioProject[]>([]);
  const [spurenVon, setSpurenVon] = useState<Record<string, Spur[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  // Spuren alter Samples ohne vollen Namen: [Ordner, jetzt, danach]
  const [ohneNamen, setOhneNamen] = useState<[string, string, string][]>([]);
  const [kuerzel, setKuerzel] = useState("");
  const [nurMidi, setNurMidi] = useState(false);
  // „Passt zu“: Tonart und Tempo des Beats, an dem gerade gearbeitet wird
  const [zuTonart, setZuTonart] = useState("");
  const [zuTempo, setZuTempo] = useState("");
  // Fokusansicht: Pfad des offenen Samples
  const [fokus, setFokus] = useState<string | null>(null);
  const flaeche = useRef<HTMLElement>(null);
  const zuletzt = useRef<string | null>(null);

  const scan = useCallback(async () => {
    if (!root) return;
    setIsLoading(true);
    try {
      const liste = await api.studio.scanSamples(root);
      setSamples(liste.sort((a, b) => b.modified_secs - a.modified_secs));
      // Die Zeile nennt ihre Spuren schon zugeklappt
      const spuren = await Promise.all(liste.map(p => api.studio.sampleSpuren(p.path).catch(() => [] as Spur[])));
      setSpurenVon(Object.fromEntries(liste.map((p, i) => [p.path, spuren[i]])));
      setOhneNamen(await api.studio.samplesNachziehen(root, false).catch(() => []));
    } catch (e) {
      melde(`Samples konnten nicht gelesen werden: ${String(e)}`);
    } finally {
      setIsLoading(false);
    }
  }, [root, melde]);

  useEffect(() => { scan(); }, [scan]);
  // Nach dem Export in FL zurück: der neue Loop steht schon da
  useFocusRefresh(() => { if (!isLoading) scan(); });

  const neuesSample = useNeuesSample();
  const { von } = useFlVorlagen();
  const vorlagen = von("sample");
  const handleNew = async (vorlage: string) => { if (await neuesSample(vorlage)) scan(); };

  const handleOpen = async (p: StudioProject) => {
    if (!p.newest_flp) return;
    try { await openPath(p.newest_flp); }
    catch (e) { melde(`FLP konnte nicht geöffnet werden: ${String(e)}`); }
  };

  const nachziehen = async () => {
    const ok = await frage({
      titel: `${ohneNamen.length} ${ohneNamen.length === 1 ? "Spur" : "Spuren"} benennen`,
      text: (
        <div style={{ maxHeight: 360, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
          {[...new Set(ohneNamen.map(z => z[0]))].map(ordner => (
            <div key={ordner}>
              <div style={{ fontWeight: 700, color: C.onSurface, paddingBottom: 4 }}>{ordner}</div>
              {ohneNamen.filter(z => z[0] === ordner).map(([, alt, neu]) => (
                <div key={alt} style={{ padding: "2px 0", overflowWrap: "anywhere" }}>
                  <span style={{ color: C.onSecondaryFixedVar }}>{alt}</span>
                  <span style={{ color: C.primary }}> → </span>
                  <span style={{ color: C.onSurface }}>{neu}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ),
      bestaetigen: "Umbenennen",
    });
    if (!ok || !root) return;
    try {
      const fertig = await api.studio.samplesNachziehen(root, true);
      if (fertig.length < ohneNamen.length) melde(`${ohneNamen.length - fertig.length} Spuren nicht umbenannt`);
    } catch (e) {
      melde(`Spuren konnten nicht umbenannt werden: ${String(e)}`);
    }
    scan();
  };

  const handlePreview = (p: StudioProject) => {
    setQueue(samples.filter(x => x.has_mp3 || x.has_wav).map(toBeat));
    playBeat(toBeat(p));
  };

  // Beat daraus machen: Projekt aus der Beat-Vorlage, in FL öffnen
  const handleBeat = async (p: StudioProject) => {
    const vorlage = von("beat")[0];
    if (!vorlage) { melde("Keine Beat-Vorlage in 01_TEMPLATES/FL/Beat"); return; }
    try {
      const flp = await api.studio.beatAusSample(p.path, vorlage.pfad);
      try { await openPath(flp); }
      catch (e) { melde(`Projekt liegt bereit, FL öffnet es nicht: ${String(e)}`); }
    } catch (e) {
      melde(String(e));
    }
  };

  // Kürzel lernen: erstes Wort einer voll benannten Spur, das noch keins ist. Einmal fragen.
  const gefragt = settings.sampleKuerzel.split(",").filter(Boolean);
  const neuesWort = Object.values(spurenVon).flat()
    .map(s => { const t = spurTeile(s.name); return t && !t.kuerzel ? t.sorte.split(" ")[0] : ""; })
    .find(w => /^[A-ZÄÖÜ0-9]{2,}$/.test(w) && !gefragt.includes(`-${w}`));
  const merke = (wort: string, istKuerzel: boolean) => {
    updateSettings({ sampleKuerzel: [...gefragt, istKuerzel ? wort : `-${wort}`].join(",") });
    // ponytail: wartet blind aufs Speichern, dann zeigt „ohne vollen Namen“ die Spuren mit dem Kürzel hinten
    if (istKuerzel) setTimeout(scan, 600);
  };

  // Nur Kürzel anbieten, die es in den Samples gibt
  const hat = (p: StudioProject, k: string) => (spurenVon[p.path] ?? []).some(s => spurTeile(s.name)?.kuerzel === k);
  const vorhanden = Object.keys(KUERZEL_FARBE).filter(k => samples.some(p => hat(p, k)));
  const gezeigt = samples.filter(p =>
    (!kuerzel || hat(p, kuerzel)) && (!nurMidi || (spurenVon[p.path] ?? []).some(s => s.midi))
    && (!zuTonart.trim() || (!!p.key && passtTonart(p.key, zuTonart)))
    && (!Number(zuTempo) || (p.bpm != null && passtTempo(p.bpm, Number(zuTempo)))));
  const feld: React.CSSProperties = {
    padding: "5px 8px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
    background: C.surfaceContainerLowest, color: C.onSurface, border: `1px solid ${C.border30}`, borderRadius: radius.control,
  };

  // Ein umbenanntes oder gelöschtes Sample fällt von selbst zurück in die Liste
  const stelle = gezeigt.findIndex(p => p.path === fokus);
  const offen = stelle >= 0 ? gezeigt[stelle] : samples.find(p => p.path === fokus);
  useEffect(() => {
    if (!offen) return;
    const taste = (e: KeyboardEvent) => { if (e.key === "Escape") setFokus(null); };
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, [offen]);
  // Hinein: an den Anfang der Fläche. Zurück: dorthin, wo das Sample in der Liste steht.
  useEffect(() => {
    if (offen) { zuletzt.current = offen.path; flaeche.current?.scrollIntoView({ block: "nearest" }); }
    else if (zuletzt.current) {
      document.getElementById(`sample-${studioBeatId(zuletzt.current)}`)?.scrollIntoView({ block: "center" });
      zuletzt.current = null;
    }
  }, [offen?.path]); // eslint-disable-line react-hooks/exhaustive-deps

  const rahmen: React.CSSProperties = { margin: "0 16px", padding: 24, borderRadius: 22, border: `1px solid ${C.border30}`, background: C.surfaceContainerLow, marginTop: 8 };
  if (offen) {
    return (
      <section ref={flaeche} aria-label="Samples" style={rahmen}>
        <SampleFokus
          key={offen.path} sample={offen} spuren={spurenVon[offen.path] ?? []}
          stand={stelle >= 0 ? `${stelle + 1} von ${gezeigt.length}` : ""}
          onZurueck={() => setFokus(null)}
          onVor={stelle > 0 ? () => setFokus(gezeigt[stelle - 1].path) : undefined}
          onNach={stelle >= 0 && stelle < gezeigt.length - 1 ? () => setFokus(gezeigt[stelle + 1].path) : undefined}
          onOpen={() => handleOpen(offen)} onPreview={() => handlePreview(offen)} onBeat={() => handleBeat(offen)}
        />
      </section>
    );
  }

  return (
    <section ref={flaeche} aria-label="Samples" style={rahmen}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", paddingBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: C.onSurface }}>Samples</h2>
        <span style={{ fontSize: 20, fontWeight: 700, color: C.onSurfaceVariant }}>{samples.length}</span>
        <span title={root} style={{ fontSize: 14, color: C.onSecondaryFixedVar }}>06_SAMPLES</span>
        <div style={{ flex: 1 }} />
        <Button size="sm" variant="ghost" icon={RefreshCw} onClick={scan} loading={isLoading} title="Ordner neu einlesen">
          Scan
        </Button>
        <Dropdown
          variant="primary" align="right" panelWidth={260} disabled={!root}
          label={<><AudioLines size={14} strokeWidth={2} />Neues Sample</>}
        >
          {close => <VorlagenPunkte vorlagen={vorlagen} ordner="Sample" onPick={v => { close(); handleNew(v); }} />}
        </Dropdown>
      </div>

      {root && <NeuesZeile nurSamples onUebernommen={scan} />}
      {ohneNamen.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", fontSize: 13, color: C.onSurfaceVariant }}>
          <span>{ohneNamen.length} {ohneNamen.length === 1 ? "Spur" : "Spuren"} ohne vollen Namen</span>
          <Button size="sm" variant="secondary" onClick={nachziehen}>Ansehen</Button>
        </div>
      )}
      {neuesWort && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", fontSize: 13, color: C.onSurfaceVariant }}>
          <span>Neues Kürzel: <b style={{ fontFamily: MONO, color: C.onSurface }}>{neuesWort}</b></span>
          <Button size="sm" variant="secondary" onClick={() => merke(neuesWort, true)}>Merken</Button>
          <Button size="sm" variant="ghost" onClick={() => merke(neuesWort, false)}>Kein Kürzel</Button>
        </div>
      )}
      {!root && <EmptyState variant="inline" title="Kein Archiv-Ordner" description="Einstellungen → Pfade" />}
      {root && !isLoading && samples.length === 0 && (
        <EmptyState variant="inline" icon={AudioLines} title="Noch keine Samples" />
      )}

      {samples.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", paddingTop: 8 }}>
          {vorhanden.length > 0 && <Segmented
            label="Kürzel" value={kuerzel} onChange={setKuerzel}
            options={[{ value: "", label: "Alle" }, ...vorhanden.map(k => ({ value: k, label: k, color: KUERZEL_FARBE[k] }))]}
          />}
          <Button size="sm" variant={nurMidi ? "secondary" : "ghost"} aria-pressed={nurMidi} onClick={() => setNurMidi(m => !m)}>
            Mit MIDI
          </Button>
          <span style={{ fontSize: 13, color: C.onSurfaceVariant, paddingLeft: 8 }}>Passt zu</span>
          <input
            value={zuTonart} onChange={e => setZuTonart(e.target.value)} placeholder="Tonart" aria-label="Tonart des Beats"
            title="Gleiche Tonart oder Paralleltonart" style={{ ...feld, width: 84 }}
          />
          <input
            value={zuTempo} onChange={e => setZuTempo(e.target.value)} placeholder="BPM" aria-label="Tempo des Beats" inputMode="numeric"
            title="Gleiches, halbes oder doppeltes Tempo" style={{ ...feld, width: 64 }}
          />
          {gezeigt.length < samples.length && (
            <span style={{ fontSize: 13, color: C.onSecondaryFixedVar }}>{gezeigt.length} von {samples.length}</span>
          )}
        </div>
      )}

      <div style={{ paddingTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
        {gezeigt.map((p, i) => (
          <SampleZeile key={p.path} index={i} sample={p} spuren={spurenVon[p.path] ?? []} onFokus={() => setFokus(p.path)} onOpen={() => handleOpen(p)} onPreview={() => handlePreview(p)} />
        ))}
      </div>
    </section>
  );
}

/** Kürzel als farbige Marke, in der Zeile mit Anzahl, in der Spur ohne. */
function KuerzelMarke({ kuerzel, anzahl = 1 }: { kuerzel: string; anzahl?: number }) {
  const farbe = KUERZEL_FARBE[kuerzel];
  return (
    <span style={{
      fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "3px 7px", borderRadius: 6, whiteSpace: "nowrap",
      color: farbe, background: alpha(farbe, 0.14), border: `1px solid ${alpha(farbe, 0.35)}`,
    }}>
      {kuerzel}{anzahl > 1 && <span style={{ opacity: 0.75, marginLeft: 4 }}>×{anzahl}</span>}
    </span>
  );
}

function Wert({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 13, fontWeight: 700, padding: "3px 8px", borderRadius: 6, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
      color: C.onSurface, background: C.surfaceContainerLowest, border: `1px solid ${C.border20}`,
    }}>
      {children}
    </span>
  );
}

/** Kürzel der Spuren mit Anzahl und die Zahl der MIDIs: was im Sample steckt. */
function Inhalt({ spuren }: { spuren: Spur[] }) {
  const anzahl = new Map<string, number>();
  for (const s of spuren) {
    const k = spurTeile(s.name)?.kuerzel;
    if (k) anzahl.set(k, (anzahl.get(k) ?? 0) + 1);
  }
  const midis = spuren.filter(s => s.midi).length;
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
      {[...anzahl].map(([k, n]) => <KuerzelMarke key={k} kuerzel={k} anzahl={n} />)}
      {midis > 0 && <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.onSurfaceVariant, whiteSpace: "nowrap" }}>{midis} MIDI</span>}
    </span>
  );
}

/** Play-Knopf eines Samples: spielt den Export, hält ihn an, setzt ihn fort. */
function SamplePlay({ sample: p, groesse, onPreview }: { sample: StudioProject; groesse: number; onPreview: () => void }) {
  const { currentBeat, isPlaying, togglePlay } = useAudioPlayerContext();
  const canPreview = p.has_mp3 || p.has_wav;
  const geladen = currentBeat?.id === studioBeatId(p.path);
  const spielt = geladen && isPlaying;
  const icon = Math.round(groesse * 0.36);
  return (
    <button
      className="sw-zp"
      onClick={() => { if (geladen) togglePlay(); else if (canPreview) onPreview(); }}
      disabled={!canPreview}
      aria-label={spielt ? "Pause" : canPreview ? "Export anhören" : "Noch kein Export"}
      title={spielt ? "Pause" : canPreview ? "Export anhören" : "Kein Audio-Export im Ordner"}
      style={{
        flex: `0 0 ${groesse}px`, width: groesse, height: groesse, borderRadius: "50%", border: "none",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: spielt ? C.mint : canPreview ? alpha(C.mint, 0.14) : "transparent",
        color: spielt ? "#06281d" : canPreview ? C.mint : C.surfaceContainerHighest,
        cursor: canPreview ? "pointer" : "default",
      }}
    >
      {spielt
        ? <Pause size={icon} fill="currentColor" strokeWidth={1.5} />
        : <Play size={icon} fill="currentColor" strokeWidth={1.5} style={{ marginLeft: 1 }} />}
    </button>
  );
}

/** Fokusansicht: nur dieses Sample. Zurück zur Liste (auch Esc), Pfeile zum Nachbarn. */
function SampleFokus({ sample: p, spuren, stand, onZurueck, onVor, onNach, onOpen, onPreview, onBeat }: {
  sample: StudioProject;
  spuren: Spur[];
  /** „3 von 42“ in der gefilterten Liste */
  stand: string;
  onZurueck: () => void;
  onVor?: () => void;
  onNach?: () => void;
  onOpen: () => void;
  onPreview: () => void;
  onBeat: () => Promise<void>;
}) {
  const { nummer, titel } = sampleName(p);
  const [beatLaeuft, setBeatLaeuft] = useState(false);
  return (
    <div className="sw-fokus">
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 18 }}>
        <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={onZurueck} title="Zurück zur Liste (Esc)">Alle Samples</Button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: C.onSecondaryFixedVar, fontVariantNumeric: "tabular-nums", paddingRight: 4 }}>{stand}</span>
        <IconButton icon={ChevronLeft} onClick={onVor} disabled={!onVor} title="Voriges Sample" aria-label="Voriges Sample" />
        <IconButton icon={ChevronRight} onClick={onNach} disabled={!onNach} title="Nächstes Sample" aria-label="Nächstes Sample" />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", paddingBottom: 18 }}>
        <SamplePlay sample={p} groesse={52} onPreview={onPreview} />
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <div style={{ fontFamily: MONO, fontSize: 13, color: C.primary }}>{nummer ?? ""}</div>
          <h2 style={{
            margin: 0, fontSize: 28, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            fontWeight: 700, color: titel ? C.onSurface : C.onSecondaryFixedVar,
          }}>
            {titel ?? "ohne Namen"}
          </h2>
        </div>
        <Inhalt spuren={spuren} />
        <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {p.key && <Wert>{p.key}</Wert>}
          {p.bpm != null && <Wert>{p.bpm}<span style={{ fontSize: 11, fontWeight: 500, color: C.onSecondaryFixedVar, marginLeft: 3 }}>BPM</span></Wert>}
        </span>
        <Button size="sm" variant="secondary" onClick={onOpen} disabled={!p.newest_flp} title="In FL öffnen">FL</Button>
        <Button size="sm" variant="primary" loading={beatLaeuft} disabled={beatLaeuft}
          title="Neues Projekt aus der Beat-Vorlage, Spuren liegen in Audio"
          onClick={() => { setBeatLaeuft(true); void onBeat().finally(() => setBeatLaeuft(false)); }}>
          Beat daraus machen
        </Button>
      </div>
      <Spuren sample={p} spuren={spuren} />
    </div>
  );
}

function SampleZeile({ index, sample: p, spuren, onFokus, onOpen, onPreview }: {
  index: number;
  sample: StudioProject;
  spuren: Spur[];
  onFokus: () => void;
  onOpen: () => void;
  onPreview: () => void;
}) {
  const { nummer, titel } = sampleName(p);

  return (
    <div id={`sample-${studioBeatId(p.path)}`} style={{ borderRadius: 14, overflow: "hidden", background: C.surfaceContainer, border: `1px solid ${C.border30}` }}>
      <div className="sw-zl" style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 10px 0 16px", "--leiste": "57px", "--i": Math.min(index, 20) } as React.CSSProperties}>
        <SamplePlay sample={p} groesse={36} onPreview={onPreview} />
        <button
          className="sw-zb"
          onClick={onFokus}
          title="Spuren zeigen"
          style={{
            flex: 1, minWidth: 0, minHeight: 60, display: "flex", alignItems: "center", gap: 14,
            padding: "0 8px 0 16px", border: "none", borderRadius: 12, textAlign: "left", color: "inherit",
            cursor: "pointer", userSelect: "none", background: "transparent",
          }}
        >
          <span className="sw-nr" style={{ flex: "0 0 48px", fontFamily: MONO, fontSize: 13, color: C.onSecondaryFixedVar }}>
            {nummer ?? ""}
          </span>
          <span style={{
            flex: "1 1 auto", minWidth: 0, fontSize: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            fontWeight: titel ? 700 : 500, color: titel ? C.onSurface : C.onSecondaryFixedVar,
          }}>
            {titel ?? "ohne Namen"}
          </span>
          <Inhalt spuren={spuren} />
          <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            {p.key && <Wert>{p.key}</Wert>}
            {p.bpm != null && <Wert>{p.bpm}<span style={{ fontSize: 11, fontWeight: 500, color: C.onSecondaryFixedVar, marginLeft: 3 }}>BPM</span></Wert>}
          </span>
          <span title={p.modified_date ?? undefined} style={{ flex: "0 0 96px", fontSize: 13, color: C.onSecondaryFixedVar, textAlign: "right", whiteSpace: "nowrap" }}>
            {formatRelativeTime(p.modified_secs)}
          </span>
          <ChevronRight size={16} style={{ flexShrink: 0, color: C.onSecondaryFixedVar }} />
        </button>
        <Button size="sm" variant="ghost" onClick={onOpen} disabled={!p.newest_flp} title="In FL öffnen">FL</Button>
      </div>
    </div>
  );
}

/** Alle Spuren zusammen: eigene Wiedergabe über Web Audio neben dem Player,
 *  weil nur so alle Spuren auf das Sample genau gleichzeitig starten. */
interface Mix {
  an: boolean;
  stumm: Set<string>;
  hat: (audio: string) => boolean;
  sekunden: () => number;
  dauer: (audio: string) => number;
  seek: (sekunden: number) => void;
  stummSchalten: (audio: string) => void;
  umschalten: () => void;
}
const MixKontext = createContext<Mix | null>(null);

function useMix(pfade: string[], stand: number): Mix {
  const { isPlaying, togglePlay, volume, isMuted } = useAudioPlayerContext();
  const { melde } = useDialog();
  const [an, setAn] = useState(false);
  const [stumm, setStumm] = useState<Set<string>>(new Set());
  const r = useRef<{
    ctx: AudioContext; master: GainNode; t0: number;
    puffer: Map<string, AudioBuffer>; regler: Map<string, GainNode>; quellen: AudioBufferSourceNode[];
  } | null>(null);
  const laut = isMuted ? 0 : volume;

  const still = () => { r.current?.quellen.forEach(q => { q.onended = null; q.stop(); }); };
  const stopp = useCallback(() => {
    still();
    void r.current?.ctx.close();
    r.current = null;
    setAn(false);
  }, []);

  const seek = (sekunden: number) => {
    const m = r.current;
    if (!m || m.puffer.size === 0) return;
    still();
    const ende = Math.max(...[...m.puffer.values()].map(b => b.duration));
    const sek = Math.max(0, Math.min(sekunden, ende - 0.05));
    m.quellen = [...m.puffer].flatMap(([pfad, b]) => {
      if (sek >= b.duration) return [];
      const q = m.ctx.createBufferSource();
      q.buffer = b;
      q.connect(m.regler.get(pfad)!);
      q.start(0, sek);
      if (b.duration === ende) q.onended = stopp;
      return [q];
    });
    m.t0 = m.ctx.currentTime - sek;
  };

  const start = async () => {
    if (isPlaying) togglePlay();
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = laut;
    master.connect(ctx.destination);
    const m = { ctx, master, t0: 0, puffer: new Map<string, AudioBuffer>(), regler: new Map<string, GainNode>(), quellen: [] };
    r.current = m;
    setAn(true);
    try {
      // ponytail: dekodiert bei jedem Start neu, merken wenn es bei langen Spuren stört
      const puffer = await Promise.all(pfade.map(async p =>
        ctx.decodeAudioData(await (await fetch(`${convertFileSrc(p.replace(/\\/g, "/"))}?v=${stand}`)).arrayBuffer())));
      if (r.current !== m) return; // inzwischen gestoppt
      pfade.forEach((p, i) => {
        const g = ctx.createGain();
        g.gain.value = stumm.has(p) ? 0 : 1;
        g.connect(master);
        m.regler.set(p, g);
        m.puffer.set(p, puffer[i]);
      });
      seek(0);
    } catch (e) {
      if (r.current === m) stopp();
      melde(`Spuren konnten nicht geladen werden: ${String(e)}`);
    }
  };

  // Der Player übernimmt: der Mix hört auf. Anderes Sample oder Ansicht zu: auch.
  useEffect(() => { if (isPlaying) stopp(); }, [isPlaying, stopp]);
  useEffect(() => stopp, [pfade.join("|"), stopp]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (r.current) r.current.master.gain.value = laut; }, [laut]);

  return {
    an, stumm,
    hat: audio => pfade.includes(audio),
    sekunden: () => (r.current?.quellen.length ? r.current.ctx.currentTime - r.current.t0 : 0),
    dauer: audio => r.current?.puffer.get(audio)?.duration ?? 0,
    seek,
    stummSchalten: audio => {
      const neu = new Set(stumm);
      if (!neu.delete(audio)) neu.add(audio);
      setStumm(neu);
      const g = r.current?.regler.get(audio);
      if (g) g.gain.value = neu.has(audio) ? 0 : 1;
    },
    umschalten: () => { if (an) stopp(); else void start(); },
  };
}

/** Was eine Spur vom Abspielen wissen muss. Läuft der Mix, läuft jede seiner
 *  Spuren mit, sonst höchstens die eine im Player. */
function useSpurPlayer(audio: string | null) {
  const p = useAudioPlayerContext();
  const mix = useContext(MixKontext);
  if (mix?.an && audio && mix.hat(audio)) {
    return { imMix: true, laeuft: true, spielt: true, sekunden: mix.sekunden, dauer: () => mix.dauer(audio), seek: mix.seek, weiter: () => {} };
  }
  const laeuft = !!audio && p.currentBeat?.id === studioBeatId(audio);
  return {
    imMix: false, laeuft, spielt: laeuft && p.isPlaying, sekunden: p.getCurrentSeconds, dauer: p.getDurationSeconds,
    seek: p.seekSeconds, weiter: () => { if (!p.isPlaying) p.togglePlay(); },
  };
}
type SpurPlayer = ReturnType<typeof useSpurPlayer>;

/** Abspielkopf und Färbung des Gespielten: requestAnimationFrame setzt beides
 *  direkt am SVG, React rendert dabei nicht mit. `stelle` liefert 0..1. */
function useAbspielkopf(laeuft: boolean, breite: number, stelle: () => number) {
  const kopf = useRef<SVGLineElement>(null);
  const gespielt = useRef<SVGRectElement>(null);
  const lies = useRef(stelle);
  lies.current = stelle;
  useEffect(() => {
    if (!laeuft || !breite) return;
    let raf = 0;
    const schritt = () => {
      const x = String(Math.max(0, Math.min(lies.current(), 1)) * breite);
      kopf.current?.setAttribute("x1", x);
      kopf.current?.setAttribute("x2", x);
      gespielt.current?.setAttribute("width", x);
      raf = requestAnimationFrame(schritt);
    };
    raf = requestAnimationFrame(schritt);
    const g = gespielt.current;
    return () => { cancelAnimationFrame(raf); g?.setAttribute("width", "0"); };
  }, [laeuft, breite]);
  return { kopf, gespielt };
}

type Midi = Awaited<ReturnType<typeof api.studio.midiNoten>>;

/** Breite in Ticks, auf ganze Takte aufgerundet wie die Playlist in FL. Ohne Raster 0 Takte. */
function midiMasse(noten: Note[], ppq: number) {
  const ende = noten.reduce((m, [s, l]) => Math.max(m, s + l), 0);
  const takt = ppq * 4;
  const breite = takt ? Math.ceil(ende / takt) * takt : ende;
  return { breite, takte: takt ? breite / takt : 0 };
}

/** Sichtbare Tonhöhen, `oben` ist die höchste Zeile. Mindestens eine Oktave,
 *  sonst wird eine einzelne Tonhöhe zum Klotz. */
function tonumfang(noten: Note[]) {
  const tief = noten.reduce((m, n) => Math.min(m, n[2]), 127);
  const hoch = noten.reduce((m, n) => Math.max(m, n[2]), 0);
  const zeilen = Math.max(hoch - tief + 1, 12);
  return { zeilen, oben: hoch + Math.floor((zeilen - (hoch - tief + 1)) / 2) };
}

/** Ziehen wie im Player: Drücken spielt ab der Stelle, Ziehen fährt den
 *  Abspielkopf mit. `sekBei` rechnet die Stelle (0..1) in Sekunden um. */
function useZiehen(sp: SpurPlayer, sekBei: (stelle: number) => number, onPlay: (sekunden: number) => void) {
  const sek = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return sekBei(Math.max(0, Math.min((e.clientX - r.left) / r.width, 1)));
  };
  return {
    onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      if (sp.laeuft) { sp.seek(sek(e)); sp.weiter(); }
      else onPlay(sek(e));
    },
    onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => {
      if (e.buttons === 1 && sp.laeuft) sp.seek(sek(e));
    },
  };
}

/** Noten wie in FL: Zeit nach rechts, Tonhöhe nach oben. Das Takt-Raster
 *  zeichnet die Bahn. Läuft die Spur, fährt der Abspielkopf mit und färbt
 *  Gespieltes um. Klick spielt ab dieser Stelle. Groß: schwarze Tasten
 *  abgesetzt, Name und Länge beim Überfahren, Töne außerhalb der Tonart umrandet. */
function MidiNoten({ noten, ppq, tempo, audio, farbe, gross, tonart, auswahl, onPlay }: {
  noten: Note[];
  ppq: number;
  /** Aus der MIDI, sonst aus dem Sample-Namen */
  tempo: number | null;
  audio: string | null;
  farbe: string;
  gross: boolean;
  tonart: string | null;
  /** Markierte Takte, beide Enden eingeschlossen */
  auswahl: [number, number] | null;
  onPlay: (sekunden: number) => void;
}) {
  const sp = useSpurPlayer(audio);
  const { laeuft } = sp;
  const clip = useId();
  const { breite } = midiMasse(noten, ppq);
  const takt = ppq * 4;
  // Sekunden je Tick. Ohne Tempo: Länge der laufenden Datei auf die Breite verteilt.
  const sekProTick = () => (ppq && tempo ? 60 / tempo / ppq : laeuft && breite ? sp.dauer() / breite : 0);
  const { kopf, gespielt } = useAbspielkopf(laeuft, breite, () => {
    const spt = sekProTick();
    return spt > 0 ? sp.sekunden() / spt / breite : 0;
  });
  const ziehen = useZiehen(sp, stelle => stelle * breite * sekProTick(), onPlay);

  if (noten.length === 0 || !breite) return null;

  const { zeilen, oben } = tonumfang(noten);
  const balken = (f: string, lesbar: boolean) => noten.map(([s, l, t], i) => (
    <rect key={i} x={s} y={oben - t + 0.09} width={Math.max(l, breite / 500)} height={0.82} fill={f}
      stroke={lesbar && !inTonart(t, tonart) ? C.onSurface : undefined} strokeWidth={1.5} vectorEffect="non-scaling-stroke">
      {lesbar && <title>{[notenName(t), laengeText(l, ppq)].filter(Boolean).join(" · ")}</title>}
    </rect>
  ));

  return (
    <svg
      viewBox={`0 0 ${breite} ${zeilen}`} preserveAspectRatio="none" role="img"
      aria-label={`${noten.length} Noten`} {...(audio ? ziehen : {})}
      style={{ display: "block", width: "100%", height: "100%", cursor: audio ? "pointer" : "default", touchAction: "none" }}
    >
      {audio && !gross && <title>Anhören, ziehen zum Spulen</title>}
      <defs><clipPath id={clip}><rect ref={gespielt} x={0} y={0} width={0} height={zeilen} /></clipPath></defs>
      {gross && Array.from({ length: zeilen }, (_, r) => istSchwarzeTaste(oben - r) && (
        <rect key={r} x={0} y={r} width={breite} height={1} fill={alpha(C.onSurface, 0.05)} />
      ))}
      {gross && auswahl && takt > 0 && (
        <rect x={auswahl[0] * takt} y={0} width={(auswahl[1] - auswahl[0] + 1) * takt} height={zeilen} fill={alpha(C.primary, 0.14)} />
      )}
      {balken(alpha(farbe, laeuft ? 0.55 : 0.9), gross)}
      <g clipPath={`url(#${clip})`} pointerEvents="none">{balken(C.mint, false)}</g>
      <line ref={kopf} x1={0} x2={0} y1={0} y2={zeilen} stroke={C.onSurface} strokeWidth={2}
        vectorEffect="non-scaling-stroke" opacity={laeuft ? 1 : 0} />
    </svg>
  );
}

/** Spur ohne MIDI: die Welle der Datei, in der Farbe des Kürzels. Klick spielt ab dieser Stelle. */
function Welle({ audio, stand, bpm, farbe, onTakte, onPlay }: {
  audio: string;
  /** Änderungszeit des Samples: ein neuer Export wird neu gerechnet */
  stand: number;
  bpm: number | null;
  farbe: string;
  onTakte: (takte: number) => void;
  onPlay: (sekunden: number) => void;
}) {
  const sp = useSpurPlayer(audio);
  const { laeuft } = sp;
  const [welle, setWelle] = useState<Awaited<ReturnType<typeof ladeWelle>> | null>(null);
  const clip = useId();
  useEffect(() => {
    let weg = false;
    ladeWelle(audio, stand).then(w => { if (!weg) setWelle(w); }).catch(() => {});
    return () => { weg = true; };
  }, [audio, stand]);

  const dauer = welle?.dauer ?? 0;
  const takte = bpm ? dauer * bpm / 240 : 0;
  useEffect(() => { onTakte(takte); }, [takte]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = welle?.spitzen.length ?? 0;
  const { kopf, gespielt } = useAbspielkopf(laeuft, n, () => (dauer ? sp.sekunden() / dauer : 0));
  const ziehen = useZiehen(sp, stelle => stelle * dauer, onPlay);

  if (!welle) return null;

  const balken = (f: string) => welle.spitzen.map((v, i) => {
    const h = Math.max(v * 0.9, 0.03);
    return <rect key={i} x={i + 0.18} y={0.5 - h / 2} width={0.64} height={h} fill={f} />;
  });

  return (
    <svg viewBox={`0 0 ${n} 1`} preserveAspectRatio="none" role="img" aria-label="Welle" {...ziehen}
      style={{ display: "block", width: "100%", height: "100%", cursor: "pointer", touchAction: "none" }}>
      <title>Anhören, ziehen zum Spulen</title>
      <defs><clipPath id={clip}><rect ref={gespielt} x={0} y={0} width={0} height={1} /></clipPath></defs>
      {balken(alpha(farbe, laeuft ? 0.5 : 0.85))}
      <g clipPath={`url(#${clip})`}>{balken(C.mint)}</g>
      <line ref={kopf} x1={0} x2={0} y1={0} y2={1} stroke={C.onSurface} strokeWidth={2}
        vectorEffect="non-scaling-stroke" opacity={laeuft ? 1 : 0} />
    </svg>
  );
}

/** Griff zum Ziehen einer Datei nach FL. Zieht erst nach ein paar Pixeln, ein Klick tut nichts. */
function Griff({ pfad, text, farbe, betont = false, hinweis }: {
  pfad: string; text: string; farbe: string;
  /** Zieht etwas anderes als die Datei im Ordner (versetzt, Ausschnitt) */
  betont?: boolean;
  hinweis?: string;
}) {
  const { melde } = useDialog();
  const [wach, setWach] = useState(false);
  const start = (e: React.PointerEvent) => {
    const { clientX: x0, clientY: y0 } = e;
    const weg = () => { window.removeEventListener("pointermove", bewegt); window.removeEventListener("pointerup", weg); };
    const bewegt = (m: PointerEvent) => {
      if (Math.hypot(m.clientX - x0, m.clientY - y0) < 4) return;
      weg();
      startDrag({ item: [pfad], icon: ziehBild(text) }).catch(err => melde(`Ziehen geht nicht: ${String(err)}`));
    };
    window.addEventListener("pointermove", bewegt);
    window.addEventListener("pointerup", weg);
  };
  return (
    <span
      onPointerDown={start} onPointerEnter={() => setWach(true)} onPointerLeave={() => setWach(false)}
      title={hinweis ?? `${text} nach FL ziehen`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 3, padding: "5px 8px 5px 4px", borderRadius: 7,
        fontFamily: MONO, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", cursor: "grab", userSelect: "none",
        color: wach || betont ? farbe : C.onSurfaceVariant, background: wach || betont ? alpha(farbe, 0.1) : "transparent",
        border: `1px ${wach || betont ? "solid" : "dashed"} ${wach || betont ? farbe : C.outlineVariant}`,
        transition: "color 0.15s, border-color 0.15s, background 0.15s",
      }}
    >
      <GripVertical size={12} />{text}
    </span>
  );
}

/** Bild am Mauszeiger beim Ziehen: das Plugin will ein PNG. */
function ziehBild(text: string): string {
  const c = document.createElement("canvas");
  c.width = 72; c.height = 32;
  const g = c.getContext("2d");
  if (g) {
    g.fillStyle = C.primary; g.fillRect(0, 0, 72, 32);
    g.fillStyle = "#2a1700"; g.font = "700 15px Inter, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(text, 36, 17);
  }
  return c.toDataURL("image/png");
}

const SPALTEN = "28px 168px minmax(0, 1fr) 124px";

/** Aufgeklappt: der Export oben, darunter jede Spur. Alle Bahnen teilen sich ein
 *  Takt-Raster, eine kürzere Spur endet früher. WAV und MIDI mit gleichem Namen sind eine Zeile. */
function Spuren({ sample, spuren }: { sample: StudioProject; spuren: Spur[] }) {
  const [takteVon, setTakteVon] = useState<Record<string, number>>({});
  // Zusammen spielen nur die Einzelspuren: der Export ist schon alles zusammen
  const einzeln = spuren.flatMap(s => (s.audio && spurTeile(s.name) ? [s.audio] : []));
  const mix = useMix(einzeln, sample.modified_secs);
  // Ein Hauch Nachklang macht aus 8 Takten keine 9
  const takte = Math.ceil(Math.max(0, ...Object.values(takteVon)) - 0.02);

  if (spuren.length === 0) {
    return <div style={{ padding: "0 0 14px 114px", fontSize: 13, color: C.onSecondaryFixedVar }}>Keine Spuren</div>;
  }
  // Export zuerst
  const sortiert = [...spuren].sort((a, b) => Number(!!spurTeile(a.name)) - Number(!!spurTeile(b.name)));
  const exporte = sortiert.filter(s => !spurTeile(s.name)).length;

  const lineal = takte > 0 && takte <= 16;
  return (
    <MixKontext.Provider value={mix}>
    <div style={{ padding: "6px 0 4px", display: "flex", flexDirection: "column", gap: 10, borderTop: `1px solid ${C.border20}` }}>
      {(lineal || einzeln.length > 1) && (
        <div style={{ display: "grid", gridTemplateColumns: SPALTEN, gap: 12, paddingTop: 8, alignItems: "end" }}>
          {einzeln.length > 1 && (
            <div style={{ gridColumn: "1 / 3" }}>
              <Button size="sm" variant="secondary" icon={mix.an ? Square : Play} onClick={mix.umschalten}
                title={mix.an ? undefined : `${einzeln.length} Spuren zusammen anhören`}>
                {mix.an ? "Stopp" : "Zusammen anhören"}
              </Button>
            </div>
          )}
          {lineal && (
            <div style={{ gridColumn: 3, display: "flex", fontFamily: MONO, fontSize: 12, color: C.onSecondaryFixedVar }}>
              {Array.from({ length: takte }, (_, i) => (
                <span key={i} style={{ flex: 1, paddingLeft: 4, borderLeft: `1px solid ${C.outlineVariant}` }}>{i + 1}</span>
              ))}
            </div>
          )}
        </div>
      )}
      {sortiert.map(s => (
        <SpurZeile
          key={s.name} sample={sample} spur={s} takte={takte} einzigerExport={exporte === 1}
          onTakte={t => setTakteVon(v => (v[s.name] === t ? v : { ...v, [s.name]: t }))}
        />
      ))}
    </div>
    </MixKontext.Provider>
  );
}

/** Eine Spur: anhören, Bahn (Noten oder Welle), Griffe. Mit MIDI stehen die
 *  Akkorde je Takt darunter. Klick auf den Namen macht die Noten groß: Tasten
 *  links, Takte zum Markieren oben, Tonart zum Versetzen unten. Der MIDI-Griff
 *  zieht dann genau das: versetzt und nur die markierten Takte. */
function SpurZeile({ sample, spur: s, takte, einzigerExport, onTakte }: {
  sample: StudioProject;
  spur: Spur;
  /** Länge des ganzen Samples in Takten, 0 ohne Raster */
  takte: number;
  einzigerExport: boolean;
  onTakte: (takte: number) => void;
}) {
  const { playBeat, togglePlay } = useAudioPlayerContext();
  const mix = useContext(MixKontext);
  const { imMix, laeuft, spielt } = useSpurPlayer(s.audio);
  const stumm = imMix && !!s.audio && !!mix?.stumm.has(s.audio);
  const { melde } = useDialog();
  const [midi, setMidi] = useState<Midi | null>(null);
  const [welleTakte, setWelleTakte] = useState(0);
  const [gross, setGross] = useState(false);
  const [halbtoene, setHalbtoene] = useState(0);
  const [auswahl, setAuswahl] = useState<[number, number] | null>(null);
  const anker = useRef<number | null>(null);
  const [ziehPfad, setZiehPfad] = useState(s.midi);
  useEffect(() => {
    if (s.midi) api.studio.midiNoten(s.midi).then(setMidi).catch(() => setMidi(null));
  }, [s.midi]);

  const teile = spurTeile(s.name);
  const farbe = teile?.kuerzel ? KUERZEL_FARBE[teile.kuerzel] : C.onSurfaceVariant;
  const ppq = midi?.ppq ?? 0;
  const noten = useMemo(() => (midi?.noten ?? []).map(([a, l, t]): Note => [a, l, t + halbtoene]), [midi, halbtoene]);
  const masse = midiMasse(noten, ppq);
  const hatNoten = noten.length > 0 && masse.breite > 0;
  const akk = useMemo(() => akkorde(noten, ppq, midiMasse(noten, ppq).takte), [noten, ppq]);
  const eigene = hatNoten ? masse.takte : welleTakte;
  useEffect(() => { onTakte(eigene); }, [eigene]); // eslint-disable-line react-hooks/exhaustive-deps

  const tonart = sample.key ? tonartPlus(sample.key, halbtoene) : null;
  const von = auswahl?.[0] ?? null, bis = auswahl?.[1] ?? null;
  const geaendert = halbtoene !== 0 || von != null;
  const versatz = halbtoene > 0 ? `+${halbtoene}` : String(halbtoene);
  const taktText = von == null || bis == null ? "" : von === bis ? `Takt ${von + 1}` : `Takte ${von + 1} bis ${bis + 1}`;
  const zielText = [halbtoene ? (tonart ? `in ${tonart}` : versatz) : "", taktText].filter(Boolean).join(", ");
  // Die Datei liegt fertig bereit, bevor gezogen wird: beim Ziehen bleibt keine Zeit zum Schreiben
  useEffect(() => {
    if (!s.midi) return;
    if (halbtoene === 0 && von == null) { setZiehPfad(s.midi); return; }
    let weg = false;
    const name = (halbtoene === 0 ? s.name
      : sample.key && tonart && s.name.includes(sample.key) ? s.name.replace(sample.key, tonart)
      : `${s.name} ${tonart ?? versatz}`)
      + (von != null && bis != null ? ` T${von + 1}-${bis + 1}` : "");
    api.studio.midiAusschnitt(s.midi, name, halbtoene, von, bis != null ? bis + 1 : null)
      .then(p => { if (!weg) setZiehPfad(p); })
      .catch(e => melde(`MIDI konnte nicht geschrieben werden: ${String(e)}`));
    return () => { weg = true; };
  }, [s.midi, halbtoene, von, bis]); // eslint-disable-line react-hooks/exhaustive-deps

  const play = (sek?: number) => {
    if (s.audio) playBeat({ ...toBeat(sample), id: studioBeatId(s.audio), name: s.name }, null, sek, s.audio);
  };

  const grossAn = gross && hatNoten;
  const { zeilen, oben } = tonumfang(noten);
  // Groß: jede Tonhöhe 14 px, damit jede Taste ihren Namen tragen kann
  const hoehe = grossAn ? Math.max(zeilen * 14, 220) : 90;
  const zeileH = hoehe / zeilen;
  const anteil = takte > 0 && eigene > 0 ? `${Math.min(eigene / takte, 1) * 100}%` : "100%";
  const fremd = tonart ? noten.filter(x => !inTonart(x[2], tonart)).length : 0;
  const markierbar = masse.takte > 0 && masse.takte <= 32;
  const name = (
    <>
      {teile?.kuerzel && <KuerzelMarke kuerzel={teile.kuerzel} />}
      <span style={{
        minWidth: 0, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        fontWeight: teile ? 500 : 700, color: teile ? C.onSurface : C.onSurfaceVariant,
      }}>
        {teile ? teile.sorte : einzigerExport ? "Export" : s.name}
      </span>
    </>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: SPALTEN, gap: 12, alignItems: grossAn ? "start" : "center" }}>
      <button
        className="sw-zp"
        onClick={() => { if (imMix && s.audio) mix?.stummSchalten(s.audio); else if (laeuft) togglePlay(); else play(); }}
        disabled={!s.audio}
        aria-pressed={imMix ? stumm : undefined}
        aria-label={imMix ? `${s.name} stumm` : spielt ? "Pause" : s.audio ? `${s.name} anhören` : "Nur MIDI"}
        title={imMix ? (stumm ? "Stumm" : "Stumm schalten") : spielt ? "Pause" : s.audio ? "Anhören" : "Nur MIDI"}
        style={{
          width: 28, height: 28, borderRadius: "50%", border: "none",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: stumm ? C.surfaceContainerHighest : spielt ? C.mint : s.audio ? alpha(C.mint, 0.14) : "transparent",
          color: stumm ? C.onSurfaceVariant : spielt ? "#06281d" : s.audio ? C.mint : C.surfaceContainerHighest,
          cursor: s.audio ? "pointer" : "default",
        }}
      >
        {imMix
          ? (stumm ? <VolumeX size={14} /> : <Volume2 size={14} />)
          : spielt
          ? <Pause size={11} fill="currentColor" strokeWidth={1.5} />
          : <Play size={11} fill="currentColor" strokeWidth={1.5} style={{ marginLeft: 1 }} />}
      </button>
      {hatNoten ? (
        <button
          onClick={() => setGross(g => !g)} aria-expanded={gross} title={gross ? "Noten klein" : "Noten groß"}
          style={{
            display: "flex", alignItems: "center", gap: 8, minWidth: 0, minHeight: 28, padding: 0, paddingRight: grossAn ? 34 : 0,
            border: "none", background: "transparent", color: "inherit", textAlign: "left", cursor: "pointer", font: "inherit",
          }}
        >
          {name}
          <ChevronRight size={14} style={{ flexShrink: 0, color: gross ? C.primary : C.onSecondaryFixedVar, transform: gross ? "rotate(90deg)" : "none", transition: "transform 0.2s" }} />
        </button>
      ) : (
        <span title={s.name} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>{name}</span>
      )}
      <div style={{ minWidth: 0 }}>
        {grossAn && markierbar && (
          <div title="Takte markieren" style={{ width: anteil, display: "flex", marginBottom: 4, userSelect: "none" }}>
            {Array.from({ length: masse.takte }, (_, i) => {
              const an = von != null && bis != null && i >= von && i <= bis;
              return (
                <span
                  key={i}
                  onPointerDown={() => {
                    if (von === i && bis === i) { anker.current = null; setAuswahl(null); }
                    else { anker.current = i; setAuswahl([i, i]); }
                  }}
                  onPointerEnter={e => {
                    const a = anker.current;
                    if (e.buttons === 1 && a != null) setAuswahl([Math.min(a, i), Math.max(a, i)]);
                  }}
                  style={{
                    flex: 1, minWidth: 0, height: 22, lineHeight: "22px", paddingLeft: 4, fontFamily: MONO, fontSize: 11, cursor: "pointer",
                    borderLeft: `1px solid ${C.outlineVariant}`,
                    background: an ? alpha(C.primary, 0.25) : "transparent", color: an ? C.primary : C.onSecondaryFixedVar,
                  }}
                >
                  {i + 1}
                </span>
              );
            })}
          </div>
        )}
        <div style={{ position: "relative" }}>
          {grossAn && (
            <div aria-hidden="true" style={{
              position: "absolute", right: "100%", top: 1, marginRight: 4, width: 38, textAlign: "right",
              fontFamily: MONO, fontSize: 11, color: C.onSecondaryFixedVar,
            }}>
              {Array.from({ length: zeilen }, (_, r) => {
                const t = oben - r;
                return (
                  <div key={r} style={{ height: zeileH, lineHeight: `${zeileH}px`, color: t % 12 === 0 ? C.onSurface : undefined }}>
                    {notenName(t)}
                  </div>
                );
              })}
            </div>
          )}
          <div style={{
            position: "relative", height: hoehe, borderRadius: 8, overflow: "hidden", background: C.surfaceContainerLowest,
            border: `1px solid ${laeuft ? alpha(C.mint, 0.5) : C.border20}`,
          }}>
            {takte > 0 && (
              <svg viewBox={`0 0 ${takte * 4} 1`} preserveAspectRatio="none" aria-hidden="true"
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
                {/* Jeder zweite Takt leicht abgesetzt, Viertel als feine Linien */}
                {Array.from({ length: Math.floor(takte / 2) }, (_, i) => (
                  <rect key={i} x={(i * 2 + 1) * 4} y={0} width={4} height={1} fill={alpha(C.onSurface, 0.04)} />
                ))}
                {takte <= 16 && Array.from({ length: takte * 4 - 1 }, (_, i) => (
                  <line key={i} x1={i + 1} x2={i + 1} y1={0} y2={1}
                    stroke={alpha(C.onSurface, (i + 1) % 4 === 0 ? 0.14 : 0.05)} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                ))}
              </svg>
            )}
            <div style={{ position: "relative", height: "100%", width: anteil, opacity: stumm ? 0.3 : 1, transition: "opacity 0.15s" }}>
              {s.midi
                ? <MidiNoten noten={noten} ppq={ppq} tempo={midi?.bpm ?? sample.bpm} audio={s.audio} farbe={farbe}
                    gross={grossAn} tonart={tonart} auswahl={auswahl} onPlay={play} />
                : s.audio && <Welle audio={s.audio} stand={sample.modified_secs} bpm={sample.bpm} farbe={farbe} onTakte={setWelleTakte} onPlay={play} />}
            </div>
          </div>
        </div>
        {akk.some(Boolean) && akk.length <= 16 && (
          <div style={{ width: anteil, display: "flex", paddingTop: 4, fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.onSurface }}>
            {akk.map((a, i) => (
              <span key={i} title={a || undefined} style={{ flex: 1, minWidth: 0, paddingLeft: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a}</span>
            ))}
          </div>
        )}
        {grossAn && (
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "8px 0 6px", fontSize: 12, color: C.onSurfaceVariant }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              Tonart
              <select
                value={halbtoene} onChange={e => setHalbtoene(Number(e.target.value))}
                style={{
                  font: "inherit", fontWeight: 700, padding: "3px 6px", borderRadius: 6, colorScheme: "dark",
                  color: C.onSurface, background: C.surfaceContainerLowest, border: `1px solid ${C.border30}`,
                }}
              >
                {Array.from({ length: 13 }, (_, i) => i - 6).map(k => {
                  const plus = k > 0 ? `+${k}` : String(k);
                  return <option key={k} value={k}>{sample.key ? `${tonartPlus(sample.key, k)}${k ? ` ${plus}` : ""}` : plus}</option>;
                })}
              </select>
            </label>
            {taktText
              ? <><span style={{ color: C.primary, fontWeight: 700 }}>{taktText}</span><Button size="sm" variant="ghost" onClick={() => setAuswahl(null)}>Alle Takte</Button></>
              : markierbar && <span>Takte oben markieren</span>}
            {fremd > 0 && <span>Umrandet: nicht in {tonart}</span>}
          </div>
        )}
      </div>
      <span style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        {s.audio && <Griff pfad={s.audio} text={/\.mp3$/i.test(s.audio) ? "MP3" : "WAV"} farbe={C.primary} />}
        {s.midi && (
          <Griff
            pfad={ziehPfad ?? s.midi} text="MIDI" farbe={C.tertiary} betont={geaendert}
            hinweis={geaendert ? `MIDI ${zielText} nach FL ziehen` : undefined}
          />
        )}
      </span>
    </div>
  );
}
