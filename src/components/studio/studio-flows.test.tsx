// src/components/studio/studio-flows.test.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Die zwei Wege zum selben Ziel, einmal in jede Richtung durchgeklickt:
//
//   F1  Zeilenklick öffnet den Inspector (vorher: wählte ein Asset-Ziel für
//       einen anderen Tab — die häufigste Absicht lag auf einem Hover-Icon).
//   F2  Der Assets-Tab zeigt die Inbox und weist von der Datei aus zu.
//   B3  Eine priorisierte alte Idee bleibt sichtbar statt in „Lange inaktiv".
//
// Beides läuft über echte Klicks auf die gerenderten Komponenten, nicht über
// aufgerufene Handler — genau die Verdrahtung ist ja das, was sich geändert hat.
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { SettingsProvider } from "../../contexts/SettingsContext";
import { AudioPlayerProvider } from "../../contexts/AudioPlayerContext";
import { ProjectsPane } from "./ProjectsPane";
import { AssetsPane } from "./AssetsPane";
import type { AssetFile, StudioProject } from "../../types/studio";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openPath: vi.fn(), revealItemInDir: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", async () => ({
  invoke: vi.fn(),
  convertFileSrc: (p: string) => `file://${p}`,
}));

const NOW = Math.floor(Date.now() / 1000);
const DAY = 86_400;

function project(over: Partial<StudioProject> & { name: string }): StudioProject {
  return {
    path: `C:\\PROD\\${over.name}`, root: "C:\\PROD",
    parsed_name: over.name, song_name: null, key: null, bpm: null,
    newest_flp: `C:\\PROD\\${over.name}\\x.flp`, flp_count: 1,
    flps: [{ path: `C:\\PROD\\${over.name}\\x.flp`, name: `${over.name}.flp`,
             modified_secs: NOW - DAY, modified_date: "2026-08-29" }],
    modified_date: "2026-08-29", modified_secs: NOW - DAY,
    has_mp3: false, has_wav: false, has_cover: false,
    has_thumbnail: false, has_video: false,
    status: "idea", priority: 0, notes: null,
    ...over,
  };
}

const READY = project({ name: "0857", song_name: "ARE YOU HERE", key: "F#m", bpm: 118, status: "ready" });
const ALTE_IDEE_MIT_STERN = project({ name: "Project_102", priority: 1, modified_secs: NOW - 200 * DAY });
const ALTE_IDEE_OHNE_STERN = project({ name: "Project_12", modified_secs: NOW - 300 * DAY });
const PROJECTS = [READY, ALTE_IDEE_MIT_STERN, ALTE_IDEE_OHNE_STERN];

const UNBENANNTES_BILD: AssetFile = {
  path: "C:\\ASSETS\\MEMORIES_final.png", name: "MEMORIES_final.png",
  kind: "image", guessed_role: "image", size: 1000,
  modified_date: "2026-08-30", modified_secs: NOW - 600,
};

