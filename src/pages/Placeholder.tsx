// src/pages/Placeholder.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Support / Help Page
// ═══════════════════════════════════════════════════════════════════════════════

import { HelpCircle, Keyboard, BookOpen, Info, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { C } from "../lib/theme";

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
      <header style={{
        padding: "20px 48px",
        borderBottom: `1px solid ${C.border10}`,
        display: "flex", alignItems: "center", gap: 12,
        flexShrink: 0,
      }}>
        <HelpCircle size={18} color={C.primary} />
        <div>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.onSurface }}>Support</h1>
          <p style={{ margin: 0, fontSize: 11, color: C.onSurfaceVariant }}>Shortcuts, FAQ & App Info</p>
        </div>
      </header>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "40px 48px" }}>
        <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Keyboard Shortcuts — only list what is actually implemented */}
          <Section icon={Keyboard} title="Keyboard Shortcuts">
            <div style={{ display: "flex", flexDirection: "column" }}>
              <ShortcutRow keys={["Esc"]} description="Close modal / dialog" />
              <ShortcutRow keys={["Ctrl", "Enter"]} description="Save in Edit-Beat dialog" />
            </div>
          </Section>

          {/* Getting Started */}
          <Section icon={BookOpen} title="Getting Started">
            <ol style={{ margin: 0, padding: "0 0 0 18px", display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { step: "1. Set your Archive Path", desc: "Go to Settings and configure the folder where your beats are stored." },
                { step: "2. Archive your first Beat", desc: "Go to Create, select a beat folder, fill in the metadata and click Archive Beat." },
                { step: "3. Browse your Library", desc: "Use Browse to search, filter by BPM/Key/Status and play beats directly." },
                { step: "4. Manage Tags", desc: "Open any beat in Browse and use the tag editor to categorize your beats by genre, vibe, or instrument." },
                { step: "5. Track Progress on Dashboard", desc: "The Dashboard shows KPIs, monthly output and status distribution at a glance." },
              ].map(({ step, desc }) => (
                <li key={step} style={{ fontSize: 12, color: C.onSurfaceVariant, lineHeight: 1.6 }}>
                  <span style={{ fontWeight: 700, color: C.onSurface }}>{step} — </span>{desc}
                </li>
              ))}
            </ol>
          </Section>

          {/* FAQ */}
          <Section icon={HelpCircle} title="FAQ">
            <div>
              <FaqItem
                question="My beats are not showing up in Browse."
                answer="Make sure the Archive Path in Settings points to the correct folder. After updating the path, use the Scan Archive function to re-index your library."
              />
              <FaqItem
                question="Audio playback is not working."
                answer="BeatOS supports MP3, WAV and FLAC files. Make sure your beat has an audio file selected when archiving. If the file was moved externally, re-archive the beat."
              />
              <FaqItem
                question="How do I add custom tags?"
                answer="Open any beat in Browse and click the tag field. Type a new tag name and press Enter to create it. Custom tags are saved globally and reusable across all beats."
              />
              <FaqItem
                question="Can I edit beat metadata after archiving?"
                answer="Yes. Select a beat in Browse, open the detail panel and click Edit. You can change the title, BPM, key, status, tags and notes."
              />
              <FaqItem
                question="What file formats are supported for cover art?"
                answer="PNG, JPG and JPEG are supported. Drop the image onto the cover area in Create, or select it via the file picker."
              />
            </div>
          </Section>

          {/* App Info */}
          <Section icon={Info} title="App Info">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { label: "Application", value: "BeatOS" },
                { label: "Version", value: "0.1.0" },
                { label: "Framework", value: "Tauri 2 + React 19" },
                { label: "Database", value: "SQLite (local)" },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border10}` }}>
                  <span style={{ fontSize: 12, color: C.onSurfaceVariant }}>{label}</span>
                  <span style={{ fontSize: 12, color: C.onSurface, fontWeight: 500 }}>{value}</span>
                </div>
              ))}
            </div>
          </Section>

        </div>
      </div>
    </div>
  );
}
