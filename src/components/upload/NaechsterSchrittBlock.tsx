// src/components/upload/NaechsterSchrittBlock.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Rechts im Kopf des Upload-Tabs: was bei diesem Beat als Nächstes ansteht,
// und ein Knopf, der genau dorthin führt. Welcher Schritt dran ist, entscheidet
// `naechsterSchritt` (lib/uploadReady.ts) — hier steht nur die Darstellung.
//
// Ist alles hochgeladen, gibt es keinen Knopf: der Beat ist erledigt.
// ═══════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { CheckCircle2, CalendarPlus, ArrowDown, ImagePlus, FolderOpen, Rocket } from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { C } from "../../lib/theme";
import { api } from "../../lib/api";
import { useSettings } from "../../contexts/SettingsContext";
import { Button } from "../ui/Button";
import { tageRelativ } from "../../lib/time";
import { parseRhythmus, naechsterFreierTag, toISO, addDays } from "../../lib/planung";
import { uploadAktion, type NaechsterSchritt } from "../../lib/uploadReady";

const WOCHENTAG = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
/** "2026-10-21" → "Mi 21.10." */
const kurzDatum = (iso: string) =>
  `${WOCHENTAG[new Date(iso + "T00:00").getDay()]} ${Number(iso.slice(8))}.${Number(iso.slice(5, 7))}.`;

export function NaechsterSchrittBlock({ schritt, beatId, beatPath, onChanged, onPlanungOeffnen }: {
  schritt: NaechsterSchritt;
  beatId: string;
  beatPath: string;
  onChanged: () => void;
  onPlanungOeffnen: () => void;
}) {
  const { settings } = useSettings();
  const [vorschlag, setVorschlag] = useState<string | null>(null);
  const [plant, setPlant] = useState(false);

  // Nur wenn ein Termin fehlt: den nächsten freien Upload-Tag aus dem
  // Rhythmus suchen — dieselbe Regel wie in der Planungs-Leiste.
  useEffect(() => {
    setVorschlag(null);
    const rhythmus = parseRhythmus(settings.uploadDays);
    if (schritt.art !== "termin" || rhythmus.length === 0) return;
    let abgebrochen = false;
    const heute = new Date();
    api.upload.getSchedule(toISO(heute), toISO(addDays(heute, 13)))
      .then(e => {
        if (!abgebrochen) setVorschlag(naechsterFreierTag(rhythmus, new Set(e.map(x => x.date)), heute));
      })
      .catch(() => {});
    return () => { abgebrochen = true; };
  }, [schritt.art, settings.uploadDays, beatId]);

  const planenAm = async (iso: string) => {
    setPlant(true);
    try { await api.upload.scheduleRelease(beatId, iso); onChanged(); }
    catch (e) { console.error("[Kopf] Planen fehlgeschlagen:", e); }
    finally { setPlant(false); }
  };

  let titel: string;
  let unter: string | null = null;
  let farbe: string = C.onSurface;
  let knopf: React.ReactNode = null;

  switch (schritt.art) {
    case "infos":
      titel = "Infos ausfüllen";
      unter = "Artists und Genres fehlen";
      knopf = (
        <Button variant="secondary" size="sm" icon={ArrowDown}
          onClick={() => document.getElementById("upload-infos")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
          Zu den Infos
        </Button>
      );
      break;
    case "audio":
      titel = "Audio fehlt";
      unter = "Aus FL Studio exportieren oder hierher ziehen";
      knopf = (
        <Button variant="secondary" size="sm" icon={FolderOpen} onClick={() => openPath(beatPath).catch(() => {})}>
          Ordner öffnen
        </Button>
      );
      break;
    case "cover":
      titel = "Cover fehlt";
      unter = "Aus dem Asset-Ordner zuweisen oder hierher ziehen";
      knopf = (
        <Button variant="primary" size="sm" icon={ImagePlus} onClick={() => uploadAktion({ art: "cover" })}>
          Cover zuweisen
        </Button>
      );
      break;
    case "termin":
      titel = "Bereit · noch kein Termin";
      knopf = vorschlag ? (
        <Button variant="primary" size="sm" icon={CalendarPlus} loading={plant} onClick={() => planenAm(vorschlag)}
          title="Nächster freier Upload-Tag">
          Am {kurzDatum(vorschlag)} planen
        </Button>
      ) : (
        <Button variant="secondary" size="sm" icon={CalendarPlus} onClick={onPlanungOeffnen}>
          Planen
        </Button>
      );
      break;
    case "geplant": {
      const heute = toISO(new Date());
      titel = `Geplant für ${kurzDatum(schritt.datum)}`;
      unter = tageRelativ(schritt.datum);
      if (schritt.datum <= heute) {
        farbe = C.primary;
        knopf = (
          <Button variant="primary" size="sm" icon={Rocket} onClick={() => uploadAktion({ art: "release" })}>
            Release starten
          </Button>
        );
      }
      break;
    }
    case "fertig":
      titel = "Überall hochgeladen";
      unter = schritt.datum ? tageRelativ(schritt.datum) : null;
      farbe = C.mint;
      break;
  }

  const ausstehend = schritt.art === "infos" || schritt.art === "audio" || schritt.art === "cover";

  return (
    <div style={{
      flexShrink: 0, minWidth: 220, maxWidth: 300,
      display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center",
      gap: 6, textAlign: "right",
    }}>
      {ausstehend && (
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.onSecondaryFixedVar }}>
          Als Nächstes
        </span>
      )}
      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 700, color: farbe }}>
        {schritt.art === "fertig" && <CheckCircle2 size={16} strokeWidth={2} />}
        {titel}
      </span>
      {unter && <span style={{ fontSize: 12, color: C.onSurfaceVariant }}>{unter}</span>}
      {knopf && <div style={{ marginTop: 4 }}>{knopf}</div>}
    </div>
  );
}
