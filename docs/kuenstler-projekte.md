# Künstler-Projekte (Mix & Master) — Plan

Stand 06.10.2026. Noch nichts gebaut, für einen anderen Tag vorgemerkt.
Jede Scheibe einzeln bauen und ansehen. Ergänzungen und Klärungen sind
ausdrücklich erwünscht — Plan wächst mit.

**Entschieden:** Wurzelordner heißt `05_ARTISTS`.
**Geklärt am 18.10.2026:** alle Fragen unten beantwortet (siehe „Antworten").

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

## Antworten (18.10.2026)

1. **Korrekturrunden** → nur **eine Notiz pro Song**, keine Versionsverfolgung.
   Versionen erkennt man an den Dateinamen.
2. **Abgabe** → **ja, mit Namensschema**: Knopf „Abgeben" benennt die Datei
   (`<Künstler> - <Song> (Master).wav`), merkt Datum und Art (Mix/Master).
3. **Mein Beat** → **nur im Song** vermerken, welcher Beat es ist. Im Archiv
   ändert sich nichts.
4. **Beat-Daten** → BPM/Key des Beats im Song sehen (ohne Frage, klar).
5. **Stems** → **je nachdem**: Stereo-WAV kopieren *oder* Stems — beides
   anbieten (Stems kommen aus der FLP, BeatOS öffnet sie dafür in FL).
6. **Geld** → **nein**, kein Preis, kein „bezahlt".
7. **Fertige Songs** → wandern nach `05_ARTISTS/<Künstler>/_Fertig/`.
8. **Altbestand** → **umziehen**: BeatOS zeigt vorher, was wohin wandert,
   verschoben wird erst nach Bestätigung.
9. **Discord-Downloads** → **vorschlagen**: neue Downloads mit passendem
   Song anzeigen, ein Klick verschiebt sie in den `Eingang/`.

**Befund Scheibe 0 (18.10.2026):** `JarnoGm - Library` und `Yoghi` stehen
**nicht** als Schein-Beats im Katalog — der Archiv-Scan muss nicht repariert
werden.

## Scheiben

- [x] **0 — Prüfen**: keine Schein-Beats im Katalog (18.10.2026).
- [x] **1 — Künstler-Ordner + Ansicht** (nur lesen; erledigt 18.10.2026, e84e705): Einstellung
      `05_ARTISTS`, Studio-Tab „Künstler": pro Künstler die Songs, je Zeile
      Häkchen Vocals/Demo/Beat/FLP/Mix/Master + erste Notizzeile.
- [ ] **2 — Anlegen**: „Neuer Künstler" und „Neuer Song" (Ordner + `Eingang/`
      + leere FLP wie `create_project_folder`).
- [ ] **3 — Notiz + Status** im Detailpanel (wiederverwendet `studio_projects`):
      eine Notiz pro Song, Status „Warte auf Künstler" / „In Arbeit".
- [ ] **4 — Dateien reinziehen + Downloads vorschlagen**: Vocals/Demo/Beat
      auf den Song ziehen → `Eingang/`. Dazu der Downloads-Ordner: neue
      Dateien mit passendem Song (Namensregel „X Vocals" → Song X) werden
      vorgeschlagen, ein Klick verschiebt sie.
- [ ] **5 — Mein Beat**: Beat aus dem Katalog suchen, im Song vermerken (BPM/Key
      sichtbar), ungetaggte WAV in den Eingang kopieren — oder für Stems die
      FLP des Beats in FL öffnen.
- [x] **6 — Altbestand umziehen** (Dialog fertig 18.10.2026, f634371 — Ausführen macht Stephan selbst) (`JarnoGm - Library`, `Yoghi`).
- [ ] **7 — Abgabe**: Knopf „Abgeben" (Mix oder Master) benennt die Datei nach
      `<Künstler> - <Song> (Master).wav`, merkt Datum; Song wandert nach
      `<Künstler>/_Fertig/`.
