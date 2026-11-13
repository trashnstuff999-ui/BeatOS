// src/components/studio/StudioBuehne.tsx
// Die Bühne über den Regalen: das Projekt, das zuletzt aus BeatOS in FL
// geöffnet wurde, sonst das zuletzt geänderte. Rechts die Zahlen der Regale,
// ein Klick springt hin.

import { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Pause, Play } from "lucide-react";
import { C, type StudioVerlauf } from "../../lib/theme";
import { formatRelativeTime } from "../../lib/time";
import { SCHRITTE, ideeName } from "../../lib/werkbank";
import { projectDisplayName } from "../../types/studio";
import type { StudioProject } from "../../types/studio";
import { CoverPlatzhalter } from "./CoverPlatzhalter";

export interface BuehnenZahl { key: string; label: string; anzahl: number; farbe: string }

export function StudioBuehne({ project: p, verlauf, inFl, spielt, zahlen, onPreview, onOpenDaw, onDetails, onSpring }: {
  project: StudioProject;
  verlauf: StudioVerlauf;
  /** true: zuletzt aus BeatOS in FL geöffnet; false: nur zuletzt geändert */
  inFl: boolean;
  spielt: boolean;
  zahlen: BuehnenZahl[];
  onPreview: () => void;
  onOpenDaw: () => void;
  onDetails: () => void;
  onSpring: (key: string) => void;
}) {
  const [bildKaputt, setBildKaputt] = useState(false);
  const c = verlauf.glow;
  const bild = p.cover_path && !bildKaputt ? convertFileSrc(p.cover_path.replace(/\\/g, "/")) : null;
  const { nummer } = ideeName(p);
  const canPreview = p.has_mp3 || p.has_wav;
  const knopf: React.CSSProperties = {
    height: 44, display: "inline-flex", alignItems: "center", gap: 8, padding: "0 16px", borderRadius: 12,
    border: `1px solid ${C.border30}`, background: C.surfaceContainer, color: C.onSurface,
    fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
  };

  return (
    <section aria-label="Zuletzt geöffnet" style={{
      "--c": c,
      margin: "8px 16px 44px", padding: 34, borderRadius: 24,
      display: "flex", gap: 34, alignItems: "center", flexWrap: "wrap",
      background: `color-mix(in srgb, ${c} 7%, ${C.surfaceContainerLow})`,
      border: `1px solid color-mix(in srgb, ${c} 35%, transparent)`,
      boxShadow: `0 14px 38px -14px color-mix(in srgb, ${c} 35%, transparent), inset 0 1px 0 rgba(255, 255, 255, 0.04)`,
    } as React.CSSProperties}>
      <button onClick={onDetails} title="Details" className="sw-bcov" style={{
        width: 200, height: 200, flexShrink: 0, padding: 0, border: "none", borderRadius: 18, overflow: "hidden",
        background: "transparent", cursor: "pointer",
        boxShadow: `0 11px 24px -8px color-mix(in srgb, ${c} 51%, transparent), 0 0 0 1px rgba(255, 255, 255, 0.05)`,
      }}>
        {bild
          ? <img src={bild} alt="" onError={() => setBildKaputt(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          : <CoverPlatzhalter verlauf={verlauf} />}
      </button>

      <div style={{ flex: "1 1 340px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 700, letterSpacing: "0.24em", textTransform: "uppercase", color: c }}>
          {inFl && <span className="sw-fl" style={{ width: 9, height: 9, borderRadius: "50%", background: c, boxShadow: `0 0 10px color-mix(in srgb, ${c} 64%, transparent)` }} />}
          {inFl ? "In FL" : "Zuletzt geändert"} · {formatRelativeTime(p.modified_secs)}
        </div>
        <h2 style={{
          margin: "10px 0 12px", fontSize: "clamp(40px, 5.6vw, 88px)", fontWeight: 700, lineHeight: 0.95,
          letterSpacing: "-0.02em", overflowWrap: "anywhere", color: C.onSurface,
          textShadow: `0 0 19px color-mix(in srgb, ${c} 29%, transparent)`,
        }}>
          {projectDisplayName(p)}
        </h2>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 18, fontWeight: 700, color: C.onSurfaceVariant }}>
          {nummer && <span style={{ color: C.onSurface }}>{nummer}</span>}
          {p.key && <span>{p.key}</span>}
          {p.bpm != null && <span><span style={{ color: C.onSurface }}>{p.bpm}</span> BPM</span>}
        </div>
        <div className="sw-pipe" style={{ display: "flex", gap: 6, marginTop: 22, maxWidth: 520 }}>
          {SCHRITTE.map(([k, label]) => (
            <div key={label} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
              <i style={{
                display: "block", height: 10, borderRadius: 6,
                background: p[k] ? c : "rgba(255,255,255,0.1)", boxShadow: p[k] ? `0 0 13px color-mix(in srgb, ${c} 64%, transparent)` : "none",
              }} />
              <small style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: p[k] ? C.onSurface : C.onSecondaryFixedVar }}>
                {label}
              </small>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 24, flexWrap: "wrap" }}>
          {canPreview && (
            <button onClick={onPreview} className="sw-bk sw-bk-haupt" style={{
              ...knopf, background: c, borderColor: c, color: "#111", boxShadow: `0 8px 24px -8px color-mix(in srgb, ${c} 64%, transparent)`,
            }}>
              {spielt ? <Pause size={16} fill="#111" strokeWidth={1.5} /> : <Play size={16} fill="#111" strokeWidth={1.5} />}
              {spielt ? "Pause" : "Anhören"}
            </button>
          )}
          <button onClick={onOpenDaw} disabled={!p.newest_flp} className="sw-bk" style={knopf}>In FL öffnen</button>
          <button onClick={onDetails} className="sw-bk" style={knopf}>Details</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(110px, 1fr))", gap: 10, flex: "0 1 280px" }}>
        {zahlen.map((z, i) => (
          <button key={z.key} onClick={() => onSpring(z.key)} className="sw-zk" style={{
            "--c": z.farbe,
            gridColumn: i === zahlen.length - 1 && zahlen.length % 2 === 1 ? "span 2" : undefined,
            border: `1px solid ${C.border30}`, background: "rgba(14,14,14,0.55)", borderRadius: 16,
            padding: "14px 16px", textAlign: "left", cursor: "pointer", fontFamily: "inherit",
          } as React.CSSProperties}>
            <b style={{ display: "block", fontSize: 34, lineHeight: 1, color: z.farbe, textShadow: `0 0 16px color-mix(in srgb, ${z.farbe} 32%, transparent)` }}>
              {z.anzahl}
            </b>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.onSurfaceVariant }}>{z.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
