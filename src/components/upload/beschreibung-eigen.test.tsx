// Eine von Hand geänderte Beschreibung gilt — auch nach dem Neuladen. Vorher
// stand nach jedem Beat-Wechsel wieder die Vorlage da.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { DescriptionFilesCard } from "./DescriptionFilesCard";

vi.mock("@tauri-apps/api/core", async () => ({ invoke: vi.fn(), convertFileSrc: (p: string) => p }));
const mockInvoke = vi.mocked(invoke);

const vorlage = (titel: string) => `BEATSTARS TITEL:\n${titel}\n\nText\n`;

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockImplementation(async (cmd: string) => {
    if (cmd === "render_upload_descriptions") {
      return { beatstars: vorlage("Aus der Vorlage"), soundcloud: "", youtube: "" };
    }
    if (cmd === "get_description_state") {
      return { overrides: { beatstars: vorlage("Von Hand") }, dateien: {} };
    }
    return undefined;
  });
});

describe("Beschreibungen: eigene Fassung", () => {
  it("zeigt die eigene Fassung statt der Vorlage", async () => {
    render(<DescriptionFilesCard beatId="0858" rerenderKey={0} beatstarsUrl={null} />);
    expect(await screen.findByText("Von Hand")).toBeInTheDocument();
    expect(screen.queryByText("Aus der Vorlage")).not.toBeInTheDocument();
    expect(screen.getByText(/Von Hand geändert/)).toBeInTheDocument();
  });

  it("Vorlage wiederherstellen löscht die eigene Fassung", async () => {
    render(<DescriptionFilesCard beatId="0858" rerenderKey={0} beatstarsUrl={null} />);
    await userEvent.click(await screen.findByText("Vorlage wiederherstellen"));

    expect(await screen.findByText("Aus der Vorlage")).toBeInTheDocument();
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith(
      "set_description_override", { beatId: "0858", platform: "beatstars", text: null }));
  });
});
