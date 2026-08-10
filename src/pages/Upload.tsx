// src/pages/Upload.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Upload Tab — orchestrates beat selection, asset checklist, type-beat info,
// per-platform upload status, and description rendering/saving.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { Upload as UploadIcon, AlertCircle, Loader2 } from "lucide-react";
import { C } from "../lib/theme";
import { PageHeader, PageBody, EmptyState } from "../components/ui";
import { useUploadData } from "../hooks/useUploadData";
import {
  AssetChecklistCard,
  TypeBeatCard,
  UploadStatusCard,
  DescriptionFilesCard,
  LegacyMigrationBanner,
  ConvertFilenamesDialog,
  PlannerStrip,
  UploadBeatHeader,
} from "../components/upload";
import type { Beat } from "../types/browse";

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

          {/* Beat anchor + integrated picker: cover, title, ready progress */}
          <UploadBeatHeader
            selectedBeat={selectedBeat}
            onSelect={setSelectedBeat}
            data={!error ? data : null}
          />

          {/* Planner — always visible; click-to-schedule when a beat is selected */}
          <PlannerStrip
            refreshKey={plannerRefresh}
            beatId={data?.beat.id ?? null}
            beatName={data?.beat.name ?? null}
            uploads={data?.uploads ?? null}
            onChanged={handleStatusChanged}
          />

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

          {/* Data view — kept mounted across refreshes so input state survives.
              3 columns on wide screens:
                1) Type-Beat inputs   2) Status + Checklist   3) Description output */}
          {data && !error && (
            <div style={{
              display: "grid",
              gridTemplateColumns: "minmax(340px, 4fr) minmax(340px, 4fr) minmax(440px, 5fr)",
              gap: 24,
              alignItems: "start",
            }}>
              {/* Column 1: What is this beat? */}
              <TypeBeatCard beat={data.beat} onSaved={refresh} />

              {/* Column 2: Where does it stand? */}
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                <UploadStatusCard
                  beatId={data.beat.id}
                  uploads={data.uploads}
                  onChanged={handleStatusChanged}
                />
                <AssetChecklistCard
                  assets={data.assets}
                  beatPath={data.beat.path}
                  onRefresh={refresh}
                  onConvert={() => setConvertOpen(true)}
                />
              </div>

              {/* Column 3: The output — gets the most width */}
              <DescriptionFilesCard
                beatId={data.beat.id}
                uploadFiles={data.assets.upload_files}
                onSaved={refresh}
                rerenderKey={rerenderKey}
              />
            </div>
          )}

          {/* Bottom spacer */}
          <div style={{ height: 40, flexShrink: 0 }} />
      </PageBody>

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
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
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
