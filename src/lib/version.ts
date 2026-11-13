// src/lib/version.ts
// Die App-Version an EINER Stelle: aus package.json (dort, in tauri.conf.json
// und Cargo.toml gleich halten).
import pkg from "../../package.json";

export const APP_VERSION: string = pkg.version;
