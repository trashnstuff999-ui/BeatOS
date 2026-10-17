// src/components/ui/Segmented.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Ein Umschalter für „eins von mehreren" — überall dieselbe Bauart.
//
// Vorher gab es drei: Plattform-Reiter in Großbuchstaben mit farbigem
// Unterstrich, Entwurf/Geplant/Hochgeladen in winzigen Großbuchstaben mit
// Trennstrichen, FL-Marker/Audio in normaler Schrift mit Fläche. Drei
// Bauarten für dieselbe Sache heißen: dreimal neu lesen, wie sie gemeint sind.
//
// Jetzt: eine leicht vertiefte Leiste, das Gewählte als erhabene Fläche.
// Normale Schrift statt Großbuchstaben — die Optionen sind Wörter, keine
// Überschriften. Eine Option darf eine eigene Farbe tragen (Plattform,
// Upload-Zustand); sie zeigt sich nur, wenn die Option gewählt ist.
// ═══════════════════════════════════════════════════════════════════════════════

import { C, alpha, radius } from "../../lib/theme";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ElementType;
  /** Farbe, wenn gewählt — sonst die normale Schriftfarbe. */
  color?: string;
  title?: string;
  /** Kleines Zeichen hinter dem Namen, z. B. „von Hand geändert". */
  zusatz?: React.ReactNode;
}

export function Segmented<T extends string>({
  options, value, onChange, full = false, disabled = false, label,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Über die ganze Breite, Optionen gleich breit. */
  full?: boolean;
  disabled?: boolean;
  /** Für Screenreader: was hier umgeschaltet wird. */
  label?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      style={{
        display: full ? "flex" : "inline-flex", flexShrink: 0,
        padding: 2, gap: 2,
        borderRadius: radius.control,
        background: C.surfaceContainer,
        border: `1px solid ${C.border10}`,
      }}
    >
      {options.map(o => {
        const an = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={an}
            title={o.title}
            disabled={disabled}
            onClick={() => { if (!an) onChange(o.value); }}
            style={{
              flex: full ? 1 : undefined,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: "5px 10px",
              borderRadius: radius.control, border: "none",
              background: an ? (o.color ? alpha(o.color, 0.14) : C.surfaceContainerHighest) : "transparent",
              color: an ? (o.color ?? C.onSurface) : C.onSecondaryFixedVar,
              fontSize: 11, fontWeight: 600, fontFamily: "inherit",
              whiteSpace: "nowrap",
              cursor: disabled ? "wait" : an ? "default" : "pointer",
              opacity: disabled ? 0.6 : 1,
              transition: "background 0.15s, color 0.15s",
            }}
            onMouseEnter={e => { if (!an) e.currentTarget.style.color = C.onSurface; }}
            onMouseLeave={e => { if (!an) e.currentTarget.style.color = C.onSecondaryFixedVar; }}
          >
            {Icon && <Icon size={12} strokeWidth={1.75} />}
            {o.label}
            {o.zusatz}
          </button>
        );
      })}
    </div>
  );
}
