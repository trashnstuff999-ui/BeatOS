// src/lib/constants.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Application Constants
// ─ Archive path is now user-configurable via Settings → SettingsContext
// ─ DB path is managed exclusively by the Rust backend
// ═══════════════════════════════════════════════════════════════════════════════

/** Width of the fixed left sidebar in px */
export const SIDEBAR_WIDTH = 260;

/** Width of the Browse detail panel in px — it overlays the page, nothing is reserved */
// 400 statt 380: bei 380 blieben nach den 20px Innenabstand 340px Inhalt, und
// die SoundCloud-Zeile im Upload-Abschnitt braucht 341,5 (Name 99,5 + zwei
// Abstände + Zustandsleiste 222). Sie brach wegen anderthalb Pixeln um,
// während Beatstars und YouTube mit ihren kürzeren Namen passten.
export const BROWSE_PANEL_WIDTH = 400;
