// src/components/browse/GelbAnsicht.tsx
// Gelb in den Fundstücken: Einträge, bei denen BeatOS nicht raten will.
// In Gruppen nach Grund, „ohne Titel“ zuletzt. Je Eintrag: Song (mit Titel
// ins Archiv), Loop (nach 06_SAMPLES), Gleich wie … (Reste in einen Archiv-
// Beat) oder Weg (bleibt im Altbestand). Gemischte Einträge (zwei Songs
// gleichen Namens) werden nach Titel/Key/BPM aufgeteilt: nie zusammenlegen.

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { C, radius } from "../../lib/theme";
import { Button, Segmented } from "../ui";
import type { Fund, FundDatei, EinsammelArt } from "../../types/fundstuecke";

/** Reihenfolge der Gruppen; was hier fehlt, kommt vor „ohne Titel“ */
const GRUPPEN: { grund: string; name: string }[] = [
  { grund: "mehrere Titel im Projekt", name: "Ein Projekt, mehrere Titel" },
  { grund: "Key/BPM uneinheitlich", name: "Mehrere Songs unter einem Titel" },
  { grund: "Nummer mit mehreren Titeln", name: "Eine Nummer, mehrere Titel" },
  { grund: "gleicher Titel im Archiv, anderer Key/BPM", name: "Titel schon im Archiv, anderer Key" },
  { grund: "Nummer im Archiv mit anderem Titel", name: "Nummer schon im Archiv, anderer Titel" },
  { grund: "Titel mehrfach im Archiv", name: "Titel mehrfach im Archiv" },
  { grund: "nur Nummer", name: "Nur Nummer, kein Name" },
  { grund: "ohne Nummer", name: "Ohne Nummer" },
];
const ZULETZT = { grund: "ohne Titel", name: "Ohne Titel (Bounces)" };
const AUFTEILEN = new Set(["Key/BPM uneinheitlich", "Nummer mit mehreren Titeln"]);

/** Gemischte Einträge in Teile mit gleichem Titel/Key/BPM zerlegen.
 *  Datei ohne Key/BPM (meist FLP) kommt zum einzigen Teil aus ihrem Ordner,
 *  sonst bildet sie einen eigenen Teil: wohin sie gehört, weiß nur das Ohr.
 *  Teile, die schon ganz im Archiv liegen, fallen weg. */
export function aufteilen(f: Fund): Fund[] {
  if (!AUFTEILEN.has(f.grund)) return [f];
  const teile = new Map<string, Fund["dateien"]>();
  const dazu = (k: string, d: FundDatei) => teile.set(k, [...(teile.get(k) ?? []), d]);
  const ohne = f.dateien.filter(d => !d.key && !d.bpm);
  for (const d of f.dateien) if (d.key || d.bpm) dazu([d.titel?.toLowerCase() ?? "", d.key?.toLowerCase() ?? "", d.bpm].join("|"), d);
  const ordner = (p: string) => p.replace(/[\\/][^\\/]*$/, "");
  for (const d of ohne) {
    const passend = [...teile.keys()].filter(k => !k.startsWith("?") && teile.get(k)!.some(x => ordner(x.path) === ordner(d.path)));
    dazu(passend.length === 1 ? passend[0] : "?" + ordner(d.path), d);
  }
  for (const [k, ds] of teile) if (ds.every(d => d.im_archiv)) teile.delete(k);
  const liste = [...teile.values()];
  if (liste.length === 1 && liste[0].length === f.dateien.length) return [f];
  // Archiv-Beat für „Gleich wie“: der eine, in dem Dateien dieses Teils
  // liegen, sonst der eine, in dem Dateien aus denselben Ordnern liegen
  const einziger = (ds: FundDatei[]) => {
    const a = new Set(ds.map(d => d.archiv).filter(Boolean));
    return a.size === 1 ? [...a][0]! : null;
  };
  return liste.map(dateien => {
    const d = dateien.find(x => x.key || x.bpm) ?? dateien[0];
    const ordnerHier = new Set(dateien.map(x => ordner(x.path)));
    const archiv = einziger(dateien) ?? einziger(f.dateien.filter(x => ordnerHier.has(ordner(x.path))));
    return { ...f, titel: d.titel ?? f.titel, key: d.key, bpm: d.bpm, archiv, dateien };
  });
}

