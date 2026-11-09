// src/components/studio/BenennenDialog.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// „Beat benennen": Name, Tonart und BPM in einem Dialog. Wandert in den
// Ordnernamen, die Exporte und die neueste FLP (docs/beat-umbenennen.md).
// Die Vorschau ist der Punkt: ein Zurück gibt es nicht.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { PenLine, ArrowRight } from "lucide-react";
import { C, radius } from "../../lib/theme";
import { api } from "../../lib/api";
import { Modal, Button } from "../ui";
import { ideeName } from "../../lib/werkbank";
import type { StudioProject } from "../../types/studio";

type Plan = Awaited<ReturnType<typeof api.studio.planRename>>;

export function BenennenDialog({ project: p, onClose, onRenamed }: {
  project: StudioProject;
  onClose: () => void;
  /** Neuer Projektpfad nach dem Umbenennen */
  onRenamed: (path: string) => void;
}) {
  const [name, setName] = useState(ideeName(p).titel ?? "");
  const [key, setKey] = useState(p.key ?? "");
  const [bpm, setBpm] = useState(p.bpm != null ? String(p.bpm) : "");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const bpmZahl = bpm.trim() ? Number(bpm) : null;
  const args = [p.path, name, key.trim() || null, bpmZahl != null && Number.isInteger(bpmZahl) ? bpmZahl : null] as const;

  // Vorschau entprellt beim Tippen
  useEffect(() => {
    if (!name.trim()) { setPlan(null); setFehler(null); return; }
    if (bpm.trim() && !Number.isInteger(bpmZahl)) { setPlan(null); setFehler("BPM als ganze Zahl"); return; }
    let ab = false;
    const t = setTimeout(() => {
      api.studio.planRename(...args)
        .then(r => { if (!ab) { setPlan(r); setFehler(null); } })
        .catch(e => { if (!ab) { setPlan(null); setFehler(String(e)); } });
    }, 300);
    return () => { ab = true; clearTimeout(t); };
  }, [name, key, bpm]); // eslint-disable-line react-hooks/exhaustive-deps

  const nichtsZuTun = plan != null && plan.folder_from === plan.folder_to && plan.files.length === 0;

  const los = async () => {
    if (!plan || laeuft) return;
    setLaeuft(true);
    try {
      onRenamed(await api.studio.applyRename(...args));
      onClose();
    } catch (e) {
      setFehler(String(e));
      setLaeuft(false);
    }
  };

  const feld: React.CSSProperties = {
    width: "100%", padding: "8px 10px", fontSize: 13, fontFamily: "inherit",
    background: C.surfaceContainerLowest, color: C.onSurface, outline: "none",
    border: `1px solid ${C.border20}`, borderRadius: radius.control, boxSizing: "border-box",
  };
  const beschriftung: React.CSSProperties = {
    display: "block", marginBottom: 6, fontSize: 11, fontWeight: 700,
    letterSpacing: "0.08em", textTransform: "uppercase", color: C.onSecondaryFixedVar,
  };

  return (
    <Modal
      icon={PenLine}
      title="Beat benennen"
      subtitle="Ordner, Exporte und neueste FLP"
      width={560}
      onClose={onClose}
      footerLeft={<span style={{ fontSize: 12, color: C.onSurfaceVariant }}>FL darf das Projekt nicht offen haben</span>}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
        <Button variant="primary" icon={PenLine} loading={laeuft} disabled={!plan || nichtsZuTun} onClick={los}>
          Umbenennen
        </Button>
      </>}
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 90px 90px", gap: 12 }}>
        <label>
          <span style={beschriftung}>Name</span>
          <input autoFocus value={name} placeholder="Beatname" style={feld}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") los(); }} />
        </label>
        <label>
          <span style={beschriftung}>Tonart</span>
          <input value={key} placeholder="Cm" style={feld} onChange={e => setKey(e.target.value)} />
        </label>
        <label>
          <span style={beschriftung}>BPM</span>
          <input value={bpm} placeholder="140" inputMode="numeric" style={feld} onChange={e => setBpm(e.target.value)} />
        </label>
      </div>

      {fehler && <div style={{ marginTop: 14, fontSize: 12, color: C.error }}>{fehler}</div>}

      {plan && (
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          <Abschnitt titel="Ordner">
            <Zeile von={plan.folder_from} nach={plan.folder_to} />
          </Abschnitt>
          {plan.files.length > 0 && (
            <Abschnitt titel={`Dateien (${plan.files.length})`}>
              {plan.files.map(f => <Zeile key={f.from} von={f.from} nach={f.to} />)}
            </Abschnitt>
          )}
        </div>
      )}
    </Modal>
  );
}

function Abschnitt({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ marginBottom: 6, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.onSecondaryFixedVar }}>
        {titel}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{children}</div>
    </div>
  );
}

function Zeile({ von, nach }: { von: string; nach: string }) {
  const gleich = von === nach;
  const mono: React.CSSProperties = { fontSize: 12, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 14px minmax(0, 1fr)", alignItems: "center", gap: 8 }}>
      <span title={von} style={{ ...mono, color: C.onSurfaceVariant }}>{von}</span>
      <ArrowRight size={12} color={C.onSecondaryFixedVar} />
      <span title={nach} style={{ ...mono, color: gleich ? C.onSurfaceVariant : C.onSurface, fontWeight: gleich ? 400 : 600 }}>
        {gleich ? "bleibt" : nach}
      </span>
    </div>
  );
}
