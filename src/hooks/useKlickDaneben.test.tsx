import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { useKlickDaneben } from "./useKlickDaneben";

function Seite({ onClose }: { onClose: () => void }) {
  useKlickDaneben(true, onClose);
  return (
    <div data-app-flaeche data-testid="seite">
      <aside data-panel>
        <textarea data-testid="notiz" />
      </aside>
    </div>
  );
}

describe("useKlickDaneben", () => {
  it("schliesst bei einem Klick daneben", () => {
    const onClose = vi.fn();
    render(<Seite onClose={onClose} />);
    fireEvent.mouseDown(screen.getByTestId("seite"));
    fireEvent.click(screen.getByTestId("seite"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("bleibt offen, wenn eine Markierung im Panel beginnt und daneben endet", () => {
    const onClose = vi.fn();
    render(<Seite onClose={onClose} />);
    // Drücken in der Notiz, Loslassen daneben: der Browser schickt den Klick
    // an den gemeinsamen Vorfahren — die Seite.
    fireEvent.mouseDown(screen.getByTestId("notiz"));
    fireEvent.click(screen.getByTestId("seite"));
    expect(onClose).not.toHaveBeenCalled();
  });
});
