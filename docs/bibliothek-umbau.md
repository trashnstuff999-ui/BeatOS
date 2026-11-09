# Bibliothek-Umbau

Gesamtplan, damit bei vielen Umbauten der Überblick bleibt.
Angelegt 09.11.2026. Wird nach jeder Scheibe aktualisiert.

**Ziel:** Jede Datei hat einen festen Platz. BeatOS erkennt alles und ist das
Bindeglied zwischen FL, Photoshop, Premiere und der Bibliothek.

---

## Stand auf einen Blick

| # | Scheibe | Status |
|---|---|---|
| 0 | Datenmüll stoppen | erledigt 09.11. |
| 1 | Ordnergerüst | erledigt 09.11. (7 FLPs, Premiere-Vorlage und 3 Einstellungen umgestellt) |
| 2 | Fundstücke | erledigt 09.11. (80 grün, 339 gelb, 16 rot, 113 grau) |
| 3 | Einsammeln | 3a Herkunft gebaut 09.11., Kopierlauf offen |
| 4 | Neu nummerieren | offen |
| 4b | Alte Ideen + „Aus den Anfängen“ | offen |
| 5 | FL-Templates über „Neu“ | offen |
| 6 | Ohne Nummer | offen |
| 7 | Künstler | offen |
| 8 | Samples | offen |
| 9 | Upload-Ablage | offen |
| 10 | Abschluss: Altbestand nach `_ALT` | offen |

Reihenfolge ist Absicht: 0–1 schaffen Ordnung und feste Ziele, 2–4 holen alle
Songs heim und nummerieren erst danach, 5–9 bauen BeatOS auf die neue Ordnung
um, 10 räumt erst ab, wenn alles sicher drüben ist.

---

## Regeln für jede Scheibe

1. **Nichts geht kaputt.** Vor jedem Verschieben nur lesend prüfen, welche
   FLPs auf den Ort zeigen.
2. **Kopieren vor Verschieben.** Altbestand wird kopiert und per Hash geprüft.
   Originale bleiben bis Scheibe 10.
3. **Nie zusammenlegen**, außer Dateien sind byte-gleich. Alle Versionen
   kommen mit.
4. **Jeder Lauf hat DB-Sicherung, Protokoll in `_BEATOS` und Rückgängig.**
5. **Erst Probelauf**, dann der Rest.
6. **Abnahme:** tsc + Tests, dann in der App angesehen, dann Commit.
   Keine Kopie-Builds.

---

## Zielbild

```
._BEAT LIBRARY/
  01_ACTIVE_PRODUCTION/   P0001 …   in Arbeit, Nummern rücken nach
  02_LIBRARY_ASSETS/      nur Werkzeug, das immer wieder benutzt wird
    01_TEMPLATES/
      FL/                 Beat/ Sample/ Recording/ Mix-Master/
      PHOTOSHOP/          COVER - TEMPLATE.psd, THUMBNAILS - TEMPLATE.psd
      PREMIERE/           TYPE BEATS - TEMPLATE.prproj
    02_PRESETS/           .fst, Mixer-Presets
    03_FOOTAGE/           _SHARED, DESTROY LONELY, LIL PEEP …
    04_BILDER/            Rohbilder für Type-Beat-Cover
  03_ARCHIVE/             B0001 …   fertige Songs, feste Nummern, Jahr/Monat
  04_UPLOAD/              Ablage: Cover, Thumbnails, Videos aus PS/Premiere
  05_ARTISTS/             A …       Auftragsarbeit
  06_SAMPLES/             S0001 …   eigene Samples
    _MIDI/                lose MIDI-Dateien
  07_REMIXES/             R0001 …   Remixe und Mashups
    _VOCALS/              extrahierte Vocals
  _BEATOS/                Sicherung, Protokolle, Listen (schreibt nur die App)
  _ALT/                   Altlasten, am Ende auch der Altbestand
```

**Merkregel:** 01 in Arbeit, 03 fertig, 06 Samples, 07 Remixe, 05 fremde
Künstler, 02 Werkzeug, 04 Ablage. Was mit `_` beginnt, ist keine Musik.

### Nummern

| Präfix | Was | Fest? |
|---|---|---|
| P | Produktion | rückt nach, zeigt „wie viel ist offen“ |
| B | fertiger Song im Katalog | fest, nie nachrücken |
| S | Sample | fest |
| A | Artist | fest |
| R | Remix oder Mashup | fest |

### Innenleben

- **Archiv-Beat:** `B0012 - Titel [Key BPM]/` mit Exporten, Cover, Thumbnail,
  Video im Root, dazu `01_SAVEFILES/` (FLP, Backup) und `02_OLD/` (ältere
  Versionen).
