// src/hooks/useStats.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Small stats hooks. The full dashboard stats load lives in api.stats.get
// (used directly by Dashboard) — this file only hosts lightweight helpers.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { api } from "../lib/api";

// Simple hook that just returns the total count (for Sidebar)
export function useBeatCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    api.stats.getBeatCount()
      .then(setCount)
      .catch(() => setCount(0));
  }, []);

  return count;
}
