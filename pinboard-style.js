// ============================================================
// Pinboard Bookmark Plus - Custom Style Injector
// Content script for pinboard.in pages
// ============================================================

(async () => {
  // Read chunked sync data (mirrors syncGetLarge from shared.js)
  async function readChunkedSync(key, defaultValue) {
    const meta = await chrome.storage.sync.get(key);
    if (!meta[key] || !meta[key]._chunks) return defaultValue;
    const chunkKeys = Array.from({ length: meta[key]._chunks }, (_, i) => `${key}_${i}`);
    const chunks = await chrome.storage.sync.get(chunkKeys);
    let str = "";
    for (const k of chunkKeys) str += (chunks[k] || "");
    return str || defaultValue;
  }

  try {
    const syncData = await chrome.storage.sync.get({ customFont: "", optTheme: "auto" });
    const customCSS = await readChunkedSync("customCSS", "");

    const { customFont, optTheme } = syncData;

    // Inject pbp-dark class based on extension theme setting
    const isDark = optTheme === "dark" ||
      (optTheme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("pbp-dark", isDark);

    if (!customFont && !customCSS) return;

    let css = "";
    if (customFont) {
      css += `body, .bookmark_title, .bookmark_description, .tag { font-family: ${customFont} !important; }\n`;
    }
    if (customCSS) {
      css += customCSS;
    }

    const style = document.createElement("style");
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  } catch (_) {}
})();
