// src/components/browse/MigrateArchiveDialog.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Zwei Läufe über den Bestand, getrennt bedienbar:
//
//   "struktur" — alte Ordnerstruktur flachziehen. Einmalige Sache, betrifft nur
//                den Altbestand, dauert und bewegt viel.
//   "namen"    — Ordner- und Dateinamen auf das Schema der Datenbank ziehen.
//                Läuft im Alltag: Cover aus Photoshop in den Beat-Ordner
//                gezogen, Name ist generisch, ein Klick richtet ihn.
//
// Getrennt, weil die Anlässe getrennt sind. Wer ein Thumbnail nachlegt, will
// nicht 172 Ordner umbauen.
//
// Die Reihenfolge bleibt trotzdem zwingend, wenn BEIDES ansteht:
// `build_rename_plan` schaut in den Beat-Root und in `01_SAVEFILES` — Dateien
// in Legacy-Unterordnern sieht es nicht. Erst flachziehen, dann umbenennen.
// Darauf weist der Struktur-Lauf am Ende hin.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { FolderSymlink, Type, AlertTriangle, Check } from "lucide-react";
import { api } from "../../lib/api";
import { C, radius, alpha } from "../../lib/theme";
import { Modal, Button } from "../ui";
import type { StructureMigration, FolderSync } from "../../types/upload";

export type AngleichModus = "struktur" | "namen";

type Phase = "pruefen" | "vorschau" | "laeuft" | "fertig";

const TEXTE = {
  struktur: {
    titel:     "Struktur migrieren",
    unter:     "Alte Ordnerstruktur flachziehen",
    icon:      FolderSymlink,
    knopf:     "Migrieren",
  },
  namen: {
    titel:     "Namen angleichen",
    unter:     "Ordner- und Dateinamen auf das Schema ziehen",
    icon:      Type,
    knopf:     "Umbenennen",
  },
} as const;

