// src/hooks/useFolderAssets.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Load the Cover / Thumbnail / Video slots of a beat/project folder (paths +
// base64 previews for the two images). Shared by the Create tab and the
// Studio assets tab so both show the same three-slot view. Reuses the
// existing parse_beat_folder_for_create command (returns the split slots).
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";

export interface FolderAssets {
  coverPreview: string | null;   // base64 (read_image_file)
  coverPath: string | null;
  thumbnailPreview: string | null;
  thumbnailPath: string | null;
  videoPath: string | null;
}

const EMPTY: FolderAssets = {
  coverPreview: null, coverPath: null,
  thumbnailPreview: null, thumbnailPath: null,
  videoPath: null,
};

export function useFolderAssets(folderPath: string | null) {
  const [assets, setAssets] = useState<FolderAssets>(EMPTY);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async (path: string | null) => {
    if (!path) { setAssets(EMPTY); return; }
    setIsRefreshing(true);
    try {
      const parsed = await api.create.parseBeatFolder(path);
      const preview = async (p: string | null) => {
        if (!p) return null;
        try { return await api.create.readImageFile(p); } catch { return null; }
      };
      const [cover, thumb] = await Promise.all([
        preview(parsed.cover_path),
        preview(parsed.thumbnail_path),
      ]);
      setAssets({
        coverPreview: cover,
        coverPath: parsed.cover_path,
        thumbnailPreview: thumb,
        thumbnailPath: parsed.thumbnail_path,
        videoPath: parsed.video_path,
      });
    } catch (e) {
      console.error("[useFolderAssets] load failed:", e);
      setAssets(EMPTY);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => { load(folderPath); }, [folderPath, load]);

  const refresh = useCallback(() => load(folderPath), [folderPath, load]);

  return { assets, isRefreshing, refresh };
}
