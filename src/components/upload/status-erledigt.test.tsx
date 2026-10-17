// Alle drei hochgeladen: eine Zeile statt drei gleicher Kacheln.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UploadStatusCard } from "./UploadStatusCard";
import type { UploadPlatformRow } from "../../types/upload";

vi.mock("@tauri-apps/api/core", async () => ({ invoke: vi.fn(), convertFileSrc: (p: string) => p }));
vi.mock("@tauri-apps/plugin-opener", async () => ({ openUrl: vi.fn(async () => {}) }));

const zeile = (platform: UploadPlatformRow["platform"], status: UploadPlatformRow["status"], url: string | null): UploadPlatformRow =>
  ({ platform, status, scheduled_at: null, uploaded_at: status === "uploaded" ? "2026-10-12" : null, url });

describe("Status-Karte: alles hochgeladen", () => {
  it("zeigt eine Zeile mit Datum und Links, Details klappt die Kacheln auf", async () => {
    render(<UploadStatusCard beatId="0932" onChanged={vi.fn()} uploads={[
      zeile("beatstars", "uploaded", "https://bsta.rs/x"),
      zeile("soundcloud", "uploaded", "https://soundcloud.com/x"),
      zeile("youtube", "uploaded", null),
    ]} />);

    expect(screen.getByText("Überall hochgeladen")).toBeInTheDocument();
    expect(screen.getByText(/am 12\.10\.2026/)).toBeInTheDocument();
    expect(screen.getByText("YouTube").closest("button")).toBeDisabled();   // kein Link
    expect(screen.queryByText("Entwurf")).not.toBeInTheDocument();          // keine Kacheln

    await userEvent.click(screen.getByText("Details"));
    expect(screen.getAllByText("Entwurf")).toHaveLength(3);
  });

  it("ist noch etwas offen, bleiben die Kacheln", () => {
    render(<UploadStatusCard beatId="0932" onChanged={vi.fn()} uploads={[
      zeile("beatstars", "uploaded", "https://bsta.rs/x"),
      zeile("soundcloud", "draft", null),
      zeile("youtube", "draft", null),
    ]} />);
    expect(screen.queryByText("Überall hochgeladen")).not.toBeInTheDocument();
    expect(screen.getAllByText("Entwurf")).toHaveLength(3);
  });
});
