// src/lib/time.test.ts

import { formatRelativeTime, daysSince } from "./time";

const NOW = 1_800_000_000; // fixed reference

const ago = (secs: number) => NOW - secs;
const MIN = 60, HOUR = 3600, DAY = 86400;

describe("formatRelativeTime", () => {
  it("handles the near past", () => {
    expect(formatRelativeTime(ago(10), NOW)).toBe("gerade eben");
    expect(formatRelativeTime(ago(5 * MIN), NOW)).toBe("vor 5 Min.");
    expect(formatRelativeTime(ago(2 * HOUR), NOW)).toBe("vor 2 Std.");
  });

  it("handles days and yesterday", () => {
    expect(formatRelativeTime(ago(30 * HOUR), NOW)).toBe("gestern");
    expect(formatRelativeTime(ago(6 * DAY), NOW)).toBe("vor 6 Tagen");
  });

  it("handles weeks, months, years incl. singular", () => {
    expect(formatRelativeTime(ago(8 * DAY), NOW)).toBe("vor 1 Woche");
    expect(formatRelativeTime(ago(21 * DAY), NOW)).toBe("vor 3 Wochen");
    expect(formatRelativeTime(ago(45 * DAY), NOW)).toBe("vor 1 Monat");
    expect(formatRelativeTime(ago(200 * DAY), NOW)).toBe("vor 6 Monaten");
    expect(formatRelativeTime(ago(400 * DAY), NOW)).toBe("vor 1 Jahr");
    expect(formatRelativeTime(ago(800 * DAY), NOW)).toBe("vor 2 Jahren");
  });

  it("handles invalid input", () => {
    expect(formatRelativeTime(0, NOW)).toBe("—");
  });
});

describe("daysSince", () => {
  it("counts whole days", () => {
    expect(daysSince(ago(10), NOW)).toBe(0);
    expect(daysSince(ago(31 * DAY), NOW)).toBe(31);
  });
});
