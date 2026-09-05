// src/components/upload/UploadStatusCard.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Per-platform upload tracking as a compact table: one row per platform
// (icon+name | status segments | date), URL row appears under an uploaded
// platform. Picking a date on a draft row promotes it to "scheduled" in the
// same write. All writes go through update_upload_status — logic unchanged.
// Colors come from PLATFORM_CONFIG / UPLOAD_STATUS_CONFIG (theme.ts).
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { ShoppingBag, Music2, Youtube, Send, Rocket, Copy, Check } from "lucide-react";
import { C, PLATFORM_CONFIG, UPLOAD_STATUS_CONFIG } from "../../lib/theme";
import { SectionCard } from "../ui/SectionCard";
import { UploadAssistantDialog } from "./UploadAssistantDialog";
import { api } from "../../lib/api";
import type { UploadPlatformRow, UploadPlatform, UploadStatus } from "../../types/upload";

interface UploadStatusCardProps {
  beatId: string;
  uploads: UploadPlatformRow[];
  onChanged: () => void;
}

const PLATFORM_ICON: Record<UploadPlatform, React.ElementType> = {
  beatstars: ShoppingBag,
  soundcloud: Music2,
  youtube: Youtube,
};

const STATUS_ORDER: UploadStatus[] = ["draft", "scheduled", "uploaded"];

/** Das Datumsfeld traegt keinen Rahmen, soll aber als anklickbar erkennbar
 *  sein. Der native Kalender-Knopf ist im Normalzustand blass und wird beim
 *  Ueberfahren deutlich — Pseudoelemente gehen nur ueber echtes CSS. */
