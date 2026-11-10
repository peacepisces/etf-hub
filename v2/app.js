// 新版啟動：選單、路由 → 分頁、表格排序、搜尋框。即時資料之後階段再接。
"use strict";

const app = document.getElementById("app");
const state = { base: null, index: null, candles: {}, sort: { rank: { key: "ret.ytd", dir: -1 }, stock: { key: "w", dir: -1 } },
                range: "m3", chart: null, cols: {} };

document.getElementById("nav").innerHTML = Router.NAV.map(([k, l]) => `<a href="#/${k}" data-route="${k}">${l}</a>`).join("");

async function loadIndex() {
  if (!state.index) state.index = await Core.loadJson("v2/search.json");
  return state.index;
}
async function loadCandles(code) {
  if (!(code in state.candles)) {
    try { state.candles[code] = await Core.loadJson(`v2/candles/${encodeURIComponent(code)}.json`); }
    catch (err) {
      if (!Core.isNotFound(err)) throw err;   // 網路錯誤：顯示讀取失敗，不記住，下次再讀
      state.candles[code] = { rows: [] };     // 剛上市、還沒產生 K 線檔
    }
  }
  return state.candles[code];
}

let renderSeq = 0;
async function render() {
  const seq = ++renderSeq;
  const { route, args } = Router.parse(location.hash);
  document.querySelectorAll("#nav a").forEach(a => a.setAttribute("aria-current", a.dataset.route === route ? "page" : "false"));
  if (state.chart) { state.chart.destroy(); state.chart = null; }
  try {
    if (!state.base) state.base = await Core.loadJson("overview.json");
    const o = state.base;
    let html, candles;
    if (route === "rank") html = Pages.rank(o, state.sort.rank);
    else if (route === "holdings") html = Pages.holdings();
    else if (route === "active") html = Pages.active();
    else if (route === "dividend") html = Pages.dividend();
    else if (route === "tools") html = Pages.tools();
    else if (route === "etf") { candles = await loadCandles(args[0] || ""); html = Pages.etf(o, args[0] || "", candles, state.range); }
    else if (route === "stock") html = Pages.stock(o, await loadIndex(), args[0] || "", state.sort.stock);
    else html = Pages.today();
    if (seq !== renderSeq) return;
    app.innerHTML = html;
    const el = document.getElementById("kline");
    if (el && candles) state.chart = Chart.drawKline(el, document.getElementById("legend"), candles.rows, state.range);
  } catch (err) {
    if (seq === renderSeq) app.innerHTML = `<p class="empty error">資料讀取失敗，請稍後重新整理</p><p class="note">${Core.esc(err.message)}</p>`;
  }
}

// 表頭排序、點列進詳細頁、K 線期間
app.addEventListener("click", ev => {
  const th = ev.target.closest("th[data-sort]");
  if (th) {
    const s = state.sort[th.dataset.table];
    if (s.key === th.dataset.sort) s.dir = -s.dir;
    else { s.key = th.dataset.sort; s.dir = th.classList.contains("r") ? -1 : 1; }   // 數字欄先大到小、文字欄先小到大
    render();
    return;
  }
  const b = ev.target.closest("button[data-range]");
  if (b) { state.range = b.dataset.range; render(); return; }
  const tr = ev.target.closest("tr[data-href]");
  if (tr) location.hash = tr.dataset.href;
});

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
