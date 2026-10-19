// src/components/upload/DescriptionFilesCard.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Beschreibungen für BeatStars, SoundCloud und YouTube.
//
// Der Text kommt aus den Vorlagen. Wer ihn von Hand ändert, bekommt eine
// eigene Fassung, die sich selbst speichert (Datenbank) und die überall gilt
// — hier und im Release-Assistenten. Vorher gab es einen Speichern-Knopf, der
// .txt-Dateien schrieb, die nichts zurücklas: nach einem Beat-Wechsel stand
// wieder die Vorlage da, und der Assistent kopierte sie auch.
//
// Alle drei Plattformen stehen nebeneinander statt hinter Reitern — hochgeladen
// wird immer überall. Ein Klick auf Titel, Beschreibung oder Tags kopiert sie.
// Zähler erscheinen erst, wenn es knapp wird; was vor dem Upload auffallen
// sollte, steht unter dem Spaltenkopf.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";
import {
  ShoppingBag, Music2, Youtube, Copy, FileCode2,
  Check, AlertCircle, Loader2, FileText, Pencil, CheckCircle2, Info,
} from "lucide-react";
import { C, PLATFORM_CONFIG, alpha, radius } from "../../lib/theme";
import { SectionCard } from "../ui/SectionCard";
import { Button, IconButton, Modal } from "../ui";
import { TemplateEditorDialog } from "./TemplateEditorDialog";
import { api } from "../../lib/api";
import type { UploadPlatform, UploadDescriptions } from "../../types/upload";
import {
  extractTitle, extractDescription, extractTags, countTags,
  effektiv, pruefeBeschreibung, zerlege, YT_SICHTBARE_ZEILEN,
} from "../../lib/descriptions";

interface DescriptionFilesCardProps {
  beatId: string;
  // Re-render trigger: bump this number whenever something that affects the
  // rendered output changes (type-beat fields, upload status URL, etc.) and
  // the card will auto re-render.
  rerenderKey: number;
  /** Der Kauflink dieses Beats aus dem Status. */
  beatstarsUrl: string | null;
  /** Vom Upload-Tab gesetzt (Höchsthöhe = linke Spalte). */
  style?: React.CSSProperties;
}

type TabKey = UploadPlatform;

/** Titellänge. YouTube schneidet bei 100 Zeichen hart ab; SoundCloud und
 *  Beatstars liegen ebenfalls bei 100. */
const TITEL_MAX = 100;

/** YouTube begrenzt die Tags auf 500 Zeichen in Summe. */
const YT_TAG_ZEICHEN = 500;

/** Ab diesem Anteil am Limit erscheint der Zähler. */
const KNAPP = 0.9;

// Die Plattformfarbe nur als dünne Linie unter dem Spaltenkopf — drei bunte
// Flächen nebeneinander würden mit dem Orange der App konkurrieren.
const TABS: Array<{ key: TabKey; label: string; icon: React.ElementType; color: string; file: string }> = [
  { key: "beatstars",  label: "Beatstars",  icon: ShoppingBag, color: PLATFORM_CONFIG.beatstars.color,  file: "beatstars.txt"  },
  { key: "soundcloud", label: "SoundCloud", icon: Music2,      color: PLATFORM_CONFIG.soundcloud.color, file: "soundcloud.txt" },
  { key: "youtube",    label: "YouTube",    icon: Youtube,     color: PLATFORM_CONFIG.youtube.color,    file: "youtube.txt"    },
];

/** Für den Vergleich Datei ↔ Vorlage: Zeilenenden und Rand zählen nicht. */
const norm = (t: string) => t.replace(/\r\n/g, "\n").trim();

