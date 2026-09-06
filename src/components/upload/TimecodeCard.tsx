// src/components/upload/TimecodeCard.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Kapitelmarken für die YouTube-Beschreibung.
//
// YouTube nimmt Kapitel nur an, wenn die erste Marke bei 0:00 liegt, mindestens
// drei Marken da sind und jede mindestens zehn Sekunden lang ist. Deshalb ist
// die erste Zeile fest auf 0:00 — die Regel steckt in der Bedienung, nicht in
// einer Fehlermeldung. Der Rest sind Hinweise, keine Blocker: eine unfertige
// Liste zu speichern muss erlaubt sein.
//
// Die Zeit kommt beim Hören: abspielen, an der Stelle „Marke setzen" drücken.
// Gelesen wird sie über `getCurrentSeconds()` vom stabilen Player-Kontext —
// NICHT über den Fortschritts-Kontext, der zehnmal pro Sekunde tickt und die
// halbe Upload-Seite mitrendern würde.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";
import { ListOrdered, Play, Pause, Plus, X, CornerDownLeft, Lock } from "lucide-react";
import { api } from "../../lib/api";
import { C, radius } from "../../lib/theme";
import { SectionCard } from "../ui/SectionCard";
import { useAudioPlayerContext } from "../../contexts/AudioPlayerContext";
import type { UploadBeatInfo, Timecode } from "../../types/upload";
import type { Beat } from "../../types/browse";

/** Stephans Abschnitte. „Verse" nummeriert sich beim zweiten Mal von selbst,
 *  Hook und Pre-Hook bleiben wie sie sind. */
const VORSCHLAEGE = ["Intro", "Verse", "Pre-Hook", "Hook", "Bridge", "Outro"] as const;
const NUMMERIERT = new Set(["Verse"]);

/** Mindestlänge eines Kapitels bei YouTube. */
const MIN_ABSTAND = 10;

