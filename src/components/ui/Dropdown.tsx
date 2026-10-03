// src/components/ui/Dropdown.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Ein Dropdown, das Windows nicht selbst zeichnet. Natives <select> rendert die
// aufgeklappte Liste als Betriebssystem-Menue — im dunklen Design sah das aus
// wie Win 98 mit Dark Theme. Der Knopf laesst sich stylen, die Liste nicht.
// Also beides selbst: Knopf + absolut positioniertes Feld, wie es das
// Tonart-Feld in der FilterBar schon gemacht hat.
// ═══════════════════════════════════════════════════════════════════════════════

import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { C, radius, alpha } from "../../lib/theme";

interface DropdownProps {
  /** Beschriftung im geschlossenen Zustand. */
  label: React.ReactNode;
  title?: string;
  /** Breite des Felds; ohne Angabe so breit wie der Knopf. */
  panelWidth?: number | string;
  /** Am unteren Rand der Seite nach oben aufklappen, sonst wird abgeschnitten. */
  drop?: "down" | "up";
  align?: "left" | "right";
  triggerStyle?: React.CSSProperties;
  panelStyle?: React.CSSProperties;
  disabled?: boolean;
  /** Inhalt bekommt `close`, um sich nach der Auswahl selbst zuzumachen. */
  children: (close: () => void) => React.ReactNode;
}

export function Dropdown({
  label, title, panelWidth, drop = "down", align = "left",
  triggerStyle, panelStyle, disabled, children,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        title={title}
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          justifyContent: "space-between",
          padding: "7px 10px",
          borderRadius: radius.control,
          background: C.surfaceContainer,
          border: `1px solid ${open ? C.border30 : C.border15}`,
          color: C.onSurface,
          fontSize: 11, fontWeight: 600, fontFamily: "inherit",
          textAlign: "left",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          outline: "none",
          ...triggerStyle,
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {label}
        </span>
        <ChevronDown
          size={13}
          strokeWidth={2}
          color={C.onSecondaryFixedVar}
          style={{
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
          }}
        />
      </button>

      {open && (
        <>
          {/* Klick daneben macht zu — liegt unter dem Feld, ueber allem sonst.
              `data-modal`, damit derselbe Klick nicht auch noch das
              Detailpanel zuklappt (siehe hooks/useKlickDaneben). */}
          <div data-modal style={{ position: "fixed", inset: 0, zIndex: 49 }} onClick={close} />
          <div
            data-modal
            style={{
              position: "absolute",
              [drop === "down" ? "top" : "bottom"]: "100%",
              [align]: 0,
              [drop === "down" ? "marginTop" : "marginBottom"]: 4,
              minWidth: "100%",
              width: panelWidth,
              background: C.surfaceContainerHigh,
              border: `1px solid ${C.border30}`,
              borderRadius: radius.card,
              padding: 6,
              zIndex: 50,
              boxShadow: "0 12px 32px rgba(0,0,0,0.55)",
              maxHeight: 340,
              overflowY: "auto",
              ...panelStyle,
            }}
          >
            {children(close)}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Select ─────────────────────────────────────────────────────────────────
// Der Alltagsfall: eine Liste, ein Treffer. Setzt auf Dropdown auf, damit es
// im Haus kein natives <select> mehr gibt.

interface SelectProps<T extends string | number> {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  title?: string;
  placeholder?: string;
  drop?: "down" | "up";
  align?: "left" | "right";
  panelWidth?: number | string;
  triggerStyle?: React.CSSProperties;
  disabled?: boolean;
}

export function Select<T extends string | number>({
  value, options, onChange, title, placeholder, drop, align, panelWidth, triggerStyle, disabled,
}: SelectProps<T>) {
  const current = options.find(o => o.value === value);

  return (
    <Dropdown
      label={current?.label ?? placeholder ?? ""}
      title={title}
      drop={drop}
      align={align}
      panelWidth={panelWidth}
      triggerStyle={triggerStyle}
      disabled={disabled}
    >
      {close => (
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {options.map(o => {
            const active = o.value === value;
            return (
              <button
                key={String(o.value)}
                type="button"
                onClick={() => { onChange(o.value); close(); }}
                style={{
                  textAlign: "left",
                  padding: "7px 10px",
                  borderRadius: radius.control - 1,
                  background: active ? alpha(C.primary, 0.12) : "transparent",
                  border: "none",
                  color: active ? C.primary : C.onSurfaceVariant,
                  fontSize: 11, fontWeight: active ? 700 : 600, fontFamily: "inherit",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = C.surfaceContainerHighest; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </Dropdown>
  );
}
