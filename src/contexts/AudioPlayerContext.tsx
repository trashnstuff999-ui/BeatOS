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
  playBeat: (beat: Beat, preloadedCoverUrl?: string | null) => void;
  togglePlay: () => void;
  toggleLoop: () => void;
  toggleMute: () => void;
  seekPercent: (percent: number) => void;
  setVolume: (vol: number) => void;
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
  const currentBeatPathRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isLoopedRef = useRef(false);

  const [currentBeat, setCurrentBeat] = useState<Beat | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLooped, setIsLooped] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.7);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const playBeat = useCallback((beat: Beat, preloadedCoverUrl?: string | null) => {
    const beatPath = beat.path;
    if (!beatPath) return;

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
        if (!ap) { setError("No audio file found"); setIsLoading(false); return; }
        setAudioUrl(pathToAssetUrl(ap));
      } catch {
        if (currentBeatPathRef.current !== beatPath) return;
        setError("Failed to load audio");
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

    const onMeta = () => { setDuration(audio.duration); setIsLoading(false); setError(null); };
    const onEnded = () => { if (!isLoopedRef.current) { setIsPlaying(false); setCurrentTime(0); } };
    const onError = () => { setError("Audio playback failed"); setIsLoading(false); };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onCanPlay = () => setIsLoading(false);

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

  const togglePlay = useCallback(() => {
    if (!audioRef.current || !audioUrl) return;
    if (isPlaying) audioRef.current.pause();
    else audioRef.current.play().catch(() => setError("Play failed"));
  }, [isPlaying, audioUrl]);

  const toggleLoop = useCallback(() => setIsLooped(p => !p), []);
  const toggleMute = useCallback(() => setIsMuted(p => !p), []);

  const seekPercent = useCallback((percent: number) => {
    if (audioRef.current && duration > 0) {
      audioRef.current.currentTime = (percent / 100) * duration;
    }
  }, [duration]);

  const setVolume = useCallback((vol: number) => setVolumeState(Math.max(0, Math.min(1, vol))), []);

  const playerValue = useMemo<AudioPlayerContextValue>(() => ({
    currentBeat, coverUrl, isPlaying, isLoading, isLooped, isMuted,
    volume, error,
    playBeat, togglePlay, toggleLoop, toggleMute, seekPercent, setVolume,
  }), [
    currentBeat, coverUrl, isPlaying, isLoading, isLooped, isMuted,
    volume, error,
    playBeat, togglePlay, toggleLoop, toggleMute, seekPercent, setVolume,
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
