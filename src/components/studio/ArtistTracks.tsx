// src/components/studio/ArtistTracks.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Künstler-Tab, Redesign Stück 4 (docs/kuenstler-redesign.md): „In Session"
// (bis zu drei Tracks, an denen Stephan gerade sitzt) und die Trackliste nach
// Release mit vier Leuchtpunkten Vocals · Mix · Master · Abgegeben.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { ArrowUp, X, Play, Pause, ChevronRight } from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { convertFileSrc } from "@tauri-apps/api/core";
import { AssetImage } from "../AssetPickerDialog";
import { C, alpha } from "../../lib/theme";
import { phase, songStand } from "../../lib/kuenstler";
import { useAudioPlayerContext } from "../../contexts/AudioPlayerContext";
import { Avatar, UmbenennenText, cssVar } from "./ArtistKopf";
import type { Artist, ArtistSong, Release } from "../../types/artists";

const ordnerVon = (pfad: string) => pfad.replace(/[\\/][^\\/]+$/, "");
const LED_TITEL = ["Vocals", "Mix", "Master", "Abgegeben"];

/** Vier Leuchtpunkte. Klick auf Punkt i setzt Stufe i, nochmal klicken nimmt ihn zurück. */
export function Leds({ song: s, akzent, gross = false, onStufe }: {
  song: ArtistSong; akzent: string; gross?: boolean; onStufe: (stufe: number) => void;
}) {
  const stufe = songStand(s).schritt;
  const d = gross ? 22 : 16;
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }} onClick={e => e.stopPropagation()}>
      {[1, 2, 3, 4].map(i => {
        const an = stufe >= i;
        const farbe = i === 4 ? C.mint : akzent;
        const gesperrt = s.geplant || (s.im_fertig && i === 4);
        return (
          <button key={i} disabled={gesperrt} aria-pressed={an} className="kw-led"
            title={s.geplant ? "Erst Session anlegen" : s.im_fertig && i === 4 ? "Liegt in _Fertig" : LED_TITEL[i - 1]}
            onClick={() => onStufe(stufe === i ? i - 1 : i)}
            style={{
              width: d, height: d, borderRadius: "50%", padding: 0, cursor: gesperrt ? "default" : "pointer",
              border: an ? "none" : `1px solid ${C.border20}`,
              background: an ? farbe : C.surfaceContainerHighest,
              boxShadow: an ? `0 0 14px color-mix(in srgb, ${farbe} 80%, transparent)` : "none",
              opacity: s.geplant ? 0.4 : 1,
            }} />
        );
      })}
    </span>
  );
}

/** Klein: der Stand in Worten, „Feedback offen" mit Mini-Bild. */
function PhaseText({ song: s, kuenstler, akzent }: { song: ArtistSong; kuenstler: Artist; akzent: string }) {
  const p = phase(s);
  if (p === "Feedback offen") {
    return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: C.tertiary, fontWeight: 600 }}><Avatar kuenstler={kuenstler} groesse={16} />Feedback offen</span>;
  }
  if (p === "abgegeben" && s.abgegeben) {
    const [j, m, t] = s.abgegeben.split("-");
    return <span style={{ color: C.mint }}>abgegeben {t}.{m}.{j.slice(2)}</span>;
  }
  if (p === "geplant") return <span style={{ color: akzent, fontWeight: 600 }}>geplant</span>;
  return <span>{p}</span>;
}

// ─── In Session ──────────────────────────────────────────────────────────────

