// 共用：格式化、跳脫、讀資料。網頁和 node 測試共用（計算都在 build.py，這裡只負責顯示）
"use strict";

const Core = (() => {
  // v2 放在 /v2/ 底下，資料在上一層的 data/；切換成正式版時只要改這裡
  const DATA = "../data/";
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isNum = v => typeof v === "number" && isFinite(v);
  const dash = '<span class="muted">—</span>';
  function num(v, d = 2) { return isNum(v) ? v.toLocaleString("zh-TW", { minimumFractionDigits: d, maximumFractionDigits: d }) : dash; }
  // 期間報酬加上今天的漲跌：(1＋r)(1＋今天) − 1。昨天收盤算好的含息報酬 → 算到現在（盤中即時，使用者 2026-11-12）
  function compound(r, today) { return isNum(r) && isNum(today) ? Math.round(((1 + r / 100) * (1 + today / 100) - 1) * 10000) / 100 : r; }
  function liveRet(ret, today) { return ret ? Object.fromEntries(Object.entries(ret).map(([k, v]) => [k, compound(v, today)])) : ret; }
  function signCls(v) { return !isNum(v) || v === 0 ? "" : v > 0 ? "up" : "down"; }
  function pct(v, d = 2) {
    if (!isNum(v)) return dash;
    return `<span class="${signCls(v)}">${v > 0 ? "+" : ""}${num(v, d)}%</span>`;
  }
  // 規模（億）：一萬億以上寫兆
  function aum(v) { return isNum(v) ? (v >= 10000 ? `${num(v / 10000, 2)} 兆` : `${num(v, 0)} 億`) : dash; }
  const shortDate = d => d ? d.slice(5).replace("-", "/") : "—";
  async function loadJson(path) {
    const r = await fetch(DATA + path, { cache: "no-cache" });
    if (!r.ok) throw Object.assign(new Error(`${path} ${r.status}`), { status: r.status });
    return r.json();
  }
  // 檔案真的不存在（404）才當成沒有資料；網路斷線等錯誤要讓使用者知道是讀取失敗
  const isNotFound = err => !!err && err.status === 404;
  return { compound, liveRet, DATA, esc, isNum, dash, num, signCls, pct, aum, shortDate, loadJson, isNotFound };
})();

if (typeof module !== "undefined") module.exports = Core;