export const zeilenSchluessel = (f: Fund) => f.dateien[0].path;

interface Props {
  funde: Fund[];
  /** Zeile mit Abspielen, Titel, Details: kommt aus dem Dialog */
  Zeile: (p: { f: Fund }) => React.ReactElement;
  sammeln: (f: Fund, art: EinsammelArt, titel: string) => Promise<boolean>;
  weg: (fs: Fund[], weg: boolean) => Promise<void>;
  zeigeWeg: boolean;
  /** Namen in 05_ARTISTS, für den Knopf „Artist“ */
  artists: string[];
  zumArtist: (f: Fund, artist: string, song: string, assets: boolean) => Promise<boolean>;
  /** Mehrfachauswahl: jeder Eintrag ein eigener Song, Titel wie angezeigt */
  sammelnViele: (fs: Fund[]) => Promise<void>;
}

/** Was Gruppe und Zeile brauchen, in einem Bündel */
type Hilfe = Pick<Props, "Zeile" | "sammeln" | "weg" | "artists" | "zumArtist"> & {
  gewaehlt: Map<string, Fund>;
  waehlen: (fs: Fund[], an: boolean) => void;
};

/** Auswahl-Schlüssel: alle Dateien, denn „ganzer Song“ und seine erste Fassung beginnen gleich */
const auswahlSchluessel = (f: Fund) => f.dateien.map(d => d.path).join("|");

/** An- oder abwählen. Einträge mit gemeinsamen Dateien (ganzer Song und seine
 *  Fassungen) schließen sich aus: sonst würde eine Datei doppelt eingesammelt. */
export function auswahlUmschalten(alt: Map<string, Fund>, fs: Fund[], an: boolean): Map<string, Fund> {
  const n = new Map(alt);
  for (const f of fs) {
    if (!an) { n.delete(auswahlSchluessel(f)); continue; }
    const pfade = new Set(f.dateien.map(d => d.path));
    for (const [k, g] of n) if (g.dateien.some(d => pfade.has(d.path))) n.delete(k);
    n.set(auswahlSchluessel(f), f);
  }
  return n;
}

/** Von Hand zusammengelegt: alle Dateien in einem Eintrag. Titel der kürzeste
 *  („100 Tausend“ statt „100 Tausend_mix“), Archiv-Beat nur, wenn eindeutig. */
export function zusammenlegen(fs: Fund[]): Fund {
  const dateien = [...new Map(fs.flatMap(f => f.dateien).map(d => [d.path, d])).values()];
  const titel = fs.map(f => f.titel).filter(t => t.trim()).sort((a, b) => a.length - b.length)[0] ?? fs[0].titel;
  const archive = new Set(fs.map(f => f.archiv).filter(Boolean));
  return {
    ...fs[0], titel, grund: "zusammengelegt", dateien,
    id: fs.find(f => f.id != null)?.id ?? null,
    key: fs.find(f => f.key)?.key ?? null,
    bpm: fs.find(f => f.bpm)?.bpm ?? null,
    archiv: archive.size === 1 ? [...archive][0]! : null,
    nur_hier: dateien.filter(d => !d.im_archiv).length,
  };
}

