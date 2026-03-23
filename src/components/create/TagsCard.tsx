// src/components/create/TagsCard.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Tags Card - Tag input, suggestions, quick add
// ═══════════════════════════════════════════════════════════════════════════════

import { Grid3X3, Star } from "lucide-react";
import { C, commonStyles } from "../../lib/theme";
import { normalizeTag } from "../../lib/tags";
import { Card, Label } from "../ui";
import { TagPill, TagSuggestionItem, TagCategoryRow } from "../Tagpill";

// Type for the useTags hook return
interface TagsHook {
  tags: string[];
  tagInput: string;
  setTagInput: (v: string) => void;
  showSuggestions: boolean;
  setShowSuggestions: (v: boolean) => void;
  addTag: (tag?: string) => void;
  removeTag: (tag: string) => void;
  tagSuggestions: { tag: string; category: string }[];
  quickAddTags: { genre: string[]; vibe: string[]; instrument: string[]; custom: string[] };
  pendingCustomTags: string[];
  hasPendingTags: boolean;
}

interface TagsCardProps {
  tagsHook: TagsHook;
  editMode: boolean;
  onShowAllTags: () => void;
}

export function TagsCard({ tagsHook, editMode, onShowAllTags }: TagsCardProps) {
  const {
    tags,
    tagInput,
    setTagInput,
    showSuggestions,
    setShowSuggestions,
    addTag,
    removeTag,
    tagSuggestions,
    quickAddTags,
    pendingCustomTags,
    hasPendingTags,
  } = tagsHook;

  return (
    <Card accent={C.mint}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Label style={{ marginBottom: 0 }}>Tags</Label>
          {tags.length > 0 && (
            <span style={{ fontSize: 10, color: C.onSecondaryFixedVar, background: C.surfaceContainerHighest, padding: "2px 8px", borderRadius: 4 }}>
              {tags.length} selected
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {hasPendingTags && (
            <span style={{ fontSize: 9, color: C.mint, background: "rgba(52,211,153,0.1)", padding: "2px 8px", borderRadius: 9999 }}>
              ✦ {pendingCustomTags.length} new
            </span>
          )}
          <button
            onClick={onShowAllTags}
            disabled={!editMode}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "4px 10px", borderRadius: 4,
              fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
              background: C.surfaceContainerHighest,
              border: `1px solid ${C.border20}`,
              color: C.onSurfaceVariant,
              cursor: editMode ? "pointer" : "not-allowed",
              opacity: editMode ? 1 : 0.5,
              transition: "all 0.15s",
            }}
            onMouseEnter={e => {
              if (!editMode) return;
              e.currentTarget.style.background = C.surfaceContainer;
              e.currentTarget.style.color = C.primary;
            }}
            onMouseLeave={e => {
              if (!editMode) return;
              e.currentTarget.style.background = C.surfaceContainerHighest;
              e.currentTarget.style.color = C.onSurfaceVariant;
            }}
          >
            <Grid3X3 size={10} />
            SHOW ALL
          </button>
        </div>
      </div>

      {/* Selected Tags */}
      <div style={{ 
        display: "flex", 
        flexWrap: "wrap", 
        gap: 8, 
        marginBottom: tags.length > 0 ? 20 : 0,
        maxHeight: tags.length > 10 ? 120 : "none",
        overflowY: tags.length > 10 ? "auto" : "visible",
        paddingRight: tags.length > 10 ? 8 : 0,
      }}>
        {tags.map(tag => (
          <TagPill key={tag} tag={tag} removable onRemove={removeTag} />
        ))}
      </div>

      {/* Edit Mode: Input + Quick Add */}
      {editMode && (
        <>
          <div style={{ position: "relative", marginBottom: 20 }}>
            <input
              value={tagInput}
              onChange={e => { setTagInput(e.target.value); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
              placeholder="Type to search or add custom tag..."
              style={{ ...commonStyles.input, width: "100%", padding: "12px 16px", fontSize: 13, boxSizing: "border-box" }}
            />

            {showSuggestions && tagSuggestions.length > 0 && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
                background: C.surfaceContainerHighest, border: `1px solid ${C.border30}`,
                borderRadius: 8, overflow: "hidden", zIndex: 50, boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
              }}>
                {tagSuggestions.map(preset => (
                  <TagSuggestionItem key={preset.tag} tag={preset.tag} category={preset.category} onSelect={addTag} />
                ))}
              </div>
            )}

            {tagInput.trim() && !tagSuggestions.some(s => s.tag.toLowerCase() === tagInput.toLowerCase()) && (
              <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: C.onSecondaryFixedVar, pointerEvents: "none" }}>
                Press Enter to add "{normalizeTag(tagInput)}"
              </div>
            )}
          </div>

          {/* Quick Add */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.onSecondaryFixedVar, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Quick Add
            </span>
            {(["genre", "vibe", "instrument"] as const).map(cat => (
              <TagCategoryRow key={cat} category={cat} tags={quickAddTags[cat]} onAdd={addTag} />
            ))}
            
            {/* Custom Tags Row */}
            {quickAddTags.custom.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ 
                  fontSize: 9, fontWeight: 700, 
                  color: "#f59e0b",
                  textTransform: "uppercase", 
                  letterSpacing: "0.1em",
                  display: "flex", alignItems: "center", gap: 4,
                  minWidth: 80,
                }}>
                  <Star size={10} /> Custom
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {quickAddTags.custom.map(tag => (
                    <button
                      key={tag}
                      onClick={() => addTag(tag)}
                      style={{
                        padding: "4px 10px", borderRadius: 4,
                        fontSize: 11, fontWeight: 500,
                        background: "rgba(245,158,11,0.10)",
                        border: "1px solid rgba(245,158,11,0.30)",
                        color: "#f59e0b",
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(245,158,11,0.20)"}
                      onMouseLeave={e => e.currentTarget.style.background = "rgba(245,158,11,0.10)"}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {!editMode && tags.length === 0 && (
        <span style={{ fontSize: 12, color: C.onSecondaryFixedVar, fontStyle: "italic" }}>No tags added</span>
      )}
    </Card>
  );
}
