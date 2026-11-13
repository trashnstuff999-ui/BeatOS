# Fahrplan ab 13.11.2026

Reihenfolge für alles, was in `TODO.md`, `bibliothek-umbau.md` und
`qol-roadmap.md` offen ist. Die Einzelheiten zu jedem Punkt stehen dort, hier
steht nur: was zuerst, warum, und was wovon abhängt.

Größen sind Schätzungen aus dem Code, keine Zusagen: **klein** = ein Teil einer
Sitzung, **mittel** = eine Sitzung, **groß** = mehrere Sitzungen.

## Regeln für jeden Block

- Ein Block nach dem anderen, innerhalb des Blocks eine Scheibe nach der anderen.
- Alles mit Oberfläche: Entwurf zuerst, dann bauen.
- Alles mit fremder Technik (Photoshop, Drag-Plugin, yt-dlp): erst eine Probe,
  dann planen. So wie die Photoshop-Probe am 13.11.
- Nach jeder Scheibe tsc + Tests. Abnahme in der App am Blockende, dann ein Commit.
- Nichts auf Umbau-Werkzeuge bauen (Fundstücke, Einsammeln, Pfadreparatur), die
  kommen in Block D weg.

## Auf einen Blick

| Block | Inhalt | Größe | Warum an dieser Stelle |
|---|---|---|---|
| A | Offenes abschließen | mittel | Seit 13c5f99 liegt sehr viel uncommittet |
| B | Samples | groß | Scheibe 8 war ohnehin als Nächstes geplant |
| C | Upload und Cover | groß | Täglicher Ablauf, größter Zeitgewinn |
| D | Umbau abschließen, aufräumen | mittel | Danach ist die App schlank, bevor Neues dazukommt |
| E | Herausziehen (Upload + Samples) | mittel | Ein Baustein, zwei Stellen; braucht Probe |
| F | Wissen aus den FLPs | mittel | Gemeinsame Grundlage für zwei Punkte |
| G | Übersicht und Ordnung | mittel | Unabhängig, gut für kurze Sitzungen |
| H | Reichweite | groß | Braucht nacherfasste Uploads und fremde Dienste |
| I | Später / bei Bedarf | – | Nützlich, aber nichts wartet darauf |

---

## Block A — Offenes abschließen

Keine neue Arbeit, bevor das hier durch ist. Der uncommittete Stand ist das
größte Risiko im ganzen Projekt.

1. **Abnahme in der App** (Strg+F5, `tauri dev` neu starten wegen 0.9.0):
   - Wucht-Look in allen Tabs, Player Variante A, Artist-Kacheln ziehen
   - Scheiben 4b (Alte Ideen), 5 („Neu“ mit Vorlagen), 6 (Neues erkennen), 7
   - Archiv-Assets mit automatischem Namen
   - Die Fixes vom 13.11., vor allem die zwei nur kompilierten: neuer Pfad in
     den Einstellungen ohne Neustart, schneller Fassungswechsel im Player
2. **Ein Commit** für alles.
3. **Zwei Entscheidungen** (je eine Frage, danach klein):
   - Geplante Uploads werden von selbst „Live“: so lassen oder bestätigen lassen?
   - Warteschlange 180 Tage: bleibt, bis der Altbestand nacherfasst ist
4. **Drei kleine Punkte** aus der Nacht zum 13.11.:
   - „Verkauft“ → „Exklusiv verkauft“, Feld „Exklusiv an“ (klein)
   - Status von Archiv und Studio angleichen: Vorschlag abstimmen (klein bis mittel)
   - Placements im Archiv-Beat: Entwurf zuerst (mittel)
5. Handarbeit Stephan: Vorlagen in `FL/Sample`, `FL/Recording`, `FL/Mix-Master`
   ablegen; drei Platzhalter in die Beschreibungs-Vorlagen eintragen.

## Block B — Samples

Erst Ordnung im Bestand, dann die neuen Wege. Die vier Wünsche vom 13.11.
bauen alle auf Scheibe 8 auf.

1. **Scheibe 8** (Entwurf zuerst, mittel): nach Namen gruppieren, Filter, „Zu
   den Ideen“. Dabei die losen WAVs im Stamm von `06_SAMPLES` einordnen
   (Blue Hour, Ghost Town, Metal-Sample).
2. **„Passt zu“-Filter** (klein): erweitert den Filter aus Scheibe 8 um Tempo
   und Tonart. Die Tonart-Normalisierung gibt es schon im Archiv-Filter.
3. **Spuren zusammen anhören** (mittel): braucht die Gruppen aus Scheibe 8.
   Mehrere Audio-Elemente gleichzeitig, der Player kann heute nur eines.
4. **„Beat daraus machen“** (klein): `create_project_folder` und die
   Beat-Vorlage sind da, es fehlt das Kopieren der WAVs und die Notiz.

„Samples nach FL ziehen“ kommt in Block E, zusammen mit dem Upload.

## Block C — Upload und Cover

Vom fertigen Beat bis „Live“ ohne Explorer und ohne Export-Dialog.

1. **Scheibe 9, Upload-Ablage** (Entwurf zuerst, mittel): Namensvorschlag als
   Angebot, sonst fragen. Zuerst, weil die Cover-Kette dieselbe Ablage benutzt.
