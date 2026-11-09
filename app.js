// ETF 中心：讀 data/overview.json 與 data/etf/<代號>.json，只負責顯示、排序、篩選（計算都在 build.py）
"use strict";

const app = document.getElementById("app");
const state = { cols: {}, scrollPos: {}, base: null, live: null, liveError: false, stocks: {}, details: {}, sort: {}, chips: {}, query: {}, issuer: "",
                view: null, detailTab: "components" };
// 盤中即時轉接站：本機預覽用本機版（worker/dev.js），網站上用 Cloudflare Worker；空字串＝不開即時
const CLOUD_LIVE_URL = "https://etf-live.peacepisceslamb.workers.dev";
const LIVE_URL = ["localhost", "127.0.0.1"].includes(location.hostname) ? "http://127.0.0.1:8787" : CLOUD_LIVE_URL;
const LIVE_EVERY_MS = 20000;

const PERIOD_LABELS = { ytd: "今年以來", m1: "近 1 月", m3: "近 3 月", m6: "近 6 月", y1: "近 1 年", y3: "近 3 年" };
const FREQ_LABELS = { 12: "月配", 6: "雙月配", 4: "季配", 2: "半年配", 1: "年配", 0: "不配息" };
const CHIPS = [
  ["主動", e => e.mgmt === "主動"], ["被動", e => e.mgmt === "被動"],
  ["市值型", e => e.type === "市值型"], ["高股息", e => e.type === "高股息"],
  ["債", e => e.type === "債券"], ["槓反", e => e.type === "槓反"], ["不配息", e => e.freq === 0],
  ["國內", e => e.region === "國內"], ["國外", e => !!e.region && e.region !== "國內"],
];
const GROUPS = ["市值型", "高股息", "債券", "槓反", "期貨", "其他"];

// ---------- 格式 ----------
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isNum = v => typeof v === "number" && isFinite(v);
const dash = '<span class="muted">—</span>';
function num(v, d = 2) { return isNum(v) ? v.toLocaleString("zh-TW", { minimumFractionDigits: d, maximumFractionDigits: d }) : dash; }
function signCls(v) { return !isNum(v) || v === 0 ? "" : v > 0 ? "up" : "down"; }
function pct(v, d = 2) {
  if (!isNum(v)) return dash;
  return `<span class="${signCls(v)}">${v > 0 ? "+" : ""}${num(v, d)}%</span>`;
}
function money(v) {   // 金額：億／萬
  if (!isNum(v)) return dash;
  const a = Math.abs(v), s = v < 0 ? "-" : "";
  if (a >= 1e8) return `${s}${num(a / 1e8, 2)} 億`;
  if (a >= 1e4) return `${s}${num(a / 1e4, 1)} 萬`;
  return `${s}${num(a, 0)}`;
}
// 漲跌：▲105.00 (4.69%)（台股習慣紅漲綠跌）
function arrowChg(v, p) {
  if (!isNum(v) && !isNum(p)) return dash;
  const s = isNum(v) ? v : p;
  const mark = s > 0 ? "▲" : s < 0 ? "▼" : "";
  const amt = isNum(v) ? num(Math.abs(v)) : "";
  const pc = isNum(p) ? `${amt ? " " : ""}(${num(Math.abs(p))}%)` : "";
  return `<span class="${signCls(s)}">${mark}${amt}${pc}</span>`;
}
function signedMoney(v) { return isNum(v) ? `<span class="${signCls(v)}">${v > 0 ? "+" : ""}${money(v)}</span>` : dash; }
function aum(v) { return isNum(v) ? (v >= 10000 ? `${num(v / 10000, 2)} 兆` : num(v, 0)) : dash; }
const notYet = '<span class="muted">尚未配息</span>';
function yieldText(e) { return isNum(e.yield) ? (e.yield_est ? `<span class="est">預估 ${num(e.yield)}%</span>` : `${num(e.yield)}%`) : e.no_div ? notYet : dash; }
// 還沒配過息：知道頻率就寫「季配（尚未配息）」，不知道就只寫「尚未配息」
function freqText(e) {
  const label = FREQ_LABELS[e.freq];
  if (e.no_div) return label ? `${label}<span class="muted">（尚未配息）</span>` : notYet;
  return label ?? "—";
}
const shortDate = d => d ? d.slice(5).replace("-", "/") : "—";

