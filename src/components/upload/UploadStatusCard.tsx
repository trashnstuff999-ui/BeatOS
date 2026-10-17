// src/components/upload/UploadStatusCard.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Per-platform upload tracking: one Kachel per platform.
//
// Der Zustand entscheidet, wie viel Kachel es gibt:
//   Entwurf      — nur Name und Zustandsleiste. Kein Datum, kein Link.
//   Geplant      — dazu Datum und Link.
//   Hochgeladen  — dasselbe, das Datum heisst nur anders.
//
// Der Grund: an einem Entwurf ist nichts festgelegt. Ein Datumsfeld und eine
// Linkzeile, die bei drei von drei Plattformen leer dastehen, sind kein
// Angebot, sondern Rauschen — und in einem 380px-Panel kosten sie die halbe
// Hoehe. Zurueck auf Entwurf loescht deshalb auch die Daten: `get_upload_schedule`
// filtert nur auf `scheduled_at`, ein verstecktes Datum stuende sonst weiter
// im Planer.
//
// All writes go through update_upload_status.
// Colors come from PLATFORM_CONFIG / UPLOAD_STATUS_CONFIG (theme.ts).
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";
import { ShoppingBag, Music2, Youtube, Send, Rocket, Copy, Check, Undo2 } from "lucide-react";
import { C, PLATFORM_CONFIG, UPLOAD_STATUS_CONFIG, radius } from "../../lib/theme";
import { SectionCard } from "../ui/SectionCard";
import { UploadAssistantDialog } from "./UploadAssistantDialog";
import { api } from "../../lib/api";
import { plattformAusLink, hochgeladenMelden, heuteISO } from "../../lib/uploadLinks";
import type { UploadPlatformRow, UploadPlatform, UploadStatus } from "../../types/upload";

interface UploadStatusCardProps {
  beatId: string;
  uploads: UploadPlatformRow[];
  onChanged: () => void;
  /** Ohne Kacheln: drei Zeilen auf der umgebenden Flaeche, durch Haarlinien
   *  getrennt.
   *
   *  Fuer das Archiv-Side-Panel. Dort besteht jeder andere Abschnitt aus
   *  Beschriftung und flachem Inhalt auf `background` (#0e0e0e) mit Feldern
   *  auf `surfaceContainerLow` (#131313) — eine Kachel auf `surfaceContainer`
   *  (#1a1919) saesse eine Stufe zu hoch und waere der einzige Kasten im
   *  Panel. Im Upload-Tab stimmt die Kachel dagegen: dort liegt sie in einer
   *  SectionCard auf #131313, also genau eine Stufe darueber. */
  flach?: boolean;
}

const PLATFORM_ICON: Record<UploadPlatform, React.ElementType> = {
  beatstars: ShoppingBag,
  soundcloud: Music2,
  youtube: Youtube,
};

const STATUS_ORDER: UploadStatus[] = ["draft", "scheduled", "uploaded"];

/** Zwei Dinge, die nur ueber echtes CSS gehen:
 *
 *  1. Das Datumsfeld traegt keinen Rahmen, soll aber als anklickbar erkennbar
 *     sein. Der native Kalender-Knopf ist im Normalzustand blass und wird beim
 *     Ueberfahren deutlich — dafuer braucht es ein Pseudoelement.
 *  2. Link- und Datumszeile erscheinen erst ab "Geplant". Ohne Uebergang
 *     springen sie beim Klick ins Bild und die Zeile wird ruckartig hoeher.
 *
 *     Animiert wird `grid-template-rows` von `0fr` auf `1fr`. Das ist die
 *     *echte* Inhaltshoehe — ein erster Versuch mit `max-height: 0 -> 80px`
 *     ruckelte, weil 80px weit ueber der tatsaechlichen Hoehe (~34px) liegen:
 *     die Zeile war nach 40% der Laufzeit fertig aufgeklappt, die restlichen
 *     60% passierte sichtbar nichts. Das Kind braucht dafuer `overflow:hidden`
 *     und `min-height:0`, sonst kann es nicht unter seine Inhaltshoehe. */
