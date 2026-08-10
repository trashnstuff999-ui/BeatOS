// src/pages/Placeholder.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Support / Help Page
// ═══════════════════════════════════════════════════════════════════════════════

import { HelpCircle, Keyboard, BookOpen, Info, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { C } from "../lib/theme";
import { PageHeader, PageBody } from "../components/ui";

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
      borderRadius: 12,
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
            padding: "2px 8px", borderRadius: 4,
            background: C.surfaceContainerHigh,
            border: `1px solid ${C.border20}`,
            fontSize: 11, color: C.onSurface,
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

          {/* Keyboard Shortcuts — only list what is actually implemented */}
          <Section icon={Keyboard} title="Tastenkürzel">
            <div style={{ display: "flex", flexDirection: "column" }}>
              <ShortcutRow keys={["Esc"]} description="Dialog schließen" />
              <ShortcutRow keys={["Strg", "Enter"]} description="Im Bearbeiten-Dialog speichern" />
            </div>
          </Section>

          {/* Getting Started */}
          <Section icon={BookOpen} title="Erste Schritte">
            <ol style={{ margin: 0, padding: "0 0 0 18px", display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { step: "1. Archiv-Pfad setzen", desc: "Unter Einstellungen den Ordner festlegen, in dem deine Beats liegen." },
                { step: "2. Ersten Beat archivieren", desc: "Unter „Neuer Beat“ einen Beat-Ordner wählen, die Metadaten ausfüllen und archivieren." },
                { step: "3. Archiv durchsuchen", desc: "Im Archiv suchen, nach BPM/Tonart/Status filtern und Beats direkt abspielen." },
                { step: "4. Tags pflegen", desc: "Einen Beat im Archiv öffnen und im Tag-Editor nach Genre, Vibe oder Instrument einsortieren." },
                { step: "5. Fortschritt verfolgen", desc: "Die Übersicht zeigt anstehende Aufgaben, monatlichen Output und die Status-Verteilung auf einen Blick." },
              ].map(({ step, desc }) => (
                <li key={step} style={{ fontSize: 12, color: C.onSurfaceVariant, lineHeight: 1.6 }}>
                  <span style={{ fontWeight: 700, color: C.onSurface }}>{step} — </span>{desc}
                </li>
              ))}
            </ol>
          </Section>

          {/* FAQ */}
          <Section icon={HelpCircle} title="Häufige Fragen">
            <div>
              <FaqItem
                question="Meine Beats tauchen im Archiv nicht auf."
                answer="Prüfe, ob der Archiv-Pfad in den Einstellungen auf den richtigen Ordner zeigt. Nach dem Ändern des Pfads das Archiv über „Scan“ neu einlesen."
              />
              <FaqItem
                question="Die Wiedergabe funktioniert nicht."
                answer="BeatOS unterstützt MP3, WAV und FLAC. Stelle sicher, dass beim Archivieren eine Audiodatei ausgewählt war. Wurde die Datei danach außerhalb der App verschoben, archiviere den Beat erneut."
              />
              <FaqItem
                question="Wie lege ich eigene Tags an?"
                answer="Einen Beat im Archiv öffnen und ins Tag-Feld klicken. Neuen Tag-Namen eintippen und mit Enter anlegen. Eigene Tags werden global gespeichert und stehen für alle Beats zur Verfügung."
              />
              <FaqItem
                question="Kann ich Metadaten nach dem Archivieren noch ändern?"
                answer="Ja. Beat im Archiv auswählen, das Detail-Panel öffnen und auf „Beat bearbeiten“ klicken. Titel, BPM, Tonart, Status, Tags und Notizen lassen sich jederzeit ändern."
              />
              <FaqItem
                question="Welche Formate sind für Cover möglich?"
                answer="PNG, JPG und JPEG. Das Bild unter „Neuer Beat“ auf die Cover-Fläche ziehen oder über die Dateiauswahl wählen."
              />
            </div>
          </Section>

          {/* App Info */}
          <Section icon={Info} title="Über die App">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { label: "Anwendung", value: "BeatOS" },
                { label: "Version", value: "0.1.0" },
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
