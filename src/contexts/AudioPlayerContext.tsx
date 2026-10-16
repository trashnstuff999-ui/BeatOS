// src/contexts/AudioPlayerContext.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Global Audio Player Context — one instance for the entire app
// ═══════════════════════════════════════════════════════════════════════════════

import { createContext, useContext, useState, useRef, useCallback, useEffect, useMemo, ReactNode } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { api } from "../lib/api";
import type { Beat } from "../types/browse";

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

/** Welcher Eintrag der Warteschlange ist der naechste?
 *
 *  Zwei Aufrufer mit einem Unterschied: der Skip-Knopf laeuft am Listenende
 *  vorn weiter (umbruch), der Uebergang am Ende eines Beats nicht — von
 *  selbst endlos durchs Archiv zu laufen will niemand.
 *
 *  Steht der laufende Beat gar nicht mehr in der Liste (Filter gewechselt),
 *  faengt der Skip-Knopf vorn an; automatisch passiert dann nichts. */
export function naechsterEintrag<T extends { path: string | null }>(
  queue: T[],
  aktuellerPfad: string | null,
  versatz: number,
  umbruch: boolean,
): T | null {
  if (queue.length === 0) return null;
  const idx = queue.findIndex(b => b.path === aktuellerPfad);
  if (idx < 0) return umbruch ? queue[0] ?? null : null;
  const ziel = idx + versatz;
  if (!umbruch) return queue[ziel] ?? null;
  return queue[((ziel % queue.length) + queue.length) % queue.length] ?? null;
}

function pathToAssetUrl(filePath: string): string {
  return convertFileSrc(filePath.replace(/\\/g, "/"));
}

interface AudioPlayerContextValue {
  currentBeat: Beat | null;
  coverUrl: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  isLooped: boolean;
  isMuted: boolean;
  volume: number;
  error: string | null;
  /** `startSeconds`: dort weiterspielen — fuers Neuladen nach einem Export. */
  playBeat: (beat: Beat, preloadedCoverUrl?: string | null, startSeconds?: number) => void;
  /** Welche Datei mit welchem Stand gerade geladen ist — fuer „neuer Export da?". */
  getGeladeneDatei: () => { pfad: string; stand: number | null } | null;
  togglePlay: () => void;
  toggleLoop: () => void;
  toggleMute: () => void;
  seekPercent: (percent: number) => void;
  /** Sekunden lesen statt abonnieren — der Fortschritts-Kontext tickt 10x/s. */
  getCurrentSeconds: () => number;
  getDurationSeconds: () => number;
  seekSeconds: (secs: number) => void;
  setVolume: (vol: number) => void;
  /** Hör-Queue (z.B. die aktuell gefilterte Browse-Liste) für Skip-Buttons */
  setQueue: (beats: Beat[] | null) => void;
  playNext: () => void;
  playPrev: () => void;
  hasQueue: boolean;
}

// The 100 ms playback tick lives in its own context so only the player bar
// re-renders during playback — everything else consumes the stable context.
interface AudioProgressContextValue {
  progress: number;
  currentTimeFormatted: string;
  durationFormatted: string;
}

