// src/components/ErrorBoundary.tsx

import { Component, ReactNode } from "react";
import { colors } from "../lib/theme";

interface Props {
  children: ReactNode;
  fallbackLabel?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        gap: 16,
        color: colors.onSurfaceVariant,
        padding: 32,
      }}>
        <div style={{ fontSize: 32 }}>⚠</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: colors.onSurface }}>
          {this.props.fallbackLabel ?? "Da ist etwas schiefgelaufen"}
        </div>
        <div style={{
          fontSize: 12,
          color: colors.onSecondaryFixedVar,
          maxWidth: 480,
          textAlign: "center",
          fontFamily: "monospace",
          background: colors.surfaceContainer,
          padding: "8px 12px",
          borderRadius: 6,
          wordBreak: "break-word",
        }}>
          {this.state.error?.message ?? "Unbekannter Fehler"}
        </div>
        <button
          onClick={this.reset}
          style={{
            marginTop: 8,
            padding: "6px 18px",
            borderRadius: 6,
            border: `1px solid ${colors.outlineVariant}`,
            background: colors.surfaceContainerLow,
            color: colors.onSurface,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Erneut versuchen
        </button>
      </div>
    );
  }
}
