// src/lib/uploadReady.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Display-only derivation: how "upload ready" is a beat?
// Four steps shown in the UploadBeatHeader — pure function over UploadData,
// no persistence, no commands.
// ═══════════════════════════════════════════════════════════════════════════════

import type { UploadData } from "../types/upload";

export interface ReadyStep {
  key: "infos" | "assets" | "files" | "scheduled";
  label: string;
  done: boolean;
  detail: string;
}

export function computeReadySteps(data: UploadData): ReadyStep[] {
  const { beat, assets, uploads } = data;

  const hasInfos = Boolean(beat.type_beat_main?.trim()) && Boolean(beat.genre_tags?.trim());

  const assetSlots: Array<[string, string | null]> = [
    ["MP3", assets.mp3], ["WAV", assets.wav], ["FLP", assets.flp],
    ["Cover", assets.cover], ["Thumbnail", assets.thumbnail], ["Video", assets.video],
  ];
  const presentCount = assetSlots.filter(([, v]) => v !== null).length;
  const hasCoreAssets = (assets.mp3 !== null || assets.wav !== null) && assets.cover !== null;

  const files = assets.upload_files;
  const filesCount = [files.beatstars_txt, files.soundcloud_txt, files.youtube_txt].filter(Boolean).length;
  const hasFiles = filesCount === 3;

  const scheduledCount = uploads.filter(u => u.scheduled_at || u.status === "uploaded").length;
  const hasSchedule = scheduledCount > 0;

  return [
    {
      key: "infos",
      label: "Infos",
      done: hasInfos,
      detail: hasInfos
        ? "Artists & Genres gesetzt"
        : "Main Artists und Genres fehlen noch",
    },
    {
      key: "assets",
      label: "Assets",
      done: hasCoreAssets,
      detail: `${presentCount}/6 Dateien im Ordner`,
    },
    {
      key: "files",
      label: "Files",
      done: hasFiles,
      detail: `${filesCount}/3 Description-Dateien gespeichert`,
    },
    {
      key: "scheduled",
      label: "Geplant",
      done: hasSchedule,
      detail: hasSchedule
        ? `${scheduledCount}/3 Plattformen geplant oder hochgeladen`
        : "Noch kein Upload-Datum gesetzt",
    },
  ];
}
