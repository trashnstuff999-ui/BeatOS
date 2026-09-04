// src/components/upload/SampleCreditsCard.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Sample-Credits — wessen Sample in diesem Beat steckt
// ═══════════════════════════════════════════════════════════════════════════════
//
// Zwei Felder nebeneinander, weil es zwei Rollen sind: du produzierst, jemand
// anderes hat vielleicht ein Sample beigesteuert. Steht rechts niemand, bist
// du beides — und in der Beschreibung steht „No Samples Used".
//
// Links ist bewusst ein festes Feld, kein Auswahlmenü: einen Produzenten pro
// Beat gibt es in der Datenbank nicht, und jeder Beat ist von dir. Ein Menü
// mit einer Option wäre eine Attrappe. Wird das mal anders, kommt eine Spalte
// auf `beats` dazu und hier ein echtes Menü.
//
// Das Adressbuch wird in den Einstellungen gepflegt. Beim Rendern wandern Name
// und Links in die Beschreibungen ({{PRODUCER_LINE}}, {{CREDITS}},
// {{COLLAB_SOCIALS}}).
//
// Speichert wie die TypeBeatCard nebenan automatisch, 500 ms nach der letzten
// Änderung, mit Abgleich gegen den zuletzt gespeicherten Stand.

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Users } from "lucide-react";
import { C } from "../../lib/theme";
import { SectionCard } from "../ui/SectionCard";
import { api } from "../../lib/api";
import { useSettings } from "../../contexts/SettingsContext";
import type { BeatSampleCredit, SampleProducer } from "../../types/sampleCredits";

interface SampleCreditsCardProps {
  beatId: string;
  /** Eltern laden die Upload-Daten neu, damit die Vorschau die Credits zeigt */
  onSaved: () => void;
  /** Ohne eigene Karte rendern — hängt als Abschnitt in der Infos-Karte. */
  bare?: boolean;
}

type SaveState = "idle" | "saving" | "saved";

const KEINER = "";

/** Vergleichsstand für den Abgleich. */
function snapshot(credits: BeatSampleCredit[]): string {
  return credits.map(c => `${c.producer_id}:${c.contribution}`).join("|");
}

export function SampleCreditsCard({ beatId, onSaved, bare = false }: SampleCreditsCardProps) {
  const { settings } = useSettings();
  const [producers, setProducers] = useState<SampleProducer[]>([]);
  const [credits, setCredits] = useState<BeatSampleCredit[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const lastSavedRef = useRef<string>("");
  const geladenRef = useRef(false);

  useEffect(() => {
    api.sampleCredits.listProducers().then(setProducers).catch(() => setProducers([]));
  }, []);

  useEffect(() => {
    geladenRef.current = false;
    api.sampleCredits.forBeat(beatId)
      .then(rows => {
        setCredits(rows);
        lastSavedRef.current = snapshot(rows);
        setSaveState("idle");
        geladenRef.current = true;
      })
      .catch(() => {
        setCredits([]);
        lastSavedRef.current = "";
        geladenRef.current = true;
      });
  }, [beatId]);

  useEffect(() => {
    // Vor dem ersten Laden nichts schreiben — sonst leerte der Anfangszustand
    // die Credits des Beats, bevor sie überhaupt da waren.
    if (!geladenRef.current) return;
    const current = snapshot(credits);
    if (current === lastSavedRef.current) return;

    const handle = setTimeout(async () => {
      setSaveState("saving");
      try {
        await api.sampleCredits.setForBeat(beatId, credits);
        lastSavedRef.current = current;
        setSaveState("saved");
        onSaved();
        setTimeout(() => setSaveState(s => (s === "saved" ? "idle" : s)), 1500);
      } catch (e) {
        console.error("[SampleCreditsCard] Speichern fehlgeschlagen:", e);
        setSaveState("idle");
      }
    }, 500);
    return () => clearTimeout(handle);
  }, [credits, beatId]); // eslint-disable-line react-hooks/exhaustive-deps

  const credit = credits[0] ?? null;
  const producerName = settings.producerName.trim() || "—";

  const waehle = (wert: string) => {
    if (wert === KEINER) { setCredits([]); return; }
    const id = Number(wert);
    const p = producers.find(x => x.id === id);
    setCredits([{
      producer_id: id,
      contribution: credit?.contribution || "Sample",
      producer_name: p?.name ?? "",
    }]);
  };

  const feld: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 7,
    background: C.surfaceContainerHighest,
    border: `1px solid ${C.border20}`,
    color: C.onSurface,
    fontSize: 12,
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
  };

  const beschriftung: React.CSSProperties = {
    display: "block", marginBottom: 6,
    fontSize: 11, color: C.onSecondaryFixedVar,
  };

  const inhalt = (
    <>
      {/* Rahmenlos trägt der Abschnitt seine eigene Beschriftung, wie die
          Chip-Gruppen darüber — die Kartenkopfzeile gehört der ganzen Fläche. */}
      {bare && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          fontSize: 11, color: C.onSecondaryFixedVar, marginBottom: 8,
        }}>
          Credits
          {saveState === "saving" && <Loader2 size={11} style={{ animation: "spin 0.8s linear infinite" }} />}
          {saveState === "saved" && <Check size={11} color={C.mint} />}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 180px", minWidth: 0 }}>
          <label style={beschriftung}>Produziert von</label>
          <div style={{ ...feld, color: C.onSurface, background: C.surfaceContainer }} title="Kommt aus den Einstellungen → Producer">
            {producerName}
          </div>
        </div>

        <div style={{ flex: "1 1 180px", minWidth: 0 }}>
          <label style={beschriftung}>Sample von</label>
          <select
            value={credit ? String(credit.producer_id) : KEINER}
            onChange={e => waehle(e.target.value)}
            style={{ ...feld, cursor: "pointer" }}
          >
            <option value={KEINER}>— niemand —</option>
            {producers.map(p => (
              <option key={p.id} value={String(p.id)}>{p.name}</option>
            ))}
          </select>
        </div>

        {credit && (
          <div style={{ flex: "1 1 180px", minWidth: 0 }}>
            <label style={beschriftung}>Was genau</label>
            <input
              value={credit.contribution}
              onChange={e => setCredits([{ ...credit, contribution: e.target.value }])}
              placeholder="Guitarsample"
              title="Steht so in der Beschreibung: „🎸 Guitarsample by …“"
              style={feld}
            />
          </div>
        )}
      </div>

      <div style={{ marginTop: 10, fontSize: 11, color: C.onSecondaryFixedVar, lineHeight: 1.5 }}>
        {producers.length === 0
          ? <>Noch niemand im Adressbuch. Anlegen unter <strong style={{ color: C.onSurfaceVariant }}>Einstellungen → Producer</strong>.</>
          : credit
            ? <>In der Beschreibung: „{producerName} &amp; {credit.producer_name}“, dazu {credit.producer_name}s Links.</>
            : <>Ohne Sample-Geber steht in der Beschreibung „No Samples Used“.</>
        }
      </div>
    </>
  );

  if (bare) return inhalt;

  return (
    <SectionCard
      icon={Users}
      title="Credits"
      actions={
        saveState === "saving" ? <Loader2 size={13} color={C.onSurfaceVariant} style={{ animation: "spin 0.8s linear infinite" }} />
        : saveState === "saved" ? <Check size={13} color={C.mint} />
        : null
      }
    >
      {inhalt}
    </SectionCard>
  );
}
