// src/components/studio/ArtistsPane.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Studio → Künstler: Mix-&-Master-Projekte für Künstler, je Künstler die Songs.
//
// Scheibe 1 (nur lesen): je Song ein Häkchen pro Baustein — FLP, Vocals,
// Demo, Beat, Mix, Master —, abgeleitet aus den Dateien im Song-Ordner
// (Regeln in commands/artists.rs). Fehlt etwas, sieht man es. Abgegebene
// Songs (<Künstler>/_Fertig/) stehen zugeklappt darunter.
// Scheibe 6: Künstler-Ordner, die noch im Archiv liegen, umziehen — mit
// Vorschau, verschoben wird erst auf Klick.
// Scheibe 2: „Neuer Künstler" (Ordner) und „Neuer Song" (Ordner, Template-FLP,
// Assets/). Scheibe 3: Klick auf einen Song klappt Notiz und Status auf —
// „In Arbeit" oder „Warte auf Künstler" (Tabelle artist_songs).
// Plan und nächste Scheiben: docs/kuenstler-projekte.md.
// ═══════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from "react";
import { Users, FolderOpen, FolderPlus, ChevronDown, Check, Mic2, FolderInput, ArrowRight, X, Plus, UserPlus, Hourglass, Send, Undo2, Wrench, AlertTriangle } from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { C, alpha, radius } from "../../lib/theme";
import { api } from "../../lib/api";
import { formatRelativeTime, tageRelativ } from "../../lib/time";
import { useFocusRefresh } from "../../hooks/useFocusRefresh";
import { useSettings } from "../../contexts/SettingsContext";
import { EmptyState, Button, IconButton, Modal, Segmented, Select } from "../ui";
import { passtZumSong, pfadSchluessel } from "../../lib/kuenstler";
import type { Artist, ArtistSong, ArtistsScan, Altbestand } from "../../types/artists";
import { getCurrentWebview } from "@tauri-apps/api/webview";

type Download = { name: string; path: string; geaendert: number };
/** Was jede Song-Zeile fürs Reinziehen und die Download-Vorschläge braucht. */
type ZeilenDrop = {
  downloads: Download[];
  ziehen: { pfad: string | null; anzahl: number } | null;
  uebernehmen: (songPfad: string, pfade: string[]) => void;
};

const BAUSTEINE: { key: keyof Pick<ArtistSong, "flp" | "vocals" | "demo" | "beat" | "mix" | "master">; label: string; titel: string }[] = [
  { key: "flp", label: "FLP", titel: "FL-Projekt im Song-Ordner" },
  { key: "vocals", label: "Vocals", titel: "Audiodatei mit „Vocal\" im Namen (Assets/, Audio/ oder Song-Ordner)" },
  { key: "demo", label: "Demo", titel: "In Assets/ eine Audiodatei, die wie der Song heißt" },
  { key: "beat", label: "Beat", titel: "In Assets/ eine weitere Audiodatei (weder Vocals noch Demo)" },
  { key: "mix", label: "Mix", titel: "Ein Export im Song-Ordner" },
  { key: "master", label: "Master", titel: "Eine Audiodatei mit „Master\" im Namen" },
];

