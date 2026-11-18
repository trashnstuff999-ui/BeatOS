// Nur die Fehler, die tsc nicht sieht: Hooks in falscher Reihenfolge und
// fehlende Abhängigkeiten in useEffect/useCallback (veraltete Daten, Endlos-Laden).
// Stilregeln bewusst nicht.
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config({
  files: ["src/**/*.{ts,tsx}"],
  languageOptions: { parser: tseslint.parser },
  plugins: { "react-hooks": reactHooks },
  rules: {
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
  },
});
