# Künstler-Projekte (Mix & Master) — Plan

Stand 06.10.2026. Noch nichts gebaut, für einen anderen Tag vorgemerkt.
Jede Scheibe einzeln bauen und ansehen. Ergänzungen und Klärungen sind
ausdrücklich erwünscht — Plan wächst mit.

**Entschieden:** Wurzelordner heißt `05_ARTISTS`.
**Offen:** Antworten auf „Was wir noch vergessen könnten" 1–9 — beim
nächsten Mal zuerst abfragen, dann mit Scheibe 0 starten.

## So läuft es heute (Stephans Worte)

- Über Discord kommen vom Künstler (z.B. JarnoGm):
  - **Vocals**: Songname + „Vocals" im Dateinamen → `Heartbreak Highlights Vocals`
  - **Demo**: Beat + Vocals zusammen, nur der Songname → `Heartbreak Highlights`
  - manchmal ein **fremder Beat**
- Ist es mein Beat, muss ich ihn erst suchen und in FL ziehen.
- Gemischt wird in FL Studio, eine FLP pro Song.
- Ziel: alles sauber in Ordnern, sehen was noch offen ist und was fehlt
  (WAVs?), Notizen, woran ich weiterarbeiten muss.

## Befund im Code

- **Nicht in `03_ARCHIVE` ablegen.** Der Archiv-Scan (`archive.rs`) liest dort
  stur `Jahr/Monat/Beat`. Ein `ARTISTS/JarnoGm/Song` würde als Jahr „ARTISTS",
  Monat „JarnoGm", Beat „Song" gelesen. `JarnoGm - Library` und `Yoghi` liegen
  heute schon dort → prüfen, ob sie bereits als Schein-Beats im Katalog stehen.
- **Auch nicht in `01_ACTIVE_PRODUCTION`.** Der Studio-Scan sucht FLPs eine
  Ebene tief, ein Künstlerordner würde als *ein* Projekt erkannt.
- → Eigener Wurzelordner `05_ARTISTS` (entschieden), als eigene Einstellung.
- `studio_projects` (Notizen, Priorität, Status) hängt am Ordnerpfad → für
  Künstler-Songs wiederverwendbar, keine neue Tabelle nötig.

## Ordner-Layout (Vorschlag)

```
05_ARTISTS/
  JarnoGm/
    Heartbreak Highlights/
      Heartbreak Highlights.flp        ← FLP im Root, wie im Studio
      Heartbreak Highlights - Mix v1.wav
      Heartbreak Highlights - Master.wav
      Eingang/                         ← alles, was der Künstler schickt
        Heartbreak Highlights Vocals.wav
        Heartbreak Highlights.mp3      (Demo)
        LEFT ALONE [F#m 135].wav       (Beat)
      Backup/                          ← FL, wird ignoriert
```

Status ergibt sich aus den Dateien:
Vocals · Demo · Beat · FLP · Mix · Master. Fehlt etwas, sieht man es.
Von Hand dazu: „Warte auf Künstler", „Abgegeben".

## Was wir noch vergessen könnten

1. **Korrekturrunden**: Mix v1 → Feedback → v2. Feedback pro Version notieren?
2. **Abgabe**: welche Datei wann rausging, festes Namensschema
   (`JarnoGm - Heartbreak Highlights (Master).wav`).
3. **Mein Beat beim Künstler**: im Katalog vermerken, dass der Beat an Jarno
   ging (nicht nochmal verkaufen/hochladen?). Song ↔ Beat verknüpfen.
4. **Beat-Daten**: BPM/Key des Beats direkt im Song-Projekt sehen (für FL).
5. **Stems vs. Stereo**: wird der Beat als WAV oder in Spuren gebraucht?
6. **Geld**: Preis / bezahlt — nur falls gewünscht.
7. **Fertige Songs**: bleiben im Künstlerordner, nur Status „Abgegeben" —
   oder Unterordner `_Fertig`?
8. **Altbestand**: `JarnoGm - Library` und `Yoghi` aus `03_ARCHIVE` umziehen.
9. **Discord-Downloads**: landen im Downloads-Ordner → BeatOS sortiert sie per
   Namensregel (`X Vocals` → Song X) in den richtigen Eingang.

## Scheiben

- [ ] **0 — Prüfen**: Stehen `JarnoGm - Library`/`Yoghi` als Schein-Beats im
      Katalog? Wenn ja, Archiv-Scan reparieren.
- [ ] **1 — Künstler-Ordner + Ansicht** (nur lesen): Einstellung
      `05_ARTISTS`, Studio-Tab „Künstler": pro Künstler die Songs, je Zeile
      Häkchen Vocals/Demo/Beat/FLP/Mix/Master + erste Notizzeile.
- [ ] **2 — Anlegen**: „Neuer Künstler" und „Neuer Song" (Ordner + `Eingang/`
      + leere FLP wie `create_project_folder`).
- [ ] **3 — Notizen + Status** im Detailpanel (wiederverwendet `studio_projects`).
- [ ] **4 — Dateien reinziehen**: Vocals/Demo/Beat auf den Song ziehen → landen
      im `Eingang/`, Song wird per Namensregel erkannt.
- [ ] **5 — Mein Beat**: Beat aus dem Katalog suchen, WAV in den Eingang
      kopieren, Verknüpfung merken.
- [ ] **6 — Altbestand umziehen** (`JarnoGm - Library`, `Yoghi`).
- [ ] **7 — Versionen/Abgabe** (je nach Antwort zu Punkt 1–2 oben).
