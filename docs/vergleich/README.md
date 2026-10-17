# Upload-Tab: Vorher/Nachher

- `upload-vorher-2026-10-16-472a378.jpg`: **fester Vergleichsstand**, nicht ersetzen.
  Stand vor der Überarbeitung (Commit `472a378`).
- `upload-nachher-*.jpg`: der jeweils neueste Arbeitsstand.

Beide Bilder: Beat **#0932** (DONT WANNA BE), 1600 px breit, ganze Seite ohne Scrollen.

## Neues Nachher-Bild machen

Der Stand wird in einer eigenen Kopie gebaut, damit ein offenes BeatOS nicht stört:

1. `git worktree add <ordner> <commit>` und `node_modules` per Junction verlinken.
2. In der Kopie: Port in `vite.config.ts` (z. B. 4823/4824) und in
   `src-tauri/tauri.conf.json` (`devUrl`) ändern, `identifier` auf
   `com.beatos.nachher` setzen. Die Vorlagen aus `%APPDATA%\com.beatos.app\templates`
   nach `%APPDATA%\com.beatos.nachher\templates` kopieren.
3. Mit `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`
   und eigenem `CARGO_TARGET_DIR` `npx tauri dev` starten.
4. `node docs/vergleich/screenshot.js <ausgabe.jpg> 4823 0932`
