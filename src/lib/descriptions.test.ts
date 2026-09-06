// src/lib/descriptions.test.ts

import { extractTitle, extractDescription, extractTags, countTags, renderSignature } from "./descriptions";

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

// ─────────────────────────────────────────────────────────────────────────────
// Fehlt ein Feld in der Signatur, rendert die Beschreibungs-Karte nicht neu —
// die Aenderung steht dann in der Datenbank und in der Vorlagen-Vorschau, aber
// nicht in der Karte. Genau so verschwanden die Kapitelmarken.
// ─────────────────────────────────────────────────────────────────────────────

describe("renderSignature", () => {
  // Explizit typisiert, sonst leitet tsc aus den Nullen `null` als Typ ab und
  // die geaenderten Werte unten passen nicht mehr hinein.
  type Felder = Parameters<typeof renderSignature>[0];
  const leer: Felder = {
    type_beat_main: null, type_beat_also_fits: null, genre_tags: null,
    youtube_tags: null, soundcloud_tags: null, timecodes: null,
  };

  /** Ein Record-Typ erzwingt Vollstaendigkeit: kommt ein Feld dazu, das der
   *  Renderer benutzt, schlaegt tsc hier fehl, bevor es still unsichtbar wird. */
  const GEAENDERT: Record<keyof Felder, Partial<Felder>> = {
    type_beat_main:      { type_beat_main: "Juice WRLD" },
    type_beat_also_fits: { type_beat_also_fits: "Scorey" },
    genre_tags:          { genre_tags: "Sad Guitar" },
    youtube_tags:        { youtube_tags: "free type beat" },
    soundcloud_tags:     { soundcloud_tags: "#trap" },
    timecodes:           { timecodes: "0:00 Intro" },
  };

  const basis = renderSignature(leer, "");

  it.each(Object.keys(GEAENDERT) as (keyof Felder)[])(
    "aendert sich, wenn %s sich aendert",
    (feld) => {
      expect(renderSignature({ ...leer, ...GEAENDERT[feld] }, "")).not.toBe(basis);
    },
  );

  it("aendert sich mit dem Beatstars-Kauflink", () => {
    expect(renderSignature(leer, "bsta.rs/x")).not.toBe(basis);
  });

  it("bleibt gleich bei gleichen Werten", () => {
    expect(renderSignature({ ...leer }, "")).toBe(basis);
  });
});
