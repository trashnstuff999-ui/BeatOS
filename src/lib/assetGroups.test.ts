// src/lib/assetGroups.test.ts

import { extractGroupKey, groupAssets } from "./assetGroups";
import type { AssetFile } from "../types/studio";

function file(name: string, modified = 1000): AssetFile {
  return {
    path: `C:/inbox/${name}`,
    name,
    kind: name.endsWith(".mp4") ? "video" : "image",
    guessed_role: name.toLowerCase().includes("thumb") ? "thumbnail"
      : name.toLowerCase().includes("cover") ? "cover"
      : name.endsWith(".mp4") ? "video" : "image",
    size: 1024,
    modified_date: "2026-07-14",
    modified_secs: modified,
  };
}

describe("extractGroupKey", () => {
  it("uses the last number in the name", () => {
    expect(extractGroupKey("Cover_17.png")).toBe("17");
    expect(extractGroupKey("2026_Thumbnail_17.png")).toBe("17");
  });

  it("returns null without a number", () => {
    expect(extractGroupKey("cover.png")).toBeNull();
  });

  it("ignores digits in the file extension", () => {
    // ".mp4" must not turn into group "4"
    expect(extractGroupKey("Visualizer_17.mp4")).toBe("17");
    expect(extractGroupKey("clip.mp4")).toBeNull();
  });
});

describe("groupAssets", () => {
  it("groups cover + thumbnail sharing a number", () => {
    const { groups, singles } = groupAssets([file("Cover_17.png"), file("Thumbnail_17.png")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("17");
    expect(groups[0].items).toHaveLength(2);
    expect(singles).toHaveLength(0);
  });

  it("keeps a lone numbered file as single", () => {
    const { groups, singles } = groupAssets([file("Cover_18.png")]);
    expect(groups).toHaveLength(0);
    expect(singles.map(s => s.name)).toEqual(["Cover_18.png"]);
  });

  it("puts files without a number into singles", () => {
    const { groups, singles } = groupAssets([file("artwork.png")]);
    expect(groups).toHaveLength(0);
    expect(singles).toHaveLength(1);
  });

  it("sorts groups and singles newest first", () => {
    const { groups, singles } = groupAssets([
      file("Cover_1.png", 100), file("Thumbnail_1.png", 100),
      file("Cover_2.png", 900), file("Thumbnail_2.png", 900),
      file("alt.png", 50), file("neu.png", 800),
    ]);
    expect(groups.map(g => g.key)).toEqual(["2", "1"]);
    expect(singles.map(s => s.name)).toEqual(["neu.png", "alt.png"]);
  });

  it("groups a video with its cover/thumbnail set", () => {
    const { groups } = groupAssets([
      file("Cover_17.png"), file("Thumbnail_17.png"), file("Visualizer_17.mp4"),
    ]);
    expect(groups[0].items).toHaveLength(3);
  });
});
