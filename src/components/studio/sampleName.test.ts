import { describe, it, expect } from "vitest";
import { sampleName } from "./SamplesPane";
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
