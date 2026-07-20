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
import { CreateAssetsCard } from "../components/create/CreateAssetsCard";
import { useSettings } from "../contexts/SettingsContext";

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

  // ─── Asset-Slots (Cover/Thumbnail/Video im Beat-Ordner) ────────────────────
  const [coverImage, setCoverImage] = useState<string | null>(null);   // base64-Preview
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [thumbnailPath, setThumbnailPath] = useState<string | null>(null);
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [isRefreshingAssets, setIsRefreshingAssets] = useState(false);

  // ─── Tag Manager ───────────────────────────────────────────────────────────
  const { openTagManager } = useTagManager();
  const { settings } = useSettings();
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
    setCoverPath(null);
    setThumbnailPreview(null);
    setThumbnailPath(null);
    setVideoPath(null);
    setPreset(null);
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
    assets: { hasCover: Boolean(coverPath), hasThumbnail: Boolean(thumbnailPath), hasVideo: Boolean(videoPath) },
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

  // ─── Asset-Slots aus einem Parse-Ergebnis übernehmen ───────────────────────
  // Bewusst getrennt vom Formular: Nach dem Zuweisen von Cover/Thumbnail/Video
  // wird nur DAS hier aktualisiert — Titel, Key, BPM, Tags und Notizen bleiben
  // stehen, auch wenn der Nutzer sie schon getippt hat.
  const applyAssetSlots = useCallback(async (parsed: {
    cover_path: string | null;
    thumbnail_path: string | null;
    video_path: string | null;
  }) => {
    setCoverPath(parsed.cover_path);
    setThumbnailPath(parsed.thumbnail_path);
    setVideoPath(parsed.video_path);

    const loadPreview = async (path: string | null) => {
      if (!path) return null;
      try { return await api.create.readImageFile(path); }
      catch { return null; }
    };
    const [cover, thumb] = await Promise.all([
      loadPreview(parsed.cover_path),
      loadPreview(parsed.thumbnail_path),
    ]);
    setCoverImage(cover);
    setThumbnailPreview(thumb);
  }, []);

  /** Nach einer Asset-Zuweisung: Ordner neu lesen, aber nur die Slots setzen. */
  const refreshAssets = useCallback(async () => {
    if (!sourceFolderPath) return;
    setIsRefreshingAssets(true);
    try {
      const parsed = await api.create.parseBeatFolder(sourceFolderPath);
      await applyAssetSlots(parsed);
    } catch (err) {
      console.error("Failed to refresh assets:", err);
    } finally {
      setIsRefreshingAssets(false);
    }
  }, [sourceFolderPath, applyAssetSlots]);

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

      await applyAssetSlots(parsed);

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
        <div style={{ maxWidth: 1500, margin: "0 auto", display: "flex", gap: 24, alignItems: "flex-start" }}>

          {/* Links: Was wird archiviert? */}
          <div style={{ flex: "0 0 55%", display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>

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

            {/* Status + Preset teilen sich eine Zeile — beide sind schmal */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
              <StatusCard
                status={status}
                setStatus={setStatus}
              />
              <PresetPicker selected={preset} onSelect={setPreset} />
            </div>

            <TagsCard
              tagsHook={tagsHook}
              onShowAllTags={handleOpenTagManager}
            />

            <NotesCard
              notes={notes}
              setNotes={setNotes}
            />
          </div>

          {/* Rechts: Womit? — Assets zuerst, Preview klebt beim Scrollen */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
            <CreateAssetsCard
              assets={{ coverPreview: coverImage, coverPath, thumbnailPreview, thumbnailPath, videoPath }}
              sourceFolderPath={sourceFolderPath}
              assetPath={settings.assetPath}
              isRefreshing={isRefreshingAssets}
              onRefresh={refreshAssets}
            />

            <SourceFilesCard
              audioFiles={audioFiles}
              selectedFile={selectedFile}
              setSelectedFile={setSelectedFile}
              flpFiles={flpFiles}
              selectedFlp={selectedFlp}
              setSelectedFlp={setSelectedFlp}
            />

            <div style={{ position: "sticky", top: 0 }}>
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
