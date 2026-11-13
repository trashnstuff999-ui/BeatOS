// src/components/browse/BeatTable.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Beat Table — eine Flaeche, Zeilen durch Haarlinien getrennt.
//
// Vorher war jede Zeile eine eigene Karte: eigene Flaeche, eigener Rahmen,
// eigener Radius, 6px Luft dazwischen. Bei 50 Zeilen pro Seite sind das 50
// Kaesten, wo eine Liste hingehoert — dieselbe Kur wie bei der Dateiliste im
// Upload-Tab.
// ═══════════════════════════════════════════════════════════════════════════════

import { memo } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Heart, ArrowUp, ArrowDown, Play, Pause, Loader2 } from "lucide-react";
import { C, PLATFORM_CONFIG, STATUS_CONFIG, type PlatformKey, radius } from "../../lib/theme";
import type { Beat, SortState, SortColumn, UploadBadge, UploadBadgeMap } from "../../types/browse";
import { StatusPill } from "../Tagpill";
import { useAudioPlayerContext } from "../../contexts/AudioPlayerContext";

interface BeatTableProps {
  beats: Beat[];
  selectedBeatId: string | null;
  onSelectBeat: (beat: Beat) => void;
  onToggleFavorite: (beatId: string) => void;
  onPlayBeat: (beat: Beat) => void;
  sort: SortState;
  onSort: (column: SortColumn) => void;
  uploadBadges: UploadBadgeMap;
}

// ─── Platform dots: uploaded = solid, scheduled = ring ───────────────────────
// Kein memo: sitzt nur in BeatRow/GridCard, die selbst memo sind — es rendert
// also ohnehin nur, wenn die Zeile rendert.

/** Ist an diesem Beat noch etwas offen?
 *
 *  Im Raster sind die Punkte kein Statusfeld, sondern eine Meldung: „hier
 *  fehlt noch was". Sie erscheinen deshalb nur in diesen zwei Faellen —
 *
 *    irgendwo angefangen, aber nicht ueberall hochgeladen  → Luecke
 *    nirgends angefangen, aber der Beat ist fertig         → Luecke (vergessen)
 *
 *  — und bleiben weg, wenn alle drei Plattformen hochgeladen sind oder der
 *  Beat schlicht noch in Arbeit ist. Sonst stuenden auf fast jeder Karte
 *  Punkte, und dann sagen sie nichts mehr. */
export function hatUploadLuecke(badges: UploadBadge[] | undefined, status: string | null): boolean {
  const hochgeladen = badges?.filter(b => b.status === "uploaded").length ?? 0;
  if (hochgeladen === 3) return false;          // ueberall draussen
  if (badges && badges.length > 0) return true; // angefangen, nicht fertig
  return status === "finished";                 // fertig, aber nirgends
}

export function PlatformDots({ badges, leer = "strich" }: {
  badges: UploadBadge[] | undefined;
  /** Was bei null Eintraegen steht: ein Strich (Tabelle — die Spalte braucht
   *  einen Wert) oder drei leere Ringe (Raster — dort ist die Luecke selbst
   *  die Nachricht). */
  leer?: "strich" | "ringe";
}) {
  if ((!badges || badges.length === 0) && leer === "strich") {
    return <span style={{ fontSize: 11, color: C.onSecondaryFixedVar, opacity: 0.4 }}>–</span>;
  }
  const byPlatform = new Map((badges ?? []).map(b => [b.platform, b]));
  // Ein Punkt mit Link öffnet ihn — mit einer unsichtbaren Trefferfläche von
  // 16 px, denn 7 px trifft niemand. Der Klick wählt die Zeile nicht aus.
  return (
    <span style={{ display: "inline-flex", gap: 0, alignItems: "center" }}>
      {(["beatstars", "soundcloud", "youtube"] as PlatformKey[]).map(p => {
        const b = byPlatform.get(p);
        const label = PLATFORM_CONFIG[p].label;
        const punkt = !b
          ? <span style={{ width: 7, height: 7, borderRadius: "50%", border: `1px solid ${C.border20}`, boxSizing: "border-box" }} />
          : <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: b.status === "uploaded" ? PLATFORM_CONFIG[p].color : "transparent",
              border: `2px solid ${PLATFORM_CONFIG[p].color}`,
              boxSizing: "border-box",
            }} />;
        const link = b?.url && /^https?:\/\//i.test(b.url) ? b.url : null;
        const titel = !b ? `${label}: offen`
          : `${label}: ${b.status === "uploaded" ? "hochgeladen" : "geplant"}${link ? " · öffnen" : ""}`;
        const flaeche: React.CSSProperties = {
          width: 15, height: 16, padding: 0, border: "none", background: "transparent",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        };
        return link ? (
          <button
            key={p}
            type="button"
            title={titel}
            onClick={e => { e.stopPropagation(); openUrl(link).catch(() => window.open(link, "_blank")); }}
            onDoubleClick={e => e.stopPropagation()}
            style={{ ...flaeche, cursor: "pointer", borderRadius: 4 }}
          >
            {punkt}
          </button>
        ) : (
          <span key={p} title={titel} style={flaeche}>{punkt}</span>
        );
      })}
    </span>
  );
}

