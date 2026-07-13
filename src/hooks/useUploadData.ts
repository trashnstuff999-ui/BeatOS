// src/hooks/useUploadData.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Loads upload-tab data for a selected beat. Phase B = read only.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { UploadData } from "../types/upload";

export interface UseUploadDataReturn {
  data: UploadData | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useUploadData(beatId: string | null): UseUploadDataReturn {
  const [data, setData] = useState<UploadData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await invoke<UploadData>("get_upload_data", { beatId: id });
      setData(result);
    } catch (e) {
      setData(null);
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!beatId) {
      setData(null);
      setError(null);
      return;
    }
    load(beatId);
  }, [beatId, load]);

  const refresh = useCallback(async () => {
    if (beatId) await load(beatId);
  }, [beatId, load]);

  return { data, isLoading, error, refresh };
}
