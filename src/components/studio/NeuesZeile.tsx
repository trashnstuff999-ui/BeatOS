// src/components/studio/NeuesZeile.tsx
// Scheibe 6: In FL ohne BeatOS gespeichert („dont cry 150 bm“) → hier erscheint
// es mit Nummer und Namen nach der Regel. Übernehmen benennt um. Solange FL das
// Projekt offen hat, gesperrt: FL legte beim nächsten Speichern den alten Ordner neu an.

import { useCallback, useEffect, useRef, useState } from "react";
import { C, alpha, radius } from "../../lib/theme";
import { api, type NeuGefunden } from "../../lib/api";
import { useDialog } from "../../contexts/DialogContext";
import { useFocusRefresh } from "../../hooks/useFocusRefresh";
import { Button } from "../ui";

export function NeuesZeile({ onUebernommen, nurSamples }: { onUebernommen: () => void; nurSamples?: boolean }) {
  const { melde } = useDialog();
  const [liste, setListe] = useState<NeuGefunden[]>([]);
  const [titel, setTitel] = useState<Record<string, string>>({});
  const [laeuft, setLaeuft] = useState<string | null>(null);

  // Von selbst versucht und gescheitert: bleibt als Zeile stehen, kein zweiter Anlauf
  const gescheitert = useRef(new Set<string>());
  const autoLaeuft = useRef(false);

  const laden = useCallback(async () => {
    const lesen = async () => ((await api.studio.scanNeues().catch(() => [])) ?? []).filter(n => !nurSamples || n.sample);
    const l = await lesen();
    setListe(l);
    // Fertige Samples (Name komplett, in FL zu, Export ruht) ohne Klick einordnen
    const fertig = l.filter(n => n.fertig && !gescheitert.current.has(n.pfad));
    if (fertig.length === 0 || autoLaeuft.current) return;
    autoLaeuft.current = true;
    for (const n of fertig) {
      await api.studio.neuUebernehmen(n.pfad, n.titel).catch(() => gescheitert.current.add(n.pfad));
    }
    autoLaeuft.current = false;
    onUebernommen();
    setListe(await lesen());
  }, [onUebernommen, nurSamples]);
  useEffect(() => { laden(); }, [laden]);
  useFocusRefresh(() => { laden(); }, 2_000);

  if (liste.length === 0) return null;

  const uebernehmen = async (n: NeuGefunden) => {
    setLaeuft(n.pfad);
    try {
      await api.studio.neuUebernehmen(n.pfad, titel[n.pfad] ?? n.titel);
      onUebernommen();
    } catch (e) {
      melde(String(e));
    } finally {
      setLaeuft(null);
      laden();
    }
  };

  return (
    <div className="sw-neu" style={{
      margin: "12px 0 24px", padding: "14px 18px", borderRadius: 16,
      border: `1px solid ${alpha(C.primary, 0.5)}`, background: alpha(C.primary, 0.08),
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      {liste.map(n => (
        <div key={n.pfad} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: C.primary }}>
            {n.sample ? "NEUES SAMPLE" : "NEU"}
          </span>
          <span title={n.pfad} style={{ color: C.onSurfaceVariant, minWidth: 120 }}>
            {n.spuren ? (n.spuren === 1 ? "1 Spur" : `${n.spuren} Spuren`) : `${n.alt}${n.lose ? ".flp" : ""}`}
          </span>
          <span style={{ color: C.onSurfaceVariant }}>→</span>
          <span style={{ fontWeight: 700, color: C.onSurface }}>{n.nummer} -</span>
          <input
            value={titel[n.pfad] ?? n.titel}
            onChange={e => setTitel(t => ({ ...t, [n.pfad]: e.target.value }))}
            onKeyDown={e => { if (e.key === "Enter" && !n.in_fl) uebernehmen(n); }}
            aria-label="Neuer Name"
            style={{
              flex: "1 1 220px", minWidth: 180, padding: "6px 8px", fontSize: 12, fontWeight: 700, fontFamily: "inherit",
              background: C.surfaceContainerLowest, color: C.onSurface, outline: "none",
              border: `1px solid ${C.border20}`, borderRadius: radius.control,
            }}
          />
          {n.in_fl && <span style={{ color: C.onSurfaceVariant }}>In FL offen</span>}
          <Button size="sm" variant="primary" disabled={n.in_fl || laeuft !== null} loading={laeuft === n.pfad}
            title={n.in_fl ? "Erst ein anderes Projekt öffnen oder FL schließen" : undefined}
            onClick={() => uebernehmen(n)}>
            Übernehmen
          </Button>
        </div>
      ))}
    </div>
  );
}
