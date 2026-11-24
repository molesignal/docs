// Reading, splitting, checking and rewriting the MDX of a page.

import { createHash } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { LANGUAGES } from './languages.mjs';

export const FRONT_TRANSLATED = ['title', 'description', 'sidebarTitle'];

/** The pages under `dir`, as paths relative to it without `.mdx`, such as `cli/index`. */
export function listPages(dir) {
  const walk = (folder) =>
    readdirSync(folder).flatMap((name) => {
      const path = join(folder, name);
      if (statSync(path).isDirectory()) return walk(path);
      return name.endsWith('.mdx') ? [path.slice(dir.length + 1, -'.mdx'.length)] : [];
    });

  try {
    return walk(dir).sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

/** A page's fingerprint, leaving out its language links, which change as languages are added. */
export function hash(text) {
  const { front, body } = splitPage(text);
  const fields = Object.entries(front).filter(([key]) => !key.endsWith('_link'));
  return createHash('sha256').update(JSON.stringify([fields, body])).digest('hex').slice(0, 16);
}

/** The page's URL path: `cli/index` in `ja` is `/ja/cli`, `index` is `/ja`. */
export function pageUrl(dir, page) {
  return `/${dir}/${page}`.replace(/\/index$/, '');
}

export function splitPage(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { front: {}, body: text };

  const front = {};
  for (const line of match[1].split('\n')) {
    const field = line.match(/^"?([A-Za-z][\w-]*)"?:\s*(.*)$/);
    if (!field) continue;
    const [, key, raw] = field;
    front[key] = raw.startsWith('"') ? JSON.parse(raw) : raw;
  }
  return { front, body: text.slice(match[0].length) };
}

/** The frontmatter block: the page's fields in their order, then a link to every other language's page. */
export function joinPage(front, body, links) {
  const lines = ['---'];

  for (const [key, value] of Object.entries(front)) {
    if (!key.endsWith('_link')) lines.push(`${key}: ${JSON.stringify(value)}`);
  }
  for (const [code, url] of links) lines.push(`"${code}_link": ${JSON.stringify(url)}`);
  lines.push('---');
  return `${lines.join('\n')}\n${body.startsWith('\n') ? body : `\n${body}`}`;
}

/** The links a page in `dir` carries: one to each other language that has the page. */
export function languageLinks(dir, page, hasPage) {
  return LANGUAGES.filter((language) => language.dir !== dir && hasPage(language.dir, page)).map((language) => [
    language.code,
    pageUrl(language.dir, page),
  ]);
}

/**
 * Takes the fenced code blocks out of `body`: each becomes one line holding `%%CODE_n%%` at the
 * fence's indentation. Code is never sent to the model, and comes back as it was.
 */
export function protectCode(body) {
  const blocks = [];
  const out = [];
  let open = null;

  for (const line of body.split('\n')) {
    if (open) {
      open.lines.push(line);
      const close = line.match(/^\s*(`{3,}|~{3,})\s*$/);
      if (close && close[1][0] === open.fence[0] && close[1].length >= open.fence.length) {
        blocks.push(open.lines.join('\n'));
        out.push(`${open.indent}%%CODE_${blocks.length - 1}%%`);
        open = null;
      }
      continue;
    }

    const start = line.match(/^(\s*)(`{3,}|~{3,})/);
    if (start) open = { indent: start[1], fence: start[2], lines: [line] };
    else out.push(line);
  }
  if (open) throw new Error('a code block is not closed');
  return { text: out.join('\n'), blocks };
}

export function restoreCode(text, blocks) {
  return text.replace(/^.*%%CODE_(\d+)%%.*$/gm, (_, index) => blocks[Number(index)]);
}

const CJK = /[　-ヿ㐀-鿿豈-﫿＀-￯]/;
const STARTS_BLOCK = /^\s*([-*+] |\d+\. |\||#|<|>|\{|%%CODE|\w+=|\/?>)/;
const ENDS_BLOCK = /^\s*(#|\||<|\{|%%CODE|\w+=)|>\s*$/;

/**
 * Joins the lines of each paragraph and list item into one, for a language written without
 * spaces: a line break inside a paragraph renders as a space. Lines meet with nothing between
 * them where both sides are CJK, and with a space next to Latin text, code or bold labels.
 * Takes text whose code is protected.
 */
export function joinWrappedLines(text) {
  const out = [];

  for (const line of text.split('\n')) {
    const previous = out.length - 1;
    const prior = out[previous];
    const continues =
      prior !== undefined && prior.trim() && line.trim() && !STARTS_BLOCK.test(line) && !ENDS_BLOCK.test(prior) && (CJK.test(prior) || CJK.test(line));

    if (!continues) {
      out.push(line);
      continue;
    }
    const next = line.trimStart();
    const tight = CJK.test(prior.at(-1)) && CJK.test(next[0]);
    out[previous] = `${prior.trimEnd()}${tight ? '' : ' '}${next}`;
  }
  return out.join('\n');
}

/** Splits the text at `## ` headings into parts of at most about `max` characters. */
export function splitSections(text, max) {
  const sections = [];
  let current = [];

  for (const line of text.split('\n')) {
    if (line.startsWith('## ') && current.length > 0) {
      sections.push(current.join('\n'));
      current = [];
    }
    current.push(line);
  }
  sections.push(current.join('\n'));

  const parts = [];
  for (const section of sections) {
    const last = parts.length - 1;
    if (last >= 0 && parts[last].length + section.length + 1 <= max) parts[last] += `\n${section}`;
    else parts.push(section);
  }
  return parts;
}

function count(items) {
  const counts = new Map();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return counts;
}

function sameCounts(a, b) {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) if (b.get(key) !== value) return false;
  return true;
}

const SHAPE = {
  'code blocks': (text) => text.match(/%%CODE_\d+%%/g) ?? [],
  headings: (text) => text.match(/^#{1,6} /gm) ?? [],
  'table rows': (text) => (text.match(/^[ \t]*\|/gm) ?? []).map(() => '|'),
  components: (text) => text.match(/<\/?[A-Z][A-Za-z]*/g) ?? [],
  'link targets': (text) => [...text.matchAll(/\]\(([^)\s]+)\)|\bhref=["']([^"']+)["']|\bsrc=["']([^"']+)["']/g)].map((m) => m[1] ?? m[2] ?? m[3]),
};

/** What a translation changed that it must not: the shape of the page. */
export function shapeProblems(source, translated) {
  return Object.entries(SHAPE)
    .filter(([, of]) => !sameCounts(count(of(source)), count(of(translated))))
    .map(([name]) => name);
}

/** Points the page's links, card targets and `data-locale` at the target language. */
export function retarget(text, fromDir, toDir) {
  const prefix = new RegExp(`(?<=[("'])/${fromDir.replace(/[-]/g, '\\-')}(?=[/)"'#])`, 'g');
  return text.replace(prefix, `/${toDir}`).replaceAll(`data-locale="${fromDir}"`, `data-locale="${toDir}"`);
}

/** Mintlify's heading id: lower case, ASCII punctuation dropped, `'` as `’`, spaces as `-`, no `--`. */
export function slug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/'/g, '’')
    .replace(/[!"#$%&()*+,.:;<=>?@[\\\]^`{|}~]/g, '')
    .replace(/\s/g, '-')
    .replace(/-{2,}/g, '-');
}

/** The ids of the page's headings, in order, leaving code out. */
export function headingIds(body) {
  const { text } = protectCode(body);
  return [...text.matchAll(/^#{2,4} (.+)$/gm)].map((match) => slug(match[1]));
}

/**
 * Rewrites the `#anchors` of links in a translated page. `idsOf(page)` gives a page's heading ids
 * in the source language and in the target, in the same order. An anchor that is already a
 * target id stays; one that is neither is reported.
 */
export function retargetAnchors(text, page, dir, idsOf) {
  const unresolved = [];
  const own = `/${dir}/`;

  const replaced = text.replace(/(\]\(|href=["'])(\/[^)\s"'#]*)?#([^)\s"']+)/g, (whole, lead, path, anchor) => {
    let target = page;
    if (path) {
      if (!path.startsWith(own) && path !== `/${dir}`) return whole;
      target = path === `/${dir}` ? 'index' : path.slice(own.length).replace(/\/$/, '');
    }
    const ids = idsOf(target) ?? idsOf(`${target}/index`);
    if (!ids) return whole;

    const id = decodeURIComponent(anchor);
    if (ids.target.includes(id)) return whole;
    // An id written before `slug` folded runs of `-`, as `dringlichkeits--und`.
    const folded = id.replace(/-{2,}/g, '-');
    if (ids.target.includes(folded)) return `${lead}${path ?? ''}#${folded}`;
    const index = ids.source.indexOf(id);
    if (index === -1 || ids.source.length !== ids.target.length) {
      unresolved.push(`${path ?? ''}#${id}`);
      return whole;
    }
    return `${lead}${path ?? ''}#${ids.target[index]}`;
  });

  return { text: replaced, unresolved };
}
