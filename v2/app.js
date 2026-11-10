// 新版啟動：選單、路由 → 分頁、表格排序、搜尋框、詳細頁分頁切換、盤中即時價（詳細頁上半部）。
"use strict";

const app = document.getElementById("app");
const state = { base: null, index: null, candles: {}, details: {}, live: null, stocks: {},
                sort: { rank: { key: "ret.ytd", dir: -1 }, stock: { key: "w", dir: -1 }, tag: { key: "ret.ytd", dir: -1 }, hold: { key: "w", dir: -1 }, div: { key: "yield", dir: -1 } },
                range: "m3", chartMode: "kline", site: {}, passive: false, div: { f: { kind: "high", freq: "" }, ym: null }, tab: "ops", hview: "stocks", filter: null, chart: null, cols: {} };
// 即時：和舊版同一個轉接站、同樣頻率（web/app.js）；本機開發用本機轉接站
const LIVE_URL = ["localhost", "127.0.0.1"].includes(location.hostname) ? "http://127.0.0.1:8787" : "https://etf-live.peacepisceslamb.workers.dev";
const LIVE_EVERY_MS = 20000;

document.getElementById("nav").innerHTML = Router.NAV.map(([k, l]) => `<a href="#/${k}" data-route="${k}">${l}</a>`).join("");

async function loadIndex() {
  if (!state.index) state.index = await Core.loadJson("v2/search.json");
  return state.index;
}
// 404（剛上市、還沒產生）→ 記住「沒有」；網路錯誤 → 丟出去顯示讀取失敗，下次再讀
async function loadOr(cache, key, path, empty) {
  if (!(key in cache)) {
    try { cache[key] = await Core.loadJson(path); }
    catch (err) {
      if (!Core.isNotFound(err)) throw err;
      cache[key] = empty;
    }
  }
  return cache[key];
}
const loadSite = name => loadOr(state.site, name, `v2/${name}`, null);
// localStorage 在隱私模式、預覽可能丟錯：包起來，壞掉就當空的
function storage() { try { return window.localStorage; } catch { return { getItem: () => null, setItem() { throw new Error("no storage"); } }; } }
const loadCandles = code => loadOr(state.candles, code, `v2/candles/${encodeURIComponent(code)}.json`, { rows: [] });
const loadDetail = code => loadOr(state.details, code, `v2/etf/${encodeURIComponent(code)}.json`, null);

// 收盤資料＋即時資料（即時比收盤新才覆蓋）
function current() {
  return { ...state.base, etfs: Live.mergeOverview(state.base, state.live) };
}

let renderSeq = 0, shownCode = null;
async function render() {
  const seq = ++renderSeq;
  const { route, args, params } = Router.parse(location.hash);
  document.querySelectorAll("#nav a").forEach(a => a.setAttribute("aria-current", a.dataset.route === route ? "page" : "false"));
  try {
    if (!state.base) state.base = await Core.loadJson("overview.json");
    const o = current();
    let html, draw = null;
    if (route === "rank") html = Pages.rank(o, state.sort.rank);
    else if (route === "holdings") html = Pages.holdings();
    else if (route === "active") html = Pages.active();
    else if (route === "dividend") html = Div.page(await loadSite("dividends.json"), { ...state.div, sort: state.sort.div }, storage());
    else if (route === "tools") html = Pages.tools();
    else if (route === "tag") html = Pages.tag(o, args[0] || "", args[1] || "", state.sort.tag);
    else if (route === "etf") {
      const code = args[0] || "";
      if (code !== shownCode) {   // 換一檔：清掉篩選；網址可以帶 ?tab=holdings&chart=ret&view=industry（分享連結用）
        shownCode = code; state.filter = null;
        if (params.get("tab")) state.tab = params.get("tab");
        if (params.get("chart")) state.chartMode = params.get("chart");
        if (params.get("view")) state.hview = params.get("view");
      }
      const needBase = state.chartMode === "ret" || (state.tab === "holdings" && state.hview === "industry");
      const [d, candles, d0050] = await Promise.all([loadDetail(code),
        state.chartMode === "kline" ? loadCandles(code) : null, needBase ? loadDetail("0050") : null]);
      if (state.tab === "holdings" && d && d.holdings && !(code in state.stocks)) refreshStocks(code).then(updateHoldings);
      html = Pages.etf(o, code, { d: withLive(code, d), candles, d0050, range: state.range, chart: state.chartMode, tab: state.tab,
                                  hview: state.hview, filter: state.filter, hsort: state.sort.hold });
      draw = () => {
        const legend = document.getElementById("legend");
        const k = document.getElementById("kline"), r = document.getElementById("returns");
        const out = [];
        if (k && candles) out.push(Chart.drawKline(k, legend, candles.rows, state.range));
        if (r && d) out.push(Chart.drawReturns(r, legend, d.tri, d0050 && d0050.tri, state.range, code));
        const pb = document.getElementById("prem-bars");
        if (pb && d) out.push(Chart.drawPremium(pb, document.getElementById("prem-lines"), document.getElementById("prem-legend"), d.premium));
        return { destroy() { out.forEach(c => c.destroy()); } };
      };
    }
    else if (route === "stock") html = Pages.stock(o, await loadIndex(), args[0] || "", state.sort.stock);
    else {
      const [radar, events, flows] = await Promise.all(["radar.json", "events.json", "flows.json"].map(n => loadSite(n)));
      html = Today.page(o, { radar, events, flows }, { watch: Today.loadWatch(storage()), passive: state.passive });
    }
    if (seq !== renderSeq) return;
    if (state.chart) { state.chart.destroy(); state.chart = null; }
    app.innerHTML = html;
    if (draw) state.chart = draw();
  } catch (err) {
    if (seq === renderSeq) app.innerHTML = `<p class="empty error">資料讀取失敗，請稍後重新整理</p><p class="note">${Core.esc(err.message)}</p>`;
  }
}