export function SessionStreifen({ kuenstler: k, songs, akzent, release, onStufe, onRaus, onWaehlen, auswahl }: {
  kuenstler: Artist;
  songs: ArtistSong[];
  akzent: string;
  release: (s: ArtistSong) => Release | undefined;
  onStufe: (s: ArtistSong, stufe: number) => void;
  onRaus: (s: ArtistSong) => void;
  onWaehlen: (pfad: string) => void;
  auswahl: string | null;
}) {
  const { playBeat, currentBeat, isPlaying, togglePlay } = useAudioPlayerContext();
  const abspielen = (s: ArtistSong) => {
    const datei = s.audio[0];
    if (!datei) return;
    const id = `kuenstler:${datei.path}`;
    if (currentBeat?.id === id) { togglePlay(); return; }
    playBeat({
      id, name: `${s.name} · ${k.name}`, path: s.path, bpm: null, key: null,
      status: null, tags: null, favorite: null, created_date: null, modified_date: null,
      notes: null, sold_to: null, has_artwork: null, has_video: null,
    }, k.bild ? convertFileSrc(k.bild.replace(/\\/g, "/")) : null, undefined, datei.path);
  };

  return (
    <section className="kw-hoch-ein" style={{
      ...cssVar({ "--akzent": akzent, "--i": 3 }),
      borderRadius: 22, padding: 22,
      background: `linear-gradient(135deg, color-mix(in srgb, ${akzent} 26%, ${C.surfaceContainerLow}), ${C.surfaceContainerLow} 75%)`,
      border: `1px solid color-mix(in srgb, ${akzent} 45%, transparent)`,
      boxShadow: `0 20px 60px -25px color-mix(in srgb, ${akzent} 55%, transparent)`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <span className="kw-rec" aria-hidden />
        <span style={{ fontSize: 24, fontWeight: 800, color: C.onSurface }}>In Session</span>
        <span style={{ fontSize: 13, color: C.onSurfaceVariant }}>{songs.length} von 3</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 }}>
        {songs.map(s => {
          const r = release(s);
          const datei = s.audio[0];
          const laeuft = !!datei && currentBeat?.id === `kuenstler:${datei.path}` && isPlaying;
          return (
            <div key={s.path} onClick={() => onWaehlen(s.path)} className="kw-pk" style={{
              position: "relative", display: "flex", gap: 16, padding: 14, borderRadius: 16, cursor: "pointer", minWidth: 0,
              background: alpha(C.surfaceContainerLowest, 0.6),
              border: `1px solid ${s.path === auswahl ? akzent : C.border20}`,
            }}>
              <span className="kw-pc" style={{ width: 112, height: 112, borderRadius: 12, overflow: "hidden", flexShrink: 0, display: "flex", background: C.surfaceContainer, boxShadow: "0 8px 24px rgba(0,0,0,0.45)" }}>
                {r?.cover ? <AssetImage path={r.cover} fit="cover" /> : k.bild ? <AssetImage path={k.bild} fit="cover" /> : null}
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: 21, fontWeight: 800, color: C.onSurface, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 18 }}>{s.name}</span>
                <span style={{ fontSize: 12, color: C.onSurfaceVariant, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r ? r.titel : "Single"}{s.features.length > 0 && <span style={{ color: C.tertiary }}> · ft. {s.features.join(", ")}</span>} · <PhaseText song={s} kuenstler={k} akzent={akzent} />
                </span>
                <Leds song={s} akzent={akzent} gross onStufe={st => onStufe(s, st)} />
                <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }} onClick={e => e.stopPropagation()}>
                  <KleinKnopf disabled={!datei} title={datei ? datei.name : "Noch kein Audio"} onClick={() => abspielen(s)}>
                    {laeuft ? <Pause size={11} /> : <Play size={11} />} Reinhören
                  </KleinKnopf>
                  <KleinKnopf disabled={!s.flps[0]} title={s.flps[0]?.name ?? "Keine FLP"} onClick={() => s.flps[0] && openPath(s.flps[0].path).catch(() => {})}>
                    In FL öffnen
                  </KleinKnopf>
                </span>
              </div>
              <button title="Aus der Session nehmen" aria-label={`${s.name} aus der Session nehmen`}
                onClick={e => { e.stopPropagation(); onRaus(s); }}
                style={{ position: "absolute", top: 6, right: 6, border: "none", background: "transparent", color: C.onSurfaceVariant, cursor: "pointer", padding: 2, borderRadius: 6, display: "inline-flex" }}>
                <X size={14} />
              </button>
            </div>
          );
        })}
        {songs.length < 3 && (
          <div style={{ border: `1px dashed ${C.border20}`, borderRadius: 16, display: "grid", placeItems: "center", minHeight: 140, color: C.onSecondaryFixedVar, fontSize: 13, textAlign: "center", padding: 8 }}>
            Mit <ArrowUp size={12} style={{ verticalAlign: "-2px" }} /> in der Liste holen
          </div>
        )}
      </div>
    </section>
  );
}