export function GelbAnsicht({ funde, Zeile, sammeln, weg, zeigeWeg, artists, zumArtist, sammelnViele }: Props) {
  const [gewaehlt, setGewaehlt] = useState<Map<string, Fund>>(new Map());
  const [laeuft, setLaeuft] = useState(false);
  const [zusammen, setZusammen] = useState<Fund | null>(null);
  if (zeigeWeg) {
    const liste = funde.filter(f => f.weg);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {liste.length === 0 && <div style={{ padding: 16, fontSize: 13, color: C.onSurfaceVariant }}>Nichts weggelegt.</div>}
        {liste.map(f => (
          <div key={zeilenSchluessel(f)} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}><Zeile f={f} /></div>
            <Button size="sm" variant="ghost" onClick={() => weg([f], false)}>Zurückholen</Button>
          </div>
        ))}
      </div>
    );
  }
  // Je Eintrag seine Teile; ganz im Archiv liegende Einträge fallen weg
  // Zusammengelegtes verschwindet, sobald eine seiner Dateien erledigt ist
  const offenePfade = new Set(funde.filter(f => !f.weg).flatMap(f => f.dateien.map(d => d.path)));
  const zusammenOffen = zusammen && zusammen.dateien.every(d => offenePfade.has(d.path)) ? zusammen : null;
  const imZusammen = new Set(zusammenOffen?.dateien.map(d => d.path) ?? []);
  const offen = funde.filter(f => !f.weg && !f.dateien.some(d => imZusammen.has(d.path)))
    .map(f => ({ f, teile: aufteilen(f) })).filter(e => e.teile.length > 0);
  const bekannt = new Set([...GRUPPEN, ZULETZT].map(g => g.grund));
  const gruppen = [
    ...GRUPPEN.map(g => ({ ...g, liste: offen.filter(e => e.f.grund === g.grund) })),
    { grund: "", name: "Sonstige", liste: offen.filter(e => !bekannt.has(e.f.grund)) },
    { ...ZULETZT, liste: offen.filter(e => e.f.grund === ZULETZT.grund) },
  ].filter(g => g.liste.length > 0);

  // Nur, was noch angezeigt wird (eingesammelt oder weggelegt fällt raus)
  const sichtbar = new Set(offen.flatMap(e => [ganzerSong(e), ...e.teile]).map(auswahlSchluessel));
  const auswahl = [...gewaehlt].filter(([k]) => sichtbar.has(k)).map(([, f]) => f);
  const h: Hilfe = {
    Zeile, sammeln, weg, artists, zumArtist, gewaehlt,
    waehlen: (fs, an) => setGewaehlt(alt => auswahlUmschalten(alt, fs, an)),
  };
  const fertig = async (aktion: () => Promise<void>) => {
    setLaeuft(true);
    await aktion();
    setLaeuft(false);
    setGewaehlt(new Map());
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {auswahl.length > 0 && (
        <div style={{
          position: "sticky", top: 0, zIndex: 1, display: "flex", alignItems: "center", gap: 8,
          padding: "6px 8px", background: C.surfaceContainer, borderRadius: radius.control,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.onSurface, flex: 1 }}>{auswahl.length} ausgewählt</span>
          <Button size="sm" variant="ghost" onClick={() => setGewaehlt(new Map())}>Aufheben</Button>
          <Button size="sm" variant="secondary" disabled={laeuft || auswahl.length < 2} title="Ein Song, ein Projekt"
            onClick={() => { setZusammen(zusammenlegen(auswahl)); setGewaehlt(new Map()); }}>
            Zusammenlegen
          </Button>
          <Button size="sm" variant="secondary" disabled={laeuft} onClick={() => fertig(() => weg(auswahl, true))}>Weg</Button>
          <Button size="sm" variant="primary" disabled={laeuft} onClick={() => fertig(() => sammelnViele(auswahl))}>
            {laeuft ? "Sammle …" : `Ins Archiv (${auswahl.length})`}
          </Button>
        </div>
      )}
      {zusammenOffen && (
        <div style={{ border: `1px solid ${C.primary}`, borderRadius: radius.control, padding: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 8px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.onSurface, flex: 1 }}>
              Zusammengelegt · {zusammenOffen.dateien.length} Dateien
            </span>
            <Button size="sm" variant="ghost" onClick={() => setZusammen(null)}>Auflösen</Button>
          </div>
          <GelbZeile key={auswahlSchluessel(zusammenOffen)} f={zusammenOffen} h={h} />
        </div>
      )}
      {gruppen.map(g => <Gruppe key={g.name} name={g.name} liste={g.liste} h={h} />)}
    </div>
  );
}

type Eintrag = { f: Fund; teile: Fund[] };

/** Mehrere Fassungen: oben der ganze Song (eine Nummer für alle), darunter
 *  jede Fassung einzeln, falls es doch verschiedene Songs sind. */
