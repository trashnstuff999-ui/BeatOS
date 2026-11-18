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
import { createPortal } from "react-dom";
import { PLAYER_HEIGHT } from "../GlobalAudioPlayer";
import { Users, FolderPlus, Check, Mic2, FolderInput, ArrowRight, X, Plus, UserPlus, Send, Undo2, FolderTree, Music2, Play, Download, Image as ImageIcon, Pause, MoreHorizontal } from "lucide-react";
import { revealItemInDir, openPath } from "@tauri-apps/plugin-opener";
import { AssetImage } from "../AssetPickerDialog";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { C, alpha, radius } from "../../lib/theme";
import { api } from "../../lib/api";
import { formatRelativeTime } from "../../lib/time";
import { useFocusRefresh } from "../../hooks/useFocusRefresh";
import { useSettings, parseProductionPaths } from "../../contexts/SettingsContext";
import { projectDisplayName, type StudioProject } from "../../types/studio";
import { useFlVorlagen } from "../../hooks/useFlVorlagen";
import { Griff } from "./SamplesPane";
import { useLocation, useNavigate } from "react-router-dom";
import type { FlVorlage } from "../../lib/api";
import { EmptyState, Button, IconButton, Modal, Segmented, Select } from "../ui";
import { passtZumSong, pfadSchluessel, songStand, erledigtFuer, phase, aehnlich } from "../../lib/kuenstler";
import { useAudioPlayerContext } from "../../contexts/AudioPlayerContext";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { Artist, ArtistSong, ArtistsScan, Altbestand, Release } from "../../types/artists";
import type { UploadData } from "../../types/upload";
import type { Beat } from "../../types/browse";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { ArtistLeiste, ArtistBuehne, ReleaseRegal, NeuesProjektDialog, Avatar, PLATTFORMEN, useAkzent, UmbenennenText, SuchPopup, FarbWahl, cssVar } from "./ArtistKopf";
import { SessionStreifen, Trackliste } from "./ArtistTracks";
import "./kuenstler-wucht.css";

type Download = { name: string; path: string; geaendert: number };
/** Was jede Song-Zeile fürs Reinziehen und die Download-Vorschläge braucht. */
type ZeilenDrop = {
  downloads: Download[];
  ziehen: { pfad: string | null; anzahl: number; kuenstler: string | null } | null;
  uebernehmen: (songPfad: string, pfade: string[]) => void;
};

