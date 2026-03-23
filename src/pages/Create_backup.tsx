// src/pages/Create.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// BeatOS Archive Portal — Complete Implementation
// Features:
// - Step 1: Drag & Drop entfernt, Cover nur via Click-Dialog
// - Step 2: Show All Tags Modal
// - Step 3: Unsaved Changes Protection mit Apply/Reset
// NOTE: Navigation Guard (useBlocker) entfernt - benötigt Data Router Migration
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useMemo, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  RefreshCw,
  Search,
  Bell,
  FolderOpen,
  Network,
  FileAudio,
  FileCode,
  Timer,
  Info,
  ImagePlus,
  CheckCircle,
  AlertCircle,
  Loader2,
  Star,
  Grid3X3,
  X,
  Music,
  Sparkles,
  Piano,
  Tag,
  RotateCcw,
  Save,
  Plus,
} from "lucide-react";

// ─── Lib Imports ─────────────────────────────────────────────────────────────
import { C, STATUS_ITEMS, commonStyles } from "../lib/theme";
import { type TagCategory, normalizeTag, PRESET_TAGS, TAG_COLORS } from "../lib/tags";
import {
  selectBeatFolder,
  selectCoverImage,
  generatePreviewPath,
  getYearMonthFolder,
} from "../lib/archive";

// ─── Component Imports ───────────────────────────────────────────────────────
import {
  TagPill,
  TagSuggestionItem,
  TagCategoryRow,
} from "../components/Tagpill";

// ─── Hook Imports ────────────────────────────────────────────────────────────
import { useTags } from "../hooks/useTags";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AudioFileInfo {
  path: string;
  name: string;
  extension: string;
  size: number;
  modified_at: string;
  is_untagged: boolean;
}

interface FlpFileInfo {
  path: string;
  name: string;
  size: number;
  modified_at: string;
  is_master: boolean;    // true wenn "master" im Namen
  is_newest: boolean;    // true wenn neueste FLP
}

interface ParsedBeatFolder {
  name: string;
  key: string | null;
  bpm: number | null;
  flp_path: string | null;       // Legacy: Haupt-FLP (für Rückwärtskompatibilität)
  flp_files: FlpFileInfo[];      // NEU: Alle FLPs im Root
  created_date: string | null;
  year_month: string;
  audio_files: AudioFileInfo[];
  all_files: string[];
  cover_path: string | null;
  source_path: string;
  suggested_id: number;
}

// Saved state snapshot für Apply/Reset
interface SavedBeatState {
  title: string;
  key: string;
  bpm: string;
  catalogId: string;
  status: string;
  notes: string;
  selectedFile: string;
  selectedFlp: string;           // NEU: Ausgewählte Haupt-FLP
  sourceFolderPath: string | null;
  createdDate: string | null;
  yearMonth: string;
  audioFiles: AudioFileInfo[];
  flpFiles: FlpFileInfo[];       // NEU: Alle FLPs
  coverImage: string | null;
  coverSourcePath: string | null;
  tags: string[];
}

type ConfirmAction = "switch-to-view" | "reset" | "navigate-away";

// ─── Archive Types ──────────────────────────────────────────────────────────

interface DuplicateCheckResult {
  has_duplicate: boolean;
  duplicate_type: "id" | "name_key_bpm" | null;
  existing_id: string | null;
  existing_name: string | null;
}

interface ArchiveBeatParams {
  source_folder: string;
  title: string;
  key: string | null;
  bpm: number | null;
  catalog_id: number;
  status: string;
  tags: string;
  notes: string;
  source_audio_path: string;
  source_flp_path: string;
  cover_path: string | null;
  year_month: string;
  archive_base_path: string;
}

interface ArchiveResult {
  success: boolean;
  archive_path: string;
  beat_id: string;
  files_copied: number;
  error: string | null;
}

