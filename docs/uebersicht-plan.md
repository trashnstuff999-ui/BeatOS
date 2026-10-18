# Übersicht neu — „Was steht an?" statt Zahlenwand

Gewünscht am 18.10.2026. Die Übersicht ist der Starttab, zeigt aber fast nur
Zahlen, die man nicht anfassen kann (25 fertig ohne Termin — welche?). Ziel:
beim Öffnen sehen, was zu tun ist. Statistik und später Analyse bekommen
eigene Unter-Tabs, wie im Studio (Projekte · Aufräumen · Assets · Künstler).

## Aufbau

Kopf mit `Segmented`: **Heute** · **Statistik** · (später) **Analyse**.

### Heute (Start)

1. **Diese Woche** — Leiste Mo–So. Upload-Tage aus dem Rhythmus
   (`upload_days`, Einstellung aus der Planungs-Leiste) sind markiert, darauf
   Cover der eingeplanten Beats, leere Upload-Tage gestrichelt.
   Darüber eine Zeile: „Noch 2 Upload-Tage ohne Beat" — das ist die Zahl
   „wie viele Beats müssen diese Woche noch fertig".
   Daten: `api.upload.getSchedule(von, bis)` + `parseRhythmus` — beides da.
2. **Als Nächstes hochladen** — ein Beat, groß: Cover, Name, was fehlt
   (Infos/Audio/Cover als Chips), Knöpfe „Zum Upload" und
   „Auf <nächsten freien Upload-Tag> planen". Quelle: `get_upload_queue`.
3. **In den Startlöchern** — die übrigen Beats aus derselben Warteschlange,
   je Zeile „fehlt: …" oder „bereit". Klick öffnet den Beat im Upload-Tab.
   Darunter Studio-Projekte mit Status „Exportiert"/„Bereit" — der Schritt
   davor (noch nicht archiviert).
4. **Künstler** (optional) — Songs, die noch nicht abgegeben sind.

Weg: die Pipeline-Zeile (Studio 1001 · Archiv 223 …), „Zuletzt hinzugefügt"
und die doppelten Zahlen aus „Was ansteht".

### Statistik

Die heutigen Karten, aufgeräumt: Status-Verteilung, Tonarten, Beats pro
Monat, Top-Tags (mit Anzahl), Upload-Rhythmus über ein Jahr statt 8 Wochen,
Pipeline-Zahlen. Keine Zahl zweimal.

### Analyse (später, eigene Planung)

Aus `TODO.md`: Aufrufe pro Beat über yt-dlp, welche Type-Beat-Artists/
Genres/BPM/Wochentage ziehen. Voraussetzung: Uploads nacherfasst.

## Weitere Ideen

- **Liegengeblieben** — Studio-Projekte „In Arbeit", seit 30+ Tagen nicht
  angefasst.
- **Diese Woche geschafft** — X archiviert, Y hochgeladen (Gegenstück zur
  Wochenleiste).
- **Serie in Gefahr** — „Serie reißt Sonntag, diese Woche noch nichts
  hochgeladen".
- **Fertig, aber alt** — wie lange ein Beat schon fertig ohne Termin liegt.

## Scheiben

1. Unter-Tabs Heute/Statistik; alter Inhalt zieht unverändert nach Statistik.
2. Diese Woche (Leiste + „noch N Upload-Tage frei").
3. Als Nächstes hochladen.
4. In den Startlöchern (+ Studio-Projekte davor).
5. Statistik aufräumen.
6. Analyse — eigener Plan.

## Entschieden (18.10.2026)

1. Wochenziel kommt aus dem Upload-Rhythmus: Upload-Tage der Woche minus
   eingeplante Beats. Keine eigene Zahl.
2. „Als Nächstes": wem am wenigsten fehlt, bei Gleichstand der älteste.
3. Künstler-Songs offen: ja, auf „Heute".
4. Alle vier Ideen: Liegengeblieben, Diese Woche geschafft, Serie in Gefahr,
   Künstler.
5. „Zuletzt hinzugefügt" fällt ersatzlos weg.

## Stand 18.10.2026

- [x] Unter-Tabs Heute/Statistik
- [x] Heute: Aussage, Woche, Als Nächstes, Startlöcher, drei Listen (`components/dashboard/Heute.tsx`)
- [x] Statistik als Jahresbericht (`components/dashboard/Statistik.tsx`, `get_stats_details`):
      Kennzahlen-Zeile, Upload-Jahr, Quintenzirkel, Tempo, Weg der Beats (Studio + Archiv),
      Upload-Wochentage, Vom Archiv zum Upload, Archiv-Wachstum, Neue Beats, Tags
- Studio-Bestand pro Jahr geht nicht: `studio_projects` hat kein echtes Anlegedatum.
- [ ] Analyse — eigener Plan
