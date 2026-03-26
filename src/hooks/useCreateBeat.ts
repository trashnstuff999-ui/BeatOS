// src/hooks/useCreateBeat.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Custom Hook for Create Beat Archive Logic
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSettings } from "../contexts/SettingsContext";
import type {
  DuplicateCheckResult,
  ArchiveResult,
  DuplicateDialogState,
  SuccessDialogState,
} from "../types/create";

interface UseCreateBeatParams {
  sourceFolderPath: string | null;
  title: string;
  key: string;
  bpm: string;
  catalogId: string;
  status: string;
  tags: string[];
  notes: string;
  selectedFile: string;
  selectedFlp: string;
  coverSourcePath: string | null;
  yearMonth: string;
  onReset: () => void;
  setCatalogId: (id: string) => void;
}

export function useCreateBeat({
  sourceFolderPath,
  title,
  key,
  bpm,
  catalogId,
  status,
  tags,
  notes,
  selectedFile,
  selectedFlp,
  coverSourcePath,
  yearMonth,
  onReset,
  setCatalogId,
}: UseCreateBeatParams) {
  const { settings } = useSettings();

  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [duplicateDialog, setDuplicateDialog] = useState<DuplicateDialogState | null>(null);
  const [successDialog, setSuccessDialog] = useState<SuccessDialogState | null>(null);

  // ─── CREATE BEATSTRUCTURE Handler ──────────────────────────────────────────
  const handleCreateBeatstructure = useCallback(async (forceV2 = false, overrideCatalogId?: string) => {
    if (!sourceFolderPath || !title) return;
    if (!settings.archivePath) {
      setArchiveError("Archive path is not configured. Please set it in Settings.");
      return;
    }

    setArchiveError(null);
    setIsArchiving(true);

    try {
      const idToUse = overrideCatalogId ?? catalogId;
      const catalogIdNum = parseInt(idToUse.replace("#", "")) || 0;
      const bpmNum = bpm ? parseInt(bpm) : null;
      const keyVal = key || null;

      if (!forceV2) {
        const duplicateCheck = await invoke<DuplicateCheckResult>("check_beat_duplicate", {
          catalogId: catalogIdNum,
          title,
          key: keyVal,
          bpm: bpmNum,
        });

        if (duplicateCheck.has_duplicate) {
          setIsArchiving(false);
          setDuplicateDialog({
            show: true,
            duplicateType: duplicateCheck.duplicate_type as "id" | "name_key_bpm",
            existingId: duplicateCheck.existing_id || "",
            existingName: duplicateCheck.existing_name || "",
          });
          return;
        }
      }

      const params = {
        source_folder: sourceFolderPath,
        title,
        key: keyVal,
        bpm: bpmNum,
        catalog_id: catalogIdNum,
        status,
        tags: tags.join(", "),
        notes,
        source_audio_path: selectedFile,
        source_flp_path: selectedFlp,
        cover_path: coverSourcePath,
        year_month: yearMonth,
        archive_base_path: settings.archivePath,
      };

      const result = await invoke<ArchiveResult>("archive_beat", { params });

      if (result.success) {
        setSuccessDialog({
          show: true,
          archivePath: result.archive_path,
          beatId: result.beat_id,
          filesCopied: result.files_copied,
        });
      } else {
        setArchiveError(result.error || "Unknown error occurred");
      }
    } catch (err) {
      console.error("Archive failed:", err);
      setArchiveError(String(err));
    } finally {
      setIsArchiving(false);
    }
  }, [sourceFolderPath, title, catalogId, key, bpm, status, tags, notes, selectedFile, selectedFlp, coverSourcePath, yearMonth, settings.archivePath]);

  const handleDuplicateCreateV2 = useCallback(() => {
    setDuplicateDialog(null);
    const currentId = parseInt(catalogId.replace("#", "")) || 0;
    const newId = `#${String(currentId + 1).padStart(4, "0")}`;
    setCatalogId(newId);                          // update display state
    handleCreateBeatstructure(true, newId);       // pass directly — avoids async state timing bug
  }, [catalogId, setCatalogId, handleCreateBeatstructure]);

  const handleDuplicateCancel = useCallback(() => setDuplicateDialog(null), []);

  const handleSuccessClose = useCallback(() => {
    setSuccessDialog(null);
    onReset();
  }, [onReset]);

  const clearError = useCallback(() => setArchiveError(null), []);

  return {
    isArchiving,
    archiveError,
    duplicateDialog,
    successDialog,
    handleCreateBeatstructure,
    handleDuplicateCreateV2,
    handleDuplicateCancel,
    handleSuccessClose,
    clearError,
  };
}
