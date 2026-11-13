// src/lib/kuenstler.ts — kleine Regeln für Künstler-Projekte (docs/kuenstler-projekte.md)

/** Nur Buchstaben und Ziffern, klein — „Heartbreak Highlights" und
 *  „heartbreak highlights_vocals" sollen sich finden. */
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** Wo ein Song steht — ein Satz statt sechs Häkchen. `schritt` zählt die
 *  erledigten der vier Etappen Vocals → Mix → Master → Abgegeben. Bei „Nur
 *  Master" gelten Vocals und Mix als erledigt. */
export function songStand(song: { fertig: boolean; warten: boolean; vocals: boolean; mix: boolean; master: boolean; nur_master?: boolean; geplant?: boolean }):
  { text: string; schritt: number; ton: "fertig" | "warten" | "offen" | "bereit" } {
  if (song.geplant) return { text: "Geplant", schritt: 0, ton: "offen" };
  const s = song.nur_master ? { ...song, vocals: true, mix: true } : song;
  const schritt = s.fertig ? 4 : s.master ? 3 : s.mix ? 2 : s.vocals ? 1 : 0;
  if (s.fertig) return { text: "Abgegeben", schritt, ton: "fertig" };
  if (s.warten) return { text: "Feedback offen", schritt, ton: "warten" };
  if (!s.vocals) return { text: "Vocals fehlen", schritt, ton: "offen" };
  if (!s.mix && !s.master) return { text: "Mix offen", schritt, ton: "offen" };
  if (!s.master) return { text: "Master offen", schritt, ton: "offen" };
  return { text: "Bereit zum Abgeben", schritt, ton: "bereit" };
}

/** Die vier Leuchtpunkte, von Hand: Stufe 0–4 → abgehakte Schritte. */
export const STUFEN = ["vocals", "mix", "master", "abgegeben"] as const;
export const erledigtFuer = (stufe: number): string[] => STUFEN.slice(0, stufe);

/** Phase in Studio-Sprache: woran der Track gerade hängt. */
export function phase(song: { fertig: boolean; warten: boolean; vocals: boolean; mix: boolean; master: boolean; nur_master?: boolean; geplant?: boolean }): string {
  if (song.geplant) return "geplant";
  if (song.fertig) return "abgegeben";
  if (song.warten) return "Feedback offen";
  return ["Recording", "Mixing", "Mastering", "Ready"][songStand(song).schritt] ?? "Ready";
}

/** Verlauf eines Songs aus den Dateidaten: wann kamen die ersten Vocals,
 *  der erste Mix, der erste Master — und wann wurde abgegeben. */
export function songVerlauf(
  audio: { art: string; geaendert: number }[],
  abgegeben: string | null,
): { label: string; datum: Date }[] {
  const erste = (art: string) => {
    const t = audio.filter(a => a.art === art).map(a => a.geaendert);
    return t.length ? new Date(Math.min(...t) * 1000) : null;
  };
  const schritte: { label: string; datum: Date | null }[] = [
    { label: "Vocals", datum: erste("vocals") },
    { label: "Mix", datum: erste("mix") },
    { label: "Master", datum: erste("master") },
    { label: "Abgegeben", datum: abgegeben ? new Date(`${abgegeben}T12:00:00`) : null },
  ];
  return schritte.filter((s): s is { label: string; datum: Date } => s.datum !== null)
    .sort((a, b) => a.datum.getTime() - b.datum.getTime());
}

/** Heißen zwei Songs vermutlich gleich? Klammern („(Prod. goodbxy)", „[Beat- Stay]")
 *  zählen nicht, ein, zwei Tippfehler („spirirt"/„spirit") sind erlaubt. Nur ein Vorschlag. */
export function aehnlich(a: string, b: string): boolean {
  const k = (x: string) => norm(x.replace(/[([][^)\]]*[)\]]/g, ""));
  const [x, y] = [k(a), k(b)];
  if (x.length < 3 || y.length < 3) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  if (Math.abs(x.length - y.length) > 2) return false;
  // Levenshtein, früh abbrechen reicht hier nicht, die Wörter sind kurz.
  let vor = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const neu = [i];
    for (let j = 1; j <= y.length; j++) neu[j] = Math.min(vor[j] + 1, neu[j - 1] + 1, vor[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    vor = neu;
  }
  return vor[y.length] <= 2;
}

/** Windows-Pfade vergleichbar machen: Groß/klein, „/" oder „\", doppelte Trenner. */
export const pfadSchluessel = (p: string) => p.toLowerCase().replace(/[\\/]+/g, "\\");

/** Gehört die Datei aus den Downloads zu diesem Song? Der Dateiname enthält
 *  den Songnamen — Künstlernamen stehen in Downloads meist nicht drin. */
export function passtZumSong(datei: string, song: string): boolean {
  const s = norm(song);
  if (s.length < 3) return false;
  return norm(datei.replace(/\.[^.]+$/, "")).includes(s);
}
