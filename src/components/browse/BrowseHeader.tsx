// src/components/browse/BrowseHeader.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Kopfzeile von Browse: Suche + Refresh. Die Huelle kommt aus ui/PageHeader.
// ═══════════════════════════════════════════════════════════════════════════════

import { RefreshCw, Search, LibraryBig } from "lucide-react";
import { C, radius } from "../../lib/theme";
import { PageHeader, IconButton } from "../ui";

interface BrowseHeaderProps {
  search: string;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  isLoading?: boolean;
}

export function BrowseHeader({ search, onSearchChange, onRefresh, isLoading }: BrowseHeaderProps) {
  return (
    <PageHeader
      icon={LibraryBig}
      title="Archiv"
      actions={
        <>
          {/* Suche */}
          <div style={{ position: "relative" }}>
            <Search
              size={14}
              color={C.onSurfaceVariant}
              style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}
            />
            <input
              value={search}
              onChange={e => onSearchChange(e.target.value)}
              placeholder="Archiv durchsuchen …"
              style={{
                background: C.surfaceContainerLowest,
                border: `1px solid ${C.border20}`,
                borderRadius: radius.control,
                padding: "8px 10px 8px 36px",
                width: 256,
                fontSize: 12,
                fontWeight: 500,
                color: C.onSurface,
                outline: "none",
                transition: "border-color 0.15s",
              }}
              onFocus={e => (e.currentTarget.style.borderColor = C.primary)}
              onBlur={e => (e.currentTarget.style.borderColor = C.border20)}
            />
          </div>

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