export function mmss(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

/** "1:02" oder "1:03:20" → Sekunden. `null`, wenn es keine Zeit ist. */
export function parseMmss(text: string): number | null {
  const teile = text.trim().split(":");
  if (teile.length < 2 || teile.length > 3) return null;
  const zahlen = teile.map(t => Number(t.trim()));
  if (zahlen.some(n => !Number.isFinite(n) || n < 0)) return null;
  return teile.length === 3
    ? zahlen[0] * 3600 + zahlen[1] * 60 + zahlen[2]
    : zahlen[0] * 60 + zahlen[1];
}

/** Den gespeicherten Block zurück in Zeilen lesen. Speicherformat und
 *  Anzeigeformat sind dasselbe, deshalb reicht Zeile-für-Zeile. */
export function parseBlock(block: string | null): Timecode[] {
  if (!block?.trim()) return [];
  return block.split("\n").flatMap(zeile => {
    const m = zeile.trim().match(/^(\d+(?::\d+){1,2})\s+(.*)$/);
    if (!m) return [];
    const seconds = parseMmss(m[1]);
    return seconds === null ? [] : [{ seconds, label: m[2].trim() }];
  });
}

/** Der nächste sinnvolle Vorschlag: „Verse" wird zu „Verse 2", wenn schon
 *  einer steht. Hook und Pre-Hook bleiben unnummeriert. */
export function naechsterName(basis: string, vorhanden: string[]): string {
  if (!NUMMERIERT.has(basis)) return basis;
  const treffer = vorhanden.filter(l => new RegExp(`^${basis}(\\s+\\d+)?$`, "i").test(l.trim()));
  return treffer.length === 0 ? `${basis} 1` : `${basis} ${treffer.length + 1}`;
}

export function TimecodeCard({ beat, onSaved }: {
  beat: UploadBeatInfo;
  onSaved: () => void;
}) {
  const { playBeat, togglePlay, currentBeat, isPlaying, getCurrentSeconds, seekSeconds } =
    useAudioPlayerContext();

  const [marken, setMarken] = useState<Timecode[]>(() => parseBlock(beat.timecodes));
  const [dreckig, setDreckig] = useState(false);
  // Die Zeit im Knopf soll mitlaufen, ohne den Fortschritts-Kontext zu
  // abonnieren — ein eigener, langsamer Takt nur für diese eine Zahl.
  const [jetzt, setJetzt] = useState(0);

  const laeuftHier = currentBeat?.id === beat.id;

  useEffect(() => {
    setMarken(parseBlock(beat.timecodes));
    setDreckig(false);
  }, [beat.id, beat.timecodes]);

  useEffect(() => {
    if (!laeuftHier) return;
    const t = setInterval(() => setJetzt(getCurrentSeconds()), 250);
    return () => clearInterval(t);
  }, [laeuftHier, getCurrentSeconds]);

  // Speichern nach kurzer Ruhe — wie an den anderen Karten auch, damit kein
  // eigener Knopf nötig ist.
  const gespeichertRef = useRef<string>("");
  useEffect(() => {
    if (!dreckig) return;
    const t = setTimeout(async () => {
      const nutzlast = JSON.stringify(marken);
      if (nutzlast === gespeichertRef.current) return;
      try {
        await api.upload.updateTimecodes(beat.id, marken);
        gespeichertRef.current = nutzlast;
        setDreckig(false);
        onSaved();
      } catch (e) {
        console.error("[Timecodes] speichern fehlgeschlagen:", e);
      }
    }, 700);
    return () => clearTimeout(t);
  }, [marken, dreckig, beat.id, onSaved]);

  const aendern = (i: number, patch: Partial<Timecode>) => {
    setMarken(prev => prev.map((m, k) => (k === i ? { ...m, ...patch } : m)));
    setDreckig(true);
  };

  const entfernen = (i: number) => {
    setMarken(prev => prev.filter((_, k) => k !== i));
    setDreckig(true);
  };

  const hinzufuegen = (label = "") => {
    const secs = laeuftHier ? Math.floor(getCurrentSeconds()) : 0;
    setMarken(prev => {
      // Die erste Marke ist immer 0:00 — auch wenn beim Hinzufügen etwas
      // anderes läuft. Danach zählt die Abspielposition.
      const neu: Timecode = { seconds: prev.length === 0 ? 0 : secs, label };
      return [...prev, neu];
    });
    setDreckig(true);
  };

  const abspielen = () => {
    if (laeuftHier) { togglePlay(); return; }
    // Der Player braucht eine Beat-Form; Pfad und Name reichen ihm.
    playBeat({
      id: beat.id, name: beat.name, path: beat.path,
      bpm: beat.bpm, key: beat.key, status: null, tags: null, favorite: null,
      created_date: null, modified_date: null, notes: null, sold_to: null,
      has_artwork: null, has_video: null,
    } as Beat);
  };

  // ── Hinweise, keine Blocker ──────────────────────────────────────────────
  const sortiert = [...marken].sort((a, b) => a.seconds - b.seconds);
  const zuEng = sortiert.some((m, i) => i > 0 && m.seconds - sortiert[i - 1].seconds < MIN_ABSTAND);
  const hinweis =
    marken.length === 0 ? null
    : marken.length < 3 ? "YouTube zeigt Kapitel erst ab drei Marken."
    : zuEng ? `Zwei Marken liegen weniger als ${MIN_ABSTAND} Sekunden auseinander — YouTube verwirft den Block dann.`
    : null;

  const vorhandeneNamen = marken.map(m => m.label);

  return (
    <SectionCard icon={ListOrdered} title="Kapitel">
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

        {/* Abspielen + laufende Zeit */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={abspielen}
            title={laeuftHier && isPlaying ? "Pause" : "Beat anhören"}
            style={{
              width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
              background: laeuftHier ? C.primary : C.surfaceContainerHigh,
              border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {laeuftHier && isPlaying
              ? <Pause size={12} fill={C.onPrimary} color={C.onPrimary} />
              : <Play  size={12} fill={laeuftHier ? C.onPrimary : C.onSurfaceVariant}
                                 color={laeuftHier ? C.onPrimary : C.onSurfaceVariant} />}
          </button>
          <span style={{
            fontSize: 12, fontFamily: "monospace",
            color: laeuftHier ? C.onSurface : C.onSecondaryFixedVar,
          }}>
            {laeuftHier ? mmss(jetzt) : "—:—"}
          </span>
          <span style={{ flex: 1 }} />
          <button
            onClick={() => hinzufuegen()}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: radius.control,
              background: "transparent", border: `1px solid ${C.border20}`,
              cursor: "pointer", fontSize: 11, fontWeight: 700, color: C.onSurfaceVariant,
            }}
          >
            <Plus size={12} strokeWidth={2.5} />
            {marken.length === 0
              ? "Erste Marke bei 0:00"
              : laeuftHier ? `Marke bei ${mmss(jetzt)}` : "Marke"}
          </button>
        </div>

        {/* Zeilen */}
        {marken.map((m, i) => {
          const ersteZeile = i === 0;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {ersteZeile ? (
                <span
                  title="Die erste Marke muss bei 0:00 liegen, sonst ignoriert YouTube alle Kapitel"
                  style={{
                    width: 64, flexShrink: 0, padding: "7px 8px",
                    borderRadius: radius.control,
                    background: C.surfaceContainerLow, border: `1px dashed ${C.border15}`,
                    fontSize: 12, fontFamily: "monospace", color: C.onSecondaryFixedVar,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                  }}
                >
                  <Lock size={9} strokeWidth={2} /> 0:00
                </span>
              ) : (
                <input
                  defaultValue={mmss(m.seconds)}
                  onBlur={e => {
                    const s = parseMmss(e.target.value);
                    if (s === null) { e.target.value = mmss(m.seconds); return; }
                    aendern(i, { seconds: s });
                    e.target.value = mmss(s);
                  }}
                  style={{
                    width: 64, flexShrink: 0, padding: "7px 8px",
                    borderRadius: radius.control,
                    background: C.surfaceContainer, border: `1px solid ${C.border15}`,
                    fontSize: 12, fontFamily: "monospace", color: C.onSurface,
                    outline: "none", textAlign: "center",
                  }}
                />
              )}

              <input
                value={m.label}
                onChange={e => aendern(i, { label: e.target.value })}
                placeholder="Abschnitt"
                style={{
                  flex: 1, minWidth: 0, padding: "7px 10px",
                  borderRadius: radius.control,
                  background: C.surfaceContainer, border: `1px solid ${C.border15}`,
                  fontSize: 12, color: C.onSurface, outline: "none",
                }}
              />

              <button
                onClick={() => seekSeconds(m.seconds)}
                disabled={!laeuftHier}
                title="An diese Stelle springen"
                style={{
                  width: 26, height: 26, borderRadius: radius.control, flexShrink: 0,
                  background: "transparent", border: `1px solid ${C.border15}`,
                  color: C.onSurfaceVariant,
                  cursor: laeuftHier ? "pointer" : "default",
                  opacity: laeuftHier ? 1 : 0.3,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <CornerDownLeft size={11} strokeWidth={2} />
              </button>

              <button
                onClick={() => entfernen(i)}
                title="Marke entfernen"
                style={{
                  width: 26, height: 26, borderRadius: radius.control, flexShrink: 0,
                  background: "transparent", border: "none",
                  color: C.onSecondaryFixedVar, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <X size={12} strokeWidth={2} />
              </button>
            </div>
          );
        })}

        {/* Vorschläge — freie Eingabe bleibt, das hier ist nur schneller */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {VORSCHLAEGE.map(v => (
            <button
              key={v}
              onClick={() => hinzufuegen(naechsterName(v, vorhandeneNamen))}
              style={{
                padding: "4px 10px", borderRadius: 9999,
                background: C.surfaceContainerHigh, border: `1px solid ${C.border15}`,
                fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
                textTransform: "uppercase", color: C.onSurfaceVariant, cursor: "pointer",
              }}
            >
              + {v}
            </button>
          ))}
        </div>

        {hinweis && (
          <div style={{ fontSize: 11, color: "#fda124", lineHeight: 1.5 }}>{hinweis}</div>
        )}

        <div style={{ fontSize: 10, color: C.onSecondaryFixedVar, lineHeight: 1.5 }}>
          Landet als <code>{"{{TIMECODES}}"}</code> in der Beschreibung. Sortiert wird
          beim Speichern — du musst nicht der Reihe nach arbeiten.
        </div>
      </div>
    </SectionCard>
  );
}
