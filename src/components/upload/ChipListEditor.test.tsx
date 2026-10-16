// src/components/upload/ChipListEditor.test.tsx
// Stellt die Zeigerfolge des Umsortierens nach: anfassen, bewegen, loslassen.
//
// jsdom kennt weder setPointerCapture noch echte Layout-Masse — beides wird
// hier gestellt. Damit prueft der Test die Logik, nicht die Darstellung: ob
// aus „Chip 0 auf Chip 2 gezogen" die richtige neue Reihenfolge wird.

import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { ChipListEditor } from "./ChipListEditor";

/** Jedem Chip eine eigene Box geben: nebeneinander, je 100 breit, 30 hoch. */
function stelleLayout(werte: string[]) {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const text = this.textContent ?? "";
    const i = werte.findIndex(w => text.startsWith(w));
    if (i < 0) return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 } as DOMRect;
    return {
      left: i * 100, right: i * 100 + 100,
      top: 0, bottom: 30,
      width: 100, height: 30, x: i * 100, y: 0,
      toJSON: () => ({}),
    } as DOMRect;
  });
}

beforeAll(() => {
  // jsdom kennt die Zeigererfassung nicht — im Browser fangen diese Aufrufe
  // die Bewegungen ein, hier genuegt es, dass sie nicht werfen.
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture ?? function () {};
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? function () {};
});

describe("ChipListEditor — Umsortieren per Ziehen", () => {
  it("zieht den ersten Chip an die dritte Stelle", () => {
    const werte = ["Lil Peep", "Juice WRLD", "Convolk"];
    stelleLayout(werte);
    const onChange = vi.fn();

    render(
      <ChipListEditor
        label="Haupt-Artists"
        values={werte}
        onChange={onChange}
        separatorLabel="x"
        placeholder=""
      />
    );

    const ersterChip = screen.getByText("Lil Peep");

    fireEvent.mouseDown(ersterChip, { button: 0, clientX: 50, clientY: 15 });
    // Auf die Box des dritten Chips (x 200..300) — am Dokument, denn dort
    // haengen die Lauscher waehrend des Ziehens.
    fireEvent.mouseMove(document, { clientX: 250, clientY: 15 });
    fireEvent.mouseUp(document);

    expect(onChange).toHaveBeenCalledWith(["Juice WRLD", "Convolk", "Lil Peep"]);
  });

  it("meldet nichts, wenn der Zeiger den Chip nicht verlaesst", () => {
    const werte = ["A", "B"];
    stelleLayout(werte);
    const onChange = vi.fn();

    render(
      <ChipListEditor
        label="Genres"
        values={werte}
        onChange={onChange}
        separatorLabel="|"
        placeholder=""
      />
    );

    const chip = screen.getByText("A");
    fireEvent.mouseDown(chip, { button: 0, clientX: 50, clientY: 15 });
    fireEvent.mouseMove(document, { clientX: 60, clientY: 15 });
    fireEvent.mouseUp(document);

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("ChipListEditor — Ziehen fühlt sich richtig an", () => {
  it("die Lücke zwischen zwei Chips zählt als Einfügestelle", () => {
    const werte = ["A", "B", "C"];
    stelleLayout(werte);
    const onChange = vi.fn();
    render(<ChipListEditor label="" values={werte} onChange={onChange} separatorLabel="x" placeholder="" />);

    // Zeiger bei x 160: in der Box von B, aber rechts von seiner Mitte (150)
    // → hinter B. Früher zählte nur ein Treffer genau auf einem Chip.
    fireEvent.mouseDown(screen.getByText("A"), { button: 0, clientX: 50, clientY: 15 });
    fireEvent.mouseMove(document, { clientX: 160, clientY: 15 });
    fireEvent.mouseUp(document);
    expect(onChange).toHaveBeenCalledWith(["B", "A", "C"]);
  });

  it("zeigt beim Ziehen ein Abbild am Zeiger, sortiert aber erst beim Loslassen", () => {
    const werte = ["A", "B"];
    stelleLayout(werte);
    const onChange = vi.fn();
    render(<ChipListEditor label="" values={werte} onChange={onChange} separatorLabel="x" placeholder="" />);

    fireEvent.mouseDown(screen.getByText("A"), { button: 0, clientX: 50, clientY: 15 });
    fireEvent.mouseMove(document, { clientX: 190, clientY: 15 });
    expect(screen.getAllByText("A")).toHaveLength(2);   // Platzhalter + Abbild
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.mouseUp(document);
    expect(onChange).toHaveBeenCalledWith(["B", "A"]);
  });

  it("Esc bricht ab", () => {
    const werte = ["A", "B"];
    stelleLayout(werte);
    const onChange = vi.fn();
    render(<ChipListEditor label="" values={werte} onChange={onChange} separatorLabel="x" placeholder="" />);

    fireEvent.mouseDown(screen.getByText("A"), { button: 0, clientX: 50, clientY: 15 });
    fireEvent.mouseMove(document, { clientX: 190, clientY: 15 });
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.mouseUp(document);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("der Klick nach dem Ziehen landet nicht im Textfeld", () => {
    const werte = ["A", "B"];
    stelleLayout(werte);
    render(<ChipListEditor label="" values={werte} onChange={vi.fn()} separatorLabel="x" placeholder="" />);
    const eingabe = screen.getByRole("textbox");

    fireEvent.mouseDown(screen.getByText("A"), { button: 0, clientX: 50, clientY: 15 });
    fireEvent.mouseMove(document, { clientX: 400, clientY: 90 });   // weit daneben
    fireEvent.mouseUp(document);
    fireEvent.click(eingabe.parentElement!);
    expect(eingabe).not.toHaveFocus();
  });
});
