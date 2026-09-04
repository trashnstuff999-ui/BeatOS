// src/lib/api.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Centralized Tauri API Client
// Single place for all invoke() calls — typed, named, documented.
// ═══════════════════════════════════════════════════════════════════════════════

import { invoke } from "@tauri-apps/api/core";
import type { Beat, BeatStatus, SortColumn, SortDirection, UpdateBeatParams } from "../types/browse";
import type {
  ArchiveBeatParams,
  ArchiveResult,
  DuplicateCheckResult,
  ParsedBeatFolder,
} from "../types/create";
import type { CustomTag } from "./tags";
import type { RelocatePlan, RelocateResult, RelocateStatus } from "../types/relocate";
import type { Stats, DashboardActions } from "../types/stats";
import type {
  StudioProject, StudioStatusCounts, AssetFile, StudioStatus, MergePlan, MergeStep, MergeReport,
  MergeRun,
  ParkReport,
  ProjectArchiveStatus,
} from "../types/studio";
import type {
  UploadData,
  ScheduleEntry,
  TypeBeatPreset,
  SaveTypeBeatPresetParams,
  UpdateUploadStatusParams,
  UploadDescriptions,
  SaveUploadDescriptionsParams,
  LegacyStructure,
  MigrationResult,
  RenamePlan,
  RenameResult,
  FolderSync,
} from "../types/upload";

// ─── Settings ────────────────────────────────────────────────────────────────

