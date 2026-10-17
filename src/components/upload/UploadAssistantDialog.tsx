// src/components/upload/UploadAssistantDialog.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Release-Assistent: ein Durchgang über alle noch offenen Plattformen, in der
// Reihenfolge BeatStars → YouTube → SoundCloud. Pro Plattform:
//   1. Upload-Seite öffnen   2.–4. Titel, Beschreibung, Tags kopieren
//   5. Link einfügen → hochgeladen, weiter zur nächsten
//
// Früher gab es drei getrennte Assistenten, und die Reihenfolge war Sache des
// Gedächtnisses. Sie ist aber nicht beliebig: der BeatStars-Link steht in den
// Beschreibungen von YouTube und SoundCloud. Deshalb wird nach jedem Schritt
// neu gerendert — die YouTube-Beschreibung enthält dann schon den Link, der
// eben eingefügt wurde.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import {
  ExternalLink, Copy, Check, Loader2, Rocket, Link2,
  ShoppingBag, Music2, Youtube, AlertTriangle,
} from "lucide-react";
import { C, radius, PLATFORM_CONFIG, alpha } from "../../lib/theme";
import { api } from "../../lib/api";
import { extractTitle, extractDescription, extractTags } from "../../lib/descriptions";
import { RELEASE_REIHENFOLGE, plattformAusLink, hochgeladenMelden } from "../../lib/uploadLinks";
import { Modal, Button } from "../ui";
import type { UploadPlatform, UploadDescriptions, UploadPlatformRow } from "../../types/upload";

const PLATFORM_ICON: Record<UploadPlatform, React.ElementType> = {
  beatstars: ShoppingBag,
  soundcloud: Music2,
  youtube: Youtube,
};

const UPLOAD_URLS: Record<UploadPlatform, string> = {
  beatstars:  "https://studio.beatstars.com",
  soundcloud: "https://soundcloud.com/upload",
  youtube:    "https://studio.youtube.com",
};

interface UploadAssistantDialogProps {
  beatId: string;
  uploads: UploadPlatformRow[];
  onClose: () => void;
  /** Nach jedem gespeicherten Schritt — die Karte lädt neu. */
  onChanged: () => void;
}

type CopyKey = "title" | "description" | "tags";
const NICHTS_KOPIERT: Record<CopyKey, boolean> = { title: false, description: false, tags: false };

