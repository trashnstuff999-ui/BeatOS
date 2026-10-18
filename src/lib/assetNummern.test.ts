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
  it("schließt Lücken, Reihenfolge und Paare bleiben", () => {
    const plan = planeNummern([bild("cover9.png", 1, "cover"), bild("thumbnail9.png", 2, "thumbnail"), bild("Cover_2.png", 3, "cover")]);
    expect(plan.map(p => [p.alt, p.neu])).toEqual([
      ["Cover_2.png", "Cover_1.png"], ["cover9.png", "Cover_2.png"], ["thumbnail9.png", "Thumbnail_2.png"],
    ]);
  });

  it("nach dem Zuweisen von Cover_1/Thumbnail_1 rutscht der Rest nach", () => {
    const plan = planeNummern([
      bild("Cover_2.png", 1, "cover"), bild("Thumbnail_2.png", 1, "thumbnail"),
      bild("Cover_3.png", 2, "cover"), bild("Thumbnail_3.png", 2, "thumbnail"),
    ]);
    expect(plan.map(p => p.neu)).toEqual(["Cover_1.png", "Thumbnail_1.png", "Cover_2.png", "Thumbnail_2.png"]);
    // Reihenfolge: jedes Ziel ist frei, bevor es gebraucht wird
    plan.forEach((p, i) => expect(plan.slice(i + 1).some(q => q.alt === p.neu)).toBe(false));
    expect(planeNummern([bild("Cover_1.png", 1, "cover"), bild("Thumbnail_1.png", 1, "thumbnail")])).toEqual([]);
  });

  it("paart Neues übers Bild, sonst über die Zeit (unsicher), hinten dran", () => {
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
    expect(neu["cover9.png"]).toEqual(["Cover_1.png", false]);
    expect(neu["Neues Cover.png"]).toEqual(["Cover_2.png", false]);
    expect(neu["yt thumb.png"]).toEqual(["Thumbnail_2.png", false]);
    expect(neu["cover.png"]).toEqual(["Cover_3.png", true]);
    expect(neu["Thumbnail.png"]).toEqual(["Thumbnail_3.png", true]);
    expect(neu["thumb alt.jpg"]).toEqual(["Thumbnail_4.jpg", false]);
    expect(neu["Video.png"]).toBeUndefined();
  });
});
