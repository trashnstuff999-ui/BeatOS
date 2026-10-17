import { describe, it, expect } from "vitest";
import { nameAusTitel, kandidaten, linkSchluessel } from "./nacherfassen";

const BEATS = [
  { id: "0932", name: "DONT WANNA BE" },
  { id: "0903", name: "CALL ME" },
  { id: "0500", name: "Home" },
  { id: "0610", name: "HOME" },
];

describe("Uploads nacherfassen: Zuordnung", () => {
  it("liest den Namen aus beiden Titelformen (YouTube und SoundCloud)", () => {
    expect(nameAusTitel('[FREE] Lil Peep x Juice WRLD Type Beat "DONT WANNA BE"')).toBe("DONT WANNA BE");
    expect(nameAusTitel('[FREE] "DONT WANNA BE" Lil Peep x Juice WRLD Type Beat 2026')).toBe("DONT WANNA BE");
    expect(nameAusTitel("Beat ohne Namen in Anführungszeichen")).toBeNull();
  });

  it("findet eindeutige, mehrdeutige und keine Treffer", () => {
    expect(kandidaten('[FREE] Juice WRLD Type Beat "Don\'t Wanna Be"', BEATS).map(b => b.id)).toEqual(["0932"]);
    expect(kandidaten('[FREE] Type Beat "HOME"', BEATS).map(b => b.id)).toEqual(["0500", "0610"]);
    expect(kandidaten('[FREE] Type Beat "GIBTS NICHT"', BEATS)).toEqual([]);
    expect(kandidaten("Kein Name", BEATS)).toEqual([]);
    // Ältere SoundCloud-Titel ohne Anführungszeichen: der ganze Titel zählt
    expect(kandidaten("Call Me", BEATS).map(b => b.id)).toEqual(["0903"]);
  });

  it("gleicht Links unabhängig von www, Schrägstrich und Parametern ab", () => {
    expect(linkSchluessel("https://www.youtube.com/watch?v=uVinrWFwhmQ")).toBe("yt:uVinrWFwhmQ");
    expect(linkSchluessel("https://youtu.be/uVinrWFwhmQ")).toBe("yt:uVinrWFwhmQ");
    expect(linkSchluessel("https://www.youtube.com/watch?v=qOC9j80lG9M"))
      .not.toBe(linkSchluessel("https://www.youtube.com/watch?v=uVinrWFwhmQ"));
    expect(linkSchluessel("https://soundcloud.com/prodgoodbxy/dontwannabe/")).toBe("soundcloud.com/prodgoodbxy/dontwannabe");
  });
});