export function ArtistsPane({ root, archivePath, active }: { root: string; archivePath: string; active: boolean }) {
  const [scan, setScan] = useState<ArtistsScan | null>(null);
  const [altbestand, setAltbestand] = useState<Altbestand[]>([]);
  const [umzugOffen, setUmzugOffen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [legtAn, setLegtAn] = useState(false);
  // Offener Anlege-Dialog.
  const [neu, setNeu] = useState<"kuenstler" | "song" | null>(null);
  const { settings } = useSettings();

  const laden = useCallback(() => {
    if (!root) return;
    api.artists.scan(root)
      .then(s => { setScan(s); setFehler(null); })
      .catch(e => setFehler(String(e)));
    if (archivePath) api.artists.altbestand(archivePath).then(setAltbestand).catch(() => setAltbestand([]));
  }, [root, archivePath]);

  // Downloads für die Vorschläge an bestehenden Songs; mit jedem Laden neu.
  const [downloads, setDownloads] = useState<Download[]>([]);
  const ladenMitDownloads = useCallback(() => {
    laden();
    api.artists.downloads(settings.downloadsPath).then(setDownloads).catch(() => setDownloads([]));
  }, [laden, settings.downloadsPath]);

  useEffect(() => { if (active) ladenMitDownloads(); }, [active, ladenMitDownloads]);
  // Zurück aus dem Explorer oder aus Discord: neu lesen, nur wenn der Tab offen ist.
  useFocusRefresh(() => { if (active) ladenMitDownloads(); });

  // Dateien in Assets/ — per Ziehen oder per Vorschlag. Was nicht ging, steht oben.
  const [meldung, setMeldung] = useState<string | null>(null);
  const uebernehmen = useCallback(async (songPfad: string, pfade: string[]) => {
    try {
      const schief = (await api.artists.assetsFuellen(songPfad, pfade)).filter(e => !e.ok);
      setMeldung(schief.length ? `Nicht übernommen: ${schief.map(e => `${e.pfad.split(/[\\/]/).pop()} ${e.meldung}`).join("; ")}` : null);
    } catch (e) {
      setMeldung(String(e));
    }
    ladenMitDownloads();
  }, [ladenMitDownloads]);

  // Aus dem Explorer auf eine Song-Zeile ziehen: die Zeile unter dem Zeiger
  // (data-song) leuchtet auf, Loslassen verschiebt in ihren Assets-Ordner.
  const [ziehen, setZiehen] = useState<{ pfad: string | null; anzahl: number } | null>(null);
  useEffect(() => {
    if (!active || !("__TAURI_INTERNALS__" in window)) return;
    let stop: (() => void) | undefined;
    let entfernt = false;
    let pfade: string[] = [];
    const songUnter = (pos: { x: number; y: number }) => {
      const r = window.devicePixelRatio || 1;
      return document.elementFromPoint(pos.x / r, pos.y / r)?.closest<HTMLElement>("[data-song]")?.dataset.song ?? null;
    };
    getCurrentWebview().onDragDropEvent(event => {
      const p = event.payload;
      if (p.type === "enter") { pfade = p.paths; setZiehen({ pfad: songUnter(p.position), anzahl: pfade.length }); }
      else if (p.type === "over") setZiehen({ pfad: songUnter(p.position), anzahl: pfade.length });
      else if (p.type === "leave") setZiehen(null);
      else if (p.type === "drop") {
        setZiehen(null);
        const ziel = songUnter(p.position);
        if (ziel && p.paths.length) uebernehmen(ziel, p.paths);
      }
    }).then(un => { if (entfernt) un(); else stop = un; })
      .catch(e => console.error("[Künstler] Drag & Drop nicht verfügbar:", e));
    return () => { entfernt = true; stop?.(); };
  }, [active, uebernehmen]);

  if (!root) {
    return (
      <EmptyState
        icon={Users}
        title="Kein Künstler-Ordner"
        description="In den Einstellungen einen Archiv-Ordner setzen — der Künstler-Ordner liegt daneben (05_ARTISTS) — oder einen eigenen Künstler-Ordner wählen."
      />
    );
  }

  // Früher lagen Künstler-Projekte im Archiv. Steht in jedem Zustand oben —
  // auch wenn 05_ARTISTS noch fehlt: der Umzug legt ihn mit an.
  const hinweis = altbestand.length > 0 && (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, marginBottom: 16,
      padding: "10px 14px", borderRadius: radius.control,
      background: alpha(C.primary, 0.08), border: `1px solid ${alpha(C.primary, 0.3)}`,
      fontSize: 12, color: C.onSurface,
    }}>
      <FolderInput size={14} color={C.primary} />
      Im Archiv {altbestand.length === 1 ? "liegt 1 Künstler-Ordner" : `liegen ${altbestand.length} Künstler-Ordner`}:
      <span style={{ color: C.onSurfaceVariant }}>{altbestand.map(a => a.name).join(", ")}</span>
      <span style={{ flex: 1 }} />
      <Button variant="secondary" size="sm" icon={FolderInput} onClick={() => setUmzugOffen(true)}>Umziehen …</Button>
    </div>
  );
  const dialog = umzugOffen && (
    <UmzugDialog
      altbestand={altbestand}
      archivePath={archivePath}
      root={root}
      onClose={() => { setUmzugOffen(false); laden(); }}
    />
  ) || neu === "kuenstler" && (
    <NameDialog
      titel="Neuer Künstler"
      hinweis="Legt einen Ordner für den Künstler an."
      anlegen={async name => { await api.artists.create(root, name); }}
      onClose={angelegt => { setNeu(null); if (angelegt) laden(); }}
    />
  ) || neu === "song" && scan && (
    <SongDialog
      kuenstler={scan.kuenstler}
      vorlage={settings.flpTemplatePath.trim()}
      onClose={angelegt => { setNeu(null); if (angelegt) laden(); }}
    />
  );

  let inhalt: React.ReactNode;
  if (fehler) inhalt = <EmptyState icon={Users} title="Künstler-Ordner nicht lesbar" description={fehler} />;
  else if (!scan) inhalt = <div style={{ padding: 24, fontSize: 12, color: C.onSecondaryFixedVar }}>Lese Künstler-Ordner …</div>;
  else if (!scan.vorhanden) {
    inhalt = (
      <EmptyState
        icon={FolderPlus}
        title="Den Künstler-Ordner gibt es noch nicht"
        description={<>Mix- und Master-Projekte für Künstler liegen in <code>{root}</code> — je Künstler ein Ordner, darin je Song einer.</>}
        action={
          <Button variant="primary" icon={FolderPlus} loading={legtAn} onClick={async () => {
            setLegtAn(true);
            try { await api.artists.createRoot(root); laden(); }
            catch (e) { setFehler(String(e)); }
            finally { setLegtAn(false); }
          }}>
            Ordner anlegen
          </Button>
        }
      />
    );
  } else if (scan.kuenstler.length === 0) {
    inhalt = (
      <EmptyState
        icon={Users}
        title="Noch keine Künstler"
        description="Je Künstler ein Ordner, darin je Song einer."
        action={<Button variant="primary" icon={UserPlus} onClick={() => setNeu("kuenstler")}>Neuer Künstler</Button>}
      />
    );
  } else {
    inhalt = (
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: -12 }}>
          <Button variant="secondary" size="sm" icon={UserPlus} onClick={() => setNeu("kuenstler")}>Neuer Künstler</Button>
          <Button variant="primary" size="sm" icon={Plus} onClick={() => setNeu("song")}>Neuer Song</Button>
        </div>
        {meldung && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.error }}>
            <X size={13} /> <span style={{ flex: 1 }}>{meldung}</span>
            <IconButton icon={X} size={24} variant="ghost" title="Ausblenden" onClick={() => setMeldung(null)} />
          </div>
        )}
        {scan.kuenstler.map(k => (
          <KuenstlerBlock key={k.path} kuenstler={k} onGeaendert={laden}
            zeile={{ downloads, ziehen, uebernehmen }} />
        ))}
      </div>
    );
  }

  return <div>{hinweis}{inhalt}{dialog}</div>;
}

