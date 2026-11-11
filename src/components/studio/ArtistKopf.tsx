// src/components/studio/ArtistKopf.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Künstler-Tab, Redesign Stück 3 (docs/kuenstler-redesign.md): Leiste mit allen
// Artists (per Ziehen sortierbar), Artist-Kopf mit Profilbild als Bühne und
// Akzentfarbe aus dem Bild, darunter die Releases als Cover.
// ═══════════════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";
import { FolderOpen, ListPlus, Music2, Cloud, Youtube, Instagram, MessageCircle, Plus, UserPlus, GripVertical, Disc3, Disc, Album } from "lucide-react";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { AssetImage } from "../AssetPickerDialog";
import { C, alpha, radius } from "../../lib/theme";
import { api } from "../../lib/api";
import { songStand } from "../../lib/kuenstler";
import { IconButton, Modal } from "../ui";
import type { Artist, ArtistSong } from "../../types/artists";

/** Die Plattformen im Profil — Reihenfolge = Reihenfolge der Symbole. */
export const PLATTFORMEN: { key: string; label: string; icon: React.ElementType; platzhalter: string }[] = [
  { key: "spotify", label: "Spotify", icon: Music2, platzhalter: "https://open.spotify.com/artist/…" },
  { key: "soundcloud", label: "SoundCloud", icon: Cloud, platzhalter: "https://soundcloud.com/…" },
  { key: "youtube", label: "YouTube", icon: Youtube, platzhalter: "https://www.youtube.com/@…" },
  { key: "instagram", label: "Instagram", icon: Instagram, platzhalter: "https://www.instagram.com/…" },
  { key: "discord", label: "Discord", icon: MessageCircle, platzhalter: "Name auf Discord" },
];

/** CSS-Variablen inline setzen (z. B. --akzent für kuenstler-wucht.css). */
export const cssVar = (o: Record<string, string | number>) => o as React.CSSProperties;

/** Profilbild rund; ohne Bild die Initialen. Mit Ring leuchtet es in der Ringfarbe. */
export function Avatar({ kuenstler: k, groesse, ring, className }: { kuenstler: Artist; groesse: number; ring?: string; className?: string }) {
  const initialen = k.name.split(/[\s_-]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
  return (
    <span className={className} style={{
      width: groesse, height: groesse, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      background: alpha(C.primary, 0.14), color: C.primary, fontWeight: 700, fontSize: groesse * 0.36,
      boxShadow: ring
        ? `0 0 0 ${groesse > 60 ? 4 : 2}px ${ring}, 0 0 ${Math.round(groesse / 3)}px color-mix(in srgb, ${ring} 55%, transparent)`
        : `0 0 0 1px ${C.border20}`,
    }}>
      {k.bild ? <AssetImage key={k.bild} path={k.bild} fit="cover" /> : initialen}
    </span>
  );
}

// ─── Akzentfarbe aus dem Profilbild ──────────────────────────────────────────

const ERSATZ = [C.primary, C.tertiary, C.mint, "#f472b6", "#60a5fa", "#fbbf24"];
const farbCache = new Map<string, string>();
const ersatzFarbe = (name: string) => ERSATZ[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % ERSATZ.length];

/** Mittlere Farbe der kräftigen Pixel, aufgehellt. Ohne Bild eine feste Farbe pro Name. */
export function useAkzent(k: Artist): string {
  const ausBild = useBildFarbe(k);
  return k.farbe ?? ausBild;
}

function useBildFarbe(k: Artist): string {
  const [farbe, setFarbe] = useState(() => (k.bild && farbCache.get(k.bild)) || ersatzFarbe(k.name));
  useEffect(() => {
    if (!k.bild) { setFarbe(ersatzFarbe(k.name)); return; }
    const bild = k.bild;
    if (farbCache.has(bild)) { setFarbe(farbCache.get(bild)!); return; }
    let weg = false;
    api.create.readImageFile(bild).then(url => new Promise<string | null>(ok => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement("canvas");
          c.width = c.height = 32;
          const g = c.getContext("2d");
          if (!g) return ok(null);
          g.drawImage(img, 0, 0, 32, 32);
          const d = g.getImageData(0, 0, 32, 32).data;
          let r = 0, gr = 0, b = 0, n = 0;
          for (let i = 0; i < d.length; i += 4) {
            const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
            if (mx - mn > 40 && mx > 60) { r += d[i]; gr += d[i + 1]; b += d[i + 2]; n++; }
          }
          const f = (v: number) => Math.round(Math.min(255, v / n * 1.35 + 40));
          ok(n ? `rgb(${f(r)}, ${f(gr)}, ${f(b)})` : null);
        } catch { ok(null); }
      };
      img.onerror = () => ok(null);
      img.src = url;
    })).then(f => {
      const wert = f ?? ersatzFarbe(k.name);
      farbCache.set(bild, wert);
      if (!weg) setFarbe(wert);
    }).catch(() => {});
    return () => { weg = true; };
  }, [k.bild, k.name]);
  return farbe;
}

