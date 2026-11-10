// 詳細頁標籤：固定屬性（灰）＋排名成就（金，代替主題：e添富 禁止程式下載，使用者 2026-11-10 同意）。
// 點標籤 → #/tag/<kind>/<value> 列出同標籤的 ETF。網頁和 node 測試共用。
"use strict";

const Tags = (() => {
  const FREQ = { 12: "月配", 6: "雙月配", 4: "季配", 2: "半年配", 1: "年配", 0: "不配息" };
  const MGMT = { "主動": "主動式", "被動": "被動式" };
  const isNum = v => typeof v === "number" && isFinite(v);

  function fixed(e) {
    const out = [];
    if (e.mgmt) out.push({ text: MGMT[e.mgmt] || e.mgmt, kind: "mgmt", value: e.mgmt });
    if (e.region) out.push({ text: e.region, kind: "region", value: e.region });
    if (e.type) out.push({ text: e.type, kind: "type", value: e.type });
    if (e.freq in FREQ) out.push({ text: FREQ[e.freq], kind: "freq", value: String(e.freq) });
    return out.slice(0, 4);
  }

  // 規則：[key, 取值, 分組, 前幾名, 標籤文字, 規則說明]
  const RULES = [
    ["ytd", e => e.ret && e.ret.ytd, e => e.mgmt, 3, (g, n) => `今年績效 ${MGMT[g] || g}第 ${n}`,
     (g, n, m) => `今年以來含息報酬，在 ${m} 檔${MGMT[g] || g} ETF 中排第 ${n}`],
    ["y1", e => e.ret && e.ret.y1, e => e.mgmt, 3, (g, n) => `近 1 年績效 ${MGMT[g] || g}第 ${n}`,
     (g, n, m) => `近 1 年含息報酬，在 ${m} 檔${MGMT[g] || g} ETF 中排第 ${n}`],
    ["yield", e => (e.yield_est ? null : e.yield), e => e.type, 5, (g, n) => `殖利率 ${g}第 ${n}`,
     (g, n, m) => `殖利率（近 12 個月實配，不含預估），在 ${m} 檔${g} ETF 中排第 ${n}`],
    ["aum", e => e.aum, e => e.type, 5, (g, n) => `規模 ${g}第 ${n}`,
     (g, n, m) => `資產規模，在 ${m} 檔${g} ETF 中排第 ${n}`],
  ];

  function achievements(e, etfs) {
    const out = [];
    RULES.forEach(([key, get, group, top, text, rule], order) => {
      const g = group(e);
      if (!g || g === "其他" || !isNum(get(e))) return;   // 「其他」不是一個類型，排名沒有意義
      const peers = etfs.filter(x => group(x) === g && isNum(get(x))).sort((a, b) => get(b) - get(a));
      const n = peers.indexOf(e) + 1 || peers.findIndex(x => x.code === e.code) + 1;
      if (n >= 1 && n <= top) out.push({ text: text(g, n), rule: rule(g, n, peers.length), kind: "ach", value: `${key}|${g}`, n, order });
    });
    return out.sort((a, b) => a.n - b.n || a.order - b.order).slice(0, 2);
  }

  function list(etfs, kind, value) {
    if (kind === "mgmt") return etfs.filter(e => e.mgmt === value);
    if (kind === "region") return etfs.filter(e => e.region === value);
    if (kind === "type") return etfs.filter(e => e.type === value);
    if (kind === "freq") return etfs.filter(e => String(e.freq) === String(value));
    if (kind === "ach") {
      const [key, g] = String(value).split("|");
      const r = RULES.find(x => x[0] === key);
      return r ? etfs.filter(e => r[2](e) === g && isNum(r[1](e))).sort((a, b) => r[1](b) - r[1](a)) : [];
    }
    return [];
  }

  const LABELS = { mgmt: "管理方式", region: "區域", type: "類型", freq: "配息頻率", ach: "排名" };
  function title(kind, value) {
    if (kind === "freq") return FREQ[value] || value;
    if (kind === "mgmt") return MGMT[value] || value;
    if (kind === "ach") {
      const [key, g] = String(value).split("|");
      const name = { ytd: "今年績效", y1: "近 1 年績效", yield: "殖利率", aum: "規模" }[key] || key;
      return `${name}：${MGMT[g] || g}`;
    }
    return value;
  }

  return { fixed, achievements, list, title, LABELS, FREQ };
})();

if (typeof module !== "undefined") module.exports = Tags;
