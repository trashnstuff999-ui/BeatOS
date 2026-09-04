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
holen und dort über „Neuer Beat" einzupflegen. Im gelebten Ablauf — Beat wird
noch am selben Tag heimgeholt — stimmt der Monat meistens von allein; es kippt
nur, wenn ein Beat am Monatsende liegen bleibt.

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

## Collabs — Sample-Produzenten einmal pflegen, pro Beat auswählen

**Was es ist.** Jeden Beat produzierst du selbst. Manchmal steckt ein Sample
von jemand anderem drin, und der gehört mit Namen und Links in die
Beschreibung. Die Links sollen einmal in der App stehen statt bei jedem Upload
neu kopiert zu werden.

Das ist ausdrücklich **kein** allgemeines Collab-System mit wechselnden Rollen:
Du bist immer der Produzent, die anderen sind Sample-Geber.

### Datenhaltung — zwei Tabellen, beide nach vorhandenem Muster

**1. `sample_producers`** — die Adressbuch-Seite. Vorlage ist
`type_beat_presets`: eine benannte Sache, in den Einstellungen gepflegt, im
Upload ausgewählt.

```sql
CREATE TABLE IF NOT EXISTS sample_producers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  instagram_url  TEXT,
  beatstars_url  TEXT,
  soundcloud_url TEXT,
  youtube_url    TEXT,
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Leere Links fallen beim Rendern weg — im Beispiel hat prodzeux nur Instagram
und Beatstars.

**2. `beat_sample_credits`** — wer bei welchem Beat was beigesteuert hat.
Vorlage ist `beat_uploads`: exakt dieselbe Form, mehrere Zeilen pro Beat mit
zusammengesetztem Schlüssel.

```sql
CREATE TABLE IF NOT EXISTS beat_sample_credits (
  beat_id      TEXT    NOT NULL,
  producer_id  INTEGER NOT NULL,
  contribution TEXT    NOT NULL DEFAULT 'Sample',
  PRIMARY KEY (beat_id, producer_id)
);
```

`contribution` ist Freitext („Guitarsample", „Drumloop", „Vocal Chop"). Er
wechselt von Beat zu Beat und gehört deshalb hierher, nicht ins Adressbuch.

Zwei Entscheidungen, die dahinterstecken:

- **Eigene Tabelle statt Textspalte auf `beats`.** Mehrere Sample-Geber pro
  Beat gehen dann ohne Umbau, und „zeig mir alle Beats mit prodzeux-Samples"
  bleibt eine gewöhnliche Abfrage. `beat_uploads` löst dasselbe Problem
  genauso.
- **Verweis über die `id`, nicht über den Namen.** Ändert prodzeux seinen
  Instagram-Link, stimmt er beim nächsten Rendern überall — genau darum geht
  es ja. Bereits geschriebene `.txt`-Dateien im Beat-Ordner ändern sich nicht
  rückwirkend, die entstehen beim Rendern neu.

### Die drei Platzhalter

Der Renderer (`upload/render.rs`, `base_vars`) kennt heute TITLE, TITLE_UPPER,
BPM, KEY, TYPE_BEAT_MAIN, ALSO_FITS, GENRE_TAGS, PRODUCER, PRODUCER_PROD,
EMAIL, IG_URL, SC_URL, YT_URL, BS_URL, BEATSTARS_LINK, YEAR, HASHTAGS.

**`{{PRODUCER_LINE}}`** — ohne Sample-Geber `prod. goodbxy`, mit
`prod. goodbxy & prodzeux`. Bei mehreren mit Komma und `&` vor dem letzten.

**`{{CREDITS}}`** — ersetzt die zwei Zeilen, die heute schon im Template
stehen (`templates.rs`, Zeilen 145/146 und 191/192):

```
🚫 No Samples Used
🎸 Loop by {{PRODUCER}}
```

Ohne Sample-Geber rendert es genau diese zwei Zeilen weiter. Mit:

```
🎸 Guitarsample by prodzeux
🎸 Beat by prod. goodbxy
```

**Dieser Block ist also nie leer.** Das ist der Punkt, an dem die ganze Sache
einfach bleibt.

**`{{COLLAB_SOCIALS}}`** — der einzige Block, der leer sein kann:

```
prodzeux:
https://www.instagram.com/prodzeux/
https://www.beatstars.com/prodzeux
```

### Das Leerzeilen-Problem — kleiner als beim ersten Entwurf gedacht

`render_template()` ist ein reiner String-Ersetzer ohne Bedingungen (bewusst
so, siehe Kommentar dort). Ein leerer Block hinterlässt deshalb eine Leerzeile
und womöglich einen frei stehenden Trennstrich.

Weil aber **nur ein einziger** Platzhalter leer werden kann, braucht der
Renderer keine Bedingungen. Eine Zeile am Ende von `render_template()` reicht:
mehr als zwei aufeinanderfolgende Zeilenumbrüche auf zwei zusammenziehen. Die
Lücke schließt sich, und an jeder anderen Stelle ändert sich nichts.

- [ ] `render_template()` um genau diese Regel ergänzen, mit Test für den
      Fall „Platzhalter leer, Trennstrich bleibt an seinem Platz"

### Oberfläche

- [ ] **Einstellungen, Bereich Producer:** Liste der Sample-Produzenten unter
      den eigenen Daten. Anlegen, bearbeiten, löschen. Beim Löschen sagen, wie
      viele Beats darauf verweisen
- [ ] **Upload-Tab:** Auswahl beim Beat, neben den Type-Beat-Feldern
      (`TypeBeatCard.tsx`) — beides ist „was in die Beschreibung wandert".
      Produzent aus einer Liste, Beitrag als Textfeld daneben

### Reihenfolge

1. [ ] Tabellen in `db/connection.rs`, `init_db()` — wie die Nachbarn,
       idempotent
2. [ ] Kommandos: Adressbuch anlegen/lesen/ändern/löschen, Credits pro Beat
       lesen und schreiben
3. [ ] Settings-Oberfläche — ab hier ist das Adressbuch nutzbar
4. [ ] Die drei Platzhalter in `render.rs`, plus die Leerzeilen-Regel
5. [ ] Standard-Templates auf `{{PRODUCER_LINE}}`, `{{CREDITS}}` und
       `{{COLLAB_SOCIALS}}` umstellen
6. [ ] Auswahl im Upload-Tab

Nach Schritt 4 ist es schon prüfbar: Platzhalter von Hand ins Template setzen
und die Vorschau ansehen.

### Nicht Teil davon

Die Beispieltexte enthalten auch einen LICENSING-Absatz und Time-Codes. Das
ist gewöhnlicher Template-Inhalt, den der Template-Editor in der App heute
schon bearbeiten kann — hat mit Sample-Credits nichts zu tun und braucht
keinen Code.