const ROW_CSS = `
  @keyframes beatos-aufklappen {
    from { grid-template-rows: 0fr; opacity: 0; }
    to   { grid-template-rows: 1fr; opacity: 1; }
  }
  .beatos-aufklappen {
    display: grid;
    grid-template-rows: 1fr;
    animation: beatos-aufklappen 0.22s ease-out;
  }
  .beatos-aufklappen > * {
    overflow: hidden;
    min-height: 0;
  }
  .beatos-date {
    padding: 3px 6px;
    font-size: 12px;
    font-family: inherit;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 5px;
    outline: none;
    color-scheme: dark;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }
  .beatos-date:hover {
    background: rgba(255,255,255,0.05);
    border-color: ${C.border20};
  }
  .beatos-date::-webkit-calendar-picker-indicator {
    opacity: 0.35;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .beatos-date:hover::-webkit-calendar-picker-indicator { opacity: 0.9; }
`;

export function UploadStatusCard(props: UploadStatusCardProps) {
  const { beatId, uploads, onChanged } = props;
  const [releaseOffen, setReleaseOffen] = useState(false);
  /** Zuletzt per Einfügen übernommen — mit dem Stand davor, für Rückgängig. */
  const [eingefuegt, setEingefuegt] = useState<UploadPlatformRow | null>(null);
  const offen = uploads.some(u => u.status !== "uploaded");

  // Link einfügen genügt: Strg+V irgendwo auf der Seite (nicht in einem Feld)
  // erkennt die Plattform am Link und trägt sie als hochgeladen ein.
  // Über eine Ref, damit der Zuhörer nicht bei jedem Neuladen wechselt.
  const uploadsRef = useRef(uploads);
  uploadsRef.current = uploads;
  useEffect(() => {
    const einfuegen = async (e: ClipboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (document.querySelector("[data-modal]")) return;
      const text = e.clipboardData?.getData("text") ?? "";
      const plattform = plattformAusLink(text);
      const row = plattform && uploadsRef.current.find(u => u.platform === plattform);
      if (!row) return;
      e.preventDefault();
      try {
        await hochgeladenMelden(beatId, row, text.trim());
        setEingefuegt(row);
        onChanged();
      } catch (err) {
        console.error("[UploadStatus] Link übernehmen fehlgeschlagen:", err);
      }
    };
    window.addEventListener("paste", einfuegen);
    return () => window.removeEventListener("paste", einfuegen);
  }, [beatId, onChanged]);

  // Die Meldung verschwindet von selbst; Beat-Wechsel räumt sie sofort weg.
  useEffect(() => {
    if (!eingefuegt) return;
    const t = setTimeout(() => setEingefuegt(null), 6000);
    return () => clearTimeout(t);
  }, [eingefuegt]);
  useEffect(() => setEingefuegt(null), [beatId]);

  const rueckgaengig = async () => {
    if (!eingefuegt) return;
    const { platform, status, scheduled_at, uploaded_at, url } = eingefuegt;
    setEingefuegt(null);
    await api.upload.updateUploadStatus({ beat_id: beatId, platform, status, scheduled_at, uploaded_at, url });
    onChanged();
  };

  return (
    <SectionCard
      icon={Send}
      title="Status"
      actions={
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {eingefuegt ? (
            <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: C.onSurfaceVariant }}>
              <Check size={12} color={C.mint} strokeWidth={2.5} />
              {PLATFORM_CONFIG[eingefuegt.platform].label}-Link übernommen
              <button
                onClick={rueckgaengig}
                title="Rückgängig"
                style={{
                  display: "flex", padding: 4, border: "none", background: "transparent",
                  color: C.onSurfaceVariant, cursor: "pointer",
                }}
              >
                <Undo2 size={12} strokeWidth={2} />
              </button>
            </span>
          ) : (
            <span style={{ fontSize: 11, color: C.onSecondaryFixedVar }}>
              Link mit Strg+V einfügen
            </span>
          )}
          {offen && (
            <button
              onClick={() => setReleaseOffen(true)}
              title="Alle offenen Plattformen nacheinander hochladen: BeatStars, YouTube, SoundCloud"
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 10px", borderRadius: radius.control,
                background: "transparent", border: `1px solid ${C.border20}`,
                color: C.onSurfaceVariant, cursor: "pointer",
                fontSize: 11, fontWeight: 600,
              }}
            >
              <Rocket size={12} strokeWidth={2} />
              Release starten
            </button>
          )}
        </div>
      }
    >
      <UploadPlatformGrid {...props} />
      {releaseOffen && (
        <UploadAssistantDialog
          beatId={beatId}
          uploads={uploads}
          onClose={() => setReleaseOffen(false)}
          onChanged={onChanged}
        />
      )}
    </SectionCard>
  );
}

