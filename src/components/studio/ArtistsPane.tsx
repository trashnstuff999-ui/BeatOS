// src/components/studio/ArtistsPane.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Studio → Künstler: Mix-&-Master-Projekte für Künstler, je Künstler die Songs.
//
// Scheibe 1 (nur lesen): je Song ein Häkchen pro Baustein — FLP, Vocals,
// Demo, Beat, Mix, Master —, abgeleitet aus den Dateien im Song-Ordner
// (Regeln in commands/artists.rs). Fehlt etwas, sieht man es. Abgegebene
// Songs (<Künstler>/_Fertig/) stehen zugeklappt darunter.
// Plan und nächste Scheiben: docs/kuenstler-projekte.md.
// ═══════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from "react";
import { Users, FolderOpen, FolderPlus, ChevronDown, Check, Mic2 } from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { C, alpha, radius } from "../../lib/theme";
import { api } from "../../lib/api";
import { formatRelativeTime } from "../../lib/time";
import { useFocusRefresh } from "../../hooks/useFocusRefresh";
import { EmptyState, Button, IconButton } from "../ui";
import type { Artist, ArtistSong, ArtistsScan } from "../../types/artists";

const BAUSTEINE: { key: keyof Pick<ArtistSong, "flp" | "vocals" | "demo" | "beat" | "mix" | "master">; label: string; titel: string }[] = [
  { key: "flp", label: "FLP", titel: "FL-Projekt im Song-Ordner" },
  { key: "vocals", label: "Vocals", titel: "Audiodatei mit „Vocal\" im Namen (Eingang, Audio/ oder Song-Ordner)" },
  { key: "demo", label: "Demo", titel: "Im Eingang eine Audiodatei, die wie der Song heißt" },
  { key: "beat", label: "Beat", titel: "Im Eingang eine weitere Audiodatei (weder Vocals noch Demo)" },
  { key: "mix", label: "Mix", titel: "Ein Export im Song-Ordner" },
  { key: "master", label: "Master", titel: "Eine Audiodatei mit „Master\" im Namen" },
];

export function ArtistsPane({ root, active }: { root: string; active: boolean }) {
  const [scan, setScan] = useState<ArtistsScan | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [legtAn, setLegtAn] = useState(false);

  const laden = useCallback(() => {
    if (!root) return;
    api.artists.scan(root)
      .then(s => { setScan(s); setFehler(null); })
      .catch(e => setFehler(String(e)));
  }, [root]);

  useEffect(() => { if (active) laden(); }, [active, laden]);
  // Zurück aus dem Explorer oder aus Discord: neu lesen, nur wenn der Tab offen ist.
  useFocusRefresh(() => { if (active) laden(); });

  if (!root) {
    return (
      <EmptyState
        icon={Users}
        title="Kein Künstler-Ordner"
        description="In den Einstellungen einen Archiv-Ordner setzen — der Künstler-Ordner liegt daneben (05_ARTISTS) — oder einen eigenen Künstler-Ordner wählen."
      />
    );
  }
  if (fehler) return <EmptyState icon={Users} title="Künstler-Ordner nicht lesbar" description={fehler} />;
  if (!scan) return <div style={{ padding: 24, fontSize: 12, color: C.onSecondaryFixedVar }}>Lese Künstler-Ordner …</div>;

  if (!scan.vorhanden) {
    return (
      <EmptyState
        icon={FolderPlus}
        title="Den Künstler-Ordner gibt es noch nicht"
        description={<>Mix- und Master-Projekte für Künstler liegen in <code>{root}</code> — je Künstler ein Ordner, darin je Song einer.</>}
        action={
          <Button variant="primary" icon={FolderPlus} loading={legtAn} onClick={async () => {
            setLegtAn(true);
            try { await api.artists.createRoot(root); laden(); }
            catch (e) { setFehler(String(e)); }
            finally { setLegtAn(false); }
          }}>
            Ordner anlegen
          </Button>
        }
      />
    );
  }

  if (scan.kuenstler.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Noch keine Künstler"
        description="Im Künstler-Ordner je Künstler einen Unterordner anlegen, darin je Song einen Ordner."
        action={<Button variant="secondary" icon={FolderOpen} onClick={() => revealItemInDir(root).catch(() => {})}>Ordner öffnen</Button>}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {scan.kuenstler.map(k => <KuenstlerBlock key={k.path} kuenstler={k} />)}
    </div>
  );
}

