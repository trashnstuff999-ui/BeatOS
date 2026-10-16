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
// Dazu prüft die Karte, was vor dem Upload auffallen sollte, und zeigt die
// Beschreibung so, wie die Plattform sie anklickbar macht — bei YouTube mit
// der Linie, ab der „…mehr" zuklappt.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";
import {
  ShoppingBag, Music2, Youtube, Copy, FileCode2,
  Check, AlertCircle, Loader2, FileText, Pencil, CheckCircle2, Info,
} from "lucide-react";
import { C, PLATFORM_CONFIG, alpha, radius } from "../../lib/theme";
import { SectionCard } from "../ui/SectionCard";
import { Button, Modal } from "../ui";
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
type Feld = "title" | "description" | "tags";

/** Titellänge. YouTube schneidet bei 100 Zeichen hart ab; SoundCloud und
 *  Beatstars liegen ebenfalls bei 100. */
const TITEL_MAX = 100;

/** YouTube begrenzt die Tags auf 500 Zeichen in Summe. */
const YT_TAG_ZEICHEN = 500;

// Die Markenfarbe traegt NUR der aktive Abschnitt — drei bunte Knoepfe
// nebeneinander konkurrieren, aktiv gefaerbt sagt die Farbe genau eines:
// wo du gerade bist.
const TABS: Array<{ key: TabKey; label: string; icon: React.ElementType; color: string; file: string }> = [
  { key: "beatstars",  label: "Beatstars",  icon: ShoppingBag, color: PLATFORM_CONFIG.beatstars.color,  file: "beatstars.txt"  },
  { key: "soundcloud", label: "SoundCloud", icon: Music2,      color: PLATFORM_CONFIG.soundcloud.color, file: "soundcloud.txt" },
  { key: "youtube",    label: "YouTube",    icon: Youtube,     color: PLATFORM_CONFIG.youtube.color,    file: "youtube.txt"    },
];

/** Für den Vergleich Datei ↔ Vorlage: Zeilenenden und Rand zählen nicht. */
const norm = (t: string) => t.replace(/\r\n/g, "\n").trim();