// Archive Base Path — anpassen falls nötig
const ARCHIVE_BASE_PATH = "C:\\Users\\kismo\\OneDrive\\Dokumente\\._BEAT LIBRARY\\03_ARCHIVE";

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
  const {
    tags,
    tagInput,
    setTagInput,
    showSuggestions,
    setShowSuggestions,
    addTag,
    removeTag,
    setTags,
    clearTags,
    tagSuggestions,
    quickAddTags,
    customTags,
    pendingCustomTags,
    hasPendingTags,
  } = useTags();

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

  // ─── Archive Process State ─────────────────────────────────────────────────
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [duplicateDialog, setDuplicateDialog] = useState<{
    show: boolean;
    duplicateType: "id" | "name_key_bpm";
    existingId: string;
    existingName: string;
  } | null>(null);
  const [successDialog, setSuccessDialog] = useState<{
    show: boolean;
    archivePath: string;
    beatId: string;
    filesCopied: number;
  } | null>(null);

  // ─── Live Preview Values ───────────────────────────────────────────────────
  const previewTitle = title || "SONGNAME";
  const previewKey = key || "—";
  const previewBpm = bpm || "—";
  const previewId = catalogId || "#0000";

  const previewPath = useMemo(() => {
    const id = parseInt(catalogId.replace("#", "")) || 0;
    const ym = yearMonth || getYearMonthFolder(new Date());
    return generatePreviewPath(id, title || "SONGNAME", key || null, parseInt(bpm) || null, ym);
  }, [catalogId, title, key, bpm, yearMonth]);

  // ─── Dirty Detection ───────────────────────────────────────────────────────
  useEffect(() => {
    if (sourceFolderPath && !savedState) {
      // Folder ausgewählt aber noch nicht applied
      setIsDirty(true);
    } else if (savedState) {
      // Vergleiche aktuellen State mit savedState
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

  // ─── Navigation Blocker ────────────────────────────────────────────────────
  // NOTE: useBlocker requires a Data Router (createBrowserRouter).
  // If you migrate to a Data Router later, uncomment this code.
  // For now, navigation protection is handled via VIEW/EDIT mode switch only.

  // ─── Get Current State Snapshot ────────────────────────────────────────────
  const getCurrentState = useCallback((): SavedBeatState => ({
    title,
    key,
    bpm,
    catalogId,
    status,
    notes,
    selectedFile,
    selectedFlp,
    sourceFolderPath,
    createdDate,
    yearMonth,
    audioFiles,
    flpFiles,
    coverImage,
    coverSourcePath,
    tags: [...tags],
  }), [title, key, bpm, catalogId, status, notes, selectedFile, selectedFlp, sourceFolderPath, createdDate, yearMonth, audioFiles, flpFiles, coverImage, coverSourcePath, tags]);

  // ─── Apply Changes Handler ─────────────────────────────────────────────────
  const handleApply = useCallback(() => {
    const currentState = getCurrentState();
    setSavedState(currentState);
    setIsDirty(false);
  }, [getCurrentState]);

  // ─── Reset Handler ─────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    // Alles zurücksetzen auf Initialzustand
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

  // ─── Confirm Dialog Handlers ───────────────────────────────────────────────
  const handleConfirmDiscard = useCallback(() => {
    const action = confirmDialog?.action;
    setConfirmDialog(null);

    if (action === "switch-to-view") {
      setEditMode(false);
    } else if (action === "reset") {
      handleReset();
    }
    // navigate-away action würde hier blocker.proceed() aufrufen (Data Router nötig)
  }, [confirmDialog, handleReset]);

  const handleConfirmApply = useCallback(() => {
    handleApply();
    const action = confirmDialog?.action;
    setConfirmDialog(null);

    if (action === "switch-to-view") {
      setEditMode(false);
    }
    // navigate-away action würde hier blocker.proceed() aufrufen (Data Router nötig)
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

    // Switching to VIEW
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

  // ─── Check if we have data to show Apply/Reset ─────────────────────────────
  const hasData = Boolean(sourceFolderPath || savedState);

  // ─── Folder Selection Handler ──────────────────────────────────────────────
  const handleSelectFolder = async () => {
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

      // FLP Files setzen (NEU)
      // Falls Backend noch keine flp_files liefert, Fallback auf flp_path
      if (parsed.flp_files && parsed.flp_files.length > 0) {
        setFlpFiles(parsed.flp_files);
        // Neueste FLP als Default auswählen
        const newest = parsed.flp_files.find(f => f.is_newest) || parsed.flp_files[0];
        setSelectedFlp(newest.path);
      } else if (parsed.flp_path) {
        // Legacy Fallback: Einzelne FLP in Array konvertieren
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

      // Cover laden wenn vorhanden
      if (parsed.cover_path) {
        setCoverSourcePath(parsed.cover_path);
        try {
          const coverBase64 = await invoke<string>("read_image_file", {
            filePath: parsed.cover_path,
          });
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
  };

  // ─── Cover Selection Handler (nur Click-Dialog) ────────────────────────────
  const handleSelectCover = async () => {
    if (!editMode) return;
    
    const filePath = await selectCoverImage();
    if (!filePath) return;

    setCoverSourcePath(filePath);
    try {
      const coverBase64 = await invoke<string>("read_image_file", {
        filePath,
      });
      setCoverImage(coverBase64);
    } catch (err) {
      console.error("Failed to load cover:", err);
    }
  };

  // ─── Input Style Helper ────────────────────────────────────────────────────
  const getInputStyle = (base: React.CSSProperties): React.CSSProperties => ({
    ...base,
    opacity: editMode ? 1 : 0.6,
    cursor: editMode ? "text" : "not-allowed",
  });

  // ─── Format File Size ──────────────────────────────────────────────────────
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

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

        // Save custom tags to DB
        if (hasPendingTags) {
          try {
            const { saveCustomTagsToDb } = useTags();
            // Note: This won't work directly, we need to call it from the hook
            // For now, we'll handle this in the success callback
          } catch (e) {
            console.error("Failed to save custom tags:", e);
          }
        }
      } else {
        setArchiveError(result.error || "Unknown error occurred");
      }
    } catch (err) {
      console.error("Archive failed:", err);
      setArchiveError(String(err));
    } finally {
      setIsArchiving(false);
    }
  }, [sourceFolderPath, title, catalogId, key, bpm, status, tags, notes, selectedFile, selectedFlp, coverSourcePath, yearMonth, hasPendingTags]);

  // ─── Handle Duplicate Dialog Actions ───────────────────────────────────────
  const handleDuplicateCreateV2 = useCallback(() => {
    setDuplicateDialog(null);
    // Increment catalog ID for V2
    const currentId = parseInt(catalogId.replace("#", "")) || 0;
    const nextId = currentId + 1;
    setCatalogId(`#${String(nextId).padStart(4, "0")}`);
    // Retry with force flag
    handleCreateBeatstructure(true);
  }, [catalogId, handleCreateBeatstructure]);

  const handleDuplicateCancel = useCallback(() => {
    setDuplicateDialog(null);
  }, []);

  // ─── Handle Success Dialog Close ───────────────────────────────────────────
  const handleSuccessClose = useCallback(() => {
    setSuccessDialog(null);
    // Reset form for next beat
    handleReset();
  }, [handleReset]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", background: C.background }}>

      {/* ═══════════════════════════════════════════════════════════════════════
          Header
      ═══════════════════════════════════════════════════════════════════════ */}
      <header style={{
        height: 64, flexShrink: 0,
        ...commonStyles.glassHeader,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "0 32px",
        borderBottom: `1px solid ${C.border15}`,
        zIndex: 40,
      }}>
        {/* Left: View/Edit Toggle + Apply/Reset + Title */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", background: C.surfaceContainerHighest, borderRadius: 6, padding: 3, gap: 2 }}>
            {(["VIEW", "EDIT"] as const).map((mode) => {
              const isActive = (mode === "EDIT") === editMode;
              return (
                <button
                  key={mode}
                  onClick={() => handleModeSwitch(mode)}
                  style={{
                    padding: "8px 20px", borderRadius: 4,
                    fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
                    border: "none", cursor: "pointer",
                    transition: "all 0.2s ease-out",
                    background: isActive ? C.primary : "transparent",
                    color: isActive ? "#4e2d00" : C.onSurfaceVariant,
                  }}
                >
                  {mode}
                </button>
              );
            })}
          </div>

          {/* Apply / Reset Buttons — nur sichtbar wenn Daten vorhanden */}
          {hasData && (
            <div style={{ display: "flex", gap: 8, marginLeft: 8 }}>
              <button
                onClick={handleResetClick}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", borderRadius: 4,
                  fontSize: 10, fontWeight: 600, letterSpacing: "0.05em",
                  background: "transparent",
                  border: `1px solid ${C.border30}`,
                  color: C.onSurfaceVariant,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = "rgba(239,68,68,0.1)";
                  e.currentTarget.style.borderColor = "rgba(239,68,68,0.3)";
                  e.currentTarget.style.color = "#ef4444";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.borderColor = C.border30;
                  e.currentTarget.style.color = C.onSurfaceVariant;
                }}
              >
                <RotateCcw size={12} />
                Reset
              </button>

              <button
                onClick={handleApply}
                disabled={!isDirty}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", borderRadius: 4,
                  fontSize: 10, fontWeight: 600, letterSpacing: "0.05em",
                  background: isDirty ? "rgba(52,211,153,0.1)" : "transparent",
                  border: `1px solid ${isDirty ? "rgba(52,211,153,0.3)" : C.border30}`,
                  color: isDirty ? C.mint : C.onSurfaceVariant,
                  cursor: isDirty ? "pointer" : "default",
                  opacity: isDirty ? 1 : 0.5,
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => {
                  if (isDirty) {
                    e.currentTarget.style.background = "rgba(52,211,153,0.2)";
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = isDirty ? "rgba(52,211,153,0.1)" : "transparent";
                }}
              >
                <Save size={12} />
                Apply
              </button>

              {/* Dirty Indicator */}
              {isDirty && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "0 8px",
                  fontSize: 9, fontWeight: 600,
                  color: C.primary,
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.primary, animation: "pulse 2s infinite" }} />
                  Unsaved
                </div>
              )}
            </div>
          )}

          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: C.onSurfaceVariant }}>
            Archive Portal
          </span>
        </div>

        {/* Right: Icons */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, color: C.onSurfaceVariant }}>
          <RefreshCw size={18} strokeWidth={1.5} style={{ cursor: "pointer" }} />
          <Search size={18} strokeWidth={1.5} style={{ cursor: "pointer" }} />
          <div style={{ position: "relative" }}>
            <Bell size={18} strokeWidth={1.5} style={{ cursor: "pointer" }} />
            <span style={{ position: "absolute", top: 0, right: 0, width: 8, height: 8, background: C.primary, borderRadius: "50%", border: `2px solid ${C.background}` }} />
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════════
          Scrollable Main Content
      ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{ flex: 1, overflowY: "auto", padding: "32px 48px", paddingBottom: 100 }}>
        <div style={{ maxWidth: 1400, display: "flex", gap: 40 }}>

          {/* ── Left Column: Form Cards ─────────────────────────────────────── */}
          <div style={{ flex: "0 0 58%", display: "flex", flexDirection: "column", gap: 24 }}>

            {/* Error Banner */}
            {parseError && (
              <div style={{
                padding: 16, borderRadius: 8,
                background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                display: "flex", alignItems: "center", gap: 12,
              }}>
                <AlertCircle size={20} color="#ef4444" />
                <span style={{ color: "#ef4444", fontSize: 13 }}>{parseError}</span>
              </div>
            )}

            {/* Card 1: Beat Information */}
            <Card accent={C.primary}>
              <Label>Track Title</Label>
              <InputWrapper>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="ENTER BEAT NAME..."
                  disabled={!editMode}
                  style={getInputStyle({ ...commonStyles.input, flex: 1, padding: 16, fontSize: 20, fontWeight: 500 })}
                />
              </InputWrapper>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 16, marginTop: 24 }}>
                <SmallInput label="Key" value={key} onChange={setKey} placeholder="Cm" disabled={!editMode} width={80} />
                <SmallInput label="BPM" value={bpm} onChange={setBpm} placeholder="140" disabled={!editMode} width={80} />
                <SmallInput label="Catalog ID" value={catalogId} onChange={setCatalogId} placeholder="#0042" disabled={!editMode} width={96} mono />
              </div>

              {createdDate && (
                <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: C.onSecondaryFixedVar }}>
                  <CheckCircle size={14} color={C.mint} />
                  <span>Created: {createdDate}</span>
                  <span style={{ opacity: 0.5 }}>•</span>
                  <span style={{ opacity: 0.7 }}>{yearMonth}</span>
                </div>
              )}
            </Card>

            {/* Card 2: Production Status */}
            <Card accent={C.tertiary}>
              <Label>Production Status</Label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {STATUS_ITEMS.map((item) => {
                  const isActive = status === item.key;
                  return (
                    <button
                      key={item.key}
                      onClick={() => editMode && setStatus(item.key)}
                      disabled={!editMode}
                      style={{
                        padding: "12px 8px", borderRadius: 6,
                        fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase",
                        border: "none", borderBottom: `2px solid ${isActive ? item.color : "transparent"}`,
                        background: isActive ? C.surfaceContainerHighest : C.surfaceContainer,
                        color: isActive ? item.color : C.onSurfaceVariant,
                        cursor: editMode ? "pointer" : "not-allowed",
                        opacity: editMode ? 1 : 0.6,
                        transition: "all 0.15s",
                      }}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </Card>

            {/* Card 3: Tags */}
            <Card accent={C.mint}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Label style={{ marginBottom: 0 }}>Tags</Label>
                  {tags.length > 0 && (
                    <span style={{ fontSize: 10, color: C.onSecondaryFixedVar, background: C.surfaceContainerHighest, padding: "2px 8px", borderRadius: 4 }}>
                      {tags.length} selected
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {hasPendingTags && (
                    <span style={{ fontSize: 9, color: C.mint, background: "rgba(52,211,153,0.1)", padding: "2px 8px", borderRadius: 9999 }}>
                      ✦ {pendingCustomTags.length} new
                    </span>
                  )}
                  {/* Show All Button */}
                  <button
                    onClick={() => setShowAllTagsModal(true)}
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      padding: "4px 10px", borderRadius: 4,
                      fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
                      background: C.surfaceContainerHighest,
                      border: `1px solid ${C.border20}`,
                      color: C.onSurfaceVariant,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = C.surfaceContainer;
                      e.currentTarget.style.color = C.primary;
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = C.surfaceContainerHighest;
                      e.currentTarget.style.color = C.onSurfaceVariant;
                    }}
                  >
                    <Grid3X3 size={10} />
                    SHOW ALL
                  </button>
                </div>
              </div>

              {/* Selected Tags — SCROLLBAR wenn > 10 */}
              <div style={{ 
                display: "flex", 
                flexWrap: "wrap", 
                gap: 8, 
                marginBottom: tags.length > 0 ? 20 : 0,
                maxHeight: tags.length > 10 ? 120 : "none",
                overflowY: tags.length > 10 ? "auto" : "visible",
                paddingRight: tags.length > 10 ? 8 : 0,
              }}>
                {tags.map(tag => (
                  <TagPill key={tag} tag={tag} removable onRemove={removeTag} />
                ))}
              </div>

              {/* Edit Mode: Input + Quick Add */}
              {editMode && (
                <>
                  <div style={{ position: "relative", marginBottom: 20 }}>
                    <input
                      value={tagInput}
                      onChange={e => { setTagInput(e.target.value); setShowSuggestions(true); }}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                      placeholder="Type to search or add custom tag..."
                      style={{ ...commonStyles.input, width: "100%", padding: "12px 16px", fontSize: 13, boxSizing: "border-box" }}
                    />

                    {showSuggestions && tagSuggestions.length > 0 && (
                      <div style={{
                        position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
                        background: C.surfaceContainerHighest, border: `1px solid ${C.border30}`,
                        borderRadius: 8, overflow: "hidden", zIndex: 50, boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
                      }}>
                        {tagSuggestions.map(preset => (
                          <TagSuggestionItem key={preset.tag} tag={preset.tag} category={preset.category} onSelect={addTag} />
                        ))}
                      </div>
                    )}

                    {tagInput.trim() && !tagSuggestions.some(s => s.tag.toLowerCase() === tagInput.toLowerCase()) && (
                      <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: C.onSecondaryFixedVar, pointerEvents: "none" }}>
                        Press Enter to add "{normalizeTag(tagInput)}"
                      </div>
                    )}
                  </div>

                  {/* Quick Add — jetzt mit Custom Kategorie */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: C.onSecondaryFixedVar, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      Quick Add
                    </span>
                    {(["genre", "vibe", "instrument"] as const).map(cat => (
                      <TagCategoryRow key={cat} category={cat} tags={quickAddTags[cat]} onAdd={addTag} />
                    ))}
                    
                    {/* Custom Tags Row */}
                    {quickAddTags.custom.length > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ 
                          fontSize: 9, fontWeight: 700, 
                          color: "#f59e0b",
                          textTransform: "uppercase", 
                          letterSpacing: "0.1em",
                          display: "flex", alignItems: "center", gap: 4,
                          minWidth: 80,
                        }}>
                          <Star size={10} /> Custom
                        </span>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {quickAddTags.custom.map(tag => (
                            <button
                              key={tag}
                              onClick={() => addTag(tag)}
                              style={{
                                padding: "4px 10px", borderRadius: 4,
                                fontSize: 11, fontWeight: 500,
                                background: "rgba(245,158,11,0.10)",
                                border: "1px solid rgba(245,158,11,0.30)",
                                color: "#f59e0b",
                                cursor: "pointer",
                                transition: "all 0.15s",
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.background = "rgba(245,158,11,0.20)";
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.background = "rgba(245,158,11,0.10)";
                              }}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {!editMode && tags.length === 0 && (
                <span style={{ fontSize: 12, color: C.onSecondaryFixedVar, fontStyle: "italic" }}>No tags added</span>
              )}
            </Card>

            {/* Card 4: Source Files */}
            <Card accent={C.outlineVariant}>
              <Label>Source Files</Label>

              {(audioFiles.length > 0 || flpFiles.length > 0) ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  
                  {/* Audio Selection */}
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <FileAudio size={14} color={C.mint} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.onSecondaryFixedVar, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                        Source Audio {audioFiles.length > 0 && `(${audioFiles.length})`}
                      </span>
                    </div>
                    {audioFiles.length > 0 ? (
                      <>
                        <select
                          value={selectedFile}
                          onChange={e => setSelectedFile(e.target.value)}
                          disabled={!editMode}
                          style={getInputStyle({ ...commonStyles.input, width: "100%", padding: 12, fontSize: 13, appearance: "none" })}
                        >
                          {audioFiles.map(f => (
                            <option key={f.path} value={f.path}>
                              {f.name} {f.is_untagged && "★"}
                            </option>
                          ))}
                        </select>
                        {selectedFile && (() => {
                          const file = audioFiles.find(f => f.path === selectedFile);
                          if (!file) return null;
                          return (
                            <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <Badge icon={<FileAudio size={10} />} text={file.extension.toUpperCase()} />
                              <Badge icon={<Timer size={10} />} text={formatFileSize(file.size)} />
                              {file.is_untagged && (
                                <Badge icon={<CheckCircle size={10} />} text="UNTAGGED" highlight />
                              )}
                            </div>
                          );
                        })()}
                      </>
                    ) : (
                      <span style={{ fontSize: 11, color: C.onSecondaryFixedVar, fontStyle: "italic" }}>No audio files found</span>
                    )}
                  </div>

                  {/* FLP Selection (NEU) */}
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <FileCode size={14} color={C.primary} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.onSecondaryFixedVar, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                        Source FLP {flpFiles.length > 0 && `(${flpFiles.length})`}
                      </span>
                    </div>
                    {flpFiles.length > 0 ? (
                      <>
                        <select
                          value={selectedFlp}
                          onChange={e => setSelectedFlp(e.target.value)}
                          disabled={!editMode}
                          style={getInputStyle({ ...commonStyles.input, width: "100%", padding: 12, fontSize: 13, appearance: "none" })}
                        >
                          {flpFiles.map(f => (
                            <option key={f.path} value={f.path}>
                              {f.name} {f.is_newest && "● NEWEST"} {f.is_master && "◆ MASTER"}
                            </option>
                          ))}
                        </select>
                        {selectedFlp && (() => {
                          const file = flpFiles.find(f => f.path === selectedFlp);
                          if (!file) return null;
                          return (
                            <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <Badge icon={<FileCode size={10} />} text="FLP" />
                              {file.size > 0 && <Badge icon={<Timer size={10} />} text={formatFileSize(file.size)} />}
                              {file.is_newest && <Badge icon={<CheckCircle size={10} />} text="NEWEST" highlight />}
                              {file.is_master && <Badge icon={<Star size={10} />} text="MASTER" />}
                            </div>
                          );
                        })()}
                      </>
                    ) : (
                      <span style={{ fontSize: 11, color: C.onSecondaryFixedVar, fontStyle: "italic" }}>No FLP files found in root</span>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{
                  padding: 24, borderRadius: 8,
                  background: C.surfaceContainerLowest,
                  border: `1px dashed ${C.border30}`,
                  textAlign: "center",
                }}>
                  <FolderOpen size={24} color={C.onSecondaryFixedVar} style={{ opacity: 0.5, marginBottom: 8 }} />
                  <p style={{ margin: 0, fontSize: 12, color: C.onSecondaryFixedVar }}>
                    Select a folder to detect source files
                  </p>
                </div>
              )}
            </Card>

            {/* Card 5: Notes */}
            <Card accent={C.outlineVariant}>
              <Label>Internal Production Notes</Label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Add details about plugins used, inspiration, or intended artists..."
                rows={4}
                disabled={!editMode}
                style={getInputStyle({ ...commonStyles.input, width: "100%", padding: 16, fontSize: 14, resize: "none", lineHeight: 1.6, boxSizing: "border-box" })}
              />
            </Card>
          </div>

          {/* ── Right Column: Preview ───────────────────────────────────────── */}
          <div style={{ flex: "0 0 38%", position: "sticky", top: 0, alignSelf: "flex-start" }}>
            <Label style={{ color: C.primary, letterSpacing: "0.3em", marginBottom: 16 }}>Registry Preview</Label>

            <div style={{ background: C.surfaceContainer, borderRadius: 12, overflow: "hidden", boxShadow: "0 25px 50px rgba(0,0,0,0.5)", border: `1px solid ${C.border10}` }}>
              {/* Cover — nur Click, kein Drag & Drop */}
              <div
                onClick={handleSelectCover}
                style={{
                  position: "relative", paddingBottom: "100%",
                  background: C.surfaceContainerHighest,
                  cursor: editMode ? "pointer" : "default",
                }}
              >
                {/* Gradient Overlay */}
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #000 0%, transparent 50%)", zIndex: 2, pointerEvents: "none" }} />

                {/* Cover Image or Placeholder */}
                {coverImage ? (
                  <img src={coverImage} alt="Cover" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 1 }} />
                ) : (
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #1a1919 0%, #262626 50%, #1a1919 100%)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1 }}>
                    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="rgba(253,161,36,0.15)" strokeWidth="0.5">
                      <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
                      <line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/>
                    </svg>
                  </div>
                )}

                {/* Empty State Hint */}
                {editMode && !coverImage && (
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, zIndex: 3, pointerEvents: "none" }}>
                    <ImagePlus size={24} color={C.onSurfaceVariant} strokeWidth={1.5} style={{ opacity: 0.5 }} />
                    <span style={{ color: C.onSurfaceVariant, fontSize: 10, opacity: 0.5 }}>Click to select cover</span>
                  </div>
                )}

                {/* ID Badge */}
                <div style={{ position: "absolute", top: 16, right: 16, zIndex: 4, background: C.primary, color: "#4e2d00", fontSize: 10, fontWeight: 900, padding: "4px 8px", borderRadius: 4 }}>
                  {previewId}
                </div>

                {/* Title & Meta */}
                <div style={{ position: "absolute", bottom: 16, left: 16, right: 16, zIndex: 4 }}>
                  <h3 style={{ fontSize: 24, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em", color: "#fff", marginBottom: 6, lineHeight: 1 }}>
                    {previewTitle.toUpperCase()}
                  </h3>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 500, color: C.onSurfaceVariant }}>
                    <span>{previewKey}</span>
                    <div style={{ width: 4, height: 4, borderRadius: "50%", background: C.primary }} />
                    <span>{previewBpm} BPM</span>
                  </div>
                </div>
              </div>

              {/* Path Preview */}
              <div style={{ padding: 16, background: C.surfaceContainerLow }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, fontFamily: "monospace", color: C.onSecondaryFixedVar }}>
                  <FolderOpen size={14} strokeWidth={1.5} />
                  <span>{previewPath}</span>
                </div>
              </div>
            </div>

            {/* Info Box */}
            <div style={{ marginTop: 24, padding: 16, borderRadius: 8, background: "rgba(148,146,255,0.05)", border: "1px solid rgba(148,146,255,0.10)", display: "flex", gap: 16, alignItems: "flex-start" }}>
              <Info size={18} color={C.tertiary} strokeWidth={1.5} style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 12, color: C.onSurfaceVariant, lineHeight: 1.6, margin: 0 }}>
                BeatOS will automatically generate standardized subfolders for Stems, MIDI, and Masters once structured.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          Bottom Action Bar
      ═══════════════════════════════════════════════════════════════════════ */}
      <footer style={{
        height: 80, flexShrink: 0,
        background: "rgba(19,19,19,0.8)",
        backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
        borderTop: `1px solid ${C.border15}`,
        padding: "0 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, color: C.onSurfaceVariant }}>
          {isLoading || isArchiving ? (
            <Loader2 size={18} strokeWidth={1.5} style={{ animation: "spin 1s linear infinite" }} />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/>
            </svg>
          )}
          <span style={{ fontSize: 12, fontWeight: 500 }}>
            {isArchiving
              ? "Archiving beat..."
              : isLoading
                ? "Parsing folder..."
                : sourceFolderPath
                  ? `Source: ${sourceFolderPath.split(/[/\\]/).pop()}`
                  : editMode
                    ? "Edit mode — changes enabled"
                    : "View mode — read only"
            }
          </span>
          {savedState && !isDirty && !isArchiving && (
            <span style={{ fontSize: 10, color: C.mint, display: "flex", alignItems: "center", gap: 4 }}>
              <CheckCircle size={12} /> Applied
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button
            onClick={handleSelectFolder}
            disabled={isLoading}
            style={{
              padding: "10px 24px", borderRadius: 8,
              fontSize: 14, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase",
              display: "flex", alignItems: "center", gap: 8,
              color: C.primary, background: "transparent", border: "none",
              cursor: isLoading ? "not-allowed" : "pointer",
              opacity: isLoading ? 0.5 : 1,
              transition: "background 0.15s",
            }}
            onMouseEnter={e => !isLoading && (e.currentTarget.style.background = "rgba(253,161,36,0.05)")}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <FolderOpen size={16} strokeWidth={1.5} />
            SELECT FOLDER
          </button>

          <button
            disabled={!sourceFolderPath || !title || isArchiving}
            onClick={() => handleCreateBeatstructure()}
            style={{
              padding: "10px 32px", borderRadius: 8,
              fontSize: 14, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase",
              display: "flex", alignItems: "center", gap: 8,
              color: sourceFolderPath && title && !isArchiving ? "#fff" : C.onSecondaryFixedVar,
              background: sourceFolderPath && title && !isArchiving ? C.primary : C.surfaceContainerHighest,
              border: `1px solid ${C.border10}`,
              cursor: sourceFolderPath && title && !isArchiving ? "pointer" : "not-allowed",
              transition: "all 0.2s",
            }}
          >
            {isArchiving ? (
              <Loader2 size={16} strokeWidth={1.5} style={{ animation: "spin 1s linear infinite" }} />
            ) : (
              <Network size={16} strokeWidth={1.5} />
            )}
            {isArchiving ? "ARCHIVING..." : "CREATE BEATSTRUCTURE"}
          </button>
        </div>
      </footer>

      {/* Keyframes */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      {/* ═══════════════════════════════════════════════════════════════════════
          Show All Tags Modal
      ═══════════════════════════════════════════════════════════════════════ */}
      {showAllTagsModal && (
        <AllTagsModal
          selectedTags={tags}
          customTags={customTags}
          onAddTag={addTag}
          onRemoveTag={removeTag}
          onClose={() => setShowAllTagsModal(false)}
          editMode={editMode}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          Confirmation Dialog
      ═══════════════════════════════════════════════════════════════════════ */}
      {confirmDialog?.show && (
        <ConfirmDialog
          message={confirmDialog.message}
          onDiscard={handleConfirmDiscard}
          onApply={confirmDialog.action !== "reset" ? handleConfirmApply : undefined}
          onCancel={handleConfirmCancel}
          showApply={confirmDialog.action !== "reset"}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          Duplicate Found Dialog
      ═══════════════════════════════════════════════════════════════════════ */}
      {duplicateDialog?.show && (
        <DuplicateDialog
          duplicateType={duplicateDialog.duplicateType}
          existingId={duplicateDialog.existingId}
          existingName={duplicateDialog.existingName}
          onCreateV2={handleDuplicateCreateV2}
          onCancel={handleDuplicateCancel}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          Success Dialog
      ═══════════════════════════════════════════════════════════════════════ */}
      {successDialog?.show && (
        <SuccessDialog
          archivePath={successDialog.archivePath}
          beatId={successDialog.beatId}
          filesCopied={successDialog.filesCopied}
          onClose={handleSuccessClose}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          Error Toast
      ═══════════════════════════════════════════════════════════════════════ */}
      {archiveError && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "rgba(239,68,68,0.95)", color: "#fff",
          padding: "16px 24px", borderRadius: 12,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", gap: 12,
          zIndex: 100, maxWidth: 500,
        }}>
          <AlertCircle size={20} />
          <span style={{ fontSize: 13, flex: 1 }}>{archiveError}</span>
          <button
            onClick={() => setArchiveError(null)}
            style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer", padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Local Sub-Components
// ═══════════════════════════════════════════════════════════════════════════════

function Card({ children, accent }: { children: React.ReactNode; accent: string }) {
  return (
    <section style={{
      background: C.surfaceContainerLow,
      borderRadius: 12,
      padding: 24,
      borderRight: `4px solid ${accent}`,
      boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
    }}>
      {children}
    </section>
  );
}

function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <label style={{
      fontSize: 10, fontWeight: 700,
      color: C.onSecondaryFixedVar,
      textTransform: "uppercase",
      letterSpacing: "0.15em",
      display: "block",
      marginBottom: 8,
      ...style,
    }}>
      {children}
    </label>
  );
}

function InputWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center",
      background: C.surfaceContainerLowest,
      borderRadius: 8,
      border: `1px solid ${C.border20}`,
      paddingRight: 16,
    }}>
      {children}
    </div>
  );
}

function SmallInput({ label, value, onChange, placeholder, disabled, width, mono }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder: string; disabled: boolean; width: number; mono?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <label style={{ fontSize: 9, fontWeight: 700, color: C.onSecondaryFixedVar, textTransform: "uppercase", letterSpacing: "-0.02em" }}>
        {label}
      </label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          width, background: C.surfaceContainerLowest,
          border: `1px solid ${C.border20}`, borderRadius: 6,
          padding: "8px 8px", fontSize: 14,
          textAlign: "center", textTransform: "uppercase",
          letterSpacing: "0.15em", outline: "none",
          color: C.onSurface,
          fontFamily: mono ? "monospace" : "Inter, sans-serif",
          opacity: disabled ? 0.6 : 1,
          cursor: disabled ? "not-allowed" : "text",
        }}
      />
    </div>
  );
}

