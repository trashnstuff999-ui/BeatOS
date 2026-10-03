# Studio-Redesign (Oktober 2026)

Ziel: im Studio nichts mehr suchen müssen. Jede Scheibe einzeln bauen und
ansehen, erst dann die nächste.

## Befund (Screenshot 03.10.2026, 2560 px breit)

1. Liste ~1160 px breit mittig — links/rechts je ~700 px leer, untere Hälfte leer.
2. Zeilen-Aktionen nur beim Drüberfahren (In FL, Exportname, Ordner, Papierkorb;
   Archivieren nur bei „Bereit"). Zwei Kopf-Symbole ohne Text
   (Zusammenführen, Neu aus FLP).
3. Filter-Chips, MP3/WAV/COV/THU/VID-Spalte, Status-Pille winzig und grau auf grau.
4. Zahlen widersprechen sich: Chip „Idee (805)" vs. Gruppe „IDEE 18"
   (+ „Lange inaktiv 780"). Sidebar-„41" ohne Erklärung.
5. Namenlose Projekte („Project_0861") ohne jeden Anhaltspunkt.
6. Arbeitsliste (~30) und Aufräumen (~800) in einer Liste.

### Detailpanel (`ProjectInspector.tsx`)

7. Schwebende 440-px-Schublade über der Liste statt fester Spalte.
8. Fuß hat nur „Ordner" + „Archivieren". In FL nur über die FLP-Liste,
   Exportname/Papierkorb gar nicht.

### Asset-Fehler (`BeatAssetsCard.tsx`, `assign_asset_to_project`)

9. **Ersetzen ersetzt nicht.** „Ersetzen" öffnet nur den Picker; die neue Datei
   kommt dazu (`unique_dest` → `_2`), die alte bleibt im Ordner und nichts geht
   zurück in den Asset-Ordner. Erkannt wird weiter die alte, weil
   `find_asset_slots` das erste passende Bild nimmt.
10. **Video ohne Bild.** Der Video-Slot bekommt fest `preview={null}` — nur ein Symbol.
11. **Cover/Thumbnail füllen nicht.** `objectFit: "contain"` → Ränder bzw.
    Balken; das Cover-Feld streckt sich auf Zellenhöhe statt 1:1.

## Scheiben

- [x] **1 — Asset-Ersetzen reparieren** (Backend): beim Zuweisen in einen
      belegten Slot die alte Datei zurück in den Asset-Ordner schieben.
      Erkennung bleibt eindeutig, nichts geht verloren.
- [x] **2 — Asset-Anzeige**: Cover 1:1 und Thumbnail 16:9 randlos
      (`cover`), Video mit Vorschaubild (erstes Frame per `<video>`).
- [x] **3 — Detailpanel als feste rechte Spalte** mit beschrifteten Aktionen:
      In FL öffnen, Archivieren, Exportname kopieren, Ordner, Papierkorb.
      Nichts mehr nur beim Drüberfahren.
- [x] **4 — Kopfzeile mit Text**: Neues Projekt · Aus FLP · Ordner archivieren.
- [x] **5 — Arbeiten / Aufräumen trennen**: Lange inaktiv, Kann weg,
      Zusammenführen, Papierkorb in eigenen Bereich.
- [x] **6 — Lesbarkeit + eine Zählweise** für Chips, Gruppen und Sidebar.
- [x] **7 — Namenlose Projekte**: erste Notizzeile als Untertitel.
- [x] **8 — Assets-Tab**: Kacheln im 16:9-Format statt quadratisch (grauer
      Streifen über/unter jedem Bild), Raster über die volle Breite.
