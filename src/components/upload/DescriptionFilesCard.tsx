// src/components/upload/DescriptionFilesCard.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// 3-tab editor for the Beatstars / SoundCloud / YouTube description files.
// Loads rendered templates from backend, lets user edit per-tab, then saves
// each tab (or all) into {beat_folder}/{platform}.txt at the beat root.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import {
  ShoppingBag, Music2, Youtube, Copy, Save, FileCode2,
  Check, AlertCircle, Loader2, FileText, ChevronDown,
} from "lucide-react";
import { C, PLATFORM_CONFIG } from "../../lib/theme";
import { SectionCard } from "../ui/SectionCard";
import { Button } from "../ui";
import { TemplateEditorDialog } from "./TemplateEditorDialog";
import { api } from "../../lib/api";
import type { UploadPlatform, UploadDescriptions, UploadFilesState } from "../../types/upload";

import { extractTitle, extractDescription, extractTags, countTags } from "../../lib/descriptions";

interface DescriptionFilesCardProps {
  beatId: string;
  uploadFiles: UploadFilesState;   // from AssetCheck — shows on-disk state per file
  onSaved: () => void;             // parent re-fetches data so the file-status indicators update
  // Re-render trigger: bump this number whenever something that affects the
  // rendered output changes (type-beat fields, upload status URL, etc.) and
  // the card will auto re-render.
  rerenderKey: number;
  /** Der Kauflink dieses Beats aus dem Status. Fehlt er, rendert
   *  {{BEATSTARS_LINK}} das Profil statt des Beats — siehe Hinweis unten. */
  beatstarsUrl: string | null;
  /** Vom Upload-Tab gesetzt, um die Karte in ihrer Huelle zu verankern. */
  style?: React.CSSProperties;
}

type TabKey = UploadPlatform;
type Banner = { kind: "ok" | "err"; msg: string } | null;

/** Titellänge. YouTube schneidet bei 100 Zeichen hart ab, ohne zu fragen;
 *  SoundCloud und Beatstars liegen ebenfalls bei 100. Ein Wert reicht also —
 *  wird eine Plattform großzügiger, gehört hier eine Tabelle hin. */
const TITEL_MAX = 100;

/** YouTube begrenzt die Tags nicht in der Anzahl, sondern auf 500 Zeichen in
 *  Summe. Was darüber liegt, verschwindet still. */
const YT_TAG_ZEICHEN = 500;

// Die Markenfarbe traegt NUR der aktive Abschnitt.
//
// Alle drei dauerhaft einzufaerben waere dieselbe Falle wie zuvor beim Gruen:
// SoundClouds Orange liegt dicht an der Akzentfarbe der App, YouTubes Rot
// dicht an der Fehlerfarbe — drei bunte Knoepfe nebeneinander konkurrieren,
// und keiner sagt mehr etwas. Aktiv gefaerbt sagt die Farbe dagegen genau
// eines: wo du gerade bist.
const TABS: Array<{ key: TabKey; label: string; icon: React.ElementType; color: string; file: string }> = [
  { key: "beatstars",  label: "Beatstars",  icon: ShoppingBag, color: PLATFORM_CONFIG.beatstars.color,  file: "beatstars.txt"  },
  { key: "soundcloud", label: "SoundCloud", icon: Music2,      color: PLATFORM_CONFIG.soundcloud.color, file: "soundcloud.txt" },
  { key: "youtube",    label: "YouTube",    icon: Youtube,     color: PLATFORM_CONFIG.youtube.color,    file: "youtube.txt"    },
];

