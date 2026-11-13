// src/components/studio/CoverPlatzhalter.tsx
// Steht da, wo noch kein Cover liegt: dunkle Fläche, der Verlauf des Status
// nur als dünner Rahmen, in der Mitte eine Note im selben Verlauf.

import { useId } from "react";
import { STUDIO_VERLAUF, type StudioVerlauf } from "../../lib/theme";

/** Füllt den Elternrahmen. Ohne `verlauf`: das Grau der Ideen. */
export function CoverPlatzhalter({ verlauf = STUDIO_VERLAUF.idea }: { verlauf?: StudioVerlauf }) {
  // useId enthält „:“, das bricht url(#…)
  const id = "sw" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <div aria-hidden className="sw-platz" style={{
      width: "100%", height: "100%", position: "relative", boxSizing: "border-box",
      borderRadius: "inherit", padding: 2,
      background: `linear-gradient(135deg, ${verlauf.von}, ${verlauf.bis})`,
    }}>
      <div style={{
        width: "100%", height: "100%", borderRadius: "inherit", background: "#1a1919",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg viewBox="0 0 24 24" fill="none" stroke={`url(#${id})`} strokeWidth={1.6}
          strokeLinecap="round" strokeLinejoin="round" style={{ width: "34%", height: "34%", opacity: 0.85 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={verlauf.von} />
              <stop offset="1" stopColor={verlauf.bis} />
            </linearGradient>
          </defs>
          <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
        </svg>
      </div>
    </div>
  );
}
