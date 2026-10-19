# Studio neu — Werkbank statt Register (ab 19.10.2026)

Mockup (abgesegnet: „ja, bitte so umsetzen"): https://claude.ai/artifact/Bzaxwpz8CsUErVYkpAk9b4

Problem: die Projektliste wirkt wie ein Register (fünf Datei-Spalten, Status-
Pillen, Sektionsköpfe), muss aber ~890 Projekte tragen. Lösung: die ~30, an
denen gearbeitet wird, als Cover-Regale; die vielen Ideen als ruhige Liste.

Scheiben, jede einzeln ansehen lassen:

- [x] 1. **Werkbank**: Satz oben („2 Beats sind bereit fürs Archiv.") + Regale
      Bereit / Exportiert / Überarbeiten (+ „Priorität" nur für Ideen mit Stern),
      Cover-Kacheln mit 5-Strich-Balken und „fehlt: …". Stern bleibt im Regal
      (vorn, mit Marke). Scan liefert dafür `cover_path`.
      Dateien: components/studio/Werkbank.tsx, lib/werkbank.ts
- [x] 2. **Ideen-Liste**: nach Monat gruppiert, ruhige Zeile (Play, Nummer,
      Titel oder Notiz, Tonart/BPM, Alter) — ohne Datei-Spalten und Status-Pille.
      Sortierung Neueste / Älteste / A–Z.
- [x] 3. **Kopf**: Suche groß rechts neben dem Umschalter, „Neues Projekt" als
      Hauptknopf; Status-Chips entfallen (die Regale sind die Einteilung).
- [x] 4. **Detailpanel**: großes Cover, „Weg zum Upload" als Checkliste mit
      „Aus Assets" bei fehlenden Dateien.
- [ ] 5. **Aufräumen**: Satz oben, nach Jahr gruppiert, pro Zeile Behalten /
      Kann weg, Leiste unten „N vorgemerkt → In den Papierkorb".
