// src/components/browse/TagPill.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Tag Pill with category-based colors (same as Dashboard/Create)
// ═══════════════════════════════════════════════════════════════════════════════

import { getTagColors } from "../../lib/tags";

interface TagPillProps {
  tag: string;
  onRemove?: () => void;
  size?: "sm" | "md";
}

export function TagPill({ tag, onRemove, size = "md" }: TagPillProps) {
  const colors = getTagColors(tag);
  
  const padding = size === "sm" ? "3px 8px" : "4px 10px";
  const fontSize = size === "sm" ? 9 : 10;
  const gap = size === "sm" ? 4 : 6;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap,
        padding,
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 9999,
        fontSize,
        fontWeight: 600,
        color: colors.text,
      }}
    >
      {tag}
      {onRemove && (
        <button
          onClick={e => {
            e.stopPropagation();
            onRemove();
          }}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: colors.text,
            display: "flex",
            padding: 0,
            opacity: 0.7,
            transition: "opacity 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={e => (e.currentTarget.style.opacity = "0.7")}
        >
          <svg width={size === "sm" ? 10 : 12} height={size === "sm" ? 10 : 12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  );
}
