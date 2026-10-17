import { describe, it, expect } from "vitest";
import { naechsterSchritt } from "./uploadReady";
import type { UploadData, UploadPlatformRow } from "../types/upload";

const plattform = (p: UploadPlatformRow["platform"], status: UploadPlatformRow["status"], datum: string | null = null): UploadPlatformRow => ({
  platform: p, status,
  scheduled_at: status === "scheduled" ? datum : null,
  uploaded_at: status === "uploaded" ? datum : null,
  url: null,
});

function daten(teil: { infos?: boolean; audio?: boolean; cover?: boolean; uploads?: UploadPlatformRow[] }): UploadData {
  const { infos = true, audio = true, cover = true } = teil;
  return {
    beat: {
      id: "0900", name: "X", path: "C:/x", bpm: 140, key: "Am",
      type_beat_main: infos ? "Lil Peep" : null, type_beat_also_fits: null,
      genre_tags: infos ? "Sad" : null, youtube_tags: null, soundcloud_tags: null, timecodes: null,
    },
    assets: {
      mp3: audio ? "x.mp3" : null, wav: null, flp: null, flp_path: null,
      cover: cover ? "x_cover.png" : null, thumbnail: null, video: null,
      upload_files: { beatstars_txt: false, soundcloud_txt: false, youtube_txt: false },
      alte_exporte: 0,
    },
    uploads: teil.uploads ?? [plattform("beatstars", "draft"), plattform("soundcloud", "draft"), plattform("youtube", "draft")],
  };
}

describe("naechsterSchritt", () => {
  it("folgt dem Ablauf: Infos, Audio, Cover, Termin", () => {
    expect(naechsterSchritt(daten({ infos: false, cover: false }))).toEqual({ art: "infos" });
    expect(naechsterSchritt(daten({ audio: false }))).toEqual({ art: "audio" });
    expect(naechsterSchritt(daten({ cover: false }))).toEqual({ art: "cover" });
    expect(naechsterSchritt(daten({}))).toEqual({ art: "termin" });
  });

  it("nennt den frühesten Termin der noch offenen Plattformen", () => {
    expect(naechsterSchritt(daten({ uploads: [
      plattform("beatstars", "uploaded", "2026-10-10"),
      plattform("soundcloud", "scheduled", "2026-10-24"),
      plattform("youtube", "scheduled", "2026-10-21"),
    ] }))).toEqual({ art: "geplant", datum: "2026-10-21" });
  });

  it("alles hochgeladen gilt auch, wenn Infos fehlen — es ist erledigt", () => {
    expect(naechsterSchritt(daten({ infos: false, uploads: [
      plattform("beatstars", "uploaded", "2026-10-10"),
      plattform("soundcloud", "uploaded", "2026-10-12"),
      plattform("youtube", "uploaded", null),
    ] }))).toEqual({ art: "fertig", datum: "2026-10-12" });
  });
});
