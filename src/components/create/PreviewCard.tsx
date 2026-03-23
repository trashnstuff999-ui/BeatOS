// src/components/create/PreviewCard.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Preview Card - Beat registry preview with cover and metadata
// ═══════════════════════════════════════════════════════════════════════════════

import { FolderOpen, ImagePlus, Info } from "lucide-react";
import { C } from "../../lib/theme";
import { Label } from "../ui";
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
  editMode: boolean;
  onSelectCover: () => void;
}

export function PreviewCard({
  title,
  keyValue,
  bpm,
  catalogId,
  status,
  tags,
  coverImage,
  previewPath,
  editMode,
  onSelectCover,
}: PreviewCardProps) {
  const previewTitle = title || "SONGNAME";
  const previewKey = keyValue || "—";
  const previewBpm = bpm || "—";
  const previewId = catalogId || "#0000";

  return (
    <div style={{ position: "sticky", top: 0, alignSelf: "flex-start" }}>
      <Label style={{ color: C.primary, letterSpacing: "0.3em", marginBottom: 16 }}>Registry Preview</Label>

      <div style={{ 
        background: C.surfaceContainer, 
        borderRadius: 12, 
        overflow: "hidden", 
        boxShadow: "0 25px 50px rgba(0,0,0,0.5)", 
        border: `1px solid ${C.border10}` 
      }}>
        {/* Cover */}
        <div
          onClick={onSelectCover}
          style={{
            position: "relative", paddingBottom: "100%",
            background: C.surfaceContainerHighest,
            cursor: editMode ? "pointer" : "default",
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

          {/* Empty State Hint */}
          {editMode && !coverImage && (
            <div style={{ 
              position: "absolute", inset: 0, 
              display: "flex", flexDirection: "column", 
              alignItems: "center", justifyContent: "center", 
              gap: 8, zIndex: 3, pointerEvents: "none" 
            }}>
              <ImagePlus size={24} color={C.onSurfaceVariant} strokeWidth={1.5} style={{ opacity: 0.5 }} />
              <span style={{ color: C.onSurfaceVariant, fontSize: 10, opacity: 0.5 }}>Click to select cover</span>
            </div>
          )}

          {/* ID Badge */}
          <div style={{ 
            position: "absolute", top: 16, right: 16, zIndex: 4, 
            background: C.primary, color: "#4e2d00", 
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
              color: "#fff", marginBottom: 6, lineHeight: 1 
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

      {/* Info Box */}
      <div style={{ 
        marginTop: 24, padding: 16, borderRadius: 8, 
        background: "rgba(148,146,255,0.05)", 
        border: "1px solid rgba(148,146,255,0.10)", 
        display: "flex", gap: 16, alignItems: "flex-start" 
      }}>
        <Info size={18} color={C.tertiary} strokeWidth={1.5} style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 12, color: C.onSurfaceVariant, lineHeight: 1.6, margin: 0 }}>
          BeatOS will automatically generate standardized subfolders for Stems, MIDI, and Masters once structured.
        </p>
      </div>
    </div>
  );
}
