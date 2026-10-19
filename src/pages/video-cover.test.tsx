// Das Cover liegt beim Öffnen über dem Video, bleibt kurz stehen und blendet
// dann aus. Es darf nicht dauerhaft stehen bleiben.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const video = Object.assign(document.createElement("video"), {});
Object.defineProperties(video, {
  duration: { get: () => 100 },
  readyState: { get: () => 4 },
  seeking: { get: () => false },
  paused: { get: () => true },
});
video.play = vi.fn(() => Promise.resolve());
video.pause = vi.fn();

vi.mock("@tauri-apps/api/core", async () => ({ invoke: vi.fn(), convertFileSrc: (p: string) => p }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openPath: vi.fn() }));
vi.mock("../contexts/VideoContext", () => ({ useVideo: () => ({ video, pfad: "C:/x.mp4", fehler: false }) }));
vi.mock("../contexts/AudioPlayerContext", () => {
  const ctx = {
    currentBeat: { id: "0932", name: "DONT WANNA BE", path: "C:/b", bpm: 138 },
    coverUrl: "cover.jpg", isPlaying: false,
    getCurrentSeconds: () => 0, getDurationSeconds: () => 100,
  };
  return { useAudioPlayerContext: () => ctx, useAudioProgress: () => ({}) };
});

import Video from "./Video";

beforeEach(() => { vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"] }); });
afterEach(() => { vi.useRealTimers(); });

describe("Video-Tab: Cover", () => {
  it("steht erst und blendet nach ein paar Sekunden aus", async () => {
    const { container } = render(<MemoryRouter><Video /></MemoryRouter>);
    const cover = () => [...container.querySelectorAll<HTMLElement>("div")].find(d => d.style.opacity !== "")!;
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(cover().style.opacity).toBe("1");
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(cover().style.opacity).toBe("0");
  });
});
