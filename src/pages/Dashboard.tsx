// src/pages/Dashboard.tsx — Übersicht: Heute (was ansteht) und Statistik.
// Die Inhalte liegen in components/dashboard/, hier nur Laden und Kopf.
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, LayoutGrid, ListTodo, ChartColumn } from "lucide-react";
import { api } from "../lib/api";
import type { Stats, DashboardActions } from "../types/stats";
import { C, alpha, radius } from "../lib/theme";
import { Button, PageHeader, PageBody, Segmented } from "../components/ui";
import { Heute } from "../components/dashboard/Heute";
import { Statistik } from "../components/dashboard/Statistik";

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [stats, setStats]     = useState<Stats | null>(null);
  const [actions, setActions] = useState<DashboardActions | null>(null);
  const [busy, setBusy]       = useState(true);
  const [error, setError]     = useState<string | null>(null);
  // Wie im Studio: ein Starttab mit dem, was ansteht, die Zahlen daneben.
  const [refreshKey, setRefreshKey] = useState(0);
  const [tab, setTab]         = useState<"heute" | "statistik">("heute");
  const navigate = useNavigate();
  const handleNavigate = useCallback((filter: object) => {
    navigate("/browse", { state: { initialFilters: filter } });
  }, [navigate]);

  // Nur die zuletzt gestartete Anfrage darf schreiben — sonst kann bei schnellem
  // Klicken eine aeltere Antwort die neuere ueberschreiben.
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setBusy(true); setError(null);
    try {
      const [s, a] = await Promise.all([
        api.stats.get(null),
        api.stats.getDashboardActions(),
      ]);
      if (id !== reqId.current) return;   // eine neuere Anfrage hat uebernommen
      setStats(s);
      setActions(a);
    }
    catch (e) { if (id === reqId.current) setError(String(e)); }
    finally  { if (id === reqId.current) setBusy(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Vollbild-Spinner nur, solange ueberhaupt nichts da ist. Beim Nachladen
  // bleiben die Zahlen stehen — sonst flackert die ganze Seite beim Jahreswechsel.
  if (busy && !stats) return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: C.background }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 40, height: 40, border: `3px solid ${C.surfaceContainerHighest}`, borderTopColor: C.primary, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
        <p style={{ fontSize: 12, color: C.onSurfaceVariant }}>Datenbank wird geladen …</p>
      </div>
    </div>
  );

  // Vollbild-Fehler nur, wenn es nichts anzuzeigen gibt. Schlaegt erst ein
  // spaeteres Nachladen fehl, bleibt das Dashboard stehen und meldet es im Header.
  if (error && !stats) return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: C.background }}>
      <div style={{ textAlign: "center", maxWidth: 400 }}>
        <p style={{ fontSize: 14, color: C.error, marginBottom: 8, fontWeight: 700 }}>Datenbankfehler</p>
        <p style={{ fontSize: 12, color: C.onSurfaceVariant, marginBottom: 24, fontFamily: "monospace", background: C.surfaceContainerLow, padding: 16, borderRadius: radius.control }}>{error}</p>
        <Button variant="primary" onClick={() => load()}>Erneut versuchen</Button>
      </div>
    </div>
  );

  if (!stats) return null;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: C.background }}>
      {/* Header — entrümpelt: System Repair lebt jetzt in den Settings */}
      <PageHeader
        icon={LayoutGrid}
        title="Übersicht"
        actions={
          <>
            {/* Fehler beim Nachladen — die angezeigten Zahlen bleiben stehen */}
            {error && (
              <span
                title={error}
                style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.05em",
                  color: C.error, background: alpha(C.error, 0.12),
                  border: `1px solid ${alpha(C.error, 0.35)}`,
                  padding: "4px 10px", borderRadius: radius.control,
                  maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              >
                Nicht aktualisiert
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              icon={RefreshCw}
              loading={busy}
              onClick={() => { load(); setRefreshKey(k => k + 1); }}
            >
              Aktualisieren
            </Button>
          </>
        }
      >
        <Segmented
          label="Bereich der Übersicht"
          value={tab}
          onChange={setTab}
          options={[
            { value: "heute", label: "Heute", icon: ListTodo },
            { value: "statistik", label: "Statistik", icon: ChartColumn },
          ]}
        />
      </PageHeader>

      <PageBody>
          {tab === "heute" && actions && (
            <Heute actions={actions} recent={stats.recent_beats} refreshKey={refreshKey} />
          )}

          {tab === "statistik" && actions && (
            <Statistik stats={stats} actions={actions} refreshKey={refreshKey} onFilter={handleNavigate} />
          )}

      </PageBody>
    </div>
  );
}