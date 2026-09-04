// src/components/create/PreviewCard.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Preview Card — Beat-Registry-Vorschau + Pre-Flight-Check. Zeigt nicht nur,
// wie der archivierte Beat aussieht (Cover, ID, Titel/Key/BPM, Status, Tags),
// sondern auch, was noch fehlt (Audio/FLP/Cover/Thumbnail/Video), damit man
// vor dem Archivieren auf einen Blick sieht, ob alles bereit ist.
// ═══════════════════════════════════════════════════════════════════════════════

import { memo } from "react";
import { FolderOpen, Image as ImageIcon, Eye, Check, X, AlertTriangle } from "lucide-react";
import { C, STATUS_CONFIG, normalizeStatus } from "../../lib/theme";
import { TagPill } from "../Tagpill";

interface PreviewCardProps {
  title: string;
  keyValue: string;
  bpm: string;
  catalogId: string;
  status: string;
  tags: string[];
  coverImage: string | null;
  previewPath: string;
  hasAudio: boolean;
  hasFlp: boolean;
  hasCover: boolean;
  hasThumbnail: boolean;
  hasVideo: boolean;
}

export const PreviewCard = memo(function PreviewCard({
  title,
  keyValue,
  bpm,
  catalogId,
  status,
  tags,
  coverImage,
  previewPath,
  hasAudio,
  hasFlp,
  hasCover,
  hasThumbnail,
  hasVideo,
}: PreviewCardProps) {
  const previewTitle = title || "SONGNAME";
  const previewKey = keyValue || "—";
  const previewBpm = bpm || "—";
  const previewId = catalogId || "#0000";
  const statusMeta = STATUS_CONFIG[normalizeStatus(status)];

  // Cover fehlt = wichtig (orange Warnung), Rest = neutral grau, wenn leer.
  const checks = [
    { label: "Audio", ok: hasAudio },
    { label: "FLP", ok: hasFlp },
    { label: "Cover", ok: hasCover, important: true },
    { label: "Thumbnail", ok: hasThumbnail },
    { label: "Video", ok: hasVideo },
  ];

  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
      }}>
        <Eye size={14} color={C.onSecondaryFixedVar} strokeWidth={1.75} />
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.onSurface }}>
          Vorschau
        </h3>
      </div>

      <div style={{
        background: C.surfaceContainer,
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
        border: `1px solid ${C.border10}`
      }}>
        {/* Cover (auto-detected from source folder) */}
        <div
          style={{
            position: "relative", paddingBottom: "100%",
            background: C.surfaceContainerHighest,
          }}
        >
          {/* Gradient Overlay */}
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(to top, #000 0%, transparent 50%)",
            zIndex: 2, pointerEvents: "none"
          }} />

          {/* Cover Image or Placeholder */}
          {coverImage ? (
            <img
              src={coverImage}
              alt="Cover"
              style={{
                position: "absolute", inset: 0,
                width: "100%", height: "100%",
                objectFit: "cover", zIndex: 1
              }}
            />
          ) : (
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(135deg, #1a1919 0%, #262626 50%, #1a1919 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              zIndex: 1
            }}>
              <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="rgba(253,161,36,0.15)" strokeWidth="0.5">
                <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
                <line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/>
              </svg>
            </div>
          )}

          {/* Cover hint */}
          {!coverImage && (
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              gap: 8, zIndex: 3, pointerEvents: "none"
            }}>
              <ImageIcon size={24} color={C.onSurfaceVariant} strokeWidth={1.5} style={{ opacity: 0.5 }} />
              <span style={{ color: C.onSurfaceVariant, fontSize: 10, opacity: 0.5 }}>No cover in source folder</span>
            </div>
          )}

          {/* Status-Chip (oben links, gespiegelt zur ID) */}
          <div style={{
            position: "absolute", top: 16, left: 16, zIndex: 4,
            display: "flex", alignItems: "center", gap: 6,
            background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
            border: `1px solid ${statusMeta.border}`,
            padding: "4px 9px", borderRadius: 999,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: statusMeta.color }} />
            <span style={{
              fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase",
              color: statusMeta.color,
            }}>
              {statusMeta.label}
            </span>
          </div>

          {/* ID Badge */}
          <div style={{
            position: "absolute", top: 16, right: 16, zIndex: 4,
            background: C.primary, color: C.onPrimary,
            fontSize: 10, fontWeight: 900,
            padding: "4px 8px", borderRadius: 4
          }}>
            {previewId}
          </div>

          {/* Title & Meta */}
          <div style={{ position: "absolute", bottom: 16, left: 16, right: 16, zIndex: 4 }}>
            <h3 style={{
              fontSize: 24, fontWeight: 900,
              textTransform: "uppercase", letterSpacing: "-0.02em",
              color: "#fff", marginBottom: 6, lineHeight: 1.05,
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
              overflow: "hidden", wordBreak: "break-word",
            }}>
              {previewTitle.toUpperCase()}
            </h3>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 500, color: C.onSurfaceVariant }}>
              <span>{previewKey}</span>
              <div style={{ width: 4, height: 4, borderRadius: "50%", background: C.primary }} />
              <span>{previewBpm} BPM</span>
            </div>
          </div>
        </div>

        {/* Pre-Flight: was ist schon da, was fehlt? */}
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 6,
          padding: "12px 16px", borderBottom: `1px solid ${C.border10}`,
        }}>
          {checks.map(c => (
            <ReadinessChip key={c.label} label={c.label} ok={c.ok} important={c.important} />
          ))}
        </div>

        {/* Tags Preview */}
        {tags.length > 0 && (
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border10}` }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {tags.slice(0, 6).map(tag => (
                <TagPill key={tag} tag={tag} />
              ))}
              {tags.length > 6 && (
                <span style={{ fontSize: 10, color: C.onSecondaryFixedVar, padding: "4px 8px" }}>
                  +{tags.length - 6} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Path Preview */}
        <div style={{ padding: 16, background: C.surfaceContainerLow }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, fontFamily: "monospace", color: C.onSecondaryFixedVar }}>
            <FolderOpen size={14} strokeWidth={1.5} />
            <span>{previewPath}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

// ─── Ein Readiness-Chip ────────────────────────────────────────────────────────

function ReadinessChip({ label, ok, important }: { label: string; ok: boolean; important?: boolean }) {
  // vorhanden = grün, fehlt+wichtig = orange Warnung, fehlt = dezent grau
  const color = ok ? "#22c55e" : important ? C.primary : C.onSecondaryFixedVar;
  const bg = ok ? "rgba(34,197,94,0.10)" : important ? "rgba(253,161,36,0.10)" : "rgba(255,255,255,0.03)";
  const Icon = ok ? Check : important ? AlertTriangle : X;

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 8px", borderRadius: 999,
      background: bg,
      border: `1px solid ${color}30`,
      fontSize: 10, fontWeight: 700, letterSpacing: "0.02em",
      color,
      opacity: ok || important ? 1 : 0.7,
    }}>
      <Icon size={10} strokeWidth={2.5} />
      {label}
    </span>
  );
}
