// 首頁「今日」（第 3 階段）：今日表現 vs 大盤（即時）、換股雷達、即將發生，往下資金流向、成交金額與爆量、漲跌幅、折溢價警示。
// 平均一律簡單平均、沒有漲跌的不算（spec「Claude 的判斷」）。我的關注存在瀏覽器（localStorage），換裝置要重設。
"use strict";

const Today = (() => {
  const OV = () => typeof Ovw !== "undefined" ? Ovw : require("./overview.js");   // 連到總覽（呼叫時才取，載入順序無關）
  const C = typeof Core !== "undefined" ? Core : require("./core.js");
  const { esc, isNum, dash, num, pct, shortDate } = C;
  const WATCH_KEY = "v2.watch";
  const href = c => `#/etf/${encodeURIComponent(c)}`;
  const avg = xs => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 100) / 100 : null;

  function groups(etfs, watch) {
    const by = code => etfs.find(e => e.code === code);
    const vals = f => etfs.filter(e => f(e) && isNum(e.chg_pct)).map(e => e.chg_pct);
    const out = [];
    const base = by("0050");
    out.push({ label: "0050", v: base && isNum(base.chg_pct) ? base.chg_pct : null, n: 1, code: "0050" });
    // chip：點小格 → 總覽・行情只列這一類、依今日漲跌排（使用者 2026-11-12：原本都跳主動式專區）
    for (const [label, f, chip] of [["主動式平均", e => e.mgmt === "主動", "主動"], ["高股息平均", e => e.type === "高股息", "高股息"],
                              ["市值型平均", e => e.type === "市值型", "市值型"], ["債券平均", e => e.type === "債券", "債"]]) {
      const xs = vals(f);
      out.push({ label, v: avg(xs), n: xs.length, chip });
    }
    for (const c of watch || []) {
      const e = by(c);
      if (e) out.push({ label: e.name, v: isNum(e.chg_pct) ? e.chg_pct : null, n: 1, code: c, watch: true });
    }
    return out;
  }

  function beat(etfs) {
    const base = etfs.find(e => e.code === "0050");
    if (!base || !isNum(base.chg_pct)) return { win: 0, total: 0 };
    const act = etfs.filter(e => e.mgmt === "主動" && isNum(e.chg_pct));
    return { win: act.filter(e => e.chg_pct > base.chg_pct).length, total: act.length };
  }

  function loadWatch(storage) {
    try { const v = JSON.parse(storage.getItem(WATCH_KEY) || "[]"); return Array.isArray(v) ? v.map(String) : []; }
    catch { return []; }
  }
  function saveWatch(storage, list) {
    try { storage.setItem(WATCH_KEY, JSON.stringify(list)); return true; } catch { return false; }
  }

  // 換股雷達：buy＝加碼＋新建倉的 ETF 數、sell＝減碼＋出清
  function radarRows(radar, withPassive) {
    const rows = ((radar && radar.stocks) || []).map(st => {
      const g = k => st.a[k].concat(withPassive ? st.p[k] : []);
      const add = g("add"), cut = g("cut"), nw = g("new"), gone = g("gone");
      return { s: st.s, n: st.n, add, cut, new: nw, gone, buy: add.length + nw.length, sell: cut.length + gone.length,
               streak: Math.max(st.a.streak, withPassive ? st.p.streak : 0),
               holders: st.a.holders + (withPassive ? st.p.holders : 0) };
    }).filter(r => r.buy || r.sell);
    return rows.sort((a, b) => (b.buy - a.buy) || (b.sell - a.sell) || (b.streak - a.streak) || a.s.localeCompare(b.s));
  }

  // ---------- 畫面 ----------
  function card(title, body, more, note) {
    return `<section class="card tcard"><div class="tc-head"><h2>${esc(title)}</h2>${more ? `<a class="more" href="${more}">看全部 →</a>` : ""}</div>
      ${body}${note ? `<p class="note">${note}</p>` : ""}</section>`;
  }
  const etfLink = e => `<a href="${href(e.code)}">${esc(e.name)}<span class="code">${esc(e.code)}</span></a>`;
  function money(v) {
    if (!isNum(v)) return dash;
    const a = Math.abs(v), s = v < 0 ? "−" : v > 0 ? "+" : "";
    const t = a >= 1e8 ? `${s}${num(a / 1e8, 2)} 億` : `${s}${num(a / 1e4, 0)} 萬`;
    return v ? `<span class="${v > 0 ? "up" : "down"}">${t}</span>` : t;   // 流入紅、流出綠（使用者 2026-11-12）
  }

  function perfRow(o, watch) {
    const b = beat(o.etfs);
    const tiles = groups(o.etfs, watch).map(g => `<a class="ptile${g.watch ? " watch" : ""}" href="${g.code ? href(g.code) : OV().link("quote", { chip: g.chip, sort: "chg_pct" })}">
      <span>${esc(g.label)}${g.watch ? '<button type="button" class="x" data-unwatch="' + esc(g.code) + '" aria-label="移除">×</button>' : ""}</span>
      <b>${pct(g.v)}</b>${g.code ? "" : `<i>${g.n} 檔</i>`}</a>`).join("");
    return `<section class="card"><div class="tc-head"><h2>今日表現 vs 大盤（0050）</h2>
      <span class="meta">主動式贏 0050：<b>${b.win}/${b.total}</b> 檔</span></div>
      <div class="ptiles">${tiles}</div>
      <form class="watch-add" data-watch-form><input name="code" placeholder="加入關注：ETF 代號" autocomplete="off"><button type="submit">加入</button></form>
      <p class="note">漲跌是收盤（盤中為即時）・平均＝簡單平均，沒有成交的不算・我的關注只存在這台裝置的瀏覽器</p></section>`;
  }

  function radarCard(radar, withPassive) {
    const rows = radarRows(radar, withPassive).slice(0, 10);
    const body = rows.length ? `<table class="tbl mini-t"><thead><tr><th class="sticky">股票</th><th class="r">同買</th><th class="r">同賣</th><th class="r">連買</th></tr></thead>
      <tbody>${rows.map(r => `<tr class="link" data-href="#/stock/${encodeURIComponent(r.s)}"><td class="sticky">${esc(r.n || r.s)}<span class="code">${esc(r.s)}</span>
        ${r.new.length ? `<span class="tag2 ach">${r.new.length} 檔新建倉</span>` : ""}</td>
        <td class="r num up">${r.buy || dash}</td><td class="r num down">${r.sell || dash}</td><td class="r num">${r.streak ? `${r.streak} 天` : dash}</td></tr>`).join("")}</tbody></table>`
      : '<p class="empty">今天沒有同買同賣的股票</p>';
    const toggle = `<label class="chk"><input type="checkbox" data-passive ${withPassive ? "checked" : ""}> 包含被動式</label>`;
    return card("換股雷達", toggle + body, "#/holdings",
      `同買＝加碼＋新建倉的 ETF 檔數；加碼／減碼看每單位持股數（扣掉申購贖回）≥0.5% 且股數同方向・${radarDates(radar)}`);
  }

  // 依據的持股日範圍（各 ETF 最新持股日可能不同）；持股太舊的 ETF 不算今天的動作
  function radarDates(radar) {
    if (!radar || !radar.range) return "各 ETF 依各自最新持股日";
    const [a, b] = radar.range;
    const st = (radar.stale || []).length;
    return `持股日 ${shortDate(a)}${a !== b ? `～${shortDate(b)}` : ""}${st ? `・${st} 檔持股資料過期，未列入` : ""}`;
  }

  function eventsCard(ev) {
    const list = (ev && ev.events) || [];
    const body = list.length ? `<ul class="evlist">${list.slice(0, 12).map(e => `<li${e.today ? ' class="today"' : ""}>
        <span class="d">${e.today ? `今天${esc(e.kind)}` : shortDate(e.date)}</span><span class="k k-${esc(e.kind)}">${esc(e.kind)}</span>
        <a href="${href(e.code)}">${esc(e.name)}<span class="code">${esc(e.code)}</span></a><span class="dt">${esc(e.detail)}</span>${e.new ? "🆕" : ""}</li>`).join("")}</ul>`
      : '<p class="empty">兩週內沒有事件</p>';
    return card("即將發生（兩週內）", body, "#/events",
      "依事件日排序・🆕＝我們兩天內第一次收到（可能比投信公告晚一天）・分割是恢復買賣日・新上市只有上市 ETF");
  }

  function topList(rows, valueHtml) {
    return rows.length ? `<ol class="toplist">${rows.map(r => `<li>${etfLink(r.e)}<b>${valueHtml(r)}</b></li>`).join("")}</ol>` : '<p class="empty">沒有資料</p>';
  }

  function lowerCards(o, f) {
    const byCode = new Map(o.etfs.map(e => [e.code, e]));
    const flows = Object.entries((f && f.flows) || {}).filter(([c]) => byCode.has(c)).map(([c, v]) => ({ e: byCode.get(c), v: v.d1 }));
    const since = Object.values((f && f.flows) || {}).map(v => v.since).sort()[0];
    const inflow = flows.filter(r => r.v > 0).sort((a, b) => b.v - a.v).slice(0, 5);
    const outflow = flows.filter(r => r.v < 0).sort((a, b) => a.v - b.v).slice(0, 5);
    const vol = Object.entries((f && f.volume) || {}).filter(([c, v]) => byCode.has(c) && isNum(v.ratio) && v.value >= 5e7)
      .map(([c, v]) => ({ e: byCode.get(c), v })).sort((a, b) => b.v.ratio - a.v.ratio).slice(0, 5);
    const movers = o.etfs.filter(e => isNum(e.chg_pct));
    const up = movers.slice().sort((a, b) => b.chg_pct - a.chg_pct).slice(0, 5).map(e => ({ e }));
    const down = movers.slice().sort((a, b) => a.chg_pct - b.chg_pct).slice(0, 5).map(e => ({ e }));
    const prem = o.etfs.filter(e => isNum(e.premium) && Math.abs(e.premium) >= 2).sort((a, b) => Math.abs(b.premium) - Math.abs(a.premium)).slice(0, 8).map(e => ({ e }));
    return `<div class="tgrid">
      ${card("資金流向・最吸金", topList(inflow, r => money(r.v)), OV().link("flow", { sort: "f_d1" }), `受益權單位數變化 × 淨值・${f ? shortDate(f.end) : ""}・資料自 ${since ? shortDate(since) : "—"} 起`)}
      ${card("資金流向・最失血", topList(outflow, r => money(r.v)), OV().link("flow", { sort: "f_d1", dir: 1 }))}
      ${card("成交金額爆量", topList(vol, r => `${num(r.v.ratio, 1)} 倍<span class="sub">${money(Math.abs(r.v.value)).replace(/<[^>]*>/g, "").replace("+", "")}</span>`), OV().link("flow", { sort: "ratio" }), "今天成交金額 ÷ 前 20 個交易日平均（成交 5 千萬以上）")}
      ${card("漲幅前 5", topList(up, r => pct(r.e.chg_pct)), OV().link("quote", { sort: "chg_pct" }))}
      ${card("跌幅前 5", topList(down, r => pct(r.e.chg_pct)), OV().link("quote", { sort: "chg_pct", dir: 1 }))}
      ${card("折溢價警示（±2% 以上）", topList(prem, r => pct(r.e.premium)), OV().link("quote", { sort: "premium", dir: 1 }), "折溢價大時，買賣價格和淨值差距大")}
      ${card("三大法人", '<p class="empty">之後才做</p>')}
    </div>`;
  }

  // 即將發生・完整清單（#/events）：依日期分組、可依種類篩選（使用者 2026-11-12：原本「看全部」跳到配息頁）
  function eventsPage(ev, kind) {
    const all = (ev && ev.events) || [];
    const kinds = [...new Set(all.map(e => e.kind))];
    const list = kind ? all.filter(e => e.kind === kind) : all;
    const chips = [["", "全部"], ...kinds.map(k => [k, k])].map(([k, l]) =>
      `<button type="button" data-evkind="${esc(k)}" aria-pressed="${(kind || "") === k}">${esc(l)}${k ? ` ${all.filter(e => e.kind === k).length}` : ` ${all.length}`}</button>`).join("");
    const days = [...new Set(list.map(e => e.date))].sort();
    const body = days.map(d => {
      const items = list.filter(e => e.date === d);
      const today = items.some(e => e.today);
      return `<section class="card"><h2>${today ? "今天" : shortDate(d)}<span class="badge">${items.length}</span></h2><ul class="evlist">${items.map(e => `<li>
        <span class="k k-${esc(e.kind)}">${esc(e.kind)}</span><a href="${href(e.code)}">${esc(e.name)}<span class="code">${esc(e.code)}</span></a>
        <span class="dt">${esc(e.detail)}</span>${e.new ? "🆕" : ""}</li>`).join("")}</ul></section>`;
    }).join("") || '<p class="empty">沒有事件</p>';
    return `<div class="nav-row"><a href="#/today">← 今日焦點</a></div>
      <section class="card"><h2>即將發生（兩週內）</h2><div class="chips">${chips}</div>
      <p class="note">依事件日排序・🆕＝我們兩天內第一次收到・分割是恢復買賣日・新上市只有上市 ETF</p></section>${body}`;
  }

  function page(o, data, opts) {
    return `${perfRow(o, opts.watch)}<div class="tgrid two">${radarCard(data.radar, opts.passive)}${eventsCard(data.events)}</div>${lowerCards(o, data.flows)}`;
  }

  return { groups, beat, loadWatch, saveWatch, radarRows, radarDates, page, eventsPage, WATCH_KEY };
})();

if (typeof module !== "undefined") module.exports = Today;
