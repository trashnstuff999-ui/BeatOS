// src/components/GlobalAudioPlayer.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Die Wiedergabeleiste am unteren Rand.
//
// Der Fortschritt läuft über die ganze Breite an der Oberkante, nicht mehr als
// 480px-Streifen in der Mitte. Der Grund ist nicht Optik: bei 480px auf einem
// breiten Bildschirm ist ein Pixel fast eine halbe Sekunde. Über die volle
// Breite wird der Weg rund fünfmal so lang — und genau das braucht das Setzen
// der Kapitelmarken im Upload-Tab, das sekundengenau sein will.
//
// Beide Leisten lassen sich ziehen (vorher: nur klicken) und haben einen
// unsichtbaren Griffbereich um die dünne Linie herum.
// ═══════════════════════════════════════════════════════════════════════════════

import { useRef, useState, useEffect, useCallback } from "react";
import {
  Play, Pause, Repeat, SkipBack, SkipForward,
  Volume2, VolumeX, Loader2, Music, AlertTriangle,
} from "lucide-react";
import { C, radius } from "../lib/theme";
import { SIDEBAR_WIDTH } from "../lib/constants";
import { useAudioPlayerContext, useAudioProgress } from "../contexts/AudioPlayerContext";
import { isStudioBeatId } from "../types/studio";

export const PLAYER_HEIGHT = 68;

/** Höhe des Streifens an der Oberkante, in dem die Fortschrittslinie liegt —
 *  3px Linie plus Griffbereich darunter. */
const LEISTE_OBEN = 15;

