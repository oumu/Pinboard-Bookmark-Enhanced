// ============================================================
// Jina Reader Markdown Preview Page
// ============================================================

(async function () {
  // Read preview data from storage
  const data = await chrome.storage.local.get("jina_preview_data");
  const info = data.jina_preview_data;
  if (!info) {
    document.getElementById("rendered-view").textContent = "No preview data available. Please use the Markdown button in the popup first.";
    return;
  }
  // Clear temporary data
  await chrome.storage.local.remove("jina_preview_data");

  const { markdown, title, url, tokens } = info;

  // Fill header
  document.getElementById("preview-title").textContent = title || "Untitled";
  const urlEl = document.getElementById("preview-url");
  urlEl.textContent = url || "";
  urlEl.href = url || "#";
  document.getElementById("token-count").textContent = tokens ? `${tokens} tokens` : "";
  document.title = `${title || "Markdown"} — Preview`;

  // Fill content
  document.getElementById("raw-view").textContent = markdown;
  const renderedHtml = renderMarkdown(markdown);
  // Security note: renderMarkdown() HTML-escapes all input before processing.
  // Content is from Jina Reader API (server-processed), not raw user input.
  // This is an extension-internal page, not exposed to the web.
  // nosec: intentional innerHTML for Markdown rendering
  document.getElementById("rendered-view").innerHTML = renderedHtml; // nosec

  // View toggle
  const btnRaw = document.getElementById("btn-raw");
  const btnRendered = document.getElementById("btn-rendered");
  const rawView = document.getElementById("raw-view");
  const renderedView = document.getElementById("rendered-view");

  btnRaw.addEventListener("click", () => {
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
    await copyToClipboard(markdown, e.target);
  });
  document.getElementById("btn-copy-html").addEventListener("click", async (e) => {
    await copyToClipboard(renderedView.innerHTML, e.target); // nosec: reading back own generated HTML
  });
})();

// ---- Copy to clipboard with visual feedback ----
async function copyToClipboard(text, btn) {
  const orig = btn.textContent;
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = "Copied!";
    btn.classList.add("copied");
    setTimeout(() => { btn.textContent = orig; btn.classList.remove("copied"); }, 1500);
  } catch (_) {
    btn.textContent = "Failed";
    setTimeout(() => { btn.textContent = orig; }, 1500);
  }
}

// ---- Simple Markdown to HTML renderer ----
// Security note: Input is HTML-escaped before any Markdown processing.
// Content comes from Jina Reader API (server-side processed web pages),
// not from arbitrary user input. This page is an extension-internal tool.
function renderMarkdown(md) {
  if (!md) return "";
  // Escape HTML entities first to prevent injection
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks (``` ... ```) — must be before inline processing
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="lang-${lang}">${code.trimEnd()}</code></pre>`;
  });

  // Split into blocks for block-level processing
  const blocks = html.split(/\n\n+/);
  const rendered = blocks.map(block => {
    // Skip pre blocks (already processed)
    if (block.startsWith("<pre>")) return block;

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
