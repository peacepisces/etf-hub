// K 線：期間切換、均線（純函式，node 測試共用）＋畫圖（瀏覽器，TradingView Lightweight Charts 4.2.0）
// rows：[[日期, 開, 高, 低, 收, 量（張）]] 由舊到新；價格是實際成交價，只換算過分割（build.py）
"use strict";

const Chart = (() => {
  const RANGES = [["m1", "1 月"], ["m3", "3 月"], ["m6", "6 月"], ["ytd", "今年"], ["y1", "1 年"], ["all", "全部"]];
  const MONTHS = { m1: 1, m3: 3, m6: 6, y1: 12 };
  const MAS = [5, 20, 60];
  // 已用 dataviz 驗證過（深、淺色各自 PASS）；避開紅綠，不和 K 棒混淆
  const MA_COLORS = { dark: ["#3987e5", "#c98500", "#9085e9"], light: ["#2a78d6", "#b07400", "#6250d6"] };

  // 起點：同 metrics.period_start（往回 N 個月，日期超過該月天數取月底）；今年＝今年第一個交易日起
  function startOf(end, range) {
    const [y, m, d] = end.split("-").map(Number);
    if (range === "ytd") return `${y}-01-01`;
    const total = y * 12 + (m - 1) - MONTHS[range];
    const yy = Math.floor(total / 12), mm = total % 12 + 1;
    const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    return `${yy}-${String(mm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
  }

  function slice(rows, range) {
    if (!rows.length || range === "all" || !(range in MONTHS || range === "ytd")) return rows.slice();
    const from = startOf(rows[rows.length - 1][0], range);
    return rows.filter(r => r[0] >= from);
  }

  function movingAverage(rows, n) {
    const out = [];
    let sum = 0;
    rows.forEach((r, i) => {
      sum += r[4];
      if (i >= n) sum -= rows[i - n][4];
      if (i >= n - 1) out.push({ time: r[0], value: Math.round(sum / n * 10000) / 10000 });
    });
    return out;
  }

  // 含息走勢：[[日期, 指數]] → 第一點 0%、之後累積 %
  function rebase(tri) {
    if (!tri.length) return [];
    const v0 = tri[0][1];
    return tri.map(([time, v]) => ({ time, value: Math.round((v / v0 - 1) * 10000) / 100 }));
  }

  // 0050 對齊 ETF 的第一天：從 from 當天（沒有就之前最近一天）起算 0%，只回傳 ≥ from 的點
  function alignBase(base, from) {
    let i = base.findIndex(r => r[0] >= from);
    if (i < 0) return [];
    if (base[i][0] > from && i > 0) i -= 1;
    return rebase(base.slice(i)).filter(p => p.time >= from);
  }

  // ---------- 畫圖（只在瀏覽器） ----------
  function baseChart(el) {
    const LC = globalThis.LightweightCharts;
    if (!LC) { el.innerHTML = '<p class="empty">圖表元件載入失敗，請重新整理</p>'; return null; }
    const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const [muted, line, panel] = ["--muted", "--line", "--panel"].map(css);
    const chart = LC.createChart(el, {
      autoSize: true,
      layout: { background: { color: panel }, textColor: muted, fontFamily: getComputedStyle(document.body).fontFamily },
      grid: { vertLines: { visible: false }, horzLines: { color: line } },
      rightPriceScale: { borderColor: line }, timeScale: { borderColor: line },
      crosshair: { mode: LC.CrosshairMode.Normal },
      localization: { locale: "zh-TW", dateFormat: "yyyy/MM/dd" },
    });
    return { LC, chart, css };
  }
  const tkey = t => !t ? null : typeof t === "string" ? t
    : `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;
  const fmtPct = v => v == null ? "—" : `${v > 0 ? "+" : ""}${Number(v).toFixed(2)}%`;

  // 含息走勢 vs 0050（單一軸：累積 %）；0050 灰色虛線
  function drawReturns(el, legendEl, tri, tri0050, range, code) {
    const b = baseChart(el);
    if (!b) return { destroy() {} };
    const { LC, chart, css } = b;
    const mine = rebase(slice(tri, range));
    const from = mine.length ? mine[0].time : "";
    const base = code === "0050" ? [] : alignBase(tri0050 || [], from);
    const s1 = chart.addLineSeries({ color: css("--accent"), lineWidth: 2, priceLineVisible: false,
      priceFormat: { type: "custom", formatter: fmtPct } });
    s1.setData(mine);
    if (base.length) {
      const s2 = chart.addLineSeries({ color: css("--muted"), lineWidth: 2, lineStyle: LC.LineStyle.Dashed, priceLineVisible: false,
        lastValueVisible: false, priceFormat: { type: "custom", formatter: fmtPct } });
      s2.setData(base);
    }
    chart.timeScale().fitContent();
    const m1 = new Map(mine.map(p => [p.time, p.value])), m2 = new Map(base.map(p => [p.time, p.value]));
    function legend(time) {
      const t = tkey(time) || (mine.length ? mine[mine.length - 1].time : null);
      if (!t) { legendEl.innerHTML = '<span>尚無報酬資料</span>'; return; }
      legendEl.innerHTML = `<b>${t.replaceAll("-", "/")}</b><span><i style="color:${css("--accent")}">━</i> ${code} ${fmtPct(m1.get(t))}</span>` +
        (base.length ? `<span><i style="color:${css("--muted")}">┅</i> 0050 ${fmtPct(m2.get(t))}</span>` : "");
    }
    legend(null);
    chart.subscribeCrosshairMove(p => legend(p && p.time));
    return { destroy() { chart.remove(); } };
  }

  // 折溢價：每日 % 長條（正紅負綠、標最高最低）；股價 vs 淨值兩條線（同一軸：元）
  function drawPremium(barsEl, linesEl, legendEl, rows) {
    const out = [];
    const b1 = baseChart(barsEl);
    if (!b1) return { destroy() {} };
    const up = b1.css("--up"), down = b1.css("--down");
    const bars = b1.chart.addHistogramSeries({ priceLineVisible: false, priceFormat: { type: "custom", formatter: fmtPct } });
    const valid = rows.filter(r => r[3] != null);   // 還沒成交的日子沒有折溢價（審查 #4）
    bars.setData(valid.map(r => ({ time: r[0], value: r[3], color: r[3] >= 0 ? up : down })));
    if (valid.length > 1) {
      const hi = valid.reduce((a, r) => r[3] > a[3] ? r : a), lo = valid.reduce((a, r) => r[3] < a[3] ? r : a);
      bars.setMarkers([{ time: hi[0], position: "aboveBar", color: b1.css("--fg"), shape: "arrowDown", text: `最高 ${fmtPct(hi[3])}` },
        { time: lo[0], position: "belowBar", color: b1.css("--fg"), shape: "arrowUp", text: `最低 ${fmtPct(lo[3])}` }]
        .sort((a, b) => a.time < b.time ? -1 : 1));
    }
    b1.chart.timeScale().fitContent();
    out.push(b1.chart);
    const b2 = baseChart(linesEl);
    if (b2) {
      const px = b2.chart.addLineSeries({ color: b2.css("--accent"), lineWidth: 2, priceLineVisible: false });
      const nav = b2.chart.addLineSeries({ color: b2.css("--muted"), lineWidth: 2, lineStyle: b2.LC.LineStyle.Dashed, priceLineVisible: false });
      px.setData(rows.filter(r => r[1] != null).map(r => ({ time: r[0], value: r[1] })));
      nav.setData(rows.filter(r => r[2] != null).map(r => ({ time: r[0], value: r[2] })));
      b2.chart.timeScale().fitContent();
      out.push(b2.chart);
    }
    const byT = new Map(rows.map(r => [r[0], r]));
    function legend(time) {
      const r = byT.get(tkey(time)) || rows[rows.length - 1];
      legendEl.innerHTML = r ? `<b>${r[0].replaceAll("-", "/")}</b><span>折溢價 ${fmtPct(r[3])}</span>` +
        `<span><i style="color:${b1.css("--accent")}">━</i> 股價 ${r[1] ?? "—"}</span><span><i style="color:${b1.css("--muted")}">┅</i> 淨值 ${r[2] ?? "—"}</span>` : "";
    }
    legend(null);
    out.forEach(c => c.subscribeCrosshairMove(p => legend(p && p.time)));
    return { destroy() { out.forEach(c => c.remove()); } };
  }
  function drawKline(el, legendEl, rows, range) {
    const LC = globalThis.LightweightCharts;
    if (!LC) { el.innerHTML = '<p class="empty">圖表元件載入失敗，請重新整理</p>'; return { destroy() {} }; }
    const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const dark = !matchMedia("(prefers-color-scheme: light)").matches;
    const [up, down, fg, muted, line, panel] = ["--up", "--down", "--fg", "--muted", "--line", "--panel"].map(css);
    const chart = LC.createChart(el, {
      autoSize: true,
      layout: { background: { color: panel }, textColor: muted, fontFamily: getComputedStyle(document.body).fontFamily },
      grid: { vertLines: { visible: false }, horzLines: { color: line } },
      rightPriceScale: { borderColor: line },
      timeScale: { borderColor: line },
      crosshair: { mode: LC.CrosshairMode.Normal },
      localization: { locale: "zh-TW", dateFormat: "yyyy/MM/dd" },
    });
    const visible = slice(rows, range);
    const from = visible.length ? visible[0][0] : "";
    const candle = chart.addCandlestickSeries({ upColor: up, downColor: down, borderUpColor: up, borderDownColor: down,
      wickUpColor: up, wickDownColor: down, priceLineVisible: false });
    candle.setData(visible.map(([time, open, high, low, close]) => ({ time, open, high, low, close })));
    const vol = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    candle.priceScale().applyOptions({ scaleMargins: { top: 0.06, bottom: 0.25 } });
    vol.setData(visible.map(r => ({ time: r[0], value: r[5] ?? 0, color: (r[4] >= r[1] ? up : down) + "66" })));
    // 均線用全部資料算，再只畫看得到的那段（期間開頭也有值）
    const colors = MA_COLORS[dark ? "dark" : "light"];
    const maSeries = MAS.map((n, i) => {
      const s = chart.addLineSeries({ color: colors[i], lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s.setData(movingAverage(rows, n).filter(p => p.time >= from));
      return s;
    });
    chart.timeScale().fitContent();

    const fmt = v => v == null ? "—" : Number(v).toLocaleString("zh-TW", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const byTime = new Map(visible.map(r => [r[0], r]));
    const maMaps = MAS.map(n => new Map(movingAverage(rows, n).map(p => [p.time, p.value])));
    // 字串日期在圖表裡會變成 {year, month, day}，換回 yyyy-MM-dd
    const key = t => !t ? null : typeof t === "string" ? t
      : `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;
    function legend(time) {
      const r = byTime.get(key(time)) || visible[visible.length - 1];
      if (!r) { legendEl.innerHTML = ""; return; }
      const mas = MAS.map((n, i) => `<i style="color:${colors[i]}">MA${n}</i> ${fmt(maMaps[i].get(r[0]))}`).join("　");
      legendEl.innerHTML = `<b>${r[0].replaceAll("-", "/")}</b><span>開 ${fmt(r[1])}</span><span>高 ${fmt(r[2])}</span>` +
        `<span>低 ${fmt(r[3])}</span><span>收 ${fmt(r[4])}</span><span>量 ${(r[5] ?? 0).toLocaleString("zh-TW")} 張</span><span>${mas}</span>`;
    }
    legend(null);
    chart.subscribeCrosshairMove(p => legend(p && p.time));
    return { destroy() { chart.remove(); } };
  }

  return { RANGES, MAS, MA_COLORS, slice, movingAverage, rebase, alignBase, drawKline, drawReturns, drawPremium };
})();

if (typeof module !== "undefined") module.exports = Chart;
