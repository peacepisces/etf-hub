// 工具（第 7 階段）：篩選器（配息頻率、類型、近一年報酬 ≥、規模 ≥、費用 ≤）＋績效比較（任選 ETF 疊圖，最多 8 檔，只載選到的檔）。
"use strict";

const Tools = (() => {
  const C = typeof Core !== "undefined" ? Core : require("./core.js");
  const TB = typeof V2Table !== "undefined" ? V2Table : require("./table.js");
  const { esc, isNum, dash, num, pct, aum } = C;
  const FREQ = { 12: "月配", 6: "雙月配", 4: "季配", 2: "半年配", 1: "年配", 0: "不配息" };
  const TYPES = ["市值型", "高股息", "債券", "槓反", "期貨", "其他"];

  // 條件沒填就不篩；有門檻的條件，沒有那個數字的 ETF 不算符合
  // rows 來自 Rank.rows(…, "y1")：r.ret 就是近 1 年報酬
  const y1 = r => r.ret;
  function screen(rows, c) {
    return rows.filter(r => (!c.freq || String(r.freq) === String(c.freq)) && (!c.type || r.type === c.type) &&
      (!isNum(c.y1) || (isNum(y1(r)) && y1(r) >= c.y1)) && (!isNum(c.aum) || (isNum(r.aum) && r.aum >= c.aum)) &&
      (!isNum(c.fee) || (isNum(r.fee) && r.fee <= c.fee)));
  }

  function page(o, rows, st) {
    const c = st.crit;
    const opt = (v, l, cur) => `<option value="${esc(v)}" ${String(cur ?? "") === String(v) ? "selected" : ""}>${esc(l)}</option>`;
    const list = screen(rows, c);
    const cols = [
      { key: "code", label: "代號", text: 1, cls: "code-col", get: r => r.code, html: r => `<label class="cc"><input type="checkbox" data-cmp="${esc(r.code)}" ${st.cmp.includes(r.code) ? "checked" : ""} aria-label="加入比較 ${esc(r.code)}">${esc(r.code)}</label>` },
      { key: "name", label: "名稱", text: 1, tags: 1, get: r => r.name, html: r => `<a href="#/etf/${encodeURIComponent(r.code)}">${esc(r.name)}</a>` },
      { key: "type", label: "類型", text: 1, get: r => r.type, html: r => esc(r.type || "—") },
      { key: "freq", label: "配息", get: r => r.freq, html: r => esc(FREQ[r.freq] || "—") },
      { key: "ret", label: "近 1 年", r: 1, get: r => y1(r), html: r => pct(y1(r)), top: "y1", tag: "1年" },
      { key: "aum", label: "規模", r: 1, get: r => r.aum, html: r => aum(r.aum), top: "aum", tag: "規模" },
      { key: "yield", label: "殖利率", r: 1, get: r => r.yield, html: r => isNum(r.yield) ? `${num(r.yield)}%` : dash, top: "yld", tag: "息" },
      { key: "fee", label: "內扣費用", r: 1, get: r => r.fee, html: r => isNum(r.fee) ? `${num(r.fee)}%${r.feeEst ? "*" : ""}` : dash }];
    const t = TB.render("tools", cols, list, st.sort);
    const sel = st.cmp.map(code => `<span class="pf-item">${esc(code)}<button type="button" data-cmp-del="${esc(code)}" aria-label="移除">×</button></span>`).join("");
    const chips = Chart.RANGES.map(([k, l]) => `<button type="button" data-range="${k}" aria-pressed="${k === st.range}">${l}</button>`).join("");
    return `<section class="card"><h2>篩選器</h2><form class="screener" data-screen-form>
        <label>配息頻率<select name="freq">${opt("", "不限", c.freq)}${Object.entries(FREQ).map(([k, l]) => opt(k, l, c.freq)).join("")}</select></label>
        <label>類型<select name="type">${opt("", "不限", c.type)}${TYPES.map(x => opt(x, x, c.type)).join("")}</select></label>
        <label>近一年報酬 ≥<input name="y1" type="number" step="any" value="${isNum(c.y1) ? c.y1 : ""}">%</label>
        <label>規模 ≥<input name="aum" type="number" step="any" value="${isNum(c.aum) ? c.aum : ""}">億</label>
        <label>內扣費用 ≤<input name="fee" type="number" step="any" value="${isNum(c.fee) ? c.fee : ""}">%</label>
        <button type="submit">套用</button></form>
        <p class="note">符合 ${list.length} 檔・有填門檻的條件，沒有那項資料的 ETF 不列出・勾選左邊加入下方比較（最多 8 檔）</p></section>
      ${t.html}
      <section class="card"><div class="tc-head"><h2>績效比較</h2><div class="chips">${chips}</div></div>
        <form class="watch-add" data-cmp-form><input name="code" placeholder="加入 ETF 代號" autocomplete="off"><button type="submit">加入</button></form>
        <div class="pf-items">${sel}</div>
        ${st.cmp.length ? '<div class="legend" id="tlegend"></div><div class="chart" id="tchart"></div>' : '<p class="empty">加入 ETF（最多 8 檔）和 0050 比較含息報酬</p>'}
        <p class="note">含息報酬、期間第一天＝0%・0050 是灰色虛線・點圖例可以隱藏</p></section>`;
  }

  return { screen, page, TYPES };
})();

if (typeof module !== "undefined") module.exports = Tools;
