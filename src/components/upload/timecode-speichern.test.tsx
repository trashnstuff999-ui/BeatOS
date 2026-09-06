// src/components/upload/timecode-speichern.test.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Gespeichert wird 700 ms nach der letzten Eingabe. Wechselt man in dieser
// Zeit den Beat, raeumt React den Timer weg — die letzte Aenderung waere
// still verloren, und zwar genau in dem Ablauf, um den es hier geht:
// eintragen, weiterklicken, spaeter zurueckkommen.
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { AudioPlayerProvider } from "../../contexts/AudioPlayerContext";
import { TimecodeCard } from "./TimecodeCard";
import type { UploadBeatInfo } from "../../types/upload";

vi.mock("@tauri-apps/plugin-opener", () => ({ openPath: vi.fn(), revealItemInDir: vi.fn() }));
vi.mock("@tauri-apps/api/core", async () => ({
  invoke: vi.fn(),
  convertFileSrc: (p: string) => `file://${p}`,
}));

const mockInvoke = vi.mocked(invoke);

function beat(id: string, timecodes: string | null): UploadBeatInfo {
  return {
    id, name: `BEAT ${id}`, path: `C:\\ARCHIV\\${id}`,
    bpm: 140, key: "Am",
    type_beat_main: null, type_beat_also_fits: null, genre_tags: null,
    youtube_tags: null, soundcloud_tags: null,
    timecodes,
  };
}

function zeigen(b: UploadBeatInfo) {
  return render(
    <AudioPlayerProvider>
      <TimecodeCard beat={b} onSaved={vi.fn()} />
    </AudioPlayerProvider>,
  );
}

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockImplementation(async () => undefined);
});

describe("Kapitelmarken speichern und wiederfinden", () => {
  it("liest vorhandene Marken aus dem Beat", () => {
    zeigen(beat("0897", "0:00 Intro\n0:24 Pre-Hook / Hook\n2:07 Outro"));
    expect(screen.getByDisplayValue("Intro")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Pre-Hook / Hook")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Outro")).toBeInTheDocument();
    // Die erste Zeile ist fest — nur zwei Zeitfelder sind tippbar.
    expect(document.querySelectorAll("input")).toHaveLength(3 + 2);
  });

  it("schreibt eine Aenderung nach kurzer Ruhe weg", async () => {
    zeigen(beat("0897", "0:00 Intro"));
    await userEvent.type(screen.getByDisplayValue("Intro"), "!");

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("update_beat_timecodes", {
        beatId: "0897",
        marks: [{ seconds: 0, label: "Intro!" }],
      });
    }, { timeout: 2000 });
  });

  it("verliert nichts, wenn man mitten in der Wartezeit den Beat wechselt", async () => {
    const { rerender } = zeigen(beat("0897", "0:00 Intro"));
    await userEvent.type(screen.getByDisplayValue("Intro"), " kurz");

    // Sofort weiter zum naechsten Beat — die 700 ms sind noch nicht um.
    await act(async () => {
      rerender(
        <AudioPlayerProvider>
          <TimecodeCard beat={beat("0921", null)} onSaved={vi.fn()} />
        </AudioPlayerProvider>,
      );
    });

    // Das Offene muss trotzdem raus — und beim RICHTIGEN Beat landen.
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("update_beat_timecodes", {
        beatId: "0897",
        marks: [{ seconds: 0, label: "Intro kurz" }],
      });
    });

    // Der neue Beat hat keine Marken — seine Zeilen sind leer.
    expect(screen.queryByDisplayValue("Intro kurz")).not.toBeInTheDocument();
  });

  it("schreibt nichts, wenn nichts geaendert wurde", async () => {
    const { unmount } = zeigen(beat("0897", "0:00 Intro"));
    unmount();
    await waitFor(() => {
      expect(mockInvoke).not.toHaveBeenCalledWith("update_beat_timecodes", expect.anything());
    });
  });
});

describe("Zeilen loeschen und sortieren", () => {
  const zeitfelder = () =>
    [...document.querySelectorAll<HTMLInputElement>('input[type="text"], input:not([type])')]
      .filter(i => /^\d+:\d{2}$/.test(i.value))
      .map(i => i.value);

  it("die uebrigen Marken behalten ihre eigene Zeit", async () => {
    // Der gemeldete Fehler: Index als React-Key plus unkontrolliertes
    // Zeitfeld — beim Loeschen erbte die aufrueckende Zeile die DOM-Node
    // und damit die Zeit ihrer Vorgaengerin.
    zeigen(beat("0897", "0:00 Intro\n0:10 A\n0:25 B"));
    expect(zeitfelder()).toEqual(["0:10", "0:25"]);

    const knoepfe = screen.getAllByTitle("Marke entfernen");
    await userEvent.click(knoepfe[1]);          // A raus

    expect(screen.queryByDisplayValue("A")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("B")).toBeInTheDocument();
    // B behaelt 0:25 — vorher stand hier A's 0:10.
    expect(zeitfelder()).toEqual(["0:25"]);
  });

  it("faellt die 0:00-Marke weg, rutscht die naechste darauf", async () => {
    // Dieselbe Regel wie im Backend: ohne Startmarke ignoriert YouTube alles.
    zeigen(beat("0897", "0:00 Intro\n0:40 Hook"));
    await userEvent.click(screen.getAllByTitle("Marke entfernen")[0]);

    expect(screen.getByDisplayValue("Hook")).toBeInTheDocument();
    // Hook ist jetzt die erste Zeile — gesperrt auf 0:00, kein Zeitfeld mehr.
    expect(zeitfelder()).toEqual([]);
    expect(screen.getByText("0:00")).toBeInTheDocument();
  });
});
