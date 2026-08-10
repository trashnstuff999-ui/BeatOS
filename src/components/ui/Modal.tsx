// src/components/ui/Modal.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Die eine Dialog-Huelle. Vorher hatte jeder der elf Dialoge seine eigene:
// Backdrop-Deckkraft 0.35 / 0.5 / 0.55 / 0.6 / 0.75 / 0.8 / 0.85, dazu ein
// halbes Dutzend Schatten. Wer einen neuen Dialog baut, nimmt diese Huelle und
// fuellt nur noch Inhalt und Fusszeile.
// ═══════════════════════════════════════════════════════════════════════════════

import React, { useEffect } from "react";
import { X } from "lucide-react";
import { C, radius } from "../../lib/theme";
import { IconButton } from "./Button";

interface ModalProps {
  title: string;
  /** Zweite Zeile unter dem Titel, z.B. die Beat-ID. */
  subtitle?: React.ReactNode;
  icon?: React.ElementType;
  onClose: () => void;
  /** Breite der Karte in px. */
  width?: number;
  children: React.ReactNode;
  /** Rechts in der Fusszeile — hier gehoeren die Buttons hin. */
  footer?: React.ReactNode;
  /** Links in der Fusszeile, z.B. „ungespeicherte Aenderungen". */
  footerLeft?: React.ReactNode;
  /** Klick auf den Hintergrund schliesst. Aus bei Dialogen, die eine Antwort erzwingen. */
  closeOnBackdrop?: boolean;
}

export function Modal({
  title,
  subtitle,
  icon: Icon,
  onClose,
  width = 520,
  children,
  footer,
  footerLeft,
  closeOnBackdrop = true,
}: ModalProps) {
  // Esc in der Capture-Phase plus stopPropagation: die Seiten darunter (Browse
  // etwa) horchen selbst auf Esc am window. Ohne das Abfangen wuerde ein Druck
  // den Dialog schliessen UND die Auswahl dahinter aufheben.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  return (
    <div
      onClick={closeOnBackdrop ? e => { if (e.target === e.currentTarget) onClose(); } : undefined}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{
        width, maxWidth: "100%", maxHeight: "85vh",
        display: "flex", flexDirection: "column",
        background: C.surfaceContainerHigh,
        border: `1px solid ${C.border20}`,
        borderRadius: radius.card,
        boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
      }}>
        {/* Kopf */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "18px 20px",
          borderBottom: `1px solid ${C.border10}`,
        }}>
          {Icon && <Icon size={16} color={C.primary} strokeWidth={1.75} style={{ flexShrink: 0 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{
              margin: 0, fontSize: 16, fontWeight: 700,
              color: C.onSurface, letterSpacing: "-0.01em",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {title}
            </h2>
            {subtitle && (
              <div style={{ fontSize: 11, color: C.onSurfaceVariant, marginTop: 2 }}>
                {subtitle}
              </div>
            )}
          </div>
          <IconButton icon={X} onClick={onClose} title="Schließen" size={28} />
        </div>

        {/* Inhalt */}
        <div style={{
          flex: 1, minHeight: 0, overflowY: "auto",
          padding: 20,
          display: "flex", flexDirection: "column", gap: 18,
        }}>
          {children}
        </div>

        {/* Fuss — nur wenn es etwas zu zeigen gibt */}
        {(footer || footerLeft) && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
            padding: "14px 20px",
            borderTop: `1px solid ${C.border10}`,
          }}>
            <div style={{ fontSize: 11, color: C.onSecondaryFixedVar }}>{footerLeft}</div>
            <div style={{ display: "flex", gap: 8 }}>{footer}</div>
          </div>
        )}
      </div>
    </div>
  );
}
