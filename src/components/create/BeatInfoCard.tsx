// src/components/create/BeatInfoCard.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Beat Information Card - Title, Key, BPM, Catalog ID
// ═══════════════════════════════════════════════════════════════════════════════

import { CheckCircle, Music } from "lucide-react";
import { C, alpha, commonStyles, radius } from "../../lib/theme";
import { getYearMonthFolder } from "../../lib/archive";
import { SectionCard } from "../ui/SectionCard";

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
  /** Archivordner "JJJJ/MM_MONAT" — bestimmt, wo der Beat im Archiv landet. */
  yearMonth: string;
  setYearMonth: (v: string) => void;
  /** Monat geraten (keine FLP, oder FLP kopiert/entpackt) — dann prüfen lassen. */
  yearMonthGeschaetzt: boolean;
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
  setYearMonth,
  yearMonthGeschaetzt,
}: BeatInfoCardProps) {
  return (
    <SectionCard icon={Music} title="Beat-Info">
      <label style={{
        fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
        textTransform: "uppercase", color: C.onSecondaryFixedVar,
        display: "block", marginBottom: 10,
      }}>
        Beat-Titel
      </label>
      <div style={{
        display: "flex", alignItems: "center",
        background: C.surfaceContainerLowest,
        borderRadius: radius.control,
        border: `1px solid ${C.border20}`,
        paddingRight: 16,
      }}>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Beat-Namen eingeben …"
          style={{ ...commonStyles.input, flex: 1, padding: 16, fontSize: 20, fontWeight: 500 }}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 16, marginTop: 24 }}>
        <SmallInput label="Tonart" value={keyValue} onChange={setKey} placeholder="Cm" width={80} />
        <SmallInput label="BPM" value={bpm} onChange={setBpm} placeholder="140" width={80} />
        <SmallInput label="Katalog-ID" value={catalogId} onChange={setCatalogId} placeholder="B0042" width={96} mono />
      </div>

      {/* Archivmonat: wohin der Beat im Archiv kommt. Vorher nur Anzeige —
          kam ein Beat als ZIP oder über Dropbox, landete er im Monat des
          Entpackens, und man konnte es nicht ändern. */}
      {yearMonth && (
        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12, color: C.onSecondaryFixedVar }}>
          {createdDate && (
            <>
              <CheckCircle size={14} color={C.mint} />
              <span>Created: {createdDate}</span>
              <span style={{ opacity: 0.5 }}>•</span>
            </>
          )}
          <label htmlFor="archivmonat">Archivmonat</label>
          <input
            id="archivmonat"
            type="month"
            value={`${yearMonth.slice(0, 4)}-${yearMonth.slice(5, 7)}`}
            onChange={e => {
              const [j, m] = e.target.value.split("-").map(Number);
              if (j && m) setYearMonth(getYearMonthFolder(new Date(j, m - 1, 1)));
            }}
            style={{
              padding: "4px 8px", fontSize: 12, fontFamily: "inherit",
              colorScheme: "dark", outline: "none",
              background: C.surfaceContainerLowest, color: C.onSurface,
              border: `1px solid ${yearMonthGeschaetzt ? alpha(C.primary, 0.6) : C.border20}`,
              borderRadius: radius.control,
            }}
          />
          <span style={{ fontFamily: "monospace", opacity: 0.8 }}>{yearMonth}</span>
          {yearMonthGeschaetzt && (
            <span
              title="Aus dem Erstelldatum der FLP, kann durch Kopieren falsch sein"
              style={{ color: C.primary, cursor: "help" }}
            >
              geschätzt
            </span>
          )}
        </div>
      )}
    </SectionCard>
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
      <label style={{ fontSize: 11, fontWeight: 700, color: C.onSecondaryFixedVar, textTransform: "uppercase", letterSpacing: "-0.02em" }}>
        {label}
      </label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width, background: C.surfaceContainerLowest,
          border: `1px solid ${C.border20}`, borderRadius: radius.control,
          padding: "8px 8px", fontSize: 14,
          textAlign: "center", textTransform: "uppercase",
          letterSpacing: "0.08em", outline: "none",
          color: C.onSurface,
          fontFamily: mono ? "monospace" : "Inter, sans-serif",
        }}
      />
    </div>
  );
}
