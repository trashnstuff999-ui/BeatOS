// src/components/upload/AssetChecklistCard.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Read-only view of what's present in the beat folder.
// Source of truth = filesystem (scanned in get_upload_data).
// Collapsed to a single status line when everything is present; auto-expands
// (missing items first) when something is wrong. The description-files block
// moved out — the DescriptionFilesCard tabs and the header "Files" step
// already cover it.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import {
  CheckCircle2, XCircle, FileAudio, FileImage, FileVideo,
  FolderOpen, FolderTree, RefreshCw, Wand2, ChevronDown, ListChecks, X, Plus,
} from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { convertFileSrc } from "@tauri-apps/api/core";
import { C, alpha, radius } from "../../lib/theme";
import { SectionCard, SectionIconBtn } from "../ui/SectionCard";
import { useEscapeStack } from "../ui";
import { api } from "../../lib/api";
import { useSettings } from "../../contexts/SettingsContext";
import { AssetPickerDialog, type AssetSlotKind } from "../AssetPickerDialog";
import type { AssetCheck } from "../../types/upload";

interface AssetChecklistCardProps {
  assets: AssetCheck;
  beatPath: string;
  onRefresh: () => void;
  onConvert: () => void;
  /** Ohne eigene Karte rendern — haengt im Upload-Tab unter der Kopfzeile. */
  bare?: boolean;
}

/** Fehlt eine dieser Dateien, lässt sie sich hier direkt aus dem
 *  Asset-Ordner zuweisen — vorher hiess „fehlt" nur: woanders suchen gehen. */
const SLOT_FUER: Record<string, AssetSlotKind> = {
  Cover: "cover", Thumbnail: "thumbnail", "Video MP4": "video",
};

type Row = {
  label: string;
  filename: string | null;
  icon: React.ElementType;
};

/** Was Cover und Thumbnail an Maßen mitbringen sollen.
 *
 *  Die Vorlagen schreiben `_Cover_2000x2000.png` und
 *  `_THUMBNAIL_1920x1080.png` — geprüft wurde das nie. Ein Cover in 1500×1500
 *  fällt sonst erst auf, wenn die Plattform es ablehnt.
 *
 *  Geprüft wird das Seitenverhältnis und eine Mindestbreite, nicht die exakte
 *  Pixelzahl: ein Cover in 3000×3000 ist richtig, nur größer. */
const MASSE: Record<string, { verhaeltnis: number; minBreite: number; soll: string }> = {
  Cover:     { verhaeltnis: 1,      minBreite: 1400, soll: "quadratisch, ab 1400 px" },
  Thumbnail: { verhaeltnis: 16 / 9, minBreite: 1280, soll: "16:9, ab 1280 px" },
};

type Mass = { breite: number; hoehe: number; ok: boolean };

/** Maße einer Bilddatei — ohne Backend, das Bildelement kennt sie. */
function useImageSize(pfad: string | null, regel?: { verhaeltnis: number; minBreite: number }): Mass | null {
  const [mass, setMass] = useState<Mass | null>(null);

  useEffect(() => {
    setMass(null);
    if (!pfad || !regel) return;
    let abgebrochen = false;
    const img = new Image();
    img.onload = () => {
      if (abgebrochen) return;
      const { naturalWidth: breite, naturalHeight: hoehe } = img;
      if (!breite || !hoehe) return;
      // 2 % Toleranz: 1920×1080 trifft 16:9 exakt, 1918×1080 soll nicht meckern.
      const passt = Math.abs(breite / hoehe - regel.verhaeltnis) / regel.verhaeltnis < 0.02;
      setMass({ breite, hoehe, ok: passt && breite >= regel.minBreite });
    };
    img.onerror = () => {};
    img.src = convertFileSrc(pfad.replace(/\\/g, "/"));
    return () => { abgebrochen = true; };
  }, [pfad, regel?.verhaeltnis, regel?.minBreite]); // eslint-disable-line react-hooks/exhaustive-deps

  return mass;
}

