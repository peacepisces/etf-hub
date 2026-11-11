// 配色選單：跟系統／深色／淺色／米色／深藍／高對比。選了存在這台瀏覽器（localStorage），下次打開沿用。
// 顏色都在 v2.css（:root[data-theme=…]）；圖表顏色從 css 變數讀，換配色後 app.js 會重畫。網頁和 node 測試共用。
"use strict";

const Theme = (() => {
  const SKINS = [["auto", "跟系統"], ["dark", "深色"], ["light", "淺色"], ["warm", "米色"], ["navy", "深藍"], ["contrast", "高對比"]];
  const KEY = "v2.theme";
  const valid = v => SKINS.some(([k]) => k === v);

  function saved() {
    try { const v = localStorage.getItem(KEY); return valid(v) ? v : "auto"; } catch { return "auto"; }
  }
  function apply(v, root = document.documentElement) {
    if (!valid(v) || v === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", v);
  }
  function save(v) {
    try { if (v === "auto") localStorage.removeItem(KEY); else localStorage.setItem(KEY, v); } catch { /* 隱私模式：只換這次 */ }
  }
  const options = cur => SKINS.map(([k, l]) => `<option value="${k}"${k === cur ? " selected" : ""}>${l}</option>`).join("");
  // 圖表用：目前畫面是淺色系還是深色系（看 css 的 color-scheme，跟系統時也對）
  const isLight = () => getComputedStyle(document.documentElement).colorScheme.includes("light");

  return { SKINS, KEY, saved, apply, save, options, isLight };
})();

if (typeof module !== "undefined") module.exports = Theme;
else Theme.apply(Theme.saved());   // 一載入就套用，畫面不會先閃一下別的顏色
