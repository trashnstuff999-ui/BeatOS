// src/components/browse/detail-uploads.test.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Das Archiv-Side-Panel: Uploads nachtragen und Namen angleichen.
//
// Der Fall, um den es geht: im Archiv stehen Beats als „nicht hochgeladen",
// die längst öffentlich sind — `beat_uploads` wurde erst ab 02/2026 gefüllt.
// Zum Nachtragen muss das Panel auch für einen Beat OHNE jeden Upload-Eintrag
// alle drei Plattformen anbieten, und ein Klick muss beim Backend ankommen.
// Dazu der Knopf, der die Namen dieses einen Beats aufs Schema zieht.
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { AudioPlayerProvider } from "../../contexts/AudioPlayerContext";
import { TagManagerProvider } from "../../contexts/TagManagerContext";
import { DetailPanel } from "./DetailPanel";
import type { Beat } from "../../types/browse";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openPath: vi.fn(), revealItemInDir: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", async () => ({
  invoke: vi.fn(),
  convertFileSrc: (p: string) => `file://${p}`,
}));

const BEAT: Beat = {
  id: "0842", name: "NUR HEUTE", path: "C:\\ARCHIV\\0842_NUR_HEUTE",
  bpm: 140, key: "Am", status: "finished", tags: null, favorite: 0,
  created_date: "2025-05-01", modified_date: "2025-05-01",
  notes: null, sold_to: null, has_artwork: 0, has_video: 0,
};

/** Was `get_upload_data` für einen Beat ohne einen einzigen Eintrag liefert:
 *  drei Entwurfszeilen, vom Backend aufgefüllt. */
const OHNE_EINTRAG = {
  beat: { id: BEAT.id, name: BEAT.name, path: BEAT.path, bpm: 140, key: "Am" },
  assets: {},
  uploads: [
    { platform: "beatstars",  status: "draft", scheduled_at: null, uploaded_at: null, url: null },
    { platform: "soundcloud", status: "draft", scheduled_at: null, uploaded_at: null, url: null },
    { platform: "youtube",    status: "draft", scheduled_at: null, uploaded_at: null, url: null },
  ],
};

const mockInvoke = vi.mocked(invoke);

function panelRendern(onUploadsChanged = vi.fn(), onRenamed = vi.fn()) {
  render(
    <AudioPlayerProvider>
      <TagManagerProvider>
        <DetailPanel
          beat={BEAT}
          isOpen
          onClose={vi.fn()}
          onToggleFavorite={vi.fn()}
          onUpdateStatus={vi.fn()}
          onOpenEditModal={vi.fn()}
          onUploadsChanged={onUploadsChanged}
          onRenamed={onRenamed}
        />
      </TagManagerProvider>
    </AudioPlayerProvider>,
  );
  return onUploadsChanged;
}

/** Dieselbe Antwort, aber SoundCloud ist geplant statt Entwurf. */
const SOUNDCLOUD_GEPLANT = {
  ...OHNE_EINTRAG,
  uploads: OHNE_EINTRAG.uploads.map(u =>
    u.platform === "soundcloud"
      ? { ...u, status: "scheduled", scheduled_at: "2026-09-12" }
      : u),
};

function uploadDaten(antwort: unknown) {
  mockInvoke.mockImplementation(async (cmd: string) => {
    if (cmd === "get_upload_data") return antwort;
    return undefined;   // update_upload_status, Cover-Pfad — alles in try/catch
  });
}

beforeEach(() => {
  mockInvoke.mockReset();
  uploadDaten(OHNE_EINTRAG);
});