- **Sample:** `S0012 - GTR - Sad Loop [Em 140]/` mit FLP, WAV, MID gleich
  benannt. Kürzel: GTR PNO KEYS PAD BELL LEAD PLK STR ARP SYN BASS 808 VOX FX DRM.
- **Künstler-Release:** `<Künstler>/<Release>/01_SAVEFILES 02_ASSETS
  03_VERSIONS`, dazu `<Künstler>/_ASSETS`. Cover und Video liegen im selben
  Release-Ordner wie der Mix.

---

## Bestand (gemessen 09.11.2026)

- **Archiv:** 231 Beats, Nummern 0564–0937, 146 Lücken, 0737, 0748 und 0851
  doppelt. 227 mit gleichem Innenleben, etwa 10 mit altem (`01_AUDIO`,
  `02_VISUALS`, `03_PROJECTS`, `TAGGED`).
- **Produktion:** 888 Ordner. Etwa 37 schon im Archiv, etwa 53 wirken fertig
  und fehlen dort, etwa 66 nur mit Bounce, 9 Remixe, etwa 705 Skizzen.
- **Altbestand:** `Music\Songs` (5,5 GB, Unterordner `Beats\0-99` bis `600-699`
  und `Finished`) und `Image-Line\FL Studio\Projects` mit `Songs` (12 GB). 115
  Songs mit alter Nummer, 37 davon im Archiv, etwa 76 fehlen.
- **Müll:** 78 `merge_*.json` im Root (67 vom Test), drei DB-Sicherungen,
  `FL Plugin Cleanup`, lose `0857.flp`, `_beatos-umbenannt_2026-08-30.txt`.
- **Fehler:** `06_SAMPLES/S0001` enthält `Project_0889` bis `Project_0892`.

---

## Scheibe 0: Datenmüll stoppen

**Ziel:** Es entsteht kein neuer Müll, der Root ist leer bis auf die Bereiche.

- Test `parken_prueft_selbst_nach…` (studio.rs) schreibt sein Protokoll
  künftig in einen Temp-Ordner statt über `merge_log_dirs()` in die Bibliothek.
- `merge_log_dirs()` und die DB-Sicherung (`backup_target_path`) schreiben
  nach `_BEATOS/Protokolle` und `_BEATOS/Sicherungen`.
- Aufräumen im Root:
  - 67 Test-Protokolle (Temp-Pfade `beatos_park_*`) nach `_ALT/test-protokolle` (entschieden)
  - 11 echte Protokolle nach `_BEATOS/Protokolle`. Rückgängig muss sie dort
    finden.
  - `beats.backup.db`, `beats.db.backup-2026-07-12`, `beats.db.migrated-backup`
    nach `_BEATOS/Sicherungen`
  - `_beatos-umbenannt_2026-08-30.txt` nach `_BEATOS/Protokolle`
  - `FL Plugin Cleanup` nach `_ALT`
  - `0857.flp`: erst prüfen, zu welchem Projekt sie gehört
- `S0001`: `Project_0889` bis `0892` sind Samples und liegen seit 09.11. als
  `S0005` bis `S0008` in eigenen Ordnern. Einzeln anhören in Scheibe 8.

**Abnahme:** Tests laufen und danach liegt keine neue Datei im Root.
Rückgängig findet ein altes Protokoll noch.

## Scheibe 1: Ordnergerüst

**Ziel:** Alle Zielordner existieren, `02_LIBRARY_ASSETS` enthält nur Werkzeug.

| Heute | Ziel |
|---|---|
| `TEMPLATES/START.flp`, `START_2.flp` | `01_TEMPLATES/FL/Beat/` |
| `TEMPLATES/*.psd` | `01_TEMPLATES/PHOTOSHOP/` |
| `TEMPLATES/*.prproj`, `.prin` | `01_TEMPLATES/PREMIERE/` |
| `TEMPLATES/Adobe Premiere Pro Auto-Save`, `Audio Previews` | `_ALT` (Caches, etwa 400 MB) |
| `PRESETS` | `02_PRESETS` |
| `PRESETS.rar` | `_ALT` |
| `MUSIC VIDEO FOOTAGE` | `03_FOOTAGE` |
| `MEDIA` (Cover-, Thumbnail-, Video-Ablage) | Inhalt nach `04_UPLOAD`, Ordner entfällt |
| `COVER` (alte Reste, `Untitled-*.png`, `old/`) | `_ALT/COVER` |
| `EXTRACTED VOCALS` | `07_REMIXES/_VOCALS` |
| `MIDI` | `06_SAMPLES/_MIDI` |
| `01_SAMPLES` (WARPED, ASCENDING, NO MORE TIME) | bleibt bis Scheibe 2, das sind Beat-Stems |