/** Dasselbe Bedienelement ohne Karte drumherum.
 *
 *  Im Archiv-Side-Panel haengt es direkt unter seiner eigenen Beschriftung:
 *  eine zweite Karte im Panel waere ein Kasten im Kasten, und die Ueberschrift
 *  "Status" stuende zweimal untereinander — einmal fuer den Beat-Status,
 *  einmal fuer die Plattformen. Geschrieben wird in beiden Faellen ueber
 *  denselben Weg (`update_upload_status`), es gibt nur diese eine Umsetzung. */
export function UploadPlatformGrid({ beatId, uploads, onChanged, flach = false }: UploadStatusCardProps) {
  return (
    /* Kacheln: drei nebeneinander statt drei Zeilen untereinander — die Karte
       steht im Upload-Tab über die volle Breite, und untereinander hätten sich
       die Link-Felder über das halbe Fenster gestreckt. Nebeneinander stehen
       die Plattformen auch so, wie man sie vergleicht.
       Flach: Abschnitte einer Fläche, getrennt durch Haarlinien. */
    <div style={flach
      ? { display: "flex", flexDirection: "column" }
      : { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
      <style>{ROW_CSS}</style>
      {uploads.map((row, i) => (
        <PlatformRow
          key={row.platform}
          beatId={beatId}
          row={row}
          onChanged={onChanged}
          flach={flach}
          trennlinie={flach && i > 0}
        />
      ))}
    </div>
  );
}

// ─── Single Platform Row ────────────────────────────────────────────────────

function PlatformRow({ beatId, row, onChanged, flach = false, trennlinie = false }: {
  beatId: string;
  row: UploadPlatformRow;
  onChanged: () => void;
  flach?: boolean;
  /** Haarlinie nach oben — flach ist die Trennung die einzige Kontur. */
  trennlinie?: boolean;
}) {
  const meta = PLATFORM_CONFIG[row.platform];
  const PlatIcon = PLATFORM_ICON[row.platform];
  const [urlDraft, setUrlDraft] = useState(row.url ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const persist = async (patch: Partial<UploadPlatformRow>) => {
    setIsSaving(true);
    try {
      await api.upload.updateUploadStatus({
        beat_id:      beatId,
        platform:     row.platform,
        status:       patch.status       ?? row.status,
        scheduled_at: patch.scheduled_at !== undefined ? patch.scheduled_at : row.scheduled_at,
        uploaded_at:  patch.uploaded_at  !== undefined ? patch.uploaded_at  : row.uploaded_at,
        url:          patch.url          !== undefined ? patch.url          : row.url,
      });
      onChanged();
    } catch (e) {
      console.error("[UploadStatus] save failed:", e);
    } finally {
      setIsSaving(false);
    }
  };

  const setStatus = (next: UploadStatus) => {
    if (next === row.status) return;
    // Side-effects when crossing into specific states:
    // • Entering "uploaded" stamps uploaded_at with today's date if empty.
    // • Leaving "uploaded" clears uploaded_at so the timestamp doesn't lie.
    // • Zurueck auf "Entwurf" raeumt beide Daten weg. Sonst traegt die Zeile
    //   ein Datum, das die Kachel nicht mehr zeigt — und der Planer liest
    //   `scheduled_at` ohne auf den Status zu schauen.
    const patch: Partial<UploadPlatformRow> = { status: next };
    if (next === "uploaded" && !row.uploaded_at) {
      patch.uploaded_at = heuteISO();
    } else if (next !== "uploaded" && row.uploaded_at) {
      patch.uploaded_at = null;
    }
    if (next === "draft" && row.scheduled_at) {
      patch.scheduled_at = null;
    }
    persist(patch);
  };

  const handleScheduledChange = (value: string) => {
    persist({ scheduled_at: value || null });
  };

  const handleUrlBlur = () => {
    if ((urlDraft || null) !== (row.url || null)) {
      persist({ url: urlDraft.trim() || null });
    }
  };

  const dateValue = row.status === "uploaded" ? (row.uploaded_at ?? "") : (row.scheduled_at ?? "");
  const hochgeladen = row.status === "uploaded";
  const geplant     = row.status === "scheduled";
  /** Geplant oder hochgeladen — die Plattform ist angefasst, nicht mehr leer. */
  const imSpiel = hochgeladen || geplant;

  const copyUrl = async () => {
    if (!urlDraft.trim()) return;
    try {
      await navigator.clipboard.writeText(urlDraft.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch (e) {
      console.error("[UploadStatus] Kopieren fehlgeschlagen:", e);
    }
  };

  return (
    <div style={{
      ...(flach
        // Flach: keine eigene Flaeche, keine Kontur ausser der Haarlinie.
        // Den Zustand traegt hier allein die Zustandsleiste — sie ist das
        // Bedienelement dafuer und sagt es ohnehin im Klartext.
        ? {
            padding: "12px 0",
            borderTop: trennlinie ? `1px solid ${C.border10}` : undefined,
          }
        : {
            // Erhebung geht in einem dunklen Design nach OBEN — eine Stufe
            // ueber der Karte, nicht darunter.
            padding: "14px 15px",
            borderRadius: radius.card,
            background: C.surfaceContainer,
            // Der Rand bleibt neutral. Ihn zusaetzlich einzufaerben war zu
            // viel: drei Kacheln nebeneinander mit farbigem Rahmen UND
            // farbiger Schrift ergeben eine bunte Reihe, in der nichts mehr
            // heraussticht.
            //
            // Farbe traegt nur die Beschriftung — welche Plattform, und ob
            // sie im Spiel ist. Den Zustand traegt die Linienart:
            // durchgezogen steht, gestrichelt ist vorgemerkt.
            border: geplant
              ? `1px dashed ${C.border20}`
              : `1px solid ${hochgeladen ? C.border20 : C.border15}`,
          }),
      // Abstand 0: den zwischen Kopfzeile und aufklappendem Teil traegt der
      // Block selbst als paddingTop — als Luecke hier waere er sofort da,
      // waehrend der Rest noch aufklappt.
      display: "flex", flexDirection: "column", gap: 0,
    }}>
      {/* Kopfzeile: WAS links, WIE WEIT rechts — beides auf einer Linie, weil
          es zusammen gelesen wird. Vorher standen der Name oben und der
          Zustand zwei Zeilen tiefer.
          `flexWrap`: im Upload-Tab ist die Kachel breit genug fuer eine Zeile,
          im 380px-Panel des Archivs nicht — dort fehlen rund 100px. Ohne
          Umbruch quetscht der Name auf null und die Rakete liegt darauf.
          Umbrechen statt quetschen, dieselbe Regel fuer beide Breiten. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", rowGap: 10 }}>
        {/* Die drei Namen sind bekannt und kurz — sie duerfen nicht schrumpfen,
            sonst bleibt alles einzeilig und "SoundCloud" wird zu "Sou…". */}
        <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {/* Sobald die Plattform im Spiel ist — geplant oder hochgeladen —
              tragen Symbol und Name ihre Markenfarbe. Im Entwurf bleiben sie
              grau: sonst leuchtete alles von Anfang an, und das Aufleuchten
              waere keine Nachricht mehr. */}
          <PlatIcon
            size={15}
            color={imSpiel ? meta.color : C.onSurfaceVariant}
            strokeWidth={1.75}
            style={{ transition: "color 0.15s", flexShrink: 0 }}
          />
          <span style={{
            fontSize: 13, fontWeight: 600,
            color: imSpiel ? meta.color : C.onSurface,
            transition: "color 0.15s",
            whiteSpace: "nowrap",
          }}>
            {meta.label}
          </span>
        </span>

        <span style={{ flex: 1 }} />

        {/* Zustandsleiste in der Kopfzeile: „welche Plattform" und „wie weit"
            gehoeren nebeneinander. Zusammenhaengend mit Trennstrichen wie die
            Plattform-Tabs bei den Beschreibungen — so sieht man, dass es ein
            Schalter ist. */}
        <div style={{
          display: "flex", flexShrink: 0,
          border: `1px solid ${C.border15}`,
          borderRadius: radius.control,
          overflow: "hidden",
        }}>
          {STATUS_ORDER.map((s, i) => {
            const active = row.status === s;
            const m = UPLOAD_STATUS_CONFIG[s];
            return (
              <button
                key={s}
                onClick={() => setStatus(s)}
                disabled={isSaving}
                title={`Auf „${m.label}" setzen`}
                style={{
                  padding: "4px 8px",
                  background: active ? m.bg : "transparent",
                  border: "none",
                  borderLeft: i === 0 ? "none" : `1px solid ${C.border15}`,
                  cursor: isSaving ? "wait" : "pointer",
                  fontSize: 10, fontWeight: active ? 700 : 500,
                  fontFamily: "inherit",
                  color: active ? m.color : C.onSecondaryFixedVar,
                  letterSpacing: "0.08em", textTransform: "uppercase",
                  opacity: isSaving ? 0.6 : 1,
                  transition: "background 0.15s, color 0.15s",
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.color = C.onSurface; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.color = C.onSecondaryFixedVar; }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Alles ab "Geplant" in EINEM aufklappenden Block. Getrennt animiert
          klappten zwei Elemente nebeneinander auf, und der Abstand zwischen
          ihnen erschien trotzdem schlagartig — der Abstand gehoert deshalb
          nach innen, und der aeussere Zeilen-Abstand ist 0. */}
      {row.status !== "draft" && (
      <div className="beatos-aufklappen">
      <div>
      <div style={{
        display: "flex", flexDirection: "column",
        gap: flach ? 10 : 12,
        paddingTop: flach ? 10 : 12,
      }}>

        {/* Linkzeile. Am Entwurf gibt es nichts zu verlinken.
            Der Beatstars-Link stand hier frueher auch im Entwurf, weil er
            {{BEATSTARS_LINK}} in den SC/YT-Beschreibungen fuellt — dass er
            fehlt, meldet aber die Beschreibungs-Karte von sich aus.
            Buendig unter Name und Status. Ohne Link-Symbol davor und ohne
            Oeffnen-Knopf dahinter — beides sagte nichts, was die URL selbst
            nicht schon zeigt. */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <input
            value={urlDraft}
            onChange={e => setUrlDraft(e.target.value)}
            onBlur={handleUrlBlur}
            // Lange URLs laufen aus dem Feld — der Tooltip zeigt sie ganz
            title={row.platform === "beatstars"
              ? `Beat-Link — wird als {{BEATSTARS_LINK}} in die Beschreibungen gerendert${urlDraft ? `\n${urlDraft}` : ""}`
              : urlDraft || undefined}
            /* Der Platzhalter sagt, was zu tun ist. Vorher stand hier bei
               Beatstars der Name der Vorlagen-Variable — Maschinensprache in
               einem Feld, in das man einen Link einfügt. Wozu der Link dient,
               steht weiterhin im Tooltip. */
            placeholder={`${meta.label}-Link hier einfügen`}
            style={{
              flex: 1, minWidth: 0,
              padding: "7px 10px",
              fontSize: 12,
              fontFamily: "monospace",
              // Eingabefelder gehen nach unten, Kacheln nach oben: hier ist
              // eine Vertiefung richtig, weil man hineinschreibt.
              background: C.surfaceContainerLow,
              border: `1px solid ${C.border15}`,
              borderRadius: radius.control,
              outline: "none",
              color: C.onSurface,
            }}
          />
          {/* Kopieren wie bei den Beschreibungen — der Link wird auf der
              Plattform gebraucht, nicht hier. */}
          <button
            onClick={copyUrl}
            disabled={!urlDraft.trim()}
            title={copied ? "Kopiert" : "Link kopieren"}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 26, height: 26, borderRadius: radius.control, flexShrink: 0,
              background: "transparent",
              border: `1px solid ${copied ? C.mint : C.border15}`,
              color: copied ? C.mint : C.onSurfaceVariant,
              cursor: urlDraft.trim() ? "pointer" : "default",
              opacity: urlDraft.trim() ? 1 : 0.35,
            }}
          >
            {copied ? <Check size={12} strokeWidth={2.5} /> : <Copy size={12} strokeWidth={2} />}
          </button>
        </div>

        {/* Fusszeile: nur noch das Datum, beschriftet. Am Entwurf ist kein Tag
            festgelegt; ein leeres "Datum waehlen" auf drei Zeilen fuellte nur
            Hoehe. */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
        }}>
        <span style={{ fontSize: 11, color: C.onSecondaryFixedVar }}>
          {row.status === "uploaded" ? "Hochgeladen am" : "Geplant für"}
        </span>

        <span style={{ flex: 1 }} />

        {/* Datum rechtsbuendig. Kein Kasten, aber beim Ueberfahren hebt sich
            das Feld leicht ab — so ist erkennbar, dass man es anklicken kann,
            ohne dass es dauerhaft laut wird (Regeln in ROW_CSS). */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <input
            type="date"
            className="beatos-date"
            value={dateValue}
            title={row.status === "uploaded" ? "Hochgeladen am" : "Geplant für"}
            onChange={e => row.status === "uploaded"
              ? persist({ uploaded_at: e.target.value || null })
              : handleScheduledChange(e.target.value)
            }
            style={{ color: dateValue ? C.onSurfaceVariant : "transparent" }}
          />
          {!dateValue && (
            <span style={{
              position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)",
              fontSize: 12, color: C.onSecondaryFixedVar,
              pointerEvents: "none", whiteSpace: "nowrap",
            }}>
              Datum wählen
            </span>
          )}
        </div>
        </div>

      </div>
      </div>
      </div>
      )}
    </div>
  );
}
