// src/lib/uploadLinks.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Ein Link genügt: welche Plattform es ist, steht in der Adresse. Damit muss
// niemand mehr Zustand und Datum von Hand setzen — Link einfügen heißt
// „hochgeladen, heute".
// ═══════════════════════════════════════════════════════════════════════════════

import { api } from "./api";
import type { UploadPlatform, UploadPlatformRow } from "../types/upload";

/** Die Reihenfolge eines Releases: BeatStars zuerst, weil sein Link in die
 *  Beschreibungen von YouTube und SoundCloud gehört. */
export const RELEASE_REIHENFOLGE: UploadPlatform[] = ["beatstars", "youtube", "soundcloud"];

const DOMAINS: [UploadPlatform, string[]][] = [
  ["youtube",    ["youtube.com", "youtu.be"]],
  ["soundcloud", ["soundcloud.com", "snd.sc"]],
  ["beatstars",  ["beatstars.com", "bsta.rs"]],
];

/** Plattform eines Links, oder `null`, wenn es keiner der drei ist. */
export function plattformAusLink(text: string): UploadPlatform | null {
  let host: string;
  try {
    host = new URL(text.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const [plattform, domains] of DOMAINS) {
    if (domains.some(d => host === d || host.endsWith(`.${d}`))) return plattform;
  }
  return null;
}

export function heuteISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Eine Plattform als hochgeladen speichern. Ein schon eingetragenes
 *  Upload-Datum bleibt — nachgetragene Links sollen es nicht auf heute ziehen. */
export function hochgeladenMelden(beatId: string, row: UploadPlatformRow, url: string | null) {
  return api.upload.updateUploadStatus({
    beat_id:      beatId,
    platform:     row.platform,
    status:       "uploaded",
    scheduled_at: row.scheduled_at,
    uploaded_at:  row.uploaded_at ?? heuteISO(),
    url:          url ?? row.url,
  });
}
