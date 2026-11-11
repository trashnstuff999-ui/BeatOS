// src/components/studio/SamplesPane.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Studio → Samples: eigene Loops und Ideen in 06_SAMPLES. Eine ruhige Zeile pro
// Sample wie bei den Ideen: Play, Nummer, Name, Tonart/BPM, Alter. Klick öffnet
// die FLP in FL. Kein Status, keine DB: der Ordner ist die ganze Wahrheit.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { AudioLines, Play, RefreshCw } from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { C, alpha, radius } from "../../lib/theme";
import { api } from "../../lib/api";
import { formatRelativeTime } from "../../lib/time";
import { useSettings, samplesOrdner } from "../../contexts/SettingsContext";
import { useDialog } from "../../contexts/DialogContext";
import { useAudioPlayerContext } from "../../contexts/AudioPlayerContext";
import { useFocusRefresh } from "../../hooks/useFocusRefresh";
import { Button, EmptyState, Dropdown } from "../ui";
import { useFlVorlagen } from "../../hooks/useFlVorlagen";
import { VorlagenPunkte } from "./VorlagenPunkte";
import { studioBeatId } from "../../types/studio";
import type { StudioProject } from "../../types/studio";
import type { Beat } from "../../types/browse";

/** „S0012 Nachtzug" → Nummer und Name. Ohne Namen steht der Export-Titel da. */
export function sampleName(p: StudioProject): { nummer: string | null; titel: string | null } {
  const m = /^(S\d+)\s*(.*)$/.exec(p.parsed_name);
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
  const { settings } = useSettings();
  const { melde } = useDialog();
  const { playBeat, setQueue } = useAudioPlayerContext();
  const root = samplesOrdner(settings.archivePath);
  const [samples, setSamples] = useState<StudioProject[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const scan = useCallback(async () => {
    if (!root) return;
    setIsLoading(true);
    try {
      const liste = await api.studio.scanSamples(root);
      setSamples(liste.sort((a, b) => b.modified_secs - a.modified_secs));
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

  const handlePreview = (p: StudioProject) => {
    setQueue(samples.filter(x => x.has_mp3 || x.has_wav).map(toBeat));
    playBeat(toBeat(p));
  };

  return (
    <section aria-label="Samples" style={{ padding: "8px 16px 0" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        paddingBottom: 12, borderBottom: `1px solid ${C.border20}`,
      }}>
        <h2 style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: C.onSurface }}>SAMPLES</h2>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.onSurfaceVariant }}>{samples.length}</span>
        <span title={root} style={{ fontSize: 13, color: C.onSecondaryFixedVar }}>06_SAMPLES</span>
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

      {!root && <EmptyState variant="inline" title="Kein Archiv-Ordner" description="Einstellungen → Pfade" />}
      {root && !isLoading && samples.length === 0 && (
        <EmptyState variant="inline" icon={AudioLines} title="Noch keine Samples" />
      )}

      <div style={{ paddingTop: 8 }}>
        {samples.map(p => (
          <SampleZeile key={p.path} sample={p} onOpen={() => handleOpen(p)} onPreview={() => handlePreview(p)} />
        ))}
      </div>
    </section>
  );
}

function SampleZeile({ sample: p, onOpen, onPreview }: {
  sample: StudioProject;
  onOpen: () => void;
  onPreview: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const { nummer, titel } = sampleName(p);
  const canPreview = p.has_mp3 || p.has_wav;
  const keyBpm = [p.key, p.bpm != null ? `${p.bpm} BPM` : null].filter(Boolean).join(" · ");

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: "flex", alignItems: "center", gap: 4 }}
    >
      <button
        onClick={() => { if (canPreview) onPreview(); }}
        disabled={!canPreview}
        aria-label={canPreview ? "Export anhören" : "Noch kein Export"}
        title={canPreview ? "Export anhören" : "Kein Audio-Export im Ordner"}
        style={{
          flex: "0 0 36px", width: 36, height: 36, borderRadius: "50%", border: "none",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: canPreview ? alpha(C.mint, 0.10) : "transparent",
          color: canPreview ? C.mint : C.surfaceContainerHighest,
          cursor: canPreview ? "pointer" : "default",
        }}
      >
        <Play size={12} fill="currentColor" strokeWidth={1.5} style={{ marginLeft: 1 }} />
      </button>
      <button
        onClick={onOpen}
        disabled={!p.newest_flp}
        title="In FL öffnen"
        style={{
          flex: 1, minWidth: 0, minHeight: 44, display: "flex", alignItems: "center", gap: 12,
          padding: "0 12px", border: "none", borderRadius: 8, textAlign: "left", color: "inherit",
          cursor: "pointer", userSelect: "none",
          background: hovered ? "rgba(255,255,255,0.03)" : "transparent",
        }}
      >
        <span style={{ flex: "0 0 52px", fontFamily: "'JetBrains Mono', Consolas, monospace", fontSize: 12, color: C.onSecondaryFixedVar }}>
          {nummer ?? ""}
        </span>
        <span style={{
          flex: "1 1 auto", minWidth: 0, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          fontWeight: titel ? 700 : 500, color: titel ? C.onSurface : C.onSecondaryFixedVar,
        }}>
          {titel ?? "ohne Namen"}
        </span>
        <span style={{ flex: "0 0 110px", fontSize: 13, color: C.onSurfaceVariant, textAlign: "right", whiteSpace: "nowrap" }}>
          {keyBpm}
        </span>
        <span title={p.modified_date ?? undefined} style={{ flex: "0 0 110px", fontSize: 13, color: C.onSecondaryFixedVar, textAlign: "right", whiteSpace: "nowrap" }}>
          {formatRelativeTime(p.modified_secs)}
        </span>
      </button>
    </div>
  );
}
