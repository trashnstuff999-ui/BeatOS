// src/components/UploadsNacherfassenDialog.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Uploads nacherfassen: die eigenen Kanäle lesen, Videos/Tracks den Beats
// zuordnen, bestätigen, eintragen.
//
//   1. Laden    — beide Kanallisten (yt-dlp, Sekunden) + alle Beats + was
//                 schon erfasst ist
//   2. Auswahl  — eindeutige neue Treffer sind vorausgewählt; unklare und
//                 fehlende lassen sich von Hand zuordnen; schon Erfasstes
//                 steht unten, ausgeschaltet
//   3. Eintragen— erst jetzt die Upload-Daten (≈2 s je Link, in Stücken
//                 mit Fortschritt), dann nacherfassen: nur Fehlendes wird
//                 ergänzt, nichts überschrieben
//
// Selten gebraucht — deshalb ein Dialog hinter einem Knopf in den
// Einstellungen, nicht Teil des Alltags.
// ═══════════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import { History, Youtube, Music2, Check, AlertTriangle } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { C, PLATFORM_CONFIG, alpha, radius } from "../lib/theme";
import { api } from "../lib/api";
import { Modal, Button } from "./ui";
import { kandidaten, linkSchluessel, type KanalEintrag } from "../lib/nacherfassen";
import type { Beat } from "../types/browse";

type Plattform = "youtube" | "soundcloud";

interface Zeile {
  plattform: Plattform;
  eintrag: KanalEintrag;
  beatId: string | null;
  /** Mehrere Beats mit dem Namen — dann nicht vorauswählen. */
  mehrdeutig: boolean;
  /** Für diesen Beat + Plattform steht schon ein Upload mit Link. */
  erfasst: boolean;
  an: boolean;
}

type Phase =
  | { art: "laden" }
  | { art: "auswahl" }
  | { art: "eintragen"; fertig: number; gesamt: number }
  | { art: "fertig"; anzahl: number; ohneDatum: number }
  | { art: "fehler"; text: string };

const STUECK = 6;

