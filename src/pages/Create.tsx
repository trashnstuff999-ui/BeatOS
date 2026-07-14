// src/pages/Create.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// BeatOS Archive Portal — Refactored Main Component
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";

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
  DuplicateDialog,
  SuccessDialog,
} from "../components/create/dialogs";

// ─── Hook Imports ───────────────────────────────────────────────────────────
import { useTags } from "../hooks/useTags";
import { useCreateBeat } from "../hooks/useCreateBeat";
import { useTagManager } from "../contexts/TagManagerContext";

// ─── Lib Imports ────────────────────────────────────────────────────────────
import { C } from "../lib/theme";
import { selectBeatFolder, getYearMonthFolder } from "../lib/archive";

// ─── Type Imports ───────────────────────────────────────────────────────────
import type {
  AudioFileInfo,
  FlpFileInfo,
} from "../types/create";
import type { TypeBeatPreset } from "../types/upload";
import { PresetPicker } from "../components/create/PresetPicker";

// ═══════════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════════

export default function Create() {
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
  const [autoRename, setAutoRename] = useState(true);
  const [trashSource, setTrashSource] = useState(true);
  const [preset, setPreset] = useState<TypeBeatPreset | null>(null);

  // ─── Parsed Folder State ───────────────────────────────────────────────────
  const [audioFiles, setAudioFiles] = useState<AudioFileInfo[]>([]);
  const [flpFiles, setFlpFiles] = useState<FlpFileInfo[]>([]);
  const [selectedFlp, setSelectedFlp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // ─── Tags Hook ─────────────────────────────────────────────────────────────
  const tagsHook = useTags();
  const { tags, clearTags } = tagsHook;

  // ─── Cover State (auto-detected from source folder, display only) ─────────
  const [coverImage, setCoverImage] = useState<string | null>(null);

  // ─── Tag Manager ───────────────────────────────────────────────────────────
  const { openTagManager } = useTagManager();
  const handleOpenTagManager = useCallback(() => {
    openTagManager({
      initialSelected: tags,
      onConfirm: (newTags) => {
        tagsHook.setTags(newTags);
        tagsHook.reloadCustomTags();
      },
      editMode: true,
    });
  }, [tags, tagsHook.setTags, tagsHook.reloadCustomTags, openTagManager]);

  // ─── Reset Handler ─────────────────────────────────────────────────────────
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
    clearTags();
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
    yearMonth,
    autoRename,
    trashSource,
    preset,
    onReset: handleReset,
    setCatalogId,
  });

  // ─── Live Preview Values ───────────────────────────────────────────────────
  // The path is built in Rust (preview_archive_path) with the exact same
  // logic as archive_beat, so preview and result can never diverge.
  const [previewPath, setPreviewPath] = useState("");
  useEffect(() => {
    const id = parseInt(catalogId.replace("#", "")) || 0;
    const ym = yearMonth || getYearMonthFolder(new Date());
    let cancelled = false;
    api.archive
      .previewPath(id, title || "SONGNAME", key || null, parseInt(bpm) || null, ym)
      .then(rel => { if (!cancelled) setPreviewPath(`/ARCHIVE/${rel}/`); })
      .catch(() => { if (!cancelled) setPreviewPath(""); });
    return () => { cancelled = true; };
  }, [catalogId, title, key, bpm, yearMonth]);

  // ─── Reset Button Handler ──────────────────────────────────────────────────
  const handleResetClick = useCallback(() => {
    if (sourceFolderPath) handleReset();
  }, [sourceFolderPath, handleReset]);

  // ─── Folder Loading ─────────────────────────────────────────────────────────
  // Split: pick (dialog) vs. load (parse flow) — the Studio tab jumps in here
  // directly with a folder path via router state.
  const loadFolder = useCallback(async (folder: string) => {
    setParseError(null);
    setIsLoading(true);
    setSourceFolderPath(folder);

    try {
      const parsed = await api.create.parseBeatFolder(folder);

      setTitle(parsed.name);
      setKey(parsed.key || "");
      setBpm(parsed.bpm?.toString() || "");
      setCatalogId(`#${String(parsed.suggested_id).padStart(4, "0")}`);
      setCreatedDate(parsed.created_date);
      setYearMonth(parsed.year_month);
      setAudioFiles(parsed.audio_files);

      if (parsed.audio_files.length > 0) {
        folderLoadRef.current = true;
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

      // Cover (auto-detected from source folder — display only)
      if (parsed.cover_path) {
        try {
          const coverBase64 = await api.create.readImageFile(parsed.cover_path);
          setCoverImage(coverBase64);
        } catch (err) {
          console.error("Failed to load cover:", err);
          setCoverImage(null);
        }
      } else {
        setCoverImage(null);
      }

      setParseError(null);
    } catch (err) {
      console.error("Failed to parse folder:", err);
      setParseError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSelectFolder = useCallback(async () => {
    setParseError(null);
    const folder = await selectBeatFolder();
    if (!folder) return;
    await loadFolder(folder);
  }, [loadFolder]);

  // ─── Studio → Create bridge ─────────────────────────────────────────────────
  // Studio's "Archivieren" navigates here with { state: { sourceFolder } }.
  // Create is permanently mounted, so we listen on the location and consume
  // the state (replace) to avoid re-triggering on later navigations.
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const incoming = (location.state as { sourceFolder?: string } | null)?.sourceFolder;
    if (location.pathname === "/create" && incoming) {
      loadFolder(incoming);
      navigate("/create", { replace: true, state: null });
    }
  }, [location, loadFolder, navigate]);

  // ─── Auto-parse filename when selected audio file changes ─────────────────
  // Using a ref+effect instead of an event wrapper to avoid all closure issues.
  // folderLoadRef is set to true during folder load so the initial auto-selection
  // doesn't overwrite the title/key/bpm that the folder parser already set.
  const folderLoadRef = useRef(false);

  useEffect(() => {
    if (folderLoadRef.current) {
      folderLoadRef.current = false;
      return;
    }
    if (!selectedFile || audioFiles.length === 0) return;
    const fileInfo = audioFiles.find(f => f.path === selectedFile);
    if (!fileInfo) return;
    const match = fileInfo.name.match(/^(.+?)\s*\[([A-Ga-g][#b]?(?:maj|m)?)\s+(\d+)\]/i);
    if (match) {
      setTitle(match[1].trim());
      setKey(match[2]);
      setBpm(match[3]);
    }
  }, [selectedFile]); // eslint-disable-line react-hooks/exhaustive-deps

  // ═══════════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: C.background }}>

      {/* Header */}
      <CreateHeader
        hasData={Boolean(sourceFolderPath)}
        onResetClick={handleResetClick}
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
            />

            <StatusCard
              status={status}
              setStatus={setStatus}
            />

            <PresetPicker selected={preset} onSelect={setPreset} />

            <TagsCard
              tagsHook={tagsHook}
              onShowAllTags={handleOpenTagManager}
            />

            <SourceFilesCard
              audioFiles={audioFiles}
              selectedFile={selectedFile}
              setSelectedFile={setSelectedFile}
              flpFiles={flpFiles}
              selectedFlp={selectedFlp}
              setSelectedFlp={setSelectedFlp}
            />

            <NotesCard
              notes={notes}
              setNotes={setNotes}
            />
          </div>

          {/* Right Column: Preview */}
          <div style={{ flex: 1 }}>
            <PreviewCard
              title={title}
              keyValue={key}
              bpm={bpm}
              catalogId={catalogId}
              tags={tags}
              coverImage={coverImage}
              previewPath={previewPath}
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <CreateFooter
        isLoading={isLoading}
        isArchiving={isArchiving}
        sourceFolderPath={sourceFolderPath}
        title={title}
        autoRename={autoRename}
        onAutoRenameChange={setAutoRename}
        trashSource={trashSource}
        onTrashSourceChange={setTrashSource}
        onSelectFolder={handleSelectFolder}
        onCreateBeatstructure={() => handleCreateBeatstructure()}
      />

      {/* Keyframes */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>

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
          sourceFolder={successDialog.sourceFolder}
          warning={successDialog.warning}
          sourceTrashed={successDialog.sourceTrashed}
          onClose={handleSuccessClose}
        />
      )}

      {archiveError && (
        <ErrorToast message={archiveError} onClose={clearError} />
      )}
    </div>
  );
}