export function ArtistsPane({ root, archivePath, active }: { root: string; archivePath: string; active: boolean }) {
  const [scan, setScan] = useState<ArtistsScan | null>(null);
  const [altbestand, setAltbestand] = useState<Altbestand[]>([]);
  const [umzugOffen, setUmzugOffen] = useState(false);
  const [aufraeumenOffen, setAufraeumenOffen] = useState(false);
  // Der rechts gezeigte Song (Pfad). Nach Abgeben/Wieder öffnen ändert sich der
  // Pfad — dann fällt die Wahl auf den ersten offenen Song zurück.
  const [auswahl, setAuswahl] = useState<string | null>(null);
  // Gewählter Artist (Leiste), gemerkt über Neustarts.
  const [kuenstlerPfad, setKuenstlerPfadRoh] = useState<string | null>(() => { try { return localStorage.getItem("beatos.kuenstler"); } catch { return null; } });
  const setKuenstlerPfad = (p: string) => { setKuenstlerPfadRoh(p); try { localStorage.setItem("beatos.kuenstler", p); } catch { /* egal */ } };
  // Filter aus den Covern: Release-Pfad oder "singles".
  const [filter, setFilter] = useState<string | null>(null);
  const [profilOffen, setProfilOffen] = useState(false);
  const [planOffen, setPlanOffen] = useState(false);
  const [projektOffen, setProjektOffen] = useState(false);
  const [releaseArt, setReleaseArt] = useState<"ALBUM" | "EP" | null>(null);
  const [sucheOffen, setSucheOffen] = useState(false);
  // Strg+F öffnet die Suche, solange der Künstler-Tab offen ist.
  useEffect(() => {
    if (!active) return;
    const taste = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") { e.preventDefault(); setSucheOffen(true); }
    };
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, [active]);
  // Klicks wirken sofort: vorläufige Haken und Session, bis der nächste Scan da ist.
  const [vorlHaken, setVorlHaken] = useState<Record<string, string[]>>({});
  const [vorlSession, setVorlSession] = useState<Record<string, string[]>>({});
  const [fehler, setFehler] = useState<string | null>(null);
  const [legtAn, setLegtAn] = useState(false);
  // Offener Anlege-Dialog.
  const [neu, setNeu] = useState<"kuenstler" | "song" | null>(null);
  const { settings } = useSettings();
  const { von: vorlagenVon } = useFlVorlagen();
  // Aus „Neu" im Studio: Dialog gleich offen, Vorlage schon gewählt.
  const location = useLocation();
  const navigate = useNavigate();
  const [startVorlage, setStartVorlage] = useState<string | undefined>();
  useEffect(() => {
    const v = (location.state as { neuerSong?: string } | null)?.neuerSong;
    if (!v) return;
    setStartVorlage(v);
    setNeu("song");
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const laden = useCallback(() => {
    if (!root) return;
    api.artists.scan(root)
      .then(s => { setScan(s); setFehler(null); setVorlHaken({}); setVorlSession({}); })
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
        title="Kein Artist-Ordner"
        description="Archiv- oder Artist-Ordner in den Einstellungen setzen"
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
      Im Archiv {altbestand.length === 1 ? "liegt 1 Artist-Ordner" : `liegen ${altbestand.length} Artist-Ordner`}:
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
      titel="Neuer Artist"
      hinweis="Legt einen Ordner für den Artist an."
      anlegen={async name => { await api.artists.create(root, name); }}
      onClose={angelegt => { setNeu(null); if (angelegt) laden(); }}
    />
  ) || neu === "song" && scan && (
    <SongDialog
      kuenstler={[...scan.kuenstler].sort((a, b) => Number(b.path === kuenstlerPfad) - Number(a.path === kuenstlerPfad))}
      vorlagen={vorlagenVon("kuenstler")}
      start={startVorlage}
      onClose={angelegt => { setNeu(null); setStartVorlage(undefined); if (angelegt) laden(); }}
    />
  );

  let inhalt: React.ReactNode;
  if (fehler) inhalt = <EmptyState icon={Users} title="Artist-Ordner nicht lesbar" description={fehler} />;
  else if (!scan) inhalt = <div style={{ padding: 24, fontSize: 12, color: C.onSecondaryFixedVar }}>Lese Artist-Ordner …</div>;
  else if (!scan.vorhanden) {
    inhalt = (
      <EmptyState
        icon={FolderPlus}
        title="Artist-Ordner fehlt"
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
        title="Noch keine Artists"
        description="Je Artist ein Ordner, darin je Song einer."
        action={<Button variant="primary" icon={UserPlus} onClick={() => setNeu("kuenstler")}>Neuer Artist</Button>}
      />
    );
  } else {
    // Vorläufige Klicks einrechnen, dann wie gelesen weiter.
    const kuenstlerListe = scan.kuenstler.map(a => ({
      ...a,
      session: vorlSession[a.path] ?? a.session,
      songs: a.songs.map(s => vorlHaken[s.path] ? mitHaken(s, vorlHaken[s.path]) : s),
    }));
    // Ein Artist ist gewählt (Leiste); gewählt ist immer genau ein Song, ohne Wahl der erste offene des Artists.
    const k = kuenstlerListe.find(x => x.path === kuenstlerPfad) ?? kuenstlerListe[0];
    const alle = kuenstlerListe.flatMap(a => a.songs.map(s => ({ k: a, s })));
    const erledigtSetzen = (s: ArtistSong, liste: string[]) => {
      setVorlHaken(v => ({ ...v, [s.path]: liste }));
      api.artists.setErledigt(s.path, liste).then(laden).catch(e => {
        setMeldung(String(e));
        setVorlHaken(v => { const n = { ...v }; delete n[s.path]; return n; });
      });
    };
    const sessionSetzen = (liste: string[]) => {
      setVorlSession(v => ({ ...v, [k.path]: liste }));
      api.artists.setSession(k.path, liste).then(laden).catch(e => setMeldung(String(e)));
    };
    const sessionSongs = k.session.map(p => k.songs.find(s => s.path === p)).filter((s): s is ArtistSong => !!s && !s.fertig);
    const gewaehlt = alle.find(x => x.s.path === auswahl);
    const alleNamen = kuenstlerListe.map(a => a.name);
    const alsGast = alle.filter(x => x.k.path !== k.path && x.s.features.includes(k.name)).map(x => ({ song: x.s, von: x.k.name }));
    const releaseOrdner = new Set(k.releases.map(r => r.path));
    const singles = k.songs.filter(s => !releaseOrdner.has(ordnerVon(s.path)));
    inhalt = (
      <div style={{ display: "grid", gridTemplateColumns: "260px minmax(0, 1fr)", gap: 24, alignItems: "start" }}>
        <ArtistLeiste kuenstler={kuenstlerListe} gewaehlt={k.path}
          onWaehlen={p => { setKuenstlerPfad(p); setAuswahl(null); setFilter(null); }}
          onReihenfolge={namen => api.artists.setReihenfolge(root, namen).then(laden).catch(e => setMeldung(String(e)))}
          onNeu={() => setNeu("kuenstler")} />
        <div key={k.path} className="kw-einlauf" style={{ display: "flex", flexDirection: "column", gap: 28, minWidth: 0, position: "relative", isolation: "isolate" }}>
          <ArtistKopfBereich kuenstler={k} features={alsGast.length} bildZiel={ziehen?.kuenstler === k.path}
            filter={filter} singles={singles} onFilter={setFilter}
            onProfil={() => setProfilOffen(true)} onPlanen={() => setPlanOffen(true)} onNeu={() => setProjektOffen(true)}
            onUmbenennen={n => api.artists.umbenennen(k.path, "artist", n).then(neu => { setKuenstlerPfad(neu); laden(); }).catch(e => setMeldung(String(e)))} />
          {meldung && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.error }}>
              <X size={13} /> <span style={{ flex: 1 }}>{meldung}</span>
              <IconButton icon={X} size={24} variant="ghost" title="Ausblenden" onClick={() => setMeldung(null)} />
            </div>
          )}
          <ArtistFarbe kuenstler={k}>{akzent => (
            <>
              <SessionStreifen kuenstler={k} songs={sessionSongs} akzent={akzent} auswahl={gewaehlt?.s.path ?? null}
                release={s => k.releases.find(r => r.path === ordnerVon(s.path))}
                onStufe={(s, st) => erledigtSetzen(s, erledigtFuer(st))}
                onRaus={s => sessionSetzen(k.session.filter(p => p !== s.path))}
                onWaehlen={setAuswahl} />
                <Trackliste kuenstler={k} akzent={akzent} filter={filter} auswahl={gewaehlt?.s.path ?? null}
                  session={sessionSongs.map(s => s.path)} features={alsGast}
                  zuTun={s => neueDownloads(s, downloads).length + s.reparierbar + s.fehlend.length > 0}
                  ziehenPfad={ziehen && !ziehen.kuenstler ? { pfad: ziehen.pfad, anzahl: ziehen.anzahl } : null}
                  onWaehlen={setAuswahl}
                  onStufe={(s, st) => erledigtSetzen(s, erledigtFuer(st))}
                  onSession={s => sessionSetzen([...sessionSongs.map(x => x.path), s.path])}
                  onReleaseUmbenennen={(pfad, n) => api.artists.umbenennen(pfad, "release", n)
                    .then(neu => { if (filter === pfad) setFilter(neu); setAuswahl(null); laden(); }).catch(e => setMeldung(String(e)))} />
            {gewaehlt && (
              <DetailPanel onClose={() => setAuswahl(null)}>
            {gewaehlt.s.geplant ? (
              <GeplantDetail key={gewaehlt.s.path} song={gewaehlt.s} artist={gewaehlt.k} alleKuenstler={alleNamen}
                vorlagen={vorlagenVon("kuenstler")} onGeaendert={laden} />
            ) : (
              <SongDetail key={gewaehlt.s.path} song={gewaehlt.s} artist={gewaehlt.k} alleKuenstler={alleNamen} kuenstler={gewaehlt.k.name} bild={gewaehlt.k.bild} akzent={akzent}
                vorlagen={vorlagenVon("kuenstler")} onGeaendert={laden} onErledigt={l => erledigtSetzen(gewaehlt.s, l)} onVerschoben={p => { setAuswahl(p); laden(); }} downloads={downloads} uebernehmen={uebernehmen} />
            )}
              </DetailPanel>
            )}
            </>
          )}</ArtistFarbe>
        </div>
        {profilOffen && <ProfilDialog kuenstler={k} onClose={g => { setProfilOffen(false); if (g) laden(); }} />}
        {planOffen && <PlanDialog kuenstler={k} onClose={g => { setPlanOffen(false); if (g) laden(); }} />}
        {projektOffen && (
          <NeuesProjektDialog kuenstler={k.name} onClose={() => setProjektOffen(false)}
            onWahl={art => { setProjektOffen(false); if (art === "SINGLE") setNeu("song"); else setReleaseArt(art); }} />
        )}
        {sucheOffen && (
          <SuchPopup kuenstler={kuenstlerListe} onClose={() => setSucheOffen(false)}
            onWahl={t => {
              setSucheOffen(false);
              setKuenstlerPfad(t.artist);
              setFilter(t.art === "release" ? t.pfad : null);
              setAuswahl(t.art === "song" ? t.pfad : null);
            }} />
        )}
        {releaseArt && (
          <ReleaseDialog kuenstler={k} art={releaseArt}
            onClose={pfad => { setReleaseArt(null); if (pfad) { laden(); setFilter(pfad); } }} />
        )}
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
      title="Artist-Ordner aus dem Archiv umziehen"
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
                  aria-label={`Artist-Name für ${z.name}`}
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

const BESCHRIFTUNG: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.onSecondaryFixedVar, width: 80, flexShrink: 0,
};

/** Ordner, in dem ein Song liegt (Release-Ordner oder Artist-Ordner). */
const ordnerVon = (pfad: string) => pfad.replace(/[\\/][^\\/]+$/, "");

/** Song in ein Album/eine EP oder zu den Singles: eine Liste, ein Klick.
 *  Ein Song liegt in genau einem Ordner; Pfade in der FLP werden nachgezogen. */
function VerschiebenDialog({ song: s, artist, onFertig, onClose }: {
  song: ArtistSong;
  artist: Artist;
  onFertig: (neu: string) => void;
  onClose: () => void;
}) {
  const [neu, setNeu] = useState(false);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const hier = artist.releases.find(r => r.path === ordnerVon(s.path));
  const verschieben = async (ziel: string) => {
    setLaeuft(ziel); setFehler(null);
    try { onFertig(await api.artists.songVerschieben(s.path, ziel)); }
    catch (e) { setFehler(String(e)); setLaeuft(null); }
  };
  const ziel = (pfad: string, titel: React.ReactNode, unter: string) => (
    <button key={pfad} disabled={!!laeuft} onClick={() => verschieben(pfad)} style={{
      display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", border: "none", borderRadius: 8,
      background: "transparent", textAlign: "left", fontFamily: "inherit", color: C.onSurface, cursor: laeuft ? "default" : "pointer",
    }}
      onMouseEnter={e => { e.currentTarget.style.background = C.surfaceContainerHighest; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{titel}</span>
        <span style={{ display: "block", fontSize: 11, color: C.onSurfaceVariant }}>{laeuft === pfad ? "Verschiebe …" : unter}</span>
      </span>
      <ArrowRight size={13} color={C.onSecondaryFixedVar} />
    </button>
  );
  if (neu) {
    return <ReleaseDialog kuenstler={artist} track={s.name} onClose={pfad => { setNeu(false); if (pfad) verschieben(pfad); }} />;
  }
  return (
    <Modal icon={FolderInput} title="Verschieben" subtitle={`„${s.name}“ liegt in ${hier ? `${hier.art} · ${hier.titel}` : "Singles"}`} width={480} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: "50vh", overflowY: "auto" }}>
        {artist.releases.filter(r => r !== hier).map(r => ziel(r.path, r.titel, r.art))}
        {hier && ziel(artist.path, "Singles", "Direkt beim Artist")}
        <button onClick={() => setNeu(true)} style={{
          display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", marginTop: 4, border: `1px dashed ${C.border20}`, borderRadius: 8,
          background: "transparent", fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: C.onSurfaceVariant, cursor: "pointer",
        }}><Plus size={14} /> Neues Release …</button>
      </div>
      {fehler && <div style={{ marginTop: 10, fontSize: 12, color: C.error }}>{fehler}</div>}
    </Modal>
  );
}

/** Zusammenführen in einem Dialog: erst den anderen Ordner wählen (ähnliche
 *  Namen oben), dann eine kurze Vorschau, dann ein Klick. */
function ZusammenDialog({ song: s, artist, onFertig, onClose }: {
  song: ArtistSong;
  artist: Artist;
  onFertig: (bleibt: string) => void;
  onClose: () => void;
}) {
  const [suche, setSuche] = useState("");
  const [paar, setPaar] = useState<{ ziel: string; quelle: string } | null>(null);
  const [plan, setPlan] = useState<Awaited<ReturnType<typeof api.artists.zusammenfuehrenPlan>> | null>(null);
  const [details, setDetails] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  useEffect(() => {
    setPlan(null); setFehler(null);
    if (paar) api.artists.zusammenfuehrenPlan(paar.ziel, paar.quelle).then(setPlan).catch(e => setFehler(String(e)));
  }, [paar]);

  const titelVon = (p: string) => {
    const r = artist.releases.find(r => r.path === ordnerVon(p));
    const name = p.split(/[\\/]/).pop() ?? p;
    return r ? `${name} · ${r.titel}` : `${name} · Single`;
  };
  const andere = artist.songs.filter(x => !x.geplant && x.path !== s.path);
  const vorschlaege = andere.filter(x => aehnlich(x.name, s.name));
  const q = suche.trim().toLowerCase();
  const rest = andere.filter(x => !vorschlaege.includes(x) && (!q || titelVon(x.path).toLowerCase().includes(q)));
  const zahl = (a: string) => plan?.filter(x => x.art === a).length ?? 0;

  const zeile = (x: ArtistSong) => (
    <button key={x.path} onClick={() => setPaar({ ziel: s.path, quelle: x.path })} style={{
      display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 12px", border: "none", borderRadius: 8,
      background: "transparent", textAlign: "left", fontFamily: "inherit", fontSize: 13, color: C.onSurface, cursor: "pointer",
    }}
      onMouseEnter={e => { e.currentTarget.style.background = C.surfaceContainerHighest; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titelVon(x.path)}</span>
      <ArrowRight size={13} color={C.onSecondaryFixedVar} />
    </button>
  );
  const ueber: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.onSecondaryFixedVar, padding: "6px 12px 2px" };

  const los = async () => {
    if (!paar) return;
    setLaeuft(true); setFehler(null);
    try { await api.artists.zusammenfuehren(paar.ziel, paar.quelle); onFertig(paar.ziel); }
    catch (e) { setFehler(String(e)); setLaeuft(false); }
  };

  return (
    <Modal icon={FolderInput} title="Zusammenführen" subtitle={paar ? "FLPs vorher in FL schließen" : `Welcher Ordner ist auch „${s.name}“?`} width={520}
      onClose={onClose}
      footer={paar ? <>
        <Button variant="ghost" onClick={() => setPaar(null)}>Zurück</Button>
        <Button variant="primary" loading={laeuft} disabled={!plan} onClick={los}>Zusammenführen</Button>
      </> : undefined}>
      {!paar ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input autoFocus value={suche} onChange={e => setSuche(e.target.value)} placeholder="Song suchen …" aria-label="Song suchen"
            style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 13, fontFamily: "inherit", background: C.surfaceContainerLowest, color: C.onSurface, outline: "none", border: `1px solid ${C.border20}`, borderRadius: radius.control }} />
          <div style={{ maxHeight: "50vh", overflowY: "auto", border: `1px solid ${C.border10}`, borderRadius: radius.control, padding: 4 }}>
            {vorschlaege.length > 0 && !q && <><div style={ueber}>Vorschläge</div>{vorschlaege.map(zeile)}<div style={ueber}>Alle Songs</div></>}
            {(q ? [...vorschlaege.filter(x => titelVon(x.path).toLowerCase().includes(q)), ...rest] : rest).map(zeile)}
            {andere.length === 0 && <div style={{ padding: 12, fontSize: 12, color: C.onSurfaceVariant }}>Keine anderen Songs bei {artist.name}</div>}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", fontSize: 13 }}>
            <span style={{ color: C.onSurfaceVariant }}>Fällt weg: <b style={{ color: C.onSurface }}>{titelVon(paar.quelle)}</b></span>
            <span />
            <span style={{ color: C.onSurfaceVariant }}>Bleibt: <b style={{ color: C.onSurface }}>{titelVon(paar.ziel)}</b></span>
            <Button variant="secondary" size="sm" icon={Undo2} onClick={() => setPaar({ ziel: paar.quelle, quelle: paar.ziel })}>Tauschen</Button>
          </div>
          {plan ? (
            <div style={{ padding: "10px 12px", borderRadius: 10, background: C.surfaceContainerLow, fontSize: 13, color: C.onSurface, display: "flex", flexDirection: "column", gap: 4 }}>
              <span><b>{zahl("neu")}</b> Dateien kommen dazu</span>
              {zahl("umbenannt") > 0 && <span><b>{zahl("umbenannt")}</b> heißen gleich, bekommen eine Nummer (_2)</span>}
              {zahl("gleich") > 0 && <span><b>{zahl("gleich")}</b> sind exakt doppelt und fallen weg</span>}
              <span style={{ color: C.onSurfaceVariant, fontSize: 12 }}>Nichts wird überschrieben, FLP-Pfade ziehen mit.</span>
              <button onClick={() => setDetails(d => !d)} style={{ alignSelf: "flex-start", border: "none", background: "transparent", color: C.onSurfaceVariant, fontFamily: "inherit", fontSize: 12, fontWeight: 600, padding: 0, marginTop: 4, cursor: "pointer" }}>
                {details ? "Dateien ausblenden" : "Dateien zeigen"}
              </button>
              {details && (
                <div style={{ maxHeight: 200, overflowY: "auto", marginTop: 4 }}>
                  {plan.map(x => (
                    <div key={x.von} style={{ display: "flex", gap: 10, fontSize: 12, padding: "3px 0" }}>
                      <span title={x.nach} style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.nach.slice(paar.ziel.length + 1)}</span>
                      <span style={{ color: x.art === "gleich" ? C.onSecondaryFixedVar : x.art === "umbenannt" ? C.primary : C.mint }}>{x.art === "gleich" ? "doppelt" : x.art === "umbenannt" ? "mit Nummer" : "neu"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : !fehler && <div style={{ fontSize: 12, color: C.onSecondaryFixedVar }}>Vergleiche die Ordner …</div>}
        </div>
      )}
      {fehler && <div style={{ marginTop: 10, fontSize: 12, color: C.error }}>{fehler}</div>}
    </Modal>
  );
}

/** Gäste des Songs: × nimmt einen raus, das Menü bietet die anderen Künstler an.
 *  Der Ordner bleibt beim Hauptkünstler, der Gast sieht den Track bei sich. */
function FeatureZeile({ song: s, artist, alleKuenstler, onGeaendert, onFehler }: {
  song: ArtistSong;
  artist: Artist;
  alleKuenstler: string[];
  onGeaendert: () => void;
  onFehler: (f: string | null) => void;
}) {
  const setzen = (liste: string[]) => api.artists.setFeatures(artist.path, s.name, liste)
    .then(() => { onFehler(null); onGeaendert(); })
    .catch(e => onFehler(String(e)));
  const frei = alleKuenstler.filter(n => n !== artist.name && !s.features.includes(n));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span style={BESCHRIFTUNG}>Feat.</span>
      {s.features.map(f => (
        <span key={f} style={{
          display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 4px 2px 10px", borderRadius: radius.full,
          fontSize: 12, fontWeight: 600, color: C.tertiary, border: `1px solid ${alpha(C.tertiary, 0.35)}`, background: alpha(C.tertiary, 0.1),
        }}>
          {f}
          <IconButton icon={X} size={20} variant="ghost" title={`${f} entfernen`} onClick={() => setzen(s.features.filter(x => x !== f))} />
        </span>
      ))}
      {frei.length > 0 && (
        <Select<string> value="" placeholder="Feature-Artist …" panelWidth={220} triggerStyle={{ height: 28 }}
          onChange={v => setzen([...s.features, v])}
          options={frei.map(n => ({ value: n, label: n }))} />
      )}
    </div>
  );
}

/** Rechts, für einen geplanten Track: noch kein Ordner. „Anfangen" legt
 *  Ordner und FLP aus der Vorlage an und öffnet sie in FL. */
function GeplantDetail({ song: s, artist, alleKuenstler, vorlagen, onGeaendert }: {
  song: ArtistSong;
  artist: Artist;
  alleKuenstler: string[];
  vorlagen: FlVorlage[];
  onGeaendert: () => void;
}) {
  const [vorlage, setVorlage] = useState(vorlagen[0]?.pfad ?? "");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const gewaehlt = vorlage || vorlagen[0]?.pfad || "";

  const anfangen = async () => {
    setLaeuft(true);
    setFehler(null);
    try {
      const flp = await api.artists.createSong(artist.path, s.name, gewaehlt);
      openPath(flp).catch(() => {});
      onGeaendert();
    } catch (e) { setFehler(String(e)); }
    finally { setLaeuft(false); }
  };
  const entfernen = () => api.artists.setGeplant(artist.path, artist.songs.filter(g => g.geplant && g.name !== s.name).map(g => g.name))
    .then(onGeaendert).catch(e => setFehler(String(e)));

  return (
    <section style={{
      background: C.surfaceContainerLow, border: `1px solid ${C.border10}`, borderRadius: radius.card,
      padding: 20, display: "flex", flexDirection: "column", gap: 16,
    }}>
      <div>
        <div style={{ fontSize: 12, color: C.onSecondaryFixedVar }}>{artist.name}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.onSurface, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.onSurfaceVariant, marginTop: 2 }}>Geplant · noch kein Ordner</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Button variant="primary" icon={Play} loading={laeuft} disabled={!gewaehlt}
          title={gewaehlt ? "Ordner und FLP aus der Vorlage anlegen, in FL öffnen" : "Keine Artist-Vorlage in FL/Recording oder FL/Mix-Master"}
          onClick={anfangen}>Session anlegen</Button>
        {vorlagen.length > 1 && (
          <Select value={gewaehlt} onChange={setVorlage} title="Vorlage" panelWidth={280} triggerStyle={{ height: 36 }}
            options={vorlagen.map(v => ({ value: v.pfad, label: `${v.ordner} · ${v.name}` }))} />
        )}
        <span style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" icon={X} onClick={entfernen}>Aus dem Plan nehmen</Button>
      </div>
      <FeatureZeile song={s} artist={artist} alleKuenstler={alleKuenstler} onGeaendert={onGeaendert} onFehler={setFehler} />
      {fehler && <div style={{ fontSize: 12, color: C.error }}>{fehler}</div>}
    </section>
  );
}

/** Offene Tracks auf einmal eintragen, z. B. Jarnos Liste aus WhatsApp:
 *  ein Name pro Zeile. Geplante Tracks sind erst Singles; ins Album nach „Anfangen“. */
function PlanDialog({ kuenstler: k, onClose }: { kuenstler: Artist; onClose: (geaendert: boolean) => void }) {
  const [text, setText] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  // Aufzählungszeichen und Nummern aus WhatsApp-Listen fallen weg.
  const namen = text.split("\n").map(z => z.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "").trim()).filter(Boolean);
  const vorhanden = new Set(k.songs.map(s => s.name.toLowerCase()));
  const neue = namen.filter(n => !vorhanden.has(n.toLowerCase()));

  const eintragen = async () => {
    setLaeuft(true);
    setFehler(null);
    try {
      await api.artists.setGeplant(k.path, [...k.songs.filter(s => s.geplant).map(s => s.name), ...neue]);
      onClose(true);
    } catch (e) { setFehler(String(e)); setLaeuft(false); }
  };

  return (
    <Modal
      icon={Plus}
      title="Tracks planen"
      subtitle={k.name}
      width={520}
      onClose={() => onClose(false)}
      footer={<>
        <Button variant="ghost" onClick={() => onClose(false)}>Abbrechen</Button>
        <Button variant="primary" loading={laeuft} disabled={namen.length === 0} onClick={eintragen}>
          {neue.length === 1 ? "1 Track eintragen" : `${neue.length} Tracks eintragen`}
        </Button>
      </>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <textarea
          autoFocus
          value={text}
          rows={8}
          aria-label="Tracks, ein Name pro Zeile"
          placeholder={"Ein Name pro Zeile, z. B.\nTeufelskraut\nVergangene Nächte"}
          onChange={e => setText(e.target.value)}
          style={{
            width: "100%", padding: "8px 10px", fontSize: 13, lineHeight: 1.5, fontFamily: "inherit", resize: "vertical",
            background: C.surfaceContainerLowest, color: C.onSurface, outline: "none",
            border: `1px solid ${C.border20}`, borderRadius: radius.control, boxSizing: "border-box",
          }}
        />
        {namen.length > neue.length && (
          <div style={{ fontSize: 12, color: C.onSurfaceVariant }}>
            Gibt es schon: {namen.filter(n => vorhanden.has(n.toLowerCase())).join(", ")}
          </div>
        )}
      </div>
      {fehler && <div style={{ marginTop: 8, fontSize: 12, color: C.error }}>{fehler}</div>}
    </Modal>
  );
}

/** Neues Album oder neue EP: legt den Ordner `<ART> - <Titel>` an. Mit `track`
 *  kommt der Song danach hinein. Gibt den Ordner zurück (null = abgebrochen). */
function ReleaseDialog({ kuenstler: k, track, art: start = "ALBUM", onClose }: {
  kuenstler: Artist;
  track?: string;
  art?: Release["art"];
  onClose: (pfad: string | null) => void;
}) {
  const [art, setArt] = useState<Release["art"]>(start);
  const [titel, setTitel] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const ok = async () => {
    if (!titel.trim() || laeuft) return;
    setLaeuft(true);
    setFehler(null);
    try { onClose(await api.artists.createRelease(k.path, art, titel.trim())); }
    catch (e) { setFehler(String(e)); setLaeuft(false); }
  };

  return (
    <Modal
      icon={Music2}
      title="Neues Release"
      subtitle={titel.trim() ? `${k.name}/${art} - ${titel.trim()}/` : track ? `Mit ${track}` : k.name}
      width={460}
      onClose={() => onClose(null)}
      footer={<>
        <Button variant="ghost" onClick={() => onClose(null)}>Abbrechen</Button>
        <Button variant="primary" loading={laeuft} disabled={!titel.trim()} onClick={ok}>{track ? "Anlegen und verschieben" : "Anlegen"}</Button>
      </>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Segmented label="Art" value={art} onChange={setArt}
          options={[{ value: "ALBUM", label: "Album" }, { value: "EP", label: "EP" }]} />
        <input
          autoFocus
          value={titel}
          aria-label="Titel"
          placeholder="Titel"
          onChange={e => setTitel(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") ok(); }}
          style={{
            width: "100%", padding: "8px 10px", fontSize: 13, fontFamily: "inherit",
            background: C.surfaceContainerLowest, color: C.onSurface, outline: "none",
            border: `1px solid ${C.border20}`, borderRadius: radius.control, boxSizing: "border-box",
          }}
        />
      </div>
      {fehler && <div style={{ marginTop: 8, fontSize: 12, color: C.error }}>{fehler}</div>}
    </Modal>
  );
}

/** Neuer Song: Künstler wählen, Namen eingeben, dazu Dateien aus den
 *  Downloads. Was zum Namen passt („heartbreak highlights_vocals"), ist
 *  vorausgewählt; von Hand An- oder Abgewähltes gilt vor dem Vorschlag. */
function SongDialog({ kuenstler, vorlagen, start, onClose }: {
  kuenstler: Artist[];
  /** FLPs aus FL/Recording und FL/Mix-Master */
  vorlagen: FlVorlage[];
  start?: string;
  onClose: (angelegt: boolean) => void;
}) {
  const [wer, setWer] = useState(kuenstler[0]?.path ?? "");
  const [gewaehlteVorlage, setVorlage] = useState(start);
  const vorlage = gewaehlteVorlage ?? vorlagen[0]?.pfad ?? "";
  const [name, setName] = useState("");
  const [nurMaster, setNurMaster] = useState(false);
  const [beat, setBeat] = useState<BeatWahl | null>(null);
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
    if (!vorlage) { setFehler("Keine Vorlage in FL/Recording oder FL/Mix-Master"); return; }
    setLaeuft(true);
    setFehler(null);
    try {
      const flp = await api.artists.createSong(wer, name.trim(), vorlage);
      // FLP liegt in <Song>/01_SAVEFILES/ — zwei Ebenen hoch.
      const songPfad = flp.replace(/[\\/][^\\/]+[\\/][^\\/]+$/, "");
      if (nurMaster) await api.artists.setNurMaster(songPfad, true);
      // Der Song steht: was jetzt schiefgeht, wird gemeldet, nicht verschluckt.
      const schief: string[] = [];
      if (beat) {
        try {
          await api.artists.setBeat(songPfad, beat.beatId, beat.projekt);
          if (beat.beatId) {
            const daten = await api.upload.getData(beat.beatId);
            await api.artists.beatHolen(songPfad, daten.beat.path, daten.assets.wav);
          } else if (beat.projekt) {
            await api.artists.beatHolen(songPfad, beat.projekt, null);
          }
        } catch (e) { schief.push(`Beat ${beat.nummer}: ${String(e)}`); }
      }
      if (mit.length > 0 || schief.length > 0) {
        const erg = mit.length > 0 ? await api.artists.assetsFuellen(songPfad, mit.map(d => d.path)) : [];
        schief.push(...erg.filter(e => !e.ok).map(e => `${e.pfad.split(/[\\/]/).pop()} ${e.meldung}`));
        if (schief.length > 0) {
          setFehler(`Song angelegt, aber: ${schief.join("; ")}`);
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
          <span style={beschriftung}>Artist</span>
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
        <Segmented label="Art" value={nurMaster ? "master" : "mixmaster"} onChange={v => setNurMaster(v === "master")}
          options={[{ value: "mixmaster", label: "Mix & Master" }, { value: "master", label: "Nur Master" }]} />
      </div>

      {vorlagen.length > 1 && (
        <label style={{ display: "block", marginTop: 16 }}>
          <span style={beschriftung}>Vorlage</span>
          <Select value={vorlage} onChange={setVorlage}
            options={vorlagen.map(v => ({ value: v.pfad, label: `${v.ordner} · ${v.name}` }))}
            panelWidth={300} triggerStyle={{ width: "100%", height: 36 }} />
        </label>
      )}

      <div style={{ marginTop: 16 }}>
        <span style={beschriftung}>Mein Beat</span>
        {beat ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.onSurface }}>
            <Music2 size={13} color={C.primary} />
            <span style={{ fontWeight: 600 }}>{beat.nummer} · {beat.text}</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: C.onSurfaceVariant }}>WAV + Stems nach 02_ASSETS</span>
            <IconButton icon={X} size={28} variant="ghost" title="Ohne Beat" onClick={() => setBeat(null)} />
          </div>
        ) : (
          <BeatSuche onWahl={setBeat} platzhalter="Beat suchen: Katalog oder Produktion (Name oder Nummer)" />
        )}
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
      <FarbWahl kuenstler={{ ...k, bild }} onGeaendert={() => setGeaendert(true)} onFehler={setFehler} />
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

const HOEREN: { art: ArtistSong["audio"][number]["art"]; label: string }[] = [
  { art: "vocals", label: "Vocals" },
  { art: "demo", label: "Demo" },
  { art: "beat", label: "Beat" },
  { art: "mix", label: "Mix" },
  { art: "master", label: "Master" },
];

/** Song-Panel: Kopf mit Cover, eine Aktionszeile, Stand, Hinweise nur bei Bedarf,
 *  Versionen, Credits, Notiz, Abgeben unten fest. Seltenes hinter ⋯. */
function SongDetail({ song: s, artist, alleKuenstler, kuenstler, vorlagen, bild, akzent, onGeaendert, onErledigt, onVerschoben, downloads, uebernehmen }: {
  /** Haken setzen, wirkt sofort. */
  onErledigt: (liste: string[]) => void;
  /** Nach dem Verschieben in ein Release: neuer Pfad. */
  onVerschoben: (neu: string) => void;
  song: ArtistSong;
  /** Für die Releases des Künstlers. */
  artist: Artist;
  /** Namen aller Künstler, als Gäste wählbar. */
  alleKuenstler: string[];
  kuenstler: string;
  /** FLPs aus FL/Mix-Master und FL/Recording, für „Neuer Mix" */
  vorlagen: FlVorlage[];
  /** Profilbild des Künstlers — als Cover im Player. */
  bild: string | null;
  akzent: string;
  onGeaendert: () => void;
  downloads: Download[];
  uebernehmen: ZeilenDrop["uebernehmen"];
}) {
  const [abgabeOffen, setAbgabeOffen] = useState(false);
  const [menue, setMenue] = useState(false);
  const [dialog, setDialog] = useState<"verschieben" | "zusammen" | "mix" | null>(null);
  const [notiz, setNotiz] = useState(s.notiz ?? "");
  const [fehler, setFehler] = useState<string | null>(null);
  // Standard: die neueste FLP. Neuer Song gewählt → wieder die neueste.
  const [flp, setFlp] = useState(s.flps[0]?.path ?? "");
  useEffect(() => { setNotiz(s.notiz ?? ""); setFehler(null); setFlp(s.flps[0]?.path ?? ""); }, [s.path]); // eslint-disable-line react-hooks/exhaustive-deps
  const { playBeat, currentBeat, isPlaying, togglePlay } = useAudioPlayerContext();

  const release = artist.releases.find(r => r.path === ordnerVon(s.path));
  const cover = release?.cover ?? bild;
  const stufe = songStand(s).schritt;
  const neue = neueDownloads(s, downloads);
  const speichern = (n: string, warten: boolean) => {
    if (n === (s.notiz ?? "") && warten === s.warten) return;
    api.artists.setSong(s.path, n, warten)
      .then(() => { setFehler(null); onGeaendert(); })
      .catch(e => setFehler(String(e)));
  };
  const fehlerVon = (e: unknown) => setFehler(String(e));
  // Neuer Mix: FLP aus der Vorlage, in FL öffnen, Mix/Master/Abgegeben zurück.
  const neuerMix = (vorlage: string) => {
    setDialog(null);
    api.artists.neuerMix(s.path, vorlage).then(neu => {
      setFlp(neu);
      openPath(neu).catch(e => setFehler(`FLP ließ sich nicht öffnen: ${String(e)}`));
      onErledigt(s.vocals ? ["vocals"] : []);
    }).catch(fehlerVon);
  };
  const datum = (t: number) => new Date(t * 1000).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const abspielen = (pfad: string, label: string) => {
    const id = `kuenstler:${pfad}`;
    if (currentBeat?.id === id) { togglePlay(); return; }
    playBeat({
      id, name: `${s.name} · ${label} · ${kuenstler}`, path: s.path, bpm: null, key: null,
      status: null, tags: null, favorite: null, created_date: null, modified_date: null,
      notes: null, sold_to: null, has_artwork: null, has_video: null,
    }, bild ? convertFileSrc(bild.replace(/\\/g, "/")) : null, undefined, pfad);
  };
  const neuestes = s.audio[0];
  const block: React.CSSProperties = { padding: "20px 24px", borderTop: `1px solid ${C.border10}`, display: "flex", flexDirection: "column", gap: 10 };
  const ueber: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.onSecondaryFixedVar };
  const menuePunkt = (label: string, onClick: () => void, rot = false) => (
    <button onClick={() => { setMenue(false); onClick(); }} style={{
      border: "none", background: "transparent", textAlign: "left", padding: "8px 10px", borderRadius: 7,
      fontFamily: "inherit", fontSize: 13, color: rot ? C.error : C.onSurface, cursor: "pointer",
    }}
      onMouseEnter={e => { e.currentTarget.style.background = C.surfaceContainerHighest; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>{label}</button>
  );

  return (
    <section data-song={s.path} style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      {/* Kopf: Cover, wo der Song steht, Name, ft. und Phase */}
      <div style={{ ...cssVar({ "--akzent": akzent }), position: "relative", display: "flex", gap: 18, padding: "30px 24px 24px", background: `linear-gradient(180deg, color-mix(in srgb, ${akzent} 30%, ${C.surfaceContainerLow}), ${C.background})` }}>
        <span className="kw-pcover" style={{ width: 128, height: 128, borderRadius: 14, overflow: "hidden", flexShrink: 0, display: "flex", background: C.surfaceContainer, boxShadow: `0 0 19px color-mix(in srgb, ${akzent} 29%, transparent), 0 14px 30px rgba(0,0,0,0.5)` }}>
          {cover && <AssetImage path={cover} fit="cover" />}
        </span>
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 4, paddingRight: 64 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: akzent, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {release ? `${release.art} · ${release.titel} · Track ${release.tracks.indexOf(s.name) + 1}` : `Single · ${kuenstler}`}
          </span>
          <UmbenennenText text={s.name} titel="Song" style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.02, letterSpacing: "-0.02em", color: C.onSurface, overflowWrap: "anywhere" }}
            onSpeichern={n => api.artists.umbenennen(s.path, "song", n).then(onVerschoben).catch(fehlerVon)} />
          <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
            {s.features.length > 0 && <span style={{ color: C.tertiary }}>ft. {s.features.join(", ")}</span>}
            <span style={{ padding: "2px 8px", borderRadius: radius.full, background: alpha(C.onSurface, 0.08), color: C.onSurfaceVariant, fontWeight: 600 }}>{phase(s)}</span>
          </span>
        </div>
        {/* Seltenes hinter ⋯ (das × sitzt im Panel daneben) */}
        <div style={{ position: "absolute", top: 12, right: 50 }}>
          <IconButton icon={MoreHorizontal} size={30} variant="ghost" title="Mehr" onClick={() => setMenue(m => !m)} />
          {menue && (
            <>
              <div data-modal onClick={() => setMenue(false)} style={{ position: "fixed", inset: 0, zIndex: 1 }} />
              <div data-modal style={{
                position: "absolute", top: 34, right: 0, zIndex: 2, minWidth: 220, padding: 4, display: "flex", flexDirection: "column",
                background: C.surfaceContainerHigh, border: `1px solid ${C.border30}`, borderRadius: 10, boxShadow: "0 12px 30px rgba(0,0,0,0.5)",
              }}>
                {!s.im_fertig && menuePunkt("Neuer Mix", () => {
                  if (vorlagen.length === 0) setFehler("Keine Vorlage in FL/Mix-Master oder FL/Recording");
                  else if (vorlagen.length === 1) neuerMix(vorlagen[0].pfad);
                  else setDialog("mix");
                })}
                {menuePunkt("Verschieben nach …", () => setDialog("verschieben"))}
                {menuePunkt("Zusammenführen mit …", () => setDialog("zusammen"))}
                {!s.fertig && menuePunkt(s.nur_master ? "Mix & Master" : "Nur Master", () => api.artists.setNurMaster(s.path, !s.nur_master).then(onGeaendert).catch(fehlerVon))}
                {menuePunkt("Ordner öffnen", () => openPath(s.path).catch(() => {}))}
                <div style={{ borderTop: `1px solid ${C.border10}`, margin: "4px 0" }} />
                {menuePunkt("Kein Song", () => api.artists.keinSong(s.path).then(onGeaendert).catch(fehlerVon), true)}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Eine Aktionszeile */}
      <div style={{ display: "flex", gap: 8, padding: "0 24px 20px", flexWrap: "wrap", alignItems: "center" }}>
        <Button variant="primary" icon={Play} disabled={!flp} className="kw-heben"
          style={{ fontSize: 14, padding: "11px 18px", boxShadow: flp ? `0 8px 24px -6px color-mix(in srgb, ${akzent} 45%, transparent)` : undefined }}
          title={flp ? "Diese FLP in FL Studio öffnen" : "Keine FLP im Song"}
          onClick={() => openPath(flp).catch(e => setFehler(`FLP ließ sich nicht öffnen: ${String(e)}`))}>
          In FL öffnen
        </Button>
        {s.flps.length > 1 && (
          <Select value={flp} onChange={setFlp} title="Version"
            options={s.flps.map((f, i) => ({ value: f.path, label: `${f.name.replace(/\.flp$/i, "")} · ${datum(f.geaendert)}${i === 0 ? " · neueste" : ""}` }))}
            panelWidth={320} triggerStyle={{ height: 36, maxWidth: 170 }} />
        )}
        <span style={{ flex: 1 }} />
        {neuestes && (
          <Button variant="secondary" className="kw-heben" style={{ fontSize: 14, padding: "11px 16px" }} icon={currentBeat?.id === `kuenstler:${neuestes.path}` && isPlaying ? Pause : Play}
            title={neuestes.name} onClick={() => abspielen(neuestes.path, "neueste")}>Reinhören</Button>
        )}
      </div>

      {/* Stand: vier Felder, Klick setzt bis dahin */}
      <div style={block}>
        <span style={ueber}>Stand</span>
        <div style={{ ...cssVar({ "--akzent": akzent }), display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {["Vocals", "Mix", "Master", "Abgegeben"].map((label, n) => {
            const i = n + 1;
            const an = stufe >= i;
            const farbe = i === 4 ? C.mint : akzent;
            const gesperrt = i === 4 && s.im_fertig;
            return (
              <button key={label} disabled={gesperrt} aria-pressed={an} title={gesperrt ? "Liegt in _Fertig" : label} className="kw-pled"
                onClick={() => onErledigt(erledigtFuer(stufe === i ? i - 1 : i))}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "16px 6px", borderRadius: 14,
                  border: `1px solid ${an ? `color-mix(in srgb, ${farbe} 35%, transparent)` : C.border10}`, background: C.surfaceContainerLow,
                  fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: an ? C.onSurface : C.onSurfaceVariant, cursor: gesperrt ? "default" : "pointer",
                }}>
                <span style={{ width: 26, height: 26, borderRadius: "50%", background: an ? farbe : C.surfaceContainerHighest, border: an ? "none" : `1px solid ${C.border20}`, boxShadow: an ? `0 0 16px color-mix(in srgb, ${farbe} 75%, transparent)` : "none" }} />
                {label}
              </button>
            );
          })}
        </div>
        {!s.fertig && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: s.warten ? C.tertiary : C.onSurfaceVariant, cursor: "pointer", alignSelf: "flex-start" }}>
            <input type="checkbox" checked={s.warten} onChange={e => speichern(notiz, e.target.checked)} style={{ accentColor: C.tertiary }} />
            Feedback offen
          </label>
        )}
      </div>

      {/* Nur wenn etwas zu tun ist */}
      {(neue.length > 0 || s.reparierbar > 0 || s.fehlend.length > 0) && (
        <div style={{ margin: "0 20px 16px", padding: "10px 12px", borderRadius: 10, background: alpha(C.primary, 0.08), border: `1px solid ${alpha(C.primary, 0.25)}`, display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: C.onSurface }}>
          {neue.length > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 8 }} title={neue.map(d => d.name).join("\n")}>
              <b>{neue.length === 1 ? "1 Download" : `${neue.length} Downloads`}</b> passen zu diesem Song
              <span style={{ flex: 1 }} />
              <TextKnopf onClick={() => uebernehmen(s.path, neue.map(d => d.path))}>Zuweisen</TextKnopf>
            </span>
          )}
          {s.reparierbar > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 8 }} title="Neue Pfade in die FLP eintragen. FLP vorher schließen, Sicherung in Backup/">
              <b>{s.reparierbar === 1 ? "1 Pfad" : `${s.reparierbar} Pfade`}</b> in der FLP zeigen ins Leere
              <span style={{ flex: 1 }} />
              <TextKnopf onClick={() => api.artists.pfadeReparieren(s.path).then(onGeaendert).catch(fehlerVon)}>Reparieren</TextKnopf>
            </span>
          )}
          {s.fehlend.length > 0 && (
            <span style={{ color: C.error }} title={s.fehlend.map(p => p.split(/[\\/]/).pop()).join("\n")}>
              {s.fehlend.length === 1 ? "1 Datei fehlt" : `${s.fehlend.length} Dateien fehlen`}, BeatOS findet sie nicht
            </span>
          )}
        </div>
      )}

      <Versionen song={s} abspielen={abspielen} laeuftPfad={isPlaying ? currentBeat?.id?.replace(/^kuenstler:/, "") ?? null : null} stil={block} ueber={ueber} />

      <div style={block}>
        <span style={ueber}>Credits</span>
        <FeatureZeile song={s} artist={artist} alleKuenstler={alleKuenstler} onGeaendert={onGeaendert} onFehler={setFehler} />
        <MeinBeat song={s} onGeaendert={onGeaendert} />
      </div>

      <div style={block}>
        <span style={ueber}>Notiz</span>
        <textarea
          value={notiz}
          aria-label={`Notiz zu ${s.name}`}
          placeholder={`Was ${kuenstler} wollte, was noch fehlt …`}
          rows={3}
          onChange={e => setNotiz(e.target.value)}
          onBlur={() => speichern(notiz, s.warten)}
          style={{
            width: "100%", padding: "4px 0", fontSize: 13, lineHeight: 1.5, fontFamily: "inherit", resize: "vertical",
            background: "transparent", color: C.onSurface, outline: "none", border: "none",
            borderBottom: `1px solid ${C.border20}`, boxSizing: "border-box",
          }}
        />
      </div>
      {fehler && <div style={{ padding: "0 20px 10px", fontSize: 12, color: C.error }}>{fehler}</div>}

      {/* Abgeben unten fest */}
      <div style={{ position: "sticky", bottom: 0, marginTop: "auto", padding: "16px 24px", background: `linear-gradient(180deg, ${alpha(C.background, 0)}, ${C.background} 30%)` }}>
        {s.im_fertig ? (
          <Button variant="secondary" icon={Undo2} style={{ width: "100%" }} title="Zurück aus _Fertig"
            onClick={() => api.artists.wiederOeffnen(s.path).then(onGeaendert).catch(fehlerVon)}>Wieder öffnen</Button>
        ) : s.fertig ? (
          <div style={{ textAlign: "center", fontSize: 13, fontWeight: 600, color: C.mint }}>
            Abgegeben{s.abgegeben ? ` am ${s.abgegeben.split("-").reverse().join(".")}` : ""}
          </div>
        ) : (
          <Button variant="primary" icon={Send} className="kw-heben" disabled={s.exporte.length === 0}
            style={{ width: "100%", fontSize: 15, padding: "14px 20px", borderRadius: 12, boxShadow: s.exporte.length ? `0 8px 24px -6px ${alpha(C.primary, 0.45)}` : undefined }}
            title={s.exporte.length === 0 ? "Noch kein Export im Song-Ordner" : "Export benennen, Abgegeben abhaken"}
            onClick={() => setAbgabeOffen(true)}>Abgeben …</Button>
        )}
      </div>

      {abgabeOffen && (
        <AbgabeDialog song={s} kuenstler={kuenstler} onClose={fertig => { setAbgabeOffen(false); if (fertig) onGeaendert(); }} />
      )}
      {dialog === "verschieben" && (
        <VerschiebenDialog song={s} artist={artist} onClose={() => setDialog(null)} onFertig={p => { setDialog(null); onVerschoben(p); }} />
      )}
      {dialog === "mix" && (
        <Modal icon={FolderPlus} title="Neuer Mix" subtitle="Vorlage wählen" width={420} onClose={() => setDialog(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {vorlagen.map(v => (
              <button key={v.pfad} onClick={() => neuerMix(v.pfad)} className="kw-heben" style={{
                display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 12px", borderRadius: 8, textAlign: "left",
                border: `1px solid ${C.border10}`, background: C.surfaceContainerLow, color: C.onSurface, fontFamily: "inherit", fontSize: 13, cursor: "pointer",
              }}>
                <span style={{ fontWeight: 600 }}>{v.name}</span>
                <span style={{ color: C.onSurfaceVariant }}>{v.ordner}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {dialog === "zusammen" && (
        <ZusammenDialog song={s} artist={artist} onClose={() => setDialog(null)} onFertig={p => { setDialog(null); onVerschoben(p); }} />
      )}
    </section>
  );
}

function TextKnopf({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} style={{ border: "none", background: "transparent", color: C.primary, fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>{children}</button>;
}

/** Versionen: je Rolle die neueste, der Rest hinter „+ n ältere". */
function Versionen({ song: s, abspielen, laeuftPfad, stil, ueber }: {
  song: ArtistSong;
  abspielen: (pfad: string, label: string) => void;
  laeuftPfad: string | null;
  stil: React.CSSProperties;
  ueber: React.CSSProperties;
}) {
  const [alle, setAlle] = useState(false);
  if (s.audio.length === 0) return null;
  const label = (art: string) => HOEREN.find(h => h.art === art)?.label ?? art;
  // Stems stehen alle nebeneinander, jeder ein Griff.
  const stems = s.audio.filter(a => a.art === "stems").sort((a, b) => a.name.localeCompare(b.name));
  const audio = s.audio.filter(a => a.art !== "stems");
  const neueste = HOEREN.map(h => audio.find(a => a.art === h.art)).filter((a): a is ArtistSong["audio"][number] => !!a);
  const zeilen = alle ? audio : neueste;
  const rest = audio.length - neueste.length;
  return (
    <div style={stil}>
      <span style={ueber}>Versionen</span>
      {zeilen.map(a => (
        <div key={a.path} style={{ display: "grid", gridTemplateColumns: "84px minmax(0, 1fr) auto 28px", gap: 8, alignItems: "center", fontSize: 12 }}>
          <span><Griff pfad={a.path} text={label(a.art)} farbe={C.primary} hinweis={`${a.name} nach FL ziehen`} /></span>
          <span title={a.name} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.onSurface }}>{a.name}</span>
          <span style={{ fontSize: 11, color: C.onSecondaryFixedVar, whiteSpace: "nowrap" }}>{formatRelativeTime(a.geaendert)}</span>
          <IconButton icon={laeuftPfad === a.path ? Pause : Play} size={26} variant="secondary" title={`${a.name} abspielen`} onClick={() => abspielen(a.path, label(a.art))} />
        </div>
      ))}
      {stems.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {stems.map(a => (
            <Griff key={a.path} pfad={a.path} farbe={C.primary} hinweis={`${a.name} nach FL ziehen`}
              text={a.name.replace(/^stem - /i, "").replace(/\.[^.]+$/, "")} />
          ))}
        </div>
      )}
      {rest > 0 && (
        <button onClick={() => setAlle(x => !x)} style={{ alignSelf: "flex-start", border: "none", background: "transparent", color: C.onSurfaceVariant, fontFamily: "inherit", fontSize: 12, fontWeight: 600, padding: 0, cursor: "pointer" }}>
          {alle ? "Nur die neuesten" : `+ ${rest} ältere`}
        </button>
      )}
    </div>
  );
}

/** Meldung nach „Beat holen": was kopiert wurde. */
function geholtText(g: { wav: boolean; stems: number; schon_da: number }): string {
  const neu = [g.wav ? "WAV" : null, g.stems === 1 ? "1 Stem" : g.stems > 1 ? `${g.stems} Stems` : null].filter(Boolean);
  if (neu.length > 0) return `${neu.join(" + ")} kopiert`;
  return g.schon_da > 0 ? "Schon im Song" : "Keine WAV, keine Stems im Beat-Ordner";
}

/** „Mein Beat": ein Katalog-Beat oder ein Projekt aus der Produktion. */
type BeatWahl = { beatId: string | null; projekt: string | null; nummer: string; text: string };

/** Beat-Suche: Katalog und Projekte aus der Produktion. Feld und Trefferliste, Klick wählt. */
function BeatSuche({ onWahl, platzhalter }: { onWahl: (w: BeatWahl) => void; platzhalter: string }) {
  const { settings } = useSettings();
  const [suche, setSuche] = useState("");
  const [beats, setBeats] = useState<Beat[]>([]);
  const [projekte, setProjekte] = useState<StudioProject[]>([]);
  // Projekte einmal scannen, sobald gesucht wird.
  const aktiv = suche.trim() !== "";
  useEffect(() => {
    const roots = parseProductionPaths(settings.productionPath);
    if (!aktiv || roots.length === 0) return;
    let ab = false;
    api.studio.scanProjects(roots).then(p => { if (!ab) setProjekte(p); }).catch(() => {});
    return () => { ab = true; };
  }, [aktiv, settings.productionPath]);
  useEffect(() => {
    if (!suche.trim()) { setBeats([]); return; }
    let ab = false;
    const t = setTimeout(() => {
      api.beats.getAll({ search: suche.trim(), onlyFavs: false, limit: 6, offset: 0 })
        .then(b => { if (!ab) setBeats(b); }).catch(() => {});
    }, 150);
    return () => { ab = true; clearTimeout(t); };
  }, [suche]);
  const q = suche.trim().toLowerCase();
  const treffer: BeatWahl[] = !q ? [] : [
    ...beats.map(b => ({ beatId: b.id, projekt: null, nummer: b.id, text: beatInfo(b) })),
    ...projekte.filter(p => `${p.name} ${p.song_name ?? ""}`.toLowerCase().includes(q)).slice(0, 4)
      .map(p => ({ beatId: null, projekt: p.path, nummer: p.name.split(/[ _-]/)[0], text: beatInfo({ name: projectDisplayName(p), bpm: p.bpm, key: p.key }) })),
  ];
  return (
    <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: 6 }}>
      <input value={suche} onChange={e => setSuche(e.target.value)} placeholder={platzhalter} aria-label="Beat suchen"
        style={{
          padding: "5px 8px", fontSize: 12, fontFamily: "inherit", background: C.surfaceContainerLowest, color: C.onSurface,
          outline: "none", border: `1px solid ${C.border20}`, borderRadius: radius.control,
        }} />
      {treffer.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", border: `1px solid ${C.border10}`, borderRadius: radius.control }}>
          {treffer.map(w => (
            <button key={w.beatId ?? w.projekt} onClick={() => { setSuche(""); onWahl(w); }} style={{
              display: "flex", gap: 8, padding: "6px 10px", border: "none", background: "transparent", cursor: "pointer",
              fontFamily: "inherit", fontSize: 12, color: C.onSurface, textAlign: "left",
            }}
              onMouseEnter={e => { e.currentTarget.style.background = C.surfaceContainerHigh; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ color: C.onSecondaryFixedVar, width: 44 }}>{w.nummer}</span>
              {w.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const beatInfo = (b: { name: string; bpm: number | null; key: string | null }) =>
  [b.name, b.bpm ? `${Math.round(b.bpm)} BPM` : null, b.key].filter(Boolean).join(" · ");

/** „Mein Beat": welcher Katalog-Beat im Song steckt — mit BPM und Tonart,
 *  die WAV in 02_ASSETS kopieren oder für Stems die FLP des Beats öffnen.
 *  Verwendet die FLP schon Dateien eines Beats, wird er vorgeschlagen. */
function MeinBeat({ song: s, onGeaendert }: { song: ArtistSong; onGeaendert: () => void }) {
  const id = s.beat_id ?? null;
  const [daten, setDaten] = useState<UploadData | null>(null);
  const [vorschlag, setVorschlag] = useState<UploadData | null>(null);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setDaten(null);
    if (id) api.upload.getData(id).then(setDaten).catch(() => setDaten(null));
  }, [id]);
  useEffect(() => {
    setVorschlag(null);
    if (!id && s.beat_vorschlag) api.upload.getData(s.beat_vorschlag).then(setVorschlag).catch(() => {});
  }, [id, s.beat_vorschlag]);

  const setzen = (beatId: string | null, projekt: string | null = null) => {
    setMeldung(null);
    api.artists.setBeat(s.path, beatId, projekt).then(onGeaendert).catch(e => setMeldung({ ok: false, text: String(e) }));
  };
  const holen = (ordner: string, wav: string | null) => api.artists.beatHolen(s.path, ordner, wav)
    .then(g => { setMeldung({ ok: true, text: geholtText(g) }); onGeaendert(); })
    .catch(e => setMeldung({ ok: false, text: String(e) }));
  const info = beatInfo;

  const zeile: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12 };
  const beschriftung = (
    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.onSecondaryFixedVar, width: 80 }}>
      Mein Beat
    </span>
  );

  if (id) {
    return (
      <div style={zeile}>
        {beschriftung}
        <Music2 size={13} color={C.primary} />
        <span style={{ fontWeight: 600, color: C.onSurface }}>{daten ? info(daten.beat) : id}</span>
        <span style={{ flex: 1 }} />
        <Button variant="secondary" size="sm" icon={FolderInput} disabled={!daten}
          title="WAV und Stems nach 02_ASSETS kopieren"
          onClick={() => daten && holen(daten.beat.path, daten.assets.wav)}
        >
          Beat holen
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

  // Noch in der Produktion: der Projektordner. Beim Archivieren wird daraus der Katalog-Beat.
  if (s.projekt) {
    const ordner = s.projekt;
    return (
      <div style={zeile}>
        {beschriftung}
        <Music2 size={13} color={C.primary} />
        <span style={{ fontWeight: 600, color: C.onSurface }}>{ordner.split(/[\\/]/).pop()}</span>
        <span style={{ color: C.onSurfaceVariant }}>In Produktion</span>
        <span style={{ flex: 1 }} />
        <Button variant="secondary" size="sm" icon={FolderInput} title="Neuesten Export und Stems nach 02_ASSETS kopieren"
          onClick={() => holen(ordner, null)}>Beat holen</Button>
        <Button variant="secondary" size="sm" icon={FolderTree} title="Projektordner öffnen"
          onClick={() => openPath(ordner).catch(e => setMeldung({ ok: false, text: String(e) }))}>Ordner</Button>
        <IconButton icon={X} size={28} variant="ghost" title="Verknüpfung lösen" onClick={() => setzen(null)} />
        {meldung && <span style={{ width: "100%", paddingLeft: 88, color: meldung.ok ? C.mint : C.error }}>{meldung.text}</span>}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ ...zeile, alignItems: "flex-start" }}>
        {beschriftung}
        {vorschlag && (
          <Button variant="secondary" size="sm" icon={Music2}
            title="Die FLP verwendet Dateien aus diesem Beat-Ordner"
            onClick={() => setzen(vorschlag.beat.id)}
          >
            {info(vorschlag.beat)} verknüpfen
          </Button>
        )}
        <BeatSuche onWahl={w => setzen(w.beatId, w.projekt)}
          platzhalter={vorschlag ? "… oder einen anderen Beat suchen" : "Beat suchen: Katalog oder Produktion (Name oder Nummer)"} />
      </div>
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
      subtitle="Export nach 03_VERSIONS, Ordner bleibt"
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

/** Bühne + Releases mit der Akzentfarbe aus dem Profilbild. */
function ArtistKopfBereich({ kuenstler: k, features, bildZiel, filter, singles, onFilter, onProfil, onPlanen, onNeu, onUmbenennen }: {
  kuenstler: Artist; features: number; bildZiel: boolean; filter: string | null; singles: ArtistSong[];
  onFilter: (f: string | null) => void; onProfil: () => void; onPlanen: () => void; onNeu: () => void;
  onUmbenennen: (name: string) => Promise<unknown>;
}) {
  const akzent = useAkzent(k);
  return (
    <>
      <div aria-hidden className="kw-schein" style={cssVar({ "--akzent": akzent })} />
      <ArtistBuehne kuenstler={k} akzent={akzent} features={features} bildZiel={bildZiel} onProfil={onProfil} onPlanen={onPlanen} onUmbenennen={onUmbenennen} />
      <ReleaseRegal kuenstler={k} akzent={akzent} filter={filter} singles={singles} onFilter={onFilter} onNeu={onNeu} />
    </>
  );
}

/** Haken vorläufig einrechnen (bis der nächste Scan da ist). */
function mitHaken(s: ArtistSong, l: string[]): ArtistSong {
  const ab = l.includes("abgegeben");
  return {
    ...s, vocals: l.includes("vocals"), mix: l.includes("mix"), master: l.includes("master"),
    abgegeben: ab ? (s.abgegeben ?? new Date().toISOString().slice(0, 10)) : null,
    fertig: s.im_fertig || ab,
  };
}

/** Akzentfarbe des Artists für Kinder, die sie brauchen (Hook in eigener Komponente). */
function ArtistFarbe({ kuenstler, children }: { kuenstler: Artist; children: (akzent: string) => React.ReactNode }) {
  return <>{children(useAkzent(kuenstler))}</>;
}

/** Song-Detail als Panel von rechts. Klick daneben oder × schließt. */
function DetailPanel({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  // An body gehängt: innerhalb der Seite richtete sich „fixed“ nach einem
  // animierten Vorfahren statt nach dem Fenster, und oben fehlte ein Stück.
  // Unten endet es über dem Player, wie das Panel im Archiv.
  const { currentBeat } = useAudioPlayerContext();
  return createPortal(
    <div onClick={onClose} className="kw-schleier" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: currentBeat ? PLAYER_HEIGHT : 0, zIndex: 90, background: "rgba(0,0,0,0.4)" }}>
      <aside onClick={e => e.stopPropagation()} aria-label="Song" className="kw-panel" style={{
        position: "absolute", top: 0, right: 0, bottom: 0, overflowY: "auto", display: "flex", flexDirection: "column",
        background: C.background, borderLeft: `1px solid ${C.border20}`, boxShadow: "-20px 0 60px rgba(0,0,0,0.5)",
        boxSizing: "border-box", width: "min(540px, 100vw)",
      }}>
        <div style={{ position: "absolute", top: 12, right: 12, zIndex: 3 }}>
          <IconButton icon={X} size={30} variant="ghost" title="Schließen" onClick={onClose} />
        </div>
        {children}
      </aside>
    </div>,
    document.body,
  );
}
