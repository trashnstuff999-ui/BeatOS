// Upload-Links im Archiv: ein Punkt mit Link öffnet ihn, ohne die Zeile
// auszuwählen; ohne Link bleibt es ein reiner Hinweis.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { PlatformDots } from "./BeatTable";

vi.mock("@tauri-apps/plugin-opener", async () => ({ openUrl: vi.fn(async () => {}) }));
vi.mock("@tauri-apps/api/core", async () => ({ invoke: vi.fn(), convertFileSrc: (p: string) => p }));

describe("PlatformDots", () => {
  it("öffnet den Link und lässt die Zeile in Ruhe", () => {
    const zeile = vi.fn();
    render(
      <div onClick={zeile}>
        <PlatformDots badges={[
          { beat_id: "0932", platform: "youtube", status: "uploaded", url: "https://youtu.be/x" },
          { beat_id: "0932", platform: "beatstars", status: "uploaded", url: null },
        ]} />
      </div>,
    );
    fireEvent.click(screen.getByTitle("YouTube: hochgeladen — klicken zum Öffnen"));
    expect(openUrl).toHaveBeenCalledWith("https://youtu.be/x");
    expect(zeile).not.toHaveBeenCalled();
    // Ohne Link: kein Knopf, nur der Hinweis
    expect(screen.getByTitle("Beatstars: hochgeladen").tagName).toBe("SPAN");
  });
});
