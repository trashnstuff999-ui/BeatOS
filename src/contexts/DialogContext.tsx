// src/contexts/DialogContext.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Rueckfragen und Meldungen — der Ersatz fuer window.confirm und window.alert.
//
// 38 Aufrufe lagen ueber die App verteilt, darunter die Loesch-Rueckfragen im
// Studio. Im Tauri-Webview ist das der Dialog des Betriebssystems: andere
// Schrift, nicht gestaltbar, und er blockiert das gesamte Webview, solange er
// steht. Die wichtigste Rueckfrage der App lief damit ueber den haesslichsten
// Kanal.
//
//   frage(...)  →  Promise<boolean>, gerendert als ui/Modal
//   melde(...)  →  Einblendung unten, verschwindet von selbst
//
// Der Provider haengt in App.tsx; beides ist damit von jeder Seite aus
// erreichbar, ohne dass eine Seite eigenen Dialog-Zustand halten muss.
// ═══════════════════════════════════════════════════════════════════════════════

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, AlertCircle, X } from "lucide-react";
import { C, radius, alpha } from "../lib/theme";
import { Modal, Button } from "../components/ui";

// ─── Typen ───────────────────────────────────────────────────────────────────

export interface FrageOptionen {
  /** Kopfzeile des Dialogs. */
  titel: string;
  /** Fliesstext. Zeilenumbrueche bleiben erhalten. */
  text: React.ReactNode;
  /** Beschriftung des bestaetigenden Knopfes. */
  bestaetigen?: string;
  abbrechen?: string;
  /** Loescht oder verwirft unwiederbringlich — roter Knopf. */
  gefahr?: boolean;
  /** Kein Abbrechen: es gibt nichts zu entscheiden, nur zu lesen. Fuer lange
   *  Ergebnisberichte, die in einer Einblendung untergehen wuerden. */
  nurHinweis?: boolean;
}

export type MeldungTon = "fehler" | "erfolg" | "info";

interface DialogContextValue {
  /** Rueckfrage. Loest mit true auf, wenn bestaetigt wurde. */
  frage: (opts: FrageOptionen) => Promise<boolean>;
  /** Kurze Meldung unten am Rand. */
  melde: (text: string, ton?: MeldungTon) => void;
}

const DialogContext = createContext<DialogContextValue | null>(null);

// ─── Meldungs-Aussehen ───────────────────────────────────────────────────────

const TON: Record<MeldungTon, { icon: React.ElementType; farbe: string; rand: string; flaeche: string }> = {
  fehler: { icon: AlertCircle,  farbe: C.error,   rand: alpha(C.error, 0.35), flaeche: alpha(C.error, 0.12) },
  erfolg: { icon: CheckCircle2, farbe: C.mint,    rand: alpha(C.mint, 0.35), flaeche: alpha(C.mint, 0.12) },
  info:   { icon: Info,         farbe: C.primary, rand: alpha(C.primary, 0.35), flaeche: alpha(C.primary, 0.12) },
};

/** Wie lange eine Meldung steht. Fehler laenger — sie tragen oft einen Pfad. */
const DAUER: Record<MeldungTon, number> = { fehler: 9000, erfolg: 4000, info: 6000 };

interface Meldung {
  id: number;
  text: string;
  ton: MeldungTon;
}

// ─── Provider ────────────────────────────────────────────────────────────────

interface OffeneFrage extends FrageOptionen {
  antworte: (ok: boolean) => void;
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [offen, setOffen] = useState<OffeneFrage | null>(null);
  const [meldungen, setMeldungen] = useState<Meldung[]>([]);
  const naechsteId = useRef(0);

  const frage = useCallback((opts: FrageOptionen) => {
    return new Promise<boolean>(resolve => {
      setOffen({
        ...opts,
        antworte: (ok: boolean) => { setOffen(null); resolve(ok); },
      });
    });
  }, []);

  const melde = useCallback((text: string, ton: MeldungTon = "fehler") => {
    const id = ++naechsteId.current;
    setMeldungen(prev => [...prev, { id, text, ton }]);
    setTimeout(() => setMeldungen(prev => prev.filter(m => m.id !== id)), DAUER[ton]);
  }, []);

  const wert = useMemo(() => ({ frage, melde }), [frage, melde]);

  return (
    <DialogContext.Provider value={wert}>
      {children}

      {offen && (
        <Modal
          icon={offen.gefahr ? AlertTriangle : Info}
          title={offen.titel}
          onClose={() => offen.antworte(false)}
          width={460}
          footer={
            <>
              {!offen.nurHinweis && (
                <Button variant="ghost" onClick={() => offen.antworte(false)}>
                  {offen.abbrechen ?? "Abbrechen"}
                </Button>
              )}
              <Button
                variant={offen.gefahr && !offen.nurHinweis ? "danger" : "primary"}
                onClick={() => offen.antworte(true)}
                autoFocus
              >
                {offen.bestaetigen ?? "OK"}
              </Button>
            </>
          }
        >
          {/* pre-wrap: die Texte kommen oft mehrzeilig, mit Pfad oder Liste. */}
          <div style={{
            margin: 0, fontSize: 13, color: C.onSurfaceVariant, lineHeight: 1.65,
            whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}>
            {offen.text}
          </div>
        </Modal>
      )}

      {meldungen.length > 0 && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          zIndex: 200,
          display: "flex", flexDirection: "column-reverse", gap: 8,
          alignItems: "center",
          maxWidth: "min(640px, calc(100vw - 48px))",
          pointerEvents: "none",
        }}>
          {meldungen.map(m => (
            <MeldungsZeile
              key={m.id}
              meldung={m}
              onClose={() => setMeldungen(prev => prev.filter(x => x.id !== m.id))}
            />
          ))}
        </div>
      )}
    </DialogContext.Provider>
  );
}

function MeldungsZeile({ meldung, onClose }: { meldung: Meldung; onClose: () => void }) {
  const t = TON[meldung.ton];
  const Icon = t.icon;
  return (
    <div style={{
      pointerEvents: "auto",
      display: "flex", alignItems: "flex-start", gap: 10,
      padding: "12px 14px",
      background: C.surfaceContainerHigh,
      border: `1px solid ${t.rand}`,
      borderLeft: `3px solid ${t.farbe}`,
      borderRadius: radius.card,
      boxShadow: "0 12px 32px rgba(0,0,0,0.55)",
      maxWidth: "100%",
    }}>
      <Icon size={15} color={t.farbe} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
      <span style={{
        fontSize: 12, color: C.onSurface, lineHeight: 1.55,
        whiteSpace: "pre-wrap", wordBreak: "break-word",
      }}>
        {meldung.text}
      </span>
      <button
        onClick={onClose}
        title="Schließen"
        style={{
          flexShrink: 0, display: "flex", padding: 2, marginTop: -1,
          background: "none", border: "none", cursor: "pointer",
          color: C.onSecondaryFixedVar,
        }}
        onMouseEnter={e => (e.currentTarget.style.color = C.onSurface)}
        onMouseLeave={e => (e.currentTarget.style.color = C.onSecondaryFixedVar)}
      >
        <X size={13} strokeWidth={2.5} />
      </button>
    </div>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog muss innerhalb von DialogProvider stehen");
  return ctx;
}