export function UploadAssistantDialog({ beatId, uploads, onClose, onChanged }: UploadAssistantDialogProps) {
  // Welche Plattformen dieser Durchgang abarbeitet — einmal beim Öffnen
  // festgelegt, damit die Liste nicht schrumpft, während man sie abarbeitet.
  const [reihe] = useState(() =>
    RELEASE_REIHENFOLGE.filter(p => uploads.find(u => u.platform === p)?.status !== "uploaded"));
  const [schritt, setSchritt] = useState(0);
  const [erledigt, setErledigt] = useState<Partial<Record<UploadPlatform, boolean>>>({});

  const [drafts, setDrafts] = useState<UploadDescriptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [copied, setCopied] = useState(NICHTS_KOPIERT);
  const [url, setUrl] = useState("");
  const [speichert, setSpeichert] = useState(false);

  const platform = reihe[schritt];

  // Bei jedem Schritt neu rendern: der eben gespeicherte BeatStars-Link
  // soll in der YouTube-Beschreibung schon drinstehen.
  useEffect(() => {
    let cancelled = false;
    setDrafts(null);
    api.upload.effectiveDescriptions(beatId)
      .then(d => { if (!cancelled) setDrafts(d); })
      .catch(e => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, [beatId, schritt]);

  if (!platform) {
    return (
      <Modal icon={Rocket} title="Release" onClose={onClose} width={520}>
        <div style={{ padding: 12, fontSize: 12, color: C.onSurfaceVariant }}>
          Alle Plattformen sind schon hochgeladen.
        </div>
      </Modal>
    );
  }

  const meta = PLATFORM_CONFIG[platform];
  const PlatIcon = PLATFORM_ICON[platform];
  const content = drafts?.[platform] ?? "";
  const pieces: Record<CopyKey, string> = {
    title: extractTitle(content),
    description: extractDescription(content),
    tags: extractTags(content),
  };

  const kopierSchritte = ([
    ["title", "Titel kopieren"],
    ["description", "Beschreibung kopieren"],
    ["tags", "Tags kopieren"],
  ] as Array<[CopyKey, string]>)
    .filter(([key]) => !(platform === "beatstars" && key === "description"))
    .filter(([key]) => key === "title" || pieces[key]);

  const linkPlattform = url.trim() ? plattformAusLink(url) : null;
  const falscherLink = linkPlattform !== null && linkPlattform !== platform;
  const ohneBeatstarsLink = platform !== "beatstars"
    && !uploads.find(u => u.platform === "beatstars")?.url;

  const handleCopy = async (key: CopyKey) => {
    try {
      await navigator.clipboard.writeText(pieces[key]);
      setCopied(prev => ({ ...prev, [key]: true }));
    } catch (e) {
      setError(`Clipboard fehlgeschlagen: ${String(e)}`);
    }
  };

  const handleOpenPlatform = () => {
    window.open(UPLOAD_URLS[platform], "_blank");
    setOpened(true);
  };

  const weiter = () => {
    setOpened(false);
    setCopied(NICHTS_KOPIERT);
    setUrl("");
    setError(null);
    if (schritt + 1 >= reihe.length) onClose();
    else setSchritt(s => s + 1);
  };

  const hochgeladen = async () => {
    const row = uploads.find(u => u.platform === platform);
    if (!row) return;
    setSpeichert(true);
    try {
      await hochgeladenMelden(beatId, row, url.trim() || null);
      // Was hochgeladen wurde, landet als .txt im Beat-Ordner — als Ablage.
      // Fehlt der Ordner, ist das kein Grund, den Upload nicht zu vermerken.
      if (content) {
        await api.upload.saveDescriptions({
          beat_id: beatId, beatstars: null, soundcloud: null, youtube: null, [platform]: content,
        })
          .catch(e => console.error("[Release] .txt schreiben fehlgeschlagen:", e));
      }
      setErledigt(prev => ({ ...prev, [platform]: true }));
      onChanged();
      weiter();
    } catch (e) {
      setError(`Speichern fehlgeschlagen: ${String(e)}`);
    } finally {
      setSpeichert(false);
    }
  };

  return (
    <Modal
      icon={Rocket}
      title={`Release · ${meta.label}`}
      onClose={onClose}
      width={520}
    >
        {/* Fortschritt über den ganzen Release */}
        {reihe.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            {reihe.map((p, i) => {
              const Icon = PLATFORM_ICON[p];
              const jetzt = i === schritt;
              const fertig = erledigt[p];
              return (
                <span key={p} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "4px 10px", borderRadius: radius.full,
                  fontSize: 12, fontWeight: 600,
                  border: `1px solid ${jetzt ? alpha(PLATFORM_CONFIG[p].color, 0.5) : C.border15}`,
                  color: fertig ? C.mint : jetzt ? PLATFORM_CONFIG[p].color : C.onSecondaryFixedVar,
                }}>
                  {fertig ? <Check size={11} strokeWidth={2.5} /> : <Icon size={11} strokeWidth={2} />}
                  {PLATFORM_CONFIG[p].label}
                </span>
              );
            })}
          </div>
        )}

        {error && (
          <div style={{
            padding: "8px 12px", borderRadius: radius.control,
            background: alpha(C.error, 0.10), border: `1px solid ${alpha(C.error, 0.35)}`,
            fontSize: 12, color: C.error,
          }}>
            {error}
          </div>
        )}

        {ohneBeatstarsLink && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 12px", borderRadius: radius.control,
            background: alpha(C.primary, 0.08), border: `1px solid ${alpha(C.primary, 0.3)}`,
            fontSize: 12, color: C.onSurface,
          }}>
            <AlertTriangle size={13} color={C.primary} style={{ flexShrink: 0 }} />
            Noch kein BeatStars-Link — die Beschreibung enthält keinen Link zum Beat.
          </div>
        )}

        {!drafts && !error && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 20, justifyContent: "center", fontSize: 12, color: C.onSurfaceVariant }}>
            <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> Rendere Inhalte…
          </div>
        )}

        {drafts && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Step 1: open platform */}
            <StepRow
              index={1}
              done={opened}
              label={`${meta.label} öffnen`}
              detail={UPLOAD_URLS[platform].replace("https://", "")}
              action={
                <StepBtn onClick={handleOpenPlatform} done={opened} icon={ExternalLink} label={opened ? "Geöffnet" : "Öffnen"} />
              }
              icon={<PlatIcon size={13} color={meta.color} strokeWidth={2} />}
            />

            {/* Kopier-Schritte. BeatStars ohne Beschreibung: dort stehen in der
                Vorlage die Exportnamen, kein Text für die Plattform. Was leer
                ist, ist kein Schritt — es gäbe nichts zu kopieren. */}
            {kopierSchritte.map(([key, label], i) => [i + 2, key, label] as const).map(([idx, key, label]) => (
              <StepRow
                key={key}
                index={idx}
                done={copied[key]}
                label={label}
                detail={pieces[key]
                  ? (key === "title" ? pieces[key] : `${pieces[key].slice(0, 90)}${pieces[key].length > 90 ? "…" : ""}`)
                  : "— nicht vorhanden —"}
                action={
                  <StepBtn
                    onClick={() => handleCopy(key)}
                    done={copied[key]}
                    icon={Copy}
                    label={copied[key] ? "Kopiert" : "Kopieren"}
                    disabled={!pieces[key]}
                  />
                }
              />
            ))}

            {/* Step 5: Link + weiter */}
            <div style={{
              marginTop: 6,
              padding: "12px 14px",
              background: C.surfaceContainer,
              border: `1px solid ${C.border15}`,
              borderRadius: radius.card,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <StepIndex index={kopierSchritte.length + 2} done={linkPlattform === platform} />
                <span style={{ fontSize: 12, fontWeight: 600, color: C.onSurface }}>
                  Hochgeladen? Link einfügen
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Link2 size={13} color={C.onSecondaryFixedVar} style={{ flexShrink: 0 }} />
                <input
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder={`${meta.label}-Link (optional)`}
                  style={{
                    flex: 1,
                    padding: "7px 10px",
                    fontSize: 12, fontFamily: "monospace",
                    background: C.surfaceContainerHigh,
                    border: `1px solid ${falscherLink ? alpha(C.error, 0.5) : C.border20}`,
                    borderRadius: radius.control,
                    outline: "none",
                    color: C.onSurface,
                  }}
                />
              </div>
              {falscherLink && linkPlattform && (
                <div style={{ marginTop: 6, fontSize: 12, color: C.error }}>
                  Das ist ein {PLATFORM_CONFIG[linkPlattform].label}-Link.
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <Button
                  variant="secondary"
                  onClick={weiter}
                  disabled={speichert}
                  title="Diese Plattform jetzt auslassen — sie bleibt, wie sie ist"
                >
                  Überspringen
                </Button>
                <Button
                  variant="primary" icon={Check}
                  onClick={hochgeladen}
                  disabled={falscherLink}
                  loading={speichert}
                  style={{ flex: 1 }}
                >
                  {schritt + 1 < reihe.length
                    ? `Hochgeladen — weiter zu ${PLATFORM_CONFIG[reihe[schritt + 1]].label}`
                    : "Hochgeladen — fertig"}
                </Button>
              </div>
            </div>
          </div>
        )}
    </Modal>
  );
}

