// src/components/upload/Zeitleiste.tsx
// Über den Kapiteln: die Wellenform des Exports, die Abschnitte farbig darauf,
// der Abspielkopf läuft mit. Klick springt an die Stelle (wenn der Beat läuft).

import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { api } from "../../lib/api";
import { C, STUDIO_VERLAUF } from "../../lib/theme";
import type { Timecode } from "../../types/upload";

const BALKEN = 120;

/** Farbe eines Abschnitts nach seinem Namen. Unbekanntes: Violett wie die Karte. */
export function kapitelFarbe(label: string): string {
  const l = label.toLowerCase();
  if (/intro|outro/.test(l)) return STUDIO_VERLAUF.idea.glow;
  if (/hook/.test(l)) return STUDIO_VERLAUF.priority.glow;
  if (/bridge/.test(l)) return STUDIO_VERLAUF.ready.glow;
  return STUDIO_VERLAUF.exported.glow;
}

interface Welle { spitzen: number[]; dauer: number }

/** Pro Datei und Stand einmal rechnen — die Karte rendert oft neu. */
const cache = new Map<string, Welle>();

/** Lautheit (0..1) in BALKEN Stücken.
 *
 *  Spitzenwerte taugten nicht: ein gemasterter Beat hat fast überall volle
 *  Spitzen, die Welle war ein Block. Jetzt RMS in dB je Stück, gespreizt
 *  zwischen dem leisesten und dem lautesten Stück dieses Beats. So heben
 *  sich Intro, Breaks und Drops ab. Mindestens 12 dB Spanne, damit ein
 *  gleichmäßig lauter Beat nicht jedes Zucken übertreibt. */
export function spitzenAus(kanal: Float32Array, anzahl = BALKEN): number[] {
  const stueck = Math.max(1, Math.floor(kanal.length / anzahl));
  const db = Array.from({ length: anzahl }, (_, i) => {
    let summe = 0, n = 0;
    for (let j = i * stueck; j < Math.min(kanal.length, (i + 1) * stueck); j++) { summe += kanal[j] * kanal[j]; n++; }
    return 20 * Math.log10(Math.max(Math.sqrt(n ? summe / n : 0), 1e-5));
  });
  // Grenzen aus dem Großteil des Beats, nicht aus den Extremen: ein Fade-out
  // bis -80 dB spannte die Skala sonst so weit, dass Intro (-24), Verse (-9)
  // und Hook (-6) alle oben klebten (gemessen an B0398).
  const sortiert = db.filter(d => d > -90).sort((a, b) => a - b);
  if (sortiert.length === 0) return db.map(() => 0);
  const hoch = sortiert[Math.round((sortiert.length - 1) * 0.98)];
  const tief = sortiert[Math.round((sortiert.length - 1) * 0.1)];
  const spanne = Math.max(hoch - tief, 12);
  // Kurve 1,5: zieht die Mitte runter, damit Verse und Hook sich trennen.
  // Hörbares nie ganz flach (0,1), nur echte Stille ist 0.
  return db.map(d => d <= -90 ? 0 : 0.1 + 0.9 * Math.max(0, Math.min(1, (d - (hoch - spanne)) / spanne)) ** 1.5);
}

/** Wellenform einer Audiodatei, einmal gerechnet und gemerkt. Auch der Player nutzt sie. */
export async function ladeWelle(pfad: string, stand: number | string): Promise<Welle> {
  const key = `${pfad}|${stand}`;
  const fertig = cache.get(key);
  if (fertig) return fertig;
  const antwort = await fetch(`${convertFileSrc(pfad.replace(/\\/g, "/"))}?v=${stand}`);
  const ctx = new AudioContext();
  const audio = await ctx.decodeAudioData(await antwort.arrayBuffer());
  void ctx.close();
  const w = { spitzen: spitzenAus(audio.getChannelData(0)), dauer: audio.duration };
  cache.set(key, w);
  return w;
}

function useWelle(beatPath: string | null, stand: number): Welle | null {
  const [welle, setWelle] = useState<Welle | null>(null);
  useEffect(() => {
    setWelle(null);
    if (!beatPath) return;
    let ab = false;
    (async () => {
      try {
        const pfad = await api.audio.getAudioPath(beatPath);
        if (!pfad || ab) return;
        const w = await ladeWelle(pfad, stand);
        if (!ab) setWelle(w);
      } catch { /* ohne Wellenform geht es auch: die Leiste bleibt leer */ }
    })();
    return () => { ab = true; };
  }, [beatPath, stand]);
  return welle;
}

export function Zeitleiste({ beatPath, stand, marken, jetzt, onSeek }: {
  beatPath: string | null;
  /** Wechselt nach einem neuen Export: dann neu rechnen. */
  stand: number;
  marken: Timecode[];
  /** Abspielposition in Sekunden, null wenn der Beat nicht läuft. */
  jetzt: number | null;
  onSeek: ((sekunden: number) => void) | null;
}) {
  const welle = useWelle(beatPath, stand);
  if (!welle) return null;
  const { spitzen, dauer } = welle;
  const sortiert = [...marken].sort((a, b) => a.seconds - b.seconds);

  return (
    <div
      onClick={e => {
        if (!onSeek) return;
        const r = e.currentTarget.getBoundingClientRect();
        onSeek(((e.clientX - r.left) / r.width) * dauer);
      }}
      title={onSeek ? "An diese Stelle springen" : "Zum Springen erst abspielen"}
      style={{
        position: "relative", height: 56, borderRadius: 14, overflow: "hidden", flexShrink: 0,
        background: C.surfaceContainerLowest, border: `1px solid ${C.border20}`,
        cursor: onSeek ? "pointer" : "default",
      }}
    >
      {sortiert.map((m, i) => {
        const bis = i < sortiert.length - 1 ? sortiert[i + 1].seconds : dauer;
        const k = kapitelFarbe(m.label);
        return (
          <div key={`${m.seconds}-${i}`} className="ul-abschnitt" title={m.label} style={{
            "--k": k,
            position: "absolute", top: 0, bottom: 0,
            left: `${(m.seconds / dauer) * 100}%`, width: `${(Math.max(0, bis - m.seconds) / dauer) * 100}%`,
            borderLeft: `2px solid ${k}`, background: `color-mix(in srgb, ${k} 12%, transparent)`,
          } as React.CSSProperties}>
            <span style={{
              position: "absolute", top: 4, left: 6, fontSize: 10, fontWeight: 800, letterSpacing: "0.06em",
              textTransform: "uppercase", color: k, whiteSpace: "nowrap", pointerEvents: "none",
            }}>
              {m.label.split(" ")[0]}
            </span>
          </div>
        );
      })}
      <div aria-hidden style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", gap: 2, padding: "0 4px", pointerEvents: "none" }}>
        {spitzen.map((v, i) => (
          <i key={i} style={{ flex: 1, height: `${12 + v * 70}%`, borderRadius: 2, background: "rgba(255,255,255,0.16)" }} />
        ))}
      </div>
      {jetzt !== null && (
        <span aria-hidden style={{
          position: "absolute", top: 0, bottom: 0, width: 2, left: `${Math.min(100, (jetzt / dauer) * 100)}%`,
          background: "#fff", boxShadow: "0 0 10px color-mix(in srgb, #fff 64%, transparent)", pointerEvents: "none",
        }} />
      )}
    </div>
  );
}