BeatOS:
- Die Asset-Ablage (`scan_asset_inbox`, Einstellungen → Pfade) zeigt auf
  `04_UPLOAD` statt `MEDIA`.
- Die Pfade zu Sample-Vorlage, START.flp und PS-Templates in den Einstellungen
  werden nachgezogen.
- `07_REMIXES` neben dem Archiv, analog zu `kuenstlerOrdner()` und
  `samplesOrdner()`.

Sicherheit (geprüft 09.11.): Von 4994 FLPs zeigen nur 6 auf `02_LIBRARY_ASSETS`, alle auf
`EXTRACTED VOCALS`, dazu eine FLP mit totem Pfad (`Vocal Stems`). Sie werden per
`flp_umschreiben` umgestellt (Sicherung in `Backup/`). Die Premiere-Vorlage verweist
50-mal auf `MUSIC VIDEO FOOTAGE`; ihre Pfade werden mit umgestellt, Sicherung in `_ALT`.

## Scheibe 2: Fundstücke (nur lesen)

**Ziel:** Eine Liste aller Songs, die noch nicht im Archiv sind, mit Ampel.
Kopiert noch nichts.

- In den Einstellungen gibt es „Altbestand“ mit einer Liste von Ordnern:
  - `C:\Users\kismo\Music\Songs`
  - `C:\Users\kismo\OneDrive\Dokumente\Image-Line\FL Studio\Projects`
  - dazu `01_ACTIVE_PRODUCTION` und `02_LIBRARY_ASSETS/01_SAMPLES`
- Gruppiert wird nach alter Nummer, Titel, Key und BPM. Alle Fundorte und
  Versionen hängen am Eintrag.
- Der Abgleich mit dem Archiv nutzt `archive_match.rs`, auch den
  Inhaltsvergleich.
- Ampel:
  - **Grün:** eindeutig, nicht im Archiv
  - **Gelb:** unsicher, zum Beispiel gleicher Titel mit anderem Key oder keine
    Nummer
  - **Rot:** Remix oder Mashup, geht nach `07_REMIXES`
  - **Grau:** schon im Archiv
- Jeder Eintrag hat eine Abspieltaste.
- Skizzen ohne Export (`300.flp`) erscheinen nicht. Sie bleiben im Altbestand
  und wandern in Scheibe 10 mit nach `_ALT`.

**Abnahme:** Du siehst die Zahlen pro Ampelfarbe und hörst Stichproben.

**Gebaut (09.11.):** `fundstuecke.rs`, Archiv → Knopf „Fundstücke“, Einstellung
„Altbestand“. Gemessen über die vier Ordner (8 s): 80 grün, 339 gelb, 16 rot,
113 grau. Gelb: 144 ohne Titel (meist `Project_163.mp3`-Bounces), 103 ohne
Nummer, 71 nur Nummer, 14 Nummer mit mehreren Titeln. Bei 33 grauen liegen
noch Dateien nur im Altbestand (`nur_hier`), die nimmt Scheibe 3 mit.

- Nummer auch ohne Klammern: `536.wav`, `182_2.mp3`, höchstens drei Stellen.
  Sammelordner wie `700-799` sind keine Nummer.
- Datei ohne Nummer im Nummernordner gehört zu dessen Nummer.
- Namenlose Datei neben genau einem Song mit Export gehört zu ihm.
- Übersprungen: `Audio`, `Backup`, `Autosaves`, `Samples`, `Templates`,
  `Coverarts`, `Artists` (Scheibe 7).
- Grau zuerst über byte-gleiche Datei, dann Nummer + Titel, dann eindeutigen
  Titel. Namenlose Dateien nie über den Titel.

## Scheibe 3: Einsammeln

**Ziel:** Alle fertigen Songs liegen im Archiv, alle Remixe in `07_REMIXES`.

- Grün und Rot gehen per Knopf, Gelb wird pro Eintrag entschieden:
  „Gleicher Song“, „Anderer Song“ oder „Weg“.
- Kopiert wird nach `03_ARCHIVE/<Jahr>/<Monat>/`. Das Datum kommt aus der
  ältesten Exportdatei.
  - Neuester Export in den Root, ältere nach `02_OLD`, FLPs nach `01_SAVEFILES`
  - Jede Kopie wird per Hash geprüft, bei einer Abweichung bricht der Lauf ab
  - Bis Scheibe 4 gibt es vorläufige Nummern ab 0938
