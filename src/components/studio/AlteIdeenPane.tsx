// src/components/studio/AlteIdeenPane.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Alte Ideen: FLPs ohne Export aus dem Altbestand, in `_IDEEN/<Jahr>/`. Nach
// Jahr gruppiert. Der runde Knopf öffnet die neueste FLP in FL, „In Produktion
// holen" macht daraus das nächste P-Projekt.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { Disc3, FolderInput, History } from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { C, alpha } from "../../lib/theme";
import { api } from "../../lib/api";
import { formatRelativeTime } from "../../lib/time";
import { useDialog } from "../../contexts/DialogContext";
import { useFocusRefresh } from "../../hooks/useFocusRefresh";
import { Button, EmptyState, Segmented } from "../ui";
import { ProjectsToolbar } from "./ProjectsToolbar";
import type { StudioProject } from "../../types/studio";

/** So viele Zeilen je Jahr, bis „Alle anzeigen" gedrückt wird */
const JE_JAHR = 8;

const ordnerName = (pfad: string) => pfad.split(/[/\\]/).filter(Boolean).pop() ?? pfad;
/** `…/_IDEEN/2021/Name` → „2021" */
const jahrVon = (p: StudioProject) => p.path.split(/[/\\]/).filter(Boolean).slice(-2)[0] ?? "";

export function AlteIdeenPane({ onGeholt }: { onGeholt: () => void }) {
  const { melde } = useDialog();
  const [ideen, setIdeen] = useState<StudioProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"alt" | "neu">("alt");
  const [offen, setOffen] = useState<Set<string>>(new Set());
  const [holt, setHolt] = useState<string | null>(null);

  const scan = useCallback(async () => {
    try { setIdeen(await api.studio.scanAlteIdeen()); }
    catch (e) { melde(`Alte Ideen konnten nicht gelesen werden: ${String(e)}`); }
    finally { setIsLoading(false); }
  }, [melde]);

  useEffect(() => { scan(); }, [scan]);
  useFocusRefresh(scan);

  const handleOpen = async (p: StudioProject) => {
    if (!p.newest_flp) return;
    try { await openPath(p.newest_flp); }
    catch (e) { melde(`FLP konnte nicht geöffnet werden: ${String(e)}`); }
  };

  const handleHolen = async (p: StudioProject) => {
    setHolt(p.path);
    try {
      const neu = await api.studio.ideeInProduktion(p.path);
      setIdeen(liste => liste.filter(x => x.path !== p.path));
      melde(`In Produktion: ${ordnerName(neu)}`, "erfolg");
      onGeholt();
    } catch (e) {
      melde(String(e));
    } finally {
      setHolt(null);
    }
  };

  const q = search.trim().toLowerCase();
  const sichtbar = ideen
    .filter(p => !q || p.name.toLowerCase().includes(q) || String(p.bpm ?? "").includes(q))
    .sort((a, b) => sort === "alt" ? a.modified_secs - b.modified_secs : b.modified_secs - a.modified_secs);
  const jahre = [...new Set(sichtbar.map(jahrVon))];

  return (
    <div>
      <ProjectsToolbar search={search} onSearch={setSearch} roots={[]} rootFilter={null} onRootFilter={() => {}}>
        <Segmented
          label="Sortierung"
          value={sort}
          onChange={setSort}
          options={[
            { value: "alt", label: "Älteste" },
            { value: "neu", label: "Neueste" },
          ]}
        />
      </ProjectsToolbar>

      <section aria-label="Alte Ideen" style={{ padding: "0 16px", maxWidth: 1100 }}>
        {!isLoading && ideen.length === 0 && (
          <EmptyState variant="inline" icon={History} title="Keine alten Ideen" />
        )}
        {jahre.map(jahr => {
          const alle = sichtbar.filter(p => jahrVon(p) === jahr);
          const gezeigt = offen.has(jahr) || q ? alle : alle.slice(0, JE_JAHR);
          return (
            <div key={jahr} style={{ paddingTop: 20 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, paddingBottom: 6 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.onSurface }}>{jahr}</h3>
                <span style={{ fontSize: 13, color: C.onSecondaryFixedVar }}>{alle.length} {alle.length === 1 ? "Idee" : "Ideen"}</span>
              </div>
              {gezeigt.map(p => (
                <IdeeZeile
                  key={p.path}
                  idee={p}
                  holt={holt === p.path}
                  gesperrt={holt !== null}
                  onOpen={() => handleOpen(p)}
                  onHolen={() => handleHolen(p)}
                />
              ))}
              {alle.length > gezeigt.length && (
                <button
                  onClick={() => setOffen(s => new Set(s).add(jahr))}
                  style={{
                    marginTop: 2, minHeight: 36, padding: "0 12px 0 52px", border: "none", borderRadius: 8,
                    background: "transparent", color: C.onSurfaceVariant, fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Alle {alle.length} anzeigen
                </button>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}

function IdeeZeile({ idee: p, holt, gesperrt, onOpen, onHolen }: {
  idee: StudioProject;
  holt: boolean;
  gesperrt: boolean;
  onOpen: () => void;
  onHolen: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const neben = [
    p.flp_count > 1 ? `${p.flp_count} Versionen` : null,
    p.bpm != null ? `${p.bpm} BPM` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 12, minHeight: 48, padding: "0 12px 0 0", borderRadius: 8,
        background: hovered ? "rgba(255,255,255,0.03)" : "transparent",
      }}
    >
      <button
        onClick={onOpen}
        aria-label="In FL öffnen"
        title="In FL öffnen"
        style={{
          flex: "0 0 36px", width: 36, height: 36, borderRadius: "50%", border: "none",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: alpha(C.primary, 0.10), color: C.primary, cursor: "pointer",
        }}
      >
        <Disc3 size={14} strokeWidth={1.75} />
      </button>
      <span title={p.name} style={{
        flex: "1 1 auto", minWidth: 0, fontSize: 14, fontWeight: 600, color: C.onSurface,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>
        {p.name}
      </span>
      <span style={{ flex: "0 0 auto", fontSize: 13, color: C.onSurfaceVariant, whiteSpace: "nowrap" }}>{neben}</span>
      <span title={p.modified_date ?? undefined} style={{ flex: "0 0 120px", textAlign: "right", fontSize: 13, color: C.onSecondaryFixedVar, whiteSpace: "nowrap" }}>
        {formatRelativeTime(p.modified_secs)}
      </span>
      <Button size="sm" variant="secondary" icon={FolderInput} onClick={onHolen} loading={holt} disabled={gesperrt && !holt}
        title="Nächste P-Nummer vergeben">
        In Produktion holen
      </Button>
    </div>
  );
}
