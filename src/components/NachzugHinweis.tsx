// Meldung, wenn BeatOS nach einer Sample-Umbenennung die Beats nachzieht
// (Ereignis `beats-nachgezogen` aus studio/neu.rs, nachzug_melden).

import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { X } from "lucide-react";
import { C, alpha, radius } from "../lib/theme";

interface Nachzug { geaendert: number; offen: string[]; fehler: string[] }

const beats = (n: number) => (n === 1 ? "1 Beat" : `${n} Beats`);

export function NachzugHinweis() {
  const [n, setN] = useState<Nachzug | null>(null);

  useEffect(() => {
    const aus = listen<Nachzug>("beats-nachgezogen", (e) => setN(e.payload));
    return () => { aus.then((f) => f()); };
  }, []);

  // Nur Erfolg blendet sich aus; Warten und Fehler bleiben stehen
  useEffect(() => {
    if (!n || n.offen.length || n.fehler.length) return;
    const t = setTimeout(() => setN(null), 6000);
    return () => clearTimeout(t);
  }, [n]);

  if (!n) return null;
  const zeilen: string[] = [];
  if (n.geaendert) zeilen.push(`Samplepfade in ${beats(n.geaendert)} angepasst`);
  if (n.offen.length) zeilen.push(`In FL offen: ${n.offen.join(", ")}. Pfade folgen nach dem Schließen.`);
  if (n.fehler.length) zeilen.push(`Nicht angepasst: ${n.fehler.join("; ")}`);
  const farbe = n.fehler.length ? C.error : n.offen.length ? C.primary : C.mint;

  return (
    <div role="status" style={{
      position: "fixed", right: 24, bottom: 104, zIndex: 100, maxWidth: 420,
      background: C.surfaceContainerHigh, color: C.onSurface,
      border: `1px solid ${alpha(farbe, 0.5)}`, borderLeft: `4px solid ${farbe}`,
      borderRadius: radius.card, padding: "12px 14px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      display: "flex", gap: 10, alignItems: "flex-start",
    }}>
      <div style={{ flex: 1, fontSize: 13, lineHeight: 1.45 }}>
        {zeilen.map((z) => <div key={z}>{z}</div>)}
      </div>
      <button onClick={() => setN(null)} aria-label="Schließen" style={{
        background: "transparent", border: "none", color: C.onSurfaceVariant, cursor: "pointer", padding: 2,
      }}>
        <X size={16} />
      </button>
    </div>
  );
}