export function ganzerSong(e: Eintrag): Fund {
  const dateien = e.teile.flatMap(t => t.dateien);
  const archive = new Set(e.teile.map(t => t.archiv).filter(Boolean));
  return { ...e.f, dateien, archiv: archive.size === 1 ? [...archive][0]! : null };
}

function Gruppe({ name, liste, h }: { name: string; liste: Eintrag[]; h: Hilfe }) {
  const [zu, setZu] = useState(false);
  // „Alle“ wählt je Eintrag die oberste Zeile (ganzer Song oder einzige Fassung)
  const oben = liste.map(e => e.teile.length === 1 ? e.teile[0] : ganzerSong(e));
  const alleGewaehlt = oben.every(f => h.gewaehlt.has(auswahlSchluessel(f)));
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <button onClick={() => setZu(!zu)} aria-expanded={!zu} style={{
          display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer",
          color: C.onSurface, fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", padding: 0,
        }}>
          {zu ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          {name} <span style={{ color: C.onSecondaryFixedVar, fontWeight: 600 }}>{liste.length}</span>
        </button>
        <span style={{ flex: 1 }} />
        <Button size="sm" variant="ghost" onClick={() => h.waehlen(oben, !alleGewaehlt)}>{alleGewaehlt ? "Keine" : "Alle wählen"}</Button>
        <Button size="sm" variant="ghost" onClick={() => h.weg(liste.flatMap(e => e.teile), true)}>Alle weg</Button>
      </div>
      {!zu && liste.map(e => e.teile.length === 1
        ? <GelbZeile key={zeilenSchluessel(e.teile[0])} f={e.teile[0]} h={h} />
        : (
          <div key={"ganz:" + zeilenSchluessel(e.f)}>
            <GelbZeile f={ganzerSong(e)} h={h} />
            <div style={{ marginLeft: 28, borderLeft: `2px solid ${C.border20}`, paddingLeft: 6 }}>
              <div style={{ fontSize: 11, color: C.onSecondaryFixedVar, padding: "2px 8px" }}>{e.teile.length} Fassungen einzeln</div>
              {e.teile.map(t => <GelbZeile key={zeilenSchluessel(t)} f={t} h={h} />)}
            </div>
          </div>
        ))}
    </div>
  );
}

const feld: React.CSSProperties = {
  flex: 1, padding: "6px 10px", fontSize: 13, fontFamily: "inherit",
  background: C.surfaceContainerLowest, color: C.onSurface, outline: "none",
  border: `1px solid ${C.border20}`, borderRadius: radius.control,
};

/** Artist und Song vorschlagen: „JarnoGm - TCI“ → JarnoGm / TCI, sonst ein
 *  Ordner im Pfad, der wie ein Artist heißt (Projects\JarnoGm\Behind her mind). */
export function artistVorschlag(f: Fund, artists: string[]): { artist: string; song: string } {
  const gleich = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const [vorn, ...rest] = f.titel.split(" - ");
  const ausTitel = rest.length > 0 ? artists.find(a => gleich(a, vorn)) : undefined;
  if (ausTitel) return { artist: ausTitel, song: rest.join(" - ").trim() };
  const teile = f.dateien.flatMap(d => d.path.split(/[\\/]/));
  return { artist: artists.find(a => teile.some(t => gleich(t, a))) ?? "", song: f.titel };
}

