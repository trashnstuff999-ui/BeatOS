// Link einfügen genügt: Strg+V auf der Seite erkennt die Plattform am Link
// und trägt sie als hochgeladen ein — aber nie, wenn man gerade in ein Feld
// einfügt.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { UploadStatusCard } from "./UploadStatusCard";
import type { UploadPlatformRow } from "../../types/upload";

vi.mock("@tauri-apps/api/core", async () => ({
  invoke: vi.fn(),
  convertFileSrc: (p: string) => `file://${p}`,
}));
const mockInvoke = vi.mocked(invoke);

const ENTWURF: UploadPlatformRow[] = (["beatstars", "soundcloud", "youtube"] as const).map(platform => ({
  platform, status: "draft", scheduled_at: null, uploaded_at: null, url: null,
}));

function einfuegen(ziel: EventTarget, text: string) {
  const e = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(e, "clipboardData", { value: { getData: () => text } });
  fireEvent(ziel as Element, e);
}

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue(undefined);
});

describe("Status-Karte: Link einfügen", () => {
  it("YouTube-Link auf der Seite → YouTube hochgeladen, heute", async () => {
    const onChanged = vi.fn();
    render(<UploadStatusCard beatId="0858" uploads={ENTWURF} onChanged={onChanged} />);

    einfuegen(document.body, "https://youtu.be/abc");

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    const [cmd, args] = mockInvoke.mock.calls[0] as [string, { params: Record<string, unknown> }];
    expect(cmd).toBe("update_upload_status");
    expect(JSON.stringify(args)).toContain('"platform":"youtube"');
    expect(JSON.stringify(args)).toContain('"status":"uploaded"');
    expect(JSON.stringify(args)).toContain("https://youtu.be/abc");
    expect(screen.getByText("YouTube-Link übernommen")).toBeInTheDocument();
  });

  it("in ein Eingabefeld eingefügt → nichts passiert", () => {
    render(
      <>
        <input data-testid="feld" />
        <UploadStatusCard beatId="0858" uploads={ENTWURF} onChanged={vi.fn()} />
      </>,
    );
    einfuegen(screen.getByTestId("feld"), "https://youtu.be/abc");
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("kein Plattform-Link → nichts passiert", () => {
    render(<UploadStatusCard beatId="0858" uploads={ENTWURF} onChanged={vi.fn()} />);
    einfuegen(document.body, "Hook");
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
