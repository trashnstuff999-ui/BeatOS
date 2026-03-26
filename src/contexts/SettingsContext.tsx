// src/contexts/SettingsContext.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// App Settings — persisted in localStorage
// ═══════════════════════════════════════════════════════════════════════════════

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AppSettings {
  archivePath: string;
  productionPath: string;
  assetPath: string;
}

const DEFAULTS: AppSettings = {
  archivePath: "",
  productionPath: "",
  assetPath: "",
};

const STORAGE_KEY = "beatos_settings";

// ─── Context ─────────────────────────────────────────────────────────────────

interface SettingsContextValue {
  settings: AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  const updateSettings = useCallback((partial: Partial<AppSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...partial };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
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
