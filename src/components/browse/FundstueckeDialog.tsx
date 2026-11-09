// src/components/browse/FundstueckeDialog.tsx
// Fundstücke (Bibliothek-Umbau Scheibe 2/3): Songs im Altbestand mit Ampel,
// zum Durchsehen, Reinhören und Einsammeln. Einsammeln kopiert ins Archiv,
// der Altbestand bleibt; Rückgängig nimmt nur die Kopien zurück.

import { useCallback, useEffect, useMemo, useState } from "react";
import { PackageSearch, Play, Pause, FolderOpen, Search, Undo2, ArchiveRestore } from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { api } from "../../lib/api";
import { C, radius } from "../../lib/theme";
import { Modal, Segmented, IconButton, Button } from "../ui";
import { useSettings, parseProductionPaths } from "../../contexts/SettingsContext";
import { useAudioPlayerContext } from "../../contexts/AudioPlayerContext";
import { useDialog } from "../../contexts/DialogContext";
import type { Ampel, Fund, EinsammelErgebnis, EinsammelArt } from "../../types/fundstuecke";

const FARBE: Record<Ampel, string> = { gruen: C.mint, gelb: C.primary, rot: C.error, grau: C.onSecondaryFixedVar };
const NAME: Record<Ampel, string> = { gruen: "Grün", gelb: "Gelb", rot: "Rot", grau: "Im Archiv" };

/** Was der Knopf je Ampelfarbe tut. Gelb entscheidest du pro Eintrag (kommt noch). */
const AKTION: Partial<Record<Ampel, { art: EinsammelArt; knopf: string; text: string }>> = {
  gruen: { art: "archiv", knopf: "Einsammeln", text: "Kopiert ins Archiv, jede Kopie wird geprüft. Der Altbestand bleibt, Rückgängig ist möglich." },
  rot: { art: "remix", knopf: "Nach Remixe", text: "Kopiert nach 07_REMIXES als R-Nummer, nicht in den Katalog. Der Altbestand bleibt, Rückgängig ist möglich." },
  grau: { art: "reste", knopf: "Reste einsammeln", text: "Kopiert die Versionen, die im Archiv fehlen, in den Archivordner nach 02_OLD. Rückgängig ist möglich." },
};