- Bei Songs aus der Produktion bleibt der Produktionsordner liegen. Das
  Aufräumen erkennt ihn danach als „schon archiviert“.
- **Probelauf:** nur `Music\Songs\Beats\600-699`. Danach siehst du dir das
  Archiv in BeatOS an, dann kommt der Rest.
- Rückgängig löscht nur die Kopien.
- Neuester Export und neueste FLP heißen nach Schema `Titel [Key BPM]`, ältere
  Versionen behalten in `02_OLD` ihre Originalnamen. Key wird angeglichen
  (`Amin` → `Am`), seltsame Werte (`125-140`, `Cm-Gm`) bleiben leer.
- Grau mit `nur_hier`: die fehlenden Dateien in den bestehenden Archivordner
  nach `02_OLD`.
- **Datumsprüfung:** passt das Datum nicht zu den Nachbarn mit ähnlicher alter
  Nummer (in `500-599` liegen 28 Exporte von 10/2021 und 7 von 02/2026), wird
  der Eintrag gelb „Datum passt nicht zur Nummer“.
- Gelb „ohne Titel“ bleibt sichtbar, alle Einträge sollen zu sehen sein.

### 3a: Herkunft (gebaut 09.11.)

- `beats.alte_id` und `beats.begonnen`, auch in `create_date.json`. Sortierbar
  im Archiv („Zuerst begonnen“, „Alte Nummer“), angezeigt im Detail-Panel.
- Alte ID: `[630]` aus Quellordner oder Dateinamen, sonst der Projektordner
  (`Project_0121`). Begonnen: frühestes Datum der eigenen FLPs und Exporte,
  `Samples/` und `Audio/` zählen nicht (Sample-Packs sind älter als der Song).
- Beim Start für alle Beats nachgetragen, überschreibt nichts. Gemessen: 119
  mit alter Nummer, 69 mit Projektordner, 44 ohne (2025/26 direkt mit
  Katalognummer entstanden), alle mit Begonnen.

**Abnahme:** Die Grün-Liste ist leer, die Gelb-Liste ist abgearbeitet oder
bewusst vertagt.

## Scheibe 4: Neu nummerieren

**Ziel:** Der Katalog läuft lückenlos ab B0001, die höchste Nummer ist die
Anzahl der Songs.

- Reihenfolge nach Fertig-Datum: `create_date.json` in `01_SAVEFILES`, sonst
  Archivmonat, sonst Dateidatum.
- Umbenannt wird nur der Ordnername, nicht die Dateien darin.
- Vorher die heutige Katalognummer als `frueher_nr` sichern (DB und
  `create_date.json`). Für 44 Beats ist sie die einzige ID.
- Was erst nach dem Umbau fertig wird, bekommt die nächste Nummer, auch wenn
  es alt begonnen ist. Das Alter zeigt `begonnen`.
- DB in einem Lauf: Beat-Einträge plus `beat_uploads`, `beat_sample_credits`
  und `beat_description_overrides` (alle per `beat_id`).
- BeatOS versteht danach überall `B0012`. Vorher alle Stellen prüfen, die
  Nummern aus Ordnernamen lesen: Archiv-Index, Upload, Browse, Studio.
- Danach Produktion als P, Samples als S, Remixe als R.
- Sicherheit: Zuerst ein Beat mit `Audio/`-Ordner (103 Stück) umbenennen und
  in FL öffnen. Bei Produktionsordnern dasselbe.

**Abnahme:** Browse, Upload und Statistik zeigen dieselben Songs wie vorher,
nur mit neuen Nummern.

## Scheibe 5: FL-Templates über „Neu“

**Ziel:** Neue Projekte starten immer aus BeatOS mit der richtigen Vorlage am
richtigen Ort.

- „Neu ▾“ listet jede FLP in `01_TEMPLATES/FL/<Typ>/` auf. Eine neue Vorlage
  erscheint ohne Einstellung im Menü.

| Unterordner | Ziel | Nummer |
|---|---|---|
| `Beat/` | `01_ACTIVE_PRODUCTION` | P |
| `Sample/` | `06_SAMPLES` | S |
| `Recording/`, `Mix-Master/` | Künstler-Release, fragt nach Künstler | — |

- Löst die heutigen Einzel-Einstellungen für START.flp und die Sample-Vorlage
  ab.

## Scheibe 6: Ohne Nummer

**Ziel:** Was in FL ohne BeatOS gespeichert wurde, bekommt trotzdem Nummer
und Ordner.

