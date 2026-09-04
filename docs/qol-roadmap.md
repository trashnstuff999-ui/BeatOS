# QoL-Fahrplan — von FL Studio bis Upload ohne Fensterwechsel

Stand 12.08.2026, Branch `refactor/dashboard`.
Begründung und Befund als lesbare Seite: https://claude.ai/code/artifact/e2c826fa-d1d8-4e14-9447-7a7b1f540efd

Ziel: BeatOS liegt neben FL Studio offen, und die Kette Songstart → Studio →
Archiv → Upload läuft ohne Abstecher in Explorer, Notepad oder Browser.
Reihenfolge ist Absicht: erst das Billige mit der größten Wirkung.

---

## Erledigt

- [x] **1 — Auto-Refresh beim Fensterfokus** · `useFocusRefresh.ts`, 10-s-Sperre, mit Test
- [x] **2 — Fenster merkt sich seinen Platz + Always-on-Top** · `tauri-plugin-window-state`, Pin-Knopf in der Sidebar
- [x] **3 — „Neues Projekt" im Studio** · `create_project_folder`, laufende Nummer über alle Roots, öffnet FL
- [x] **4 — Template-Editor in der App** · `write_template` + `preview_template`, Live-Vorschau

---

## Offen aus dem ersten Plan

## 5 — Monatskalender · ~180 Zeilen, kein Backend

- [ ] Monatsraster neben `src/components/upload/PlannerStrip.tsx`, Klick-zum-Planen von dort wiederverwenden
- [ ] `api.upload.getSchedule(from, to)` kann beliebige Zeiträume — nur die Ansicht fehlt
- [ ] Liste „fertig, ohne Termin" daneben: `get_beats_paginated` hat `unpublishedOnly` schon

## 6 — Strg+K Schnellsuche · ~120 Zeilen, kein Backend

- [ ] Overlay in `src/App.tsx` neben `GlobalTagManager` — der globale Modal-Kanal existiert
- [ ] Beats über `get_beats_paginated` (Suche, Limit 8), Projekte aus dem letzten Studio-Scan
- [ ] Enter navigiert: Beat → `/browse` mit `initialFilters`, Projekt → Studio

## 7 — Drag & Drop ins Fenster · ~60 Zeilen, evtl. Rust

- [ ] Fenster-Event `onDragDrop` aus `@tauri-apps/api/webview`
- [ ] Zielprojekt ist die vorhandene Auswahl in `Studio.tsx` (`selectedPath`)
- [ ] `assign_asset_to_project` erwartet eine Datei aus der Inbox — entweder erst dorthin kopieren oder den Command um beliebige Quellen erweitern

---

## Neue Kandidaten (zweiter Durchgang, 12.08.2026)

Fast alles steht auf Bausteinen, die es schon gibt. Empfohlene Reihenfolge,
falls nur ein Teil gebaut wird: **14 → 8 + 9 → 10 → 12 → 11**.

### Der Rückweg — Archiv zurück nach FL

Die Kette ist eine Einbahnstraße: `DetailPanel.tsx` kennt nur `revealItemInDir`.

## 8 — „In FL öffnen" im Archiv · ~25 Zeilen, wenig Rust

- [ ] Command `get_beat_flp_path(beatPath)`: neueste `.flp` in `01_SAVEFILES` — Muster in `get_beat_audio_path`
- [ ] `openPath(flp)` im `DetailPanel`, neben „Ordner öffnen"
- [ ] Knopf ausgrauen, wenn keine FLP mitarchiviert wurde

## 9 — „Neue Version starten" · ~30 Zeilen, kein neues Backend

- [ ] `create_project_folder(root, name, templateFlp)` nimmt jede FLP als Vorlage — auch die archivierte
- [ ] Nummer über `next_project_name`, dann `openPath`
- [ ] Knopf im `DetailPanel` direkt unter 8

Decke: kopiert nur die FLP, keine Samples. FL findet Samples über seine Bibliothek.

### Der Export-Moment

## 10 — Export-Namen in die Zwischenablage · ~10 Zeilen, kein Backend

- [ ] `navigator.clipboard.writeText` in `ProjectRow`: `projectDisplayName` + `[Key BPM]`
- [ ] Kurzes „kopiert"-Feedback wie im `UploadAssistantDialog`
- [ ] Wirkung: `parse_audio_filename` greift später zuverlässig

## 11 — Status zieht selbst nach · ~10 Zeilen, Rust

