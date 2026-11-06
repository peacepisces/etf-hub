// 表格排序：純函式，網頁和 node 測試共用。
// cols: {key, get(row) → 排序值, text: 文字欄位}；s: {key, dir: 1 由小到大／-1 由大到小}
"use strict";

const Table = (() => {
  const isBlank = v => v === null || v === undefined || v === "";

  function sortRows(rows, cols, s) {
    // 網址帶了不存在或不能排序的欄位 → 用第一個能排序的欄位
    const col = cols.find(c => c.key === s.key && c.get) || cols.find(c => c.get);
    if (!col) return rows.slice();
    const dir = s.dir;
    return rows.slice().sort((a, b) => {
      const x = col.get(a), y = col.get(b);
      const xn = isBlank(x), yn = isBlank(y);
      if (xn || yn) return xn && yn ? 0 : xn ? 1 : -1;   // 沒有值的永遠排最後
      if (typeof x === "string" || typeof y === "string") return String(x).localeCompare(String(y), "zh-Hant") * dir;
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  }

  // 第一次點欄位：文字由小到大，數字由大到小
  const firstDir = col => (col && col.text ? 1 : -1);

  return { sortRows, firstDir };
})();

if (typeof module !== "undefined") module.exports = Table;
