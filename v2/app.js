// 新版啟動：選單、路由 → 分頁、表格排序、搜尋框、詳細頁分頁切換、盤中即時價（詳細頁上半部）。
"use strict";

const app = document.getElementById("app");
const state = { base: null, index: null, candles: {}, details: {}, live: null, stocks: {},
                sort: { rank: { key: "ret", dir: -1 }, tools: { key: "ret", dir: -1 }, stock: { key: "w", dir: -1 }, tag: { key: "ret.ytd", dir: -1 }, hold: { key: "w", dir: -1 }, div: { key: "yield", dir: -1 }, act: { key: "v", dir: -1 }, radar: { key: "buy", dir: -1 } },
                range: "m3", chartMode: "kline", site: {}, passive: false, div: { f: { kind: "all", freq: "" }, ym: null }, act: { period: "y1", sel: [], issuer: null }, track: { tab: "radar", q: "", mode: "all", osel: [] }, rk: { period: "ytd", chips: [] }, tools: { crit: {}, cmp: [] }, tab: "ops", hview: "stocks", filter: null, chart: null, cols: {}, etfNav: null };
// 即時：和舊版同一個轉接站、同樣頻率（web/app.js）；本機開發用本機轉接站
const LIVE_URL = ["localhost", "127.0.0.1"].includes(location.hostname) ? "http://127.0.0.1:8787" : "https://etf-live.peacepisceslamb.workers.dev";
const LIVE_EVERY_MS = 20000;

// 配色選單：換了就存起來、重畫（圖表顏色要重新讀）
const skinEl = document.getElementById("skin");
skinEl.innerHTML = Theme.options(Theme.saved());
skinEl.addEventListener("change", () => { Theme.apply(skinEl.value); Theme.save(skinEl.value); syncCodePicker(); render(); });
// 代號顏色調色盤：拖動時畫面立刻跟著變（只換 css 變數，不用重畫）；↺ 還原成配色預設的金色
const codeEl = document.getElementById("codeColor"), codeReset = document.getElementById("codeReset");
function syncCodePicker() {
  const custom = Theme.savedCode();
  const cur = custom || getComputedStyle(document.documentElement).getPropertyValue("--code").trim();
  if (Theme.isHex(cur)) codeEl.value = cur;
  codeReset.hidden = !custom;
}
codeEl.addEventListener("input", () => { Theme.applyCode(codeEl.value); Theme.saveCode(codeEl.value); codeReset.hidden = false; });
codeReset.addEventListener("click", () => { Theme.applyCode(null); Theme.saveCode(null); syncCodePicker(); });
syncCodePicker();
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
    if (route === "rank") {
      const [flows, fees] = await Promise.all([loadSite("flows.json"), loadSite("fees.json")]);
      html = Rank.page(o, flows, fees, { ...state.rk, sort: state.sort.rank });
    }
    else if (route === "holdings") {
      if (params.get("tab") && seq === 1) state.track.tab = params.get("tab");
      if (params.get("q") && !state.track.q) state.track.q = params.get("q");
      if (params.get("etfs") && !state.track.osel.length) state.track.osel = params.get("etfs").split(",").slice(0, 6);
      const [radar, index] = await Promise.all([loadSite("radar.json"), loadIndex()]);
      const details = {};
      if (state.track.tab === "overlap") for (const c of state.track.osel) details[c] = await loadDetail(c);
      html = Track.page(radar, index, { ...state.track, passive: state.passive, sort: state.sort.radar }, details);
    }
    else if (route === "active") {
      const [adata, radar] = await Promise.all([loadSite("active.json"), loadSite("radar.json")]);
      if (params.get("sel") && !state.act.sel.length) state.act.sel = params.get("sel").split(",").slice(0, Act.MAX);   // 分享連結用
      html = Act.page(adata, radar, { ...state.act, sort: state.sort.act, range: state.range });
      draw = () => {
        const el = document.getElementById("achart");
        if (!el || !adata) return null;
        const names = new Map(adata.etfs.map(e => [e.code, e.name]));
        return Chart.drawMulti(el, document.getElementById("alegend"),
          state.act.sel.map(c => ({ code: c, name: names.get(c), tri: adata.tri[c] })), adata.tri["0050"], state.range);
      };
    }
    else if (route === "dividend") html = Div.page(await loadSite("dividends.json"), { ...state.div, sort: state.sort.div }, storage(),
      Object.fromEntries(o.etfs.map(e => [e.code, e.price])));
    else if (route === "tools") {
      const [flows, fees] = await Promise.all([loadSite("flows.json"), loadSite("fees.json")]);
      const cmp = state.tools.cmp;
      const ds = cmp.length ? await Promise.all(cmp.concat("0050").map(loadDetail)) : [];
      html = Tools.page(o, Rank.rows(o, flows, fees, "y1"), { ...state.tools, sort: state.sort.tools, range: state.range });
      draw = () => {
        const el = document.getElementById("tchart");
        if (!el) return null;
        return Chart.drawMulti(el, document.getElementById("tlegend"),
          cmp.map((c, i) => ({ code: c, tri: ds[i] ? ds[i].tri : [] })), ds[cmp.length] ? ds[cmp.length].tri : [], state.range);
      };
    }
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
      html = navRow(o, code) + html;
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
    if (draw) state.chart = draw() || null;
  } catch (err) {
    if (seq === renderSeq) app.innerHTML = `<p class="empty error">資料讀取失敗，請稍後重新整理</p><p class="note">${Core.esc(err.message)}</p>`;
  }
}

