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
