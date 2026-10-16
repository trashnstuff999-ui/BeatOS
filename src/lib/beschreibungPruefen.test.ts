import { describe, it, expect } from "vitest";
import { pruefeBeschreibung, zerlege, effektiv } from "./descriptions";

const yt = (beschreibung: string, tags = "a, b") =>
  `YOUTUBE TITEL:\nMein Titel\n\n${beschreibung}\n\nTAGS:\n${tags}\n`;
const LINK = "https://bsta.rs/abc";

describe("pruefeBeschreibung", () => {
  it("ein sauberer Text hat keine Hinweise", () => {
    expect(pruefeBeschreibung("youtube", yt(`Kaufen: ${LINK}\n\n0:00 Intro\n0:20 Hook\n0:40 Verse`), LINK)).toEqual([]);
  });

  it("findet offene Platzhalter, doppelte Tags und kaputte Kapitel", () => {
    const h = pruefeBeschreibung("youtube", yt(`Kaufen: ${LINK}\n{{PRODUCER_LINE}}\n0:05 Intro\n0:20 Hook\n0:40 Verse`, "sad, Sad, dark"), LINK);
    expect(h.map(x => x.text)).toEqual([
      "Nicht ausgefüllt: {{PRODUCER_LINE}}",
      "Doppelte Tags: sad",
      "Kapitel: die erste Marke muss bei 0:00 liegen",
    ]);
  });

  it("Kauflink unterhalb der sichtbaren Zeilen fällt auf", () => {
    const h = pruefeBeschreibung("youtube", yt(`Zeile 1\nZeile 2\nZeile 3\nKaufen: ${LINK}`), LINK);
    expect(h.some(x => x.text.startsWith("Der Kauflink steht nicht"))).toBe(true);
  });

  it("ohne BeatStars-Link warnt nur YouTube/SoundCloud", () => {
    expect(pruefeBeschreibung("beatstars", yt("x"), null)).toEqual([]);
    expect(pruefeBeschreibung("soundcloud", yt("x"), null)[0].text).toMatch(/Kein BeatStars-Link/);
  });
});

describe("zerlege", () => {
  it("hebt Zeitmarke, Link und Hashtag hervor", () => {
    expect(zerlege("0:20 Hook")).toEqual([{ art: "zeit", text: "0:20" }, { art: "text", text: " Hook" }]);
    expect(zerlege(`Kaufen: ${LINK} #sad`)).toEqual([
      { art: "text", text: "Kaufen: " },
      { art: "link", text: LINK },
      { art: "text", text: " " },
      { art: "hashtag", text: "#sad" },
    ]);
  });
});

describe("effektiv", () => {
  it("eigene Fassung schlägt Vorlage", () => {
    expect(effektiv({ beatstars: "V", soundcloud: "V", youtube: "V" }, { youtube: "E" }))
      .toEqual({ beatstars: "V", soundcloud: "V", youtube: "E" });
  });
});
