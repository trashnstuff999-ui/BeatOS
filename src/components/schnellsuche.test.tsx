// Strg+K öffnet die Suche; Enter führt ins Archiv, Strg+Enter in den Upload-Tab.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Schnellsuche } from "./Schnellsuche";

vi.mock("@tauri-apps/api/core", async () => ({ invoke: vi.fn(), convertFileSrc: (p: string) => p }));
vi.mock("../contexts/SettingsContext", async () => ({
  useSettings: () => ({ settings: { productionPath: "" } }),
  parseProductionPaths: () => [],
}));
const mockInvoke = vi.mocked(invoke);

function Ziel({ name }: { name: string }) {
  const loc = useLocation();
  return <div data-testid="ziel">{name}:{JSON.stringify(loc.state)}</div>;
}

function zeigen() {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Schnellsuche />
      <Routes>
        <Route path="/" element={<div />} />
        <Route path="/browse" element={<Ziel name="archiv" />} />
        <Route path="/upload" element={<Ziel name="upload" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockImplementation(async (cmd: string) =>
    cmd === "get_beats" ? [{ id: "0903", name: "CALL ME", key: "Em", bpm: 135 }] : []);
});

describe("Schnellsuche", () => {
  it("Strg+K öffnet, Enter führt ins Archiv mit dem Beat vorgewählt", async () => {
    zeigen();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.change(screen.getByLabelText("Schnellsuche"), { target: { value: "call" } });
    await screen.findByText("CALL ME");
    fireEvent.keyDown(screen.getByLabelText("Schnellsuche"), { key: "Enter" });
    await waitFor(() => expect(screen.getByTestId("ziel").textContent).toContain("archiv"));
    expect(screen.getByTestId("ziel").textContent).toContain('"initialBeatId":"0903"');
    expect(screen.queryByLabelText("Schnellsuche")).not.toBeInTheDocument();
  });

  it("Strg+Enter führt in den Upload-Tab", async () => {
    zeigen();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.change(screen.getByLabelText("Schnellsuche"), { target: { value: "call" } });
    await screen.findByText("CALL ME");
    fireEvent.keyDown(screen.getByLabelText("Schnellsuche"), { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(screen.getByTestId("ziel").textContent).toContain('upload:{"beatId":"0903"}'));
  });
});
