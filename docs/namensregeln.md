# Namensregeln für die ganze Bibliothek

Stand 16.11.2026. Entwurf, vier Punkte offen (unten). Entschieden: die Klammer
heißt überall `[130 F#min]`.

## Der eine Bauplan

Jede Datei, die BeatOS benennt, folgt demselben Aufbau:

```
[SPUR - ] TITEL [130 F#min] [_etikett] [_2] .endung
```

- **TITEL** in Großbuchstaben.
- **Klammer**: erst Tempo, dann Tonart lang (`F#min`, `Bmaj`). Fehlt eins, steht
  nur das andere da (`[130]`). Fehlt beides, keine Klammer.
- **SPUR** nur bei Einzelspuren (Stems, Sample-Spuren, MIDI): `DRUMS`, `GTR LEAD`.
- **Etikett** sagt, was die Datei ist. Feste Liste, klein geschrieben.
- **Zähler** `_2`, `_3` für ältere Fassungen derselben Sorte, immer ganz hinten.

Ordner bekommen davor ihre Nummer: `P0776 - `, `B0404 - `, `S0044 - `, `R0005 - `.

## Was wie heißt

| Was | Name | Liegt in |
|---|---|---|
| Projektordner | `P0776 - IM NOT READY [130 F#min]` | 01_ACTIVE_PRODUCTION |
| Beat-Ordner | `B0404 - IM NOT READY [130 F#min]` | 03_ARCHIVE/Jahr/Monat |
| Sample-Ordner | `S0044 - IM NOT READY [130 F#min]` | 06_SAMPLES |
| FLP in der Produktion | wie der Ordner, `P0776 - IM NOT READY [130 F#min].flp` | Projektordner |
| FLP im Archiv | `IM NOT READY [130 F#min].flp`, ältere `_old`, `_old_2` | 01_SAVEFILES |
| WAV ohne Tag | `IM NOT READY [130 F#min]_untagged.wav` | Ordner-Root |
| MP3 mit Tag | `IM NOT READY [130 F#min]_tagged.mp3` | Ordner-Root |
| Eigene Fassung (Mix, Loop …) | `IM NOT READY [130 F#min]_mix.wav`, `…_loop.wav` | Ordner-Root |
| Stem | `DRUMS - IM NOT READY [130 F#min]_stem.wav` | `Stems` bzw. `03_STEMS` |
| Abgabe an Künstler | `Künstler - Song_master.wav`, `…_mix.wav` | 03_VERSIONS |
| Sample-Spur | `GTR LEAD - IM NOT READY [130 F#min].wav` | Sample-Ordner |
| MIDI zu einer Spur | wie die Spur, `.mid` | neben der Spur |
| MIDI ohne Titel | `POP PUNK LEAD [D#min].mid` | 06_SAMPLES/_MIDI |
| Ältere Fassung | `…_untagged_2.wav` | Archiv: 02_OLD |
| Cover | `IM NOT READY_Cover_2000x2000.png` | Ordner-Root |
| Thumbnail | `IM NOT READY_Thumbnail_1920x1080.png` | Ordner-Root |
| Video | der YouTube-Titel, wie bisher | Ordner-Root |

Bleibt, wie es ist: Künstler- und Song-Ordner in 05_ARTISTS (Namen frei, Leitbild
11.11.), Remix-Ordner, Beschreibungstexte, alles in `Backup/` und `Audio/`.

## Drei Grundsätze

1. **Der Ordner sagt die Art.** Was in `Stems` liegt, ist ein Stem, egal wie FL
   die Datei genannt hat. Was im Root liegt, ist ein Export.
2. **Ein Etikett, das schon dasteht, wird nie überschrieben.** Fehlt es, gilt:
   WAV = `_untagged`, MP3 = `_tagged`.
3. **Nicht raten.** Ohne Titel (`Project_9.mp3`, `untitled.wav`) benennt BeatOS
   nichts um.

## Entschieden (Stephan, 16.11.2026)

- **Master ist der Normalfall.** Jede neue MP3/WAV ist gemastert, ein Etikett
  `_master` gibt es beim Beat nicht. Was etwas anderes ist, trägt einen eigenen
  Zusatz (`_mix`, `_loop` …). Der bleibt, wie getippt, und die Datei bekommt
  dann kein `_untagged`/`_tagged`. Gilt nicht rückwirkend: über alte Beats sagt
  der Name nichts, der Archiv-Lauf ändert dort nur die Klammer.
