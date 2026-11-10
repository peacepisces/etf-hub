// 網址 hash → 分頁。例：#/etf/00981A?tab=x → {route: "etf", args: ["00981A"], params}
"use strict";

const Router = (() => {
  const NAV = [["today", "今日"], ["rank", "排行"], ["holdings", "持股追蹤"], ["active", "主動式"], ["dividend", "配息"], ["tools", "工具"]];

  function parse(hash) {
    const [path, qs] = String(hash || "").replace(/^#\/?/, "").split("?");
    const parts = path.split("/").filter(Boolean).map(p => { try { return decodeURIComponent(p); } catch { return p; } });
    return { route: parts[0] || "today", args: parts.slice(1), params: new URLSearchParams(qs || "") };
  }

  return { NAV, parse };
})();

if (typeof module !== "undefined") module.exports = Router;
