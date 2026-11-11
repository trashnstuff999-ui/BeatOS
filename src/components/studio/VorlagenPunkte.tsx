// src/components/studio/VorlagenPunkte.tsx
// Menüpunkte für FL-Vorlagen: einer pro FLP, Beschriftung = Dateiname.
// Leer: ein gesperrter Punkt mit dem Ordner, in den die Vorlage gehört.

import { FilePlus2 } from "lucide-react";
import { MenuePunkt } from "../ui";
import { C } from "../../lib/theme";
import type { FlVorlage } from "../../lib/api";

export function VorlagenPunkte({ vorlagen, ordner, hint, onPick }: {
  vorlagen: FlVorlage[];
  /** Für den Leer-Hinweis, z. B. „Sample" oder „Recording oder FL/Mix-Master" */
  ordner: string;
  hint?: string;
  onPick: (pfad: string) => void;
}) {
  if (vorlagen.length === 0) {
    return <MenuePunkt icon={FilePlus2} label="Keine Vorlage" hint={`In FL/${ordner} ablegen`} disabled onClick={() => {}} />;
  }
  return (<>
    {vorlagen.map(v => (
      <MenuePunkt key={v.pfad} icon={FilePlus2} label={v.name} hint={hint} onClick={() => onPick(v.pfad)} />
    ))}
  </>);
}

/** Kleine Überschrift über einer Gruppe im Menü. */
export function MenueGruppe({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "8px 10px 2px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.onSurfaceVariant }}>
      {children}
    </div>
  );
}