export function UploadsNacherfassenDialog({ youtubeUrl, soundcloudUrl, onClose }: {
  youtubeUrl: string;
  soundcloudUrl: string;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ art: "laden" });
  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [beats, setBeats] = useState<Beat[]>([]);
  const [hinweise, setHinweise] = useState<string[]>([]);

  useEffect(() => {
    let abgebrochen = false;
    (async () => {
      try {
        const kanaele: [Plattform, string][] = ([["youtube", youtubeUrl], ["soundcloud", soundcloudUrl]] as [Plattform, string][])
          .filter(([, u]) => u.trim());
        if (kanaele.length === 0) throw new Error("Keine Kanal-Links eingetragen");

        const [alleBeats, ...listen] = await Promise.all([
          api.beats.getAll({ search: null, onlyFavs: false, limit: 5000, offset: 0 }),
          ...kanaele.map(([, u]) => api.kanal.liste(u).catch(e => e as unknown)),
        ]);
        const badges = await api.beats.getUploadBadges(alleBeats.map(b => b.id));
        const erfasst = new Set(badges.filter(b => b.status === "uploaded" && b.url).map(b => `${b.beat_id}|${b.platform}`));

        const neu: Zeile[] = [];
        const meldungen: string[] = [];
        kanaele.forEach(([plattform], i) => {
          const liste = listen[i];
          if (!Array.isArray(liste)) {
            meldungen.push(`${PLATFORM_CONFIG[plattform].label}: ${String(liste)}`);
            return;
          }
          for (const eintrag of liste as KanalEintrag[]) {
            const k = kandidaten(eintrag.titel, alleBeats);
            const beatId = k.length === 1 ? k[0].id : null;
            const schon = !!beatId && erfasst.has(`${beatId}|${plattform}`);
            neu.push({ plattform, eintrag, beatId, mehrdeutig: k.length > 1, erfasst: schon, an: !!beatId && !schon });
          }
        });
        if (abgebrochen) return;
        setBeats(alleBeats);
        setZeilen(neu);
        setHinweise(meldungen);
        setPhase({ art: "auswahl" });
      } catch (e) {
        if (!abgebrochen) setPhase({ art: "fehler", text: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => { abgebrochen = true; };
  }, [youtubeUrl, soundcloudUrl]);

  // Reihenfolge: zu übernehmen, nicht zugeordnet, schon erfasst.
  const sortiert = useMemo(() => {
    const rang = (z: Zeile) => (z.erfasst ? 2 : z.beatId ? 0 : 1);
    return zeilen.map((z, i) => ({ z, i })).sort((a, b) => rang(a.z) - rang(b.z));
  }, [zeilen]);
  const gewaehlt = zeilen.filter(z => z.an && z.beatId);
  const zaehler = {
    neu: zeilen.filter(z => z.beatId && !z.erfasst).length,
    offen: zeilen.filter(z => !z.beatId).length,
    erfasst: zeilen.filter(z => z.erfasst).length,
  };

  const aendern = (i: number, teil: Partial<Zeile>) =>
    setZeilen(prev => prev.map((z, k) => (k === i ? { ...z, ...teil } : z)));

  const eintragen = async () => {
    const liste = gewaehlt;
    setPhase({ art: "eintragen", fertig: 0, gesamt: liste.length });
    const daten = new Map<string, string>();
    try {
      for (let i = 0; i < liste.length; i += STUECK) {
        const stueck = liste.slice(i, i + STUECK);
        const antwort = await api.kanal.daten(stueck.map(z => z.eintrag.url)).catch(() => []);
        for (const [url, datum] of antwort) daten.set(linkSchluessel(url), datum);
        setPhase({ art: "eintragen", fertig: Math.min(i + STUECK, liste.length), gesamt: liste.length });
      }
      let ohneDatum = 0;
      for (const z of liste) {
        const datum = daten.get(linkSchluessel(z.eintrag.url)) ?? null;
        if (!datum) ohneDatum++;
        await api.kanal.nacherfassen(z.beatId!, z.plattform, z.eintrag.url, datum);
      }
      setPhase({ art: "fertig", anzahl: liste.length, ohneDatum });
    } catch (e) {
      setPhase({ art: "fehler", text: `Eintragen abgebrochen: ${String(e)}` });
    }
  };

  const footer = phase.art === "auswahl" ? (
    <>
      <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
      <Button variant="primary" icon={Check} onClick={eintragen} disabled={gewaehlt.length === 0}>
        {gewaehlt.length === 1 ? "1 Upload eintragen" : `${gewaehlt.length} Uploads eintragen`}
      </Button>
    </>
  ) : phase.art === "fertig" || phase.art === "fehler" ? (
    <Button variant="primary" onClick={onClose}>Schließen</Button>
  ) : null;

  return (
    <Modal
      icon={History}
      title="Uploads nacherfassen"
      subtitle="Videos und Tracks den Beats zuordnen"
      width={860}
      onClose={onClose}
      closeOnBackdrop={phase.art !== "eintragen"}
      footer={footer}
      footerLeft={phase.art === "auswahl" ? (
        <span style={{ fontSize: 12, color: C.onSecondaryFixedVar }}>
          {zaehler.neu} zugeordnet · {zaehler.offen} ohne Zuordnung · {zaehler.erfasst} schon erfasst
        </span>
      ) : undefined}
    >
      {phase.art === "laden" && (
        <Hinweis>Lese die Kanäle … (dauert ein paar Sekunden)</Hinweis>
      )}
      {phase.art === "fehler" && (
        <Hinweis farbe={C.error}><AlertTriangle size={14} /> {phase.text}</Hinweis>
      )}
      {phase.art === "eintragen" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "20px 0" }}>
          <span style={{ fontSize: 13, color: C.onSurface }}>
            Hole die Upload-Daten … {phase.fertig} von {phase.gesamt}
          </span>
          <div style={{ height: 6, borderRadius: 3, background: C.surfaceContainerHigh, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(phase.fertig / Math.max(phase.gesamt, 1)) * 100}%`, background: C.primary, transition: "width 0.3s" }} />
          </div>
          <span style={{ fontSize: 12, color: C.onSecondaryFixedVar }}>Etwa 2 Sekunden je Video bzw. Track.</span>
        </div>
      )}
      {phase.art === "fertig" && (
        <Hinweis farbe={C.mint}>
          <Check size={14} /> {phase.anzahl === 1 ? "1 Upload" : `${phase.anzahl} Uploads`} nachgetragen
          {phase.ohneDatum > 0 && <span style={{ color: C.onSurfaceVariant }}> · {phase.ohneDatum} ohne Datum (privat oder nicht erreichbar)</span>}
        </Hinweis>
      )}

      {phase.art === "auswahl" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {hinweise.map(h => <Hinweis key={h} farbe={C.error}><AlertTriangle size={14} /> {h}</Hinweis>)}
          <div style={{ maxHeight: "56vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
            {sortiert.map(({ z, i }) => {
              const Icon = z.plattform === "youtube" ? Youtube : Music2;
              return (
                <div key={`${z.plattform}${z.eintrag.id}`} style={{
                  display: "grid", gridTemplateColumns: "24px 18px minmax(0, 1fr) 240px", alignItems: "center", gap: 10,
                  padding: "6px 8px", borderRadius: radius.control,
                  background: z.an ? alpha(C.primary, 0.06) : "transparent",
                  opacity: z.erfasst ? 0.55 : 1,
                }}>
                  <input
                    type="checkbox"
                    aria-label={`${z.eintrag.titel} übernehmen`}
                    checked={z.an}
                    disabled={!z.beatId}
                    onChange={e => aendern(i, { an: e.target.checked })}
                    style={{ accentColor: C.primary }}
                  />
                  <Icon size={14} color={PLATFORM_CONFIG[z.plattform].color} />
                  <button
                    type="button"
                    onClick={() => openUrl(z.eintrag.url).catch(() => window.open(z.eintrag.url, "_blank"))}
                    title={`${z.eintrag.titel}
Klicken zum Öffnen`}
                    style={{
                      padding: 0, border: "none", background: "none", cursor: "pointer", textAlign: "left",
                      fontSize: 12, fontFamily: "inherit", color: C.onSurface,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}
                  >
                    {z.eintrag.titel}
                  </button>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <select
                      value={z.beatId ?? ""}
                      onChange={e => aendern(i, { beatId: e.target.value || null, an: !!e.target.value, mehrdeutig: false })}
                      aria-label="Beat zuordnen"
                      style={{
                        flex: 1, minWidth: 0, padding: "4px 6px", fontSize: 12, fontFamily: "inherit",
                        background: C.surfaceContainerLowest, color: z.beatId ? C.onSurface : C.onSecondaryFixedVar,
                        border: `1px solid ${z.mehrdeutig ? alpha(C.primary, 0.6) : C.border20}`, borderRadius: radius.control,
                        colorScheme: "dark",
                      }}
                    >
                      <option value="">{z.mehrdeutig ? "mehrdeutig, wählen" : "nicht zuordnen"}</option>
                      {beats.map(b => <option key={b.id} value={b.id}>B{b.id} {b.name}</option>)}
                    </select>
                    {z.erfasst && <span style={{ fontSize: 11, color: C.onSecondaryFixedVar, whiteSpace: "nowrap" }}>schon erfasst</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Hinweis({ children, farbe = C.onSurfaceVariant }: { children: React.ReactNode; farbe?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0", fontSize: 13, color: farbe }}>
      {children}
    </div>
  );
}
