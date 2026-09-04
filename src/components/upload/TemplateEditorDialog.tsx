// src/components/upload/TemplateEditorDialog.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Vorlagen für die Beschreibungen bearbeiten, ohne nach Notepad zu wechseln.
// Links der Rohtext mit den Platzhaltern, rechts dieselbe Vorlage am aktuellen
// Beat gerendert — die Vorschau läuft über den Backend-Renderer, es sieht also
// exakt so aus wie später die echte Beschreibung.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";
import { FileCode2, FolderOpen, Save, RotateCcw, ShoppingBag, Music2, Youtube } from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { C } from "../../lib/theme";
import { api } from "../../lib/api";
import { Modal, Button } from "../ui";
import type { UploadPlatform } from "../../types/upload";

// Ein Akzent statt drei Markenfarben — wie in DescriptionFilesCard.
const TABS: Array<{ key: UploadPlatform; label: string; icon: React.ElementType; color: string; file: string }> = [
  { key: "beatstars",  label: "Beatstars",  icon: ShoppingBag, color: C.primary, file: "beatstars.template"  },
  { key: "soundcloud", label: "SoundCloud", icon: Music2,      color: C.primary, file: "soundcloud.template" },
  { key: "youtube",    label: "YouTube",    icon: Youtube,     color: C.primary, file: "youtube.template"    },
];

// Spiegelt die Liste in render.rs (build_renderer). Kommt dort einer dazu,
// gehört er hier ergänzt.
const PLACEHOLDERS = [
  "TITLE", "TITLE_UPPER", "BPM", "KEY",
  "TYPE_BEAT_MAIN", "ALSO_FITS", "GENRE_TAGS", "HASHTAGS",
  "PRODUCER", "PRODUCER_PROD", "EMAIL",
  "IG_URL", "SC_URL", "YT_URL", "BS_URL", "BEATSTARS_LINK", "YEAR",
];

interface TemplateEditorDialogProps {
  /** Beat, an dem die Vorschau gerechnet wird */
  beatId: string;
  onClose: () => void;
  /** Nach dem Speichern: Beschreibungen neu rendern */
  onSaved: () => void;
}

