// 總覽（使用者 2026-11-12：排行太雜沒重點 → 跟舊版結合）：上方切換 行情（預設）｜排行榜｜報酬比較｜全部 ETF。
// 行情＝舊版總覽的簡單表（盤中即時）；排行榜＝各類前 5 名小卡；報酬比較＝各期間含息報酬＋成立以來年化（不混成交、資金等）；
// 全部 ETF＝依類別分組。網頁和 node 測試共用。
"use strict";

const Ovw = (() => {
  const C = typeof Core !== "undefined" ? Core : require("./core.js");
  const TB = typeof V2Table !== "undefined" ? V2Table : require("./table.js");
  const R = typeof Rank !== "undefined" ? Rank : require("./rankpage.js");
  const { esc, isNum, dash, num, pct, aum } = C;
  const TABS = [["quote", "行情"], ["flow", "資金與成交"], ["ret", "報酬比較"], ["board", "排行榜"], ["all", "全部 ETF"]];
  const href = code => `#/etf/${encodeURIComponent(code)}`;

  function money(v) {   // 金額：億／萬（不帶正負號）
    if (!isNum(v)) return dash;
    const a = Math.abs(v);
    return a >= 1e8 ? `${num(a / 1e8, 2)} 億` : `${num(a / 1e4, 0)} 萬`;
  }
  function signedMoney(v) {
    if (!isNum(v)) return dash;
    return `<span class="${v > 0 ? "up" : v < 0 ? "down" : ""}">${v > 0 ? "+" : v < 0 ? "−" : ""}${money(v)}</span>`;
  }

  // 從別頁連過來：#/rank?tab=quote&chip=高股息&sort=chg_pct&dir=1（app.js 讀了就清掉網址參數）
  function link(tab, opts = {}) {
    const p = new URLSearchParams({ tab });
    if (opts.chip) p.set("chip", opts.chip);
    if (opts.sort) p.set("sort", opts.sort);
    if (opts.dir === 1) p.set("dir", "1");
    return `#/rank?${p.toString()}`;
  }

  function tabs(cur) {
    return `<nav class="tabs">${TABS.map(([k, l]) => `<button type="button" data-otab="${k}" aria-selected="${cur === k}">${l}</button>`).join("")}</nav>`;
  }

  // ---------- 行情：代號、名稱、投信、價格、漲跌、淨值、折溢價、成交金額、規模 ----------
  // 搜尋：代號或名稱包含；投信下拉；篩選 chips 跟完整排行共用（同一組任一、不同組都要符合）
  function quoteRows(o, f, st) {
    const q = String(st.q || "").trim().toUpperCase();
    const vol = (f && f.volume) || {};
    return R.filter(o.etfs, st.chips || [])
      .filter(e => !st.issuer || e.issuer === st.issuer)
      .filter(e => !q || e.code.toUpperCase().includes(q) || String(e.name || "").toUpperCase().includes(q))
      .map(e => ({ ...e, value: vol[e.code] ? vol[e.code].value : null }));
  }
  // 成交金額是每晚更新的（前一個交易日），盤中價格是即時的：欄名標日期，免得以為是今天（使用者 2026-11-12）
  const quoteCols = day => QUOTE_COLS.map(c => c.key === "value" ? { ...c, label: `成交金額（${day}）` } : c);
  const QUOTE_COLS = [
    { key: "code", label: "代號", text: 1, cls: "code-col", get: r => r.code, html: r => esc(r.code) },
    { key: "name", label: "名稱", text: 1, tags: 1, get: r => r.name, html: r => esc(r.name) },
    { key: "issuer", label: "投信", text: 1, get: r => r.issuer, html: r => esc(r.issuer || "—") },
    { key: "price", label: "價格", r: 1, get: r => r.price, html: r => num(r.price) },
    { key: "chg_pct", label: "漲跌", r: 1, get: r => r.chg_pct, html: r => pct(r.chg_pct) },
    { key: "nav", label: "淨值", r: 1, get: r => r.nav, html: r => num(r.nav) },
    { key: "premium", label: "折溢價", r: 1, get: r => r.premium, html: r => pct(r.premium) },
    { key: "value", label: "成交金額", r: 1, get: r => r.value, html: r => money(r.value) },
    { key: "aum", label: "規模", r: 1, get: r => r.aum, html: r => aum(r.aum) }];

  function quote(o, f, st, live) {
    const list = quoteRows(o, f, st);
    const issuers = [...new Set(o.etfs.map(e => e.issuer).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-Hant"));
    const chips = R.CHIP_GROUPS.map(g => g.map(([l]) => `<button type="button" data-rchip="${esc(l)}" aria-pressed="${(st.chips || []).includes(l)}">${esc(l)}</button>`).join("")).join('<span class="sep"></span>');
    const vday = f && f.end ? C.shortDate(f.end) : C.shortDate(o.price_date);
    const t = TB.render("quote", quoteCols(vday), list, st.sort, { rowLink: r => href(r.code) });
    const asof = live ? `盤中即時（證交所 ${esc(live)}），淨值是預估` : `${C.shortDate(o.price_date)} 收盤`;
    return `<section class="card"><div class="ov-tools">
        <input type="search" data-oq value="${esc(st.q || "")}" placeholder="篩選：代號或名稱" aria-label="篩選代號或名稱" autocomplete="off">
        <select data-oissuer aria-label="投信"><option value="">全部投信</option>${issuers.map(i => `<option${i === st.issuer ? " selected" : ""}>${esc(i)}</option>`).join("")}</select></div>
      <div class="chips" style="margin-top:8px">${chips}</div>
      <p class="note">共 ${list.length} 檔・${asof}・點欄位名稱排序、點一列看詳細</p></section>${t.html}`;
  }

  // ---------- 排行榜：每類一張小卡、前 5 名，期間可切；「看完整排行」帶條件跳過去 ----------
  // [標題, 篩選（完整排行的 chips）, 預設指標]；ret＝含息報酬（期間可切）
  // 期間表現的卡（上面另有「今天」的卡：最吸金、最失血、爆量、漲跌幅、折溢價，跟今日焦點同一組；使用者 2026-11-12 要兩種都在）
  const BOARDS = [["主動式", ["主動"], "ret"], ["市值型", ["市值型"], "ret"], ["高股息", ["高股息"], "ret"], ["債券", ["債"], "ret"]];
  const BOARD_PERIODS = R.PERIODS.filter(([k]) => k !== "y3");
  // 高股息、債券卡多一個「殖利率」（舊版有，使用者 2026-11-12）；連到配息頁的哪一類
  const YIELD_BOARDS = { 主動式: "active", 市值型: "cap", 高股息: "high", 債券: "bond" };   // 四張報酬卡都有（使用者 2026-11-12）

  function board(o, f, fees, st) {
    const cards = BOARDS.map(([title, chips, ind]) => {
      const yb = YIELD_BOARDS[title];
      let p = ind === "ret" ? (st.board[title] || "ytd") : "d1";
      if (p === "yield" && !yb) p = "ytd";
      const k = p === "yield" ? "yield" : ind;
      const rows = R.filter(R.rows(o, f, fees, p === "yield" ? "ytd" : p), chips);
      const val = r => r[k];
      // 爆量：成交 5 千萬以上才算；殖利率：上市未滿一年的預估值不列（常是一次配息推算，會偏高）
      const ok = k === "ratio" ? (r => isNum(r.ratio) && r.value >= 5e7) : k === "yield" ? (r => isNum(r.yield) && !r.yield_est) : (r => isNum(val(r)));
      const top = rows.filter(ok).sort((a, b) => val(b) - val(a)).slice(0, 5);
      const show = k === "ret" ? (r => pct(r.ret)) : k === "yield" ? (r => `${num(r.yield)}%`) : k === "flow" ? (r => signedMoney(r.flow)) : (r => `${num(r.ratio, 1)} 倍`);
      const opts = BOARD_PERIODS.concat(yb ? [["yield", "殖利率"]] : []);
      const sel = ind === "ret" ? `<select data-oboard="${esc(title)}" aria-label="${esc(title)} 期間">${opts.map(([v, l]) =>
        `<option value="${v}"${v === p ? " selected" : ""}>${l}</option>`).join("")}</select>` : `<span class="meta">${ind === "flow" ? "今日" : "今天 ÷ 前 20 日均量"}</span>`;
      const go = k === "yield" ? `div|${yb}` : ind === "ret" ? `ret|${p}|${chips.join(",")}` : "";
      const goLabel = k === "yield" ? "看配息頁 →" : "看報酬比較 →";
      return `<section class="card bd"><div class="tc-head"><h2>${esc(title)}</h2>${sel}</div>
        <ol class="toplist">${top.map(r => `<li><a href="${href(r.code)}">${esc(r.name)}<span class="code">${esc(r.code)}</span></a><b>${show(r)}</b></li>`).join("") || '<li class="muted">資料不足</li>'}</ol>
        ${go ? `<button type="button" class="more" data-ogo="${esc(go)}">${goLabel}</button>` : ""}</section>`;
    }).join("");
    const TD = typeof Today !== "undefined" ? Today : require("./today.js");
    return `<h2 class="sec">今天</h2>${TD.lowerCards(o, f, { noInst: true })}
      <h2 class="sec">期間表現</h2><div class="tgrid">${cards}</div><p class="note">含息報酬＝股價＋領到的配息（不再投入）・盤中算到現在・殖利率＝近一年配息 ÷ 現價，上市未滿一年的預估值不列入</p>`;
  }

  // ---------- 資金與成交：價格、漲跌、成交金額、爆量倍數、資金流向（今日／近 1 週／近 1 月）、規模 ----------
  const FLOW_KEYS = [["d1", "今日"], ["w1", "近 1 週"], ["m1", "近 1 月"]];
  function flowRows(o, f, st) {
    const q = String(st.q || "").trim().toUpperCase();
    const fl = (f && f.flows) || {}, vol = (f && f.volume) || {};
    return R.filter(o.etfs, st.chips || [])
      .filter(e => !q || e.code.toUpperCase().includes(q) || String(e.name || "").toUpperCase().includes(q))
      .map(e => {
        const x = fl[e.code] || {}, v = vol[e.code] || {};
        const r = { ...e, value: isNum(v.value) ? v.value : null, ratio: isNum(v.ratio) ? v.ratio : null };
        for (const [k] of FLOW_KEYS) { r["f_" + k] = isNum(x[k]) ? x[k] : null; r["ff_" + k] = !(x.full && x.full[k] === false); }
        const ins = f && f.insti && f.insti.rows ? f.insti.rows[e.code] : null;
        ["i_f", "i_t", "i_d", "i_tot"].forEach((k, i) => { r[k] = ins ? ins[i] : null; });
        return r;
      });
  }
  function flowCols(day) {
    return [
      { key: "code", label: "代號", text: 1, cls: "code-col", get: r => r.code, html: r => esc(r.code) },
      { key: "name", label: "名稱", text: 1, tags: 1, get: r => r.name, html: r => esc(r.name) },
      { key: "price", label: "價格", r: 1, get: r => r.price, html: r => num(r.price) },
      { key: "chg_pct", label: "漲跌", r: 1, get: r => r.chg_pct, html: r => pct(r.chg_pct) },
      { key: "value", label: `成交金額（${day}）`, r: 1, cls: "sep", get: r => r.value, html: r => money(r.value) },
      { key: "ratio", label: "爆量倍數", r: 1, get: r => r.ratio, html: r => isNum(r.ratio) ? `${num(r.ratio, 1)} 倍` : dash },
      ...FLOW_KEYS.map(([k, l]) => ({ key: "f_" + k, label: l, r: 1, cls: k === "d1" ? "sep" : "", get: r => r["f_" + k],
        html: r => `${signedMoney(r["f_" + k])}${r["ff_" + k] ? "" : '<span class="sub">*</span>'}` })),
      ...INSTI_KEYS.map(([k, l], i) => ({ key: k, label: l, r: 1, cls: i === 0 ? "sep" : "", get: r => r[k], html: r => signedMoney(r[k]) })),
      { key: "aum", label: "規模", r: 1, cls: "sep", get: r => r.aum, html: r => aum(r.aum) }];
  }
  const INSTI_KEYS = [["i_f", "外資"], ["i_t", "投信"], ["i_d", "自營商"], ["i_tot", "合計"]];
  function flow(o, f, st) {
    const list = flowRows(o, f, st);
    const day = f && f.end ? C.shortDate(f.end) : C.shortDate(o.price_date);
    const chips = R.CHIP_GROUPS.map(g => g.map(([l]) => `<button type="button" data-rchip="${esc(l)}" aria-pressed="${(st.chips || []).includes(l)}">${esc(l)}</button>`).join("")).join('<span class="sep"></span>');
    const t = TB.render("flow", flowCols(day), list, st.sort, { rowLink: r => href(r.code),
      groups: [{ label: "資金流向（受益權單位數變化 × 淨值）", keys: FLOW_KEYS.map(([k]) => "f_" + k) },
               { label: `三大法人買賣超（${f && f.insti ? C.shortDate(f.insti.date) : "—"}）`, keys: INSTI_KEYS.map(([k]) => k) }] });
    const since = Object.values((f && f.flows) || {}).map(v => v.since).filter(Boolean).sort()[0];
    return `<section class="card"><div class="ov-tools">
        <input type="search" data-oq value="${esc(st.q || "")}" placeholder="篩選：代號或名稱" aria-label="篩選代號或名稱" autocomplete="off"></div>
      <div class="chips" style="margin-top:8px">${chips}</div>
      <p class="note">共 ${list.length} 檔・成交金額、資金流向是 ${day} 的資料（每晚更新），價格、漲跌盤中即時・
        爆量倍數＝成交金額 ÷ 前 20 個交易日平均・資金流向＝ETF 總單位數的變化 × 淨值（流入＝投信新發行），* ＝資料自 ${since ? C.shortDate(since) : "—"} 起、不滿整段・
        三大法人＝買賣超股數 × 收盤（自營商多是造市、避險，主要參考外資、投信）</p></section>${t.html}`;
  }

  // ---------- 報酬比較：各期間含息報酬（股價＋配息，不再投入）＋成立以來年化、費用、規模 ----------
  const RET_PERIODS = [["d1", "今日"], ["m1", "近 1 月"], ["m3", "近 3 月"], ["m6", "近 6 月"], ["ytd", "今年以來"], ["y1", "近 1 年"], ["y3", "近 3 年"]];
  function retRows(o, fees, st) {
    const q = String(st.q || "").trim().toUpperCase();
    return R.filter(o.etfs, st.chips || [])
      .filter(e => !q || e.code.toUpperCase().includes(q) || String(e.name || "").toUpperCase().includes(q))
      .map(e => {
        const fe = fees ? fees[e.code] : null;
        const r = { ...e, fee: fe && isNum(fe.annual) ? fe.annual : null, feeEst: !!(fe && fe.estimated) };
        for (const [k] of RET_PERIODS) r["r_" + k] = k === "d1" ? e.chg_pct : (e.ret || {})[k] ?? null;
        r.r_since = e.since ? e.since.pct : null;
        return r;
      });
  }
  const ym = d => d ? d.slice(0, 7).replace("-", "/") : "";
  function sinceHtml(r) {
    const s = r.since;
    if (!s || !isNum(s.pct)) return dash;
    const tip = `${s.ann ? "年化" : "累積（成立未滿一年）"}・自 ${ym(s.start)} 起`;
    return `<span title="${esc(tip)}">${pct(s.pct)}${s.ann ? "" : '<sup class="cum">累積</sup>'}</span>`;
  }
  function retCols() {
    return [
      { key: "code", label: "代號", text: 1, cls: "code-col", get: r => r.code, html: r => esc(r.code) },
      { key: "name", label: "名稱", text: 1, tags: 1, get: r => r.name, html: r => esc(r.name) },
      { key: "price", label: "價格", r: 1, get: r => r.price, html: r => num(r.price) },
      ...RET_PERIODS.map(([k, l]) => ({ key: "r_" + k, label: l, r: 1, cls: k === "d1" ? "" : "", get: r => r["r_" + k], html: r => pct(r["r_" + k]),
        ...(k === "ytd" ? { top: "ytd", tag: "今年" } : k === "y1" ? { top: "y1", tag: "1年" } : {}) })),
      { key: "r_since", label: "成立以來年化", r: 1, cls: "sep", get: r => r.r_since, html: sinceHtml, top: "yld", tag: "年化" },
      { key: "fee", label: "內扣費用", r: 1, get: r => r.fee, html: r => isNum(r.fee) ? `${num(r.fee)}%${r.feeEst ? "*" : ""}` : dash },
      { key: "aum", label: "規模", r: 1, get: r => r.aum, html: r => aum(r.aum) }];
  }
  function returns(o, fees, st, live) {
    const list = retRows(o, fees, st);
    const chips = R.CHIP_GROUPS.map(g => g.map(([l]) => `<button type="button" data-rchip="${esc(l)}" aria-pressed="${(st.chips || []).includes(l)}">${esc(l)}</button>`).join("")).join('<span class="sep"></span>');
    const t = TB.render("rank", retCols(), list, st.sort, { rowLink: r => href(r.code),
      groups: [{ label: "含息報酬（股價＋領到的配息，不再投入）", keys: RET_PERIODS.map(([k]) => "r_" + k) }] });
    return `<section class="card"><div class="ov-tools">
        <input type="search" data-oq value="${esc(st.q || "")}" placeholder="篩選：代號或名稱" aria-label="篩選代號或名稱" autocomplete="off"></div>
      <div class="chips" style="margin-top:8px">${chips}</div>
      <p class="note">共 ${list.length} 檔・${live ? `盤中即時（證交所 ${esc(live)}），報酬算到現在` : `算到 ${C.shortDate(o.price_date)} 收盤`}・期間是滾動計算・
        成立以來：滿一年是年化、未滿一年標「累積」，滑鼠移上去看起算月（很早上市的從 2010 起算）・內扣費用 * ＝不滿一年換算的預估・點欄位名稱排序</p></section>${t.html.replace('class="tbl-wrap"', 'class="tbl-wrap ret-tbl"')}`;
  }

  // ---------- 全部 ETF：依類別分組 ----------
  function all(o) {
    const groups = [["主動式", e => e.mgmt === "主動"], ["市值型", e => e.mgmt !== "主動" && e.type === "市值型"],
      ["高股息", e => e.mgmt !== "主動" && e.type === "高股息"], ["債券", e => e.mgmt !== "主動" && e.type === "債券"],
      ["槓桿／反向", e => e.type === "槓反"], ["期貨", e => e.type === "期貨"]];
    const used = new Set();
    const out = groups.map(([g, f]) => {
      const list = o.etfs.filter(e => !used.has(e.code) && f(e)).sort((a, b) => a.code.localeCompare(b.code));
      list.forEach(e => used.add(e.code));
      return [g, list];
    });
    out.push(["其他", o.etfs.filter(e => !used.has(e.code)).sort((a, b) => a.code.localeCompare(b.code))]);
    return `<p class="note">全部 ${o.etfs.length} 檔，依類別分組・點名稱看詳細</p>${out.filter(([, l]) => l.length).map(([g, list]) =>
      `<section class="card"><h2>${esc(g)}<span class="badge">${list.length}</span></h2><div class="all-list">${list.map(e =>
        `<a href="${href(e.code)}"><span class="code">${esc(e.code)}</span>${esc(e.name)}</a>`).join("")}</div></section>`).join("")}`;
  }

  function page(o, f, fees, st, live) {
    const tab = TABS.some(([k]) => k === st.tab) ? st.tab : "quote";
    const body = tab === "quote" ? quote(o, f, { ...st, sort: st.qsort }, live)
      : tab === "flow" ? flow(o, f, { ...st, sort: st.fsort })
      : tab === "board" ? board(o, f, fees, st)
      : tab === "ret" ? returns(o, fees, st, live)
      : all(o);
    return tabs(tab) + `<div class="tab-body">${body}</div>`;
  }

  return { TABS, BOARDS, page, quote, quoteRows, flow, flowRows, board, all, returns, retRows, link };
})();

if (typeof module !== "undefined") module.exports = Ovw;
