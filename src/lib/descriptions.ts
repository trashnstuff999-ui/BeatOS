// src/lib/descriptions.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Display-only extractors over the rendered description files.
// The rendered .txt format is the single source; nothing here changes it.
// Used by DescriptionFilesCard (copy panels) and the Upload assistant.
// ═══════════════════════════════════════════════════════════════════════════════

/** Title = the first non-empty line after a line ending in "TITEL:"
 *  ("BEATSTARS TITEL:", "TITEL:"). Fallback: first non-empty line. */
export function extractTitle(content: string): string {
  const lines = content.split(/\r?\n/);
  const idx = lines.findIndex(l => /titel:\s*$/i.test(l.trim()));
  if (idx >= 0) {
    for (let i = idx + 1; i < lines.length; i++) {
      const t = lines[i].trim();
      if (t) return t;
    }
  }
  return lines.map(l => l.trim()).find(Boolean) ?? "";
}

/** Everything after the title block — what goes into the platform's
 *  description field. Leading blank/separator lines (────, ---) and a
 *  "BESCHREIBUNG:"/"DESCRIPTION:" label are stripped. */
export function extractDescription(content: string): string {
  const lines = content.split(/\r?\n/);
  const labelIdx = lines.findIndex(l => /titel:\s*$/i.test(l.trim()));
  let start = 0;
  if (labelIdx >= 0) {
    // skip the label line + the title line itself
    start = labelIdx + 1;
    while (start < lines.length && !lines[start].trim()) start++;
    start++; // past the title line
  }
  while (start < lines.length) {
    const t = lines[start].trim();
    const isSeparator = t.length > 0 && /^[─—\-_=]+$/.test(t);
    const isLabel = /^(beschreibung|description):?\s*$/i.test(t);
    if (!t || isSeparator || isLabel) { start++; continue; }
    break;
  }
  return lines.slice(start).join("\n").trimEnd();
}

/** The tag block after a line "TAGS:" — up to the next blank line (or EOF).
 *  Returned verbatim (SoundCloud: "#Tag" per line, YouTube/Beatstars:
 *  comma list), so copying pastes exactly what the platform expects. */
export function extractTags(content: string): string {
  const lines = content.split(/\r?\n/);
  const idx = lines.findIndex(l => /^tags:\s*$/i.test(l.trim()));
  if (idx < 0) return "";
  const out: string[] = [];
  for (let i = idx + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) {
      if (out.length > 0) break; // block ended
      continue;                  // skip blank lines directly after TAGS:
    }
    out.push(lines[i]);
  }
  return out.join("\n").trim();
}

/** How many individual tags the block contains ("#" lines or comma items). */
export function countTags(tagBlock: string): number {
  if (!tagBlock.trim()) return 0;
  const lines = tagBlock.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length > 1 || lines[0]?.startsWith("#")) {
    return lines.filter(l => l.startsWith("#") || l.length > 0).length;
  }
  return lines[0].split(",").map(t => t.trim()).filter(Boolean).length;
}
