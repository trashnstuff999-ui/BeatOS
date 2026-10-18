import { describe, it, expect } from "vitest";
import { passtZumSong, pfadSchluessel, songStand } from "./kuenstler";

describe("songStand", () => {
  const s = { fertig: false, warten: false, vocals: false, mix: false, master: false };
  it("nennt den nächsten Schritt", () => {
    expect(songStand(s)).toEqual({ text: "Vocals fehlen", schritt: 0, ton: "offen" });
    expect(songStand({ ...s, vocals: true }).text).toBe("Mix offen");
    expect(songStand({ ...s, vocals: true, mix: true })).toEqual({ text: "Master offen", schritt: 2, ton: "offen" });
    expect(songStand({ ...s, vocals: true, mix: true, master: true }).ton).toBe("bereit");
    expect(songStand({ ...s, vocals: true, warten: true })).toEqual({ text: "Warte auf Künstler", schritt: 1, ton: "warten" });
    expect(songStand({ ...s, fertig: true, warten: true })).toEqual({ text: "Abgegeben", schritt: 4, ton: "fertig" });
  });
});

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