function KleinKnopf({ children, disabled, title, onClick }: { children: React.ReactNode; disabled?: boolean; title?: string; onClick: () => void }) {
  return (
    <button disabled={disabled} title={title} onClick={onClick} className="kw-kn" style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 9,
      border: `1px solid ${C.border20}`, background: C.surfaceContainerHighest, color: C.onSurface,
      fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.45 : 1,
    }}>{children}</button>
  );
}

// ─── Trackliste ──────────────────────────────────────────────────────────────

export function Trackliste({ kuenstler: k, akzent, filter, auswahl, session, features, zuTun, ziehenPfad, onWaehlen, onStufe, onSession, onReleaseUmbenennen }: {
  /** Release-Titel per Doppelklick ändern. */
  onReleaseUmbenennen: (pfad: string, titel: string) => Promise<unknown>;
  kuenstler: Artist;
  akzent: string;
  /** Release-Pfad oder "singles"; null = alles. */
  filter: string | null;
  auswahl: string | null;
  session: string[];
  /** Songs anderer Artists mit diesem als Feature. */
  features: { song: ArtistSong; von: string }[];
  zuTun: (s: ArtistSong) => boolean;
  /** Beim Ziehen aus dem Explorer: Song unter dem Zeiger und Zahl der Dateien. */
  ziehenPfad: { pfad: string | null; anzahl: number } | null;
  onWaehlen: (pfad: string) => void;
  onStufe: (s: ArtistSong, stufe: number) => void;
  onSession: (s: ArtistSong) => void;
}) {
  const [aufgeklappt, setAufgeklappt] = useState<Set<string>>(() => new Set());
  const releaseOrdner = new Set(k.releases.map(r => r.path));
  const gruppen: { schluessel: string; art: string; titel: string; cover: string | null; songs: ArtistSong[]; nummern: boolean }[] = [
    ...k.releases.map(r => ({
      schluessel: r.path, art: r.art, titel: r.titel, cover: r.cover, nummern: true,
      songs: r.tracks.map(t => k.songs.find(s => ordnerVon(s.path) === r.path && s.name === t)).filter((s): s is ArtistSong => !!s),
    })),
    { schluessel: "singles", art: "SINGLES", titel: "Singles", cover: null, nummern: false, songs: k.songs.filter(s => !releaseOrdner.has(ordnerVon(s.path))) },
  ].filter(g => g.songs.length > 0 && (filter === null || filter === g.schluessel));

  // Zählt die Zeilen für den gestaffelten Einlauf (ab 14 alle gleich).
  let lauf = 0;
  const zeile = (s: ArtistSong, nr: string, von?: string) => {
    const drin = session.includes(s.path);
    const ziel = ziehenPfad?.pfad === s.path;
    return (
      <div key={(von ?? "") + s.path} data-song={s.geplant || von ? undefined : s.path} onClick={() => onWaehlen(s.path)} className="kw-zl kw-hoch-ein" style={{
        ...cssVar({ "--i": Math.min(lauf++, 14) + 4 }),
        display: "grid", gridTemplateColumns: "36px minmax(0, 1fr) auto auto 36px", alignItems: "center", gap: 16,
        padding: 14, borderRadius: 12, cursor: "pointer",
        background: ziel ? alpha(C.primary, 0.1) : s.path === auswahl ? C.surfaceContainerHighest : drin ? `color-mix(in srgb, ${akzent} 8%, transparent)` : "transparent",
        boxShadow: ziel ? `inset 0 0 0 1px ${alpha(C.primary, 0.6)}` : "none",
      }}>
        <span className="kw-nr" style={{ fontSize: 14, color: C.onSecondaryFixedVar, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{nr}</span>
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 15 }}>
          {von && <span style={{ color: C.onSurfaceVariant }}>{von} · </span>}
          <span style={{ fontSize: 16, fontWeight: 600, color: s.geplant ? C.onSurfaceVariant : C.onSurface, fontStyle: s.geplant ? "italic" : "normal" }}>{s.name}</span>
          {!von && s.features.length > 0 && <span style={{ color: C.tertiary }}> ft. {s.features.join(", ")}</span>}
          {zuTun(s) && <span title="Downloads oder FLP-Pfade offen" style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: C.primary, marginLeft: 6, verticalAlign: "middle" }} />}
        </span>
        <span style={{ fontSize: 12, color: C.onSurfaceVariant, textAlign: "right", whiteSpace: "nowrap" }}>
          {ziel ? <span style={{ color: C.primary, fontWeight: 600 }}>{ziehenPfad!.anzahl === 1 ? "1 Datei" : `${ziehenPfad!.anzahl} Dateien`} → hier</span> : <PhaseText song={s} kuenstler={k} akzent={akzent} />}
        </span>
        <Leds song={s} akzent={akzent} onStufe={st => onStufe(s, st)} />
        <button title={drin ? "In Session" : session.length >= 3 ? "Session ist voll" : "In Session holen"}
          disabled={drin || session.length >= 3 || s.fertig}
          onClick={e => { e.stopPropagation(); onSession(s); }} className="kw-hoch"
          style={{
            width: 34, height: 32, borderRadius: 9, border: `1px solid ${C.border20}`, background: "transparent",
            color: drin ? akzent : C.onSurfaceVariant, cursor: drin || session.length >= 3 || s.fertig ? "default" : "pointer",
            opacity: s.fertig ? 0.25 : drin ? 1 : session.length >= 3 ? 0.35 : 1, display: "grid", placeItems: "center",
          }}>
          <ArrowUp size={16} />
        </button>
      </div>
    );
  };

  const gruppeStil: React.CSSProperties = { background: C.surfaceContainerLow, borderRadius: 20, padding: "10px 10px 12px", border: `1px solid ${C.border10}` };
  return (
    <div style={{ ...cssVar({ "--akzent": akzent, "--kw-karte": C.surfaceContainer }), display: "flex", flexDirection: "column", gap: 22 }}>
      {gruppen.map(g => {
        const offen = g.songs.filter(s => !s.fertig);
        const fertig = g.songs.filter(s => s.fertig);
        const auf = aufgeklappt.has(g.schluessel) || fertig.some(s => s.path === auswahl);
        const nr = (s: ArtistSong) => g.nummern ? String(g.songs.indexOf(s) + 1) : "";
        return (
          <section key={g.schluessel} style={gruppeStil}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 12px 14px" }}>
              {g.cover && <span style={{ width: 52, height: 52, borderRadius: 9, overflow: "hidden", display: "flex", flexShrink: 0, boxShadow: "0 8px 20px rgba(0,0,0,0.5)" }}><AssetImage path={g.cover} fit="cover" /></span>}
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: akzent }}>{g.art}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {g.schluessel === "singles"
                  ? <span style={{ fontSize: 24, fontWeight: 800, color: C.onSurface }}>Singles</span>
                  : <UmbenennenText text={g.titel} titel={g.art} onSpeichern={n => onReleaseUmbenennen(g.schluessel, n)}
                      style={{ fontSize: 24, fontWeight: 800, color: C.onSurface }} />}
              </span>
              <span style={{ fontSize: 13, color: C.onSurfaceVariant, fontVariantNumeric: "tabular-nums" }}>{fertig.length} von {g.songs.length} abgegeben</span>
            </div>
            {offen.map(s => zeile(s, nr(s)))}
            {fertig.length > 0 && (
              <button onClick={() => setAufgeklappt(a => { const n = new Set(a); n.has(g.schluessel) ? n.delete(g.schluessel) : n.add(g.schluessel); return n; })}
                style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", border: "none", background: "transparent", color: C.onSurfaceVariant, fontFamily: "inherit", fontSize: 13, fontWeight: 600, padding: "10px 14px", textAlign: "left", cursor: "pointer", borderRadius: 8 }}>
                <ChevronRight size={14} style={{ transition: "transform 0.15s", transform: auf ? "rotate(90deg)" : "none" }} />
                {fertig.length} abgegeben
              </button>
            )}
            {auf && fertig.map(s => zeile(s, nr(s)))}
          </section>
        );
      })}
      {gruppen.length === 0 && (
        <div style={{ padding: 14, fontSize: 12, color: C.onSecondaryFixedVar, background: C.surfaceContainerLow, borderRadius: 14 }}>Noch keine Songs. Mit „Neues Projekt“ anlegen.</div>
      )}
      {filter === null && features.length > 0 && (
        <section style={gruppeStil}>
          <div style={{ padding: "12px 12px 14px", fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: C.tertiary }}>Features</div>
          {features.map(f => zeile(f.song, "", f.von))}
        </section>
      )}
    </div>
  );
}
