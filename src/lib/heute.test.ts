import { describe, it, expect } from "vitest";
import { woche, alsNaechstes, liegengeblieben, tageAufzaehlen } from "./heute";
import type { ScheduleEntry, QueueBeat } from "../types/upload";
import type { StudioProject } from "../types/studio";

const eintrag = (date: string, platform: string, status: string, id = "dwb"): ScheduleEntry =>
  ({ date, platform, status, beat_id: id, beat_name: id.toUpperCase(), cover: null }) as ScheduleEntry;

describe("Woche", () => {
  // Mo 12.10.2026 – So 18.10.2026, heute Mi 14.
  const tage = woche(new Date(2026, 9, 12), [1, 3, 5], [
    eintrag("2026-10-12", "youtube", "uploaded"),
    eintrag("2026-10-12", "beatstars", "uploaded"),
    eintrag("2026-10-16", "youtube", "scheduled", "uid"),
  ], new Date(2026, 9, 14));

  it("legt drei Plattformen am selben Tag zu einem Beat zusammen", () => {
    expect(tage[0].beats).toEqual([{ id: "dwb", name: "DWB", cover: null, hochgeladen: true }]);
    expect(tage[4].beats[0].hochgeladen).toBe(false);
  });

  it("kennt Upload-Tage, heute und vorbei", () => {
    expect(tage.map(t => t.uploadTag)).toEqual([true, false, true, false, true, false, false]);
    expect(tage[2].heute).toBe(true);
    expect(tage[1].vorbei).toBe(true);
    expect(tage[2].vorbei).toBe(false);
  });
});

const beat = (id: string, fehlt: string[], created_date: string): QueueBeat =>
  ({ id, name: id, cover: null, key: null, bpm: null, created_date, fehlt });

describe("Als Nächstes", () => {
  it("nimmt, wem am wenigsten fehlt, bei Gleichstand den ältesten", () => {
    expect(alsNaechstes([
      beat("neu", ["Infos"], "2026-06-01"),
      beat("komplett", [], "2026-06-28"),
      beat("alt-komplett", [], "2026-05-01"),
    ])?.id).toBe("alt-komplett");
    expect(alsNaechstes([])).toBeNull();
  });
});

describe("Liegengeblieben", () => {
  const p = (name: string, status: string, tageAlt: number) =>
    ({ name, status, modified_secs: 100 * 86400 - tageAlt * 86400 }) as StudioProject;
  it("zeigt nur „In Arbeit\" älter als 30 Tage, die jüngsten zuerst", () => {
    const r = liegengeblieben([p("frisch", "wip", 9), p("alt", "wip", 90), p("mittel", "wip", 37), p("idee", "idea", 60)], 100 * 86400);
    expect(r.map(x => x.name)).toEqual(["mittel", "alt"]);
  });
});

it("zählt Wochentage auf", () => {
  expect(tageAufzaehlen([1, 3, 5])).toBe("Mo, Mi und Fr");
  expect(tageAufzaehlen([5])).toBe("Fr");
});