export function DescriptionFilesCard({ beatId, rerenderKey, beatstarsUrl, style }: DescriptionFilesCardProps) {
  const [gerendert, setGerendert] = useState<UploadDescriptions | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [dateien, setDateien] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<UploadDescriptions | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);
  /** "youtube:title" — welches Feld gerade kopiert wurde. */
  const [kopiert, setKopiert] = useState<string | null>(null);
  /** Welche Beschreibung ganz aufgeklappt ist. */
  const [aufgeklappt, setAufgeklappt] = useState<Record<string, boolean>>({});
  const [editor, setEditor] = useState<TabKey | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  const laden = async () => {
    setIsLoading(true);
    setFehler(null);
    try {
      const [r, stand] = await Promise.all([
        api.upload.renderDescriptions(beatId),
        api.upload.getDescriptionState(beatId),
      ]);
      setGerendert(r);
      setOverrides(stand.overrides);
      setDateien(stand.dateien);
      setDrafts(effektiv(r, stand.overrides));
    } catch (e) {
      setFehler(String(e));
    } finally {
      setIsLoading(false);
    }
  };

  // Bei Beat-Wechsel und wenn sich etwas ändert, das in den Text einfließt.
  useEffect(() => {
    if (!beatId) return;
    laden();
  }, [beatId, rerenderKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Eigene Fassung: speichert sich selbst ─────────────────────────────────
  // Wie die anderen Karten: kurz nach der letzten Eingabe. Gleicht der Text
  // wieder der Vorlage, wird die eigene Fassung gelöscht — dann folgt er
  // der Vorlage wieder. Die .txt im Beat-Ordner wird mitgeschrieben.
  const offenRef = useRef<{ beatId: string; p: TabKey; text: string; vorlage: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const schreiben = async () => {
    const offen = offenRef.current;
    offenRef.current = null;
    if (!offen) return;
    const eigen = norm(offen.text) === norm(offen.vorlage) ? null : offen.text;
    setSpeichert(true);
    try {
      await api.upload.setDescriptionOverride(offen.beatId, offen.p, eigen);
      await api.upload.saveDescriptions({
        beat_id: offen.beatId, beatstars: null, soundcloud: null, youtube: null, [offen.p]: offen.text,
      }).catch(() => { /* Ordner fehlt — die eigene Fassung steht trotzdem in der DB */ });
      if (offen.beatId === beatId) {
        setOverrides(prev => {
          const neu = { ...prev };
          if (eigen === null) delete neu[offen.p]; else neu[offen.p] = eigen;
          return neu;
        });
        setDateien(prev => ({ ...prev, [offen.p]: offen.text }));
      }
    } catch (e) {
      setFehler(`Speichern fehlgeschlagen: ${e}`);
    } finally {
      setSpeichert(false);
    }
  };

  const setDraft = (p: TabKey, text: string, sofort = false) => {
    setDrafts(prev => prev ? { ...prev, [p]: text } : prev);
    if (!gerendert) return;
    offenRef.current = { beatId, p, text, vorlage: gerendert[p] };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(schreiben, sofort ? 0 : 600);
  };

  // Beat-Wechsel oder Karte weg: Ausstehendes trotzdem schreiben.
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (offenRef.current) schreiben();
  }, [beatId]); // eslint-disable-line react-hooks/exhaustive-deps

  const kopieren = async (feld: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setKopiert(feld);
      setTimeout(() => setKopiert(k => (k === feld ? null : k)), 1400);
    } catch (e) {
      setFehler(`Kopieren fehlgeschlagen: ${e}`);
    }
  };

  const bereit = Boolean(drafts) && !isLoading;
  const editorTab = TABS.find(t => t.key === editor);

  return (
    <SectionCard
      icon={FileText}
      title="Beschreibungen"
      style={{ display: "flex", flexDirection: "column", ...style }}
      actions={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {speichert && <Loader2 size={12} color={C.onSecondaryFixedVar} style={{ animation: "spin 0.8s linear infinite" }} />}
          <Button
            size="sm" variant="secondary" icon={FileCode2}
            onClick={() => setShowTemplates(true)}
            title="Vorlagen bearbeiten — mit Vorschau an diesem Beat"
          >
            Vorlagen
          </Button>
        </div>
      }
    >
      {/* BeatStars schmaler: dort gibt es nur den Titel — die Beschreibung
          wird nicht genutzt, die Exportnamen stehen oben bei den Dateien. */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.5fr) minmax(0, 1.5fr)", gap: 28, alignItems: "start" }}>
        {TABS.map(tab => {
          const p = tab.key;
          const inhalt = drafts?.[p] ?? "";
          const titel = extractTitle(inhalt);
          const text = extractDescription(inhalt);
          const tags = extractTags(inhalt);
          const anzahl = countTags(tags);
          const hinweise = drafts ? pruefeBeschreibung(p, inhalt, beatstarsUrl) : [];
          const eigen = overrides[p] !== undefined;
          // Eine .txt, die anders ist als die Vorlage, und keine eigene Fassung
          // in der DB: vielleicht eine alte Änderung, die nur dort steht.
          // Anbieten, nicht aufdrängen.
          const dateiAnders = !eigen && gerendert && dateien[p] !== undefined
            && norm(dateien[p]) !== norm(gerendert[p]);
          const zeilen = text.split(/\r?\n/);
          const offen = aufgeklappt[p] || zeilen.length <= YT_SICHTBARE_ZEILEN;
          const Icon = tab.icon;

          return (
            <div key={p} style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              {/* ── Spaltenkopf ── */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                paddingBottom: 8, marginBottom: 6, borderBottom: `2px solid ${alpha(tab.color, 0.55)}`,
              }}>
                <Icon size={14} color={tab.color} strokeWidth={2} />
                <span style={{ fontSize: 13, fontWeight: 700, color: C.onSurface }}>{tab.label}</span>
                {bereit && hinweise.length === 0 && (
                  <span title="Alles in Ordnung" style={{ display: "flex" }}>
                    <CheckCircle2 size={13} color={C.mint} strokeWidth={2} />
                  </span>
                )}
                <span style={{ flex: 1 }} />
                <IconButton
                  icon={Pencil} size={28} variant="ghost"
                  onClick={() => setEditor(p)}
                  disabled={!drafts}
                  title={`${tab.label}-Text von Hand bearbeiten — speichert sich selbst`}
                />
              </div>

              {/* ── Hinweise und Herkunft, nur wenn nötig ── */}
              {bereit && (hinweise.length > 0 || eigen || dateiAnders) && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6 }}>
                  {hinweise.map(h => (
                    <div key={h.text} style={{
                      display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12, lineHeight: 1.45,
                      color: h.stufe === "fehler" ? C.error : C.primary,
                    }}>
                      {h.stufe === "fehler"
                        ? <AlertCircle size={12} strokeWidth={2} style={{ flexShrink: 0, marginTop: 2 }} />
                        : <Info size={12} strokeWidth={2} style={{ flexShrink: 0, marginTop: 2 }} />}
                      {h.text}
                    </div>
                  ))}
                  {eigen && (
                    <span style={{ fontSize: 12, color: C.onSecondaryFixedVar }}>
                      Von Hand geändert ·{" "}
                      <LinkKnopf
                        onClick={() => gerendert && setDraft(p, gerendert[p], true)}
                        title="Die eigene Fassung verwerfen — der Text folgt wieder der Vorlage"
                      >
                        Vorlage wiederherstellen
                      </LinkKnopf>
                    </span>
                  )}
                  {dateiAnders && (
                    <span style={{ fontSize: 12, color: C.onSecondaryFixedVar }}>
                      {tab.file} weicht ab ·{" "}
                      <LinkKnopf
                        onClick={() => setDraft(p, dateien[p], true)}
                        title="Den Text aus der Datei im Beat-Ordner als eigene Fassung übernehmen"
                      >
                        übernehmen
                      </LinkKnopf>
                    </span>
                  )}
                </div>
              )}

              <Kopierfeld
                label="Titel"
                zaehler={titel.length >= TITEL_MAX * KNAPP ? `${titel.length}/${TITEL_MAX}` : null}
                warn={titel.length > TITEL_MAX}
                kopiert={kopiert === `${p}:title`}
                onCopy={() => kopieren(`${p}:title`, titel)}
                disabled={!bereit || !titel}
              >
                <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.onSurface, lineHeight: 1.45, wordBreak: "break-word" }}>
                  {isLoading ? <Laedt /> : (titel || <span style={{ color: C.onSecondaryFixedVar }}>—</span>)}
                </span>
              </Kopierfeld>

              {p !== "beatstars" && (
                <>
                  <Kopierfeld
                    label="Beschreibung"
                    kopiert={kopiert === `${p}:description`}
                    onCopy={() => kopieren(`${p}:description`, text)}
                    disabled={!bereit || !text}
                  >
                    {isLoading ? <Laedt /> : !text
                      ? <span style={{ fontSize: 12, color: C.onSecondaryFixedVar }}>—</span>
                      : <Vorschau zeilen={offen ? zeilen : zeilen.slice(0, YT_SICHTBARE_ZEILEN)} youtube={p === "youtube" && offen} />}
                  </Kopierfeld>
                  {bereit && zeilen.length > YT_SICHTBARE_ZEILEN && (
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => setAufgeklappt(a => ({ ...a, [p]: !a[p] }))}
                      style={{ alignSelf: "flex-start", padding: "2px 8px", marginTop: -2 }}
                    >
                      {aufgeklappt[p] ? "Weniger" : `…mehr (${zeilen.length - YT_SICHTBARE_ZEILEN} Zeilen)`}
                    </Button>
                  )}
                </>
              )}

              {tags && (
                <Kopierfeld
                  label="Tags"
                  // SoundCloud begrenzt die Anzahl, YouTube die Zeichensumme.
                  zaehler={
                    p === "soundcloud" && anzahl > 9 ? `${anzahl}/9`
                    : p === "youtube" && tags.length >= YT_TAG_ZEICHEN * KNAPP ? `${tags.length}/${YT_TAG_ZEICHEN} Zeichen`
                    : null
                  }
                  warn={(p === "soundcloud" && anzahl > 9) || (p === "youtube" && tags.length > YT_TAG_ZEICHEN)}
                  kopiert={kopiert === `${p}:tags`}
                  onCopy={() => kopieren(`${p}:tags`, tags)}
                  disabled={!bereit}
                >
                  <span style={{ display: "block", fontSize: 12, color: C.onSurfaceVariant, fontFamily: "monospace", lineHeight: 1.5, wordBreak: "break-word" }}>
                    {tags.split(/\r?\n/).join("  ")}
                  </span>
                </Kopierfeld>
              )}
            </div>
          );
        })}
      </div>

      {fehler && (
        <div style={{
          marginTop: 10, display: "flex", alignItems: "center", gap: 8,
          fontSize: 12, color: C.error, flexShrink: 0,
        }}>
          <AlertCircle size={12} strokeWidth={2} /> {fehler}
        </div>
      )}

      {/* Volltext im Dialog: speichert sich selbst, wie die Karte. */}
      {editor && editorTab && (
        <Modal
          title={`Bearbeiten — ${editorTab.label}`}
          subtitle="Speichert sich selbst · gilt hier und im Release-Assistenten"
          icon={Pencil}
          width={900}
          onClose={() => setEditor(null)}
          footerLeft={
            <span style={{ fontSize: 12, color: C.onSecondaryFixedVar }}>
              {speichert ? "Speichert …" : overrides[editor] !== undefined ? "Eigene Fassung gespeichert" : "Folgt der Vorlage"}
            </span>
          }
          footer={<Button size="sm" variant="primary" onClick={() => setEditor(null)}>Fertig</Button>}
        >
          <textarea
            value={drafts?.[editor] ?? ""}
            onChange={e => setDraft(editor, e.target.value)}
            spellCheck={false}
            autoFocus
            style={{
              width: "100%",
              height: "60vh",
              padding: "12px 14px",
              background: C.surfaceContainer,
              border: `1px solid ${C.border20}`,
              borderRadius: radius.control,
              outline: "none",
              color: C.onSurface,
              fontFamily: "monospace",
              fontSize: 12,
              lineHeight: 1.55,
              resize: "none",
              boxSizing: "border-box",
              whiteSpace: "pre-wrap",
            }}
          />
        </Modal>
      )}

      {showTemplates && (
        <TemplateEditorDialog
          beatId={beatId}
          onClose={() => setShowTemplates(false)}
          // Neue Vorlage → neu rendern; eigene Fassungen bleiben, wie sie sind.
          onSaved={() => laden()}
        />
      )}
    </SectionCard>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Laedt() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.onSurfaceVariant }}>
      <Loader2 size={12} style={{ animation: "spin 0.8s linear infinite" }} /> Lädt …
    </span>
  );
}