- BeatOS findet FLPs ohne Präfix in `01_ACTIVE_PRODUCTION` und `06_SAMPLES`,
  zum Beispiel `No Way Home.flp`.
- Die Übersicht zeigt „Ohne Nummer (2)“ mit dem Knopf „Nummern vergeben“.
- Der Knopf ist gesperrt, solange FL läuft. Sonst speichert FL wieder unter
  dem alten Pfad.

## Scheibe 7: Künstler

**Ziel:** Alle Auftragsarbeiten liegen in `05_ARTISTS` im Release-Schema.

- `Image-Line\...\Projects\Songs\Artists` (404ANGEL, Blowfish, Jarno & Mats,
  JarnoGm, Mats Elders, xP4RA und lose Dateien) wird eingesammelt, mit
  derselben Ampel und Kopie wie in Scheibe 3.
- In `05_ARTISTS/JarnoGm` liegen `Project_0873`, `Project_1` und `Backup` lose.
  Sie werden Releases zugeordnet.
- A-Nummer pro Release vergeben.

## Scheibe 8: Samples

**Ziel:** Jedes Sample folgt dem Schema und ist in BeatOS such- und abspielbar.

- `S0002 Guitarsample_processed` und `S0003 Project_5` werden nach dem Schema
  umbenannt, mit Abfrage von Kürzel, Titel, Key und BPM.
- Die Samples-Ansicht filtert nach Kürzel, Key und BPM, mit Player, und zeigt
  MIDI, wenn vorhanden.
- `_MIDI` wird eingebunden.

## Scheibe 9: Upload-Ablage

**Ziel:** Cover, Thumbnails und Videos landen in `04_UPLOAD`, BeatOS ordnet sie
dem Beat zu.

- `04_UPLOAD` ist die eine Ablage. `MEDIA` gibt es nicht mehr.
- Offene Dateien zuordnen, zum Beispiel `Timeline_1` bis `5.mp4` und
  `COME BACK [D#m 138].mp4`.
- Namensvorschlag für Exporte aus PS und Premiere, damit BeatOS sie selbst
  erkennt, zum Beispiel `B0012_Cover.png`.

## Scheibe 10: Abschluss

**Ziel:** Es gibt nur noch die Bibliothek, der Altbestand liegt unverändert in
`_ALT`.

- Erst wenn Grün und Gelb leer sind und du freigibst.
- OneDrive-Sync vorher pausieren.
- **Achtung:** Alte FLPs zeigen mit festen Pfaden auf Sample-Ordner im
  Altbestand (`[000]Samples`, `Samples`, `Melodysamples`). Vor dem Umzug
  prüfen, welche Archiv-FLPs dorthin zeigen. Diese Samples entweder neben die
  FLP holen oder die Ordner liegen lassen.

---

## Entscheidungen

| Datum | Entscheidung |
|---|---|
| 09.11. | Instrument als Kürzel im Sample-Namen |
| 09.11. | Künstler-Cover und Video im selben Release-Ordner wie der Mix |
| 09.11. | `_ARCHIVIERT` erst gegen das Archiv prüfen. Gemessen: 109 Projekte erkannt, alle im Archiv, bei einem fehlt dort Arbeit |
| 09.11. | Präfixe P B S A R. Produktion rückt nach, Katalog fest |
| 09.11. | Katalog ab B0001 neu, nach Datum |
| 09.11. | Remix und Mashup zusammen als R in `07_REMIXES` |
| 09.11. | `Projects\Songs\Artists` gehört nach `05_ARTISTS` |
| 09.11. | `MEDIA` war die Cover-Ablage und geht in `04_UPLOAD` auf. `COVER` sind Reste |
| 09.11. | Fertig-Datum: `create_date.json`, sonst Archivmonat, sonst Dateidatum |
| 09.11. | A-Nummer pro Release, nicht pro Künstler |
| 09.11. | 67 Test-Protokolle nach `_ALT` |
| 09.11. | Alte Songs nie verlieren: kopieren, nie zusammenlegen, Ampel statt Einzeldurchsicht |
| 09.11. | Nummer = wann fertig. Alte ID und Begonnen als eigene DB-Spalten, sortierbar |
| 09.11. | Unfertige alte Ideen: Liste „Alte Ideen“ (nach Alter, „In Produktion holen“), Filter „Aus den Anfängen“; Scheibe 4b |
| 09.11. | Gelb „ohne Titel“ bleibt sichtbar |

## Offene Fragen

- Kommt „Neu mixen“ als Markierung im Archiv (nach Scheibe 4)?
