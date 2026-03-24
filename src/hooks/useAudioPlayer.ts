// src/hooks/useAudioPlayer.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Audio Player Hook - STREAMING via Tauri Asset Protocol
// 
// Strategy:
// - Audio: Stream via asset:// protocol (no Base64, no memory bloat)
// - Cover: Stream via asset:// protocol (fast)
// - Proper URL encoding for special characters in paths
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";

interface UseAudioPlayerProps {
  beatPath: string | null;
}

interface UseAudioPlayerReturn {
  isPlaying: boolean;
  isLoading: boolean;
  isLooped: boolean;
  isMuted: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  coverUrl: string | null;
  error: string | null;
  togglePlay: () => void;
  toggleLoop: () => void;
  toggleMute: () => void;
  seekPercent: (percent: number) => void;
  setVolume: (volume: number) => void;
  progress: number;
  currentTimeFormatted: string;
  durationFormatted: string;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Convert a file path to a properly encoded asset:// URL
 * Handles special characters like #, [], spaces, etc.
 */
function pathToAssetUrl(filePath: string): string {
  // Normalize path separators (Windows -> forward slashes)
  let normalized = filePath.replace(/\\/g, "/");
  
  // Use Tauri's convertFileSrc which handles the protocol
  // But we need to ensure the path is properly encoded
  const assetUrl = convertFileSrc(normalized);
  
  return assetUrl;
}

export function useAudioPlayer({ beatPath }: UseAudioPlayerProps): UseAudioPlayerReturn {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentBeatPathRef = useRef<string | null>(null);
  const abortedRef = useRef<boolean>(false);

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

  // ─── Beat Change Handler ───────────────────────────────────────────────────
  useEffect(() => {
    abortedRef.current = true;
    
    if (!beatPath) {
      currentBeatPathRef.current = null;
      setCoverUrl(null);
      setAudioUrl(null);
      setError(null);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setIsLoading(false);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      return;
    }

    if (beatPath === currentBeatPathRef.current) return;
    
    abortedRef.current = false;
    currentBeatPathRef.current = beatPath;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }

    setCoverUrl(null);
    setAudioUrl(null);
    setError(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    const currentPath = beatPath;

    // ═══════════════════════════════════════════════════════════════════════
    // LOAD COVER (via asset:// protocol - instant streaming)
    // ═══════════════════════════════════════════════════════════════════════
    (async () => {
      try {
        const coverPath = await invoke<string | null>("get_beat_cover_path", { beatPath: currentPath });
        if (abortedRef.current || currentBeatPathRef.current !== currentPath) return;
        
        if (coverPath) {
          const url = pathToAssetUrl(coverPath);
          setCoverUrl(url);
        }
      } catch (e) {
        console.error("Cover load error:", e);
      }
    })();

    // ═══════════════════════════════════════════════════════════════════════
    // LOAD AUDIO (via asset:// protocol - true streaming, no Base64!)
    // ═══════════════════════════════════════════════════════════════════════
    setIsLoading(true);

    (async () => {
      try {
        const audioPath = await invoke<string | null>("get_beat_audio_path", { beatPath: currentPath });
        if (abortedRef.current || currentBeatPathRef.current !== currentPath) return;

        if (!audioPath) {
          setError("No audio file found");
          setIsLoading(false);
          return;
        }

        const url = pathToAssetUrl(audioPath);
        setAudioUrl(url);
        // isLoading will be set to false when audio's loadedmetadata fires
      } catch (e) {
        if (abortedRef.current || currentBeatPathRef.current !== currentPath) return;
        console.error("Audio load error:", e);
        setError("Failed to load audio");
        setIsLoading(false);
      }
    })();

    return () => {
      abortedRef.current = true;
    };
  }, [beatPath]);

  // ─── Audio Element Setup ───────────────────────────────────────────────────
  useEffect(() => {
    if (!audioUrl) return;

    if (!audioRef.current) {
      audioRef.current = new Audio();
    }

    const audio = audioRef.current;
    audio.src = audioUrl;
    audio.volume = volume;
    audio.loop = isLooped;
    audio.muted = isMuted;

    const onLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsLoading(false);
      setError(null);
    };
    
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    
    const onEnded = () => {
      if (!isLooped) {
        setIsPlaying(false);
        setCurrentTime(0);
      }
    };
    
    const onError = (e: Event) => {
      console.error("Audio playback error:", e);
      // Fallback to Base64 if asset protocol fails
      handleAssetProtocolFallback();
    };
    
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onCanPlay = () => setIsLoading(false);

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("canplay", onCanPlay);

    audio.load();

    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("canplay", onCanPlay);
    };
  }, [audioUrl]);

  // ─── Fallback to Base64 if Asset Protocol fails ────────────────────────────
  const handleAssetProtocolFallback = useCallback(async () => {
    if (!currentBeatPathRef.current) return;
    
    console.log("Asset protocol failed, falling back to Base64...");
    setIsLoading(true);
    
    try {
      const audioPath = await invoke<string | null>("get_beat_audio_path", { 
        beatPath: currentBeatPathRef.current 
      });
      
      if (!audioPath) {
        setError("No audio file found");
        setIsLoading(false);
        return;
      }
      
      // Use Base64 fallback
      const dataUrl = await invoke<string>("read_audio_file", { filePath: audioPath });
      
      if (audioRef.current) {
        audioRef.current.src = dataUrl;
        audioRef.current.load();
      }
    } catch (e) {
      console.error("Base64 fallback also failed:", e);
      setError("Failed to load audio");
      setIsLoading(false);
    }
  }, []);

  // Sync settings
  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume; }, [volume]);
  useEffect(() => { if (audioRef.current) audioRef.current.loop = isLooped; }, [isLooped]);
  useEffect(() => { if (audioRef.current) audioRef.current.muted = isMuted; }, [isMuted]);

  // ─── Controls ──────────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    if (!audioRef.current || (!audioUrl)) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch((e) => {
        console.error("Play failed:", e);
        setError("Play failed");
      });
    }
  }, [isPlaying, audioUrl]);

  const toggleLoop = useCallback(() => setIsLooped(prev => !prev), []);
  const toggleMute = useCallback(() => setIsMuted(prev => !prev), []);

  const seekPercent = useCallback((percent: number) => {
    if (audioRef.current && duration > 0) {
      audioRef.current.currentTime = (percent / 100) * duration;
    }
  }, [duration]);

  const setVolume = useCallback((vol: number) => {
    setVolumeState(Math.max(0, Math.min(1, vol)));
  }, []);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return {
    isPlaying,
    isLoading,
    isLooped,
    isMuted,
    currentTime,
    duration,
    volume,
    coverUrl,
    error,
    togglePlay,
    toggleLoop,
    toggleMute,
    seekPercent,
    setVolume,
    progress,
    currentTimeFormatted: formatTime(currentTime),
    durationFormatted: formatTime(duration),
  };
}