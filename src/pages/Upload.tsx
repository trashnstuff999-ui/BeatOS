// src/pages/Upload.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Upload Tab — orchestrates beat selection, asset checklist, type-beat info,
// per-platform upload status, and description rendering/saving.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { Upload as UploadIcon, AlertCircle, Loader2, CalendarDays, ChevronUp } from "lucide-react";
import { C } from "../lib/theme";
import { SIDEBAR_WIDTH } from "../lib/constants";
import { GLOBAL_PLAYER_HEIGHT } from "../components/GlobalAudioPlayer";
import { useAudioPlayerContext } from "../contexts/AudioPlayerContext";
import { PageHeader, PageBody, EmptyState } from "../components/ui";
import { useUploadData } from "../hooks/useUploadData";
import {
  AssetChecklistCard,
  TypeBeatCard,
  SampleCreditsCard,
  UploadStatusCard,
  DescriptionFilesCard,
  LegacyMigrationBanner,
  ConvertFilenamesDialog,
  PlannerStrip,
  UploadBeatHeader,
} from "../components/upload";
import { api } from "../lib/api";
import type { Beat } from "../types/browse";

/** Schluessel fuer die zuletzt gewaehlte Beat-ID. */
const LETZTER_BEAT = "beatos.upload.letzterBeat";