export function AssetChecklistCard({ assets, beatPath, onRefresh, onConvert, bare = false }: AssetChecklistCardProps) {
  const { settings } = useSettings();
  const [picker, setPicker] = useState<AssetSlotKind | null>(null);
  const allRows: Row[] = [
    { label: "MP3",       filename: assets.mp3,       icon: FileAudio },
    { label: "WAV",       filename: assets.wav,       icon: FileAudio },
    { label: "FLP",       filename: assets.flp,       icon: FolderTree },
    { label: "Cover",     filename: assets.cover,     icon: FileImage },
    { label: "Thumbnail", filename: assets.thumbnail, icon: FileImage },
    { label: "Video MP4", filename: assets.video,     icon: FileVideo },
  ];

  const missing = allRows.filter(r => r.filename === null);
  const present = allRows.filter(r => r.filename !== null);
  const allOk = missing.length === 0;

  // Auto-expand when something is missing; collapse when complete.
  const [open, setOpen] = useState(!allOk);
  useEffect(() => { setOpen(!allOk); }, [allOk]);

  // Image preview overlay (Cover / Thumbnail rows)
  const [preview, setPreview] = useState<{ label: string; path: string } | null>(null);

  const handleRowClick = (row: Row) => {
    if (!beatPath) return;
    if (!row.filename) {
      const slot = SLOT_FUER[row.label];
      if (slot) setPicker(slot);
      return;
    }
    // Trenner aus dem Pfad selbst ablesen statt fest annehmen: die Bibliothek
    // kann unter Windows wie unter macOS liegen, und „/pfad\datei.wav" ist
    // auf keinem von beiden ein Pfad.
    const sep = beatPath.includes("\\") ? "\\" : "/";
    const fullPath = `${beatPath}${sep}${row.filename}`;
    if (row.label === "Cover" || row.label === "Thumbnail") {
      setPreview({ label: row.label, path: fullPath });
    } else if (row.label === "Video MP4") {
      revealItemInDir(fullPath).catch(() => {});
    }
  };

  const handleOpen = async () => {
    if (!beatPath) return;
    try { await revealItemInDir(beatPath); } catch {}
  };

  // Maße von Cover und Thumbnail. Die Regeln stehen in MASSE; fehlt die Datei,
  // gibt der Haken null zurück und alles bleibt wie vorher.
  const vollerPfad = (dateiname: string | null) => {
    if (!dateiname || !beatPath) return null;
    const sep = beatPath.includes("\\") ? "\\" : "/";
    return `${beatPath}${sep}${dateiname}`;
  };
  const coverMass = useImageSize(vollerPfad(assets.cover), MASSE.Cover);
  const thumbMass = useImageSize(vollerPfad(assets.thumbnail), MASSE.Thumbnail);
  const massFuer = (label: string): Mass | null =>
    label === "Cover" ? coverMass : label === "Thumbnail" ? thumbMass : null;

  /** Vorhanden, aber mit falschen Maßen — das Segment bleibt dann bernstein. */
  const massFalsch = (r: Row) => {
    const m = massFuer(r.label);
    return r.filename !== null && m !== null && !m.ok;
  };
  const schiefeMasse = allRows.filter(massFalsch).map(r => r.label);

  const body = (
    <>
      {/* Fortschritt statt Statuszeile: ein Segment je Datei, gefüllt was da
          ist. Man sieht die Lücke, statt sie aus „4/6" zu erschließen — und
          beim Ablegen der nächsten Datei füllt sich sichtbar eins mehr.
          Daneben die Aktionen mit Beschriftung: „Namen konvertieren" lag
          vorher im zugeklappten Teil und war praktisch unauffindbar. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={() => setOpen(o => !o)}
          title={open ? "Liste zuklappen" : "Alle Dateien zeigen"}
          style={{
            flex: 1, minWidth: 0,
            display: "flex", alignItems: "center", gap: 12,
            padding: "9px 12px",
            background: "transparent",
            border: `1px solid ${C.border15}`,
            borderRadius: radius.control,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span style={{ display: "flex", gap: 3, flexShrink: 0 }}>
            {allRows.map(r => {
              const m = massFuer(r.label);
              const falsch = massFalsch(r);
              return (
                <span
                  key={r.label}
                  title={
                    !r.filename ? `${r.label} fehlt`
                    : falsch && m ? `${r.label}: ${m.breite}×${m.hoehe} — erwartet ${MASSE[r.label].soll}`
                    : m ? `${r.label}: ${r.filename} (${m.breite}×${m.hoehe})`
                    : `${r.label}: ${r.filename}`
                  }
                  style={{
                    width: 22, height: 5, borderRadius: 3,
                    // Neutral statt grün: „Datei liegt da" ist eine Zählung,
                    // keine Zustandsaussage. Grün bleibt den zwei Stellen, die
                    // wirklich etwas melden — „Bereit zum Hochladen" oben und
                    // „Hochgeladen" im Status. Sonst ist die Seite so grün,
                    // dass nichts mehr heraussticht.
                    background: !r.filename ? C.border20 : falsch ? C.primary : C.onSurfaceVariant,
                  }}
                />
              );
            })}
          </span>

          <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: C.onSurface }}>
            {!allOk
              ? `${present.length} von ${allRows.length} — es fehlt ${missing.map(m => m.label).join(", ")}`
              : schiefeMasse.length > 0
                ? `Alle Dateien da — ${schiefeMasse.join(" und ")} ${schiefeMasse.length === 1 ? "hat" : "haben"} die falsche Größe`
                : "Alle Dateien da"
            }
          </span>

          <ChevronDown
            size={13}
            color={C.onSecondaryFixedVar}
            style={{ transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "rotate(0)" }}
          />
        </button>

        {/* Im rahmenlosen Modus tragen die Aktionen keine Kartenkopfzeile mehr
            — sie stehen direkt neben dem Fortschritt. */}
        {bare && (
          <>
            <button
              onClick={onConvert}
              title="Dateinamen im Beat-Ordner auf das Namensschema bringen"
              style={{
                display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
                padding: "8px 12px", borderRadius: radius.control,
                background: "transparent",
                border: `1px solid ${C.border20}`,
                color: C.onSurfaceVariant, cursor: "pointer",
                fontSize: 11, fontWeight: 600, fontFamily: "inherit",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.border30; e.currentTarget.style.color = C.onSurface; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border20; e.currentTarget.style.color = C.onSurfaceVariant; }}
            >
              <Wand2 size={12} strokeWidth={2} />
              Namen konvertieren
            </button>
            <SectionIconBtn icon={RefreshCw} title="Ordner neu scannen" onClick={onRefresh} />
            <SectionIconBtn icon={FolderOpen} title="Beat-Ordner öffnen" onClick={handleOpen} />
          </>
        )}
      </div>

      {open && (
        <div style={{ marginTop: 10 }}>
          {/* Eine Flaeche mit duennen Trennstrichen statt sechs einzelnen
              Kaesten: die Liste ist eine Aufzaehlung, kein halbes Dutzend
              Elemente. Fehlende zuerst — das ist, was Aufmerksamkeit braucht. */}
          <div style={{
            background: C.surfaceContainer,
            border: `1px solid ${C.border15}`,
            borderRadius: radius.control,
            overflow: "hidden",
          }}>
            {[...missing, ...present].map((row, i) => (
              <AssetRow key={row.label} {...row} first={i === 0} mass={massFuer(row.label)} onClick={() => handleRowClick(row)} />
            ))}
          </div>

          {/* Nur in der Kartenansicht: rahmenlos steht der Knopf oben
              neben dem Fortschritt, wo man ihn auch findet. */}
          {!bare && (
            <button
              onClick={onConvert}
              style={{
                marginTop: 10,
                // inline-flex: die Liste darueber ist kein Flex-Container mehr,
                // ein Block-Knopf zoege sich sonst ueber die ganze Breite.
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "6px 10px",
                background: "transparent",
                border: `1px solid ${C.border20}`,
                borderRadius: radius.control,
                cursor: "pointer",
                fontSize: 10, fontWeight: 600,
                color: C.onSurfaceVariant,
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.border30; e.currentTarget.style.color = C.onSurface; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border20; e.currentTarget.style.color = C.onSurfaceVariant; }}
            >
              <Wand2 size={11} strokeWidth={2} />
              Dateinamen konventionieren
            </button>
            )}
        </div>
      )}

      {/* Bild-Lupe */}
      {preview && (
        <Lupe label={preview.label} path={preview.path} onClose={() => setPreview(null)} />
      )}

      {picker && (
        <AssetPickerDialog
          targetDir={beatPath}
          assetRoot={settings.assetPath}
          slot={picker}
          onAssigned={() => onRefresh()}
          onClose={() => setPicker(null)}
        />
      )}
    </>
  );

  if (bare) return body;

  return (
    <SectionCard
      icon={ListChecks}
      title="Assets"
      actions={
        <div style={{ display: "flex", gap: 6 }}>
          <SectionIconBtn icon={RefreshCw} title="Ordner neu scannen" onClick={onRefresh} />
          <SectionIconBtn icon={FolderOpen} title="Beat-Ordner öffnen" onClick={handleOpen} />
        </div>
      }
    >
      {body}
    </SectionCard>
  );
}

