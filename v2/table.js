// 全站共用表格：排序（空值永遠最後）、左欄固定。網頁和 node 測試共用。
// 有 top 的欄位各自標前 3 名（由大到小、不管目前照哪欄排序、只算傳進來的列＝篩選後）：
// 格子用該欄顏色打底，名稱欄加文字標籤（例「今年①」），不只靠顏色（使用者 2026-11-10）。
// cols: {key, label, get(row) → 排序值, html(row, i) → 顯示, r: 靠右, text: 文字欄, cls: 額外 class（例 "mo" 月份細線）,
//        top: 顏色代號（css 的 t-<top>）, tag: 標籤文字}
"use strict";

const V2Table = (() => {
  const isBlank = v => v === null || v === undefined || v === "" || (typeof v === "number" && !isFinite(v));
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function sortRows(rows, cols, s) {
    const col = cols.find(c => c.key === s.key && c.get) || cols.find(c => c.get);
    if (!col) return rows.slice();
    return rows.slice().sort((a, b) => {
      const x = col.get(a), y = col.get(b);
      const xn = isBlank(x), yn = isBlank(y);
      if (xn || yn) return xn && yn ? 0 : xn ? 1 : -1;
      if (typeof x === "string" || typeof y === "string") return String(x).localeCompare(String(y), "zh-Hant") * s.dir;
      return (x < y ? -1 : x > y ? 1 : 0) * s.dir;
    });
  }

  // 第一次點欄位：文字由小到大，數字由大到小
  const firstDir = col => (col && col.text ? 1 : -1);

  const CIRCLED = ["①", "②", "③", "④", "⑤"];

  // 每個 top 欄位 → Map(列 → 名次)，由大到小取前 n 個有值的
  function colTops(rows, cols, n = 3) {
    const out = new Map();
    for (const c of cols) {
      if (!c.top || !c.get) continue;
      const ranks = new Map();
      sortRows(rows, [c], { key: c.key, dir: -1 }).slice(0, n).forEach((row, i) => {
        if (!isBlank(c.get(row))) ranks.set(row, i + 1);
      });
      out.set(c.key, ranks);
    }
    return out;
  }

  function render(id, cols, rows, s, opts = {}) {
    const sorted = sortRows(rows, cols, s);
    const col = cols.find(c => c.key === s.key && c.get);
    const tops = colTops(rows, cols);
    const cls = (c, i, extra = "") => [i === 0 ? "sticky" : "", c.r ? "r num" : "", c.cls || "", extra].filter(Boolean).join(" ");
    const head = cols.map((c, i) => {
      const on = col && c.key === col.key;
      return `<th class="${cls(c, i, (c.get ? "sortable" : "") + (on ? " sorted" : ""))}"${c.get ? ` data-sort="${esc(c.key)}" data-table="${esc(id)}"` : ""}>${esc(c.label)}${on ? (s.dir > 0 ? " ▲" : " ▼") : ""}</th>`;
    }).join("");
    const body = sorted.map((row, i) => {
      const link = opts.rowLink ? ` class="link" data-href="${esc(opts.rowLink(row))}"` : "";
      const tags = cols.filter(c => tops.has(c.key) && tops.get(c.key).has(row))
        .map(c => `<span class="tag t-${esc(c.top)}">${esc(c.tag || c.label)}${CIRCLED[tops.get(c.key).get(row) - 1]}</span>`).join("");
      return `<tr${link}>${cols.map((c, j) => {
        const rank = tops.has(c.key) ? tops.get(c.key).get(row) : undefined;
        const top = rank ? `top t-${esc(c.top)}` : "";
        return `<td class="${cls(c, j, top)}">${c.html(row, i)}${j === 0 && tags ? `<span class="tags">${tags}</span>` : ""}</td>`;
      }).join("")}</tr>`;
    }).join("");
    const empty = `<tr><td colspan="${cols.length}" class="muted">沒有資料</td></tr>`;
    return { html: `<div class="tbl-wrap"><table class="tbl"><thead><tr>${head}</tr></thead><tbody>${body || empty}</tbody></table></div>`, sorted };
  }

  return { sortRows, firstDir, colTops, render };
})();

if (typeof module !== "undefined") module.exports = V2Table;
