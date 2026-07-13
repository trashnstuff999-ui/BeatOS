// src/pages/Settings.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Settings Page — configure paths and app preferences
// ═══════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, CheckCircle, AlertCircle, HardDrive, Archive, Image, User, Mail, Instagram, Music2, Youtube, ShoppingBag } from "lucide-react";
import { C, commonStyles } from "../lib/theme";
import { useSettings } from "../contexts/SettingsContext";
import type { AppSettings } from "../contexts/SettingsContext";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function pickFolder(title: string): Promise<string | null> {
  try {
    const result = await open({ directory: true, multiple: false, title });
    return result as string | null;
  } catch {
    return null;
  }
}

// ─── Section Component ───────────────────────────────────────────────────────

function Section({ title, description, children }: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background: C.surfaceContainerLowest,
      border: `1px solid ${C.border10}`,
      borderRadius: 12,
      padding: 28,
    }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.onSurface, letterSpacing: "-0.01em" }}>
          {title}
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: C.onSurfaceVariant }}>
          {description}
        </p>
      </div>
      {children}
    </div>
  );
}

// ─── Path Input ──────────────────────────────────────────────────────────────

function PathInput({ label, icon: Icon, value, placeholder, onBrowse, onChange }: {
  label: string;
  icon: React.ElementType;
  value: string;
  placeholder: string;
  onBrowse: () => void;
  onChange: (v: string) => void;
}) {
  const hasValue = value.trim().length > 0;
  return (
    <div>
      <label style={{ fontSize: 10, fontWeight: 700, color: C.onSurfaceVariant, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 8 }}>
        {label}
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: C.surfaceContainerHighest,
          border: `1px solid ${hasValue ? C.primary + "40" : C.border20}`,
          borderRadius: 8,
          padding: "0 14px",
          transition: "border-color 0.15s",
        }}>
          <Icon size={14} color={hasValue ? C.primary : C.onSurfaceVariant} strokeWidth={1.5} />
          <input
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            style={{
              ...commonStyles.input,
              flex: 1,
              padding: "12px 0",
              fontSize: 12,
              fontFamily: "monospace",
              background: "transparent",
              border: "none",
              outline: "none",
              color: hasValue ? C.onSurface : C.onSurfaceVariant,
            }}
          />
          {hasValue && <CheckCircle size={14} color={C.mint} />}
        </div>
        <button
          onClick={onBrowse}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "0 16px", borderRadius: 8,
            fontSize: 11, fontWeight: 600, letterSpacing: "0.05em",
            background: C.surfaceContainerHighest,
            border: `1px solid ${C.border20}`,
            color: C.onSurfaceVariant,
            cursor: "pointer",
            whiteSpace: "nowrap",
            transition: "all 0.15s",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = C.surfaceContainerHigh;
            e.currentTarget.style.color = C.onSurface;
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = C.surfaceContainerHighest;
            e.currentTarget.style.color = C.onSurfaceVariant;
          }}
        >
          <FolderOpen size={13} strokeWidth={1.5} />
          Browse
        </button>
      </div>
    </div>
  );
}

// ─── Text Input (non-path settings) ─────────────────────────────────────────