// ---------- 共用：排序表格 ----------
// cols: {key, label, get(row) → 排序值, html(row) → 顯示, r: 靠右, text: 文字欄位}（排序在 table.js）
function table(id, cols, rows, defaultSort, rowLink) {
  const s = state.sort[id] || (state.sort[id] = { ...defaultSort });
  state.cols[id] = cols;
  const sorted = Table.sortRows(rows, cols, s);
  const head = cols.map(c => {
    const on = s.key === c.key;
    return `<th class="${c.r ? "r " : ""}${c.get ? "sortable" : ""}${on ? " sorted" : ""}" data-sort="${c.get ? c.key : ""}" data-table="${id}">${esc(c.label)}${on ? (s.dir > 0 ? " ▲" : " ▼") : ""}</th>`;
  }).join("");
  const body = sorted.map((row, i) => `<tr${rowLink ? ` class="link" data-href="${rowLink(row)}"` : ""}>${cols.map(c =>
    `<td class="${c.r ? "r num" : ""}">${c.html(row, i)}</td>`).join("")}</tr>`).join("");
  return { html: `<div class="tbl-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length}" class="muted">沒有符合的 ETF</td></tr>`}</tbody></table></div>`, sorted };
}
app.addEventListener("click", ev => {
  const th = ev.target.closest("th[data-sort]");
  if (th && th.dataset.sort) {
    const s = state.sort[th.dataset.table];
    if (s.key === th.dataset.sort) s.dir = -s.dir;
    else { s.key = th.dataset.sort; s.dir = Table.firstDir((state.cols[th.dataset.table] || []).find(c => c.key === s.key)); }
    render();
    return;
  }
  const tr = ev.target.closest("tr[data-href]");
  if (tr) location.hash = tr.dataset.href;
});

// ---------- 共用：篩選 ----------
function chipBar(page, extra = []) {
  const on = state.chips[page] || (state.chips[page] = new Set());
  return `<div class="chips">${CHIPS.concat(extra).map(([k]) =>
    `<button type="button" data-chip="${esc(k)}" data-page="${page}" aria-pressed="${on.has(k)}">${esc(k)}</button>`).join("")}</div>`;
}
function applyFilters(page, etfs) {
  const on = state.chips[page] || new Set();
  const q = (state.query[page] || "").trim().toLowerCase();
  return etfs.filter(e => CHIPS.every(([k, f]) => !on.has(k) || f(e)) &&   // 複選取交集
    (!q || e.code.toLowerCase().includes(q) || (e.name || "").toLowerCase().includes(q)));
}
function searchBox(page) {
  return `<input type="search" placeholder="搜尋 ETF 代號或名稱" value="${esc(state.query[page] || "")}" data-search="${page}">`;
}
app.addEventListener("click", ev => {
  const b = ev.target.closest("button[data-chip]");
  if (!b) return;
  const set = state.chips[b.dataset.page];
  set.has(b.dataset.chip) ? set.delete(b.dataset.chip) : set.add(b.dataset.chip);
  render();
});
// 注音、拼音選字中（isComposing）不能重畫，不然輸入會被打斷；選完字（compositionend）再搜尋
function onSearch(ev) {
  const t = ev.target;
  if (!t.dataset.search || ev.isComposing) return;
  state.query[t.dataset.search] = t.value;
  const pos = t.selectionStart;
  render().then(() => {
    const again = app.querySelector(`input[data-search="${t.dataset.search}"]`);
    if (again) { again.focus(); again.setSelectionRange(pos, pos); }
  });
}
app.addEventListener("input", onSearch);
app.addEventListener("compositionend", onSearch);
app.addEventListener("change", ev => {
  const t = ev.target;
  if (t.dataset.issuer !== undefined) { state.issuer = t.value; render(); }
  if (t.dataset.board) { state.board[t.dataset.board] = t.value; render(); }
});

const nameCell = e => `${esc(e.name)}<span class="code">${esc(e.code)}</span>`;
const etfHref = e => `#/etf/${encodeURIComponent(e.code)}`;

// ---------- 總覽：現價・淨值・折溢價 ----------
function pageOverview(o) {
  const issuers = [...new Set(o.etfs.map(e => e.issuer))].sort((a, b) => a.localeCompare(b, "zh-Hant"));
  const rows = applyFilters("ov", o.etfs).filter(e => !state.issuer || e.issuer === state.issuer);
  const cols = [
    { key: "code", label: "代號", text: 1, get: e => e.code, html: e => `<span class="num">${esc(e.code)}</span>` },
    { key: "name", label: "名稱", text: 1, get: e => e.name, html: e => esc(e.name) },
    { key: "issuer", label: "發行", text: 1, get: e => e.issuer, html: e => esc(e.issuer) },
    { key: "region", label: "地區", text: 1, get: e => e.region, html: e => e.region ? esc(e.region) : dash },
    { key: "price", label: "價格", r: 1, get: e => e.price, html: e => num(e.price) },
    { key: "nav", label: "淨值", r: 1, get: e => e.nav, html: e => num(e.nav) },
    { key: "premium", label: "折溢價", r: 1, get: e => e.premium, html: e => pct(e.premium) },
    { key: "chg_pct", label: "漲跌", r: 1, get: e => e.chg_pct, html: e => pct(e.chg_pct) },
  ];
  const t = table("ov", cols, rows, { key: "code", dir: 1 }, etfHref);
  return `<div class="tools">${searchBox("ov")}
    <select data-issuer aria-label="發行公司"><option value="">全部發行公司</option>${issuers.map(i =>
      `<option${i === state.issuer ? " selected" : ""}>${esc(i)}</option>`).join("")}</select></div>
    ${chipBar("ov")}
    <p class="lead">共 ${t.sorted.length} 檔・${o.live ? `價格、淨值、折溢價是盤中即時（證交所 ${esc(o.live.time || "")}，淨值為預估）` : `淨值是收盤後的估計淨值（${shortDate(o.nav_date)}）`}，點欄位名稱可以排序</p>${t.html}`;
}

// ---------- 完整排行 ----------
function rankCols() {
  return [
    { key: "rank", label: "排名", html: (e, i) => `<span class="muted">${i + 1}</span>` },
    { key: "name", label: "名稱", text: 1, get: e => e.name, html: nameCell },
    { key: "region", label: "地區", text: 1, get: e => e.region, html: e => e.region ? esc(e.region) : dash },
    ...Object.keys(PERIOD_LABELS).map(k => ({ key: `ret.${k}`, label: PERIOD_LABELS[k], r: 1, get: e => e.ret[k], html: e => pct(e.ret[k]) })),
    { key: "aum", label: "資產規模（億）", r: 1, get: e => e.aum, html: e => aum(e.aum) },
    { key: "yield", label: "殖利率", r: 1, get: e => e.yield, html: yieldText },
  ];
}
function pageRank(o, params) {
  if (params.has("f") || params.has("s")) {   // 從排行榜「查看完整排行」帶進來的條件
    state.chips.rank = new Set((params.get("f") || "").split(",").filter(Boolean));
    if (params.get("s")) state.sort.rank = { key: params.get("s"), dir: -1 };
    history.replaceState(null, "", "#/rank");
  }
  if (state.view === null) state.view = matchMedia("(max-width: 640px)").matches ? "card" : "list";
  const cols = rankCols();
  const t = table("rank", cols, applyFilters("rank", o.etfs), { key: "ret.ytd", dir: -1 }, etfHref);
  const s = state.sort.rank;
  const seg = `<div class="seg"><button type="button" data-view="list" aria-pressed="${state.view === "list"}">列表</button><button type="button" data-view="card" aria-pressed="${state.view === "card"}">卡片</button></div>`;
  const sortSel = `<select data-ranksort aria-label="排序">${cols.filter(c => c.get).map(c =>
    `<option value="${c.key}"${c.key === s.key ? " selected" : ""}>依${esc(c.label)}</option>`).join("")}</select>`;
  const body = state.view === "list" ? t.html : `<div class="cards">${t.sorted.map((e, i) => `<a class="card" href="${etfHref(e)}">
      <div class="top"><b>${i + 1}. ${esc(e.name)}</b><span class="code">${esc(e.code)}</span></div>
      <dl>${Object.keys(PERIOD_LABELS).map(k => `<div><dt>${PERIOD_LABELS[k]}</dt><dd>${pct(e.ret[k])}</dd></div>`).join("")}
      <div><dt>規模（億）</dt><dd>${aum(e.aum)}</dd></div><div><dt>殖利率</dt><dd>${yieldText(e)}</dd></div><div><dt>配息</dt><dd>${freqText(e)}</dd></div></dl></a>`).join("") || '<p class="empty">沒有符合的 ETF</p>'}</div>`;
  return `<div class="tools">${searchBox("rank")}${state.view === "card" ? sortSel : ""}${seg}</div>${chipBar("rank")}
    <p class="lead">共 ${t.sorted.length} 檔・報酬含息（配息再投入）・價格 ${shortDate(o.price_date)}・更新 ${esc(o.built)}</p>${body}`;
}
app.addEventListener("click", ev => {
  const b = ev.target.closest("button[data-view]");
  if (b) { state.view = b.dataset.view; render(); }
});
app.addEventListener("change", ev => {
  if (ev.target.dataset.ranksort !== undefined) { state.sort.rank = { key: ev.target.value, dir: -1 }; render(); }
});

// ---------- 排行榜 ----------
state.board = { 主動式: "m3", 市值型: "ytd", 高股息: "yield", 近月最火: "m3" };
const BOARDS = [
  ["主動式", e => e.mgmt === "主動", "主動"], ["市值型", e => e.type === "市值型", "市值型"],
  ["高股息", e => e.type === "高股息", "高股息"], ["近月最火", () => true, ""],
];
function pageBoard(o) {
  return `<div class="board">${BOARDS.map(([title, pick, chip]) => {
    const key = state.board[title];
    const val = key === "yield" ? e => e.yield : e => e.ret[key];
    const top = o.etfs.filter(pick).filter(e => isNum(val(e))).sort((a, b) => val(b) - val(a)).slice(0, 5);
    const opts = Object.entries(PERIOD_LABELS).concat(title === "高股息" ? [["yield", "殖利率"]] : [])
      .map(([k, l]) => `<option value="${k}"${k === key ? " selected" : ""}>${l}</option>`).join("");
    const sortKey = key === "yield" ? "yield" : `ret.${key}`;
    return `<section class="panel"><div class="panel-head"><h3>${title} ETF</h3><select data-board="${title}" aria-label="期間">${opts}</select></div>
      <ol>${top.map((e, i) => `<li><a href="${etfHref(e)}"><span class="rk">${i + 1}</span><span class="nm">${nameCell(e)}</span>
        <span class="num">${key === "yield" ? yieldText(e) : pct(val(e))}</span></a></li>`).join("") || '<li class="empty">資料不足</li>'}</ol>
      <a class="more" href="#/rank?f=${encodeURIComponent(chip)}&s=${encodeURIComponent(sortKey)}">查看完整排行 →</a></section>`;
  }).join("")}</div>`;
}

// ---------- 全部 ETF 分組 ----------
function pageAll(o) {
  const groups = [["主動式", o.etfs.filter(e => e.mgmt === "主動")]].concat(
    GROUPS.map(g => [g === "其他" ? "其他被動" : g, o.etfs.filter(e => e.mgmt === "被動" && e.type === g)]));
  return `<p class="lead">全部 ${o.etfs.length} 檔，點名稱看持股</p>${groups.filter(([, l]) => l.length).map(([g, list]) =>
    `<section class="group"><h2>${g}<span class="count">${list.length}</span></h2><div class="tags">${list.map(e =>
      `<a href="${etfHref(e)}">${esc(e.name)}<span class="code">${esc(e.code)}</span></a>`).join("")}</div></section>`).join("")}`;
}

// ---------- 各檔頁 ----------
async function pageEtf(o, code) {
  const e = o.etfs.find(x => x.code === code);
  if (!e) return `<p class="empty">找不到 ${esc(code)}</p>`;
  if (!state.details[code]) {
    state.details[code] = await loadJson(`data/etf/${encodeURIComponent(code)}.json`);
    if (LIVE_URL && o.live) refreshStocks(code).then(() => { if (currentEtf() === code) render(); }, () => {});
  }
  const d = state.details[code];
  const closed = !Live.isMarketOpen(new Date());
  const v = d.view && { ...d.view, components: Live.mergeComponents(d.view.components, state.stocks[code], o.price_date, closed) };
  const i = o.etfs.indexOf(e), prev = o.etfs[i - 1], next = o.etfs[i + 1];
  const tabs = [["components", "成份股"], ["changes", "今日異動"], ["dividends", "配息紀錄"]];
  const stat = (k, val) => `<div><dt>${k}</dt><dd>${val}</dd></div>`;
  let body;
  if (state.detailTab === "dividends") {
    body = d.dividends.length ? `<div class="tbl-wrap"><table><thead><tr><th>除息日</th><th class="r">現金股利</th></tr></thead><tbody>${d.dividends.map(x =>
      `<tr><td class="num">${esc(x.date)}</td><td class="r num">${num(x.cash, 4)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="empty">沒有配息紀錄</p>';
  } else if (!v) {
    body = '<p class="empty">這檔 ETF 沒有股票持股資料（債券、期貨或反向型）</p>';
  } else if (state.detailTab === "changes") {
    body = [["new", "新進"], ["add", "加碼"], ["cut", "減碼"], ["gone", "出清"]].map(([k, l]) => {
      const list = v.changes[k];
      return `<h2>${l}<span class="count">${list.length}</span></h2>${list.length ? `<div class="tbl-wrap"><table><thead><tr><th>股票</th><th class="r">Δ張</th><th class="r">買賣金額</th><th class="r">持有張數</th><th class="r">權重</th></tr></thead><tbody>${list.map(x =>
        `<tr><td>${esc(x.n)}<span class="code">${esc(x.s)}</span></td><td class="r num ${signCls(x.dlots)}">${x.dlots > 0 ? "+" : ""}${num(x.dlots, 0)}</td><td class="r num">${signedMoney(x.amt)}</td><td class="r num">${num(x.lots, 0)}</td><td class="r num">${num(x.w)}%</td></tr>`).join("")}</tbody></table></div>` : '<p class="note">無</p>'}`;
    }).join("");
    const gap = v.prev && v.missing && v.missing.length
      ? `<p class="warn">⚠ 富邦缺 ${v.missing.map(shortDate).join("、")} 的持股資料，下面是 ${shortDate(v.prev)} → ${shortDate(v.date)} ${v.missing.length + 1} 天合計的異動</p>` : "";
    body = gap + body + (v.prev ? `<p class="note">比較 ${shortDate(v.prev)} → ${shortDate(v.date)} 的持股</p>` : '<p class="note">只有一天的持股資料，還不能比較</p>');
  } else {
    const cols = [
      { key: "rank", label: "#", html: (x, i) => `<span class="muted">${i + 1}</span>` },
      { key: "name", label: "股票", text: 1, get: x => x.n, html: x => `${esc(x.n)}<span class="code">${esc(x.s)}</span>${x.flag ? `<span class="pill ${x.flag === "新進" ? "up" : "down"}">${x.flag}</span>` : ""}` },
      { key: "w", label: "權重%", r: 1, get: x => x.w, html: x => num(x.w) },
      { key: "lots", label: "張數", r: 1, get: x => x.lots, html: x => num(x.lots, 0) },
      { key: "mv", label: "持有市值", r: 1, get: x => x.mv, html: x => money(x.mv) },
      { key: "px", label: "股價", r: 1, get: x => x.px, html: x => num(x.px) },
      { key: "chg", label: "漲跌", r: 1, get: x => x.chg, html: x => arrowChg(x.chgv, x.chg) },
      { key: "amt", label: "今日買賣金額", r: 1, get: x => x.amt, html: x => x.dlots ? signedMoney(x.amt) : dash },
      { key: "dlots", label: "Δ張", r: 1, get: x => x.dlots, html: x => x.dlots ? `<span class="${signCls(x.dlots)}">${x.dlots > 0 ? "+" : ""}${num(x.dlots, 0)}</span>` : dash },
      { key: "streak", label: "連買賣", r: 1, get: x => x.streak, html: x => x.streak ? `<span class="${signCls(x.streak)}">${x.streak > 0 ? "連買" : "連賣"}${Math.abs(x.streak)}${x.more ? "+" : ""}</span>` : dash },
    ];
    const pxd = v.components.some(x => x.live) ? "即時" : `${shortDate(v.components.map(x => x.pxd || "").sort().pop())} 收盤`;
    body = `<p class="lead">成份股 ${v.components.filter(x => x.flag !== "出清").length} 檔・持股日期 ${esc(v.date)}・股價 ${pxd}・點欄位名稱可以排序</p>` +
      table(`etf-${code}`, cols, v.components, { key: "w", dir: -1 }).html;
  }
  return `<div class="nav-row"><a href="#/all">← 返回</a><span>${prev ? `<a href="${etfHref(prev)}">← 上一檔</a> ` : ""}${next ? `<a href="${etfHref(next)}">下一檔 →</a>` : ""}</span></div>
    <section class="etf-card"><h2>${esc(e.name)}<span class="code">${esc(e.code)}</span><span class="pill">${esc(e.mgmt)}・${esc(e.type)}・${esc(e.issuer)}</span></h2>
    <dl class="stats">${stat(e.live ? "成交價（即時）" : "收盤價", `${num(e.price)} ${pct(e.chg_pct)}`)}${stat("折溢價", pct(e.premium))}${stat("殖利率", yieldText(e))}
      ${stat("資產規模", isNum(e.aum) ? (e.aum >= 10000 ? aum(e.aum) : `${aum(e.aum)} 億`) : dash)}${stat("配息頻率", freqText(e))}
      ${stat("價格日期", e.live ? `${shortDate(o.live.date)} ${esc(o.live.time || "")}` : shortDate(e.pdate))}${stat("持股日期", e.has_holdings ? shortDate(e.holdings_date) : "—")}</dl></section>
    <div class="subtabs">${tabs.map(([k, l]) => `<button type="button" data-tab="${k}" aria-selected="${state.detailTab === k}">${l}</button>`).join("")}</div>${body}`;
}
app.addEventListener("click", ev => {
  const b = ev.target.closest("button[data-tab]");
  if (b) { state.detailTab = b.dataset.tab; render(); }
});

// ---------- 盤中即時 ----------
// 收盤資料＋即時資料合併後的總覽（即時資料不比收盤資料新就照收盤資料）
function current() {
  const b = state.base;
  const fresh = Live.isNewer(state.live, b.price_date);
  return { ...b, etfs: Live.mergeOverview(b, state.live), live: fresh ? state.live : null };
}
function showAsof(o) {
  const el = document.getElementById("asof");
  const tag = o.live ? `<span class="live-tag">即時 ${esc(o.live.time || "")}</span>`
    : `<span class="close-tag">收盤 ${shortDate(o.price_date)}</span>${state.liveError ? '<span class="muted">・即時連線失敗</span>' : ""}`;
  el.innerHTML = `${tag}<span>・淨值 ${shortDate(o.nav_date)}・更新 ${esc(o.built)}</span>`;
}
async function fetchLive(path) {
  const r = await fetch(`${LIVE_URL}${path}`, { cache: "no-cache" });
  if (!r.ok) throw new Error(`即時 ${r.status}`);
  return r.json();
}
async function refreshStocks(code) {
  const v = state.details[code] && state.details[code].view;
  if (!v) return;
  const merged = { date: null, quotes: {} };
  for (const batch of Live.stockBatches(v.components)) {
    const r = await fetchLive(`/stocks?s=${batch}`);
    merged.date = r.date || merged.date;
    Object.assign(merged.quotes, r.quotes);
  }
  state.stocks[code] = merged;
}
let polledOnce = false;
async function pollLive() {
  if (!LIVE_URL || document.hidden || (polledOnce && !Live.isLiveWindow(new Date()))) return;
  polledOnce = true;
  try {
    state.live = await fetchLive("/etf");
    const code = currentEtf();
    if (code) await refreshStocks(code);
    state.liveError = false;
  } catch (err) {
    state.liveError = true;
  }
  // 正在搜尋框打字（尤其注音選字中）時不重畫，只更新右上角時間
  if (document.activeElement && document.activeElement.dataset && document.activeElement.dataset.search) {
    if (state.base) showAsof(current());
  } else if (state.base) {
    render();
  }
}
function currentEtf() {
  const m = location.hash.match(/^#\/etf\/([^?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
setInterval(pollLive, LIVE_EVERY_MS);
document.addEventListener("visibilitychange", () => { if (!document.hidden) pollLive(); });

// ---------- 路由 ----------
async function loadJson(url) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
}
let renderSeq = 0;
async function render() {
  const seq = ++renderSeq;
  const [path, qs] = location.hash.replace(/^#\/?/, "").split("?");
  const parts = path.split("/");
  const route = parts[0] || "";
  document.querySelectorAll("#tabs a").forEach(a => a.setAttribute("aria-current", a.dataset.route === route ? "page" : "false"));
  try {
    if (!state.base) state.base = await loadJson("data/overview.json");
    const o = current();
    showAsof(o);
    let html;
    if (route === "rank") html = pageRank(o, new URLSearchParams(qs || ""));
    else if (route === "board") html = pageBoard(o);
    else if (route === "all") html = pageAll(o);
    else if (route === "etf") html = await pageEtf(o, decodeURIComponent(parts[1] || ""));
    else html = pageOverview(o);
    if (seq === renderSeq) app.innerHTML = html;
  } catch (err) {
    if (seq === renderSeq) app.innerHTML = `<p class="empty error">資料讀取失敗，請稍後重新整理</p><p class="note">${esc(err.message)}</p>`;
  }
}
let lastRoute = location.hash.split("?")[0] || "#/";
// 換頁時記住每一頁捲到哪裡，按「上一頁」回來時回到原位
window.addEventListener("hashchange", () => {
  const route = location.hash.split("?")[0] || "#/";
  if (route === lastRoute) { render(); return; }
  state.scrollPos[lastRoute] = window.scrollY;
  if (route.startsWith("#/etf/")) state.detailTab = "components";
  lastRoute = route;
  render().then(() => window.scrollTo(0, state.scrollPos[route] || 0));
});
render().then(pollLive);