/** Ein Aufruf-Protokoll pro Command, damit Tests gezielt prüfen können. */
function stubInvoke(assets: AssetFile[] = [], projects: StudioProject[] = PROJECTS) {
  const calls: Record<string, unknown[]> = {};
  vi.mocked(invoke).mockImplementation((cmd: string, args?: unknown) => {
    (calls[cmd] ??= []).push(args);
    switch (cmd) {
      case "get_settings":
        return Promise.resolve({ production_path: "C:\\PROD", asset_path: "C:\\ASSETS" }) as never;
      case "scan_studio_projects": return Promise.resolve(projects) as never;
      case "scan_asset_inbox":     return Promise.resolve(assets) as never;
      case "next_project_name":    return Promise.resolve("Project_0858") as never;
      case "assign_asset_to_project": return Promise.resolve("C:\\PROD\\0857\\x.png") as never;
      case "parse_beat_folder_for_create":
        return Promise.resolve({
          name: "x", key: null, bpm: null, flp_path: null, flp_files: [],
          created_date: null, year_month: "2026/08", audio_files: [], all_files: [],
          cover_path: null, thumbnail_path: null, video_path: null, suggested_id: 1,
        }) as never;
      default: return Promise.resolve(null) as never;
    }
  });
  return calls;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

/** ProjectsPane hängt an Router, Player und Settings — der Inspector braucht alle drei. */
function renderProjects() {
  return render(
    <MemoryRouter>
      <SettingsProvider>
        <AudioPlayerProvider>
          <ProjectsPane productionPaths={["C:\\PROD"]} refreshKey={0} />
        </AudioPlayerProvider>
      </SettingsProvider>
    </MemoryRouter>,
  );
}

/** AssetsPane haengt seit dem Weg zu den Einstellungen ebenfalls am Router. */
function renderAssets(props: { assetPath: string; onAssigned?: () => void; projects?: StudioProject[] }) {
  return render(
    <MemoryRouter>
      <AssetsPane
        assetPath={props.assetPath}
        projects={props.projects ?? PROJECTS}
        onAssigned={props.onAssigned ?? vi.fn()}
      />
    </MemoryRouter>,
  );
}

/**
 * Sektionsköpfe in DOM-Reihenfolge. Sie tragen Label + Anzahl ("Priorität1") —
 * das trennt sie vom gleichnamigen Filter-Chip in der Toolbar.
 */
function sectionHeadings(): string[] {
  return screen.getAllByRole("button")
    .map(b => b.textContent ?? "")
    .filter(t => /^(Priorität|Bereit|Exportiert|Überarbeiten|Idee|Lange inaktiv|Kann weg)\d+$/.test(t));
}

/**
 * Die Zeile zu einem Projekt — über den Titel, der in ihr steht. Der Name kann
 * mehrfach im Dokument stehen (der offene Inspector zeigt ihn auch), deshalb
 * über alle Treffer laufen und den nehmen, der wirklich in einer Zeile sitzt.
 */
function rowOf(name: string): HTMLElement {
  for (const treffer of screen.getAllByText(name)) {
    const row = treffer.closest('[title^="Details, Notizen und Assets öffnen"]');
    if (row) return row as HTMLElement;
  }
  throw new Error(`Keine Zeile für „${name}" gefunden`);
}

describe("Q1 — die Zeile bietet nur an, was von Hand geht", () => {
  it("zeigt in Ruhe eine Pille, bei Hover die zwei Handstatus", async () => {
    stubInvoke();
    renderProjects();
    await screen.findByText("ARE YOU HERE");

    // Project_102 ist eine Idee in der Sektion "Priorität" — die anderen
    // Statuswörter haben in der Zeile nichts verloren.
    const zeile = rowOf("Project_102");
    expect(within(zeile).getByText("Idee")).toBeInTheDocument();
    expect(within(zeile).queryByText("Überarbeiten")).not.toBeInTheDocument();
    expect(within(zeile).queryByText("Kann weg")).not.toBeInTheDocument();

    // fireEvent statt user.hover/user.click: user-event bewegt zwischen den
    // beiden Aufrufen den Zeiger, der Hover fällt kurz weg und der gerade
    // geholte Knopf hängt nicht mehr im DOM. Im Browser bleibt der Zeiger
    // in der Zeile — hier muss der Hover von Hand stehenbleiben.
    fireEvent.mouseEnter(zeile);

    // Die automatischen Stufen bekommen KEINEN Knopf — die entstehen aus
    // Dateien im Ordner, nicht aus einem Klick.
    expect(within(zeile).queryByText("Exportiert")).not.toBeInTheDocument();
    expect(within(zeile).queryByText("Bereit")).not.toBeInTheDocument();

    fireEvent.click(within(zeile).getByText("Kann weg"));

    await waitFor(() => {
      const calls = vi.mocked(invoke).mock.calls.filter(c => c[0] === "update_studio_project");
      expect(calls).toHaveLength(1);
      expect(calls[0][1]).toMatchObject({ status: "discard" });
    });

    // Der Klick auf den Knopf darf nicht zusätzlich den Inspector aufreißen
    expect(screen.queryByText("FLP-Versionen (1)")).not.toBeInTheDocument();
  });

  it("gibt ein markiertes Projekt beim zweiten Klick an die Automatik zurück", async () => {
    stubInvoke();
    renderProjects();
    await screen.findByText("ARE YOU HERE");

    // Project_102 hat keine Exportdateien — die automatische Stufe ist "Idee".
    // Es steht wegen des Sterns in "Priorität" und bleibt dort auch als
    // "Überarbeiten", die Zeile wandert also zwischen den Klicks nicht weg.
    const zeile = rowOf("Project_102");
    fireEvent.mouseEnter(zeile);
    fireEvent.click(within(zeile).getByText("Überarbeiten"));

    await waitFor(() => {
      const calls = vi.mocked(invoke).mock.calls.filter(c => c[0] === "update_studio_project");
      expect(calls[0][1]).toMatchObject({ status: "wip" });
    });

    // Jetzt heißt auch die Pille „Überarbeiten" — gemeint ist der Knopf.
    const markiert = rowOf("Project_102");
    fireEvent.mouseEnter(markiert);
    fireEvent.click(within(markiert).getByRole("button", { name: "Überarbeiten" }));

    await waitFor(() => {
      const calls = vi.mocked(invoke).mock.calls.filter(c => c[0] === "update_studio_project");
      expect(calls).toHaveLength(2);
      expect(calls[1][1]).toMatchObject({ status: "idea" });
    });
  });

  it("zeigt die Schalter auch, solange der Inspector auf der Zeile steht", async () => {
    stubInvoke();
    const user = userEvent.setup();
    renderProjects();
    await screen.findByText("ARE YOU HERE");

    // Ohne Hover-Pfad erreichbar: Zeile öffnen genügt.
    await user.click(rowOf("Project_102"));
    await screen.findByText("FLP-Versionen (1)");
    expect(within(rowOf("Project_102")).getByText("Kann weg")).toBeInTheDocument();
  });
});

describe("Aufräumen — die eine Stelle, an der gelöscht wird", () => {
  const RAUS_1 = project({ name: "Project_300", status: "discard" });
  const RAUS_2 = project({ name: "Project_301", status: "discard" });

  it("bleibt weg, solange nichts markiert ist", async () => {
    stubInvoke();
    renderProjects();
    await screen.findByText("ARE YOU HERE");
    expect(screen.queryByRole("button", { name: /In den Papierkorb/ })).not.toBeInTheDocument();
  });

  it("räumt genau die markierten Ordner weg und fragt vorher", async () => {
    stubInvoke([], [READY, RAUS_1, RAUS_2]);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    renderProjects();
    await screen.findByText("ARE YOU HERE");

    expect(screen.getByText("2 Projekte können weg")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /In den Papierkorb/ }));

    await waitFor(() => {
      const calls = vi.mocked(invoke).mock.calls.filter(c => c[0] === "trash_source_folder");
      expect(calls.map(c => (c[1] as { sourceFolder: string }).sourceFolder)).toEqual([
        RAUS_1.path, RAUS_2.path,
      ]);
    });

    // Nicht ungefragt: einmal fürs Löschen, einmal fürs Nachrücken der Nummern
    expect(confirm).toHaveBeenCalledTimes(2);
    // READY ist nicht markiert und bleibt stehen
    expect(screen.getByText("ARE YOU HERE")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /In den Papierkorb/ })).not.toBeInTheDocument()
    );
    confirm.mockRestore();
  });

  it("löscht nichts, wenn die Rückfrage verneint wird", async () => {
    stubInvoke([], [READY, RAUS_1]);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    renderProjects();
    await screen.findByText("ARE YOU HERE");

    await user.click(screen.getByRole("button", { name: /In den Papierkorb/ }));
    expect(vi.mocked(invoke).mock.calls.filter(c => c[0] === "trash_source_folder")).toHaveLength(0);
    confirm.mockRestore();
  });
});

