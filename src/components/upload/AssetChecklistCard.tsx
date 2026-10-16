// src/components/upload/AssetChecklistCard.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Was im Beat-Ordner liegt — eine Kachel je Datei, in der Kopfkarte des
// Upload-Tabs. Quelle ist das Dateisystem (gescannt in get_upload_data).
//
// Früher eine aufklappbare Liste mit Haken und Dateinamen: ein Register.
// Jetzt Kacheln: Cover und Thumbnail zeigen ihr Bild, was fehlt, ist
// gestrichelt — das übliche Zeichen für „hier kann etwas hin". Dateien aus
// dem Explorer lassen sich aufs Fenster ziehen; die Kachel, in der eine Datei
// landen würde, leuchtet schon beim Ziehen auf.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import {
  FileAudio, FileVideo, FolderOpen, FolderTree, RefreshCw, Wand2, X, Plus, Archive,
} from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { C, alpha, radius } from "../../lib/theme";
import { SectionIconBtn } from "../ui/SectionCard";
import { useEscapeStack } from "../ui";
import { api } from "../../lib/api";
import { useSettings } from "../../contexts/SettingsContext";
import { useDialog } from "../../contexts/DialogContext";
import { AssetPickerDialog, type AssetSlotKind } from "../AssetPickerDialog";
import type { AssetCheck } from "../../types/upload";

interface AssetChecklistCardProps {
  assets: AssetCheck;
  beatPath: string;
  onRefresh: () => void;
  onConvert: () => void;
}

type Kachel = "mp3" | "wav" | "flp" | "cover" | "thumbnail" | "video";

const KACHELN: { id: Kachel; label: string }[] = [
  { id: "mp3", label: "MP3" },
  { id: "wav", label: "WAV" },
  { id: "flp", label: "FLP" },
  { id: "cover", label: "Cover" },
  { id: "thumbnail", label: "Thumbnail" },
  { id: "video", label: "Video" },
];

/** Fehlt eine dieser Dateien, lässt sie sich direkt aus dem Asset-Ordner
 *  zuweisen. */
const ZUWEISBAR: Partial<Record<Kachel, AssetSlotKind>> = {
  cover: "cover", thumbnail: "thumbnail", video: "video",
};

/** Was Cover und Thumbnail an Maßen mitbringen sollen.
 *
 *  Die Vorlagen schreiben `_Cover_2000x2000.png` und
 *  `_THUMBNAIL_1920x1080.png` — geprüft wurde das nie. Ein Cover in 1500×1500
 *  fällt sonst erst auf, wenn die Plattform es ablehnt.
 *
 *  Geprüft wird das Seitenverhältnis und eine Mindestbreite, nicht die exakte
 *  Pixelzahl: ein Cover in 3000×3000 ist richtig, nur größer. */