// 表頭排序、點列進詳細頁、K 線期間、圖表切換、詳細頁分頁、操作日報篩選、成分股／產業切換
app.addEventListener("click", ev => {
  const th = ev.target.closest("th[data-sort]");
  if (th) {
    const s = state.sort[th.dataset.table];
    if (s.key === th.dataset.sort) s.dir = -s.dir;
    else { s.key = th.dataset.sort; s.dir = th.classList.contains("r") ? -1 : 1; }   // 數字欄先大到小、文字欄先小到大
    render();
    return;
  }
  const b = ev.target.closest("button[data-range],button[data-chart],button[data-tab],button[data-filter],button[data-hview]");
  if (b) {
    const ds = b.dataset;
    if (ds.range) state.range = ds.range;
    if (ds.chart) state.chartMode = ds.chart;
    if (ds.tab) state.tab = ds.tab;
    if (ds.hview) state.hview = ds.hview;
    if (ds.filter) state.filter = state.filter === ds.filter ? null : ds.filter;   // 再點一次取消
    render();
    return;
  }
  const dv = ev.target.closest("button[data-dkind],button[data-dfreq],button[data-cal],button[data-pf-del]");
  if (dv) {
    const ds = dv.dataset;
    if (ds.dkind) state.div.f.kind = ds.dkind;
    if (ds.dfreq !== undefined) state.div.f.freq = ds.dfreq;
    if (ds.cal) {
      const base = state.div.ym || (state.site["dividends.json"] || {}).today?.slice(0, 7) || new Date().toISOString().slice(0, 7);
      const [y, m] = base.split("-").map(Number), t = new Date(Date.UTC(y, m - 1 + Number(ds.cal), 1));
      state.div.ym = t.toISOString().slice(0, 7);
    }
    if (ds.pfDel) { const pf = Div.loadPf(storage()); delete pf[ds.pfDel]; Div.savePf(storage(), pf); }
    render();
    return;
  }
  const un = ev.target.closest("button[data-unwatch]");
  if (un) { ev.preventDefault(); Today.saveWatch(storage(), Today.loadWatch(storage()).filter(c => c !== un.dataset.unwatch)); render(); return; }
  const tr = ev.target.closest("tr[data-href]");
  if (tr) location.hash = tr.dataset.href;
});
app.addEventListener("change", ev => {
  if (ev.target.matches("input[data-passive]")) { state.passive = ev.target.checked; render(); }
  if (ev.target.matches("input[data-pf]")) {   // 組合勾選：預設 1 張
    const pf = Div.loadPf(storage()), c = ev.target.dataset.pf;
    if (ev.target.checked) pf[c] = pf[c] || 1; else delete pf[c];
    Div.savePf(storage(), pf); render();
  }
  if (ev.target.matches("input[data-pf-lots]")) {
    const pf = Div.loadPf(storage());
    pf[ev.target.dataset.pfLots] = Math.max(0, Math.floor(Number(ev.target.value) || 0));
    Div.savePf(storage(), pf); render();
  }
});
app.addEventListener("submit", ev => {
  const f = ev.target.closest("form[data-watch-form]");
  if (!f) return;
  ev.preventDefault();
  const code = (f.code.value || "").trim().toUpperCase();
  if (!state.base.etfs.some(e => e.code === code)) { f.code.value = ""; f.code.placeholder = `找不到 ${code}`; return; }
  const list = Today.loadWatch(storage());
  if (!list.includes(code)) Today.saveWatch(storage(), list.concat(code));
  render();
});