- [ ] In `scan_studio_projects_blocking`: `has_mp3 || has_wav` + Status `idea`/`wip` → `exported`
- [ ] Nur nach vorn, nie zurück
- [ ] Der Hinweis-Klick in `ProjectRow.tsx:119` entfällt

### Serie statt Einzelstück

## 12 — Stapel-Planer · ~90 Zeilen, kein Backend

- [ ] Liste aus `get_beats_paginated` (`unpublishedOnly`), Belegung aus `get_upload_schedule`
- [ ] Wochentags-Auswahl + Startdatum, Terminvorschau vor dem Schreiben
- [ ] Schreiben = N × `update_upload_status`
- [ ] Gehört an 5 dran: Kalender zeigt die Lücken, der Verteiler füllt sie

## 13 — „Nächster freier Tag" · ~10 Zeilen, kein Backend

- [ ] Erste Lücke aus dem `PlannerStrip`-State statt Kalender-Absuchen
- [ ] Optional Wochenenden überspringen

### Der Rahmen

## 14 — Globaler Hotkey holt BeatOS nach vorn · ~20 Zeilen, 1 Plugin

- [ ] `tauri-plugin-global-shortcut`, Registrierung in `lib.rs`
- [ ] Handler: `show()` + `set_focus()`, bei Fokus `minimize()`
- [ ] Kombination als Setting (Kollision mit FL-Bindings vermeiden)
- [ ] Permission `global-shortcut:allow-register` in `capabilities/default.json`

Ohne das ist BeatOS hinter FL im Vollbild unerreichbar — 2 hilft nur bei sichtbarem Fenster.

## 15 — Alt+1…5 für die Tabs · ~10 Zeilen, kein Backend

- [ ] `keydown`-Listener in `App.tsx`, Reihenfolge aus der Sidebar-Konstante
- [ ] Nicht auslösen, wenn der Fokus in einem Eingabefeld steht

## 16 — Inbox-Zähler an der Sidebar · ~20 Zeilen, kein Backend

- [ ] `scan_asset_inbox` beim Start und Fensterfokus zählen
- [ ] Badge am Studio-Tab, verschwindet bei 0

### Beim Produzieren

## 17 — Titel-Dopplung sofort melden · ~15 Zeilen, kein Backend

- [ ] `check_beat_duplicate` im `ProjectInspector` beim Umbenennen aufrufen
- [ ] Treffer als Hinweiszeile, kein Blocker

## 18 — Key- und BPM-Nachbarn · ~40 Zeilen, kein Backend

- [ ] `get_beats_paginated` mit Key-Filter + BPM-Bereich, Limit 5, im Inspector
- [ ] Abspielen über den globalen Player

### Upload-Texte

## 19 — Längen-Zähler an den Tag-Feldern · ~15 Zeilen, kein Backend

- [ ] Zeichen-/Chip-Zähler in `ChipListEditor`, Warnfarbe ab 90 %
- [ ] Limit pro Plattform als Prop (YT 500 Zeichen / Titel 100, SC 30 Tags)

## 20 — Upload-Links im Archiv sichtbar · ~25 Zeilen, kein Backend

- [ ] `beat_uploads.url` wird beim Markieren als hochgeladen schon gespeichert
- [ ] `get_upload_badges` liefert den Status — es fehlt nur die Anzeige mit Link

---

## Bewusst nicht auf der Liste

- **Der Upload selbst** bleibt im Browser. Ohne Plattform-APIs geht nicht mehr —
  der Assistent verlinkt in die Studios, die Texte liegen als Copy-Panels bereit.
- **Mehrfachauswahl / Bulk (D7)** — im August vertagt, siehe Browse-Plan.
  Aufgabe 12 deckt den Fall ab, der im Alltag am häufigsten weh tut.
- **Echter Datei-Watcher** (`notify`-Crate) statt Fokus-Scan — erst, wenn der
  Scan spürbar hängt.
- **BPM/Key aus der FLP lesen** — Format proprietär; Aufgabe 10 macht den
  Dateinamen zuverlässig, das ist der billigere Weg zum selben Ziel.
- **Stems-Slot in der Asset-Ampel** — erst, wenn Stems regelmäßig mitverkauft
  werden; sonst ein Häkchen, das immer grau bleibt.
- **Nebenbefund:** `isLoading` im `AudioPlayerContext` hängt, wenn
  `canplaythrough` bei einer kaputten Datei nie kommt. `error`-Handler plus
  Timeout, rund fünf Zeilen.

---

