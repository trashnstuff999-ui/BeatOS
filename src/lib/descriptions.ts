// src/lib/descriptions.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Display-only extractors over the rendered description files.
// The rendered .txt format is the single source; nothing here changes it.
// Used by DescriptionFilesCard (copy panels) and the Upload assistant.
// ═══════════════════════════════════════════════════════════════════════════════

/** Title = the first non-empty line after a line ending in "TITEL:"
 *  ("BEATSTARS TITEL:", "TITEL:"). Fallback: first non-empty line. */
export function extractTitle(content: string): string {
  const lines = content.split(/\r?\n/);
  const idx = lines.findIndex(l => /titel:\s*$/i.test(l.trim()));
  if (idx >= 0) {
    for (let i = idx + 1; i < lines.length; i++) {
      const t = lines[i].trim();
      if (t) return t;
    }
  }
  return lines.map(l => l.trim()).find(Boolean) ?? "";
}

/** Everything after the title block — what goes into the platform's
 *  description field. Leading blank/separator lines (────, ---) and a
 *  "BESCHREIBUNG:"/"DESCRIPTION:" label are stripped. */
export function extractDescription(content: string): string {
  const lines = content.split(/\r?\n/);
  const labelIdx = lines.findIndex(l => /titel:\s*$/i.test(l.trim()));
  let start = 0;
  if (labelIdx >= 0) {
    // skip the label line + the title line itself
    start = labelIdx + 1;
    while (start < lines.length && !lines[start].trim()) start++;
    start++; // past the title line
  }
  while (start < lines.length) {
    const t = lines[start].trim();
    const isSeparator = t.length > 0 && /^[─—\-_=]+$/.test(t);
    const isLabel = /^(beschreibung|description):?\s*$/i.test(t);
    if (!t || isSeparator || isLabel) { start++; continue; }
    break;
  }
  return lines.slice(start).join("\n").trimEnd();
}

/** The tag block after a line "TAGS:" — up to the next blank line (or EOF).
 *  Returned verbatim (SoundCloud: "#Tag" per line, YouTube/Beatstars:
 *  comma list), so copying pastes exactly what the platform expects. */
export function extractTags(content: string): string {
  const lines = content.split(/\r?\n/);
  const idx = lines.findIndex(l => /^tags:\s*$/i.test(l.trim()));
  if (idx < 0) return "";
  const out: string[] = [];
  for (let i = idx + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) {
      if (out.length > 0) break; // block ended
      continue;                  // skip blank lines directly after TAGS:
    }
    out.push(lines[i]);
  }
  return out.join("\n").trim();
}

/** How many individual tags the block contains ("#" lines or comma items). */
export function countTags(tagBlock: string): number {
  if (!tagBlock.trim()) return 0;
  const lines = tagBlock.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length > 1 || lines[0]?.startsWith("#")) {
    return lines.filter(l => l.startsWith("#") || l.length > 0).length;
  }
  return lines[0].split(",").map(t => t.trim()).filter(Boolean).length;
}

/** Alles, was in den gerenderten Text einfließt — und nur das.
 *
 *  Die Beschreibungs-Karte rendert nur neu, wenn sich diese Signatur ändert;
 *  auf jedes `refresh()` neu zu rendern würde beim Tippen Eingaben
 *  überschreiben. Der Preis dafür: **fehlt ein Feld hier, bleibt seine
 *  Änderung in der Karte unsichtbar.** Genau das passierte mit den
 *  Kapitelmarken — sie standen in der Datenbank und in der Vorlagen-Vorschau,
 *  aber die Karte zeigte weiter den Stand von davor.
 *
 *  Wer dem Renderer einen Platzhalter hinzufügt, gehört hier ebenfalls hin. */