describe("Q2 + Q3 — was aus der Zeile verschwunden ist", () => {
  // Q2 zurückgedreht: die Kürzel standen erst in jeder Zeile, dann einmal in
  // einer Legende (die gegen die Spalte driftete — „EXPARTVID"), und stehen
  // jetzt wieder in der Zeile. Diesmal ohne Legende: sie beschriften sich
  // selbst, und was fehlt, tritt zurück statt mitzuleuchten.
  it("beschriftet jede Datei in der Zeile — und dimmt, was fehlt", async () => {
    // Eine einzige Zeile, damit „genau einmal" zählbar ist. Status exportiert,
    // weil die Sektion „Idee" per Default eingeklappt ist — und weil MP3+WAV
    // genau das ist, was diese Stufe ausmacht.
    stubInvoke([], [project({
      name: "0857", song_name: "ARE YOU HERE", status: "exported",
      has_mp3: true, has_wav: true,
    })]);
    renderProjects();
    await screen.findByText("ARE YOU HERE");
    const row = rowOf("ARE YOU HERE");

    // Alle fünf stehen da, jedes genau einmal — es gibt keine Kopfzeile mehr,
    // die sie wiederholt.
    for (const label of ["MP3", "WAV", "COV", "THU", "VID"]) {
      expect(within(row).getByText(label)).toBeInTheDocument();
      expect(screen.getAllByText(label)).toHaveLength(1);
    }

    // Der Zweck der Spalte: vorhanden sticht heraus, fehlend bleibt ruhig.
    const deckkraft = (l: string) => Number(within(row).getByText(l).style.opacity);
    expect(deckkraft("MP3")).toBe(1);
    expect(deckkraft("VID")).toBeLessThan(0.5);
  });

  it("nennt den Produktions-Root nicht mehr in jeder Zeile", async () => {
    stubInvoke();
    renderProjects();
    await screen.findByText("ARE YOU HERE");
    expect(within(rowOf("ARE YOU HERE")).queryByText("PROD")).not.toBeInTheDocument();
  });
});