function KuenstlerBlock({ kuenstler: k }: { kuenstler: Artist }) {
  const [fertigOffen, setFertigOffen] = useState(false);
  const offen = k.songs.filter(s => !s.fertig);
  const fertig = k.songs.filter(s => s.fertig);

  return (
    <section style={{
      background: C.surfaceContainerLow, border: `1px solid ${C.border10}`,
      borderRadius: radius.card, overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${C.border10}` }}>
        <Mic2 size={15} color={C.primary} strokeWidth={1.75} />
        <span style={{ fontSize: 15, fontWeight: 700, color: C.onSurface }}>{k.name}</span>
        <span style={{ fontSize: 12, color: C.onSecondaryFixedVar }}>
          {offen.length === 1 ? "1 Song offen" : `${offen.length} Songs offen`}
          {fertig.length > 0 && ` · ${fertig.length} abgegeben`}
        </span>
        <span style={{ flex: 1 }} />
        <IconButton icon={FolderOpen} size={28} variant="secondary" title="Künstler-Ordner öffnen"
          onClick={() => revealItemInDir(k.path).catch(() => {})} />
      </div>

      {offen.length === 0 && (
        <div style={{ padding: "12px 18px", fontSize: 12, color: C.onSecondaryFixedVar }}>Nichts offen.</div>
      )}
      {offen.map(s => <SongZeile key={s.path} song={s} />)}

      {fertig.length > 0 && (
        <>
          <button
            onClick={() => setFertigOffen(o => !o)}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 6,
              padding: "10px 18px", border: "none", borderTop: `1px solid ${C.border10}`,
              background: "transparent", cursor: "pointer", fontFamily: "inherit",
              fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
              color: C.onSecondaryFixedVar,
            }}
          >
            <ChevronDown size={13} style={{ transition: "transform 0.15s", transform: fertigOffen ? "rotate(180deg)" : "none" }} />
            Abgegeben ({fertig.length})
          </button>
          {fertigOffen && fertig.map(s => <SongZeile key={s.path} song={s} />)}
        </>
      )}
    </section>
  );
}

function SongZeile({ song: s }: { song: ArtistSong }) {
  return (
    <div
      onClick={() => revealItemInDir(s.path).catch(() => {})}
      title="Song-Ordner öffnen"
      style={{
        display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto 110px", alignItems: "center", gap: 16,
        padding: "11px 18px", borderTop: `1px solid ${C.border10}`, cursor: "pointer",
        opacity: s.fertig ? 0.7 : 1,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = C.surfaceContainer; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ fontSize: 13, fontWeight: 600, color: C.onSurface, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {s.name}
      </span>
      <span style={{ display: "flex", gap: 4 }}>
        {BAUSTEINE.map(b => {
          const da = s[b.key];
          return (
            <span
              key={b.key}
              title={`${b.label}: ${da ? "vorhanden" : "fehlt"} — ${b.titel}`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 8px", borderRadius: radius.full,
                fontSize: 11, fontWeight: 600,
                background: da ? alpha(C.mint, 0.12) : "transparent",
                border: `1px ${da ? "solid" : "dashed"} ${da ? alpha(C.mint, 0.35) : C.border20}`,
                color: da ? C.mint : C.onSecondaryFixedVar,
              }}
            >
              {da && <Check size={10} strokeWidth={2.5} />}
              {b.label}
            </span>
          );
        })}
      </span>
      <span style={{ fontSize: 12, color: C.onSecondaryFixedVar, textAlign: "right" }}>
        {s.geaendert ? formatRelativeTime(s.geaendert) : "—"}
      </span>
    </div>
  );
}