export function renderSignature(
  beat: {
    type_beat_main: string | null;
    type_beat_also_fits: string | null;
    genre_tags: string | null;
    youtube_tags: string | null;
    soundcloud_tags: string | null;
    timecodes: string | null;
  },
  beatstarsUrl: string,
): string {
  return [
    beat.type_beat_main      ?? "",
    beat.type_beat_also_fits ?? "",
    beat.genre_tags          ?? "",
    beat.youtube_tags        ?? "",
    beat.soundcloud_tags     ?? "",
    beat.timecodes           ?? "",
    beatstarsUrl,
  ].join("|");
}

// ═══════════════════════════════════════════════════════════════════════════════
// Eigene Fassung vor Vorlage
// ═══════════════════════════════════════════════════════════════════════════════

type Plattform = "beatstars" | "soundcloud" | "youtube";
const PLATTFORMEN: Plattform[] = ["beatstars", "soundcloud", "youtube"];

/** Was wirklich hochgeladen wird: die von Hand geänderte Fassung, wo es eine
 *  gibt, sonst die Vorlage. Karte und Release-Assistent lesen beide hierüber
 *  — vorher kopierte der Assistent die Vorlage, auch wenn man sie geändert hatte. */
export function effektiv(
  gerendert: Record<Plattform, string>,
  overrides: Partial<Record<string, string>>,
): Record<Plattform, string> {
  return Object.fromEntries(
    PLATTFORMEN.map(p => [p, overrides[p] ?? gerendert[p]]),
  ) as Record<Plattform, string>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Prüfung vor dem Upload
// ═══════════════════════════════════════════════════════════════════════════════

export interface Hinweis {
  stufe: "fehler" | "hinweis";
  text: string;
}

/** Wie viele Zeilen YouTube zeigt, bevor „…mehr" zuklappt (Desktop). */
export const YT_SICHTBARE_ZEILEN = 3;

const URL_RE = /https?:\/\/[^\s)]+/g;
const HASHTAG_RE = /(^|\s)#[\p{L}\p{N}_]+/gu;
const ZEITMARKE_RE = /^\s*((?:\d+:)?\d{1,2}:\d{2})\s+\S/;

const sekunden = (mmss: string) =>
  mmss.split(":").map(Number).reduce((s, n) => s * 60 + n, 0);

/** Was vor dem Upload auffallen sollte — leer heißt: alles in Ordnung.
 *  Fehler verhindern, dass etwas so ankommt wie gedacht; Hinweise sind
 *  Empfehlungen. */