2. **Cover-Kette** in drei Scheiben, die kleinste zuerst:
   - **Thumbnail selbst rechnen** (klein): Cover auf 1080 Höhe, mittig auf
     Schwarz, 1920×1080. Nützt sofort allen Beats mit Cover ohne Thumbnail.
     Kein Photoshop nötig.
   - **PSD öffnen** per Klick auf die leere Cover-Kachel (klein): über
     Photoshop selbst, nicht über die Dateiverknüpfung (die zeigt auf After
     Effects). Pfad als Einstellung.
   - **„Cover holen“** (mittel): Photoshop exportiert das offene Dokument als
     Kopie in den Beat, Thumbnail entsteht gleich mit. Probe vom 13.11. lief.
3. **„Weiter zum nächsten Beat“** im Upload-Tab (klein).
4. **Upload-Seite der Plattform mit öffnen** (mittel, Entwurf zuerst): Knopf je
   Plattform, Titel → Beschreibung → Tags nacheinander in die Zwischenablage.

## Block D — Umbau abschließen, aufräumen

Hier, weil nach B und C alle Tabs auf der neuen Ordnung stehen und vor den
nächsten Features der Ballast weg soll.

1. **Bestand nach der Namensregel umbenennen** (mittel, mit Vorschau).
2. **Scheibe 10**: Altbestand nach `_ALT` (mittel). Erst, wenn alles sicher
   drüben ist.
3. **Umbau-Werkzeuge löschen**: Fundstücke, Einsammeln, Artist-Ordner,
   `pfadreparatur.rs`, die Handproben-Tests (mittel, fast nur Löschen).
4. **App-Durchgang**: was brauchen wir nicht mehr? Dabei die Tab-Durchsicht per
   Screenshot nach der Schrift-Umstellung miterledigen.

## Block E — Herausziehen

Ein Baustein, zwei Stellen. Zuerst die Probe, weil alles daran hängt.

1. **Probe** (klein): Tauri-Drag-Plugin einbauen, eine Datei aus BeatOS in den
   Browser (YouTube-Upload) und in die FL-Playlist ziehen. Klappt eines von
   beiden nicht, wird nur das andere gebaut.
2. **Asset-Zeilen im Upload ziehbar** (klein nach der Probe).
3. **Samples nach FL ziehen** (klein nach der Probe).

## Block F — Wissen aus den FLPs

1. **Grundlage** (mittel): beim Scan die Sample-Pfade jeder FLP lesen und
   merken. `flp.rs` und das Pfad-Umbiegen in `nummerieren.rs` zeigen, dass es
   geht; neu ist nur das Merken.
2. **„Welche Beats nutzen diesen Loop?“** (klein, Entwurf zuerst): Anzeige am
   Sample und am Projekt.
3. **Vollständigkeits-Check vor dem Archivieren** (klein): fehlende Dateien
   als Warnung in der Create-Maske.

## Block G — Übersicht und Ordnung

Unabhängig voneinander, jeder Punkt passt in eine kurze Sitzung.

1. **„Wiederentdecken“** auf der Übersicht (klein): `unpublishedOnly` gibt es
   schon, es fehlt die Kachel.
2. **Release-Kalender als `.ics`** (klein): die Termine liefert
   `get_upload_schedule`.
3. **Speicherplatz-Übersicht** (mittel, Entwurf zuerst).
4. **Aktivitätsprotokoll** (mittel bis groß): jede Stelle, die umbenennt,
   verschiebt oder löscht, muss hineinschreiben. Am besten nach Block D, dann
   sind es weniger Stellen.

## Block H — Reichweite

Erst sinnvoll, wenn die Uploads nacherfasst sind, sonst fehlen 2024/25.

1. **Uploads nacherfassen** für den Altbestand (Stephan, Knopf ist da). Danach
   kann die 180-Tage-Grenze fallen.
2. **Aufrufe pro Beat** über yt-dlp (Probe zuerst, dann mittel): Zeitreihe je
   Beat, täglich.
3. **Analyse**: welche Type-Beat-Artists, Tempi, Wochentage ziehen (mittel,
   Entwurf zuerst). Baut auf 2.
4. **Shorts-Schnipsel** (mittel, Probe mit ffmpeg zuerst): baut auf Video-Tab
   und Kapitelmarken.
5. **Rückkanal über die Plattform-APIs** (groß): nur, wenn yt-dlp nicht reicht.

## Block I — Später / bei Bedarf

Keine Reihenfolge, nichts wartet darauf.

- Verkäufe mit Lizenzart, Preis, Datum
- Mehrfachauswahl im Archiv
- Ähnliche Beats nach Tonart und Tempo
- Lautheit/Clipping je Export
- Tempo und Tonart gegenmessen
- Getaggte MP3 per ffmpeg
- Fahrplan-Reste: Monatskalender, Stapel-Planer, „Nächster freier Tag“,
  globaler Hotkey, Alt+Zahl, Längen-Zähler (vorher gegenprüfen, was davon
  schon gebaut ist)

## Für kurze Sitzungen

Wenn nur wenig Zeit ist und der laufende Block eine große Scheibe verlangt,
passt einer dieser Punkte dazwischen, ohne etwas zu blockieren:
Thumbnail selbst rechnen (C2), „Weiter zum nächsten Beat“ (C3),
„Wiederentdecken“ (G1), `.ics`-Export (G2), „Beat daraus machen“ (B4, nach
Scheibe 8).

## Was die Reihenfolge kippen würde

- Die Drag-Probe (E1) scheitert: Block E entfällt, „Upload-Seite öffnen“ (C4)
  wird wichtiger.
- „Cover holen“ läuft im Alltag nicht zuverlässig: dann stattdessen „Beat
  vormerken, nächster Export gehört ihm“ (am 13.11. als Ersatz besprochen).
- Stephan entscheidet bei „von selbst Live“ auf Bestätigen: kommt als kleine
  Scheibe in Block C dazu.
