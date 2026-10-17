// src/components/browse/BeatGrid.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Cover-grid view for Browse — visual library browsing. Uses the same
// cover cache (getCoverUrl) and platform badges as the table; click selects
// (opens the detail panel), the overlay button plays.
//
// Das Cover ist die Karte. Kein Rahmen, keine Flaeche, kein Radius um das
// Ganze: das Bild ist schon ein Objekt mit Kante, ein Kasten darum ist ein
// zweiter. Darunter stehen nur zwei Zeilen Text auf dem Seitenhintergrund.
// ═══════════════════════════════════════════════════════════════════════════════

import { Fragment, memo } from "react";
import { Heart, Play, Pause, Loader2, Music } from "lucide-react";
import { C, radius } from "../../lib/theme";
import { StatusPill } from "../Tagpill";
import { PlatformDots, hatUploadLuecke } from "./BeatTable";
import { useAudioPlayerContext } from "../../contexts/AudioPlayerContext";
import type { Beat, UploadBadgeMap } from "../../types/browse";

interface BeatGridProps {
  beats: Beat[];
  selectedBeatId: string | null;
  onSelectBeat: (beat: Beat) => void;
  onToggleFavorite: (beatId: string) => void;
  onPlayBeat: (beat: Beat) => void;
  getCoverUrl: (beatId: string) => string | null;
  uploadBadges: UploadBadgeMap;
  /** Monatsueberschriften einblenden — nur sinnvoll bei chronologischer Sicht. */
  gruppiereNachMonat?: boolean;
}

const MONATE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

/** „2026 · August" aus einem ISO-Datum. `null`, wenn keins da ist. */
function monatsTitel(datum: string | null): string | null {
  if (!datum) return null;
  const [jahr, monat] = datum.split("-");
  const i = Number(monat) - 1;
  if (!jahr || i < 0 || i > 11) return null;
  return `${jahr} · ${MONATE[i]}`;
}

/** Nur beim erstem Beat eines Monats steht die Ueberschrift — die Liste ist
 *  chronologisch sortiert, ein Wechsel zum Vorgaenger genuegt als Signal. */
function istMonatswechsel(beats: Beat[], i: number): string | null {
  const titel = monatsTitel(beats[i].created_date);
  if (!titel) return null;
  if (i === 0) return titel;
  return monatsTitel(beats[i - 1].created_date) === titel ? null : titel;
}

export function BeatGrid({
  beats, selectedBeatId, onSelectBeat, onToggleFavorite, onPlayBeat, getCoverUrl, uploadBadges,
  gruppiereNachMonat = false,
}: BeatGridProps) {
  // Einmal abonnieren, nicht pro Karte — siehe Kommentar in BeatTable.
  const { currentBeat, isPlaying, isLoading, togglePlay } = useAudioPlayerContext();

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
      gap: 14,
    }}>
      {/* Beim Ueberfahren zoomt das Cover in seinem festen Rahmen, statt dass
          die Karte springt: 200 Karten, die sich beim Durchfahren heben,
          machen das Raster unruhig. */}
      <style>{`
        .beatos-karte:hover .beatos-fav { opacity: 1 !important; }
        .beatos-cover { transition: transform 0.28s ease; }
        .beatos-karte:hover .beatos-cover { transform: scale(1.05); }
        @media (prefers-reduced-motion: reduce) {
          .beatos-cover, .beatos-karte:hover .beatos-cover { transition: none; transform: none; }
        }
      `}</style>
      {beats.map((beat, i) => {
        const isCurrentBeat = currentBeat?.id === beat.id;
        const monat = gruppiereNachMonat ? istMonatswechsel(beats, i) : null;
        return (
          <Fragment key={`gruppe-${beat.id}`}>
          {/* Ueber die ganze Rasterbreite, klebt beim Scrollen oben an:
              212 Beats in 21 Reihen ohne Landmarken sind eine Flaeche, keine
              Liste. Der Monat ist die Ordnung, in der das Archiv auch auf der
              Platte liegt. */}
          {monat && (
            <div style={{
              gridColumn: "1 / -1",
              position: "sticky", top: 0, zIndex: 2,
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 2px 8px",
              background: C.background,
              fontSize: 12, fontWeight: 700,
              color: C.onSurfaceVariant,
              letterSpacing: "0.08em", textTransform: "uppercase",
            }}>
              {monat}
              <span style={{ flex: 1, height: 1, background: C.border10 }} />
            </div>
          )}
          <GridCard
            key={beat.id}
            beat={beat}
            isSelected={selectedBeatId === beat.id}
            isCurrentBeat={isCurrentBeat}
            isThisPlaying={isCurrentBeat && isPlaying}
            isThisLoading={isCurrentBeat && isLoading}
            coverUrl={getCoverUrl(beat.id)}
            badges={uploadBadges[beat.id]}
            onSelectBeat={onSelectBeat}
            onToggleFavorite={onToggleFavorite}
            onPlayBeat={onPlayBeat}
            onTogglePlay={togglePlay}
          />
          </Fragment>
        );
      })}
    </div>
  );
}