describe("B7 — die Status-Zähler passen zu dem, was die Liste zeigt", () => {
  it("zählt über die gesuchte Menge, nicht über alle Projekte", async () => {
    stubInvoke();
    const user = userEvent.setup();
    renderProjects();
    await screen.findByText("ARE YOU HERE");

    // Ungefiltert: 3 Projekte, davon 2 Ideen
    expect(screen.getByText("Alle (3)")).toBeInTheDocument();
    expect(screen.getByText("Idee (2)")).toBeInTheDocument();

    // Suche nach dem fertigen Track → die Zahlen müssen mitgehen, sonst
    // widersprechen die Chips der Liste darunter.
    await user.type(screen.getByPlaceholderText("Projekt, Tonart, BPM …"), "ARE YOU");

    await waitFor(() => expect(screen.getByText("Alle (1)")).toBeInTheDocument());
    expect(screen.getByText("Idee (0)")).toBeInTheDocument();
    expect(screen.getByText("Bereit (1)")).toBeInTheDocument();
  });

  it("zählt den Prioritäts-Filter mit", async () => {
    stubInvoke();
    const user = userEvent.setup();
    renderProjects();
    await screen.findByText("ARE YOU HERE");

    // Der Filter-Chip heißt genau "Priorität"; der Sektionskopf trägt zusätzlich
    // seine Anzahl ("Priorität1") und ist damit unterscheidbar.
    const chip = screen.getAllByRole("button").find(b => b.textContent === "Priorität");
    expect(chip).toBeDefined();
    await user.click(chip!);

    await waitFor(() => expect(screen.getByText("Alle (1)")).toBeInTheDocument());
  });
});

describe("B4 — „Priorität zuerst“ ist raus", () => {
  it("bietet den wirkungslosen Sortiermodus nicht mehr an", async () => {
    stubInvoke();
    const user = userEvent.setup();
    renderProjects();
    await screen.findByText("ARE YOU HERE");

    await user.click(screen.getByText("Zuletzt bearbeitet"));
    expect(screen.getByText("Name A–Z")).toBeInTheDocument();
    expect(screen.queryByText("Priorität zuerst")).not.toBeInTheDocument();
  });

  it("fällt auf den Standard zurück, wenn „priority“ noch gespeichert ist", async () => {
    localStorage.setItem("beatos_studio_sort", "priority");
    stubInvoke();
    renderProjects();
    await screen.findByText("ARE YOU HERE");
    expect(screen.getByText("Zuletzt bearbeitet")).toBeInTheDocument();
  });
});

