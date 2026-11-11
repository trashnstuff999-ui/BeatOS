# Künstler-Tab: Redesign

Angelegt 11.11.2026. Ersetzt den Aufbau aus Scheibe 7 (docs/bibliothek-umbau.md),
übernimmt deren Backend (Haken, geplante Tracks, Features).

Entwurf, abgesegnet in Version 6 („passt so“):
https://claude.ai/artifact/LhEP9rEjKWa9GHXTUQgtwu

## Entscheidungen

| Was | Entscheidung |
|---|---|
| Aufbau | Leiste (zuklappbar, per Ziehen sortierbar), Artist-Kopf mit Profilbild, Releases als Cover, „In Session“, Trackliste |
| Releases | Echte Ordner mit Präfix: `<Artist>/ALBUM - <Titel>/<Song>/`, `<Artist>/EP - <Titel>/<Song>/`. Singles liegen direkt beim Artist |
| Release-Material | Cover, Final WAV usw. direkt im Release-Ordner, Unterordner dafür mit `_` (z. B. `_FINAL WAV`) |
| Ein Song, ein Release | Ein Ordner kann nur an einem Ort liegen. Single → Album = Ordner zieht um, Pfade werden nachgezogen |
| Stand | Vier Leuchtpunkte Vocals · Mix · Master · Abgegeben, von Hand. Direkt „Master“ klicken geht |
| Phase in Worten | Recording, Mixing, Mastering, Ready, abgegeben |
| Wording | In Session, Features, Artist, Feedback offen, Session anlegen, Neues Projekt, Singles |
| Persönlichkeit | Profilbild als Bühne, Akzentfarbe aus dem Profilbild, echte Cover, Abgabe-Stempel |

## Stücke

| # | Inhalt | Status |
|---|---|---|
| 1 | Release-Ordner: Scan `ALBUM - …`/`EP - …`, anlegen, Song verschieben (mit FL-Sperre, Pfad-Reparatur, DB-Zeile zieht mit) | gebaut 11.11. (noch im alten Aufbau bedienbar), Abnahme offen |
| 2 | „Kein Song“ (_ davor, FLP-Pfade ziehen mit). Doppelte Songs zusammenführen (Vorschau, Namensgleiches bekommt `_2`, nur byte-gleiche Kopien fallen weg, FLP-Pfade alt → neu); FLPs per Ziehen → 01_SAVEFILES | gebaut 11.11., Abnahme offen |
| 3 | Neuer Aufbau: Leiste (Ziehen sortiert, `_reihenfolge.json`), Artist-Kopf mit Akzentfarbe, Releases mit „Neues Projekt“ (Single/EP/Album), Cover filtern die Liste | gebaut 11.11., Abnahme offen (src/components/studio/ArtistKopf.tsx) |
| 4 | „In Session“ (`_kuenstler.json` session, relative Pfade) + Trackliste mit Leuchtpunkten, Haken und Session sofort (vorläufig bis zum Scan) | gebaut 11.11., Abnahme offen (ArtistTracks.tsx) |
| 5 | Umbenennen per Doppelklick (Artist, Song, Release; FLP-Pfade, DB, Features, Session, Reihenfolge ziehen mit; FL muss zu sein) und Strg+F-Suche; Wording im Song-Detail | gebaut 11.11., Abnahme offen |

Jedes Stück: tsc + Tests, dann Stephan sieht es sich in der App an. Schreibende Läufe
(Verschieben, Zusammenführen) führt Stephan selbst aus.

## Stück 1: Release-Ordner

- Scan: Ordner direkt beim Artist, die mit `ALBUM - ` oder `EP - ` beginnen (Groß/klein egal),
  sind Releases. Ihre Unterordner sind Songs, außer `Backup` und `_…`. Cover = Bild im
  Release-Ordner, bevorzugt mit „cover“ im Namen.
- Reihenfolge der Tracks: nach Nummer vorne im Namen, sonst nach Name.
- Die JSON-Releases aus 7b fallen weg (`set_artist_releases`).
- Anlegen: `create_artist_release(artist, art, titel)` legt den Ordner an.
- Verschieben: `artist_song_verschieben(song, ziel)`; Ziel ist ein Release-Ordner oder der
  Artist-Ordner (Single). Gesperrt, solange der Song in FL offen ist. Danach Pfade
  reparieren, DB-Zeile (Haken, Notiz) zieht mit.
- Stephans provisorisches `Album - FCK OFF BBY GIRL/Songs/<Song>` richtet er von Hand ein:
  Ordner in `ALBUM - FCK OFF BBY GIRL` umbenennen, die Songs aus `Songs/` eine Ebene hoch,
  `FLPs`, `Final WAV`, `02_OLD` mit `_` davor. Die FLPs in `_FLPs` sortiert Stück 2.
