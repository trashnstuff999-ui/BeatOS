import { describe, it, expect, vi } from "vitest";

vi.mock("@tauri-apps/api/core", async () => ({ invoke: vi.fn(), convertFileSrc: (p: string) => p }));
vi.mock("@tauri-apps/api/webview", async () => ({ getCurrentWebview: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", async () => ({ revealItemInDir: vi.fn() }));

import { zielVorlaeufig } from "./AssetChecklistCard";

describe("Datei reinziehen — wohin sie gehört", () => {
  it("Audio, Video und benannte Bilder sofort", () => {
    expect(zielVorlaeufig("C:/x/NEU [Am 140].mp3")).toBe("mp3");
    expect(zielVorlaeufig("C:/x/mix.WAV")).toBe("wav");
    expect(zielVorlaeufig("C:/x/video.mp4")).toBe("video");
    expect(zielVorlaeufig("C:/x/Beat_THUMB.png")).toBe("thumbnail");
    expect(zielVorlaeufig("C:/x/beat cover.jpg")).toBe("cover");
  });

  it("Bild ohne Hinweis im Namen: die Maße entscheiden später", () => {
    expect(zielVorlaeufig("C:/x/export.png")).toBe("bild");
  });

  it("was der Ordner-Scan nicht liest, wird ignoriert", () => {
    expect(zielVorlaeufig("C:/x/clip.mov")).toBeNull();
    expect(zielVorlaeufig("C:/x/Projekt.flp")).toBeNull();
    expect(zielVorlaeufig("C:/x/bild.tif")).toBeNull();
  });
});
