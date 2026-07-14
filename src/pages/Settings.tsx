// src/pages/Settings.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Settings Page — configure paths and app preferences
// ═══════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  FolderOpen, CheckCircle, AlertCircle, HardDrive, Archive, Image, User, Mail,
  Instagram, Music2, Youtube, ShoppingBag, X, Wrench, Info, DatabaseBackup, Loader2, FileText,
} from "lucide-react";
import { C, commonStyles } from "../lib/theme";
import { useSettings, parseProductionPaths } from "../contexts/SettingsContext";
import type { AppSettings } from "../contexts/SettingsContext";
import { api } from "../lib/api";
import { formatRelativeTime } from "../lib/time";
import { ChipListEditor } from "../components/upload/ChipListEditor";

type SettingsSection = "paths" | "producer" | "maintenance" | "about";

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

// ─── Path List Input (multiple roots, one per line in the stored value) ─────

function PathListInput({ label, icon: Icon, value, onChange, browseTitle }: {
  label: string;
  icon: React.ElementType;
  value: string;                // newline-separated paths
  onChange: (v: string) => void;
  browseTitle: string;
}) {
  const paths = parseProductionPaths(value);

  const removeAt = (idx: number) => {
    onChange(paths.filter((_, i) => i !== idx).join("\n"));
  };

  const addPath = async () => {
    const p = await pickFolder(browseTitle);
    if (p && !paths.includes(p)) onChange([...paths, p].join("\n"));
  };

  return (
    <div>
      <label style={{ fontSize: 10, fontWeight: 700, color: C.onSurfaceVariant, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 8 }}>
        {label}
      </label>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {paths.map((p, i) => (
          <div key={`${p}-${i}`} style={{
            display: "flex", alignItems: "center", gap: 10,
            background: C.surfaceContainerHighest,
            border: `1px solid ${C.border20}`,
            borderRadius: 8,
            padding: "10px 14px",
          }}>
            <Icon size={14} color={C.primary} strokeWidth={1.5} />
            <span style={{ flex: 1, fontSize: 12, fontFamily: "monospace", color: C.onSurface, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p}
            </span>
            <button
              onClick={() => removeAt(i)}
              title="Pfad entfernen"
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: C.onSurfaceVariant, display: "flex", padding: 2,
              }}
            >
              <X size={13} />
            </button>
          </div>
        ))}
        <button
          onClick={addPath}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            padding: "10px 14px", borderRadius: 8,
            fontSize: 11, fontWeight: 600,
            background: "transparent",
            border: `1px dashed ${C.border30}`,
            color: C.onSurfaceVariant,
            cursor: "pointer",
          }}
        >
          <FolderOpen size={13} strokeWidth={1.5} />
          Ordner hinzufügen
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

// ─── Template-Vorschau: so landen die Producer-Werte im gerenderten Text ────

