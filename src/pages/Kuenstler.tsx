// src/pages/Kuenstler.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Künstler-Projekte (Mix & Master) als eigene Seite. Stand vorher als Tab im
// Studio, ist aber eine andere Arbeit: fremde Songs, eigener Ordner (05_ARTISTS).
// ═══════════════════════════════════════════════════════════════════════════════

import { Users } from "lucide-react";
import { C } from "../lib/theme";
import { PageHeader, PageBody } from "../components/ui";
import { useSettings, kuenstlerOrdner } from "../contexts/SettingsContext";
import { ArtistsPane } from "../components/studio/ArtistsPane";

export default function Kuenstler() {
  const { settings } = useSettings();
  return (
    <div data-app-flaeche style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: C.background }}>
      <PageHeader icon={Users} title="Artists" />
      <PageBody width="full">
        {/* Breite wie im Entwurf: mittig, nicht randlos */}
        <div style={{ width: "100%", maxWidth: 1320, margin: "0 auto" }}>
          <ArtistsPane root={kuenstlerOrdner(settings)} archivePath={settings.archivePath} active />
        </div>
        <div style={{ height: 40 }} />
      </PageBody>
    </div>
  );
}
