// src/pages/Placeholder.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Support / Help Page
// ═══════════════════════════════════════════════════════════════════════════════

import { HelpCircle, Keyboard, BookOpen, Info, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { C, radius } from "../lib/theme";
import { PageHeader, PageBody } from "../components/ui";
import { APP_VERSION } from "../lib/version";

// ─── Section ─────────────────────────────────────────────────────────────────

function Section({ icon: Icon, title, children }: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background: C.surfaceContainerLowest,
      border: `1px solid ${C.border10}`,
      borderRadius: radius.card,
      padding: 28,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <Icon size={16} color={C.primary} />
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.onSurface, letterSpacing: "-0.01em" }}>
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

// ─── Zwischenüberschrift in einer Sektion ────────────────────────────────────

function Untertitel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: C.onSecondaryFixedVar,
      textTransform: "uppercase", letterSpacing: "0.08em",
      marginTop: 18, marginBottom: 4,
    }}>
      {children}
    </div>
  );
}

// ─── Shortcut Row ─────────────────────────────────────────────────────────────

function ShortcutRow({ keys, description }: { keys: string[]; description: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "8px 0",
      borderBottom: `1px solid ${C.border10}`,
    }}>
      <span style={{ fontSize: 12, color: C.onSurfaceVariant }}>{description}</span>
      <div style={{ display: "flex", gap: 4 }}>
        {keys.map((k, i) => (
          <kbd key={i} style={{
            padding: "2px 8px", borderRadius: radius.control,
            background: C.surfaceContainerHigh,
            border: `1px solid ${C.border20}`,
            fontSize: 12, color: C.onSurface,
            fontFamily: "Consolas, monospace",
          }}>{k}</kbd>
        ))}
      </div>
    </div>
  );
}

