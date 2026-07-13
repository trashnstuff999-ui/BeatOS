// src/components/upload/UploadBeatHeader.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// The anchor of the Upload tab: cover, big title, key/bpm pills and the
// 4-step ready progress (Infos · Assets · Files · Geplant).
// Display-only — all data comes from UploadData; the cover is resolved via
// the existing get_beat_cover_path command (same pattern as the audio player).
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";
import { Music, Check } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { C } from "../../lib/theme";
import { api } from "../../lib/api";
import { computeReadySteps } from "../../lib/uploadReady";
import type { UploadData } from "../../types/upload";

interface UploadBeatHeaderProps {
  data: UploadData;
}

export function UploadBeatHeader({ data }: UploadBeatHeaderProps) {
  const { beat } = data;
  const steps = computeReadySteps(data);
  const doneCount = steps.filter(s => s.done).length;

  // Cover via asset protocol — stale-guard like AudioPlayerContext
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const currentPathRef = useRef<string | null>(null);
  useEffect(() => {
    const path = beat.path;
    currentPathRef.current = path;
    setCoverUrl(null);
    if (!path) return;
    (async () => {
      try {
        const p = await api.audio.getCoverPath(path);
        if (currentPathRef.current !== path) return;
        if (p) setCoverUrl(convertFileSrc(p.replace(/\\/g, "/")));
      } catch { /* cover is optional */ }
    })();
  }, [beat.path]);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 20,
      background: C.surfaceContainerLow,
      border: `1px solid ${C.border10}`,
      borderRadius: 12,
      padding: "16px 20px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
    }}>
      {/* Cover */}
      <div style={{
        width: 56, height: 56, borderRadius: 8, flexShrink: 0,
        background: C.surfaceContainerHigh,
        border: `1px solid ${C.border15}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden",
      }}>
        {coverUrl
          ? <img src={coverUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <Music size={22} color={C.onSecondaryFixedVar} strokeWidth={1.5} />
        }
      </div>

      {/* Title + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 20, fontWeight: 700, color: C.onSurface,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          lineHeight: 1.25,
        }}>
          {beat.name}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
          <MetaPill mono>#{beat.id}</MetaPill>
          {beat.key && <MetaPill>{beat.key}</MetaPill>}
          {beat.bpm != null && <MetaPill>{beat.bpm} BPM</MetaPill>}
        </div>
      </div>

      {/* Ready progress */}
      <div style={{ display: "flex", alignItems: "center", gap: 18, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 14 }}>
          {steps.map(step => (
            <div
              key={step.key}
              title={step.detail}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                cursor: "default",
              }}
            >
              <span style={{
                width: 18, height: 18, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: step.done ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${step.done ? "rgba(52,211,153,0.45)" : C.border20}`,
              }}>
                {step.done && <Check size={10} color={C.mint} strokeWidth={3} />}
              </span>
              <span style={{
                fontSize: 9, fontWeight: 600, letterSpacing: "0.04em",
                color: step.done ? C.onSurfaceVariant : C.onSecondaryFixedVar,
              }}>
                {step.label}
              </span>
            </div>
          ))}
        </div>
        <div style={{
          fontSize: 16, fontWeight: 700,
          color: doneCount === steps.length ? C.mint : C.onSurfaceVariant,
          fontVariantNumeric: "tabular-nums",
        }}>
          {doneCount}/{steps.length}
        </div>
      </div>
    </div>
  );
}

function MetaPill({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <span style={{
      padding: "2px 9px",
      borderRadius: 9999,
      fontSize: 10, fontWeight: 600,
      fontFamily: mono ? "monospace" : undefined,
      background: "rgba(255,255,255,0.04)",
      border: `1px solid ${C.border15}`,
      color: C.onSurfaceVariant,
    }}>
      {children}
    </span>
  );
}
