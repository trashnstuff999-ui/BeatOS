// src/components/upload/ChipListEditor.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Chip-based list editor for the Type-Beat fields.
// Renders values as removable chips with a visible separator badge between
// them ("x" for artists, "|" for genres) so the serialized output format is
// obvious. Enter/comma commits the draft, Backspace on an empty input pops
// the last chip, "+" gives a clickable affordance.
// ═══════════════════════════════════════════════════════════════════════════════

import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { C } from "../../lib/theme";
import { verschiebe } from "../../lib/typeBeat";

interface ChipListEditorProps {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  /** Shown between chips — mirrors the serialization ("x", "|", ",") */
  separatorLabel: string;
  placeholder: string;
  /** Optional right-aligned hint next to the label */
  hint?: string;
}

export function ChipListEditor({
  label,
  values,
  onChange,
  separatorLabel,
  placeholder,
  hint,
}: ChipListEditorProps) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ─── Sortieren per Ziehen ─────────────────────────────────────────────────
  //
  // Die Reihenfolge ist nicht kosmetisch: aus ihr entsteht der Titel
  // („A x B") und die Genre-Kette („G1 | G2").
  //
  // Umgesetzt mit MAUS-Ereignissen, und das ist eine bewusste Entscheidung
  // nach zwei gescheiterten Anläufen:
  //
  // • HTML5-Drag-and-Drop faellt aus: Tauri installiert bei `dragDropEnabled`
  //   (Standard) den Datei-Drop-Handler des Betriebssystems, der es im
  //   Fenster abschaltet. Abschalten kommt nicht in Frage, der Datei-Drop
  //   steht auf der Roadmap.
  // • Zeigerereignisse (pointerdown/-move) feuerten das Anfassen, aber in
  //   dieser WebView kam waehrend gedrueckter Taste kein einziges `pointermove`
  //   an — weder am Element mit Zeigererfassung noch am Fenster.
  //
  // Maus-Ereignisse sind der aelteste Weg und werden zuverlaessig geliefert.
  // Die Logik dahinter ist dieselbe und in ChipListEditor.test.tsx geprueft.
  const [gezogen, setGezogen] = useState<number | null>(null);
  const gezogenRef = useRef<number | null>(null);
  const chipRefs = useRef<Map<string, HTMLSpanElement>>(new Map());

  const starteZiehen = (i: number) => (e: React.MouseEvent<HTMLSpanElement>) => {
    // Der Entfernen-Knopf im Chip darf kein Ziehen ausloesen.
    if ((e.target as HTMLElement).closest("button")) return;
    if (e.button !== 0) return;

    gezogenRef.current = i;
    setGezogen(i);
    // Waehrend des Ziehens nichts markieren — sonst zieht man Text mit.
    const vorherigeAuswahl = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    // Der Zustand `values` steckt in dieser Closure fest. Das genuegt, weil
    // wir bei jedem Schritt aus der ZULETZT gemeldeten Reihenfolge weiter
    // rechnen statt aus der urspruenglichen.
    let aktuell = values;

    const bewegen = (ev: MouseEvent) => {
      const von = gezogenRef.current;
      if (von === null) return;
      // Welcher Chip liegt unter dem Zeiger? Die Liste bricht um, deshalb
      // zaehlt beides — waagerecht und senkrecht.
      const treffer = aktuell.findIndex(v => {
        const el = chipRefs.current.get(v);
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return ev.clientX >= r.left && ev.clientX <= r.right
            && ev.clientY >= r.top  && ev.clientY <= r.bottom;
      });
      if (treffer < 0 || treffer === von) return;
      aktuell = verschiebe(aktuell, von, treffer);
      gezogenRef.current = treffer;
      setGezogen(treffer);
      onChange(aktuell);
    };

    const loslassen = () => {
      gezogenRef.current = null;
      setGezogen(null);
      document.body.style.userSelect = vorherigeAuswahl;
      document.removeEventListener("mousemove", bewegen);
      document.removeEventListener("mouseup", loslassen);
    };

    document.addEventListener("mousemove", bewegen);
    document.addEventListener("mouseup", loslassen);
  };

  const commitDraft = () => {
    const v = draft.trim();
    if (!v) return;
    // no exact duplicates (case-insensitive)
    if (!values.some(x => x.toLowerCase() === v.toLowerCase())) {
      onChange([...values, v]);
    }
    setDraft("");
  };

  const removeAt = (idx: number) => {
    onChange(values.filter((_, i) => i !== idx));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitDraft();
    } else if (e.key === "Backspace" && draft === "" && values.length > 0) {
      removeAt(values.length - 1);
    }
  };

  return (
    <div>
      {/* Der Hinweis stand fruher dauerhaft rechts neben dem Label — eine
          Erklaerung, die man einmal liest und danach nie wieder braucht. Als
          Tooltip ist sie da, wenn man sie sucht (Cursor zeigt es an). */}
      <label
        title={hint}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          fontSize: 11,
          color: C.onSecondaryFixedVar,
          marginBottom: 6,
          cursor: hint ? "help" : undefined,
          width: "fit-content",
        }}
      >
        {label}
      </label>

      <div
        onClick={() => inputRef.current?.focus()}
        style={{
          display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6,
          padding: "6px 8px",
          minHeight: 40,
          // Weder Rahmen noch Fläche im Ruhezustand: Karte, Feld und Chip
          // trugen je eine eigene Abgrenzung — drei Ebenen auf 40px Höhe, und
          // jede Gruppe las sich als eigene Blase. Getrennt wird jetzt eine
          // Ebene höher mit Haarlinien; sichtbar wird hier nur der Fokus.
          //
          // Der Hover sitzt bewusst auf den einzelnen Chips statt auf dem
          // ganzen Feld: eine Fläche, die unter dem Zeiger aufleuchtet, wirkt
          // träge — reagiert dagegen genau das Element unter dem Zeiger,
          // fühlt es sich flüssig an.
          // Wie jedes Feld eine Stufe ueber der Karte (siehe commonStyles.input
          // in theme.ts) — im Ruhezustand bleibt es transparent, damit die
          // Gruppen nicht wieder als Kaesten lesen.
          background: focused ? C.surfaceContainer : "transparent",
          border: `1px solid ${focused ? C.primary + "60" : "transparent"}`,
          borderRadius: 8,
          cursor: "text",
          transition: "border-color 0.15s, background 0.15s",
          boxSizing: "border-box",
        }}
      >
        {/* Schluessel ist der Wert selbst, nicht Wert+Position. Mit der
            Position im Schluessel aendert sich beim Umsortieren JEDER
            Schluessel, React baut alle Knoten neu — und der gegriffene Chip
            verschwindet mitten im Zug. Die Werte sind eindeutig, dafuer sorgt
            commitDraft. */}
        {values.map((v, i) => (
          <span key={v} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {i > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700, fontFamily: "monospace",
                color: C.onSecondaryFixedVar, opacity: 0.6,
                userSelect: "none",
              }}>
                {separatorLabel}
              </span>
            )}
            <span
              ref={el => {
                if (el) chipRefs.current.set(v, el);
                else chipRefs.current.delete(v);
              }}
              onMouseDown={starteZiehen(i)}
              onMouseEnter={e => { if (gezogen === null) e.currentTarget.style.background = C.surfaceContainerHighest; }}
              onMouseLeave={e => { if (gezogen === null) e.currentTarget.style.background = C.surfaceContainerHigh; }}
              title="Ziehen zum Umsortieren"
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "4px 8px 4px 10px",
                background: gezogen === i ? C.surfaceContainerHighest : C.surfaceContainerHigh,
                borderRadius: 9999,
                fontSize: 12, fontWeight: 600,
                color: C.onSurface,
                lineHeight: 1.2,
                cursor: gezogen === null ? "grab" : "grabbing",
                // Waehrend des Ziehens darf der Zeiger keinen Text markieren,
                // und auf dem Touchpad kein Scrollen ausloesen.
                userSelect: "none",
                touchAction: "none",
                opacity: gezogen === i ? 0.65 : 1,
                transition: "background 0.12s, opacity 0.12s",
              }}
            >
              {v}
              <button
                onClick={(e) => { e.stopPropagation(); removeAt(i); }}
                title="Entfernen"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "none", border: "none", padding: 0,
                  color: C.onSurfaceVariant, cursor: "pointer",
                  opacity: 0.7, transition: "opacity 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                onMouseLeave={e => (e.currentTarget.style.opacity = "0.7")}
              >
                <X size={11} strokeWidth={2.5} />
              </button>
            </span>
          </span>
        ))}

        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); commitDraft(); }}
          placeholder={values.length === 0 ? placeholder : ""}
          style={{
            flex: 1, minWidth: 120,
            background: "transparent", border: "none", outline: "none",
            fontSize: 12, color: C.onSurface,
            padding: "4px 2px",
          }}
        />

        <button
          onClick={(e) => { e.stopPropagation(); commitDraft(); inputRef.current?.focus(); }}
          title="Hinzufügen (oder Enter)"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 24, height: 24, borderRadius: 6, flexShrink: 0,
            background: draft.trim() ? C.primary + "20" : "transparent",
            border: `1px solid ${draft.trim() ? C.primary + "50" : C.border20}`,
            color: draft.trim() ? C.primary : C.onSecondaryFixedVar,
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          <Plus size={13} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
