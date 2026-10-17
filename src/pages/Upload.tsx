// src/pages/Upload.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Upload Tab — orchestrates beat selection, asset checklist, type-beat info,
// per-platform upload status, and description rendering/saving.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import { renderSignature } from "../lib/descriptions";
import { Upload as UploadIcon, AlertCircle, Loader2, CalendarDays, ChevronUp } from "lucide-react";
import { C, alpha, radius } from "../lib/theme";
import { SIDEBAR_WIDTH } from "../lib/constants";
import { GLOBAL_PLAYER_HEIGHT } from "../components/GlobalAudioPlayer";
import { useAudioPlayerContext } from "../contexts/AudioPlayerContext";
import { PageHeader, PageBody, EmptyState } from "../components/ui";
import { useUploadData } from "../hooks/useUploadData";
import {
  AssetChecklistCard,
  TypeBeatCard,
  TimecodeCard,
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
  const [planungOffen, setPlanungOffen] = useState(false);
  /** Hoehe der zugeklappten Planungs-Leiste, von ihr selbst gemessen. */
  const [dockHoehe, setDockHoehe] = useState(39);
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
    // Welche Felder dazugehören, steht in `renderSignature` — mit dem Grund
    // dabei, warum ein vergessenes Feld still unsichtbar bleibt.
    const sig = renderSignature(data.beat, beatstarsUrl);
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

  // Zurück aus FL Studio oder dem Explorer: den Ordner neu lesen. Vorher
  // zeigte die Asset-Ampel einen neuen Export erst nach einem Klick auf ↻.
  // Die Karten verlieren dabei nichts — sie setzen ihre Entwürfe nur beim
  // Beat-Wechsel zurück, nicht bei jedem Neuladen.
  useEffect(() => {
    if (!selectedBeat?.id) return;
    const zurueck = () => { refresh(); };
    window.addEventListener("focus", zurueck);
    return () => window.removeEventListener("focus", zurueck);
  }, [selectedBeat?.id, refresh]);

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
            onChanged={handleStatusChanged}
            onPlanungOeffnen={() => setPlanungOffen(true)}
          >
            {data && !error && (
              <AssetChecklistCard
                beatId={data.beat.id}
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

          {/* Die Seite liest sich von oben nach unten wie der Ablauf:
              Infos → Kapitel → Beschreibung → Status.

              Oben die Eingabe nebeneinander: Infos & Credits und Kapitel sind
              ähnlich hoch, und beide fließen in den Text darunter. Gleich hoch
              gestreckt, damit die Kanten bündig abschließen.

              Vorher stand die Beschreibung rechts neben einer Spalte aus Infos
              und Kapitel. Ihre Höhe hängt am Text — YouTube lang, BeatStars
              kurz —, und neben einer festen Spalte blieb dann entweder eine
              Lücke darunter oder eine Leere darin. Über die volle Breite hat
              sie keinen Nachbarn mehr, der eine Höhe vorgibt.

              auto-fit: bricht bei schmalem Fenster auf eine Spalte um, statt
              hinter PageBodys overflowX:hidden abgeschnitten zu werden. */}
          {data && !error && (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
              gap: 24,
              alignItems: "stretch",
            }}>
              <TypeBeatCard beat={data.beat} onSaved={refresh}>
                <SampleCreditsCard bare beatId={data.beat.id} onSaved={refresh} />
              </TypeBeatCard>
              <TimecodeCard beat={data.beat} flpPath={data.assets.flp_path} onSaved={refresh} />
            </div>
          )}

          {data && !error && (
            <DescriptionFilesCard
              beatId={data.beat.id}
              rerenderKey={rerenderKey}
              beatstarsUrl={data.uploads.find(x => x.platform === "beatstars")?.url ?? null}
            />
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

          {/* Luft fuer die fixierte Planungs-Leiste am unteren Rand — die
              Hoehe misst die Leiste selbst und meldet sie herauf. */}
          <div style={{ height: dockHoehe + 16, flexShrink: 0 }} />
      </PageBody>

      {/* Planung — fixiert am unteren Rand, klappt nach oben auf */}
      <PlannerDock onHoehe={setDockHoehe} open={planungOffen} setOpen={setPlanungOffen}>
        <PlannerStrip
          refreshKey={plannerRefresh}
          beatId={data?.beat.id ?? null}
          beatName={data?.beat.name ?? null}
          uploads={data?.uploads ?? null}
          onChanged={handleStatusChanged}
          onSelectBeat={id => {
            api.beats.getById(id).then(b => { if (b) setSelectedBeat(b); }).catch(() => {});
          }}
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
function PlannerDock({ children, onHoehe, open, setOpen }: {
  children: React.ReactNode;
  /** Von außen steuerbar: „Planen" im Kopf klappt die Leiste auf. */
  open: boolean;
  setOpen: (f: (o: boolean) => boolean) => void;
  /** Meldet die gemessene Hoehe nach oben — daraus entsteht die Luft am Seitenende. */
  onHoehe: (px: number) => void;
}) {
  const { currentBeat } = useAudioPlayerContext();
  const bottom = currentBeat ? GLOBAL_PLAYER_HEIGHT : 0;

  // Statt einer geschaetzten Konstante: die Leiste misst sich selbst.
  // Vorher stand hier `PLANNER_DOCK_HEIGHT = 39` — eine Zahl, die von Hand zur
  // Knopfhoehe passen musste. Jede Aenderung an Polsterung oder Schriftgroesse
  // haette sie stillschweigend falsch gemacht, und die letzte Karte waere
  // unter der Leiste verschwunden. ResizeObserver kann das ohne Bibliothek.
  const leiste = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = leiste.current;
    if (!el) return;
    const beobachter = new ResizeObserver(([eintrag]) => {
      onHoehe(eintrag.contentRect.height);
    });
    beobachter.observe(el);
    return () => beobachter.disconnect();
  }, [onHoehe]);

  return (
    <div ref={leiste} style={{
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
          fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
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
      borderRadius: radius.card,
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
      background: alpha(C.error, 0.08),
      border: `1px solid ${alpha(C.error, 0.30)}`,
      borderRadius: radius.card,
    }}>
      <AlertCircle size={16} color={C.error} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 1 }} />
      <span style={{ fontSize: 12, color: C.error, lineHeight: 1.5 }}>
        {message}
      </span>
    </div>
  );
}
