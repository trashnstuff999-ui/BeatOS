// src/components/upload/UploadStatusCard.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Per-platform upload tracking as a compact table: one row per platform
// (icon+name | status segments | date), URL row appears under an uploaded
// platform. Picking a date on a draft row promotes it to "scheduled" in the
// same write. All writes go through update_upload_status — logic unchanged.
// Colors come from PLATFORM_CONFIG / UPLOAD_STATUS_CONFIG (theme.ts).
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { ShoppingBag, Music2, Youtube, Calendar, Link2, ExternalLink, Send, Rocket } from "lucide-react";
import { C, PLATFORM_CONFIG, UPLOAD_STATUS_CONFIG } from "../../lib/theme";
import { SectionCard } from "./SectionCard";
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

export function UploadStatusCard({ beatId, uploads, onChanged }: UploadStatusCardProps) {
  return (
    <SectionCard icon={Send} title="Upload Status">
      <div style={{ display: "flex", flexDirection: "column" }}>
        {uploads.map((row, i) => (
          <PlatformRow
            key={row.platform}
            beatId={beatId}
            row={row}
            onChanged={onChanged}
            isFirst={i === 0}
          />
        ))}
      </div>
    </SectionCard>
  );
}

// ─── Single Platform Row ────────────────────────────────────────────────────

function PlatformRow({ beatId, row, onChanged, isFirst }: {
  beatId: string;
  row: UploadPlatformRow;
  onChanged: () => void;
  isFirst: boolean;
}) {
  const meta = PLATFORM_CONFIG[row.platform];
  const PlatIcon = PLATFORM_ICON[row.platform];
  const [urlDraft, setUrlDraft] = useState(row.url ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);

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

  return (
    <div style={{
      borderTop: isFirst ? "none" : `1px solid ${C.border10}`,
      padding: "10px 0",
    }}>
      {/* Main row: platform | assistant | segments | date */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{
          display: "flex", alignItems: "center", gap: 8,
          width: 108, flexShrink: 0,
        }}>
          <PlatIcon size={14} color={meta.color} strokeWidth={1.75} />
          <span style={{ fontSize: 12, fontWeight: 600, color: C.onSurface }}>
            {meta.label}
          </span>
        </span>

        {/* Guided upload flow */}
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
            <Rocket size={11} strokeWidth={2} />
          </button>
        )}

        {/* Segmented status control */}
        <div style={{
          display: "flex", gap: 2, flexShrink: 0,
          background: "rgba(255,255,255,0.03)",
          border: `1px solid ${C.border15}`,
          borderRadius: 7, padding: 2,
        }}>
          {STATUS_ORDER.map(s => {
            const active = row.status === s;
            const m = UPLOAD_STATUS_CONFIG[s];
            return (
              <button
                key={s}
                onClick={() => setStatus(s)}
                disabled={isSaving}
                title={m.label}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "3px 8px",
                  background: active ? m.bg : "transparent",
                  border: "none",
                  borderRadius: 5,
                  cursor: isSaving ? "wait" : "pointer",
                  fontSize: 9, fontWeight: 700,
                  color: active ? m.color : C.onSecondaryFixedVar,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  opacity: isSaving ? 0.6 : 1,
                  transition: "all 0.15s",
                }}
              >
                {active && <span style={{ width: 4, height: 4, borderRadius: "50%", background: m.color }} />}
                {m.label}
              </button>
            );
          })}
        </div>

        {/* Date — always visible; ghost label instead of raw TT.mm.jjjj */}
        <div style={{ flex: 1, position: "relative", minWidth: 120 }}>
          <Calendar size={12} color={C.onSecondaryFixedVar} strokeWidth={1.5} style={{
            position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)",
            pointerEvents: "none",
          }} />
          <input
            type="date"
            value={dateValue}
            title={row.status === "uploaded" ? "Hochgeladen am" : "Geplant für"}
            onChange={e => row.status === "uploaded"
              ? persist({ uploaded_at: e.target.value || null })
              : handleScheduledChange(e.target.value)
            }
            style={{
              width: "100%",
              padding: "6px 8px 6px 28px",
              fontSize: 11,
              background: C.surfaceContainerLowest,
              border: `1px solid ${C.border15}`,
              borderRadius: 6,
              outline: "none",
              color: dateValue ? C.onSurface : "transparent",
              colorScheme: "dark",
              boxSizing: "border-box",
            }}
          />
          {!dateValue && (
            <span style={{
              position: "absolute", left: 28, top: "50%", transform: "translateY(-50%)",
              fontSize: 11, color: C.onSecondaryFixedVar,
              pointerEvents: "none",
            }}>
              Datum wählen
            </span>
          )}
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

      {/* URL row (uploaded only) */}
      {row.status === "uploaded" && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          marginTop: 8, paddingLeft: 118,
        }}>
          <Link2 size={12} color={C.onSecondaryFixedVar} strokeWidth={1.5} style={{ flexShrink: 0 }} />
          <input
            value={urlDraft}
            onChange={e => setUrlDraft(e.target.value)}
            onBlur={handleUrlBlur}
            placeholder={`https://...${row.platform}...`}
            style={{
              flex: 1,
              padding: "5px 9px",
              fontSize: 11,
              fontFamily: "monospace",
              background: C.surfaceContainerLowest,
              border: `1px solid ${C.border15}`,
              borderRadius: 6,
              outline: "none",
              color: C.onSurface,
            }}
          />
          {row.url && (
            <button
              onClick={() => row.url && window.open(row.url, "_blank")}
              title="URL öffnen"
              style={{
                width: 24, height: 24, borderRadius: 5, flexShrink: 0,
                background: "transparent",
                border: `1px solid ${C.border15}`,
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: C.onSurfaceVariant,
              }}
            >
              <ExternalLink size={11} />
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
