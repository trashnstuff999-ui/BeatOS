// src/components/GlobalAudioPlayer.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Die Wiedergabeleiste am unteren Rand.
//
// Das Cover liegt verschwommen dahinter, wie „Als Nächstes" in der Übersicht —
// jeder Beat färbt die Leiste ein wenig anders ein.
//
// Die Zeitleiste füllt die ganze Mitte unter den Knöpfen. Lang muss sie
// bleiben: bei 480px auf einem breiten Bildschirm ist ein Pixel fast eine
// halbe Sekunde, und das Setzen der Kapitelmarken im Upload-Tab will
// sekundengenau sein. Vorher lag sie als 3px-Linie an der Oberkante mit 12px
// Griff — schwer zu treffen. Jetzt 5px Linie, 25px Griffhöhe, und über dem
// Zeiger steht die Zeit an dieser Stelle.
// ═══════════════════════════════════════════════════════════════════════════════

import { useRef, useState, useEffect, useCallback } from "react";
import {
  Play, Pause, Repeat, SkipBack, SkipForward,
  Volume2, VolumeX, Loader2, Music, AlertTriangle,
} from "lucide-react";
import { C, alpha, radius } from "../lib/theme";
import { ladeWelle } from "./upload/Zeitleiste";
import { farbeAusBild } from "./studio/ArtistKopf";
import { SIDEBAR_WIDTH } from "../lib/constants";
import { zeitText } from "../lib/time";
import { useAudioPlayerContext, useAudioProgress } from "../contexts/AudioPlayerContext";
import { isStudioBeatId } from "../types/studio";

export const PLAYER_HEIGHT = 104;

