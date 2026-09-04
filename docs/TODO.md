# TODO

Kleinere Sachen, die aufgefallen sind und noch keinen Platz in einem Plan haben.
Der größere Fahrplan liegt in `qol-roadmap.md` — hier steht nur, was nebenbei
auftaucht.

---

## Archivmonat in der Create-Maske änderbar machen

**Warum.** Der Archivmonat wird aus dem *Erstelldatum der ältesten FLP*
berechnet (`src-tauri/src/commands/create.rs`, `year_month_from_secs` auf
`flp_by_created.first()`). Kommt ein Beat über einen Umweg — gezippt, über
Dropbox geschoben, auf der anderen Maschine entpackt — ist genau dieses
Datum weg: Entpacken setzt die Erstellzeit auf jetzt. Der Beat landet dann im
Monat des Imports statt im Monat der Produktion.

Aufgefallen beim Plan, Mac-Projekte vorübergehend per Dropbox nach Windows zu
holen und dort über „Neuer Beat" einzupflegen.

**Was fehlt.** `yearMonth` in `src/pages/Create.tsx` wird ausschließlich aus
dem geparsten Ordner gesetzt (Zeile ~234). Es gibt keinen Regler dafür — der
Wert wird nur angezeigt und dann so archiviert.

- [ ] `yearMonth` in der Create-Maske editierbar, Vorbelegung bleibt der
      geparste Wert
- [ ] Sichtbar machen, wenn der Wert aus dem Dateisystem statt aus einer FLP
      stammt — dann ist er geraten und nicht gemessen
- [ ] Format bleibt `JJJJ/MM_MONAT` wie in `MONTH_NAMES`
      (`src-tauri/src/utils/date.rs`), sonst passt der Ordner nicht ins Archiv

**Aufwand.** Klein, kein Backend — `year_month` kommt schon als Feld aus
`parse_beat_folder_for_create` und geht als Parameter in `archive_beat`.
Beide Enden sind da, es fehlt nur das Bedienelement dazwischen.

---

## Collabs — Mit-Produzenten in Settings pflegen, im Upload auswählen

**Ziel.** In den Einstellungen werden Mit-Produzenten angelegt (Name plus
Social-Media-Links). Im Upload-Tab wählt man pro Beat einen oder mehrere davon
aus, und ihre Angaben wandern automatisch in die Beschreibungen.

### Wie das Ergebnis aussehen soll

SoundCloud, Titelzeile und Credits:

```
"NOBODY HERE" | prod.goodbxy & prodzeux
BPM: 156 | Key: C#m
...
🎸 Guitarsample by Prodzeux
🎸 Beat by prod.goodbxy
```

und weiter unten ein eigener Block unter den eigenen Socials:

```
prodzeux:
https://www.instagram.com/prodzeux/
https://www.beatstars.com/prodzeux
```

YouTube genauso, nur mit `prod. goodbxy & prodzeux` als eigener Zeile unter
dem Titel.

### Datenhaltung

`app_settings` ist flach (Schlüssel/Wert) und trägt keine Liste. Es braucht
eine eigene Tabelle — **`type_beat_presets` ist die passende Vorlage**: genau
dasselbe Muster, eine benannte Sache, die in den Einstellungen gepflegt und im
Upload-Tab ausgewählt wird.

- [ ] Tabelle `collab_producers`: `id`, `name`, `instagram_url`,
      `beatstars_url`, `soundcloud_url`, `youtube_url`, `created_at`.
      Anlegen wie die anderen in `db/connection.rs`, `init_db()`
- [ ] Pflege-Oberfläche in den Einstellungen, neben den eigenen Producer-Daten
- [ ] Zuordnung pro Beat: eine `TEXT`-Spalte auf `beats` reicht und passt zum
      Stil der Nachbarn (`type_beat_main`, `genre_tags` sind auch Text).
      Muss Name **und Rolle** tragen — „Guitarsample by X" gegen „Beat by Y"
      wechselt von Beat zu Beat, gehört also nicht in die Settings
- [ ] Auswahl im Upload-Tab, wie der Preset-Wähler in `PresetBar.tsx`

### Neue Platzhalter

Der Renderer (`upload/render.rs`, `base_vars`) kennt heute TITLE, TITLE_UPPER,
BPM, KEY, TYPE_BEAT_MAIN, ALSO_FITS, GENRE_TAGS, PRODUCER, PRODUCER_PROD,
EMAIL, IG_URL, SC_URL, YT_URL, BS_URL, BEATSTARS_LINK, YEAR, HASHTAGS.

- [ ] `{{PRODUCER_LINE}}` — `prod. goodbxy & prodzeux`, ohne Collab nur
      `{{PRODUCER}}`
- [ ] `{{CREDITS}}` — der 🎸-Block, eine Zeile pro Beteiligtem mit seiner Rolle
- [ ] `{{COLLAB_SOCIALS}}` — Name plus Links, ohne Collab leer

### Der Haken

`render_template()` ist ein reiner String-Ersetzer ohne Bedingungen (bewusst
so, siehe Kommentar dort). Ein leerer Collab-Block hinterlässt deshalb eine
Leerzeile und einen frei stehenden Trennstrich im Text. Zwei Wege:

- die Blöcke bringen ihre eigenen Trenner und Leerzeilen mit, sodass „leer"
  wirklich nichts ergibt — billiger, aber die Templates werden unleserlicher
- oder der Renderer räumt Zeilen weg, die nach dem Ersetzen nur noch aus einem
  leeren Platzhalter bestehen — eine Regel an einer Stelle, dafür etwas mehr
  Logik im Renderer

Zweiter Weg ist wahrscheinlich der richtige, aber erst am echten Template
entscheiden.

### Nicht Teil davon

Die Beispieltexte enthalten auch LICENSING-Absatz und Time-Codes. Das ist
gewöhnlicher Template-Inhalt, den der Template-Editor in der App schon heute
bearbeiten kann — hat mit Collabs nichts zu tun und braucht keinen Code.