export function TemplateEditorDialog({ beatId, onClose, onSaved }: TemplateEditorDialogProps) {
  const [active, setActive] = useState<UploadPlatform>("beatstars");
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState("");        // Stand auf der Platte
  const [preview, setPreview] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const tab = TABS.find(t => t.key === active)!;
  const isDirty = draft !== saved;

  // Vorlage laden, wenn der Tab wechselt
  useEffect(() => {
    setIsLoading(true);
    setError(null);
    setNote(null);
    api.upload.readTemplate(tab.file)
      .then(text => { setDraft(text); setSaved(text); })
      .catch(e => setError(String(e)))
      .finally(() => setIsLoading(false));
  }, [tab.file]);

  // Vorschau nachziehen — gedrosselt, damit nicht jeder Tastendruck rendert
  useEffect(() => {
    if (!draft) { setPreview(""); return; }
    const handle = setTimeout(() => {
      api.upload.previewTemplate(beatId, active, draft)
        .then(setPreview)
        .catch(e => setPreview(`Vorschau nicht möglich: ${String(e)}`));
    }, 350);
    return () => clearTimeout(handle);
  }, [draft, active, beatId]);

  /** Platzhalter an der Cursorposition einsetzen. */
  const insert = (name: string) => {
    const el = textareaRef.current;
    const token = `{{${name}}}`;
    if (!el) { setDraft(d => d + token); return; }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    setDraft(d => d.slice(0, start) + token + d.slice(end));
    // Cursor hinter den eingesetzten Platzhalter
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  // Esc und das X gehen ebenfalls hier durch — ein halb geschriebenes Template
  // soll nicht an einem Tastendruck hängen.
  const requestClose = () => {
    if (isDirty && !window.confirm("Ungespeicherte Änderungen an der Vorlage verwerfen?")) return;
    onClose();
  };

  const save = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await api.upload.writeTemplate(tab.file, draft);
      setSaved(draft);
      setNote(`${tab.file} gespeichert — die alte Fassung liegt als ${tab.file}.bak daneben.`);
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      title="Vorlagen bearbeiten"
      subtitle="Platzhalter links, Ergebnis am aktuellen Beat rechts"
      icon={FileCode2}
      onClose={requestClose}
      width={920}
      closeOnBackdrop={!isDirty}
      footerLeft={
        isDirty
          ? <span style={{ color: C.primary }}>Ungespeicherte Änderungen in {tab.file}</span>
          : note ?? <span>{tab.file}</span>
      }
      footer={
        <>
          <Button
            variant="ghost"
            icon={FolderOpen}
            title="Template-Ordner im Explorer öffnen"
            onClick={() => api.upload.getTemplatesDir().then(revealItemInDir).catch(e => setError(String(e)))}
          >
            Ordner
          </Button>
          <Button
            variant="secondary"
            icon={RotateCcw}
            onClick={() => setDraft(saved)}
            disabled={!isDirty || isSaving}
          >
            Verwerfen
          </Button>
          <Button variant="primary" icon={Save} onClick={save} loading={isSaving} disabled={!isDirty}>
            Speichern
          </Button>
        </>
      }
    >
      {error && (
        <div style={{ fontSize: 12, color: C.error, lineHeight: 1.5 }}>{error}</div>
      )}

      {/* Plattform-Tabs */}
      <div style={{ display: "flex", gap: 4 }}>
        {TABS.map(t => {
          const isActive = t.key === active;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => {
                if (isDirty && !window.confirm("Ungespeicherte Änderungen verwerfen?")) return;
                setActive(t.key);
              }}
              style={{
                flex: 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "9px 12px",
                background: isActive ? C.surfaceContainer : C.surfaceContainerLowest,
                border: `1px solid ${isActive ? t.color + "60" : C.border15}`,
                borderRadius: 8, cursor: "pointer",
                fontSize: 11, fontWeight: 700, fontFamily: "inherit",
                color: isActive ? t.color : C.onSurfaceVariant,
                letterSpacing: "0.05em", textTransform: "uppercase",
              }}
            >
              <Icon size={13} strokeWidth={1.75} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Platzhalter — Klick setzt an der Cursorposition ein */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {PLACEHOLDERS.map(name => (
          <button
            key={name}
            onClick={() => insert(name)}
            title={`{{${name}}} an der Cursorposition einsetzen`}
            style={{
              padding: "3px 8px", borderRadius: 9999,
              background: C.surfaceContainerLowest,
              border: `1px solid ${C.border20}`,
              color: C.onSurfaceVariant, cursor: "pointer",
              fontFamily: "monospace", fontSize: 10,
            }}
          >
            {name}
          </button>
        ))}
      </div>

      {/* Vorlage | Vorschau */}
      <div style={{ display: "flex", gap: 10 }}>
        <Pane label="Vorlage">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            spellCheck={false}
            disabled={isLoading}
            style={{
              ...paneBox,
              border: `1px solid ${C.border20}`,
              resize: "vertical",
              outline: "none",
            }}
          />
        </Pane>
        <Pane label={`Vorschau · Beat ${beatId}`}>
          <div style={{ ...paneBox, border: `1px solid ${C.border10}`, overflowY: "auto", color: C.onSurfaceVariant }}>
            {preview || (isLoading ? "" : "—")}
          </div>
        </Pane>
      </div>
    </Modal>
  );
}

const paneBox: React.CSSProperties = {
  width: "100%",
  height: 380,
  padding: "11px 13px",
  background: C.surfaceContainerLowest,
  borderRadius: 8,
  color: C.onSurface,
  fontFamily: "monospace",
  fontSize: 11,
  lineHeight: 1.55,
  whiteSpace: "pre-wrap",
  boxSizing: "border-box",
};

function Pane({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
        textTransform: "uppercase", color: C.onSecondaryFixedVar, marginBottom: 6,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}
