// src/contexts/SettingsContext.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// App Settings — persisted in SQLite (Rust), localStorage as fast-init cache
// ═══════════════════════════════════════════════════════════════════════════════

import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";
import { api } from "../lib/api";
import { useDialog } from "./DialogContext";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AppSettings {
  // Paths
  archivePath: string;
  productionPath: string;
  assetPath: string;
  /** Wohin fertige Beats von aussen abgelegt werden (Zwischenspeicher). */
  importPath: string;
  /** Vorlage, aus der „Neues Projekt" im Studio die FLP kopiert */
  flpTemplatePath: string;
  // Producer info (used by Upload-tab templates)
  producerName: string;
  contactEmail: string;
  instagramUrl: string;
  soundcloudUrl: string;
  youtubeUrl: string;
  beatstarsUrl: string;
  defaultGenreTags: string;
  /** Upload-Rhythmus: Wochentage als Zahlen (0 = So … 6 = Sa), z. B. "1,3,5". Leer = kein Rhythmus. */
  uploadDays: string;
  /** Künstler-Projekte (Mix & Master). Leer = 05_ARTISTS neben dem Archiv-Ordner. */
  artistsPath: string;
  /** Wo Discord & Browser hinladen. Leer = der Downloads-Ordner von Windows. */
  downloadsPath: string;
}

export const DEFAULTS: AppSettings = {
  archivePath: "",
  productionPath: "",
  assetPath: "",
  importPath: "",
  flpTemplatePath: "",
  producerName: "",
  contactEmail: "",
  instagramUrl: "",
  soundcloudUrl: "",
  youtubeUrl: "",
  beatstarsUrl: "",
  defaultGenreTags: "",
  uploadDays: "",
  artistsPath: "",
  downloadsPath: "",
};

const STORAGE_KEY = "beatos_settings";

// Map between camelCase frontend keys and snake_case DB keys
const KEY_MAP: Record<keyof AppSettings, string> = {
  archivePath: "archive_path",
  productionPath: "production_path",
  assetPath: "asset_path",
  importPath: "import_path",
  flpTemplatePath: "flp_template_path",
  producerName: "producer_name",
  contactEmail: "contact_email",
  instagramUrl: "instagram_url",
  soundcloudUrl: "soundcloud_url",
  youtubeUrl: "youtube_url",
  beatstarsUrl: "beatstars_url",
  defaultGenreTags: "default_genre_tags",
  uploadDays: "upload_days",
  artistsPath: "artists_path",
  downloadsPath: "downloads_path",
};

function settingsFromDbMap(map: Record<string, string>): AppSettings {
  const out = { ...DEFAULTS };
  (Object.keys(KEY_MAP) as Array<keyof AppSettings>).forEach(k => {
    out[k] = map[KEY_MAP[k]] ?? "";
  });
  return out;
}

function settingsToDbMap(s: AppSettings): Record<string, string> {
  const out: Record<string, string> = {};
  (Object.keys(KEY_MAP) as Array<keyof AppSettings>).forEach(k => {
    out[KEY_MAP[k]] = s[k];
  });
  return out;
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface SettingsContextValue {
  settings: AppSettings;
  /** true once the authoritative values from SQLite have been loaded */
  isLoaded: boolean;
  updateSettings: (partial: Partial<AppSettings>) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Wo die Künstler-Projekte liegen: die Einstellung, sonst 05_ARTISTS neben
 *  dem Archiv-Ordner (beide liegen in derselben Bibliothek). */
export function kuenstlerOrdner(s: Pick<AppSettings, "artistsPath" | "archivePath">): string {
  if (s.artistsPath.trim()) return s.artistsPath.trim();
  const archiv = s.archivePath.trim().replace(/[\\/]+$/, "");
  if (!archiv) return "";
  const sep = archiv.includes("\\") ? "\\" : "/";
  const i = archiv.lastIndexOf(sep);
  return i > 0 ? `${archiv.slice(0, i)}${sep}05_ARTISTS` : "";
}

/** productionPath stores MULTIPLE roots, one per line (legacy single path = 1 line).
 *
 *  Ein Schlussstrich fliegt raus: aus der Explorer-Adressleiste kopiert, endet
 *  ein Pfad gern auf „\". Der Merge-Dialog schneidet für den Parkordner den
 *  letzten Abschnitt ab — mit Schlussstrich landet `_ARCHIVIERT` dadurch IM
 *  Produktions-Ordner, und der nächste Scan liest ihn als ein einziges Projekt
 *  mit hunderten FLPs. */
export function parseProductionPaths(s: string): string[] {
  const gesehen = new Set<string>();
  const pfade: string[] = [];
  for (const roh of s.split(/\r?\n|;/)) {
    const pfad = roh.trim().replace(/[/\\]+$/, "");
    if (!pfad) continue;
    // Derselbe Ordner zweimal in den Einstellungen (auch als „C:/Prod" neben
    // „c:\PROD") hieß: jedes Projekt doppelt in der Liste, doppelte Zähler,
    // und zwei Zeilen, die sich um dieselbe DB-Zeile streiten.
    const schluessel = pfad.replace(/\//g, "\\").toLowerCase();
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    pfade.push(pfad);
  }
  return pfade;
}

function loadFromLocalStorage(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveToLocalStorage(s: AppSettings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { melde } = useDialog();
  const [settings, setSettings] = useState<AppSettings>(loadFromLocalStorage);
  const [isLoaded, setIsLoaded] = useState(false);

  const settingsRef = useRef<AppSettings>(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  // On mount, load the authoritative values from SQLite
  useEffect(() => {
    api.settings.get()
      .then(map => {
        const fromDb = settingsFromDbMap(map);
        // Only override if SQLite has values (first run: DB is empty → keep localStorage)
        if (Object.values(fromDb).some(v => v !== "")) {
          setSettings(fromDb);
          saveToLocalStorage(fromDb);
        }
        setIsLoaded(true);
      })
      .catch(e => {
        console.error("[SettingsContext] Failed to load settings from DB:", e);
        melde(
          `Einstellungen konnten nicht aus der Datenbank gelesen werden: ${String(e)}\n` +
          `Für diese Sitzung gilt der zuletzt lokal gemerkte Stand.`,
        );
        // DB unreachable — localStorage stays authoritative for this session.
        setIsLoaded(true);
      });
  }, []);

  // Schlug das Schreiben in die Datenbank fehl, stand der Wert weiter im Feld
  // und lag im localStorage — beim naechsten Start war er weg, ohne dass je
  // etwas gemeldet wurde. Bei Pfaden, an denen der ganze Rest haengt, ist das
  // die falsche Stelle zum Schweigen.
  const updateSettings = useCallback((partial: Partial<AppSettings>) => {
    const next = { ...settingsRef.current, ...partial };
    setSettings(next);
    saveToLocalStorage(next);
    api.settings.save(settingsToDbMap(next))
      .catch(e => {
        console.error("[SettingsContext] Failed to save settings to DB:", e);
        melde(
          `Einstellung nicht gespeichert: ${String(e)}\n` +
          `Sie gilt für diese Sitzung, ist nach einem Neustart aber wieder weg.`,
        );
      });
  }, [melde]);

  return (
    <SettingsContext.Provider value={{ settings, isLoaded, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