export function pruefeBeschreibung(
  plattform: Plattform,
  inhalt: string,
  beatstarsUrl: string | null,
): Hinweis[] {
  const out: Hinweis[] = [];
  const titel = extractTitle(inhalt);
  const text = extractDescription(inhalt);
  const tags = extractTags(inhalt);

  const offen = [...new Set(inhalt.match(/\{\{[A-Z0-9_]+\}\}/g) ?? [])];
  if (offen.length) out.push({ stufe: "fehler", text: `Nicht ausgefüllt: ${offen.join(", ")}` });

  if (!titel) out.push({ stufe: "fehler", text: "Kein Titel" });
  else if (titel.length > 100) out.push({ stufe: "fehler", text: `Titel ist ${titel.length} Zeichen lang — erlaubt sind 100` });

  // Kein Hinweis auf einen fehlenden BeatStars-Link: vor dem BeatStars-Upload
  // fehlt er immer, und der Release-Assistent rendert danach mit Link neu.

  // Doppelte Tags kosten bei YouTube Zeichen und bei SoundCloud einen Platz.
  const liste = tags.split(/[,\n]/).map(t => t.trim().replace(/^#/, "").toLowerCase()).filter(Boolean);
  const doppelt = [...new Set(liste.filter((t, i) => liste.indexOf(t) !== i))];
  if (doppelt.length) out.push({ stufe: "hinweis", text: `Doppelte Tags: ${doppelt.join(", ")}` });

  if (plattform === "soundcloud" && countTags(tags) > 9) {
    out.push({ stufe: "fehler", text: `${countTags(tags)} Tags — SoundCloud nimmt nur 9` });
  }

  if (plattform === "youtube") {
    if (tags.length > 500) out.push({ stufe: "fehler", text: `Tags sind ${tags.length} Zeichen lang — YouTube schneidet bei 500 ab` });

    const hashtags = (text.match(HASHTAG_RE) ?? []).length;
    if (hashtags > 60) out.push({ stufe: "fehler", text: `${hashtags} Hashtags — ab 60 ignoriert YouTube alle` });

    // Kapitel: dieselben Regeln wie in der Kapitel-Karte
    const marken = text.split(/\r?\n/).map(z => z.match(ZEITMARKE_RE)?.[1]).filter((m): m is string => !!m).map(sekunden);
    if (marken.length > 0) {
      if (marken[0] !== 0) out.push({ stufe: "fehler", text: "Kapitel: die erste Marke muss bei 0:00 liegen" });
      else if (marken.length < 3) out.push({ stufe: "hinweis", text: "Kapitel: YouTube zeigt sie erst ab drei Marken" });
      else if (marken.some((s, i) => i > 0 && s - marken[i - 1] < 10)) {
        out.push({ stufe: "fehler", text: "Kapitel: zwei Marken liegen unter 10 Sekunden auseinander" });
      }
    }

    // Der Kauflink zählt nur, wenn man ihn sieht, ohne aufzuklappen.
    const sichtbar = text.split(/\r?\n/).slice(0, YT_SICHTBARE_ZEILEN).join("\n");
    if (beatstarsUrl?.trim() && text.includes(beatstarsUrl.trim()) && !sichtbar.includes(beatstarsUrl.trim())) {
      out.push({ stufe: "hinweis", text: `Der Kauflink steht nicht in den ersten ${YT_SICHTBARE_ZEILEN} Zeilen — man sieht ihn erst nach „…mehr"` });
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Vorschau: Links, Zeitmarken und Hashtags hervorheben
// ═══════════════════════════════════════════════════════════════════════════════

export type Stueck = { art: "text" | "link" | "zeit" | "hashtag"; text: string };

/** Eine Zeile in Stücke zerlegen, wie die Plattform sie anklickbar macht. */
export function zerlege(zeile: string): Stueck[] {
  const muster = new RegExp(
    String.raw`(${URL_RE.source})|(^\s*(?:\d+:)?\d{1,2}:\d{2}(?=\s))|((?<=^|\s)#[\p{L}\p{N}_]+)`,
    "gu",
  );
  const out: Stueck[] = [];
  let zuletzt = 0;
  for (const m of zeile.matchAll(muster)) {
    const i = m.index ?? 0;
    if (i > zuletzt) out.push({ art: "text", text: zeile.slice(zuletzt, i) });
    out.push({ art: m[1] ? "link" : m[2] ? "zeit" : "hashtag", text: m[0] });
    zuletzt = i + m[0].length;
  }
  if (zuletzt < zeile.length) out.push({ art: "text", text: zeile.slice(zuletzt) });
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Exportnamen
// ═══════════════════════════════════════════════════════════════════════════════

/** Die Paare „ÜBERSCHRIFT:" + Zeile darunter aus dem Text unter dem Titel —
 *  so stehen in der BeatStars-Vorlage die Namen für den Export aus Premiere
 *  und Photoshop. Die Vorlage bleibt die Quelle: ändert sie sich, ändern sich
 *  die Namen mit. „TAGS:" ist kein Exportname. */
export function exportNamen(inhalt: string): { label: string; wert: string }[] {
  const zeilen = extractDescription(inhalt).split(/\r?\n/).map(z => z.trim());
  const out: { label: string; wert: string }[] = [];
  zeilen.forEach((z, i) => {
    const m = z.match(/^(.+?):$/);
    if (!m || /^tags$/i.test(m[1])) return;
    const wert = zeilen.slice(i + 1).find(x => x !== "");
    if (wert && !wert.endsWith(":")) out.push({ label: m[1], wert });
  });
  return out;
}
