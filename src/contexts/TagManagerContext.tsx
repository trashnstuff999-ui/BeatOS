// src/contexts/TagManagerContext.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Global Tag Manager — open from anywhere in the app
// ═══════════════════════════════════════════════════════════════════════════════

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TagManagerOpenParams {
  /** Tags currently selected/active for this context (beat, form, etc.) */
  initialSelected: string[];
  /** Called when the user clicks Done — receives the final tag list */
  onConfirm: (tags: string[]) => void;
  /** Whether edit actions (add, delete) are allowed */
  editMode?: boolean;
}

interface TagManagerContextValue {
  isOpen: boolean;
  params: TagManagerOpenParams | null;
  openTagManager: (params: TagManagerOpenParams) => void;
  closeTagManager: () => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const TagManagerContext = createContext<TagManagerContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function TagManagerProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useState<TagManagerOpenParams | null>(null);

  const openTagManager = useCallback((p: TagManagerOpenParams) => {
    setParams(p);
  }, []);

  const closeTagManager = useCallback(() => {
    setParams(null);
  }, []);

  return (
    <TagManagerContext.Provider value={{ isOpen: params !== null, params, openTagManager, closeTagManager }}>
      {children}
    </TagManagerContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useTagManager(): TagManagerContextValue {
  const ctx = useContext(TagManagerContext);
  if (!ctx) throw new Error("useTagManager must be used within TagManagerProvider");
  return ctx;
}