// 從哪一頁點進 ETF：記住那一頁的 ETF 順序和網址，詳細頁才有上一檔／下一檔／返回（舊版有）
document.addEventListener("click", ev => {
  const link = ev.target.closest("a[href^='#/etf/'], tr[data-href^='#/etf/']");
  if (!link || Router.parse(location.hash).route === "etf") return;
  const hrefs = [...document.querySelectorAll("#app a[href], #app [data-href]")].map(x => x.getAttribute("href") || x.dataset.href);
  state.etfNav = { codes: Router.etfCodes(hrefs), back: location.hash || "#/today" };
}, true);
function navRow(o, code) {
  let codes = state.etfNav ? state.etfNav.codes : [];
  if (!codes.includes(code)) codes = o.etfs.map(e => e.code);   // 直接開網址、從搜尋進來：用全部 ETF 的順序
  const [prev, next] = Router.neighbors(codes, code);
  const name = c => { const e = o.etfs.find(x => x.code === c); return Core.esc(e ? e.name : c); };
  const href = c => `#/etf/${encodeURIComponent(c)}`;
  return `<div class="nav-row"><a href="${Core.esc(state.etfNav ? state.etfNav.back : "#/today")}">← 返回</a><span>` +
    (prev ? `<a href="${href(prev)}" title="${name(prev)}">← 上一檔</a> ` : "") +
    (next ? `<a href="${href(next)}" title="${name(next)}">下一檔 →</a>` : "") + "</span></div>";
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
  const rk = ev.target.closest("button[data-rind],button[data-rper],button[data-rchip],button[data-cmp-del]");
  if (rk) {
    const ds = rk.dataset;
    if (ds.rind) state.sort.rank = { key: ds.rind, dir: ds.rind === "fee" ? 1 : -1 };   // 費用由低到高
    if (ds.rper) state.rk.period = ds.rper;
    if (ds.rchip) state.rk.chips = state.rk.chips.includes(ds.rchip) ? state.rk.chips.filter(c => c !== ds.rchip) : state.rk.chips.concat(ds.rchip);
    if (ds.cmpDel) state.tools.cmp = state.tools.cmp.filter(c => c !== ds.cmpDel);
    render();
    return;
  }
  const tk = ev.target.closest("button[data-ttab],button[data-mmode],button[data-ov-del]");
  if (tk) {
    if (tk.dataset.ttab) state.track.tab = tk.dataset.ttab;
    if (tk.dataset.mmode) state.track.mode = tk.dataset.mmode;
    if (tk.dataset.ovDel) state.track.osel = state.track.osel.filter(c => c !== tk.dataset.ovDel);
    render();
    return;
  }
  const ap = ev.target.closest("button[data-aperiod],tr[data-aissuer]");
  if (ap) {
    if (ap.dataset.aperiod) state.act.period = ap.dataset.aperiod;
    if (ap.dataset.aissuer !== undefined) state.act.issuer = state.act.issuer === ap.dataset.aissuer ? null : ap.dataset.aissuer;
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
  if (ev.target.closest("button[data-pf-toggle]")) { state.div.pfOpen = !state.div.pfOpen; render(); return; }
  const un = ev.target.closest("button[data-unwatch]");
  if (un) { ev.preventDefault(); Today.saveWatch(storage(), Today.loadWatch(storage()).filter(c => c !== un.dataset.unwatch)); render(); return; }
  if (ev.target.closest("a[data-aclear]")) { ev.preventDefault(); state.act.sel = []; render(); return; }
  const tr = ev.target.closest("tr[data-href]");
  if (tr) location.hash = tr.dataset.href;
});
app.addEventListener("change", ev => {
  if (ev.target.matches("input[data-passive]")) { state.passive = ev.target.checked; render(); }
  if (ev.target.matches("input[data-cmp]")) { state.tools.cmp = Act.toggle(state.tools.cmp, ev.target.dataset.cmp); render(); }
  if (ev.target.matches("input[data-asel]")) { state.act.sel = Act.toggle(state.act.sel, ev.target.dataset.asel); render(); }
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
  const pff = ev.target.closest("form[data-pf-form]");   // 月月配搜尋：找到就加進組合（預設 1 張）
  if (pff) {
    ev.preventDefault();
    const data = state.site["dividends.json"] || { etfs: [] };
    const code = Div.findEtf(data.etfs, pff.q.value);
    const msg = pff.querySelector("[data-pf-msg]");
    if (!code) { if (msg) msg.textContent = `找不到「${pff.q.value.trim()}」，或符合的不只一檔，請打完整代號`; return; }
    const pf = Div.loadPf(storage());
    pf[code] = pf[code] || 1;
    Div.savePf(storage(), pf);
    // 加完游標留在搜尋框，可以直接打下一檔
    render().then(() => document.querySelector("form[data-pf-form] input[name=q]")?.focus());
    return;
  }
  const sf = ev.target.closest("form[data-screen-form]");
  if (sf) {
    ev.preventDefault();
    const n = v => v === "" ? null : Number(v);
    state.tools.crit = { freq: sf.freq.value, type: sf.type.value, y1: n(sf.y1.value), aum: n(sf.aum.value), fee: n(sf.fee.value) };
    render();
    return;
  }
  const cf = ev.target.closest("form[data-cmp-form]");
  if (cf) {
    ev.preventDefault();
    const code = (cf.code.value || "").trim().toUpperCase();
    if (state.base.etfs.some(e => e.code === code) && !state.tools.cmp.includes(code)) state.tools.cmp = Act.toggle(state.tools.cmp, code);
    render();
    return;
  }
  const mf = ev.target.closest("form[data-multi-form]");
  if (mf) { ev.preventDefault(); state.track.q = mf.q.value; render(); return; }
  const of = ev.target.closest("form[data-ov-form]");
  if (of) {
    ev.preventDefault();
    const code = (of.code.value || "").trim().toUpperCase();
    if (state.base.etfs.some(e => e.code === code) && !state.track.osel.includes(code) && state.track.osel.length < 6) state.track.osel.push(code);
    render();
    return;
  }
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
  // 正在輸入（加入關注、查詢）時不重畫，不然打到一半會被清掉（審查）
  const typing = document.activeElement && document.activeElement.matches && document.activeElement.matches("#app input, #app select");
  if (state.base && Router.parse(location.hash).route === "today" && Live.isNewer(state.live, state.base.price_date)) { if (!typing) render(); return; }
  if (!state.base || !shownCode || !Live.isNewer(state.live, state.base.price_date)) return;
  const e = current().etfs.find(x => x.code === shownCode);
  const px = document.getElementById("live-px"), chg = document.getElementById("live-chg"), asof = document.getElementById("live-asof");
  if (!e || !px) return;
  px.textContent = Core.num(e.price);
  chg.innerHTML = Core.pct(e.chg_pct);
  const d1 = document.getElementById("live-d1");
  if (d1) d1.innerHTML = Core.pct(e.chg_pct);
  asof.innerHTML = `<span class="live-tag">即時 ${Core.esc(state.live.time || "")}</span>` +
    (e.ex_today ? ` 今日除息 ${Core.num(e.exd[1], 3)}，漲跌和平盤價比` : "");
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
