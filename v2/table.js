// 全站共用表格：排序（空值永遠最後）、只標「目前排序欄」的前 3 名、左欄固定。網頁和 node 測試共用。
// cols: {key, label, get(row) → 排序值, html(row, i) → 顯示, r: 靠右, text: 文字欄, cls: 額外 class（例 "mo" 月份細線）}
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

  // 依目前排序取前 n 個有值的列 → Map(列 → 名次)；文字欄不標名次
  function topRanks(sorted, col, n = 3) {
    const out = new Map();
    if (!col || !col.get || col.text) return out;
    for (const row of sorted) {
      if (out.size >= n) break;
      if (!isBlank(col.get(row))) out.set(row, out.size + 1);
    }
    return out;
  }

  function render(id, cols, rows, s, opts = {}) {
    const sorted = sortRows(rows, cols, s);
    const col = cols.find(c => c.key === s.key && c.get);
    const ranks = topRanks(sorted, col);
    const cls = (c, i, extra = "") => [i === 0 ? "sticky" : "", c.r ? "r num" : "", c.cls || "", extra].filter(Boolean).join(" ");
    const head = cols.map((c, i) => {
      const on = col && c.key === col.key;
      return `<th class="${cls(c, i, (c.get ? "sortable" : "") + (on ? " sorted" : ""))}"${c.get ? ` data-sort="${esc(c.key)}" data-table="${esc(id)}"` : ""}>${esc(c.label)}${on ? (s.dir > 0 ? " ▲" : " ▼") : ""}</th>`;
    }).join("");
    const body = sorted.map((row, i) => {
      const rank = ranks.get(row);
      const link = opts.rowLink ? ` class="link" data-href="${esc(opts.rowLink(row))}"` : "";
      return `<tr${link}>${cols.map((c, j) => {
        const top = rank && col && c.key === col.key ? "top" : "";
        const mark = rank && j === 0 ? `<span class="rk">${rank}</span>` : "";
        return `<td class="${cls(c, j, top)}">${mark}${c.html(row, i)}</td>`;
      }).join("")}</tr>`;
    }).join("");
    const empty = `<tr><td colspan="${cols.length}" class="muted">沒有資料</td></tr>`;
    return { html: `<div class="tbl-wrap"><table class="tbl"><thead><tr>${head}</tr></thead><tbody>${body || empty}</tbody></table></div>`, sorted };
  }

  return { sortRows, firstDir, topRanks, render };
})();

if (typeof module !== "undefined") module.exports = V2Table;
