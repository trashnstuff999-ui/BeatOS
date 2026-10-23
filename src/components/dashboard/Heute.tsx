// src/components/dashboard/Heute.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Übersicht → Heute: was ansteht, statt einer Wand aus Zahlen-Karten.
//
// • Eine Aussage oben: wie viele Uploads diese Woche draußen sind und wie
//   viele Beats bis zu den freien Upload-Tagen noch fertig werden müssen.
// • Die Woche als Zeitstrahl (Mo–So) mit den Covern — keine Karte.
// • „Als Nächstes": der eine Beat, dem am wenigsten fehlt. Die einzige Fläche
//   auf der Seite, mit dem Cover verschwommen dahinter wie im Upload-Kopf.
// • Startlöcher als Regal aus Covern, darunter drei ruhige Listen.
// Entwurf: docs/uebersicht-plan.md.
// ═══════════════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Flame, Play, Pause } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { api } from "../../lib/api";
import { C, alpha, radius } from "../../lib/theme";
import { useSettings, parseProductionPaths, kuenstlerOrdner } from "../../contexts/SettingsContext";
import { parseRhythmus, naechsterFreierTag, wochenanfang, addDays, toISO } from "../../lib/planung";
import { woche, alsNaechstes, liegengeblieben, tageAufzaehlen, type TagZelle } from "../../lib/heute";
import { Button, Segmented } from "../ui";
import { useAudioPlayerContext, useAudioProgress } from "../../contexts/AudioPlayerContext";
import type { DashboardActions } from "../../types/stats";
import type { Beat } from "../../types/browse";
import type { ScheduleEntry, QueueBeat } from "../../types/upload";
import type { StudioProject } from "../../types/studio";
import type { ArtistSong } from "../../types/artists";

const bild = (pfad: string) => convertFileSrc(pfad.replace(/\\/g, "/"));
const KURZ = ["SO", "MO", "DI", "MI", "DO", "FR", "SA"];
const LANG = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const datum = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("de-DE", { day: "numeric", month: "long" });
const tagMonat = (iso: string) => `${LANG[new Date(`${iso}T12:00:00`).getDay()]}, ${Number(iso.slice(8, 10))}.`;
const mehrzahl = (n: number, eins: string, viele: string) => (n === 1 ? eins : viele);

const ueberschrift: React.CSSProperties = {
  margin: 0, fontSize: 12, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.08em", color: C.onSurfaceVariant,
};
/** Listenzeile als Knopf: der Hover-Hintergrund ragt 8 px über den Text hinaus. */
function Zeile({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button type="button" className="ue-zeile" onClick={onClick} title={title} style={{
      display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 8px", margin: "0 -8px",
      width: "calc(100% + 16px)", border: 0, borderTop: `1px solid ${C.border10}`, borderRadius: 0,
      font: "inherit", fontSize: 14, color: "inherit", textAlign: "left", cursor: "pointer",
    }}>
      {children}
    </button>
  );
}