describe("Uploads im Side-Panel", () => {
  it("bietet alle drei Plattformen an, auch ohne jeden Eintrag", async () => {
    panelRendern();
    expect(await screen.findByText("Beatstars")).toBeInTheDocument();
    expect(screen.getByText("SoundCloud")).toBeInTheDocument();
    expect(screen.getByText("YouTube")).toBeInTheDocument();
  });

  it("schreibt den Klick durch und stempelt das Datum", async () => {
    const onUploadsChanged = panelRendern();
    await screen.findByText("YouTube");

    // Drei Plattformen, jede mit derselben Zustandsleiste — die dritte
    // gehört zu YouTube.
    const knoepfe = screen.getAllByTitle('Auf „Hochgeladen" setzen');
    expect(knoepfe).toHaveLength(3);
    await userEvent.click(knoepfe[2]);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("update_upload_status", {
        params: expect.objectContaining({
          beat_id: "0842",
          platform: "youtube",
          status: "uploaded",
          // Ein „hochgeladen" ohne Datum wäre für die Nacherfassung wertlos.
          uploaded_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        }),
      });
    });

    // Das Raster im Archiv trägt Plattform-Punkte — die müssen mitkommen.
    await waitFor(() => expect(onUploadsChanged).toHaveBeenCalled());
  });

  it("Entwurf zeigt weder Datum noch Linkzeile", async () => {
    panelRendern();
    await screen.findByText("Beatstars");

    // Drei Entwuerfe — die Zeile ist dann nur Name und Zustandsleiste.
    expect(document.querySelectorAll('input[type="date"]')).toHaveLength(0);
    expect(screen.queryByPlaceholderText(/Link hier einfügen/)).not.toBeInTheDocument();
    expect(screen.queryByTitle("Link kopieren")).not.toBeInTheDocument();
  });

  it("bietet im Archiv keinen Upload-Assistenten an", async () => {
    // Die Rakete startet den geführten Upload — hier wird nachgetragen, was
    // schon passiert ist. Im Upload-Tab (ohne `flach`) bleibt sie.
    panelRendern();
    await screen.findByText("Beatstars");
    expect(screen.queryByTitle(/Upload starten/)).not.toBeInTheDocument();
  });

  it("ab Geplant kommen Datum und Linkzeile dazu — aber nur dort", async () => {
    uploadDaten(SOUNDCLOUD_GEPLANT);
    panelRendern();
    await screen.findByText("SoundCloud");

    // Genau eine der drei Plattformen ist ueber den Entwurf hinaus.
    const daten = document.querySelectorAll<HTMLInputElement>('input[type="date"]');
    expect(daten).toHaveLength(1);
    expect(daten[0].value).toBe("2026-09-12");
    expect(screen.getAllByTitle("Link kopieren")).toHaveLength(1);
    // Der Platzhalter sagt, was zu tun ist — nicht, wie die Vorlagen-Variable heißt.
    expect(screen.getByPlaceholderText("SoundCloud-Link hier einfügen")).toBeInTheDocument();
  });

  it("zurueck auf Entwurf raeumt den Termin mit weg", async () => {
    // Sonst bliebe ein Datum in der Zeile, das die Kachel nicht mehr zeigt —
    // und `get_upload_schedule` filtert nur auf scheduled_at, nicht auf Status.
    uploadDaten(SOUNDCLOUD_GEPLANT);
    panelRendern();
    await screen.findByText("SoundCloud");

    await userEvent.click(screen.getAllByTitle('Auf „Entwurf" setzen')[1]);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("update_upload_status", {
        params: expect.objectContaining({
          platform: "soundcloud",
          status: "draft",
          scheduled_at: null,
        }),
      });
    });
  });

  it("baut den Block waehrend des Nachladens nicht ab", async () => {
    // Vorher setzte das Panel bei JEDEM Nachladen `uploads = null`: der ganze
    // Abschnitt verschwand, zeigte „wird geladen …" und klappte wieder auf —
    // bei jedem Klick. Sichtbar wird das nur, solange das Nachladen laeuft,
    // deshalb haengt der zweite Aufruf hier, bis der Test ihn freigibt.
    let freigeben: ((wert: unknown) => void) | null = null;
    let aufrufe = 0;
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_upload_data") {
        aufrufe += 1;
        if (aufrufe === 1) return SOUNDCLOUD_GEPLANT;
        return new Promise(aufl => { freigeben = aufl; });
      }
      return undefined;
    });

    panelRendern();
    await screen.findByText("SoundCloud");

    await userEvent.click(screen.getAllByTitle('Auf „Hochgeladen" setzen')[1]);
    await waitFor(() => expect(aufrufe).toBe(2));   // Nachladen laeuft gerade

    expect(screen.queryByText(/wird geladen/)).not.toBeInTheDocument();
    expect(screen.getByText("SoundCloud")).toBeInTheDocument();

    await act(async () => { freigeben?.(SOUNDCLOUD_GEPLANT); });
  });

  it("laedt nichts, solange das Panel zu ist", async () => {
    render(
      <AudioPlayerProvider>
        <TagManagerProvider>
          <DetailPanel
            beat={BEAT}
            isOpen={false}
            onClose={vi.fn()}
            onToggleFavorite={vi.fn()}
            onUpdateStatus={vi.fn()}
            onOpenEditModal={vi.fn()}
          />
        </TagManagerProvider>
      </AudioPlayerProvider>,
    );
    await waitFor(() => expect(mockInvoke).toHaveBeenCalled());   // Cover laeuft
    expect(mockInvoke).not.toHaveBeenCalledWith("get_upload_data", expect.anything());
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Namen angleichen — derselbe Lauf wie im Kopf, nur auf diesen einen Beat.
// Der Knopf schreibt direkt auf die Platte, ohne Vorschau: gedacht fürs
// Durchgehen Beat für Beat.
// ═══════════════════════════════════════════════════════════════════════════════

describe("Namen angleichen im Panel", () => {
  const knopf = () => screen.getByTitle(/auf das Schema ziehen/);

  it("laeuft nur ueber diesen Beat und meldet, was passiert ist", async () => {
    const onRenamed = vi.fn();
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_upload_data") return OHNE_EINTRAG;
      if (cmd === "sync_beat_folders") {
        return [{ beat_id: "0842", from: "alt", to: "neu", files_renamed: 2, error: null }];
      }
      return undefined;
    });

    panelRendern(vi.fn(), onRenamed);
    await screen.findByText("Beatstars");
    await userEvent.click(knopf());

    // Genau dieser Beat, und kein Trockenlauf — der Knopf tut es wirklich.
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("sync_beat_folders", {
        beatIds: ["0842"], dryRun: false,
      });
    });
    expect(await screen.findByText("Ordner umbenannt · 2 Dateien umbenannt")).toBeInTheDocument();
    // Pfad und Cover-Dateiname haben sich geaendert — das Archiv muss neu laden.
    expect(onRenamed).toHaveBeenCalled();
  });

  it("sagt Bescheid, wenn nichts zu tun war — und laedt dann auch nichts neu", async () => {
    const onRenamed = vi.fn();
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_upload_data") return OHNE_EINTRAG;
      if (cmd === "sync_beat_folders") {
        return [{ beat_id: "0842", from: "gleich", to: "gleich", files_renamed: 0, error: null }];
      }
      return undefined;
    });

    panelRendern(vi.fn(), onRenamed);
    await screen.findByText("Beatstars");
    await userEvent.click(knopf());

    expect(await screen.findByText("Namen passen schon")).toBeInTheDocument();
    expect(onRenamed).not.toHaveBeenCalled();
  });

  it("zeigt den Fehler statt ihn zu schlucken", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_upload_data") return OHNE_EINTRAG;
      if (cmd === "sync_beat_folders") {
        return [{ beat_id: "0842", from: "a", to: "b", files_renamed: 0, error: "„b“ gibt es in diesem Ordner schon" }];
      }
      return undefined;
    });

    panelRendern();
    await screen.findByText("Beatstars");
    await userEvent.click(knopf());

    expect(await screen.findByText(/gibt es in diesem Ordner schon/)).toBeInTheDocument();
  });
});
