// src/pages/Settings.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Settings Page — configure paths and app preferences
// ═══════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  FolderOpen, CheckCircle, AlertCircle, HardDrive, Archive, Image, User, Mail,
  Instagram, Music2, Youtube, ShoppingBag, X, Wrench, Info, DatabaseBackup, FileText,
  Settings as SettingsIcon, FolderTree, Users, Trash2, Plus, History, Download,
} from "lucide-react";
import { C, commonStyles, alpha, radius } from "../lib/theme";
import { PageHeader, PageBody, Button, IconButton } from "../components/ui";
import { useSettings, parseProductionPaths, DEFAULTS, kuenstlerOrdner } from "../contexts/SettingsContext";
import type { AppSettings } from "../contexts/SettingsContext";
import { api } from "../lib/api";
import { formatRelativeTime } from "../lib/time";
import { ChipListEditor } from "../components/upload/ChipListEditor";
import { UploadsNacherfassenDialog } from "../components/UploadsNacherfassenDialog";
import type { FolderSync } from "../types/upload";
import type { RelocatePlan, RelocateResult, RelocateStatus } from "../types/relocate";
import { useDialog } from "../contexts/DialogContext";
import { LEERER_PRODUZENT } from "../types/sampleCredits";
import type { SampleProducer } from "../types/sampleCredits";

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