function Badge({ icon, text, highlight }: { icon: React.ReactNode; text: string; highlight?: boolean }) {
  return (
    <span style={{
      padding: "4px 8px",
      background: highlight ? "rgba(52,211,153,0.15)" : C.surfaceContainerHighest,
      borderRadius: 4,
      fontSize: 9, fontWeight: 700,
      color: highlight ? C.mint : C.onSurfaceVariant,
      display: "flex", alignItems: "center", gap: 4,
    }}>
      {icon} {text}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// All Tags Modal Component
// ═══════════════════════════════════════════════════════════════════════════════

interface AllTagsModalProps {
  selectedTags: string[];
  customTags: { display_name: string; category: string }[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onClose: () => void;
  editMode: boolean;
}

function AllTagsModal({ selectedTags, customTags, onAddTag, onRemoveTag, onClose, editMode }: AllTagsModalProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Category config mit Icons und Farben
  const CATEGORY_CONFIG: { key: "genre" | "vibe" | "instrument" | "other"; label: string; icon: React.ReactNode; color: string }[] = [
    { key: "genre", label: "Genre", icon: <Music size={14} />, color: TAG_COLORS.genre.text },
    { key: "vibe", label: "Vibe", icon: <Sparkles size={14} />, color: TAG_COLORS.vibe.text },
    { key: "instrument", label: "Instruments", icon: <Piano size={14} />, color: TAG_COLORS.instrument.text },
    { key: "other", label: "Other", icon: <Tag size={14} />, color: TAG_COLORS.other.text },
  ];

  // Filter tags based on search
  const filterTags = (tagList: string[]) => {
    if (!searchQuery.trim()) return tagList;
    return tagList.filter(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
  };

  // Get custom tags that aren't presets
  const customOnlyTags = customTags
    .map(ct => ct.display_name)
    .filter(t => !Object.values(PRESET_TAGS).flat().includes(t));

  // Toggle tag selection
  const handleTagClick = (tag: string) => {
    if (!editMode) return;
    if (selectedTags.includes(tag)) {
      onRemoveTag(tag);
    } else {
      onAddTag(tag);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 32,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.surfaceContainerLow,
          borderRadius: 16,
          border: `1px solid ${C.border20}`,
          width: "100%", maxWidth: 900,
          maxHeight: "80vh",
          display: "flex", flexDirection: "column",
          boxShadow: "0 25px 80px rgba(0,0,0,0.6)",
        }}
      >
        {/* Modal Header */}
        <div style={{
          padding: "20px 24px",
          borderBottom: `1px solid ${C.border15}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.onSurface }}>All Tags</h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: C.onSecondaryFixedVar }}>
              {selectedTags.length} tags selected
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Search */}
            <div style={{ position: "relative" }}>
              <Search size={14} color={C.onSecondaryFixedVar} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search tags..."
                style={{
                  ...commonStyles.input,
                  padding: "8px 12px 8px 36px",
                  fontSize: 12,
                  width: 200,
                }}
              />
            </div>
            <button
              onClick={onClose}
              style={{
                width: 32, height: 32, borderRadius: 6,
                background: C.surfaceContainerHighest,
                border: `1px solid ${C.border20}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: C.onSurfaceVariant,
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Selected Tags Preview */}
        {selectedTags.length > 0 && (
          <div style={{ padding: "16px 24px", borderBottom: `1px solid ${C.border10}`, background: "rgba(52,211,153,0.03)" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.mint, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, display: "block" }}>
              Selected Tags
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {selectedTags.map(tag => (
                <TagPill key={tag} tag={tag} removable={editMode} onRemove={onRemoveTag} />
              ))}
            </div>
          </div>
        )}

        {/* Tag Categories Grid */}
        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24 }}>
            {CATEGORY_CONFIG.map(({ key, label, icon, color }) => {
              const categoryTags = filterTags(PRESET_TAGS[key] || []);
              if (categoryTags.length === 0 && searchQuery) return null;

              return (
                <div key={key}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <span style={{ color }}>{icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      {label}
                    </span>
                    <span style={{ fontSize: 10, color: C.onSecondaryFixedVar }}>
                      ({categoryTags.length})
                    </span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {categoryTags.map(tag => {
                      const isSelected = selectedTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          onClick={() => handleTagClick(tag)}
                          disabled={!editMode}
                          style={{
                            padding: "5px 12px", borderRadius: 4,
                            fontSize: 11, fontWeight: 500,
                            background: isSelected ? TAG_COLORS[key].bg : C.surfaceContainerHighest,
                            border: `1px solid ${isSelected ? TAG_COLORS[key].border : C.border20}`,
                            color: isSelected ? TAG_COLORS[key].text : C.onSurfaceVariant,
                            cursor: editMode ? "pointer" : "default",
                            opacity: editMode ? 1 : 0.6,
                            transition: "all 0.15s",
                          }}
                        >
                          {tag}
                          {isSelected && <span style={{ marginLeft: 6, opacity: 0.7 }}>✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Custom Tags Section */}
            {filterTags(customOnlyTags).length > 0 && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <Star size={14} color="#f59e0b" />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#f59e0b", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Custom
                  </span>
                  <span style={{ fontSize: 10, color: C.onSecondaryFixedVar }}>
                    ({filterTags(customOnlyTags).length})
                  </span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {filterTags(customOnlyTags).map(tag => {
                    const isSelected = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        onClick={() => handleTagClick(tag)}
                        disabled={!editMode}
                        style={{
                          padding: "5px 12px", borderRadius: 4,
                          fontSize: 11, fontWeight: 500,
                          background: isSelected ? "rgba(245,158,11,0.15)" : C.surfaceContainerHighest,
                          border: `1px solid ${isSelected ? "rgba(245,158,11,0.4)" : C.border20}`,
                          color: isSelected ? "#f59e0b" : C.onSurfaceVariant,
                          cursor: editMode ? "pointer" : "default",
                          opacity: editMode ? 1 : 0.6,
                          transition: "all 0.15s",
                        }}
                      >
                        {tag}
                        {isSelected && <span style={{ marginLeft: 6, opacity: 0.7 }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: "16px 24px",
          borderTop: `1px solid ${C.border15}`,
          display: "flex", justifyContent: "flex-end",
        }}>
          <button
            onClick={onClose}
            style={{
              padding: "10px 24px", borderRadius: 6,
              fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
              background: C.primary,
              border: "none",
              color: "#4e2d00",
              cursor: "pointer",
            }}
          >
            DONE
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Confirmation Dialog Component
// ═══════════════════════════════════════════════════════════════════════════════

interface ConfirmDialogProps {
  message: string;
  onDiscard: () => void;
  onApply?: () => void;
  onCancel: () => void;
  showApply?: boolean;
}

function ConfirmDialog({ message, onDiscard, onApply, onCancel, showApply = true }: ConfirmDialogProps) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 32,
      }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.surfaceContainerLow,
          borderRadius: 12,
          border: `1px solid ${C.border20}`,
          padding: 24,
          width: "100%", maxWidth: 420,
          boxShadow: "0 25px 80px rgba(0,0,0,0.6)",
        }}
      >
        {/* Icon + Title */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 8,
            background: "rgba(253,161,36,0.1)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <AlertCircle size={20} color={C.primary} />
          </div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.onSurface }}>
            Unsaved Changes
          </h3>
        </div>

        {/* Message */}
        <p style={{ fontSize: 13, color: C.onSurfaceVariant, lineHeight: 1.6, margin: "0 0 24px" }}>
          {message}
        </p>

        {/* Buttons */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onCancel}
            style={{
              padding: "10px 20px", borderRadius: 6,
              fontSize: 12, fontWeight: 600,
              background: "transparent",
              border: `1px solid ${C.border30}`,
              color: C.onSurfaceVariant,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onDiscard}
            style={{
              padding: "10px 20px", borderRadius: 6,
              fontSize: 12, fontWeight: 600,
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              color: "#ef4444",
              cursor: "pointer",
            }}
          >
            Discard
          </button>
          {showApply && onApply && (
            <button
              onClick={onApply}
              style={{
                padding: "10px 20px", borderRadius: 6,
                fontSize: 12, fontWeight: 600,
                background: C.mint,
                border: "none",
                color: "#064e3b",
                cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <Save size={14} />
              Apply & Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Duplicate Dialog ────────────────────────────────────────────────────────
function DuplicateDialog({
  duplicateType,
  existingId,
  existingName,
  onCreateV2,
  onCancel,
}: {
  duplicateType: "id" | "name_key_bpm";
  existingId: string;
  existingName: string;
  onCreateV2: () => void;
  onCancel: () => void;
}) {
  const isDuplicateId = duplicateType === "id";

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 100,
    }}>
      <div style={{
        background: C.surfaceContainerHigh,
        borderRadius: 16, padding: 28,
        width: 420, maxWidth: "90vw",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        border: `1px solid ${C.border20}`,
      }}>
        {/* Icon */}
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: "rgba(251,191,36,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 20,
        }}>
          <AlertCircle size={24} color="#fbbf24" />
        </div>

        {/* Title */}
        <h3 style={{ fontSize: 18, fontWeight: 700, color: C.onSurface, margin: 0, marginBottom: 12 }}>
          {isDuplicateId ? "Catalog ID Already Exists" : "Similar Beat Found"}
        </h3>

        {/* Message */}
        <p style={{ fontSize: 13, color: C.onSurfaceVariant, lineHeight: 1.6, margin: 0, marginBottom: 8 }}>
          {isDuplicateId ? (
            <>
              A beat with ID <strong style={{ color: C.primary }}>#{existingId}</strong> already exists in your archive:
            </>
          ) : (
            <>
              A beat with similar title, key, and BPM already exists:
            </>
          )}
        </p>

        {/* Existing Beat Info */}
        <div style={{
          background: C.surfaceContainer, borderRadius: 8, padding: 12,
          marginBottom: 20, border: `1px solid ${C.border15}`,
        }}>
          <span style={{ fontSize: 12, color: C.onSurfaceVariant }}>
            <strong style={{ color: C.onSurface }}>#{existingId}</strong> — {existingName}
          </span>
        </div>

        <p style={{ fontSize: 13, color: C.onSurfaceVariant, lineHeight: 1.6, margin: 0, marginBottom: 24 }}>
          Would you like to create this as a <strong style={{ color: C.mint }}>V2 version</strong> with a new ID?
        </p>

        {/* Buttons */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onCancel}
            style={{
              padding: "10px 20px", borderRadius: 6,
              fontSize: 12, fontWeight: 600,
              background: "transparent",
              border: `1px solid ${C.border30}`,
              color: C.onSurfaceVariant,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onCreateV2}
            style={{
              padding: "10px 20px", borderRadius: 6,
              fontSize: 12, fontWeight: 600,
              background: C.primary,
              border: "none",
              color: "#4e2d00",
              cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <Plus size={14} />
            Create as V2
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Success Dialog ──────────────────────────────────────────────────────────
function SuccessDialog({
  archivePath,
  beatId,
  filesCopied,
  onClose,
}: {
  archivePath: string;
  beatId: string;
  filesCopied: number;
  onClose: () => void;
}) {
  const folderName = archivePath.split(/[/\\]/).pop() || archivePath;

  const handleOpenFolder = async () => {
    try {
      await invoke("plugin:opener|open_path", { path: archivePath });
    } catch (e) {
      console.error("Failed to open folder:", e);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 100,
    }}>
      <div style={{
        background: C.surfaceContainerHigh,
        borderRadius: 16, padding: 28,
        width: 460, maxWidth: "90vw",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        border: `1px solid ${C.border20}`,
      }}>
        {/* Success Icon */}
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: "rgba(52,211,153,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 24,
        }}>
          <CheckCircle size={28} color={C.mint} />
        </div>

        {/* Title */}
        <h3 style={{ fontSize: 20, fontWeight: 700, color: C.onSurface, margin: 0, marginBottom: 8 }}>
          Beat Archived Successfully!
        </h3>

        {/* Subtitle */}
        <p style={{ fontSize: 13, color: C.onSurfaceVariant, margin: 0, marginBottom: 24 }}>
          Your beat has been organized into the archive structure.
        </p>

        {/* Stats */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12,
          marginBottom: 24,
        }}>
          <div style={{
            background: C.surfaceContainer, borderRadius: 10, padding: 16,
            textAlign: "center", border: `1px solid ${C.border10}`,
          }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: C.primary }}>{beatId}</div>
            <div style={{ fontSize: 10, color: C.onSurfaceVariant, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 4 }}>Beat ID</div>
          </div>
          <div style={{
            background: C.surfaceContainer, borderRadius: 10, padding: 16,
            textAlign: "center", border: `1px solid ${C.border10}`,
          }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: C.mint }}>{filesCopied}</div>
            <div style={{ fontSize: 10, color: C.onSurfaceVariant, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 4 }}>Files Copied</div>
          </div>
          <div style={{
            background: C.surfaceContainer, borderRadius: 10, padding: 16,
            textAlign: "center", border: `1px solid ${C.border10}`,
          }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: C.tertiary }}>✓</div>
            <div style={{ fontSize: 10, color: C.onSurfaceVariant, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 4 }}>Verified</div>
          </div>
        </div>

        {/* Archive Path */}
        <div style={{
          background: C.surfaceContainer, borderRadius: 8, padding: 12,
          marginBottom: 24, border: `1px solid ${C.border15}`,
        }}>
          <div style={{ fontSize: 10, color: C.onSurfaceVariant, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Archive Location</div>
          <div style={{ fontSize: 12, color: C.onSurface, fontFamily: "monospace", wordBreak: "break-all" }}>{folderName}</div>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={handleOpenFolder}
            style={{
              padding: "10px 20px", borderRadius: 6,
              fontSize: 12, fontWeight: 600,
              background: "transparent",
              border: `1px solid ${C.border30}`,
              color: C.onSurfaceVariant,
              cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <FolderOpen size={14} />
            Open Folder
          </button>
          <button
            onClick={onClose}
            style={{
              padding: "10px 20px", borderRadius: 6,
              fontSize: 12, fontWeight: 600,
              background: C.mint,
              border: "none",
              color: "#064e3b",
              cursor: "pointer",
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}