// src/components/browse/FundstueckeDialog.tsx
// Fundstücke (Bibliothek-Umbau Scheibe 2): Songs im Altbestand mit Ampel,
// zum Durchsehen und Reinhören. Nur lesend, Einsammeln kommt in Scheibe 3.

import { useEffect, useMemo, useState } from "react";
import { PackageSearch, Play, Pause, FolderOpen } from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { api } from "../../lib/api";
import { C, radius } from "../../lib/theme";
import { Modal, Segmented, IconButton } from "../ui";
import { useSettings, parseProductionPaths } from "../../contexts/SettingsContext";
import { useAudioPlayerContext } from "../../contexts/AudioPlayerContext";
import type { Ampel, Fund } from "../../types/fundstuecke";

const FARBE: Record<Ampel, string> = { gruen: C.mint, gelb: C.primary, rot: C.error, grau: C.onSecondaryFixedVar };
const NAME: Record<Ampel, string> = { gruen: "Grün", gelb: "Gelb", rot: "Rot", grau: "Im Archiv" };

const ordnerVon = (p: string) => p.slice(0, Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/")));

export function FundstueckeDialog({ onClose }: { onClose: () => void }) {
  const { settings } = useSettings();
  const roots = parseProductionPaths(settings.altbestandPaths);
  const [funde, setFunde] = useState<Fund[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ampel, setAmpel] = useState<Ampel>("gruen");

  useEffect(() => {
    if (roots.length === 0 || !settings.archivePath) return;
    api.archive.fundstuecke(roots, settings.archivePath).then(setFunde, e => setFehler(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.altbestandPaths, settings.archivePath]);

  const zahl = useMemo(() => {
    const z: Record<Ampel, number> = { gruen: 0, gelb: 0, rot: 0, grau: 0 };
    funde?.forEach(f => z[f.ampel]++);
    return z;
  }, [funde]);
  const liste = funde?.filter(f => f.ampel === ampel) ?? [];

  return (
    <Modal title="Fundstücke" subtitle="Altbestand gegen das Archiv" icon={PackageSearch} onClose={onClose} width={860}>
      {roots.length === 0 ? (
        <Hinweis>Kein Altbestand festgelegt. Unter Einstellungen → Ordner eintragen.</Hinweis>
      ) : fehler ? (
        <Hinweis farbe={C.error}>{fehler}</Hinweis>
      ) : !funde ? (
        <Hinweis>Durchsuche {roots.length} Ordner …</Hinweis>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Segmented
            label="Ampel"
            value={ampel}
            onChange={setAmpel}
            options={(Object.keys(NAME) as Ampel[]).map(a => ({ value: a, label: `${NAME[a]} ${zahl[a]}`, color: FARBE[a] }))}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: "60vh", overflowY: "auto" }}>
            {liste.map(f => <Zeile key={`${f.id}:${f.titel}:${f.dateien[0].path}`} f={f} />)}
            {liste.length === 0 && <Hinweis>Nichts in {NAME[ampel]}.</Hinweis>}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Hinweis({ children, farbe }: { children: React.ReactNode; farbe?: string }) {
  return <div style={{ padding: "24px 4px", fontSize: 13, color: farbe ?? C.onSurfaceVariant }}>{children}</div>;
}

function Zeile({ f }: { f: Fund }) {
  const { playBeat, currentBeat, isPlaying, togglePlay } = useAudioPlayerContext();
  const audio = f.dateien.find(d => !d.flp);
  const id = audio ? `fund:${audio.path}` : "";
  const laeuft = currentBeat?.id === id && isPlaying;
  const name = `${f.id != null ? `[${f.id}] ` : ""}${f.titel}`;

  const abspielen = () => {
    if (!audio) return;
    if (currentBeat?.id === id) { togglePlay(); return; }
    playBeat({
      id, name, path: ordnerVon(audio.path), bpm: f.bpm, key: f.key,
      status: null, tags: null, favorite: null, created_date: null, modified_date: null,
      notes: null, sold_to: null, has_artwork: null, has_video: null,
    }, null, undefined, audio.path);
  };

  const details = [
    [f.key, f.bpm].filter(Boolean).join(" "),
    f.grund,
    f.archiv,
    `${f.dateien.length} ${f.dateien.length === 1 ? "Datei" : "Dateien"}`,
    f.ampel === "grau" && f.nur_hier > 0 ? `${f.nur_hier} nur hier` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "6px 8px",
      borderRadius: radius.control, background: laeuft ? C.surfaceContainer : undefined,
    }}>
      <span style={{ width: 8, height: 8, borderRadius: 4, background: FARBE[f.ampel], flexShrink: 0 }} />
      <IconButton icon={laeuft ? Pause : Play} title={audio?.path.split(/[\\/]/).pop() ?? ""} onClick={abspielen} disabled={!audio} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.onSurface, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
        <div style={{ fontSize: 11, color: C.onSecondaryFixedVar, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.dateien.map(d => d.path).join("\n")}>
          {details}
        </div>
      </div>
      <IconButton icon={FolderOpen} title={ordnerVon(f.dateien[0].path)} onClick={() => openPath(ordnerVon(f.dateien[0].path)).catch(() => {})} />
    </div>
  );
}