// ─── Column Header ────────────────────────────────────────────────────────────

interface ColHeaderProps {
  label: string;
  column: SortColumn;
  currentSort: SortState;
  onSort: (column: SortColumn) => void;
  flex?: number;
  align?: "left" | "center" | "right";
}

function ColHeader({ label, column, currentSort, onSort, flex = 1, align = "left" }: ColHeaderProps) {
  const isActive = currentSort.column === column;
  return (
    // Ein echter Knopf statt role="button": damit ist der Spaltenkopf auch mit
    // Tab erreichbar und reagiert auf Enter — der Klick ins Leere in Browse
    // haelt ihn ohnehin schon nicht fuer Hintergrund (NICHT_DANEBEN kennt
    // „button").
    <button
      onClick={() => onSort(column)}
      title={`Nach ${label} sortieren`}
      aria-sort={isActive ? (currentSort.direction === "asc" ? "ascending" : "descending") : "none"}
      style={{
        flex,
        fontSize: 11, fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "0.08em", fontFamily: "inherit",
        background: "transparent", border: "none", padding: 0,
        color: isActive ? C.primary : C.onSecondaryFixedVar,
        cursor: "pointer", userSelect: "none",
        display: "flex", alignItems: "center", gap: 4,
        justifyContent: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start",
      }}
      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = C.onSurface; }}
      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = C.onSecondaryFixedVar; }}
    >
      {label}
      {isActive && (currentSort.direction === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
    </button>
  );
}

// ─── Beat Row ─────────────────────────────────────────────────────────────────

interface BeatRowProps {
  beat: Beat;
  isSelected: boolean;
  /** Laeuft dieser Beat gerade im Player? */
  isCurrentBeat: boolean;
  isThisPlaying: boolean;
  isThisLoading: boolean;
  onSelectBeat: (beat: Beat) => void;
  onToggleFavorite: (beatId: string) => void;
  onPlayBeat: (beat: Beat) => void;
  onTogglePlay: () => void;
  badges: UploadBadge[] | undefined;
}

