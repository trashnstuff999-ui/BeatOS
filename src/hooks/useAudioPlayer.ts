// src/hooks/useAudioPlayer.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Audio Player Hook - Optimized for fast cover loading
// Cover: Uses Tauri asset protocol (instant)
// Audio: Uses base64 data URL (slower but reliable)
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";

interface UseAudioPlayerOptions {
  beatPath: string | null;
  onError?: (error: string) => void;
}

interface UseAudioPlayerReturn {
  // State
  isPlaying: boolean;
  isLoading: boolean;
  isLooped: boolean;
  isMuted: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  audioPath: string | null;
  coverUrl: string | null;
  error: string | null;

  // Controls
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  toggleLoop: () => void;
  toggleMute: () => void;
  seek: (time: number) => void;
  seekPercent: (percent: number) => void;
  setVolume: (volume: number) => void;

  // Computed
  progress: number;
  currentTimeFormatted: string;
  durationFormatted: string;
}

// ─── Time Formatting ─────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Hook Implementation
// ═══════════════════════════════════════════════════════════════════════════════

export function useAudioPlayer({ beatPath, onError }: UseAudioPlayerOptions): UseAudioPlayerReturn {
  // ─── Refs ──────────────────────────────────────────────────────────────────
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevBeatPathRef = useRef<string | null>(null);
  const loadingAbortRef = useRef<boolean>(false);

  // ─── State ─────────────────────────────────────────────────────────────────
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLooped, setIsLooped] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.7);
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [audioDataUrl, setAudioDataUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ─── Load Cover & Audio ────────────────────────────────────────────────────
  useEffect(() => {
    if (!beatPath) {
      // Reset when no beat
      setAudioPath(null);
      setAudioDataUrl(null);
      setCoverUrl(null);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setError(null);
      return;
    }

    // Only reload if beat changed
    if (beatPath === prevBeatPathRef.current) return;
    prevBeatPathRef.current = beatPath;
    loadingAbortRef.current = false;

    // Stop current playback immediately
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      setIsPlaying(false);
    }

    // Reset states
    setError(null);
    setAudioDataUrl(null);
    setCoverUrl(null);
    setCurrentTime(0);
    setDuration(0);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: Load Cover FIRST (fast - uses asset protocol)
    // ═══════════════════════════════════════════════════════════════════════
    invoke<string | null>("get_beat_cover_path", { beatPath })
      .then((path) => {
        if (loadingAbortRef.current) return;
        if (path) {
          // Use Tauri's asset protocol - much faster than base64
          const assetUrl = convertFileSrc(path);
          setCoverUrl(assetUrl);
        }
      })
      .catch(e => {
        console.error("Failed to get cover path:", e);
      });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: Load Audio in background (slower - uses base64)
    // ═══════════════════════════════════════════════════════════════════════
    setIsLoading(true);

    invoke<string | null>("get_beat_audio_path", { beatPath })
      .then(async (path) => {
        if (loadingAbortRef.current) return;
        
        if (!path) {
          setError("No audio file found");
          setIsLoading(false);
          return;
        }
        
        setAudioPath(path);
        
        try {
          const dataUrl = await invoke<string>("read_audio_file", { filePath: path });
          if (loadingAbortRef.current) return;
          setAudioDataUrl(dataUrl);
        } catch (e) {
          if (loadingAbortRef.current) return;
          console.error("Failed to read audio file:", e);
          setError(`Failed to load audio`);
          onError?.(String(e));
        }
      })
      .catch(e => {
        if (loadingAbortRef.current) return;
        console.error("Failed to get audio path:", e);
        setError("Failed to find audio");
        onError?.(String(e));
      })
      .finally(() => {
        if (!loadingAbortRef.current) {
          setIsLoading(false);
        }
      });

    // Cleanup on unmount or beat change
    return () => {
      loadingAbortRef.current = true;
    };
  }, [beatPath, onError]);

  // ─── Audio Element Setup ───────────────────────────────────────────────────
  useEffect(() => {
    if (!audioDataUrl) {
      return;
    }

    // Create or reuse audio element
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }

    const audio = audioRef.current;
    audio.src = audioDataUrl;
    audio.volume = volume;
    audio.loop = isLooped;
    audio.muted = isMuted;

    // Event handlers
    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      setError(null);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      if (!isLooped) {
        setIsPlaying(false);
        setCurrentTime(0);
      }
    };

    const handleError = () => {
      setError("Failed to play audio");
      setIsPlaying(false);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);

    audio.load();

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
    };
  }, [audioDataUrl]);

  // ─── Sync volume/loop/mute ─────────────────────────────────────────────────
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.loop = isLooped;
  }, [isLooped]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = isMuted;
  }, [isMuted]);

  // ─── Controls ──────────────────────────────────────────────────────────────
  const play = useCallback(() => {
    if (audioRef.current && audioDataUrl) {
      audioRef.current.play().catch(e => {
        console.error("Play failed:", e);
        setError("Failed to play");
      });
    }
  }, [audioDataUrl]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const togglePlay = useCallback(() => {
    isPlaying ? pause() : play();
  }, [isPlaying, play, pause]);

  const toggleLoop = useCallback(() => {
    setIsLooped(prev => !prev);
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => !prev);
  }, []);

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, Math.min(time, duration));
    }
  }, [duration]);

  const seekPercent = useCallback((percent: number) => {
    if (audioRef.current && duration > 0) {
      audioRef.current.currentTime = (percent / 100) * duration;
    }
  }, [duration]);

  const setVolume = useCallback((vol: number) => {
    setVolumeState(Math.max(0, Math.min(1, vol)));
  }, []);

  // ─── Computed ──────────────────────────────────────────────────────────────
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return {
    isPlaying,
    isLoading,
    isLooped,
    isMuted,
    currentTime,
    duration,
    volume,
    audioPath,
    coverUrl,
    error,
    play,
    pause,
    togglePlay,
    toggleLoop,
    toggleMute,
    seek,
    seekPercent,
    setVolume,
    progress,
    currentTimeFormatted: formatTime(currentTime),
    durationFormatted: formatTime(duration),
  };
}