describe("B5 — Umbenennen sagt, was es umbenennt", () => {
  it("stellt den Stift an den Ordner und weist den Titel als Export aus", async () => {
    stubInvoke();
    const user = userEvent.setup();
    renderProjects();
    await screen.findByText("ARE YOU HERE");

    await user.click(rowOf("ARE YOU HERE"));
    await screen.findByText("FLP-Versionen (1)");

    // Der Titel kommt aus der MP3 — als Tooltip am Titel, nicht als Dauerzeile
    expect(screen.getByTitle(/Titel kommt aus dem Export/)).toBeInTheDocument();
    // Und der Ordnername steht als eigener, bearbeitbarer Knopf da
    const ordnerKnopf = screen.getByTitle(/Ordner umbenennen/);
    expect(within(ordnerKnopf).getByText("0857")).toBeInTheDocument();

    await user.click(ordnerKnopf);
    expect(screen.getByText("Ordnername")).toBeInTheDocument();
    expect(screen.getByDisplayValue("0857")).toBeInTheDocument();
  });
});

describe("F1 — Zeilenklick öffnet das Projekt", () => {
  it("öffnet den Inspector statt still ein Asset-Ziel zu wählen", async () => {
    stubInvoke();
    const user = userEvent.setup();
    renderProjects();

    const titel = await screen.findByText("ARE YOU HERE");
    // Vor dem Klick gibt es keinen Inspector
    expect(screen.queryByText("FLP-Versionen (1)")).not.toBeInTheDocument();

    await user.click(titel);

    // Der Inspector ist da — mit den Sachen, die man am Projekt tun will
    expect(await screen.findByText("FLP-Versionen (1)")).toBeInTheDocument();
    // Notizen liegen zugeklappt da, solange keine da sind — ein leeres Feld
    // war das zweitgrößte Element im Panel und meistens ungenutzt.
    expect(screen.queryByPlaceholderText(/Hook neu einspielen/)).not.toBeInTheDocument();
    await user.click(screen.getByText("Notiz hinzufügen"));
    expect(screen.getByPlaceholderText(/Hook neu einspielen/)).toBeInTheDocument();
    // …inklusive der Asset-Slots: der Projekt-zuerst-Weg endet nicht mehr
    // in einem anderen Tab.
    expect(screen.getByText("Cover")).toBeInTheDocument();
    expect(screen.getByText("Thumbnail")).toBeInTheDocument();
    expect(screen.getByText("Video")).toBeInTheDocument();

    // Nochmal klicken schließt wieder
    await user.click(screen.getAllByText("ARE YOU HERE")[0]);
    await waitFor(() => expect(screen.queryByText("FLP-Versionen (1)")).not.toBeInTheDocument());
  });
});

describe("B3 — der Stern schlägt das Alter", () => {
  it("hebt eine priorisierte alte Idee nach oben statt sie wegzuklappen", async () => {
    stubInvoke();
    renderProjects();

    await screen.findByText("ARE YOU HERE");

    // Ohne Stern: alte Idee, landet in der zugeklappten Sektion "Lange inaktiv"
    expect(screen.getByText("Lange inaktiv")).toBeInTheDocument();
    expect(screen.queryByText("Project_12")).not.toBeInTheDocument();

    // Mit Stern: sichtbar in "Priorität". "Idee" ist genauso zugeklappt wie
    // "Lange inaktiv" — nur die Sektion nach oben rettet das Projekt wirklich.
    expect(sectionHeadings()).toContainEqual(expect.stringMatching(/^Priorität/));
    expect(screen.getByText("Project_102")).toBeInTheDocument();
  });

  it("sortiert Priorität vor jeden Status, auch vor „Bereit“", async () => {
    stubInvoke();
    renderProjects();
    await screen.findByText("ARE YOU HERE");
    expect(sectionHeadings()[0]).toMatch(/^Priorität/);
  });
});

