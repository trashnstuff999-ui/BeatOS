// src/components/upload/UploadStatusCard.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Per-platform upload tracking: status pill, schedule date, final URL.
// All writes go through update_upload_status (upsert).
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { ShoppingBag, Music2, Youtube, Calendar, Link2, ExternalLink } from "lucide-react";
import { C } from "../../lib/theme";
import { Card, Label } from "../ui";
import { api } from "../../lib/api";
import type { UploadPlatformRow, UploadPlatform, UploadStatus } from "../../types/upload";

interface UploadStatusCardProps {
  beatId: string;
  uploads: UploadPlatformRow[];
  onChanged: () => void;
}

const PLATFORM_META: Record<UploadPlatform, { label: string; icon: React.ElementType; color: string }> = {
  beatstars:  { label: "Beatstars",  icon: ShoppingBag, color: "#ff3366" },
  soundcloud: { label: "SoundCloud", icon: Music2,      color: "#ff7700" },
  youtube:    { label: "YouTube",    icon: Youtube,     color: "#ff0033" },
};

const STATUS_ORDER: UploadStatus[] = ["draft", "scheduled", "uploaded"];

const STATUS_META: Record<UploadStatus, { label: string; color: string; bg: string }> = {
  draft:     { label: "Draft",     color: C.onSurfaceVariant, bg: "rgba(255,255,255,0.04)" },
  scheduled: { label: "Scheduled", color: "#fda124",          bg: "rgba(253,161,36,0.12)" },
  uploaded:  { label: "Uploaded",  color: "#34d399",          bg: "rgba(52,211,153,0.12)" },
};

export function UploadStatusCard({ beatId, uploads, onChanged }: UploadStatusCardProps) {
  return (
    <Card accent="#fda124">
      <Label style={{ marginBottom: 14 }}>Upload Status</Label>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {uploads.map(row => (
          <PlatformRow
            key={row.platform}
            beatId={beatId}
            row={row}
            onChanged={onChanged}
          />
        ))}
      </div>
    </Card>
  );
}

// ─── Single Platform Row ────────────────────────────────────────────────────

function PlatformRow({ beatId, row, onChanged }: {
  beatId: string;
  row: UploadPlatformRow;
  onChanged: () => void;
}) {
  const meta = PLATFORM_META[row.platform];
  const PlatIcon = meta.icon;
  const [urlDraft, setUrlDraft] = useState(row.url ?? "");
  const [isSaving, setIsSaving] = useState(false);

  // The row layout is the same for every platform; status governs which
  // detail rows (date / URL) are visible underneath.
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

  const cycleStatus = () => {
    const idx = STATUS_ORDER.indexOf(row.status);
    const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];

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

  const handleUrlBlur = () => {
    if ((urlDraft || null) !== (row.url || null)) {
      persist({ url: urlDraft.trim() || null });
    }
  };

  const handleOpenUrl = () => {
    if (row.url) window.open(row.url, "_blank");
  };

  return (
    <div style={{
      padding: 12,
      background: C.surfaceContainerLowest,
      border: `1px solid ${C.border15}`,
      borderRadius: 8,
    }}>
      {/* Top line: platform + status pill */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <PlatIcon size={16} color={meta.color} strokeWidth={1.75} />
        <span style={{
          flex: 1,
          fontSize: 12, fontWeight: 700, color: C.onSurface,
          letterSpacing: "0.03em",
        }}>
          {meta.label}
        </span>
        <button
          onClick={cycleStatus}
          disabled={isSaving}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "5px 10px",
            background: STATUS_META[row.status].bg,
            border: `1px solid ${STATUS_META[row.status].color}40`,
            borderRadius: 6,
            cursor: isSaving ? "wait" : "pointer",
            fontSize: 10, fontWeight: 700,
            color: STATUS_META[row.status].color,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            opacity: isSaving ? 0.6 : 1,
          }}
          title="Click to cycle: Draft → Scheduled → Uploaded"
        >
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: STATUS_META[row.status].color,
          }} />
          {STATUS_META[row.status].label}
        </button>
      </div>

      {/* Scheduled date row */}
      {(row.status === "scheduled" || row.status === "uploaded") && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          marginTop: 10, paddingTop: 10,
          borderTop: `1px solid ${C.border10}`,
        }}>
          <Calendar size={13} color={C.onSecondaryFixedVar} strokeWidth={1.5} />
          <span style={{ fontSize: 10, fontWeight: 700, color: C.onSecondaryFixedVar, letterSpacing: "0.05em", textTransform: "uppercase", width: 90 }}>
            {row.status === "uploaded" ? "Uploaded on" : "Scheduled for"}
          </span>
          <input
            type="date"
            value={row.status === "uploaded" ? (row.uploaded_at ?? "") : (row.scheduled_at ?? "")}
            onChange={e => persist(
              row.status === "uploaded"
                ? { uploaded_at: e.target.value || null }
                : { scheduled_at: e.target.value || null }
            )}
            style={{
              flex: 1,
              padding: "6px 10px",
              fontSize: 12,
              background: C.surfaceContainer,
              border: `1px solid ${C.border20}`,
              borderRadius: 6,
              outline: "none",
              color: C.onSurface,
              colorScheme: "dark",
            }}
          />
        </div>
      )}

      {/* URL row (uploaded) */}
      {row.status === "uploaded" && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          marginTop: 8,
        }}>
          <Link2 size={13} color={C.onSecondaryFixedVar} strokeWidth={1.5} />
          <span style={{ fontSize: 10, fontWeight: 700, color: C.onSecondaryFixedVar, letterSpacing: "0.05em", textTransform: "uppercase", width: 90 }}>
            URL
          </span>
          <input
            value={urlDraft}
            onChange={e => setUrlDraft(e.target.value)}
            onBlur={handleUrlBlur}
            placeholder={`https://...${row.platform}...`}
            style={{
              flex: 1,
              padding: "6px 10px",
              fontSize: 12,
              fontFamily: "monospace",
              background: C.surfaceContainer,
              border: `1px solid ${C.border20}`,
              borderRadius: 6,
              outline: "none",
              color: C.onSurface,
            }}
          />
          {row.url && (
            <button
              onClick={handleOpenUrl}
              title="Open URL"
              style={{
                width: 26, height: 26, borderRadius: 5,
                background: C.surfaceContainer,
                border: `1px solid ${C.border20}`,
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: C.onSurfaceVariant,
              }}
            >
              <ExternalLink size={12} />
            </button>
          )}
        </div>
      )}
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
