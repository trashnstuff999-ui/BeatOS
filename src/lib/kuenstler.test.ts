import { describe, it, expect } from "vitest";
import { passtZumSong, pfadSchluessel } from "./kuenstler";

describe("pfadSchluessel", () => {
  it("gleicht Schreibweisen von Pfaden an", () => {
    expect(pfadSchluessel(String.raw`D:\Downloads [D]\Feelings feeln vocals.mp3`))
      .toBe(pfadSchluessel("d:/downloads [d]//Feelings Feeln Vocals.mp3"));
  });
});

describe("passtZumSong", () => {
  it("findet Downloads am Songnamen, egal wie geschrieben", () => {
    expect(passtZumSong("heartbreak highlights_vocals.wav", "Heartbreak Highlights")).toBe(true);
    expect(passtZumSong("HeartbreakHighlights.mp3", "Heartbreak Highlights")).toBe(true);
    expect(passtZumSong("Mindestens 2K Vocals.wav", "Mindestens 2K")).toBe(true);
    expect(passtZumSong("finden_vocals.wav", "Heartbreak Highlights")).toBe(false);
    expect(passtZumSong("irgendwas.wav", "ab"), "zu kurz passt auf alles").toBe(false);
  });
});