export function MigrateArchiveDialog({ modus, onClose, onDone }: {
  modus: AngleichModus;
  onClose: () => void;
  /** Läuft nach einem erfolgreichen Lauf — das Archiv muss neu laden. */
  onDone: () => void;
}) {
  const t = TEXTE[modus];
  const [phase, setPhase]       = useState<Phase>("pruefen");
  const [struktur, setStruktur] = useState<StructureMigration[]>([]);
  const [namen, setNamen]       = useState<FolderSync[]>([]);
  const [ergebnis, setErgebnis] = useState<string[] | null>(null);
  const [fehler, setFehler]     = useState<string | null>(null);

  // ── Trockenlauf beim Öffnen ──────────────────────────────────────────────
  useEffect(() => {
    let abgebrochen = false;
    (async () => {
      try {
        if (modus === "struktur") {
          const s = await api.upload.migrateStructures([], true);
          if (!abgebrochen) setStruktur(s.filter(x => x.is_legacy || x.error));
        } else {
          const n = await api.archive.syncFolders([], true);
          if (!abgebrochen) setNamen(n.filter(x => x.to !== x.from || x.files_renamed > 0 || x.error));
        }
        if (!abgebrochen) setPhase("vorschau");
      } catch (e) {
        if (!abgebrochen) { setFehler(String(e)); setPhase("vorschau"); }
      }
    })();
    return () => { abgebrochen = true; };
  }, [modus]);

  // ── Struktur: was geht durch, was stolpert ───────────────────────────────
  const umzubauen = struktur.filter(s =>
    s.is_legacy && !s.error && s.collisions.length === 0 && !s.savefiles_conflict);
  const stolpert  = struktur.filter(s =>
    s.error || s.collisions.length > 0 || s.savefiles_conflict);
  const eintraege = umzubauen.reduce((n, s) => n + s.files, 0);

  // ── Namen: Ordner und Dateien getrennt zählen ────────────────────────────
  const ordnerNeu  = namen.filter(n => n.to !== n.from && !n.error).length;
  const dateienNeu = namen.reduce((n, s) => n + s.files_renamed, 0);
  const namenFehler = namen.filter(n => n.error);

  const nichtsZuTun = modus === "struktur"
    ? umzubauen.length === 0
    : ordnerNeu + dateienNeu === 0;

  const anwenden = async () => {
    setPhase("laeuft");
    setFehler(null);
    try {
      if (modus === "struktur") {
        const m = await api.upload.migrateStructures(umzubauen.map(s => s.beat_id), false);
        setErgebnis([
          `${m.filter(x => !x.error && x.files > 0).length} Ordner umgebaut`,
          `${m.reduce((s, x) => s + x.files, 0)} Einträge in den Beat-Ordner gezogen`,
          `${m.reduce((s, x) => s + x.moved_to_old, 0)} ältere Exporte nach 02_OLD/`,
          ...m.filter(x => x.error).map(x => `Fehler ${x.beat_id}: ${x.error}`),
        ]);
      } else {
        const n = await api.archive.syncFolders(namen.filter(x => !x.error).map(x => x.beat_id), false);
        setErgebnis([
          `${n.filter(x => x.to !== x.from && !x.error).length} Ordner umbenannt`,
          `${n.reduce((s, x) => s + x.files_renamed, 0)} Dateien umbenannt`,
          ...n.filter(x => x.error).map(x => `Fehler ${x.beat_id}: ${x.error}`),
        ]);
      }
      setPhase("fertig");
      onDone();
    } catch (e) {
      setFehler(String(e));
      setPhase("vorschau");
    }
  };

  return (
    <Modal
      title={t.titel}
      subtitle={t.unter}
      icon={t.icon}
      width={620}
      onClose={onClose}
      closeOnBackdrop={phase !== "laeuft"}
      footer={
        phase === "fertig" ? (
          <Button variant="primary" size="sm" onClick={onClose}>Schließen</Button>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={onClose} disabled={phase === "laeuft"}>
              Abbrechen
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={anwenden}
              loading={phase === "laeuft" || phase === "pruefen"}
              disabled={phase !== "vorschau" || nichtsZuTun}
            >
              {phase === "laeuft" ? "Läuft …" : t.knopf}
            </Button>
          </>
        )
      }
    >
      {fehler && <Hinweis ton="fehler">{fehler}</Hinweis>}

      {phase === "pruefen" && (
        <p style={{ fontSize: 13, color: C.onSurfaceVariant, margin: 0 }}>
          Archiv wird geprüft …
        </p>
      )}

      {phase === "vorschau" && modus === "struktur" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Zeile
            zahl={umzubauen.length}
            titel="Ordner mit alter Struktur"
            text={`${eintraege} Einträge wandern aus 01_AUDIO, 02_VISUALS und 04_UPLOAD in den Beat-Ordner. 03_PROJECTS wird zu 01_SAVEFILES.`}
          />

          <Hinweis ton="info">
            <strong>Danach „Namen angleichen".</strong> Ältere MP3/WAV nach <code>02_OLD/</code>.
            Kein Rückgängig, vorher sichern.
          </Hinweis>

          {stolpert.length > 0 && (
            <Uebersprungen
              anzahl={stolpert.length}
              grund="Namenskollision oder fehlender Ordner"
              zeilen={stolpert.map(s => ({
                id: s.beat_id,
                text: s.error ?? (s.savefiles_conflict
                  ? "03_PROJECTS und 01_SAVEFILES gibt es beide"
                  : s.collisions.join(", ")),
              }))}
            />
          )}
        </div>
      )}

      {phase === "vorschau" && modus === "namen" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Zeile
            zahl={ordnerNeu}
            titel="Ordner werden umbenannt"
            text="Der Ordnername kommt aus der Datenbank: Nummer, Titel in Großbuchstaben, Tonart und BPM."
          />
          <Zeile
            zahl={dateienNeu}
            titel="Dateien werden umbenannt"
            text="„Thumbnail_12.png“ wird „TITEL_Thumbnail_1920x1080.png“"
          />

          <Hinweis ton="info">
            Nur die <strong>Hauptdatei</strong> je Sorte. Ältere MP3/WAV nach <code>02_OLD/</code>.
            Alte Ordnerstruktur vorher migrieren.
          </Hinweis>

          {namenFehler.length > 0 && (
            <Uebersprungen
              anzahl={namenFehler.length}
              grund="Ordner fehlt oder Zielname belegt"
              zeilen={namenFehler.map(n => ({ id: n.beat_id, text: n.error ?? "" }))}
            />
          )}
        </div>
      )}

      {phase === "laeuft" && (
        <p style={{ fontSize: 13, color: C.onSurfaceVariant, margin: 0 }}>
          Dateien werden bewegt. Das Fenster bitte offen lassen …
        </p>
      )}

      {phase === "fertig" && ergebnis && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.mint, fontSize: 14, fontWeight: 700 }}>
            <Check size={16} strokeWidth={2.5} /> Fertig
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: C.onSurfaceVariant, lineHeight: 1.8 }}>
            {ergebnis.map((z, i) => <li key={i}>{z}</li>)}
          </ul>
        </div>
      )}
    </Modal>
  );
}