export default function Upload() {
  const location = useLocation();
  const navState = (location.state as { beatId?: string } | null) ?? null;

  const [selectedBeat, setSelectedBeat] = useState<Beat | null>(null);
  const [convertOpen, setConvertOpen]   = useState(false);
  const [plannerRefresh, setPlannerRefresh] = useState(0);
  const { data, isLoading, error, refresh } = useUploadData(selectedBeat?.id ?? null);

  // Status/date changes must also update the planner strip
  const handleStatusChanged = () => {
    refresh();
    setPlannerRefresh(k => k + 1);
  };

  // Re-render trigger for DescriptionFilesCard: bump only when a field that
  // actually appears in the rendered output changes — NOT on every refresh.
  // Using a string-hash keeps it stable across unrelated `data` ref churn.
  const rerenderKey = useMemo(() => {
    if (!data) return 0;
    const beatstarsUrl = data.uploads.find(u => u.platform === "beatstars")?.url ?? "";
    const sig = [
      data.beat.type_beat_main      ?? "",
      data.beat.type_beat_also_fits ?? "",
      data.beat.genre_tags          ?? "",
      data.beat.youtube_tags        ?? "",
      data.beat.soundcloud_tags     ?? "",
      beatstarsUrl,
    ].join("|");
    // Tiny djb2-style hash → stable number, changes only when sig changes.
    let h = 5381;
    for (let i = 0; i < sig.length; i++) h = ((h << 5) + h + sig.charCodeAt(i)) | 0;
    return h;
  }, [data]);

  // Allow deep-linking from other tabs (e.g. DetailPanel "Make Upload Ready")
  useEffect(() => {
    const incoming = navState?.beatId;
    if (incoming && incoming !== selectedBeat?.id) {
      // Fetch full beat row to seed the selector. We'll let useUploadData
      // handle the data-load; the selector display just needs id + name.
      setSelectedBeat({
        id: incoming,
        name: "",
        path: null, bpm: null, key: null, status: null, tags: null,
        favorite: null, created_date: null, modified_date: null,
        notes: null, sold_to: null, has_artwork: null, has_video: null,
      });
    }
  }, [navState?.beatId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Zuletzt gewählten Beat merken und beim Start wiederherstellen.
  //
  // BeatOS liegt neben FL Studio offen; jeder Neustart warf einen bisher
  // zurück auf „Beat wählen…", obwohl man mitten in der Arbeit an genau
  // diesem Beat war. Gespeichert wird nur die ID, die Zeile kommt frisch aus
  // der Datenbank — so zeigt sie nie einen veralteten Namen.
  useEffect(() => {
    if (navState?.beatId) return;        // Deep-Link von einem anderen Tab gewinnt
    const gemerkt = localStorage.getItem(LETZTER_BEAT);
    if (!gemerkt) return;
    api.beats.getById(gemerkt)
      .then(b => { if (b) setSelectedBeat(b); })
      .catch(() => localStorage.removeItem(LETZTER_BEAT));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedBeat?.id) localStorage.setItem(LETZTER_BEAT, selectedBeat.id);
    else localStorage.removeItem(LETZTER_BEAT);
  }, [selectedBeat?.id]);

  // Once data lands, mirror real beat name/key/bpm onto the selector pill.
  useEffect(() => {
    if (!data || !selectedBeat) return;
    if (selectedBeat.name) return;
    setSelectedBeat(prev => prev ? {
      ...prev,
      name: data.beat.name,
      path: data.beat.path,
      bpm: data.beat.bpm,
      key: data.beat.key,
    } : null);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{
      height: "100%",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      background: C.background,
    }}>
      {/* Header */}
      <PageHeader icon={UploadIcon} title="Upload" />

      {/* Content */}
      <PageBody gap={32}>

          {/* Beat anchor + integrated picker: cover, title, ready progress.
              Die Asset-Ampel haengt in derselben Karte — sie beantwortet
              dieselbe Frage („wie weit bin ich") und war vorher eine eigene
              Karte fuer eine Zeile Inhalt. */}
          <UploadBeatHeader
            selectedBeat={selectedBeat}
            onSelect={setSelectedBeat}
            data={!error ? data : null}
          >
            {data && !error && (
              <AssetChecklistCard
                bare
                assets={data.assets}
                beatPath={data.beat.path}
                onRefresh={refresh}
                onConvert={() => setConvertOpen(true)}
              />
            )}
          </UploadBeatHeader>

          {/* Loading / Error / Empty
              LoadingBanner only on the first load (when there's no data yet).
              Background refreshes after a save must not unmount the cards —
              that would steal input focus and feel like the page is flashing.
          */}
          {!selectedBeat && (
            <UploadEmptyState />
          )}
          {selectedBeat && isLoading && !data && (
            <LoadingBanner />
          )}
          {selectedBeat && error && (
            <ErrorBanner message={error} />
          )}

          {/* Legacy migration banner — sits above the cards so structural
              issues are addressed before the user tunes type-beat info etc. */}
          {data && !error && (
            <LegacyMigrationBanner
              beatId={data.beat.id}
              refreshKey={rerenderKey}
              onMigrated={refresh}
            />
          )}

          {/* Arbeitsflaeche: Eingabe links, Ausgabe rechts — was links steht,
              erzeugt rechts den Text. Vorher stand der Status dazwischen, und
              der Blick sprang bei jedem Beat links-rechts-mitte.
              auto-fit: bricht bei schmalem Fenster auf eine Spalte um, statt
              hinter PageBodys overflowX:hidden abgeschnitten zu werden. */}
          {data && !error && (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
              gap: 24,
              // stretch statt start: die rechte Spalte zieht auf die Hoehe der
              // linken, damit unten kein halbes Fenster leer bleibt.
              alignItems: "stretch",
            }}>
              {/* Eingabe — Infos und Credits liegen auf einer Flaeche, durch
                  Haarlinien getrennt. Beides gehoert zum selben Beat und
                  fliesst in dieselbe Beschreibung; zwei Kaesten dafuer waren
                  eine Trennung ohne Bedeutung. */}
              <TypeBeatCard beat={data.beat} onSaved={refresh}>
                <SampleCreditsCard bare beatId={data.beat.id} onSaved={refresh} />
              </TypeBeatCard>

              {/* Ausgabe.
                  Die Karte haengt absolut in dieser Huelle, damit ihr Inhalt
                  die Zeilenhoehe nicht mitbestimmt: sonst zoege das Aufklappen
                  des Volltexts die ganze Zeile nach unten. So gibt die linke
                  Spalte die Hoehe vor, und die Beschreibungen scrollen, wenn
                  nicht alles hineinpasst.
                  minHeight faengt den einspaltigen Fall ab (schmales Fenster),
                  wo es keine linke Spalte gibt, die eine Hoehe vorgibt. */}
              <div style={{ position: "relative", minHeight: 560 }}>
                <DescriptionFilesCard
                  beatId={data.beat.id}
                  uploadFiles={data.assets.upload_files}
                  onSaved={refresh}
                  rerenderKey={rerenderKey}
                  style={{ position: "absolute", inset: 0 }}
                />
              </div>
            </div>
          )}

          {/* Veroeffentlichung — der letzte Schritt, deshalb ganz unten und
              ueber die volle Breite. Als der Status noch in der linken Spalte
              stand, war die linke Haelfte doppelt so hoch wie die rechte; und
              die drei Plattformen liegen als Kacheln nebeneinander, sodass
              sich kein Feld ueber das halbe Fenster streckt. */}
          {data && !error && (
            <UploadStatusCard
              beatId={data.beat.id}
              uploads={data.uploads}
              onChanged={handleStatusChanged}
            />
          )}

          {/* Luft fuer die fixierte Planungs-Leiste am unteren Rand */}
          <div style={{ height: PLANNER_DOCK_HEIGHT + 16, flexShrink: 0 }} />
      </PageBody>

      {/* Planung — fixiert am unteren Rand, klappt nach oben auf */}
      <PlannerDock>
        <PlannerStrip
          refreshKey={plannerRefresh}
          beatId={data?.beat.id ?? null}
          beatName={data?.beat.name ?? null}
          uploads={data?.uploads ?? null}
          onChanged={handleStatusChanged}
        />
      </PlannerDock>

      {/* Convert-filenames dialog (modal overlay) */}
      {convertOpen && data && (
        <ConvertFilenamesDialog
          beatId={data.beat.id}
          onClose={() => setConvertOpen(false)}
          onApplied={refresh}
        />
      )}
    </div>
  );
}