describe("F2 — der Assets-Tab zeigt die Inbox", () => {
  it("listet die Dateien und weist von der Datei aus einem Projekt zu", async () => {
    const calls = stubInvoke([UNBENANNTES_BILD]);
    const onAssigned = vi.fn();
    const user = userEvent.setup();

    renderAssets({ assetPath: "C:\\ASSETS", onAssigned });

    // Die Inbox ist sichtbar, ohne dass vorher irgendwo ein Projekt zu
    // wählen war — das war vorher unmöglich.
    expect(await screen.findByText("MEMORIES_final.png")).toBeInTheDocument();
    expect(screen.getByText(/1 Datei in der Inbox/)).toBeInTheDocument();

    await user.click(screen.getByText("MEMORIES_final.png"));

    // Der Dialog fragt nach dem Projekt, nicht umgekehrt
    const dialog = await screen.findByPlaceholderText("Projekt suchen …");
    expect(dialog).toBeInTheDocument();

    await user.click(screen.getByText("ARE YOU HERE"));

    await waitFor(() => expect(calls["assign_asset_to_project"]).toHaveLength(1));
    expect(calls["assign_asset_to_project"][0]).toMatchObject({
      assetPath: UNBENANNTES_BILD.path,
      projectDir: READY.path,
      // Ein Bild ohne Marker wird als Cover vorgeschlagen (B2)
      slot: "cover",
    });
    expect(onAssigned).toHaveBeenCalled();
  });

  it("bietet für ein Bild ohne Marker auch den Thumbnail-Slot an", async () => {
    const calls = stubInvoke([UNBENANNTES_BILD]);
    const user = userEvent.setup();

    renderAssets({ assetPath: "C:\\ASSETS" });

    await user.click(await screen.findByText("MEMORIES_final.png"));
    await screen.findByPlaceholderText("Projekt suchen …");

    // Umschalten auf Thumbnail — vorher war so eine Datei in keinem Slot
    // erreichbar, weil der Filter "thumb" im Namen verlangte.
    await user.click(screen.getByRole("button", { name: "Thumbnail" }));
    await user.click(screen.getByText("ARE YOU HERE"));

    await waitFor(() => expect(calls["assign_asset_to_project"]).toHaveLength(1));
    expect(calls["assign_asset_to_project"][0]).toMatchObject({ slot: "thumbnail" });
  });

  it("sagt es, wenn kein Asset-Pfad gesetzt ist", async () => {
    stubInvoke([]);
    renderAssets({ assetPath: "" });
    expect(await screen.findByText(/Kein Asset-Pfad gesetzt/)).toBeInTheDocument();
  });
});

describe("Inbox-Filter", () => {
  it("trennt Bilder und Videos", async () => {
    const video: AssetFile = {
      path: "C:\\ASSETS\\clip.mp4", name: "clip.mp4", kind: "video",
      guessed_role: "video", size: 10, modified_date: null, modified_secs: NOW,
    };
    stubInvoke([UNBENANNTES_BILD, video]);
    const user = userEvent.setup();

    renderAssets({ assetPath: "C:\\ASSETS" });
    await screen.findByText("MEMORIES_final.png");

    await user.click(screen.getByRole("button", { name: /Videos 1/ }));
    expect(screen.getByText("clip.mp4")).toBeInTheDocument();
    expect(screen.queryByText("MEMORIES_final.png")).not.toBeInTheDocument();
  });
});

