// The navigation of a translated language in `docs.json`: the source language's tabs, groups and
// footer with the labels translated and the pages pointed at the target directory.
//
// `docs.json` is formatted by hand, so a language is written by replacing its own element of
// `navigation.languages` in the text; the rest of the file stays as it is.

/** Every label of a language's navigation that a reader sees. */
export function navLabels(language) {
  const labels = new Set();

  const walkPages = (pages) => {
    for (const page of pages ?? []) {
      if (typeof page !== 'object') continue;
      labels.add(page.group);
      walkPages(page.pages);
    }
  };

  for (const tab of language.tabs ?? []) {
    labels.add(tab.tab);
    for (const group of tab.groups ?? []) {
      labels.add(group.group);
      walkPages(group.pages);
    }
    walkPages(tab.pages);
  }
  for (const column of language.footer?.links ?? []) {
    labels.add(column.header);
    for (const item of column.items ?? []) labels.add(item.label);
  }
  labels.delete(undefined);
  return [...labels];
}

/**
 * The target language's navigation, built from the source's. Pages the target lacks are left
 * out, and so is a group that is left with nothing.
 */
export function buildNav(source, code, fromDir, toDir, labels, hasPage) {
  const label = (text) => labels[text] ?? text;
  const path = (page) => `${toDir}/${page.slice(fromDir.length + 1)}`;
  const href = (link) => (link.startsWith(`/${fromDir}/`) || link === `/${fromDir}` ? `/${toDir}${link.slice(fromDir.length + 1)}` : link);

  const pages = (list) =>
    (list ?? []).flatMap((page) => {
      if (typeof page === 'string') return hasPage(path(page)) ? [path(page)] : [];

      const children = pages(page.pages);
      const root = page.root && hasPage(path(page.root)) ? path(page.root) : undefined;
      if (children.length === 0 && !root) return [];
      return [{ ...page, group: label(page.group), ...(root ? { root } : {}), pages: children }];
    });

  const tabs = (source.tabs ?? []).flatMap((tab) => {
    const built = { ...tab, tab: label(tab.tab) };
    if (tab.groups) {
      built.groups = tab.groups
        .map((group) => ({ ...group, group: label(group.group), pages: pages(group.pages) }))
        .filter((group) => group.pages.length > 0);
      if (built.groups.length === 0) return [];
    }
    if (tab.pages) {
      built.pages = pages(tab.pages);
      if (built.pages.length === 0) return [];
    }
    return [built];
  });

  const footer = source.footer && {
    ...source.footer,
    links: source.footer.links?.map((column) => ({
      ...column,
      header: label(column.header),
      items: column.items?.map((item) => ({ ...item, label: label(item.label), href: href(item.href) })),
    })),
  };

  const { default: _default, ...rest } = source;
  return { ...rest, language: code, ...(footer ? { footer } : {}), tabs };
}

function inline(value) {
  if (Array.isArray(value)) return `[${value.map(inline).join(', ')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    return entries.length ? `{ ${entries.map(([key, item]) => `${JSON.stringify(key)}: ${inline(item)}`).join(', ')} }` : '{}';
  }
  return JSON.stringify(value);
}

/** JSON in the file's style: an object or array of plain values on one line when it fits in 100. */
export function format(value, indent = '', lead = 0) {
  if (typeof value !== 'object' || value === null) return JSON.stringify(value);

  const items = Array.isArray(value) ? value : Object.values(value);
  const one = inline(value);
  if (items.every((item) => typeof item !== 'object' || item === null) && indent.length + lead + one.length <= 100) return one;

  const pad = `${indent}  `;
  if (Array.isArray(value)) {
    return value.length ? `[\n${value.map((item) => pad + format(item, pad)).join(',\n')}\n${indent}]` : '[]';
  }
  const entries = Object.entries(value).map(([key, item]) => {
    const head = `${JSON.stringify(key)}: `;
    return pad + head + format(item, pad, head.length);
  });
  return entries.length ? `{\n${entries.join(',\n')}\n${indent}}` : '{}';
}

/** The text spans of the elements of the array that opens at `open` (the index of its `[`). */
function elementSpans(text, open) {
  const spans = [];
  let depth = 0;
  let start = -1;
  let inString = false;

  for (let index = open + 1; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (char === '\\') index += 1;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{' || char === '[') {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === '}' || char === ']') {
      if (depth === 0) return { spans, close: index };
      depth -= 1;
      if (depth === 0) spans.push([start, index + 1]);
    }
  }
  throw new Error('docs.json: navigation.languages is not closed');
}

/** `docs.json` with each of `languages` written in place of its own element, or added at the end. */
export function writeLanguages(text, languages, order) {
  const open = text.indexOf('[', text.indexOf('"languages"'));
  const { spans, close } = elementSpans(text, open);
  const indent = text.slice(text.lastIndexOf('\n', spans[0][0]) + 1, spans[0][0]);

  const elements = spans.map(([start, end]) => ({ code: JSON.parse(text.slice(start, end)).language, text: text.slice(start, end) }));
  for (const language of languages) {
    const rendered = format(language, indent);
    const existing = elements.find((element) => element.code === language.language);
    if (existing) existing.text = rendered;
    else elements.push({ code: language.language, text: rendered });
  }
  elements.sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code));

  const closeIndent = text.slice(text.lastIndexOf('\n', close) + 1, close);
  return `${text.slice(0, open + 1)}\n${elements.map((element) => indent + element.text).join(',\n')}\n${closeIndent}${text.slice(close)}`;
}
