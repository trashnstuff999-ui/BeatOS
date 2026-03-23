// src/components/create/ErrorBanner.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Error Banner - Displays parse errors
// ═══════════════════════════════════════════════════════════════════════════════

import { AlertCircle } from "lucide-react";

interface ErrorBannerProps {
  message: string;
}

export function ErrorBanner({ message }: ErrorBannerProps) {
  return (
    <div style={{
      padding: 16, borderRadius: 8,
      background: "rgba(239,68,68,0.1)", 
      border: "1px solid rgba(239,68,68,0.3)",
      display: "flex", alignItems: "center", gap: 12,
    }}>
      <AlertCircle size={20} color="#ef4444" />
      <span style={{ color: "#ef4444", fontSize: 13 }}>{message}</span>
    </div>
  );
}