/** `versteckt`: nach unten weggefahren (Übersicht) — Tasten wirken weiter. */
export function GlobalAudioPlayer({ versteckt = false }: { versteckt?: boolean }) {
  const {
    currentBeat, coverUrl, isPlaying, isLoading, isLooped, isMuted,
    volume, error,
    togglePlay, toggleLoop, toggleMute, seekPercent, setVolume,
    seekSeconds, getCurrentSeconds,
    playNext, playPrev, hasQueue,
  } = useAudioPlayerContext();
  const { progress, currentTimeFormatted, durationFormatted } = useAudioProgress();

  // Die Tastatur liest die Lautstärke im Moment des Tastendrucks, statt den
  // Zuhörer bei jeder Änderung neu anzumelden.
  const lautRef = useRef(volume);
  useEffect(() => { lautRef.current = volume; }, [volume]);

  // ── Tastatur ──────────────────────────────────────────────────────────────
  // Leertaste spielt und pausiert, ← → springen, Shift dazu springt weit.
  // Die Lautstärke liegt auf Shift + ↑/↓ und nicht auf ↑/↓ allein: im Archiv
  // wandert die Auswahl mit den Pfeiltasten durch die Liste, und zwei
  // Bedeutungen auf einer Taste sind eine zu viel.
  useEffect(() => {
    if (!currentBeat) return;
    const aufTaste = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      // Ein offener Dialog hat eigene Tasten — der Player hält sich raus.
      if (document.querySelector("[data-modal]")) return;

      const springe = (sekunden: number) => seekSeconds(getCurrentSeconds() + sekunden);

      switch (e.key) {
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowRight":
          e.preventDefault();
          springe(e.shiftKey ? 30 : 5);
          break;
        case "ArrowLeft":
          e.preventDefault();
          springe(e.shiftKey ? -30 : -5);
          break;
        case "ArrowUp":
          if (!e.shiftKey) return;
          e.preventDefault();
          setVolume(lautRef.current + 0.05);
          break;
        case "ArrowDown":
          if (!e.shiftKey) return;
          e.preventDefault();
          setVolume(lautRef.current - 0.05);
          break;
      }
    };
    window.addEventListener("keydown", aufTaste);
    return () => window.removeEventListener("keydown", aufTaste);
  }, [currentBeat, togglePlay, seekSeconds, getCurrentSeconds, setVolume]);

  if (!currentBeat) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: 0,
      left: SIDEBAR_WIDTH,
      right: 0,
      height: PLAYER_HEIGHT,
      background: C.surfaceContainerLowest,
      borderTop: `1px solid ${C.border15}`,
      zIndex: 100,
      transform: versteckt ? "translateY(100%)" : "translateY(0)",
      visibility: versteckt ? "hidden" : "visible",
      // visibility erst nach dem Wegfahren umschalten, beim Reinfahren sofort.
      transitionProperty: "transform, visibility",
      transitionDuration: "0.3s, 0s",
      transitionTimingFunction: "ease",
      transitionDelay: versteckt ? "0s, 0.3s" : "0s",
    }} aria-hidden={versteckt}>
      {/* ── Fortschritt, ganze Breite, an der Oberkante ──────────────────────
          Der Griffbereich reicht nach unten in die Leiste hinein, nicht nach
          oben aus ihr heraus — sonst finge er Klicks ab, die dem Inhalt
          darüber gelten. */}
      <ZiehLeiste
        anteil={progress / 100}
        onAnteil={a => seekPercent(a * 100)}
        titel="Zum Springen ziehen — ← → 5 s, mit Shift 30 s"
        linie={3}
        griffOben={0}
        griffUnten={LEISTE_OBEN - 3}
        knopf
        style={{ position: "absolute", top: 0, left: 0, right: 0 }}
      />

      <div style={{
        position: "absolute", top: LEISTE_OBEN, left: 0, right: 0, bottom: 0,
        display: "flex", alignItems: "center",
        padding: "0 20px", gap: 16,
      }}>
        {/* ── Links: Cover + Beat ─────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, width: 280, flexShrink: 0, minWidth: 0 }}>
          <div style={{
            width: 42, height: 42, borderRadius: radius.control, flexShrink: 0,
            background: C.surfaceContainerHigh, overflow: "hidden",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {coverUrl
              ? <img src={coverUrl} alt={currentBeat.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <Music size={17} color={C.onSurfaceVariant} strokeWidth={1.5} />
            }
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 13, fontWeight: 700, color: C.onSurface,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {currentBeat.name}
            </div>
            {/* Der Fehler stand bisher nirgends: der Play-Knopf wurde blass und
                das war die ganze Auskunft. Er ersetzt jetzt die Kennzeile —
                dort, wo man ohnehin hinsieht. */}
            {error ? (
              <div style={{
                display: "flex", alignItems: "center", gap: 5, marginTop: 2,
                fontSize: 12, color: C.error,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                <AlertTriangle size={11} strokeWidth={2} style={{ flexShrink: 0 }} />
                {error}
              </div>
            ) : (
              /* Ein Studio-Preview hat keine Katalognummer — seine ID ist der
                 Ordnerpfad und stand hier als „#studio:C:\…" quer durch die
                 Leiste. */
              <div style={{ fontSize: 12, color: C.onSecondaryFixedVar, marginTop: 2 }}>
                {[
                  isStudioBeatId(currentBeat.id) ? null : `#${currentBeat.id}`,
                  currentBeat.bpm ? `${currentBeat.bpm} BPM` : null,
                ].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
        </div>

        {/* ── Mitte: Bedienung ────────────────────────────────────────────────
            Die Skip-Knöpfe bleiben stehen, auch ohne Liste — sie wegzunehmen
            verschob den Play-Knopf, je nachdem woher der Beat kam. */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 18 }}>
          <IconBtn
            onClick={playPrev}
            disabled={!hasQueue}
            title="Von vorn — oder zum vorherigen Beat, wenn er gerade erst läuft"
          >
            <SkipBack size={18} color={C.onSurfaceVariant} strokeWidth={1.5} />
          </IconBtn>

          <button
            onClick={togglePlay}
            disabled={isLoading || !!error}
            title={isPlaying ? "Pause (Leertaste)" : "Abspielen (Leertaste)"}
            style={{
              width: 36, height: 36, borderRadius: "50%",
              background: isLoading ? C.surfaceContainerHigh : C.onSurface,
              border: "none", cursor: isLoading || error ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              opacity: error ? 0.4 : 1,
              flexShrink: 0,
            }}
          >
            {isLoading
              ? <Loader2 size={16} color={C.background} style={{ animation: "spin 1s linear infinite" }} />
              : isPlaying
                ? <Pause size={16} fill={C.background} color={C.background} />
                : <Play size={16} fill={C.background} color={C.background} style={{ marginLeft: 2 }} />
            }
          </button>

          <IconBtn onClick={playNext} disabled={!hasQueue} title="Nächster Beat in der Liste">
            <SkipForward size={18} color={C.onSurfaceVariant} strokeWidth={1.5} />
          </IconBtn>

          <IconBtn
            onClick={toggleLoop}
            title={isLooped ? "Wiederholung aus" : "Diesen Beat wiederholen"}
          >
            <Repeat size={15} color={isLooped ? C.primary : C.onSecondaryFixedVar} strokeWidth={1.5} />
          </IconBtn>
        </div>

        {/* ── Rechts: Zeit + Lautstärke ───────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 14,
          width: 240, justifyContent: "flex-end", flexShrink: 0,
        }}>
          <span style={{
            fontSize: 12, fontFamily: "monospace", color: C.onSecondaryFixedVar,
            fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
          }}>
            {currentTimeFormatted} / {durationFormatted}
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <IconBtn onClick={toggleMute} title={isMuted ? "Ton an" : "Ton aus"}>
              {isMuted || volume === 0
                ? <VolumeX size={16} color={C.onSecondaryFixedVar} strokeWidth={1.5} />
                : <Volume2 size={16} color={C.onSecondaryFixedVar} strokeWidth={1.5} />
              }
            </IconBtn>
            <ZiehLeiste
              anteil={isMuted ? 0 : volume}
              onAnteil={setVolume}
              titel="Lautstärke — Shift + ↑ / ↓"
              style={{ width: 84 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helfer ─────────────────────────────────────────────────────────────────

/** Eine dünne Linie, die man ziehen kann.
 *
 *  Vorher hingen Fortschritt und Lautstärke an `onClick`: man konnte springen,
 *  aber nicht schieben. Und die Trefferfläche war die 4px hohe Linie selbst —
 *  daneben passierte nichts. Beides steckt jetzt hier, einmal für beide:
 *  Zeigererfassung fürs Ziehen, Innenabstand als unsichtbarer Griffbereich. */
function ZiehLeiste({
  anteil, onAnteil, titel,
  linie = 4, griffOben = 7, griffUnten = 7, knopf = false, style,
}: {
  /** 0 bis 1. */
  anteil: number;
  onAnteil: (anteil: number) => void;
  titel?: string;
  linie?: number;
  griffOben?: number;
  griffUnten?: number;
  knopf?: boolean;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [zieht, setZieht] = useState(false);
  const [ueber, setUeber] = useState(false);

  const ausEreignis = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const kasten = ref.current?.getBoundingClientRect();
    if (!kasten || kasten.width === 0) return;
    onAnteil(Math.max(0, Math.min(1, (e.clientX - kasten.left) / kasten.width)));
  }, [onAnteil]);

  const wach = zieht || ueber;
  const hoehe = wach ? linie + 2 : linie;
  const prozent = `${Math.max(0, Math.min(1, anteil)) * 100}%`;

  return (
    <div
      ref={ref}
      title={titel}
      onPointerDown={e => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setZieht(true);
        ausEreignis(e);
      }}
      onPointerMove={e => { if (zieht) ausEreignis(e); }}
      onPointerUp={e => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        setZieht(false);
      }}
      onPointerCancel={() => setZieht(false)}
      onPointerEnter={() => setUeber(true)}
      onPointerLeave={() => setUeber(false)}
      style={{
        position: "relative",
        paddingTop: griffOben,
        paddingBottom: griffUnten,
        cursor: "pointer",
        touchAction: "none",
        ...style,
      }}
    >
      <div style={{
        height: hoehe,
        background: C.surfaceContainerHighest,
        borderRadius: hoehe / 2,
        transition: "height 0.12s",
      }}>
        <div style={{
          width: prozent, height: "100%",
          background: C.primary,
          borderRadius: hoehe / 2,
        }} />
      </div>
      {/* Der Knopf erscheint erst unter dem Zeiger: als Dauergast wäre er auf
          einer Linie über die ganze Fensterbreite ein Punkt zu viel im Bild. */}
      {knopf && wach && (
        <div style={{
          position: "absolute",
          top: griffOben + hoehe / 2,
          left: prozent,
          transform: "translate(-50%, -50%)",
          width: 11, height: 11, borderRadius: "50%",
          background: C.primary,
          pointerEvents: "none",
        }} />
      )}
    </div>
  );
}

function IconBtn({ children, onClick, title, disabled }: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        background: "none", border: "none",
        cursor: disabled ? "default" : "pointer",
        display: "flex", padding: 4,
        opacity: disabled ? 0.35 : 1,
      }}
    >
      {children}
    </button>
  );
}

export const GLOBAL_PLAYER_HEIGHT = PLAYER_HEIGHT;