/** Vorschau und Bestätigung: welche Archiv-Ordner wohin wandern. Verschoben
 *  wird erst beim Klick; vorhandene Ziele werden übersprungen. */
function UmzugDialog({ altbestand, archivePath, root, onClose }: {
  altbestand: Altbestand[];
  archivePath: string;
  root: string;
  onClose: () => void;
}) {
  const [zeilen, setZeilen] = useState(altbestand.map(a => ({ ...a, an: true })));
  const [laeuft, setLaeuft] = useState(false);
  const [ergebnis, setErgebnis] = useState<{ pfad: string; ok: boolean; meldung: string }[] | null>(null);
  const sep = root.includes("\\") ? "\\" : "/";
  const gewaehlt = zeilen.filter(z => z.an && z.kuenstler.trim());

  const umziehen = async () => {
    setLaeuft(true);
    try {
      setErgebnis(await api.artists.umziehen(archivePath, root, gewaehlt.map(z => ({ pfad: z.pfad, kuenstler: z.kuenstler.trim() }))));
    } catch (e) {
      setErgebnis([{ pfad: "", ok: false, meldung: String(e) }]);
    } finally {
      setLaeuft(false);
    }
  };

  const aendern = (i: number, teil: Partial<(typeof zeilen)[number]>) =>
    setZeilen(p => p.map((x, k) => (k === i ? { ...x, ...teil } : x)));

  return (
    <Modal
      icon={FolderInput}
      title="Künstler-Ordner aus dem Archiv umziehen"
      subtitle="Ganze Ordner wandern mit allem darin — gibt es das Ziel schon, wird übersprungen"
      width={720}
      onClose={onClose}
      closeOnBackdrop={!laeuft}
      footer={ergebnis ? (
        <Button variant="primary" onClick={onClose}>Schließen</Button>
      ) : (
        <>
          <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" icon={FolderInput} loading={laeuft} disabled={gewaehlt.length === 0} onClick={umziehen}>
            {gewaehlt.length === 1 ? "1 Ordner verschieben" : `${gewaehlt.length} Ordner verschieben`}
          </Button>
        </>
      )}
    >
      {!ergebnis && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {zeilen.map((z, i) => (
            <div key={z.pfad} style={{
              display: "grid", gridTemplateColumns: "20px minmax(0, 1fr) 20px minmax(0, 1fr)", alignItems: "center", gap: 10,
              padding: "10px 12px", borderRadius: radius.control, background: C.surfaceContainerLow,
              border: `1px solid ${C.border10}`,
            }}>
              <input type="checkbox" aria-label={`${z.name} umziehen`} checked={z.an} style={{ accentColor: C.primary }}
                onChange={e => aendern(i, { an: e.target.checked })} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.onSurface }}>{z.name}</div>
                <div style={{ fontSize: 11, color: C.onSecondaryFixedVar }}>
                  im Archiv · {z.songs === 1 ? "1 Song" : `${z.songs} Songs`}
                </div>
              </div>
              <ArrowRight size={14} color={C.onSecondaryFixedVar} />
              <div style={{ minWidth: 0 }}>
                <input
                  value={z.kuenstler}
                  aria-label={`Künstlername für ${z.name}`}
                  onChange={e => aendern(i, { kuenstler: e.target.value })}
                  style={{
                    width: "100%", padding: "5px 8px", fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                    background: C.surfaceContainerLowest, color: C.onSurface, outline: "none",
                    border: `1px solid ${C.border20}`, borderRadius: radius.control, boxSizing: "border-box",
                  }}
                />
                {/* Nur das Ende des Pfads — der Anfang ist immer derselbe,
                    und abgeschnitten wurde sonst genau das Wichtige. */}
                <div
                  title={`${root}${sep}${z.kuenstler.trim()}`}
                  style={{ fontSize: 11, color: C.onSecondaryFixedVar, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  → {root.split(/[\\/]/).filter(Boolean).pop()}{sep}{z.kuenstler.trim() || "…"}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {ergebnis && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 0" }}>
          {ergebnis.map(e => (
            <div key={e.pfad + e.meldung} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: e.ok ? C.mint : C.error }}>
              {e.ok ? <Check size={13} /> : <X size={13} />}
              <span style={{ color: C.onSurface }}>{e.pfad.split(/[\\/]/).pop()}</span>
              <span>{e.meldung}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

/** Einen Namen abfragen und anlegen. Fehler (Name schon da, keine
 *  Template-FLP) stehen im Dialog, der Name bleibt stehen. */
function NameDialog({ titel, hinweis, anlegen, onClose }: {
  titel: string;
  hinweis: string;
  anlegen: (name: string) => Promise<void>;
  onClose: (angelegt: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const los = async () => {
    if (!name.trim() || laeuft) return;
    setLaeuft(true);
    setFehler(null);
    try { await anlegen(name.trim()); onClose(true); }
    catch (e) { setFehler(e instanceof Error ? e.message : String(e)); setLaeuft(false); }
  };

  return (
    <Modal
      icon={FolderPlus}
      title={titel}
      subtitle={hinweis}
      width={460}
      onClose={() => onClose(false)}
      footer={<>
        <Button variant="ghost" onClick={() => onClose(false)}>Abbrechen</Button>
        <Button variant="primary" icon={FolderPlus} loading={laeuft} disabled={!name.trim()} onClick={los}>Anlegen</Button>
      </>}
    >
      <input
        autoFocus
        value={name}
        aria-label="Name"
        placeholder="Name"
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") los(); }}
        style={{
          width: "100%", padding: "8px 10px", fontSize: 13, fontFamily: "inherit",
          background: C.surfaceContainerLowest, color: C.onSurface, outline: "none",
          border: `1px solid ${C.border20}`, borderRadius: radius.control, boxSizing: "border-box",
        }}
      />
      {fehler && <div style={{ marginTop: 8, fontSize: 12, color: C.error }}>{fehler}</div>}
    </Modal>
  );
}

/** Neuer Song: Künstler wählen, Namen eingeben, dazu Dateien aus den
 *  Downloads. Was zum Namen passt („heartbreak highlights_vocals"), ist
 *  vorausgewählt; von Hand An- oder Abgewähltes gilt vor dem Vorschlag. */
function SongDialog({ kuenstler, vorlage, onClose }: {
  kuenstler: Artist[];
  vorlage: string;
  onClose: (angelegt: boolean) => void;
}) {
  const [wer, setWer] = useState(kuenstler[0]?.path ?? "");
  const [name, setName] = useState("");
  const [downloads, setDownloads] = useState<{ name: string; path: string; geaendert: number }[]>([]);
  const [vonHand, setVonHand] = useState<Record<string, boolean>>({});
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  // Song steht, aber nicht jede Datei kam mit — dann nur noch „Schließen".
  const [angelegt, setAngelegt] = useState(false);

  const { settings } = useSettings();
  useEffect(() => { api.artists.downloads(settings.downloadsPath).then(setDownloads).catch(() => setDownloads([])); }, [settings.downloadsPath]);

  const gewaehlt = (d: { path: string; name: string }) => vonHand[d.path] ?? passtZumSong(d.name, name);
  // Passendes nach oben, sonst neueste zuerst (so kommt es aus Rust).
  const liste = [...downloads].sort((a, b) => Number(passtZumSong(b.name, name)) - Number(passtZumSong(a.name, name)));
  const mit = downloads.filter(gewaehlt);

  const los = async () => {
    if (!name.trim() || !wer || laeuft) return;
    if (!vorlage) { setFehler("Keine Template-FLP gesetzt — in den Einstellungen unter „Pfade“ eine Start-FLP wählen."); return; }
    setLaeuft(true);
    setFehler(null);
    try {
      const flp = await api.artists.createSong(wer, name.trim(), vorlage);
      if (mit.length > 0) {
        const songPfad = flp.replace(/[\\/][^\\/]+$/, "");
        const erg = await api.artists.assetsFuellen(songPfad, mit.map(d => d.path));
        const schief = erg.filter(e => !e.ok);
        if (schief.length > 0) {
          setFehler(`Song angelegt, aber: ${schief.map(e => `${e.pfad.split(/[\\/]/).pop()} ${e.meldung}`).join("; ")}`);
          setAngelegt(true);
          setLaeuft(false);
          return;
        }
      }
      onClose(true);
    } catch (e) {
      setFehler(String(e));
      setLaeuft(false);
    }
  };

  const feld: React.CSSProperties = {
    width: "100%", padding: "8px 10px", fontSize: 13, fontFamily: "inherit",
    background: C.surfaceContainerLowest, color: C.onSurface, outline: "none",
    border: `1px solid ${C.border20}`, borderRadius: radius.control, boxSizing: "border-box",
  };
  const beschriftung: React.CSSProperties = {
    display: "block", marginBottom: 6, fontSize: 11, fontWeight: 700,
    letterSpacing: "0.08em", textTransform: "uppercase", color: C.onSecondaryFixedVar,
  };

  return (
    <Modal
      icon={FolderPlus}
      title="Neuer Song"
      subtitle="Legt den Song-Ordner an, darin die Template-FLP und Assets/ für das, was der Künstler schickt."
      width={560}
      onClose={() => onClose(angelegt)}
      footer={angelegt ? (
        <Button variant="primary" onClick={() => onClose(true)}>Schließen</Button>
      ) : <>
        <Button variant="ghost" onClick={() => onClose(false)}>Abbrechen</Button>
        <Button variant="primary" icon={FolderPlus} loading={laeuft} disabled={!name.trim() || !wer} onClick={los}>
          {mit.length === 0 ? "Anlegen" : mit.length === 1 ? "Anlegen + 1 Datei" : `Anlegen + ${mit.length} Dateien`}
        </Button>
      </>}
    >
      <div style={{ display: "grid", gridTemplateColumns: "180px minmax(0, 1fr)", gap: 12 }}>
        <label>
          <span style={beschriftung}>Künstler</span>
          <Select value={wer} onChange={setWer} options={kuenstler.map(k => ({ value: k.path, label: k.name }))}
            panelWidth={180} triggerStyle={{ width: "100%", height: 36 }} />
        </label>
        <label>
          <span style={beschriftung}>Song</span>
          <input autoFocus value={name} placeholder="Name" style={feld}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") los(); }} />
        </label>
      </div>

      <div style={{ marginTop: 16 }}>
        <span style={beschriftung}>Aus den Downloads in Assets/</span>
        {downloads.length === 0 ? (
          <div style={{ fontSize: 12, color: C.onSecondaryFixedVar }}>Keine Audiodateien aus den letzten 30 Tagen.</div>
        ) : (
          <div style={{ maxHeight: 240, overflowY: "auto", border: `1px solid ${C.border10}`, borderRadius: radius.control }}>
            {liste.map(d => (
              <label key={d.path} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", cursor: "pointer",
                borderTop: `1px solid ${C.border10}`, fontSize: 12,
                background: gewaehlt(d) ? alpha(C.primary, 0.06) : "transparent",
              }}>
                <input type="checkbox" checked={gewaehlt(d)} style={{ accentColor: C.primary }}
                  onChange={e => setVonHand(v => ({ ...v, [d.path]: e.target.checked }))} />
                <span style={{ flex: 1, minWidth: 0, color: C.onSurface, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                <span style={{ color: C.onSecondaryFixedVar, flexShrink: 0 }}>{formatRelativeTime(d.geaendert)}</span>
              </label>
            ))}
          </div>
        )}
      </div>
      {fehler && <div style={{ marginTop: 10, fontSize: 12, color: C.error }}>{fehler}</div>}
    </Modal>
  );
}

function KuenstlerBlock({ kuenstler: k, onGeaendert, zeile }: {
  kuenstler: Artist;
  onGeaendert: () => void;
  zeile: ZeilenDrop;
}) {
  const [fertigOffen, setFertigOffen] = useState(false);
  const offen = k.songs.filter(s => !s.fertig);
  const fertig = k.songs.filter(s => s.fertig);

  return (
    <section style={{
      background: C.surfaceContainerLow, border: `1px solid ${C.border10}`,
      borderRadius: radius.card, overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${C.border10}` }}>
        <Mic2 size={15} color={C.primary} strokeWidth={1.75} />
        <span style={{ fontSize: 15, fontWeight: 700, color: C.onSurface }}>{k.name}</span>
        <span style={{ fontSize: 12, color: C.onSecondaryFixedVar }}>
          {offen.length === 1 ? "1 Song offen" : `${offen.length} Songs offen`}
          {fertig.length > 0 && ` · ${fertig.length} abgegeben`}
        </span>
        <span style={{ flex: 1 }} />
        <IconButton icon={FolderOpen} size={28} variant="secondary" title="Künstler-Ordner öffnen"
          onClick={() => revealItemInDir(k.path).catch(() => {})} />
      </div>

      {offen.length === 0 && (
        <div style={{ padding: "12px 18px", fontSize: 12, color: C.onSecondaryFixedVar }}>Nichts offen.</div>
      )}
      {offen.map(s => <SongZeile key={s.path} song={s} kuenstler={k.name} onGeaendert={onGeaendert} {...zeile} />)}

      {fertig.length > 0 && (
        <>
          <button
            onClick={() => setFertigOffen(o => !o)}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 6,
              padding: "10px 18px", border: "none", borderTop: `1px solid ${C.border10}`,
              background: "transparent", cursor: "pointer", fontFamily: "inherit",
              fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
              color: C.onSecondaryFixedVar,
            }}
          >
            <ChevronDown size={13} style={{ transition: "transform 0.15s", transform: fertigOffen ? "rotate(180deg)" : "none" }} />
            Abgegeben ({fertig.length})
          </button>
          {fertigOffen && fertig.map(s => <SongZeile key={s.path} song={s} kuenstler={k.name} onGeaendert={onGeaendert} {...zeile} />)}
        </>
      )}
    </section>
  );
}

/** Eine Song-Zeile. Klick klappt Notiz und Status auf; gespeichert wird beim
 *  Verlassen des Felds bzw. beim Umschalten. */
function SongZeile({ song: s, kuenstler, onGeaendert, downloads, ziehen, uebernehmen }: { song: ArtistSong; kuenstler: string; onGeaendert: () => void } & ZeilenDrop) {
  const [abgabeOffen, setAbgabeOffen] = useState(false);
  const [offen, setOffen] = useState(false);
  const istZiel = ziehen?.pfad === s.path;
  // Downloads, die zum Song gehören: der Name passt („heartbreak highlights_vocals")
  // oder die FLP verwendet die Datei („Feelings feeln vocals" bei „Fellings Feeln").
  // Was schon im Song liegt, nicht noch einmal.
  const verwendet = new Set(s.verweise.map(pfadSchluessel));
  const neue = s.fertig ? [] : downloads.filter(d =>
    (passtZumSong(d.name, s.name) || verwendet.has(pfadSchluessel(d.path))) && !s.dateien.includes(d.name));
  const reparieren = (e: React.MouseEvent) => {
    e.stopPropagation();
    api.artists.pfadeReparieren(s.path)
      .then(() => { setFehler(null); onGeaendert(); })
      .catch(err => { setFehler(String(err)); setOffen(true); });
  };
  const [notiz, setNotiz] = useState(s.notiz ?? "");
  const [fehler, setFehler] = useState<string | null>(null);

  const speichern = (n: string, warten: boolean) => {
    if (n === (s.notiz ?? "") && warten === s.warten) return;
    api.artists.setSong(s.path, n, warten)
      .then(() => { setFehler(null); onGeaendert(); })
      .catch(e => setFehler(String(e)));
  };
  const ersteZeile = s.notiz?.split("\n")[0];

  return (
    <div data-song={s.path} style={{
      borderTop: `1px solid ${C.border10}`,
      background: istZiel ? alpha(C.primary, 0.1) : offen ? C.surfaceContainer : "transparent",
      boxShadow: istZiel ? `inset 0 0 0 1px ${alpha(C.primary, 0.6)}` : "none",
    }}>
      <div
        onClick={() => setOffen(o => !o)}
        title={offen ? "Zuklappen" : "Notiz und Status"}
        style={{
          display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto 140px 14px", alignItems: "center", gap: 16,
          padding: "11px 18px", cursor: "pointer",
          opacity: s.fertig ? 0.7 : 1,
        }}
        onMouseEnter={e => { if (!offen) e.currentTarget.style.background = C.surfaceContainer; }}
        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
      >
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.onSurface, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {s.name}
            </span>
            {s.warten && !s.fertig && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0,
                padding: "1px 7px", borderRadius: radius.full, fontSize: 11, fontWeight: 600,
                background: alpha(C.tertiary, 0.12), color: C.tertiary,
              }}>
                <Hourglass size={10} /> Warte auf Künstler
              </span>
            )}
            {istZiel ? (
              <span style={{ fontSize: 12, fontWeight: 600, color: C.primary, flexShrink: 0 }}>
                {ziehen!.anzahl === 1 ? "1 Datei" : `${ziehen!.anzahl} Dateien`} → Assets
              </span>
            ) : neue.length > 0 && (
              <Button
                variant="secondary" size="sm" icon={FolderInput}
                title={`Aus den Downloads in Assets/ verschieben — die FLP zeigt danach auf die neue Stelle:\n${neue.map(d => d.name).join("\n")}`}
                onClick={e => { e.stopPropagation(); uebernehmen(s.path, neue.map(d => d.path)); }}
              >
                {neue.length === 1 ? "1 Download zuweisen" : `${neue.length} Downloads zuweisen`}
              </Button>
            )}
            {s.reparierbar > 0 && (
              <Button
                variant="secondary" size="sm" icon={Wrench}
                title={"Die FLP sucht Dateien noch am alten Ort (z. B. 03_ARCHIVE). BeatOS hat sie gefunden und trägt die neuen Pfade ein — "
                  + "die FLP vorher in FL schließen. Eine Sicherung kommt nach Backup/."}
                onClick={reparieren}
              >
                {s.reparierbar === 1 ? "1 Pfad reparieren" : `${s.reparierbar} Pfade reparieren`}
              </Button>
            )}
            {s.fehlend.length > 0 && (
              <span
                title={`Die FLP verwendet diese Dateien, BeatOS findet sie nirgends — FL fragt beim Öffnen danach:\n${s.fehlend.map(p => p.split(/[\\/]/).pop()).join("\n")}`}
                style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0, fontSize: 12, color: C.error }}
              >
                <AlertTriangle size={12} /> {s.fehlend.length === 1 ? "1 Datei fehlt" : `${s.fehlend.length} Dateien fehlen`}
              </span>
            )}
          </span>
          {ersteZeile && !offen && (
            <span style={{ display: "block", marginTop: 2, fontSize: 12, color: C.onSurfaceVariant, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {ersteZeile}
            </span>
          )}
        </span>
        <span style={{ display: "flex", gap: 4 }}>
          {BAUSTEINE.map(b => {
            const da = s[b.key];
            return (
              <span
                key={b.key}
                title={`${b.label}: ${da ? "vorhanden" : "fehlt"} — ${b.titel}`}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "2px 8px", borderRadius: radius.full,
                  fontSize: 11, fontWeight: 600,
                  background: da ? alpha(C.mint, 0.12) : "transparent",
                  border: `1px ${da ? "solid" : "dashed"} ${da ? alpha(C.mint, 0.35) : C.border20}`,
                  color: da ? C.mint : C.onSecondaryFixedVar,
                }}
              >
                {da && <Check size={10} strokeWidth={2.5} />}
                {b.label}
              </span>
            );
          })}
        </span>
        <span style={{ fontSize: 12, color: C.onSecondaryFixedVar, textAlign: "right" }}>
          {s.fertig && s.abgegeben ? `abgegeben ${tageRelativ(s.abgegeben)}` : s.geaendert ? formatRelativeTime(s.geaendert) : "—"}
        </span>
        <ChevronDown size={14} color={C.onSecondaryFixedVar} style={{ transition: "transform 0.15s", transform: offen ? "rotate(180deg)" : "none" }} />
      </div>

      {offen && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 18px 14px" }}>
          <textarea
            autoFocus
            value={notiz}
            aria-label={`Notiz zu ${s.name}`}
            placeholder="Notiz — was fehlt, was der Künstler wollte, wo es hakt …"
            rows={3}
            onChange={e => setNotiz(e.target.value)}
            onBlur={() => speichern(notiz, s.warten)}
            style={{
              width: "100%", padding: "8px 10px", fontSize: 13, lineHeight: 1.5, fontFamily: "inherit", resize: "vertical",
              background: C.surfaceContainerLowest, color: C.onSurface, outline: "none",
              border: `1px solid ${C.border20}`, borderRadius: radius.control, boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {!s.fertig && (
              <Segmented
                label="Status"
                value={s.warten ? "warten" : "arbeit"}
                onChange={v => speichern(notiz, v === "warten")}
                options={[
                  { value: "arbeit", label: "In Arbeit" },
                  { value: "warten", label: "Warte auf Künstler", icon: Hourglass, color: C.tertiary },
                ]}
              />
            )}
            {fehler && <span style={{ fontSize: 12, color: C.error }}>{fehler}</span>}
            <span style={{ flex: 1 }} />
            <Button variant="secondary" size="sm" icon={FolderOpen} onClick={() => revealItemInDir(s.path).catch(() => {})}>Ordner öffnen</Button>
            {s.fertig ? (
              <Button variant="secondary" size="sm" icon={Undo2}
                title="Zurück aus _Fertig — wenn der Künstler nach der Abgabe noch etwas will"
                onClick={() => api.artists.wiederOeffnen(s.path).then(onGeaendert).catch(e => setFehler(String(e)))}
              >
                Wieder öffnen
              </Button>
            ) : (
              <Button variant="primary" size="sm" icon={Send} disabled={s.exporte.length === 0}
                title={s.exporte.length === 0 ? "Noch kein Export im Song-Ordner" : "Export benennen und den Song nach _Fertig schieben"}
                onClick={() => setAbgabeOffen(true)}
              >
                Abgeben …
              </Button>
            )}
          </div>
        </div>
      )}
      {abgabeOffen && (
        <AbgabeDialog song={s} kuenstler={kuenstler} onClose={fertig => { setAbgabeOffen(false); if (fertig) onGeaendert(); }} />
      )}
    </div>
  );
}

/** Abgeben: Export wählen, Master oder Mix — der neue Name steht schon da.
 *  Danach öffnet der Explorer die Datei, zum Reinziehen in Discord. */
function AbgabeDialog({ song: s, kuenstler, onClose }: {
  song: ArtistSong;
  kuenstler: string;
  onClose: (fertig: boolean) => void;
}) {
  const artVon = (datei: string): "Master" | "Mix" => (/master/i.test(datei) ? "Master" : "Mix");
  // Vorauswahl: ein Master, wenn es einen gibt, sonst der neueste Export.
  const [datei, setDatei] = useState(s.exporte.find(d => artVon(d) === "Master") ?? s.exporte[0]);
  const [art, setArt] = useState<"Master" | "Mix">(artVon(datei));
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const endung = datei.includes(".") ? datei.slice(datei.lastIndexOf(".")) : ".wav";
  const neuerName = `${kuenstler} - ${s.name} (${art})${endung}`;

  const abgeben = async () => {
    setLaeuft(true);
    setFehler(null);
    try {
      const pfad = await api.artists.abgeben(s.path, datei, art);
      revealItemInDir(pfad).catch(() => {});
      onClose(true);
    } catch (e) {
      setFehler(String(e));
      setLaeuft(false);
    }
  };

  return (
    <Modal
      icon={Send}
      title={`${s.name} abgeben`}
      subtitle="Der Export bekommt den Abgabe-Namen, der Song wandert nach _Fertig."
      width={560}
      onClose={() => onClose(false)}
      footer={<>
        <Button variant="ghost" onClick={() => onClose(false)}>Abbrechen</Button>
        <Button variant="primary" icon={Send} loading={laeuft} onClick={abgeben}>Abgeben</Button>
      </>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflowY: "auto" }}>
        {s.exporte.map(d => (
          <label key={d} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", cursor: "pointer",
            borderRadius: radius.control, fontSize: 12, color: C.onSurface,
            background: d === datei ? alpha(C.primary, 0.08) : "transparent",
          }}>
            <input type="radio" name="export" checked={d === datei} style={{ accentColor: C.primary }}
              onChange={() => { setDatei(d); setArt(artVon(d)); }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d}</span>
          </label>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
        <Segmented label="Art der Abgabe" value={art} onChange={setArt}
          options={[{ value: "Master", label: "Master" }, { value: "Mix", label: "Mix" }]} />
        <ArrowRight size={14} color={C.onSecondaryFixedVar} />
        <span style={{ fontSize: 13, fontWeight: 600, color: C.onSurface, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {neuerName}
        </span>
      </div>
      {fehler && <div style={{ marginTop: 10, fontSize: 12, color: C.error }}>{fehler}</div>}
    </Modal>
  );
}