const AudioPlayerContext = createContext<AudioPlayerContextValue | null>(null);
const AudioProgressContext = createContext<AudioProgressContextValue | null>(null);

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** „Spiel den naechsten" — gesetzt, sobald die Warteschlange steht. */
  const weiterRef = useRef<() => void>(() => {});
  const currentBeatPathRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isLoopedRef = useRef(false);
  const startRef = useRef<number | null>(null);
  const geladenRef = useRef<{ pfad: string; stand: number | null } | null>(null);

  const [currentBeat, setCurrentBeat] = useState<Beat | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLooped, setIsLooped] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  // Die Lautstaerke ueberlebt den Neustart. Sie jedes Mal auf 70% zu stellen
  // ist bei einer App, die neben FL Studio laeuft, jedes Mal ein Schreck.
  const [volume, setVolumeState] = useState(() => {
    try {
      const gespeichert = Number(localStorage.getItem("beatos_lautstaerke"));
      if (Number.isFinite(gespeichert) && gespeichert >= 0 && gespeichert <= 1) return gespeichert;
    } catch { /* privater Modus, gesperrter Speicher — dann eben der Standard */ }
    return 0.7;
  });
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const playBeat = useCallback((beat: Beat, preloadedCoverUrl?: string | null, startSeconds?: number) => {
    const beatPath = beat.path;
    if (!beatPath) return;
    startRef.current = startSeconds ?? null;
    geladenRef.current = null;

    currentBeatPathRef.current = beatPath;
    setCurrentBeat(beat);
    setCoverUrl(null);
    setAudioUrl(null);
    setError(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }

    // Cover
    if (preloadedCoverUrl) {
      setCoverUrl(preloadedCoverUrl);
    } else {
      (async () => {
        try {
          const p = await api.audio.getCoverPath(beatPath);
          if (currentBeatPathRef.current !== beatPath) return;
          if (p) setCoverUrl(pathToAssetUrl(p));
        } catch {}
      })();
    }

    // Audio
    setIsLoading(true);
    (async () => {
      try {
        const ap = await api.audio.getAudioPath(beatPath);
        if (currentBeatPathRef.current !== beatPath) return;
        if (!ap) { setError("Keine Audiodatei gefunden"); setIsLoading(false); return; }
        const stand = await api.audio.getFileMtime(ap).catch(() => null);
        if (currentBeatPathRef.current !== beatPath) return;
        geladenRef.current = { pfad: ap, stand };
        // ?v= bei jedem Laden: FL Studio ueberschreibt Exporte gern unter
        // demselben Namen, und mit gleicher URL lieferte die WebView die alte
        // Fassung aus ihrem Cache. Das Asset-Protokoll liest nur den Pfad.
        setAudioUrl(`${pathToAssetUrl(ap)}?v=${Date.now()}`);
      } catch {
        if (currentBeatPathRef.current !== beatPath) return;
        setError("Audio konnte nicht geladen werden");
        setIsLoading(false);
      }
    })();
  }, []);

  // Wire up audio element when URL changes
  useEffect(() => {
    if (!audioUrl) return;

    if (!audioRef.current) audioRef.current = new Audio();
    const audio = audioRef.current;
    audio.src = audioUrl;
    audio.volume = volume;
    audio.loop = isLoopedRef.current;
    audio.muted = isMuted;

    // Notbremse: kommt weder `loadedmetadata` noch `error`, blieb der Spinner
    // ewig stehen. Das passiert nicht bei einer kaputten Datei — die meldet
    // `error` — sondern wenn das Lesen haengt: Netzlaufwerk weg, OneDrive holt
    // eine ausgelagerte Datei zurueck, Platte schlafend. Nach 15 Sekunden
    // sagen wir es, statt weiterzudrehen.
    let notbremse: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      notbremse = null;
      setIsLoading(false);
      setError("Die Datei antwortet nicht — liegt sie noch da, wo sie war?");
    }, 15_000);
    /** Irgendein Ladeereignis kam durch — dann war es kein Haenger. */
    const bremseLoesen = () => {
      if (notbremse === null) return;
      clearTimeout(notbremse);
      notbremse = null;
    };

    const onMeta = () => {
      bremseLoesen(); setDuration(audio.duration); setIsLoading(false); setError(null);
      if (startRef.current !== null) {
        audio.currentTime = Math.min(startRef.current, audio.duration || 0);
        setCurrentTime(audio.currentTime);
        startRef.current = null;
      }
    };
    const onEnded = () => {
      if (isLoopedRef.current) return;   // Wiederholung laeuft ohne Ende weiter
      setIsPlaying(false);
      setCurrentTime(0);
      // Und weiter mit dem naechsten aus der Liste — dafuer ist sie da. Der
      // Rueckruf steckt in einer Ref, weil er erst weiter unten entsteht.
      weiterRef.current();
    };
    const onError = () => { bremseLoesen(); setError("Wiedergabe fehlgeschlagen"); setIsLoading(false); };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onCanPlay = () => { bremseLoesen(); setIsLoading(false); };

    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("canplay", onCanPlay);
    audio.load();

    // Auto-play on first canplaythrough
    const onReady = () => { audio.play().catch(() => {}); };
    audio.addEventListener("canplaythrough", onReady, { once: true });


    intervalRef.current = setInterval(() => {
      if (audioRef.current && !audioRef.current.paused) {
        setCurrentTime(audioRef.current.currentTime);
      }
    }, 100);

    return () => {
      bremseLoesen();
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      audio.removeEventListener("canplaythrough", onReady);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("canplay", onCanPlay);
    };
  }, [audioUrl]);

  // Sync volume / loop / mute
  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = volume;
    audioRef.current.loop = isLooped;
    audioRef.current.muted = isMuted;
    isLoopedRef.current = isLooped;
  }, [volume, isLooped, isMuted]);

  useEffect(() => () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
  }, []);

  // Stabil halten: die Browse-Zeilen bekommen togglePlay als Prop, und eine
  // wechselnde Identität würde bei jedem Play/Pause die ganze Liste neu
  // rendern. Der Pause-Zustand kommt direkt vom Element statt aus dem
  // gespiegelten State — das ist ohnehin die verlässlichere Quelle.
  const audioUrlRef = useRef<string | null>(null);
  useEffect(() => { audioUrlRef.current = audioUrl; }, [audioUrl]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrlRef.current) return;
    if (audio.paused) audio.play().catch(() => setError("Wiedergabe fehlgeschlagen"));
    else audio.pause();
  }, []);

  const toggleLoop = useCallback(() => setIsLooped(p => !p), []);
  const toggleMute = useCallback(() => setIsMuted(p => !p), []);

  // setCurrentTime nicht vergessen: der 100ms-Takt laeuft nur waehrend der
  // Wiedergabe. Ohne das steht die Anzeige beim Ziehen im Pausenzustand still,
  // obwohl die Stelle laengst gewechselt hat.
  const seekPercent = useCallback((percent: number) => {
    if (audioRef.current && duration > 0) {
      const zeit = (percent / 100) * duration;
      audioRef.current.currentTime = zeit;
      setCurrentTime(zeit);
    }
  }, [duration]);

  // ── Zeit in Sekunden, fuer Kapitelmarken ──────────────────────────────────
  // Bewusst als Funktionen auf DIESEM Kontext und nicht als Wert im
  // Fortschritts-Kontext: der tickt zehnmal pro Sekunde, und wer ihn
  // abonniert, rendert zehnmal pro Sekunde mit. Die Kapitel-Karte will die
  // Zeit nur im Moment des Klicks wissen — also lesen, nicht abonnieren.
  const getCurrentSeconds = useCallback(() => audioRef.current?.currentTime ?? 0, []);
  const getDurationSeconds = useCallback(() => audioRef.current?.duration ?? 0, []);
  const getGeladeneDatei = useCallback(() => geladenRef.current, []);

  /** Direkt auf eine Sekunde springen — ohne den Umweg ueber Prozent. */
  const seekSeconds = useCallback((secs: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    const zeit = Math.max(0, Math.min(secs, audio.duration));
    audio.currentTime = zeit;
    setCurrentTime(zeit);
  }, []);

  const setVolume = useCallback((vol: number) => {
    const wert = Math.max(0, Math.min(1, vol));
    setVolumeState(wert);
    try { localStorage.setItem("beatos_lautstaerke", String(wert)); } catch {}
  }, []);

  // ── Listen queue (skip buttons navigate the list that started playback) ────
  const queueRef = useRef<Beat[] | null>(null);
  const [queueLength, setQueueLength] = useState(0);

  const setQueue = useCallback((beats: Beat[] | null) => {
    queueRef.current = beats && beats.length > 0 ? beats : null;
    setQueueLength(queueRef.current?.length ?? 0);
  }, []);

  const playOffset = useCallback((offset: number) => {
    const ziel = naechsterEintrag(queueRef.current ?? [], currentBeatPathRef.current, offset, true);
    if (ziel) playBeat(ziel);
  }, [playBeat]);

  const playNext = useCallback(() => playOffset(1), [playOffset]);

  /** Zurueck heisst zuerst „an den Anfang": nach drei Sekunden meint man den
   *  laufenden Beat, nicht den davor. So macht es jeder Player. */
  const playPrev = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      setCurrentTime(0);
      return;
    }
    playOffset(-1);
  }, [playOffset]);

  /** Der Uebergang am Ende eines Beats — anders als der Skip-Knopf:
   *  am Listenende ist Schluss, statt vorn wieder anzufangen. Von selbst
   *  endlos durchs ganze Archiv zu laufen will niemand. */
  const weiterOhneUmbruch = useCallback(() => {
    const ziel = naechsterEintrag(queueRef.current ?? [], currentBeatPathRef.current, 1, false);
    if (ziel) playBeat(ziel);
  }, [playBeat]);

  useEffect(() => { weiterRef.current = weiterOhneUmbruch; }, [weiterOhneUmbruch]);

  const playerValue = useMemo<AudioPlayerContextValue>(() => ({
    currentBeat, coverUrl, isPlaying, isLoading, isLooped, isMuted,
    volume, error,
    playBeat, togglePlay, toggleLoop, toggleMute, seekPercent, setVolume,
    getCurrentSeconds, getDurationSeconds, seekSeconds, getGeladeneDatei,
    setQueue, playNext, playPrev, hasQueue: queueLength > 1,
  }), [
    currentBeat, coverUrl, isPlaying, isLoading, isLooped, isMuted,
    volume, error,
    playBeat, togglePlay, toggleLoop, toggleMute, seekPercent, setVolume,
    getCurrentSeconds, getDurationSeconds, seekSeconds, getGeladeneDatei,
    setQueue, playNext, playPrev, queueLength,
  ]);

  const progressValue = useMemo<AudioProgressContextValue>(() => ({
    progress: duration > 0 ? (currentTime / duration) * 100 : 0,
    currentTimeFormatted: formatTime(currentTime),
    durationFormatted: formatTime(duration),
  }), [currentTime, duration]);

  return (
    <AudioPlayerContext.Provider value={playerValue}>
      <AudioProgressContext.Provider value={progressValue}>
        {children}
      </AudioProgressContext.Provider>
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayerContext() {
  const ctx = useContext(AudioPlayerContext);
  if (!ctx) throw new Error("useAudioPlayerContext must be used within AudioPlayerProvider");
  return ctx;
}

export function useAudioProgress() {
  const ctx = useContext(AudioProgressContext);
  if (!ctx) throw new Error("useAudioProgress must be used within AudioPlayerProvider");
  return ctx;
}
