// src/components/create/ErrorBanner.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Error Banner - Displays parse errors
// ═══════════════════════════════════════════════════════════════════════════════

import { AlertCircle } from "lucide-react";
import { C, alpha, radius } from "../../lib/theme";

interface ErrorBannerProps {
  message: string;
}

export function ErrorBanner({ message }: ErrorBannerProps) {
  return (
    <div style={{
      padding: 16, borderRadius: radius.control,
      background: alpha(C.error, 0.1), 
      border: `1px solid ${alpha(C.error, 0.3)}`,
      display: "flex", alignItems: "center", gap: 12,
    }}>
      <AlertCircle size={20} color={C.error} />
      <span style={{ color: C.error, fontSize: 13 }}>{message}</span>
    </div>
  );
}
