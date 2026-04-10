// ============================================================
// Markdown Preview Page
// ============================================================

(async function () {
  // Read preview data from storage
  const data = await chrome.storage.local.get("md_preview_data");
  const info = data.md_preview_data;
  if (!info) {
    document.getElementById("rendered-view").textContent = "No preview data available. Please use the Markdown button in the popup first.";
    return;
  }
  // Clear temporary data
  await chrome.storage.local.remove("md_preview_data");

  const { contentHtml, title, url, tokens, source } = info;
  // Lazy markdown conversion — only computed on first use (Raw view or Copy MD)
  let _markdown = info.markdown || null;
  function getMarkdown() {
    if (_markdown === null) _markdown = contentHtml ? htmlToMarkdown(contentHtml) : "";
    return _markdown;
  }

  // Fill header
  document.getElementById("preview-title").textContent = title || "Untitled";
  const urlEl = document.getElementById("preview-url");
  urlEl.textContent = url || "";
  urlEl.href = url || "#";
  const tokenEl = document.getElementById("token-count");
  if (source === "jina" && tokens && info.hasApiKey) {
    tokenEl.textContent = `${tokens} tokens`;
  } else {
    tokenEl.style.display = "none";
  }
  const sourceEl = document.getElementById("source-badge");
  if (sourceEl) {
    sourceEl.textContent = source === "jina" ? "Jina Reader" : "Defuddle";
  }
  document.title = `${title || "Markdown"} — Preview`;

  // Rendered = Defuddle HTML directly (best quality), or Markdown fallback for Jina
  const renderedView = document.getElementById("rendered-view");
  if (contentHtml) {
    // Lazy-load images, async decode to avoid blocking main thread
    const safeHtml = contentHtml
      .replace(/<img(?=\s)/gi, '<img loading="lazy" decoding="async"');
    renderedView.innerHTML = safeHtml;
  } else {
    renderedView.innerHTML = renderMarkdown(getMarkdown());
  }
  // Raw view populated lazily on first switch

  // View toggle
  const btnRaw = document.getElementById("btn-raw");
  const btnRendered = document.getElementById("btn-rendered");
  const rawView = document.getElementById("raw-view");

  btnRaw.addEventListener("click", () => {
    if (!rawView.textContent) rawView.textContent = getMarkdown();
    rawView.classList.remove("hidden");
    renderedView.classList.add("hidden");
    btnRaw.classList.add("active");
    btnRendered.classList.remove("active");
  });
  btnRendered.addEventListener("click", () => {
    renderedView.classList.remove("hidden");
    rawView.classList.add("hidden");
    btnRendered.classList.add("active");
    btnRaw.classList.remove("active");
  });

  // Copy buttons
  document.getElementById("btn-copy-md").addEventListener("click", async (e) => {
    await copyToClipboard(getMarkdown(), e.currentTarget);
  });
  document.getElementById("btn-copy-html").addEventListener("click", async (e) => {
    await copyToClipboard(renderedView.innerHTML, e.currentTarget); // nosec: reading back own generated HTML
  });
})();

// ---- Copy to clipboard with visual feedback ----
async function copyToClipboard(text, btn) {
  const label = btn.querySelector(".btn-label");
  const orig = label ? label.textContent : btn.textContent;
  const setLabel = (t) => { if (label) label.textContent = t; else btn.textContent = t; };
  try {
    await navigator.clipboard.writeText(text);
    setLabel("Copied!");
    btn.classList.add("copied");
    setTimeout(() => { setLabel(orig); btn.classList.remove("copied"); }, 1500);
  } catch (_) {
    setLabel("Failed");
    setTimeout(() => { setLabel(orig); }, 1500);
  }
}

