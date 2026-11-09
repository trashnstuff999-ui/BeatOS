import { describe, it, expect } from "vitest";
import { kuenstlerOrdner, samplesOrdner } from "./SettingsContext";

describe("kuenstlerOrdner", () => {
  it("nimmt die Einstellung, sonst 05_ARTISTS neben dem Archiv", () => {
    expect(kuenstlerOrdner({ artistsPath: "D:\\Artists", archivePath: "C:\\Lib\\03_ARCHIVE" })).toBe("D:\\Artists");
    expect(kuenstlerOrdner({ artistsPath: "", archivePath: "C:\\Lib\\03_ARCHIVE\\" })).toBe("C:\\Lib\\05_ARTISTS");
    expect(kuenstlerOrdner({ artistsPath: "", archivePath: "/home/x/03_ARCHIVE" })).toBe("/home/x/05_ARTISTS");
    expect(kuenstlerOrdner({ artistsPath: "", archivePath: "" })).toBe("");
  });
});

describe("samplesOrdner", () => {
  it("06_SAMPLES neben dem Archiv", () => {
    expect(samplesOrdner("C:\\Lib\\03_ARCHIVE")).toBe("C:\\Lib\\06_SAMPLES");
    expect(samplesOrdner("")).toBe("");
  });
});
