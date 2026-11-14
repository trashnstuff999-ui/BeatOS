import { describe, it, expect } from "vitest";
import { lerneKuerzel, sampleName, spurTeile } from "./SamplesPane";
import type { StudioProject } from "../../types/studio";

const s = (parsed_name: string, song_name: string | null = null) => ({ parsed_name, song_name }) as StudioProject;

describe("sampleName", () => {
  it("trennt Nummer und Namen, ohne Namen zählt der Export-Titel", () => {
    expect(sampleName(s("S0012 Nachtzug"))).toEqual({ nummer: "S0012", titel: "Nachtzug" });
    expect(sampleName(s("S0003", "Loop A"))).toEqual({ nummer: "S0003", titel: "Loop A" });
    expect(sampleName(s("S0003"))).toEqual({ nummer: "S0003", titel: null });
    expect(sampleName(s("Stems"))).toEqual({ nummer: null, titel: "Stems" });
  });
});

describe("spurTeile", () => {
  it("trennt Kürzel und Sorte, der Export hat keinen Spur-Teil", () => {
    expect(spurTeile("GTR ACOUSTIC VERSE - BLUE HOUR [150 Bmin]")).toEqual({ kuerzel: "GTR", sorte: "ACOUSTIC VERSE" });
    expect(spurTeile("BASS - NO ROOM FOR EMOTIONS [145 F#min]")).toEqual({ kuerzel: "BASS", sorte: "" });
    expect(spurTeile("Flute - X [150 Bmin]")).toEqual({ kuerzel: null, sorte: "Flute" });
    expect(spurTeile("NO ROOM FOR EMOTIONS [145 F#min]")).toBeNull();
    expect(spurTeile("Nachtzug - [Cm 140]")).toBeNull();
  });

  it("kennt gelernte Kürzel, abgelehnte Wörter nicht", () => {
    expect(spurTeile("FLUTE JAZZ - X [150 Bmin]")).toEqual({ kuerzel: null, sorte: "FLUTE JAZZ" });
    lerneKuerzel("FLUTE,-HIHAT");
    expect(spurTeile("FLUTE JAZZ - X [150 Bmin]")).toEqual({ kuerzel: "FLUTE", sorte: "JAZZ" });
    expect(spurTeile("HIHAT - X [150 Bmin]")).toEqual({ kuerzel: null, sorte: "HIHAT" });
  });
});