/** `versteckt`: nach unten weggefahren (Übersicht) — Tasten wirken weiter. */
export function GlobalAudioPlayer({ versteckt = false }: { versteckt?: boolean }) {
  const {
    currentBeat, coverUrl, isPlaying, isLoading, isLooped, isMuted,
    volume, error,
    togglePlay, toggleLoop, toggleMute, seekPercent, setVolume,
    seekSeconds, getCurrentSeconds, getDurationSeconds,
    playNext, playPrev, hasQueue, getGeladeneDatei,
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

  // ── Look „Wucht“: Wellenform der geladenen Datei, Farbe aus dem Cover ──────
  const [welle, setWelle] = useState<number[] | null>(null);
  useEffect(() => {
    setWelle(null);
    if (isLoading) return;
    const datei = getGeladeneDatei();
    if (!datei) return;
    let weg = false;
    ladeWelle(datei.pfad, datei.stand ?? 0).then(w => { if (!weg) setWelle(w.spitzen); }).catch(() => {});
    return () => { weg = true; };
  }, [currentBeat?.id, isLoading, getGeladeneDatei]);

  const [akzent, setAkzent] = useState<string>(C.primary);
  useEffect(() => {
    setAkzent(C.primary);
    if (!coverUrl) return;
    let weg = false;
    farbeAusBild(coverUrl, true).then(f => { if (!weg && f) setAkzent(f); });
    return () => { weg = true; };
  }, [coverUrl]);

  if (!currentBeat) return null;

  const pille = (text: string, orange = false) => (
    <span key={text} style={{
      fontSize: 12, fontWeight: 700, padding: "3px 9px", borderRadius: radius.full, whiteSpace: "nowrap",
      background: orange ? alpha(C.primary, 0.12) : "rgba(255,255,255,0.06)",
      border: `1px solid ${orange ? alpha(C.primary, 0.4) : "rgba(255,255,255,0.12)"}`,
      color: orange ? C.primary : C.onSurface,
    }}>{text}</span>
  );

  return (
    <div style={{
      position: "fixed",
      bottom: 0,
      left: SIDEBAR_WIDTH,
      right: 0,
      height: PLAYER_HEIGHT,
      background: `linear-gradient(90deg, color-mix(in srgb, ${akzent} 16%, ${C.surfaceContainerLowest}), ${C.surfaceContainerLowest} 45%)`,
      borderTop: `1px solid ${C.border15}`,
      overflow: "hidden",
      zIndex: 100,
      transform: versteckt ? "translateY(100%)" : "translateY(0)",
      visibility: versteckt ? "hidden" : "visible",
      // visibility erst nach dem Wegfahren umschalten, beim Reinfahren sofort.
      transitionProperty: "transform, visibility",
      transitionDuration: "0.3s, 0s",
      transitionTimingFunction: "ease",
      transitionDelay: versteckt ? "0s, 0.3s" : "0s",
    }} aria-hidden={versteckt}>
      {/* Leuchtende Fortschrittskante oben */}
      <div aria-hidden style={{
        position: "absolute", left: 0, top: 0, height: 2, width: `${progress}%`,
        background: `linear-gradient(90deg, ${C.primary}, ${akzent})`,
        boxShadow: `0 0 10px ${akzent}`,
      }} />

      <div style={{
        position: "relative", height: "100%",
        display: "flex", alignItems: "center",
        padding: "0 28px", gap: 32,
      }}>
        {/* ── Links: Cover + Beat ─────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, width: 330, flexShrink: 0, minWidth: 0 }}>
          <div style={{
            width: 68, height: 68, borderRadius: 14, flexShrink: 0,
            background: C.surfaceContainerHigh, overflow: "hidden",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 0 18px color-mix(in srgb, ${akzent} 40%, transparent), 0 10px 24px rgba(0,0,0,0.6)`,
          }}>
            {coverUrl
              ? <img src={coverUrl} alt={currentBeat.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <Music size={22} color={C.onSurfaceVariant} strokeWidth={1.5} />
            }
          </div>

          <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <span style={{
                fontSize: 20, fontWeight: 800, color: C.onSurface, letterSpacing: "-0.02em",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {currentBeat.name}
              </span>
              <Pegel an={isPlaying} />
            </div>
            {/* Der Fehler ersetzt die Kennzeile — dort, wo man ohnehin hinsieht.
                Ein Studio-Preview hat keine Katalognummer. */}
            {error ? (
              <div style={{
                display: "flex", alignItems: "center", gap: 5,
                fontSize: 12, color: C.error,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                <AlertTriangle size={11} strokeWidth={2} style={{ flexShrink: 0 }} />
                {error}
              </div>
            ) : (
              <div style={{ display: "flex", gap: 6, minWidth: 0, overflow: "hidden" }}>
                {currentBeat.key && pille(currentBeat.key)}
                {currentBeat.bpm ? pille(`${currentBeat.bpm} BPM`) : null}
                {!isStudioBeatId(currentBeat.id) && pille(`B${currentBeat.id}`, true)}
              </div>
            )}
          </div>
        </div>

        {/* ── Mitte: Knöpfe, dann die Wellenform als Zeitleiste ───────────────
            Die Skip-Knöpfe bleiben stehen, auch ohne Liste — sie wegzunehmen
            verschob alles, je nachdem woher der Beat kam. */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
            <KachelKnopf onClick={playPrev} disabled={!hasQueue} title="Zurück">
              <SkipBack size={18} fill="currentColor" strokeWidth={1.5} />
            </KachelKnopf>
            <button
              className="ue-hebt"
              onClick={togglePlay}
              disabled={isLoading || !!error}
              title={isPlaying ? "Pause (Leertaste)" : "Abspielen (Leertaste)"}
              style={{
                width: 58, height: 58, borderRadius: "50%",
                background: C.primary, color: C.onPrimary,
                border: "none", cursor: isLoading || error ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                opacity: error ? 0.4 : isLoading ? 0.7 : 1,
                boxShadow: isPlaying
                  ? `0 0 0 5px ${alpha(C.primary, 0.16)}, 0 0 21px ${alpha(C.primary, 0.36)}`
                  : `0 4px 14px ${alpha(C.primary, 0.25)}`,
                flexShrink: 0,
              }}
            >
              {isLoading
                ? <Loader2 size={22} style={{ animation: "spin 1s linear infinite" }} />
                : isPlaying
                  ? <Pause size={22} fill="currentColor" />
                  : <Play size={22} fill="currentColor" style={{ marginLeft: 2 }} />
              }
            </button>
            <KachelKnopf onClick={playNext} disabled={!hasQueue} title="Nächster Beat in der Liste">
              <SkipForward size={18} fill="currentColor" strokeWidth={1.5} />
            </KachelKnopf>
          </div>

          <Zeit hell>{currentTimeFormatted}</Zeit>
          <ZiehLeiste
            anteil={progress / 100}
            onAnteil={a => seekPercent(a * 100)}
            titel="Springen · ← → 5 s, Shift 30 s"
            griffOben={0}
            griffUnten={0}
            vorschau={a => zeitText(a * getDurationSeconds())}
            style={{ flex: 1, minWidth: 0 }}
            inhalt={(a, wach) => <Wellenform spitzen={welle} anteil={a} akzent={akzent} wach={wach} />}
          />
          <Zeit>{durationFormatted}</Zeit>
        </div>

        {/* ── Rechts: Wiederholen, Lautstärke als LEDs ──────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, width: 250, justifyContent: "flex-end", flexShrink: 0 }}>
          <KachelKnopf onClick={toggleLoop} title={isLooped ? "Wiederholung aus" : "Diesen Beat wiederholen"} an={isLooped}>
            <Repeat size={17} strokeWidth={2} />
          </KachelKnopf>
          <IconBtn onClick={toggleMute} title={isMuted ? "Ton an" : "Ton aus"}>
            {isMuted || volume === 0
              ? <VolumeX size={18} strokeWidth={1.75} />
              : <Volume2 size={18} strokeWidth={1.75} />
            }
          </IconBtn>
          <ZiehLeiste
            anteil={isMuted ? 0 : volume}
            onAnteil={setVolume}
            titel="Lautstärke · Shift ↑ ↓"
            griffOben={6}
            griffUnten={6}
            style={{ width: 100 }}
            inhalt={a => <LautLeds anteil={a} />}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Helfer ─────────────────────────────────────────────────────────────────

function Zeit({ children, hell = false }: { children: React.ReactNode; hell?: boolean }) {
  return (
    <span style={{
      fontSize: 13, fontWeight: hell ? 700 : 600, color: hell ? C.onSurface : C.onSurfaceVariant, width: 44, flexShrink: 0,
      fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", textAlign: hell ? "right" : "left",
    }}>
      {children}
    </span>
  );
}

/** Drei hüpfende Balken neben dem Namen, solange Musik läuft. */
function Pegel({ an }: { an: boolean }) {
  return (
    <span aria-hidden style={{
      display: "inline-flex", alignItems: "flex-end", gap: 2, height: 12, flexShrink: 0,
      opacity: an ? 1 : 0, transition: "opacity 0.2s",
    }}>
      {[0, 0.25, 0.5].map(v => (
        <span key={v} className="pegel" style={{
          width: 3, height: 12, borderRadius: 1, background: C.primary,
          animationDelay: `${v}s`, animationPlayState: an ? "running" : "paused",
        }} />
      ))}
    </span>
  );
}

/** Eine Linie, die man ziehen kann.
 *
 *  Vorher hingen Fortschritt und Lautstärke an `onClick`: man konnte springen,
 *  aber nicht schieben. Und die Trefferfläche war die 4px hohe Linie selbst —
 *  daneben passierte nichts. Beides steckt jetzt hier, einmal für beide:
 *  Zeigererfassung fürs Ziehen, Innenabstand als unsichtbarer Griffbereich. */
function ZiehLeiste({
  anteil, onAnteil, titel,
  linie = 4, griffOben = 7, griffUnten = 7, knopf = false, vorschau, style, inhalt,
}: {
  /** Statt der Linie: eigenes Bild (Wellenform, LEDs), bekommt Anteil und ob der Zeiger drauf ist. */
  inhalt?: (anteil: number, wach: boolean) => React.ReactNode;
  /** 0 bis 1. */
  anteil: number;
  onAnteil: (anteil: number) => void;
  titel?: string;
  linie?: number;
  griffOben?: number;
  griffUnten?: number;
  knopf?: boolean;
  /** Text über dem Zeiger, z. B. die Zeit an dieser Stelle. */
  vorschau?: (anteil: number) => string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [zieht, setZieht] = useState(false);
  const [zeiger, setZeiger] = useState<number | null>(null);

  const anteilBei = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const kasten = ref.current?.getBoundingClientRect();
    if (!kasten || kasten.width === 0) return null;
    return Math.max(0, Math.min(1, (e.clientX - kasten.left) / kasten.width));
  }, []);

  const wach = zieht || zeiger !== null;
  const hoehe = wach ? linie + 2 : linie;
  const prozent = `${Math.max(0, Math.min(1, anteil)) * 100}%`;

  return (
    <div
      ref={ref}
      title={vorschau ? undefined : titel}
      onPointerDown={e => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setZieht(true);
        const a = anteilBei(e);
        if (a !== null) onAnteil(a);
      }}
      onPointerMove={e => {
        const a = anteilBei(e);
        if (a === null) return;
        setZeiger(a);
        if (zieht) onAnteil(a);
      }}
      onPointerUp={e => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        setZieht(false);
      }}
      onPointerCancel={() => setZieht(false)}
      onPointerLeave={() => setZeiger(null)}
      style={{
        position: "relative",
        paddingTop: griffOben,
        paddingBottom: griffUnten,
        cursor: "pointer",
        touchAction: "none",
        ...style,
      }}
    >
      {inhalt ? inhalt(Math.max(0, Math.min(1, anteil)), wach) : <div style={{
        height: hoehe,
        background: "rgba(255,255,255,0.12)",
        borderRadius: hoehe / 2,
        transition: "height 0.12s",
        overflow: "hidden",
      }}>
        <div style={{
          width: prozent, height: "100%",
          background: `linear-gradient(90deg, ${alpha(C.primary, 0.7)}, ${C.primary})`,
          borderRadius: hoehe / 2,
        }} />
      </div>}
      {/* Der Knopf erscheint erst unter dem Zeiger: als Dauergast wäre er auf
          einer langen Linie ein Punkt zu viel im Bild. */}
      {knopf && wach && (
        <div style={{
          position: "absolute",
          top: griffOben + hoehe / 2,
          left: prozent,
          transform: "translate(-50%, -50%)",
          width: 14, height: 14, borderRadius: "50%",
          background: C.onSurface,
          boxShadow: `0 0 0 3px ${alpha(C.primary, 0.5)}`,
          pointerEvents: "none",
        }} />
      )}
      {vorschau && zeiger !== null && (
        <div style={{
          position: "absolute", bottom: "100%", left: `${zeiger * 100}%`,
          transform: "translate(-50%, 4px)",
          padding: "3px 7px", borderRadius: 6, background: C.surfaceContainerHighest,
          fontSize: 11, fontFamily: "monospace", color: C.onSurface, whiteSpace: "nowrap",
          pointerEvents: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
        }}>
          {vorschau(zeiger)}
        </div>
      )}
    </div>
  );
}

/** Zurück, Weiter, Wiederholen: Kachel mit Rand statt nacktem Symbol. */
function KachelKnopf({ children, onClick, title, disabled, an = false }: {
  children: React.ReactNode; onClick?: () => void; title?: string; disabled?: boolean; an?: boolean;
}) {
  return (
    <button className="player-kachel" onClick={onClick} title={title} disabled={disabled} style={{
      width: 40, height: 40, borderRadius: 12, flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      border: `1px solid ${an ? alpha(C.primary, 0.5) : "rgba(255,255,255,0.12)"}`,
      background: an ? alpha(C.primary, 0.12) : "rgba(255,255,255,0.04)",
      color: an ? C.primary : C.onSurface,
      cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.35 : 1,
    }}>
      {children}
    </button>
  );
}

/** Balken der Wellenform; der gespielte Teil im Verlauf Orange → Coverfarbe.
 *  Solange sie rechnet (oder ohne Datei), gleich hohe Balken als Platzhalter. */
function Wellenform({ spitzen, anteil, akzent, wach }: { spitzen: number[] | null; anteil: number; akzent: string; wach: boolean }) {
  const werte = spitzen ?? PLATZHALTER;
  const gespielt = anteil * werte.length;
  return (
    <div style={{ height: 52, display: "flex", alignItems: "center", gap: 2, position: "relative" }}>
      {werte.map((v, i) => {
        const an = i < gespielt;
        return (
          <i key={i} style={{
            flex: 1, minWidth: 0, borderRadius: 2,
            height: `${Math.round(14 + v * 86)}%`,
            background: an ? `linear-gradient(180deg, ${C.primary}, ${akzent})` : wach ? "rgba(255,255,255,0.24)" : "rgba(255,255,255,0.16)",
            boxShadow: an ? `0 0 5px color-mix(in srgb, ${akzent} 32%, transparent)` : "none",
          }} />
        );
      })}
      <div style={{
        position: "absolute", top: -4, bottom: -4, left: `${anteil * 100}%`, width: 2, borderRadius: 1,
        background: "#fff", boxShadow: "0 0 8px #fff", transform: "translateX(-1px)", pointerEvents: "none",
      }} />
    </div>
  );
}
const PLATZHALTER = Array.from({ length: 120 }, () => 0.25);

/** Lautstärke als zehn LEDs, nach rechts höher. */
function LautLeds({ anteil }: { anteil: number }) {
  const an = Math.round(anteil * 10);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 22 }}>
      {Array.from({ length: 10 }, (_, i) => (
        <i key={i} style={{
          flex: 1, borderRadius: 2, height: `${30 + i * 7.5}%`,
          background: i < an ? C.primary : "rgba(255,255,255,0.14)",
          transition: "background 0.1s",
        }} />
      ))}
    </div>
  );
}

function IconBtn({ children, onClick, title, disabled, an = false }: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
  /** Eingeschaltet (Wiederholen): orange statt grau. */
  an?: boolean;
}) {
  return (
    <button
      className="player-knopf"
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        border: "none",
        cursor: disabled ? "default" : "pointer",
        display: "flex", padding: 4,
        color: an ? C.primary : C.onSurfaceVariant,
        opacity: disabled ? 0.35 : 1,
      }}
    >
      {children}
    </button>
  );
}

export const GLOBAL_PLAYER_HEIGHT = PLAYER_HEIGHT;
