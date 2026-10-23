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
// 02_ASSETS, 03_VERSIONS). Scheibe 3: Klick auf einen Song klappt Notiz und Status auf —
// „In Arbeit" oder „Warte auf Künstler" (Tabelle artist_songs).
// Plan und nächste Scheiben: docs/kuenstler-projekte.md.
// ═══════════════════════════════════════════════════════════════════════════════

import { Fragment, useCallback, useEffect, useState } from "react";
import { Users, FolderOpen, FolderPlus, ChevronDown, Check, Mic2, FolderInput, ArrowRight, X, Plus, UserPlus, Hourglass, Send, Undo2, Wrench, AlertTriangle, FolderTree, Music2, Play, Cloud, Youtube, Instagram, MessageCircle, Download, Image as ImageIcon, Pause } from "lucide-react";
import { revealItemInDir, openPath, openUrl } from "@tauri-apps/plugin-opener";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { AssetImage } from "../AssetPickerDialog";
import { C, alpha, radius } from "../../lib/theme";
import { api } from "../../lib/api";
import { formatRelativeTime, tageRelativ } from "../../lib/time";
import { useFocusRefresh } from "../../hooks/useFocusRefresh";
import { useSettings } from "../../contexts/SettingsContext";
import { EmptyState, Button, IconButton, Modal, Segmented, Select } from "../ui";
import { passtZumSong, pfadSchluessel, songStand, songVerlauf } from "../../lib/kuenstler";
import { useAudioPlayerContext } from "../../contexts/AudioPlayerContext";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { Artist, ArtistSong, ArtistsScan, Altbestand } from "../../types/artists";
import type { UploadData } from "../../types/upload";
import type { Beat } from "../../types/browse";
import { getCurrentWebview } from "@tauri-apps/api/webview";

type Download = { name: string; path: string; geaendert: number };
/** Was jede Song-Zeile fürs Reinziehen und die Download-Vorschläge braucht. */
type ZeilenDrop = {
  downloads: Download[];
  ziehen: { pfad: string | null; anzahl: number; kuenstler: string | null } | null;
  uebernehmen: (songPfad: string, pfade: string[]) => void;
};

const BAUSTEINE: { key: keyof Pick<ArtistSong, "flp" | "vocals" | "demo" | "beat" | "mix" | "master">; label: string; titel: string }[] = [
  { key: "flp", label: "FLP", titel: "FL-Projekt in 01_SAVEFILES" },
  { key: "vocals", label: "Vocals", titel: "Audio mit „Vocal\" oder Songname im Namen" },
  { key: "demo", label: "Demo", titel: "Audio mit genau dem Songnamen" },
  { key: "beat", label: "Beat", titel: "Weitere Audiodatei oder verknüpfter Beat" },
  { key: "mix", label: "Mix", titel: "Export in 03_VERSIONS oder neben der FLP" },
  { key: "master", label: "Master", titel: "Export mit „Master\" im Namen" },
];

