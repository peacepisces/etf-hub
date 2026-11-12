// 完整排行（第 7 階段）：選「指標」（排序依據）與「期間」，chips 篩選（同一組任一、不同組都要符合；沿用舊版分組），
// 共用表格：每欄前 3 名只算顯示中的 ETF（使用者 2026-11-10）。
"use strict";

const Rank = (() => {
  const C = typeof Core !== "undefined" ? Core : require("./core.js");
  const TB = typeof V2Table !== "undefined" ? V2Table : require("./table.js");
  const { esc, isNum, dash, num, pct, aum } = C;
  const CHIP_GROUPS = [
    [["主動", e => e.mgmt === "主動"], ["被動", e => e.mgmt === "被動"]],
    [["市值型", e => e.type === "市值型"], ["高股息", e => e.type === "高股息"], ["債", e => e.type === "債券"],
     ["槓反", e => e.type === "槓反"], ["期貨", e => e.type === "期貨"]],
    [["不配息", e => e.freq === 0]],
    [["國內", e => e.region === "國內"], ["國外", e => !!e.region && e.region !== "國內"]]];
  const PERIODS = [["d1", "今日"], ["m1", "近 1 月"], ["m3", "近 3 月"], ["m6", "近 6 月"], ["ytd", "今年以來"], ["y1", "近 1 年"], ["y3", "近 3 年"]];
  const INDICATORS = [["ret", "報酬"], ["value", "成交金額"], ["ratio", "爆量倍數"], ["aum", "規模"], ["yield", "殖利率"],
                      ["premium", "折溢價"], ["flow", "資金流向"], ["fee", "內扣費用"]];
  const FLOW_OF = { d1: "d1", m1: "m1" };

  function filter(etfs, on) {
    const groups = CHIP_GROUPS.map(g => g.filter(([l]) => on.includes(l))).filter(g => g.length);
    return etfs.filter(e => groups.every(g => g.some(([, f]) => f(e))));
  }

  function rows(o, f, fees, p) {
    const fk = FLOW_OF[p] || (p === "w1" ? "w1" : "m1");
    return o.etfs.map(e => {
      const fl = f && f.flows ? f.flows[e.code] : null, vo = f && f.volume ? f.volume[e.code] : null, fe = fees ? fees[e.code] : null;
      return { ...e, ret: p === "d1" ? e.chg_pct : (e.ret || {})[p] ?? null,
               flow: fl ? fl[fk] : null, flowFull: fl && fl.full ? fl.full[fk] !== false : true,
               value: vo ? vo.value : null, ratio: vo ? vo.ratio : null,
               fee: fe && isNum(fe.annual) ? fe.annual : null, feeEst: !!(fe && fe.estimated) };
    });
  }

  function money(v) {
    if (!isNum(v)) return dash;
    const a = Math.abs(v), s = v < 0 ? "−" : "";
    return a >= 1e8 ? `${s}${num(a / 1e8, 2)} 億` : `${s}${num(a / 1e4, 0)} 萬`;
  }

  function columns(plabel) {
    return [
      { key: "code", label: "代號", text: 1, cls: "code-col", get: r => r.code, html: r => esc(r.code) },
      { key: "name", label: "名稱", text: 1, tags: 1, get: r => r.name, html: r => esc(r.name) },
      { key: "price", label: "價格", r: 1, get: r => r.price, html: r => num(r.price) },
      { key: "ret", label: `含息報酬（${plabel}）`, r: 1, get: r => r.ret, html: r => pct(r.ret), top: "ytd", tag: "報酬" },
      { key: "value", label: "成交金額", r: 1, get: r => r.value, html: r => money(r.value) },
      { key: "ratio", label: "爆量倍數", r: 1, get: r => r.ratio, html: r => isNum(r.ratio) ? `${num(r.ratio, 1)} 倍` : dash },
      { key: "aum", label: "規模", r: 1, get: r => r.aum, html: r => aum(r.aum), top: "aum", tag: "規模" },
      { key: "yield", label: "殖利率", r: 1, get: r => r.yield, html: r => isNum(r.yield) ? `${r.yield_est ? "預估 " : ""}${num(r.yield)}%` : dash, top: "yld", tag: "息" },
      { key: "premium", label: "折溢價", r: 1, get: r => r.premium, html: r => pct(r.premium) },
      { key: "flow", label: "資金流向", r: 1, get: r => r.flow, html: r => `${r.flow > 0 ? "+" : ""}${money(r.flow)}${r.flowFull ? "" : "*"}`, top: "y1", tag: "吸金" },
      { key: "fee", label: "內扣費用", r: 1, get: r => r.fee, html: r => isNum(r.fee) ? `${num(r.fee)}%${r.feeEst ? "*" : ""}` : dash }];
  }

  function page(o, f, fees, st) {
    const p = st.period;
    const plabel = (PERIODS.find(x => x[0] === p) || [, ""])[1];
    const list = filter(rows(o, f, fees, p), st.chips);
    const ind = INDICATORS.map(([k, l]) => `<button type="button" data-rind="${k}" aria-pressed="${st.sort.key === k}">${l}</button>`).join("");
    const per = PERIODS.map(([k, l]) => `<button type="button" data-rper="${k}" aria-pressed="${p === k}">${l}</button>`).join("");
    const chips = CHIP_GROUPS.map(g => g.map(([l]) => `<button type="button" data-rchip="${esc(l)}" aria-pressed="${st.chips.includes(l)}">${esc(l)}</button>`).join("")).join('<span class="sep"></span>');
    const t = TB.render("rank", columns(plabel), list, st.sort, { rowLink: r => `#/etf/${encodeURIComponent(r.code)}` });
    return `<section class="card"><div class="rk-row"><span class="lb">指標</span><div class="chips">${ind}</div></div>
      <div class="rk-row"><span class="lb">期間</span><div class="chips">${per}</div></div>
      <div class="rk-row"><span class="lb">篩選</span><div class="chips">${chips}</div></div>
      <p class="note">共 ${list.length} 檔・含息報酬＝股價＋領到的配息（不再投入）・資金流向依期間（今日／近 1 月，其他期間用近 1 月），* ＝資料自 11/05 起不滿整段・
        內扣費用 * ＝不滿一年換算的預估・同一組篩選是「任一」、不同組要「都符合」・前 3 名只算目前顯示的 ETF</p></section>${t.html}`;
  }

  return { filter, rows, page, PERIODS, INDICATORS, CHIP_GROUPS };
})();

if (typeof module !== "undefined") module.exports = Rank;
