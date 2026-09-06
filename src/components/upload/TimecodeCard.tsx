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

import { useState, useEffect, useRef, useCallback } from "react";
import { ListOrdered, Play, Pause, Plus, X, CornerDownLeft, Lock } from "lucide-react";
import { api } from "../../lib/api";
import { C, radius } from "../../lib/theme";
import { SectionCard } from "../ui/SectionCard";
import { useAudioPlayerContext } from "../../contexts/AudioPlayerContext";
import type { UploadBeatInfo, Timecode } from "../../types/upload";
import type { Beat } from "../../types/browse";

/** Die Abschnitte, wie sie hier benutzt werden. „Verse" nummeriert sich beim
 *  zweiten Mal von selbst; „Pre-Hook / Hook" ist EIN Kapitel und bleibt, wie
 *  es dasteht — die beiden werden nie getrennt vergeben. */
const VORSCHLAEGE = ["Intro", "Verse", "Pre-Hook / Hook", "Bridge", "Outro"] as const;
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

/** Eine Zeile in der Karte: die Marke plus eine Identität, die das Löschen
 *  überlebt.
 *
 *  Ohne sie stand der Array-Index als React-Key da, und das Zeitfeld ist
 *  unkontrolliert (`defaultValue`, damit man „0:2…" tippen darf, ohne dass
 *  jeder Tastendruck geparst wird). Beim Löschen rückt die nächste Zeile auf
 *  den Platz der gelöschten, React hält die alte DOM-Node — und in ihr stand
 *  weiterhin die Zeit der gelöschten Marke. Beim nächsten Blur wurde daraus
 *  echter Zustand. Die Id ist nur für die Anzeige da, gespeichert wird sie nie.
 */
interface Zeile extends Timecode {
  id: number;
}

let naechsteId = 1;
const alsZeilen = (marks: Timecode[]): Zeile[] =>
  marks.map(m => ({ ...m, id: naechsteId++ }));

/** Anzeige und Speicherung müssen dieselbe Reihenfolge haben: nach Zeit
 *  sortiert, und die früheste Marke liegt auf 0:00. Dieselbe Regel wie in
 *  `build_timecode_block` im Backend — sonst sitzt die Sperre in der Karte auf
 *  einer anderen Zeile als die 0:00 nach dem Speichern. */
export function normalisieren(zeilen: Zeile[]): Zeile[] {
  const sortiert = [...zeilen].sort((a, b) => a.seconds - b.seconds);
  return sortiert.map((z, i) => (i === 0 && z.seconds !== 0 ? { ...z, seconds: 0 } : z));
}

export function TimecodeCard({ beat, onSaved }: {
  beat: UploadBeatInfo;
  onSaved: () => void;
}) {
  const { playBeat, togglePlay, currentBeat, isPlaying, getCurrentSeconds, seekSeconds } =
    useAudioPlayerContext();

  const [marken, setMarken] = useState<Zeile[]>(() => alsZeilen(parseBlock(beat.timecodes)));
  const [dreckig, setDreckig] = useState(false);
  // Die Zeit im Knopf soll mitlaufen, ohne den Fortschritts-Kontext zu
  // abonnieren — ein eigener, langsamer Takt nur für diese eine Zahl.
  const [jetzt, setJetzt] = useState(0);

  const laeuftHier = currentBeat?.id === beat.id;

  useEffect(() => {
    setMarken(alsZeilen(parseBlock(beat.timecodes)));
    setDreckig(false);
  }, [beat.id, beat.timecodes]);

  useEffect(() => {
    if (!laeuftHier) return;
    const t = setInterval(() => setJetzt(getCurrentSeconds()), 250);
    return () => clearInterval(t);
  }, [laeuftHier, getCurrentSeconds]);

  // Speichern nach kurzer Ruhe — wie an den anderen Karten auch, damit kein
  // eigener Knopf nötig ist.
  //
  // Was noch aussteht, liegt in `offenRef` — MIT der Beat-Id, zu der es
  // gehört. Ohne das ginge beim Beat-Wechsel innerhalb der 700 ms die letzte
  // Änderung verloren: React räumt beim Wechsel den Timer weg, und die
  // Zeilen werden gleich darauf aus dem neuen Beat neu gefüllt.
  const offenRef = useRef<{ beatId: string; marks: Zeile[] } | null>(null);

  const wegschreiben = useCallback(async () => {
    const offen = offenRef.current;
    if (!offen) return;
    offenRef.current = null;
    try {
      // Die Id bleibt hier: sie ist nur die Identität der Zeile in der Anzeige.
      await api.upload.updateTimecodes(
        offen.beatId,
        offen.marks.map(({ seconds, label }) => ({ seconds, label })),
      );
      onSaved();
    } catch (e) {
      console.error("[Timecodes] speichern fehlgeschlagen:", e);
    }
  }, [onSaved]);

  useEffect(() => {
    if (!dreckig) return;
    offenRef.current = { beatId: beat.id, marks: marken };
    const t = setTimeout(() => { setDreckig(false); wegschreiben(); }, 700);
    return () => clearTimeout(t);
  }, [marken, dreckig, beat.id, wegschreiben]);

  // Beat-Wechsel oder Karte verlassen: was offen ist, geht trotzdem raus.
  // Die Id kommt aus dem Ref, also landet es beim richtigen Beat.
  useEffect(() => () => { wegschreiben(); }, [beat.id, wegschreiben]);

  /** Beschriftung ändern — ändert die Reihenfolge nicht, also nicht sortieren.
   *  Sonst spränge die Zeile beim Tippen unter dem Cursor weg. */
  const beschriften = (id: number, label: string) => {
    setMarken(prev => prev.map(m => (m.id === id ? { ...m, label } : m)));
    setDreckig(true);
  };

  /** Zeit ändern — hier wird neu sortiert, damit Anzeige und Speicherung
   *  dieselbe Reihenfolge haben. Läuft nur beim Verlassen des Feldes. */
  const zeitSetzen = (id: number, seconds: number) => {
    setMarken(prev => normalisieren(prev.map(m => (m.id === id ? { ...m, seconds } : m))));
    setDreckig(true);
  };

  const entfernen = (id: number) => {
    // Normalisieren, weil die neue früheste Marke auf 0:00 rutscht — genau
    // das macht das Backend beim Speichern auch.
    setMarken(prev => normalisieren(prev.filter(m => m.id !== id)));
    setDreckig(true);
  };

  const hinzufuegen = (label = "") => {
    const secs = laeuftHier ? Math.floor(getCurrentSeconds()) : 0;
    setMarken(prev => normalisieren([...prev, { id: naechsteId++, seconds: secs, label }]));
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
            // Key ist die Id, nicht der Index: sonst erbt die aufrueckende
            // Zeile beim Loeschen die DOM-Node — und damit die Zeit — ihrer
            // Vorgaengerin.
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
                  // Unkontrolliert, damit man „0:2…" tippen darf, ohne dass
                  // jeder Tastendruck geparst wird. Der Wert kommt beim Blur
                  // an; ungueltiges springt auf den letzten guten zurueck.
                  defaultValue={mmss(m.seconds)}
                  onBlur={e => {
                    const s = parseMmss(e.target.value);
                    if (s === null) { e.target.value = mmss(m.seconds); return; }
                    zeitSetzen(m.id, s);
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
                onChange={e => beschriften(m.id, e.target.value)}
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
                onClick={() => entfernen(m.id)}
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
