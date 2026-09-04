# Beat benennen — Name, Tonart und BPM in Ordner und Dateien

Stand 30.08.2026, Branch `refactor/dashboard`. Geplant, **noch nicht umgesetzt**.

Ziel: Ein Knopf im Studio-Sidepanel setzt Beatname, Tonart und BPM. Der
Projektordner und jede MP3, WAV und FLP darin ziehen mit.

```
Ordner   Project_0796            →  Project_0796 - BEATNAME [Cm 140]
Dateien  bounce.mp3              →  BEATNAME [Cm 140].mp3
         mix_untagged.wav        →  BEATNAME [Cm 140]_untagged.wav
         Project_797.flp         →  BEATNAME [Cm 140].flp
         Project_0796.flp        →  BEATNAME [Cm 140]_2.flp
```

---

## Die Entscheidung, die den Zuschnitt bestimmt: der Dateiname ist der Speicher

Naheliegend wäre gewesen, Tonart und BPM als Spalten in `studio_projects`
abzulegen. Braucht es nicht:

`scan_project_dir` liest Key/BPM schon aus dem **Ordnernamen** und nimmt ihn vor
dem Export-Dateinamen (`src-tauri/src/commands/studio.rs`, `folder_key.or(song_key)`).
Schreibt das Umbenennen `[Cm 140]` in den Ordnernamen, liest der nächste Scan es
von dort zurück.

Folgen:

- keine neuen Spalten, keine Migration, kein Abgleich zwischen DB und Dateisystem
- was im Explorer steht, ist das, was die App zeigt
- „Tonart/BPM ändern" ist kein eigenes Feature, sondern zwei Felder im
  Umbenennen-Dialog — sie sind genau das, was in den Namen wandert
- ein Projekt ohne Export bekommt trotzdem seine Tonart: der Ordner heißt danach
  `Project_0796 - BEATNAME [Cm 140]`, Liste und Panel zeigen Cm/140, ohne dass je
  eine MP3 existiert hat

Das ist dieselbe Linie wie beim Status-System: eine Quelle, aus der abgeleitet
wird, statt zwei, die man synchron halten muss.

---

## Namensregeln

### Ordner — `{ID} - {NAME} [{Key} {BPM}]`

Die ID kommt aus dem aktuellen Ordnernamen über `parse_project_id`
(`studio.rs`), das jede Schreibweise im Bestand kennt: `Project_0796`,
`#Project_75`, `[701] Titel`, `0857`. Sie wird auf `Project_{:04}` normalisiert —
dieselbe Form, die das Zusammenführen erzeugt.

