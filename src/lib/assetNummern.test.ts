import { describe, it, expect } from "vitest";
import { nummerAusName, rolleAusMassen, planeNummern, type Bild } from "./assetNummern";

const h = (bits: string) => bits.padEnd(64, "0");
const bild = (name: string, secs: number, rolle: Bild["rolle"], hash: string | null = null): Bild =>
  ({ pfad: `C:\\MEDIA\\${name}`, name, secs, rolle, hash });

describe("nummerAusName", () => {
  it("liest Stephans Schreibweisen", () => {
    expect(nummerAusName("cover9.png")).toEqual({ rolle: "cover", nr: 9 });
    expect(nummerAusName("thumbnail2.png")).toEqual({ rolle: "thumbnail", nr: 2 });
    expect(nummerAusName("Cover_12.jpg")).toEqual({ rolle: "cover", nr: 12 });
    expect(nummerAusName("thumb-3.png")).toEqual({ rolle: "thumbnail", nr: 3 });
    expect(nummerAusName("SWEET DREAMS_Cover_2000x2000.png")).toBeNull();
    expect(nummerAusName("cover.png")).toBeNull();
  });
});

describe("rolleAusMassen", () => {
  it("quadratisch = Cover, 16:9 = Thumbnail", () => {
    expect(rolleAusMassen(2000, 2000)).toBe("cover");
    expect(rolleAusMassen(1920, 1080)).toBe("thumbnail");
    expect(rolleAusMassen(800, 1200)).toBeNull();
  });
});

describe("planeNummern", () => {
  it("vereinheitlicht vorhandene Nummern, ohne sie zu ändern", () => {
    const plan = planeNummern([bild("cover9.png", 1, "cover"), bild("thumbnail9.png", 2, "thumbnail"), bild("Cover_2.png", 3, "cover")]);
    expect(plan.map(p => [p.alt, p.neu])).toEqual([["cover9.png", "Cover_9.png"], ["thumbnail9.png", "Thumbnail_9.png"]]);
  });

  it("paart Neues übers Bild, sonst über die Zeit (unsicher), mit max + 1", () => {
    const plan = planeNummern([
      bild("cover9.png", 0, "cover"),
      // gleiches Motiv, Thumbnail eine Stunde später exportiert
      bild("Neues Cover.png", 1000, "cover", h("1111000011110000")),
      bild("yt thumb.png", 4600, "thumbnail", h("1111000011110001")),
      // anderes Motiv, aber zeitgleich exportiert
      bild("cover.png", 9000, "cover", h("0000111100001111")),
      bild("Thumbnail.png", 9100, "thumbnail", "1".repeat(32) + "0".repeat(32)),
      // Thumbnail ohne Partner
      bild("thumb alt.jpg", 50000, "thumbnail", "1".repeat(64)),
      bild("Video.png", 7, null),
    ]);
    const neu = Object.fromEntries(plan.map(p => [p.alt, [p.neu, p.unsicher]]));
    expect(neu["Neues Cover.png"]).toEqual(["Cover_10.png", false]);
    expect(neu["yt thumb.png"]).toEqual(["Thumbnail_10.png", false]);
    expect(neu["cover.png"]).toEqual(["Cover_11.png", true]);
    expect(neu["Thumbnail.png"]).toEqual(["Thumbnail_11.png", true]);
    expect(neu["thumb alt.jpg"]).toEqual(["Thumbnail_12.jpg", false]);
    expect(neu["Video.png"]).toBeUndefined();
  });
});
