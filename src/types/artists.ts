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
}

export interface Artist {
  name: string;
  path: string;
  songs: ArtistSong[];
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