// ─── Step building blocks ───────────────────────────────────────────────────

function StepIndex({ index, done }: { index: number; done: boolean }) {
  return (
    <span style={{
      width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: done ? alpha(C.mint, 0.15) : "rgba(255,255,255,0.05)",
      border: `1px solid ${done ? alpha(C.mint, 0.45) : C.border20}`,
      fontSize: 11, fontWeight: 700,
      color: done ? C.mint : C.onSurfaceVariant,
    }}>
      {done ? <Check size={11} strokeWidth={3} /> : index}
    </span>
  );
}

function StepRow({ index, done, label, detail, action, icon }: {
  index: number;
  done: boolean;
  label: string;
  detail: string;
  action: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 14px",
      background: C.surfaceContainer,
      border: `1px solid ${done ? alpha(C.mint, 0.25) : C.border15}`,
      borderRadius: radius.card,
    }}>
      <StepIndex index={index} done={done} />
      {icon}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.onSurface }}>{label}</div>
        <div style={{
          fontSize: 11, color: C.onSecondaryFixedVar, marginTop: 2,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {detail}
        </div>
      </div>
      {action}
    </div>
  );
}

function StepBtn({ onClick, done, icon: Icon, label, disabled }: {
  onClick: () => void;
  done: boolean;
  icon: React.ElementType;
  label: string;
  disabled?: boolean;
}) {
  // Der secondary-Button der Familie; erledigt trägt er Mint und einen Haken.
  return (
    <Button
      variant="secondary" size="sm"
      icon={done ? Check : Icon}
      onClick={onClick}
      disabled={disabled}
      style={{ flexShrink: 0, ...(done ? { color: C.mint, borderColor: alpha(C.mint, 0.4) } : null) }}
    >
      {label}
    </Button>
  );
}
