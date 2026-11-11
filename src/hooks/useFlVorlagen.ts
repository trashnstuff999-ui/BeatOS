// src/hooks/useFlVorlagen.ts
// Vorlagen für „Neu": jede FLP in 02_LIBRARY_ASSETS/01_TEMPLATES/FL/<Typ>/.
// Neu eingelesen beim Zurückwechseln, damit eine abgelegte Vorlage ohne
// Neustart im Menü steht.

import { useCallback, useEffect, useState } from "react";
import { api, type FlVorlage } from "../lib/api";
import { useSettings, vorlagenOrdner } from "../contexts/SettingsContext";
import { useFocusRefresh } from "./useFocusRefresh";

/** Ordner → Art der Vorlage. Recording und Mix-Master sind beide Künstler-Songs. */
export const VORLAGE_TYP: Record<string, "beat" | "sample" | "kuenstler"> = {
  "Beat": "beat",
  "Sample": "sample",
  "Recording": "kuenstler",
  "Mix-Master": "kuenstler",
};

export function useFlVorlagen() {
  const { settings } = useSettings();
  const dir = vorlagenOrdner(settings.archivePath);
  const [vorlagen, setVorlagen] = useState<FlVorlage[]>([]);
  const laden = useCallback(() => {
    if (!dir) { setVorlagen([]); return; }
    api.studio.flVorlagen(dir).then(v => setVorlagen(v ?? [])).catch(() => setVorlagen([]));
  }, [dir]);
  useEffect(laden, [laden]);
  useFocusRefresh(laden, 2_000);
  const von = (typ: "beat" | "sample" | "kuenstler") => vorlagen.filter(v => VORLAGE_TYP[v.ordner] === typ);
  return { dir, von };
}
