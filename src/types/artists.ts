// src/types/artists.ts — Künstler-Projekte (Mix & Master), siehe docs/kuenstler-projekte.md

export interface ArtistSong {
  name: string;
  path: string;
  /** Liegt in <Künstler>/_Fertig/ — abgegeben. */
  fertig: boolean;
  flp: boolean;
  vocals: boolean;
  demo: boolean;
  beat: boolean;
  mix: boolean;
  master: boolean;
  /** Jüngste Änderung (Sekunden). */
  geaendert: number;
  /** Von Hand: eine Notiz und „Warte auf Künstler". */
  notiz: string | null;
  warten: boolean;
  /** Dateinamen im Song-Ordner, in 01_SAVEFILES, 02_ASSETS, 03_VERSIONS und Audio/. */
  dateien: string[];
  /** Audio-Pfade aus den FLPs, die es gibt (auch außerhalb, z. B. in den Downloads). */
  verweise: string[];
  /** Fehlende FLP-Verweise, deren Datei BeatOS gefunden hat. */
  reparierbar: number;
  /** Fehlende FLP-Verweise ohne Fundort. */
  fehlend: string[];
  /** Audiodateien im Song-Ordner (Mix, Master), neueste zuerst. */
  exporte: string[];
  /** Datum der Abgabe (JJJJ-MM-TT). */
  abgegeben: string | null;
  /** So viele Einträge liegen noch außerhalb von 01_/02_/03_ — „Ordner aufräumen". */
  umbau: number;
  /** FLPs des Songs (01_SAVEFILES oder lose), neueste zuerst. */
  flps: { name: string; path: string; geaendert: number }[];
  /** Alle Audiodateien mit Rolle, neueste zuerst — Reinhören und Verlauf. */
  audio: { art: "vocals" | "demo" | "beat" | "mix" | "master"; name: string; path: string; geaendert: number }[];
  /** „Mein Beat": der verknüpfte Katalog-Beat. */
  beat_id: string | null;
  /** Katalog-Beat, dessen Dateien die FLP schon verwendet — Vorschlag. */
  beat_vorschlag: string | null;
}

export interface Artist {
  name: string;
  path: string;
  songs: ArtistSong[];
  /** Profilbild im Künstler-Ordner. */
  bild: string | null;
  /** Plattform → Link (spotify, soundcloud, youtube, instagram, discord). */
  links: Record<string, string>;
}

export interface ArtistsScan {
  /** Gibt es den Künstler-Ordner überhaupt? */
  vorhanden: boolean;
  kuenstler: Artist[];
}

/** Ordner im Archiv, der kein Jahresordner ist — früher Künstler-Ablage. */
export interface Altbestand {
  pfad: string;
  name: string;
  /** Vorschlag: „ - Library" fällt weg. */
  kuenstler: string;
  songs: number;
}
