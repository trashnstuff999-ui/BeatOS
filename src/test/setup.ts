// src/test/setup.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Vitest global test setup
// ═══════════════════════════════════════════════════════════════════════════════

import "@testing-library/jest-dom";

// Mock Tauri's invoke so tests don't need a running Tauri backend
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// Mock Tauri dialog plugin
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));