// ─── Sub-views ───────────────────────────────────────────────────────────────

/** Der Planer beantwortet „was steht diese Woche an", nicht „was mache ich mit
 *  diesem Song". Deshalb liegt er als schmale Leiste am unteren Fensterrand
 *  und klappt bei Bedarf nach oben auf — ueber dem Player, wenn der laeuft. */
function PlannerDock({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { currentBeat } = useAudioPlayerContext();
  const bottom = currentBeat ? GLOBAL_PLAYER_HEIGHT : 0;

  return (
    <div style={{
      position: "fixed",
      bottom, left: SIDEBAR_WIDTH, right: 0,
      zIndex: 90,
      background: C.surfaceContainerLow,
      borderTop: `1px solid ${C.border15}`,
      boxShadow: open ? "0 -12px 40px rgba(0,0,0,0.45)" : "none",
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={open ? "Planung zuklappen" : "Planung aufklappen"}
        style={{
          width: "100%",
          display: "flex", alignItems: "center", gap: 8,
          padding: "9px 24px",
          background: "transparent", border: "none",
          cursor: "pointer",
          fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
          textTransform: "uppercase", color: C.onSurfaceVariant,
        }}
      >
        <CalendarDays size={13} strokeWidth={1.75} />
        Planung
        <span style={{ flex: 1 }} />
        <ChevronUp
          size={14}
          strokeWidth={2}
          style={{ transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0)" }}
        />
      </button>
      {open && <div style={{ padding: "0 24px 20px" }}>{children}</div>}
    </div>
  );
}

/** Hoehe der zugeklappten Dock-Leiste — so viel Luft braucht die Seite unten,
 *  damit die letzte Karte nicht darunter verschwindet. */
const PLANNER_DOCK_HEIGHT = 39;

function UploadEmptyState() {
  return (
    <EmptyState
      icon={UploadIcon}
      title="Kein Beat ausgewählt"
      description="Wähle oben einen archivierten Beat, um ihn für den Upload vorzubereiten."
    />
  );
}

function LoadingBanner() {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "14px 18px",
      background: C.surfaceContainerLowest,
      border: `1px solid ${C.border15}`,
      borderRadius: 10,
      fontSize: 12, color: C.onSurfaceVariant,
    }}>
      <Loader2 size={14} color={C.primary} style={{ animation: "spin 0.8s linear infinite" }} />
      Beat-Daten werden geladen …
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 12,
      padding: "14px 18px",
      background: "rgba(229,72,77,0.08)",
      border: "1px solid rgba(229,72,77,0.30)",
      borderRadius: 10,
    }}>
      <AlertCircle size={16} color={C.error} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 1 }} />
      <span style={{ fontSize: 12, color: C.error, lineHeight: 1.5 }}>
        {message}
      </span>
    </div>
  );
}
