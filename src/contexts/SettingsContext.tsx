// src/contexts/SettingsContext.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// App Settings — persisted in SQLite (Rust), localStorage as fast-init cache
// ═══════════════════════════════════════════════════════════════════════════════

import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";
import { api } from "../lib/api";

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
        // DB unreachable — localStorage stays authoritative for this session.
        setIsLoaded(true);
      });
  }, []);

  const updateSettings = useCallback((partial: Partial<AppSettings>) => {
    const next = { ...settingsRef.current, ...partial };
    setSettings(next);
    saveToLocalStorage(next);
    api.settings.save(settingsToDbMap(next))
      .catch(e => console.error("[SettingsContext] Failed to save settings to DB:", e));
  }, []);

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