// ---- Simple Markdown to HTML renderer ----
// Security note: Input is HTML-escaped before any Markdown processing.
// Content comes from Defuddle or Jina Reader API (server-side processed web pages),
// not from arbitrary user input. This page is an extension-internal tool.
function renderMarkdown(md) {
  if (!md) return "";
  // Escape HTML entities first to prevent injection
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks (``` ... ```) — extract and protect with placeholders before block splitting
  const codeBlocks = [];
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code class="lang-${lang}">${code.trimEnd()}</code></pre>`);
    return `\n\nCODEBLOCK_${idx}\n\n`;
  });

  // Split into blocks for block-level processing
  const blocks = html.split(/\n\n+/);
  const rendered = blocks.map(block => {
    // Restore protected code blocks
    const cbMatch = block.match(/^CODEBLOCK_(\d+)$/);
    if (cbMatch) return codeBlocks[parseInt(cbMatch[1])];

    // Headings
    block = block.replace(/^(#{1,6})\s+(.+)$/gm, (_, hashes, text) => {
      const level = hashes.length;
      return `<h${level}>${text}</h${level}>`;
    });

    // Horizontal rules
    block = block.replace(/^[-*_]{3,}\s*$/gm, "<hr>");

    // Blockquotes
    if (/^&gt;\s/m.test(block)) {
      const lines = block.split("\n").map(l => l.replace(/^&gt;\s?/, "")).join("\n");
      block = `<blockquote><p>${lines}</p></blockquote>`;
    }

    // Unordered lists
    if (/^\s*[-*+]\s/m.test(block) && !block.startsWith("<")) {
      const items = block.split(/\n/).filter(l => /^\s*[-*+]\s/.test(l))
        .map(l => `<li>${l.replace(/^\s*[-*+]\s+/, "")}</li>`).join("\n");
      block = `<ul>${items}</ul>`;
    }

    // Ordered lists
    if (/^\s*\d+\.\s/m.test(block) && !block.startsWith("<")) {
      const items = block.split(/\n/).filter(l => /^\s*\d+\.\s/.test(l))
        .map(l => `<li>${l.replace(/^\s*\d+\.\s+/, "")}</li>`).join("\n");
      block = `<ol>${items}</ol>`;
    }

    // Tables
    if (/\|.*\|/.test(block) && /\|[-:\s|]+\|/.test(block)) {
      const rows = block.split("\n").filter(r => r.trim().startsWith("|"));
      if (rows.length >= 2) {
        const parseRow = (r) => r.split("|").slice(1, -1).map(c => c.trim());
        const headerCells = parseRow(rows[0]);
        const bodyRows = rows.slice(2);
        let table = "<table><thead><tr>" + headerCells.map(c => `<th>${c}</th>`).join("") + "</tr></thead><tbody>";
        bodyRows.forEach(r => {
          const cells = parseRow(r);
          table += "<tr>" + cells.map(c => `<td>${c}</td>`).join("") + "</tr>";
        });
        table += "</tbody></table>";
        block = table;
      }
    }

    // Inline formatting (applied to all blocks)
    // Images — note: src URLs were escaped, unescape for valid URLs
    block = block.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
      src = src.replace(/&amp;/g, "&");
      return `<img src="${src}" alt="${alt}" />`;
    });
    // Links
    block = block.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => {
      href = href.replace(/&amp;/g, "&");
      return `<a href="${href}" target="_blank">${text}</a>`;
    });
    // Bold + italic
    block = block.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
    // Bold
    block = block.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    // Italic
    block = block.replace(/\*(.+?)\*/g, "<em>$1</em>");
    // Inline code
    block = block.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Wrap plain text blocks in <p>
    if (!block.startsWith("<") && block.trim()) {
      block = `<p>${block.replace(/\n/g, "<br>")}</p>`;
    }

    return block;
  });

  return rendered.join("\n");
}

// Convert HTML to Markdown via Turndown (for Raw view when only contentHtml is available)
function htmlToMarkdown(html) {
  if (typeof TurndownService === "undefined") return html;
  const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
  td.addRule("preformattedCode", {
    filter: (n) => n.nodeName === "PRE",
    replacement: (content, node) => {
      const code = node.querySelector("code");
      let lang = "";
      if (code) {
        const cls = code.getAttribute("class") || "";
        const m = cls.match(/language-(\S+)/);
        lang = (m && m[1]) || code.getAttribute("data-lang") || code.getAttribute("data-language") || "";
      }
      if (!lang) lang = node.getAttribute("data-language") || "";
      const text = (code || node).textContent || "";
      return "\n\n```" + lang + "\n" + text.replace(/`/g, "\\`") + "\n```\n\n";
    }
  });
  td.addRule("table", {
    filter: "table",
    replacement: (content, node) => {
      const rows = Array.from(node.querySelectorAll("tr"));
      if (!rows.length) return content;
      const out = [];
      rows.forEach((row, i) => {
        const cells = Array.from(row.querySelectorAll("th, td"))
          .map(c => (c.textContent || "").trim().replace(/\|/g, "\\|").replace(/\n/g, " "));
        out.push("| " + cells.join(" | ") + " |");
        if (i === 0) out.push("| " + cells.map(() => "---").join(" | ") + " |");
      });
      return "\n\n" + out.join("\n") + "\n\n";
    }
  });
  td.addRule("highlight", { filter: "mark", replacement: (c) => "==" + c + "==" });
  td.addRule("strikethrough", {
    filter: (n) => n.nodeName === "DEL" || n.nodeName === "S" || n.nodeName === "STRIKE",
    replacement: (c) => "~~" + c + "~~"
  });
  td.addRule("figure", {
    filter: "figure",
    replacement: (content, node) => {
      const img = node.querySelector("img");
      const caption = node.querySelector("figcaption");
      if (!img) return content;
      const alt = caption ? caption.textContent.trim() : (img.getAttribute("alt") || "");
      const src = img.getAttribute("src") || "";
      return "\n\n![" + alt + "](" + src + ")" + (caption ? "\n*" + caption.textContent.trim() + "*" : "") + "\n\n";
    }
  });
  td.addRule("listItem", {
    filter: "li",
    replacement: (content, node) => {
      content = content.replace(/^\n+/, "").replace(/\n+$/, "\n").replace(/\n/gm, "\n    ");
      const parent = node.parentNode;
      let prefix = "- ";
      if (parent && parent.nodeName === "OL") {
        const start = parseInt(parent.getAttribute("start") || "1", 10);
        const index = Array.from(parent.children).indexOf(node);
        prefix = (start + index) + ". ";
      }
      // Checkbox support
      const cb = node.querySelector("input[type=checkbox]");
      if (cb) {
        prefix += cb.checked ? "[x] " : "[ ] ";
        content = content.replace(/^\s*\[[ x]\]\s*/, "");
      }
      return prefix + content.trim() + "\n";
    }
  });
  return td.turndown(html);
}