export function DescriptionFilesCard({ beatId, rerenderKey, beatstarsUrl, style }: DescriptionFilesCardProps) {
  const [active, setActive] = useState<TabKey>("beatstars");
  const [gerendert, setGerendert] = useState<UploadDescriptions | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [dateien, setDateien] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<UploadDescriptions | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const [kopiert, setKopiert] = useState<Feld | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
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

  const kopieren = async (feld: Feld, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setKopiert(feld);
      setTimeout(() => setKopiert(k => (k === feld ? null : k)), 1400);
    } catch (e) {
      setFehler(`Kopieren fehlgeschlagen: ${e}`);
    }
  };

  const activeContent = drafts?.[active] ?? "";
  const activeTitle = extractTitle(activeContent);
  const activeDescription = extractDescription(activeContent);
  const activeTags = extractTags(activeContent);
  const activeTagCount = countTags(activeTags);
  const hinweise = drafts ? pruefeBeschreibung(active, activeContent, beatstarsUrl) : [];
  const eigeneFassung = overrides[active] !== undefined;
  // Eine .txt, die anders ist als die Vorlage, und keine eigene Fassung in der
  // DB: vielleicht eine alte Änderung, die nur dort steht. Anbieten, nicht
  // aufdrängen.
  const dateiAnders = !eigeneFassung && gerendert && dateien[active] !== undefined
    && norm(dateien[active]) !== norm(gerendert[active]);
  const tabLabel = TABS.find(t => t.key === active)?.label ?? active;

  return (
    <SectionCard
      icon={FileText}
      title="Beschreibungen"
      style={{ display: "flex", flexDirection: "column", ...style }}
      actions={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {speichert && <Loader2 size={12} color={C.onSecondaryFixedVar} style={{ animation: "spin 0.8s linear infinite" }} />}
          <Button
            size="sm" variant="secondary" icon={Pencil}
            onClick={() => setEditorOpen(true)}
            disabled={!drafts}
            title={`${tabLabel}-Text von Hand bearbeiten — speichert sich selbst`}
          >
            Bearbeiten
          </Button>
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
      {/* ─── Reiter ──────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", marginBottom: 10, flexShrink: 0,
        background: C.surfaceContainer,
        border: `1px solid ${C.border15}`,
        borderRadius: radius.control,
        overflow: "hidden",
      }}>
        {TABS.map((tab, i) => {
          const isActive = active === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActive(tab.key)}
              style={{
                flex: 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "9px 12px",
                background: isActive ? `${tab.color}14` : "transparent",
                border: "none",
                borderLeft: i === 0 ? "none" : `1px solid ${C.border15}`,
                boxShadow: isActive ? `inset 0 -2px 0 ${tab.color}` : "none",
                cursor: "pointer",
                fontSize: 11, fontWeight: 700, fontFamily: "inherit",
                color: isActive ? tab.color : C.onSecondaryFixedVar,
                letterSpacing: "0.05em", textTransform: "uppercase",
                transition: "background 0.15s, color 0.15s",
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = C.onSurface; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = C.onSecondaryFixedVar; }}
            >
              <Icon size={13} strokeWidth={1.75} />
              {tab.label}
              {overrides[tab.key] !== undefined && (
                <span title="Von Hand geändert" style={{ display: "flex" }}>
                  <Pencil size={10} strokeWidth={2.25} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ─── Prüfung + Herkunft: eine ruhige Zeile, Hinweise nur wenn nötig ── */}
      {drafts && !isLoading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, flexWrap: "wrap" }}>
            {hinweise.length === 0 ? (
              <span style={{ display: "flex", alignItems: "center", gap: 5, color: C.mint }}>
                <CheckCircle2 size={12} strokeWidth={2} /> Alles in Ordnung
              </span>
            ) : (
              <span style={{ color: C.onSurfaceVariant }}>
                {hinweise.length === 1 ? "1 Hinweis" : `${hinweise.length} Hinweise`}
              </span>
            )}
            <span style={{ flex: 1 }} />
            {eigeneFassung && (
              <span style={{ color: C.onSecondaryFixedVar }}>
                Von Hand geändert ·{" "}
                <LinkKnopf
                  onClick={() => gerendert && setDraft(active, gerendert[active], true)}
                  title="Die eigene Fassung verwerfen — der Text folgt wieder der Vorlage"
                >
                  Vorlage wiederherstellen
                </LinkKnopf>
              </span>
            )}
            {dateiAnders && (
              <span style={{ color: C.onSecondaryFixedVar }}>
                {TABS.find(t => t.key === active)?.file} weicht ab ·{" "}
                <LinkKnopf
                  onClick={() => setDraft(active, dateien[active], true)}
                  title="Den Text aus der Datei im Beat-Ordner als eigene Fassung übernehmen"
                >
                  übernehmen
                </LinkKnopf>
              </span>
            )}
          </div>
          {hinweise.map(h => (
            <div key={h.text} style={{
              display: "flex", alignItems: "flex-start", gap: 6,
              fontSize: 11, lineHeight: 1.45,
              color: h.stufe === "fehler" ? C.error : C.primary,
            }}>
              {h.stufe === "fehler"
                ? <AlertCircle size={12} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
                : <Info size={12} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />}
              {h.text}
            </div>
          ))}
        </div>
      )}

      {/* ─── Ausgabe: Titel / Beschreibung / Tags ────────────────────────────
          Die Karte ist so hoch wie ihr Inhalt, höchstens so hoch wie die
          linke Spalte — darüber scrollt dieser Teil. Vorher füllte sie immer
          die ganze Höhe, und eine kurze BeatStars-Beschreibung stand in einem
          halbleeren Kasten. */}
      <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto" }}>
        <OutputRow
          label="Titel"
          badge={`${activeTitle.length}/${TITEL_MAX}`}
          badgeWarn={activeTitle.length > TITEL_MAX}
          kopiert={kopiert === "title"}
          onCopy={() => kopieren("title", activeTitle)}
          disabled={!drafts || isLoading}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: C.onSurface, lineHeight: 1.45, wordBreak: "break-word" }}>
            {isLoading
              ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.onSurfaceVariant }}>
                  <Loader2 size={12} style={{ animation: "spin 0.8s linear infinite" }} /> Rendering…
                </span>
              : (activeTitle || <span style={{ color: C.onSecondaryFixedVar }}>—</span>)
            }
          </div>
        </OutputRow>

        <OutputRow
          label="Beschreibung"
          kopiert={kopiert === "description"}
          onCopy={() => kopieren("description", activeDescription)}
          disabled={!drafts || isLoading}
        >
          {isLoading || !activeDescription
            ? <span style={{ fontSize: 11, color: C.onSecondaryFixedVar }}>{isLoading ? "Rendering…" : "—"}</span>
            : <Vorschau text={activeDescription} youtube={active === "youtube"} />
          }
        </OutputRow>

        {activeTags && (
          <OutputRow
            label="Tags"
            // SoundCloud begrenzt die Anzahl, YouTube die Zeichensumme.
            badge={
              active === "soundcloud" ? `${activeTagCount}/9`
              : active === "youtube"  ? `${activeTags.length}/${YT_TAG_ZEICHEN} Zeichen`
              : String(activeTagCount)
            }
            badgeWarn={
              (active === "soundcloud" && activeTagCount > 9) ||
              (active === "youtube" && activeTags.length > YT_TAG_ZEICHEN)
            }
            kopiert={kopiert === "tags"}
            onCopy={() => kopieren("tags", activeTags)}
            disabled={!drafts || isLoading}
            letzte
          >
            <div style={{
              fontSize: 11, color: C.onSurfaceVariant, fontFamily: "monospace",
              lineHeight: 1.5, wordBreak: "break-word",
            }}>
              {activeTags.split(/\r?\n/).join("  ")}
            </div>
          </OutputRow>
        )}
      </div>

      {fehler && (
        <div style={{
          marginTop: 10, display: "flex", alignItems: "center", gap: 8,
          fontSize: 11, color: C.error, flexShrink: 0,
        }}>
          <AlertCircle size={12} strokeWidth={2} /> {fehler}
        </div>
      )}

      {/* Volltext im Dialog: speichert sich selbst, wie die Karte. */}
      {editorOpen && (
        <Modal
          title={`Bearbeiten — ${tabLabel}`}
          subtitle="Speichert sich selbst · gilt hier und im Release-Assistenten"
          icon={Pencil}
          width={900}
          onClose={() => setEditorOpen(false)}
          footerLeft={
            <span style={{ fontSize: 11, color: C.onSecondaryFixedVar }}>
              {speichert ? "Speichert …" : eigeneFassung ? "Eigene Fassung gespeichert" : "Folgt der Vorlage"}
            </span>
          }
          footer={<Button size="sm" variant="primary" onClick={() => setEditorOpen(false)}>Fertig</Button>}
        >
          <textarea
            value={activeContent}
            onChange={e => setDraft(active, e.target.value)}
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

/** Die Beschreibung, wie die Plattform sie anklickbar macht: Links,
 *  Zeitmarken und Hashtags hervorgehoben. Bei YouTube zeigt eine Linie, wo
 *  „…mehr" zuklappt — darüber steht, was man ohne Aufklappen sieht. */
function Vorschau({ text, youtube }: { text: string; youtube: boolean }) {
  const zeilen = text.split(/\r?\n/);
  const farbe = { text: C.onSurfaceVariant, link: C.tertiary, zeit: C.tertiary, hashtag: C.tertiary };
  return (
    <div style={{ fontSize: 11, lineHeight: 1.55, wordBreak: "break-word" }}>
      {zeilen.map((zeile, i) => (
        <div key={i}>
          {youtube && i === YT_SICHTBARE_ZEILEN && zeilen.length > YT_SICHTBARE_ZEILEN && (
            <div
              title="Bis hierhin sehen Zuschauer die Beschreibung, ohne sie aufzuklappen"
              style={{
                display: "flex", alignItems: "center", gap: 8, margin: "6px 0",
                fontSize: 10, color: C.onSecondaryFixedVar,
              }}
            >
              <span style={{ flex: 1, borderTop: `1px dashed ${C.border20}` }} />
              …mehr
              <span style={{ flex: 1, borderTop: `1px dashed ${C.border20}` }} />
            </div>
          )}
          {zeile.trim() === ""
            ? <span>&nbsp;</span>
            : zerlege(zeile).map((s, k) => (
                <span key={k} style={{ color: farbe[s.art] }}>{s.text}</span>
              ))}
        </div>
      ))}
    </div>
  );
}

function LinkKnopf({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        padding: 0, background: "none", border: "none",
        color: C.primary, cursor: "pointer",
        fontSize: 11, fontWeight: 600, fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}

/** Eine Ausgabe-Zeile: Label links, Inhalt darunter, Kopieren rechts. */
function OutputRow({ label, badge, badgeWarn, onCopy, kopiert, disabled, letzte, children }: {
  label: string;
  badge?: string;
  badgeWarn?: boolean;
  onCopy: () => void;
  kopiert: boolean;
  disabled?: boolean;
  /** Ohne Trennlinie darunter — die Karte endet hier. */
  letzte?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 12,
      padding: "10px 2px",
      borderTop: `1px solid ${C.border10}`,
      borderBottom: letzte ? "none" : undefined,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
          textTransform: "uppercase", color: C.onSecondaryFixedVar,
          marginBottom: 4,
        }}>
          {label}
          {badge && (
            <span style={{
              padding: "1px 7px", borderRadius: radius.full,
              fontWeight: 600, letterSpacing: "0.02em", textTransform: "none",
              background: badgeWarn ? alpha(C.error, 0.15) : "rgba(255,255,255,0.05)",
              color: badgeWarn ? C.error : C.onSurfaceVariant,
            }}>
              {badge}
            </span>
          )}
        </div>
        {children}
      </div>
      {/* Kopieren: der Haken im Knopf selbst sagt „erledigt" — vorher sprang
          dafür eine Meldung unter die Karte und schob alles nach unten. */}
      <button
        onClick={onCopy}
        disabled={disabled}
        title={kopiert ? "Kopiert" : `${label} kopieren`}
        style={{
          width: 28, height: 28, borderRadius: radius.control, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "transparent",
          border: `1px solid ${kopiert ? alpha(C.mint, 0.5) : C.border20}`,
          color: kopiert ? C.mint : C.onSurfaceVariant,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.45 : 1,
          transition: "border-color 0.15s, color 0.15s",
        }}
      >
        {kopiert ? <Check size={12} strokeWidth={2.5} /> : <Copy size={12} strokeWidth={2} />}
      </button>
    </div>
  );
}