export function ArtistsPane({ root, archivePath, active }: { root: string; archivePath: string; active: boolean }) {
  const [scan, setScan] = useState<ArtistsScan | null>(null);
  const [altbestand, setAltbestand] = useState<Altbestand[]>([]);
  const [umzugOffen, setUmzugOffen] = useState(false);
  const [aufraeumenOffen, setAufraeumenOffen] = useState(false);
  // Der rechts gezeigte Song (Pfad). Nach Abgeben/Wieder öffnen ändert sich der
  // Pfad — dann fällt die Wahl auf den ersten offenen Song zurück.
  const [auswahl, setAuswahl] = useState<string | null>(null);
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

  // Dateien in 02_ASSETS — per Ziehen oder per Vorschlag. Was nicht ging, steht oben.
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
  // (data-song) leuchtet auf, Loslassen verschiebt in ihren 02_ASSETS.
  // Ein Bild auf dem Profilbild eines Künstlers (data-kuenstler) wird sein Profilbild.
  const [ziehen, setZiehen] = useState<{ pfad: string | null; anzahl: number; kuenstler: string | null } | null>(null);
  useEffect(() => {
    if (!active || !("__TAURI_INTERNALS__" in window)) return;
    let stop: (() => void) | undefined;
    let entfernt = false;
    let pfade: string[] = [];
    const unter = (pos: { x: number; y: number }) => {
      const r = window.devicePixelRatio || 1;
      const el = document.elementFromPoint(pos.x / r, pos.y / r);
      const bild = pfade.find(p => /\.(png|jpe?g|webp|gif)$/i.test(p));
      return {
        pfad: el?.closest<HTMLElement>("[data-song]")?.dataset.song ?? null,
        kuenstler: bild ? el?.closest<HTMLElement>("[data-kuenstler]")?.dataset.kuenstler ?? null : null,
        bild,
      };
    };
    getCurrentWebview().onDragDropEvent(event => {
      const p = event.payload;
      if (p.type === "enter" || p.type === "over") {
        if (p.type === "enter") pfade = p.paths;
        const u = unter(p.position);
        setZiehen({ pfad: u.kuenstler ? null : u.pfad, kuenstler: u.kuenstler, anzahl: pfade.length });
      }
      else if (p.type === "leave") setZiehen(null);
      else if (p.type === "drop") {
        setZiehen(null);
        const u = unter(p.position);
        if (u.kuenstler && u.bild) {
          api.artists.setBild(u.kuenstler, u.bild).then(() => laden()).catch(e => setMeldung(String(e)));
        } else if (u.pfad && p.paths.length) uebernehmen(u.pfad, p.paths);
      }
    }).then(un => { if (entfernt) un(); else stop = un; })
      .catch(e => console.error("[Künstler] Drag & Drop nicht verfügbar:", e));
    return () => { entfernt = true; stop?.(); };
  }, [active, uebernehmen, laden]);

  if (!root) {
    return (
      <EmptyState
        icon={Users}
        title="Kein Künstler-Ordner"
        description="Archiv- oder Künstler-Ordner in den Einstellungen setzen"
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
  // Songs, bei denen noch etwas außerhalb von 01_/02_/03_ liegt.
  const unaufgeraeumt = (scan?.kuenstler ?? []).flatMap(k => k.songs.filter(s => s.umbau > 0).map(s => ({ kuenstler: k.name, song: s })));
  const aufraeumHinweis = unaufgeraeumt.length > 0 && (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, marginBottom: 16,
      padding: "10px 14px", borderRadius: radius.control,
      background: alpha(C.primary, 0.08), border: `1px solid ${alpha(C.primary, 0.3)}`,
      fontSize: 12, color: C.onSurface,
    }}>
      <FolderTree size={14} color={C.primary} />
      {unaufgeraeumt.length === 1 ? "1 Song liegt" : `${unaufgeraeumt.length} Songs liegen`} noch nicht in 01_SAVEFILES / 02_ASSETS / 03_VERSIONS
      <span style={{ flex: 1 }} />
      <Button variant="secondary" size="sm" icon={FolderTree} onClick={() => setAufraeumenOffen(true)}>Ordner aufräumen …</Button>
    </div>
  );

  const dialog = aufraeumenOffen && (
    <AufraeumDialog songs={unaufgeraeumt} onClose={() => { setAufraeumenOffen(false); laden(); }} />
  ) || umzugOffen && (
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
        title="Künstler-Ordner fehlt"
        description={<code>{root}</code>}
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
    // Gewählt ist immer genau ein Song; ohne Wahl der erste offene.
    const alle = scan.kuenstler.flatMap(k => k.songs.map(s => ({ k, s })));
    const gewaehlt = alle.find(x => x.s.path === auswahl) ?? alle.find(x => !x.s.fertig) ?? alle[0];
    inhalt = (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="secondary" size="sm" icon={UserPlus} onClick={() => setNeu("kuenstler")}>Neuer Künstler</Button>
          <Button variant="primary" size="sm" icon={Plus} onClick={() => setNeu("song")}>Neuer Song</Button>
        </div>
        {meldung && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.error }}>
            <X size={13} /> <span style={{ flex: 1 }}>{meldung}</span>
            <IconButton icon={X} size={24} variant="ghost" title="Ausblenden" onClick={() => setMeldung(null)} />
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 400px) minmax(0, 1fr)", gap: 20, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {scan.kuenstler.map(k => (
              <KuenstlerBlock key={k.path} kuenstler={k} auswahl={gewaehlt?.s.path ?? null}
                onWaehlen={setAuswahl} downloads={downloads} ziehen={ziehen} onGeaendert={laden} />
            ))}
          </div>
          {gewaehlt ? (
            <SongDetail key={gewaehlt.s.path} song={gewaehlt.s} kuenstler={gewaehlt.k.name} bild={gewaehlt.k.bild}
              onGeaendert={laden} downloads={downloads} uebernehmen={uebernehmen} />
          ) : (
            <EmptyState icon={Mic2} title="Noch keine Songs" description="Mit „Neuer Song“ oben rechts anlegen." />
          )}
        </div>
      </div>
    );
  }

  return <div>{hinweis}{aufraeumHinweis}{inhalt}{dialog}</div>;
}

/** Ältere Songs ins Schema bringen. Was wohin kommt, steht oben — verschoben
 *  wird erst beim Klick, nur innerhalb des Song-Ordners, nichts überschrieben. */
