// ============================================================
// Pinboard Bookmark Enhanced — Site-specific extraction rules
// ============================================================
// Injected (with vendor/defuddle.js) into the active tab's ISOLATED world by
// popup.js extractLocalMarkdown(). Runs BEFORE Defuddle: a matching rule returns
// clean { contentHtml, title } that reuses the existing Turndown path; no match
// (or empty content) → caller falls back to Defuddle.
//
// Self-contained: no imports, DOM-only. Exposes globals SITE_RULES / matchRule /
// applySiteRule so the injected inline func (page context) can call them.
// Adding a site = push one { id, match, extract }. Keep selectors here so markup
// drift is localized; per-rule smoke tests live in tests/md-convert-tests.html.

(function () {
  "use strict";

  // Edit-time constants (no settings UI). Tests may override via window.__PBP_<NAME>
  // hooks read at use-site by cfg().
  var V2EX_MAX_DEPTH = 4;
  var SO_DISC_MAX_DEPTH = 6;   // StackOverflow Discussions threads (deeper than V2EX)
  var SO_COMMENTS_PER_POST = 5;
  var SO_COMMENTS_GLOBAL = 60;
  var HN_MAX_DEPTH = 8;          // Hacker News threads nest deep; flatten beyond this level
  var HN_COMMENTS_GLOBAL = 200;  // cap total comments extracted from one HN item page
  function cfg(name, def) {
    var gg = (typeof window !== "undefined") ? window : (typeof self !== "undefined" ? self : null);
    return (gg && gg["__PBP_" + name] != null) ? gg["__PBP_" + name] : def;
  }

  // ---- lazy image normalization (background.js / popup.js extractors) ---
  // Generic (non-site-specific) lazy-image src promotion. Unlike fixLazyImages()
  // below (Zhihu-only, invoked from inside a site-rule's extract()), this runs on
  // the OUTPUT of either extraction path: a detached div holding a site-rule's
  // contentHtml, or a cloneNode(true) Document right before Defuddle.parse(). It
  // therefore must accept both an Element and a Document as rootEl, and it must
  // NEVER be pointed at the live page DOM -- callers own that guarantee.
  //
  // Per <img>: only a placeholder src (missing / empty-or-whitespace / a "data:"
  // URI) is eligible; a real src is left untouched. Candidate order: data-src,
  // then data-original, then data-lazy-src -- the first of the three that is
  // PRESENT wins even if its value later fails URL validation (no fallthrough to
  // srcset in that case). Only when none of the three attributes exists does it
  // fall back to the LAST candidate in srcset (or data-srcset when srcset is
  // absent), which by convention is the highest-resolution source. The winning
  // candidate is resolved against baseHref and only kept when the result is
  // http: or https: -- this also rejects the background extractor's SafeURL
  // about:blank shim result, plus javascript:/data: candidates.
  function lastSrcsetCandidate(srcset) {
    // srcset grammar is "URL [descriptor], ..." — but URLs may themselves
    // contain commas (Cloudinary/imgproxy transforms), so a bare split(",")
    // truncates them into bogus same-origin paths. Tokenize on whitespace
    // instead: descriptor tokens (2x / 480w, maybe with the separator comma
    // attached) are dropped, URL tokens keep embedded commas, and separator
    // commas at token edges are trimmed.
    var toks = String(srcset).trim().split(/\s+/);
    var last = "";
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i].replace(/^,+|,+$/g, "");
      var fused = t.match(/^([\d.]+[wxh]),(.+)$/i); // "2x,next.jpg": descriptor fused to the next URL
      if (fused) t = fused[2];
      if (!t || /^[\d.]+[wxh]$/i.test(t)) continue;
      last = t;
    }
    return last;
  }

  function pbpNormalizeLazyImages(rootEl, baseHref) {
    if (!rootEl || typeof rootEl.querySelectorAll !== "function") return 0;
    var count = 0;
    rootEl.querySelectorAll("img").forEach(function (img) {
      var src = img.getAttribute("src");
      var trimmed = (src == null) ? "" : String(src).replace(/^\s+|\s+$/g, "");
      var isPlaceholder = (src === null) || trimmed === "" || trimmed.indexOf("data:") === 0;
      if (!isPlaceholder) return; // real src: never touched

      var candidate = null;
      if (img.hasAttribute("data-src")) candidate = img.getAttribute("data-src");
      else if (img.hasAttribute("data-original")) candidate = img.getAttribute("data-original");
      else if (img.hasAttribute("data-lazy-src")) candidate = img.getAttribute("data-lazy-src");
      else {
        var srcset = img.hasAttribute("srcset") ? img.getAttribute("srcset")
          : (img.hasAttribute("data-srcset") ? img.getAttribute("data-srcset") : null);
        if (srcset) candidate = lastSrcsetCandidate(srcset);
      }
      if (candidate != null) candidate = String(candidate).replace(/^\s+|\s+$/g, "");
      if (!candidate) return; // present-but-empty/whitespace or absent: no write, no fallthrough

      var u;
      try { u = new URL(candidate, baseHref); } catch (_) { return; }
      if (u.protocol !== "http:" && u.protocol !== "https:") return;
      img.setAttribute("src", u.href);
      count++;
    });
    return count;
  }

  // Real-src upgrade (separate from the lazy pass above, whose "real src is
  // never touched" contract is test-pinned): when an <img> keeps a genuine
  // src but its srcset describes strictly larger candidates, promote the
  // largest `w`-descriptor candidate for archival quality. Fires only with
  // >=2 width-described candidates whose max is >=600w, only when the winner
  // resolves to http(s), and never on placeholder imgs (those belong to the
  // lazy pass). Same whitespace tokenizer as lastSrcsetCandidate (URLs may
  // embed commas).
  function pbpUpgradeSrcsetImages(rootEl, baseHref) {
    if (!rootEl || typeof rootEl.querySelectorAll !== "function") return 0;
    var count = 0;
    rootEl.querySelectorAll("img[srcset], img[data-srcset]").forEach(function (img) {
      var src = img.getAttribute("src");
      var trimmed = (src == null) ? "" : String(src).replace(/^\s+|\s+$/g, "");
      if (src === null || trimmed === "" || trimmed.indexOf("data:") === 0) return; // placeholder: lazy pass owns it
      var srcset = img.getAttribute("srcset") || img.getAttribute("data-srcset") || "";
      var toks = String(srcset).trim().split(/\s+/);
      var pendingUrl = null, best = null, described = 0;
      for (var i = 0; i < toks.length; i++) {
        var t = toks[i].replace(/^,+|,+$/g, "");
        if (!t) continue;
        var wm = t.match(/^([\d.]+)w$/i);
        if (wm) {
          if (pendingUrl) {
            described++;
            var w = parseFloat(wm[1]);
            if (!best || w > best.w) best = { url: pendingUrl, w: w };
            pendingUrl = null;
          }
          continue;
        }
        if (/^[\d.]+[xh]$/i.test(t)) { pendingUrl = null; continue; } // density/height descriptor: not width-described
        var fused = t.match(/^([\d.]+)w,(.+)$/i); // "400w,next.jpg": descriptor fused to the next URL
        if (fused) {
          if (pendingUrl) {
            described++;
            var fw = parseFloat(fused[1]);
            if (!best || fw > best.w) best = { url: pendingUrl, w: fw };
          }
          pendingUrl = fused[2];
          continue;
        }
        pendingUrl = t;
      }
      if (described < 2 || !best || best.w < 600) return;
      var resolved;
      try { resolved = new URL(best.url, baseHref || undefined).href; } catch (_) { return; }
      if (!/^https?:$/.test(new URL(resolved).protocol)) return;
      var current;
      try { current = new URL(trimmed, baseHref || undefined).href; } catch (_) { current = trimmed; }
      if (resolved === current) return;
      img.setAttribute("src", resolved);
      count++;
    });
    return count;
  }

  // Scratch document for every "parse an HTML string, poke at it, read a
  // string back" step in this file. It must NOT be the live page document:
  // detaching a node is not enough, because the image-loading algorithm only
  // suspends for a node document that is not fully active — a div created from
  // the LIVE document fetches every <img> it holds even while orphaned (the
  // `new Image().src = …` preload idiom is the same mechanism). fixLazyImages
  // promotes data-original/data-actualsrc/data-src onto src first, so that
  // would pull images the user never scrolled to, on a path (ai.js AI tags /
  // summary / batch save) that reads text and discards every byte of them.
  // createHTMLDocument() has no browsing context, so nothing loads. Built on
  // first use; a context without a document never pays for it.
  var _inertDoc = null;
  function inertDoc() {
    if (!_inertDoc && typeof document !== "undefined" && document.implementation) {
      _inertDoc = document.implementation.createHTMLDocument("");
    }
    return _inertDoc;
  }

  // Flatten a site-rule hit's contentHtml to prompt text (ai.js AI tags/
  // summary + batch save): newline after block closers and <br> so textContent
  // keeps block breaks — bare textContent glues "Line one<br>Line two" and
  // adjacent table cells together.
  function pbpSiteRuleText(html) {
    var div = inertDoc().createElement("div");
    div.innerHTML = String(html == null ? "" : html)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|li|blockquote|tr|td|th)>/gi, "$&\n");
    return (div.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
  }

  // ---- shared helpers ----------------------------------------------------

  function readEntities(doc) {
    try {
      var el = doc.getElementById("js-initialData");
      if (!el) return {};
      var data = JSON.parse(el.textContent || "{}");
      return (data.initialState && data.initialState.entities) || {};
    } catch (_) { return {}; }
  }

  // Also encodes double quotes: escapeHtml output lands inside double-quoted
  // href attributes (answerSection, extractArxiv), where a bare " truncates
  // the attribute even though downstream DOMPurify prevents actual XSS.
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // Zhihu lazy-loads images: real URL in data-original / data-actualsrc / data-src. Promote
  // to src so markdown keeps them. Operates on a node of the INERT document
  // (see inertDoc) — never the live DOM, and never a node that could fetch.
  function fixLazyImages(root) {
    if (!root || !root.querySelectorAll) return root;
    root.querySelectorAll("img").forEach(function (img) {
      var real = img.getAttribute("data-original") || img.getAttribute("data-actualsrc") || img.getAttribute("data-src");
      var cur = img.getAttribute("src") || "";
      if (real && (!cur || cur.indexOf("data:") === 0)) img.setAttribute("src", real);
      img.removeAttribute("data-original");
      img.removeAttribute("data-actualsrc");
      img.removeAttribute("data-src");
    });
    return root;
  }

  // Parse an HTML string into an inert-document div, fix lazy images, return
  // innerHTML. Takes no document: the source document is exactly what must
  // never own this scratch node (see inertDoc).
  function cleanBodyHtml(html) {
    if (!html) return "";
    var tmp = inertDoc().createElement("div");
    tmp.innerHTML = html;
    fixLazyImages(tmp);
    return tmp.innerHTML;
  }

  function pickText(doc, picks) {
    for (var i = 0; i < (picks || []).length; i++) {
      var p = picks[i];
      if (Array.isArray(p)) { var el = doc.querySelector(p[0]); if (el) { var v = el.getAttribute(p[1]); if (v) return v.trim(); } }
      else { var e2 = doc.querySelector(p); if (e2 && e2.textContent.trim()) return e2.textContent.trim(); }
    }
    return "";
  }

  function answerSection(author, voteup, permalink, bodyHtml) {
    var head = "<h2>" + escapeHtml(author || "匿名用户") + "</h2>";
    var meta = "<p>" + escapeHtml(String(voteup || 0) + " 赞同") +
      (permalink ? ' · <a href="' + escapeHtml(permalink) + '">链接</a>' : "") + "</p>";
    return head + meta + (bodyHtml || "");
  }

  // Parse a Zhihu vote count from text / aria-label: "赞同 430" -> 430, "1.2万" -> 12000.
  function parseCount(s) {
    s = String(s == null ? "" : s);
    var m = s.match(/([\d.]+)\s*万/);
    if (m) return Math.round(parseFloat(m[1]) * 10000);
    m = s.match(/([\d.]+)\s*[kK]/);
    if (m) return Math.round(parseFloat(m[1]) * 1000);
    m = s.match(/(\d[\d,]*)/);
    return m ? parseInt(m[1].replace(/,/g, ""), 10) : 0;
  }

  // Vote count from a js-initialData answer entity. Zhihu normalizes API fields to
  // camelCase (voteupCount); tolerate api/v4 snake_case (voteup_count) too.
  function entVoteup(ans) {
    if (!ans) return 0;
    var v = (ans.voteupCount != null) ? ans.voteupCount : ans.voteup_count;
    return Number(v) || 0;
  }

  // Vote count from a rendered card/doc — the up-vote button (down = VoteButton--down).
  // DOM fallback for lazy-loaded answers that aren't in js-initialData.
  function domVoteup(root) {
    if (!root || !root.querySelector) return 0;
    var btn = root.querySelector(".VoteButton:not(.VoteButton--down)");
    if (!btn) return 0;
    return parseCount(btn.getAttribute("aria-label") || btn.textContent);
  }

  // ---- Zhihu: zhuanlan article (zhuanlan.zhihu.com/p/{id}) ---------------

  function extractZhihuArticle(doc, url) {
    var id = (url.match(/\/p\/(\d+)/) || [])[1];
    var ent = readEntities(doc);
    var title = "", html = "";
    var art = id && ent.articles && ent.articles[id];
    if (art) { title = art.title || ""; html = art.content || ""; }
    if (!html) {
      var node = doc.querySelector(".Post-RichText") || doc.querySelector(".RichText.ztext");
      if (node) html = node.innerHTML;
    }
    if (!title) {
      var tEl = doc.querySelector(".Post-Title") || doc.querySelector("h1");
      if (tEl) title = tEl.textContent.trim();
    }
    var contentHtml = cleanBodyHtml(html);
    if (!contentHtml) return null;
    return { contentHtml: contentHtml, title: title || doc.title };
  }

  // ---- Zhihu: question title / detail helpers ---------------------------

  function questionTitle(doc, qid, ent) {
    var q = qid && ent.questions && ent.questions[qid];
    if (q && q.title) return q.title;
    var el = doc.querySelector(".QuestionHeader-title");
    return el ? el.textContent.trim() : doc.title;
  }

  function questionDetailHtml(doc, qid, ent) {
    var q = qid && ent.questions && ent.questions[qid];
    var html = (q && q.detail) || "";
    if (!html) {
      var el = doc.querySelector(".QuestionRichText .RichText.ztext") ||
               doc.querySelector(".QuestionHeader-detail");
      if (el) html = el.innerHTML;
    }
    return cleanBodyHtml(html);
  }

  // ---- Zhihu: single answer permalink (/question/{q}/answer/{a}) ---------

  function extractZhihuAnswer(doc, url) {
    var m = url.match(/\/question\/(\d+)\/answer\/(\d+)/) || [];
    var qid = m[1], aid = m[2];
    var ent = readEntities(doc);
    var ans = aid && ent.answers && ent.answers[aid];
    var bodyHtml = "", author = "", voteup = 0;
    if (ans) { bodyHtml = ans.content || ""; author = (ans.author && ans.author.name) || ""; voteup = entVoteup(ans); }
    // DOM fallbacks are scoped to the answer's own card: the permalink page
    // also renders the question description as a .RichText.ztext ABOVE the
    // answer, so a whole-document first-match would return the question text
    // as the answer body (and, for zero-vote answers, a foreign card's vote
    // button). No card at all => leave fields empty; a null return hands the
    // page to Defuddle rather than mislabeling the question description.
    var card = aid ? doc.querySelector('.ContentItem.AnswerItem[name="' + aid + '"]') : null;
    if (!card) {
      // Nameless first card = markup drift, acceptable stand-in. A card
      // explicitly named as a DIFFERENT answer is not — its body would be
      // exported under this URL's permalink.
      var first = doc.querySelector(".ContentItem.AnswerItem");
      if (first && !first.getAttribute("name")) card = first;
    }
    if (!bodyHtml && card) {
      var node = card.querySelector(".RichText.ztext");
      if (node) bodyHtml = node.innerHTML;
    }
    if (!author && card) {
      var aEl = card.querySelector(".AuthorInfo-name") || card.querySelector(".AuthorInfo .UserLink-link");
      if (aEl) author = aEl.textContent.trim();
    }
    if (!voteup && card) voteup = domVoteup(card);
    var body = cleanBodyHtml(bodyHtml);
    if (!body) return null;
    var permalink = (qid && aid) ? "https://www.zhihu.com/question/" + qid + "/answer/" + aid : url;
    return { contentHtml: answerSection(author, voteup, permalink, body), title: questionTitle(doc, qid, ent) };
  }

  // ---- Zhihu: question page, all currently-loaded answers ----------------

  function extractZhihuQuestion(doc, url) {
    var qid = (url.match(/\/question\/(\d+)/) || [])[1];
    var ent = readEntities(doc);
    var sections = [];
    var seen = Object.create(null); // keyed by page data — no prototype keys

    // The entity table can carry answers belonging to OTHER questions
    // (related/recommended modules ship in the same js-initialData), while
    // pushAnswer always splices the CURRENT qid into permalinks — a foreign
    // answer would leak in with a fabricated URL. An entity is foreign only
    // when it explicitly names a different question; absent field = trusted
    // (older payload shapes).
    function foreignAnswer(ans) {
      if (!ans || !qid) return false;
      var q = ans.question;
      var qown = q == null ? null : (typeof q === "object" ? q.id : q);
      return qown != null && String(qown) !== String(qid);
    }

    function pushAnswer(aid, author, voteup, bodyHtml) {
      bodyHtml = (typeof bodyHtml === "string") ? bodyHtml : "";
      if (!bodyHtml) return;
      // No-aid fallback key includes length to avoid collisions between two
      // same-author answers that share their first 40 chars.
      var key = aid || (author + ":" + bodyHtml.length + ":" + bodyHtml.slice(0, 40));
      if (seen[key]) return;
      seen[key] = 1;
      var permalink = (qid && aid) ? "https://www.zhihu.com/question/" + qid + "/answer/" + aid : "";
      sections.push(answerSection(author, voteup, permalink, cleanBodyHtml(bodyHtml)));
    }

    // Source 1: rendered DOM cards in display (sort) order, enriched by initialData.
    var cards = doc.querySelectorAll(".List-item .ContentItem.AnswerItem, .ContentItem.AnswerItem");
    cards.forEach(function (card) {
      var aid = card.getAttribute("name") || "";
      var ans = aid && ent.answers && ent.answers[aid];
      if (foreignAnswer(ans)) return; // entity proves the card is another question's
      if (!ans && qid) {
        // No entity to consult — the card's own SSR itemprop=url meta still
        // names the owning question; a mismatch means a recommended-module
        // card from another question.
        var mu = card.querySelector('meta[itemprop="url"]');
        var mq = ((mu && mu.getAttribute("content") || "").match(/\/question\/(\d+)\//) || [])[1];
        if (mq && mq !== qid) return;
      }
      var bodyHtml = "", author = "", voteup = 0;
      if (ans) { bodyHtml = ans.content || ""; author = (ans.author && ans.author.name) || ""; voteup = entVoteup(ans); }
      if (!bodyHtml) { var node = card.querySelector(".RichText.ztext"); if (node) bodyHtml = node.innerHTML; }
      if (!author) { var aEl = card.querySelector(".AuthorInfo-name") || card.querySelector(".AuthorInfo .UserLink-link"); if (aEl) author = aEl.textContent.trim(); }
      if (!voteup) voteup = domVoteup(card);
      pushAnswer(aid, author, voteup, bodyHtml);
    });

    // Source 2: initialData answers with no matching DOM card (keeps the full batch).
    if (ent.answers) {
      Object.keys(ent.answers).forEach(function (aid) {
        if (seen[aid]) return;
        var ans = ent.answers[aid];
        if (!ans || !ans.content || foreignAnswer(ans)) return;
        pushAnswer(aid, (ans.author && ans.author.name) || "", entVoteup(ans), ans.content);
      });
    }

    if (!sections.length) return null;

    // The initialData snapshot only carries the first paginated batch, so a
    // 100-answer question can silently export 5. When the question entity
    // reports a total, compare it against what we actually extracted; the
    // empty-entities check stays as the fallback for payload-less pages.
    var note = "";
    var qEnt = qid && ent.questions && ent.questions[qid];
    var total = Number(qEnt && (qEnt.answerCount != null ? qEnt.answerCount : qEnt.answer_count)) || 0;
    if (total > sections.length) {
      note = "<blockquote><p>" +
        escapeHtml("注：该问题共 " + total + " 个回答，本次仅提取到已加载的 " + sections.length + " 个；登录并向下滚动加载更多回答后再导出可获取更多。") +
        "</p></blockquote>";
    } else if (!ent.answers || !Object.keys(ent.answers).length) {
      note = "<blockquote><p>" +
        escapeHtml("注：仅提取到当前页面已加载/可见的回答；登录并向下滚动加载更多回答后再导出可获取更多。") +
        "</p></blockquote>";
    }
    var detail = questionDetailHtml(doc, qid, ent);
    return { contentHtml: note + (detail || "") + sections.join("\n"), title: questionTitle(doc, qid, ent) };
  }

  // ---- StackOverflow / StackExchange (JSON-LD QAPage; DOM fallback) ------
  function extractStackOverflow(doc) {
    var title = pickText(doc, ["#question-header h1", "h1 a.question-hyperlink", "h1[itemprop=name]"]); // NOT bare h1 — an onboarding modal can render an earlier h1
    var parts = [];
    var counters = { total: 0, capped: false };
    var qPost = doc.querySelector("#question");
    var q = doc.querySelector("#question .s-prose.js-post-body");
    if (q) parts.push(cleanBodyHtml(q.innerHTML));
    if (qPost) { var qc = soCommentsHtml(qPost, doc, counters); if (qc) parts.push(qc); }
    var disc = doc.querySelector("#replies-container");
    var discReplies = disc ? disc.querySelectorAll("[id^='reply-']") : [];
    if (discReplies.length) {
      // StackOverflow Discussions: one topic + THREADED replies (nested blockquotes).
      // Replies are flat siblings; depth comes from .flex--item.fl-grow1 wrapper nesting.
      parts.push("<h2>" + escapeHtml(discReplies.length + (discReplies.length === 1 ? " Reply" : " Replies")) + "</h2>");
      var rlist = [];
      Array.prototype.forEach.call(discReplies, function (rep) {
        var author = (rep.getAttribute("data-author-username") || "").trim();
        if (!author) { var uc = rep.querySelector(".s-user-card--link"); if (uc) author = uc.textContent.trim(); }
        var rbody = rep.querySelector(".s-prose.js-post-body") || rep.querySelector(".s-prose");
        rlist.push({ author: author, bodyHtml: rbody ? cleanBodyHtml(rbody.innerHTML) : "", depth: soReplyDepth(rep, disc) });
      });
      parts.push(renderThreadHtml(buildDepthTree(rlist), 0, { headFn: soDiscReplyHtml, maxDepth: cfg("SO_DISC_MAX_DEPTH", SO_DISC_MAX_DEPTH) }));
    } else {
      var posts = doc.querySelectorAll("#answers .answer");
      if (posts.length) {
        parts.push("<h2>" + escapeHtml(posts.length + (posts.length === 1 ? " Answer" : " Answers")) + "</h2>");
        posts.forEach(function (post) {
          var body = post.querySelector(".s-prose.js-post-body");
          if (!body) return;
          var us = post.querySelectorAll(".user-details a"); // classic: last = answerer
          var author = us.length ? us[us.length - 1].textContent.trim() : "";
          if (!author) { var sc = post.querySelector(".s-user-card--link"); if (sc) author = sc.textContent.trim(); }
          var vc = post.querySelector(".js-vote-count");
          var votes = vc ? vc.textContent.trim() : post.getAttribute("data-score");
          var accepted = post.classList.contains("accepted-answer"); // .js-accepted-answer-indicator exists (hidden) in every answer
          var head = (accepted ? "[accepted] " : "") + (author || "") + (votes ? " · " + votes + " votes" : "");
          parts.push("<h3>" + escapeHtml(head.trim() || "answer") + "</h3>" + cleanBodyHtml(body.innerHTML));
          var ac = soCommentsHtml(post, doc, counters); if (ac) parts.push(ac);
        });
      }
    }
    if (counters.capped) parts.push("<blockquote><p>" + escapeHtml("注：评论过多，部分未提取。") + "</p></blockquote>");
    if (!parts.join("")) return null;
    return { contentHtml: parts.join("\n"), title: title || doc.title };
  }

  // ---- V2EX (topic + threaded replies) ----------------------------------
  function extractV2ex(doc) {
    var title = pickText(doc, ["h1"]);
    var parts = [];
    var topic = doc.querySelector(".topic_content");
    if (topic) parts.push(cleanBodyHtml(topic.innerHTML));
    // 附言 (appendix) blocks: each .subtle is a separate OP addendum with its
    // own .fade header ("第 N 条附言 · 时间"). They used to be dumped bare
    // right after the main post, so multiple 附言 read as one undifferentiated
    // body (user report 2026-07-15, /t/1226505). Promote each header to an
    // <h3> — subordinate to the post, above the <h2> replies section; the preview
    // TOC picks them up for free. Header text falls back to a counted label
    // when .fade is missing; the relative time is capture-time, kept as-is.
    doc.querySelectorAll(".subtle").forEach(function (ap, i) {
      var body = ap.querySelector(".topic_content");
      if (!body) return;
      var head = ((ap.querySelector(".fade") || {}).textContent || "").replace(/\s+/g, " ").trim()
        || ("附言 " + (i + 1));
      parts.push("<h3>" + escapeHtml(head) + "</h3>");
      parts.push(cleanBodyHtml(body.innerHTML));
    });
    var cells = doc.querySelectorAll('.cell[id^="r_"]');
    if (cells.length) {
      var replies = [];
      cells.forEach(function (cell) {
        // First /member/ link WITH text — skips avatar <a href="/member/..">​<img></a>
        // (empty text, injected by V2EX Polish etc.) which would yield 匿名 AND break
        // @mention→author threading. pickText-style fallthrough, restored after a regression.
        var author = "";
        var mlinks = cell.querySelectorAll("a[href^='/member/']");
        for (var ai = 0; ai < mlinks.length; ai++) { var at = mlinks[ai].textContent.trim(); if (at) { author = at; break; } }
        if (!author) { var sEl = cell.querySelector("strong a") || cell.querySelector("a.dark"); if (sEl) author = sEl.textContent.trim(); }
        var floor = ((cell.querySelector(".no") || {}).textContent || "").trim();
        var thanks = parseCount(((cell.querySelector(".small.fade") || {}).textContent || ""));
        var bodyEl = cell.querySelector(".reply_content");
        var text = bodyEl ? bodyEl.textContent : "";
        // Mentions: V2EX renders them as @-prefixed /member/ anchors — harvest
        // those instead of text-scanning the body, which mistook emails and
        // code containing "@" for reply-to edges. The text scan survives only
        // as an anchor-less fallback, gated to start-of-text/whitespace.
        var mentions = [];
        if (bodyEl) {
          bodyEl.querySelectorAll("a[href^='/member/']").forEach(function (ma) {
            var mt = (ma.textContent || "").trim();
            if (mt.charAt(0) === "@" && mt.length > 1) mentions.push(mt.slice(1));
          });
        }
        if (!mentions.length) {
          // Boundary also admits CJK/ASCII colon, comma and opening paren so
          // anchor-less "回复：@alice" prefixes still thread.
          mentions = (text.match(/(?:^|[\s(（:：,，])@([A-Za-z0-9_]+)/g) || []).map(function (s) { return s.slice(s.indexOf("@") + 1); });
        }
        var refFloors = (text.match(/#(\d+)/g) || []).map(function (s) { return s.slice(1); });
        replies.push({
          id: cell.id, author: author, floor: floor, mentions: mentions, refFloors: refFloors,
          bodyHtml: bodyEl ? cleanBodyHtml(bodyEl.innerHTML) : "", thanks: thanks
        });
      });
      parts.push("<h2>" + escapeHtml("回复 (" + replies.length + ")") + "</h2>");
      parts.push(renderThreadHtml(buildReplyTree(replies), 0));
    }
    if (!parts.join("")) return null;
    var pages = doc.querySelectorAll("#Main .box .inner .page_normal, #Main .box .inner .page_current");
    var note = "";
    if (pages.length > 1) note = "<blockquote><p>" + escapeHtml("注：仅提取当前页回复（共 " + pages.length + " 页）。") + "</p></blockquote>";
    return { contentHtml: note + parts.join("\n"), title: title };
  }

  // ---- Hacker News (item page: story title + threaded comments) ----------
  // No floor/thanks/@-strip (HN-specific). Header = author; body = .commtext.
  function hnReplyHtml(node) {
    return "<p><strong>" + escapeHtml(node.author || "匿名") + "</strong></p>" + (node.bodyHtml || "");
  }

  // Drop dead placeholders that shield no live descendants (bottom-up).
  function pruneDeadLeaves(nodes) {
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      n.children = pruneDeadLeaves(n.children);
      if (n.dead && !n.children.length) continue;
      out.push(n);
    }
    return out;
  }

  function extractHackerNews(doc) {
    var title = pickText(doc, [".fatitem .titleline > a", ".titleline > a", ".athing .titleline a"]) || doc.title;
    var parts = [];
    // Optional Ask-HN / self-post body (the toptext under the title).
    var top = doc.querySelector(".fatitem .toptext") || doc.querySelector("td.cell .toptext");
    if (top && top.textContent.trim()) parts.push(cleanBodyHtml(top.innerHTML));

    var rows = doc.querySelectorAll("table.comment-tree tr.athing.comtr");
    if (!rows.length) rows = doc.querySelectorAll("tr.athing.comtr");
    var globalCap = cfg("HN_COMMENTS_GLOBAL", HN_COMMENTS_GLOBAL);
    var maxDepth = cfg("HN_MAX_DEPTH", HN_MAX_DEPTH);
    var replies = [], capped = false, live = 0;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      // Collapsed threads: HN stamps noshow on every hidden descendant, so
      // skipping the rows outright cannot orphan a visible child.
      if (row.classList.contains("noshow")) continue;
      var userEl = row.querySelector(".hnuser");
      var author = userEl ? userEl.textContent.trim() : "";
      var bodyEl = row.querySelector(".commtext");
      // depth: td.ind[indent] (modern HN) or its spacer img width / 40 (legacy)
      var ind = row.querySelector("td.ind");
      var depth = 0;
      if (ind) {
        var ia = ind.getAttribute("indent");
        if (ia != null && ia !== "") depth = parseInt(ia, 10) || 0;
        else { var im = ind.querySelector("img"); if (im) depth = Math.round((parseInt(im.getAttribute("width"), 10) || 0) / 40); }
      }
      var bodyHtml = bodyEl ? cleanBodyHtml(bodyEl.innerHTML) : "";
      if (row.querySelector(".comment .dead") || (!author && !bodyHtml)) {
        // Dead/deleted rows CAN have live deeper replies. Dropping the row
        // shifted buildDepthTree's stack, binding those replies to a stale
        // earlier branch — keep a body-less placeholder at the row's depth;
        // childless placeholders are pruned once the tree is built.
        replies.push({ author: author || "[dead]", bodyHtml: "", depth: depth, dead: true });
        continue;
      }
      // Cap trips only on a LIVE row: breaking on a dead tail row would flag
      // truncation ("N+" and the note) when nothing visible was omitted.
      if (live >= globalCap) { capped = true; break; }
      replies.push({ author: author, bodyHtml: bodyHtml, depth: depth });
      live++;
    }
    if (live) {
      parts.push("<h2>" + escapeHtml("Comments (" + live + (capped ? "+" : "") + ")") + "</h2>");
      parts.push(renderThreadHtml(pruneDeadLeaves(buildDepthTree(replies)), 0, { headFn: hnReplyHtml, maxDepth: maxDepth }));
    }
    if (capped) parts.push("<blockquote><p>" + escapeHtml("Note: only the first " + globalCap + " comments were extracted.") + "</p></blockquote>");
    if (!parts.join("")) return null;
    return { contentHtml: parts.join("\n"), title: title };
  }

  // ---- X / Twitter: single status page ----------------------------------
  // Scope is deliberately narrow: keep the tweet text's inline <br> fidelity, and
  // leave thread/reply expansion to Defuddle or a future explicit rule.
  function extractTwitterStatus(doc, url) {
    // A reply's status page renders the PARENT tweet above the target, so
    // first-article grabs the wrong status. Anchor on the id from the URL:
    // the target tweet's own timestamp/analytics links carry /status/<id>
    // inside its article. Fall back to the old first-article heuristic when
    // the id link isn't rendered (test fixtures, markup drift).
    var sid = (String(url || "").match(/\/status\/(\d+)/) || [])[1];
    var article = null;
    if (sid) {
      // href*= is substring matching — /status/22 would hit /status/222 —
      // so re-verify each candidate against an end-or-delimiter boundary.
      var bnd = new RegExp("/status/" + sid + "(?:$|[/?#])");
      var links = doc.querySelectorAll('article a[href*="/status/' + sid + '"]');
      for (var li = 0; li < links.length; li++) {
        if (bnd.test(links[li].getAttribute("href") || "")) {
          article = links[li].closest ? links[li].closest("article") : null;
          break;
        }
      }
    }
    article = article || doc.querySelector('article[data-testid="tweet"]') || doc.querySelector("article");
    if (!article) return null;
    var textEl = article.querySelector('[data-testid="tweetText"]');
    if (!textEl || !textEl.textContent.trim()) return null;

    var spans = [];
    var userEl = article.querySelector('[data-testid="User-Name"]');
    if (userEl) {
      userEl.querySelectorAll("span").forEach(function (s) {
        var t = (s.textContent || "").trim();
        if (t && spans.indexOf(t) === -1) spans.push(t);
      });
    }
    var author = spans.slice(0, 2).join(" ");
    var timeEl = article.querySelector("time");
    var when = timeEl ? ((timeEl.getAttribute("datetime") || timeEl.textContent || "").trim()) : "";
    var titleText = (textEl.textContent || "").replace(/\s+/g, " ").trim();
    // Truncate by code points, not UTF-16 units — string slice can split a
    // surrogate pair (emoji) at the boundary into a lone high surrogate.
    var titleChars = Array.from(titleText);
    var title = titleChars.length > 90 ? titleChars.slice(0, 87).join("") + "..." : titleText;
    var meta = author || when ? "<p><strong>" + escapeHtml(author || "X/Twitter") + "</strong>" +
      (when ? " · " + escapeHtml(when) : "") + "</p>" : "";
    return { contentHtml: meta + '<div class="tweet-text">' + cleanBodyHtml(textEl.innerHTML) + "</div>", title: title || doc.title };
  }

  // Decode TeX text-mode accents/ligatures in PROSE (e.g. Andr\'e -> André). Punctuation
  // accents allow \'e / \'{e}; letter-command accents (\c \v \u \H \r \k) require braces
  // (\c{c}) to avoid eating \cite/\verb etc. Combining marks + NFC normalize.
  var TEX_ACCENT = { "'": "́", "`": "̀", "^": "̂", '"': "̈", "~": "̃", "=": "̄", ".": "̇", "u": "̆", "v": "̌", "H": "̋", "r": "̊", "c": "̧", "k": "̨" };
  var TEX_LETTER = { o: "ø", O: "Ø", l: "ł", L: "Ł", ss: "ß", ae: "æ", AE: "Æ", oe: "œ", OE: "Œ", aa: "å", AA: "Å", i: "i", j: "j" };
  function texAcc(_, a, base) { var L = base === "\\i" ? "i" : base === "\\j" ? "j" : base; return L + TEX_ACCENT[a]; }
  function decodeTexSeg(s) {
    if (!s || s.indexOf("\\") === -1) return s;
    // BibTeX's common brace-protected forms wrap the WHOLE command: {\'e},
    // {\c c}, {\o}. The decoders below expect bare \'e or braced \c{c}, and the
    // accent regex's trailing \}? would eat the wrapper's closing brace leaving
    // a stray "{" (worse than not decoding at all). Normalize/resolve wrapped
    // groups first. Each pattern requires the full balanced pair, so no lone
    // brace is ever half-consumed; a letter directly after the command kills
    // the match, so \Huge / \cite-style macros stay protected. Plain unwrapping
    // would erase the word boundary the group provided ({\c c}ade, {\o}rre) —
    // hence normalize-to-braced / resolve-in-place instead.
    // Letter-named accents (\u \v \H \r \c \k) REQUIRE a separator (space or
    // brace) before their argument — TeX reads "\rm" as the control word rm,
    // not \r+m, so {\rm} must stay untouched. Punctuation accents need none.
    s = s.replace(/\{\\([`'^"~=.])\s*\{?\s*(\\[ij]|[A-Za-z])\s*\}?\}/g, "\\$1{$2}");                // {\'e} -> \'{e}
    s = s.replace(/\{\\([uvHrck])(?:\s+|\s*\{\s*)(\\[ij]|[A-Za-z])\s*\}?\}/g, "\\$1{$2}");          // {\c c}/{\c{c}} -> \c{c}
    s = s.replace(/\{\\(ss|ae|AE|oe|OE|aa|AA|[oOlLij])\}/g, function (m, n) {              // {\o} -> ø: braces ARE the boundary
      return Object.prototype.hasOwnProperty.call(TEX_LETTER, n) ? TEX_LETTER[n] : m;
    });
    s = s.replace(/\\([`'^"~=.])\s*\{?\s*(\\[ij]|[A-Za-z])\s*\}?/g, texAcc);   // \'e \'{e} \' e
    s = s.replace(/\\([uvHrck])\{(\\[ij]|[A-Za-z])\}/g, texAcc);               // \c{c} \v{s} (braces only)
    // {} is an explicit terminator ("Stra\ss{}e") — accept it OR a non-letter
    // boundary. A bare optional {} before the lookahead would backtrack on
    // \ss{}e and leave the braces in the output.
    s = s.replace(/\\(ss|ae|AE|oe|OE|aa|AA|[oOlLij])(?:\{\}|(?![A-Za-z]))/g, function (m, n) {
      return Object.prototype.hasOwnProperty.call(TEX_LETTER, n) ? TEX_LETTER[n] : m;
    });
    return s.normalize ? s.normalize("NFC") : s;
  }
  // Decode accents only OUTSIDE $...$/$$...$$ math (decoding inside would corrupt \geq etc.).
  function decodeTexText(s) {
    if (!s || s.indexOf("\\") === -1) return s;
    var parts = s.split(/(\$\$[\s\S]*?\$\$|\$[^$]*\$)/); // capture group -> math at odd indices
    for (var i = 0; i < parts.length; i += 2) parts[i] = decodeTexSeg(parts[i]);
    return parts.join("");
  }

  // ---- arXiv (/abs/ citation_* meta card) -------------------------------
  function extractArxiv(doc) {
    function metas(name) { return Array.prototype.map.call(doc.querySelectorAll('meta[name="' + name + '"]'), function (m) { return m.getAttribute("content") || ""; }).filter(Boolean); }
    function domText(sel) { var e = doc.querySelector(sel); return e ? e.textContent.replace(/\s+/g, " ").trim() : ""; }
    // Titles use the same TeX-escaped-accent convention as abstracts; decode
    // outside $...$ so inline math survives for KaTeX.
    var title = decodeTexText((metas("citation_title")[0]) || domText("h1.title"));
    // citation_author is "Last, First" -> render "First Last". Reorder only
    // the exact two-part form: a third segment is a suffix ("King, M. L., III")
    // and reordering would silently drop it — keep those verbatim.
    var authors = metas("citation_author").map(function (a) {
      var p = a.split(","); return p.length === 2 ? (p[1].trim() + " " + p[0].trim()) : a.trim();
    });
    var abs = metas("citation_abstract")[0] || domText("blockquote.abstract").replace(/^Abstract:?\s*/i, "");
    abs = decodeTexText(abs); // \'e -> é etc. in prose; $...$ math left intact for KaTeX
    var id = metas("citation_arxiv_id")[0] || "";
    var date = metas("citation_date")[0] || domText(".dateline").replace(/[\[\]]/g, "").trim();
    var subjects = domText(".subjects");
    var comments = domText(".comments");
    var msc = domText(".msc-classes");
    var doi = domText(".doi a") || domText(".doi");
    var jref = domText(".jref");
    var pdf = metas("citation_pdf_url")[0] || (id ? "https://arxiv.org/pdf/" + id : "");
    var absUrl = id ? "https://arxiv.org/abs/" + id : "";
    if (!abs && !authors.length) return null;
    var html = "";
    if (authors.length) html += "<p><strong>" + escapeHtml(authors.join(", ")) + "</strong></p>";
    // Labeled metadata list (one field per row, scannable) instead of a "·"-crammed run.
    var rows = "";
    function row(label, val) { if (val) rows += "<li><strong>" + escapeHtml(label) + ":</strong> " + escapeHtml(val) + "</li>"; }
    row("arXiv", id); row("Subjects", subjects); row("Submitted", date); row("Comments", comments);
    row("MSC", msc); row("Journal", jref); row("DOI", doi);
    if (rows) html += "<ul>" + rows + "</ul>";
    if (abs) html += "<h2>Abstract</h2><p>" + escapeHtml(abs) + "</p>"; // keeps $...$/$$...$$ → KaTeX
    var links = [];
    if (absUrl) links.push('<a href="' + escapeHtml(absUrl) + '">Abstract</a>');
    if (pdf) links.push('<a href="' + escapeHtml(pdf) + '">PDF</a>');
    if (links.length) html += "<p>" + links.join(" · ") + "</p>";
    return { contentHtml: html, title: title, math: true };
  }

  // Flat reply list -> conversation tree by @mention (V2EX). replies in floor order:
  // { id, author, floor, mentions:[String], refFloors:[String], bodyHtml, thanks }.
  // Parent = first resolvable @-target: exact author@floor that is EARLIER, else that
  // member's most-recent earlier reply. Zero-@ / @unseen / @OP-no-earlier -> root.
  // Maps update AFTER each reply, so parents always precede children (acyclic).
  function buildReplyTree(replies) {
    // Object.create(null): usernames are map keys, so "constructor"/"__proto__"
    // must miss instead of hitting Object.prototype.
    var floorMemberToIndex = Object.create(null), lastSeenByMember = Object.create(null), nodes = [], roots = [];
    for (var k = 0; k < replies.length; k++) {
      var r0 = replies[k];
      nodes.push({
        id: r0.id, author: r0.author, floor: r0.floor,
        mentions: r0.mentions || [], refFloors: r0.refFloors || [],
        bodyHtml: r0.bodyHtml, thanks: r0.thanks, children: []
      });
    }
    for (var i = 0; i < replies.length; i++) {
      var r = nodes[i], parentIdx = -1, mentions = r.mentions;
      if (mentions.length) {
        // Multiple @-mentions: V2EX Polish treats the LAST-mentioned member as the
        // primary parent, so reverse the arrays and attach to the first that resolves.
        var multi = mentions.length > 1;
        var names = multi ? mentions.slice().reverse() : mentions;
        var floors = multi ? r.refFloors.slice().reverse() : r.refFloors;
        var desiredFloor = floors[0];
        for (var n = 0; n < names.length; n++) {
          var name = names[n], j;
          if (desiredFloor != null && (j = floorMemberToIndex[name + ":" + desiredFloor]) != null && j < i) { parentIdx = j; break; }
          if ((j = lastSeenByMember[name]) != null) { parentIdx = j; break; }
          // neither branch resolved for this name -> try the next name
        }
      }
      if (parentIdx >= 0) nodes[parentIdx].children.push(r);
      else roots.push(r);
      lastSeenByMember[r.author] = i;
      floorMemberToIndex[r.author + ":" + r.floor] = i;
    }
    return roots;
  }

  // Strip the leading "@name" of a reply body once nesting makes it redundant.
  // DOM-first: drop a leading <a href="/member/..">@..</a>; else a leading "@token".
  function hideRefName(html) {
    if (!html) return html;
    var scratch = inertDoc();
    if (scratch) {
      var tmp = scratch.createElement("div");
      tmp.innerHTML = html;
      while (tmp.firstChild && tmp.firstChild.nodeType === 3 && !tmp.firstChild.nodeValue.trim()) tmp.removeChild(tmp.firstChild);
      var first = tmp.firstChild;
      if (first && first.nodeType === 1 && first.tagName === "A" &&
          /^\/member\//.test(first.getAttribute("href") || "") &&
          /^@/.test((first.textContent || "").trim())) {
        tmp.removeChild(first);
        if (tmp.firstChild && tmp.firstChild.nodeType === 3) tmp.firstChild.nodeValue = tmp.firstChild.nodeValue.replace(/^[\s,，]+/, "");
        return tmp.innerHTML;
      }
    }
    return html.replace(/^\s*@[A-Za-z0-9_]+[ ,，]?/, "");
  }

  function replyInnerHtml(node, depth) {
    var thanks = Number(node.thanks) || 0;
    var head = "<p><strong>" + escapeHtml("#" + (node.floor || "") + " · " + (node.author || "匿名")) + "</strong>" +
      (thanks > 0 ? escapeHtml(" · 感谢 " + thanks) : "") + "</p>";
    var body = node.bodyHtml || "";
    if (depth > 0 && (node.mentions || []).length === 1) body = hideRefName(body);
    return head + body;
  }

  // Beyond maxDepth: render descendants as labeled blocks (no extra blockquote),
  // so deep chains flatten onto the deepest allowed level — never dropped.
  // opts.headFn(node, depth) renders one node's header+body (default = V2EX replyInnerHtml).
  function flattenChildren(nodes, depth, opts) {
    if (!nodes || !nodes.length) return "";
    var headFn = (opts && opts.headFn) || replyInnerHtml;
    var out = "";
    for (var i = 0; i < nodes.length; i++) out += headFn(nodes[i], depth) + flattenChildren(nodes[i].children, depth + 1, opts);
    return out;
  }

  // opts: { headFn?(node,depth)->html, maxDepth?:number }. Defaults render a V2EX thread.
  function renderThreadHtml(nodes, depth, opts) {
    if (!nodes || !nodes.length) return "";
    opts = opts || {};
    var maxDepth = opts.maxDepth != null ? opts.maxDepth : cfg("V2EX_MAX_DEPTH", V2EX_MAX_DEPTH);
    var headFn = opts.headFn || replyInnerHtml;
    var out = "";
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var children = (depth + 1 >= maxDepth)
        ? flattenChildren(node.children, depth + 1, opts)
        : renderThreadHtml(node.children, depth + 1, opts);
      out += "<blockquote>" + headFn(node, depth) + children + "</blockquote>";
    }
    return out;
  }

  // ---- StackOverflow Discussions: threaded replies ----------------------
  // Replies live flat in #replies-container but nest VISUALLY: each level wraps the
  // child block in a `.flex--item.fl-grow1` ancestor. Depth = count of those ancestors
  // (structural, so it works in the test harness too — no layout/offsetLeft needed).
  function soReplyDepth(reply, container) {
    var d = 0, n = reply.parentElement;
    while (n && n !== container) {
      if (n.classList && n.classList.contains("flex--item") && n.classList.contains("fl-grow1")) d++;
      n = n.parentElement;
    }
    return d;
  }

  // Header for a Discussions reply node (no floor / 感谢 / @-strip — V2EX-specific).
  function soDiscReplyHtml(node) {
    return "<p><strong>" + escapeHtml(node.author || "匿名") + "</strong></p>" + (node.bodyHtml || "");
  }

  // Build a tree from a flat list carrying explicit .depth (document/pre-order).
  // A reply at depth d attaches under the most recent earlier reply at depth d-1.
  function buildDepthTree(replies) {
    var roots = [], stack = [];
    for (var k = 0; k < replies.length; k++) {
      var r0 = replies[k];
      var nd = { author: r0.author, bodyHtml: r0.bodyHtml, depth: r0.depth || 0, children: [] };
      if (r0.dead) nd.dead = true; // HN placeholder rows; pruned later when childless
      var d = nd.depth;
      if (d === 0 || !stack[d - 1]) roots.push(nd);
      else stack[d - 1].children.push(nd);
      stack[d] = nd;
      stack.length = d + 1; // drop deeper levels so later shallower replies don't mis-attach
    }
    return roots;
  }

  function collapseName(s) { return String(s == null ? "" : s).replace(/\s+/g, "").toLowerCase(); }

  // SO comment body -> single line: block boundaries to spaces, drop block wrappers,
  // keep inline tags (<a>/<code>/<em>/<strong>), collapse whitespace.
  function soFlatten(html) {
    if (!html) return "";
    var s = html.replace(/<\/(p|div)>/gi, " ").replace(/<br\s*\/?>/gi, " ").replace(/<(p|div)\b[^>]*>/gi, "");
    return s.replace(/\s+/g, " ").trim();
  }

  // Leading @target of a comment <li>, or null. Prefers the first-child anchor's
  // /users/<id> (collision-free); falls back to a leading "@name" text token.
  function soCommentTarget(li) {
    var copy = li.querySelector(".comment-copy") || li.querySelector(".comment-body");
    if (!copy) return null;
    var a = copy.firstElementChild;
    if (a && a.tagName === "A" && /^@/.test((a.textContent || "").trim())) {
      var href = a.getAttribute("href") || "";
      var m = href.match(/\/users\/(\d+)/);
      return { uid: m ? m[1] : null, name: collapseName((a.textContent || "").replace(/^@/, "")) };
    }
    var tm = (copy.textContent || "").trim().match(/^@([^\s,.:;!?]+)/);
    return tm ? { uid: null, name: collapseName(tm[1]) } : null;
  }

  // One post's comments -> indented <ul>. @-replies nest one level under the earlier
  // TOP-LEVEL commenter they address. Caps: per-post + page-global (counts every comment
  // in display order, parents + children). counters = { total, capped } threaded by caller.
  function soCommentsHtml(postEl, doc, counters) {
    if (!postEl) return "";
    var container = postEl.querySelector(".comments");
    if (!container) return "";
    var rows = container.querySelectorAll(".comments-list > li.comment");
    if (!rows.length) rows = container.querySelectorAll("li.comment");
    if (!rows.length) return "";
    var perPost = cfg("SO_COMMENTS_PER_POST", SO_COMMENTS_PER_POST);
    var globalCap = cfg("SO_COMMENTS_GLOBAL", SO_COMMENTS_GLOBAL);

    var items = [];
    for (var i = 0; i < rows.length; i++) {
      var li = rows[i];
      var copy = li.querySelector(".comment-copy") || li.querySelector(".comment-body");
      var userEl = li.querySelector(".comment-user");
      var author = userEl ? (userEl.textContent || "").trim() : "";
      var um = (userEl ? (userEl.getAttribute("href") || "") : "").match(/\/users\/(\d+)/);
      var scoreEl = li.querySelector(".comment-score") || li.querySelector("span.cool");
      var score = scoreEl ? parseInt((scoreEl.textContent || "").replace(/[^\d]/g, ""), 10) : 0;
      var bodyHtml = soFlatten(copy ? copy.innerHTML : "");
      if (!bodyHtml && !author) continue; // skip non-comment li.comment rows (add-comment form / JS templates)
      items.push({
        author: author, authorKey: collapseName(author), uid: um ? um[1] : null,
        bodyHtml: bodyHtml, score: score > 0 ? score : 0,
        target: soCommentTarget(li), children: [], rendered: false
      });
    }

    var topByName = Object.create(null), topByUid = Object.create(null), roots = []; // username keys — no prototype hits
    for (var k = 0; k < items.length; k++) {
      var c = items[k], parent = -1;
      if (c.target) {
        var self = (c.target.uid && c.target.uid === c.uid) || (c.target.name && c.target.name === c.authorKey);
        if (!self) {
          if (c.target.uid != null && topByUid[c.target.uid] != null) parent = topByUid[c.target.uid];
          else if (c.target.name != null && topByName[c.target.name] != null) parent = topByName[c.target.name];
        }
      }
      if (parent >= 0) items[parent].children.push(c);
      else { roots.push(c); topByName[c.authorKey] = k; if (c.uid != null) topByUid[c.uid] = k; }
    }

    var perPostRendered = 0;
    for (var d = 0; d < items.length; d++) {
      if (counters.total >= globalCap) { counters.capped = true; continue; }
      if (perPostRendered >= perPost) continue;
      items[d].rendered = true; perPostRendered++; counters.total++;
    }
    if (perPostRendered === 0) return "";

    function liOf(c) {
      var sc = c.score > 0 ? escapeHtml(" · " + c.score) : "";
      var h = "<li><strong>" + escapeHtml(c.author || "匿名") + "</strong>: " + c.bodyHtml + sc;
      var kids = "";
      for (var x = 0; x < c.children.length; x++) if (c.children[x].rendered) kids += liOf(c.children[x]);
      if (kids) h += "<ul>" + kids + "</ul>";
      return h + "</li>";
    }
    var lis = "";
    for (var r2 = 0; r2 < roots.length; r2++) if (roots[r2].rendered) lis += liOf(roots[r2]);

    var showMore = 0, link = postEl.querySelector(".js-show-link");
    if (link) { var mm = (link.textContent || "").match(/(\d+)/); if (mm) showMore = parseInt(mm[1], 10); }
    // Page-collapsed comments (show-link) and locally capped LOADED comments
    // are disjoint sets — sum them, don't take the max, or the note
    // undercounts whenever both are nonzero.
    var more = showMore + Math.max(0, items.length - perPostRendered);
    var moreLi = more > 0 ? "<li><em>" + escapeHtml("… and " + more + " more comments") + "</em></li>" : "";
    if (!lis && !moreLi) return "";
    return "<p><strong>Comments</strong></p><ul>" + lis + moreLi + "</ul>";
  }

  // ---- framework ---------------------------------------------------------

  function hostMatches(pattern, hostname) {
    return hostname === pattern || hostname.endsWith("." + pattern);
  }

  function matchRule(m, doc, url) {
    if (!m) return false;
    var hostname;
    try { hostname = new URL(url).hostname; } catch (_) { return false; }
    if (m.host && !hostMatches(m.host, hostname)) return false;       // cheap first
    if (m.url && !m.url.test(url)) return false;                       // then regex
    if (typeof m.test === "function") { try { if (!m.test(doc, url)) return false; } catch (_) { return false; } }
    return true;
  }

  // Ordered: answer-permalink before question (a permalink URL contains /question/).
  // NOTE: zhuanlan.zhihu.com suffix-matches the "zhihu.com" host gate; only the Zhihu
  // URL regexes keep /p/<id> falling through to zhihu-zhuanlan — don't broaden them.
  var SITE_RULES = [
    { id: "zhihu-answer",   source: "self", lastVerified: "2026-06-05", driftCheck: "manual",
      match: { host: "zhihu.com", url: /\/question\/\d+\/answer\/\d+/ }, extract: extractZhihuAnswer },
    { id: "zhihu-question", source: "self", lastVerified: "2026-06-05", driftCheck: "manual",
      // /answers/<sort> is the answer-sort path variant of the same page; other
      // sub-paths (/log, /answer/<id>) must still fall through.
      match: { host: "zhihu.com", url: /\/question\/\d+(?:\/answers\/[\w-]+)?\/?(?:[?#].*)?$/ }, extract: extractZhihuQuestion },
    { id: "zhihu-zhuanlan", source: "self", lastVerified: "2026-06-05", driftCheck: "manual",
      match: { host: "zhuanlan.zhihu.com", url: /\/p\/\d+/ }, extract: extractZhihuArticle }
    ,{ id: "stackoverflow", source: "json-ld+self", forum: true, lastVerified: "2026-06-06", driftCheck: "auto",
       sampleUrl: "", match: { host: "stackoverflow.com", url: /\/questions\/\d+/ }, extract: function (d) { return extractStackOverflow(d); } }
    ,{ id: "stackexchange", source: "json-ld+self", forum: true, lastVerified: "2026-06-06", driftCheck: "auto",
       sampleUrl: "", match: { host: "stackexchange.com", url: /\/questions\/\d+/ }, extract: function (d) { return extractStackOverflow(d); } }
    ,{ id: "v2ex",  source: "self", forum: true, lastVerified: "2026-06-06", driftCheck: "auto",
       sampleUrl: "", match: { host: "v2ex.com", url: /\/t\/\d+/ }, extract: function (d) { return extractV2ex(d); } }
    ,{ id: "arxiv", source: "self", lastVerified: "2026-06-06", driftCheck: "auto",
       sampleUrl: "", match: { host: "arxiv.org", url: /\/abs\// }, extract: function (d) { return extractArxiv(d); } }
    ,{ id: "hackernews", source: "self", forum: true, lastVerified: "2026-06-16", driftCheck: "manual",
       sampleUrl: "", match: { host: "news.ycombinator.com", url: /\/item\?id=\d+/ }, extract: function (d) { return extractHackerNews(d); } }
    ,{ id: "x-status", source: "self", lastVerified: "2026-07-09", driftCheck: "manual",
       sampleUrl: "", match: { host: "x.com", url: /\/status\/\d+/ }, extract: extractTwitterStatus }
    ,{ id: "twitter-status", source: "self", lastVerified: "2026-07-09", driftCheck: "manual",
       sampleUrl: "", match: { host: "twitter.com", url: /\/status\/\d+/ }, extract: extractTwitterStatus }
  ];

  function applySiteRule(doc, url) {
    for (var i = 0; i < SITE_RULES.length; i++) {
      var rule = SITE_RULES[i];
      if (!matchRule(rule.match, doc, url)) continue;
      var out = null;
      try { out = rule.extract(doc, url); } catch (_) { out = null; }
      if (out && out.contentHtml) {
        return { id: rule.id, contentHtml: out.contentHtml, title: out.title || doc.title || "", url: url, math: !!out.math, forum: !!rule.forum };
      }
      break; // matched site but produced nothing → fall back to Defuddle
    }
    return null;
  }

  // Expose for the injected inline func (page isolated world) + test harness.
  var g = (typeof window !== "undefined") ? window : (typeof self !== "undefined" ? self : this);
  g.SITE_RULES = SITE_RULES;
  g.matchRule = matchRule;
  g.applySiteRule = applySiteRule;
  g.pbpSiteRuleText = pbpSiteRuleText;
  g.pbpNormalizeLazyImages = pbpNormalizeLazyImages;
  g.pbpUpgradeSrcsetImages = pbpUpgradeSrcsetImages;
  g.buildReplyTree = buildReplyTree;
  g.buildDepthTree = buildDepthTree;
  g.renderThreadHtml = renderThreadHtml;
  g.soCommentsHtml = soCommentsHtml;
})();

// ---- Pre-Defuddle normalize (generic; NOT a per-site rule) ----
// Defuddle's code-block standardizer rebuilds every <pre> and keeps the
// language only when it hits its ~90-entry allowlist — "mermaid" is not in
// it, so class="language-mermaid" dies during extraction. Its language
// detector reads data-lang FIRST and unrestricted; stamping the attribute up
// front carries the language through the rebuild (md-convert's
// preformattedCode rule already reads data-lang as a fallback). Runs on the
// CLONED document popup.js/background.js hand to Defuddle — never the live
// page DOM.
function pbpPreDefuddleNormalize(root) {
  try {
    root.querySelectorAll('pre code[class*="language-mermaid"]').forEach((c) => {
      c.setAttribute("data-lang", "mermaid");
    });
    // Unrendered <div class="mermaid">graph…</div> (startOnLoad pages where
    // the mermaid script never ran, CDN blocked, etc.): rewrite to a real
    // code block. A rendered one (svg child) is left for the inline-svg
    // image pass in md-convert.
    root.querySelectorAll("div.mermaid, pre.mermaid").forEach((d) => {
      if (d.querySelector("svg") || !(d.textContent || "").trim()) return;
      const doc = d.ownerDocument;
      const pre = doc.createElement("pre");
      const code = doc.createElement("code");
      code.setAttribute("data-lang", "mermaid");
      code.textContent = d.textContent.trim();
      pre.appendChild(code);
      d.replaceWith(pre);
    });
  } catch (_) { /* a normalize step must never fail extraction */ }
}
