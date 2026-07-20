// src/lib/assetGroups.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Asset-Inbox grouping: files that share the number in their filename belong
// together ("Cover_17.png" + "Thumbnail_17.png" → group "17"). Assigning a
// group moves cover and thumbnail to a project in one click.
// Shared by the Studio assets pane and the Create-tab asset picker.
// ═══════════════════════════════════════════════════════════════════════════════

import type { AssetFile } from "../types/studio";

export interface AssetGroup {
  key: string;
  items: AssetFile[];
}

/**
 * Group key = last number in the filename, extension excluded.
 * "Cover_17.png" → "17", "Visualizer_17.mp4" → "17" (not "4" from ".mp4").
 */
export function extractGroupKey(name: string): string | null {
  const withoutExt = name.replace(/\.[^.]+$/, "");
  const matches = withoutExt.match(/\d+/g);
  return matches ? matches[matches.length - 1] : null;
}

/**
 * Split inbox files into groups (≥2 files sharing a number, newest first)
 * and singles (everything else, newest first).
 */
export function groupAssets(files: AssetFile[]): { groups: AssetGroup[]; singles: AssetFile[] } {
  const byKey = new Map<string, AssetFile[]>();
  const singles: AssetFile[] = [];

  for (const file of files) {
    const key = extractGroupKey(file.name);
    if (key === null) { singles.push(file); continue; }
    const list = byKey.get(key) ?? [];
    list.push(file);
    byKey.set(key, list);
  }

  const groups: AssetGroup[] = [];
  for (const [key, items] of byKey) {
    if (items.length >= 2) groups.push({ key, items });
    else singles.push(...items);
  }

  const newest = (items: AssetFile[]) => Math.max(...items.map(i => i.modified_secs));
  groups.sort((a, b) => newest(b.items) - newest(a.items));
  singles.sort((a, b) => b.modified_secs - a.modified_secs);

  return { groups, singles };
}