# Studio-Tab, dritter Durchgang (31.08.2026)

Gelesen: `Studio.tsx`, `ProjectsPane`, `ProjectRow`, `ProjectsToolbar`,
`ProjectInspector`, `AssetsPane`, `AssignToProjectDialog`, `studio.rs`,
`audio.rs`, `AudioPlayerContext`.

Reihenfolge der Umsetzung: **B1–B4 → F1 → B5 → Q1 → Q2+Q4+Q5 → Q3 → Rest**.

Alles davon ist am 31.08.2026 umgesetzt — die Haken stehen unten. Neue Tests:
`Q1 — Mehrfachauswahl`, `B5 — Zeilengrenze`, `Q3 — Namenstreffer` in
`studio-flows.test.tsx`, plus `assign_asset_kopiert_von_ausserhalb` in `studio.rs`.

## Bugs

- [x] **B1 — Der Player zeigt einen Dateipfad als ID** · `GlobalAudioPlayer.tsx:82`
  rendert `#{currentBeat.id}`, der Studio-Preview baut `id: "studio:C:\…"`
  (`ProjectsPane.tsx:262`). Ohne `textOverflow` bricht die Playerleiste bei jedem
  Studio-Preview auseinander. ~1 Zeile.
- [x] **B2 — Skip springt in die alte Browse-Queue** · `handlePreview` ruft kein
  `setQueue`; „Weiter" landet bei `queue[0]` der letzten Browse-Liste
  (`AudioPlayerContext.tsx:219`). Deckt F1 mit ab.
- [x] **B3 — Führender Trennpunkt in fast jeder Zeile** · `ProjectRow.tsx:147`:
  `folderLabel` ist `null`, sobald kein Export existiert, aber `MetaItem` setzt
  den Punkt davor → `· Am · 140 BPM · vor 3 Tagen` in ~840 Ideen-Zeilen.
- [x] **B4 — Der Assets-Tab arbeitet mit veralteten Projekten** · `patchProject`
  meldet nichts an `onProjects`; Status und Priorität kommen im
  `AssignToProjectDialog` nie an. Gleiches im Fehler-/Leer-Pfad von `scan()`.
- [x] **B5 — Suche rendert die komplette Liste** · `forcedOpen` klappt alle
  Sektionen auf; ein Buchstabe rendert mehrere hundert Zeilen ohne
  Virtualisierung. Kappen bei 50 pro Sektion + „… N weitere anzeigen".
- [x] **B6 — „60 von 312" ohne Hinweis** · `AssignToProjectDialog.tsx:63`
  schneidet stumm ab; wer sein Projekt nicht findet, hält es für weg.
- [x] **B7 — „Gespeichert" auch wenn es scheiterte** · `setSaveState("saved")`
  läuft synchron nach dem Fire-and-forget-`onPatch`.
- [x] **B8 — Escape im Notizfeld schließt das ganze Panel** · der Document-Handler
  greift; das Umbenennen-Feld stoppt die Weitergabe, das Textarea nicht.
- [x] **Kleinkram** · `top: 64 / bottom: 80` im Inspector sind hart kodiert,
  obwohl `PAGE_HEADER_HEIGHT` exportiert ist; das Backend sortiert in
  `scan_studio_projects_blocking` aufwendig vor, was das Frontend neu sortiert.

## QoL