// ---------- 成分股即時報價（轉接站 /stocks，每 60 檔一組；同舊版） ----------
function withLive(code, d) {
  const s = state.stocks[code];
  if (!d || !d.holdings || !s) return d;
  const closed = !Live.isMarketOpen(new Date());
  return { ...d, holdings: { ...d.holdings, rows: Detail.liveRows(d.holdings.rows, s, state.base.price_date, closed) } };
}
async function refreshStocks(code) {
  const d = state.details[code];
  if (!d || !d.holdings) return;
  const merged = { date: null, quotes: {} };
  try {
    for (const batch of Live.stockBatches(d.holdings.rows)) {
      const r = await fetch(`${LIVE_URL}/stocks?s=${batch}`, { cache: "no-cache" });
      if (!r.ok) return;
      const j = await r.json();
      merged.date = j.date || merged.date;
      Object.assign(merged.quotes, j.quotes);
    }
  } catch (err) { return; }
  state.stocks[code] = merged;
}
// 只重畫成分股分頁的內容（上面的圖表不動）
function updateHoldings() {
  const body = document.querySelector(".tab-body");
  if (!body || state.tab !== "holdings" || !shownCode) return;
  body.innerHTML = Detail.holdings(withLive(shownCode, state.details[shownCode]), state.hview, state.sort.hold, state.details["0050"]);
}

// ---------- 盤中即時（只更新詳細頁上半部的價格，不重畫整頁，圖表的縮放不會被打斷） ----------
let polledOnce = false;
async function pollLive() {
  if (document.hidden || (polledOnce && !Live.isLiveWindow(new Date()))) return;
  polledOnce = true;
  try {
    const r = await fetch(`${LIVE_URL}/etf`, { cache: "no-cache" });
    if (!r.ok) return;
    state.live = await r.json();
  } catch (err) { return; }
  if (state.base && Router.parse(location.hash).route === "today" && Live.isNewer(state.live, state.base.price_date)) { render(); return; }
  if (!state.base || !shownCode || !Live.isNewer(state.live, state.base.price_date)) return;
  const e = current().etfs.find(x => x.code === shownCode);
  const px = document.getElementById("live-px"), chg = document.getElementById("live-chg"), asof = document.getElementById("live-asof");
  if (!e || !px) return;
  px.textContent = Core.num(e.price);
  chg.innerHTML = Core.pct(e.chg_pct);
  const d1 = document.getElementById("live-d1");
  if (d1) d1.innerHTML = Core.pct(e.chg_pct);
  asof.innerHTML = `<span class="live-tag">即時 ${Core.esc(state.live.time || "")}</span>`;
  if (state.tab === "holdings") { await refreshStocks(shownCode); updateHoldings(); }
}
setInterval(pollLive, LIVE_EVERY_MS);
pollLive();

// ---------- 搜尋框 ----------
const q = document.getElementById("q"), box = document.getElementById("suggest");
let hits = [], cursor = 0;
function showSuggest() {
  const r = Search.match(state.index, q.value);
  hits = [...r.etfs.map(e => ({ href: `#/etf/${encodeURIComponent(e.c)}`, main: `${Core.esc(e.n)}<span class="code">${Core.esc(e.c)}</span>`, sub: `${Core.esc(e.m)}・${Core.esc(e.t)}` })),
          ...r.stocks.map(s => ({ href: `#/stock/${encodeURIComponent(s.s)}`, main: `${Core.esc(s.n || s.s)}<span class="code">${Core.esc(s.s)}</span>`, sub: `被 ${s.count} 檔 ETF 持有` }))];
  cursor = 0;
  if (!q.value.trim()) { box.hidden = true; return; }
  const item = (h, i) => `<a href="${h.href}" class="${i === cursor ? "on" : ""}"><span>${h.main}</span><span class="sub">${h.sub}</span></a>`;
  const ne = r.etfs.length;
  box.innerHTML = (ne ? `<h4>ETF</h4>${hits.slice(0, ne).map(item).join("")}` : "") +
    (r.stocks.length ? `<h4>個股（點了看哪些 ETF 持有）</h4>${hits.slice(ne).map((h, i) => item(h, i + ne)).join("")}` : "") +
    (hits.length ? "" : '<div class="none">找不到符合的 ETF 或個股</div>');
  box.hidden = false;
}
function closeSuggest() { box.hidden = true; }
q.addEventListener("focus", () => { loadIndex().then(showSuggest, () => { box.innerHTML = '<div class="none">搜尋資料讀取失敗</div>'; box.hidden = false; }); });
// 注音、拼音選字中（isComposing）不更新，選完字（compositionend）再搜尋
q.addEventListener("input", ev => { if (!ev.isComposing && state.index) showSuggest(); });
q.addEventListener("compositionend", () => { if (state.index) showSuggest(); });
q.addEventListener("keydown", ev => {
  if (Search.composing(ev) || box.hidden) return;
  if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
    ev.preventDefault();
    cursor = (cursor + (ev.key === "ArrowDown" ? 1 : -1) + hits.length) % Math.max(hits.length, 1);
    box.querySelectorAll("a").forEach((a, i) => a.classList.toggle("on", i === cursor));
  } else if (ev.key === "Enter" && hits[cursor]) {
    location.hash = hits[cursor].href; q.value = ""; closeSuggest(); q.blur();
  } else if (ev.key === "Escape") closeSuggest();
});
box.addEventListener("click", ev => { if (ev.target.closest("a")) { q.value = ""; closeSuggest(); } });
document.addEventListener("click", ev => { if (!ev.target.closest(".search")) closeSuggest(); });

window.addEventListener("hashchange", () => { render().then(() => window.scrollTo(0, 0)); });
render();