Ordner ohne Nummer („MEMORIES") bekommen keine: `BEATNAME [Cm 140]`.

Klammerteil genau wie im Archiv (`archive.rs`, `build_archive_folder_name`):
`[Cm 140]`, `[Cm]`, `[140]` oder gar nichts.

### Dateien — `{NAME} [{Key} {BPM}].{ext}`

Ohne Projektnummer.

**Mehrere Dateien derselben Sorte:** nach Änderungsdatum, neueste bekommt den
sauberen Namen, ältere `_2`, `_3` über das vorhandene `unique_dest`
(`utils/files.rs`).

> ⚠️ **Offene Frage, vor der Umsetzung zu klären:** Sollen ältere FLP-Versionen
> stattdessen ihren jetzigen Namen behalten und gar nicht angefasst werden?
> Beide Varianten sind vertretbar — `_2` macht die Zusammengehörigkeit sichtbar,
> Nichtanfassen erhält die Herkunft („welche Version war das nochmal?").

**Rollen-Suffixe bleiben erhalten.** `X_untagged.wav` wird
`BEATNAME [Cm 140]_untagged.wav`. Der Marker steuert die Sortierung im
Neuer-Beat-Tab (`create.rs`, `is_untagged`) — ihn wegzuwerfen wäre ein stiller
Rückschritt. Die Liste (`untagged`, `tagged`, `unmastered`, `master`, `final`)
steht schon in `parse_audio_filename` und wird als `pub const` herausgezogen.

**FLPs in Unterordnern** (`01_SAVEFILES`, `03_PROJECTS`) werden an Ort und Stelle
umbenannt, nicht verschoben — `flp_search_dirs` liefert die Ordner.

---

## Backend — zwei Kommandos, wie überall in dieser Datei

### `plan_project_rename(path, name?, key?, bpm?)` → `ProjectRenamePlan`

```rust
struct ProjectRenamePlan {
    suggested_name: String,   // sauberer Beatname: ohne ID, ohne Klammern
    key: Option<String>,      // was gerade gilt (Ordner, sonst Export)
    bpm: Option<i32>,
    folder_from: String,
    folder_to: String,
    files: Vec<RenameOp>,     // from, to, kind, status: rename | noop | collision
    warnings: Vec<String>,
}
```

Beim Öffnen des Dialogs einmal ohne Argumente aufgerufen — dann liefert er die
Vorbelegung. Danach beim Tippen entprellt (300 ms) erneut. Rein lesend.

### `apply_project_rename(path, name, key, bpm)` → neuer Pfad

Plant intern **neu** (wie `apply_filename_convention` in `upload/rename.rs`) —
Vorschau und Ausführung können nicht auseinanderlaufen. Dann:

1. Dateien in **zwei Phasen** umbenennen: erst alle auf temporäre Namen, dann auf
   die Ziele. Verfahren aus `apply_production_merge` (`studio.rs`). Ohne das
   streiten sich zwei Dateien um denselben Namen, wenn `a.mp3` nach `X.mp3` soll
   und `X.mp3` schon als andere Datei existiert.
2. Ordner umbenennen — **zuletzt**, damit ein Fehlschlag hier die schon
   umbenannten Dateien nicht unauffindbar macht.
3. `studio_projects.path` nachziehen. Ohne das räumt der nächste Scan die Zeile
   als verwaist weg: Status, Priorität und Notizen wären verloren.

Validierung: `is_valid_key` (`utils/files.rs`), BPM 40–300 wie im Parser.
Ungültiges wird abgelehnt, nicht stillschweigend weggelassen.

### Was wegfällt

`rename_project_folder` hat genau einen Aufrufer (`ProjectsPane.tsx`,
`handleRename`) und benennt nur den Ordner plus gleichnamige FLPs um — das neue
Kommando kann alles davon. Entfernen.

`rename_matching_flps` **bleibt**: das Zusammenführen benutzt es.

---

## UI — der Stift, den es schon gibt

Im Panel-Kopf sitzt bereits `📁 Project_0796 ✎`. Der öffnet künftig statt des
Ordner-Feldes den Dialog. Kein neuer Knopf, keine neue Stelle zum Suchen.

Fehlt Tonart oder BPM, steht in der Meta-Zeile zusätzlich ein leiser Anker
`Tonart & BPM setzen`, der denselben Dialog öffnet — sonst gibt es bei einem
Projekt ohne beides gar nichts zum Anklicken.

Dialog über die `Modal`-Hülle (`components/ui/Modal.tsx`):

```
┌─ Beat benennen ─────────────────────────────────────┐
│                                                      │
│  Name     [ BEATNAME                              ]  │
│  Tonart   [ Cm    ]      BPM   [ 140 ]               │
│                                                      │
│  ORDNER                                              │
│  Project_0796  →  Project_0796 - BEATNAME [Cm 140]   │
│                                                      │
│  DATEIEN (3)                                         │
│  Project_797.flp    →  BEATNAME [Cm 140].flp         │
│  Project_0796.flp   →  BEATNAME [Cm 140]_2.flp       │
│  bounce.mp3         →  BEATNAME [Cm 140].mp3         │
│                                                      │
│  ⚠ FL Studio darf das Projekt nicht offen haben.     │
│                                                      │
│              [ Abbrechen ]    [ Umbenennen ]         │
└──────────────────────────────────────────────────────┘
```

Die Vorschau ist der Punkt: ohne sie erfährt man erst hinterher, dass aus der
zweiten FLP ein `_2` geworden ist — und ein Zurück gibt es nicht.

„Umbenennen" ist gesperrt, solange das Namensfeld leer ist. Damit entfällt der
Sonderfall „kein Name" komplett.

Copy-Regel wie im Rest des Panels: GROSSBUCHSTABEN für Abschnitte (ORDNER,
DATEIEN), Satzschreibung für Felder und Knöpfe.

---

## Was nicht umbenannt wird

**Cover, Thumbnail und Video.** Sie tragen Marker (`_thumbnail`), an denen die
Status-Automatik erkennt, was da ist (`scan_project_dir`). Die anzufassen wäre
ein zweites Risiko ohne Auftrag. Beim Archivieren benennt
`apply_filename_convention` sie ohnehin nach Konvention um.

---

## Gefahren

1. **FL Studio darf das Projekt nicht offen haben.** Windows sperrt die geöffnete
   FLP, `fs::rename` scheitert. Vorher prüfbar ist das nicht — der Dialog warnt,
   fehlgeschlagene Dateien werden einzeln gemeldet statt still übersprungen.

2. **FLPs merken sich Sample-Pfade.** Liegt ein Sample im Projektordner und die
   FLP verweist absolut darauf, bricht der Ordner-Umzug diesen Verweis. Das
   Risiko besteht schon heute beim vorhandenen Umbenennen und beim
   Zusammenführen — neu ist es nicht.

3. **Kein Rückgängig.** Das Zusammenführen schreibt ein Protokoll und kann
   rückwärts laufen; für ≤10 Dateien in einem Ordner mit Vorschau davor ist das
   nicht gebaut. Die Maschinerie liegt da (`undo_production_merge`), falls es
   doch gebraucht wird.

---

## Prüfungen

Rust, in `mod tests` von `studio.rs`:

- [ ] `build_project_folder_name`: mit/ohne ID, alle vier Klammer-Fälle, und
      **zweimal angewendet ergibt dasselbe** — sonst wächst der Ordnername bei
      jedem Durchlauf
- [ ] `plan`: zwei FLPs → sauber + `_2`; `_untagged` überlebt; ein Ziel, das
      schon als fremde Datei existiert, wird `collision` statt Überschreiben
- [ ] `suggested_name`: aus `Project_0796 - BEATNAME [Cm 140]` kommt `BEATNAME`
      zurück, nicht der ganze Ordnername. Das ist der Fehler, der die Nummer
      sonst bei jedem Öffnen erneut voranstellt

Frontend (`studio-flows.test.tsx`):

- [ ] Dialog zeigt die Vorschau und ruft `apply_project_rename` mit Name, Key
      und BPM auf

---

## Reihenfolge

1. [ ] Namensbau + `suggested_name` + Tests (reine Funktionen, kein Dateisystem)
2. [ ] `plan_project_rename` + Tests auf einem Temp-Ordner
3. [ ] `apply_project_rename` (zwei Phasen, DB-Pfad) + Test
4. [ ] Dialog, Stift umhängen, `rename_project_folder` entfernen

Nach Schritt 3 lässt sich das an einem Wegwerf-Ordner vorführen, bevor der Knopf
in der App landet.

---

## Vorgeschichte

Umgesetzt am 30.08.2026, direkt davor und Grundlage für die Ableitungs-Logik oben:

- Status-Automatik im Studio: `idea` → `exported` (MP3+WAV) → `ready` (dazu
  Cover, Thumbnail, Video), abgeleitet in `derive_stage`. `wip` („Überarbeiten")
  und `discard` („Kann weg") sind von Hand vergeben und werden vom Scan nie
  überschrieben (`resolve_status`).
- Aufräum-Leiste im Studio: alle „Kann weg"-Ordner in den Papierkorb, danach
  Angebot, die Projektnummern über den Zusammenführen-Dialog lückenlos
  nachrücken zu lassen.
- Sidepanel neu geordnet: Status → Bilder & Video → FLP-Versionen → Notizen,
  440 px breit, Asset-Ampel und verschachtelte Karte entfernt.