const MASSE: Record<"cover" | "thumbnail", { verhaeltnis: number; minBreite: number; soll: string }> = {
  cover:     { verhaeltnis: 1,      minBreite: 1400, soll: "quadratisch, ab 1400 px" },
  thumbnail: { verhaeltnis: 16 / 9, minBreite: 1280, soll: "16:9, ab 1280 px" },
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

export function AssetChecklistCard({ assets, beatPath, onRefresh, onConvert }: AssetChecklistCardProps) {
  const { settings } = useSettings();
  const { melde } = useDialog();
  const [picker, setPicker] = useState<AssetSlotKind | null>(null);
  const [preview, setPreview] = useState<{ label: string; path: string } | null>(null);

  // Trenner aus dem Pfad selbst ablesen statt fest annehmen: die Bibliothek
  // kann unter Windows wie unter macOS liegen.
  const vollerPfad = (dateiname: string | null) => {
    if (!dateiname || !beatPath) return null;
    const sep = beatPath.includes("\\") ? "\\" : "/";
    return `${beatPath}${sep}${dateiname}`;
  };

  const datei: Record<Kachel, string | null> = {
    mp3: assets.mp3, wav: assets.wav, flp: assets.flp,
    cover: assets.cover, thumbnail: assets.thumbnail, video: assets.video,
  };
  const coverMass = useImageSize(vollerPfad(assets.cover), MASSE.cover);
  const thumbMass = useImageSize(vollerPfad(assets.thumbnail), MASSE.thumbnail);
  const mass: Partial<Record<Kachel, Mass | null>> = { cover: coverMass, thumbnail: thumbMass };

  const klick = (k: Kachel) => {
    const name = datei[k];
    if (!name) {
      const slot = ZUWEISBAR[k];
      if (slot) setPicker(slot);
      return;
    }
    const pfad = vollerPfad(name);
    if (!pfad) return;
    if (k === "cover" || k === "thumbnail") setPreview({ label: k === "cover" ? "Cover" : "Thumbnail", path: pfad });
    else revealItemInDir(pfad).catch(() => {});
  };

  const aufraeumen = async () => {
    try { await api.upload.cleanOldExports(beatPath); }
    catch (e) { console.error("[Assets] Aufräumen fehlgeschlagen:", e); }
    onRefresh();
  };

  // ── Dateien reinziehen ─────────────────────────────────────────────────────
  // Aus dem Explorer aufs Fenster ziehen: schon beim Hereinziehen leuchtet die
  // Kachel auf, in der die Datei landen würde. Loslassen kopiert sie in den
  // Beat-Ordner — mit demselben Befehl wie das Zuweisen und das Ziehen im Studio.
  const [ziehen, setZiehen] = useState<Gezogen[] | null>(null);
  useEffect(() => {
    if (!beatPath || !("__TAURI_INTERNALS__" in window)) return;
    let stop: (() => void) | undefined;
    let entfernt = false;
    let aktuell: Gezogen[] = [];
    getCurrentWebview().onDragDropEvent(async event => {
      const p = event.payload;
      if (p.type === "enter") {
        aktuell = p.paths.map(pfad => ({ pfad, ziel: zielVorlaeufig(pfad) }));
        setZiehen(aktuell);
        // Bilder ohne „thumb"/„cover" im Namen: erst die Maße entscheiden.
        aktuell = await Promise.all(aktuell.map(async g =>
          g.ziel === "bild" ? { ...g, ziel: await bildZiel(g.pfad) } : g));
        setZiehen(aktuell);
      } else if (p.type === "leave") {
        setZiehen(null);
      } else if (p.type === "drop") {
        setZiehen(null);
        const fehler: string[] = [];
        for (const g of aktuell) {
          // Schneller losgelassen, als die Maße gelesen waren: jetzt lesen.
          const ziel = g.ziel === "bild" ? await bildZiel(g.pfad) : g.ziel;
          if (ziel === null || ziel === "bild") continue;
          try {
            await api.studio.assignAsset(g.pfad, settings.assetPath, beatPath, SLOT_DER_ZIELE[ziel]);
          } catch (e) {
            fehler.push(`${dateiname(g.pfad)}: ${String(e)}`);
          }
        }
        onRefresh();
        if (fehler.length) melde(`Nicht übernommen:\n\n${fehler.join("\n")}`);
      }
    }).then(un => { if (entfernt) un(); else stop = un; })
      .catch(e => console.error("[Assets] Drag & Drop nicht verfügbar:", e));
    return () => { entfernt = true; stop?.(); };
  }, [beatPath, settings.assetPath, onRefresh, melde]);

  /** Welche gezogene Datei in welcher Kachel landen würde. */
  const eingehend = (k: Kachel) => ziehen?.find(g => g.ziel === k);
  const ignoriert = ziehen?.filter(g => g.ziel === null).length ?? 0;

  return (
    <>
      <div style={{ display: "flex", alignItems: "stretch", gap: 8, flexWrap: "wrap" }}>
        {KACHELN.map(({ id, label }) => (
          <AssetKachel
            key={id}
            label={label}
            datei={datei[id]}
            bild={id === "cover" || id === "thumbnail" ? vollerPfad(datei[id]) : null}
            breit={id === "thumbnail"}
            mass={mass[id] ?? null}
            soll={id === "cover" || id === "thumbnail" ? MASSE[id].soll : undefined}
            zuweisbar={id in ZUWEISBAR}
            icon={id === "flp" ? FolderTree : id === "video" ? FileVideo : FileAudio}
            eingehend={eingehend(id)?.pfad ?? null}
            onClick={() => klick(id)}
          />
        ))}
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <SectionIconBtn icon={Wand2} title="Dateinamen auf das Namensschema bringen" onClick={onConvert} />
          <SectionIconBtn icon={RefreshCw} title="Ordner neu scannen" onClick={onRefresh} />
          <SectionIconBtn icon={FolderOpen} title="Beat-Ordner öffnen" onClick={() => revealItemInDir(beatPath).catch(() => {})} />
        </div>
      </div>

      {/* Eine leise Zeile: was man hier tun kann — oder beim Ziehen, was passiert. */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        marginTop: 10, fontSize: 11,
        color: ziehen ? C.primary : C.onSecondaryFixedVar,
      }}>
        {ziehen ? (
          <>
            Loslassen — {ziehen.length - ignoriert === 1 ? "1 Datei" : `${ziehen.length - ignoriert} Dateien`} in den Beat-Ordner
            {ignoriert > 0 && <span style={{ color: C.onSecondaryFixedVar }}>· {ignoriert} passt nirgends hin</span>}
          </>
        ) : (
          <>
            Dateien aus dem Explorer hierher ziehen
            {/* Nach ein paar Exporten aus FL liegen mehrere MP3/WAV im Ordner.
                Gezeigt wird die neueste; die übrigen lassen sich wegräumen. */}
            {assets.alte_exporte > 0 && (
              <>
                <span>·</span>
                <Archive size={11} strokeWidth={1.75} />
                <span style={{ color: C.onSurfaceVariant }}>
                  {assets.alte_exporte === 1 ? "1 älterer Export" : `${assets.alte_exporte} ältere Exporte`}
                </span>
                <button
                  onClick={aufraeumen}
                  title="Ältere MP3/WAV nach 02_OLD verschieben — die neueste bleibt"
                  style={{
                    padding: 0, background: "none", border: "none",
                    color: C.primary, cursor: "pointer",
                    fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                  }}
                >
                  nach 02_OLD verschieben
                </button>
              </>
            )}
          </>
        )}
      </div>

      {preview && <Lupe label={preview.label} path={preview.path} onClose={() => setPreview(null)} />}

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
}

/** Eine Datei als Kachel. Da: ruhige Fläche (bei Bildern das Bild selbst).
 *  Fehlt: gestrichelt mit „+". Beim Ziehen: leuchtet, wenn hier etwas landet. */
function AssetKachel({ label, datei, bild, breit, mass, soll, zuweisbar, icon: Icon, eingehend, onClick }: {
  label: string;
  datei: string | null;
  bild: string | null;
  breit: boolean;
  mass: Mass | null;
  soll?: string;
  zuweisbar: boolean;
  icon: React.ElementType;
  eingehend: string | null;
  onClick: () => void;
}) {
  const da = datei !== null;
  const falsch = mass !== null && !mass.ok;
  const klickbar = da || zuweisbar;
  const [hover, setHover] = useState(false);

  const titel =
    eingehend ? `${dateiname(eingehend)} → ${label}`
    : !da ? (zuweisbar ? `${label} fehlt — aus dem Asset-Ordner zuweisen oder hierher ziehen` : `${label} fehlt`)
    : falsch && mass ? `${datei}\n${mass.breite}×${mass.hoehe} — erwartet ${soll}`
    : mass ? `${datei}\n${mass.breite}×${mass.hoehe}`
    : datei ?? label;

  return (
    <button
      type="button"
      onClick={klickbar ? onClick : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={titel}
      style={{
        position: "relative", overflow: "hidden",
        width: breit ? 104 : 64, height: 58, flexShrink: 0,
        padding: 0, borderRadius: radius.control,
        cursor: klickbar ? "pointer" : "default",
        fontFamily: "inherit",
        background: eingehend ? alpha(C.primary, 0.14)
          : da ? "rgba(255,255,255,0.04)" : "transparent",
        border: eingehend ? `1px solid ${C.primary}`
          : falsch ? `1px solid ${alpha(C.primary, 0.6)}`
          : da ? `1px solid ${hover && klickbar ? C.border30 : C.border10}`
          : `1px dashed ${hover && klickbar ? C.border30 : C.border20}`,
        transition: "border-color 0.15s, background 0.15s",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 4,
      }}
    >
      {da && bild && !eingehend && <KachelBild pfad={bild} />}

      {/* Über einem Bild sitzt die Beschriftung auf einem Verlauf, sonst ist
          sie auf hellen Covern nicht zu lesen. */}
      {!(da && bild) || eingehend ? (
        eingehend
          ? <Plus size={14} color={C.primary} strokeWidth={2.25} />
          : da ? <Icon size={15} color={C.onSurfaceVariant} strokeWidth={1.5} />
          : <Plus size={14} color={C.onSecondaryFixedVar} strokeWidth={2} />
      ) : null}
      <span style={{
        position: da && bild && !eingehend ? "absolute" : "static",
        left: 0, right: 0, bottom: 0,
        padding: da && bild && !eingehend ? "10px 4px 3px" : 0,
        background: da && bild && !eingehend ? "linear-gradient(transparent, rgba(0,0,0,0.75))" : "none",
        fontSize: 10, fontWeight: 600, textAlign: "center",
        color: eingehend ? C.primary : da ? C.onSurface : C.onSecondaryFixedVar,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        maxWidth: "100%",
      }}>
        {label}
      </span>
      {falsch && !eingehend && (
        <span style={{
          position: "absolute", top: 4, right: 4,
          width: 6, height: 6, borderRadius: "50%", background: C.primary,
        }} />
      )}
    </button>
  );
}

function KachelBild({ pfad }: { pfad: string }) {
  return (
    <img
      src={convertFileSrc(pfad.replace(/\\/g, "/"))}
      alt=""
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
    />
  );
}

// ─── Dateien reinziehen ──────────────────────────────────────────────────────

/** Wohin eine gezogene Datei geht. `bild` = Maße werden noch gelesen,
 *  `null` = passt nirgends hin. */
type Ziel = "mp3" | "wav" | "cover" | "thumbnail" | "video" | "bild" | null;
type Gezogen = { pfad: string; ziel: Ziel };

/** Audio bekommt keinen Slot — es behält seinen Namen, wie ein Export aus FL. */
const SLOT_DER_ZIELE: Record<"mp3" | "wav" | "cover" | "thumbnail" | "video", string | undefined> = {
  mp3: undefined, wav: undefined, cover: "cover", thumbnail: "thumbnail", video: "video",
};

// GENAU die Endungen, die der Ordner-Scan liest — sonst landet eine Datei im
// Ordner und bleibt unsichtbar.
const BILD_EXT = ["png", "jpg", "jpeg", "webp", "gif"];
const dateiname = (p: string) => p.split(/[/\\]/).pop() ?? p;
const endung = (p: string) => p.split(".").pop()?.toLowerCase() ?? "";

export function zielVorlaeufig(pfad: string): Ziel {
  const ext = endung(pfad);
  if (ext === "mp3" || ext === "wav") return ext;
  if (ext === "mp4") return "video";
  if (!BILD_EXT.includes(ext)) return null;
  const name = dateiname(pfad).toLowerCase();
  if (name.includes("thumb")) return "thumbnail";
  if (name.includes("cover")) return "cover";
  return "bild";
}

/** Breit wie 16:9 → Thumbnail, sonst Cover. */
async function bildZiel(pfad: string): Promise<Ziel> {
  const laden = (src: string) => new Promise<HTMLImageElement>((ok, fehl) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = fehl;
    img.src = src;
  });
  try {
    // Außerhalb des Asset-Bereichs liefert das Protokoll nichts — dann über
    // das Backend, wie die Vorschau es auch tut.
    const img = await laden(convertFileSrc(pfad.replace(/\\/g, "/")))
      .catch(async () => laden(await api.create.readImageFile(pfad)));
    return img.naturalWidth / img.naturalHeight > 1.5 ? "thumbnail" : "cover";
  } catch {
    return "cover";
  }
}

// ─── Lupe ────────────────────────────────────────────────────────────────────

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