- [x] **Q1 — Mehrfachauswahl für die Triage** · Shift-Klick wählt einen Bereich,
  die vorhandene Aufräum-Leiste am Fuß wird zur Auswahl-Leiste
  („7 ausgewählt → Kann weg · Priorität · Zurücksetzen"). Keine Checkbox-Spalte.
  ~70 Zeilen, kein Backend.
- [x] **Q2 — Suche findet auch Notizen** · `preStatus` kennt `p.notes` nicht.
- [x] **Q3 — Asset-Vorschlag im Zuweisen-Dialog** · Namensabgleich Dateiname ↔
  `song_name`/`parsed_name`, bester Treffer nach oben. ~25 Zeilen.
- [x] **Q4 — Export-Namen kopieren** (war Aufgabe 10) · macht
  `parse_audio_filename` beim nächsten Export zuverlässig.
- [x] **Q5 — Leerer Zustand führt zu den Einstellungen** · „Kein Produktions-Pfad
  gesetzt" ist heute ein Satz ohne Weg.
- [x] **Q6 — Zahlen am Studio-Tab** (war Aufgabe 16) · Erst der Inbox-Zähler,
  am 31.08. ersetzt: eine Zahl aus Cover + Thumbnail + Video zusammen sagt
  nicht, was zu tun ist. Jetzt „Bereit" (grün) und „Überarbeiten" (orange) aus
  `studio_status_counts` — eine SQL-Zählung auf `studio_projects`, kein
  Ordner-Scan mehr bei jedem Fensterwechsel.
  Nachtrag gleichen Tags: die Zahl stand um 1 zu hoch. `park_archived_projects`
  hängt die Zeile eines geparkten Projekts auf `_ARCHIVIERT` um, statt sie zu
  löschen (Notizen bleiben) — gescannt wird der Ordner nie wieder, gezählt
  wurde er trotzdem. `studio_status_counts` nimmt jetzt die Roots entgegen und
  zählt nur, was auch in der Liste stehen kann (`liegt_in_roots`, mit Test).

## Features

- [x] **F1 — Durchhören statt Anklicken** · `setQueue(visible)` beim Preview:
  Play spielt die gefilterte Liste, Skip geht zum nächsten Projekt. Triage wird
  hören → Stern oder „Kann weg" → Skip. ~15 Zeilen, bester Ertrag im Tab.
- [x] **F2 — Titel-Dopplung beim Umbenennen melden** (war Aufgabe 17) ·
  `check_beat_duplicate` gibt es schon (`archive.rs:203`).
- [x] **F3 — Drag & Drop in den Projekt-Inspector** (war Aufgabe 7) ·
  `assign_asset_to_project` verlangt eine Quelle innerhalb der Inbox — der Guard
  muss beliebige Quellen zulassen.

## Bewusst nicht (dieser Durchgang)

- **Datei-Watcher (`notify`)** statt Fokus-Scan — erst, wenn der Scan hängt.
- **Cover-Heuristik schärfen** (jedes Bild ohne „thumb" = Cover) — bleibt, bis
  ein Screenshot dich fälschlich auf „Bereit" hebt.
- **Assets aus Unterordnern zählen** — sonst zählt jedes Sample-Artwork mit.
- **Virtualisierungs-Lib** — B5 löst dasselbe mit zehn Zeilen.

---

# Studio-Tab, vierter Durchgang — Fehlersuche (31.08.2026)

Alle sechs Funde umgesetzt. Reihenfolge wie besprochen.

- [x] **S1 — Fokus-Scan während Merge/Park löschte Status und Notizen** ·
  `merge_steps_on_disk` lässt die Ordner zwischen Phase 1 und 2 unter einem
  Zwischennamen liegen; ein Scan in diesem Moment hielt sie für gelöscht,
  räumte ihre Zeile weg, und `repath_studio_rows` fand nichts mehr zum
  Umhängen. Jetzt: kein Fokus-Scan, solange der Dialog offen ist.
- [x] **S2 — Parken übersprang Ordner, denen nur FL-Autosaves fehlten** ·
  Das Backend prüfte `missing`, die ganze Oberfläche `missing_important`.
  Getroffen war jedes Projekt, das nach dem Archivieren nochmal in FL offen
  war. Regel steckt jetzt in `park_skip_reason`, mit Test.
- [x] **S3 — optimistische Updates auf veralteter Liste** · vier Stellen bauten
  die neue Liste aus der Render-Closure; ein dazwischen gelandeter Scan wurde
  dadurch überschrieben. Alles auf `setProjects(prev => …)`, und `onProjects`
  läuft einmal zentral über einen Effekt statt an jeder Mutation.
- [x] **S4 — Parkordner konnte im Produktions-Root landen** ·
  `parseProductionPaths` schneidet den Schlussstrich ab (aus der Adressleiste
  kopierte Pfade), und `park_blocking` prüft jetzt auch den Elternordner —
  der ist bei einem Projekt immer der Root.
- [x] **S5 — die Auswahl zählte Gespenster** · weggeräumte Projekte fallen aus
  der Auswahl; Shift-Klick ohne sichtbaren Anker beginnt eine neue Spanne,
  statt die Auswahl wegzuwerfen. Zwei Tests.
- [x] **S6 — Rust-Texte steuern die Farben im Merge-Dialog** · Test nagelt
  „archiviert", „keine FLP" und den Rest fest.

Nicht testbar gemacht: S3. Die Race lässt sich in einem Komponententest nur
künstlich nachstellen — funktionale Updates können strukturell nicht mehr auf
veralteten Daten sitzen, das ist die Garantie, kein Test.
