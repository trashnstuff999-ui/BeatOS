// src/hooks/useCreateGuard.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Hook to connect Create tab's dirty state to the Navigation Guard
//
// Key design:
// - Uses context.setCreateDirty / context.setCreateHandlers as effect deps,
//   NOT the context object itself. Both are stable useCallback(fn, []) refs →
//   effects only re-run when isDirty / onApply / onDiscard actually change.
// - This prevents the render loop that would occur if the context VALUE object
//   (which changes on every isCreateDirty update) were used as a dep.
// ═══════════════════════════════════════════════════════════════════════════════

import { useEffect } from "react";
import { useNavigationGuardOptional } from "../contexts/NavigationGuardContext";

interface UseCreateGuardOptions {
  isDirty: boolean;
  onApply: () => void;
  onDiscard: () => void;
}

export function useCreateGuard({ isDirty, onApply, onDiscard }: UseCreateGuardOptions) {
  const context = useNavigationGuardOptional();

  // Stable refs to avoid stale closures while keeping stable deps
  const setCreateDirty = context?.setCreateDirty;
  const setCreateHandlers = context?.setCreateHandlers;

  // Sync dirty flag whenever it changes
  useEffect(() => {
    setCreateDirty?.(isDirty);
  }, [isDirty, setCreateDirty]);

  // Register / unregister handlers (ref mutation → no re-render → no loop)
  useEffect(() => {
    if (!setCreateHandlers) return;
    setCreateHandlers({ onApply, onDiscard });
    return () => {
      setCreateHandlers(null);
      setCreateDirty?.(false);
    };
  }, [onApply, onDiscard, setCreateHandlers, setCreateDirty]);
}