/** Die Beschreibung, wie die Plattform sie anklickbar macht: Links,
 *  Zeitmarken und Hashtags hervorgehoben. Bei YouTube zeigt eine Linie, wo
 *  „…mehr" zuklappt — darüber steht, was man ohne Aufklappen sieht. */
function Vorschau({ zeilen, youtube }: { zeilen: string[]; youtube: boolean }) {
  const farbe = { text: C.onSurfaceVariant, link: C.tertiary, zeit: C.tertiary, hashtag: C.tertiary };
  return (
    <span style={{ display: "block", fontSize: 12, lineHeight: 1.55, wordBreak: "break-word" }}>
      {zeilen.map((zeile, i) => (
        <span key={i} style={{ display: "block" }}>
          {youtube && i === YT_SICHTBARE_ZEILEN && (
            <span
              title="Bis hierhin sehen Zuschauer die Beschreibung, ohne sie aufzuklappen"
              style={{
                display: "flex", alignItems: "center", gap: 8, margin: "6px 0",
                fontSize: 11, color: C.onSecondaryFixedVar,
              }}
            >
              <span style={{ flex: 1, borderTop: `1px dashed ${C.border20}` }} />
              …mehr
              <span style={{ flex: 1, borderTop: `1px dashed ${C.border20}` }} />
            </span>
          )}
          {zeile.trim() === ""
            ? <span>&nbsp;</span>
            : zerlege(zeile).map((s, k) => (
                <span key={k} style={{ color: farbe[s.art] }}>{s.text}</span>
              ))}
        </span>
      ))}
    </span>
  );
}