async function pickFlp(): Promise<string | null> {
  try {
    const result = await open({
      multiple: false,
      title: "Template-FLP wählen",
      filters: [{ name: "FL Studio Projekt", extensions: ["flp"] }],
    });
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
      borderRadius: radius.card,
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
      <label style={{ fontSize: 11, fontWeight: 700, color: C.onSurfaceVariant, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>
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
          borderRadius: radius.control,
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
        <Button variant="secondary" icon={FolderOpen} onClick={onBrowse} style={{ whiteSpace: "nowrap" }}>
          Durchsuchen
        </Button>
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
      <label style={{ fontSize: 11, fontWeight: 700, color: C.onSurfaceVariant, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>
        {label}
      </label>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {paths.map((p, i) => (
          <div key={`${p}-${i}`} style={{
            display: "flex", alignItems: "center", gap: 10,
            background: C.surfaceContainerHighest,
            border: `1px solid ${C.border20}`,
            borderRadius: radius.control,
            padding: "10px 14px",
          }}>
            <Icon size={14} color={C.primary} strokeWidth={1.5} />
            <span style={{ flex: 1, fontSize: 12, fontFamily: "monospace", color: C.onSurface, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p}
            </span>
            <IconButton icon={X} size={24} title="Pfad entfernen" onClick={() => removeAt(i)} />
          </div>
        ))}
        <button
          onClick={addPath}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            padding: "10px 14px", borderRadius: radius.control,
            fontSize: 12, fontWeight: 600,
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
      <label style={{ fontSize: 11, fontWeight: 700, color: C.onSurfaceVariant, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>
        {label}
      </label>
      <div style={{
        display: "flex",
        alignItems: multiline ? "flex-start" : "center",
        gap: 10,
        background: C.surfaceContainerHighest,
        border: `1px solid ${hasValue ? C.primary + "40" : C.border20}`,
        borderRadius: radius.control,
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
      borderRadius: radius.control,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
        textTransform: "uppercase", color: C.onSecondaryFixedVar,
        marginBottom: 10,
      }}>
        <FileText size={10} strokeWidth={2} />
        Vorschau — so landen die Werte in den Beschreibungen
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {lines.map(([placeholder, value]) => (
          <div key={placeholder} style={{ display: "flex", gap: 10, fontSize: 12, fontFamily: "monospace" }}>
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

// ─── Sample-Produzenten: das Adressbuch ──────────────────────────────────────
//
// Wer ein Sample beigesteuert hat, wird hier einmal mit seinen Links gepflegt.
// Im Upload-Tab wird er dann pro Beat ausgewählt, und beim Rendern wandern
// Name und Links in die Beschreibungen.

function SampleProducersCard() {
  const { frage } = useDialog();
  const [producers, setProducers] = useState<SampleProducer[]>([]);
  const [draft, setDraft] = useState<SampleProducer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const laden = () =>
    api.sampleCredits.listProducers().then(setProducers).catch(e => setError(String(e)));

  useEffect(() => { laden(); }, []);

  const speichern = async () => {
    if (!draft) return;
    setError(null);
    try {
      await api.sampleCredits.saveProducer(draft);
      setDraft(null);
      await laden();
    } catch (e) {
      setError(String(e));
    }
  };

  const loeschen = async (p: SampleProducer) => {
    const zusatz = p.use_count > 0
      ? `\n\nEr ist bei ${p.use_count} ${p.use_count === 1 ? "Beat" : "Beats"} genannt. Diese Nennungen verschwinden mit.`
      : "";
    const ok = await frage({
      titel: `„${p.name}" löschen?`,
      text: zusatz.trim() || "Der Producer verschwindet aus dem Adressbuch.",
      bestaetigen: "Löschen",
      gefahr: true,
    });
    if (!ok) return;
    setError(null);
    try {
      if (p.id !== null) await api.sampleCredits.deleteProducer(p.id);
      await laden();
    } catch (e) {
      setError(String(e));
    }
  };

  const feld = (k: keyof SampleProducer) => (v: string) =>
    setDraft(d => (d ? { ...d, [k]: v } : d));

  return (
    <div style={{
      padding: "16px 18px",
      background: C.surfaceContainerHighest,
      border: `1px solid ${C.border15}`,
      borderRadius: radius.control,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Users size={14} color={C.mint} strokeWidth={1.75} />
        <span style={{ fontSize: 12, fontWeight: 700, color: C.onSurface }}>Sample-Produzenten</span>
        <span style={{ fontSize: 11, color: C.onSecondaryFixedVar, marginLeft: "auto" }}>
          {producers.length === 0 ? "noch keine" : `${producers.length} im Adressbuch`}
        </span>
      </div>
      <div style={{ fontSize: 11, color: C.onSecondaryFixedVar, lineHeight: 1.5, marginBottom: 12 }}>
        Wessen Sample du benutzt hast. Einmal hier gepflegt, im Upload-Tab pro Beat
        ausgewählt — Name und Links landen dann von selbst in der Beschreibung.
      </div>

      {producers.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {producers.map(p => (
            <div key={p.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 10px", borderRadius: radius.control,
              background: C.surfaceContainer, border: `1px solid ${C.border15}`,
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.onSurface }}>{p.name}</span>
              <span style={{ fontSize: 11, color: C.onSecondaryFixedVar }}>
                {[p.instagram_url, p.beatstars_url, p.soundcloud_url, p.youtube_url].filter(Boolean).length} Links
                {p.use_count > 0 && ` · ${p.use_count}× genannt`}
              </span>
              <Button size="sm" variant="secondary" style={{ marginLeft: "auto" }}
                onClick={() => { setDraft(p); setError(null); }}>
                Bearbeiten
              </Button>
              <IconButton icon={Trash2} size={28} variant="danger" title="Löschen" onClick={() => loeschen(p)} />
            </div>
          ))}
        </div>
      )}

      {draft && (
        <div style={{
          padding: "14px 16px", marginBottom: 12,
          background: C.surfaceContainer, border: `1px solid ${C.border15}`, borderRadius: radius.control,
          display: "flex", flexDirection: "column", gap: 14,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.onSurface }}>
            {draft.id === null ? "Neuer Sample-Produzent" : `„${draft.name}“ bearbeiten`}
          </div>
          <TextSetting label="Name" icon={User} value={draft.name}
            placeholder="z.B. prodzeux" onChange={feld("name")} />
          <TextSetting label="Instagram URL" icon={Instagram} value={draft.instagram_url}
            placeholder="https://www.instagram.com/prodzeux/" onChange={feld("instagram_url")} monospace />
          <TextSetting label="Beatstars URL" icon={ShoppingBag} value={draft.beatstars_url}
            placeholder="https://www.beatstars.com/prodzeux" onChange={feld("beatstars_url")} monospace />
          <TextSetting label="SoundCloud URL" icon={Music2} value={draft.soundcloud_url}
            placeholder="optional" onChange={feld("soundcloud_url")} monospace />
          <TextSetting label="YouTube URL" icon={Youtube} value={draft.youtube_url}
            placeholder="optional" onChange={feld("youtube_url")} monospace />
          <div style={{ fontSize: 11, color: C.onSecondaryFixedVar, lineHeight: 1.5 }}>
            Leere Felder werden in der Beschreibung weggelassen.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="primary" onClick={speichern}>Speichern</Button>
            <Button variant="ghost" onClick={() => { setDraft(null); setError(null); }}>Abbrechen</Button>
          </div>
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: C.error, marginBottom: 12 }}>{error}</div>
      )}

      {!draft && (
        <Button variant="secondary" icon={Plus} onClick={() => { setDraft({ ...LEERER_PRODUZENT }); setError(null); }}>
          Sample-Produzent hinzufügen
        </Button>
      )}
    </div>
  );
}

// ─── Bibliothek umgezogen: den Anker tauschen ────────────────────────────────
//
// Alle gespeicherten Pfade hängen an einem gemeinsamen Präfix. Zieht die
// Bibliothek um — andere Platte, NAS, anderer Rechner —, wird nur dieses
// Präfix getauscht.
//
// Regel: erkannt wird automatisch, geschrieben nur auf Bestätigung. Ein
// fehlender Archivordner heißt genauso oft „Platte nicht angesteckt" wie
// „umgezogen" — deshalb löst die Erkennung nie selbst etwas aus.

function RelocateCard() {
  const { frage } = useDialog();
  const [status, setStatus] = useState<RelocateStatus | null>(null);
  const [plan, setPlan] = useState<RelocatePlan | null>(null);
  const [done, setDone] = useState<RelocateResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.relocate.status().then(setStatus).catch(() => setStatus(null));
  }, []);

  const handlePick = async () => {
    const dir = await pickFolder("Ordner wählen, der die Bibliothek künftig enthält");
    if (!dir) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      setPlan(await api.relocate.preview(dir));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleApply = async () => {
    if (!plan) return;
    const ok = await frage({
      titel: `${plan.total} Pfade umschreiben?`,
      text: `von:  ${plan.old_anchor}\n` +
            `nach: ${plan.new_anchor}\n\n` +
            `Vorher wird eine Sicherung der Datenbank angelegt. Der Vorgang fasst ` +
            `ausschließlich die Datenbank an, keine Dateien, und ist umkehrbar — ` +
            `derselbe Weg zurück stellt den Ausgangszustand her.`,
      bestaetigen: "Umschreiben",
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.relocate.apply(plan.new_anchor);
      setDone(res);
      setPlan(null);
      setStatus(await api.relocate.status());
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const row: React.CSSProperties = { display: "flex", gap: 10, fontSize: 12, fontFamily: "monospace" };
  const rowLabel: React.CSSProperties = { color: C.onSecondaryFixedVar, width: 110, flexShrink: 0, fontFamily: "Inter, sans-serif", fontSize: 12 };
  const pfad: React.CSSProperties = { color: C.onSurfaceVariant, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

  // Solange das Archiv da liegt, wo es hingehört, ist das hier eine stille
  // Randnotiz. Fehlt es, wird die Karte zur Frage.
  const vermisst = status !== null && !status.archive_exists;
  const probe = plan?.entries.find(e => e.sample_before && e.sample_after);

  return (
    <div style={{
      padding: "16px 18px",
      background: C.surfaceContainerHighest,
      border: `1px solid ${vermisst ? C.error : C.border15}`,
      borderRadius: radius.control,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <FolderTree size={14} color={vermisst ? C.error : C.mint} strokeWidth={1.75} />
        <span style={{ fontSize: 12, fontWeight: 700, color: C.onSurface }}>Bibliothek umgezogen</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: vermisst ? C.error : C.mint, marginLeft: "auto" }}>
          {status === null ? "…" : vermisst ? "Archivordner nicht gefunden" : "Alles am Platz"}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 12 }}>
        <div style={row}><span style={rowLabel}>Anker</span><span style={pfad}>{status?.anchor ?? "…"}</span></div>
        <div style={row}><span style={rowLabel}>Archiv</span><span style={pfad}>{status?.archive_path ?? "…"}</span></div>
      </div>

      {vermisst && (
        <div style={{ fontSize: 11, color: C.error, lineHeight: 1.5, marginBottom: 12 }}>
          Der Archivordner liegt nicht dort, wo die Datenbank ihn vermutet. Das heißt
          nicht zwingend, dass etwas umgezogen ist — eine abgezogene Platte oder eine
          nicht eingebundene Freigabe sieht genauso aus. Erst nachsehen, dann handeln.
        </div>
      )}

      {plan && (
        <div style={{
          padding: "12px 14px", marginBottom: 12,
          background: C.surfaceContainer, border: `1px solid ${C.border15}`, borderRadius: radius.control,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.onSurface, marginBottom: 8 }}>
            Vorschau — es ist noch nichts geschrieben
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
            {plan.entries.map(e => (
              <div key={e.label} style={row}>
                <span style={{ ...rowLabel, width: 190 }}>{e.label}</span>
                <span style={{ color: C.onSurfaceVariant }}>
                  {e.count} {e.count === 1 ? "Wert" : "Werte"}
                  {e.skipped > 0 && ` · ${e.skipped} bleiben liegen`}
                </span>
              </div>
            ))}
          </div>
          {probe && (
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 10 }}>
              <div style={row}><span style={rowLabel}>vorher</span><span style={pfad}>{probe.sample_before}</span></div>
              <div style={row}><span style={rowLabel}>nachher</span><span style={{ ...pfad, color: C.mint }}>{probe.sample_after}</span></div>
            </div>
          )}
          <div style={{ fontSize: 12, fontWeight: 700, color: plan.total > 0 ? C.onSurface : C.error }}>
            {plan.total} Werte würden sich ändern, {plan.skipped} blieben liegen
          </div>
          {plan.total === 0 && (
            <div style={{ fontSize: 11, color: C.error, marginTop: 6, lineHeight: 1.5 }}>
              Kein einziger Pfad passt. Vermutlich liegt der gewählte Ordner eine Ebene
              zu tief oder zu hoch — gesucht ist der Ordner, der die Bibliothek enthält,
              nicht die Bibliothek selbst.
            </div>
          )}
        </div>
      )}

      {done && (
        <div style={{
          padding: "12px 14px", marginBottom: 12,
          background: C.surfaceContainer, border: `1px solid ${C.mint}`, borderRadius: radius.control,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.mint, marginBottom: 6 }}>
            {done.changed} Pfade umgeschrieben ✓
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={row}><span style={rowLabel}>Sicherung</span><span style={pfad}>{done.backup_path}</span></div>
          </div>
          <div style={{ fontSize: 11, color: C.onSecondaryFixedVar, marginTop: 8, lineHeight: 1.5 }}>
            Die App arbeitet noch mit den alten Pfaden im Speicher — einmal neu laden.
          </div>
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: C.error, marginBottom: 12, whiteSpace: "pre-wrap" }}>{error}</div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Button variant="secondary" icon={FolderOpen} loading={busy} onClick={handlePick}>
          {plan ? "Anderen Ordner wählen" : "Neuen Ordner wählen"}
        </Button>

        {plan && plan.total > 0 && (
          <Button variant="primary" icon={CheckCircle} disabled={busy} onClick={handleApply}>
            {plan.total} Pfade übernehmen
          </Button>
        )}

        {done && (
          <Button variant="primary" onClick={() => location.reload()}>App neu laden</Button>
        )}
      </div>

      <div style={{ fontSize: 11, color: C.onSecondaryFixedVar, marginTop: 10, lineHeight: 1.5 }}>
        Getauscht wird nur das gemeinsame Präfix aller Pfade. Es wird ausschließlich die
        Datenbank geschrieben, keine Datei verschoben — und der Weg zurück stellt den
        Ausgangszustand wieder her.
      </div>
    </div>
  );
}

// ─── Wartung: Backup, System Repair, Templates ───────────────────────────────

function MaintenancePane({ archivePath }: { archivePath: string }) {
  const { frage, melde } = useDialog();
  const [info, setInfo] = useState<{ db_path: string; backup_path: string; last_backup_secs: number | null } | null>(null);
  const [busy, setBusy] = useState<"backup" | "repair" | "sync" | null>(null);
  const [syncPlan, setSyncPlan] = useState<FolderSync[] | null>(null);
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
    const ok = await frage({
      titel: "System Repair starten?",
      text: "1. Fehlende Beats aus dem Archiv importieren\n" +
            "2. Alle create_dates aus FLP-Dateien neu lesen\n" +
            "3. has_artwork/has_video auffrischen",
      bestaetigen: "Starten",
    });
    if (!ok) return;
    setBusy("repair");
    try {
      const scan = await api.archive.scan(archivePath);
      const fix = await api.archive.fixDates(archivePath);
      await frage({
        titel: "System Repair abgeschlossen",
        text: `── Scan ──\nGefunden: ${scan.found}  Importiert: ${scan.imported}  Übersprungen: ${scan.skipped}\n\n` +
              `── Dates ──\nAktualisiert: ${fix.updated}  Nicht gefunden: ${fix.not_found}  Ohne FLP: ${fix.no_flp}\n\n` +
              `Fehler: ${[...scan.errors, ...fix.errors].length}`,
        bestaetigen: "Schließen",
        nurHinweis: true,
      });
    } catch (e) {
      melde(`System Repair fehlgeschlagen:\n${String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  // Ordner-Abgleich: erst Trockenlauf, dann anwenden. Bei 200+ Ordnern ist die
  // Vorschau Pflicht, nicht Luxus.
  const handleSyncCheck = async () => {
    setBusy("sync");
    setSyncPlan(null);
    try {
      const all = await api.archive.syncFolders([], true);
      setSyncPlan(all.filter(s => s.to !== s.from || s.files_renamed > 0 || s.error));
    } catch (e) {
      melde(`Abgleich fehlgeschlagen:\n${String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const handleSyncApply = async () => {
    const ids = (syncPlan ?? []).filter(s => !s.error).map(s => s.beat_id);
    if (ids.length === 0) return;
    const ok = await frage({
      titel: "Auf der Platte umbenennen?",
      text: `${ids.length} Beat${ids.length === 1 ? " wird" : "s werden"} umbenannt — Ordner und Dateien.`,
      bestaetigen: "Umbenennen",
      gefahr: true,
    });
    if (!ok) return;
    setBusy("sync");
    try {
      const done = await api.archive.syncFolders(ids, false);
      const folders = done.filter(s => s.to !== s.from && !s.error).length;
      const files = done.reduce((n, s) => n + s.files_renamed, 0);
      const errors = done.filter(s => s.error);
      await frage({
        titel: "Ordner-Abgleich abgeschlossen",
        text: `Ordner umbenannt: ${folders}\nDateien umbenannt: ${files}\nFehler: ${errors.length}` +
              (errors.length > 0 ? `\n\n${errors.slice(0, 10).map(s => `${s.beat_id}: ${s.error}`).join("\n")}` : ""),
        bestaetigen: "Schließen",
        nurHinweis: true,
      });
    } catch (e) {
      melde(`Abgleich fehlgeschlagen:\n${String(e)}`);
    } finally {
      setBusy(null);
    }
    // Zeigt, was haengen geblieben ist — im Idealfall eine leere Liste.
    await handleSyncCheck();
  };

  const handleOpenTemplates = async () => {
    try {
      const dir = await api.upload.getTemplatesDir();
      await revealItemInDir(dir);
    } catch (e) {
      melde(`Template-Ordner konnte nicht geöffnet werden: ${String(e)}`);
    }
  };

  const row: React.CSSProperties = { display: "flex", gap: 10, fontSize: 12, fontFamily: "monospace" };
  const rowLabel: React.CSSProperties = { color: C.onSecondaryFixedVar, width: 110, flexShrink: 0, fontFamily: "Inter, sans-serif", fontSize: 12 };

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
          borderRadius: radius.control,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <DatabaseBackup size={14} color={C.mint} strokeWidth={1.75} />
            <span style={{ fontSize: 12, fontWeight: 700, color: C.onSurface }}>Datenbank-Backup</span>
            <span style={{
              fontSize: 11, fontWeight: 600,
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
            <div style={row}><span style={rowLabel}>Sicherung →</span><span style={{ color: C.onSurfaceVariant, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{info?.backup_path ?? "…"}</span></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Button variant="primary" icon={DatabaseBackup} loading={busy === "backup"} disabled={busy !== null} onClick={handleBackup}>
              Jetzt sichern
            </Button>
            {message && <span style={{ fontSize: 12, color: message.includes("✓") ? C.mint : C.error }}>{message}</span>}
          </div>
          <div style={{ fontSize: 11, color: C.onSecondaryFixedVar, marginTop: 10, lineHeight: 1.5 }}>
            Läuft zusätzlich automatisch bei jedem App-Start und nach jeder Archivierung.
          </div>
        </div>

        {/* Bibliothek umgezogen */}
        <RelocateCard />

        {/* System Repair */}
        <div style={{
          padding: "16px 18px",
          background: C.surfaceContainerHighest,
          border: `1px solid ${C.border15}`,
          borderRadius: radius.control,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Wrench size={14} color={C.error} strokeWidth={1.75} />
            <span style={{ fontSize: 12, fontWeight: 700, color: C.onSurface }}>System-Reparatur</span>
          </div>
          <div style={{ fontSize: 12, color: C.onSurfaceVariant, lineHeight: 1.5, marginBottom: 12 }}>
            Importiert Beats, die im Archiv-Ordner liegen, aber in der Datenbank fehlen,
            und liest alle Erstell-Daten aus den FLP-Dateien neu.
          </div>
          {/* secondary, nicht danger: die Reparatur importiert und liest neu,
              sie löscht nichts. */}
          <Button variant="secondary" icon={Wrench} loading={busy === "repair"} disabled={busy !== null || !archivePath} onClick={handleRepair}>
            Reparatur starten
          </Button>
        </div>

        {/* Ordner-Abgleich */}
        <div style={{
          padding: "16px 18px",
          background: C.surfaceContainerHighest,
          border: `1px solid ${C.border15}`,
          borderRadius: radius.control,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <FolderTree size={14} color={C.mint} strokeWidth={1.75} />
            <span style={{ fontSize: 12, fontWeight: 700, color: C.onSurface }}>Ordner-Abgleich</span>
          </div>
          <div style={{ fontSize: 12, color: C.onSurfaceVariant, lineHeight: 1.5, marginBottom: 12 }}>
            Benennt Ordner und Dateien im Archiv nach den Werten aus der Datenbank und
            räumt ältere MP3/WAV nach 02_OLD —
            für Beats, die in der App längst anders heißen als auf der Platte.
            Neue Umbenennungen laufen ab jetzt automatisch mit; das hier holt den Altbestand nach.
          </div>

          {syncPlan && (
            <div style={{
              maxHeight: 220, overflowY: "auto",
              display: "flex", flexDirection: "column", gap: 4,
              padding: syncPlan.length > 0 ? "10px 12px" : 0,
              background: syncPlan.length > 0 ? C.surfaceContainer : "transparent",
              borderRadius: radius.control, marginBottom: 12,
              fontSize: 12, fontFamily: "monospace",
            }}>
              {syncPlan.length === 0 ? (
                <span style={{ fontSize: 12, fontFamily: "Inter, sans-serif", color: C.mint }}>
                  Alles im Reinen — nichts umzubenennen.
                </span>
              ) : syncPlan.map(s => (
                <div key={s.beat_id} style={{ color: s.error ? C.error : C.onSurfaceVariant, lineHeight: 1.5 }}>
                  {s.error
                    ? `${s.beat_id}: ${s.error}`
                    : s.to !== s.from
                      ? `${s.from}  →  ${s.to}${s.files_renamed > 0 ? `  (+${s.files_renamed} Dateien)` : ""}`
                      : `${s.from}  →  ${s.files_renamed} Datei${s.files_renamed === 1 ? "" : "en"}`}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Button
              size="sm"
              icon={FolderTree}
              onClick={handleSyncCheck}
              loading={busy === "sync"}
              disabled={busy !== null}
            >
              Abgleich prüfen
            </Button>
            {syncPlan && syncPlan.some(s => !s.error) && (
              <Button
                size="sm"
                variant="primary"
                icon={Wrench}
                onClick={handleSyncApply}
                disabled={busy !== null}
              >
                {syncPlan.filter(s => !s.error).length} umbenennen
              </Button>
            )}
          </div>
        </div>

        {/* Templates */}
        <div style={{
          padding: "16px 18px",
          background: C.surfaceContainerHighest,
          border: `1px solid ${C.border15}`,
          borderRadius: radius.control,
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <FileText size={14} color={C.tertiary ?? C.tertiary} strokeWidth={1.75} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.onSurface }}>Beschreibungs-Templates</div>
            <div style={{ fontSize: 11, color: C.onSecondaryFixedVar, marginTop: 2 }}>
              beatstars / soundcloud / youtube .template — Änderungen wirken beim nächsten Re-Render
            </div>
          </div>
          <Button variant="secondary" icon={FolderOpen} onClick={handleOpenTemplates}>Ordner öffnen</Button>
        </div>
      </div>
    </Section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Draft = AppSettings;

export function Settings() {
  const { settings, isLoaded, updateSettings } = useSettings();

  // Local draft state — only applied on Save. DEFAULTS davor, damit ein
  // Settings-Objekt ohne den neuesten Schlüssel (alter Stand im Speicher)
  // die Seite nicht mit "cannot read properties of undefined" abschießt.
  const [draft, setDraft] = useState<Draft>(() => ({ ...DEFAULTS, ...settings }));
  const [nacherfassen, setNacherfassen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [section, setSection] = useState<SettingsSection>("paths");

  // The authoritative settings arrive async from SQLite; re-seed the draft
  // once they are in so a Save can never overwrite the DB with stale
  // localStorage values.
  useEffect(() => {
    if (isLoaded) setDraft({ ...DEFAULTS, ...settings });
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
      <PageHeader
        icon={SettingsIcon}
        title="Einstellungen"
        actions={saved && (
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.mint }}>
            <CheckCircle size={14} />
            Gespeichert
          </span>
        )}
      />

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
                padding: "9px 12px", borderRadius: radius.control,
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
        <PageBody width="reading">

          {/* Warning if paths not set */}
          {section === "paths" && !settings.archivePath && (
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "14px 18px", borderRadius: radius.control,
              background: alpha(C.primary, 0.08),
              border: `1px solid ${alpha(C.primary, 0.25)}`,
            }}>
              <AlertCircle size={16} color={C.primary} />
              <span style={{ fontSize: 12, color: C.primary }}>
                Es ist kein Archiv-Ordner gesetzt. Ohne ihn kann nichts archiviert werden.
              </span>
            </div>
          )}

          {/* Paths */}
          {section === "paths" && (
          <Section
            title="Pfade"
            description="Wo BeatOS deine Beat-Dateien liest und ablegt."
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <PathInput
                label="Archiv-Ordner"
                icon={Archive}
                value={draft.archivePath}
                placeholder="z.B. D:\Beat Library\03_ARCHIVE"
                onChange={v => update("archivePath", v)}
                onBrowse={async () => {
                  const p = await pickFolder("Archiv-Ordner wählen");
                  if (p) update("archivePath", p);
                }}
              />
              <PathListInput
                label="Produktions-Ordner"
                icon={HardDrive}
                value={draft.productionPath}
                onChange={v => update("productionPath", v)}
                browseTitle="Produktions-Ordner hinzufügen"
              />
              <PathInput
                label="Asset-Ordner"
                icon={Image}
                value={draft.assetPath}
                placeholder="z.B. D:\Beat Library\04_ASSETS\Covers"
                onChange={v => update("assetPath", v)}
                onBrowse={async () => {
                  const p = await pickFolder("Asset-Ordner wählen");
                  if (p) update("assetPath", p);
                }}
              />
              {/* Künstler-Projekte (Mix & Master). Leer = 05_ARTISTS neben dem
                  Archiv-Ordner — der Platzhalter zeigt, was dann gilt. */}
              <PathInput
                label="Künstler-Ordner"
                icon={Users}
                value={draft.artistsPath}
                placeholder={kuenstlerOrdner({ artistsPath: "", archivePath: draft.archivePath }) || "z.B. D:\\Beat Library\\05_ARTISTS"}
                onChange={v => update("artistsPath", v)}
                onBrowse={async () => {
                  const p = await pickFolder("Künstler-Ordner wählen");
                  if (p) update("artistsPath", p);
                }}
              />
              {/* Woher Vocals & Demos kommen: der Künstler-Tab schlägt Dateien
                  von hier für die Songs vor. Leer = Downloads von Windows. */}
              <PathInput
                label="Downloads-Ordner"
                icon={Download}
                value={draft.downloadsPath}
                placeholder="Leer = Downloads von Windows, z.B. D:\Downloads"
                onChange={v => update("downloadsPath", v)}
                onBrowse={async () => {
                  const p = await pickFolder("Downloads-Ordner wählen");
                  if (p) update("downloadsPath", p);
                }}
              />
              {/* Zwischenspeicher für Beats von aussen: „Neuer Beat" listet
                  die Unterordner, statt dass man sie im Dateidialog sucht. */}
              <PathInput
                label="Übergabe-Ordner"
                icon={FolderOpen}
                value={draft.importPath}
                placeholder="z.B. C:\Users\…\Downloads\BeatOS-Import  (optional)"
                onChange={v => update("importPath", v)}
                onBrowse={async () => {
                  const p = await pickFolder("Übergabe-Ordner wählen");
                  if (p) update("importPath", p);
                }}
              />
              <PathInput
                label="Template-FLP"
                icon={Music2}
                value={draft.flpTemplatePath}
                placeholder="z.B. D:\Beat Library\_TEMPLATE\Start.flp"
                onChange={v => update("flpTemplatePath", v)}
                onBrowse={async () => {
                  const p = await pickFlp();
                  if (p) update("flpTemplatePath", p);
                }}
              />
            </div>
          </Section>
          )}

          {/* Producer Info — used by Upload-tab template generation */}
          {section === "producer" && (
          <Section
            title="Producer-Infos"
            description="Werden im Upload-Tab für die Beatstars-, SoundCloud- und YouTube-Beschreibungen eingesetzt."
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <TextSetting
                label="Producer-Name"
                icon={User}
                value={draft.producerName}
                placeholder="z.B. goodbxy"
                onChange={v => update("producerName", v)}
              />
              <TextSetting
                label="Kontakt-E-Mail"
                icon={Mail}
                value={draft.contactEmail}
                placeholder="z.B. contact@prod404.com"
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
              {/* Selten gebraucht: ältere Uploads nachtragen, die vor der
                  Upload-Erfassung (02/2026) liegen. Liest die Kanäle oben. */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: C.onSecondaryFixedVar }}>
                <Button variant="ghost" size="sm" icon={History} onClick={() => setNacherfassen(true)}
                  title="Videos und Tracks der Kanäle oben lesen und fehlende Upload-Einträge ergänzen">
                  Uploads von den Kanälen nacherfassen …
                </Button>
                <span>für Beats, die vor 02/2026 hochgeladen wurden</span>
              </div>
              {nacherfassen && (
                <UploadsNacherfassenDialog
                  youtubeUrl={draft.youtubeUrl}
                  soundcloudUrl={draft.soundcloudUrl}
                  onClose={() => setNacherfassen(false)}
                />
              )}
              {/* Default-Tags als Chips — gespeichert weiterhin als Komma-Liste */}
              <ChipListEditor
                label="Standard-Tags für SoundCloud"
                values={draft.defaultGenreTags.split(",").map(t => t.trim()).filter(Boolean)}
                onChange={vals => update("defaultGenreTags", vals.join(", "))}
                separatorLabel=","
                placeholder="Tag eingeben, Enter drücken … (z.B. Melodic Trap)"
                hint="werden bei SoundCloud immer vorangestellt"
              />

              {/* Adressbuch der Sample-Geber */}
              <SampleProducersCard />

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
            title="Über die App"
            description="Informationen zur Anwendung."
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                ["Version", "0.1.0"],
                ["Plattform", "Tauri + React"],
              ].map(([label, value]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: C.onSurfaceVariant }}>{label}</span>
                  <span style={{ color: C.onSurface, fontFamily: "monospace" }}>{value}</span>
                </div>
              ))}
            </div>
          </Section>
          )}

        </PageBody>
      </div>

      {/* Unsaved-changes bar — unmissable, pinned above the content */}
      {isDirty && (
        <div style={{
          flexShrink: 0,
          display: "flex", alignItems: "center", gap: 16,
          padding: "14px 32px",
          background: alpha(C.primary, 0.10),
          borderTop: `1px solid ${alpha(C.primary, 0.45)}`,
          backdropFilter: "blur(12px)",
        }}>
          <AlertCircle size={18} color={C.primary} />
          <span style={{ fontSize: 13, fontWeight: 600, color: C.onSurface }}>
            Ungespeicherte Änderungen
          </span>
          <div style={{ flex: 1 }} />
          <Button variant="secondary" onClick={handleReset}>
            Verwerfen
          </Button>
          <Button
            variant="primary"
            icon={CheckCircle}
            onClick={handleSave}
            disabled={!isLoaded}
            style={{ padding: "10px 28px" }}
          >
            Speichern
          </Button>
        </div>
      )}
    </div>
  );
}