export const api = {

  settings: {
    get: () =>
      invoke<Record<string, string>>("get_settings"),

    save: (settings: Record<string, string>) =>
      invoke<void>("save_settings", { settings }),

    getBackupInfo: () =>
      invoke<{ db_path: string; backup_path: string; last_backup_secs: number | null }>("get_backup_info"),

    backupNow: () =>
      invoke<{ db_path: string; backup_path: string; last_backup_secs: number | null }>("backup_db_now"),
  },

  // ─── Umzug der Bibliothek (Anker) ─────────────────────────────────────────
  // Alle gespeicherten Pfade hängen an einem gemeinsamen Präfix. Zieht die
  // Bibliothek um, wird nur dieses Präfix getauscht. Erkannt wird automatisch,
  // geschrieben nur auf Bestätigung — `preview` schreibt nichts.
  relocate: {
    status: () =>
      invoke<RelocateStatus>("relocate_status"),

    preview: (newAnchor: string) =>
      invoke<RelocatePlan>("relocate_preview", { newAnchor }),

    apply: (newAnchor: string) =>
      invoke<RelocateResult>("relocate_apply", { newAnchor }),
  },

  // ─── Stats ───────────────────────────────────────────────────────────────

  stats: {
    get: (year: number | null) =>
      invoke<Stats>("get_stats", { year }),

    getBeatCount: () =>
      invoke<number>("get_beat_count"),

    /** Aktions-Zahlen + Upload-Rhythmus fürs Dashboard */
    getDashboardActions: () =>
      invoke<DashboardActions>("get_dashboard_actions"),
  },

  // ─── Beats ───────────────────────────────────────────────────────────────

  beats: {
    getAll: (params?: {
      search?: string | null;
      statusFilter?: string | null;
      onlyFavs?: boolean;
      limit?: number;
      offset?: number;
    }) =>
      invoke<Beat[]>("get_beats", params ?? {}),

    getPaginated: (params: {
      search: string | null;
      statusFilter: string | null;
      onlyFavs: boolean;
      keyFilter: string[] | null;
      bpmMin: number | null;
      bpmMax: number | null;
      sortColumn: SortColumn;
      sortDirection: SortDirection;
      limit: number;
      offset: number;
      unpublishedOnly?: boolean;
    }) =>
      invoke<{ beats: Beat[]; total_count: number }>("get_beats_paginated", params),

    /** Plattform-Badges (scheduled/uploaded) für eine Seite Beats */
    getUploadBadges: (beatIds: string[]) =>
      invoke<Array<{ beat_id: string; platform: string; status: string }>>("get_upload_badges", { beatIds }),

    getById: (beatId: string) =>
      invoke<Beat | null>("get_beat_by_id", { beatId }),

    toggleFavorite: (beatId: string, favorite: boolean) =>
      invoke<void>("toggle_favorite", { beatId, favorite }),

    updateStatus: (beatId: string, status: BeatStatus) =>
      invoke<void>("update_beat_status", { beatId, status }),

    update: (params: UpdateBeatParams) =>
      invoke<void>("update_beat", { params }),

    delete: (beatId: string, archiveBasePath: string) =>
      invoke<{ folder_trashed: boolean }>("delete_beat", { beatId, archiveBasePath }),
  },

  // ─── Tags ────────────────────────────────────────────────────────────────

  tags: {
    getAll: () =>
      invoke<CustomTag[]>("get_custom_tags"),

    save: (tag: string, displayName: string, category: string) =>
      invoke<void>("save_custom_tag", { tag, displayName, category }),

    saveBatch: (tags: Array<{ tag: string; displayName: string; category: string }>) =>
      invoke<void>("save_custom_tags_batch", { tags }),

    delete: (tag: string) =>
      invoke<void>("delete_custom_tag", { tag }),

    rename: (oldTag: string, newTag: string, newDisplayName: string, category: string) =>
      invoke<void>("rename_custom_tag", { oldTag, newTag, newDisplayName, category }),

    search: (query: string) =>
      invoke<CustomTag[]>("search_custom_tags", { query }),
  },

  // ─── Archive ─────────────────────────────────────────────────────────────

  archive: {
    scan: (archiveBasePath: string) =>
      invoke<{ found: number; imported: number; skipped: number; errors: string[] }>("scan_archive", { archiveBasePath }),

    fixDates: (archiveBasePath: string) =>
      invoke<{ updated: number; not_found: number; no_flp: number; errors: string[] }>("fix_dates", { archiveBasePath }),

    /** Ordner + Dateinamen + beats.path auf die DB-Werte ziehen.
     *  Leere ID-Liste = alle Beats, dryRun = nur Vorschau. */
    syncFolders: (beatIds: string[], dryRun: boolean) =>
      invoke<FolderSync[]>("sync_beat_folders", { beatIds, dryRun }),

    checkDuplicate: (catalogId: number, title: string, key: string | null, bpm: number | null) =>
      invoke<DuplicateCheckResult>("check_beat_duplicate", { catalogId, title, key, bpm }),

    archiveBeat: (params: ArchiveBeatParams) =>
      invoke<ArchiveResult>("archive_beat", { params }),

    /** Move the source folder of an archived beat to the recycle bin (opt-in). */
    trashSourceFolder: (sourceFolder: string, archiveBasePath: string) =>
      invoke<void>("trash_source_folder", { sourceFolder, archiveBasePath }),

    /** Relative archive path preview — shares the exact folder-name logic of archive_beat. */
    previewPath: (catalogId: number, title: string, key: string | null, bpm: number | null, yearMonth: string) =>
      invoke<string>("preview_archive_path", { catalogId, title, key, bpm, yearMonth }),
  },

  // ─── Create ──────────────────────────────────────────────────────────────

  create: {
    getNextBeatId: () =>
      invoke<number>("get_next_beat_id"),

    parseBeatFolder: (folderPath: string) =>
      invoke<ParsedBeatFolder>("parse_beat_folder_for_create", { folderPath }),

    readImageFile: (filePath: string) =>
      invoke<string>("read_image_file", { filePath }),
  },

  // ─── Audio ───────────────────────────────────────────────────────────────

  audio: {
    getCoverPath: (beatPath: string) =>
      invoke<string | null>("get_beat_cover_path", { beatPath }),

    getAudioPath: (beatPath: string) =>
      invoke<string | null>("get_beat_audio_path", { beatPath }),
  },

  // ─── Studio ──────────────────────────────────────────────────────────────

  studio: {
    scanProjects: (paths: string[]) =>
      invoke<StudioProject[]>("scan_studio_projects", { paths }),

    updateProject: (path: string, status: StudioStatus, priority: number, notes: string | null) =>
      invoke<void>("update_studio_project", { path, status, priority, notes }),

    /** „Bereit" und „Überarbeiten" als Zahl — reine DB-Abfrage, kein Ordner-Scan.
     *  Die Roots müssen mit, sonst zählen geparkte Projekte mit, die die Liste
     *  gar nicht mehr zeigt. */
    statusCounts: (paths: string[]) =>
      invoke<StudioStatusCounts>("studio_status_counts", { paths }),

    /** Legt Ordner + 01_SAVEFILES + Template-Kopie an, gibt die neue FLP zurück. */
    createProject: (root: string, name: string, templateFlp: string) =>
      invoke<string>("create_project_folder", { root, name, templateFlp }),

    /** Nächste freie Projektnummer über alle Roots ("Project_206"). */
    nextProjectName: (paths: string[]) =>
      invoke<string>("next_project_name", { paths }),

    /** Benennt Ordner + gleichnamige FLPs um, gibt den neuen Pfad zurück. */
    renameProject: (path: string, newName: string) =>
      invoke<string>("rename_project_folder", { path, newName }),

    /** Vorschau: welcher Ordner landet unter welchem Namen im Ziel. Ändert nichts. */
    /** `exclude` nimmt Ordner heraus, BEVOR die Nummern vergeben werden —
     *  hinterher gefiltert entstünden Lücken. */
    planMerge: (paths: string[], target: string, exclude: string[] = []) =>
      invoke<MergePlan>("plan_production_merge", { paths, target, exclude }),

    /** Führt den Plan aus (DB-Sicherung, Verschieben, Protokoll). */
    applyMerge: (steps: MergeStep[]) =>
      invoke<MergeReport>("apply_production_merge", { steps }),

    /** Vollständig archivierte Projekte in einen Parkordner verschieben.
     *  Der Command prüft jeden Ordner selbst nochmal nach — die Liste hier ist
     *  ein Vorschlag, kein Freibrief. */
    parkArchived: (projectPaths: string[], archivePath: string, parkDir: string) =>
      invoke<ParkReport>("park_archived_projects", { projectPaths, archivePath, parkDir }),

    /** Vergangene Läufe aus den Protokolldateien — überlebt den Neustart. */
    listMergeRuns: () =>
      invoke<MergeRun[]>("list_merge_runs"),

    /** Trockenlauf-Bericht als CSV in die Bibliothek schreiben; gibt den Pfad zurück.
     *  Kein Pfad vom Frontend — der Command wählt den Ort selbst. */
    exportPreview: (content: string) =>
      invoke<string>("export_merge_preview", { content }),

    /** Spielt ein Protokoll rückwärts ab. */
    undoMerge: (logPath: string) =>
      invoke<MergeReport>("undo_production_merge", { logPath }),

    /** Welche Produktionsordner liegen schon im Archiv — und fehlt dort etwas?
     *  `deep` schaltet den Datei-für-Datei-Vergleich zu: langsamer, aber erst
     *  er beantwortet, ob ein Ordner gefahrlos weggeräumt werden könnte. */
    matchArchive: (paths: string[], archivePath: string, deep: boolean) =>
      invoke<ProjectArchiveStatus[]>("match_projects_to_archive", { paths, archivePath, deep }),

    scanAssetInbox: (path: string) =>
      invoke<AssetFile[]>("scan_asset_inbox", { path }),

    /** Moves the asset into the project folder root (collision-safe).
     *  `slot` ergänzt fehlende Namensmarker, damit der Zielordner die Datei
     *  danach im gewählten Slot wiederfindet. */
    assignAsset: (assetPath: string, assetRoot: string, projectDir: string, slot?: string) =>
      invoke<string>("assign_asset_to_project", { assetPath, assetRoot, projectDir, slot }),
  },

  // ─── Upload ──────────────────────────────────────────────────────────────

  upload: {
    getData: (beatId: string) =>
      invoke<UploadData>("get_upload_data", { beatId }),

    /** Scheduled/uploaded entries between two YYYY-MM-DD dates (inclusive). */
    getSchedule: (fromDate: string, toDate: string) =>
      invoke<ScheduleEntry[]>("get_upload_schedule", { fromDate, toDate }),

    updateTypeBeatInfo: (
      beatId: string,
      main: string,
      alsoFits: string,
      genreTags: string,
      youtubeTags: string,
      soundcloudTags: string,
    ) =>
      invoke<void>("update_type_beat_info", {
        beatId,
        main,
        alsoFits,
        genreTags,
        youtubeTags,
        soundcloudTags,
      }),

    updateUploadStatus: (params: UpdateUploadStatusParams) =>
      invoke<void>("update_upload_status", { params }),

    getPresets: () =>
      invoke<TypeBeatPreset[]>("get_type_beat_presets"),

    savePreset: (params: SaveTypeBeatPresetParams) =>
      invoke<number>("save_type_beat_preset", { params }),

    deletePreset: (id: number) =>
      invoke<void>("delete_type_beat_preset", { id }),

    bumpPresetUse: (id: number) =>
      invoke<void>("bump_preset_use", { id }),

    getTemplatesDir: () =>
      invoke<string>("get_templates_dir"),

    readTemplate: (name: string) =>
      invoke<string>("read_template", { name }),

    /** Überschreibt eine Vorlage; die alte Fassung bleibt als .bak liegen. */
    writeTemplate: (name: string, contents: string) =>
      invoke<void>("write_template", { name, contents }),

    /** Rendert ungespeicherten Vorlagentext mit den Werten eines echten Beats. */
    previewTemplate: (beatId: string, platform: string, contents: string) =>
      invoke<string>("preview_template", { beatId, platform, contents }),

    renderDescriptions: (beatId: string) =>
      invoke<UploadDescriptions>("render_upload_descriptions", { beatId }),

    saveDescriptions: (params: SaveUploadDescriptionsParams) =>
      invoke<void>("save_upload_descriptions", { params }),

    checkLegacyStructure: (beatId: string) =>
      invoke<LegacyStructure>("check_legacy_structure", { beatId }),

    migrateLegacyBeatStructure: (beatId: string) =>
      invoke<MigrationResult>("migrate_legacy_beat_structure", { beatId }),

    planFilenameConvention: (beatId: string) =>
      invoke<RenamePlan>("plan_filename_convention", { beatId }),

    applyFilenameConvention: (beatId: string) =>
      invoke<RenameResult>("apply_filename_convention", { beatId }),
  },
};
