// src/components/browse/GelbAnsicht.tsx
// Gelb in den Fundstücken: Einträge, bei denen BeatOS nicht raten will.
// In Gruppen nach Grund, „ohne Titel“ zuletzt. Je Eintrag: Song (mit Titel
// ins Archiv), Loop (nach 06_SAMPLES), Gleich wie … (Reste in einen Archiv-
// Beat) oder Weg (bleibt im Altbestand). Gemischte Einträge (zwei Songs
// gleichen Namens) werden nach Titel/Key/BPM aufgeteilt: nie zusammenlegen.

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { C, radius } from "../../lib/theme";
import { Button } from "../ui";
import type { Fund, FundDatei, EinsammelArt } from "../../types/fundstuecke";

/** Reihenfolge der Gruppen; was hier fehlt, kommt vor „ohne Titel“ */
const GRUPPEN: { grund: string; name: string }[] = [
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
}

export function GelbAnsicht({ funde, Zeile, sammeln, weg, zeigeWeg }: Props) {
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
  const offen = funde.filter(f => !f.weg).flatMap(aufteilen);
  const bekannt = new Set([...GRUPPEN, ZULETZT].map(g => g.grund));
  const gruppen = [
    ...GRUPPEN.map(g => ({ ...g, liste: offen.filter(f => f.grund === g.grund) })),
    { grund: "", name: "Sonstige", liste: offen.filter(f => !bekannt.has(f.grund)) },
    { ...ZULETZT, liste: offen.filter(f => f.grund === ZULETZT.grund) },
  ].filter(g => g.liste.length > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {gruppen.map(g => <Gruppe key={g.name} name={g.name} liste={g.liste} Zeile={Zeile} sammeln={sammeln} weg={weg} />)}
    </div>
  );
}

function Gruppe({ name, liste, Zeile, sammeln, weg }: { name: string; liste: Fund[] } & Pick<Props, "Zeile" | "sammeln" | "weg">) {
  const [zu, setZu] = useState(false);
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
        <Button size="sm" variant="ghost" onClick={() => weg(liste, true)}>Alle weg</Button>
      </div>
      {!zu && liste.map(f => <GelbZeile key={zeilenSchluessel(f)} f={f} Zeile={Zeile} sammeln={sammeln} weg={weg} />)}
    </div>
  );
}

function GelbZeile({ f, Zeile, sammeln, weg }: { f: Fund } & Pick<Props, "Zeile" | "sammeln" | "weg">) {
  const [modus, setModus] = useState<null | "archiv" | "sample">(null);
  const [titel, setTitel] = useState(f.titel);
  const [laeuft, setLaeuft] = useState(false);
  const los = async () => {
    if (!modus || !titel.trim()) return;
    setLaeuft(true);
    const ok = await sammeln(f, modus, titel.trim());
    setLaeuft(false);
    if (ok) setModus(null);
  };
  const nr = f.archiv?.slice(0, 4);

  return (
    <div style={{ borderRadius: radius.control, background: modus ? C.surfaceContainer : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}><Zeile f={f} /></div>
        <Button size="sm" variant={modus === "archiv" ? "primary" : "secondary"} onClick={() => setModus(modus === "archiv" ? null : "archiv")}>Song</Button>
        <Button size="sm" variant={modus === "sample" ? "primary" : "secondary"} onClick={() => setModus(modus === "sample" ? null : "sample")}>Loop</Button>
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
          <input
            autoFocus value={titel} onChange={e => setTitel(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") los(); if (e.key === "Escape") setModus(null); }}
            aria-label={modus === "archiv" ? "Songtitel" : "Name des Loops"}
            placeholder={modus === "archiv" ? "Songtitel" : "Name des Loops"}
            style={{
              flex: 1, padding: "6px 10px", fontSize: 13, fontFamily: "inherit",
              background: C.surfaceContainerLowest, color: C.onSurface, outline: "none",
              border: `1px solid ${C.border20}`, borderRadius: radius.control,
            }}
          />
          <span style={{ fontSize: 11, color: C.onSecondaryFixedVar }}>{[f.key, f.bpm].filter(Boolean).join(" ")}</span>
          <Button size="sm" variant="primary" onClick={los} disabled={laeuft || !titel.trim()}>
            {laeuft ? "…" : modus === "archiv" ? "Ins Archiv" : "Nach Samples"}
          </Button>
        </div>
      )}
    </div>
  );
}
