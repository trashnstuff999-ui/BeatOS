// src/components/dashboard/Statistik.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Übersicht → Statistik: ein Jahresbericht statt Kachelwand.
//
// Abschnitte trennen sich durch Weißraum und eine feine Linie, nicht durch
// Karten. Jede Grafik beantwortet eine Frage: Wie regelmäßig lade ich hoch?
// In welchen Tonarten und welchem Tempo baue ich? Wie schnell geht ein Beat
// raus? Wie wächst das Archiv? Entwurf: docs/uebersicht-plan.md.
// ═══════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { C, alpha, radius, STATUS_ITEMS, STUDIO_STATUS_CONFIG } from "../../lib/theme";
import { heatmap, zirkel, durchlauf, wachstum, DUR_ZIRKEL, MOLL_ZIRKEL } from "../../lib/statistik";
import type { Stats, DashboardActions, StatsDetails } from "../../types/stats";

const MONATE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const WOCHENTAGE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const MO_ZUERST = [1, 2, 3, 4, 5, 6, 0];

const ueberschrift: React.CSSProperties = {
  margin: 0, fontSize: 12, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.08em", color: C.onSurfaceVariant,
};
const unterzeile: React.CSSProperties = { margin: "6px 0 0", fontSize: 13, color: C.onSecondaryFixedVar };
const abschnitt: React.CSSProperties = { padding: "44px 0", borderBottom: `1px solid ${C.border10}` };
const zahl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: C.onSurfaceVariant, fontFamily: "monospace", lineHeight: 1 };

/** Knopf ohne Knopf-Optik: erbt Schrift und Farbe, bringt Tab und Enter mit. */
function Klick({ style, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...rest} style={{ border: 0, padding: 0, margin: 0, font: "inherit", color: "inherit", textAlign: "inherit", cursor: "pointer", ...style }} />;
}

export function Statistik({ stats, actions, refreshKey, onFilter }: {
  stats: Stats;
  actions: DashboardActions;
  refreshKey: number;
  onFilter: (filter: object) => void;
}) {
  const navigate = useNavigate();
  const [details, setDetails] = useState<StatsDetails | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let weg = false;
    api.stats.getDetails()
      .then(d => { if (!weg) { setDetails(d); setFehler(null); } })
      .catch(e => { if (!weg) setFehler(String(e)); });
    return () => { weg = true; };
  }, [refreshKey]);

  const studio = actions.studio_by_status;
  const studioSumme = ["idea", "wip", "exported", "ready"].reduce((s, k) => s + (studio[k] ?? 0), 0);

  const kennzahlen = [
    { wert: stats.total, label: "Beats im Archiv", unter: `${stats.this_month} neu diesen Monat`, ziel: () => navigate("/browse") },
    { wert: actions.published_beats, label: "veröffentlicht", unter: "mit mind. 1 Upload", ziel: () => navigate("/upload") },
    { wert: stats.by_status.finished, label: "fertig", unter: `${actions.finished_unscheduled} noch ohne Termin`, ziel: () => onFilter({ status: "finished" }) },
    { wert: actions.current_streak_weeks, label: "Wochen Serie", unter: "jede Woche ein Upload", ziel: null },
    { wert: studioSumme, label: "Studio-Projekte", unter: `davon ${studio.idea ?? 0} Ideen`, ziel: () => navigate("/studio") },
  ];

  return (
    <div>
      {/* ── Kennzahlen als Zeile ── */}
      <section style={{ display: "flex", flexWrap: "wrap", rowGap: 24, padding: "24px 0 44px", borderBottom: `1px solid ${C.border10}` }}>
        {kennzahlen.map((k, i) => (
          <div key={k.label} style={{ flex: "1 1 160px", padding: i ? "0 20px" : "0 20px 0 0", borderLeft: i ? `1px solid ${C.border10}` : undefined, boxSizing: "border-box" }}>
            <Klick className={k.ziel ? "ue-zeile" : undefined} onClick={k.ziel ?? undefined} disabled={!k.ziel}
              style={{ display: "block", width: "100%", padding: 8, cursor: k.ziel ? "pointer" : "default" }}>
            <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1, color: C.onSurface, fontVariantNumeric: "tabular-nums" }}>{k.wert}</div>
            <div style={{ fontSize: 13, color: C.onSurfaceVariant, marginTop: 8 }}>{k.label}</div>
            <div style={{ fontSize: 12, color: C.onSecondaryFixedVar, marginTop: 3 }}>{k.unter}</div>
            </Klick>
          </div>
        ))}
      </section>

      {fehler && <p style={{ fontSize: 12, color: C.error }}>Details nicht geladen: {fehler}</p>}
      {details && <UploadJahr details={details} />}
      <section style={{ ...abschnitt, display: "flex", flexWrap: "wrap", gap: 56 }}>
        <Tonarten stats={stats} onFilter={onFilter} />
        {details && <Tempo bpm={details.bpm} />}
      </section>
      <WegDerBeats stats={stats} actions={actions} studioSumme={studioSumme} onFilter={onFilter} />
      {details && (
        <section style={{ ...abschnitt, display: "flex", flexWrap: "wrap", gap: 56 }}>
          <Wochentage werte={details.wochentage} />
          <Durchlauf tage={details.durchlauf_tage} />
        </section>
      )}
      {details && (
        <section style={{ ...abschnitt, display: "flex", flexWrap: "wrap", gap: 56 }}>
          <Wachstum monate={details.monate} />
          <NeueBeats monate={details.monate} />
        </section>
      )}
      <Tags stats={stats} onFilter={onFilter} />
    </div>
  );
}

