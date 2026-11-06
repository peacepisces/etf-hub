// 盤中即時：把轉接站的即時資料併進收盤資料。純函式，網頁和 node 測試共用。
"use strict";

const Live = (() => {
  const isNum = v => typeof v === "number" && isFinite(v);
  const round2 = v => Math.round(v * 100) / 100;
  const MAX_STOCKS = 60;   // 和轉接站一致

  // 台灣時間週一到五 08:30–14:00 才需要一直更新
  function isLiveWindow(now) {
    const t = new Date(now.getTime() + 8 * 3600e3);
    const day = t.getUTCDay(), m = t.getUTCHours() * 60 + t.getUTCMinutes();
    return day >= 1 && day <= 5 && m >= 510 && m <= 840;
  }

  // 真正的交易時間：台灣時間週一到五 09:00–13:30
  function isMarketOpen(now) {
    const t = new Date(now.getTime() + 8 * 3600e3);
    const day = t.getUTCDay(), m = t.getUTCHours() * 60 + t.getUTCMinutes();
    return day >= 1 && day <= 5 && m >= 540 && m <= 810;
  }

  // 即時資料的日期要晚於收盤資料才覆蓋（晚上產生新資料後，不能被同一天的即時資料蓋掉）
  function isNewer(live, priceDate) {
    return !!(live && live.date && (!priceDate || live.date > priceDate));
  }

  // 價格←成交價；漲跌%←成交價÷前一天收盤；淨值←預估淨值；折溢價←證交所。沒有即時值的欄位保留收盤資料。
  function mergeOverview(overview, live) {
    if (!isNewer(live, overview.price_date)) return overview.etfs;
    return overview.etfs.map(e => {
      const q = live.etfs && live.etfs[e.code];
      if (!q) return e;
      const [p, nav, prem] = q;
      const out = { ...e, live: true };
      if (isNum(p)) {
        out.price = p;
        out.chg = isNum(e.price) ? round2(p - e.price) : null;
        out.chg_pct = isNum(e.price) && e.price > 0 ? round2((p / e.price - 1) * 100) : null;
      }
      if (isNum(nav)) out.nav = nav;
      if (isNum(prem)) out.premium = prem;
      return out;
    });
  }

  // 成份股：股價、漲跌用即時；張數、權重、市值照持股日。
  // closed：已收盤（或還沒開盤）。這時報價時間早於 13:30 的不完整（沒含收盤競價，2026-11-06 證交所停在 13:19:50），不用。
  function mergeComponents(components, stocks, priceDate, closed) {
    if (!isNewer(stocks, priceDate)) return components;
    let used = false;
    const out = components.map(c => {
      const q = stocks.quotes && stocks.quotes[c.s];
      if (!q || !isNum(q[0])) return c;
      const [p, ref, time] = q;
      if (closed && (time || "") < "13:30:00") return c;
      used = true;
      const ok = isNum(ref) && ref > 0;
      return { ...c, px: p, chg: ok ? round2((p / ref - 1) * 100) : c.chg, chgv: ok ? round2(p - ref) : c.chgv, live: true };
    });
    return used ? out : components;
  }

  // 要查即時報價的成份股：有市場別（tse／otc）、不是已出清的，每 60 檔一組
  function stockBatches(components) {
    const ids = [...new Set(components.filter(c => c.ex && c.flag !== "出清").map(c => `${c.ex}_${c.s}`))];
    const out = [];
    for (let i = 0; i < ids.length; i += MAX_STOCKS) out.push(ids.slice(i, i + MAX_STOCKS).join(","));
    return out;
  }

  return { isLiveWindow, isMarketOpen, isNewer, mergeOverview, mergeComponents, stockBatches };
})();

if (typeof module !== "undefined") module.exports = Live;