const ordnerVon = (p: string) => p.slice(0, Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/")));
const monat = (iso: string | null) => (iso ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : null);

export function FundstueckeDialog({ onClose, onEingesammelt }: { onClose: () => void; onEingesammelt?: () => void }) {
  const { settings } = useSettings();
  const { frage, melde } = useDialog();
  const roots = parseProductionPaths(settings.altbestandPaths);
  const [funde, setFunde] = useState<Fund[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ampel, setAmpel] = useState<Ampel>("gruen");
  const [suche, setSuche] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [letzter, setLetzter] = useState<EinsammelErgebnis | null>(null);

  const laden = useCallback(() => {
    if (roots.length === 0 || !settings.archivePath) return;
    setFunde(null);
    api.archive.fundstuecke(roots, settings.archivePath).then(setFunde, e => setFehler(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.altbestandPaths, settings.archivePath]);
  useEffect(laden, [laden]);

  // Suche über Titel, Nummer und Fundort: „600-699" grenzt den Probelauf ein
  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return funde ?? [];
    return (funde ?? []).filter(f =>
      f.titel.toLowerCase().includes(q) || String(f.id ?? "") === q || f.dateien.some(d => d.path.toLowerCase().includes(q)));
  }, [funde, suche]);
  const zahl = useMemo(() => {
    const z: Record<Ampel, number> = { gruen: 0, gelb: 0, rot: 0, grau: 0 };
    gefiltert.forEach(f => z[f.ampel]++);
    return z;
  }, [gefiltert]);
  const liste = gefiltert.filter(f => f.ampel === ampel);
  const aktion = AKTION[ampel];
  // Bei Grau nur, wo wirklich etwas fehlt
  const auswahl = ampel === "grau" ? liste.filter(f => f.nur_hier > 0) : liste;

  const einsammeln = async () => {
    if (!aktion) return;
    const ok = await frage({
      titel: `${aktion.knopf}: ${auswahl.length} Songs`,
      text: aktion.text,
      bestaetigen: aktion.knopf,
    });
    if (!ok) return;
    setLaeuft(true);
    try {
      const r = await api.archive.einsammeln(
        auswahl.map(f => ({ id: f.id, titel: f.titel, key: f.key, bpm: f.bpm, dateien: f.dateien.map(d => d.path), archiv: f.archiv })),
        settings.archivePath,
        aktion.art,
      );
      setLetzter(r);
      melde(`${r.fertig.length} eingesammelt${r.ausgelassen.length ? `, ${r.ausgelassen.length} ausgelassen` : ""}`, r.fehler ? "fehler" : "erfolg");
      onEingesammelt?.();
      laden();
    } catch (e) {
      melde(`Einsammeln fehlgeschlagen: ${String(e)}`, "fehler");
    } finally {
      setLaeuft(false);
    }
  };

  const rueckgaengig = async () => {
    if (!letzter?.protokoll) return;
    const ok = await frage({
      titel: `${letzter.fertig.length} Songs zurücknehmen`,
      text: "Löscht die Kopien im Archiv. Was du seitdem dazugelegt hast, bleibt.",
      bestaetigen: "Zurücknehmen",
    });
    if (!ok) return;
    try {
      const hinweise = await api.archive.einsammelnRueckgaengig(letzter.protokoll);
      setLetzter(null);
      melde(hinweise.length ? `Zurückgenommen, ${hinweise.length} Hinweise: ${hinweise[0]}` : "Zurückgenommen", hinweise.length ? "info" : "erfolg");
      onEingesammelt?.();
      laden();
    } catch (e) {
      melde(`Rückgängig fehlgeschlagen: ${String(e)}`, "fehler");
    }
  };

  return (
    <Modal
      title="Fundstücke" subtitle="Altbestand gegen das Archiv" icon={PackageSearch} onClose={onClose} width={860}
      footerLeft={letzter && (
        <span style={{ fontSize: 12, color: letzter.fehler ? C.error : C.onSurfaceVariant }}>
          {letzter.fehler ?? `${letzter.fertig.length} eingesammelt`}
          {letzter.ausgelassen.length > 0 && <span title={letzter.ausgelassen.join("\n")}> · {letzter.ausgelassen.length} ausgelassen</span>}
        </span>
      )}
      footer={<>
        {letzter?.protokoll && <Button variant="ghost" icon={Undo2} onClick={rueckgaengig}>Rückgängig</Button>}
        {aktion && funde && (
          <Button variant="primary" icon={ArchiveRestore} onClick={einsammeln} disabled={laeuft || auswahl.length === 0}>
            {laeuft ? "Sammle …" : `${aktion.knopf} (${auswahl.length})`}
          </Button>
        )}
      </>}
    >
      {roots.length === 0 ? (
        <Hinweis>Kein Altbestand festgelegt. Unter Einstellungen → Ordner eintragen.</Hinweis>
      ) : fehler ? (
        <Hinweis farbe={C.error}>{fehler}</Hinweis>
      ) : !funde ? (
        <Hinweis>Durchsuche {roots.length} Ordner …</Hinweis>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Segmented
              label="Ampel"
              value={ampel}
              onChange={setAmpel}
              options={(Object.keys(NAME) as Ampel[]).map(a => ({ value: a, label: `${NAME[a]} ${zahl[a]}`, color: FARBE[a] }))}
            />
            <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
              <Search size={14} color={C.onSecondaryFixedVar} style={{ position: "absolute", left: 9, top: 9 }} />
              <input
                value={suche} onChange={e => setSuche(e.target.value)} placeholder="Titel, Nummer oder Ordner"
                aria-label="Fundstücke durchsuchen"
                style={{
                  width: "100%", padding: "7px 10px 7px 30px", fontSize: 13, fontFamily: "inherit",
                  background: C.surfaceContainerLowest, color: C.onSurface, outline: "none",
                  border: `1px solid ${C.border20}`, borderRadius: radius.control, boxSizing: "border-box",
                }}
              />
            </div>
          </div>
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
    monat(f.fertig),
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
