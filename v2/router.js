// 網址 hash → 分頁。例：#/etf/00981A?tab=x → {route: "etf", args: ["00981A"], params}
"use strict";

const Router = (() => {
  const NAV = [["today", "今日焦點"], ["rank", "排行"], ["holdings", "持股追蹤"], ["active", "主動式專區"], ["dividend", "配息"], ["tools", "工具"]];

  function parse(hash) {
    const [path, qs] = String(hash || "").replace(/^#\/?/, "").split("?");
    const parts = path.split("/").filter(Boolean).map(p => { try { return decodeURIComponent(p); } catch { return p; } });
    return { route: parts[0] || "today", args: parts.slice(1), params: new URLSearchParams(qs || "") };
  }

  // 一頁上所有連結 → ETF 代號（照畫面順序、不重複）：詳細頁的上一檔／下一檔用
  function etfCodes(hrefs) {
    const out = [];
    for (const h of hrefs) {
      const r = parse(h);
      if (r.route === "etf" && r.args[0] && !out.includes(r.args[0])) out.push(r.args[0]);
    }
    return out;
  }

  // → [上一檔, 下一檔]，沒有就是 null
  function neighbors(codes, code) {
    const i = codes.indexOf(code);
    return i < 0 ? [null, null] : [codes[i - 1] ?? null, codes[i + 1] ?? null];
  }

  return { NAV, parse, etfCodes, neighbors };
})();

if (typeof module !== "undefined") module.exports = Router;