function GelbZeile({ f, h }: { f: Fund; h: Hilfe }) {
  const { Zeile, sammeln, weg, artists, zumArtist } = h;
  const gewaehlt = h.gewaehlt.has(auswahlSchluessel(f));
  const [modus, setModus] = useState<null | "archiv" | "sample" | "remix" | "artist">(null);
  const [titel, setTitel] = useState(f.titel);
  const [artist, setArtist] = useState("");
  // Artist: Exporte nach 03_VERSIONS, Vocals vom Künstler nach 02_ASSETS
  const [assets, setAssets] = useState<"versionen" | "assets">("versionen");
  const [laeuft, setLaeuft] = useState(false);
  const umschalten = (m: "archiv" | "sample" | "remix" | "artist") => {
    if (modus === m) { setModus(null); return; }
    if (m === "artist") {
      const v = artistVorschlag(f, artists);
      setArtist(v.artist); setTitel(v.song);
    } else if (modus === "artist") {
      setTitel(f.titel);
    }
    setModus(m);
  };
  const los = async () => {
    if (!modus || !titel.trim() || (modus === "artist" && !artist.trim())) return;
    setLaeuft(true);
    const ok = modus === "artist" ? await zumArtist(f, artist.trim(), titel.trim(), assets === "assets") : await sammeln(f, modus, titel.trim());
    setLaeuft(false);
    if (ok) setModus(null);
  };
  const tasten = (e: React.KeyboardEvent) => { if (e.key === "Enter") los(); if (e.key === "Escape") setModus(null); };
  const nr = f.archiv?.slice(0, 4);

  return (
    <div style={{ borderRadius: radius.control, background: modus ? C.surfaceContainer : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          type="checkbox" checked={gewaehlt} onChange={e => h.waehlen([f], e.target.checked)}
          aria-label={`${f.titel} auswählen`} style={{ accentColor: C.primary, width: 16, height: 16, marginLeft: 4, cursor: "pointer" }}
        />
        <div style={{ flex: 1, minWidth: 0 }}><Zeile f={f} /></div>
        {/* Nur FLPs ohne Export: kein eigener Song, nur Gleich wie oder Weg */}
        {f.dateien.some(d => !d.flp) && <>
          <Button size="sm" variant={modus === "archiv" ? "primary" : "secondary"} onClick={() => umschalten("archiv")}>Song</Button>
          <Button size="sm" variant={modus === "sample" ? "primary" : "secondary"} onClick={() => umschalten("sample")}>Loop</Button>
          <Button size="sm" variant={modus === "remix" ? "primary" : "secondary"} title="Nach 07_REMIXES" onClick={() => umschalten("remix")}>Remix</Button>
        </>}
        <Button size="sm" variant={modus === "artist" ? "primary" : "secondary"} onClick={() => umschalten("artist")}>Artist</Button>
        {f.archiv && (
          <Button size="sm" variant="secondary" title={`Fehlende Dateien nach ${f.archiv}/02_OLD`} disabled={laeuft}
            onClick={async () => { setLaeuft(true); await sammeln(f, "reste", f.titel); setLaeuft(false); }}>
            Gleich wie {nr}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => weg([f], true)}>Weg</Button>
      </div>
      {modus && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 8px 8px 48px" }}>
          {modus === "artist" && <>
            <input
              autoFocus={!artist} data-eigenes-esc value={artist} onChange={e => setArtist(e.target.value)}
              onKeyDown={tasten} list="fund-artists" aria-label="Artist" placeholder="Artist"
              style={{ ...feld, flex: "0 0 160px" }}
            />
            <datalist id="fund-artists">{artists.map(a => <option key={a} value={a} />)}</datalist>
          </>}
          <input
            autoFocus={modus !== "artist" || !!artist} data-eigenes-esc value={titel} onChange={e => setTitel(e.target.value)}
            onKeyDown={tasten}
            aria-label={modus === "sample" ? "Name des Loops" : "Songtitel"}
            placeholder={modus === "sample" ? "Name des Loops" : "Songtitel"}
            style={feld}
          />
          {modus === "artist" && (
            <Segmented label="Ziel für Audio" value={assets} onChange={setAssets}
              options={[{ value: "versionen", label: "Versionen", title: "03_VERSIONS: Mixe, Master" }, { value: "assets", label: "Assets", title: "02_ASSETS: Vocals, Demo" }]} />
          )}
          <span style={{ fontSize: 11, color: C.onSecondaryFixedVar }}>{[f.key, f.bpm].filter(Boolean).join(" ")}</span>
          <Button size="sm" variant="primary" onClick={los} disabled={laeuft || !titel.trim() || (modus === "artist" && !artist.trim())}>
            {laeuft ? "…" : modus === "archiv" ? "Ins Archiv" : modus === "sample" ? "Nach Samples" : modus === "remix" ? "Nach Remixe" : "Zum Artist"}
          </Button>
        </div>
      )}
    </div>
  );
}