/** Das Bild gross, Klick daneben oder Esc schliesst. */
function Lupe({ label, path, onClose }: { label: string; path: string; onClose: () => void }) {
  useEscapeStack(onClose);
  return (
        <div
          data-modal
          onClick={onClose}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 100, cursor: "zoom-out",
          }}
        >
          <div style={{ position: "relative", maxWidth: "80vw", maxHeight: "82vh" }}>
            <PreviewImage path={path} />
            <div style={{
              position: "absolute", top: -34, left: 0, right: 0,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.onSurface, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                {label}
              </span>
              <span style={{ flex: 1 }} />
              <X size={16} color={C.onSurfaceVariant} />
            </div>
          </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Full-size preview via asset protocol, base64 fallback outside the scope. */
function PreviewImage({ path }: { path: string }) {
  const [src, setSrc] = useState<string>(() => convertFileSrc(path.replace(/\\/g, "/")));
  const [triedBase64, setTriedBase64] = useState(false);

  const handleError = async () => {
    if (triedBase64) return;
    setTriedBase64(true);
    try { setSrc(await api.create.readImageFile(path)); } catch { /* bleibt leer */ }
  };

  return (
    <img
      src={src}
      onError={handleError}
      alt=""
      style={{
        maxWidth: "80vw", maxHeight: "82vh",
        borderRadius: radius.card, border: `1px solid ${C.border30}`,
        boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        display: "block",
      }}
    />
  );
}

function AssetRow({ label, filename, icon: Icon, onClick, mass, first }: Row & { onClick?: () => void; mass?: Mass | null; first?: boolean }) {
  const ok = filename !== null;
  // Vorhanden: Vorschau/Explorer. Fehlt: direkt zuweisen.
  const zuweisbar = !ok && label in SLOT_FUER;
  const clickable = zuweisbar || (ok && (label === "Cover" || label === "Thumbnail" || label === "Video MP4"));
  // Anklickbare Zeilen sind echte Knoepfe — sonst kommt man nur mit der Maus an
  // die Vorschau. Nicht anklickbare bleiben ein <div>, sie sind reine Anzeige.
  const Element = clickable ? "button" : "div";
  return (
    <Element
      type={clickable ? "button" : undefined}
      onClick={clickable ? onClick : undefined}
      title={zuweisbar ? "Aus dem Asset-Ordner zuweisen" : clickable ? (label === "Video MP4" ? "Im Explorer zeigen" : "Vorschau anzeigen") : undefined}
      style={{
      width: "100%", textAlign: "left", font: "inherit", border: "none",
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 12px",
      // Zeile in einer gemeinsamen Flaeche: kein eigener Kasten, nur ein
      // Trennstrich nach oben. Fehlendes bleibt getoent, das ist die Meldung.
      background: ok ? "transparent" : alpha(C.error, 0.06),
      borderTop: first ? "none" : `1px solid ${C.border10}`,
      cursor: clickable ? "pointer" : "default",
    }}>
      {ok
        ? <CheckCircle2 size={14} color={C.mint} strokeWidth={2} />
        : <XCircle size={14} color={C.error} strokeWidth={1.75} />
      }
      <Icon size={12} color={C.onSecondaryFixedVar} strokeWidth={1.5} />
      <span style={{
        fontSize: 10, fontWeight: 700, color: ok ? C.onSurfaceVariant : C.error,
        letterSpacing: "0.05em", textTransform: "uppercase",
        width: 72, flexShrink: 0,
      }}>
        {label}
      </span>
      <span style={{
        flex: 1, minWidth: 0,
        fontSize: 11,
        fontFamily: "monospace",
        color: ok ? C.onSurface : C.onSecondaryFixedVar,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        opacity: ok ? 0.9 : 0.6,
      }}>
        {filename ?? "fehlt"}
      </span>
      {zuweisbar && (
        <span style={{
          flexShrink: 0, display: "flex", alignItems: "center", gap: 4,
          fontSize: 10, fontWeight: 700, color: C.primary,
        }}>
          <Plus size={11} strokeWidth={2.25} />
          Zuweisen
        </span>
      )}
      {/* Maße nur bei Cover und Thumbnail, und nur wenn sie gelesen werden
          konnten. Stimmen sie nicht, steht daneben, was erwartet wird. */}
      {mass && (
        <span
          title={mass.ok ? undefined : `Erwartet: ${MASSE[label]?.soll}`}
          style={{
            flexShrink: 0, fontSize: 10, fontFamily: "monospace",
            padding: "2px 7px", borderRadius: radius.full,
            background: mass.ok ? "rgba(255,255,255,0.04)" : alpha(C.primary, 0.12),
            color: mass.ok ? C.onSecondaryFixedVar : C.primary,
          }}
        >
          {mass.breite}×{mass.hoehe}
        </span>
      )}
    </Element>
  );
}
