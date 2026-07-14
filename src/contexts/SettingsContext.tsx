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
  // Producer info (used by Upload-tab templates)
  producerName: string;
  contactEmail: string;
  instagramUrl: string;
  soundcloudUrl: string;
  youtubeUrl: string;
  beatstarsUrl: string;
  defaultGenreTags: string;
}

const DEFAULTS: AppSettings = {
  archivePath: "",
  productionPath: "",
  assetPath: "",
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

/** productionPath stores MULTIPLE roots, one per line (legacy single path = 1 line). */
export function parseProductionPaths(s: string): string[] {
  return s
    .split(/\r?\n|;/)
    .map(p => p.trim())
    .filter(Boolean);
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
