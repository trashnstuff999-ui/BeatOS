// src/pages/Video.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Video-Tab: das Video zum Beat, der gerade läuft — synchron zum Player unten.
//
// Der Ton bleibt der Taktgeber: Play, Pause und Springen gehen weiter über
// die Leiste und die Tasten, das Video folgt (lib/videoSync.ts). Beim Öffnen
// liegt das Cover über dem Bild. Steht das Video an der richtigen Stelle,
// bleibt es noch COVER_STEHT ms und blendet dann langsam aus — wie ein Vorspann.
//
// Kein Video im Ordner oder nicht abspielbar: Platzhalter mit Cover, der Ton
// läuft weiter. Entwurf: https://claude.ai/artifact/96eFduCc5HvHeGKVXrWWwY
// ═══════════════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Video as VideoIcon, VideoOff, Maximize, FolderOpen, Upload as UploadIcon } from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { PageHeader, PageBody, EmptyState, Button, PAGE_HEADER_HEIGHT } from "../components/ui";
import { PLAYER_HEIGHT } from "../components/GlobalAudioPlayer";
import { C, alpha, radius } from "../lib/theme";
import { useAudioPlayerContext } from "../contexts/AudioPlayerContext";
import { useVideo } from "../contexts/VideoContext";
import { abgleich, VORLAUF } from "../lib/videoSync";
import { isStudioBeatId } from "../types/studio";

/** So breit wie möglich, aber nie höher als der Platz zwischen Kopfzeile und
 *  Player-Leiste — abzüglich Innenabstand (64) und Zeile darunter (~80). */
const BUEHNE_BREITE = `min(100%, calc((100vh - ${PAGE_HEADER_HEIGHT + PLAYER_HEIGHT + 64 + 80}px) * 16 / 9))`;

/** So lange bleibt das Cover stehen, bevor es ins Video ausblendet. */
const COVER_STEHT = 1500;

