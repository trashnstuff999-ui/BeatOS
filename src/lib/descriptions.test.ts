// src/lib/descriptions.test.ts

import { extractTitle, extractDescription, extractTags, countTags } from "./descriptions";

const SOUNDCLOUD_SAMPLE = `TITEL:
[FREE] "MEMORIES" Juice WRLD Type Beat | Sad Guitar 2026

────────────────────────────

BPM: 156 | Key: Fm

prod. goodbxy

TAGS:
#JuiceWRLD
#SadGuitar
#TypeBeat

`;

const BEATSTARS_SAMPLE = `BEATSTARS TITEL:
MEMORIES - Juice WRLD x Lil Peep Type Beat 2026

────────────────────────────

ALBUMCOVER EXPORT:
MEMORIES_Cover_2000x2000.png`;

describe("extractTitle", () => {
  it("finds the line after TITEL:", () => {
    expect(extractTitle(SOUNDCLOUD_SAMPLE))
      .toBe('[FREE] "MEMORIES" Juice WRLD Type Beat | Sad Guitar 2026');
  });

  it("matches BEATSTARS TITEL: too", () => {
    expect(extractTitle(BEATSTARS_SAMPLE))
      .toBe("MEMORIES - Juice WRLD x Lil Peep Type Beat 2026");
  });

  it("falls back to the first non-empty line", () => {
    expect(extractTitle("\n\nHello World\nRest")).toBe("Hello World");
    expect(extractTitle("")).toBe("");
  });
});

describe("extractDescription", () => {
  it("returns everything after title, stripping separators", () => {
    const desc = extractDescription(SOUNDCLOUD_SAMPLE);
    expect(desc.startsWith("BPM: 156 | Key: Fm")).toBe(true);
    expect(desc).toContain("prod. goodbxy");
    expect(desc).not.toContain("TITEL:");
    expect(desc).not.toContain("────");
  });

  it("returns whole content when no title label exists", () => {
    expect(extractDescription("Just text\nmore text")).toBe("Just text\nmore text");
  });
});

describe("extractTags + countTags", () => {
  it("extracts the hash-per-line block and counts 3", () => {
    const tags = extractTags(SOUNDCLOUD_SAMPLE);
    expect(tags).toBe("#JuiceWRLD\n#SadGuitar\n#TypeBeat");
    expect(countTags(tags)).toBe(3);
  });

  it("counts comma lists (YouTube style)", () => {
    const yt = "TITEL:\nT\n\nTAGS:\njuice wrld type beat, sad guitar type beat, free type beat 2026\n";
    const tags = extractTags(yt);
    expect(countTags(tags)).toBe(3);
  });

  it("returns empty when no TAGS block", () => {
    expect(extractTags(BEATSTARS_SAMPLE)).toBe("");
    expect(countTags("")).toBe(0);
  });
});