/** Aktion mitten in einer Hinweiszeile: der ghost-Button, nur enger. */
function LinkKnopf({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} title={title} style={{ padding: "2px 6px", color: C.primary }}>
      {children}
    </Button>
  );
}

/** Ein Feld, das sich per Klick kopiert: das ganze Feld ist der Knopf, der
 *  Haken neben dem Label sagt „erledigt". */
function Kopierfeld({ label, zaehler, warn, onCopy, kopiert, disabled, children }: {
  label: string;
  zaehler?: string | null;
  warn?: boolean;
  onCopy: () => void;
  kopiert: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="ue-zeile"
      onClick={onCopy}
      disabled={disabled}
      title={`${label} kopieren`}
      style={{
        display: "block", width: "calc(100% + 16px)", margin: "0 -8px", padding: "8px",
        border: 0, font: "inherit", color: "inherit", textAlign: "left",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      <span style={{
        display: "flex", alignItems: "center", gap: 6, marginBottom: 4,
        fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
        textTransform: "uppercase", color: C.onSecondaryFixedVar,
      }}>
        {label}
        {zaehler && (
          <span style={{
            padding: "1px 7px", borderRadius: radius.full,
            fontWeight: 600, letterSpacing: "0.02em", textTransform: "none",
            background: warn ? alpha(C.error, 0.15) : "rgba(255,255,255,0.05)",
            color: warn ? C.error : C.onSurfaceVariant,
          }}>
            {zaehler}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {kopiert
          ? <span style={{ display: "flex", alignItems: "center", gap: 4, color: C.mint, letterSpacing: "0.02em", textTransform: "none" }}>
              <Check size={12} strokeWidth={2.5} /> Kopiert
            </span>
          : !disabled && <Copy size={12} strokeWidth={2} />}
      </span>
      {children}
    </button>
  );
}
