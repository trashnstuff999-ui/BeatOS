// src/hooks/useCreateBeat.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Custom Hook for Create Beat Archive Logic
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ARCHIVE_BASE_PATH } from "../lib/constants";
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
  // ─── Archive Process State ─────────────────────────────────────────────────
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [duplicateDialog, setDuplicateDialog] = useState<DuplicateDialogState | null>(null);
  const [successDialog, setSuccessDialog] = useState<SuccessDialogState | null>(null);

  // ─── CREATE BEATSTRUCTURE Handler ──────────────────────────────────────────
  const handleCreateBeatstructure = useCallback(async (forceV2 = false) => {
    if (!sourceFolderPath || !title) return;

    setArchiveError(null);
    setIsArchiving(true);

    try {
      // 1. Parse catalog ID
      const catalogIdNum = parseInt(catalogId.replace("#", "")) || 0;
      const bpmNum = bpm ? parseInt(bpm) : null;
      const keyVal = key || null;

      // 2. Check for duplicates (unless forcing V2)
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

      // 3. Prepare archive params
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
        archive_base_path: ARCHIVE_BASE_PATH,
      };

      // 4. Execute archive operation
      const result = await invoke<ArchiveResult>("archive_beat", { params });

      if (result.success) {
        // Success! Show success dialog
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
  }, [sourceFolderPath, title, catalogId, key, bpm, status, tags, notes, selectedFile, selectedFlp, coverSourcePath, yearMonth]);

  // ─── Handle Duplicate Dialog Actions ───────────────────────────────────────
  const handleDuplicateCreateV2 = useCallback(() => {
    setDuplicateDialog(null);
    // Increment catalog ID for V2
    const currentId = parseInt(catalogId.replace("#", "")) || 0;
    const nextId = currentId + 1;
    setCatalogId(`#${String(nextId).padStart(4, "0")}`);
    // Retry with force flag
    handleCreateBeatstructure(true);
  }, [catalogId, setCatalogId, handleCreateBeatstructure]);

  const handleDuplicateCancel = useCallback(() => {
    setDuplicateDialog(null);
  }, []);

  // ─── Handle Success Dialog Close ───────────────────────────────────────────
  const handleSuccessClose = useCallback(() => {
    setSuccessDialog(null);
    // Reset form for next beat
    onReset();
  }, [onReset]);

  // ─── Clear Error ───────────────────────────────────────────────────────────
  const clearError = useCallback(() => {
    setArchiveError(null);
  }, []);

  return {
    // State
    isArchiving,
    archiveError,
    duplicateDialog,
    successDialog,
    
    // Actions
    handleCreateBeatstructure,
    handleDuplicateCreateV2,
    handleDuplicateCancel,
    handleSuccessClose,
    clearError,
  };
}
