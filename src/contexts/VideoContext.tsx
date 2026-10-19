// src/contexts/VideoContext.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Das Video zum laufenden Beat — geladen, sobald der Beat startet, nicht erst
// im Video-Tab. Es gibt genau ein <video>-Element für die ganze App; der Tab
// hängt es beim Öffnen in seine Bühne und beim Verlassen wieder aus. So ist
// es beim Wechsel schon gepuffert und muss nur noch an die Stelle springen.
// ═══════════════════════════════════════════════════════════════════════════════

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { api } from "../lib/api";
import { useAudioPlayerContext } from "./AudioPlayerContext";

interface VideoContextValue {
  video: HTMLVideoElement;
  /** Pfad der MP4; null = keine da; undefined = wird gesucht. */
  pfad: string | null | undefined;
  /** Datei da, aber nicht abspielbar (z. B. HEVC). */
  fehler: boolean;
}

const VideoContext = createContext<VideoContextValue | null>(null);

export function VideoProvider({ children }: { children: ReactNode }) {
  const { currentBeat } = useAudioPlayerContext();
  const [video] = useState(() => {
    const v = document.createElement("video");
    v.muted = true;            // der Ton kommt aus dem Player
    v.playsInline = true;
    v.preload = "auto";
    v.style.cssText = "width:100%;height:100%;object-fit:contain;display:block;background:#000";
    return v;
  });
  const [pfad, setPfad] = useState<string | null | undefined>(null);
  const [fehler, setFehler] = useState(false);

  useEffect(() => {
    const onError = () => { if (video.getAttribute("src")) setFehler(true); };
    video.addEventListener("error", onError);
    return () => video.removeEventListener("error", onError);
  }, [video]);

  useEffect(() => {
    const beatPath = currentBeat?.path ?? null;
    let weg = false;
    setFehler(false);
    video.pause();
    video.removeAttribute("src");
    video.load();
    if (!beatPath) { setPfad(null); return; }
    setPfad(undefined);
    api.audio.getVideoPath(beatPath)
      .then(p => {
        if (weg) return;
        setPfad(p);
        if (p) { video.src = convertFileSrc(p.replace(/\\/g, "/")); video.load(); }
      })
      .catch(() => { if (!weg) setPfad(null); });
    return () => { weg = true; };
  }, [currentBeat?.path, video]);

  return <VideoContext.Provider value={{ video, pfad, fehler }}>{children}</VideoContext.Provider>;
}

export function useVideo() {
  const ctx = useContext(VideoContext);
  if (!ctx) throw new Error("useVideo braucht den VideoProvider");
  return ctx;
}