const DATE_FIELD_CSS = `
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

export function UploadStatusCard({ beatId, uploads, onChanged }: UploadStatusCardProps) {
  return (
    <SectionCard icon={Send} title="Status">
      {/* Drei Kacheln nebeneinander statt drei Zeilen untereinander: die Karte
          steht jetzt über die volle Breite, und untereinander hätten sich die
          Link-Felder über das halbe Fenster gestreckt. Nebeneinander stehen
          die Plattformen auch so, wie man sie vergleicht.
          auto-fit: bricht bei schmalem Fenster von selbst um. */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: 14,
      }}>
        <style>{DATE_FIELD_CSS}</style>
        {uploads.map(row => (
          <PlatformRow
            key={row.platform}
            beatId={beatId}
            row={row}
            onChanged={onChanged}
          />
        ))}
      </div>
    </SectionCard>
  );
}

// ─── Single Platform Row ────────────────────────────────────────────────────

function PlatformRow({ beatId, row, onChanged }: {
  beatId: string;
  row: UploadPlatformRow;
  onChanged: () => void;
}) {
  const meta = PLATFORM_CONFIG[row.platform];
  const PlatIcon = PLATFORM_ICON[row.platform];
  const [urlDraft, setUrlDraft] = useState(row.url ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
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
    const patch: Partial<UploadPlatformRow> = { status: next };
    if (next === "uploaded" && !row.uploaded_at) {
      patch.uploaded_at = todayISO();
    } else if (next !== "uploaded" && row.uploaded_at) {
      patch.uploaded_at = null;
    }
    persist(patch);
  };

  // Picking a date on a draft row promotes it to "scheduled" in the same write.
  const handleScheduledChange = (value: string) => {
    const patch: Partial<UploadPlatformRow> = { scheduled_at: value || null };
    if (value && row.status === "draft") {
      patch.status = "scheduled";
    }
    persist(patch);
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
      // Erhebung geht in einem dunklen Design nach OBEN — eine Stufe ueber
      // der Karte, nicht darunter.
      padding: "14px 15px",
      borderRadius: 10,
      background: C.surfaceContainer,
      // Der Rand bleibt neutral. Ihn zusaetzlich einzufaerben war zu viel:
      // drei Kacheln nebeneinander mit farbigem Rahmen UND farbiger Schrift
      // ergeben eine bunte Reihe, in der nichts mehr heraussticht.
      //
      // Farbe traegt jetzt nur die Beschriftung — welche Plattform, und ob
      // sie im Spiel ist. Den Zustand traegt die Linienart: durchgezogen
      // steht, gestrichelt ist vorgemerkt.
      border: geplant
        ? `1px dashed ${C.border20}`
        : `1px solid ${hochgeladen ? C.border20 : C.border15}`,
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      {/* Kopfzeile: WAS links, WIE WEIT rechts — beides auf einer Linie, weil
          es zusammen gelesen wird. Vorher standen der Name oben und der
          Zustand zwei Zeilen tiefer. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          {/* Sobald die Plattform im Spiel ist — geplant oder hochgeladen —
              tragen Symbol und Name ihre Markenfarbe. Im Entwurf bleiben sie
              grau: sonst leuchtete alles von Anfang an, und das Aufleuchten
              waere keine Nachricht mehr. */}
          <PlatIcon
            size={15}
            color={imSpiel ? meta.color : C.onSurfaceVariant}
            strokeWidth={1.75}
            style={{ transition: "color 0.15s" }}
          />
          <span style={{
            fontSize: 13, fontWeight: 600,
            color: imSpiel ? meta.color : C.onSurface,
            transition: "color 0.15s",
          }}>
            {meta.label}
          </span>
        </span>

        {row.status !== "uploaded" && (
          <button
            onClick={() => setAssistantOpen(true)}
            title={`${meta.label}-Upload starten: Seite öffnen, Titel/Beschreibung/Tags kopieren, abhaken`}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 24, height: 24, borderRadius: 6, flexShrink: 0,
              background: "transparent",
              border: `1px solid ${meta.color}45`,
              color: meta.color,
              cursor: "pointer",
            }}
          >
            <Rocket size={12} strokeWidth={2} />
          </button>
        )}

        <span style={{ flex: 1 }} />

        {/* Zustandsleiste in der Kopfzeile: „welche Plattform" und „wie weit"
            gehoeren nebeneinander. Zusammenhaengend mit Trennstrichen wie die
            Plattform-Tabs bei den Beschreibungen — so sieht man, dass es ein
            Schalter ist. */}
        <div style={{
          display: "flex", flexShrink: 0,
          border: `1px solid ${C.border15}`,
          borderRadius: 6,
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
                  fontSize: 9, fontWeight: active ? 700 : 500,
                  fontFamily: "inherit",
                  color: active ? m.color : C.onSecondaryFixedVar,
                  letterSpacing: "0.06em", textTransform: "uppercase",
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

      {/* Guided upload assistant */}
      {assistantOpen && (
        <UploadAssistantDialog
          beatId={beatId}
          platform={row.platform}
          onClose={() => setAssistantOpen(false)}
          onMarkUploaded={(url) => {
            const patch: Partial<UploadPlatformRow> = {
              status: "uploaded",
              url: url ?? row.url,
            };
            if (!row.uploaded_at) patch.uploaded_at = todayISO();
            persist(patch);
          }}
        />
      )}

      {/* URL row — uploaded platforms, plus ALWAYS for Beatstars: the link
          feeds {{BEATSTARS_LINK}} in the SoundCloud/YouTube descriptions,
          so it must be settable before those uploads happen.
          Buendig unter Name und Status. Ohne Link-Symbol davor und ohne
          Oeffnen-Knopf dahinter — beides sagte nichts, was die URL selbst
          nicht schon zeigt. */}
      {(row.status === "uploaded" || row.platform === "beatstars") && (
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
            placeholder={row.platform === "beatstars"
              ? "Beat-Link → {{BEATSTARS_LINK}}"
              : `https://...${row.platform}...`}
            style={{
              flex: 1, minWidth: 0,
              padding: "7px 10px",
              fontSize: 12,
              fontFamily: "monospace",
              // Eingabefelder gehen nach unten, Kacheln nach oben: hier ist
              // eine Vertiefung richtig, weil man hineinschreibt.
              background: C.surfaceContainerLow,
              border: `1px solid ${C.border15}`,
              borderRadius: 6,
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
              width: 26, height: 26, borderRadius: 6, flexShrink: 0,
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
      )}

      {/* Fusszeile: nur noch das Datum, beschriftet. Die Zustandsleiste ist in
          die Kopfzeile gewandert, wo sie neben den Plattformnamen gehoert. */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 11, color: C.onSecondaryFixedVar }}>
          {row.status === "uploaded" ? "Hochgeladen am" : "Geplant für"}
        </span>

        <span style={{ flex: 1 }} />

        {/* Datum rechtsbuendig. Kein Kasten, aber beim Ueberfahren hebt sich
            das Feld leicht ab — so ist erkennbar, dass man es anklicken kann,
            ohne dass es dauerhaft laut wird (Regeln in DATE_FIELD_CSS). */}
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
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
