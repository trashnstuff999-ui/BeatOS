// src/lib/typeBeat.test.ts

import { parseArtists, parseGenres, joinArtists, joinAlsoFits, joinGenres } from "./typeBeat";

describe("parseArtists", () => {
  it("splits on ' x ', comma and ' & ' (legacy freetext)", () => {
    expect(parseArtists("Dro Kenji x Juice WRLD, Lil Peep & Convolk"))
      .toEqual(["Dro Kenji", "Juice WRLD", "Lil Peep", "Convolk"]);
  });

  it("does not split names containing 'x' without spaces", () => {
    expect(parseArtists("Xavier Wulf")).toEqual(["Xavier Wulf"]);
  });

  it("handles empty/null", () => {
    expect(parseArtists("")).toEqual([]);
    expect(parseArtists(null)).toEqual([]);
    expect(parseArtists("   ")).toEqual([]);
  });
});

describe("parseGenres", () => {
  it("splits on pipe and comma", () => {
    expect(parseGenres("Sad Guitar Type Beat | Sad Melodic Type Beat"))
      .toEqual(["Sad Guitar Type Beat", "Sad Melodic Type Beat"]);
    expect(parseGenres("Dark, Melodic")).toEqual(["Dark", "Melodic"]);
  });

  it("handles legacy mixed separators", () => {
    expect(parseGenres("A | B, C")).toEqual(["A", "B", "C"]);
  });
});

describe("join + parse roundtrips", () => {
  it("artists roundtrip is stable", () => {
    const rows = ["Dro Kenji", "Juice WRLD", "Convolk"];
    expect(parseArtists(joinArtists(rows))).toEqual(rows);
    expect(joinArtists(rows)).toBe("Dro Kenji x Juice WRLD x Convolk");
  });

  it("also-fits roundtrip is stable", () => {
    const rows = ["Lil Peep", "Scorey"];
    expect(parseArtists(joinAlsoFits(rows))).toEqual(rows);
    expect(joinAlsoFits(rows)).toBe("Lil Peep, Scorey");
  });

  it("genres roundtrip is stable", () => {
    const rows = ["Sad Guitar Type Beat", "Sad Melodic Type Beat"];
    expect(parseGenres(joinGenres(rows))).toEqual(rows);
    expect(joinGenres(rows)).toBe("Sad Guitar Type Beat | Sad Melodic Type Beat");
  });

  it("join drops empty rows", () => {
    expect(joinArtists(["A", "  ", ""])).toBe("A");
    expect(joinGenres([])).toBe("");
  });
});
