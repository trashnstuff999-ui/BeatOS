// src/components/studio/CoverPlatzhalter.tsx
// Steht da, wo noch kein Cover liegt: monochromer Grauverlauf, darauf eine
// Milchglas-Scheibe mit Note. Ersetzt die Initialen im gestrichelten Rahmen.

import { Music2 } from "lucide-react";

/** Füllt den Elternrahmen; `gross` für das Detailpanel. */
export function CoverPlatzhalter({ gross = false }: { gross?: boolean }) {
  const scheibe = gross ? 120 : 64;
  return (
    <div aria-hidden style={{
      width: "100%", height: "100%", position: "relative", overflow: "hidden",
      display: "flex", alignItems: "center", justifyContent: "center",
      // Monochrom: nur Grautöne, das Licht kommt von oben links
      background: `radial-gradient(circle at 25% 15%, rgba(255,255,255,0.14), transparent 55%),
                   radial-gradient(circle at 85% 90%, rgba(255,255,255,0.05), transparent 50%),
                   linear-gradient(145deg, #2a2a2a, #161616 65%, #101010)`,
    }}>
      <div style={{
        width: scheibe, height: scheibe, borderRadius: "50%",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.18)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25), 0 8px 24px rgba(0,0,0,0.35)",
        backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
      }}>
        <Music2 size={Math.round(scheibe * 0.42)} strokeWidth={1.5} color="rgba(255,255,255,0.85)" />
      </div>
    </div>
  );
}
