// 瀏覽人數（使用者 2026-11-18）：頁尾顯示「線上 N 人・今日 N 人（N 人次）・累計 N 人」。
// 計數在即時轉接站（worker.js 的 /hit、/ping、/visits，存在 Cloudflare D1）。
// - 訪客編號：第一次來時亂數產生、存在這台裝置的瀏覽器（不是個資）；換裝置、換瀏覽器、清瀏覽紀錄會算新的人
// - 人次：每個分頁打開網站算一次（同分頁換頁、舊版新版之間切換不重算）
// - 線上：網頁開著（分頁在前景）時每 60 秒回報一次
// - 站長自己：打開一次「網址?me=1」，這台裝置之後只看不算（?me=0 取消）
// 轉接站還沒設好或連不上：頁尾什麼都不顯示，其他功能不受影響。
"use strict";

const Counter = (() => {
  const PING_MS = 60000;
  const K_ID = "etf_vid", K_ME = "etf_me", K_HIT = "etf_hit";

  // 這次要做什麼：me＝不算（站長）；action＝hit（這個分頁第一次）或 ping；setMe＝要寫回的 me 設定
  function plan(search, me, hitDone) {
    const m = /[?&]me=([01])\b/.exec(search || "");
    const setMe = m ? m[1] === "1" : null;
    const isMe = setMe !== null ? setMe : me === "1";
    return { me: isMe, setMe, action: isMe ? "visits" : hitDone ? "ping" : "hit" };
  }

  function text(s, me) {
    if (!s || typeof s.total !== "number") return "";
    return `線上 ${s.online} 人・今日 ${s.today} 人（${s.views_today} 人次）・累計 ${s.total} 人${me ? "・這台裝置不計入" : ""}`;
  }

  function newId() {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return Array.from(a, b => b.toString(16).padStart(2, "0")).join("");
  }

  // localStorage 可能被擋（無痕、關掉網站資料）：讀寫都包 try，失敗就當沒有
  const get = (area, k) => { try { return window[area].getItem(k); } catch (e) { return null; } };
  const set = (area, k, v) => { try { v === null ? window[area].removeItem(k) : window[area].setItem(k, v); } catch (e) { /* 存不了就算了 */ } };

  function start(base) {
    const p = plan(location.search, get("localStorage", K_ME), get("sessionStorage", K_HIT) === "1");
    if (p.setMe !== null) set("localStorage", K_ME, p.setMe ? "1" : null);
    let id = get("localStorage", K_ID);
    if (!id) { id = newId(); set("localStorage", K_ID, id); }
    let action = p.action;
    async function tick() {
      if (document.hidden && action !== "hit") return;
      try {
        const url = action === "visits" ? `${base}/visits` : `${base}/${action}?id=${id}`;
        const r = await fetch(url, { method: action === "visits" ? "GET" : "POST", cache: "no-store" });
        if (!r.ok) return;
        const s = await r.json();
        if (action === "hit") { set("sessionStorage", K_HIT, "1"); action = "ping"; }
        const el = document.getElementById("visits");
        if (el) el.textContent = text(s, p.me);
      } catch (e) { /* 連不上：不顯示 */ }
    }
    tick();
    setInterval(tick, PING_MS);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
  }

  return { plan, text, start };
})();

if (typeof module !== "undefined") module.exports = Counter;
else Counter.start(["localhost", "127.0.0.1"].includes(location.hostname) ? "http://127.0.0.1:8787" : "https://etf-live.peacepisceslamb.workers.dev");
