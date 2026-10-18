# TODO

Kleinere Sachen, die aufgefallen sind und noch keinen Platz in einem Plan haben.
Der größere Fahrplan liegt in `qol-roadmap.md` — hier steht nur, was nebenbei
auftaucht.

---

## Archivmonat in der Create-Maske änderbar machen — erledigt 17.10.2026 (154ebbb)

**Warum.** Der Archivmonat wird aus dem *Erstelldatum der ältesten FLP*
berechnet (`src-tauri/src/commands/create.rs`, `year_month_from_secs` auf
`flp_by_created.first()`). Kommt ein Beat über einen Umweg — gezippt, über
Dropbox geschoben, auf der anderen Maschine entpackt — ist genau dieses
Datum weg: Entpacken setzt die Erstellzeit auf jetzt. Der Beat landet dann im
Monat des Imports statt im Monat der Produktion.

Aufgefallen beim Plan, Mac-Projekte vorübergehend per Dropbox nach Windows zu
holen und dort über „Neuer Beat" einzupflegen. Im gelebten Ablauf — Beat wird
noch am selben Tag heimgeholt — stimmt der Monat meistens von allein; es kippt
nur, wenn ein Beat am Monatsende liegen bleibt.

**Was fehlt.** `yearMonth` in `src/pages/Create.tsx` wird ausschließlich aus
dem geparsten Ordner gesetzt (Zeile ~234). Es gibt keinen Regler dafür — der
Wert wird nur angezeigt und dann so archiviert.

- [x] `yearMonth` in der Create-Maske editierbar, Vorbelegung bleibt der
      geparste Wert
- [x] Sichtbar machen, wenn der Wert aus dem Dateisystem statt aus einer FLP
      stammt — dann ist er geraten und nicht gemessen
- [x] Format bleibt `JJJJ/MM_MONAT` wie in `MONTH_NAMES`
      (`src-tauri/src/utils/date.rs`), sonst passt der Ordner nicht ins Archiv

**Aufwand.** Klein, kein Backend — `year_month` kommt schon als Feld aus
`parse_beat_folder_for_create` und geht als Parameter in `archive_beat`.
Beide Enden sind da, es fehlt nur das Bedienelement dazwischen.

---

## Vorgemerkt am 17.10.2026 (nach dem Upload-Tab-Durchgang)

### Durchsicht aller Tabs nach Schrift/Kontrast-Umstellung
Die Scheiben „Kontrast" (fcdd185), „Buchstabenabstand" (0bd1f4f) und
„Schrift eine Stufe größer" (9798feb) wirken in der ganzen App, angesehen
wurde aber nur der Upload-Tab.
- [ ] Archiv, Studio, Create, Dashboard, Einstellungen per Screenshot prüfen
      (`docs/vergleich/screenshot.js`, Kopie auf eigenem Port)
- [ ] Umbrüche, abgeschnittene Texte, zu enge Spalten korrigieren

### Einheitlichkeit in den anderen Tabs
Im Upload-Tab gibt es jetzt `ui/Segmented` (ein Umschalter) und die
Knopf-Familie (`Button`/`IconButton`). Archiv, Studio und Create haben noch
eigene Bauarten.
- [x] Umschalter auf `Segmented` umstellen, Tab für Tab (18.10.2026)
- [x] Selbstgestylte `<button>` auf `Button`/`IconButton`, außer Sonderformen (18.10.2026)

### Monatskalender in der Planung (QoL-Fahrplan Nr. 5)
Wird eingebaut, sobald der Rest gut läuft. Baut auf der Planungs-Leiste auf:
Warteschlange „Ohne Termin" + Ziehen auf Tage gibt es schon.

### Analyse-Tab (eigener Tab, später)
- [ ] Aufrufe pro Beat über yt-dlp (ohne API-Schlüssel), täglich aktualisiert
- [ ] Welche Type-Beat-Artists, Genres, BPM-Bereiche, Upload-Wochentage bei
      den eigenen Videos die meisten Aufrufe bringen
- Voraussetzung: Uploads sind nacherfasst (sonst fehlen 2024/25)

### Studio → Assets: nummerieren, Cover ↔ Thumbnail abgleichen, löschen — erledigt 18.10.2026
Gewünscht am 18.10.2026, Fragen am selben Tag geklärt.
Gebaut als Knopf „Nummerieren …“ mit Vorschau statt still im Hintergrund (Regel: lib/assetNummern.ts, Befehle rename_assets/trash_assets). Löschen: Papierkorb pro Kachel + „Auswählen“.

**Nummerieren.** Covers und Thumbnails im Asset-Ordner werden automatisch
fortlaufend nummeriert und **wirklich umbenannt**: `Cover_1.png`,
`Thumbnail_1.png`, `Cover_2.png` … Die Nummer ist nur dafür da, zu sehen,
was zusammengehört — gehören Cover und Thumbnail zum selben Motiv, tragen
sie dieselbe Nummer.
- [x] ~~Nummern stabil~~ — **geändert 18.10.2026:** die Reihe ist lückenlos ab 1. Die Nummer heißt nur „wartet auf einen Beat“; wird Cover_1/Thumbnail_1 zugewiesen, rutscht Cover_2/Thumbnail_2 auf 1 nach (Rust `luecken_schliessen`, nach Zuweisen und Löschen). Neues kommt hinten dran,
      Reihenfolge bleibt.
