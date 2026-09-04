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
