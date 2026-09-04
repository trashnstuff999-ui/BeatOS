// src/types/relocate.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Umzug der Bibliothek — Anker
// ═══════════════════════════════════════════════════════════════════════════════
// Spiegelt src-tauri/src/commands/relocate.rs. Alle gespeicherten Pfade hängen
// an einem gemeinsamen Präfix; ein Umzug tauscht genau dieses Präfix.

export interface RelocateStatus {
  /** Aus den gespeicherten Pfaden berechnet, nicht aus den Einstellungen */
  anchor: string | null;
  archive_path: string | null;
  /** `false` heißt nachsehen, nicht handeln — die Platte kann auch nur abgezogen sein */
  archive_exists: boolean;
}

export interface RelocateEntry {
  /** „beats.path" oder „app_settings.archive_path" */
  label: string;
  count: number;
  skipped: number;
  sample_before: string | null;
  sample_after: string | null;
}

/** Trockenlauf: was sich ändern würde. Schreibt nichts. */
export interface RelocatePlan {
  old_anchor: string;
  new_anchor: string;
  entries: RelocateEntry[];
  total: number;
  /** Werte, die nicht am alten Anker hängen und unberührt blieben */
  skipped: number;
}

export interface RelocateResult {
  changed: number;
  /** Wohin die Sicherung vor dem Schreiben ging */
  backup_path: string;
  old_anchor: string;
  new_anchor: string;
}