// ─── Leiste ──────────────────────────────────────────────────────────────────

/** Alle Artists untereinander. Klick wählt, am Griff ziehen sortiert. */
export function ArtistLeiste({ kuenstler, gewaehlt, onWaehlen, onReihenfolge, onNeu }: {
  kuenstler: Artist[];
  gewaehlt: string;
  onWaehlen: (pfad: string) => void;
  onReihenfolge: (namen: string[]) => void;
  onNeu: () => void;
}) {
  // Ziehen mit Zeiger-Ereignissen: HTML-Drag ist im Fenster für Dateien aus dem Explorer belegt.
  const [zieht, setZieht] = useState<number | null>(null);
  const [ueber, setUeber] = useState<number | null>(null);
  const ueberRef = useRef<number | null>(null);
  useEffect(() => {
    if (zieht === null) return;
    const bewegen = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-leiste-i]");
      const i = el ? Number(el.dataset.leisteI) : null;
      ueberRef.current = i;
      setUeber(i);
    };
    const los = () => {
      const ziel = ueberRef.current;
      if (ziel !== null && ziel !== zieht) {
        const namen = kuenstler.map(k => k.name);
        const [x] = namen.splice(zieht, 1);
        namen.splice(ziel, 0, x);
        onReihenfolge(namen);
      }
      setZieht(null); setUeber(null); ueberRef.current = null;
    };
    window.addEventListener("pointermove", bewegen);
    window.addEventListener("pointerup", los, { once: true });
    return () => { window.removeEventListener("pointermove", bewegen); window.removeEventListener("pointerup", los); };
  }, [zieht, kuenstler, onReihenfolge]);

  return (
    <nav aria-label="Artists" style={{
      background: C.surfaceContainerLow, borderRadius: radius.card, padding: 10, border: `1px solid ${C.border10}`,
      display: "flex", flexDirection: "column", gap: 4, position: "sticky", top: 0,
      userSelect: zieht !== null ? "none" : undefined,
    }}>
      {kuenstler.map((k, i) => (
        <LeistenZeile key={k.path} kuenstler={k} index={i} an={k.path === gewaehlt}
          zieht={zieht === i} ziel={zieht !== null && ueber === i && ueber !== zieht}
          onWaehlen={() => onWaehlen(k.path)} onGreifen={() => setZieht(i)} />
      ))}
      <button onClick={onNeu} style={{
        display: "flex", alignItems: "center", gap: 10, padding: "8px", marginTop: 4,
        border: `1px dashed ${C.border20}`, borderRadius: radius.control, background: "transparent",
        color: C.onSurfaceVariant, fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer",
      }}>
        <UserPlus size={14} /> Neuer Artist
      </button>
    </nav>
  );
}

function LeistenZeile({ kuenstler: k, index, an, zieht, ziel, onWaehlen, onGreifen }: {
  kuenstler: Artist; index: number; an: boolean; zieht: boolean; ziel: boolean;
  onWaehlen: () => void; onGreifen: () => void;
}) {
  const akzent = useAkzent(k);
  const offen = k.songs.filter(s => !s.fertig).length;
  return (
    <div data-leiste-i={index} data-an={an} className="kw-lk" onClick={onWaehlen} style={{
      ...cssVar({ "--akzent": akzent }),
      display: "flex", alignItems: "center", gap: 10, padding: 10, borderRadius: radius.control, cursor: "pointer",
      background: an ? `linear-gradient(90deg, color-mix(in srgb, ${akzent} 22%, ${C.surfaceContainerHighest}), ${C.surfaceContainerHighest})` : "transparent",
      opacity: zieht ? 0.5 : 1,
      boxShadow: ziel ? `inset 0 2px 0 ${akzent}` : "none",
    }}>
      <span onPointerDown={e => { e.preventDefault(); e.stopPropagation(); onGreifen(); }} onClick={e => e.stopPropagation()}
        title="Ziehen zum Sortieren" style={{ display: "inline-flex", color: C.onSecondaryFixedVar, cursor: "grab", touchAction: "none" }}>
        <GripVertical size={14} />
      </span>
      <Avatar kuenstler={k} groesse={40} ring={an ? akzent : undefined} className="kw-av" />
      <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: C.onSurface, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.name}</span>
      <span style={{ fontSize: 12, color: C.onSurfaceVariant, fontVariantNumeric: "tabular-nums" }}>{offen}</span>
    </div>
  );
}

