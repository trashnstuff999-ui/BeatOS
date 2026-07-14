// src/hooks/useCreateBeat.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Custom Hook for Create Beat Archive Logic
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useCallback } from "react";
import { api } from "../lib/api";
import { useSettings } from "../contexts/SettingsContext";
import type {
  DuplicateDialogState,
  SuccessDialogState,
} from "../types/create";
import type { TypeBeatPreset } from "../types/upload";

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
  yearMonth: string;
  autoRename: boolean;
  /** Quellordner nach verifizierter Archivierung automatisch in den Papierkorb */
  trashSource: boolean;
  /** Type-Beat-Preset, im Create-Flow gewählt (optional) */
  preset: TypeBeatPreset | null;
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
  yearMonth,
  autoRename,
  trashSource,
  preset,
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
        const duplicateCheck = await api.archive.checkDuplicate(catalogIdNum, title, keyVal, bpmNum);

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
        year_month: yearMonth,
        archive_base_path: settings.archivePath,
        auto_rename: autoRename,
        type_beat_main:      preset?.main_artists ?? null,
        type_beat_also_fits: preset?.also_fits ?? null,
        genre_tags:          preset?.genre_tags ?? null,
        youtube_tags:        preset?.youtube_tags ?? null,
        soundcloud_tags:     preset?.soundcloud_tags ?? null,
      };

      const result = await api.archive.archiveBeat(params);

      if (result.success) {
        // Move semantics: after the verified copy, the source goes to the
        // recycle bin automatically (checkbox in the footer, default on).
        // A trash failure never fails the archive — it surfaces as warning.
        let sourceTrashed = false;
        let warning = result.error ?? null;
        if (trashSource) {
          try {
            await api.archive.trashSourceFolder(sourceFolderPath, settings.archivePath);
            sourceTrashed = true;
          } catch (e) {
            warning = [warning, `Quellordner-Cleanup fehlgeschlagen: ${String(e)}`]
              .filter(Boolean).join(" · ");
          }
        }

        setSuccessDialog({
          show: true,
          archivePath: result.archive_path,
          beatId: result.beat_id,
          filesCopied: result.files_copied,
          sourceFolder: sourceFolderPath,
          warning,
          sourceTrashed,
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
  }, [sourceFolderPath, title, catalogId, key, bpm, status, tags, notes, selectedFile, selectedFlp, yearMonth, settings.archivePath]);

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
