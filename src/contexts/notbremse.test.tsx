// src/contexts/notbremse.test.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Der Player wartet nicht ewig auf eine Datei, die nicht antwortet.
//
// Eine KAPUTTE Datei meldet `error` — dafür gibt es längst einen Handler. Der
// Fall hier ist der andere: das Lesen hängt, es kommt gar kein Ereignis.
// Netzlaufwerk weg, OneDrive holt eine ausgelagerte Datei zurück, Platte
// schlafend. Vorher drehte der Spinner dann bis zum Neustart der App.
//
// Geprüft wird beides: dass die Bremse greift, und dass sie sich löst, sobald
// die Datei doch antwortet — sonst hagelt es Fehlmeldungen bei jedem Beat.
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { AudioPlayerProvider, useAudioPlayerContext } from "./AudioPlayerContext";

vi.mock("@tauri-apps/api/core", async () => ({
  invoke: vi.fn(),
  convertFileSrc: (p: string) => `file://${p}`,
}));

/** Ein Audio-Element, das nichts von sich hören lässt — der Hänger-Fall. */
class StummesAudio {
  src = "";
  volume = 1;
  muted = false;
  loop = false;
  paused = true;
  currentTime = 0;
  duration = NaN;
  static letzte: StummesAudio | null = null;
  private hoerer = new Map<string, Set<(e?: unknown) => void>>();

  constructor() { StummesAudio.letzte = this; }

  addEventListener(typ: string, fn: (e?: unknown) => void) {
    (this.hoerer.get(typ) ?? this.hoerer.set(typ, new Set()).get(typ)!).add(fn);
  }
  removeEventListener(typ: string, fn: (e?: unknown) => void) {
    this.hoerer.get(typ)?.delete(fn);
  }
  load() { /* absichtlich still */ }
  play() { return Promise.resolve(); }
  pause() { }

  /** Von aussen ein Ereignis auslösen, als käme es vom Element. */
  melde(typ: string) { this.hoerer.get(typ)?.forEach(fn => fn()); }
}

const BEAT = {
  id: "0001", name: "TESTBEAT", path: "C:\\ARCHIV\\0001",
  bpm: null, key: null, status: null, tags: null, favorite: null,
  created_date: null, modified_date: null, notes: null, sold_to: null,
  has_artwork: null, has_video: null,
};

function Buehne() {
  const { playBeat, isLoading, error } = useAudioPlayerContext();
  return (
    <div>
      <button onClick={() => playBeat(BEAT)}>abspielen</button>
      <span data-testid="laedt">{isLoading ? "ja" : "nein"}</span>
      <span data-testid="fehler">{error ?? ""}</span>
    </div>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("Audio", StummesAudio);
  StummesAudio.letzte = null;
  vi.mocked(invoke).mockImplementation((cmd: string) =>
    (cmd === "get_beat_audio_path"
      ? Promise.resolve("C:\\ARCHIV\\0001\\beat.mp3")
      : Promise.resolve(null)) as never);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Klick + die Promise-Kette, die den Audiopfad holt, abarbeiten lassen. */
async function starte() {
  await act(async () => {
    screen.getByText("abspielen").click();
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("Notbremse beim Laden", () => {
  it("meldet einen Hänger, statt ewig zu drehen", async () => {
    render(<AudioPlayerProvider><Buehne /></AudioPlayerProvider>);
    await starte();

    // Kurz davor läuft der Spinner noch — es könnte ja gleich kommen.
    await act(async () => { await vi.advanceTimersByTimeAsync(14_000); });
    expect(screen.getByTestId("laedt")).toHaveTextContent("ja");
    expect(screen.getByTestId("fehler")).toHaveTextContent("");

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(screen.getByTestId("laedt")).toHaveTextContent("nein");
    expect(screen.getByTestId("fehler")).toHaveTextContent("Datei nicht gefunden");
  });

  it("schweigt, wenn die Datei doch antwortet", async () => {
    render(<AudioPlayerProvider><Buehne /></AudioPlayerProvider>);
    await starte();

    // Die Datei meldet sich nach zwei Sekunden.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
      StummesAudio.letzte!.duration = 180;
      StummesAudio.letzte!.melde("loadedmetadata");
    });
    expect(screen.getByTestId("laedt")).toHaveTextContent("nein");

    // Danach darf die Bremse nicht mehr zuschlagen.
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(screen.getByTestId("fehler")).toHaveTextContent("");
  });
});
