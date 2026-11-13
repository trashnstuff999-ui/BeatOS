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
import { C, STATUS_CONFIG } from "../../lib/theme";
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
      gap: "24px 20px",
    }}>
      {/* Beim Ueberfahren zoomt das Cover in seinem festen Rahmen, statt dass
          die Karte springt: 200 Karten, die sich beim Durchfahren heben,
          machen das Raster unruhig. */}
      {beats.map((beat, i) => {
        // Einlauf nur für die ersten Karten — bei 200 wartete man sonst
        const lauf = Math.min(i, 24);
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
              display: "flex", alignItems: "center", gap: 12,
              padding: "16px 2px 10px",
              background: C.background,
              fontSize: 24, fontWeight: 700,
              color: C.onSurface,
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
            index={lauf}
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
  beat, isSelected, isCurrentBeat, isThisPlaying, isThisLoading, coverUrl, badges, index,
  onSelectBeat, onToggleFavorite, onPlayBeat, onTogglePlay,
}: {
  beat: Beat;
  index: number;
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
  // Look „Wucht“: Ring und Leuchten stehen in archiv-wucht.css (data-an / data-spielt),
  // die Karte leuchtet beim Hover in der Farbe ihres Status.
  const farbe = (STATUS_CONFIG[status] ?? STATUS_CONFIG.idea).color;
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
      className="ar-karte"
      data-an={isSelected}
      data-laeuft={isCurrentBeat}
      data-spielt={isThisPlaying}
      style={{ cursor: "pointer", "--c": farbe, "--i": index } as React.CSSProperties}
    >
      {/* Cover */}
      <div className="ar-cv" style={{
        position: "relative",
        aspectRatio: "1 / 1",
        borderRadius: 16,
        overflow: "hidden",
        background: C.surfaceContainerHigh,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {coverUrl
          ? <img
              src={coverUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="ar-cover"
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

        {/* Play: wie der Favorit nur beim Ueberfahren — und dauerhaft am
            laufenden und am ausgewaehlten Beat. Vierzig Knoepfe auf einmal
            machten das Raster unruhig. */}
        <button
          className="ar-play"
          onClick={handlePlay}
          title={isThisPlaying ? "Pause" : "Abspielen"}
          style={{
            position: "absolute", right: 12, bottom: 12,
            width: 46, height: 46, borderRadius: "50%",
            background: isCurrentBeat ? C.primary : farbe,
            border: "none",
            boxShadow: `0 8px 21px -5px color-mix(in srgb, ${isCurrentBeat ? C.primary : farbe} 64%, transparent)`,
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            backdropFilter: "blur(4px)",
          }}
        >
          {isThisLoading
            ? <Loader2 size={16} color="#111" style={{ animation: "spin 1s linear infinite" }} />
            : isThisPlaying
              ? <Pause size={16} fill="#111" color="#111" />
              : <Play size={16} fill="#111" color="#111" style={{ marginLeft: 2 }} />
          }
        </button>
        <span aria-hidden className="ar-eq" style={{ position: "absolute", left: 12, bottom: 14, gap: 3, alignItems: "flex-end", height: 24 }}>
          <i /><i /><i /><i />
        </span>

        {/* Favorit: sichtbar nur, wenn er einer IST — sonst erst beim
            Ueberfahren. Zweihundert leere Herzen auf zweihundert Karten sagen
            nichts; ein gefuelltes unter zweihundert sagt alles. */}
        <button
          className="ar-fav"
          data-an={isFav}
          onClick={e => { e.stopPropagation(); onToggleFavorite(beat.id); }}
          title={isFav ? "Favorit entfernen" : "Als Favorit merken"}
          style={{
            position: "absolute", right: 10, top: 10,
            width: 32, height: 32, alignItems: "center", justifyContent: "center",
            background: "rgba(10,10,10,0.65)", border: "none",
            borderRadius: "50%", padding: 0,
            cursor: "pointer", display: "flex",
            backdropFilter: "blur(6px)",
          }}
        >
          <Heart size={14} strokeWidth={1.75} fill={isFav ? C.primary : "none"} color={isFav ? C.primary : "#fff"} />
        </button>
      </div>

      {/* Zwei Zeilen, kein Kasten. Vorher standen hier drei — die dritte war
          eine reservierte Leerzeile fuer eine Pille, die meistens fehlte. */}
      <div style={{ padding: "8px 2px 0" }}>
        <div style={{
          fontSize: 15, fontWeight: 800,
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
          fontSize: 13, color: C.onSurfaceVariant,
        }}>
          <span style={{ fontFamily: "'JetBrains Mono', Consolas, monospace", fontSize: 12, color: C.onSecondaryFixedVar, flexShrink: 0 }}>B{beat.id}</span>
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
