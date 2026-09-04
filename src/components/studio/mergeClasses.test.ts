// src/components/studio/mergeClasses.test.ts
// Die Vorschau entscheidet, ob der Ausführen-Knopf freigegeben wird. Geht die
// Zusammenführung von Plan und Archiv-Abgleich still daneben, sieht ein
// archivierter Ordner wie ein lebendes Projekt aus — und umgekehrt.

import { describe, it, expect } from "vitest";
import {
  buildMergeRows, buildPreviewCsv, countByClass, MERGE_CLASS_ORDER,
} from "./mergeClasses";
import type { MergePlan, ProjectArchiveStatus } from "../../types/studio";

const step = (from: string, oldName: string, newName: string) => ({
  from, to: `C:\\PROD\\${newName}`, old_name: oldName, new_name: newName, date: "2026-01-01",
});

const plan: MergePlan = {
  target: "C:\\PROD",
  steps: [
    step("C:\\PROD\\Project_29", "Project_29", "Project_0001"),
    step("C:\\PROD\\Project_141", "Project_141", "Project_0002"),
    step("C:\\PROD\\Project_0242", "Project_0242", "Project_0003"),
  ],
  skipped: [
    { path: "C:\\PROD\\NO MORE RUNNING", name: "NO MORE RUNNING", reason: "keine Nummer im Namen" },
    { path: "C:\\PROD\\Samples", name: "Samples", reason: "keine FLP gefunden" },
  ],
  duplicates: [{ number: 25, dirs: ["C:\\ALT\\Project_25", "C:\\PROD\\Project_25"] }],
};

const status = (path: string, folder: string | null, missing: number): ProjectArchiveStatus => ({
  project_path: path,
  project_name: path.split("\\").pop() ?? "",
  archive_folder: folder,
  archive_path: folder ? `C:\\ARCHIVE\\${folder}` : null,
  catalog_id: folder ? 895 : null,
  matched_by: folder ? "title" : null,
  missing: [],
  missing_important: missing,
  compared: 5,
});

describe("buildMergeRows", () => {
  it("markiert ohne Archiv-Abgleich alles als ungeprüft", () => {
    const rows = buildMergeRows(plan, []);
    const beweglich = rows.filter(r => r.newName !== null);
    expect(beweglich).toHaveLength(3);
    expect(beweglich.every(r => r.unchecked)).toBe(true);
    expect(beweglich.every(r => r.klass === "live")).toBe(true);
  });

  it("trennt archiviert-vollständig von archiviert-mit-Arbeit", () => {
    const rows = buildMergeRows(plan, [
      status("C:\\PROD\\Project_29", "0895 - HOLLOW [Fm 159]", 1),
      status("C:\\PROD\\Project_141", "0897 - GOODBYES [F#m 130]", 0),
      status("C:\\PROD\\Project_0242", null, 0),
    ]);
    const von = (name: string) => rows.find(r => r.name === name)!;

    expect(von("Project_29").klass).toBe("archived_incomplete");
    expect(von("Project_29").missingImportant).toBe(1);
    expect(von("Project_141").klass).toBe("archived_complete");
    expect(von("Project_0242").klass).toBe("live");
    expect(rows.every(r => !r.unchecked)).toBe(true);
  });

  it("findet den Treffer auch bei anderer Schreibweise des Pfads", () => {
    // Rust liefert Backslash, ein anderer Weg könnte Slash liefern —
    // ginge das daneben, wären alle Ordner still „lebend".
    const rows = buildMergeRows(plan, [
      status("c:/prod/Project_29", "0895 - HOLLOW [Fm 159]", 2),
    ]);
    expect(rows.find(r => r.name === "Project_29")!.klass).toBe("archived_incomplete");
  });

  it("ordnet übersprungene Ordner nach ihrem Grund ein", () => {
    const rows = buildMergeRows(plan, []);
    expect(rows.find(r => r.name === "NO MORE RUNNING")!.klass).toBe("no_number");
    expect(rows.find(r => r.name === "Samples")!.klass).toBe("no_flp");
    // Was liegenbleibt, hat keinen Zielnamen
    expect(rows.find(r => r.name === "Samples")!.newName).toBeNull();
  });

  it("zeigt ausgenommene Ordner als vollständig archiviert, nicht als namenlos", () => {
    // Nach dem Abgleich plant das Backend neu: der vollständig archivierte
    // Ordner steht dann unter skipped und verbraucht keine Nummer.
    const nachAbgleich: MergePlan = {
      ...plan,
      steps: [step("C:\\PROD\\Project_0242", "Project_0242", "Project_0001")],
      skipped: [
        ...plan.skipped,
        { path: "C:\\PROD\\Project_141", name: "Project_141", reason: "vollständig archiviert" },
      ],
    };
    const rows = buildMergeRows(nachAbgleich, [
      status("C:\\PROD\\Project_141", "0897 - GOODBYES [F#m 130]", 0),
    ]);

    const raus = rows.find(r => r.name === "Project_141")!;
    expect(raus.klass).toBe("archived_complete");
    expect(raus.newName).toBeNull();
    expect(raus.archiveFolder).toBe("0897 - GOODBYES [F#m 130]");
    // Und die Nummerierung der übrigen bleibt lückenlos bei 1
    expect(rows.find(r => r.name === "Project_0242")!.newName).toBe("Project_0001");
  });

  it("zählt jede Zeile genau einmal", () => {
    const rows = buildMergeRows(plan, [
      status("C:\\PROD\\Project_29", "0895 - HOLLOW [Fm 159]", 1),
    ]);
    const counts = countByClass(rows);
    const summe = MERGE_CLASS_ORDER.reduce((n, k) => n + counts[k], 0);
    expect(summe).toBe(rows.length);
    expect(rows).toHaveLength(5);
  });
});

describe("buildPreviewCsv", () => {
  it("schreibt eine Zeile pro Ordner, das Heikelste zuerst", () => {
    const rows = buildMergeRows(plan, [
      status("C:\\PROD\\Project_29", "0895 - HOLLOW [Fm 159]", 1),
      status("C:\\PROD\\Project_141", "0897 - GOODBYES [F#m 130]", 0),
      status("C:\\PROD\\Project_0242", null, 0),
    ]);
    const csv = buildPreviewCsv(rows, plan);
    const lines = csv.trim().split("\r\n");

    expect(lines[0]).toContain("Klasse;Ordner;Wird zu");
    // Erste Datenzeile ist der Ordner mit Arbeit, die im Archiv fehlt
    expect(lines[1]).toContain("Project_29");
    expect(lines[1]).toContain("Archiviert, trägt neuere Arbeit");
    // Die doppelten Nummern stehen am Ende
    expect(csv).toContain("Mehrfach vergebene Nummer");
    expect(csv).toContain("C:\\ALT\\Project_25");
  });

  it("schützt Semikolon und Anführungszeichen in Ordnernamen", () => {
    const heikel: MergePlan = {
      ...plan,
      steps: [step("C:\\PROD\\a;b", 'Titel; mit "Zitat"', "Project_0001")],
      skipped: [],
      duplicates: [],
    };
    const csv = buildPreviewCsv(buildMergeRows(heikel, []), heikel);
    expect(csv).toContain('"Titel; mit ""Zitat"""');
    // Kopfzeile plus genau eine Datenzeile — kein Zeilenumbruch eingeschleppt
    expect(csv.trim().split("\r\n")).toHaveLength(2);
  });
});