export function DescriptionFilesCard({
  beatId, uploadFiles, onSaved, rerenderKey, beatstarsUrl, style,
}: DescriptionFilesCardProps) {
  const [active, setActive] = useState<TabKey>("beatstars");
  const [drafts, setDrafts] = useState<UploadDescriptions | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving]   = useState(false);
  const [banner, setBanner]       = useState<Banner>(null);
  // Per-tab "user has edited this tab" flag — used to avoid clobbering manual
  // edits when something else triggers a re-render upstream.
  const [dirty, setDirty] = useState<Record<TabKey, boolean>>({
    beatstars: false, soundcloud: false, youtube: false,
  });

  const renderFromBackend = async (force = false) => {
    setIsLoading(true);
    setBanner(null);
    try {
      const rendered = await api.upload.renderDescriptions(beatId);
      setDrafts(prev => {
        if (!prev || force) return rendered;
        // Preserve fields the user has manually edited.
        return {
          beatstars:  dirty.beatstars  ? prev.beatstars  : rendered.beatstars,
          soundcloud: dirty.soundcloud ? prev.soundcloud : rendered.soundcloud,
          youtube:    dirty.youtube    ? prev.youtube    : rendered.youtube,
        };
      });
      if (force) setDirty({ beatstars: false, soundcloud: false, youtube: false });
    } catch (e) {
      setBanner({ kind: "err", msg: String(e) });
    } finally {
      setIsLoading(false);
    }
  };

  // Load on beat change OR when upstream signals re-render needed.
  useEffect(() => {
    if (!beatId) return;
    renderFromBackend(false);
  }, [beatId, rerenderKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset drafts + dirty when beat changes (handled by reload but we also
  // want dirty flags cleared)
  useEffect(() => {
    setDirty({ beatstars: false, soundcloud: false, youtube: false });
    setBanner(null);
  }, [beatId]);

  const setDraft = (key: TabKey, value: string) => {
    setDrafts(prev => prev ? { ...prev, [key]: value } : prev);
    setDirty(prev => ({ ...prev, [key]: true }));
  };

  const handleCopyTitle = async () => {
    if (!drafts) return;
    try {
      await navigator.clipboard.writeText(extractTitle(drafts[active]));
      setBanner({ kind: "ok", msg: "Titel kopiert" });
      setTimeout(() => setBanner(b => (b?.kind === "ok" ? null : b)), 2200);
    } catch (e) {
      setBanner({ kind: "err", msg: `Clipboard failed: ${e}` });
    }
  };

  const handleCopyDescription = async () => {
    if (!drafts) return;
    try {
      await navigator.clipboard.writeText(extractDescription(drafts[active]));
      setBanner({ kind: "ok", msg: "Beschreibung kopiert" });
      setTimeout(() => setBanner(b => (b?.kind === "ok" ? null : b)), 2200);
    } catch (e) {
      setBanner({ kind: "err", msg: `Clipboard failed: ${e}` });
    }
  };

  const handleCopyTags = async () => {
    if (!drafts) return;
    try {
      await navigator.clipboard.writeText(extractTags(drafts[active]));
      setBanner({ kind: "ok", msg: "Tags kopiert" });
      setTimeout(() => setBanner(b => (b?.kind === "ok" ? null : b)), 2200);
    } catch (e) {
      setBanner({ kind: "err", msg: `Clipboard failed: ${e}` });
    }
  };

  /** Speichert immer alle drei Dateien. Ein Knopf pro Datei bedeutete drei
   *  Knoepfe fuer eine Handlung, die man ohnehin nie einzeln macht. */
  const persist = async () => {
    if (!drafts) return;
    setIsSaving(true);
    setBanner(null);
    try {
      await api.upload.saveDescriptions({
        beat_id:    beatId,
        beatstars:  drafts.beatstars,
        soundcloud: drafts.soundcloud,
        youtube:    drafts.youtube,
      });
      setDirty({ beatstars: false, soundcloud: false, youtube: false });
      setBanner({ kind: "ok", msg: "Alle drei Beschreibungen gespeichert" });
      onSaved();
      setTimeout(() => setBanner(b => (b?.kind === "ok" ? null : b)), 2500);
    } catch (e) {
      setBanner({ kind: "err", msg: `Speichern fehlgeschlagen: ${e}` });
    } finally {
      setIsSaving(false);
    }
  };

  const [showTemplates, setShowTemplates] = useState(false);

  // Editor collapsed by default — the title panel is the main output.
  // Stays open while the active tab has unsaved edits so nothing hides.
  const [editorOpen, setEditorOpen] = useState(false);

  const activeContent = drafts?.[active] ?? "";
  const activeTitle = extractTitle(activeContent);
  const activeDescription = extractDescription(activeContent);
  const activeTags = extractTags(activeContent);
  const activeTagCount = countTags(activeTags);
  const showEditor = editorOpen || dirty[active];
  const fileExistsMap: Record<TabKey, boolean> = {
    beatstars:  uploadFiles.beatstars_txt,
    soundcloud: uploadFiles.soundcloud_txt,
    youtube:    uploadFiles.youtube_txt,
  };

  return (
    <SectionCard
      icon={FileText}
      title="Beschreibungen"
      // Fuellt ihre Huelle (siehe Upload.tsx): der Inhaltsbereich waechst und
      // scrollt, der Speichern-Knopf bleibt am Fuss. Die Kartenhoehe kommt von
      // der Infos-Karte daneben und aendert sich nicht, wenn der Volltext
      // aufklappt.
      style={{ height: "100%", display: "flex", flexDirection: "column", ...style }}
      actions={
        // Der Neu-Rendern-Knopf ist raus: nach dem Speichern einer Vorlage
        // rendert die Karte ohnehin neu.
        <Button
          size="sm"
          variant="secondary"
          icon={FileCode2}
          onClick={() => setShowTemplates(true)}
          title="Vorlagen bearbeiten — mit Vorschau an diesem Beat"
        >
          Vorlagen bearbeiten
        </Button>
      }
    >

      {/* Der Kauflink fehlt — dann steht in allen drei Beschreibungen das
          Profil statt des Beats, und zwar stillschweigend: {{BEATSTARS_LINK}}
          faellt im Renderer auf beatstars_url aus den Einstellungen zurueck.
          Wer die Beschreibungen vorher speichert, paste hinterher den
          falschen Link. Deshalb steht der Hinweis hier, wo der Text
          entsteht — nicht beim Status, wo der Link eingetragen wird. */}
      {!beatstarsUrl?.trim() && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 8,
          padding: "9px 12px", borderRadius: 8,
          background: "rgba(253,161,36,0.10)",
          border: "1px solid rgba(253,161,36,0.35)",
          fontSize: 11, lineHeight: 1.5, color: "#fda124",
        }}>
          <AlertCircle size={13} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Kein Beatstars-Kauflink hinterlegt — in den Beschreibungen steht
            gerade dein Profil statt dieses Beats. Link unten bei
            <strong> Status → Beatstars</strong> eintragen, dann rendert es neu.
          </span>
        </div>
      )}

      {/* ─── Tab strip ───────────────────────────────────────────────────────
          Eine zusammenhaengende Leiste mit Trennstrichen statt drei einzelner
          Pillen: die drei Plattformen sind Abschnitte derselben Sache, keine
          drei getrennten Knoepfe. Nur der aktive Abschnitt bekommt Flaeche. */}
      <div style={{
        display: "flex", marginBottom: 12,
        // Eine Stufe UEBER der Karte, wie die Status-Kacheln: die Leiste lag
        // vorher auf der dunkelsten Flaeche und las sich als Ausschnitt.
        background: C.surfaceContainer,
        border: `1px solid ${C.border15}`,
        borderRadius: 8,
        overflow: "hidden",
      }}>
        {TABS.map((tab, i) => {
          const isActive = active === tab.key;
          const exists = fileExistsMap[tab.key];
          const isDirty = dirty[tab.key];
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActive(tab.key)}
              style={{
                flex: 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "10px 12px",
                // Aktiv: getoente Flaeche plus Unterstrich in der Markenfarbe.
                // Als Rahmen zerfiele die Leiste wieder in drei Knoepfe.
                background: isActive ? `${tab.color}14` : "transparent",
                border: "none",
                borderLeft: i === 0 ? "none" : `1px solid ${C.border15}`,
                boxShadow: isActive ? `inset 0 -2px 0 ${tab.color}` : "none",
                cursor: "pointer",
                fontSize: 11, fontWeight: 700, fontFamily: "inherit",
                color: isActive ? tab.color : C.onSecondaryFixedVar,
                letterSpacing: "0.05em", textTransform: "uppercase",
                position: "relative",
                transition: "background 0.15s, color 0.15s",
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = C.onSurface; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = C.onSecondaryFixedVar; }}
            >
              <Icon size={13} strokeWidth={1.75} />
              {tab.label}
              {isDirty && (
                <span title="Ungespeicherte Änderungen" style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: "#fda124",
                }} />
              )}
              {exists && !isDirty && (
                <Check size={11} color={C.onSecondaryFixedVar} strokeWidth={2.5} />
              )}
            </button>
          );
        })}
      </div>

      {/* ─── Ausgabe: Titel / Beschreibung / Tags ────────────────────────────
          Drei Zeilen einer Liste statt drei Kaesten. Vorher hatte jede Zeile
          Rahmen, Icon, Label UND einen breiten Knopf, der ausschrieb, was das
          Icon schon sagte („TITEL KOPIEREN" neben dem Titel). Jetzt trennen
          duenne Linien, und Kopieren ist ein Icon rechts. */}
      <div style={{
        borderTop: `1px solid ${C.border10}`,
        // Nimmt die Hoehe auf, die die Karte neben der Infos-Karte gewinnt:
        // statt Luft steht dort mehr von der Beschreibung.
        // flex-grow bewusst 0: waechst der Bereich auf die ganze Kartenhoehe,
        // rutscht der Speichern-Knopf an den Fuss und die Luecke dazwischen
        // wird sichtbar. So folgt er dem Inhalt, und der Rest ist Kartenrand.
        flex: "0 1 auto", minHeight: 0, overflowY: "auto",
      }}>
        <OutputRow
          label="Titel"
          badge={`${activeTitle.length}/${TITEL_MAX}`}
          badgeWarn={activeTitle.length > TITEL_MAX}
          onCopy={handleCopyTitle}
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
          onCopy={handleCopyDescription}
          disabled={!drafts || isLoading}
        >
          <div style={{
            fontSize: 11, color: C.onSurfaceVariant,
            lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
            display: "-webkit-box",
            // 6 Zeilen liessen die Beschreibung unlesbar und darunter die
            // halbe Karte leer. Der Bereich scrollt ohnehin.
            WebkitLineClamp: 20,
            WebkitBoxOrient: "vertical" as const,
            overflow: "hidden",
          }}>
            {isLoading
              ? "Rendering…"
              : (activeDescription || <span style={{ color: C.onSecondaryFixedVar }}>—</span>)
            }
          </div>
        </OutputRow>

        {activeTags && (
          <OutputRow
            label="Tags"
            // SoundCloud begrenzt die Anzahl, YouTube die Zeichensumme —
            // deshalb zwei verschiedene Zähler statt eines.
            badge={
              active === "soundcloud" ? `${activeTagCount}/9`
              : active === "youtube"  ? `${activeTags.length}/${YT_TAG_ZEICHEN} Zeichen`
              : String(activeTagCount)
            }
            badgeWarn={
              (active === "soundcloud" && activeTagCount > 9) ||
              (active === "youtube" && activeTags.length > YT_TAG_ZEICHEN)
            }
            onCopy={handleCopyTags}
            disabled={!drafts || isLoading}
          >
            <div style={{
              fontSize: 11, color: C.onSurfaceVariant, fontFamily: "monospace",
              lineHeight: 1.5, wordBreak: "break-word",
              display: "-webkit-box",
              WebkitLineClamp: 4,
              WebkitBoxOrient: "vertical" as const,
              overflow: "hidden",
            }}>
              {activeTags.split(/\r?\n/).join("  ")}
            </div>
          </OutputRow>
        )}

      {/* ─── Full text — collapsed by default ─────────────────────────────
          Steht innerhalb des scrollenden Bereichs, direkt unter den Tags:
          ausserhalb schob ihn der wachsende Bereich an den Kartenfuss, und
          beim Aufklappen wuchs die ganze Karte nach unten. Jetzt bleibt die
          Kartenhoehe, wie sie ist, und der Inhalt scrollt. */}
      <button
        onClick={() => setEditorOpen(o => !o)}
        style={{
          width: "100%",
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 12px",
          background: "transparent",
          border: `1px solid ${C.border10}`,
          borderRadius: 8,
          cursor: "pointer",
          fontSize: 10, fontWeight: 600,
          color: C.onSurfaceVariant,
          letterSpacing: "0.04em",
        }}
      >
        <ChevronDown
          size={12}
          style={{ transition: "transform 0.15s", transform: showEditor ? "rotate(180deg)" : "rotate(0)" }}
        />
        Volltext anzeigen & bearbeiten
        {dirty[active] && (
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, color: "#fda124" }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#fda124" }} />
            ungespeicherte Änderungen
          </span>
        )}
      </button>

      {showEditor && (
        <div style={{ position: "relative", marginTop: 8 }}>
          <textarea
            value={activeContent}
            onChange={e => setDraft(active, e.target.value)}
            spellCheck={false}
            style={{
              width: "100%",
              minHeight: 460,
              padding: "12px 14px",
              background: C.surfaceContainerLowest,
              border: `1px solid ${C.border20}`,
              borderRadius: 8,
              outline: "none",
              color: C.onSurface,
              fontFamily: "monospace",
              fontSize: 12,
              lineHeight: 1.55,
              resize: "vertical",
              boxSizing: "border-box",
              whiteSpace: "pre-wrap",
            }}
          />
          {isLoading && (
            <div style={{
              position: "absolute", inset: 0,
              background: "rgba(0,0,0,0.35)", backdropFilter: "blur(2px)",
              display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 8,
              color: C.onSurfaceVariant,
              fontSize: 11, fontWeight: 600,
              letterSpacing: "0.05em", textTransform: "uppercase",
            }}>
              <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite", marginRight: 8 }} />
              Rendering…
            </div>
          )}
        </div>
      )}
      </div>

      {/* ─── Eine Handlung: speichern. Vorher standen hier vier Knoepfe —
              „Text" kopierte den Rohtext, ein zweiter speicherte nur die
              aktuelle Datei, dazu Dateiname und „saved"-Vermerk. ───────── */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
        <Button
          size="sm"
          variant="primary"
          icon={Save}
          onClick={persist}
          loading={isSaving}
          disabled={!drafts}
          title="Beatstars, SoundCloud und YouTube in den Beat-Ordner schreiben"
        >
          Speichern
        </Button>
      </div>

      {/* ─── Banner ──────────────────────────────────────────────────────── */}
      {banner && (
        <div style={{
          marginTop: 10,
          padding: "8px 12px",
          background: banner.kind === "ok" ? "rgba(52,211,153,0.10)" : "rgba(229,72,77,0.10)",
          border: `1px solid ${banner.kind === "ok" ? "rgba(52,211,153,0.35)" : "rgba(229,72,77,0.35)"}`,
          borderRadius: 6,
          display: "flex", alignItems: "center", gap: 8,
          fontSize: 11,
          color: banner.kind === "ok" ? "#34d399" : "#e5484d",
        }}>
          {banner.kind === "ok"
            ? <Check size={12} strokeWidth={2.5} />
            : <AlertCircle size={12} strokeWidth={2} />
          }
          {banner.msg}
        </div>
      )}

      {showTemplates && (
        <TemplateEditorDialog
          beatId={beatId}
          onClose={() => setShowTemplates(false)}
          // Gespeicherte Vorlage → alle Tabs frisch rendern, aber eigene
          // Änderungen am Text nicht wegwerfen
          onSaved={() => renderFromBackend(false)}
        />
      )}
    </SectionCard>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

/** Eine Ausgabe-Zeile: Label links, Inhalt darunter, Kopieren rechts. */
function OutputRow({ label, badge, badgeWarn, onCopy, disabled, children }: {
  label: string;
  badge?: string;
  badgeWarn?: boolean;
  onCopy: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 12,
      padding: "12px 2px",
      borderBottom: `1px solid ${C.border10}`,
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
              padding: "1px 7px", borderRadius: 9999,
              fontWeight: 600, letterSpacing: "0.02em", textTransform: "none",
              background: badgeWarn ? "rgba(255,115,81,0.15)" : "rgba(255,255,255,0.05)",
              color: badgeWarn ? C.error : C.onSurfaceVariant,
            }}>
              {badge}
            </span>
          )}
        </div>
        {children}
      </div>
      <button
        onClick={onCopy}
        disabled={disabled}
        title={`${label} kopieren`}
        style={{
          width: 28, height: 28, borderRadius: 6, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "transparent",
          border: `1px solid ${C.border20}`,
          color: C.onSurfaceVariant,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.45 : 1,
        }}
      >
        <Copy size={12} strokeWidth={2} />
      </button>
    </div>
  );
}

