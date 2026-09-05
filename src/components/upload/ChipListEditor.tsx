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
  // Bewusst über Zeigerereignisse statt über HTML5-Drag-and-Drop: Tauri
  // installiert bei `dragDropEnabled` (Standard) den Datei-Drop-Handler des
  // Betriebssystems, und der schaltet HTML5-Ziehen im Fenster ab. Abschalten
  // kommt nicht in Frage — der Datei-Drop ins Fenster steht auf der Roadmap.
  const [gezogen, setGezogen] = useState<number | null>(null);
  const gezogenRef = useRef<number | null>(null);
  const chipRefs = useRef<Map<string, HTMLSpanElement>>(new Map());

  const starteZiehen = (i: number) => (e: React.PointerEvent<HTMLSpanElement>) => {
    // Der Entfernen-Knopf im Chip darf kein Ziehen ausloesen.
    if ((e.target as HTMLElement).closest("button")) return;
    // Ohne das faengt der Browser an, Text zu markieren.
    e.preventDefault();
    // Zeigererfassung: alle weiteren Bewegungen gehen an DIESES Element,
    // egal was gerade unter dem Zeiger liegt. Ohne sie verliert man den
    // Zug, sobald die Liste sich neu ordnet.
    e.currentTarget.setPointerCapture(e.pointerId);
    gezogenRef.current = i;
    setGezogen(i);
  };

  const beimZiehen = (e: React.PointerEvent) => {
    const von = gezogenRef.current;
    if (von === null) return;
    // Welcher Chip liegt unter dem Zeiger? Die Liste bricht um, deshalb
    // zaehlt beides — waagerecht und senkrecht.
    const treffer = values.findIndex(v => {
      const el = chipRefs.current.get(v);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right
          && e.clientY >= r.top  && e.clientY <= r.bottom;
    });
    if (treffer < 0 || treffer === von) return;
    gezogenRef.current = treffer;
    setGezogen(treffer);
    onChange(verschiebe(values, von, treffer));
  };

  const beendeZiehen = () => {
    if (gezogenRef.current === null) return;
    gezogenRef.current = null;
    setGezogen(null);
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
          background: focused ? C.surfaceContainerLowest : "transparent",
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
              onPointerDown={starteZiehen(i)}
              onPointerMove={beimZiehen}
              onPointerUp={beendeZiehen}
              onPointerCancel={beendeZiehen}
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
