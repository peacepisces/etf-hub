// 各分頁的畫面：回傳 HTML 字串（第 1 階段：佔位頁、暫時排行、ETF 詳細頁雛形、個股反查）
"use strict";

const Pages = (() => {
  const { esc, num, pct, aum, dash, isNum, shortDate } = Core;
  // 代號獨立一欄（使用者 2026-11-12）
  const CODE_COL = { key: "code", label: "代號", text: 1, cls: "code-col", get: e => e.code, html: e => esc(e.code) };
  const NAME_COL = { key: "name", label: "名稱", text: 1, tags: 1, get: e => e.name, html: e => esc(e.name) };
  const etfHref = code => `#/etf/${encodeURIComponent(code)}`;
  const yieldText = e => isNum(e.yield) ? (e.yield_est ? `<span class="est">預估 ${num(e.yield)}%</span>` : `${num(e.yield)}%`)
    : e.no_div ? '<span class="muted">尚未配息</span>' : dash;

  function soon(title, phase, items) {
    return `<section class="card soon"><h2>${esc(title)} <span class="badge">第 ${phase} 階段做</span></h2>
      <ul>${items.map(i => `<li>${esc(i)}</li>`).join("")}</ul></section>`;
  }

  function today() {
    return soon("今日", 3, ["今日表現 vs 大盤（0050、主動式平均、高股息平均、市值型平均、債券平均、我的關注），主動式贏 0050 幾檔",
      "換股雷達：多檔 ETF 同買／同賣的股票、連買天數、新建倉", "即將發生：兩週內除息、分割、新上市（依日期排序，新公告標 🆕）",
      "資金流向、成交金額與爆量、漲跌幅、折溢價警示、三大法人（之後才做）"]);
  }
  function holdings() {
    return soon("持股追蹤", 6, ["換股雷達完整版", "個股反查：一次查多檔股票被哪些 ETF 持有（現在先用上方搜尋框查單一個股）", "持股重疊：兩檔 ETF 重複持有的股票與權重"]);
  }
  function active() {
    return soon("主動式", 5, ["績效 vs 0050 表（期間可切）", "報酬走勢圖：挑幾檔和 0050 疊圖", "投信比較：點一家展開旗下各檔 vs 0050", "經理人共識：每檔股票被幾檔主動式持有、今天幾檔加碼／減碼／新建倉"]);
  }
  function dividend() {
    return soon("配息", 4, ["配息比較表：殖利率、含息報酬（＝價差＋配息）、頻率、今年已配、去年合計、填息天數、1～12 月", "組合：勾幾檔看每月領多少（月月配規劃）", "配息日曆"]);
  }
  function tools() {
    return soon("工具", 7, ["篩選器：配息頻率、類型、近一年報酬、規模、費用", "績效比較：任選 ETF 疊圖"]);
  }

  // ---------- 排行（暫時版：驗收共用表格） ----------
  const RANK_COLS = [
    CODE_COL, NAME_COL,
    { key: "price", label: "價格", r: 1, get: e => e.price, html: e => num(e.price) },
    { key: "chg_pct", label: "漲跌", r: 1, get: e => e.chg_pct, html: e => pct(e.chg_pct) },
    { key: "ret.m1", label: "近 1 月", r: 1, get: e => e.ret.m1, html: e => pct(e.ret.m1) },
    { key: "ret.m3", label: "近 3 月", r: 1, get: e => e.ret.m3, html: e => pct(e.ret.m3) },
    { key: "ret.ytd", label: "今年以來", r: 1, get: e => e.ret.ytd, html: e => pct(e.ret.ytd), top: "ytd", tag: "今年" },
    { key: "ret.y1", label: "近 1 年", r: 1, get: e => e.ret.y1, html: e => pct(e.ret.y1), top: "y1", tag: "1年" },
    { key: "aum", label: "規模", r: 1, get: e => e.aum, html: e => aum(e.aum), top: "aum", tag: "規模" },
    { key: "yield", label: "殖利率", r: 1, get: e => e.yield, html: yieldText, top: "yld", tag: "息" },
  ];
  function rank(o, s) {
    const t = V2Table.render("rank", RANK_COLS, o.etfs, s, { rowLink: e => etfHref(e.code) });
    return `<p class="lead">暫時版，第 7 階段改成完整排行・共 ${t.sorted.length} 檔・報酬含息・價格 ${shortDate(o.price_date)}・點欄位名稱排序・今年以來、近 1 年、規模、殖利率各自的前 3 名會用顏色和標籤標出來</p>${t.html}`;
  }

  // ---------- ETF 詳細頁 ----------
  // v：{candles, d（v2/etf 檔或 null）, d0050, range, chart: "kline"|"ret", tab, hview, filter, hsort}
  function etf(o, code, v) {
    const e = o.etfs.find(x => x.code === code);
    if (!e) return `<p class="empty">找不到 ${esc(code)}</p>`;
    const chips = Chart.RANGES.map(([k, l]) => `<button type="button" data-range="${k}" aria-pressed="${k === v.range}">${l}</button>`).join("");
    const modes = `<div class="chips"><button type="button" data-chart="kline" aria-pressed="${v.chart !== "ret"}">K 線</button>
      <button type="button" data-chart="ret" aria-pressed="${v.chart === "ret"}">含息走勢 vs 0050</button></div>`;
    let chart;
    if (v.chart === "ret") {
      chart = v.d && v.d.tri && v.d.tri.length
        ? `<div class="chart-tools">${modes}<div class="chips">${chips}</div></div><div class="legend" id="legend"></div><div class="chart" id="returns"></div>
           <p class="chart-note">含息報酬（配息再投入），期間第一天＝0%・0050 是灰色虛線</p>`
        : `<div class="chart-tools">${modes}</div><p class="empty">尚無報酬資料</p>`;
    } else {
      chart = `<div class="chart-tools">${modes}<div class="chips">${chips}</div></div>${kline(v.candles)}`;
    }
    const tab = v.tab || "ops";
    const body = tab === "holdings" ? Detail.holdings(v.d, v.hview, v.hsort, v.d0050)
      : tab === "premium" ? Detail.premium(v.d) : tab === "dividend" ? Detail.dividend(v.d)
        : tab === "info" ? Detail.info(e, v.d) : Detail.ops(v.d, v.filter);
    return `${Detail.head(e, v.d, o.etfs)}<section class="card chart-box">${chart}</section>
      ${Detail.tabs(tab)}<div class="tab-body">${body}</div>`;
  }

  function tag(o, kind, value, s) {
    const list = Tags.list(o.etfs, kind, value);
    if (!list.length) return `<p class="empty">找不到這個標籤</p>`;
    const t = V2Table.render("tag", RANK_COLS, list, s, { rowLink: e => etfHref(e.code) });
    return `<section class="card"><h2>${esc(Tags.LABELS[kind] || "")}：${esc(Tags.title(kind, value))}</h2>
      <p class="meta">共 ${list.length} 檔・點欄位名稱排序</p></section>${t.html}`;
  }

  function kline(candles) {
    const rows = (candles && candles.rows) || [];
    const notes = ["實際成交價（除息缺口保留，可看填息；分割已調整）"];
    for (const [d, r] of (candles && candles.splits) || []) {
      notes.push(r < 1 ? `${d.replaceAll("-", "/")} 分割 1→${Math.round(1 / r)}，之前價格已換算` : `${d.replaceAll("-", "/")} 反分割 ${Math.round(r)}→1，之前價格已換算`);
    }
    if (candles && candles.truncated && candles.earliest) notes.push(`資料自 ${candles.earliest.slice(0, 7).replace("-", "/")} 起`);
    return rows.length
      ? `<div class="legend" id="legend"></div><div class="chart" id="kline"></div><p class="chart-note">${notes.map(esc).join("・")}</p>`
      : '<p class="empty">尚無 K 線資料</p>';
  }

  // ---------- 個股反查 ----------
  function stock(o, index, code, s) {
    const st = index && index.stocks[code];
    if (!st) return `<p class="empty">沒有 ETF 持有 ${esc(code)}</p>`;
    const byCode = new Map(o.etfs.map(e => [e.code, e]));
    const rows = st.h.map(([c, w]) => ({ code: c, name: (byCode.get(c) || {}).name || c, type: (byCode.get(c) || {}).type, mgmt: (byCode.get(c) || {}).mgmt, w }));
    const cols = [
      CODE_COL, NAME_COL,
      { key: "mgmt", label: "管理", text: 1, get: r => r.mgmt, html: r => esc(r.mgmt || "—") },
      { key: "type", label: "類型", text: 1, get: r => r.type, html: r => esc(r.type || "—") },
      { key: "w", label: "權重", r: 1, get: r => r.w, html: r => isNum(r.w) ? `${num(r.w)}%` : dash, top: "w", tag: "權重" },
    ];
    const t = V2Table.render("stock", cols, rows, s, { rowLink: r => etfHref(r.code) });
    return `<section class="card"><h2>${esc(st.n || code)}<span class="code">${esc(code)}</span></h2>
      <p class="meta">被 ${rows.length} 檔 ETF 持有・各 ETF 最新持股日・點列看該 ETF</p></section>${t.html}`;
  }

  return { today, rank, holdings, active, dividend, tools, etf, tag, stock };
})();
