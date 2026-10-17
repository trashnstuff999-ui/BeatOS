// Screenshot des Upload-Tabs über das DevTools-Protokoll der WebView2.
// node shot.js <ausgabe.jpg> [beatId]
const [, , ausgabe, port, beatArg] = process.argv;
let beatId = beatArg;
const fs = require("fs");
const warte = ms => new Promise(r => setTimeout(r, ms));

async function seite() {
  for (let i = 0; i < 600; i++) {
    try {
      const liste = await (await fetch("http://127.0.0.1:9222/json/list")).json();
      const p = liste.find(x => x.type === "page" && x.url.includes(`localhost:${port}`));
      if (p) return p.webSocketDebuggerUrl;
    } catch {}
    await warte(1000);
  }
  throw new Error("keine WebView gefunden");
}

(async () => {
  const ws = new WebSocket(await seite());
  await new Promise(r => ws.addEventListener("open", r, { once: true }));
  let id = 0; const offen = new Map();
  ws.addEventListener("message", e => {
    const m = JSON.parse(e.data);
    if (m.id && offen.has(m.id)) { offen.get(m.id)(m); offen.delete(m.id); }
  });
  const cdp = (method, params = {}) => new Promise(r => { const i = ++id; offen.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const js = async expr => (await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

  await warte(4000);
  if (!beatId) {
    // Den Beat mit den meisten Daten nehmen: dann zeigt jede Karte etwas.
    beatId = await js(`(async () => {
      const inv = window.__TAURI_INTERNALS__.invoke;
      const beats = await inv("get_beats", { search: null, onlyFavs: false, limit: 400, offset: 0 });
      let best = null, bestScore = -1;
      for (const b of beats.filter(b => b.path)) {
        let d; try { d = await inv("get_upload_data", { beatId: b.id }); } catch { continue; }
        const a = d.assets, t = d.beat;
        const s = (a.cover ? 3 : 0) + (a.thumbnail ? 2 : 0) + (a.video ? 1 : 0) + (a.mp3 ? 1 : 0) + (a.wav ? 1 : 0)
          + (t.timecodes ? 3 : 0) + (t.type_beat_main ? 2 : 0) + (t.genre_tags ? 1 : 0)
          + d.uploads.filter(u => u.status !== "draft").length + (d.uploads.some(u => u.status === "draft") ? 1 : 0);
        if (s > bestScore) { bestScore = s; best = b.id; }
      }
      return best;
    })()`);
    console.log("ausgewählt:", beatId);
  }
  const gemerkt = await js(`localStorage.getItem("beatos.upload.letzterBeat")`);
  console.log("letzter Beat:", gemerkt);
  if (beatId) await js(`localStorage.setItem("beatos.upload.letzterBeat", ${JSON.stringify(beatId)})`);

  const B = 1600;
  await cdp("Emulation.setDeviceMetricsOverride", { width: B, height: 1000, deviceScaleFactor: 1, mobile: false });
  await js(`location.href = "/upload"`);
  await warte(9000);
  // Die Seite scrollt in einem inneren Container — so hoch machen, dass alles
  // ohne Scrollen sichtbar ist.
  const hoehe = await js(`Math.max(...[...document.querySelectorAll("*")].map(e => e.scrollHeight - e.clientHeight)) + window.innerHeight`);
  await cdp("Emulation.setDeviceMetricsOverride", { width: B, height: Math.min(hoehe + 40, 6000), deviceScaleFactor: 1, mobile: false });
  await warte(3000);
  const bild = await cdp("Page.captureScreenshot", { format: "jpeg", quality: 88 });
  fs.writeFileSync(ausgabe, Buffer.from(bild.result.data, "base64"));
  console.log("gespeichert:", ausgabe, B, "x", Math.min(hoehe + 40, 6000));
  ws.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
