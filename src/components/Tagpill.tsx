// src/components/TagPill.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Wiederverwendbare Tag-Komponenten für Create, Browse, Detail, etc.
// ═══════════════════════════════════════════════════════════════════════════════

import { X, Music, Sparkles, Piano, Star } from "lucide-react";
import { getTagColors, TAG_COLORS, CATEGORY_LABELS, type TagCategory } from "../lib/tags";
import { C } from "../lib/theme";

// ─────────────────────────────────────────────────────────────────────────────────
// Category Icons
// ─────────────────────────────────────────────────────────────────────────────────

export const CATEGORY_ICONS: Record<TagCategory, React.ReactNode> = {
  genre: <Music size={12} />,
  vibe: <Sparkles size={12} />,
  instrument: <Piano size={12} />,
  custom: <Star size={12} />,
  other: <Star size={12} />,
};

// ─────────────────────────────────────────────────────────────────────────────────
// TagPill — Displays a single tag with category-based colors
// ─────────────────────────────────────────────────────────────────────────────────

export interface TagPillProps {
  tag: string;
  category?: TagCategory;
  removable?: boolean;
  onRemove?: (tag: string) => void;
  size?: "sm" | "md" | "lg";
  interactive?: boolean;
  onClick?: (tag: string) => void;
}

export function TagPill({
  tag,
  category,
  removable = false,
  onRemove,
  size = "md",
  interactive = false,
  onClick,
}: TagPillProps) {
  const colors = category ? TAG_COLORS[category] ?? TAG_COLORS.custom : getTagColors(tag);

  // Size variants
  const sizeStyles = {
    sm: { padding: "3px 8px", fontSize: 9, gap: 4, iconSize: 10 },
    md: { padding: "5px 10px", fontSize: 11, gap: 6, iconSize: 12 },
    lg: { padding: "6px 14px", fontSize: 12, gap: 8, iconSize: 14 },
  };

  const s = sizeStyles[size];

  return (
    <span
      onClick={interactive && onClick ? () => onClick(tag) : undefined}
      style={{
        padding: s.padding,
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 9999,
        fontSize: s.fontSize,
        fontWeight: 600,
        color: colors.text,
        display: "inline-flex",
        alignItems: "center",
        gap: s.gap,
        transition: "all 0.15s",
        cursor: interactive ? "pointer" : "default",
      }}
      onMouseEnter={
        interactive
          ? (e) => {
              e.currentTarget.style.filter = "brightness(1.15)";
              e.currentTarget.style.transform = "translateY(-1px)";
            }
          : undefined
      }
      onMouseLeave={
        interactive
          ? (e) => {
              e.currentTarget.style.filter = "brightness(1)";
              e.currentTarget.style.transform = "translateY(0)";
            }
          : undefined
      }
    >
      {tag}

      {/* Remove Button */}
      {removable && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(tag);
          }}
          style={{
            background: "none",
            border: "none",
            color: colors.text,
            cursor: "pointer",
            padding: 0,
            display: "flex",
            opacity: 0.7,
            transition: "opacity 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "1";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "0.7";
          }}
        >
          <X size={s.iconSize} />
        </button>
      )}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────
// QuickAddButton — Button to quickly add a tag
// ─────────────────────────────────────────────────────────────────────────────────

export interface QuickAddButtonProps {
  tag: string;
  category: TagCategory;
  onAdd: (tag: string) => void;
}

export function QuickAddButton({ tag, category, onAdd }: QuickAddButtonProps) {
  const colors = TAG_COLORS[category] ?? TAG_COLORS.custom;

  return (
    <button
      onClick={() => onAdd(tag)}
      style={{
        padding: "7px 14px",
        background: "transparent",
        border: `1px solid ${colors.border}`,
        borderRadius: 9999,
        fontSize: 12,
        fontWeight: 600,
        color: colors.text,
        cursor: "pointer",
        transition: "all 0.15s",
        opacity: 0.7,
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = colors.bg;
        e.currentTarget.style.opacity = "1";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.opacity = "0.7";
      }}
    >
      + {tag}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────
// TagSuggestionItem — Single item in the autocomplete dropdown
// ─────────────────────────────────────────────────────────────────────────────────

export interface TagSuggestionItemProps {
  tag: string;
  category: TagCategory;
  onSelect: (tag: string) => void;
}

export function TagSuggestionItem({ tag, category, onSelect }: TagSuggestionItemProps) {
  const colors = getTagColors(tag);

  return (
    <button
      onClick={() => onSelect(tag)}
      style={{
        width: "100%",
        padding: "10px 16px",
        background: "transparent",
        border: "none",
        borderBottom: `1px solid ${C.border10}`,
        display: "flex",
        alignItems: "center",
        gap: 10,
        cursor: "pointer",
        transition: "background 0.1s",
        textAlign: "left",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = C.surfaceContainerHigh;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <span style={{ color: colors.text }}>{CATEGORY_ICONS[category]}</span>
      <span
        style={{
          color: C.onSurface,
          fontSize: 13,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {tag}
      </span>
      <span
        style={{
          color: C.onSecondaryFixedVar,
          fontSize: 10,
          marginLeft: "auto",
          textTransform: "uppercase",
        }}
      >
        {CATEGORY_LABELS[category]}
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────
// TagCategoryRow — A row of quick-add buttons for a single category
// ─────────────────────────────────────────────────────────────────────────────────

export interface TagCategoryRowProps {
  category: TagCategory;
  tags: string[];
  onAdd: (tag: string) => void;
}

export function TagCategoryRow({ category, tags, onAdd }: TagCategoryRowProps) {
  if (tags.length === 0) return null;

  const colors = TAG_COLORS[category] ?? TAG_COLORS.custom;

  return (
    <div>
      {/* Category Label */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 8,
          color: colors.text,
        }}
      >
        {CATEGORY_ICONS[category]}
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          {CATEGORY_LABELS[category]}
        </span>
      </div>

      {/* Tags */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {tags.map((tag) => (
          <QuickAddButton key={tag} tag={tag} category={category} onAdd={onAdd} />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────
// StatusPill — Status badge component (für Dashboard, Browse, etc.)
// ─────────────────────────────────────────────────────────────────────────────────

import { STATUS_CONFIG, normalizeStatus } from "../lib/theme";

export interface StatusPillProps {
  status: string;
  size?: "sm" | "md";
}

export function StatusPill({ status, size = "md" }: StatusPillProps) {
  const key = normalizeStatus(status);
  const cfg = STATUS_CONFIG[key];

  const sizeStyles = {
    sm: { padding: "2px 8px", fontSize: 8 },
    md: { padding: "3px 10px", fontSize: 9 },
  };

  const s = sizeStyles[size];

  return (
    <span
      style={{
        padding: s.padding,
        borderRadius: 4,
        fontSize: s.fontSize,
        fontWeight: 800,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.border}`,
      }}
    >
      {cfg.label}
    </span>
  );
}