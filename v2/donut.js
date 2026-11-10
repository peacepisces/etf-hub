// 甜甜圈圖（成分股、產業分布）：前 4 名＋「其他」；投信沒公布明細、用差額估算的「非股票部位」單獨一塊（灰斜線）。
// 顏色順序 藍、粉紅、黃、青綠（dataviz validator：相鄰兩塊色盲也分得開；圖例有名稱和百分比，不只靠顏色）。
// 負的（賣出的選擇權）不畫，表格照列。網頁和 node 測試共用。
"use strict";

const Donut = (() => {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const COLORS = ["var(--d1)", "var(--d2)", "var(--d3)", "var(--d4)"];
  const MIN = 0.5;   // %，太小的非股票部位不畫

  // items：[{name, w, nonstock?, estimated?}] → [{label, w, kind: item|other|nonstock}]
  function slices(items, n = 4) {
    const pos = (items || []).filter(i => typeof i.w === "number" && i.w > 0);
    const est = pos.filter(i => i.nonstock && i.estimated);
    const ranked = pos.filter(i => !(i.nonstock && i.estimated)).sort((a, b) => b.w - a.w);
    const out = ranked.slice(0, n).map(i => ({ label: i.name, w: i.w, kind: "item" }));
    const rest = ranked.slice(n).reduce((s, i) => s + i.w, 0);
    if (rest > 0) out.push({ label: "其他", w: Math.round(rest * 10000) / 10000, kind: "other" });
    for (const i of est) if (i.w >= MIN) out.push({ label: i.name, w: i.w, kind: "nonstock" });
    return out;
  }

  const fill = (s, i) => s.kind === "item" ? COLORS[i % COLORS.length] : s.kind === "other" ? "var(--d-other)" : "url(#d-hatch)";

  function svg(list) {
    if (!list || !list.length) return "";
    const total = list.reduce((s, x) => s + x.w, 0);
    const r = 50, C = 2 * Math.PI * r, gap = list.length > 1 ? 2 : 0;
    let at = 0;
    const arcs = list.map((s, i) => {
      const len = Math.max(0, (s.w / total) * C - gap);
      const arc = `<circle r="${r}" cx="60" cy="60" fill="none" stroke="${fill(s, i)}" stroke-width="20"
        stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-at).toFixed(2)}"><title>${esc(s.label)} ${s.w.toFixed(2)}%</title></circle>`;
      at += (s.w / total) * C;
      return arc;
    }).join("");
    const legend = list.map((s, i) => `<li><span class="sw ${s.kind}" style="background:${s.kind === "nonstock" ? "" : fill(s, i)}"></span>
      <span class="lb">${esc(s.label)}</span><span class="pc">${s.w.toFixed(2)}%</span></li>`).join("");
    return `<div class="donut"><svg viewBox="0 0 120 120" role="img" aria-label="比例圖">
      <defs><pattern id="d-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="var(--d-other)"/><line x1="0" y1="0" x2="0" y2="6" stroke="var(--muted)" stroke-width="2"/></pattern></defs>
      <g transform="rotate(-90 60 60)">${arcs}</g></svg><ul class="legend-list">${legend}</ul></div>`;
  }

  return { slices, svg, COLORS };
})();

if (typeof module !== "undefined") module.exports = Donut;
