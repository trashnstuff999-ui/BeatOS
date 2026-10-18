// src/components/create/StatusCard.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Production Status Card - Idea/WIP/Finished/Sold
// Derselbe Umschalter wie der Status im Archiv-Detail.
// ═══════════════════════════════════════════════════════════════════════════════

import { STATUS_ITEMS } from "../../lib/theme";
import { SectionCard } from "../ui/SectionCard";
import { Segmented } from "../ui";
import { Flag } from "lucide-react";

interface StatusCardProps {
  status: string;
  setStatus: (v: string) => void;
}

export function StatusCard({ status, setStatus }: StatusCardProps) {
  return (
    <SectionCard icon={Flag} title="Status">
      <Segmented
        full
        label="Status"
        value={status}
        onChange={setStatus}
        options={STATUS_ITEMS.map(item => ({ value: item.key, label: item.label, color: item.color }))}
      />
    </SectionCard>
  );
}
