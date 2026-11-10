import { describe, expect, it } from "vitest";
import { aufteilen, ganzerSong, artistVorschlag, auswahlUmschalten, zusammenlegen } from "./GelbAnsicht";
import type { Fund, FundDatei } from "../../types/fundstuecke";

const datei = (path: string, titel: string | null, key: string | null, bpm: number | null, flp = false): FundDatei =>
  ({ path, size: 1, modified: 0, flp, im_archiv: false, titel, key, bpm, archiv: null, weg: false });
const fund = (grund: string, dateien: FundDatei[]): Fund => ({
  id: null, titel: "Destiny", key: null, bpm: null, ampel: "gelb", grund, archiv: null, nur_hier: dateien.length,
  fertig: null, dateien, weg: false,
});

describe("aufteilen", () => {
  it("trennt zwei Songs gleichen Titels nach Key und BPM", () => {
    const teile = aufteilen(fund("Key/BPM uneinheitlich", [
      datei("a.mp3", "Destiny", "F#m", 140),
      datei("b.mp3", "Destiny", "Dm", 181),
      datei("c.mp3", "Destiny", "F#m", 140),
      datei("Destiny.flp", null, null, null, true),
    ]));
    expect(teile).toHaveLength(3);
    expect(teile.find(t => t.key === "F#m")?.dateien.map(d => d.path)).toEqual(["a.mp3", "c.mp3"]);
    expect(teile.find(t => t.key === "Dm")?.bpm).toBe(181);
    // Die FLP ohne Angabe bleibt ein eigener Teil, nichts wird geraten
    expect(teile.find(t => t.dateien[0].flp)?.dateien).toHaveLength(1);
  });

  it("blendet Teile aus, die schon ganz im Archiv liegen, und hängt FLPs an ihren Ordner", () => {
    const imArchiv = (p: string): FundDatei => ({ ...datei(p, "Destiny", "Dm", 181), im_archiv: true });
    const teile = aufteilen(fund("Key/BPM uneinheitlich", [
      imArchiv(String.raw`C:\P0455\Destiny [181 Dm].mp3`),
      imArchiv(String.raw`C:\P0455\Destiny [181 Dm]_2.mp3`),
      datei(String.raw`C:\P0209\Destiny [140 F#m].mp3`, "Destiny", "F#m", 140),
      datei(String.raw`C:\P0209\Destiny.flp`, "Destiny", null, null, true),
    ]));
    expect(teile).toHaveLength(1);
    expect(teile[0].key).toBe("F#m");
    expect(teile[0].dateien.map(d => d.path)).toEqual([String.raw`C:\P0209\Destiny [140 F#m].mp3`, String.raw`C:\P0209\Destiny.flp`]);
  });

  it("Louis V: nur die neuere FLP fehlt, Gleich wie 0776 wird angeboten", () => {
    const a = "0776 - Louis V [Dm 165]";
    const imArchiv = (p: string, key: string): FundDatei => ({ ...datei(p, "Louis V", key, 165), im_archiv: true, archiv: a });
    const teile = aufteilen(fund("Key/BPM uneinheitlich", [
      imArchiv(String.raw`C:\P0242\Louis V [165 Dm].mp3`, "Dm"),
      imArchiv(String.raw`C:\P0242\Louis V [165 F#m].mp3`, "F#m"),
      datei(String.raw`C:\P0242\Project_78.flp`, null, null, null, true),
    ]));
    expect(teile).toHaveLength(1);
    expect(teile[0].dateien.map(d => d.path)).toEqual([String.raw`C:\P0242\Project_78.flp`]);
    expect(teile[0].archiv).toBe(a);
  });

  it("lässt andere Gründe zusammen", () => {
    const f = fund("ohne Nummer", [datei("a.mp3", "X", "Am", 120), datei("b.mp3", "X", "Cm", 120)]);
    expect(aufteilen(f)).toEqual([f]);
  });
});

describe("ganzerSong", () => {
  it("Try: 132 und 85 BPM zusammen als ein Song, eine Nummer", () => {
    const f = { ...fund("Key/BPM uneinheitlich", [
      datei("Try [132 C#m].mp3", "Try", "C#m", 132),
      datei("Try [85 C#m].mp3", "Try", "C#m", 85),
    ]), titel: "Try" };
    const teile = aufteilen(f);
    expect(teile).toHaveLength(2);
    const ganz = ganzerSong({ f, teile });
    expect(ganz.dateien).toHaveLength(2);
    expect(ganz.titel).toBe("Try");
  });
});

describe("artistVorschlag", () => {
  const artists = ["CHIA B", "JarnoGm", "Yoghi"];
  it("liest den Artist vorn aus dem Titel", () => {
    expect(artistVorschlag({ ...fund("ohne Nummer", [datei("x.mp3", null, null, null)]), titel: "JarnoGm - NACH VORN" }, artists))
      .toEqual({ artist: "JarnoGm", song: "NACH VORN" });
  });
  it("nimmt sonst den Ordner, ohne Treffer bleibt der Artist leer", () => {
    const bhm = { ...fund("ohne Nummer", [datei(String.raw`C:\Projects\JarnoGm\Behind her mind.wav`, null, null, null)]), titel: "Behind her mind" };
    expect(artistVorschlag(bhm, artists)).toEqual({ artist: "JarnoGm", song: "Behind her mind" });
    expect(artistVorschlag({ ...bhm, dateien: [datei("C:/Songs/x.mp3", null, null, null)] }, artists).artist).toBe("");
  });
});

describe("auswahlUmschalten", () => {
  it("ganzer Song und seine Fassung schließen sich aus, verschiedene Songs nicht", () => {
    const a = datei("a.mp3", "Destiny", "F#m", 140), b = datei("b.mp3", "Destiny", "Dm", 181);
    const ganz = fund("Key/BPM uneinheitlich", [a, b]), teil = fund("Key/BPM uneinheitlich", [a]);
    const anderer = { ...fund("nur Nummer", [datei("536.wav", null, null, null)]), titel: "536" };
    let m = auswahlUmschalten(new Map(), [ganz, anderer], true);
    expect(m.size).toBe(2);
    m = auswahlUmschalten(m, [teil], true);
    expect([...m.values()]).toEqual([anderer, teil]);
    expect(auswahlUmschalten(m, [teil], false).size).toBe(1);
  });
});

describe("zusammenlegen", () => {
  it("nimmt alle Dateien, den kürzesten Titel und Key/BPM, wo vorhanden", () => {
    const a = { ...fund("ohne Nummer", [datei("P0572/100 Tausend_4.mp3", "100 Tausend", null, null), datei("P0572/100 Tausend_3.mp3", "100 Tausend", null, null)]), titel: "100 Tausend" };
    const b = { ...fund("ohne Nummer", [datei("P0572/100 Tausend_mix.mp3", "100 Tausend_mix", "Am", 140)]), titel: "100 Tausend_mix", key: "Am", bpm: 140 };
    const z = zusammenlegen([b, a]);
    expect(z.titel).toBe("100 Tausend");
    expect(z.dateien).toHaveLength(3);
    expect([z.key, z.bpm, z.nur_hier, z.archiv]).toEqual(["Am", 140, 3, null]);
  });
});
