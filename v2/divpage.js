// 配息分頁（第 4 階段）：篩選＋主表（照 spec 欄位順序）＋組合（月月配規劃）＋配息日曆。
// 月份一律依除息日；發放日沒有可合法程式下載的來源，組合也依除息日估算（畫面註明）。網頁和 node 測試共用。
"use strict";

const Div = (() => {
  const C = typeof Core !== "undefined" ? Core : require("./core.js");
  const TB = typeof V2Table !== "undefined" ? V2Table : require("./table.js");
  const { esc, isNum, dash, num, pct } = C;
  const PF_KEY = "v2.portfolio";
  const FREQ = { 12: "月配", 6: "雙月配", 4: "季配", 2: "半年配", 1: "年配", 0: "不配息" };
  const KINDS = [["all", "全部配息 ETF"], ["high", "高股息"], ["active", "主動式"], ["bond", "債券"]];   // 全部在最左（使用者 2026-11-11）

  function filter(rows, f) {
    return rows.filter(r => (f.kind === "high" ? r.type === "高股息" : f.kind === "active" ? r.mgmt === "主動"
      : f.kind === "bond" ? r.type === "債券" : true) && (!f.freq || String(r.freq) === String(f.freq)));
  }

  // 每月預估領多少（元）：近 12 個月各次配息（依除息月份）× 張數 × 1000；已公告（未來）的取代去年同月那次
  function portfolio(calendar, held, today) {
    const from = shift(today, -365), to = shift(today, 365);
    const out = {};
    for (let m = 1; m <= 12; m++) out[m] = { amount: 0, announced: false, items: [] };
    for (const [code, lots] of Object.entries(held || {})) {
      if (!(lots > 0)) continue;
      // 每個月只算最新一次「有金額」的配息（已公告的取代去年同月；金額未公布的不取代；今年已除息就不再算去年同月）
      const latest = new Map();
      for (const row of calendar) {
        const [d, c, cash] = row;
        if (c !== code || d <= from || d > to || !(cash > 0)) continue;
        const m = +d.slice(5, 7);
        if (!latest.has(m) || d > latest.get(m)[0]) latest.set(m, row);
      }
      for (const [d, , cash] of latest.values()) {
        const m = +d.slice(5, 7);
        const amt = Math.round(cash * lots * 1000);
        out[m].amount += amt;
        out[m].items.push([code, d, amt]);
        if (d > today) out[m].announced = true;
      }
    }
    return out;
  }
  const portfolioTotal = m => Object.values(m).reduce((s, x) => s + x.amount, 0);
  function shift(iso, days) { const t = new Date(iso + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + days); return t.toISOString().slice(0, 10); }

  function calendarDays(calendar, ym) {
    const out = {};
    for (const row of calendar) if (row[0].startsWith(ym)) (out[row[0]] = out[row[0]] || []).push(row);
    return out;
  }

  function loadPf(storage) {
    try { const v = JSON.parse(storage.getItem(PF_KEY) || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
  }
  function savePf(storage, pf) { try { storage.setItem(PF_KEY, JSON.stringify(pf)); return true; } catch { return false; } }

  // ---------- 畫面 ----------
  // title 屬性只能放純文字（pct 會產生 <span>，放進 title 會把引號弄壞）
  const plainPct = v => isNum(v) ? `${v > 0 ? "+" : ""}${num(v)}%` : "—";

  // 一張表放全部（使用者 2026-11-11：不要切換；參考別站把 1～12 月放在 ETF 旁邊、欄位窄一點）
  // 順序：ETF｜1～12 月（上面「YYYY 年」群組標題）｜今年已配｜去年合計｜殖利率｜頻率｜含息報酬｜填息
  function cols(year, pf) {
    const monthCols = Array.from({ length: 12 }, (_, i) => i + 1).map(m => ({
      key: `m${m}`, label: `${m} 月`, r: 1, cls: "mo", get: r => r.months[m] ? r.months[m].cash : null,
      html: r => r.months[m] ? `<span class="${r.months[m].announced ? "muted" : ""}">${num(r.months[m].cash, 3)}${r.months[m].announced ? "*" : ""}</span>` : "" }));
    return [
      { key: "name", label: "ETF", text: 1, get: r => r.name, html: r => `<label class="dn-name"><input type="checkbox" data-pf="${esc(r.code)}" ${r.code in pf ? "checked" : ""} aria-label="加入組合">
        <span><a href="#/etf/${encodeURIComponent(r.code)}">${esc(r.name)}</a><span class="code">${esc(r.code)}</span></span></label>` },
      ...monthCols,
      { key: "ytd", label: `${year} 已配`, r: 1, cls: "sep", get: r => r.ytd, html: r => r.ytd ? num(r.ytd, 3) : dash },
      { key: "last_year", label: `${year - 1} 合計`, r: 1, get: r => r.last_year, html: r => r.last_year ? num(r.last_year, 3) : dash },
      { key: "yield", label: "殖利率", r: 1, get: r => r.yield, top: "yld", tag: "息",
        html: r => isNum(r.yield) ? (r.yield_est ? `<span title="預估：上市未滿一年，用最近一次配息推算">${num(r.yield)}%<sup>估</sup></span>` : `${num(r.yield)}%`) : r.no_div ? '<span class="muted">尚未配息</span>' : dash },
      { key: "freq", label: "頻率", get: r => r.freq, html: r => esc(FREQ[r.freq] || "—") },
      { key: "tr1y", label: "含息報酬", r: 1, get: r => r.tr1y,
        html: r => `<span title="一年：價差 ${plainPct(r.price1y)}＋配息 ${plainPct(r.div1y)}">${pct(r.tr1y)}</span>` },
      { key: "fill_avg", label: "填息", r: 1, get: r => r.fill_avg, html: r => isNum(r.fill_avg) ? `${num(r.fill_avg, 1)} 天` : dash },
    ];
  }

  // 月月配搜尋：代號、完整名稱、下拉選單的「代號 名稱」、或只有一檔符合的部分名稱 → 代號；否則 null
  function findEtf(etfs, q) {
    q = String(q || "").trim();
    if (!q) return null;
    const head = q.split(/\s+/)[0].toUpperCase();
    const byCode = etfs.find(e => e.code.toUpperCase() === head);
    if (byCode) return byCode.code;
    const exact = etfs.find(e => e.name === q);
    if (exact) return exact.code;
    const part = etfs.filter(e => e.name.includes(q) || e.code.toUpperCase().includes(q.toUpperCase()));
    return part.length === 1 ? part[0].code : null;
  }

  function pfSection(data, pf) {
    const codes = Object.keys(pf);
    if (!codes.length) return `<section class="card"><h2>組合（月月配規劃）</h2><p class="empty">勾選表格左邊的方塊加入組合，再輸入張數</p></section>`;
    const names = new Map(data.etfs.map(r => [r.code, r.name]));
    const m = portfolio(data.calendar, pf, data.today);
    const inputs = codes.map(c => `<label class="pf-item">${esc(names.get(c) || c)}<span class="code">${esc(c)}</span>
      <input type="number" min="0" step="1" value="${Number(pf[c]) || 0}" data-pf-lots="${esc(c)}"> 張
      <button type="button" data-pf-del="${esc(c)}" aria-label="移除">×</button></label>`).join("");
    const months = Array.from({ length: 12 }, (_, i) => i + 1).map(i => `<div class="pf-m${m[i].amount ? "" : " zero"}"><span>${i} 月</span>
      <b>${m[i].amount ? num(m[i].amount, 0) : "—"}${m[i].announced ? "*" : ""}</b></div>`).join("");
    return `<section class="card" id="pf"><h2>組合（月月配規劃）</h2><div class="pf-items">${inputs}</div>
      <div class="pf-months">${months}</div><p class="meta">一年合計約 <b>${num(portfolioTotal(m), 0)}</b> 元</p>
      <p class="note">依近 12 個月實際配息（除息月份）× 張數估算；* 含已公告、還沒除息的那次（取代去年同月）。發放日沒有公開資料可程式取得，實際入帳通常晚除息 3～4 週。組合只存在這台裝置的瀏覽器</p></section>`;
  }

  // 底部固定小條：組合區在長表格下面，勾了看不到（使用者 2026-11-11）。勾第一檔起一直顯示，點「看詳細」捲到組合區
  function pfBar(data, pf) {
    const codes = Object.keys(pf);
    if (!codes.length) return "";
    const m = portfolio(data.calendar, pf, data.today);
    const max = Math.max(1, ...Object.values(m).map(x => x.amount));
    const bars = Array.from({ length: 12 }, (_, i) => i + 1).map(i =>
      `<span class="pf-bar-m${m[i].amount ? "" : " zero"}" title="${i} 月 ${m[i].amount ? num(m[i].amount, 0) + " 元" : "—"}"><i style="height:${m[i].amount ? Math.max(12, Math.round(m[i].amount / max * 100)) : 4}%"></i><em>${i}</em></span>`).join("");
    return `<div class="pf-bar" role="region" aria-label="組合摘要"><div class="pf-bar-sum">組合 ${codes.length} 檔・一年約 <b>${num(portfolioTotal(m), 0)}</b> 元</div>
      <div class="pf-bar-ms">${bars}</div><button type="button" data-pf-jump>看詳細 ↓</button></div>`;
  }

  function calendarSection(data, ym, names) {
    const days = calendarDays(data.calendar, ym);
    const [y, m] = ym.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(), last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const cells = [];
    for (let i = 0; i < first; i++) cells.push('<div class="cal-c empty"></div>');
    for (let d = 1; d <= last; d++) {
      const key = `${ym}-${String(d).padStart(2, "0")}`;
      const list = days[key] || [];
      cells.push(`<div class="cal-c${key === data.today ? " today" : ""}"><span class="dn">${d}</span>${list.slice(0, 4).map(([, c, cash]) =>
        `<a href="#/etf/${encodeURIComponent(c)}" title="${esc(names.get(c) || c)}">${esc(c)} <i>${cash ? num(cash, 3) : "?"}</i></a>`).join("")}
        ${list.length > 4 ? `<span class="sub">另 ${list.length - 4} 檔</span>` : ""}</div>`);
    }
    return `<section class="card"><div class="tc-head"><h2>配息日曆（除息日）</h2><div class="chips">
      <button type="button" data-cal="-1">← 上個月</button><b>${y} 年 ${m} 月</b><button type="button" data-cal="1">下個月 →</button></div></div>
      <div class="cal">${"日一二三四五六".split("").map(w => `<div class="cal-w">${w}</div>`).join("")}${cells.join("")}</div>
      <p class="note">每格最多列 4 檔（代號 每單位配息）；? ＝金額未公布</p></section>`;
  }

  function page(data, st, storage) {
    if (!data) return '<p class="empty">配息資料還沒產生</p>';
    const pf = loadPf(storage);
    const rows = filter(data.etfs, st.f);
    const chips = KINDS.map(([k, l]) => `<button type="button" data-dkind="${k}" aria-pressed="${st.f.kind === k}">${l}</button>`).join("");
    const fchips = [["", "全部頻率"], ...Object.entries(FREQ).filter(([k]) => k !== "0").reverse()].map(([k, l]) =>
      `<button type="button" data-dfreq="${k}" aria-pressed="${String(st.f.freq) === k}">${l}</button>`).join("");
    const t = TB.render("div", cols(data.year, pf), rows, st.sort,
      { groups: [{ label: `${data.year} 年（依除息日）`, keys: Array.from({ length: 12 }, (_, i) => `m${i + 1}`) }] });
    const names = new Map(data.etfs.map(r => [r.code, r.name]));
    const opts = data.etfs.map(r => `<option value="${esc(r.code)} ${esc(r.name)}">`).join("");
    const search = `<form class="pf-add" data-pf-form><label>月月配組合：<input type="search" name="q" list="pf-list" placeholder="輸入代號或名稱，例 0056、高股息" autocomplete="off" enterkeyhint="done"></label>
      <button type="submit">加入</button><span class="muted" data-pf-msg>${Object.keys(pf).length ? `已選 ${Object.keys(pf).length} 檔` : "也可以勾表格左邊的方塊"}</span>
      <datalist id="pf-list">${opts}</datalist></form>`;
    return `<section class="card"><div class="chips">${chips}</div><div class="chips" style="margin-top:6px">${fchips}</div>
      ${search}
      <p class="note">共 ${rows.length} 檔・1～12 月依除息日，灰色加 * ＝已公告還沒除息・殖利率「估」＝上市未滿一年的預估・含息報酬（一年）＝價差＋配息，滑鼠移上去看拆解・填息是近一年平均天數</p></section>
      ${t.html.replace('class="tbl-wrap"', 'class="tbl-wrap div-tbl"')}${pfSection(data, pf)}${calendarSection(data, st.ym || data.today.slice(0, 7), names)}${pfBar(data, pf)}`;
  }

  return { filter, portfolio, portfolioTotal, calendarDays, loadPf, savePf, page, shift, pfBar, findEtf };
})();

if (typeof module !== "undefined") module.exports = Div;
