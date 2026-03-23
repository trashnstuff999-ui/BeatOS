// src/components/create/dialogs/AllTagsModal.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// All Tags Modal - Browse and select from all available tags
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { Search, X, Music, Sparkles, Piano, Tag, Star } from "lucide-react";
import { C, commonStyles } from "../../../lib/theme";
import { PRESET_TAGS, TAG_COLORS } from "../../../lib/tags";
import { TagPill } from "../../Tagpill";

interface AllTagsModalProps {
  selectedTags: string[];
  customTags: { display_name: string; category: string }[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onClose: () => void;
  editMode: boolean;
}

export function AllTagsModal({ 
  selectedTags, 
  customTags, 
  onAddTag, 
  onRemoveTag, 
  onClose, 
  editMode 
}: AllTagsModalProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Category config mit Icons und Farben
  const CATEGORY_CONFIG: { key: "genre" | "vibe" | "instrument" | "other"; label: string; icon: React.ReactNode; color: string }[] = [
    { key: "genre", label: "Genre", icon: <Music size={14} />, color: TAG_COLORS.genre.text },
    { key: "vibe", label: "Vibe", icon: <Sparkles size={14} />, color: TAG_COLORS.vibe.text },
    { key: "instrument", label: "Instruments", icon: <Piano size={14} />, color: TAG_COLORS.instrument.text },
    { key: "other", label: "Other", icon: <Tag size={14} />, color: TAG_COLORS.other.text },
  ];

  // Filter tags based on search
  const filterTags = (tagList: string[]) => {
    if (!searchQuery.trim()) return tagList;
    return tagList.filter(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
  };

  // Get custom tags that aren't presets
  const customOnlyTags = customTags
    .map(ct => ct.display_name)
    .filter(t => !Object.values(PRESET_TAGS).flat().includes(t));

  // Toggle tag selection
  const handleTagClick = (tag: string) => {
    if (!editMode) return;
    if (selectedTags.includes(tag)) {
      onRemoveTag(tag);
    } else {
      onAddTag(tag);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 32,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.surfaceContainerLow,
          borderRadius: 16,
          border: `1px solid ${C.border20}`,
          width: "100%", maxWidth: 900,
          maxHeight: "80vh",
          display: "flex", flexDirection: "column",
          boxShadow: "0 25px 80px rgba(0,0,0,0.6)",
        }}
      >
        {/* Modal Header */}
        <div style={{
          padding: "20px 24px",
          borderBottom: `1px solid ${C.border15}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.onSurface }}>All Tags</h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: C.onSecondaryFixedVar }}>
              {selectedTags.length} tags selected
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Search */}
            <div style={{ position: "relative" }}>
              <Search size={14} color={C.onSecondaryFixedVar} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search tags..."
                style={{
                  ...commonStyles.input,
                  padding: "8px 12px 8px 36px",
                  fontSize: 12,
                  width: 200,
                }}
              />
            </div>
            <button
              onClick={onClose}
              style={{
                width: 32, height: 32, borderRadius: 6,
                background: C.surfaceContainerHighest,
                border: `1px solid ${C.border20}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: C.onSurfaceVariant,
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Selected Tags Preview */}
        {selectedTags.length > 0 && (
          <div style={{ padding: "16px 24px", borderBottom: `1px solid ${C.border10}`, background: "rgba(52,211,153,0.03)" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.mint, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, display: "block" }}>
              Selected Tags
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {selectedTags.map(tag => (
                <TagPill key={tag} tag={tag} removable={editMode} onRemove={onRemoveTag} />
              ))}
            </div>
          </div>
        )}

        {/* Tag Categories Grid */}
        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24 }}>
            {CATEGORY_CONFIG.map(({ key, label, icon, color }) => {
              const categoryTags = filterTags(PRESET_TAGS[key] || []);
              if (categoryTags.length === 0 && searchQuery) return null;

              return (
                <div key={key}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <span style={{ color }}>{icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      {label}
                    </span>
                    <span style={{ fontSize: 10, color: C.onSecondaryFixedVar }}>
                      ({categoryTags.length})
                    </span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {categoryTags.map(tag => {
                      const isSelected = selectedTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          onClick={() => handleTagClick(tag)}
                          disabled={!editMode}
                          style={{
                            padding: "5px 12px", borderRadius: 4,
                            fontSize: 11, fontWeight: 500,
                            background: isSelected ? TAG_COLORS[key].bg : C.surfaceContainerHighest,
                            border: `1px solid ${isSelected ? TAG_COLORS[key].border : C.border20}`,
                            color: isSelected ? TAG_COLORS[key].text : C.onSurfaceVariant,
                            cursor: editMode ? "pointer" : "default",
                            opacity: editMode ? 1 : 0.6,
                            transition: "all 0.15s",
                          }}
                        >
                          {tag}
                          {isSelected && <span style={{ marginLeft: 6, opacity: 0.7 }}>✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Custom Tags Section */}
            {filterTags(customOnlyTags).length > 0 && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <Star size={14} color="#f59e0b" />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#f59e0b", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Custom
                  </span>
                  <span style={{ fontSize: 10, color: C.onSecondaryFixedVar }}>
                    ({filterTags(customOnlyTags).length})
                  </span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {filterTags(customOnlyTags).map(tag => {
                    const isSelected = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        onClick={() => handleTagClick(tag)}
                        disabled={!editMode}
                        style={{
                          padding: "5px 12px", borderRadius: 4,
                          fontSize: 11, fontWeight: 500,
                          background: isSelected ? "rgba(245,158,11,0.15)" : C.surfaceContainerHighest,
                          border: `1px solid ${isSelected ? "rgba(245,158,11,0.4)" : C.border20}`,
                          color: isSelected ? "#f59e0b" : C.onSurfaceVariant,
                          cursor: editMode ? "pointer" : "default",
                          opacity: editMode ? 1 : 0.6,
                          transition: "all 0.15s",
                        }}
                      >
                        {tag}
                        {isSelected && <span style={{ marginLeft: 6, opacity: 0.7 }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: "16px 24px",
          borderTop: `1px solid ${C.border15}`,
          display: "flex", justifyContent: "flex-end",
        }}>
          <button
            onClick={onClose}
            style={{
              padding: "10px 24px", borderRadius: 6,
              fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
              background: C.primary,
              border: "none",
              color: "#4e2d00",
              cursor: "pointer",
            }}
          >
            DONE
          </button>
        </div>
      </div>
    </div>
  );
}
