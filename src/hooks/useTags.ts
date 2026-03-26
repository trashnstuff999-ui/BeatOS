// src/hooks/useTags.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Custom Hook für Tag State Management
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useMemo, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  type TagCategory,
  type CustomTag,
  searchAllTags,
  normalizeTag,
  tagsToString,
  sortTagsByCategory,
  updateCustomTagsCache,
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
  custom: string[];
  other: string[];
}

export interface UseTagsReturn {
  // State
  tags: string[];
  tagInput: string;
  showSuggestions: boolean;
  customTags: CustomTag[];
  tagSuggestions: { tag: string; category: TagCategory }[];
  quickAddTags: QuickAddTagsResult;

  // Actions
  setTagInput: (value: string) => void;
  setShowSuggestions: (show: boolean) => void;
  addTag: (tag?: string) => void;
  removeTag: (tag: string) => void;
  setTags: (tags: string[]) => void;
  clearTags: () => void;
  createCustomTag: (name: string, category: string) => Promise<void>;
  deleteCustomTag: (displayName: string) => Promise<void>;
  reloadCustomTags: () => Promise<void>;
  getTagsForDb: () => string;
}

// ─────────────────────────────────────────────────────────────────────────────────
// Hook Implementation
// ─────────────────────────────────────────────────────────────────────────────────

export function useTags(options: UseTagsOptions = {}): UseTagsReturn {
  const {
    initialTags = [],
    quickAddLimit = 5,
    autoLoadCustomTags = true,
  } = options;

  // ─── State ─────────────────────────────────────────────────────────────────
  const [tags, setTags] = useState<string[]>(initialTags);
  const [tagInput, setTagInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [customTags, setCustomTags] = useState<CustomTag[]>([]);

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
      updateCustomTagsCache(loadedTags);
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

  // ─── Quick-Add Tags — built entirely from DB ────────────────────────────────
  const quickAddTags = useMemo((): QuickAddTagsResult => {
    const result: QuickAddTagsResult = {
      genre: [],
      vibe: [],
      instrument: [],
      custom: [],
      other: [],
    };

    const tagsLower = new Set(tags.map(t => t.toLowerCase()));

    for (const ct of customTags) {
      if (tagsLower.has(ct.display_name.toLowerCase())) continue;
      const bucket = ct.category as keyof QuickAddTagsResult;
      if (result[bucket] && result[bucket].length < quickAddLimit) {
        result[bucket].push(ct.display_name);
      }
    }

    return result;
  }, [tags, customTags, quickAddLimit]);

  // ─── Actions ───────────────────────────────────────────────────────────────

  const addTag = useCallback(
    (tagToAdd?: string) => {
      const newTag = normalizeTag(tagToAdd || tagInput);
      if (newTag && !tags.some(t => t.toLowerCase() === newTag.toLowerCase())) {
        setTags((prev) => {
          const next = [...prev, newTag];
          return sortTagsByCategory(next, (tag) => {
            const ct = customTags.find(t =>
              t.display_name.toLowerCase() === tag.toLowerCase() ||
              t.tag === tag.toLowerCase()
            );
            return ct?.category ?? "custom";
          });
        });
        setTagInput("");
        setShowSuggestions(false);
      }
    },
    [tagInput, tags, customTags]
  );

  const removeTag = useCallback((tagToRemove: string) => {
    setTags((prev) => prev.filter((t) => t !== tagToRemove));
  }, []);

  const clearTags = useCallback(() => {
    setTags([]);
  }, []);

  const createCustomTag = useCallback(async (name: string, category: string) => {
    const normalized = normalizeTag(name);
    if (!normalized) return;
    const tagKey = normalized.toLowerCase().replace(/\s+/g, "_");
    await invoke("save_custom_tag", {
      tag: tagKey,
      displayName: normalized,
      category,
    });
    const newEntry: CustomTag = {
      id: Date.now(),
      tag: tagKey,
      display_name: normalized,
      category: category as TagCategory,
      usage_count: 1,
      created_at: new Date().toISOString(),
    };
    setCustomTags(prev => prev.some(t => t.display_name === normalized) ? prev : [...prev, newEntry]);
    setTags(prev => prev.includes(normalized) ? prev : [...prev, normalized]);
  }, []);

  const deleteCustomTag = useCallback(async (displayName: string) => {
    const tagKey = displayName.toLowerCase().replace(/\s+/g, "_");
    await invoke("delete_custom_tag", { tag: tagKey });
    setCustomTags(prev => prev.filter(t => t.display_name !== displayName));
    setTags(prev => prev.filter(t => t !== displayName));
  }, []);

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
    tagSuggestions,
    quickAddTags,

    setTagInput,
    setShowSuggestions,
    addTag,
    removeTag,
    setTags,
    clearTags,
    createCustomTag,
    deleteCustomTag,
    reloadCustomTags,
    getTagsForDb,
  };
}
