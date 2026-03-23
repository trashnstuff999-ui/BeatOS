// src/pages/Create.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// BeatOS Archive Portal — Refactored Main Component
// 
// This file now only handles:
// - State orchestration
// - Layout structure
// - Component composition
//
// All heavy lifting is moved to:
// - /types/create.ts          → Type definitions
// - /hooks/useCreateBeat.ts   → Archive logic
// - /components/create/*      → UI components
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useMemo, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

// ─── Component Imports ──────────────────────────────────────────────────────
import { CreateHeader } from "../components/create/CreateHeader";
import { CreateFooter } from "../components/create/CreateFooter";
import { BeatInfoCard } from "../components/create/BeatInfoCard";
import { StatusCard } from "../components/create/StatusCard";
import { TagsCard } from "../components/create/TagsCard";
import { SourceFilesCard } from "../components/create/SourceFilesCard";
import { NotesCard } from "../components/create/NotesCard";
import { PreviewCard } from "../components/create/PreviewCard";
import { ErrorBanner } from "../components/create/ErrorBanner";
import { ErrorToast } from "../components/create/ErrorToast";
import {
  ConfirmDialog,
  DuplicateDialog,
  SuccessDialog,
  AllTagsModal,
} from "../components/create/dialogs";

// ─── Hook Imports ───────────────────────────────────────────────────────────
import { useTags } from "../hooks/useTags";
import { useCreateBeat } from "../hooks/useCreateBeat";

// ─── Lib Imports ────────────────────────────────────────────────────────────
import { C } from "../lib/theme";
import { selectBeatFolder, selectCoverImage, generatePreviewPath, getYearMonthFolder } from "../lib/archive";

// ─── Type Imports ───────────────────────────────────────────────────────────
import type {
  AudioFileInfo,
  FlpFileInfo,
  ParsedBeatFolder,
  SavedBeatState,
  ConfirmAction,
} from "../types/create";

// ═══════════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════════

