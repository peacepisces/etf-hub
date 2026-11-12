// 單一 ETF 詳細頁（第 2 階段）：上半部（名稱、標籤、價格、各期報酬）＋圖表切換＋五個分頁。
// d＝data/v2/etf/<代號>.json（build.py _v2_etf），可能是 null（剛上市還沒產生）。網頁和 node 測試共用。
"use strict";

const Detail = (() => {
  const C = typeof Core !== "undefined" ? Core : require("./core.js");
  const T = typeof Tags !== "undefined" ? Tags : require("./tags.js");
  const DN = typeof Donut !== "undefined" ? Donut : require("./donut.js");
  const TB = typeof V2Table !== "undefined" ? V2Table : require("./table.js");
  const { esc, isNum, dash, num, pct, aum, shortDate } = C;
  const ym = d => d ? `${d.slice(0, 4)}/${d.slice(5, 7)}` : "—";
  const ymd = d => d ? d.replaceAll("-", "/") : "—";
  const TABS = [["ops", "操作日報"], ["holdings", "成分股"], ["premium", "折溢價"], ["dividend", "配息"], ["info", "基本資料與費用"]];
  const NO_HOLDINGS = '<p class="empty">這檔沒有持股資料（債券、期貨型或投信沒有公布）</p>';

  function money(v) {
    if (!isNum(v)) return dash;
    const a = Math.abs(v), s = v < 0 ? "−" : "";
    return a >= 1e8 ? `${s}${num(a / 1e8, 2)} 億` : a >= 1e4 ? `${s}${num(a / 1e4, 0)} 萬` : `${s}${num(a, 0)}`;
  }

  function tag(t, cls) {
    return `<a class="tag2 ${cls}" href="#/tag/${encodeURIComponent(t.kind)}/${encodeURIComponent(t.value)}"${t.rule ? ` title="${esc(t.rule)}"` : ""}>${esc(t.text)}</a>`;
  }

  function sinceCell(s) {
    if (!s || !isNum(s.pct)) return ["成立以來年化", dash];
    const partial = s.truncated || (s.listed && s.start && s.start > s.listed && daysBetween(s.listed, s.start) > 15);
    const label = !s.annualized ? (partial ? `自 ${ym(s.start)} 起（累積）` : "成立以來（累積）")
      : partial ? `自 ${ym(s.start)} 起年化` : "成立以來年化";
    return [label, pct(s.pct)];
  }
  const daysBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5;

  function head(e, d, etfs) {
    const r0 = (d && d.ret) || { ...(e.ret || {}), d1: e.chg_pct };
    // 盤中：各期間報酬算到現在（股價＋配息、不再投入）
    const r = e.livePx && d && d.p0 ? C.liveRet(r0, e.chg, d.p0) : r0;
    const [sl, sv] = sinceCell(d && d.since);
    // data-ret：盤中每 20 秒只換這幾格的數字（app.js pollLive），不重畫整頁
    const rc = k => `<span data-ret="${k}">${pct(r[k])}</span>`;
    const cells = [["今日", `<span id="live-d1">${pct(e.chg_pct)}</span>`], ["近 1 週", rc("w1")], ["近 1 月", rc("m1")], ["近 3 月", rc("m3")],
      ["今年以來", rc("ytd")], ["近 1 年", rc("y1")]];
    const tags = T.fixed(e).map(t => tag(t, "fixed")).join("") + T.achievements(e, etfs || []).map(t => tag(t, "ach")).join("");
    const yieldText = isNum(e.yield) ? (e.yield_est ? `預估 ${num(e.yield)}%` : `${num(e.yield)}%`) : e.no_div ? "尚未配息" : "—";
    return `<section class="card etf-head">
      <h2>${esc(e.name)}<span class="code">${esc(e.code)}</span></h2>
      <div class="tags2">${tags}</div>
      <div class="px-line"><span class="px" id="live-px">${num(e.price)}</span><span id="live-chg">${pct(e.chg_pct)}</span>
        <span class="meta" id="live-asof">${e.live ? '<span class="live-tag">即時</span>' : `${shortDate(e.pdate)} 收盤`}</span></div>
      <div class="kv">
        <span>淨值 <b>${num(e.nav)}</b></span><span>折溢價 <b>${pct(e.premium)}</b></span>
        <span>規模 <b>${aum(e.aum)}</b></span><span>殖利率 <b>${esc(yieldText)}</b></span></div>
      <div class="rets">${cells.map(([l, v]) => `<div><span>${l}</span><b>${v}</b></div>`).join("")}
        <div class="boxed"><span>${esc(sl)}</span><b>${sv}</b></div>
        <div><span>近 1 年 vs 0050</span><b>${pct(d && d.vs0050_y1)}</b></div></div>
      <p class="chart-note">含息報酬＝股價漲跌＋領到的配息（不假設再投入）・期間是滾動計算（近 1 月＝往回推 1 個月）</p>
    </section>`;
  }

  function tabs(active) {
    return `<nav class="tabs" role="tablist">${TABS.map(([k, l]) =>
      `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === active}">${l}</button>`).join("")}</nav>`;
  }

  // ---------- 操作日報 ----------
  const FLAGS = [["new", "新增"], ["gone", "刪除"], ["add", "加碼"], ["cut", "減碼"]];
  function ops(d, filter) {
    const o = d && d.ops;
    if (!o) return NO_HOLDINGS;
    const prem = (d.premium || []).at(-1);
    const boxes = FLAGS.map(([k, l]) => `<button type="button" class="cnt ${k}" data-filter="${k}" aria-pressed="${filter === k}">
      <b>${o.counts[k]}</b><span>${l}</span></button>`).join("");
    const flagOf = Object.fromEntries(FLAGS.map(([k, l]) => [k, l]));
    const rows = o.rows.filter(r => filter ? r.flag === flagOf[filter] : r.flag);
    const notes = ["加碼／減碼看「每單位持股數」（持股股數 ÷ 受益權單位數，扣掉申購贖回），變動 ≥ 0.5%，而且股數真的有增加／減少才算"];
    if (!o.prev) notes.push("這是第一個持股日，還沒有前一天可以比");
    else if (!o.per_unit) notes.push("這天沒有受益權單位數，未扣除申購贖回（用總股數增減）");
    if (o.diluted) notes.push(`另有 ${o.diluted} 檔每單位持股數的變動來自申購贖回（股數沒變或和每單位變動方向相反），不算加減碼`);
    const body = rows.map(r => `<tr><td class="sticky">${esc(r.n || r.s)}<span class="code">${esc(r.s)}</span></td>
      <td><span class="flag ${esc(r.flag)}">${esc(r.flag || "—")}</span></td>
      <td class="r num">${num(r.dlots, 0)}</td><td class="r num">${isNum(r.dpct) ? pct(r.dpct) : dash}</td>
      <td class="r num">${isNum(r.w) ? `${num(r.w)}%` : dash}<div class="sub">${isNum(r.dw) ? pct(r.dw) : ""}</div></td>
      <td class="r num">${money(r.amt)}</td><td class="r num">${r.streak ? `${r.streak > 0 ? "連買" : "連賣"} ${Math.abs(r.streak)}${r.more ? "+" : ""} 天` : dash}</td></tr>`).join("");
    return `<div class="grid2">
        <div class="card mini"><span>持股日</span><b>${ymd(o.date)}</b><div class="sub">和前一個持股日 ${ymd(o.prev)} 比</div></div>
        <div class="card mini"><span>折溢價（股價｜淨值）</span><b>${prem ? pct(prem[3]) : dash}</b>
          <div class="sub">${prem ? `${num(prem[1])}｜${num(prem[2])}` : ""}</div></div></div>
      <div class="cnts">${boxes}</div>
      <p class="note">變動說明 ⓘ：${notes.map(esc).join("；")}</p>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="sticky">標的</th><th>狀態</th><th class="r">變動張數</th>
        <th class="r">變動幅度（每單位）</th><th class="r">目前權重</th><th class="r">金額</th><th class="r">連續</th></tr></thead>
        <tbody>${body || `<tr><td colspan="7" class="muted">${filter ? "沒有符合的股票" : "這天沒有加減碼"}</td></tr>`}</tbody></table></div>`;
  }

  // 股價跟著漲跌上色；漲跌停像券商 App 一樣價格亮底色（紅底＝漲停、綠底＝跌停），不寫字（使用者 2026-11-12）
  function pxCell(r) {
    const cls = r.limit === "up" ? "lim-up" : r.limit === "down" ? "lim-down" : C.signCls(r.chg);
    const tip = r.limit === "up" ? ' title="漲停"' : r.limit === "down" ? ' title="跌停"' : "";
    return `<span class="px-c ${cls}"${tip}>${num(r.px)}</span> ${pct(r.chg)}`;
  }
  // 台股漲跌停（同 metrics.limit_flag）：參考價 ×1.1 依升降單位往下取、×0.9 往上取
  const tick = p => p < 10 ? 0.01 : p < 50 ? 0.05 : p < 100 ? 0.1 : p < 500 ? 0.5 : p < 1000 ? 1 : 5;
  function limitFlag(price, ref) {
    if (!isNum(price) || !isNum(ref) || ref <= 0) return null;
    const hi = ref * 1.1, lo = ref * 0.9;
    const up = Math.floor(hi / tick(hi) + 1e-6) * tick(hi), down = Math.ceil(lo / tick(lo) - 1e-6) * tick(lo);
    return Math.abs(price - up) < 1e-6 ? "up" : Math.abs(price - down) < 1e-6 ? "down" : null;
  }

  // 成分股即時價（轉接站 /stocks，和舊版同一套 Live.mergeComponents）：股價、漲跌、漲跌停用即時；張數、權重、市值照持股日
  function liveRows(rows, stocks, priceDate, closed) {
    const L = typeof Live !== "undefined" ? Live : require("../web/live.js");
    if (!stocks) return rows;
    const merged = L.mergeComponents(rows, stocks, priceDate, closed);
    if (merged === rows) return rows;
    return merged.map(r => {
      const q = r.live && stocks.quotes[r.s];
      return q ? { ...r, limit: limitFlag(q[0], q[1]) } : r;
    });
  }

  // ---------- 成分股／產業分布 ----------
  const HOLD_COLS = [
    { key: "s", label: "代號", text: 1, cls: "code-col", get: r => r.s, html: r => esc(r.s) },
    { key: "n", label: "標的", text: 1, tags: 1, get: r => r.n, html: r => esc(r.n || r.s) },
    { key: "mv", label: "持股市值", r: 1, get: r => r.mv, html: r => `${money(r.mv)}<div class="sub">${num(r.lots, r.lots % 1 ? 3 : 0)} 張</div>` },
    { key: "w", label: "權重", r: 1, get: r => r.w, html: r => isNum(r.w) ? `${num(r.w)}%` : dash, top: "w", tag: "權重" },
    { key: "chg", label: "股價與漲跌", r: 1, get: r => r.chg, html: pxCell },
  ];

  function nonstockNote(h) {
    if (!h || !h.nonstock) return "";
    const when = h.others_date && h.others_date !== h.date ? `（投信資料日 ${ymd(h.others_date)}）` : "";
    return h.nonstock.estimated
      ? `非股票部位（現金、期貨等）${num(h.nonstock.w)}%：這家投信沒有公布明細（或網站擋程式），用 100% − 股票權重估算，未公布明細`
      : `現金、期貨、保證金、選擇權照投信官網公布${when}；選擇權是賣出的買權，權重是負的，不畫進圓餅圖`;
  }

  function holdings(d, view, s, base) {
    const h = d && d.holdings;
    if (!h) return NO_HOLDINGS;
    const sw = `<div class="chips"><button type="button" data-hview="stocks" aria-pressed="${view !== "industry"}">成分股</button>
      <button type="button" data-hview="industry" aria-pressed="${view === "industry"}">產業分布</button></div>`;
    if (view === "industry") {
      const ind = d.industry || [];
      const baseMap = base && base !== d && base.industry ? new Map(base.industry.map(i => [i.name, i.w])) : null;
      const max = Math.max(1, ...ind.map(i => Math.abs(i.w)));
      const rows = ind.map(i => `<tr><td class="sticky">${esc(i.name)}</td><td class="r num">${num(i.w)}%</td>
        <td class="barcell"><span class="ibar${i.nonstock ? " ns" : ""}" style="width:${Math.max(0, i.w) / max * 100}%"></span></td>
        ${baseMap ? `<td class="r num">${baseMap.has(i.name) ? `${num(baseMap.get(i.name))}%` : dash}</td>` : ""}</tr>`).join("");
      const items = ind.map(i => ({ name: i.name, w: i.w, nonstock: i.nonstock, estimated: i.nonstock && !!h.nonstock && h.nonstock.estimated }));
      return `${sw}<section class="card">${DN.svg(DN.slices(items))}</section>
        <p class="note">國內股票用證交所／櫃買公布的產業別；海外股票一律歸「海外」。${esc(nonstockNote(h))}</p>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="sticky">產業</th><th class="r">權重</th><th></th>
        ${baseMap ? '<th class="r">0050</th>' : ""}</tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    const items = h.rows.map(r => ({ name: r.n || r.s, w: r.w }))
      .concat(h.others.length ? h.others.map(o => ({ name: o.name, w: o.w, nonstock: true }))
        : h.nonstock ? [{ name: "非股票部位", w: h.nonstock.w, nonstock: true, estimated: true }] : []);
    const t = TB.render("hold", HOLD_COLS, h.rows, s);
    const others = h.others.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="sticky">股票以外</th><th>類別</th>
      <th class="r">金額</th><th class="r">權重</th></tr></thead><tbody>${h.others.map(o => `<tr><td class="sticky">${esc(o.name)}</td>
      <td>${esc(o.kind)}</td><td class="r num">${money(o.amt)}</td><td class="r num">${isNum(o.w) ? pct(o.w) : dash}</td></tr>`).join("")}
      </tbody></table></div>` : "";
    return `${sw}<section class="card">${DN.svg(DN.slices(items))}</section>
      <p class="note">持股日 ${ymd(h.date)}・市值用持股日股價・股價與漲跌用${h.rows.some(r => r.live) ? '<span class="live-tag">即時報價</span>' : "最新收盤"}（海外股沒有即時）・${esc(nonstockNote(h))}</p>${t.html}${others}`;
  }

  // ---------- 折溢價 ----------
  function premium(d) {
    const p = (d && d.premium) || [];
    if (!p.length) return '<p class="empty">沒有淨值資料</p>';
    const note = p.length < 20 ? `<p class="note">資料自 ${ymd(p[0][0])} 起（證交所淨值從這天開始收集）</p>` : "";
    const rows = p.slice().reverse().map(r => `<tr><td class="sticky">${ymd(r[0])}</td><td class="r num">${num(r[1])}</td>
      <td class="r num">${num(r[2], r[2] % 1 && String(r[2]).split(".")[1]?.length > 2 ? 4 : 2)}</td><td class="r num">${pct(r[3])}</td></tr>`).join("");
    return `${note}<section class="card"><div class="legend" id="prem-legend"></div><div class="chart short" id="prem-bars"></div>
      <div class="chart short" id="prem-lines"></div></section>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="sticky">日期</th><th class="r">股價</th><th class="r">淨值</th>
      <th class="r">折溢價</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  // ---------- 配息 ----------
  function fillText(f) {
    if (!f) return dash;
    if (f.state === "filled") return `${f.days} 天`;
    if (f.state === "open") return `未填息（已 ${f.days} 個交易日）`;
    if (f.state === "today") return "今天除息";
    return "已公告";
  }
  function dividend(d) {
    const rows = (d && d.dividends) || [];
    if (!rows.length) return '<p class="empty">這檔沒有配息紀錄</p>';
    return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="sticky">除息日</th><th class="r">每單位配息</th>
      <th class="r">除息前收盤</th><th class="r">單次殖利率</th><th class="r">填息</th></tr></thead><tbody>${rows.map(r =>
      `<tr><td class="sticky">${ymd(r.date)}</td><td class="r num">${num(r.cash, 3)}</td><td class="r num">${num(r.prev_close)}</td>
       <td class="r num">${isNum(r.yield) ? `${num(r.yield)}%` : dash}</td><td class="r">${fillText(r.fill)}</td></tr>`).join("")}</tbody></table></div>
      <p class="note">填息天數：除息日算第 1 天，第一個收盤價回到除息前一天收盤價的交易日；用實際成交價（分割已換算）</p>`;
  }

  // ---------- 基本資料與費用 ----------
  function info(e, d) {
    const f = (d && d.info) || {};
    const v = x => x ? esc(x) : dash;
    const rows = [["基金全名", v(f.full_name)], ["標的指數", v(f.index_name)], ["基金經理人", v(f.manager)],
      ["成立日", v(f.founded && ymd(f.founded))], ["上市日", v(f.listed && ymd(f.listed))], ["保管機構", v(f.custodian)],
      ["發行單位數", isNum(f.units) ? num(f.units, 0) : dash], ["發行投信", v(e.issuer)], ["管理方式", v(e.mgmt)],
      ["類型", v(e.type)], ["區域", v(e.region)], ["配息頻率", v(T.FREQ[e.freq])]];
    const note = d && d.info ? "" : '<p class="note">上櫃 ETF（多半是債券 ETF）的基本資料，證交所開放資料沒有提供</p>';
    return `<div class="tbl-wrap"><table class="tbl kvt"><tbody>${rows.map(([k, x]) => `<tr><th>${k}</th><td>${x}</td></tr>`).join("")}
      ${feeRows(d && d.fees)}</tbody></table></div>${note}`;
  }

  function feeRows(f) {
    if (!f) return '<tr><th>費用</th><td>投信投顧公會沒有這檔的資料（上櫃 ETF 或剛上市）</td></tr>';
    const annual = isNum(f.annual) ? `${num(f.annual)}%${f.estimated ? `（預估：只有 ${f.months} 個月資料，換算一年）` : ""}` : dash;
    return `<tr><th>內扣費用（年）</th><td>${annual}<div class="sub">近 12 個月經理費＋保管費＋保證費＋其他費用 ÷ 目前規模（公會沒有同期淨資產，規模變化大的會有誤差）・不含交易成本</div></td></tr>
      <tr><th>經理費（說明書）</th><td>${f.mgmt_text ? esc(f.mgmt_text) : dash}</td></tr>
      <tr><th>保管費（說明書）</th><td>${f.custody_text ? esc(f.custody_text) : dash}</td></tr>
      <tr><th>交易成本（近一年）</th><td>${money(f.trade)}<div class="sub">手續費＋交易稅（資料：投信投顧公會）</div></td></tr>`;
  }

  return { head, tabs, ops, holdings, premium, dividend, info, money, limitFlag, liveRows, TABS };
})();

if (typeof module !== "undefined") module.exports = Detail;
