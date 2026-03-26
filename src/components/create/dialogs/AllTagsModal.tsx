// src/components/create/dialogs/AllTagsModal.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Tag Manager — 4-column studio layout
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Search, X, Music, Sparkles, Piano, Star,
  Plus, Trash2, Check, MoveRight,
} from "lucide-react";
import { C, commonStyles } from "../../../lib/theme";
import {
  TAG_COLORS, PRESET_TAGS, normalizeTag, sortTagsByCategory,
  updateCustomTagsCache,
  type TagCategory, type CustomTag,
} from "../../../lib/tags";

// ─── Types ────────────────────────────────────────────────────────────────────

type ColKey = "genre" | "vibe" | "instrument" | "custom";
type ViewMode = "all" | ColKey;

const COLUMNS: { key: ColKey; label: string; Icon: React.ElementType }[] = [
  { key: "genre",      label: "Genre",       Icon: Music      },
  { key: "vibe",       label: "Vibe",        Icon: Sparkles   },
  { key: "instrument", label: "Instruments", Icon: Piano      },
  { key: "custom",     label: "Custom",      Icon: Star       },
];

// ─── Seed ─────────────────────────────────────────────────────────────────────

const SEED_KEY = "beatos_tags_seeded_v1";

async function seedTagsIfNeeded(): Promise<CustomTag[]> {
  let tags = await invoke<CustomTag[]>("get_custom_tags");
  if (!localStorage.getItem(SEED_KEY)) {
    const existing = new Set(tags.map(t => t.tag));
    const ops: Promise<void>[] = [];
    for (const [cat, list] of Object.entries(PRESET_TAGS) as [string, string[]][]) {
      for (const name of list) {
        const key = name.toLowerCase();
        if (!existing.has(key)) {
          ops.push(invoke("save_custom_tag", { tag: key, displayName: name, category: cat }).then(() => {}).catch(() => {}));
        }
      }
    }
    if (ops.length > 0) {
      await Promise.all(ops);
      tags = await invoke<CustomTag[]>("get_custom_tags");
    }
    localStorage.setItem(SEED_KEY, "1");
  }
  return tags;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface AllTagsModalProps {
  initialSelected: string[];
  onConfirm: (tags: string[]) => void;
  onClose: () => void;
  editMode?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AllTagsModal({ initialSelected, onConfirm, onClose, editMode = true }: AllTagsModalProps) {

  const [internalSelected, setInternalSelected] = useState<string[]>(initialSelected);
  const [staged, setStaged] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [allTags, setAllTags] = useState<CustomTag[]>([]);
  const [isSeeding, setIsSeeding] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("all");

  // Create form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagCategory, setNewTagCategory] = useState<TagCategory>("custom");
  const [isCreating, setIsCreating] = useState(false);
  const createFormRef = useRef<HTMLDivElement>(null);

  // Move menu
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const moveMenuRef = useRef<HTMLDivElement>(null);

  // Drag & drop
  const [draggingTag, setDraggingTag] = useState<CustomTag | null>(null);
  const draggingTagRef = useRef<CustomTag | null>(null);
  const [dragOverCol, setDragOverCol] = useState<ColKey | null>(null);

  // Inline rename
  const [editingTag, setEditingTag] = useState<{ original: CustomTag; name: string } | null>(null);

  // ── Load & seed ─────────────────────────────────────────────────────────────

  useEffect(() => {
    setIsSeeding(true);
    seedTagsIfNeeded()
      .then(tags => { setAllTags(tags); updateCustomTagsCache(tags); })
      .catch(console.error)
      .finally(() => setIsSeeding(false));
  }, []);

  // ── Close dropdowns on outside click ────────────────────────────────────────

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (createFormRef.current && !createFormRef.current.contains(e.target as Node)) setShowCreateForm(false);
      if (moveMenuRef.current && !moveMenuRef.current.contains(e.target as Node)) setShowMoveMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const sortActive = (tags: string[]) =>
    sortTagsByCategory(tags, (tag) =>
      (allTags.find(t =>
        t.tag === tag.toLowerCase() ||
        t.display_name.toLowerCase() === tag.toLowerCase()
      )?.category) ?? "custom"
    );

  const matches = (t: CustomTag) =>
    !searchQuery.trim() || t.display_name.toLowerCase().includes(searchQuery.toLowerCase());

  const isActive = (t: CustomTag) =>
    internalSelected.some(s =>
      s.toLowerCase() === t.display_name.toLowerCase() ||
      s.toLowerCase() === t.tag
    );

  const isStagedAdd = (t: CustomTag) => staged.has(t.tag);

  // Tags for a given column
  const columnTags = (key: ColKey): CustomTag[] => {
    const filter = key === "custom"
      ? (t: CustomTag) => t.category === "custom" || t.category === "other"
      : (t: CustomTag) => t.category === key;
    return allTags.filter(t => filter(t) && matches(t));
  };

  // ── Interactions ────────────────────────────────────────────────────────────

  const handleTagClick = (t: CustomTag) => {
    if (!editMode) return;
    const key = t.tag;
    const displayLower = t.display_name.toLowerCase();

    if (staged.has(key)) {
      // Already staged → unstage
      setStaged(prev => { const next = new Set(prev); next.delete(key); return next; });
      return;
    }
    if (internalSelected.some(s => s.toLowerCase() === displayLower || s.toLowerCase() === key)) {
      // Active on beat → remove
      setInternalSelected(prev =>
        prev.filter(s => s.toLowerCase() !== displayLower && s.toLowerCase() !== key)
      );
      return;
    }
    // Neither → stage to add
    setStaged(prev => new Set([...prev, key]));
  };

  const handleApply = () => {
    const next = [...internalSelected];
    for (const key of staged) {
      if (!next.some(s => s.toLowerCase() === key)) next.push(key);
    }
    onConfirm(sortActive(next));
    onClose();
  };

  const handleTrashStaged = async () => {
    setInternalSelected(prev => prev.filter(s => !staged.has(s.toLowerCase())));
    for (const key of staged) {
      try {
        await invoke("delete_custom_tag", { tag: key });
        setAllTags(prev => {
          const next = prev.filter(t => t.tag !== key);
          updateCustomTagsCache(next);
          return next;
        });
      } catch {}
    }
    setStaged(new Set());
  };

  const handleCreate = async () => {
    if (!newTagName.trim() || isCreating) return;
    const name = normalizeTag(newTagName);
    const key = name.toLowerCase();
    const cat = newTagCategory;
    setIsCreating(true);
    try {
      await invoke("save_custom_tag", { tag: key, displayName: name, category: cat });
      const entry: CustomTag = {
        id: Date.now(), tag: key, display_name: name,
        category: cat, usage_count: 1, created_at: new Date().toISOString(),
      };
      setAllTags(prev => {
        // If tag exists (e.g. seeded with different category) → update its category
        const next = prev.some(t => t.tag === key)
          ? prev.map(t => t.tag === key ? { ...t, display_name: name, category: cat } : t)
          : [...prev, entry];
        updateCustomTagsCache(next);
        return next;
      });
      setStaged(prev => new Set([...prev, key]));
      setNewTagName("");
      setShowCreateForm(false);
    } catch (e) {
      console.error("Failed to create tag:", e);
    } finally {
      setIsCreating(false);
    }
  };

  const handleMoveStagedTo = async (targetCat: TagCategory) => {
    for (const key of staged) {
      const tag = allTags.find(t => t.tag === key);
      if (!tag || tag.category === targetCat) continue;
      try {
        await invoke("save_custom_tag", { tag: key, displayName: tag.display_name, category: targetCat });
      } catch {}
    }
    setAllTags(prev => {
      const next = prev.map(t => staged.has(t.tag) ? { ...t, category: targetCat } : t);
      updateCustomTagsCache(next);
      return next;
    });
    setStaged(new Set());
    setShowMoveMenu(false);
  };

  const handleMoveTag = async (targetKey: ColKey) => {
    const tag = draggingTagRef.current;
    if (!tag) return;
    const newCategory = targetKey as TagCategory;
    if (newCategory === tag.category) return;
    try {
      await invoke("save_custom_tag", { tag: tag.tag, displayName: tag.display_name, category: newCategory });
      setAllTags(prev => {
        const next = prev.map(t => t.tag === tag.tag ? { ...t, category: newCategory } : t);
        updateCustomTagsCache(next);
        return next;
      });
    } catch {}
  };

  const handleRenameCommit = useCallback(async () => {
    if (!editingTag) return;
    const trimmed = editingTag.name.trim();
    if (!trimmed) { setEditingTag(null); return; }
    const normalized = normalizeTag(trimmed);
    const newKey = normalized.toLowerCase();
    const oldKey = editingTag.original.tag;
    setEditingTag(null);
    if (newKey === oldKey) return;
    try {
      await invoke("rename_custom_tag", {
        oldTag: oldKey, newTag: newKey,
        newDisplayName: normalized, category: editingTag.original.category,
      });
      setAllTags(prev => {
        const next = prev.map(t => t.tag === oldKey ? { ...t, tag: newKey, display_name: normalized } : t);
        updateCustomTagsCache(next);
        return next;
      });
      setInternalSelected(prev => prev.map(s => s.toLowerCase() === oldKey ? normalized : s));
      setStaged(prev => {
        const next = new Set(prev);
        if (next.has(oldKey)) { next.delete(oldKey); next.add(newKey); }
        return next;
      });
    } catch (e) { console.error(e); }
  }, [editingTag]);

  // ── Computed ────────────────────────────────────────────────────────────────

  const stagedCount = staged.size;
  const removedCount = initialSelected.filter(
    t => !internalSelected.some(s => s.toLowerCase() === t.toLowerCase())
  ).length;
  const hasChanges = stagedCount > 0 || removedCount > 0;

  const visibleColumns = viewMode === "all"
    ? COLUMNS
    : COLUMNS.filter(c => c.key === viewMode);

  // ── Tag row renderer ─────────────────────────────────────────────────────────

  const renderTagRow = (t: CustomTag) => {
    if (editingTag?.original.tag === t.tag) {
      return (
        <div key={t.tag} style={{ padding: "7px 14px", borderBottom: `1px solid ${C.border10}` }}>
          <input
            autoFocus
            value={editingTag.name}
            onChange={e => setEditingTag(prev => prev ? { ...prev, name: e.target.value } : null)}
            onBlur={handleRenameCommit}
            onKeyDown={e => {
              if (e.key === "Enter") { e.preventDefault(); handleRenameCommit(); }
              if (e.key === "Escape") { e.preventDefault(); setEditingTag(null); }
            }}
            onClick={e => e.stopPropagation()}
            style={{
              width: "100%", padding: "6px 10px", borderRadius: 5,
              fontSize: 12, fontWeight: 500,
              background: C.surfaceContainerHighest,
              border: `2px solid ${C.primary}`,
              color: C.onSurface, outline: "none", boxSizing: "border-box",
            }}
          />
        </div>
      );
    }

    const colors = TAG_COLORS[t.category as TagCategory] ?? TAG_COLORS.custom;
    const active = isActive(t);
    const stg = isStagedAdd(t);
    const isDragging = draggingTag?.tag === t.tag;

    return (
      <div
        key={t.tag}
        onClick={() => handleTagClick(t)}
        onDoubleClick={e => { e.stopPropagation(); if (editMode) setEditingTag({ original: t, name: t.display_name }); }}
        draggable
        onDragStart={e => { e.dataTransfer.effectAllowed = "move"; draggingTagRef.current = t; setDraggingTag(t); }}
        onDragEnd={() => { draggingTagRef.current = null; setDraggingTag(null); setDragOverCol(null); }}
        title={editMode ? "Click to toggle · Double-click to rename · Drag to move" : undefined}
        style={{
          padding: "13px 16px",
          display: "flex", alignItems: "center", gap: 10,
          borderBottom: `1px solid ${C.border10}`,
          borderLeft: stg
            ? `3px solid ${colors.text}`
            : active
            ? `3px solid ${colors.border}`
            : "3px solid transparent",
          background: stg
            ? colors.bg
            : active
            ? `${colors.bg}55`
            : C.surfaceContainerHigh,
          cursor: editMode ? "pointer" : "default",
          transition: "background 0.1s",
          opacity: isDragging ? 0.35 : 1,
          userSelect: "none",
        }}
        onMouseEnter={e => { if (!stg && !active) e.currentTarget.style.background = C.surfaceContainerHighest; }}
        onMouseLeave={e => { if (!stg && !active) e.currentTarget.style.background = C.surfaceContainerHigh; }}
      >
        <span style={{
          flex: 1, fontSize: 13,
          fontWeight: stg || active ? 600 : 400,
          color: stg ? colors.text : active ? colors.text : C.onSurface,
          letterSpacing: "0.01em",
        }}>
          {t.display_name}
        </span>
        {stg && (
          <span style={{ fontSize: 14, fontWeight: 800, color: colors.text, lineHeight: 1, flexShrink: 0 }}>+</span>
        )}
        {active && !stg && (
          <Check size={11} color={colors.text} strokeWidth={2.5} style={{ flexShrink: 0 }} />
        )}
      </div>
    );
  };

  // ── Column renderer ───────────────────────────────────────────────────────────

  const renderColumn = (col: typeof COLUMNS[number]) => {
    const { key, label, Icon } = col;
    const colors = TAG_COLORS[key as TagCategory] ?? TAG_COLORS.custom;
    const tags = columnTags(key);
    const isDragTarget = draggingTagRef.current !== null && dragOverCol === key && draggingTagRef.current.category !== key;

    return (
      <div
        key={key}
        onDragOver={e => {
          if (draggingTagRef.current && draggingTagRef.current.category !== key) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (dragOverCol !== key) setDragOverCol(key);
          }
        }}
        onDragLeave={e => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverCol(null);
        }}
        onDrop={e => {
          e.preventDefault();
          handleMoveTag(key);
          setDraggingTag(null);
          draggingTagRef.current = null;
          setDragOverCol(null);
        }}
        style={{
          flex: 1, minWidth: 0,
          display: "flex", flexDirection: "column",
          borderRadius: 12,
          background: isDragTarget ? `${colors.bg}` : C.surfaceContainerLow,
          border: isDragTarget ? `1px solid ${colors.border}` : `1px solid ${C.border10}`,
          borderTop: `4px solid ${colors.text}`,
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
          transition: "background 0.15s, border-color 0.15s",
          overflow: "hidden",
        }}
      >
        {/* Column header */}
        <div style={{
          padding: "12px 16px 11px",
          borderBottom: `1px solid ${C.border15}`,
          display: "flex", alignItems: "center", gap: 8,
          flexShrink: 0,
        }}>
          <Icon size={13} color={colors.text} strokeWidth={1.5} />
          <span style={{
            flex: 1, fontSize: 10, fontWeight: 700, color: colors.text,
            letterSpacing: "0.12em", textTransform: "uppercase",
          }}>
            {label}
          </span>
          <span style={{
            fontSize: 11, fontFamily: "monospace",
            color: C.onSecondaryFixedVar, fontWeight: 500,
          }}>
            {tags.length.toString().padStart(2, "0")}
          </span>
        </div>

        {/* Tag list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {isSeeding ? null : tags.length > 0 ? (
            tags.map(renderTagRow)
          ) : (
            <div style={{
              padding: "20px 16px", textAlign: "center",
              fontSize: 11, color: C.onSecondaryFixedVar, fontStyle: "italic",
            }}>
              {isDragTarget
                ? `Move to ${label}`
                : searchQuery ? "No matches"
                : "Empty"}
            </div>
          )}
          {isDragTarget && tags.length > 0 && (
            <div style={{
              margin: "8px 12px", padding: "9px 12px", borderRadius: 6,
              border: `1px dashed ${colors.border}`,
              fontSize: 11, textAlign: "center", color: colors.text, opacity: 0.8,
            }}>
              Drop → {label}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "24px 32px",
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#111", borderRadius: 14,
          border: `1px solid ${C.border15}`,
          width: "100%", maxWidth: 1160, height: "88vh",
          display: "flex", flexDirection: "column",
          boxShadow: "0 40px 80px rgba(0,0,0,0.8)",
          overflow: "hidden",
        }}
      >

        {/* ═══ HEADER ═══ */}
        <div style={{
          height: 56, flexShrink: 0,
          background: "#0d0d0d", borderBottom: `1px solid ${C.border15}`,
          display: "flex", alignItems: "center", padding: "0 20px", gap: 16,
        }}>

          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <Star size={15} color={C.primary} strokeWidth={2} />
            <span style={{
              fontSize: 14, fontWeight: 800, color: C.primary,
              letterSpacing: "0.07em", textTransform: "uppercase",
            }}>
              Studio Tags
            </span>
          </div>

          {/* Search */}
          <div style={{ position: "relative", flex: 1, maxWidth: 340 }}>
            <Search size={13} color={C.onSecondaryFixedVar} style={{
              position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none",
            }} />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search tags..."
              style={{ ...commonStyles.input, padding: "8px 10px 8px 32px", fontSize: 12, width: "100%" }}
            />
          </div>

          {/* Active count */}
          {internalSelected.length > 0 && (
            <span style={{ fontSize: 11, color: C.onSecondaryFixedVar, flexShrink: 0 }}>
              <span style={{ color: C.mint, fontWeight: 700 }}>{internalSelected.length}</span> active
            </span>
          )}

          <div style={{ flex: 1 }} />

          {/* View tabs */}
          <div style={{
            display: "flex", gap: 2,
            background: C.surfaceContainerHighest,
            borderRadius: 7, padding: 3,
          }}>
            {([{ key: "all" as ViewMode, label: "All" }, ...COLUMNS] as { key: ViewMode; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setViewMode(key)}
                style={{
                  padding: "4px 11px", borderRadius: 5,
                  fontSize: 10, fontWeight: 700,
                  letterSpacing: "0.05em", textTransform: "uppercase",
                  background: viewMode === key ? C.surfaceContainerHigh : "transparent",
                  border: "none", cursor: "pointer",
                  color: viewMode === key ? C.onSurface : C.onSecondaryFixedVar,
                  transition: "all 0.12s",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Create Tag */}
          {editMode && (
            <div style={{ position: "relative" }} ref={createFormRef}>
              <button
                onClick={() => setShowCreateForm(v => !v)}
                style={{
                  padding: "7px 14px", borderRadius: 7,
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase",
                  background: `linear-gradient(145deg, ${C.primary}, ${C.primaryContainer})`,
                  border: "none", color: C.onPrimary, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                  flexShrink: 0,
                }}
              >
                <Plus size={12} strokeWidth={2.5} />
                Create Tag
              </button>

              {showCreateForm && (
                <div style={{
                  position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 200,
                  background: C.surfaceContainerHigh, border: `1px solid ${C.border20}`,
                  borderRadius: 10, padding: 16, width: 360,
                  boxShadow: "0 12px 40px rgba(0,0,0,0.7)",
                }}>
                  <p style={{
                    margin: "0 0 12px", fontSize: 10, fontWeight: 700,
                    color: C.onSurfaceVariant, letterSpacing: "0.08em", textTransform: "uppercase",
                  }}>
                    New Tag
                  </p>
                  <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                    {(["genre", "vibe", "instrument", "custom"] as const).map(cat => {
                      const clrs = TAG_COLORS[cat];
                      const active = newTagCategory === cat;
                      return (
                        <button
                          key={cat}
                          onClick={() => setNewTagCategory(cat)}
                          style={{
                            flex: 1, padding: "6px 4px", borderRadius: 8,
                            fontSize: 9, fontWeight: 700,
                            border: `1px solid ${active ? clrs.text + "80" : clrs.border}`,
                            background: active ? clrs.bg : `${clrs.bg}40`,
                            color: clrs.text,
                            cursor: "pointer", transition: "all 0.12s",
                            textTransform: "uppercase", letterSpacing: "0.04em",
                            boxShadow: active ? `0 0 0 1px ${clrs.border}, 0 0 8px ${clrs.bg}` : "none",
                            opacity: active ? 1 : 0.55,
                          }}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    autoFocus
                    value={newTagName}
                    onChange={e => setNewTagName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleCreate()}
                    placeholder="Tag name..."
                    style={{
                      ...commonStyles.input, padding: "8px 10px", fontSize: 12,
                      width: "100%", boxSizing: "border-box" as const, marginBottom: 10,
                    }}
                  />
                  <button
                    disabled={isCreating || !newTagName.trim()}
                    onClick={handleCreate}
                    style={{
                      width: "100%", padding: "8px", borderRadius: 6,
                      fontSize: 11, fontWeight: 700,
                      background: newTagName.trim()
                        ? `linear-gradient(145deg, ${C.primary}, ${C.primaryContainer})`
                        : C.surfaceContainerHighest,
                      border: "none",
                      color: newTagName.trim() ? C.onPrimary : C.onSecondaryFixedVar,
                      cursor: newTagName.trim() ? "pointer" : "not-allowed",
                    }}
                  >
                    {isCreating ? "Creating..." : "Create"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Close */}
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 6, flexShrink: 0,
              background: C.surfaceContainerHighest, border: `1px solid ${C.border20}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: C.onSurfaceVariant,
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* ═══ COLUMNS ═══ */}
        <div style={{ flex: 1, display: "flex", gap: 12, padding: "16px 20px", overflow: "hidden" }}>
          {isSeeding ? (
            <div style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
              color: C.onSecondaryFixedVar, fontSize: 12,
            }}>
              Loading tags...
            </div>
          ) : (
            visibleColumns.map(renderColumn)
          )}
        </div>

        {/* ═══ BOTTOM BAR — only visible when changes exist ═══ */}
        {hasChanges && (
          <div style={{
            height: 56, flexShrink: 0,
            background: "rgba(13,13,13,0.98)", borderTop: `1px solid ${C.border20}`,
            padding: "0 20px",
            display: "flex", alignItems: "center", gap: 12,
          }}>

            {/* Count badge */}
            <div style={{
              width: 26, height: 26, borderRadius: "50%",
              background: C.primary,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 800, color: C.onPrimary, flexShrink: 0,
            }}>
              {stagedCount + removedCount}
            </div>
            <span style={{
              fontSize: 11, fontWeight: 600, color: C.onSurfaceVariant,
              letterSpacing: "0.06em", textTransform: "uppercase",
            }}>
              {stagedCount > 0 && removedCount > 0
                ? `${stagedCount} added · ${removedCount} removed`
                : stagedCount > 0 ? `${stagedCount} tags staged`
                : `${removedCount} removed`}
            </span>

            <div style={{ flex: 1 }} />

            {/* Move staged to category */}
            {editMode && stagedCount > 0 && (
              <div style={{ position: "relative" }} ref={moveMenuRef}>
                <button
                  onClick={() => setShowMoveMenu(v => !v)}
                  style={{
                    padding: "7px 14px", borderRadius: 6,
                    fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase",
                    background: C.surfaceContainerHighest, border: `1px solid ${C.border30}`,
                    color: C.onSurfaceVariant, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  <MoveRight size={13} /> Move
                </button>
                {showMoveMenu && (
                  <div style={{
                    position: "absolute", bottom: "calc(100% + 6px)", left: 0,
                    background: C.surfaceContainerHigh, border: `1px solid ${C.border20}`,
                    borderRadius: 8, overflow: "hidden", zIndex: 10, minWidth: 160,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
                  }}>
                    {(["genre", "vibe", "instrument", "custom"] as const).map(cat => {
                      const clrs = TAG_COLORS[cat];
                      return (
                        <button
                          key={cat}
                          onClick={() => handleMoveStagedTo(cat)}
                          style={{
                            width: "100%", padding: "10px 14px",
                            background: "transparent", border: "none",
                            fontSize: 11, fontWeight: 600, color: clrs.text,
                            cursor: "pointer", textAlign: "left",
                            display: "flex", alignItems: "center", gap: 8,
                            textTransform: "uppercase", letterSpacing: "0.05em",
                            transition: "background 0.1s",
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = clrs.bg; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                        >
                          <span style={{
                            width: 7, height: 7, borderRadius: "50%",
                            background: clrs.text, flexShrink: 0,
                          }} />
                          {cat.charAt(0).toUpperCase() + cat.slice(1)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Delete staged from DB */}
            {editMode && stagedCount > 0 && (
              <button
                onClick={handleTrashStaged}
                title="Delete staged tags from DB"
                style={{
                  padding: "7px 14px", borderRadius: 6,
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase",
                  background: "rgba(248,113,113,0.08)", border: `1px solid rgba(248,113,113,0.25)`,
                  color: "#f87171", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                  transition: "all 0.13s",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(248,113,113,0.18)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(248,113,113,0.08)"; }}
              >
                <Trash2 size={13} /> Delete
              </button>
            )}

            {/* Apply to Beat */}
            <button
              onClick={handleApply}
              style={{
                padding: "8px 22px", borderRadius: 6,
                fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase",
                background: `linear-gradient(145deg, ${C.primary}, ${C.primaryContainer})`,
                border: "none", color: C.onPrimary, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 7,
              }}
            >
              <Check size={13} strokeWidth={2.5} />
              Apply to Beat
            </button>

            {/* Clear all changes */}
            <button
              onClick={() => { setStaged(new Set()); setInternalSelected(initialSelected); }}
              title="Discard changes"
              style={{
                width: 30, height: 30, borderRadius: 6, flexShrink: 0,
                background: "transparent", border: `1px solid ${C.border20}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: C.onSecondaryFixedVar,
              }}
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