export default function Create() {
  // ─── Mode State ────────────────────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false);

  // ─── Form State ────────────────────────────────────────────────────────────
  const [title, setTitle] = useState("");
  const [key, setKey] = useState("");
  const [bpm, setBpm] = useState("");
  const [catalogId, setCatalogId] = useState("");
  const [status, setStatus] = useState<string>("idea");
  const [notes, setNotes] = useState("");
  const [selectedFile, setSelectedFile] = useState("");
  const [sourceFolderPath, setSourceFolderPath] = useState<string | null>(null);
  const [createdDate, setCreatedDate] = useState<string | null>(null);
  const [yearMonth, setYearMonth] = useState<string>("");

  // ─── Parsed Folder State ───────────────────────────────────────────────────
  const [audioFiles, setAudioFiles] = useState<AudioFileInfo[]>([]);
  const [flpFiles, setFlpFiles] = useState<FlpFileInfo[]>([]);
  const [selectedFlp, setSelectedFlp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // ─── Tags Hook ─────────────────────────────────────────────────────────────
  const tagsHook = useTags();
  const { tags, clearTags } = tagsHook;

  // ─── Cover State ───────────────────────────────────────────────────────────
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [coverSourcePath, setCoverSourcePath] = useState<string | null>(null);

  // ─── Modal State ───────────────────────────────────────────────────────────
  const [showAllTagsModal, setShowAllTagsModal] = useState(false);

  // ─── Saved State & Dirty Tracking ──────────────────────────────────────────
  const [savedState, setSavedState] = useState<SavedBeatState | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // ─── Confirmation Dialog State ─────────────────────────────────────────────
  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean;
    action: ConfirmAction;
    message: string;
  } | null>(null);

  // ─── Reset Handler (defined early for useCreateBeat) ───────────────────────
  const handleReset = useCallback(() => {
    setTitle("");
    setKey("");
    setBpm("");
    setCatalogId("");
    setStatus("idea");
    setNotes("");
    setSelectedFile("");
    setSelectedFlp("");
    setSourceFolderPath(null);
    setCreatedDate(null);
    setYearMonth("");
    setAudioFiles([]);
    setFlpFiles([]);
    setCoverImage(null);
    setCoverSourcePath(null);
    clearTags();
    setSavedState(null);
    setIsDirty(false);
    setEditMode(false);
    setParseError(null);
  }, [clearTags]);

  // ─── Archive Hook ──────────────────────────────────────────────────────────
  const {
    isArchiving,
    archiveError,
    duplicateDialog,
    successDialog,
    handleCreateBeatstructure,
    handleDuplicateCreateV2,
    handleDuplicateCancel,
    handleSuccessClose,
    clearError,
  } = useCreateBeat({
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
    onReset: handleReset,
    setCatalogId,
  });

  // ─── Live Preview Values ───────────────────────────────────────────────────
  const previewPath = useMemo(() => {
    const id = parseInt(catalogId.replace("#", "")) || 0;
    const ym = yearMonth || getYearMonthFolder(new Date());
    return generatePreviewPath(id, title || "SONGNAME", key || null, parseInt(bpm) || null, ym);
  }, [catalogId, title, key, bpm, yearMonth]);

  // ─── Dirty Detection ───────────────────────────────────────────────────────
  useEffect(() => {
    if (sourceFolderPath && !savedState) {
      setIsDirty(true);
    } else if (savedState) {
      const currentIsDifferent =
        title !== savedState.title ||
        key !== savedState.key ||
        bpm !== savedState.bpm ||
        status !== savedState.status ||
        notes !== savedState.notes ||
        coverImage !== savedState.coverImage ||
        JSON.stringify(tags) !== JSON.stringify(savedState.tags);
      setIsDirty(currentIsDifferent);
    } else {
      setIsDirty(false);
    }
  }, [title, key, bpm, status, notes, coverImage, tags, sourceFolderPath, savedState]);

  // ─── Get Current State Snapshot ────────────────────────────────────────────
  const getCurrentState = useCallback((): SavedBeatState => ({
    title, key, bpm, catalogId, status, notes,
    selectedFile, selectedFlp, sourceFolderPath, createdDate, yearMonth,
    audioFiles, flpFiles, coverImage, coverSourcePath, tags: [...tags],
  }), [title, key, bpm, catalogId, status, notes, selectedFile, selectedFlp, sourceFolderPath, createdDate, yearMonth, audioFiles, flpFiles, coverImage, coverSourcePath, tags]);

  // ─── Apply Changes Handler ─────────────────────────────────────────────────
  const handleApply = useCallback(() => {
    setSavedState(getCurrentState());
    setIsDirty(false);
  }, [getCurrentState]);

  // ─── Restore to Saved State ─────────────────────────────────────────────────
  const restoreToSavedState = useCallback(() => {
    if (savedState) {
      setTitle(savedState.title);
      setKey(savedState.key);
      setBpm(savedState.bpm);
      setCatalogId(savedState.catalogId);
      setStatus(savedState.status);
      setNotes(savedState.notes);
      setSelectedFile(savedState.selectedFile);
      setSelectedFlp(savedState.selectedFlp);
      setSourceFolderPath(savedState.sourceFolderPath);
      setCreatedDate(savedState.createdDate);
      setYearMonth(savedState.yearMonth);
      setAudioFiles(savedState.audioFiles);
      setFlpFiles(savedState.flpFiles);
      setCoverImage(savedState.coverImage);
      setCoverSourcePath(savedState.coverSourcePath);
      tagsHook.setTags(savedState.tags);
      setIsDirty(false);
    } else {
      // Kein savedState vorhanden = komplett zurücksetzen
      handleReset();
    }
  }, [savedState, handleReset, tagsHook]);

  // ─── Confirm Dialog Handlers ───────────────────────────────────────────────
  const handleConfirmDiscard = useCallback(() => {
    const action = confirmDialog?.action;
    setConfirmDialog(null);
    
    if (action === "switch-to-view") {
      // Änderungen verwerfen = auf savedState zurücksetzen
      restoreToSavedState();
      setEditMode(false);
    } else if (action === "reset") {
      handleReset();
    }
  }, [confirmDialog, handleReset, restoreToSavedState]);

  const handleConfirmApply = useCallback(() => {
    handleApply();
    const action = confirmDialog?.action;
    setConfirmDialog(null);
    if (action === "switch-to-view") setEditMode(false);
  }, [confirmDialog, handleApply]);

  const handleConfirmCancel = useCallback(() => {
    setConfirmDialog(null);
  }, []);

  // ─── Mode Switch Handler ───────────────────────────────────────────────────
  const handleModeSwitch = useCallback((newMode: "VIEW" | "EDIT") => {
    if (newMode === "EDIT") {
      setEditMode(true);
      return;
    }
    if (isDirty) {
      setConfirmDialog({
        show: true,
        action: "switch-to-view",
        message: "You have unsaved changes. Would you like to save them before switching to View mode?",
      });
    } else {
      setEditMode(false);
    }
  }, [isDirty]);

  // ─── Reset Button Handler ──────────────────────────────────────────────────
  const handleResetClick = useCallback(() => {
    if (sourceFolderPath || savedState) {
      setConfirmDialog({
        show: true,
        action: "reset",
        message: "This will clear all current data and reset the form. Are you sure?",
      });
    }
  }, [sourceFolderPath, savedState]);

  // ─── Folder Selection Handler ──────────────────────────────────────────────
  const handleSelectFolder = useCallback(async () => {
    setParseError(null);
    const folder = await selectBeatFolder();
    if (!folder) return;

    setIsLoading(true);
    setSourceFolderPath(folder);

    try {
      const parsed = await invoke<ParsedBeatFolder>("parse_beat_folder_for_create", {
        folderPath: folder,
      });

      setTitle(parsed.name);
      setKey(parsed.key || "");
      setBpm(parsed.bpm?.toString() || "");
      setCatalogId(`#${String(parsed.suggested_id).padStart(4, "0")}`);
      setCreatedDate(parsed.created_date);
      setYearMonth(parsed.year_month);
      setAudioFiles(parsed.audio_files);

      if (parsed.audio_files.length > 0) {
        setSelectedFile(parsed.audio_files[0].path);
      }

      // FLP Files
      if (parsed.flp_files && parsed.flp_files.length > 0) {
        setFlpFiles(parsed.flp_files);
        const newest = parsed.flp_files.find(f => f.is_newest) || parsed.flp_files[0];
        setSelectedFlp(newest.path);
      } else if (parsed.flp_path) {
        const legacyFlp: FlpFileInfo = {
          path: parsed.flp_path,
          name: parsed.flp_path.split(/[/\\]/).pop() || "project.flp",
          size: 0,
          modified_at: "",
          is_master: parsed.flp_path.toLowerCase().includes("master"),
          is_newest: true,
        };
        setFlpFiles([legacyFlp]);
        setSelectedFlp(parsed.flp_path);
      } else {
        setFlpFiles([]);
        setSelectedFlp("");
      }

      // Cover
      if (parsed.cover_path) {
        setCoverSourcePath(parsed.cover_path);
        try {
          const coverBase64 = await invoke<string>("read_image_file", { filePath: parsed.cover_path });
          setCoverImage(coverBase64);
        } catch (err) {
          console.error("Failed to load cover:", err);
        }
      } else {
        setCoverImage(null);
        setCoverSourcePath(null);
      }

      setEditMode(true);
      setParseError(null);
    } catch (err) {
      console.error("Failed to parse folder:", err);
      setParseError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ─── Cover Selection Handler ───────────────────────────────────────────────
  const handleSelectCover = useCallback(async () => {
    if (!editMode) return;
    const filePath = await selectCoverImage();
    if (!filePath) return;

    setCoverSourcePath(filePath);
    try {
      const coverBase64 = await invoke<string>("read_image_file", { filePath });
      setCoverImage(coverBase64);
    } catch (err) {
      console.error("Failed to load cover:", err);
    }
  }, [editMode]);

  // ─── Check if we have data ─────────────────────────────────────────────────
  const hasData = Boolean(sourceFolderPath || savedState);

  // ═══════════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", background: C.background }}>
      
      {/* Header */}
      <CreateHeader
        editMode={editMode}
        isDirty={isDirty}
        hasData={hasData}
        onModeSwitch={handleModeSwitch}
        onResetClick={handleResetClick}
        onApply={handleApply}
      />

      {/* Scrollable Main Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "32px 48px", paddingBottom: 100 }}>
        <div style={{ maxWidth: 1400, display: "flex", gap: 40 }}>

          {/* Left Column: Form Cards */}
          <div style={{ flex: "0 0 58%", display: "flex", flexDirection: "column", gap: 24 }}>
            
            {parseError && <ErrorBanner message={parseError} />}

            <BeatInfoCard
              title={title}
              setTitle={setTitle}
              keyValue={key}
              setKey={setKey}
              bpm={bpm}
              setBpm={setBpm}
              catalogId={catalogId}
              setCatalogId={setCatalogId}
              createdDate={createdDate}
              yearMonth={yearMonth}
              editMode={editMode}
            />

            <StatusCard
              status={status}
              setStatus={setStatus}
              editMode={editMode}
            />

            <TagsCard
              tagsHook={tagsHook}
              editMode={editMode}
              onShowAllTags={() => setShowAllTagsModal(true)}
            />

            <SourceFilesCard
              audioFiles={audioFiles}
              selectedFile={selectedFile}
              setSelectedFile={setSelectedFile}
              flpFiles={flpFiles}
              selectedFlp={selectedFlp}
              setSelectedFlp={setSelectedFlp}
              editMode={editMode}
            />

            <NotesCard
              notes={notes}
              setNotes={setNotes}
              editMode={editMode}
            />
          </div>

          {/* Right Column: Preview */}
          <div style={{ flex: 1 }}>
            <PreviewCard
              title={title}
              keyValue={key}
              bpm={bpm}
              catalogId={catalogId}
              status={status}
              tags={tags}
              coverImage={coverImage}
              previewPath={previewPath}
              editMode={editMode}
              onSelectCover={handleSelectCover}
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <CreateFooter
        isLoading={isLoading}
        isArchiving={isArchiving}
        sourceFolderPath={sourceFolderPath}
        editMode={editMode}
        savedState={savedState}
        isDirty={isDirty}
        title={title}
        onSelectFolder={handleSelectFolder}
        onCreateBeatstructure={() => handleCreateBeatstructure()}
      />

      {/* Keyframes */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>

      {/* Modals */}
      {showAllTagsModal && (
        <AllTagsModal
          selectedTags={tags}
          customTags={tagsHook.customTags}
          onAddTag={tagsHook.addTag}
          onRemoveTag={tagsHook.removeTag}
          onClose={() => setShowAllTagsModal(false)}
          editMode={editMode}
        />
      )}

      {confirmDialog?.show && (
        <ConfirmDialog
          message={confirmDialog.message}
          onDiscard={handleConfirmDiscard}
          onApply={confirmDialog.action !== "reset" ? handleConfirmApply : undefined}
          onCancel={handleConfirmCancel}
          showApply={confirmDialog.action !== "reset"}
        />
      )}

      {duplicateDialog?.show && (
        <DuplicateDialog
          duplicateType={duplicateDialog.duplicateType}
          existingId={duplicateDialog.existingId}
          existingName={duplicateDialog.existingName}
          onCreateV2={handleDuplicateCreateV2}
          onCancel={handleDuplicateCancel}
        />
      )}

      {successDialog?.show && (
        <SuccessDialog
          archivePath={successDialog.archivePath}
          beatId={successDialog.beatId}
          filesCopied={successDialog.filesCopied}
          onClose={handleSuccessClose}
        />
      )}

      {archiveError && (
        <ErrorToast message={archiveError} onClose={clearError} />
      )}
    </div>
  );
}