- [x] Abgleich per Bildvergleich: beide verkleinern (z. B. dHash), beim
      Thumbnail den mittleren quadratischen Ausschnitt; ähnlich genug →
      gleiche Nummer. Zweites Signal: Exportzeit liegt nah beieinander
- [x] Thumbnail ohne passendes Cover → eigene Nummer; unsichere Treffer
      vorschlagen statt still umbenennen
- [x] **Videos nicht nummerieren** — sie heißen schon wie der Song
      (z. B. `home again_video.mp4`)
- [x] Beim Zuweisen an ein Projekt gilt wie bisher das Namensschema des
      Beats; die Nummer hat dann ihren Zweck erfüllt (Annahme — beim Bauen
      kurz bestätigen lassen)

**Löschen.** Bilder und Videos im Assets-Tab löschen können, wenn man sie
nicht braucht — die Datei verschwindet aus dem Asset-Ordner.
- [x] Löschen in den **Windows-Papierkorb**, wie schon bei Projekten und
      Beats (`trash::delete`, Crate `trash` ist vorhanden): weg aus dem
      Ordner, nach einem Fehlklick aber wiederholbar
- [x] Ein Klick pro Kachel, dazu Mehrfachauswahl zum Aufräumen in einem Rutsch
- [x] Nach dem Löschen: der Rest rutscht nach wie nach dem Zuweisen; ein Partner
      ohne Gegenstück behält seinen Platz in der Reihe

Bausteine: `scan_asset_inbox` (`guessed_role` cover/thumbnail/video) in
`src-tauri/src/commands/studio.rs`, Raster in
`src/components/studio/AssetsPane.tsx`.

### Lautheit/Clipping prüfen (später, nicht dringend)
ffmpeg misst LUFS und Spitzen beim Laden des Beats, Anzeige in der
Asset-Kachel.

### Getaggte MP3 per ffmpeg (Idee, offen)
Tags sitzen nicht immer an festen Stellen — Standard-Tags schon, manche
liegen bewusst in Pausen des Beats. Ein starres „alle 30 s" passt also
nicht; bräuchte Tag-Positionen je Beat (z. B. aus FL-Markern?).

### Zum Schluss der Sitzung am 17.10.2026 — erledigt 18.10.2026 (≈5,3 GB frei)
- [x] Arbeitskopien in `%TEMP%\beatos-vorher`, `beatos-nachher` und den
      Build-Ordner `beatos-target` löschen (node_modules dort ist eine
      Junction — nicht rekursiv hindurch löschen)

---

## Erledigt

### Collabs / Sample-Credits — umgesetzt am 04.09.2026

Adressbuch unter Einstellungen → Producer, Auswahl pro Beat im Upload-Tab,
drei neue Platzhalter. Tabellen `sample_producers` und `beat_sample_credits`,
Modul `commands/sample_credits.rs`.

**Offen bleibt eine Handarbeit:** `ensure_default_templates()` überschreibt
vorhandene Vorlagen nie — die Dateien auf der Platte kennen die neuen
Platzhalter also noch nicht. Im Template-Editor einmal eintragen:

- `{{CREDITS}}` ersetzt die zwei Zeilen `🚫 No Samples Used` und
  `🎸 Loop by {{PRODUCER}}`
- `{{PRODUCER_LINE}}` dort, wo der Name stehen soll — bei YouTube anstelle
  von `{{PRODUCER_PROD}}`
- `{{COLLAB_SOCIALS}}` als eigene Zeile unter den eigenen Socials

- [ ] Vorlagen auf der Platte um die drei Platzhalter ergänzen

---

## Der Rückkanal von den Plattformen

**Was fehlt.** BeatOS weiß, was du hochgeladen hast — aber nie, was daraus
wurde. Plays, Views, Likes, welche Type-Beat-Tags tatsächlich ziehen. Der
Katalog ist ein Aktenschrank; mit diesen Zahlen würde er dir sagen, was
funktioniert.

Heute steht in `beat_uploads` nur, *dass* etwas hochgeladen wurde, plus URL
und Datum. Das ist die halbe Geschichte.

**Warum das groß ist.** Anders als alles andere auf dieser Liste braucht es
fremde Dienste:

- [ ] OAuth gegen YouTube (Data API) und SoundCloud, jeweils mit Registrierung
      der App und Token-Erneuerung. Beatstars hat keine offene API — dort
      bliebe nur Handeintrag oder gar nichts
- [ ] Regelmäßiges Abholen im Hintergrund, mit Ratenbegrenzung und einem
      Umgang mit Ausfällen, der die App nicht blockiert
- [ ] Eine Tabelle für Zeitreihen (Beat, Plattform, Datum, Zahlen) — nicht
      nur der letzte Stand, sonst sieht man keine Entwicklung
- [ ] Eine Auswertungsansicht, die die Zahlen gegen die Tags stellt: welche
      Artists, Genres und Hashtags korrelieren mit Plays

**Ehrliche Einschätzung.** Das ist kein Nachmittag, sondern das größte
Einzelvorhaben auf allen Listen — und das einzige, das die App von einer
Verwaltung zu einem Werkzeug für Entscheidungen macht. Erst sinnvoll, wenn
der Rest steht und der Bestand gesichert ist.

Aufgekommen bei der Frage „was könnte man noch bauen" am 04.09.2026.
