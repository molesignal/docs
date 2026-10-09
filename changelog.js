// Mintlify loads root JavaScript files on every page. Initialize each changelog
// container once, including containers mounted by client-side navigation.
(function () {
  const initialized = new WeakSet();
  let styled = false;
  // Releases listed in the left sidebar, newest first: { label, items: [{ id, title }] }.
  // Set once the releases have rendered; null while loading, on error and off this page.
  let releaseIndex = null;
  // id of the release on screen: the page shows one release at a time.
  let currentRelease = null;
  const NAV_CLASS = 'changelog-nav';
  function boot() {
    const root = document.getElementById('changelog-root');
    if (!root || initialized.has(root)) return;
    initialized.add(root);
    if (!styled) {
      const style = document.createElement('style');
      style.textContent = CSS;
      document.head.appendChild(style);
      styled = true;
    }
    loadReleases(root);
  }
  const CSS = `
  .changelog-release {
    margin-bottom: 2.5rem;
  }
  /* The page shows one release at a time (see showRelease). */
  .changelog-release[hidden] {
    display: none;
  }
  .changelog-header {
    margin-bottom: 0.75rem;
  }
  .changelog-title {
    font-size: 1.25rem !important;
    margin: 0 0 0.25rem !important;
  }
  .changelog-title a {
    color: inherit;
    text-decoration: none;
  }
  .changelog-title a:hover {
    text-decoration: underline;
  }
  .changelog-meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.8125rem;
    color: var(--mint-text-secondary, #64748b);
  }
  .changelog-prerelease {
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
    background: rgba(245, 158, 11, 0.12);
    color: #b45309;
  }
  .changelog-body h2 {
    font-size: 1.1rem;
    margin: 1.25rem 0 0.5rem;
  }
  .changelog-body h3 {
    font-size: 1rem;
    margin: 1rem 0 0.375rem;
  }
  .changelog-body h4 {
    font-size: 0.9375rem;
    margin: 0.875rem 0 0.25rem;
  }
  /* Bullets and indentation come from Mintlify's own list styles (li::before). */
  .changelog-body ul,
  .changelog-body ol {
    margin: 0.5rem 0;
  }
  .changelog-body li > ul,
  .changelog-body li > ol {
    margin: 0.25rem 0;
  }
  .changelog-body li {
    margin: 0.25rem 0;
  }
  .changelog-body code {
    font-size: 0.8125rem;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    background: var(--mint-code-bg, rgba(0, 0, 0, 0.06));
  }
  .changelog-body pre {
    font-size: 0.8125rem;
    padding: 0.875rem 1rem;
    border-radius: 6px;
    overflow-x: auto;
    background: var(--mint-code-bg, rgba(0, 0, 0, 0.04));
    /* Mintlify's own pre text is near-white, made for its dark code theme. */
    color: rgb(var(--gray-800));
  }
  .changelog-body pre code {
    padding: 0;
    background: none;
    color: inherit;
  }
  .changelog-table {
    overflow-x: auto;
  }
  .changelog-body table {
    width: 100%;
    border-collapse: collapse;
    margin: 0.75rem 0;
    font-size: 0.875rem;
  }
  .changelog-body th,
  .changelog-body td {
    text-align: left;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--mint-border, rgba(0, 0, 0, 0.08));
  }
  .changelog-body th {
    font-weight: 600;
    background: var(--mint-code-bg, rgba(0, 0, 0, 0.03));
  }
  .changelog-body blockquote {
    margin: 0.5rem 0;
    padding: 0.25rem 0.75rem;
    border-left: 3px solid var(--mint-border, rgba(0, 0, 0, 0.15));
    color: var(--mint-text-secondary, #64748b);
  }
  .changelog-body hr {
    margin: 1rem 0;
    border: none;
    border-top: 1px solid var(--mint-border, rgba(0, 0, 0, 0.08));
  }
  .changelog-body img {
    max-width: 100%;
    border-radius: 6px;
  }
  .changelog-body a {
    color: var(--mint-link, #2563eb);
  }
  .changelog-error a {
    color: var(--mint-link, #2563eb);
  }

  /* Release list in the left sidebar (see syncSidebar). It sits after Mintlify's
   * own page item, which is hidden while the list is shown, and mirrors the
   * metrics of a stock nav item. The font size is inherited: the desktop
   * sidebar and the mobile drawer differ. */
  li[id$="/changelog"]:has(+ .${NAV_CLASS}) {
    display: none;
  }
  .${NAV_CLASS} ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .${NAV_CLASS} li + li {
    margin-top: 1px;
  }
  .${NAV_CLASS} a {
    display: block;
    padding: 0.375rem 0.75rem 0.375rem 1rem;
    border-radius: 0.75rem;
    color: rgb(var(--gray-700));
    text-decoration: none;
    overflow-wrap: anywhere;
  }
  .${NAV_CLASS} a:hover {
    background: rgb(var(--gray-600) / 0.05);
    color: rgb(var(--gray-900));
  }
  .${NAV_CLASS} a[aria-current] {
    background: rgb(var(--primary) / 0.1);
    color: rgb(var(--primary));
    text-shadow: -0.2px 0 0 currentColor, 0.2px 0 0 currentColor;
  }

  /* Dark mode overrides (Mintlify toggles .dark on <html>) */
  html.dark .changelog-prerelease {
    background: rgba(245, 158, 11, 0.18);
    color: #fbbf24;
  }
  html.dark .changelog-body th,
  html.dark .changelog-body td,
  html.dark .changelog-body hr {
    border-color: rgb(255 255 255 / 0.12);
  }
  html.dark .changelog-body th {
    background: rgb(255 255 255 / 0.04);
  }
  html.dark .changelog-body code {
    background: rgb(255 255 255 / 0.08);
  }
  html.dark .changelog-body pre {
    background: rgb(255 255 255 / 0.06);
    color: rgb(var(--gray-200));
  }
  html.dark .changelog-body pre code {
    background: none;
  }
  html.dark .${NAV_CLASS} a {
    color: rgb(var(--gray-400));
  }
  html.dark .${NAV_CLASS} a:hover {
    background: rgb(var(--gray-200) / 0.05);
    color: rgb(var(--gray-300));
  }
  html.dark .${NAV_CLASS} a[aria-current] {
    background: rgb(var(--primary-light) / 0.1);
    color: rgb(var(--primary-light));
  }
`;

// The sidebar is rendered by Mintlify (React), so leave its nodes alone and add
// one sibling after the page's own item. Both the desktop sidebar and the mobile
// drawer render that item, so the list goes after every copy of it. The item is
// found by its id, which Mintlify sets to the page path; like the other overrides
// here that is internal markup and may change. Runs on every DOM mutation: it
// only writes when something is out of date, which keeps the observer from
// feeding itself.
function syncSidebar() {
  const onPage = releaseIndex && document.getElementById('changelog-root');
  if (!onPage) {
    document.querySelectorAll('.' + NAV_CLASS).forEach(function (nav) { nav.remove(); });
    return;
  }
  document.querySelectorAll('li[id$="/changelog"]').forEach(function (item) {
    const next = item.nextElementSibling;
    if (next && next.classList.contains(NAV_CLASS)) return;
    item.parentNode.insertBefore(buildNav(), item.nextSibling);
    markCurrent();
  });
}

function buildNav() {
  const nav = document.createElement('li');
  nav.className = NAV_CLASS;
  const list = document.createElement('ul');
  list.setAttribute('aria-label', releaseIndex.label);
  releaseIndex.items.forEach(function (release) {
    const entry = document.createElement('li');
    const link = document.createElement('a');
    link.href = '#' + release.id;
    link.textContent = release.title;
    entry.appendChild(link);
    list.appendChild(entry);
  });
  nav.appendChild(list);
  return nav;
}

function markCurrent() {
  document.querySelectorAll('.' + NAV_CLASS + ' a').forEach(function (link) {
    const on = link.getAttribute('href') === '#' + currentRelease;
    if (on === link.hasAttribute('aria-current')) return;
    if (on) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
}

// The release named by the URL hash, or the newest when there is none (or it is
// not a release on this page).
function releaseFromHash() {
  let hash = '';
  try { hash = decodeURIComponent(location.hash.slice(1)); } catch (e) {}
  const items = releaseIndex.items;
  return items.some(function (release) { return release.id === hash; }) ? hash : items[0].id;
}

// Show one release and hide the rest. Returns true if the release on screen changed.
// Articles carry data-release rather than an id so the browser has no anchor to
// jump to: it would scroll to the target by itself once it is shown, fighting the
// scroll-to-top below.
function showRelease(id) {
  const changed = id !== currentRelease;
  currentRelease = id;
  document.querySelectorAll('.changelog-release').forEach(function (article) {
    article.hidden = article.dataset.release !== id;
  });
  markCurrent();
  return changed;
}

// Picking a release in the sidebar only changes the URL hash (which also gives
// Back/Forward and shareable links); this does the switching. A release opens at
// the top of the page, like a new page would.
window.addEventListener('hashchange', function () {
  if (!releaseIndex || !document.getElementById('changelog-root')) return;
  if (showRelease(releaseFromHash())) window.scrollTo(0, 0);
});

// Picking the release that is already on screen changes no hash, so there is no
// hashchange to react to: scroll to the top instead of letting the browser jump
// to the anchor. In the mobile drawer, also close it: Mintlify's own links do
// that on route change, which an in-page anchor never triggers.
document.addEventListener('click', function (event) {
  const link = event.target.closest && event.target.closest('.' + NAV_CLASS + ' a');
  if (!link || !releaseIndex) return;
  if (link.getAttribute('href') === '#' + currentRelease) {
    event.preventDefault();
    window.scrollTo(0, 0);
  }
  if (link.closest('[role="dialog"]')) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
  }
});

function loadReleases(root) {
  var zh = root.dataset.locale === "zh-Hans";
  var REPO = "molesignal/molesignal";
  var PER_PAGE = 20;

  releaseIndex = null;
  currentRelease = null;
  syncSidebar();

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* Like esc, but leaves existing character references (&amp; &#39; ...) alone. */
  function escText(s) {
    return esc(s).replace(/&amp;(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/gi, "&$1;");
  }

  var FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/;
  var HEADING = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
  var RULE = /^ {0,3}([-*_])(?: *\1){2,} *$/;
  var QUOTE = /^ {0,3}>/;
  var LIST_ITEM = /^( *)([-*+]|\d{1,9}[.)])\s+(.*)$/;
  var DIVIDER = /^ {0,3}\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

  function isListItem(line) {
    return LIST_ITEM.test(line) && !RULE.test(line);
  }

  function isDivider(line) {
    return line.indexOf("|") !== -1 && DIVIDER.test(line);
  }

  function startsBlock(line) {
    return FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || isListItem(line);
  }

  /* Lightweight GitHub-flavoured markdown → HTML: headings, fenced code, tables,
   * (nested) lists, blockquotes, rules and paragraphs. Raw HTML is dropped.
   * Parsed line by line: a table, list or code fence spans several lines with
   * no blank line between them. */
  function md2html(md) {
    var src = String(md || "")
      .replace(/\r\n?/g, "\n")
      .replace(/<!--[\s\S]*?-->/g, "");
    return blocks(src.split("\n"));
  }

  function blocks(lines) {
    var out = [];
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];
      var m;

      if (!line.trim()) { i++; continue; }

      /* Fenced code: may contain blank lines and lines starting with # or -. */
      if ((m = line.match(FENCE))) {
        var fence = m[1];
        var code = [];
        i++;
        while (i < lines.length && !closesFence(lines[i], fence)) code.push(lines[i++]);
        i++; /* closing fence */
        out.push("<pre><code" + (m[2] ? ' class="language-' + esc(m[2]) + '"' : "") + ">" + esc(code.join("\n")) + "</code></pre>");
        continue;
      }

      /* Headings. The page owns h1, and styles exist for h2-h4 only. */
      if ((m = line.match(HEADING))) {
        var level = Math.min(Math.max(m[1].length, 2), 4);
        out.push("<h" + level + ">" + inline(m[2]) + "</h" + level + ">");
        i++;
        continue;
      }

      /* Horizontal rule */
      if (RULE.test(line)) { out.push("<hr>"); i++; continue; }

      /* Table: a header row followed by a |---|---| divider row. */
      if (line.indexOf("|") !== -1 && i + 1 < lines.length && isDivider(lines[i + 1])) {
        var head = splitRow(line);
        var aligns = splitRow(lines[i + 1]);
        if (head.length === aligns.length) {
          var rows = [];
          i += 2;
          while (i < lines.length && lines[i].trim() && lines[i].indexOf("|") !== -1) rows.push(splitRow(lines[i++]));
          out.push(renderTable(head, aligns.map(alignOf), rows));
          continue;
        }
      }

      /* Blockquote */
      if (QUOTE.test(line)) {
        var quoted = [];
        while (i < lines.length && QUOTE.test(lines[i])) quoted.push(lines[i++].replace(/^ {0,3}> ?/, ""));
        out.push("<blockquote>" + blocks(quoted) + "</blockquote>");
        continue;
      }

      /* Lists (bulleted or numbered, nested by indentation) */
      if (isListItem(line)) {
        var start = i;
        i++;
        while (i < lines.length) {
          if (isListItem(lines[i]) || /^ {2,}\S/.test(lines[i])) { i++; continue; }
          if (lines[i].trim()) break;
          /* A blank line only continues the list if more of it follows. */
          var j = i + 1;
          while (j < lines.length && !lines[j].trim()) j++;
          if (j < lines.length && (isListItem(lines[j]) || /^ {2,}\S/.test(lines[j]))) i = j;
          else break;
        }
        out.push(renderList(lines.slice(start, i)));
        continue;
      }

      /* Paragraph: runs until a blank line or the start of another block. */
      var para = [line];
      i++;
      while (i < lines.length && lines[i].trim() && !startsBlock(lines[i]) &&
             !(lines[i].indexOf("|") !== -1 && i + 1 < lines.length && isDivider(lines[i + 1]))) {
        para.push(lines[i++]);
      }
      var html = inline(para.join("\n"));
      if (html.trim()) out.push("<p>" + html + "</p>");
    }

    return out.join("\n");
  }

  function closesFence(line, fence) {
    var t = line.trim();
    return t.length >= fence.length && t.charAt(0) === fence.charAt(0) && /^(`+|~+)$/.test(t);
  }

  /* Split a table row into trimmed cells; \| is a literal pipe. */
  function splitRow(row) {
    var t = row.trim();
    if (t.charAt(0) === "|") t = t.slice(1);
    if (t.charAt(t.length - 1) === "|" && t.charAt(t.length - 2) !== "\\") t = t.slice(0, -1);
    var cells = [];
    var cur = "";
    for (var k = 0; k < t.length; k++) {
      var c = t.charAt(k);
      if (c === "\\" && t.charAt(k + 1) === "|") { cur += "|"; k++; }
      else if (c === "|") { cells.push(cur.trim()); cur = ""; }
      else cur += c;
    }
    cells.push(cur.trim());
    return cells;
  }

  function alignOf(cell) {
    var left = cell.charAt(0) === ":";
    var right = cell.charAt(cell.length - 1) === ":";
    return left && right ? "center" : right ? "right" : left ? "left" : "";
  }

  function renderTable(head, aligns, rows) {
    function cell(tag, text, k) {
      var style = aligns[k] ? ' style="text-align:' + aligns[k] + '"' : "";
      return "<" + tag + style + ">" + inline(text || "") + "</" + tag + ">";
    }
    return '<div class="changelog-table"><table>' +
      "<thead><tr>" + head.map(function (c, k) { return cell("th", c, k); }).join("") + "</tr></thead>" +
      "<tbody>" + rows.map(function (row) {
        return "<tr>" + head.map(function (c, k) { return cell("td", row[k], k); }).join("") + "</tr>";
      }).join("") + "</tbody></table></div>";
  }

  /* Build the item tree from indentation, then render it. Lines that are not
   * items continue the previous item's text. */
  function renderList(rows) {
    var top = { children: [] };
    var stack = [{ indent: -1, node: top }];
    var last = null;
    rows.forEach(function (row) {
      var m = isListItem(row) && row.match(LIST_ITEM);
      if (!m) {
        if (last) last.text += "\n" + row.trim();
        return;
      }
      var item = { ordered: /^\d/.test(m[2]), first: parseInt(m[2], 10), text: m[3], children: [] };
      var indent = m[1].length;
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
      stack[stack.length - 1].node.children.push(item);
      stack.push({ indent: indent, node: item });
      last = item;
    });
    return renderItems(top.children);
  }

  function renderItems(items) {
    if (!items.length) return "";
    var tag = items[0].ordered ? "ol" : "ul";
    var first = tag === "ol" && items[0].first !== 1 ? ' start="' + items[0].first + '"' : "";
    return "<" + tag + first + ">" + items.map(function (it) {
      return "<li>" + inline(it.text) + renderItems(it.children) + "</li>";
    }).join("") + "</" + tag + ">";
  }

  /* Inline markup. Code spans, links and images are swapped for placeholders
   * first so that emphasis never reaches into code or into URLs (snake_case
   * paths contain underscores), then put back at the end. Everything else is
   * escaped; only http(s), mailto and relative URLs become links. */
  function inline(text) {
    var toks = [];
    function put(html) {
      toks.push(html);
      return "\u0000" + (toks.length - 1) + "\u0000";
    }
    var s = String(text)
      .replace(/\u0000/g, "")
      .replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, function (m, ticks, code) {
        return put("<code>" + esc(code) + "</code>");
      })
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?(?!https?:)[A-Za-z][^>]*>/g, "");
    s = escText(s)
      .replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, function (m, url) { return put(link(url, url)); })
      .replace(/!\[([^\]]*)\]\(\s*([^)\s]+)[^)]*\)/g, function (m, alt, url) { return put(image(alt, url)); })
      .replace(/\[([^\]]+)\]\(\s*([^)\s]+)[^)]*\)/g, function (m, label, url) { return put(link(url, emphasis(label))); })
      .replace(/(^|[\s(])(https?:\/\/[^\s<]*[^\s<.,;:!?)'"\]])/g, function (m, pre, url) { return pre + put(link(url, url)); });
    s = emphasis(s);
    for (var n = 0; n < 4 && /\u0000\d+\u0000/.test(s); n++) {
      s = s.replace(/\u0000(\d+)\u0000/g, function (m, k) { return toks[+k]; });
    }
    return s.replace(/\n/g, "<br>");
  }

  function emphasis(s) {
    return s
      .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?!\w)/g, "$1<strong>$2</strong>")
      .replace(/\*(?=\S)([^*\n]*?\S)\*/g, "<em>$1</em>")
      .replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?!\w)/g, "$1<em>$2</em>")
      .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<del>$1</del>");
  }

  /* url and label are already escaped. */
  function link(url, label) {
    if (!/^(https?:|mailto:|#|\/|\.{1,2}\/)/i.test(url)) return label;
    var ext = /^https?:/i.test(url) ? ' target="_blank" rel="noopener"' : "";
    return '<a href="' + url + '"' + ext + ">" + label + "</a>";
  }

  function image(alt, url) {
    if (!/^(https?:\/\/|\/)/i.test(url)) return alt;
    return '<img alt="' + alt + '" src="' + url + '" loading="lazy">';
  }

  function fmtDate(iso) {
    if (!iso) return "";
    return iso.slice(0, 10);
  }

  function releaseTime(r) {
    return Date.parse(r.published_at || r.created_at || "") || 0;
  }

  function releaseTitle(r) {
    return String(r.tag_name || r.name || "");
  }

  function render(entries) {
    if (!entries.length) {
      return '<p>' + (zh ? '暂无发布记录。' : 'No releases yet. ') + '<a href="https://github.com/' + REPO + '/releases" target="_blank" rel="noopener">' + (zh ? '在 GitHub 上查看' : 'View on GitHub') + '</a>.</p>';
    }
    return entries.map(function (e) {
      var r = e.release;
      var date = fmtDate(r.published_at);
      var tag = esc(e.title);
      var prerelease = r.prerelease
        ? ' <mark class="changelog-prerelease">pre-release</mark>'
        : "";
      var body = md2html(r.body) || (zh ? "<p><em>无发布说明。</em></p>" : "<p><em>No release notes.</em></p>");
      var url = r.html_url || "https://github.com/" + REPO + "/releases/tag/" + encodeURIComponent(r.tag_name);

      return (
        '<article class="changelog-release" data-release="' + e.id + '">' +
        '  <header class="changelog-header">' +
        '    <h2 class="changelog-title">' +
        '      <a href="' + url + '" target="_blank" rel="noopener">' + tag + '</a>' +
        '    </h2>' +
        '    <div class="changelog-meta">' +
        '      <time datetime="' + esc(r.published_at || "") + '">' + esc(date) + "</time>" +
        prerelease +
        "    </div>" +
        "  </header>" +
        '  <div class="changelog-body">' + body + "</div>" +
        "</article>"
      );
    }).join("\n");
  }

  /* --- main --- */
  root.innerHTML =
    '<p style="color:var(--mint-text-secondary, #64748b);padding:1rem 0">' + (zh ? '正在加载发布记录…' : 'Loading releases…') + '</p>';

  fetch("https://api.github.com/repos/" + REPO + "/releases?per_page=" + PER_PAGE)
    .then(function (res) {
      if (!res.ok) throw new Error("GitHub API returned " + res.status);
      return res.json();
    })
    .then(function (releases) {
      if (!root.isConnected) return;

      /* Newest first, by publish time. The page and the sidebar share this order. */
      releases.sort(function (a, b) { return releaseTime(b) - releaseTime(a); });
      var used = {};
      var entries = releases.map(function (r) {
        var title = releaseTitle(r);
        var base = "release-" + (title.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "untitled");
        var id = base;
        for (var n = 2; used[id]; n++) id = base + "-" + n;
        used[id] = true;
        return { id: id, title: title, release: r };
      });
      root.innerHTML = render(entries);
      if (!entries.length) return;

      releaseIndex = {
        label: zh ? "发布版本" : "Releases",
        items: entries.map(function (e) { return { id: e.id, title: e.title }; })
      };
      /* Open the release named by the URL hash, else the newest. */
      showRelease(releaseFromHash());
      syncSidebar();
    })
    .catch(function (err) {
      root.innerHTML =
        '<div class="changelog-error" style="padding:1rem;border-left:3px solid #ef4444;background:rgba(239,68,68,0.06);border-radius:0 6px 6px 0">' +
        (zh ? "<p><strong>无法加载发布记录。</strong></p>" : "<p><strong>Unable to load releases.</strong></p>") +
        '<p style="font-size:0.875rem;color:var(--mint-text-secondary,#64748b)">' +
        '<a href="https://github.com/' + REPO + '/releases" target="_blank" rel="noopener">' + (zh ? '在 GitHub 上查看 →' : 'View on GitHub →') + '</a>' +
        "</p></div>";
      console.error("changelog:", err);
    });
}

  const observer = new MutationObserver(function () {
    boot();
    syncSidebar();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  boot();
})();
