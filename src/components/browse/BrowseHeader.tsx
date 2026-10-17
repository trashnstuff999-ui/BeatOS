// src/components/browse/BrowseHeader.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Kopfzeile von Browse: Suche + Refresh. Die Huelle kommt aus ui/PageHeader.
// ═══════════════════════════════════════════════════════════════════════════════

import { useEffect, useRef } from "react";
import { RefreshCw, Search, LibraryBig, FolderSymlink, Type, X } from "lucide-react";
import { C, radius } from "../../lib/theme";
import { PageHeader, IconButton } from "../ui";

interface BrowseHeaderProps {
  search: string;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  isLoading?: boolean;
  /** Alte Ordnerstruktur flachziehen — einmalige Sache am Altbestand. */
  onMigrate: () => void;
  /** Namen auf das Schema ziehen — läuft im Alltag, nach jedem nachgelegten Cover. */
  onRename: () => void;
}

export function BrowseHeader({ search, onSearchChange, onRefresh, isLoading, onMigrate, onRename }: BrowseHeaderProps) {
  const feld = useRef<HTMLInputElement>(null);

  // „/" springt ins Suchfeld, Esc leert und geht wieder raus — beides nur,
  // wenn gerade nicht schon in einem Eingabefeld getippt wird.
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      const ziel = e.target as HTMLElement | null;
      const tippt = ziel && (ziel.tagName === "INPUT" || ziel.tagName === "TEXTAREA" || ziel.isContentEditable);

      if (e.key === "/" && !tippt && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        feld.current?.focus();
        feld.current?.select();
      } else if (e.key === "Escape" && ziel === feld.current) {
        onSearchChange("");
        feld.current?.blur();
      }
    };
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, [onSearchChange]);

  return (
    <PageHeader
      icon={LibraryBig}
      title="Archiv"
      actions={
        <>
          {/* Suche */}
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <Search
              size={14}
              color={search ? C.primary : C.onSurfaceVariant}
              style={{ position: "absolute", left: 12, pointerEvents: "none" }}
            />
            <input
              ref={feld}
              value={search}
              onChange={e => onSearchChange(e.target.value)}
              placeholder="Archiv durchsuchen …"
              style={{
                background: C.surfaceContainer,
                border: `1px solid ${search ? C.border30 : C.border20}`,
                borderRadius: radius.control,
                padding: "8px 34px 8px 36px",
                width: 320,
                fontSize: 12,
                fontWeight: 500,
                fontFamily: "inherit",
                color: C.onSurface,
                outline: "none",
                transition: "border-color 0.15s",
              }}
              onFocus={e => (e.currentTarget.style.borderColor = C.primary)}
              onBlur={e => (e.currentTarget.style.borderColor = search ? C.border30 : C.border20)}
            />
            {/* Leeren — ohne das musste man 30 Zeichen einzeln zurueckloeschen. */}
            {search ? (
              <button
                onClick={() => { onSearchChange(""); feld.current?.focus(); }}
                title="Suche leeren (Esc)"
                style={{
                  position: "absolute", right: 8,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 18, height: 18, borderRadius: radius.full,
                  background: "none", border: "none", padding: 0,
                  color: C.onSurfaceVariant, cursor: "pointer",
                }}
                onMouseEnter={e => (e.currentTarget.style.color = C.onSurface)}
                onMouseLeave={e => (e.currentTarget.style.color = C.onSurfaceVariant)}
              >
                <X size={13} strokeWidth={2.5} />
              </button>
            ) : (
              <kbd style={{
                position: "absolute", right: 9, pointerEvents: "none",
                fontSize: 11, fontWeight: 700, fontFamily: "inherit",
                color: C.onSecondaryFixedVar,
                border: `1px solid ${C.border20}`, borderRadius: radius.control,
                padding: "1px 5px", lineHeight: "14px",
              }}>
                /
              </kbd>
            )}
          </div>

          <IconButton
            icon={Type}
            title="Namen angleichen — Ordner- und Dateinamen auf das Schema ziehen"
            onClick={onRename}
          />

          <IconButton
            icon={FolderSymlink}
            title="Struktur migrieren — alte Ordnerstruktur (01_AUDIO, 02_VISUALS, 03_PROJECTS) flachziehen"
            onClick={onMigrate}
          />

          <IconButton
            icon={RefreshCw}
            title="Neu laden"
            onClick={onRefresh}
            disabled={isLoading}
            style={isLoading ? { animation: "spin 1s linear infinite" } : undefined}
          />
        </>
      }
    />
  );
}
