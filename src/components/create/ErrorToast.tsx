// src/components/create/ErrorToast.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Error Toast - Floating error message at bottom of screen
// ═══════════════════════════════════════════════════════════════════════════════

import { AlertCircle, X } from "lucide-react";

interface ErrorToastProps {
  message: string;
  onClose: () => void;
}

export function ErrorToast({ message, onClose }: ErrorToastProps) {
  return (
    <div style={{
      position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
      background: "rgba(239,68,68,0.95)", color: "#fff",
      padding: "16px 24px", borderRadius: 12,
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", gap: 12,
      zIndex: 100, maxWidth: 500,
    }}>
      <AlertCircle size={20} />
      <span style={{ fontSize: 13, flex: 1 }}>{message}</span>
      <button
        onClick={onClose}
        style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer", padding: 4 }}
      >
        <X size={18} />
      </button>
    </div>
  );
}
