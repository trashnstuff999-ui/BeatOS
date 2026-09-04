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

// ⚠ Spiegelt `base_vars` in render.rs von Hand. Kommt dort ein Platzhalter
//   dazu, gehört er hier ergänzt — sonst kennt der Editor ihn nicht.
//
// Der Knopf trägt den Namen der *Sache*, nicht den der Maschine: „Tempo"
// statt `BPM`, „Titel groß" statt `TITLE_UPPER`. Der technische Name gehört
// in den Vorlagentext, nicht in die Bedienleiste — zwanzig Versalien-Pillen
// lasen sich wie eine Symboltabelle. Was der Platzhalter einsetzt und ein
// Beispiel stehen im Tooltip.
interface Platzhalter {
  /** Was draufsteht */
  label: string;
  /** Was eingesetzt wird */
  name: string;
  was: string;
  beispiel: string;
}

const GRUPPEN: Array<{ titel: string; eintraege: Platzhalter[] }> = [
  {
    titel: "Beat",
    eintraege: [
      { label: "Titel",       name: "TITLE",       was: "Titel des Beats, wie er in der Datenbank steht", beispiel: "NOBODY HERE" },
      { label: "Titel groß",  name: "TITLE_UPPER", was: "Derselbe Titel in Großbuchstaben",               beispiel: "NOBODY HERE" },
      { label: "Tempo",       name: "BPM",         was: "Tempo als Zahl, ohne Einheit",                   beispiel: "156" },
      { label: "Tonart",      name: "KEY",         was: "Tonart des Beats",                               beispiel: "C#m" },
      { label: "Jahr",        name: "YEAR",        was: "Das laufende Jahr — für Titel und Tags",         beispiel: "2026" },
    ],
  },
  {
    titel: "Type-Beat & Tags",
    eintraege: [
      { label: "Haupt-Artists", name: "TYPE_BEAT_MAIN", was: "Die Haupt-Artists aus dem Upload-Tab",           beispiel: "Lil Peep x Juice WRLD" },
      { label: "Passt auch zu", name: "ALSO_FITS",      was: "Die zweite Reihe Artists",                       beispiel: "Scorey, Polo G, Convolk" },
      { label: "Genres",        name: "GENRE_TAGS",     was: "Die Genres dieses Beats",                        beispiel: "Sad Guitar | Melodic" },
      { label: "Hashtags",      name: "HASHTAGS",       was: "Fertiger Tag-Block, je Plattform anders gebaut", beispiel: "#lilpeeptypebeat …" },
    ],
  },
  {
    titel: "Du",
    eintraege: [
      { label: "Dein Name",        name: "PRODUCER",       was: "Dein Producer-Name aus den Einstellungen", beispiel: "prod. goodbxy" },
      { label: "Name mit „prod.“", name: "PRODUCER_PROD",  was: "Setzt „prod. “ davor — steht es im Namen schon, kommt es doppelt", beispiel: "prod. prod. goodbxy" },
      { label: "E-Mail",           name: "EMAIL",          was: "Deine Kontakt-E-Mail",                     beispiel: "contact@prod404.com" },
      { label: "Instagram",        name: "IG_URL",         was: "Dein Instagram",                           beispiel: "instagram.com/prod.goodbxy" },
      { label: "SoundCloud",       name: "SC_URL",         was: "Dein SoundCloud",                          beispiel: "soundcloud.com/prodgoodbxy" },
      { label: "YouTube",          name: "YT_URL",         was: "Dein YouTube",                             beispiel: "youtube.com/@PROD.GOODBXY" },
      { label: "Beatstars",        name: "BS_URL",         was: "Dein Beatstars-Profil",                    beispiel: "beatstars.com/prodgoodbxy" },
      { label: "Kauflink",         name: "BEATSTARS_LINK", was: "Der Kauflink dieses Beats; ohne einen dein Beatstars-Profil", beispiel: "bsta.rs/sSDFEV" },
    ],
  },
  {
    titel: "Sample-Credits",
    eintraege: [
      { label: "Namenszeile",   name: "PRODUCER_LINE",  was: "Du, plus die Sample-Geber dieses Beats",                       beispiel: "prod. goodbxy & prodzeux" },
      { label: "Credits-Block", name: "CREDITS",        was: "Ohne fremdes Sample steht dort „No Samples Used“",             beispiel: "🎸 Guitarsample by prodzeux" },
      { label: "Ihre Links",    name: "COLLAB_SOCIALS", was: "Name und Links der Sample-Geber. Ohne welche bleibt nichts stehen", beispiel: "prodzeux: instagram.com/…" },
    ],
  },
];

/** Was beim Zeigen auf einen Knopf erscheint. */
function tooltip(p: Platzhalter): string {
  return `${p.was}\n\nSetzt {{${p.name}}} ein — z.B. ${p.beispiel}`;
}

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
      subtitle="Links bearbeiten, rechts das Ergebnis am aktuellen Beat"
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

      {/* Zum Einsetzen: benannt nach dem, was sie einsetzen. Klick schreibt an
          die Cursorposition, das Was und ein Beispiel stehen im Tooltip. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {GRUPPEN.map(gruppe => (
          <div key={gruppe.titel} style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{
              flex: "0 0 104px", textAlign: "right",
              fontSize: 11, color: C.onSecondaryFixedVar,
            }}>
              {gruppe.titel}
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {gruppe.eintraege.map(p => (
                <button
                  key={p.name}
                  onClick={() => insert(p.name)}
                  title={tooltip(p)}
                  style={{
                    padding: "4px 10px", borderRadius: 9999,
                    background: C.surfaceContainerLowest,
                    border: `1px solid ${C.border15}`,
                    color: C.onSurfaceVariant, cursor: "pointer",
                    fontFamily: "inherit", fontSize: 11,
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = C.primary + "60";
                    e.currentTarget.style.color = C.onSurface;
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = C.border15;
                    e.currentTarget.style.color = C.onSurfaceVariant;
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Vorlage | Vorschau — links wird gearbeitet, rechts nur bestätigt.
          Deshalb trägt nur das linke Feld Rahmen und Kasten. */}
      <div style={{ display: "flex", gap: 18 }}>
        <Pane label="Vorlage">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            spellCheck={false}
            disabled={isLoading}
            style={{
              ...paneBox,
              background: C.surfaceContainerLowest,
              border: `1px solid ${C.border20}`,
              resize: "vertical",
              outline: "none",
            }}
          />
        </Pane>
        <Pane label={`Vorschau · Beat ${beatId}`}>
          <div style={{
            ...paneBox,
            background: "transparent",
            border: "none",
            padding: "11px 0",
            overflowY: "auto",
            color: C.onSurfaceVariant,
          }}>
            {preview || (isLoading ? "" : "—")}
          </div>
        </Pane>
      </div>
    </Modal>
  );
}

const paneBox: React.CSSProperties = {
  width: "100%",
  height: 360,
  padding: "11px 13px",
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
      <div style={{ fontSize: 11, color: C.onSecondaryFixedVar, marginBottom: 7 }}>
        {label}
      </div>
      {children}
    </div>
  );
}
