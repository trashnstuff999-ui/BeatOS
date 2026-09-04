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
        {values.map((v, i) => (
          <span key={`${v}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
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
              onMouseEnter={e => { e.currentTarget.style.background = C.surfaceContainerHighest; }}
              onMouseLeave={e => { e.currentTarget.style.background = C.surfaceContainerHigh; }}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "4px 8px 4px 10px",
                background: C.surfaceContainerHigh,
                borderRadius: 9999,
                fontSize: 12, fontWeight: 600,
                color: C.onSurface,
                lineHeight: 1.2,
                transition: "background 0.12s",
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
