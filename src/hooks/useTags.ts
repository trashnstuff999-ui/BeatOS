// src/hooks/useTags.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Custom Hook für Tag State Management
// Mit Custom Tags Support für Quick Add
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useMemo, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  type TagCategory,
  type CustomTag,
  PRESET_TAGS,
  searchAllTags,
  normalizeTag,
  isPresetTag,
  prepareCustomTagForDb,
  tagsToString,
  parseTagString,
} from "../lib/tags";

// ─────────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────────

export interface UseTagsOptions {
  initialTags?: string[];
  quickAddLimit?: number;
  autoLoadCustomTags?: boolean;
}

export interface QuickAddTagsResult {
  genre: string[];
  vibe: string[];
  instrument: string[];
  custom: string[];  // NEU: Custom Tags Kategorie
  other: string[];
}

export interface UseTagsReturn {
  // State
  tags: string[];
  tagInput: string;
  showSuggestions: boolean;
  customTags: CustomTag[];
  pendingCustomTags: string[];
  tagSuggestions: { tag: string; category: TagCategory }[];
  quickAddTags: QuickAddTagsResult;

  // Actions
  setTagInput: (value: string) => void;
  setShowSuggestions: (show: boolean) => void;
  addTag: (tag?: string) => void;
  removeTag: (tag: string) => void;
  setTags: (tags: string[]) => void;
  clearTags: () => void;
  saveCustomTagsToDb: () => Promise<void>;
  reloadCustomTags: () => Promise<void>;
  getTagsForDb: () => string;
  hasPendingTags: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────────
// Hook Implementation
// ─────────────────────────────────────────────────────────────────────────────────

export function useTags(options: UseTagsOptions = {}): UseTagsReturn {
  const {
    initialTags = [],
    quickAddLimit = 10,
    autoLoadCustomTags = true,
  } = options;

  // ─── State ─────────────────────────────────────────────────────────────────
  const [tags, setTags] = useState<string[]>(initialTags);
  const [tagInput, setTagInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [customTags, setCustomTags] = useState<CustomTag[]>([]);
  const [pendingCustomTags, setPendingCustomTags] = useState<string[]>([]);

  // ─── Load Custom Tags from DB on Mount ─────────────────────────────────────
  useEffect(() => {
    if (autoLoadCustomTags) {
      loadCustomTags();
    }
  }, [autoLoadCustomTags]);

  const loadCustomTags = useCallback(async () => {
    try {
      const loadedTags = await invoke<CustomTag[]>("get_custom_tags");
      setCustomTags(loadedTags);
    } catch (err) {
      console.error("Failed to load custom tags:", err);
    }
  }, []);

  // ─── Tag Suggestions (filtered by input) ───────────────────────────────────
  const tagSuggestions = useMemo(() => {
    if (!tagInput.trim()) return [];
    return searchAllTags(tagInput, customTags)
      .filter((preset) => !tags.includes(preset.tag))
      .slice(0, 8);
  }, [tagInput, tags, customTags]);

  // ─── Quick-Add Tags (grouped by category, mit Custom) ─────────────────────
  const quickAddTags = useMemo((): QuickAddTagsResult => {
    const result: QuickAddTagsResult = {
      genre: [],
      vibe: [],
      instrument: [],
      custom: [],
      other: [],
    };

    // 1. Add presets (genre, vibe, instrument, other)
    for (const [category, presetTags] of Object.entries(PRESET_TAGS)) {
      const cat = category as keyof typeof PRESET_TAGS;
      result[cat] = presetTags
        .filter((t) => !tags.includes(t))
        .slice(0, quickAddLimit);
    }

    // 2. Add custom tags sorted by usage_count
    const sortedCustom = [...customTags].sort(
      (a, b) => b.usage_count - a.usage_count
    );
    
    for (const ct of sortedCustom) {
      // Skip wenn bereits in tags
      if (tags.includes(ct.display_name)) continue;
      
      // Skip wenn bereits ein Preset ist
      if (isPresetTag(ct.display_name)) continue;
      
      // Zu "custom" Kategorie hinzufügen (max quickAddLimit)
      if (result.custom.length < quickAddLimit) {
        result.custom.push(ct.display_name);
      }
    }

    return result;
  }, [tags, customTags, quickAddLimit]);

  // ─── Actions ───────────────────────────────────────────────────────────────

  const addTag = useCallback(
    (tagToAdd?: string) => {
      const newTag = normalizeTag(tagToAdd || tagInput);
      if (newTag && !tags.includes(newTag)) {
        setTags((prev) => [...prev, newTag]);
        setTagInput("");
        setShowSuggestions(false);

        // Track custom tags for later DB save
        if (!isPresetTag(newTag)) {
          if (!pendingCustomTags.includes(newTag)) {
            setPendingCustomTags((prev) => [...prev, newTag]);
          }
        }
      }
    },
    [tagInput, tags, pendingCustomTags]
  );

  const removeTag = useCallback((tagToRemove: string) => {
    setTags((prev) => prev.filter((t) => t !== tagToRemove));
    setPendingCustomTags((prev) => prev.filter((t) => t !== tagToRemove));
  }, []);

  const clearTags = useCallback(() => {
    setTags([]);
    setPendingCustomTags([]);
  }, []);

  const saveCustomTagsToDb = useCallback(async () => {
    const saved: CustomTag[] = [];
    for (const tag of pendingCustomTags) {
      const prepared = prepareCustomTagForDb(tag);
      try {
        await invoke("save_custom_tag", {
          tag: prepared.tag,
          displayName: prepared.display_name,
          category: prepared.category,
        });
        // Build local CustomTag to append without a full DB reload
        saved.push({
          tag: prepared.tag,
          display_name: prepared.display_name,
          category: prepared.category as TagCategory,
          usage_count: 1,
        });
      } catch (err) {
        console.error("Failed to save custom tag:", err);
      }
    }
    setPendingCustomTags([]);
    // Append newly saved tags instead of reloading all from DB
    if (saved.length > 0) {
      setCustomTags(prev => {
        const existingTags = new Set(prev.map(t => t.tag));
        return [...prev, ...saved.filter(t => !existingTags.has(t.tag))];
      });
    }
  }, [pendingCustomTags]);

  const reloadCustomTags = useCallback(async () => {
    await loadCustomTags();
  }, [loadCustomTags]);

  const getTagsForDb = useCallback(() => {
    return tagsToString(tags);
  }, [tags]);

  // ─── Return ────────────────────────────────────────────────────────────────
  return {
    tags,
    tagInput,
    showSuggestions,
    customTags,
    pendingCustomTags,
    tagSuggestions,
    quickAddTags,

    setTagInput,
    setShowSuggestions,
    addTag,
    removeTag,
    setTags,
    clearTags,
    saveCustomTagsToDb,
    reloadCustomTags,
    getTagsForDb,
    hasPendingTags: pendingCustomTags.length > 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────────
// Helper Hook
// ─────────────────────────────────────────────────────────────────────────────────

export function useTagsFromString(tagString: string | null | undefined) {
  return useMemo(() => parseTagString(tagString), [tagString]);
}