- **Stems im Ordner `Stems`.** BeatOS legt ihn beim Übernehmen und bei „Neu" an.
  In FL dorthin exportieren, der Dateiname ist egal. Ruht der Ordner 2 Minuten,
  benennt BeatOS: gemeinsamer Namensanfang weg, Rest ist die Spur
  (`irgendwas_Drums.wav` → `DRUMS - TITEL [130 F#min]_stem.wav`). `STEM - x.wav`
  im Root wandert in den Ordner. Beim Archivieren wird daraus `03_STEMS`.
- **Abgaben an Künstler** heißen `Künstler - Song_master.wav` bzw. `_mix.wav`.

## Offen

- **Getaggte WAV, ungetaggte MP3**: Annahme, bis Stephan etwas anderes sagt:
  BeatOS erzeugt sie nie, lässt vorhandene aber stehen.

## Umsetzung in Scheiben

Jede Scheibe einzeln, mit Test, Abnahme durch Stephan.

Stand 16.11.2026: Scheiben 1 bis 3 gebaut und getestet, uncommittet, in der App
noch nicht abgenommen. Offen aus Scheibe 2: prüfen, ob FL Einzelspuren wirklich
als `getippt_Spur.wav` schreibt (an den ersten echten Stems). Scheiben 4 bis 6
stehen aus.

Scheibe 4: gelaufen am 16.11.2026 (`commands/klammern.rs`, Handprobe
`klammern_echt`). 343 Beats: Klammer nach Regel, Titel groß (Stephan: alle Titel
groß), 999 Dateien, 348 FLPs nachgezogen. Geprüft: alle 403 DB-Pfade stimmen,
keine alte Klammer mehr in Ordnern und Dateien. Rückgängig: erst
`_BEATOS/namensregel_lauf.json`, dann `_BEATOS/namensregel_probe.json` (Probelauf
0001 und 0013); DB-Stand davor: `beats.db.vor-namensregel-2026-11-16`.
Nicht angefasst: `beats.name` in der DB (184 Titel stehen dort gemischt), der
Datenordner-Eintrag in 5 FLPs (B0369, B0396) nennt noch den alten Ordner, und ob
`[F# 150]` wirklich Dur ist (`F#maj`), ist ungeprüft.

Scheibe 5: gebaut und getestet, in der App nicht ausprobiert. Archivieren holt,
was die FLPs aus der Produktion brauchen, in den Beat und biegt die Verweise um
(`unsichere_holen`). Wird ein Sample übernommen oder nachgezogen, ziehen die
FLPs der Bibliothek im Hintergrund nach (`verweise_umbiegen`). Nicht abgedeckt:
ein Beat, der dabei gerade in FL offen ist.

Scheibe 6: gelaufen am 16.11.2026. Sechs Sample-Ordner (S0022, S0026, S0027,
S0028, S0031, S0035) samt Exporten und die vier Dateien in `_MIDI` nach Regel.
Rückgängig: `_BEATOS/namensregel_samples.json`. Offen: Sample-Ordner ohne Tempo
und Tonart (34) heißen weiter wie bisher, und die Spuren in S0039 warten auf
„Nachziehen" in der App. Das Werkzeug `klammern.rs` kann weg.

1. **Ein Baustein.** Eine Stelle im Code baut und liest Namen
   (`utils/parsing.rs`, neben `schoener_name`). Übernehmen, Beat benennen,
   Archivieren und Upload benutzen sie. Ab hier kommt alles Neue richtig heraus.
   Dabei behoben: Beat benennen und Archivieren fassen Stems nicht mehr an.
   Die DB bleibt unverändert, die lange Tonart entsteht erst beim Benennen.
2. **Stems.** Erkennung über den Ordner, Benennung nach Regel. Archivieren und
   „Beat holen" lesen aus `Stems` und `03_STEMS`.
3. **Frische Exporte.** Ein Export, der nach dem Übernehmen entsteht, bekommt
   seinen Namen von selbst, sobald er 2 Minuten ruht (wie fertige Samples).
   Nur wenn der Titel feststeht.
4. **Archiv umstellen.** Einmaliger Lauf über die 403 Beats: erst die Liste
   (alt → neu) zum Durchsehen, dann DB-Sicherung, Protokoll, Umbenennen.
   `02_OLD` bleibt unberührt.
5. **Pfade.** Archivieren zieht die FLP-Pfade nach. Wird ein Sample umbenannt,
   ziehen die Beats nach, die es benutzen.
6. **Altbestand Samples und MIDI.** Was Tempo und Tonart trägt, auf die Regel
   bringen (`[D#m 140]` → `[140 D#min]`). Erst nach Scheibe 5.

Nicht Teil davon: die 97 alten Exporte `Project_9.mp3` in der Produktion. Ohne
Titel bleiben sie liegen (Grundsatz 3).
