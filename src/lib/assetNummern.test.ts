import { describe, it, expect } from "vitest";
import { planeNummern, type Bild } from "./assetNummern";

const bild = (name: string, secs: number, rolle: Bild["rolle"]): Bild =>
  ({ pfad: `C:\\MEDIA\\${name}`, name, secs, rolle });

describe("planeNummern", () => {
  it("neuestes bekommt die 1, Covers und Thumbnails zählen getrennt", () => {
    const plan = planeNummern([
      bild("cover9.png", 100, "cover"),
      bild("Neues Cover.png", 300, "cover"),
      bild("Cover_1.png", 200, "cover"),
      // jüngstes Bild überhaupt, verschiebt die Covers aber nicht
      bild("yt thumb.jpg", 999, "thumbnail"),
      bild("Thumbnail_1.png", 50, "thumbnail"),
    ]);
    expect(Object.fromEntries(plan.map(p => [p.alt, p.neu]))).toEqual({
      "Neues Cover.png": "Cover_1.png",
      "Cover_1.png": "Cover_2.png",
      "cover9.png": "Cover_3.png",
      "yt thumb.jpg": "Thumbnail_1.jpg",
      "Thumbnail_1.png": "Thumbnail_2.png",
    });
  });

  it("schon richtig nummeriert: nichts zu tun", () => {
    expect(planeNummern([bild("Cover_1.png", 2, "cover"), bild("Cover_2.png", 1, "cover"), bild("Thumbnail_1.png", 0, "thumbnail")])).toEqual([]);
  });
});