// ─── Artist-Kopf ─────────────────────────────────────────────────────────────

/** Profilbild als Bühne: groß, unscharf dahinter, Name, Zahlen, Links. */
export function ArtistBuehne({ kuenstler: k, akzent, features, bildZiel, onProfil, onPlanen, onUmbenennen }: {
  /** Neuer Name per Doppelklick. */
  onUmbenennen: (name: string) => Promise<unknown>;
  kuenstler: Artist;
  akzent: string;
  /** Songs anderer Artists mit diesem als Feature. */
  features: number;
  /** Beim Ziehen eines Bildes aus dem Explorer über dem Profilbild. */
  bildZiel: boolean;
  onProfil: () => void;
  onPlanen: () => void;
}) {
  const offen = k.songs.filter(s => !s.fertig).length;
  const links = PLATTFORMEN.filter(p => k.links[p.key]);
  const zahl = (n: number, wort: string, gross = false) => (
    <span><b style={{ color: C.onSurface, fontWeight: gross ? 800 : 600, fontSize: gross ? 22 : undefined, marginRight: gross ? 2 : 0, fontVariantNumeric: "tabular-nums" }}>{n}</b> {wort}</span>
  );
  // Ist die Bühne aus dem Bild gescrollt, blendet oben eine schmale Leiste ein.
  const buehne = useRef<HTMLElement>(null);
  const [kompakt, setKompakt] = useState(false);
  useEffect(() => {
    const el = buehne.current;
    if (!el) return;
    const o = new IntersectionObserver(([e]) => setKompakt(!e.isIntersecting), { rootMargin: "-80px 0px 0px 0px" });
    o.observe(el);
    return () => o.disconnect();
  }, []);
  return (
    <>
    {/* Höhe 0 und sticky: liegt über dem Inhalt, ohne ihn zu verschieben */}
    <div style={{ position: "sticky", top: 0, height: 0, zIndex: 30, marginBottom: -16 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "8px 14px", borderRadius: 14,
        background: `color-mix(in srgb, ${akzent} 14%, ${C.surfaceContainerLow})`, border: `1px solid color-mix(in srgb, ${akzent} 30%, transparent)`,
        boxShadow: "0 10px 30px rgba(0,0,0,0.45)", backdropFilter: "blur(12px)",
        opacity: kompakt ? 1 : 0, transform: kompakt ? "none" : "translateY(-8px)", pointerEvents: kompakt ? "auto" : "none",
        transition: "opacity 0.15s, transform 0.15s",
      }}>
        <Avatar kuenstler={k} groesse={36} ring={akzent} />
        <span style={{ fontSize: 18, fontWeight: 800, color: C.onSurface, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{k.name}</span>
        <span style={{ display: "flex", gap: 12, fontSize: 12, color: C.onSurfaceVariant, flex: 1, minWidth: 0, whiteSpace: "nowrap" }}>
          {zahl(offen, "offen")}{zahl(k.songs.length - offen, "abgegeben")}
        </span>
        {links.map(p => (
          <IconButton key={p.key} icon={p.icon} size={28} variant="ghost"
            title={p.key === "discord" ? `Discord: ${k.links.discord} · kopieren` : `${p.label} öffnen`}
            onClick={() => p.key === "discord"
              ? navigator.clipboard?.writeText(k.links.discord).catch(() => {})
              : openUrl(k.links[p.key]).catch(() => {})} />
        ))}
      </div>
    </div>
    <section ref={buehne} style={{
      position: "relative", borderRadius: 22, overflow: "hidden", padding: "48px 36px 30px", background: C.surfaceContainerLow, isolation: "isolate",
      boxShadow: `0 30px 80px -30px color-mix(in srgb, ${akzent} 45%, transparent), inset 0 1px 0 rgba(255,255,255,0.08)`,
    }}>
      {k.bild && (
        <div aria-hidden className="kw-drift" style={{ position: "absolute", inset: -40, filter: "blur(36px) saturate(1.6)", opacity: 0.7, zIndex: -2, display: "flex" }}>
          <AssetImage path={k.bild} fit="cover" />
        </div>
      )}
      <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, background: `linear-gradient(180deg, ${alpha(C.background, 0)} 0%, ${alpha(C.background, 0.55)} 60%, ${alpha(C.background, 0.92)} 100%)` }} />
      <div style={{ display: "flex", alignItems: "flex-end", gap: 30, flexWrap: "wrap" }}>
        <button data-kuenstler={k.path} onClick={onProfil} title="Profil bearbeiten · Bild hierher ziehen" className="kw-bild"
          style={{ padding: 0, border: "none", background: "transparent", cursor: "pointer", borderRadius: "50%", boxShadow: "0 20px 50px rgba(0,0,0,0.6)" }}>
          <Avatar kuenstler={k} groesse={180} ring={bildZiel ? C.primary : akzent} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="kw-hoch-ein" style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.24em", textTransform: "uppercase", color: akzent }}>
            {bildZiel ? "Loslassen → neues Profilbild" : "Artist"}
          </div>
          <div className="kw-hoch-ein" style={{ ...cssVar({ "--i": 1 }), marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingBottom: 4 }}>
            <UmbenennenText text={k.name} titel="Artist" onSpeichern={onUmbenennen}
              style={{
                fontSize: "clamp(44px, 6vw, 96px)", fontWeight: 800, lineHeight: 0.92, letterSpacing: "-0.035em", color: C.onSurface,
                textShadow: `0 4px 40px color-mix(in srgb, ${akzent} 40%, transparent)`,
              }} />
          </div>
          <div className="kw-hoch-ein" style={{ ...cssVar({ "--i": 2 }), display: "flex", gap: 22, flexWrap: "wrap", alignItems: "baseline", marginTop: 14, fontSize: 14, color: C.onSurfaceVariant }}>
            {zahl(offen, "offen", true)}
            {zahl(k.songs.length - offen, "abgegeben", true)}
            {zahl(k.releases.length, k.releases.length === 1 ? "Release" : "Releases", true)}
            {features > 0 && zahl(features, features === 1 ? "Feature" : "Features", true)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, alignSelf: "flex-start" }}>
          {links.map(p => (
            <IconButton key={p.key} icon={p.icon} size={38} variant="ghost"
              title={p.key === "discord" ? `Discord: ${k.links.discord} · kopieren` : `${p.label} öffnen`}
              onClick={() => p.key === "discord"
                ? navigator.clipboard?.writeText(k.links.discord).catch(() => {})
                : openUrl(k.links[p.key]).catch(() => {})} />
          ))}
          <IconButton icon={ListPlus} size={38} variant="ghost" title="Tracks planen" onClick={onPlanen} />
          <IconButton icon={FolderOpen} size={38} variant="ghost" title="Artist-Ordner öffnen" onClick={() => openPath(k.path).catch(() => {})} />
        </div>
      </div>
      {/* Ein Strich pro Track: je weiter, desto kräftiger; abgegeben grün */}
      <div title="Ein Strich pro Track" className="kw-band" style={{ display: "flex", gap: 3, height: 10, marginTop: 26 }}>
        {k.songs.map((s, i) => {
          const st = songStand(s).schritt;
          return <i key={s.path} style={{
            ...cssVar({ "--i": Math.min(i, 40) }), flex: 1, borderRadius: 3,
            background: st === 4 ? C.mint : st === 0 ? alpha(C.onSurface, 0.12) : `color-mix(in srgb, ${akzent} ${25 + st * 25}%, transparent)`,
            boxShadow: st === 4 ? `0 0 10px ${alpha(C.mint, 0.6)}` : st === 3 ? `0 0 8px color-mix(in srgb, ${akzent} 50%, transparent)` : "none",
          }} />;
        })}
      </div>
    </section>
    </>
  );
}