function TemplatePreview({ draft }: { draft: AppSettings }) {
  const lines: Array<[string, string]> = [
    ["{{PRODUCER_PROD}}", draft.producerName ? `prod. ${draft.producerName}` : "—"],
    ["{{EMAIL}}", draft.contactEmail || "—"],
    ["{{IG_URL}}", draft.instagramUrl || "—"],
    ["{{SC_URL}}", draft.soundcloudUrl || "—"],
    ["{{BS_URL}}", draft.beatstarsUrl || "—"],
  ];
  return (
    <div style={{
      padding: "14px 16px",
      background: C.surfaceContainerHighest,
      border: `1px solid ${C.border15}`,
      borderRadius: 8,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
        textTransform: "uppercase", color: C.onSecondaryFixedVar,
        marginBottom: 10,
      }}>
        <FileText size={10} strokeWidth={2} />
        Vorschau — so landen die Werte in den Beschreibungen
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {lines.map(([placeholder, value]) => (
          <div key={placeholder} style={{ display: "flex", gap: 10, fontSize: 11, fontFamily: "monospace" }}>
            <span style={{ color: C.onSecondaryFixedVar, width: 150, flexShrink: 0 }}>{placeholder}</span>
            <span style={{ color: value === "—" ? C.onSecondaryFixedVar : C.mint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Wartung: Backup, System Repair, Templates ───────────────────────────────

function MaintenancePane({ archivePath }: { archivePath: string }) {
  const [info, setInfo] = useState<{ db_path: string; backup_path: string; last_backup_secs: number | null } | null>(null);
  const [busy, setBusy] = useState<"backup" | "repair" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.settings.getBackupInfo().then(setInfo).catch(() => setInfo(null));
  }, []);

  const handleBackup = async () => {
    setBusy("backup");
    setMessage(null);
    try {
      setInfo(await api.settings.backupNow());
      setMessage("Backup erstellt ✓");
    } catch (e) {
      setMessage(`Backup fehlgeschlagen: ${String(e)}`);
    } finally {
      setBusy(null);
      setTimeout(() => setMessage(null), 3500);
    }
  };

  const handleRepair = async () => {
    if (!confirm("System Repair wird:\n1. Fehlende Beats aus dem Archiv importieren\n2. Alle create_dates aus FLP-Dateien neu lesen\n3. has_artwork/has_video auffrischen\n\nFortfahren?")) return;
    setBusy("repair");
    try {
      const scan = await api.archive.scan(archivePath);
      const fix = await api.archive.fixDates(archivePath);
      alert(
        `System Repair abgeschlossen\n\n` +
        `── Scan ──\nGefunden: ${scan.found}  Importiert: ${scan.imported}  Übersprungen: ${scan.skipped}\n\n` +
        `── Dates ──\nAktualisiert: ${fix.updated}  Nicht gefunden: ${fix.not_found}  Ohne FLP: ${fix.no_flp}\n\n` +
        `Fehler: ${[...scan.errors, ...fix.errors].length}`
      );
    } catch (e) {
      alert(`System Repair fehlgeschlagen:\n${String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const handleOpenTemplates = async () => {
    try {
      const dir = await api.upload.getTemplatesDir();
      await revealItemInDir(dir);
    } catch (e) {
      alert(`Template-Ordner konnte nicht geöffnet werden: ${String(e)}`);
    }
  };

  const row: React.CSSProperties = { display: "flex", gap: 10, fontSize: 11, fontFamily: "monospace" };
  const rowLabel: React.CSSProperties = { color: C.onSecondaryFixedVar, width: 110, flexShrink: 0, fontFamily: "Inter, sans-serif", fontSize: 11 };

  return (
    <Section
      title="Wartung"
      description="Backup, Reparatur und Vorlagen — alles Administrative an einem Ort."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Backup */}
        <div style={{
          padding: "16px 18px",
          background: C.surfaceContainerHighest,
          border: `1px solid ${C.border15}`,
          borderRadius: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <DatabaseBackup size={14} color={C.mint} strokeWidth={1.75} />
            <span style={{ fontSize: 12, fontWeight: 700, color: C.onSurface }}>Datenbank-Backup</span>
            <span style={{
              fontSize: 10, fontWeight: 600,
              color: info?.last_backup_secs ? C.mint : C.error,
              marginLeft: "auto",
            }}>
              {info?.last_backup_secs
                ? `Letztes Backup: ${formatRelativeTime(info.last_backup_secs)}`
                : "Noch kein Backup gefunden"}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 12 }}>
            <div style={row}><span style={rowLabel}>Live-DB</span><span style={{ color: C.onSurfaceVariant, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{info?.db_path ?? "…"}</span></div>
            <div style={row}><span style={rowLabel}>Backup → OneDrive</span><span style={{ color: C.onSurfaceVariant, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{info?.backup_path ?? "…"}</span></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={handleBackup}
              disabled={busy !== null}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 16px", borderRadius: 7,
                background: C.mint, border: "none",
                color: "#064e3b", cursor: busy ? "wait" : "pointer",
                fontSize: 11, fontWeight: 700,
              }}
            >
              {busy === "backup" ? <Loader2 size={12} style={{ animation: "spin 0.8s linear infinite" }} /> : <DatabaseBackup size={12} strokeWidth={2} />}
              Jetzt sichern
            </button>
            {message && <span style={{ fontSize: 11, color: message.includes("✓") ? C.mint : C.error }}>{message}</span>}
          </div>
          <div style={{ fontSize: 10, color: C.onSecondaryFixedVar, marginTop: 10, lineHeight: 1.5 }}>
            Läuft zusätzlich automatisch bei jedem App-Start und nach jeder Archivierung.
          </div>
        </div>

        {/* System Repair */}
        <div style={{
          padding: "16px 18px",
          background: C.surfaceContainerHighest,
          border: `1px solid ${C.border15}`,
          borderRadius: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Wrench size={14} color="#ff7351" strokeWidth={1.75} />
            <span style={{ fontSize: 12, fontWeight: 700, color: C.onSurface }}>System Repair</span>
          </div>
          <div style={{ fontSize: 11, color: C.onSurfaceVariant, lineHeight: 1.5, marginBottom: 12 }}>
            Importiert Beats, die im Archiv-Ordner liegen, aber in der Datenbank fehlen,
            und liest alle Erstell-Daten aus den FLP-Dateien neu.
          </div>
          <button
            onClick={handleRepair}
            disabled={busy !== null || !archivePath}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 16px", borderRadius: 7,
              background: "rgba(255,115,81,0.12)",
              border: "1px solid rgba(255,115,81,0.35)",
              color: "#ff7351", cursor: busy ? "wait" : "pointer",
              fontSize: 11, fontWeight: 700,
            }}
          >
            {busy === "repair" ? <Loader2 size={12} style={{ animation: "spin 0.8s linear infinite" }} /> : <Wrench size={12} strokeWidth={2} />}
            Repair ausführen
          </button>
        </div>

        {/* Templates */}
        <div style={{
          padding: "16px 18px",
          background: C.surfaceContainerHighest,
          border: `1px solid ${C.border15}`,
          borderRadius: 8,
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <FileText size={14} color={C.tertiary ?? "#9492ff"} strokeWidth={1.75} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.onSurface }}>Beschreibungs-Templates</div>
            <div style={{ fontSize: 10, color: C.onSecondaryFixedVar, marginTop: 2 }}>
              beatstars / soundcloud / youtube .template — Änderungen wirken beim nächsten Re-Render
            </div>
          </div>
          <button
            onClick={handleOpenTemplates}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: 7,
              background: "transparent", border: `1px solid ${C.border20}`,
              color: C.onSurfaceVariant, cursor: "pointer",
              fontSize: 11, fontWeight: 600,
            }}
          >
            <FolderOpen size={12} strokeWidth={1.75} />
            Ordner öffnen
          </button>
        </div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </Section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Draft = AppSettings;

export function Settings() {
  const { settings, isLoaded, updateSettings } = useSettings();

  // Local draft state — only applied on Save
  const [draft, setDraft] = useState<Draft>(settings);
  const [saved, setSaved] = useState(false);
  const [section, setSection] = useState<SettingsSection>("paths");

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
      height: "100%",
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
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.mint }}>
              <CheckCircle size={14} />
              Gespeichert
            </span>
          )}
        </div>
      </header>

      {/* Content: Sektions-Navigation links, aktive Sektion rechts */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
        {/* Nav */}
        <nav style={{
          width: 190, flexShrink: 0,
          borderRight: `1px solid ${C.border10}`,
          padding: "24px 16px",
          display: "flex", flexDirection: "column", gap: 4,
        }}>
          {([
            ["paths", FolderOpen, "Pfade"],
            ["producer", User, "Producer"],
            ["maintenance", Wrench, "Wartung"],
            ["about", Info, "Info"],
          ] as const).map(([key, Icon, label]) => (
            <button
              key={key}
              onClick={() => setSection(key)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 12px", borderRadius: 8,
                background: section === key ? C.surfaceContainerHigh : "transparent",
                border: "none",
                cursor: "pointer", textAlign: "left",
                fontSize: 12, fontWeight: section === key ? 700 : 500,
                color: section === key ? C.onSurface : C.onSurfaceVariant,
                transition: "all 0.15s",
              }}
            >
              <Icon size={14} strokeWidth={1.75} />
              {label}
            </button>
          ))}
        </nav>

        {/* Pane */}
        <div style={{ flex: 1, overflowY: "auto", padding: "32px 40px" }}>
        <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Warning if paths not set */}
          {section === "paths" && !settings.archivePath && (
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
          {section === "paths" && (
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
              <PathListInput
                label="Active Production Paths"
                icon={HardDrive}
                value={draft.productionPath}
                onChange={v => update("productionPath", v)}
                browseTitle="Produktions-Ordner hinzufügen"
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
          )}

          {/* Producer Info — used by Upload-tab template generation */}
          {section === "producer" && (
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
              {/* Default-Tags als Chips — gespeichert weiterhin als Komma-Liste */}
              <ChipListEditor
                label="Default SoundCloud Tags"
                values={draft.defaultGenreTags.split(",").map(t => t.trim()).filter(Boolean)}
                onChange={vals => update("defaultGenreTags", vals.join(", "))}
                separatorLabel=","
                placeholder="Tag eingeben, Enter drücken … (z.B. Melodic Trap)"
                hint="werden bei SoundCloud immer vorangestellt"
              />

              {/* Live-Vorschau: so landen die Werte in den Templates */}
              <TemplatePreview draft={draft} />
            </div>
          </Section>
          )}

          {/* Wartung */}
          {section === "maintenance" && (
            <MaintenancePane archivePath={settings.archivePath} />
          )}

          {/* App Info */}
          {section === "about" && (
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
          )}

        </div>
        </div>
      </div>

      {/* Unsaved-changes bar — unmissable, pinned above the content */}
      {isDirty && (
        <div style={{
          flexShrink: 0,
          display: "flex", alignItems: "center", gap: 16,
          padding: "14px 32px",
          background: "rgba(253,161,36,0.10)",
          borderTop: `1px solid rgba(253,161,36,0.45)`,
          backdropFilter: "blur(12px)",
        }}>
          <AlertCircle size={18} color={C.primary} />
          <span style={{ fontSize: 13, fontWeight: 600, color: C.onSurface }}>
            Ungespeicherte Änderungen
          </span>
          <div style={{ flex: 1 }} />
          <button
            onClick={handleReset}
            style={{
              padding: "10px 20px", borderRadius: 8,
              fontSize: 12, fontWeight: 600,
              background: "transparent", border: `1px solid ${C.border30}`,
              color: C.onSurfaceVariant, cursor: "pointer",
            }}
          >
            Verwerfen
          </button>
          <button
            onClick={handleSave}
            disabled={!isLoaded}
            style={{
              padding: "12px 36px", borderRadius: 8,
              fontSize: 13, fontWeight: 800, letterSpacing: "0.08em",
              textTransform: "uppercase",
              background: C.primary,
              border: "none",
              color: "#3d2300",
              cursor: isLoaded ? "pointer" : "wait",
              boxShadow: "0 4px 16px rgba(253,161,36,0.35)",
              display: "flex", alignItems: "center", gap: 8,
            }}
          >
            <CheckCircle size={15} strokeWidth={2.5} />
            Speichern
          </button>
        </div>
      )}
    </div>
  );
}
