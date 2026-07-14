// src/components/studio/ProjectInspector.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Right-side detail panel for one Studio project: notes (debounced save via
// the existing update_studio_project), FLP version list (each openable in
// the DAW), asset pipeline and quick actions. Opened via the Info icon —
// row click stays reserved for the asset-assignment target.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";
import {
  X, Star, StickyNote, Disc3, FolderOpen, Archive, Check, Loader2, FileMusic,
} from "lucide-react";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { C, STUDIO_STATUS_CONFIG } from "../../lib/theme";
import { formatRelativeTime } from "../../lib/time";
import { useAudioPlayerContext } from "../../contexts/AudioPlayerContext";
import { AssetPipeline } from "./ProjectRow";
import type { StudioProject, StudioStatus } from "../../types/studio";

const STATUS_ORDER: StudioStatus[] = ["idea", "wip", "exported", "ready"];

interface ProjectInspectorProps {
  project: StudioProject;
  onPatch: (patch: Partial<Pick<StudioProject, "status" | "priority" | "notes">>) => void;
  onArchive: () => void;
  onClose: () => void;
}

export function ProjectInspector({ project: p, onPatch, onArchive, onClose }: ProjectInspectorProps) {
  const { currentBeat } = useAudioPlayerContext();
  const playerVisible = !!currentBeat;

  // ── Notes: local draft, 600ms debounced save ───────────────────────────────
  const [notes, setNotes] = useState(p.notes ?? "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const lastSavedRef = useRef(p.notes ?? "");

  useEffect(() => {
    setNotes(p.notes ?? "");
    lastSavedRef.current = p.notes ?? "";
    setSaveState("idle");
  }, [p.path]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (notes === lastSavedRef.current) return;
    const handle = setTimeout(() => {
      setSaveState("saving");
      onPatch({ notes: notes.trim() || null });
      lastSavedRef.current = notes;
      setSaveState("saved");
      setTimeout(() => setSaveState(s => (s === "saved" ? "idle" : s)), 1500);
    }, 600);
    return () => clearTimeout(handle);
  }, [notes]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Close on Escape ────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <aside style={{
      position: "fixed",
      top: 64, right: 0,
      bottom: playerVisible ? 80 : 0,
      width: 340,
      background: C.surfaceContainerLow,
      borderLeft: `1px solid ${C.border15}`,
      boxShadow: "-12px 0 40px rgba(0,0,0,0.35)",
      zIndex: 40,
      display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        padding: "16px 18px 12px",
        borderBottom: `1px solid ${C.border10}`,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, lineHeight: 1.3, wordBreak: "break-word" }}>
            {p.parsed_name || p.name}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            {p.key && <MetaPill>{p.key}</MetaPill>}
            {p.bpm != null && <MetaPill>{p.bpm} BPM</MetaPill>}
            <MetaPill>{formatRelativeTime(p.modified_secs)}</MetaPill>
          </div>
        </div>
        <button
          onClick={() => onPatch({ priority: p.priority ? 0 : 1 })}
          title={p.priority ? "Priorität entfernen" : "Als Priorität markieren"}
          style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 2 }}
        >
          <Star size={16} color={p.priority ? C.primary : C.onSecondaryFixedVar} fill={p.priority ? C.primary : "none"} strokeWidth={1.75} />
        </button>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", color: C.onSurfaceVariant, display: "flex", padding: 2 }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Status */}
        <section>
          <SectionLabel>Status</SectionLabel>
          <div style={{
            display: "flex", gap: 2,
            background: "rgba(255,255,255,0.03)",
            border: `1px solid ${C.border15}`,
            borderRadius: 7, padding: 2,
          }}>
            {STATUS_ORDER.map(s => {
              const active = p.status === s;
              const m = STUDIO_STATUS_CONFIG[s];
              return (
                <button
                  key={s}
                  onClick={() => onPatch({ status: s })}
                  style={{
                    flex: 1,
                    padding: "5px 4px",
                    background: active ? m.bg : "transparent",
                    border: "none", borderRadius: 5,
                    cursor: "pointer",
                    fontSize: 9, fontWeight: 700,
                    color: active ? m.color : C.onSecondaryFixedVar,
                    letterSpacing: "0.03em", textTransform: "uppercase",
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Notes */}
        <section>
          <SectionLabel
            right={
              saveState === "saving" ? <Loader2 size={10} style={{ animation: "spin 0.8s linear infinite" }} />
              : saveState === "saved" ? <span style={{ display: "flex", alignItems: "center", gap: 4, color: C.mint }}><Check size={10} strokeWidth={3} /> Gespeichert</span>
              : null
            }
          >
            <StickyNote size={10} strokeWidth={2} style={{ marginRight: 4 }} />
            Notizen
          </SectionLabel>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder={'z.B. "Hook neu einspielen", "für Artist X gedacht" …'}
            rows={4}
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 12, lineHeight: 1.55,
              background: C.surfaceContainerLowest,
              border: `1px solid ${C.border15}`,
              borderRadius: 8,
              outline: "none",
              color: C.onSurface,
              resize: "vertical",
              minHeight: 80,
              boxSizing: "border-box",
            }}
          />
        </section>

        {/* FLP versions */}
        <section>
          <SectionLabel>FLP-Versionen ({p.flps.length})</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {p.flps.map((flp, i) => (
              <div key={flp.path} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 10px",
                background: C.surfaceContainerLowest,
                border: `1px solid ${C.border10}`,
                borderRadius: 7,
              }}>
                <FileMusic size={12} color={i === 0 ? C.primary : C.onSecondaryFixedVar} strokeWidth={1.75} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 11, fontFamily: "monospace", color: C.onSurface,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {flp.name}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, color: C.onSecondaryFixedVar, marginTop: 2 }}>
                    <span title={flp.modified_date ?? undefined}>{formatRelativeTime(flp.modified_secs)}</span>
                    {i === 0 && (
                      <span style={{
                        padding: "0px 6px", borderRadius: 9999,
                        background: `${C.primary}18`, color: C.primary,
                        fontWeight: 700, letterSpacing: "0.06em",
                      }}>
                        NEUESTE
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => openPath(flp.path).catch(e => alert(`FLP konnte nicht geöffnet werden: ${String(e)}`))}
                  title="Diese Version in FL Studio öffnen"
                  style={{
                    width: 24, height: 24, borderRadius: 5, flexShrink: 0,
                    background: "transparent", border: `1px solid ${C.border15}`,
                    cursor: "pointer", color: C.onSurfaceVariant,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Disc3 size={11} strokeWidth={1.75} />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Assets */}
        <section>
          <SectionLabel>Assets</SectionLabel>
          <div style={{
            padding: "12px 14px",
            background: C.surfaceContainerLowest,
            border: `1px solid ${C.border10}`,
            borderRadius: 8,
            display: "flex", justifyContent: "center",
          }}>
            <AssetPipeline project={p} large />
          </div>
        </section>
      </div>

      {/* Footer actions */}
      <div style={{
        flexShrink: 0,
        display: "flex", gap: 8,
        padding: "12px 18px",
        borderTop: `1px solid ${C.border10}`,
      }}>
        <button
          onClick={() => revealItemInDir(p.path).catch(() => {})}
          style={{
            flex: 1,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            padding: "9px 12px", borderRadius: 7,
            background: "transparent", border: `1px solid ${C.border20}`,
            color: C.onSurfaceVariant, cursor: "pointer",
            fontSize: 11, fontWeight: 600,
          }}
        >
          <FolderOpen size={12} strokeWidth={1.75} />
          Ordner
        </button>
        <button
          onClick={onArchive}
          style={{
            flex: 1,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            padding: "9px 12px", borderRadius: 7,
            background: C.primary, border: "none",
            color: C.onPrimary, cursor: "pointer",
            fontSize: 11, fontWeight: 700,
          }}
        >
          <Archive size={12} strokeWidth={2} />
          Archivieren
        </button>
      </div>
    </aside>
  );
}

function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center",
      fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
      textTransform: "uppercase", color: C.onSecondaryFixedVar,
      marginBottom: 8,
    }}>
      {children}
      <span style={{ marginLeft: "auto", fontSize: 9, fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>{right}</span>
    </div>
  );
}

function MetaPill({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 9999,
      fontSize: 9, fontWeight: 600,
      background: "rgba(255,255,255,0.04)",
      border: `1px solid ${C.border15}`,
      color: C.onSurfaceVariant,
    }}>
      {children}
    </span>
  );
}