// ─── Bausteine ──────────────────────────────────────────────────────────────

function Zeile({ zahl, titel, text }: { zahl: number; titel: string; text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
      <span style={{
        fontSize: 30, fontWeight: 800, lineHeight: 1, minWidth: 52,
        color: zahl > 0 ? C.primary : C.onSecondaryFixedVar,
        fontVariantNumeric: "tabular-nums",
      }}>
        {zahl}
      </span>
      <span style={{ flex: 1 }}>
        <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.onSurface }}>{titel}</span>
        <span style={{ display: "block", fontSize: 12, color: C.onSurfaceVariant, marginTop: 3, lineHeight: 1.5 }}>{text}</span>
      </span>
    </div>
  );
}

function Uebersprungen({ anzahl, grund, zeilen }: {
  anzahl: number;
  grund: string;
  zeilen: Array<{ id: string; text: string }>;
}) {
  return (
    <div>
      <Hinweis ton="warnung">
        {anzahl} Beat{anzahl === 1 ? " wird" : "s werden"} übersprungen: {grund}
        Sie bleiben unverändert.
      </Hinweis>
      <ul style={{
        margin: "8px 0 0", padding: "8px 12px", maxHeight: 140, overflowY: "auto",
        listStyle: "none", background: C.surfaceContainerLow,
        borderRadius: radius.control, border: `1px solid ${C.border15}`,
      }}>
        {zeilen.slice(0, 20).map(z => (
          <li key={z.id} style={{ fontSize: 12, color: C.onSurfaceVariant, padding: "2px 0" }}>
            <strong style={{ color: C.onSurface }}>{z.id}</strong>{" "}{z.text}
          </li>
        ))}
        {zeilen.length > 20 && (
          <li style={{ fontSize: 12, color: C.onSecondaryFixedVar, paddingTop: 4 }}>
            … {zeilen.length - 20} weitere
          </li>
        )}
      </ul>
    </div>
  );
}

const TON = {
  info:    { farbe: C.onSurfaceVariant, rand: C.border15,              grund: C.surfaceContainerLow },
  warnung: { farbe: C.primary,          rand: alpha(C.primary, 0.35),  grund: alpha(C.primary, 0.10) },
  fehler:  { farbe: C.error,            rand: alpha(C.error, 0.35),  grund: alpha(C.error, 0.10) },
} as const;

function Hinweis({ ton, children }: { ton: keyof typeof TON; children: React.ReactNode }) {
  const t = TON[ton];
  return (
    <div style={{
      display: "flex", gap: 8, alignItems: "flex-start",
      padding: "10px 12px", borderRadius: radius.control,
      background: t.grund, border: `1px solid ${t.rand}`,
      fontSize: 12, color: t.farbe, lineHeight: 1.6,
    }}>
      {ton !== "info" && <AlertTriangle size={13} strokeWidth={2} style={{ flexShrink: 0, marginTop: 2 }} />}
      <div>{children}</div>
    </div>
  );
}
