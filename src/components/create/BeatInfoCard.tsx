// src/components/create/BeatInfoCard.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Beat Information Card - Title, Key, BPM, Catalog ID
// ═══════════════════════════════════════════════════════════════════════════════

import { CheckCircle } from "lucide-react";
import { C, commonStyles } from "../../lib/theme";
import { Card, Label } from "../ui";

interface BeatInfoCardProps {
  title: string;
  setTitle: (v: string) => void;
  keyValue: string;
  setKey: (v: string) => void;
  bpm: string;
  setBpm: (v: string) => void;
  catalogId: string;
  setCatalogId: (v: string) => void;
  createdDate: string | null;
  yearMonth: string;
}

export function BeatInfoCard({
  title,
  setTitle,
  keyValue,
  setKey,
  bpm,
  setBpm,
  catalogId,
  setCatalogId,
  createdDate,
  yearMonth,
}: BeatInfoCardProps) {
  return (
    <Card accent={C.primary}>
      <Label>Track Title</Label>
      <div style={{
        display: "flex", alignItems: "center",
        background: C.surfaceContainerLowest,
        borderRadius: 8,
        border: `1px solid ${C.border20}`,
        paddingRight: 16,
      }}>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="ENTER BEAT NAME..."
          style={{ ...commonStyles.input, flex: 1, padding: 16, fontSize: 20, fontWeight: 500 }}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 16, marginTop: 24 }}>
        <SmallInput label="Key" value={keyValue} onChange={setKey} placeholder="Cm" width={80} />
        <SmallInput label="BPM" value={bpm} onChange={setBpm} placeholder="140" width={80} />
        <SmallInput label="Catalog ID" value={catalogId} onChange={setCatalogId} placeholder="#0042" width={96} mono />
      </div>

      {createdDate && (
        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: C.onSecondaryFixedVar }}>
          <CheckCircle size={14} color={C.mint} />
          <span>Created: {createdDate}</span>
          <span style={{ opacity: 0.5 }}>•</span>
          <span style={{ opacity: 0.7 }}>{yearMonth}</span>
        </div>
      )}
    </Card>
  );
}

// ─── Small Input Helper ─────────────────────────────────────────────────────

function SmallInput({ label, value, onChange, placeholder, width, mono }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  width: number;
  mono?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <label style={{ fontSize: 9, fontWeight: 700, color: C.onSecondaryFixedVar, textTransform: "uppercase", letterSpacing: "-0.02em" }}>
        {label}
      </label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width, background: C.surfaceContainerLowest,
          border: `1px solid ${C.border20}`, borderRadius: 6,
          padding: "8px 8px", fontSize: 14,
          textAlign: "center", textTransform: "uppercase",
          letterSpacing: "0.15em", outline: "none",
          color: C.onSurface,
          fontFamily: mono ? "monospace" : "Inter, sans-serif",
        }}
      />
    </div>
  );
}
