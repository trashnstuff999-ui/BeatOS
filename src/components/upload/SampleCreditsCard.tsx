// src/components/upload/SampleCreditsCard.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Sample-Credits — wessen Sample in diesem Beat steckt
// ═══════════════════════════════════════════════════════════════════════════════
//
// Das Adressbuch wird in den Einstellungen gepflegt; hier wird pro Beat
// ausgewählt, wer etwas beigesteuert hat und was. Beim Rendern wandern Name
// und Links daraus in die Beschreibungen ({{PRODUCER_LINE}}, {{CREDITS}},
// {{COLLAB_SOCIALS}}).
//
// Speichert wie die TypeBeatCard nebenan automatisch, 500 ms nach der letzten
// Änderung, mit Abgleich gegen den zuletzt gespeicherten Stand — sonst löste
// schon das Umschalten auf einen anderen Beat ein Phantom-Speichern aus.

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Plus, Users, X } from "lucide-react";
import { C } from "../../lib/theme";
import { SectionCard } from "../ui/SectionCard";
import { api } from "../../lib/api";
import type { BeatSampleCredit, SampleProducer } from "../../types/sampleCredits";

interface SampleCreditsCardProps {
  beatId: string;
  /** Eltern laden die Upload-Daten neu, damit die Vorschau die Credits zeigt */
  onSaved: () => void;
}

type SaveState = "idle" | "saving" | "saved";

/** Vergleichsstand für den Abgleich — Reihenfolge zählt mit. */
function snapshot(credits: BeatSampleCredit[]): string {
  return credits.map(c => `${c.producer_id}:${c.contribution}`).join("|");
}

export function SampleCreditsCard({ beatId, onSaved }: SampleCreditsCardProps) {
  const [producers, setProducers] = useState<SampleProducer[]>([]);
  const [credits, setCredits] = useState<BeatSampleCredit[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const lastSavedRef = useRef<string>("");
  const geladenRef = useRef(false);

  // Adressbuch einmal, Credits bei jedem Beat-Wechsel
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

  const frei = producers.filter(p => !credits.some(c => c.producer_id === p.id));

  const hinzufuegen = () => {
    const naechster = frei[0];
    if (!naechster || naechster.id === null) return;
    setCredits(cs => [
      ...cs,
      { producer_id: naechster.id!, contribution: "Sample", producer_name: naechster.name },
    ]);
  };

  const aendern = (i: number, patch: Partial<BeatSampleCredit>) =>
    setCredits(cs => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const entfernen = (i: number) => setCredits(cs => cs.filter((_, idx) => idx !== i));

  const eingabe: React.CSSProperties = {
    background: C.surfaceContainerHighest,
    border: `1px solid ${C.border20}`,
    borderRadius: 6,
    color: C.onSurface,
    fontSize: 12,
    padding: "7px 10px",
    outline: "none",
  };

  return (
    <SectionCard
      icon={Users}
      title="Sample-Credits"
      actions={
        saveState === "saving" ? <Loader2 size={13} color={C.onSurfaceVariant} style={{ animation: "spin 0.8s linear infinite" }} />
        : saveState === "saved" ? <Check size={13} color={C.mint} />
        : null
      }
    >
      {producers.length === 0 ? (
        <div style={{ fontSize: 11, color: C.onSecondaryFixedVar, lineHeight: 1.6 }}>
          Noch keine Sample-Produzenten im Adressbuch. Anlegen unter
          <strong style={{ color: C.onSurfaceVariant }}> Einstellungen → Producer</strong> —
          danach stehen sie hier zur Auswahl.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {credits.length === 0 && (
            <div style={{ fontSize: 11, color: C.onSecondaryFixedVar, lineHeight: 1.6 }}>
              Keine fremden Samples. In der Beschreibung steht dann weiterhin
              „No Samples Used".
            </div>
          )}

          {credits.map((c, i) => (
            <div key={`${c.producer_id}-${i}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <select
                value={c.producer_id}
                onChange={e => {
                  const id = Number(e.target.value);
                  const p = producers.find(x => x.id === id);
                  aendern(i, { producer_id: id, producer_name: p?.name ?? "" });
                }}
                style={{ ...eingabe, flex: "0 0 40%", cursor: "pointer" }}
              >
                {producers.map(p => (
                  <option key={p.id} value={p.id ?? undefined}>{p.name}</option>
                ))}
              </select>
              <input
                value={c.contribution}
                onChange={e => aendern(i, { contribution: e.target.value })}
                placeholder="Guitarsample"
                title="Was er beigesteuert hat — steht so in der Beschreibung"
                style={{ ...eingabe, flex: 1 }}
              />
              <button
                onClick={() => entfernen(i)}
                title="Entfernen"
                style={{
                  background: "transparent", border: `1px solid ${C.border15}`,
                  borderRadius: 6, color: C.onSurfaceVariant,
                  cursor: "pointer", display: "flex", padding: 6,
                }}
              >
                <X size={12} />
              </button>
            </div>
          ))}

          {frei.length > 0 && (
            <button
              onClick={hinzufuegen}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "8px 0", borderRadius: 6,
                background: "transparent", border: `1px dashed ${C.border20}`,
                color: C.onSurfaceVariant, cursor: "pointer",
                fontSize: 11, fontWeight: 600,
              }}
            >
              <Plus size={12} strokeWidth={2} />
              Sample-Geber hinzufügen
            </button>
          )}
        </div>
      )}
    </SectionCard>
  );
}
