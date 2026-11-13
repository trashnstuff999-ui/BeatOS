import { describe, it, expect } from "vitest";
import { passtZumSong, pfadSchluessel, songStand, songVerlauf, phase, erledigtFuer, aehnlich } from "./kuenstler";

describe("songVerlauf", () => {
  it("nimmt je Etappe die erste Datei, sortiert nach Datum", () => {
    const t = (iso: string) => new Date(iso).getTime() / 1000;
    const v = songVerlauf([
      { art: "mix", geaendert: t("2026-10-15T10:00:00") },
      { art: "vocals", geaendert: t("2026-10-14T10:00:00") },
      { art: "vocals", geaendert: t("2026-10-12T10:00:00") },
      { art: "beat", geaendert: t("2026-10-01T10:00:00") },
    ], "2026-10-18");
    expect(v.map(s => [s.label, s.datum.getDate()])).toEqual([["Vocals", 12], ["Mix", 15], ["Abgegeben", 18]]);
    expect(songVerlauf([], null)).toEqual([]);
  });
});

describe("songStand", () => {
  const s = { fertig: false, warten: false, vocals: false, mix: false, master: false };
  it("nennt den nächsten Schritt", () => {
    expect(songStand(s)).toEqual({ text: "Vocals fehlen", schritt: 0, ton: "offen" });
    expect(songStand({ ...s, vocals: true }).text).toBe("Mix offen");
    expect(songStand({ ...s, vocals: true, mix: true })).toEqual({ text: "Master offen", schritt: 2, ton: "offen" });
    expect(songStand({ ...s, vocals: true, mix: true, master: true }).ton).toBe("bereit");
    expect(songStand({ ...s, vocals: true, warten: true })).toEqual({ text: "Feedback offen", schritt: 1, ton: "warten" });
    expect(songStand({ ...s, fertig: true, warten: true })).toEqual({ text: "Abgegeben", schritt: 4, ton: "fertig" });
    expect(songStand({ ...s, nur_master: true })).toEqual({ text: "Master offen", schritt: 2, ton: "offen" });
    expect(songStand({ ...s, vocals: true, geplant: true }).text).toBe("Geplant");
  });
});

describe("phase und Stufen", () => {
  const s = { fertig: false, warten: false, vocals: false, mix: false, master: false };
  it("sagt, woran der Track hängt", () => {
    expect(phase(s)).toBe("Recording");
    expect(phase({ ...s, vocals: true })).toBe("Mixing");
    expect(phase({ ...s, vocals: true, mix: true })).toBe("Mastering");
    expect(phase({ ...s, vocals: true, mix: true, master: true })).toBe("Ready");
    expect(phase({ ...s, nur_master: true })).toBe("Mastering");
    expect(phase({ ...s, warten: true })).toBe("Feedback offen");
    expect(phase({ ...s, fertig: true, warten: true })).toBe("abgegeben");
    expect(phase({ ...s, geplant: true })).toBe("geplant");
  });
  it("Stufe → Haken", () => {
    expect(erledigtFuer(0)).toEqual([]);
    expect(erledigtFuer(3)).toEqual(["vocals", "mix", "master"]);
    expect(erledigtFuer(4)).toEqual(["vocals", "mix", "master", "abgegeben"]);
  });
});

describe("aehnlich", () => {
  it("findet Doppel trotz Klammern und Tippfehlern", () => {
    expect(aehnlich("spirirt of live", "Spirit of Live")).toBe(true);
    expect(aehnlich("NO BLEED (Prod. goodbxy)", "No Bleed")).toBe(true);
    expect(aehnlich("Massaker Mental [Beat- Stay]", "Massaker Mental")).toBe(true);
    expect(aehnlich("Natsmaus", "Natsmaus")).toBe(true);
    expect(aehnlich("Traum", "Finden")).toBe(false);
    expect(aehnlich("Soul", "Struggle")).toBe(false);
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
