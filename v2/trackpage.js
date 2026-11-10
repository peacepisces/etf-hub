// 持股追蹤（第 6 階段）：換股雷達完整版、個股多檔反查、持股重疊。
"use strict";

const Track = (() => {
  const C = typeof Core !== "undefined" ? Core : require("./core.js");
  const TB = typeof V2Table !== "undefined" ? V2Table : require("./table.js");
  const TD = () => (typeof Today !== "undefined" ? Today : require("./today.js"));
  const { esc, isNum, dash, num } = C;
  const round = v => Math.round(v * 100) / 100;

  // 台股代號（可帶 TT）或海外「代號 市場」；大小寫不拘
  function parseCodes(text) {
    const up = String(text || "").toUpperCase();
    const out = [];
    for (const m of up.matchAll(/\d{4,6}[A-Z]?(?:\s+TT\b)?|[A-Z][A-Z0-9.]*\s+[A-Z]{2}\b/g)) {
      const c = m[0].replace(/\s+TT$/, "").replace(/\s+/g, " ");
      if (!out.includes(c)) out.push(c);
    }
    return out;
  }

  // 每列一檔 ETF：各股比重＋合計；mode all＝全部都持有、any＝至少一檔
  function multi(index, codes, mode) {
    const by = new Map();
    for (const c of codes) {
      for (const [etf, w] of ((index.stocks || {})[c] || {}).h || []) {
        const r = by.get(etf) || { c: etf, w: Object.fromEntries(codes.map(x => [x, null])) };
        r.w[c] = w;
        by.set(etf, r);
      }
    }
    const names = new Map((index.etfs || []).map(e => [e.c, e.n]));
    return [...by.values()].filter(r => mode === "any" || codes.every(c => r.w[c] !== null))
      .map(r => ({ ...r, n: names.get(r.c) || r.c, total: round(codes.reduce((s, c) => s + (r.w[c] || 0), 0)) }))
      .sort((a, b) => b.total - a.total || a.c.localeCompare(b.c));
  }

  // holdings：{ETF: [{s, n, w}]}。重疊度＝每檔共同持股取各 ETF 權重的最小值加總（%）
  function overlap(holdings) {
    const codes = Object.keys(holdings);
    const maps = codes.map(c => new Map(holdings[c].filter(r => isNum(r.w) && r.w > 0).map(r => [r.s, r])));   // 權重 0（四捨五入後）不算持有
    const common = [...maps[0].keys()].filter(s => maps.every(m => m.has(s))).map(s => ({
      s, n: maps[0].get(s).n, w: Object.fromEntries(codes.map((c, i) => [c, maps[i].get(s).w])),
      min: Math.min(...maps.map(m => m.get(s).w)) })).sort((a, b) => b.min - a.min);
    const only = Object.fromEntries(codes.map((c, i) => [c, [...maps[i].values()]
      .filter(r => !common.some(x => x.s === r.s)).sort((a, b) => b.w - a.w)]));
    return { pct: round(common.reduce((s, x) => s + x.min, 0)), common, only };
  }

  // ---------- 畫面 ----------
  function radarSection(radar, st) {
    const rows = TD().radarRows(radar, st.passive);
    const cols = [
      { key: "n", label: "股票", text: 1, get: r => r.n, html: r => `<a href="#/stock/${encodeURIComponent(r.s)}">${esc(r.n || r.s)}</a><span class="code">${esc(r.s)}</span>` },
      { key: "buy", label: "同買", r: 1, get: r => r.buy, html: r => r.buy ? `<span class="up">${r.buy}</span>` : dash },
      { key: "sell", label: "同賣", r: 1, get: r => r.sell, html: r => r.sell ? `<span class="down">${r.sell}</span>` : dash },
      { key: "newn", label: "新建倉", r: 1, get: r => r.new.length, html: r => r.new.length || dash },
      { key: "streak", label: "最長連買", r: 1, get: r => r.streak, html: r => r.streak ? `${r.streak} 天` : dash },
      { key: "holders", label: "持有檔數", r: 1, get: r => r.holders, html: r => r.holders },
      { key: "who", label: "哪些 ETF", text: 1, get: r => r.add.concat(r.new).join(","), html: r =>
        `${r.add.concat(r.new).map(c => `<a class="up" href="#/etf/${encodeURIComponent(c)}">${esc(c)}</a>`).join(" ")}
         ${r.cut.concat(r.gone).map(c => `<a class="down" href="#/etf/${encodeURIComponent(c)}">${esc(c)}</a>`).join(" ")}` }];
    const t = TB.render("radar", cols, rows, st.sort);
    return `<section class="card"><div class="tc-head"><h2>換股雷達（完整）</h2>
      <label class="chk"><input type="checkbox" data-passive ${st.passive ? "checked" : ""}> 包含被動式</label></div>
      <p class="note">共 ${rows.length} 檔股票・同買＝加碼＋新建倉、同賣＝減碼＋出清的 ETF 檔數・加碼／減碼看每單位持股數 ≥0.5% 且股數同方向・各 ETF 依各自最新持股日・紅色代號是買、綠色是賣</p></section>${t.html}`;
  }

  function multiSection(index, st) {
    const codes = parseCodes(st.q);
    const rows = codes.length && index ? multi(index, codes, st.mode) : [];
    const sname = c => ((index && index.stocks[c]) || {}).n || c;
    const table = !codes.length ? '<p class="empty">輸入股票代號（可以多檔，用空白或逗號分開，例如 2330 2454）</p>'
      : !rows.length ? '<p class="empty">沒有 ETF 符合</p>'
      : `<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="sticky">ETF</th>${codes.map(c => `<th class="r">${esc(sname(c))}<div class="sub">${esc(c)}</div></th>`).join("")}
        <th class="r">合計</th></tr></thead><tbody>${rows.map(r => `<tr class="link" data-href="#/etf/${encodeURIComponent(r.c)}"><td class="sticky">${esc(r.n)}<span class="code">${esc(r.c)}</span></td>
        ${codes.map(c => `<td class="r num">${isNum(r.w[c]) ? `${num(r.w[c])}%` : dash}</td>`).join("")}<td class="r num"><b>${num(r.total)}%</b></td></tr>`).join("")}</tbody></table></div>`;
    return `<section class="card"><h2>個股反查（可多檔）</h2>
      <form class="watch-add" data-multi-form><input name="q" value="${esc(st.q)}" placeholder="例如 2330 2454 NVDA US" autocomplete="off"><button type="submit">查詢</button></form>
      <div class="chips" style="margin-top:6px"><button type="button" data-mmode="all" aria-pressed="${st.mode === "all"}">全部都持有</button>
        <button type="button" data-mmode="any" aria-pressed="${st.mode === "any"}">至少持有一檔</button></div>
      <p class="note">各 ETF 最新持股日的權重・${rows.length} 檔 ETF</p></section>${table}`;
  }

  function overlapSection(index, st, details) {
    const sel = st.osel;
    const names = new Map(((index && index.etfs) || []).map(e => [e.c, e.n]));
    const pick = `<form class="watch-add" data-ov-form><input name="code" placeholder="加入 ETF 代號（選 2 檔以上）" autocomplete="off"><button type="submit">加入</button></form>
      <div class="pf-items">${sel.map(c => `<span class="pf-item">${esc(names.get(c) || c)}<span class="code">${esc(c)}</span>
        <button type="button" data-ov-del="${esc(c)}" aria-label="移除">×</button></span>`).join("")}</div>`;
    let body = '<p class="empty">選 2 檔以上 ETF 看重疊</p>';
    const ready = sel.filter(c => details[c] && details[c].holdings);
    if (sel.length >= 2 && ready.length < sel.length) {
      const missing = sel.filter(c => details[c] !== undefined && !(details[c] && details[c].holdings));
      body = missing.length ? `<p class="empty">${missing.map(esc).join("、")} 沒有持股資料</p>` : '<p class="empty">讀取中…</p>';
    } else if (sel.length >= 2) {
      const o = overlap(Object.fromEntries(sel.map(c => [c, details[c].holdings.rows])));
      const head = sel.map(c => `<th class="r">${esc(c)}</th>`).join("");
      body = `<p class="big">重疊度 <b>${num(o.pct)}%</b>・共同持股 ${o.common.length} 檔</p>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="sticky">共同持股</th>${head}</tr></thead><tbody>${o.common.slice(0, 50).map(x =>
          `<tr><td class="sticky">${esc(x.n || x.s)}<span class="code">${esc(x.s)}</span></td>${sel.map(c => `<td class="r num">${num(x.w[c])}%</td>`).join("")}</tr>`).join("")}</tbody></table></div>
        <div class="tgrid">${sel.map(c => `<section class="card"><h2>只有 ${esc(c)} 持有（${o.only[c].length}）</h2><ol class="toplist">${o.only[c].slice(0, 10).map(r =>
          `<li><span>${esc(r.n || r.s)}<span class="code">${esc(r.s)}</span></span><b>${num(r.w)}%</b></li>`).join("")}</ol></section>`).join("")}</div>`;
    }
    return `<section class="card"><h2>持股重疊</h2>${pick}<p class="note">重疊度＝共同持股在各 ETF 權重取最小值加總・用各 ETF 最新持股日</p></section>${body}`;
  }

  function page(radar, index, st, details) {
    const tabs = [["radar", "換股雷達"], ["multi", "個股反查"], ["overlap", "持股重疊"]];
    const nav = `<nav class="tabs">${tabs.map(([k, l]) => `<button type="button" data-ttab="${k}" aria-selected="${st.tab === k}">${l}</button>`).join("")}</nav>`;
    const body = st.tab === "multi" ? multiSection(index, st) : st.tab === "overlap" ? overlapSection(index, st, details) : radarSection(radar, st);
    return `${nav}<div class="tab-body">${body}</div>`;
  }

  return { parseCodes, multi, overlap, page };
})();

if (typeof module !== "undefined") module.exports = Track;