export default function Video() {
  const navigate = useNavigate();
  const { currentBeat, coverUrl, isPlaying, getCurrentSeconds, getDurationSeconds } = useAudioPlayerContext();
  const { video, pfad, fehler } = useVideo();
  const buehneRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  /** Für welches Video das Cover schon ausgeblendet ist — ein neues startet
   *  so schon im ersten Bild mit Cover, nicht erst nach dem Effekt. */
  const [frei, setFrei] = useState<string | null>(null);
  const laeuftRef = useRef(isPlaying);
  laeuftRef.current = isPlaying;

  const zeigeVideo = !!pfad && !fehler;
  const bildDa = !!pfad && frei === pfad;

  // Video in die Bühne hängen und dem Ton folgen lassen — nur solange der Tab
  // offen ist; ausgehängt hält es an und kostet nichts.
  useEffect(() => {
    const slot = slotRef.current;
    if (!zeigeVideo || !slot) return;
    slot.appendChild(video);
    const fuer = pfad!;
    let da = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let raf = 0;
    // Wie lange ein Sprung wirklich dauert — so weit voraus wird gesprungen.
    let vorlauf = VORLAUF;
    let sprungSeit = 0;
    const gesprungen = () => {
      if (!sprungSeit) return;
      vorlauf = Math.min(1.5, Math.max(VORLAUF, (performance.now() - sprungSeit) / 1000 + 0.03));
      sprungSeit = 0;
    };
    video.addEventListener("seeked", gesprungen);
    const schritt = () => {
      raf = requestAnimationFrame(schritt);
      // Ohne Metadaten keine Länge; während eines Sprungs nicht nachsteuern.
      if (!video.duration || video.seeking) return;
      // Das Cover zählt ab dem ersten Bild — nicht erst, wenn alles sitzt.
      if (!da && video.readyState >= 2) { da = true; timer = setTimeout(() => setFrei(fuer), COVER_STEHT); }
      const k = abgleich(video.currentTime, getCurrentSeconds(), video.duration, laeuftRef.current, vorlauf);
      if (k.ziel !== null) {
        sprungSeit = performance.now();
        video.currentTime = k.ziel;
        // Schon losspielen: nach dem Sprung läuft es sofort weiter, statt zu warten.
        if (k.laufen && video.paused) video.play().catch(() => {});
        return;
      }
      if (video.playbackRate !== k.rate) video.playbackRate = k.rate;
      if (k.laufen && video.paused) video.play().catch(() => {});
      if (!k.laufen && !video.paused) video.pause();
    };
    raf = requestAnimationFrame(schritt);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      video.removeEventListener("seeked", gesprungen);
      video.pause();
      video.playbackRate = 1;
      video.remove();
    };
  }, [zeigeVideo, pfad, video, getCurrentSeconds]);

  const vollbild = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else buehneRef.current?.requestFullscreen().catch(() => {});
  };

  const laenge = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const audioLaenge = getDurationSeconds();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.background }}>
      <PageHeader icon={VideoIcon} title="Video" />
      <PageBody width="full">
        {!currentBeat ? (
          <EmptyState icon={VideoIcon} title="Gerade läuft nichts" description="Spiel einen Beat ab — hier erscheint dann sein Video, synchron zum Ton." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18, alignItems: "center" }}>
            {/* ── Bühne 16:9 ── */}
            <div
              ref={buehneRef}
              className="video-buehne"
              onDoubleClick={zeigeVideo ? vollbild : undefined}
              style={{
                position: "relative", width: BUEHNE_BREITE, aspectRatio: "16 / 9",
                borderRadius: 14, overflow: "hidden", boxSizing: "border-box",
                background: zeigeVideo ? "#000" : C.surfaceContainerLow,
                border: zeigeVideo ? "none" : `1.5px dashed ${C.outlineVariant}`,
                boxShadow: zeigeVideo ? "0 30px 80px rgba(0,0,0,0.6)" : "none",
              }}
            >
              {zeigeVideo ? (
                <>
                  <div ref={slotRef} style={{ position: "absolute", inset: 0 }} />
                  {/* Cover darüber, bis das Bild an der richtigen Stelle steht */}
                  {/* Als Hintergrund statt <img>: oben und unten bündig, links und rechts
                      schwarz wie im Video. Sofort da, nur das Ausblenden ist weich. */}
                  <div aria-hidden style={{
                    position: "absolute", inset: 0, pointerEvents: "none",
                    background: coverUrl ? `#000 url(${JSON.stringify(coverUrl)}) center / contain no-repeat` : "#000",
                    opacity: bildDa ? 0 : 1, transition: bildDa ? "opacity 1.2s ease" : "none",
                  }} />
                  <div className="video-overlay" style={{ position: "absolute", left: 16, right: 16, top: 16, display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 12px",
                      borderRadius: radius.full, background: alpha(C.background, 0.72),
                      fontSize: 12, fontWeight: 600, color: C.mint,
                    }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.mint }} />
                      Synchron mit dem Player
                    </span>
                    <span style={{ flex: 1 }} />
                    <button type="button" onClick={vollbild} aria-label="Vollbild" title="Vollbild (Doppelklick)" style={{
                      width: 40, height: 40, borderRadius: 10, border: 0, cursor: "pointer",
                      background: alpha(C.background, 0.72), color: C.onSurface,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Maximize size={18} />
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 36, padding: 32 }}>
                  {coverUrl
                    ? <img src={coverUrl} alt={`Cover ${currentBeat.name}`} style={{ width: "min(260px, 40%)", aspectRatio: "1", objectFit: "cover", borderRadius: 12, boxShadow: "0 24px 60px rgba(0,0,0,0.55)" }} />
                    : <div style={{ width: "min(260px, 40%)", aspectRatio: "1", borderRadius: 12, background: C.surfaceContainerHighest }} />}
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 360, minWidth: 0 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.onSecondaryFixedVar }}>
                      <VideoOff size={16} /> {pfad === undefined ? "Suche Video …" : "Kein Video"}
                    </span>
                    <span style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.1, color: C.onSurface, overflowWrap: "anywhere" }}>{currentBeat.name}</span>
                    {pfad !== undefined && (
                      <span style={{ fontSize: 14, lineHeight: 1.5, color: C.onSurfaceVariant }}>
                        {fehler
                          ? "Die MP4 lässt sich nicht abspielen — vermutlich H.265. Als H.264 exportiert läuft sie hier. Der Ton läuft unten weiter."
                          : "Im Beat-Ordner liegt keine MP4. Der Ton läuft unten weiter — sobald eine da ist, erscheint sie hier."}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── Zeile darunter ── */}
            <div style={{ width: BUEHNE_BREITE, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: C.onSurface }}>{currentBeat.name}</span>
                <span style={{ fontSize: 13, color: C.onSecondaryFixedVar }}>
                  {[
                    isStudioBeatId(currentBeat.id) ? null : `#${currentBeat.id}`,
                    currentBeat.bpm ? `${currentBeat.bpm} BPM` : null,
                    zeigeVideo && video.duration ? `Video ${laenge(video.duration)}` : null,
                    audioLaenge ? `Audio ${laenge(audioLaenge)}` : null,
                  ].filter(Boolean).join(" · ")}
                </span>
              </div>
              <span style={{ flex: 1 }} />
              {currentBeat.path && (
                <Button variant="secondary" icon={FolderOpen} onClick={() => openPath(currentBeat.path!)}>Ordner öffnen</Button>
              )}
              {!isStudioBeatId(currentBeat.id) && (
                <Button variant="secondary" icon={UploadIcon} onClick={() => navigate("/upload", { state: { beatId: currentBeat.id } })}>Zum Upload</Button>
              )}
            </div>
          </div>
        )}
      </PageBody>
    </div>
  );
}
