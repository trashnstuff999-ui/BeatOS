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
import type { Stats } from "../types/stats";
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
} from "../types/upload";

// ─── Settings ────────────────────────────────────────────────────────────────

export const api = {

  settings: {
    get: () =>
      invoke<Record<string, string>>("get_settings"),

    save: (settings: Record<string, string>) =>
      invoke<void>("save_settings", { settings }),
  },

  // ─── Stats ───────────────────────────────────────────────────────────────

  stats: {
    get: (year: number | null) =>
      invoke<Stats>("get_stats", { year }),

    getBeatCount: () =>
      invoke<number>("get_beat_count"),
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
    }) =>
      invoke<{ beats: Beat[]; total_count: number }>("get_beats_paginated", params),

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
