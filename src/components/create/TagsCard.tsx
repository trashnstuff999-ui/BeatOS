// src/components/create/TagsCard.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Tags Card - Tag selection and quick add
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useMemo } from "react";
import { Grid3X3, Search, Tag } from "lucide-react";
import { C, commonStyles } from "../../lib/theme";
import { sortTagsByCategory, type CustomTag } from "../../lib/tags";
import { SectionCard } from "../ui/SectionCard";
import { TagPill, TagCategoryRow } from "../Tagpill";

interface TagsHook {
  tags: string[];
  customTags: CustomTag[];
  addTag: (tag?: string) => void;
  removeTag: (tag: string) => void;
  quickAddTags: { genre: string[]; vibe: string[]; instrument: string[]; custom: string[]; other: string[] };
}

interface TagsCardProps {
  tagsHook: TagsHook;
  onShowAllTags: () => void;
}

export function TagsCard({ tagsHook, onShowAllTags }: TagsCardProps) {
  const { tags, customTags, addTag, removeTag, quickAddTags } = tagsHook;
  const [searchQuery, setSearchQuery] = useState("");

  const sortedTags = useMemo(() =>
    sortTagsByCategory(tags, (tag) => {
      const ct = customTags.find(t =>
        t.display_name.toLowerCase() === tag.toLowerCase() ||
        t.tag === tag.toLowerCase()
      );
      return ct?.category ?? "custom";
    }),
    [tags, customTags]
  );

  // When searching: filter customTags by query, grouped by category, max 5 per cat
  // When not searching: use the pre-computed top-5 quickAddTags from useTags
  const displayGroups = useMemo(() => {
    if (!searchQuery.trim()) return quickAddTags;
    const q = searchQuery.toLowerCase();
    const tagsSet = new Set(tags.map(t => t.toLowerCase()));
    const result: Record<string, string[]> = { genre: [], vibe: [], instrument: [], custom: [] };
    for (const ct of customTags) {
      if (tagsSet.has(ct.display_name.toLowerCase())) continue;
      if (!ct.display_name.toLowerCase().includes(q)) continue;
      const bucket = ct.category === "other" ? "custom" : ct.category;
      if (result[bucket] && result[bucket].length < 5) result[bucket].push(ct.display_name);
    }
    return result;
  }, [searchQuery, customTags, tags, quickAddTags]);

  const hasAnyTags = (["genre", "vibe", "instrument", "custom"] as const).some(
    cat => displayGroups[cat]?.length > 0
  );

  return (
    <SectionCard icon={Tag} title="Tags">
      {/* Zeile über den Tags: Anzahl + Tag-Manager */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontSize: 10, color: C.onSecondaryFixedVar }}>
          {tags.length > 0 ? `${tags.length} ausgewählt` : "Noch keine Tags"}
        </span>
        <button
          onClick={onShowAllTags}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "4px 10px", borderRadius: 4,
            fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
            background: C.surfaceContainerHighest,
            border: `1px solid ${C.border20}`,
            color: C.onSurfaceVariant,
            cursor: "pointer",
            transition: "all 0.15s",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = C.surfaceContainer;
            e.currentTarget.style.color = C.primary;
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = C.surfaceContainerHighest;
            e.currentTarget.style.color = C.onSurfaceVariant;
          }}
        >
          <Grid3X3 size={10} />
          Tags verwalten
        </button>
      </div>

      {/* Selected Tags */}
      {sortedTags.length > 0 && (
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20,
          maxHeight: sortedTags.length > 10 ? 120 : "none",
          overflowY: sortedTags.length > 10 ? "auto" : "visible",
          paddingRight: sortedTags.length > 10 ? 8 : 0,
        }}>
          {sortedTags.map(tag => (
            <TagPill key={tag} tag={tag} removable onRemove={removeTag} />
          ))}
        </div>
      )}

      {/* Search */}
      <div style={{ position: "relative", marginBottom: 16 }}>
        <Search size={13} color={C.onSecondaryFixedVar} style={{
          position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none",
        }} />
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Tags durchsuchen …"
          style={{ ...commonStyles.input, width: "100%", padding: "10px 12px 10px 32px", fontSize: 12, boxSizing: "border-box" }}
        />
      </div>

      {/* Quick Add */}
      {hasAnyTags ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {(["genre", "vibe", "instrument", "custom"] as const).map(cat => (
            displayGroups[cat]?.length > 0 && (
              <TagCategoryRow key={cat} category={cat} tags={displayGroups[cat]} onAdd={addTag} />
            )
          ))}
        </div>
      ) : searchQuery.trim() ? (
        <span style={{ fontSize: 12, color: C.onSecondaryFixedVar, fontStyle: "italic" }}>
          No tags found for "{searchQuery}"
        </span>
      ) : null}
    </SectionCard>
  );
}
