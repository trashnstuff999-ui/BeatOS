// src/hooks/useFocusRefresh.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Ruft fn auf, wenn das Fenster den Fokus bekommt — z.B. beim Zurückwechseln
// aus FL Studio nach einem Export. Gedrosselt, damit nicht jeder Alt-Tab einen
// Scan auslöst.
// ═══════════════════════════════════════════════════════════════════════════════

import { useEffect, useRef } from "react";

export function useFocusRefresh(fn: () => void, minMs = 10_000) {
  const last = useRef(Date.now());
  const cb = useRef(fn);
  cb.current = fn;

  useEffect(() => {
    const onFocus = () => {
      const now = Date.now();
      if (now - last.current < minMs) return;
      last.current = now;
      cb.current();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [minMs]);
}