// ─── Releases ────────────────────────────────────────────────────────────────

/** Releases als Cover, dazu „Singles" und „Neues Projekt". Klick filtert die Liste. */
export function ReleaseRegal({ kuenstler: k, akzent, filter, singles, onFilter, onNeu }: {
  kuenstler: Artist;
  akzent: string;
  /** Release-Pfad oder "singles"; null = alles. */
  filter: string | null;
  singles: ArtistSong[];
  onFilter: (f: string | null) => void;
  onNeu: () => void;
}) {
  let nr = 0;
  const karte = (schluessel: string, titel: string, unter: string, fertig: number, gesamt: number, bild: React.ReactNode) => {
    const an = filter === schluessel;
    return (
      <button key={schluessel} onClick={() => onFilter(an ? null : schluessel)} title={an ? "Filter aufheben" : `Nur ${titel} zeigen`} className="kw-cover kw-hoch-ein"
        style={{ ...cssVar({ "--i": nr++ }), flex: "0 0 210px", display: "flex", flexDirection: "column", gap: 8, padding: 0, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
        <span className="kw-cover-bild" style={{
          width: 210, height: 210, borderRadius: 14, overflow: "hidden", display: "flex",
          boxShadow: an ? `0 0 0 3px ${akzent}, 0 0 40px color-mix(in srgb, ${akzent} 50%, transparent)` : "0 10px 28px rgba(0,0,0,0.4)",
        }}>{bild}</span>
        <span style={{ fontSize: 16, fontWeight: 800, color: C.onSurface, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titel}</span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.onSurfaceVariant }}>{unter} · {fertig} von {gesamt}</span>
        <span style={{ height: 5, borderRadius: 3, background: C.surfaceContainerHighest, overflow: "hidden" }}>
          <i style={{ display: "block", height: "100%", width: `${gesamt ? fertig / gesamt * 100 : 0}%`, background: C.mint, boxShadow: `0 0 8px ${alpha(C.mint, 0.7)}` }} />
        </span>
      </button>
    );
  };
  const verlauf = (text: string) => (
    <span style={{ flex: 1, display: "flex", alignItems: "flex-end", padding: 14, fontSize: 19, fontWeight: 800, lineHeight: 1.1, color: "#fff", textShadow: "0 1px 8px rgba(0,0,0,0.6)", background: `linear-gradient(135deg, ${akzent}, ${C.surfaceContainer} 85%)` }}>{text}</span>
  );
  return (
    // Innenabstand: Platz fürs Anheben beim Hover, sonst schneidet overflow ab
    <div style={{ ...cssVar({ "--akzent": akzent }), display: "flex", gap: 20, overflowX: "auto", padding: "12px 6px 16px", margin: "-12px -6px 0" }}>
      {k.releases.map(r => {
        const songs = k.songs.filter(s => s.path.replace(/[\\/][^\\/]+$/, "") === r.path);
        return karte(r.path, r.titel, r.art, songs.filter(s => s.fertig).length, songs.length,
          r.cover ? <AssetImage path={r.cover} fit="cover" /> : verlauf(r.titel));
      })}
      {singles.length > 0 && karte("singles", "Singles", "Singles", singles.filter(s => s.fertig).length, singles.length,
        <span style={{ flex: 1, display: "grid", placeItems: "center", background: C.surfaceContainer, color: C.onSurfaceVariant }}><Disc size={56} strokeWidth={1.25} /></span>)}
      <button onClick={onNeu} title="Single, EP oder Album anlegen" className="kw-plus kw-hoch-ein" style={{
        ...cssVar({ "--i": nr }),
        flex: "0 0 210px", height: 210, borderRadius: 14, border: `1px dashed ${C.border20}`, background: "transparent", cursor: "pointer",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10,
        color: C.onSurfaceVariant, fontFamily: "inherit", fontSize: 14, fontWeight: 600,
      }}>
        <span className="kw-kreuz" style={{ width: 60, height: 60, borderRadius: "50%", display: "grid", placeItems: "center", background: akzent, color: "#120a00", boxShadow: `0 8px 24px color-mix(in srgb, ${akzent} 35%, transparent)` }}>
          <Plus size={32} />
        </span>
        Neues Projekt
      </button>
    </div>
  );
}

/** Akzentfarbe im Profil: „Aus dem Bild" (Standard), eine Vorgabe oder frei gewählt. */
const VORGABEN = ["#fda124", "#f472b6", "#fb7185", "#9492ff", "#60a5fa", "#22d3ee", "#34d399", "#a3e635", "#fbbf24", "#e5e5e5"];

export function FarbWahl({ kuenstler: k, onGeaendert, onFehler }: { kuenstler: Artist; onGeaendert: () => void; onFehler: (f: string) => void }) {
  const ausBild = useBildFarbe(k);
  const [farbe, setFarbe] = useState<string | null>(k.farbe);
  const setzen = (f: string | null) => {
    setFarbe(f);
    api.artists.setFarbe(k.path, f).then(onGeaendert).catch(e => onFehler(String(e)));
  };
  const punkt = (f: string, an: boolean, titel: string, onClick: () => void, kind?: React.ReactNode) => (
    <button key={titel} title={titel} aria-pressed={an} onClick={onClick} style={{
      width: 28, height: 28, borderRadius: "50%", padding: 0, cursor: "pointer", background: f,
      border: "none", boxShadow: an ? `0 0 0 2px ${C.background}, 0 0 0 4px ${f}` : `0 0 0 1px ${C.border20}`,
      display: "grid", placeItems: "center", color: "#120a00", fontSize: 10, fontWeight: 800,
    }}>{kind}</button>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.onSecondaryFixedVar }}>Farbe</span>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {punkt(ausBild, farbe === null, "Aus dem Profilbild", () => setzen(null), "A")}
        <span style={{ width: 1, height: 20, background: C.border20 }} />
        {VORGABEN.map(f => punkt(f, farbe === f, f, () => setzen(f)))}
        <label title="Eigene Farbe" style={{ position: "relative", width: 28, height: 28, borderRadius: "50%", cursor: "pointer", overflow: "hidden",
          background: "conic-gradient(#f43f5e, #fbbf24, #34d399, #60a5fa, #9492ff, #f43f5e)",
          boxShadow: farbe && !VORGABEN.includes(farbe) ? `0 0 0 2px ${C.background}, 0 0 0 4px ${farbe}` : `0 0 0 1px ${C.border20}` }}>
          <input type="color" value={farbe ?? ausBild.startsWith("#") ? (farbe ?? ausBild) : "#fda124"} aria-label="Eigene Farbe"
            onChange={e => setzen(e.target.value)}
            style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} />
        </label>
      </div>
      <span style={{ fontSize: 12, color: C.onSurfaceVariant }}>{farbe === null ? "Aus dem Profilbild" : "Eigene Farbe"}</span>
    </div>
  );
}

