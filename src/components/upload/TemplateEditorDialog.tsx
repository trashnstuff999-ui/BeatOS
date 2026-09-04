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
// Jeder trägt seine Erklärung mit: die Namen allein sagen nicht, was sie tun,
// und ein Beispiel sagt es schneller als ein Satz.
interface Platzhalter {
  name: string;
  was: string;
  beispiel: string;
}

const GRUPPEN: Array<{ titel: string; eintraege: Platzhalter[] }> = [
  {
    titel: "Beat",
    eintraege: [
      { name: "TITLE",       was: "Titel des Beats, wie er in der Datenbank steht", beispiel: "NOBODY HERE" },
      { name: "TITLE_UPPER", was: "Derselbe Titel in Großbuchstaben",               beispiel: "NOBODY HERE" },
      { name: "BPM",         was: "Tempo als Zahl, ohne Einheit",                   beispiel: "156" },
      { name: "KEY",         was: "Tonart des Beats",                               beispiel: "C#m" },
      { name: "YEAR",        was: "Das laufende Jahr — für Titel und Tags",         beispiel: "2026" },
    ],
  },
  {
    titel: "Type-Beat & Tags",
    eintraege: [
      { name: "TYPE_BEAT_MAIN", was: "Die Haupt-Artists aus dem Upload-Tab",                       beispiel: "Lil Peep x Juice WRLD" },
      { name: "ALSO_FITS",      was: "Passt außerdem zu — die zweite Reihe Artists",               beispiel: "Scorey, Polo G, Convolk" },
      { name: "GENRE_TAGS",     was: "Die Genres dieses Beats",                                    beispiel: "Sad Guitar | Melodic" },
      { name: "HASHTAGS",       was: "Fertiger Tag-Block, je Plattform anders gebaut",             beispiel: "#lilpeeptypebeat …" },
    ],
  },
  {
    titel: "Du",
    eintraege: [
      { name: "PRODUCER",       was: "Dein Producer-Name aus den Einstellungen",                   beispiel: "prod. goodbxy" },
      { name: "PRODUCER_PROD",  was: "Derselbe Name mit „prod. \" davor — steht er dort schon, kommt es doppelt", beispiel: "prod. prod. goodbxy" },
      { name: "EMAIL",          was: "Deine Kontakt-E-Mail",                                       beispiel: "contact@prod404.com" },
      { name: "IG_URL",         was: "Dein Instagram",                                             beispiel: "instagram.com/prod.goodbxy" },
      { name: "SC_URL",         was: "Dein SoundCloud",                                            beispiel: "soundcloud.com/prodgoodbxy" },
      { name: "YT_URL",         was: "Dein YouTube",                                               beispiel: "youtube.com/@PROD.GOODBXY" },
      { name: "BS_URL",         was: "Dein Beatstars-Profil",                                      beispiel: "beatstars.com/prodgoodbxy" },
      { name: "BEATSTARS_LINK", was: "Der Kauflink dieses Beats; ohne einen dein Beatstars-Profil", beispiel: "bsta.rs/sSDFEV" },
    ],
  },
  {
    titel: "Sample-Credits",
    eintraege: [
      { name: "PRODUCER_LINE",  was: "Du, plus die Sample-Geber dieses Beats",                          beispiel: "prod. goodbxy & prodzeux" },
      { name: "CREDITS",        was: "Der Credits-Block. Ohne fremdes Sample steht dort „No Samples Used\"", beispiel: "🎸 Guitarsample by prodzeux" },
      { name: "COLLAB_SOCIALS", was: "Name und Links der Sample-Geber. Ohne welche bleibt die Zeile leer und verschwindet", beispiel: "prodzeux:\ninstagram.com/…" },
    ],
  },
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
  const [hover, setHover] = useState<Platzhalter | null>(null);
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

      {/* Platzhalter — nach Gruppen sortiert, Klick setzt an der Cursorposition
          ein. Die Zeile darunter erklärt den, über dem die Maus steht: die
          Namen allein verraten nicht, was sie tun. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {GRUPPEN.map(gruppe => (
          <div key={gruppe.titel} style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{
              flex: "0 0 108px", textAlign: "right",
              fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", color: C.onSecondaryFixedVar,
            }}>
              {gruppe.titel}
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {gruppe.eintraege.map(p => {
                const aktiv = hover?.name === p.name;
                return (
                  <button
                    key={p.name}
                    onClick={() => insert(p.name)}
                    onMouseEnter={() => setHover(p)}
                    onMouseLeave={() => setHover(h => (h?.name === p.name ? null : h))}
                    onFocus={() => setHover(p)}
                    onBlur={() => setHover(h => (h?.name === p.name ? null : h))}
                    title={`{{${p.name}}} an der Cursorposition einsetzen`}
                    style={{
                      padding: "3px 8px", borderRadius: 9999,
                      background: aktiv ? C.surfaceContainer : C.surfaceContainerLowest,
                      border: `1px solid ${aktiv ? C.primary + "60" : C.border20}`,
                      color: aktiv ? C.onSurface : C.onSurfaceVariant, cursor: "pointer",
                      fontFamily: "monospace", fontSize: 10,
                    }}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Erklärzeile — feste Höhe, damit die Vorlage darunter nicht springt */}
      <div style={{
        minHeight: 30, padding: "6px 10px", borderRadius: 6,
        background: C.surfaceContainerLowest, border: `1px solid ${C.border10}`,
        fontSize: 11, lineHeight: 1.5, color: C.onSurfaceVariant,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        {hover ? (
          <>
            <code style={{ fontFamily: "monospace", color: C.primary, whiteSpace: "nowrap" }}>
              {`{{${hover.name}}}`}
            </code>
            <span>{hover.was}</span>
            <span style={{ marginLeft: "auto", color: C.onSecondaryFixedVar, fontStyle: "italic", whiteSpace: "pre", overflow: "hidden", textOverflow: "ellipsis" }}>
              {hover.beispiel.replace(/\n/g, " ⏎ ")}
            </span>
          </>
        ) : (
          <span style={{ color: C.onSecondaryFixedVar }}>
            Auf einen Platzhalter zeigen, um zu sehen was er einsetzt — klicken setzt ihn an der Cursorposition ein.
          </span>
        )}
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
  // 340 statt 380: die Platzhalter-Gruppen darüber brauchen den Platz, und
  // beide Felder scrollen ohnehin.
  height: 340,
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
