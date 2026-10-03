// src/components/browse/Pagination.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Pagination Controls
// ═══════════════════════════════════════════════════════════════════════════════

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { C, radius } from "../../lib/theme";
import { Select } from "../ui";
import type { PaginationState } from "../../types/browse";

const PAGE_SIZES = [
  { value: 25, label: "25" },
  { value: 50, label: "50" },
  { value: 100, label: "100" },
];

interface PaginationProps {
  pagination: PaginationState;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function Pagination({ pagination, totalPages, onPageChange, onPageSizeChange }: PaginationProps) {
  const { page, pageSize, totalCount } = pagination;
  
  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalCount);

  const buttonStyle: React.CSSProperties = {
    width: 32,
    height: 32,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.control,
    border: "none",
    cursor: "pointer",
    transition: "all 0.15s",
  };

  const activeStyle: React.CSSProperties = {
    ...buttonStyle,
    background: C.primary,
    color: C.onPrimary,
  };

  const inactiveStyle: React.CSSProperties = {
    ...buttonStyle,
    background: C.surfaceContainerHigh,
    color: C.onSurfaceVariant,
  };

  const disabledStyle: React.CSSProperties = {
    ...buttonStyle,
    background: C.surfaceContainer,
    color: C.onSecondaryFixedVar,
    cursor: "not-allowed",
    opacity: 0.5,
  };

  // Generate page numbers to show
  const getPageNumbers = () => {
    const pages: (number | "...")[] = [];
    
    if (totalPages <= 7) {
      // Show all pages
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      // Always show first page
      pages.push(1);
      
      if (page > 3) pages.push("...");
      
      // Show pages around current
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
        pages.push(i);
      }
      
      if (page < totalPages - 2) pages.push("...");
      
      // Always show last page
      pages.push(totalPages);
    }
    
    return pages;
  };

  if (totalCount === 0) return null;

  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "16px 0",
    }}>
      {/* Left: Info */}
      <div style={{ fontSize: 12, color: C.onSurfaceVariant }}>
        Showing <span style={{ color: C.onSurface, fontWeight: 600 }}>{startItem}-{endItem}</span> of{" "}
        <span style={{ color: C.onSurface, fontWeight: 600 }}>{totalCount}</span> beats
      </div>

      {/* Center: Page Numbers */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {/* First */}
        <button
          onClick={() => onPageChange(1)}
          disabled={page === 1}
          style={page === 1 ? disabledStyle : inactiveStyle}
        >
          <ChevronsLeft size={16} />
        </button>

        {/* Prev */}
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          style={page === 1 ? disabledStyle : inactiveStyle}
        >
          <ChevronLeft size={16} />
        </button>

        {/* Page Numbers */}
        {getPageNumbers().map((p, i) => (
          p === "..." ? (
            <span key={`ellipsis-${i}`} style={{ padding: "0 8px", color: C.onSecondaryFixedVar }}>
              ...
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              style={p === page ? activeStyle : inactiveStyle}
            >
              {p}
            </button>
          )
        ))}

        {/* Next */}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          style={page === totalPages ? disabledStyle : inactiveStyle}
        >
          <ChevronRight size={16} />
        </button>

        {/* Last */}
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={page === totalPages}
          style={page === totalPages ? disabledStyle : inactiveStyle}
        >
          <ChevronsRight size={16} />
        </button>
      </div>

      {/* Right: Page Size */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: C.onSurfaceVariant }}>Pro Seite:</span>
        <Select
          value={pageSize}
          options={PAGE_SIZES}
          onChange={onPageSizeChange}
          title="Beats pro Seite"
          drop="up"
          align="right"
          triggerStyle={{ padding: "5px 9px" }}
        />
      </div>
    </div>
  );
}
