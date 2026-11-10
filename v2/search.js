// 搜尋：ETF（代號、名稱）與個股（代號、名稱 → 反查持有的 ETF）。索引是 data/v2/search.json。
"use strict";

const Search = (() => {
  // 0＝代號完全相同、1＝代號開頭相同、2＝名稱或代號包含；不符合回 -1
  function score(code, name, q) {
    const c = String(code).toLowerCase(), n = String(name || "").toLowerCase();
    if (c === q) return 0;
    if (c.startsWith(q)) return 1;
    return c.includes(q) || n.includes(q) ? 2 : -1;
  }

  function pick(items, q, limit) {
    return items.map(x => [score(x.code, x.name, q), x])
      .filter(([sc]) => sc >= 0)
      .sort((a, b) => a[0] - b[0] || String(a[1].code).localeCompare(String(b[1].code)))
      .slice(0, limit).map(([, x]) => x.item);
  }

  function match(index, q, limit = 8) {
    q = String(q || "").trim().toLowerCase();
    if (!q || !index) return { etfs: [], stocks: [] };
    const etfs = pick((index.etfs || []).map(e => ({ code: e.c, name: e.n, item: e })), q, limit);
    const stocks = pick(Object.entries(index.stocks || {}).map(([s, v]) =>
      ({ code: s, name: v.n, item: { s, n: v.n, count: v.h.length } })), q, limit);
    return { etfs, stocks };
  }

  // 注音、拼音選字中的按鍵（Safari 確認選字的 Enter 會是 keyCode 229、isComposing 卻是 false）
  const composing = ev => !!ev.isComposing || ev.keyCode === 229;

  return { match, composing };
})();

if (typeof module !== "undefined") module.exports = Search;
