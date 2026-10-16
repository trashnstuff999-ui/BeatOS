import { describe, it, expect } from "vitest";
import { plattformAusLink } from "./uploadLinks";

describe("plattformAusLink", () => {
  it("erkennt die drei Plattformen, auch Kurzlinks", () => {
    expect(plattformAusLink("https://www.youtube.com/watch?v=abc")).toBe("youtube");
    expect(plattformAusLink("https://youtu.be/abc")).toBe("youtube");
    expect(plattformAusLink("https://soundcloud.com/x/beat")).toBe("soundcloud");
    expect(plattformAusLink("https://on.soundcloud.com/abc")).toBe("soundcloud");
    expect(plattformAusLink(" https://www.beatstars.com/beat/x-123 ")).toBe("beatstars");
    expect(plattformAusLink("https://bsta.rs/abc")).toBe("beatstars");
  });

  it("alles andere ist kein Plattform-Link", () => {
    expect(plattformAusLink("Hook")).toBeNull();
    expect(plattformAusLink("https://notyoutube.com/x")).toBeNull();
    expect(plattformAusLink("https://example.com/youtube.com")).toBeNull();
  });
});