function TextSetting({ label, icon: Icon, value, placeholder, onChange, monospace, multiline }: {
  label: string;
  icon: React.ElementType;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  monospace?: boolean;
  multiline?: boolean;
}) {
  const hasValue = value.trim().length > 0;
  return (
    <div>
      <label style={{ fontSize: 10, fontWeight: 700, color: C.onSurfaceVariant, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 8 }}>
        {label}
      </label>
      <div style={{
        display: "flex",
        alignItems: multiline ? "flex-start" : "center",
        gap: 10,
        background: C.surfaceContainerHighest,
        border: `1px solid ${hasValue ? C.primary + "40" : C.border20}`,
        borderRadius: 8,
        padding: multiline ? "10px 14px" : "0 14px",
        transition: "border-color 0.15s",
      }}>
        <Icon size={14} color={hasValue ? C.primary : C.onSurfaceVariant} strokeWidth={1.5} style={{ flexShrink: 0, marginTop: multiline ? 4 : 0 }} />
        {multiline ? (
          <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            rows={3}
            style={{
              flex: 1,
              padding: "2px 0",
              fontSize: 12,
              fontFamily: monospace ? "monospace" : "inherit",
              background: "transparent",
              border: "none",
              outline: "none",
              resize: "vertical",
              minHeight: 60,
              color: hasValue ? C.onSurface : C.onSurfaceVariant,
            }}
          />
        ) : (
          <input
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            style={{
              ...commonStyles.input,
              flex: 1,
              padding: "12px 0",
              fontSize: 12,
              fontFamily: monospace ? "monospace" : "inherit",
              background: "transparent",
              border: "none",
              outline: "none",
              color: hasValue ? C.onSurface : C.onSurfaceVariant,
            }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Draft = AppSettings;

export function Settings() {
  const { settings, isLoaded, updateSettings } = useSettings();

  // Local draft state — only applied on Save
  const [draft, setDraft] = useState<Draft>(settings);
  const [saved, setSaved] = useState(false);

  // The authoritative settings arrive async from SQLite; re-seed the draft
  // once they are in so a Save can never overwrite the DB with stale
  // localStorage values.
  useEffect(() => {
    if (isLoaded) setDraft(settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }));
  };

  const isDirty = (Object.keys(draft) as Array<keyof Draft>).some(k => draft[k] !== settings[k]);

  const handleSave = () => {
    updateSettings(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleReset = () => {
    setDraft(settings);
  };

  return (
    <div style={{
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      background: C.background,
    }}>
      {/* Header */}
      <header style={{
        height: 64, flexShrink: 0,
        ...commonStyles.glassHeader,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 32px",
        borderBottom: `1px solid ${C.border15}`,
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: C.onSurfaceVariant }}>
          Settings
        </span>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {saved && (
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.mint }}>
              <CheckCircle size={13} />
              Saved
            </span>
          )}
          {isDirty && !saved && (
            <button
              onClick={handleReset}
              style={{
                padding: "6px 14px", borderRadius: 6,
                fontSize: 10, fontWeight: 600, letterSpacing: "0.05em",
                background: "transparent", border: `1px solid ${C.border30}`,
                color: C.onSurfaceVariant, cursor: "pointer",
              }}
            >
              Discard
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!isDirty || !isLoaded}
            style={{
              padding: "6px 18px", borderRadius: 6,
              fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
              background: isDirty ? C.primary : C.surfaceContainerHighest,
              border: "none",
              color: isDirty ? "#4e2d00" : C.onSecondaryFixedVar,
              cursor: isDirty ? "pointer" : "not-allowed",
              opacity: isDirty ? 1 : 0.5,
              transition: "all 0.15s",
            }}
          >
            Save
          </button>
        </div>
      </header>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "40px 48px" }}>
        <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Warning if paths not set */}
          {(!settings.archivePath) && (
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "14px 18px", borderRadius: 8,
              background: "rgba(253,161,36,0.08)",
              border: `1px solid rgba(253,161,36,0.25)`,
            }}>
              <AlertCircle size={16} color={C.primary} />
              <span style={{ fontSize: 12, color: C.primary }}>
                Archive path is not configured. The Create tab cannot archive beats until this is set.
              </span>
            </div>
          )}

          {/* Paths */}
          <Section
            title="Paths"
            description="Configure where BeatOS reads and writes your beat files."
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <PathInput
                label="Archive Path"
                icon={Archive}
                value={draft.archivePath}
                placeholder="e.g. D:\Beat Library\03_ARCHIVE"
                onChange={v => update("archivePath", v)}
                onBrowse={async () => {
                  const p = await pickFolder("Select Archive Folder");
                  if (p) update("archivePath", p);
                }}
              />
              <PathInput
                label="Active Production Path"
                icon={HardDrive}
                value={draft.productionPath}
                placeholder="e.g. D:\Beat Library\01_PRODUCTION"
                onChange={v => update("productionPath", v)}
                onBrowse={async () => {
                  const p = await pickFolder("Select Active Production Folder");
                  if (p) update("productionPath", p);
                }}
              />
              <PathInput
                label="Asset Path"
                icon={Image}
                value={draft.assetPath}
                placeholder="e.g. D:\Beat Library\04_ASSETS\Covers"
                onChange={v => update("assetPath", v)}
                onBrowse={async () => {
                  const p = await pickFolder("Select Asset Folder");
                  if (p) update("assetPath", p);
                }}
              />
            </div>
          </Section>

          {/* Producer Info — used by Upload-tab template generation */}
          <Section
            title="Producer Info"
            description="Used by the Upload tab to generate Beatstars, SoundCloud and YouTube descriptions."
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <TextSetting
                label="Producer Name"
                icon={User}
                value={draft.producerName}
                placeholder="e.g. goodbxy"
                onChange={v => update("producerName", v)}
              />
              <TextSetting
                label="Contact Email"
                icon={Mail}
                value={draft.contactEmail}
                placeholder="e.g. contact@prod404.com"
                onChange={v => update("contactEmail", v)}
              />
              <TextSetting
                label="Instagram URL"
                icon={Instagram}
                value={draft.instagramUrl}
                placeholder="https://instagram.com/prod.goodbxy"
                onChange={v => update("instagramUrl", v)}
                monospace
              />
              <TextSetting
                label="SoundCloud URL"
                icon={Music2}
                value={draft.soundcloudUrl}
                placeholder="https://soundcloud.com/prodgoodbxy"
                onChange={v => update("soundcloudUrl", v)}
                monospace
              />
              <TextSetting
                label="YouTube URL"
                icon={Youtube}
                value={draft.youtubeUrl}
                placeholder="https://youtube.com/@PROD.GOODBXY"
                onChange={v => update("youtubeUrl", v)}
                monospace
              />
              <TextSetting
                label="Beatstars URL"
                icon={ShoppingBag}
                value={draft.beatstarsUrl}
                placeholder="https://beatstars.com/prodgoodbxy"
                onChange={v => update("beatstarsUrl", v)}
                monospace
              />
              <TextSetting
                label="Default SoundCloud Tags"
                icon={Music2}
                value={draft.defaultGenreTags}
                placeholder={"Hip Hop & Rap, Melodic Trap, Emo Trap"}
                onChange={v => update("defaultGenreTags", v)}
                multiline
              />
            </div>
          </Section>

          {/* App Info */}
          <Section
            title="About"
            description="BeatOS application information."
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                ["Version", "0.1.0"],
                ["Platform", "Tauri + React"],
              ].map(([label, value]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: C.onSurfaceVariant }}>{label}</span>
                  <span style={{ color: C.onSurface, fontFamily: "monospace" }}>{value}</span>
                </div>
              ))}
            </div>
          </Section>

        </div>
      </div>
    </div>
  );
}