/** Text, der per Doppelklick zum Eingabefeld wird. Enter speichert, Esc bricht ab. */
export function UmbenennenText({ text, style, titel, onSpeichern }: {
  text: string;
  style?: React.CSSProperties;
  titel: string;
  onSpeichern: (name: string) => Promise<unknown>;
}) {
  const [wert, setWert] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  if (wert === null) {
    return <span title={`${titel} · Doppelklick zum Umbenennen`} onDoubleClick={e => { e.stopPropagation(); setWert(text); }} style={{ ...style, cursor: "text" }}>{text}</span>;
  }
  const speichern = async () => {
    const n = wert.trim();
    if (!n || n === text) { setWert(null); return; }
    setLaeuft(true);
    try { await onSpeichern(n); } finally { setLaeuft(false); setWert(null); }
  };
  return (
    <input autoFocus value={wert} disabled={laeuft} aria-label={titel}
      onClick={e => e.stopPropagation()}
      onChange={e => setWert(e.target.value)}
      onBlur={() => !laeuft && setWert(null)}
      onKeyDown={e => { if (e.key === "Enter") speichern(); if (e.key === "Escape") setWert(null); }}
      style={{
        ...style, minWidth: 0, width: "100%", boxSizing: "border-box", fontFamily: "inherit",
        background: C.surfaceContainerLowest, color: C.onSurface, outline: "none",
        border: `1px solid ${C.primary}`, borderRadius: radius.control, padding: "0 6px",
      }} />
  );
}