// Der Audio-State kommt bewusst als Props von oben statt per Context: ein
// Context-Abo in jeder Zeile umgeht memo, und dann rendert schon das Ziehen am
// Lautstaerkeregler die ganze Seite neu.
const BeatRow = memo(function BeatRow({
  beat, isSelected, isCurrentBeat, isThisPlaying, isThisLoading,
  onSelectBeat, onToggleFavorite, onPlayBeat, onTogglePlay, badges,
}: BeatRowProps) {
  const isFav = beat.favorite === 1;

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCurrentBeat) {
      onTogglePlay();
    } else {
      onPlayBeat(beat);
    }
  };

  return (
    <div
      data-beat-id={beat.id}
      onClick={() => onSelectBeat(beat)}
      // Doppelklick spielt ab — ausser auf den Buttons, die schon eigene
      // Klick-Bedeutungen haben.
      onDoubleClick={e => {
        if ((e.target as HTMLElement).closest("button")) return;
        onPlayBeat(beat);
      }}
      className="beatos-zeile ar-tz"
      style={{
        "--c": (STATUS_CONFIG[beat.status ?? "idea"] ?? STATUS_CONFIG.idea).color,
        position: "relative",
        display: "flex",
        alignItems: "center",
        padding: "13px 20px",
        // Zeile in einer gemeinsamen Flaeche: die Trennung macht die Haarlinie
        // (siehe ZEILEN_CSS), die Auswahl eine Stufe mehr Helligkeit.
        background: isSelected ? C.surfaceContainerHigh : "transparent",
        // Laufender Beat: Akzentbalken links, ohne das Layout zu verschieben.
        boxShadow: isCurrentBeat ? `inset 3px 0 0 ${C.primary}` : "none",
        cursor: "pointer",
        transition: "background 0.2s, transform 0.2s",
        gap: 0,
      } as React.CSSProperties}
      onMouseEnter={e => {
        if (!isSelected) (e.currentTarget as HTMLElement).style.background = C.surfaceContainer;
      }}
      onMouseLeave={e => {
        if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      {/* Play Button */}
      <div style={{ width: 44, flexShrink: 0 }}>
        <button
          onClick={handlePlay}
          style={{
            width: 30, height: 30, borderRadius: "50%",
            background: isCurrentBeat ? C.primary : C.surfaceContainerHighest,
            border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background 0.15s",
            flexShrink: 0,
          }}
        >
          {isThisLoading
            ? <Loader2 size={13} color={isCurrentBeat ? C.onPrimary : C.onSurfaceVariant} style={{ animation: "spin 1s linear infinite" }} />
            : isThisPlaying
              ? <Pause size={13} fill={isCurrentBeat ? C.onPrimary : C.onSurfaceVariant} color={isCurrentBeat ? C.onPrimary : C.onSurfaceVariant} />
              : <Play size={13} fill={isCurrentBeat ? C.onPrimary : C.onSurfaceVariant} color={isCurrentBeat ? C.onPrimary : C.onSurfaceVariant} style={{ marginLeft: 2 }} />
          }
        </button>
      </div>

      {/* ID */}
      <div style={{ width: 80, flexShrink: 0, fontSize: 12, fontFamily: "monospace", color: C.primary, fontWeight: 700 }}>
        B{beat.id}
      </div>

      {/* Name */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <span style={{
          fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em",
          color: isCurrentBeat ? C.primary : C.onSurface,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {beat.name}
        </span>
      </div>

      {/* Key */}
      <div style={{ width: 90, flexShrink: 0, fontSize: 12, fontWeight: 500, color: C.onSurfaceVariant }}>
        {beat.key || "–"}
      </div>

      {/* BPM */}
      <div style={{ width: 60, flexShrink: 0, fontSize: 12, fontWeight: 500, color: C.onSurfaceVariant }}>
        {beat.bpm || "–"}
      </div>

      {/* Status */}
      <div style={{ width: 100, flexShrink: 0, display: "flex", justifyContent: "center" }}>
        <StatusPill status={beat.status ?? "idea"} />
      </div>

      {/* Upload platforms */}
      <div style={{ width: 70, flexShrink: 0, display: "flex", justifyContent: "center" }}>
        <PlatformDots badges={badges} />
      </div>

      {/* Favorite */}
      <div style={{ width: 44, flexShrink: 0, display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={e => { e.stopPropagation(); onToggleFavorite(beat.id); }}
          style={{ background: "none", border: "none", cursor: "pointer", display: "inline-flex", padding: 4 }}
        >
          <Heart size={18} strokeWidth={1.5} fill={isFav ? C.primary : "none"} color={isFav ? C.primary : C.onSurfaceVariant} />
        </button>
      </div>
    </div>
  );
});

// ─── Beat Table ──────────────────────────────────────────────────────────────

/** Die Trennung zwischen zwei Zeilen — als CSS, weil ein Inline-Stil den
 *  „ausser der ersten"-Fall nicht ausdruecken kann. */
const ZEILEN_CSS = `
  .beatos-zeile + .beatos-zeile { border-top: 1px solid ${C.border10}; }
`;

export function BeatTable({ beats, selectedBeatId, onSelectBeat, onToggleFavorite, onPlayBeat, sort, onSort, uploadBadges }: BeatTableProps) {
  // Einmal abonnieren, nicht pro Zeile.
  const { currentBeat, isPlaying, isLoading, togglePlay } = useAudioPlayerContext();

  return (
    <section style={{ display: "flex", flexDirection: "column" }}>
      {/* Header Row */}
      <div style={{
        display: "flex", alignItems: "center",
        padding: "0 20px 8px",
        gap: 0,
      }}>
        {/* Play column spacer */}
        <div style={{ width: 44, flexShrink: 0 }} />
        <div style={{ width: 80, flexShrink: 0 }}>
          <ColHeader label="ID" column="id" currentSort={sort} onSort={onSort} />
        </div>
        <div style={{ flex: 1 }}>
          <ColHeader label="Name" column="name" currentSort={sort} onSort={onSort} />
        </div>
        <div style={{ width: 90, flexShrink: 0 }}>
          <ColHeader label="Tonart" column="key" currentSort={sort} onSort={onSort} />
        </div>
        <div style={{ width: 60, flexShrink: 0 }}>
          <ColHeader label="BPM" column="bpm" currentSort={sort} onSort={onSort} />
        </div>
        <div style={{ width: 100, flexShrink: 0, display: "flex", justifyContent: "center" }}>
          <ColHeader label="Status" column="status" currentSort={sort} onSort={onSort} align="center" />
        </div>
        <div style={{
          width: 70, flexShrink: 0, textAlign: "center",
          fontSize: 11, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.08em", color: C.onSecondaryFixedVar,
        }}>
          Live
        </div>
        <div style={{
          width: 44, flexShrink: 0, textAlign: "right",
          fontSize: 11, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.08em", color: C.onSecondaryFixedVar,
          display: "flex", justifyContent: "flex-end",
        }}>
          Fav
        </div>
      </div>

      {/* Rows */}
      <style>{ZEILEN_CSS}</style>
      <div style={{
        background: C.surfaceContainerLow,
        border: `1px solid ${C.border15}`,
        borderRadius: radius.card,
        overflow: "hidden",
      }}>
        {beats.map(beat => {
          const isCurrentBeat = currentBeat?.id === beat.id;
          return (
            <BeatRow
              key={beat.id}
              beat={beat}
              isSelected={selectedBeatId === beat.id}
              isCurrentBeat={isCurrentBeat}
              isThisPlaying={isCurrentBeat && isPlaying}
              isThisLoading={isCurrentBeat && isLoading}
              onSelectBeat={onSelectBeat}
              onToggleFavorite={onToggleFavorite}
              onPlayBeat={onPlayBeat}
              onTogglePlay={togglePlay}
              badges={uploadBadges[beat.id]}
            />
          );
        })}
      </div>
    </section>
  );
}
