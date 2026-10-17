// Uploads nacherfassen: eindeutige Treffer sind vorausgewählt, schon
// Erfasstes nicht; eingetragen wird mit dem geholten Datum.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { UploadsNacherfassenDialog } from "./UploadsNacherfassenDialog";

vi.mock("@tauri-apps/api/core", async () => ({ invoke: vi.fn(), convertFileSrc: (p: string) => p }));
vi.mock("@tauri-apps/plugin-opener", async () => ({ openUrl: vi.fn(async () => {}) }));
const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockImplementation(async (cmd: string, args?: unknown) => {
    const a = args as Record<string, unknown> | undefined;
    switch (cmd) {
      case "get_beats": return [{ id: "0932", name: "DONT WANNA BE" }, { id: "0903", name: "CALL ME" }];
      case "get_upload_badges": return [{ beat_id: "0932", platform: "youtube", status: "uploaded", url: "https://www.youtube.com/watch?v=uVinrWFwhmQ" }];
      case "kanal_liste":
        return String(a?.kanal).includes("youtube")
          ? [
              { id: "uVinrWFwhmQ", titel: '[FREE] Lil Peep Type Beat "DONT WANNA BE"', url: "https://www.youtube.com/watch?v=uVinrWFwhmQ", aufrufe: 163 },
              { id: "aaaaaaaaaaa", titel: '[FREE] Type Beat "CALL ME"', url: "https://www.youtube.com/watch?v=aaaaaaaaaaa", aufrufe: 10 },
              { id: "bbbbbbbbbbb", titel: "Ein altes Video", url: "https://www.youtube.com/watch?v=bbbbbbbbbbb", aufrufe: 5 },
            ]
          : [];
      case "upload_daten": return [["https://www.youtube.com/watch?v=aaaaaaaaaaa", "2025-03-14"]];
      default: return undefined;
    }
  });
});

describe("Uploads nacherfassen", () => {
  it("wählt eindeutig Neues vor, lässt Erfasstes aus und trägt mit Datum ein", async () => {
    render(<UploadsNacherfassenDialog youtubeUrl="youtube.com/@PROD.GOODBXY" soundcloudUrl="" onClose={vi.fn()} />);

    const callMe = await screen.findByLabelText('[FREE] Type Beat "CALL ME" übernehmen');
    expect(callMe).toBeChecked();
    expect(screen.getByLabelText('[FREE] Lil Peep Type Beat "DONT WANNA BE" übernehmen')).not.toBeChecked();
    expect(screen.getByLabelText("Ein altes Video übernehmen")).toBeDisabled();

    fireEvent.click(screen.getByText("1 Upload eintragen"));
    await screen.findByText(/1 Upload nachgetragen/);
    expect(mockInvoke).toHaveBeenCalledWith("upload_nacherfassen", {
      beatId: "0903", platform: "youtube", url: "https://www.youtube.com/watch?v=aaaaaaaaaaa", datum: "2025-03-14",
    });
    await waitFor(() => expect(mockInvoke.mock.calls.filter(c => c[0] === "upload_nacherfassen")).toHaveLength(1));
  });
});