export function Heute({ actions, recent, refreshKey }: {
  actions: DashboardActions;
  /** Zuletzt archivierte Beats — für „Diese Woche geschafft". */
  recent: Beat[];
  refreshKey: number;
}) {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const rhythmus = parseRhythmus(settings.uploadDays);

  const [eintraege, setEintraege] = useState<ScheduleEntry[]>([]);
  const [queue, setQueue] = useState<QueueBeat[]>([]);
  const [projekte, setProjekte] = useState<StudioProject[] | null>(null);
  const [songs, setSongs] = useState<{ kuenstler: string; song: ArtistSong }[] | null>(null);
  const [ansicht, setAnsicht] = useState<"diese" | "naechste">("diese");
  const [neuLaden, setNeuLaden] = useState(0);
  const [planen, setPlanen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  /** Zuletzt per „Nicht hochladen" weggeklickt — für „Rückgängig". */
  const [ausgeblendet, setAusgeblendet] = useState<{ id: string; name: string } | null>(null);
  /** In den Startlöchern angeklickt — steht dann oben in „Als Nächstes". */
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const heldRef = useRef<HTMLElement>(null);

  const heute = new Date();
  const montag = wochenanfang(heute);
  const naechsterMontag = addDays(montag, 7);

  // Terminplan und Warteschlange: schnell, aus der Datenbank.
  useEffect(() => {
    let weg = false;
    Promise.all([
      api.upload.getSchedule(toISO(montag), toISO(addDays(naechsterMontag, 6))),
      api.upload.getQueue(),
    ])
      .then(([e, q]) => { if (!weg) { setEintraege(e); setQueue(q); setFehler(null); } })
      .catch(e => { if (!weg) setFehler(String(e)); });
    return () => { weg = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, neuLaden]);

  // Studio und Künstler lesen Ordner — das dauert, also danach und still.
  useEffect(() => {
    let weg = false;
    const pfade = parseProductionPaths(settings.productionPath);
    if (pfade.length) {
      api.studio.scanProjects(pfade).then(p => { if (!weg) setProjekte(p); }).catch(() => { if (!weg) setProjekte([]); });
    } else setProjekte([]);
    api.artists.scan(kuenstlerOrdner(settings))
      .then(s => {
        if (weg) return;
        setSongs(s.kuenstler
          .flatMap(k => k.songs.filter(x => !x.fertig).map(song => ({ kuenstler: k.name, song })))
          .sort((a, b) => b.song.geaendert - a.song.geaendert));
      })
      .catch(() => { if (!weg) setSongs([]); });
    return () => { weg = true; };
  }, [refreshKey, settings.productionPath, settings.artistsPath, settings.archivePath]);

  const diese = woche(montag, rhythmus, eintraege, heute);
  const naechste = woche(naechsterMontag, rhythmus, eintraege, heute);
  const belegt = new Set(eintraege.map(e => e.date));

  const draussen = new Set(diese.flatMap(t => t.beats.filter(b => b.hochgeladen).map(b => b.id))).size;
  const soll = diese.filter(t => t.uploadTag).length;
  const offenDiese = diese.filter(t => t.uploadTag && !t.vorbei && t.beats.length === 0);
  const offenNaechste = naechste.filter(t => t.uploadTag && t.beats.length === 0);
  const naechsteLeer = naechste.every(t => t.beats.length === 0);
  const bereit = queue.filter(q => q.fehlt.length === 0);

  // Aus den Startlöchern angeklickt, sonst der, dem am wenigsten fehlt.
  const held = queue.find(q => q.id === gewaehlt) ?? alsNaechstes(queue);
  const regal = queue.filter(q => q.id !== held?.id);
  const freierTag = naechsterFreierTag(rhythmus, belegt, heute);

  // ── Die eine Aussage ──
  let titel: string;
  let satz: string;
  if (rhythmus.length === 0) {
    titel = "Kein Upload-Rhythmus";
    satz = "Upload-Tage im Upload-Tab unter Planung festlegen";
  } else {
    titel = `Diese Woche: ${draussen} von ${soll} ${mehrzahl(soll, "Upload", "Uploads")} draußen`;
    const offen = offenDiese.length ? offenDiese : offenNaechste;
    const tage = tageAufzaehlen(offen.map(t => t.wochentag));
    satz = [
      offen.length === 0 ? "Alle Upload-Tage belegt"
        : offenDiese.length ? `${tage} noch offen` : `Nächste Woche ${tage} offen`,
      bereit.length === 0 ? "kein Beat bereit"
        : bereit.length === 1 ? `${bereit[0].name} bereit`
        : `${bereit.length} Beats bereit`,
    ].join(" · ");
  }

  const serie = actions.current_streak_weeks;
  const hinweis = rhythmus.length === 0 ? null
    : draussen === 0 && diese.every(t => t.beats.length === 0)
      ? { text: "Serie in Gefahr", gut: false }
      : naechsteLeer
        ? { text: "Nächste Woche nichts geplant", gut: false }
        : { text: "Serie gesichert", gut: true };

  const einplanen = async (tag = freierTag) => {
    if (!held || !tag) return;
    setPlanen(true);
    try {
      await api.upload.scheduleRelease(held.id, tag);
      if (tag >= toISO(naechsterMontag)) setAnsicht("naechste");
      setNeuLaden(k => k + 1);
    } catch (e) { setFehler(String(e)); }
    finally { setPlanen(false); }
  };
  const zumUpload = (beatId: string) => navigate("/upload", { state: { beatId } });
  const aendern = async (schritt: () => Promise<void>) => {
    try { await schritt(); setNeuLaden(k => k + 1); } catch (e) { setFehler(String(e)); }
  };
  const ausblenden = (b: QueueBeat) => aendern(async () => {
    await api.upload.setUploadSkip(b.id, true);
    setAusgeblendet({ id: b.id, name: b.name });
  });
  const zurueckholen = () => ausgeblendet && aendern(async () => {
    await api.upload.setUploadSkip(ausgeblendet.id, false);
    setAusgeblendet(null);
  });
  const terminLoesen = (beatId: string) => aendern(() => api.upload.unscheduleRelease(beatId));

  // ── Diese Woche geschafft ──
  const geschafft = [
    ...diese.flatMap(t => t.beats.filter(b => b.hochgeladen).map(b => ({ key: `u${b.id}`, id: b.id, art: "hoch" as const, name: b.name, wann: LANG[t.wochentag] }))),
    ...recent
      .filter(b => (b.created_date ?? "") >= toISO(montag))
      .map(b => ({ key: `a${b.id}`, id: b.id, art: "archiv" as const, name: b.name, wann: LANG[new Date(`${b.created_date!.slice(0, 10)}T12:00:00`).getDay()] })),
  ];

  const jetzt = Math.floor(Date.now() / 1000);
  const liegen = projekte ? liegengeblieben(projekte, jetzt) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* ── Aussage ── */}
      <section style={{ padding: "24px 0 36px" }}>
        <div style={{ fontSize: 13, color: C.onSecondaryFixedVar, fontWeight: 500, marginBottom: 14 }}>
          {heute.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}
        </div>
        <h1 style={{ margin: 0, fontSize: 40, lineHeight: 1.12, fontWeight: 800, letterSpacing: "-0.02em", color: C.onSurface, maxWidth: 820 }}>
          {titel}
        </h1>
        <p style={{ margin: "14px 0 0", fontSize: 15, lineHeight: 1.5, color: C.onSurfaceVariant, maxWidth: 720 }}>{satz}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 12px",
            borderRadius: radius.full, background: C.surfaceContainerHigh,
            fontSize: 12, fontWeight: 700, color: serie > 0 ? C.primary : C.onSecondaryFixedVar,
          }}>
            <Flame size={13} />
            {serie > 0 ? `${serie} ${mehrzahl(serie, "Woche", "Wochen")} Serie` : "keine Serie"}
          </span>
          {hinweis && (
            <span style={{ fontSize: 13, fontWeight: 600, color: hinweis.gut ? C.mint : C.primary }}>{hinweis.text}</span>
          )}
          {rhythmus.length === 0 && (
            <Button size="sm" variant="secondary" onClick={() => navigate("/upload")}>Zum Upload-Tab</Button>
          )}
          {fehler && <span style={{ fontSize: 12, color: C.error }} title={fehler}>Nicht alles geladen</span>}
        </div>
      </section>

      {/* ── Woche ── */}
      {rhythmus.length > 0 && (
        <section aria-label="Woche" style={{ paddingBottom: 48 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, gap: 12, flexWrap: "wrap" }}>
            <h2 style={ueberschrift}>
              {ansicht === "diese" ? "Diese Woche" : "Nächste Woche"} · {datum(toISO(ansicht === "diese" ? montag : naechsterMontag))} – {datum(toISO(addDays(ansicht === "diese" ? montag : naechsterMontag, 6)))}
            </h2>
            <Segmented
              label="Woche"
              value={ansicht}
              onChange={setAnsicht}
              options={[{ value: "diese", label: "Diese Woche" }, { value: "naechste", label: "Nächste Woche" }]}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 12, borderTop: `1px solid ${C.border10}`, paddingTop: 16 }}>
            {(ansicht === "diese" ? diese : naechste).map(t => (
              <Tag key={t.iso} tag={t} onOpen={zumUpload} planName={held?.name ?? null} onPlan={iso => einplanen(iso)} onLoesen={terminLoesen} />
            ))}
          </div>
        </section>
      )}

      {ausgeblendet && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, fontSize: 13, color: C.onSurfaceVariant }}>
          „{ausgeblendet.name}" ausgeblendet
          <Button size="sm" variant="ghost" onClick={zurueckholen}>Rückgängig</Button>
        </div>
      )}

      {/* ── Als Nächstes ── */}
      {held && (
        <section ref={heldRef} aria-label="Als Nächstes hochladen" style={{ position: "relative", overflow: "hidden", borderRadius: 16, marginBottom: 56, background: C.surfaceContainer }}>
          {held.cover && (
            <>
              <img src={bild(held.cover)} alt="" aria-hidden style={{ position: "absolute", inset: -40, width: "calc(100% + 80px)", height: "calc(100% + 80px)", objectFit: "cover", filter: "blur(48px) saturate(1.2)", opacity: 0.45 }} />
              <div style={{ position: "absolute", inset: 0, background: alpha(C.background, 0.55) }} />
            </>
          )}
          <div style={{ position: "relative", display: "flex", gap: 32, padding: 28, alignItems: "center", flexWrap: "wrap" }}>
            {held.cover
              ? <img src={bild(held.cover)} alt={`Cover ${held.name}`} style={{ width: 200, height: 200, objectFit: "cover", borderRadius: 10, boxShadow: "0 20px 50px rgba(0,0,0,0.5)", flexShrink: 0 }} />
              : <Platzhalter name={held.name} groesse={200} />}
            <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.primary }}>
                Als Nächstes hochladen{held.fehlt.length === 0 && " · alles da"}
              </span>
              <h2 style={{ margin: 0, fontSize: 48, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1, color: C.onSurface, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {held.name}
              </h2>
              <div style={{ fontSize: 14, color: C.onSurfaceVariant }}>
                {[held.key, held.bpm ? `${held.bpm} BPM` : null, held.created_date ? `archiviert am ${datum(held.created_date)}` : null].filter(Boolean).join(" · ")}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
                {["Infos", "Audio", "Cover"].map(w => {
                  const fehlt = held.fehlt.includes(w);
                  return (
                    <span key={w} style={{
                      padding: "5px 11px", borderRadius: radius.full, fontSize: 12, fontWeight: 600,
                      background: alpha(fehlt ? C.primary : C.mint, 0.14), color: fehlt ? C.primary : C.mint,
                    }}>
                      {fehlt ? `fehlt: ${w}` : `✓ ${w}`}
                    </span>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                {freierTag && (
                  <Button variant="primary" loading={planen} onClick={() => einplanen()}>Auf {tagMonat(freierTag)} planen</Button>
                )}
                <Button variant="secondary" onClick={() => zumUpload(held.id)}>Zum Upload</Button>
                <Button variant="ghost" onClick={() => ausblenden(held)} title="Nicht mehr vorschlagen">Nicht hochladen</Button>
              </div>
            </div>
            <Reinhoeren beatId={held.id} name={held.name} cover={held.cover} />
          </div>
        </section>
      )}

      {/* ── Startlöcher ── */}
      {(regal.length > 0 || (actions.studio_by_status.exported ?? 0) > 0) && (
        <section aria-label="In den Startlöchern" style={{ marginBottom: 56 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
            <h2 style={ueberschrift}>In den Startlöchern</h2>
            <span style={{ fontSize: 13, color: C.onSecondaryFixedVar }}>archiviert, noch ohne Termin</span>
          </div>
          {regal.length > 0 && (
            <div style={{ display: "flex", gap: 20, overflowX: "auto", padding: "8px 0", marginTop: -8 }}>
              {/* Scrollt waagerecht und schneidet damit auch oben ab — der Rand
                  oben gibt dem Anheben beim Hover Platz. */}
              {regal.map(q => (
                <button key={q.id} className="ue-hebt" title={`${q.name} oben zeigen`}
                  onClick={() => { setGewaehlt(q.id); heldRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }}
                  style={{ flex: "0 0 150px", background: "none", border: 0, padding: 0, textAlign: "left", color: "inherit", cursor: "pointer", display: "flex", flexDirection: "column", gap: 8 }}>
                  {q.cover
                    ? <img src={bild(q.cover)} alt="" style={{ width: 150, height: 150, objectFit: "cover", borderRadius: 8, display: "block" }} />
                    : <Platzhalter name={q.name} groesse={150} />}
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.onSurface, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{q.name}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: q.fehlt.length ? C.primary : C.mint }}>
                    {q.fehlt.length ? `fehlt: ${q.fehlt.join(", ")}` : "bereit"}
                  </span>
                </button>
              ))}
            </div>
          )}
          {(actions.studio_by_status.exported ?? 0) > 0 && (
            <div style={{ marginTop: 18, fontSize: 13, color: C.onSurfaceVariant }}>
              Im Studio: <strong style={{ color: C.onSurface }}>{actions.studio_by_status.exported} {mehrzahl(actions.studio_by_status.exported, "Projekt", "Projekte")} exportiert</strong>, nicht archiviert ·{" "}
              <Button size="sm" variant="ghost" onClick={() => navigate("/studio")}>Zum Studio</Button>
            </div>
          )}
        </section>
      )}

      {/* ── Drei ruhige Listen ── */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 40 }}>
        <div>
          <h2 style={{ ...ueberschrift, marginBottom: 14 }}>Liegengeblieben</h2>
          {liegen === null && <Leise>Studio wird gelesen …</Leise>}
          {liegen?.length === 0 && <Leise>Nichts liegengeblieben</Leise>}
          {liegen?.slice(0, 3).map(p => (
            <Zeile key={p.path} onClick={() => p.newest_flp && openPath(p.newest_flp)} title={p.newest_flp ? "In FL Studio öffnen" : "Keine FLP gefunden"}>
              <span style={{ fontWeight: 600, color: C.onSurface, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.song_name ?? p.parsed_name ?? p.name}</span>
              <span style={{ color: C.onSecondaryFixedVar, whiteSpace: "nowrap" }}>seit {Math.floor((jetzt - p.modified_secs) / 86400)} Tagen</span>
            </Zeile>
          ))}
          {liegen && liegen.length > 3 && <Leise>+ {liegen.length - 3} weitere</Leise>}
        </div>

        <div>
          <h2 style={{ ...ueberschrift, marginBottom: 14 }}>Künstler · offen</h2>
          {songs === null && <Leise>Künstler werden gelesen …</Leise>}
          {songs?.length === 0 && <Leise>Alles abgegeben</Leise>}
          {songs?.slice(0, 3).map(({ kuenstler, song }) => (
            <Zeile key={song.path} onClick={() => navigate("/studio", { state: { tab: "artists" } })} title="Im Studio öffnen">
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <span style={{ color: C.onSecondaryFixedVar }}>{kuenstler} · </span>
                <span style={{ fontWeight: 600, color: C.onSurface }}>{song.name}</span>
              </span>
              <span style={{ color: song.warten ? C.onSecondaryFixedVar : C.primary, whiteSpace: "nowrap" }}>
                {song.warten ? "wartet auf Künstler" : song.master ? "nicht abgegeben" : "Master fehlt"}
              </span>
            </Zeile>
          ))}
          {songs && songs.length > 3 && <Leise>+ {songs.length - 3} weitere</Leise>}
        </div>

        <div>
          <h2 style={{ ...ueberschrift, marginBottom: 14 }}>Diese Woche geschafft</h2>
          {geschafft.length === 0 && <Leise>Noch nichts</Leise>}
          {geschafft.map(g => (
            <Zeile key={g.key} onClick={() => zumUpload(g.id)} title="Im Upload öffnen">
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <span style={{ color: g.art === "hoch" ? C.mint : C.primary }}>{g.art === "hoch" ? "↑ " : "+ "}</span>
                <span style={{ fontWeight: 600, color: C.onSurface }}>{g.name}</span>
              </span>
              <span style={{ color: C.onSecondaryFixedVar, whiteSpace: "nowrap" }}>{g.art === "hoch" ? "hochgeladen" : "archiviert"} · {g.wann}</span>
            </Zeile>
          ))}
        </div>
      </section>
    </div>
  );
}

function Tag({ tag, onOpen, planName, onPlan, onLoesen }: {
  tag: TagZelle;
  onOpen: (beatId: string) => void;
  /** Der Beat aus „Als Nächstes" — ein freier Upload-Tag plant ihn per Klick ein. */
  planName: string | null;
  onPlan: (iso: string) => void;
  /** Termin des Beats lösen — zurück in die Warteschlange. */
  onLoesen: (beatId: string) => void;
}) {
  const beat = tag.beats[0];
  const quadrat: React.CSSProperties = {
    aspectRatio: "1", borderRadius: 8, boxSizing: "border-box", display: "flex",
    alignItems: "center", justifyContent: "center", textAlign: "center", padding: 8,
    fontSize: 12, fontWeight: 600,
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <div style={{
        fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
        color: tag.heute ? C.primary : tag.uploadTag ? C.onSurface : C.onSecondaryFixedVar,
      }}>
        {KURZ[tag.wochentag]} <span style={{ fontWeight: 500, color: C.onSecondaryFixedVar }}>{Number(tag.iso.slice(8, 10))}.</span>
      </div>
      {beat ? (<>
        <button className="ue-hebt" onClick={() => onOpen(beat.id)} title="Im Upload öffnen"
          style={{ background: "none", border: 0, padding: 0, textAlign: "left", color: "inherit", cursor: "pointer", display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          {beat.cover
            ? <img src={bild(beat.cover)} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8, display: "block" }} />
            : <Platzhalter name={beat.name} />}
          <span style={{ fontSize: 12, fontWeight: 700, color: C.onSurface, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {beat.name}{tag.beats.length > 1 && ` +${tag.beats.length - 1}`}
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: beat.hochgeladen ? C.mint : C.primary }}>
            {beat.hochgeladen ? "✓ hochgeladen" : "geplant"}
          </span>
        </button>
        {!beat.hochgeladen && !tag.vorbei && (
          <Button size="sm" variant="ghost" onClick={() => onLoesen(beat.id)} title="Termin entfernen">Termin lösen</Button>
        )}
      </>) : tag.uploadTag && !tag.vorbei && planName ? (
        <button className="ue-hell" onClick={() => onPlan(tag.iso)} title={`${planName} hier planen`} style={{
          ...quadrat, width: "100%", cursor: "pointer", font: "inherit", fontSize: 12, fontWeight: 600,
          border: `1.5px dashed ${alpha(C.primary, 0.55)}`, color: C.primary, background: alpha(C.primary, 0.05),
        }}>
          Upload-Tag · frei
        </button>
      ) : tag.uploadTag ? (
        <div style={{
          ...quadrat,
          ...(tag.vorbei
            ? { border: `1px solid ${C.border10}`, color: C.onSecondaryFixedVar }
            : { border: `1.5px dashed ${alpha(C.primary, 0.55)}`, color: C.primary, background: alpha(C.primary, 0.05) }),
        }}>
          {tag.vorbei ? "kein Upload" : "Upload-Tag · frei"}
        </div>
      ) : (
        <div style={quadrat}>
          <span style={{ width: 4, height: 4, borderRadius: "50%", background: C.surfaceContainerHighest }} />
        </div>
      )}
    </div>
  );
}

/** Kein Cover: gestrichelte Fläche mit den Anfangsbuchstaben. */
function Platzhalter({ name, groesse }: { name: string; groesse?: number }) {
  return (
    <div style={{
      width: groesse ?? "100%", height: groesse, aspectRatio: groesse ? undefined : "1",
      flexShrink: 0, borderRadius: 8, border: `1px dashed ${C.outlineVariant}`, boxSizing: "border-box",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: groesse && groesse > 160 ? 44 : 28, fontWeight: 800, color: C.onSecondaryFixedVar,
    }}>
      {name.split(/\s+/).map(w => w[0]).join("").slice(0, 2)}
    </div>
  );
}

function Leise({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "12px 0", borderTop: `1px solid ${C.border10}`, fontSize: 13, color: C.onSecondaryFixedVar }}>{children}</div>;
}

/** Reinhören in „Als Nächstes": Play und Zeitleiste auf Glas, wie die Kachel.
 *  Spielt über den App-Player — derselbe Beat läuft unten in der Leiste mit,
 *  und es spielen nie zwei gleichzeitig. Eigene Komponente, weil der
 *  Fortschritt zehnmal pro Sekunde tickt: so rendert nur sie neu. */
function Reinhoeren({ beatId, name, cover }: { beatId: string; name: string; cover: string | null }) {
  const { currentBeat, isPlaying, isLoading, togglePlay, playBeat, seekPercent } = useAudioPlayerContext();
  const { progress, currentTimeFormatted, durationFormatted } = useAudioProgress();
  const [fehlt, setFehlt] = useState(false);
  const aktiv = currentBeat?.id === beatId;
  const laeuft = aktiv && isPlaying;

  const starten = async () => {
    if (aktiv) { togglePlay(); return; }
    const beat = await api.beats.getById(beatId).catch(() => null);
    if (!beat) { setFehlt(true); return; }
    playBeat(beat, cover ? bild(cover) : null);
  };
  const springen = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!aktiv) { starten(); return; }
    const r = e.currentTarget.getBoundingClientRect();
    seekPercent(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)));
  };

  return (
    <div style={{
      flex: "0 1 340px", minWidth: 260, alignSelf: "center", boxSizing: "border-box",
      display: "flex", alignItems: "center", gap: 18, padding: "18px 20px", borderRadius: 14,
      background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)",
      backdropFilter: "blur(12px)",
    }}>
      <button type="button" className="ue-hebt" onClick={starten} disabled={fehlt}
        aria-label={laeuft ? `${name} anhalten` : `${name} abspielen`}
        title={fehlt ? "Beat nicht gefunden" : laeuft ? "Anhalten" : "Reinhören"}
        style={{
          width: 56, height: 56, flexShrink: 0, borderRadius: "50%", border: 0, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: C.primary, color: C.onPrimary, boxShadow: `0 8px 24px ${alpha(C.primary, 0.35)}`,
          opacity: aktiv && isLoading ? 0.6 : 1,
        }}>
        {laeuft ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" style={{ marginLeft: 3 }} />}
      </button>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.onSurfaceVariant }}>
          {fehlt ? "Keine Audiodatei" : laeuft ? "Läuft" : aktiv ? "Pausiert" : "Reinhören"}
        </span>
        <div onClick={springen} role="presentation" title="Springen" style={{ padding: "6px 0", cursor: "pointer" }}>
          <div style={{ height: 4, borderRadius: radius.full, background: "rgba(255,255,255,0.14)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${aktiv ? progress : 0}%`, background: C.primary, borderRadius: radius.full, transition: "width 0.1s linear" }} />
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontFamily: "monospace", color: C.onSecondaryFixedVar }}>
          <span>{aktiv ? currentTimeFormatted : "0:00"}</span>
          <span>{aktiv ? durationFormatted : "–:––"}</span>
        </div>
      </div>
    </div>
  );
}