// Handler kommen als stabile Referenzen rein, nicht als frische Arrow-Funktion
// pro Karte — sonst ist das memo hier wirkungslos.
const GridCard = memo(function GridCard({
  beat, isSelected, isCurrentBeat, isThisPlaying, isThisLoading, coverUrl, badges,
  onSelectBeat, onToggleFavorite, onPlayBeat, onTogglePlay,
}: {
  beat: Beat;
  isSelected: boolean;
  isCurrentBeat: boolean;
  isThisPlaying: boolean;
  isThisLoading: boolean;
  coverUrl: string | null;
  badges: UploadBadgeMap[string] | undefined;
  onSelectBeat: (beat: Beat) => void;
  onToggleFavorite: (beatId: string) => void;
  onPlayBeat: (beat: Beat) => void;
  onTogglePlay: () => void;
}) {
  const isFav = beat.favorite === 1;
  // Die Pille zeigt nur die AUSNAHME. „Fertig" steht auf fast jedem Beat — bei
  // 212 Stueck ist das keine Auskunft mehr, sondern Textur, und die seltenen
  // Zustaende gehen darin unter. Fehlt die Pille, ist der Beat fertig.
  const status = beat.status ?? "idea";
  const zeigeStatus = status !== "finished";
  // Auswahl und Wiedergabe brauchen getrennte Sprachen, seit die Kartenflaeche
  // weg ist: Weiss heisst „ausgewaehlt", Amber heisst „laeuft gerade".
  const ring = isCurrentBeat ? C.primary : isSelected ? "rgba(255,255,255,0.55)" : null;
  // Die Punkte sind der Blick fuer „da fehlt noch was": auf SoundCloud, aber
  // nicht auf YouTube; fertig, aber nirgends hochgeladen. Ist alles draussen
  // oder noch gar nichts angefangen, bleiben sie weg.
  const luecke = hatUploadLuecke(badges, beat.status);

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCurrentBeat) onTogglePlay();
    else onPlayBeat(beat);
  };

  return (
    <div
      data-beat-id={beat.id}
      onClick={() => onSelectBeat(beat)}
      onDoubleClick={e => {
        if ((e.target as HTMLElement).closest("button")) return;
        onPlayBeat(beat);
      }}
      className="beatos-karte"
      style={{ cursor: "pointer" }}
    >
      {/* Cover */}
      <div style={{
        position: "relative",
        aspectRatio: "1 / 1",
        borderRadius: radius.card,
        overflow: "hidden",
        background: C.surfaceContainerHigh,
        display: "flex", alignItems: "center", justifyContent: "center",
        // outline statt border: liegt ausserhalb der Kante, verschiebt also
        // nichts und wird vom overflow des Covers nicht abgeschnitten.
        outline: ring ? `2px solid ${ring}` : "none",
        outlineOffset: 2,
      }}>
        {coverUrl
          ? <img
              src={coverUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="beatos-cover"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          : <Music size={32} color={C.onSecondaryFixedVar} strokeWidth={1.25} />
        }

        {/* Status oben links — eine Ausnahme gehoert auf das Objekt, nicht in
            eine Zeile darunter, die sonst leer bleibt. */}
        {zeigeStatus && (
          <div style={{ position: "absolute", left: 8, top: 8 }}>
            <StatusPill status={status} aufBild />
          </div>
        )}

        {/* Play overlay */}
        <button
          onClick={handlePlay}
          style={{
            position: "absolute", right: 8, bottom: 8,
            width: 34, height: 34, borderRadius: "50%",
            background: isCurrentBeat ? C.primary : "rgba(0,0,0,0.65)",
            border: `1px solid ${isCurrentBeat ? C.primary : "rgba(255,255,255,0.2)"}`,
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            backdropFilter: "blur(4px)",
          }}
        >
          {isThisLoading
            ? <Loader2 size={14} color={isCurrentBeat ? C.onPrimary : "#fff"} style={{ animation: "spin 1s linear infinite" }} />
            : isThisPlaying
              ? <Pause size={14} fill={isCurrentBeat ? C.onPrimary : "#fff"} color={isCurrentBeat ? C.onPrimary : "#fff"} />
              : <Play size={14} fill={isCurrentBeat ? C.onPrimary : "#fff"} color={isCurrentBeat ? C.onPrimary : "#fff"} style={{ marginLeft: 2 }} />
          }
        </button>

        {/* Favorit: sichtbar nur, wenn er einer IST — sonst erst beim
            Ueberfahren. Zweihundert leere Herzen auf zweihundert Karten sagen
            nichts; ein gefuelltes unter zweihundert sagt alles. */}
        <button
          className="beatos-fav"
          onClick={e => { e.stopPropagation(); onToggleFavorite(beat.id); }}
          title={isFav ? "Favorit entfernen" : "Als Favorit merken"}
          style={{
            position: "absolute", right: 8, top: 8,
            background: "rgba(0,0,0,0.5)", border: "none",
            borderRadius: radius.control, padding: 5,
            cursor: "pointer", display: "flex",
            backdropFilter: "blur(4px)",
            opacity: isFav ? 1 : 0,
            transition: "opacity 0.15s",
          }}
        >
          <Heart size={13} strokeWidth={1.75} fill={isFav ? C.primary : "none"} color={isFav ? C.primary : "#fff"} />
        </button>
      </div>

      {/* Zwei Zeilen, kein Kasten. Vorher standen hier drei — die dritte war
          eine reservierte Leerzeile fuer eine Pille, die meistens fehlte. */}
      <div style={{ padding: "8px 2px 0" }}>
        <div style={{
          fontSize: 12, fontWeight: 700,
          color: isCurrentBeat ? C.primary : C.onSurface,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {beat.name}
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 5,
          marginTop: 3, minWidth: 0,
          // onSurfaceVariant statt onSecondaryFixedVar: 10px in #5c5b5b auf
          // dem Seitengrund sind 2,8:1 Kontrast — lesbar ist das nicht.
          fontSize: 11, color: C.onSurfaceVariant,
        }}>
          <span style={{ fontFamily: "monospace", fontWeight: 700, flexShrink: 0 }}>#{beat.id}</span>
          {beat.key && <><Trenner />{beat.key}</>}
          {beat.bpm != null && <><Trenner />{beat.bpm}</>}
          <span style={{ flex: 1, minWidth: 8 }} />
          {luecke && <PlatformDots badges={badges} leer="ringe" />}
        </div>
      </div>
    </div>
  );
});

/** Der Punkt zwischen den Angaben — leiser als die Angaben selbst. */
function Trenner() {
  return <span style={{ color: C.onSecondaryFixedVar, flexShrink: 0 }}>·</span>;
}