// ─── FAQ Item ─────────────────────────────────────────────────────────────────

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: `1px solid ${C.border10}` }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 0", background: "none", border: "none", cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: C.onSurface }}>{question}</span>
        {open
          ? <ChevronDown size={14} color={C.onSurfaceVariant} />
          : <ChevronRight size={14} color={C.onSurfaceVariant} />
        }
      </button>
      {open && (
        <p style={{ margin: "0 0 12px", fontSize: 12, color: C.onSurfaceVariant, lineHeight: 1.6 }}>
          {answer}
        </p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function Support() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.background }}>

      {/* Header */}
      <PageHeader icon={HelpCircle} title="Hilfe" />

      {/* Content */}
      <PageBody width="reading">

          {/* Nur, was wirklich belegt ist — jede Zeile hat eine Entsprechung im
              Code. „Strg + Enter“ stand hier jahrelang und war nie belegt. */}
          <Section icon={Keyboard} title="Tastenkürzel">
            <Untertitel>Archiv</Untertitel>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <ShortcutRow keys={["/"]} description="Ins Suchfeld springen" />
              <ShortcutRow keys={["Esc"]} description="Suche leeren · Auswahl aufheben · Dialog schließen" />
              <ShortcutRow keys={["↑", "↓"]} description="Vorigen / nächsten Beat auswählen" />
            </div>

            <Untertitel>Wiedergabe</Untertitel>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <ShortcutRow keys={["Leertaste"]} description="Abspielen / Pause" />
              <ShortcutRow keys={["←", "→"]} description="5 Sekunden springen" />
              <ShortcutRow keys={["Shift", "←/→"]} description="30 Sekunden springen" />
              <ShortcutRow keys={["Shift", "↑/↓"]} description="Lautstärke" />
            </div>

            <Untertitel>Studio</Untertitel>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <ShortcutRow keys={["↑", "↓"]} description="Voriges / nächstes Projekt öffnen" />
              <ShortcutRow keys={["Esc"]} description="Projekt-Inspector schließen" />
              <ShortcutRow keys={["Strg", "Klick"]} description="Einzelnes Projekt zur Auswahl dazunehmen" />
              <ShortcutRow keys={["Shift", "Klick"]} description="Ganze Spanne auswählen" />
            </div>

            <Untertitel>Tags &amp; Textfelder</Untertitel>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <ShortcutRow keys={["Enter"]} description="Eingabe übernehmen (Tag anlegen, umbenennen, Preset speichern)" />
              <ShortcutRow keys={[","]} description="Tag übernehmen und nächsten beginnen" />
              <ShortcutRow keys={["⌫"]} description="Bei leerem Feld: letzten Tag entfernen" />
            </div>
          </Section>

          {/* Getting Started */}
          <Section icon={BookOpen} title="Erste Schritte">
            <ol style={{ margin: 0, padding: "0 0 0 18px", display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { step: "1. Pfade setzen", desc: "Unter Einstellungen → Pfade das Archiv, die Produktions-Ordner und den Asset-Ordner festlegen." },
                { step: "2. Im Studio anfangen", desc: "„Neues Projekt“ legt Ordner und Start-FLP an und öffnet FL Studio. Exporte und Cover landen im selben Ordner." },
                { step: "3. Archivieren", desc: "Im Studio „Archivieren“ am Projekt oder „Ordner archivieren“ für externe Ordner. Nummer wird vergeben." },
                { step: "4. Archiv durchsuchen", desc: "Im Archiv suchen, nach Tempo, Tonart und Status filtern, Beats direkt abspielen und Angaben im Detailpanel ändern." },
                { step: "5. Upload vorbereiten", desc: "Im Upload-Tab entstehen Titel, Beschreibung und Tags je Plattform aus den Vorlagen. Die Planungs-Leiste unten setzt Termine." },
                { step: "6. Fortschritt verfolgen", desc: "Die Übersicht zeigt, was ansteht, den monatlichen Output und die Status-Verteilung auf einen Blick." },
              ].map(({ step, desc }) => (
                <li key={step} style={{ fontSize: 12, color: C.onSurfaceVariant, lineHeight: 1.6 }}>
                  <span style={{ fontWeight: 700, color: C.onSurface }}>{step}: </span>{desc}
                </li>
              ))}
            </ol>
          </Section>

          {/* FAQ */}
          <Section icon={HelpCircle} title="Häufige Fragen">
            <div>
              <FaqItem
                question="Meine Beats tauchen im Archiv nicht auf."
                answer="Prüfe, ob der Archiv-Pfad in den Einstellungen auf den richtigen Ordner zeigt. Danach in den Einstellungen unter „Wartung“ die System-Reparatur starten."
              />
              <FaqItem
                question="Die Wiedergabe funktioniert nicht."
                answer="BeatOS liest WAV, MP3, FLAC, AIFF, OGG und M4A. Stelle sicher, dass beim Archivieren eine Audiodatei ausgewählt war. Wurde die Datei danach außerhalb der App verschoben, findet der Player sie nicht mehr. Dann den Ordner-Abgleich in den Einstellungen starten."
              />
              <FaqItem
                question="Wie lege ich eigene Tags an?"
                answer="Einen Beat im Archiv auswählen und im Detailpanel ins Tag-Feld klicken. Neuen Namen eintippen und mit Enter anlegen. Eigene Tags gelten global und stehen danach für alle Beats bereit; sortieren und umbenennen lassen sie sich in der Tag-Verwaltung."
              />
              <FaqItem
                question="Kann ich Angaben nach dem Archivieren noch ändern?"
                answer="Ja. Beat im Archiv auswählen, das Detailpanel rechts ist direkt bearbeitbar. Titel, Tempo, Tonart, Status, Tags und Notizen werden beim Verlassen des Feldes gespeichert, ein eigener Dialog ist dafür nicht nötig."
              />
              <FaqItem
                question="Welche Formate sind für Cover und Video möglich?"
                answer="Bilder: PNG, JPG, JPEG, WEBP und GIF. Videos: MP4, MOV, WEBM, MKV und AVI. Dateien lassen sich im Studio direkt in den Projekt-Inspector ziehen oder über den Asset-Ordner zuweisen."
              />
              <FaqItem
                question="Warum ist ein Beat im falschen Monat einsortiert?"
                answer="Der Archivmonat kommt aus dem Erstelldatum der ältesten FLP im Ordner. Wurde der Beat gezippt oder über einen Cloud-Ordner kopiert, ist dieses Datum durch das Entpacken auf „jetzt“ gesetzt, und er landet im Monat des Imports."
              />
            </div>
          </Section>

          {/* App Info */}
          <Section icon={Info} title="Über die App">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { label: "Anwendung", value: "BeatOS" },
                { label: "Version", value: APP_VERSION },
                { label: "Framework", value: "Tauri 2 + React 19" },
                { label: "Datenbank", value: "SQLite (lokal)" },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border10}` }}>
                  <span style={{ fontSize: 12, color: C.onSurfaceVariant }}>{label}</span>
                  <span style={{ fontSize: 12, color: C.onSurface, fontWeight: 500 }}>{value}</span>
                </div>
              ))}
            </div>
          </Section>

      </PageBody>
    </div>
  );
}