// ── Upload-Jahr: ein Kästchen pro Tag ────────────────────────────────────────
function UploadJahr({ details }: { details: StatsDetails }) {
  const zellen = heatmap(details.upload_tage, new Date());
  const summe = zellen.reduce((s, z) => s + z.anzahl, 0);
  const meist = MO_ZUERST
    .filter(t => details.wochentage[t] > 0)
    .sort((a, b) => details.wochentage[b] - details.wochentage[a])
    .slice(0, 3)
    .sort((a, b) => MO_ZUERST.indexOf(a) - MO_ZUERST.indexOf(b))
    .map(t => WOCHENTAGE[t]);
  const monatsKoepfe = Array.from({ length: 52 }, (_, w) => {
    const m = Number(zellen[w * 7].iso.slice(5, 7)) - 1;
    const vorher = w > 0 ? Number(zellen[(w - 1) * 7].iso.slice(5, 7)) - 1 : -1;
    return m !== vorher ? MONATE[m] : "";
  });
  const Z = 15, L = 4;

  return (
    <section style={abschnitt}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <h2 style={ueberschrift}>Upload-Jahr</h2>
        <span style={{ fontSize: 13, color: C.onSecondaryFixedVar }}>
          {summe} Uploads in 12 Monaten{meist.length > 0 && ` · meist ${meist.join(", ")}`}
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: `28px repeat(52, ${Z}px)`, columnGap: L, width: "max-content" }}>
          <span />
          {monatsKoepfe.map((m, i) => <span key={i} style={{ fontSize: 11, color: C.onSecondaryFixedVar, whiteSpace: "nowrap", height: 16 }}>{m}</span>)}
        </div>
        <div style={{ display: "flex", gap: L, width: "max-content" }}>
          <div style={{ display: "grid", gridTemplateRows: `repeat(7, ${Z}px)`, rowGap: L, width: 28, fontSize: 11, color: C.onSecondaryFixedVar, lineHeight: `${Z}px` }}>
            <span>Mo</span><span /><span>Mi</span><span /><span>Fr</span><span /><span />
          </div>
          <div style={{ display: "grid", gridAutoFlow: "column", gridTemplateRows: `repeat(7, ${Z}px)`, gridAutoColumns: Z, gap: L }}>
            {zellen.map(z => (
              <span key={z.iso} className={z.zukunft ? undefined : "ue-zelle"}
                title={`${Number(z.iso.slice(8, 10))}. ${MONATE[Number(z.iso.slice(5, 7)) - 1]} ${z.iso.slice(0, 4)}: ${z.anzahl ? `${z.anzahl} Upload${z.anzahl > 1 ? "s" : ""}` : "kein Upload"}`}
                style={{
                  width: Z, height: Z, borderRadius: 3,
                  background: z.zukunft ? "transparent" : z.anzahl === 0 ? C.surfaceContainerHigh : z.anzahl === 1 ? alpha(C.primary, 0.6) : C.primary,
                  border: z.zukunft ? `1px dashed ${C.border10}` : undefined, boxSizing: "border-box",
                }} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Tonarten im Quintenzirkel ────────────────────────────────────────────────
function bogen(r0: number, r1: number, i: number) {
  const p = (r: number, grad: number) => {
    const a = (grad * Math.PI) / 180;
    return `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
  };
  const a0 = -105 + i * 30 + 1, a1 = a0 + 28;
  return `M${p(r1, a0)} A${r1} ${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 0 0 ${p(r0, a0)} Z`;
}

function Tonarten({ stats, onFilter }: { stats: Stats; onFilter: (f: object) => void }) {
  const { dur, moll, ohne } = zirkel(stats.top_keys);
  const max = Math.max(1, ...dur, ...moll);
  const ringe = [
    ...DUR_ZIRKEL.map((g, i) => ({ name: g, anzahl: dur[i], i, r0: 118, r1: 162, nachbarn: [DUR_ZIRKEL[(i + 11) % 12], DUR_ZIRKEL[(i + 1) % 12], `${MOLL_ZIRKEL[i]}m`], werte: [dur[(i + 11) % 12], dur[(i + 1) % 12], moll[i]] })),
    ...MOLL_ZIRKEL.map((g, i) => ({ name: `${g}m`, anzahl: moll[i], i, r0: 64, r1: 114, nachbarn: [`${MOLL_ZIRKEL[(i + 11) % 12]}m`, `${MOLL_ZIRKEL[(i + 1) % 12]}m`, DUR_ZIRKEL[i]], werte: [moll[(i + 11) % 12], moll[(i + 1) % 12], dur[i]] })),
  ];
  const haeufigste = ringe.reduce((a, b) => (b.anzahl > a.anzahl ? b : a), ringe[0]);
  const [wahl, setWahl] = useState(haeufigste.name);
  const sel = ringe.find(r => r.name === wahl) ?? haeufigste;

  return (
    <div style={{ flex: "1 1 460px", minWidth: 0 }}>
      <h2 style={ueberschrift}>Tonarten</h2>
      <p style={{ ...unterzeile, marginBottom: 20 }}>Quintenzirkel · außen Dur, innen Moll · Nachbarn klingen verwandt</p>
      <div style={{ display: "flex", gap: 32, alignItems: "center", flexWrap: "wrap" }}>
        <svg width={340} height={340} viewBox="-170 -170 340 340" role="img" aria-label="Tonarten im Quintenzirkel">
          {ringe.map(r => {
            const anteil = r.anzahl / max;
            const an = r.name === sel.name;
            return (
              <path key={r.name} className="ue-hell" d={bogen(r.r0, r.r1, r.i)}
                fill={r.anzahl === 0 ? C.surfaceContainerHigh : alpha(C.primary, 0.16 + 0.84 * anteil)}
                stroke={an ? C.onSurface : C.background} strokeWidth={an ? 2.5 : 2}
                style={{ cursor: "pointer" }} onClick={() => setWahl(r.name)}>
                <title>{`${r.name}: ${r.anzahl}`}</title>
              </path>
            );
          })}
          {ringe.map(r => {
            const a = ((-90 + r.i * 30) * Math.PI) / 180, rm = (r.r0 + r.r1) / 2;
            const anteil = r.anzahl / max;
            return (
              <text key={`t${r.name}`} x={rm * Math.cos(a)} y={rm * Math.sin(a)} textAnchor="middle" dominantBaseline="central"
                fontSize={12} fontWeight={700} pointerEvents="none"
                fill={anteil > 0.45 ? C.onPrimary : r.anzahl === 0 ? C.onSecondaryFixedVar : C.onSurface}>
                {r.name}
              </text>
            );
          })}
          <text x={0} y={-6} textAnchor="middle" fill={C.onSurface} fontSize={26} fontWeight={800}>{sel.name}</text>
          <text x={0} y={18} textAnchor="middle" fill={C.onSurfaceVariant} fontSize={12}>{sel.anzahl} Beats</text>
        </svg>
        <div style={{ flex: "1 1 180px", minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-0.02em", color: C.onSurface }}>{sel.name}</div>
          <div style={{ fontSize: 14, color: C.onSurfaceVariant }}>
            {sel.anzahl} Beats · {stats.total ? Math.round((sel.anzahl / stats.total) * 1000) / 10 : 0} % des Archivs
          </div>
          <div style={{ fontSize: 13, color: C.onSecondaryFixedVar, lineHeight: 1.5 }}>
            Nachbarn im Zirkel: {sel.nachbarn.map((n, i) => `${n} (${sel.werte[i]})`).join(", ")}
          </div>
          {ohne > 0 && <div style={{ fontSize: 12, color: C.onSecondaryFixedVar }}>{ohne} Beats ohne lesbare Tonart</div>}
          {sel.anzahl > 0 && (
            <Klick className="ue-link" onClick={() => onFilter({ keys: [sel.name] })} style={{ fontSize: 13, fontWeight: 600, color: C.primary, marginTop: 6, alignSelf: "flex-start" }}>
              Im Archiv zeigen →
            </Klick>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tempo ────────────────────────────────────────────────────────────────────
function Tempo({ bpm }: { bpm: [number, number][] }) {
  if (bpm.length === 0) return null;
  const von = bpm[0][0], bis = bpm[bpm.length - 1][0];
  const anzahl = new Map(bpm);
  const stufen = Array.from({ length: (bis - von) / 10 + 1 }, (_, i) => von + i * 10).map(b => ({ b, n: anzahl.get(b) ?? 0 }));
  const summe = stufen.reduce((s, x) => s + x.n, 0);
  const max = Math.max(1, ...stufen.map(s => s.n));
  // Der dichteste Bereich aus vier Zehnerstufen — dort baust du wirklich.
  let besterStart = 0, besteSumme = -1;
  for (let i = 0; i + 4 <= stufen.length; i++) {
    const s = stufen.slice(i, i + 4).reduce((a, x) => a + x.n, 0);
    if (s > besteSumme) { besteSumme = s; besterStart = i; }
  }
  const kern = (i: number) => stufen.length >= 4 && i >= besterStart && i < besterStart + 4;

  return (
    <div style={{ flex: "1 1 340px", minWidth: 0 }}>
      <h2 style={ueberschrift}>Tempo</h2>
      <p style={{ ...unterzeile, marginBottom: 28 }}>
        {stufen.length >= 4
          ? `${besteSumme} von ${summe} Beats liegen zwischen ${stufen[besterStart].b} und ${stufen[besterStart].b + 39} BPM`
          : `${summe} Beats mit BPM`}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${stufen.length}, minmax(0, 1fr))`, gap: 5, alignItems: "end", height: 200 }}>
        {stufen.map((s, i) => (
          <div key={s.b} className="ue-hell" title={`${s.b}–${s.b + 9} BPM: ${s.n} Beats`} style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 5, height: "100%" }}>
            <span style={zahl}>{s.n || ""}</span>
            <div style={{ width: "100%", borderRadius: "4px 4px 0 0", height: Math.max((s.n / max) * 160, s.n ? 4 : 2), background: kern(i) ? C.primary : s.n ? C.outlineVariant : C.surfaceContainerHigh }} />
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${stufen.length}, minmax(0, 1fr))`, gap: 5, marginTop: 8 }}>
        {stufen.map(s => <span key={s.b} style={{ fontSize: 11, color: C.onSecondaryFixedVar, textAlign: "center" }}>{s.b}</span>)}
      </div>
    </div>
  );
}

// ── Weg der Beats: Studio-Bestand und Archiv ─────────────────────────────────
function Strecke({ teile }: { teile: { key: string; label: string; anzahl: number; farbe: string; onClick?: () => void }[] }) {
  const summe = teile.reduce((s, t) => s + t.anzahl, 0) || 1;
  return (
    <>
      <div style={{ display: "flex", height: 10, borderRadius: radius.full, overflow: "hidden", gap: 3 }}>
        {teile.filter(t => t.anzahl > 0).map(t => (
          <div key={t.key} className="ue-hell" title={`${t.label}: ${t.anzahl}`} style={{ width: `${(t.anzahl / summe) * 100}%`, minWidth: 6, background: t.farbe }} />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 40px", marginTop: 16, alignItems: "baseline" }}>
        {teile.map((t, i) => {
          const inhalt = (
            <>
              <span style={{ fontSize: 26, fontWeight: 800, color: C.onSurface }}>{t.anzahl}</span>{" "}
              <span style={{ fontSize: 13, color: t.farbe }}>{t.label}</span>
            </>
          );
          return (
            <span key={t.key} style={{ display: "contents" }}>
              {i > 0 && <span aria-hidden style={{ color: C.outlineVariant }}>→</span>}
              {t.onClick ? <Klick className="ue-hell" onClick={t.onClick} title={`${t.label} im Archiv zeigen`}>{inhalt}</Klick> : <span>{inhalt}</span>}
            </span>
          );
        })}
      </div>
    </>
  );
}

function WegDerBeats({ stats, actions, studioSumme, onFilter }: { stats: Stats; actions: DashboardActions; studioSumme: number; onFilter: (f: object) => void }) {
  const studio = actions.studio_by_status;
  return (
    <section style={abschnitt}>
      <h2 style={ueberschrift}>Weg der Beats</h2>
      <p style={{ ...unterzeile, marginBottom: 24 }}>Erst im Studio, dann im Archiv · {studioSumme} Projekte, {stats.total} archivierte Beats</p>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.onSecondaryFixedVar, marginBottom: 10 }}>Studio</div>
      <Strecke teile={(["idea", "wip", "exported", "ready"] as const).map(k => ({
        key: k, label: STUDIO_STATUS_CONFIG[k].label, anzahl: studio[k] ?? 0, farbe: STUDIO_STATUS_CONFIG[k].color,
      }))} />
      {(studio.discard ?? 0) > 0 && (
        <div style={{ fontSize: 12, color: C.onSecondaryFixedVar, marginTop: 10 }}>{studio.discard} Projekte zum Löschen vorgemerkt</div>
      )}
      <div style={{ fontSize: 12, fontWeight: 700, color: C.onSecondaryFixedVar, margin: "32px 0 10px" }}>Archiv</div>
      <Strecke teile={STATUS_ITEMS.map(s => ({
        key: s.key, label: s.label, anzahl: stats.by_status[s.key as keyof Stats["by_status"]] ?? 0, farbe: s.color,
        onClick: () => onFilter({ status: s.key }),
      }))} />
      <div style={{ fontSize: 13, color: C.onSecondaryFixedVar, marginTop: 14 }}>{actions.published_beats} Beats mit mindestens einem Upload</div>
    </section>
  );
}

// ── Wochentage ───────────────────────────────────────────────────────────────
function Wochentage({ werte }: { werte: number[] }) {
  const max = Math.max(1, ...werte);
  const summe = werte.reduce((a, b) => a + b, 0);
  return (
    <div style={{ flex: "1 1 340px", minWidth: 0 }}>
      <h2 style={ueberschrift}>Upload-Wochentage</h2>
      <p style={{ ...unterzeile, marginBottom: 20 }}>An welchem Tag ein Beat zum ersten Mal rausging · {summe} Beats</p>
      {MO_ZUERST.map(t => (
        <div key={t} className="ue-zeile" title={`${WOCHENTAGE[t]}: ${werte[t]} Beats`} style={{ display: "grid", gridTemplateColumns: "28px 1fr 32px", alignItems: "center", gap: 12, padding: "5px 8px", margin: "0 -8px", fontSize: 13 }}>
          <span style={{ fontWeight: 600, color: C.onSurfaceVariant }}>{WOCHENTAGE[t]}</span>
          <span style={{ height: 8, borderRadius: radius.full, background: C.surfaceContainerHigh, overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", width: `${(werte[t] / max) * 100}%`, borderRadius: radius.full, background: werte[t] / max > 0.5 ? C.primary : C.outlineVariant }} />
          </span>
          <span style={{ ...zahl, fontSize: 12, textAlign: "right" }}>{werte[t]}</span>
        </div>
      ))}
    </div>
  );
}

// ── Durchlaufzeit ────────────────────────────────────────────────────────────
function Durchlauf({ tage }: { tage: number[] }) {
  const { median, stufen } = durchlauf(tage);
  const max = Math.max(1, ...stufen.map(s => s.anzahl));
  return (
    <div style={{ flex: "1 1 340px", minWidth: 0 }}>
      <h2 style={ueberschrift}>Vom Archiv zum Upload</h2>
      <p style={{ ...unterzeile, marginBottom: 20 }}>
        {median === null ? "Noch keine Uploads gemessen"
          : `Meist ${median <= 1 ? "nach einem Tag" : `nach ${Math.round(median)} Tagen`} draußen (Median) · ${tage.length} Beats`}
      </p>
      {stufen.map(s => (
        <div key={s.label} className="ue-zeile" title={`${s.label}: ${s.anzahl} Beats`} style={{ display: "grid", gridTemplateColumns: "170px 1fr 32px", alignItems: "center", gap: 12, padding: "5px 8px", margin: "0 -8px", fontSize: 13 }}>
          <span style={{ color: C.onSurfaceVariant }}>{s.label}</span>
          <span style={{ height: 8, borderRadius: radius.full, background: C.surfaceContainerHigh, overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", width: `${(s.anzahl / max) * 100}%`, borderRadius: radius.full, background: C.primary }} />
          </span>
          <span style={{ ...zahl, fontSize: 12, textAlign: "right" }}>{s.anzahl}</span>
        </div>
      ))}
    </div>
  );
}

// ── Archiv-Wachstum ──────────────────────────────────────────────────────────
function Wachstum({ monate }: { monate: [string, number][] }) {
  const reihe = wachstum(monate);
  if (reihe.length < 2) return null;
  const B = 520, H = 160;
  const max = reihe[reihe.length - 1].summe || 1;
  const x = (i: number) => (i / (reihe.length - 1)) * B;
  const y = (s: number) => H - (s / max) * H;
  const linie = reihe.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(r.summe).toFixed(1)}`).join(" ");
  const jahre = reihe.map((r, i) => ({ i, jahr: r.monat.slice(0, 4), start: r.monat.endsWith("-01") || i === 0 })).filter(r => r.start);

  return (
    <div style={{ flex: "1 1 420px", minWidth: 0 }}>
      <h2 style={ueberschrift}>Archiv-Wachstum</h2>
      <p style={{ ...unterzeile, marginBottom: 20 }}>{max} Beats seit {MONATE[Number(reihe[0].monat.slice(5, 7)) - 1]} {reihe[0].monat.slice(0, 4)}</p>
      <svg viewBox={`0 -8 ${B} ${H + 30}`} width="100%" role="img" aria-label="Beats im Archiv über die Zeit" style={{ display: "block", maxWidth: B }}>
        <path d={`${linie} L${B} ${H} L0 ${H} Z`} fill={alpha(C.primary, 0.12)} />
        <path d={linie} fill="none" stroke={C.primary} strokeWidth={2.5} strokeLinejoin="round" />
        <line x1={0} x2={B} y1={H} y2={H} stroke={C.border10} />
        {reihe.map((r, i) => (
          <g key={r.monat} className="ue-punkt">
            <title>{`${MONATE[Number(r.monat.slice(5, 7)) - 1]} ${r.monat.slice(0, 4)}: ${r.summe} Beats (+${r.neu})`}</title>
            <rect x={x(i) - B / reihe.length / 2} y={0} width={B / reihe.length} height={H} fill="transparent" />
            <line x1={x(i)} x2={x(i)} y1={y(r.summe)} y2={H} stroke={C.primary} strokeWidth={1} opacity={0} />
            <circle cx={x(i)} cy={y(r.summe)} r={4.5} fill={C.primary} stroke={C.background} strokeWidth={2} />
          </g>
        ))}
        {jahre.map(j => (
          <g key={j.jahr}>
            <line x1={x(j.i)} x2={x(j.i)} y1={0} y2={H} stroke={C.border10} strokeDasharray="2 4" />
            <text x={x(j.i) + 4} y={H + 18} fontSize={11} fill={C.onSecondaryFixedVar}>{j.jahr}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ── Neue Beats im laufenden Jahr ─────────────────────────────────────────────
function NeueBeats({ monate }: { monate: [string, number][] }) {
  const jahr = String(new Date().getFullYear());
  const anzahl = new Map(monate);
  const werte = MONATE.map((_, i) => anzahl.get(`${jahr}-${String(i + 1).padStart(2, "0")}`) ?? 0);
  const max = Math.max(1, ...werte);
  const summe = werte.reduce((a, b) => a + b, 0);
  const spitze = werte.indexOf(Math.max(...werte));
  const jetzt = new Date().getMonth();

  return (
    <div style={{ flex: "1 1 360px", minWidth: 0 }}>
      <h2 style={ueberschrift}>Neue Beats {jahr}</h2>
      <p style={{ ...unterzeile, marginBottom: 20 }}>{summe} bisher{summe > 0 && ` · am meisten im ${["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"][spitze]}`}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: 6, alignItems: "end", height: 130 }}>
        {werte.map((n, i) => (
          <div key={i} className="ue-hell" title={`${MONATE[i]} ${jahr}: ${n} neue Beats`} style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 5, height: "100%" }}>
            <span style={zahl}>{n || ""}</span>
            <div style={{ width: "100%", borderRadius: "3px 3px 0 0", height: Math.max((n / max) * 100, 2), background: n === 0 ? C.surfaceContainerHigh : i === jetzt ? alpha(C.primary, 0.5) : C.outlineVariant }} />
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: 6, marginTop: 8 }}>
        {MONATE.map(m => <span key={m} style={{ fontSize: 11, color: C.onSecondaryFixedVar, textAlign: "center" }}>{m}</span>)}
      </div>
    </div>
  );
}

// ── Häufigste Tags ───────────────────────────────────────────────────────────
function Tags({ stats, onFilter }: { stats: Stats; onFilter: (f: object) => void }) {
  const tags = stats.top_tags.slice(0, 10);
  if (tags.length === 0) return null;
  const max = Math.max(1, ...tags.map(t => t.count));
  return (
    <section style={{ padding: "44px 0" }}>
      <h2 style={ueberschrift}>Häufigste Tags</h2>
      <p style={{ ...unterzeile, marginBottom: 18 }}>Klick sucht im Archiv</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", columnGap: 56 }}>
        {tags.map(t => (
          <Klick key={t.tag} className="ue-zeile" onClick={() => onFilter({ search: t.tag })} title={`Nach „${t.tag}“ suchen`}
            style={{ display: "grid", gridTemplateColumns: "150px 1fr 28px", alignItems: "center", gap: 12, padding: "7px 8px", margin: "0 -8px", fontSize: 13 }}>
            <span style={{ fontWeight: 600, color: C.onSurface, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>#{t.tag}</span>
            <span style={{ height: 6, borderRadius: radius.full, background: C.surfaceContainerHigh, overflow: "hidden" }}>
              <span style={{ display: "block", height: "100%", width: `${(t.count / max) * 100}%`, borderRadius: radius.full, background: C.primary }} />
            </span>
            <span style={{ ...zahl, fontSize: 12, textAlign: "right" }}>{t.count}</span>
          </Klick>
        ))}
      </div>
    </section>
  );
}
