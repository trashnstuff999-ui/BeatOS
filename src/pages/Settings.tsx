// src/pages/Settings.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Settings Page — configure paths and app preferences
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, CheckCircle, AlertCircle, HardDrive, Archive, Image } from "lucide-react";
import { C, commonStyles } from "../lib/theme";
import { useSettings } from "../contexts/SettingsContext";

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export function Settings() {
  const { settings, updateSettings } = useSettings();

  // Local draft state — only applied on Save
  const [archivePath, setArchivePath] = useState(settings.archivePath);
  const [productionPath, setProductionPath] = useState(settings.productionPath);
  const [assetPath, setAssetPath] = useState(settings.assetPath);
  const [saved, setSaved] = useState(false);

  const isDirty =
    archivePath !== settings.archivePath ||
    productionPath !== settings.productionPath ||
    assetPath !== settings.assetPath;

  const handleSave = () => {
    updateSettings({ archivePath, productionPath, assetPath });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleReset = () => {
    setArchivePath(settings.archivePath);
    setProductionPath(settings.productionPath);
    setAssetPath(settings.assetPath);
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
            disabled={!isDirty}
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
                value={archivePath}
                placeholder="e.g. D:\Beat Library\03_ARCHIVE"
                onChange={setArchivePath}
                onBrowse={async () => {
                  const p = await pickFolder("Select Archive Folder");
                  if (p) setArchivePath(p);
                }}
              />
              <PathInput
                label="Active Production Path"
                icon={HardDrive}
                value={productionPath}
                placeholder="e.g. D:\Beat Library\01_PRODUCTION"
                onChange={setProductionPath}
                onBrowse={async () => {
                  const p = await pickFolder("Select Active Production Folder");
                  if (p) setProductionPath(p);
                }}
              />
              <PathInput
                label="Asset Path"
                icon={Image}
                value={assetPath}
                placeholder="e.g. D:\Beat Library\04_ASSETS\Covers"
                onChange={setAssetPath}
                onBrowse={async () => {
                  const p = await pickFolder("Select Asset Folder");
                  if (p) setAssetPath(p);
                }}
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
