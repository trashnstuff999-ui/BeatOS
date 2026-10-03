// src/components/create/CreateHeader.tsx

import { useNavigate } from "react-router-dom";
import { Tag, RotateCcw, PlusSquare, ArrowLeft } from "lucide-react";
import { C, radius } from "../../lib/theme";
import { PageHeader, Button } from "../ui";

interface CreateHeaderProps {
  hasData: boolean;
  onResetClick: () => void;
  tagCount: number;
  hasNotes: boolean;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export function CreateHeader({ hasData, onResetClick, tagCount, hasNotes, sidebarOpen, onToggleSidebar }: CreateHeaderProps) {
  const navigate = useNavigate();
  return (
    <PageHeader
      icon={PlusSquare}
      title="Neuer Beat"
      actions={
        <Button
          variant={sidebarOpen ? "secondary" : "ghost"}
          size="sm"
          icon={Tag}
          onClick={onToggleSidebar}
          data-create-sidebar-toggle
          title="Tags & Notizen"
          style={sidebarOpen ? { background: C.surfaceContainerHigh, color: C.onSurface } : undefined}
        >
          Tags & Notizen
          {tagCount > 0 && (
            <span style={{
              minWidth: 18, height: 18, padding: "0 5px", borderRadius: radius.full,
              background: C.primary, color: C.onPrimary,
              fontSize: 10, fontWeight: 800,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {tagCount}
            </span>
          )}
          {tagCount === 0 && hasNotes && (
            <span style={{ width: 7, height: 7, borderRadius: radius.full, background: C.primary }} />
          )}
        </Button>
      }
    >
      {/* Kein eigener Tab mehr: man kommt aus dem Studio und geht dorthin zurück. */}
      <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => navigate("/studio")}>
        Studio
      </Button>
      {hasData && (
        <Button variant="secondary" size="sm" icon={RotateCcw} onClick={onResetClick}>
          Reset
        </Button>
      )}
    </PageHeader>
  );
}
