// src/contexts/NavigationGuardContext.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Navigation Guard Context
// Allows Create tab to block navigation when there are unsaved changes
//
// Design notes:
// - isCreateDirty is stored as state (Sidebar needs to re-render on change)
// - Handlers are stored in a ref, NOT state → avoids infinite render loop
//   (setCreateHandlers mutates ref → no re-render → no loop)
// - Context value is memoized → only changes when isCreateDirty changes
// ═══════════════════════════════════════════════════════════════════════════════

import { createContext, useContext, useState, useCallback, useRef, useMemo, ReactNode } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreateHandlers {
  onApply: () => void;
  onDiscard: () => void;
}

export interface NavigationGuardContextValue {
  isCreateDirty: boolean;
  setCreateDirty: (isDirty: boolean) => void;
  /** Stores handlers in a ref — does NOT trigger re-renders */
  setCreateHandlers: (handlers: CreateHandlers | null) => void;
  /** Read current handlers at call-time (ref access) */
  getCreateHandlers: () => CreateHandlers | null;
}

// ─── Context ─────────────────────────────────────────────────────────────────

export const NavigationGuardContext = createContext<NavigationGuardContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const [isCreateDirty, setIsCreateDirty] = useState(false);

  // Handlers live in a ref → mutating them never triggers a re-render
  const handlersRef = useRef<CreateHandlers | null>(null);

  const setCreateDirty = useCallback((isDirty: boolean) => {
    setIsCreateDirty(isDirty);
  }, []);

  const setCreateHandlers = useCallback((handlers: CreateHandlers | null) => {
    handlersRef.current = handlers;
  }, []);

  const getCreateHandlers = useCallback(() => handlersRef.current, []);

  // Memoize value so it only changes when isCreateDirty changes
  // (setCreateDirty / setCreateHandlers / getCreateHandlers are stable callbacks)
  const value = useMemo<NavigationGuardContextValue>(() => ({
    isCreateDirty,
    setCreateDirty,
    setCreateHandlers,
    getCreateHandlers,
  }), [isCreateDirty, setCreateDirty, setCreateHandlers, getCreateHandlers]);

  return (
    <NavigationGuardContext.Provider value={value}>
      {children}
    </NavigationGuardContext.Provider>
  );
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useNavigationGuard() {
  const context = useContext(NavigationGuardContext);
  if (!context) {
    throw new Error("useNavigationGuard must be used within NavigationGuardProvider");
  }
  return context;
}

/** Safe to call outside NavigationGuardProvider — returns null instead of throwing */
export function useNavigationGuardOptional() {
  return useContext(NavigationGuardContext);
}