/** Strg+F: Artists, Releases und Songs durchsuchen. Pfeile + Enter wählen. */
export type SuchTreffer = { art: "artist" | "release" | "song"; titel: string; unter: string; artist: string; pfad: string };

export function SuchPopup({ kuenstler, onWahl, onClose }: {
  kuenstler: Artist[];
  onWahl: (t: SuchTreffer) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [an, setAn] = useState(0);
  const alle: SuchTreffer[] = kuenstler.flatMap(k => [
    { art: "artist" as const, titel: k.name, unter: `${k.songs.filter(s => !s.fertig).length} offen`, artist: k.path, pfad: k.path },
    ...k.releases.map(r => ({ art: "release" as const, titel: r.titel, unter: `${r.art} · ${k.name}`, artist: k.path, pfad: r.path })),
    ...k.songs.map(s => {
      const r = k.releases.find(r => r.path === s.path.replace(/[\\/][^\\/]+$/, ""));
      return { art: "song" as const, titel: s.name, unter: [k.name, r?.titel, s.features.length ? `ft. ${s.features.join(", ")}` : ""].filter(Boolean).join(" · "), artist: k.path, pfad: s.path };
    }),
  ]);
  const such = q.trim().toLowerCase();
  const treffer = alle.filter(t => !such || `${t.titel} ${t.unter}`.toLowerCase().includes(such)).slice(0, 40);
  const nr = Math.min(an, Math.max(treffer.length - 1, 0));
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.55)", display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: 90 }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Suche" style={{ width: 560, maxWidth: "calc(100% - 32px)", background: C.surfaceContainer, border: `1px solid ${C.border20}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
        <input autoFocus value={q} placeholder="Song, Artist oder Release …" aria-label="Suche"
          onChange={e => { setQ(e.target.value); setAn(0); }}
          onKeyDown={e => {
            if (e.key === "Escape") onClose();
            else if (e.key === "ArrowDown") { e.preventDefault(); setAn(Math.min(nr + 1, treffer.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setAn(Math.max(nr - 1, 0)); }
            else if (e.key === "Enter" && treffer[nr]) onWahl(treffer[nr]);
          }}
          style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1px solid ${C.border10}`, background: "transparent", color: C.onSurface, fontFamily: "inherit", fontSize: 16, padding: "14px 16px", outline: "none" }} />
        <div style={{ maxHeight: 360, overflowY: "auto" }}>
          {treffer.map((t, i) => (
            <div key={t.art + t.pfad} onClick={() => onWahl(t)} onMouseEnter={() => setAn(i)} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", cursor: "pointer",
              background: i === nr ? C.surfaceContainerHighest : "transparent",
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.onSecondaryFixedVar, width: 56, flexShrink: 0 }}>
                {t.art === "artist" ? "Artist" : t.art === "release" ? "Release" : "Song"}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.onSurface, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.titel}</span>
                <span style={{ display: "block", fontSize: 12, color: C.onSurfaceVariant, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.unter}</span>
              </span>
            </div>
          ))}
          {treffer.length === 0 && <div style={{ padding: "14px 16px", fontSize: 13, color: C.onSurfaceVariant }}>Nichts gefunden</div>}
        </div>
      </div>
    </div>
  );
}

