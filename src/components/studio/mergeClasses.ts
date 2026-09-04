// src/components/studio/mergeClasses.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Die Vorschau des Zusammenführens zeigt Klassen statt einer flachen Liste.
// Der Plan (was der Lauf tun würde) und der Archiv-Abgleich (was schon fertig
// ist) werden hier über den Ordnerpfad zusammengeführt.
//
// Die Reihenfolge der Klassen ist die Reihenfolge der Gefährlichkeit: was
// Arbeit tragen könnte, steht oben.
// ═══════════════════════════════════════════════════════════════════════════════

import type { MergePlan, MergeStep, ProjectArchiveStatus } from "../../types/studio";

export type MergeClassKey =
  | "archived_incomplete"
  | "archived_complete"
  | "live"
  | "no_number"
  | "no_flp";

export interface MergeClassMeta {
  label: string;
  /** Was mit diesen Ordnern im Lauf passiert */
  action: string;
  /** true = der Lauf fasst sie an */
  moves: boolean;
}

export const MERGE_CLASSES: Record<MergeClassKey, MergeClassMeta> = {
  archived_incomplete: {
    label: "Archiviert, trägt neuere Arbeit",
    action: "Bekommt eine neue Nummer — aber vorher ansehen: hier liegen Dateien, die es im Archiv nicht gibt.",
    moves: true,
  },
  archived_complete: {
    label: "Archiviert und vollständig",
    action: "Bleibt liegen und verbraucht keine Nummer — der Beat steht komplett im Archiv.",
    moves: false,
  },
  live: {
    label: "Lebendes Projekt",
    action: "Bekommt eine neue, einmalige Nummer nach Alter.",
    moves: true,
  },
  no_number: {
    label: "Keine Nummer im Namen",
    action: "Bleibt unangetastet liegen — von Hand entscheiden.",
    moves: false,
  },
  no_flp: {
    label: "Keine FLP im Ordner",
    action: "Kein Projekt. Bleibt liegen.",
    moves: false,
  },
};

/** Reihenfolge in der Anzeige: das Heikelste zuerst. */
export const MERGE_CLASS_ORDER: MergeClassKey[] = [
  "archived_incomplete",
  "archived_complete",
  "live",
  "no_number",
  "no_flp",
];

export interface MergeRow {
  path: string;
  name: string;
  /** Zielname im Lauf — null für Ordner, die liegenbleiben */
  newName: string | null;
  date: string | null;
  klass: MergeClassKey;
  /** Wo der Beat im Archiv liegt, falls er dort liegt */
  archiveFolder: string | null;
  /** Arbeitsdateien, die nur hier liegen (ohne FL-Autosaves) */
  missingImportant: number;
  /** true, solange der Archiv-Abgleich noch nicht gelaufen ist */
  unchecked: boolean;
}

/**
 * Plan und Archiv-Abgleich zusammenführen.
 *
 * `archive` darf leer sein — dann sind alle beweglichen Ordner „lebend" und
 * `unchecked` gesetzt. Genau daran hängt die Sperre: ausgeführt wird erst,
 * wenn der Abgleich gelaufen ist.
 */
export function buildMergeRows(
  plan: MergePlan,
  archive: ProjectArchiveStatus[],
): MergeRow[] {
  const byPath = new Map<string, ProjectArchiveStatus>();
  for (const a of archive) byPath.set(normPath(a.project_path), a);
  const checked = archive.length > 0;

  const rows: MergeRow[] = plan.steps.map((s: MergeStep) => {
    const hit = byPath.get(normPath(s.from));
    const archived = !!hit?.archive_folder;
    return {
      path: s.from,
      name: s.old_name,
      newName: s.new_name,
      date: s.date,
      klass: !archived
        ? "live"
        : (hit?.missing_important ?? 0) > 0
          ? "archived_incomplete"
          : "archived_complete",
      archiveFolder: hit?.archive_folder ?? null,
      missingImportant: hit?.missing_important ?? 0,
      unchecked: !checked,
    };
  });

  for (const s of plan.skipped) {
    // Nach dem Abgleich stehen die vollständig archivierten hier statt in den
    // Schritten — sie sollen keine Nummer verbrauchen.
    const klass: MergeClassKey = s.reason.includes("archiviert")
      ? "archived_complete"
      : s.reason.includes("keine FLP")
        ? "no_flp"
        : "no_number";
    const hit = byPath.get(normPath(s.path));
    rows.push({
      path: s.path,
      name: s.name,
      newName: null,
      date: null,
      klass,
      archiveFolder: hit?.archive_folder ?? null,
      missingImportant: 0,
      unchecked: false,
    });
  }

  return rows;
}

/** Pfade vergleichbar machen: Windows mischt / und \, Groß/Klein egal. */
function normPath(p: string): string {
  return p.replace(/[/\\]+/g, "\\").replace(/\\+$/, "").toLowerCase();
}

export function countByClass(rows: MergeRow[]): Record<MergeClassKey, number> {
  const out = {
    archived_incomplete: 0,
    archived_complete: 0,
    live: 0,
    no_number: 0,
    no_flp: 0,
  };
  for (const r of rows) out[r.klass]++;
  return out;
}

/**
 * Der Trockenlauf als CSV — Semikolon, weil Excel-DE das erwartet.
 * Eine Zeile pro Ordner, damit man die Liste außerhalb der App durchgehen kann.
 */
export function buildPreviewCsv(rows: MergeRow[], plan: MergePlan): string {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    ["Klasse", "Ordner", "Wird zu", "Älteste FLP", "Im Archiv als", "Nur hier (Arbeitsdateien)", "Pfad"]
      .join(";"),
  ];
  for (const key of MERGE_CLASS_ORDER) {
    for (const r of rows.filter(x => x.klass === key)) {
      lines.push([
        MERGE_CLASSES[key].label,
        r.name,
        r.newName ?? "— bleibt liegen",
        r.date ?? "",
        r.archiveFolder ?? "",
        r.missingImportant || "",
        r.path,
      ].map(esc).join(";"));
    }
  }
  // Die doppelten Nummern ans Ende, sonst gehen sie in 990 Zeilen unter
  if (plan.duplicates.length > 0) {
    lines.push("");
    lines.push(["Mehrfach vergebene Nummer", "Ordner"].join(";"));
    for (const d of plan.duplicates) {
      for (const dir of d.dirs) lines.push([d.number, dir].map(esc).join(";"));
    }
  }
  return lines.join("\r\n") + "\r\n";
}
