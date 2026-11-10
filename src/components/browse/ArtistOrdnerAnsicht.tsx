// src/components/browse/ArtistOrdnerAnsicht.tsx
// Artist-Ordner im Altbestand (Ordner „Artists“, etwa Image-Line\…\Songs\Artists):
// den überspringt der Fundstücke-Scan, hier zieht je Artist/Song der ganze
// Ordner nach 05_ARTISTS. Nur kopieren, nichts überschreiben, Altbestand bleibt.

import { useCallback, useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { api } from "../../lib/api";
import { C, radius } from "../../lib/theme";
import { Button, IconButton, Segmented } from "../ui";
import { useDialog } from "../../contexts/DialogContext";
import type { AltArtistSong } from "../../types/fundstuecke";

const feld: React.CSSProperties = {
  padding: "5px 8px", fontSize: 13, fontFamily: "inherit", minWidth: 0,
  background: C.surfaceContainerLowest, color: C.onSurface, outline: "none",
  border: `1px solid ${C.border20}`, borderRadius: radius.control,
};

/** Ordnername auf einen vorhandenen Artist abbilden (Schreibweise aus 05_ARTISTS) */
export const artistZuordnen = (name: string, artists: string[]) =>
  artists.find(a => a.toLowerCase() === name.trim().toLowerCase()) ?? name;

export function ArtistOrdnerAnsicht({ roots, artistsRoot, artists }: { roots: string[]; artistsRoot: string; artists: string[] }) {
  const { frage, melde } = useDialog();
  const [liste, setListe] = useState<AltArtistSong[] | null>(null);
  const [namen, setNamen] = useState<Record<string, { artist: string; song: string }>>({});
  const [zeige, setZeige] = useState<"offen" | "fertig">("offen");
  const [laeuft, setLaeuft] = useState<string | null>(null);
  // In dieser Sitzung kopiert: auch Ordner ohne Audio/FLP (Branding, Cover)
  const [kopiert, setKopiert] = useState<Set<string>>(new Set());
  const schluessel = roots.join("|");

  const laden = useCallback(() => {
    setListe(null);
    api.archive.artistOrdnerAltbestand(roots, artistsRoot).then(setListe, e => melde(String(e), "fehler"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schluessel, artistsRoot]);
  useEffect(laden, [laden]);

  if (!liste) return <div style={{ padding: "24px 4px", fontSize: 13, color: C.onSurfaceVariant }}>Suche Artist-Ordner …</div>;
  const wert = (s: AltArtistSong) => namen[s.pfad] ?? { artist: artistZuordnen(s.artist, artists), song: s.song };
  const fertig = (s: AltArtistSong) => kopiert.has(s.pfad) || (s.dateien > 0 && s.da >= s.dateien);
  const offen = liste.filter(s => !fertig(s));
  const sichtbar = zeige === "offen" ? offen : liste.filter(fertig);
  const bereit = offen.filter(s => wert(s).artist.trim() && wert(s).song.trim());

  const kopieren = async (s: AltArtistSong): Promise<boolean> => {
    const { artist, song } = wert(s);
    setLaeuft(s.pfad);
    try {
      const r = await api.archive.artistOrdnerKopieren(s.pfad, artistsRoot, artist.trim(), song.trim());
      if (r.konflikte.length) {
        melde(`${song}: ${r.kopiert} kopiert, ${r.konflikte.length} nicht überschrieben (anderer Inhalt): ${r.konflikte[0]}`, "fehler");
      } else {
        setListe(l => l && l.map(x => x.pfad === s.pfad ? { ...x, da: x.dateien } : x));
        setKopiert(k => new Set([...k, s.pfad]));
      }
      return r.konflikte.length === 0;
    } catch (e) {
      melde(`${song}: ${String(e)}`, "fehler");
      return false;
    } finally {
      setLaeuft(null);
    }
  };

  const alleKopieren = async () => {
    const ok = await frage({
      titel: `${bereit.length} Song-Ordner nach 05_ARTISTS`,
      text: "Jeder Ordner wird komplett kopiert, mit Audio, Samples und Backups. Nichts wird überschrieben, der Altbestand bleibt.",
      bestaetigen: "Kopieren",
    });
    if (!ok) return;
    let n = 0;
    for (const s of bereit) if (await kopieren(s)) n++;
    melde(`${n} von ${bereit.length} kopiert`, n === bereit.length ? "erfolg" : "info");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Segmented label="Artist-Ordner" value={zeige} onChange={setZeige}
          options={[{ value: "offen", label: `Offen ${offen.length}` }, { value: "fertig", label: `In 05_ARTISTS ${liste.length - offen.length}` }]} />
        <span style={{ flex: 1 }} />
        {zeige === "offen" && (
          <Button size="sm" variant="primary" disabled={!!laeuft || bereit.length === 0} onClick={alleKopieren}>
            {laeuft ? "Kopiere …" : `Alle kopieren (${bereit.length})`}
          </Button>
        )}
      </div>
      <datalist id="artist-ordner-artists">{artists.map(a => <option key={a} value={a} />)}</datalist>
      {sichtbar.length === 0 && <div style={{ padding: 16, fontSize: 13, color: C.onSurfaceVariant }}>{zeige === "offen" ? "Alles in 05_ARTISTS." : "Noch nichts kopiert."}</div>}
      {sichtbar.map(s => {
        const w = wert(s);
        const setze = (teil: Partial<typeof w>) => setNamen(n => ({ ...n, [s.pfad]: { ...w, ...teil } }));
        return (
          <div key={s.pfad} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", borderRadius: radius.control }}>
            <input value={w.artist} onChange={e => setze({ artist: e.target.value })} list="artist-ordner-artists"
              placeholder="Artist" aria-label="Artist" style={{ ...feld, flex: "0 0 150px" }} disabled={fertig(s)} />
            <input value={w.song} onChange={e => setze({ song: e.target.value })}
              placeholder="Song" aria-label="Song" style={{ ...feld, flex: 1 }} disabled={fertig(s)} />
            <span style={{ fontSize: 11, color: C.onSecondaryFixedVar, whiteSpace: "nowrap" }} title={s.pfad}>
              {s.dateien} Dateien · {s.flps} FLP{s.da > 0 && !fertig(s) ? ` · ${s.da} schon da` : ""}
            </span>
            <IconButton icon={FolderOpen} title={s.pfad} onClick={() => openPath(s.pfad.replace(/[\\/][^\\/]*\.[^\\/.]+$/, "")).catch(() => {})} />
            {!fertig(s) && (
              <Button size="sm" variant="secondary" disabled={!!laeuft || !w.artist.trim() || !w.song.trim()} onClick={() => kopieren(s)}>
                {laeuft === s.pfad ? "…" : "Kopieren"}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
