// src/components/upload/UploadAssistantDialog.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Guided 60-second upload flow for one platform:
//   1. open the platform's upload page
//   2. copy title  3. copy description  4. copy tags
//   5. paste the final URL → mark as uploaded (one updateUploadStatus call)
// Content comes from render_upload_descriptions once on open; the extractors
// in lib/descriptions.ts split it into the copy-ready pieces.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import {
  X, ExternalLink, Copy, Check, Loader2, Rocket, Link2,
  ShoppingBag, Music2, Youtube,
} from "lucide-react";
import { C, PLATFORM_CONFIG } from "../../lib/theme";
import { api } from "../../lib/api";
import { extractTitle, extractDescription, extractTags } from "../../lib/descriptions";
import type { UploadPlatform, UploadDescriptions } from "../../types/upload";

const PLATFORM_ICON: Record<UploadPlatform, React.ElementType> = {
  beatstars: ShoppingBag,
  soundcloud: Music2,
  youtube: Youtube,
};

const UPLOAD_URLS: Record<UploadPlatform, string> = {
  beatstars:  "https://studio.beatstars.com",
  soundcloud: "https://soundcloud.com/upload",
  youtube:    "https://studio.youtube.com",
};

interface UploadAssistantDialogProps {
  beatId: string;
  platform: UploadPlatform;
  onClose: () => void;
  /** persists status=uploaded (+ url, uploaded_at=heute) via UploadStatusCard */
  onMarkUploaded: (url: string | null) => void;
}

type CopyKey = "title" | "description" | "tags";

