// ============================================================
// Pinboard Bookmark Plus - Custom Style Injector
// Content script for pinboard.in pages
// ============================================================

(async () => {
  try {
    const [syncData, localData] = await Promise.all([
      chrome.storage.sync.get({ customFont: "", optTheme: "auto" }),
      chrome.storage.local.get({ customCSS: "" })
    ]);

    const { customFont, optTheme } = syncData;
    const { customCSS } = localData;

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