/** „Neues Projekt": Single, EP oder Album wählen. Der passende Dialog folgt. */
export function NeuesProjektDialog({ kuenstler, onWahl, onClose }: {
  kuenstler: string;
  onWahl: (art: "SINGLE" | "EP" | "ALBUM") => void;
  onClose: () => void;
}) {
  const arten = [
    { art: "SINGLE" as const, titel: "Single", text: "Ein Song, FLP aus Vorlage", icon: Disc },
    { art: "EP" as const, titel: "EP", text: "Ordner für mehrere Songs", icon: Disc3 },
    { art: "ALBUM" as const, titel: "Album", text: "Ordner für viele Songs", icon: Album },
  ];
  return (
    <Modal icon={Plus} title="Neues Projekt" subtitle={`für ${kuenstler}`} width={520} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {arten.map(a => (
          <button key={a.art} onClick={() => onWahl(a.art)} style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "18px 10px",
            border: `1px solid ${C.border20}`, borderRadius: 12, background: C.surfaceContainerLow, cursor: "pointer", fontFamily: "inherit",
          }}>
            <a.icon size={34} strokeWidth={1.4} color={C.primary} />
            <span style={{ fontSize: 15, fontWeight: 700, color: C.onSurface }}>{a.titel}</span>
            <span style={{ fontSize: 11, color: C.onSurfaceVariant, textAlign: "center" }}>{a.text}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