function AufraeumDialog({ songs, onClose }: {
  songs: { kuenstler: string; song: ArtistSong }[];
  onClose: () => void;
}) {
  const [an, setAn] = useState<Record<string, boolean>>({});
  const [laeuft, setLaeuft] = useState(false);
  const [ergebnis, setErgebnis] = useState<{ pfad: string; ok: boolean; meldung: string }[] | null>(null);
  const gewaehlt = songs.filter(s => an[s.song.path] ?? true);

  const los = async () => {
    setLaeuft(true);
    try { setErgebnis(await api.artists.ordnerAufraeumen(gewaehlt.map(s => s.song.path))); }
    catch (e) { setErgebnis([{ pfad: "", ok: false, meldung: String(e) }]); }
    finally { setLaeuft(false); }
  };

  const regeln: [string, string][] = [
    ["FLP, Audio/, Backup/", "01_SAVEFILES"],
    ["Assets/, Eingang/ und andere Ordner, sonstige Dateien", "02_ASSETS"],
    ["Exporte (Audio direkt im Song-Ordner)", "03_VERSIONS"],
  ];

  return (
    <Modal
      icon={FolderTree}
      title="Song-Ordner aufräumen"
      subtitle="FLPs vorher in FL schließen"
      width={640}
      onClose={onClose}
      closeOnBackdrop={!laeuft}
      footer={ergebnis ? (
        <Button variant="primary" onClick={onClose}>Schließen</Button>
      ) : (
        <>
          <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" icon={FolderTree} loading={laeuft} disabled={gewaehlt.length === 0} onClick={los}>
            {gewaehlt.length === 1 ? "1 Song aufräumen" : `${gewaehlt.length} Songs aufräumen`}
          </Button>
        </>
      )}
    >
      {!ergebnis ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 14px auto", gap: "6px 10px", alignItems: "center", fontSize: 12, marginBottom: 14 }}>
            {regeln.map(([was, wohin]) => (
              <Fragment key={wohin}>
                <span style={{ color: C.onSurfaceVariant }}>{was}</span>
                <ArrowRight size={12} color={C.onSecondaryFixedVar} />
                <code style={{ color: C.onSurface }}>{wohin}</code>
              </Fragment>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 300, overflowY: "auto" }}>
            {songs.map(({ kuenstler, song: s }) => (
              <label key={s.path} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", cursor: "pointer",
                borderRadius: radius.control, background: C.surfaceContainerLow, fontSize: 12,
              }}>
                <input type="checkbox" checked={an[s.path] ?? true} style={{ accentColor: C.primary }}
                  onChange={e => setAn(v => ({ ...v, [s.path]: e.target.checked }))} />
                <span style={{ color: C.onSecondaryFixedVar }}>{kuenstler}</span>
                <span style={{ flex: 1, minWidth: 0, fontWeight: 600, color: C.onSurface, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                <span style={{ color: C.onSecondaryFixedVar }}>{s.umbau === 1 ? "1 Eintrag" : `${s.umbau} Einträge`}</span>
              </label>
            ))}
          </div>
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 0" }}>
          {ergebnis.map(e => (
            <div key={e.pfad + e.meldung} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: e.ok ? C.mint : C.error }}>
              {e.ok ? <Check size={13} /> : <X size={13} />}
              <span style={{ color: C.onSurface, flexShrink: 0 }}>{e.pfad.split(/[\\/]/).pop()}</span>
              <span>{e.meldung}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
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
      subtitle="Vorhandene Ziele werden übersprungen"
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
    if (!vorlage) { setFehler("Keine Template-FLP (Einstellungen → Pfade)"); return; }
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
      subtitle="Mit 01_SAVEFILES, 02_ASSETS und 03_VERSIONS"
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
        <span style={beschriftung}>Aus den Downloads in 02_ASSETS</span>
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

/** Downloads, die zum Song gehören: der Name passt („heartbreak highlights_vocals")
 *  oder die FLP verwendet die Datei („Feelings feeln vocals" bei „Fellings Feeln").
 *  Was schon im Song liegt, nicht noch einmal. */
function neueDownloads(s: ArtistSong, downloads: Download[]): Download[] {
  if (s.fertig) return [];
  const verwendet = new Set(s.verweise.map(pfadSchluessel));
  return downloads.filter(d =>
    (passtZumSong(d.name, s.name) || verwendet.has(pfadSchluessel(d.path))) && !s.dateien.includes(d.name));
}

const STAND_FARBE = { fertig: C.mint, warten: C.tertiary, offen: C.onSurfaceVariant, bereit: C.primary } as const;

/** Links: ein Künstler mit seinen Songs als ruhige Liste. Abgegebene stehen
 *  zugeklappt darunter. */
/** Die Plattformen im Profil — Reihenfolge = Reihenfolge der Symbole. */
const PLATTFORMEN: { key: string; label: string; icon: React.ElementType; platzhalter: string }[] = [
  { key: "spotify", label: "Spotify", icon: Music2, platzhalter: "https://open.spotify.com/artist/…" },
  { key: "soundcloud", label: "SoundCloud", icon: Cloud, platzhalter: "https://soundcloud.com/…" },
  { key: "youtube", label: "YouTube", icon: Youtube, platzhalter: "https://www.youtube.com/@…" },
  { key: "instagram", label: "Instagram", icon: Instagram, platzhalter: "https://www.instagram.com/…" },
  { key: "discord", label: "Discord", icon: MessageCircle, platzhalter: "Name auf Discord" },
];

/** Profilbild rund; ohne Bild die Initialen. */
function Avatar({ kuenstler: k, groesse, hervorgehoben = false }: { kuenstler: Artist; groesse: number; hervorgehoben?: boolean }) {
  const initialen = k.name.split(/[\s_-]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
  return (
    <span style={{
      width: groesse, height: groesse, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      background: alpha(C.primary, 0.14), color: C.primary, fontWeight: 700, fontSize: groesse * 0.36,
      boxShadow: hervorgehoben ? `0 0 0 2px ${C.primary}` : `0 0 0 1px ${C.border20}`,
    }}>
      {k.bild ? <AssetImage key={k.bild} path={k.bild} fit="cover" /> : initialen}
    </span>
  );
}

function KuenstlerBlock({ kuenstler: k, auswahl, onWaehlen, downloads, ziehen, onGeaendert }: {
  kuenstler: Artist;
  auswahl: string | null;
  onWaehlen: (pfad: string) => void;
  downloads: Download[];
  ziehen: ZeilenDrop["ziehen"];
  onGeaendert: () => void;
}) {
  const offen = k.songs.filter(s => !s.fertig);
  const fertig = k.songs.filter(s => s.fertig);
  const [profilOffen, setProfilOffen] = useState(false);
  const letzteAbgabe = fertig.map(s => s.abgegeben).filter((d): d is string => !!d).sort().pop();
  const links = PLATTFORMEN.filter(p => k.links[p.key]);
  // Ist der gewählte Song abgegeben, steht die Liste offen.
  const [fertigOffen, setFertigOffen] = useState(() => fertig.some(s => s.path === auswahl));
  const zeile = (s: ArtistSong) => (
    <SongZeile key={s.path} song={s} gewaehlt={s.path === auswahl} onWaehlen={() => onWaehlen(s.path)}
      zuTun={neueDownloads(s, downloads).length + s.reparierbar + s.fehlend.length > 0}
      ziel={ziehen?.pfad === s.path ? ziehen.anzahl : null} />
  );

  return (
    <section style={{ background: C.surfaceContainerLow, border: `1px solid ${C.border10}`, borderRadius: radius.card, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px", borderBottom: `1px solid ${C.border10}` }}>
        <button
          data-kuenstler={k.path}
          onClick={() => setProfilOffen(true)}
          title="Profil bearbeiten · Bild hierher ziehen"
          style={{ padding: 0, border: "none", background: "transparent", cursor: "pointer", borderRadius: "50%" }}
        >
          <Avatar kuenstler={k} groesse={44} hervorgehoben={ziehen?.kuenstler === k.path} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.onSurface, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.name}</div>
          <div style={{ fontSize: 12, color: C.onSecondaryFixedVar }}>
            {ziehen?.kuenstler === k.path ? <span style={{ color: C.primary, fontWeight: 600 }}>Loslassen → neues Profilbild</span> : <>
              {offen.length === 1 ? "1 offen" : `${offen.length} offen`}
              {fertig.length > 0 && ` · ${fertig.length} abgegeben`}
              {letzteAbgabe && ` · zuletzt ${tageRelativ(letzteAbgabe)}`}
            </>}
          </div>
        </div>
        {links.map(p => (
          <IconButton key={p.key} icon={p.icon} size={26} variant="ghost"
            title={p.key === "discord" ? `Discord: ${k.links.discord} · kopieren` : `${p.label} öffnen`}
            onClick={() => p.key === "discord"
              ? navigator.clipboard?.writeText(k.links.discord).catch(() => {})
              : openUrl(k.links[p.key]).catch(() => {})} />
        ))}
        <IconButton icon={FolderOpen} size={26} variant="ghost" title="Künstler-Ordner öffnen"
          onClick={() => revealItemInDir(k.path).catch(() => {})} />
      </div>
      {profilOffen && <ProfilDialog kuenstler={k} onClose={geaendert => { setProfilOffen(false); if (geaendert) onGeaendert(); }} />}
      {offen.length === 0 && (
        <div style={{ padding: "10px 14px", fontSize: 12, color: C.onSecondaryFixedVar }}>Nichts offen.</div>
      )}
      {offen.map(zeile)}
      {fertig.length > 0 && (
        <>
          <button
            onClick={() => setFertigOffen(o => !o)}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 6,
              padding: "9px 14px", border: "none", borderTop: `1px solid ${C.border10}`,
              background: "transparent", cursor: "pointer", fontFamily: "inherit",
              fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
              color: C.onSecondaryFixedVar,
            }}
          >
            <ChevronDown size={13} style={{ transition: "transform 0.15s", transform: fertigOffen ? "rotate(180deg)" : "none" }} />
            Abgegeben ({fertig.length})
          </button>
          {fertigOffen && fertig.map(zeile)}
        </>
      )}
    </section>
  );
}

/** Profil eines Künstlers: Bild (wählen oder von einer Profilseite holen)
 *  und die Links. Bild-Aktionen wirken sofort, die Links beim Speichern. */
function ProfilDialog({ kuenstler: k, onClose }: { kuenstler: Artist; onClose: (geaendert: boolean) => void }) {
  const [links, setLinks] = useState<Record<string, string>>({ ...k.links });
  const [bild, setBild] = useState<string | null>(k.bild);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [geaendert, setGeaendert] = useState(false);

  const bildSetzen = async (art: string, f: () => Promise<string>) => {
    setLaeuft(art);
    setFehler(null);
    try { setBild(await f()); setGeaendert(true); }
    catch (e) { setFehler(String(e)); }
    finally { setLaeuft(null); }
  };
  const waehlen = async () => {
    const datei = await openDialog({ multiple: false, title: "Profilbild wählen", filters: [{ name: "Bilder", extensions: ["jpg", "jpeg", "png", "webp"] }] }).catch(() => null);
    if (typeof datei === "string") bildSetzen("waehlen", () => api.artists.setBild(k.path, datei));
  };
  const speichern = async () => {
    setLaeuft("speichern");
    try { await api.artists.setLinks(k.path, links); onClose(true); }
    catch (e) { setFehler(String(e)); setLaeuft(null); }
  };

  return (
    <Modal
      icon={Mic2}
      title={k.name}
      subtitle="Profilbild und Links"
      width={560}
      onClose={() => onClose(geaendert)}
      footer={<>
        <Button variant="ghost" onClick={() => onClose(geaendert)}>Abbrechen</Button>
        <Button variant="primary" loading={laeuft === "speichern"} onClick={speichern}>Speichern</Button>
      </>}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
        <Avatar kuenstler={{ ...k, bild }} groesse={80} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: C.onSecondaryFixedVar }}>
          <Button variant="secondary" size="sm" icon={ImageIcon} loading={laeuft === "waehlen"} onClick={waehlen}>Bild wählen …</Button>
          <span>… oder ein Bild auf das Profilbild in der Liste ziehen, oder unten bei einem Link holen.</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {PLATTFORMEN.map(p => {
          const wert = links[p.key] ?? "";
          return (
            <div key={p.key} style={{ display: "grid", gridTemplateColumns: "20px 96px minmax(0, 1fr) 32px", alignItems: "center", gap: 8 }}>
              <p.icon size={15} color={C.onSecondaryFixedVar} />
              <span style={{ fontSize: 12, color: C.onSurfaceVariant }}>{p.label}</span>
              <input
                value={wert}
                placeholder={p.platzhalter}
                aria-label={p.label}
                onChange={e => setLinks(l => ({ ...l, [p.key]: e.target.value }))}
                style={{
                  width: "100%", padding: "6px 8px", fontSize: 12, fontFamily: "inherit", boxSizing: "border-box",
                  background: C.surfaceContainerLowest, color: C.onSurface, outline: "none",
                  border: `1px solid ${C.border20}`, borderRadius: radius.control,
                }}
              />
              {p.key !== "discord" && (
                <IconButton icon={Download} size={28} variant="secondary" disabled={!/^https?:\/\//.test(wert.trim()) || laeuft !== null}
                  title={`Profilbild von ${p.label} holen`}
                  onClick={() => bildSetzen(p.key, () => api.artists.bildHolen(k.path, wert.trim()))} />
              )}
            </div>
          );
        })}
      </div>
      {laeuft && laeuft !== "speichern" && laeuft !== "waehlen" && <div style={{ marginTop: 10, fontSize: 12, color: C.onSecondaryFixedVar }}>Hole das Bild …</div>}
      {fehler && <div style={{ marginTop: 10, fontSize: 12, color: C.error }}>{fehler}</div>}
    </Modal>
  );
}

/** Eine Zeile links: Name, Stand in Worten, ein schmaler Balken für die vier
 *  Etappen. Ein Punkt sagt „hier ist etwas zu tun" (Downloads, Pfade). */
function SongZeile({ song: s, gewaehlt, onWaehlen, zuTun, ziel }: {
  song: ArtistSong;
  gewaehlt: boolean;
  onWaehlen: () => void;
  zuTun: boolean;
  /** Beim Ziehen aus dem Explorer: so viele Dateien landen hier. */
  ziel: number | null;
}) {
  const stand = songStand(s);
  const farbe = STAND_FARBE[stand.ton];
  return (
    <div
      data-song={s.path}
      onClick={onWaehlen}
      style={{
        padding: "10px 14px", borderTop: `1px solid ${C.border10}`, cursor: "pointer",
        background: ziel !== null ? alpha(C.primary, 0.1) : gewaehlt ? alpha(C.primary, 0.07) : "transparent",
        boxShadow: ziel !== null ? `inset 0 0 0 1px ${alpha(C.primary, 0.6)}` : gewaehlt ? `inset 3px 0 0 ${C.primary}` : "none",
      }}
      onMouseEnter={e => { if (!gewaehlt && ziel === null) e.currentTarget.style.background = C.surfaceContainer; }}
      onMouseLeave={e => { if (!gewaehlt && ziel === null) e.currentTarget.style.background = "transparent"; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: C.onSurface, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {s.name}
        </span>
        {zuTun && ziel === null && (
          <span title="Downloads oder FLP-Pfade offen" style={{ width: 7, height: 7, borderRadius: "50%", background: C.primary, flexShrink: 0 }} />
        )}
        <span style={{ fontSize: 12, fontWeight: 600, color: ziel !== null ? C.primary : farbe, flexShrink: 0 }}>
          {ziel !== null ? `${ziel === 1 ? "1 Datei" : `${ziel} Dateien`} → 02_ASSETS` : stand.text}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 7 }}>
        <span style={{ flex: 1, display: "flex", gap: 3 }}>
          {[0, 1, 2, 3].map(i => (
            <span key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i < stand.schritt ? farbe : C.border20 }} />
          ))}
        </span>
        <span style={{ fontSize: 11, color: C.onSecondaryFixedVar, width: 92, textAlign: "right", flexShrink: 0 }}>
          {s.fertig && s.abgegeben ? tageRelativ(s.abgegeben) : s.geaendert ? formatRelativeTime(s.geaendert) : "–"}
        </span>
      </div>
    </div>
  );
}

const HOEREN: { art: ArtistSong["audio"][number]["art"]; label: string }[] = [
  { art: "vocals", label: "Vocals" },
  { art: "demo", label: "Demo" },
  { art: "beat", label: "Beat" },
  { art: "mix", label: "Mix" },
  { art: "master", label: "Master" },
];

/** Reinhören (je Rolle die neueste Datei, über den Player der App) und der
 *  Verlauf aus den Dateidaten. */
function Reinhoeren({ song: s, kuenstler, bild }: { song: ArtistSong; kuenstler: string; bild: string | null }) {
  const { playBeat, currentBeat, isPlaying, togglePlay } = useAudioPlayerContext();
  const verlauf = songVerlauf(s.audio, s.abgegeben);
  const knoepfe = HOEREN.map(h => ({ ...h, dateien: s.audio.filter(a => a.art === h.art) })).filter(h => h.dateien.length > 0);
  const beschriftung: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.onSecondaryFixedVar, width: 80, flexShrink: 0,
  };
  if (knoepfe.length === 0 && verlauf.length === 0) return null;

  const abspielen = (pfad: string, label: string) => {
    const id = `kuenstler:${pfad}`;
    if (currentBeat?.id === id) { togglePlay(); return; }
    playBeat({
      id, name: `${s.name} · ${label} · ${kuenstler}`, path: s.path, bpm: null, key: null,
      status: null, tags: null, favorite: null, created_date: null, modified_date: null,
      notes: null, sold_to: null, has_artwork: null, has_video: null,
    }, bild ? convertFileSrc(bild.replace(/\\/g, "/")) : null, undefined, pfad);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {knoepfe.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={beschriftung}>Reinhören</span>
          {knoepfe.map(h => {
            const neueste = h.dateien[0];
            const laeuft = currentBeat?.id === `kuenstler:${neueste.path}` && isPlaying;
            return (
              <Button key={h.art} variant="secondary" size="sm" icon={laeuft ? Pause : Play}
                title={`${neueste.name}${h.dateien.length > 1 ? ` (neueste von ${h.dateien.length})` : ""}`}
                onClick={() => abspielen(neueste.path, h.label)}
              >
                {h.label}
              </Button>
            );
          })}
        </div>
      )}
      {verlauf.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 12 }}>
          <span style={beschriftung}>Verlauf</span>
          {verlauf.map((v, i) => (
            <Fragment key={v.label}>
              {i > 0 && <ArrowRight size={11} color={C.onSecondaryFixedVar} />}
              <span style={{ color: C.onSurfaceVariant }}>
                {v.label} <span style={{ color: C.onSurface, fontWeight: 600 }}>{v.datum.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}</span>
              </span>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

/** Rechts: der gewählte Song mit allem, was man an ihm tut. */
function SongDetail({ song: s, kuenstler, bild, onGeaendert, downloads, uebernehmen }: {
  song: ArtistSong;
  kuenstler: string;
  /** Profilbild des Künstlers — als Cover im Player. */
  bild: string | null;
  onGeaendert: () => void;
  downloads: Download[];
  uebernehmen: ZeilenDrop["uebernehmen"];
}) {
  const [abgabeOffen, setAbgabeOffen] = useState(false);
  const [notiz, setNotiz] = useState(s.notiz ?? "");
  const [fehler, setFehler] = useState<string | null>(null);
  // Standard: die neueste FLP. Neuer Song gewählt → wieder die neueste.
  const [flp, setFlp] = useState(s.flps[0]?.path ?? "");
  useEffect(() => { setNotiz(s.notiz ?? ""); setFehler(null); setFlp(s.flps[0]?.path ?? ""); }, [s.path]); // eslint-disable-line react-hooks/exhaustive-deps

  const stand = songStand(s);
  const neue = neueDownloads(s, downloads);
  const speichern = (n: string, warten: boolean) => {
    if (n === (s.notiz ?? "") && warten === s.warten) return;
    api.artists.setSong(s.path, n, warten)
      .then(() => { setFehler(null); onGeaendert(); })
      .catch(e => setFehler(String(e)));
  };
  const reparieren = () => api.artists.pfadeReparieren(s.path)
    .then(() => { setFehler(null); onGeaendert(); })
    .catch(err => setFehler(String(err)));
  const datum = (t: number) => new Date(t * 1000).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const beschriftung: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.onSecondaryFixedVar,
  };

  return (
    <section data-song={s.path} style={{
      position: "sticky", top: 0,
      background: C.surfaceContainerLow, border: `1px solid ${C.border10}`, borderRadius: radius.card,
      padding: 20, display: "flex", flexDirection: "column", gap: 16,
    }}>
      {/* Kopf: wer, was, wo es steht — und die FLP */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: C.onSecondaryFixedVar }}>{kuenstler}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.onSurface, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: STAND_FARBE[stand.ton], marginTop: 2 }}>{stand.text}</div>
        </div>
        <IconButton icon={FolderOpen} size={32} variant="secondary" title="Song-Ordner öffnen" onClick={() => revealItemInDir(s.path).catch(() => {})} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Button variant="primary" icon={Play} disabled={!flp}
          title={flp ? "Diese FLP in FL Studio öffnen" : "Keine FLP im Song"}
          onClick={() => openPath(flp).catch(e => setFehler(`FLP ließ sich nicht öffnen: ${String(e)}`))}
        >
          In FL öffnen
        </Button>
        {s.flps.length > 1 && (
          <Select value={flp} onChange={setFlp} title="Version"
            options={s.flps.map((f, i) => ({ value: f.path, label: `${f.name.replace(/\.flp$/i, "")} · ${datum(f.geaendert)}${i === 0 ? " · neueste" : ""}` }))}
            panelWidth={320} triggerStyle={{ height: 36 }} />
        )}
      </div>

      {/* Was zu tun ist */}
      {(neue.length > 0 || s.reparierbar > 0 || s.fehlend.length > 0) && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          {neue.length > 0 && (
            <Button variant="secondary" size="sm" icon={FolderInput}
              title={`Nach 02_ASSETS verschieben:\n${neue.map(d => d.name).join("\n")}`}
              onClick={() => uebernehmen(s.path, neue.map(d => d.path))}
            >
              {neue.length === 1 ? "1 Download zuweisen" : `${neue.length} Downloads zuweisen`}
            </Button>
          )}
          {s.reparierbar > 0 && (
            <Button variant="secondary" size="sm" icon={Wrench}
              title={"Neue Pfade in die FLP eintragen. "
                + "FLP vorher schließen, Sicherung in Backup/"}
              onClick={reparieren}
            >
              {s.reparierbar === 1 ? "1 Pfad reparieren" : `${s.reparierbar} Pfade reparieren`}
            </Button>
          )}
          {s.fehlend.length > 0 && (
            <span
              title={`Nicht gefunden:\n${s.fehlend.map(p => p.split(/[\\/]/).pop()).join("\n")}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: C.error }}
            >
              <AlertTriangle size={12} /> {s.fehlend.length === 1 ? "1 Datei fehlt" : `${s.fehlend.length} Dateien fehlen`}
            </span>
          )}
        </div>
      )}

      {/* Bausteine */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {BAUSTEINE.map(b => {
          const da = s[b.key];
          return (
            <span key={b.key} title={`${b.label}: ${da ? "vorhanden" : "fehlt"} · ${b.titel}`} style={{
              display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: radius.full,
              fontSize: 11, fontWeight: 600,
              background: da ? alpha(C.mint, 0.12) : "transparent",
              border: `1px ${da ? "solid" : "dashed"} ${da ? alpha(C.mint, 0.35) : C.border20}`,
              color: da ? C.mint : C.onSecondaryFixedVar,
            }}>
              {da && <Check size={10} strokeWidth={2.5} />}
              {b.label}
            </span>
          );
        })}
      </div>

      <Reinhoeren song={s} kuenstler={kuenstler} bild={bild} />

      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={beschriftung}>Notiz</span>
        <textarea
          value={notiz}
          aria-label={`Notiz zu ${s.name}`}
          placeholder="Was fehlt, was der Künstler wollte, wo es hakt …"
          rows={4}
          onChange={e => setNotiz(e.target.value)}
          onBlur={() => speichern(notiz, s.warten)}
          style={{
            width: "100%", padding: "8px 10px", fontSize: 13, lineHeight: 1.5, fontFamily: "inherit", resize: "vertical",
            background: C.surfaceContainerLowest, color: C.onSurface, outline: "none",
            border: `1px solid ${C.border20}`, borderRadius: radius.control, boxSizing: "border-box",
          }}
        />
      </label>

      <MeinBeat song={s} onGeaendert={onGeaendert} />

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", paddingTop: 4, borderTop: `1px solid ${C.border10}` }}>
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
        <span style={{ flex: 1 }} />
        {s.fertig ? (
          <Button variant="secondary" size="sm" icon={Undo2}
            title="Zurück aus _Fertig"
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
      {fehler && <div style={{ fontSize: 12, color: C.error }}>{fehler}</div>}
      {abgabeOffen && (
        <AbgabeDialog song={s} kuenstler={kuenstler} onClose={fertig => { setAbgabeOffen(false); if (fertig) onGeaendert(); }} />
      )}
    </section>
  );
}

/** „Mein Beat": welcher Katalog-Beat im Song steckt — mit BPM und Tonart,
 *  die WAV in 02_ASSETS kopieren oder für Stems die FLP des Beats öffnen.
 *  Verwendet die FLP schon Dateien eines Beats, wird er vorgeschlagen. */
function MeinBeat({ song: s, onGeaendert }: { song: ArtistSong; onGeaendert: () => void }) {
  const id = s.beat_id ?? null;
  const [daten, setDaten] = useState<UploadData | null>(null);
  const [vorschlag, setVorschlag] = useState<UploadData | null>(null);
  const [suche, setSuche] = useState("");
  const [treffer, setTreffer] = useState<Beat[]>([]);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setDaten(null);
    if (id) api.upload.getData(id).then(setDaten).catch(() => setDaten(null));
  }, [id]);
  useEffect(() => {
    setVorschlag(null);
    if (!id && s.beat_vorschlag) api.upload.getData(s.beat_vorschlag).then(setVorschlag).catch(() => {});
  }, [id, s.beat_vorschlag]);
  useEffect(() => {
    if (id || !suche.trim()) { setTreffer([]); return; }
    let ab = false;
    const t = setTimeout(() => {
      api.beats.getAll({ search: suche.trim(), onlyFavs: false, limit: 6, offset: 0 })
        .then(b => { if (!ab) setTreffer(b); }).catch(() => {});
    }, 150);
    return () => { ab = true; clearTimeout(t); };
  }, [suche, id]);

  const setzen = (beatId: string | null) => {
    setMeldung(null);
    setSuche("");
    api.artists.setBeat(s.path, beatId).then(onGeaendert).catch(e => setMeldung({ ok: false, text: String(e) }));
  };
  const info = (b: { name: string; bpm: number | null; key: string | null }) =>
    [b.name, b.bpm ? `${Math.round(b.bpm)} BPM` : null, b.key].filter(Boolean).join(" · ");

  const zeile: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12 };
  const beschriftung = (
    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.onSecondaryFixedVar, width: 80 }}>
      Mein Beat
    </span>
  );

  if (id) {
    const wav = daten?.assets.wav ?? null;
    const wavPfad = wav && daten ? `${daten.beat.path.replace(/[\\/]+$/, "")}\\${wav}` : null;
    const schonDa = !!wav && s.dateien.includes(wav);
    return (
      <div style={zeile}>
        {beschriftung}
        <Music2 size={13} color={C.primary} />
        <span style={{ fontWeight: 600, color: C.onSurface }}>{daten ? info(daten.beat) : id}</span>
        <span style={{ flex: 1 }} />
        <Button variant="secondary" size="sm" icon={FolderInput} disabled={!wavPfad || schonDa}
          title={!wav ? "Keine WAV im Beat-Ordner" : schonDa ? `${wav} liegt schon im Song` : `${wav} nach 02_ASSETS kopieren`}
          onClick={() => wavPfad && api.artists.beatKopieren(s.path, wavPfad)
            .then(() => { setMeldung({ ok: true, text: `${wav} kopiert` }); onGeaendert(); })
            .catch(e => setMeldung({ ok: false, text: String(e) }))}
        >
          WAV kopieren
        </Button>
        <Button variant="secondary" size="sm" icon={FolderTree} disabled={!daten?.assets.flp_path}
          title={daten?.assets.flp_path ? "FLP des Beats öffnen" : "Keine FLP im Beat-Ordner"}
          onClick={() => daten?.assets.flp_path && openPath(daten.assets.flp_path).catch(e => setMeldung({ ok: false, text: String(e) }))}
        >
          FLP öffnen
        </Button>
        <IconButton icon={X} size={28} variant="ghost" title="Verknüpfung lösen" onClick={() => setzen(null)} />
        {meldung && <span style={{ width: "100%", paddingLeft: 88, color: meldung.ok ? C.mint : C.error }}>{meldung.text}</span>}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={zeile}>
        {beschriftung}
        {vorschlag && (
          <Button variant="secondary" size="sm" icon={Music2}
            title="Die FLP verwendet Dateien aus diesem Beat-Ordner"
            onClick={() => setzen(vorschlag.beat.id)}
          >
            {info(vorschlag.beat)} verknüpfen
          </Button>
        )}
        <input
          value={suche}
          onChange={e => setSuche(e.target.value)}
          placeholder={vorschlag ? "… oder einen anderen Beat suchen" : "Beat aus dem Katalog suchen (Name oder Nummer)"}
          aria-label="Beat suchen"
          style={{
            flex: 1, minWidth: 200, padding: "5px 8px", fontSize: 12, fontFamily: "inherit",
            background: C.surfaceContainerLowest, color: C.onSurface, outline: "none",
            border: `1px solid ${C.border20}`, borderRadius: radius.control,
          }}
        />
      </div>
      {treffer.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 88, border: `1px solid ${C.border10}`, borderRadius: radius.control }}>
          {treffer.map(b => (
            <button key={b.id} onClick={() => setzen(b.id)} style={{
              display: "flex", gap: 8, padding: "6px 10px", border: "none", background: "transparent", cursor: "pointer",
              fontFamily: "inherit", fontSize: 12, color: C.onSurface, textAlign: "left",
            }}
              onMouseEnter={e => { e.currentTarget.style.background = C.surfaceContainerHigh; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ color: C.onSecondaryFixedVar, width: 36 }}>{b.id}</span>
              {info(b)}
            </button>
          ))}
        </div>
      )}
      {meldung && <span style={{ marginLeft: 88, fontSize: 12, color: meldung.ok ? C.mint : C.error }}>{meldung.text}</span>}
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
      subtitle="Export nach 03_VERSIONS, Song nach _Fertig"
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
