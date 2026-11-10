import { describe, it, expect } from "vitest";
import { fehlt, ideeName, ideenGruppen } from "./werkbank";
import type { StudioProject } from "../types/studio";

const p = (name: string, status: string, has: number[], modified_secs = 0) => ({
  name, status, modified_secs,
  has_mp3: !!has[0], has_wav: !!has[1], has_cover: !!has[2], has_thumbnail: !!has[3], has_video: !!has[4],
}) as unknown as StudioProject;

describe("fehlt", () => {
  it("listet fehlende Dateien in Pipeline-Reihenfolge", () => {
    expect(fehlt(p("x", "exported", [1, 1, 0, 1, 0]))).toEqual(["Cover", "Video"]);
  });
});

describe("Ideen-Liste", () => {
  const idee = (name: string, over: Partial<StudioProject> = {}) =>
    ({ name, parsed_name: name, song_name: null, modified_secs: 0, ...over }) as unknown as StudioProject;

  it("trennt Nummer und Titel", () => {
    expect(ideeName(idee("Project_0861"))).toEqual({ nummer: "0861", titel: null });
    expect(ideeName(idee("P0861 - Hell & Heaven"))).toEqual({ nummer: "0861", titel: "Hell & Heaven" });
    expect(ideeName(idee("Pattern"))).toEqual({ nummer: null, titel: "Pattern" });
    expect(ideeName(idee("Project_0001 - Hell & Heaven"))).toEqual({ nummer: "0001", titel: "Hell & Heaven" });
    expect(ideeName(idee("Project_0885", { song_name: "UNRESOLVED" }))).toEqual({ nummer: "0885", titel: "UNRESOLVED" });
    expect(ideeName(idee("NO MORE RUNNING"))).toEqual({ nummer: null, titel: "NO MORE RUNNING" });
  });

  it("gruppiert nach Monat in der Reihenfolge, in der sie kommen", () => {
    const okt = Date.UTC(2026, 9, 15) / 1000, sep = Date.UTC(2026, 8, 15) / 1000;
    const g = ideenGruppen([idee("a", { modified_secs: okt }), idee("b", { modified_secs: okt }), idee("c", { modified_secs: sep })], false);
    expect(g.map(x => [x.label, x.items.length])).toEqual([["Oktober 2026", 2], ["September 2026", 1]]);
  });

  it("gruppiert A–Z nach Anfangsbuchstabe, ohne Titel unter #", () => {
    const g = ideenGruppen([idee("Project_0001 - Agony"), idee("Project_0002 - amigos"), idee("Project_0003")], true);
    expect(g.map(x => [x.label, x.items.length])).toEqual([["A", 2], ["#", 1]]);
  });
});
