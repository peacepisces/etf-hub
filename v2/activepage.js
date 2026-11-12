// 主動式專區（第 5 階段）：A 績效 vs 0050（期間可切）、B 報酬走勢疊圖（最多 8 檔＋0050 灰虛線）、C 投信比較、D 經理人共識。
"use strict";

const Act = (() => {
  const C = typeof Core !== "undefined" ? Core : require("./core.js");
  const TB = typeof V2Table !== "undefined" ? V2Table : require("./table.js");
  const { esc, isNum, dash, num, pct, aum } = C;
  const MAX = 8;
  // 期間：欄名照實寫（滾動），spec「本週／本月／本季」＝近 1 週／近 1 月／近 3 月
  const PERIODS = [["d1", "今日"], ["w1", "近 1 週"], ["m1", "近 1 月"], ["m3", "近 3 月"], ["m6", "近 6 月"],
                   ["ytd", "今年以來"], ["y1", "近 1 年"], ["since", "上市以來"]];
  const FLOW_OF = { d1: "d1", w1: "w1", m1: "m1" };

  // live：盤中即時漲跌 {代號: %}（overview 合併即時後的 chg_pct；除息日已用平盤價比）。只用在「今日」，其他期間是昨天收盤算的
  function rows(data, p, live) {
    const base = (data && data.base) || {};
    const useLive = p === "d1" && live && isNum(live["0050"]);
    return ((data && data.etfs) || []).map(e => {
      const v = useLive && isNum(live[e.code]) ? live[e.code] : e.ret ? e.ret[p] : null;
      const b = useLive ? live["0050"] : p === "since" ? e.base_since : base[p];
      const fk = FLOW_OF[p] || "m1";
      return { code: e.code, name: e.name, issuer: e.issuer, aum: e.aum, v: isNum(v) ? v : null,
               vs: isNum(v) && isNum(b) ? Math.round((v - b) * 100) / 100 : null,
               flow: e.flow ? e.flow[fk] : null, flowFull: e.flow && e.flow.full ? e.flow.full[fk] !== false : true, flowKey: fk };
    });
  }

  function issuers(list) {
    const g = new Map();
    for (const r of list) {
      const x = g.get(r.issuer) || { issuer: r.issuer, vals: [], win: 0, aum: 0, codes: [] };
      if (isNum(r.v)) x.vals.push(r.v);
      if (isNum(r.vs) && r.vs > 0) x.win++;
      x.aum += isNum(r.aum) ? r.aum : 0;
      x.codes.push(r.code);
      g.set(r.issuer, x);
    }
    return [...g.values()].map(x => ({ issuer: x.issuer, n: x.vals.length, codes: x.codes, win: x.win, aum: x.aum,
      avg: x.vals.length ? Math.round(x.vals.reduce((a, b) => a + b, 0) / x.vals.length * 100) / 100 : null }))
      .sort((a, b) => (b.avg ?? -1e9) - (a.avg ?? -1e9));
  }

  function toggle(sel, code) {
    if (sel.includes(code)) return sel.filter(c => c !== code);
    return sel.length >= MAX ? sel : sel.concat(code);
  }

  function money(v) {
    if (!isNum(v)) return dash;
    const a = Math.abs(v), s = v < 0 ? "−" : v > 0 ? "+" : "";
    return a >= 1e8 ? `${s}${num(a / 1e8, 2)} 億` : `${s}${num(a / 1e4, 0)} 萬`;
  }

  function page(data, radar, st) {
    if (!data) return '<p class="empty">主動式資料還沒產生</p>';
    const p = st.period;
    const list = rows(data, p, st.live);
    const chips = PERIODS.map(([k, l]) => `<button type="button" data-aperiod="${k}" aria-pressed="${k === p}">${l}</button>`).join("");
    const plabel = (PERIODS.find(x => x[0] === p) || [, ""])[1];
    const flowLabel = { d1: "今日", w1: "近 1 週", m1: "近 1 月" }[list[0] ? list[0].flowKey : "m1"];
    const cols = [
      { key: "code", label: "代號", text: 1, cls: "code-col", get: r => r.code, html: r => `<label class="cc"><input type="checkbox" data-asel="${esc(r.code)}" ${st.sel.includes(r.code) ? "checked" : ""} aria-label="加入下方報酬走勢圖" title="加入下方 B. 報酬走勢圖">${esc(r.code)}</label>` },
      { key: "name", label: "名稱", text: 1, tags: 1, get: r => r.name, html: r => `<a href="#/etf/${encodeURIComponent(r.code)}">${esc(r.name)}</a>` },
      { key: "v", label: plabel, r: 1, get: r => r.v, html: r => pct(r.v), top: "ytd", tag: "報酬" },
      { key: "vs", label: "vs 0050", r: 1, get: r => r.vs, html: r => pct(r.vs) },
      { key: "flow", label: `資金流向（${flowLabel}）`, r: 1, get: r => r.flow, html: r => `${money(r.flow)}${r.flowFull ? "" : '<span class="sub">*</span>'}`, top: "aum", tag: "吸金" },
      { key: "aum", label: "規模", r: 1, get: r => r.aum, html: r => aum(r.aum) },
      { key: "issuer", label: "投信", text: 1, get: r => r.issuer, html: r => esc(r.issuer || "—") }];
    const t = TB.render("act", cols, list, st.sort);
    const win = list.filter(r => isNum(r.vs) && r.vs > 0).length, tot = list.filter(r => isNum(r.vs)).length;
    const iss = issuers(list).map(g => `<tr class="link" data-aissuer="${esc(g.issuer)}"><td class="sticky">${esc(g.issuer)} ${st.issuer === g.issuer ? "▾" : "▸"}</td>
      <td class="r num">${pct(g.avg)}</td><td class="r num">${g.win}/${g.n}</td><td class="r num">${aum(g.aum)}</td><td class="r num">${g.codes.length}</td></tr>
      ${st.issuer === g.issuer ? list.filter(r => r.issuer === g.issuer).map(r => `<tr class="sub-row"><td class="sticky">　<a href="#/etf/${encodeURIComponent(r.code)}">${esc(r.name)}</a><span class="code">${esc(r.code)}</span></td>
        <td class="r num">${pct(r.v)}</td><td class="r num">${pct(r.vs)}</td><td class="r num">${aum(r.aum)}</td><td></td></tr>`).join("") : ""}`).join("");
    const cons = (typeof Today !== "undefined" ? Today : require("./today.js")).radarRows(radar, false).slice(0, 30);
    const consRows = cons.map(r => `<tr class="link" data-href="#/stock/${encodeURIComponent(r.s)}"><td class="sticky">${esc(r.n || r.s)}<span class="code">${esc(r.s)}</span></td>
      <td class="r num">${r.holders}</td><td class="r num up">${r.add.length || dash}</td><td class="r num down">${r.cut.length || dash}</td>
      <td class="r num">${r.new.length ? `<span class="tag2 ach">${r.new.length}</span>` : dash}</td></tr>`).join("");
    const chips2 = Chart.RANGES.map(([k, l]) => `<button type="button" data-range="${k}" aria-pressed="${k === st.range}">${l}</button>`).join("");
    return `<section class="card"><div class="tc-head"><h2>A. 績效 vs 0050</h2><span class="meta">${plabel}贏 0050：<b>${win}/${tot}</b> 檔</span></div>
        <div class="chips">${chips}</div>
        <p class="hint">☑ 左邊打勾的 ETF 會畫進下方「B. 報酬走勢」，和 0050 比較走勢（已選 ${st.sel.length}/${MAX}，<a href="#/active" data-aclear="1">全部取消</a>）</p>
        <p class="note">${p === "d1" && st.live ? `今日＝盤中即時（證交所 ${esc(st.liveTime || "")}）・` : ""}報酬含息・期間是滾動計算・上市以來和 0050 比同一段期間（不滿一年是累積、滿一年年化）・資金流向＝受益權單位數變化×淨值，* ＝資料從 11/05 起、不滿整段</p></section>
      ${t.html}
      <section class="card"><div class="tc-head"><h2>B. 報酬走勢</h2><div class="chips">${chips2}</div></div>
        ${st.sel.length ? `<div class="legend" id="alegend"></div><div class="chart" id="achart"></div>` : '<p class="empty">在上面的表格勾選 ETF（最多 8 檔），和 0050 一起比較</p>'}
        <p class="note">期間第一天＝0%（還沒上市的從上市日起算）・0050 是灰色虛線・點圖例可以隱藏</p></section>
      <section class="card"><h2>C. 投信比較（${plabel}）</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th class="sticky">投信</th>
        <th class="r">平均報酬</th><th class="r">贏 0050</th><th class="r">總規模</th><th class="r">檔數</th></tr></thead><tbody>${iss}</tbody></table></div>
        <p class="note">平均＝簡單平均（沒有報酬的新 ETF 不算）・點一家展開旗下各檔</p></section>
      <section class="card"><div class="tc-head"><h2>D. 經理人共識（今天）</h2><a class="more" href="#/holdings">完整雷達 →</a></div>
        <div class="tbl-wrap"><table class="tbl mini-t"><thead><tr><th class="sticky">股票</th><th class="r">持有檔數</th><th class="r">加碼</th><th class="r">減碼</th><th class="r">新建倉</th></tr></thead>
        <tbody>${consRows || '<tr><td colspan="5" class="muted">今天沒有動作</td></tr>'}</tbody></table></div>
        <p class="note">只看主動式 ETF・加碼／減碼看每單位持股數 ≥0.5% 且股數同方向・各 ETF 依各自最新持股日</p></section>`;
  }

  return { rows, issuers, toggle, page, PERIODS, MAX };
})();

if (typeof module !== "undefined") module.exports = Act;