export function UploadAssistantDialog({ beatId, platform, onClose, onMarkUploaded }: UploadAssistantDialogProps) {
  const meta = PLATFORM_CONFIG[platform];
  const PlatIcon = PLATFORM_ICON[platform];

  const [drafts, setDrafts] = useState<UploadDescriptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [copied, setCopied] = useState<Record<CopyKey, boolean>>({ title: false, description: false, tags: false });
  const [url, setUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    api.upload.renderDescriptions(beatId)
      .then(d => { if (!cancelled) setDrafts(d); })
      .catch(e => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, [beatId]);

  const content = drafts?.[platform] ?? "";
  const pieces: Record<CopyKey, string> = {
    title: extractTitle(content),
    description: extractDescription(content),
    tags: extractTags(content),
  };

  const handleCopy = async (key: CopyKey) => {
    try {
      await navigator.clipboard.writeText(pieces[key]);
      setCopied(prev => ({ ...prev, [key]: true }));
    } catch (e) {
      setError(`Clipboard fehlgeschlagen: ${String(e)}`);
    }
  };

  const handleOpenPlatform = () => {
    window.open(UPLOAD_URLS[platform], "_blank");
    setOpened(true);
  };

  const handleFinish = () => {
    onMarkUploaded(url.trim() || null);
    onClose();
  };

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 100,
    }}>
      <div style={{
        background: C.surfaceContainerHigh,
        borderRadius: 16, padding: 24,
        width: 480, maxWidth: "92vw",
        maxHeight: "88vh", overflowY: "auto",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        border: `1px solid ${C.border20}`,
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <Rocket size={16} color={meta.color} strokeWidth={2} />
          <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: C.onSurface }}>
            {meta.label}-Upload
          </span>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: C.onSurfaceVariant, display: "flex" }}
          >
            <X size={16} />
          </button>
        </div>

        {error && (
          <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 6, background: "rgba(229,72,77,0.10)", border: "1px solid rgba(229,72,77,0.35)", fontSize: 11, color: "#e5484d" }}>
            {error}
          </div>
        )}

        {!drafts && !error && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 20, justifyContent: "center", fontSize: 12, color: C.onSurfaceVariant }}>
            <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> Rendere Inhalte…
          </div>
        )}

        {drafts && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Step 1: open platform */}
            <StepRow
              index={1}
              done={opened}
              label={`${meta.label} öffnen`}
              detail={UPLOAD_URLS[platform].replace("https://", "")}
              action={
                <StepBtn onClick={handleOpenPlatform} done={opened} icon={ExternalLink} label={opened ? "Geöffnet" : "Öffnen"} />
              }
              icon={<PlatIcon size={13} color={meta.color} strokeWidth={2} />}
            />

            {/* Steps 2-4: copy pieces */}
            {([
              [2, "title", "Titel kopieren"],
              [3, "description", "Beschreibung kopieren"],
              [4, "tags", "Tags kopieren"],
            ] as Array<[number, CopyKey, string]>).map(([idx, key, label]) => (
              <StepRow
                key={key}
                index={idx}
                done={copied[key]}
                label={label}
                detail={pieces[key]
                  ? (key === "title" ? pieces[key] : `${pieces[key].split(/\r?\n/).filter(Boolean).length ? pieces[key].slice(0, 90) : ""}${pieces[key].length > 90 ? "…" : ""}`)
                  : "— nicht vorhanden —"}
                action={
                  <StepBtn
                    onClick={() => handleCopy(key)}
                    done={copied[key]}
                    icon={Copy}
                    label={copied[key] ? "Kopiert" : "Kopieren"}
                    disabled={!pieces[key]}
                  />
                }
              />
            ))}

            {/* Step 5: URL + finish */}
            <div style={{
              marginTop: 6,
              padding: "12px 14px",
              background: C.surfaceContainer,
              border: `1px solid ${C.border15}`,
              borderRadius: 10,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <StepIndex index={5} done={false} />
                <span style={{ fontSize: 12, fontWeight: 600, color: C.onSurface }}>
                  Fertig? URL einfügen & abschließen
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Link2 size={13} color={C.onSecondaryFixedVar} style={{ flexShrink: 0 }} />
                <input
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder={`https://…${platform}… (optional)`}
                  style={{
                    flex: 1,
                    padding: "7px 10px",
                    fontSize: 11, fontFamily: "monospace",
                    background: C.surfaceContainerLowest,
                    border: `1px solid ${C.border20}`,
                    borderRadius: 6,
                    outline: "none",
                    color: C.onSurface,
                  }}
                />
              </div>
              <button
                onClick={handleFinish}
                style={{
                  marginTop: 10,
                  width: "100%",
                  padding: "10px 16px",
                  borderRadius: 8,
                  fontSize: 12, fontWeight: 700,
                  background: C.mint,
                  border: "none",
                  color: "#064e3b",
                  cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                <Check size={14} strokeWidth={2.5} />
                Als hochgeladen markieren
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Step building blocks ───────────────────────────────────────────────────

function StepIndex({ index, done }: { index: number; done: boolean }) {
  return (
    <span style={{
      width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: done ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.05)",
      border: `1px solid ${done ? "rgba(52,211,153,0.45)" : C.border20}`,
      fontSize: 10, fontWeight: 700,
      color: done ? C.mint : C.onSurfaceVariant,
    }}>
      {done ? <Check size={11} strokeWidth={3} /> : index}
    </span>
  );
}

function StepRow({ index, done, label, detail, action, icon }: {
  index: number;
  done: boolean;
  label: string;
  detail: string;
  action: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 14px",
      background: C.surfaceContainer,
      border: `1px solid ${done ? "rgba(52,211,153,0.25)" : C.border15}`,
      borderRadius: 10,
    }}>
      <StepIndex index={index} done={done} />
      {icon}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.onSurface }}>{label}</div>
        <div style={{
          fontSize: 10, color: C.onSecondaryFixedVar, marginTop: 2,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {detail}
        </div>
      </div>
      {action}
    </div>
  );
}

function StepBtn({ onClick, done, icon: Icon, label, disabled }: {
  onClick: () => void;
  done: boolean;
  icon: React.ElementType;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
        padding: "6px 12px", borderRadius: 6,
        background: done ? "rgba(52,211,153,0.12)" : "transparent",
        border: `1px solid ${done ? "rgba(52,211,153,0.40)" : C.border20}`,
        color: done ? C.mint : C.onSurfaceVariant,
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 10, fontWeight: 700,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {done ? <Check size={11} strokeWidth={2.5} /> : <Icon size={11} strokeWidth={2} />}
      {label}
    </button>
  );
}
