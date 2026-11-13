import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StudioBuehne } from "./StudioBuehne";
import { STUDIO_VERLAUF } from "../../lib/theme";
import type { StudioProject } from "../../types/studio";

vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: (p: string) => `file://${p}` }));

const p = {
  path: "C:/PROD/0857", root: "C:/PROD", name: "0857", parsed_name: "0857", song_name: "ARE YOU HERE",
  key: "F#m", bpm: 118, newest_flp: null, flp_count: 1, flps: [], modified_date: "2026-11-11",
  modified_secs: Math.floor(Date.now() / 1000) - 600,
  has_mp3: true, has_wav: true, has_cover: false, cover_path: null, has_thumbnail: false, has_video: false,
  status: "exported", priority: 0, notes: null, kept: false, aufraeumen: false, work_minutes: null,
} as StudioProject;

describe("StudioBuehne", () => {
  it("zeigt Titel, Herkunft und springt per Zahl zum Regal", async () => {
    const onSpring = vi.fn();
    render(<StudioBuehne project={p} verlauf={STUDIO_VERLAUF.exported} inFl={false} spielt={false}
      zahlen={[{ key: "exported", label: "Exportiert", anzahl: 5, farbe: "#fff" }]}
      onPreview={() => {}} onOpenDaw={() => {}} onDetails={() => {}} onSpring={onSpring} />);
    expect(screen.getByRole("heading", { name: "ARE YOU HERE" })).toBeTruthy();
    expect(screen.getByText(/Zuletzt geändert/)).toBeTruthy();
    // Keine FLP: „In FL öffnen" geht nicht
    expect((screen.getByRole("button", { name: "In FL öffnen" }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: /5\s*Exportiert/ }));
    expect(onSpring).toHaveBeenCalledWith("exported");
  });
});