describe("Der Assets-Tab hat keine tab-übergreifende Auswahl mehr", () => {
  it("nennt kein vorher zu wählendes Projekt", async () => {
    stubInvoke([UNBENANNTES_BILD]);
    renderAssets({ assetPath: "C:\\ASSETS" });
    await screen.findByText("MEMORIES_final.png");
    expect(within(document.body).queryByText(/im Projekte-Tab/)).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Dritter Durchgang (31.08.2026): Mehrfachauswahl, Zeilengrenze, Namenstreffer
// ═══════════════════════════════════════════════════════════════════════════════

/** Alle sichtbaren Projektzeilen in DOM-Reihenfolge. */
function rows(): HTMLElement[] {
  return screen.queryAllByTitle(/^Details, Notizen und Assets öffnen/);
}

describe("Q1 — Mehrfachauswahl für die Triage", () => {
  const A = project({ name: "0801", song_name: "EINS", status: "ready", modified_secs: NOW - 3 * DAY });
  const B = project({ name: "0802", song_name: "ZWEI", status: "ready", modified_secs: NOW - 2 * DAY });
  const C = project({ name: "0803", song_name: "DREI", status: "ready", modified_secs: NOW - 1 * DAY });

  it("nimmt mit Shift die ganze Spanne und schreibt sie in einem Rutsch", async () => {
    // Sortierung „zuletzt bearbeitet": DREI, ZWEI, EINS
    stubInvoke([], [A, B, C]);
    const user = userEvent.setup();
    renderProjects();
    await screen.findByText("DREI");

    // Einfacher Klick setzt den Anker (und öffnet wie bisher den Inspector)
    await user.click(rowOf("DREI"));
    expect(screen.queryByText(/ausgewählt/)).not.toBeInTheDocument();

    fireEvent.click(rowOf("EINS"), { shiftKey: true });
    expect(screen.getByText("3 ausgewählt")).toBeInTheDocument();

    const leiste = screen.getByText("3 ausgewählt").parentElement!;
    await user.click(within(leiste).getByRole("button", { name: "Kann weg" }));

    await waitFor(() => {
      const geschrieben = vi.mocked(invoke).mock.calls
        .filter(c => c[0] === "update_studio_project")
        .map(c => c[1] as { path: string; status: string });
      expect(geschrieben.map(g => g.path).sort()).toEqual([A.path, B.path, C.path].sort());
      expect(geschrieben.every(g => g.status === "discard")).toBe(true);
    });

    // Danach ist die Auswahl weg und die Aufräum-Leiste übernimmt wieder
    await waitFor(() => expect(screen.queryByText(/ausgewählt/)).not.toBeInTheDocument());
    expect(screen.getByText("3 Projekte können weg")).toBeInTheDocument();
  });

  it("nimmt mit Strg einzeln dazu und wieder heraus", async () => {
    stubInvoke([], [A, B, C]);
    renderProjects();
    await screen.findByText("DREI");

    fireEvent.click(rowOf("DREI"), { ctrlKey: true });
    fireEvent.click(rowOf("EINS"), { ctrlKey: true });
    expect(screen.getByText("2 ausgewählt")).toBeInTheDocument();

    fireEvent.click(rowOf("EINS"), { ctrlKey: true });
    expect(screen.getByText("1 ausgewählt")).toBeInTheDocument();
  });
});

describe("B5 — eine Sektion rendert nicht hunderte Zeilen auf einmal", () => {
  const VIELE = Array.from({ length: 60 }, (_, i) =>
    project({ name: `09${String(i).padStart(2, "0")}`, song_name: `SONG ${i}`, status: "ready" }));

  it("zeigt erst 50 und den Rest auf Knopfdruck", async () => {
    stubInvoke([], VIELE);
    const user = userEvent.setup();
    renderProjects();
    await screen.findByText("SONG 0");

    expect(rows()).toHaveLength(50);
    await user.click(screen.getByRole("button", { name: /10 weitere Projekte anzeigen/ }));
    expect(rows()).toHaveLength(60);
  });
});

describe("Q3 — der Zuweisen-Dialog rät das Projekt aus dem Dateinamen", () => {
  it("stellt den Namenstreffer vor das zuletzt bearbeitete Projekt", async () => {
    // MEMORIES ist das ÄLTESTE Projekt — nach Datum stünde es hinten.
    const memories = project({
      name: "Project_243", song_name: "MEMORIES", modified_secs: NOW - 400 * DAY,
    });
    stubInvoke([UNBENANNTES_BILD], [READY, memories]);
    const user = userEvent.setup();

    renderAssets({ assetPath: "C:\ASSETS", projects: [READY, memories] });
    await user.click(await screen.findByText("MEMORIES_final.png"));
    await screen.findByPlaceholderText("Projekt suchen …");

    expect(screen.getByText("passt zum Dateinamen")).toBeInTheDocument();

    const texte = screen.getAllByRole("button").map(b => b.textContent ?? "");
    const iMemories = texte.findIndex(t => t.includes("MEMORIES") && t.includes("passt zum"));
    const iAndere = texte.findIndex(t => t.includes("ARE YOU HERE"));
    expect(iMemories).toBeGreaterThanOrEqual(0);
    expect(iMemories).toBeLessThan(iAndere);
  });
});

describe("S5 — die Auswahl bleibt ehrlich", () => {
  const A = project({ name: "0801", song_name: "EINS", status: "ready", modified_secs: NOW - 3 * DAY });
  const B = project({ name: "0802", song_name: "ZWEI", status: "ready", modified_secs: NOW - 2 * DAY });
  const C = project({ name: "0803", song_name: "DREI", status: "ready", modified_secs: NOW - 1 * DAY });

  it("zählt ein weggeräumtes Projekt nicht weiter mit", async () => {
    stubInvoke([], [A, B, C]);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    renderProjects();
    await screen.findByText("DREI");

    fireEvent.click(rowOf("DREI"), { ctrlKey: true });
    fireEvent.click(rowOf("ZWEI"), { ctrlKey: true });
    expect(screen.getByText("2 ausgewählt")).toBeInTheDocument();

    // Eines davon wandert über den Zeilen-Knopf in den Papierkorb
    const zeile = rowOf("ZWEI");
    fireEvent.mouseEnter(zeile);
    await user.click(within(zeile).getByTitle("Projektordner in den Papierkorb"));

    await waitFor(() => expect(screen.getByText("1 ausgewählt")).toBeInTheDocument());
    confirm.mockRestore();
  });

  it("beginnt eine neue Spanne, statt die Auswahl wegzuwerfen", async () => {
    stubInvoke([], [A, B, C]);
    const user = userEvent.setup();
    renderProjects();
    await screen.findByText("DREI");

    // Anker setzen, dann per Suche aus der Liste filtern
    fireEvent.click(rowOf("DREI"), { ctrlKey: true });
    expect(screen.getByText("1 ausgewählt")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Projekt, Tonart, BPM …"), "EIN");
    expect(screen.queryByText("DREI")).not.toBeInTheDocument();

    // Shift-Klick ohne sichtbaren Anker: nimmt dazu, wirft nichts weg
    fireEvent.click(rowOf("EINS"), { shiftKey: true });
    expect(screen.getByText("2 ausgewählt")).toBeInTheDocument();
  });
});

describe("Notiz-Debounce gegen gleichzeitige Änderungen", () => {
  // Der Debounce hält die Zeile aus dem Render, in dem getippt wurde. Wer in
  // den 600 ms danach den Stern setzt, sah ihn wieder ausgehen — die Notiz
  // schrieb die alte Priorität zurück, in der DB und sichtbar.
  const EXPORTIERT = project({
    name: "Project_500", status: "exported", has_mp3: true, has_wav: true,
  });

  it("überschreibt einen Stern nicht mit dem alten Stand", async () => {
    stubInvoke([], [EXPORTIERT]);
    const user = userEvent.setup();
    renderProjects();

    await user.click(await screen.findByText("Project_500"));
    await user.click(await screen.findByText("Notiz hinzufügen"));
    await user.type(screen.getByPlaceholderText(/Hook neu/), "abc");

    // Innerhalb der 600 ms: der Stern im Inspector (der letzte im Dokument)
    const sterne = screen.getAllByTitle("Als Priorität markieren");
    await user.click(sterne[sterne.length - 1]);

    await waitFor(() => {
      const calls = vi.mocked(invoke).mock.calls.filter(c => c[0] === "update_studio_project");
      expect(calls).toHaveLength(2);
      // Die Notiz kommt zuletzt — und muss den Stern mitnehmen, nicht löschen
      expect(calls[1][1]).toMatchObject({ priority: 1, notes: "abc" });
    });
  });
});
