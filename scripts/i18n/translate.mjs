// Translates the site into every language that `languages.mjs` marks as translated, and keeps
// the translated pages, the language links of every page and `docs.json` in step.
//
// A page is translated when its target is missing or its source changed since it was translated
// (the source's hash is kept in `state/<dir>.json`), so a re-run picks up only what is new or
// failed. A target page whose source is gone is deleted.
//
// Usage (from the repository root):
//   export OPENAI_API_KEY=...
//   node scripts/i18n/translate.mjs                    # every language, what is missing or stale
//   node scripts/i18n/translate.mjs --lang=ja,de       # some languages
//   node scripts/i18n/translate.mjs --page=quickstart  # one page
//   node scripts/i18n/translate.mjs --model=gpt-4o --concurrency=8
//   node scripts/i18n/translate.mjs --dry-run          # count what would be translated
//   node scripts/i18n/translate.mjs --links-only       # rewrite links, anchors and docs.json only

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { glossaryFor, loadGlossary } from './glossary.mjs';
import { LANGUAGES, ROOT, TRANSLATED, languageByDir } from './languages.mjs';
import { connect, parseJsonObject, runPool } from './llm.mjs';
import {
  FRONT_TRANSLATED,
  hash,
  headingIds,
  joinPage,
  joinWrappedLines,
  languageLinks,
  listPages,
  protectCode,
  restoreCode,
  retarget,
  retargetAnchors,
  shapeProblems,
  splitPage,
  splitSections,
} from './mdx.mjs';
import { buildNav, navLabels, writeLanguages } from './nav.mjs';
import { bodyPrompt, stringsPrompt } from './prompts.mjs';

const PART_SIZE = 8_000;
const META_BATCH = 20;
const ATTEMPTS = 3;
const DOCS_JSON = join(ROOT, 'docs.json');

const arg = (name) => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = (name) => process.argv.includes(`--${name}`);

const pagePath = (dir, page) => join(ROOT, dir, `${page}.mdx`);
const readPage = (dir, page) => readFileSync(pagePath(dir, page), 'utf8');
const hasPage = (dir, page) => existsSync(pagePath(dir, page));

function writeFile(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

const statePath = (dir) => join(ROOT, 'scripts', 'i18n', 'state', `${dir}.json`);

function readState(dir) {
  return existsSync(statePath(dir)) ? JSON.parse(readFileSync(statePath(dir), 'utf8')) : { labels: {}, pages: {} };
}

function saveState(dir, state) {
  const sorted = (object) => Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
  writeFile(statePath(dir), `${JSON.stringify({ labels: sorted(state.labels), pages: sorted(state.pages) }, null, 2)}\n`);
}

function plan(language, pageFilter, all) {
  const state = readState(language.dir);
  const sources = listPages(join(ROOT, language.from));
  const pending = sources.filter((page) => {
    if (pageFilter && page !== pageFilter) return false;
    return all || !hasPage(language.dir, page) || state.pages[page] !== hash(readPage(language.from, page));
  });
  const orphans = listPages(join(ROOT, language.dir)).filter((page) => !sources.includes(page));
  return { language, state, pending, orphans, meta: new Map(), failed: [] };
}

function navSource(docs, language) {
  const code = languageByDir(language.from).code;
  return docs.navigation.languages.find((entry) => entry.language === code);
}

/** Asks for a JSON object of strings, keeping only the keys that came back as text. */
async function translateStrings(llm, system, strings) {
  const answer = parseJsonObject(await llm.complete(system, JSON.stringify(strings, null, 2), { json: true }));
  return Object.fromEntries(Object.keys(strings).filter((key) => typeof answer[key] === 'string' && answer[key].trim()).map((key) => [key, answer[key]]));
}

function labelJobs(llm, work, docs) {
  const { language, state } = work;
  const missing = navLabels(navSource(docs, language)).filter((label) => !(label in state.labels));
  if (missing.length === 0) return [];

  return [
    async () => {
      const system = stringsPrompt(language.from, language.dir, 'the navigation labels (tabs, sidebar groups, footer links)');
      try {
        Object.assign(state.labels, await translateStrings(llm, system, Object.fromEntries(missing.map((label) => [label, label]))));
        saveState(language.dir, state);
      } catch (error) {
        // The navigation shows the source labels until a re-run translates them.
        console.error(`  ! ${language.dir}: navigation labels failed (${error.message})`);
      }
    },
  ];
}

function metaJobs(llm, work) {
  const { language } = work;
  const batches = [];
  for (let index = 0; index < work.pending.length; index += META_BATCH) batches.push(work.pending.slice(index, index + META_BATCH));

  return batches.map((batch) => async () => {
    const strings = {};
    for (const page of batch) {
      const { front } = splitPage(readPage(language.from, page));
      for (const key of FRONT_TRANSLATED) if (front[key]) strings[`${page} ${key}`] = front[key];
    }

    try {
      const system = stringsPrompt(language.from, language.dir, 'page titles, sidebar titles and descriptions');
      const answer = await translateStrings(llm, system, strings);
      for (const page of batch) {
        const { front } = splitPage(readPage(language.from, page));
        const keys = FRONT_TRANSLATED.filter((key) => front[key]);
        if (keys.every((key) => answer[`${page} ${key}`])) {
          work.meta.set(page, { ...front, ...Object.fromEntries(keys.map((key) => [key, answer[`${page} ${key}`]])) });
        }
      }
    } catch (error) {
      console.error(`  ! ${language.dir}: titles of ${batch.length} page(s) failed (${error.message})`);
    }
  });
}

async function translatePart(llm, language, part, glossary) {
  if (part.replace(/%%CODE_\d+%%/g, '').trim() === '') return part;

  const system = bodyPrompt(language.from, language.dir, glossaryFor(part, glossary));
  const [, lead, , tail] = part.match(/^(\s*)([\s\S]*?)(\s*)$/);
  let note = '';

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    let answer = (await llm.complete(system, `${part}${note}`)).trim();
    const fenced = answer.match(/^```(?:mdx|markdown|md)?\n([\s\S]*)\n```$/);
    if (fenced) answer = fenced[1].trim();

    const problems = shapeProblems(part, answer);
    if (problems.length === 0) return `${lead}${answer}${tail}`;
    note = `\n\n[Your previous translation of this text changed its ${problems.join(', ')}. Keep them exactly as in the input.]`;
    if (attempt < ATTEMPTS) continue;

    // A shorter text comes back intact more often: try the part's sections one at a time.
    const sections = splitSections(part, 0);
    if (sections.length > 1) {
      const translated = await Promise.all(sections.map((section) => translatePart(llm, language, section, glossary)));
      return translated.join('\n');
    }
    throw new Error(`the translation changed the ${problems.join(', ')}`);
  }
}

function bodyJobs(llm, work, glossary) {
  const { language, state } = work;

  return work.pending.map((page) => async () => {
    const front = work.meta.get(page);
    if (!front) {
      work.failed.push(`${page} (title)`);
      return;
    }

    const source = readPage(language.from, page);
    try {
      const { text, blocks } = protectCode(splitPage(source).body);
      const parts = await Promise.all(splitSections(text, PART_SIZE).map((part) => translatePart(llm, language, part, glossary)));
      const translated = language.joinLines ? joinWrappedLines(parts.join('\n')) : parts.join('\n');
      const body = localizeImages(retarget(restoreCode(translated, blocks), language.from, language.dir), language);
      writeFile(pagePath(language.dir, page), joinPage(front, body, languageLinks(language.dir, page, hasPage)));
      state.pages[page] = hash(source);
      saveState(language.dir, state);
      console.log(`  ${language.dir}/${page}`);
    } catch (error) {
      work.failed.push(`${page} (${error.message})`);
      console.error(`  ! ${language.dir}/${page}: ${error.message}`);
    }
  });
}

/** Points every link's #anchor in a translated language at the translated headings. */
function fixAnchors(language) {
  const cache = new Map();
  const idsOf = (page) => {
    if (!cache.has(page)) {
      cache.set(
        page,
        hasPage(language.dir, page) && hasPage(language.from, page)
          ? { source: headingIds(splitPage(readPage(language.from, page)).body), target: headingIds(splitPage(readPage(language.dir, page)).body) }
          : undefined,
      );
    }
    return cache.get(page);
  };

  const unresolved = [];
  for (const page of listPages(join(ROOT, language.dir))) {
    const text = readPage(language.dir, page);
    const fixed = retargetAnchors(text, page, language.dir, idsOf);
    if (fixed.text !== text) writeFile(pagePath(language.dir, page), fixed.text);
    unresolved.push(...fixed.unresolved.map((anchor) => `${language.dir}/${page} → ${anchor}`));
  }
  return unresolved;
}

/**
 * Points the architecture diagrams at the target language's images, `<key>_<code>_<theme>.svg`,
 * which `scripts/diagrams/build.mjs` renders for every language. An image it lacks stays as it was.
 */
function localizeImages(text, language) {
  const from = languageByDir(language.from).code;

  return text.replace(/\/images\/architecture\/([\w-]+?)_([\w-]+)_(light|dark)\.svg/g, (whole, key, code, theme) => {
    const localized = `/images/architecture/${key}_${language.code}_${theme}.svg`;
    return code === from && existsSync(join(ROOT, localized)) ? localized : whole;
  });
}

function fixImages(language) {
  for (const page of listPages(join(ROOT, language.dir))) {
    const text = readPage(language.dir, page);
    const localized = localizeImages(text, language);
    if (localized !== text) writeFile(pagePath(language.dir, page), localized);
  }
}

/** Joins wrapped paragraph lines in a language written without spaces; see `joinWrappedLines`. */
function fixWrappedLines(language) {
  if (!language.joinLines) return;

  for (const page of listPages(join(ROOT, language.dir))) {
    const text = readPage(language.dir, page);
    const { front, body } = splitPage(text);
    const { text: protectedBody, blocks } = protectCode(body);
    const joined = restoreCode(joinWrappedLines(protectedBody), blocks);
    if (joined !== body) writeFile(pagePath(language.dir, page), joinPage(front, joined, languageLinks(language.dir, page, hasPage)));
  }
}

/** Gives every page of every language a link to each other language's page. */
function fixLanguageLinks() {
  let changed = 0;
  for (const { dir } of LANGUAGES) {
    for (const page of listPages(join(ROOT, dir))) {
      const text = readPage(dir, page);
      const { front, body } = splitPage(text);
      const rewritten = joinPage(front, body, languageLinks(dir, page, hasPage));
      if (rewritten !== text) {
        writeFile(pagePath(dir, page), rewritten);
        changed += 1;
      }
    }
  }
  return changed;
}

function fixNavigation(works) {
  const text = readFileSync(DOCS_JSON, 'utf8');
  const docs = JSON.parse(text);
  const languages = works
    .filter(({ language }) => listPages(join(ROOT, language.dir)).length > 0)
    .map(({ language, state }) =>
      buildNav(navSource(docs, language), language.code, language.from, language.dir, state.labels, (page) => existsSync(join(ROOT, `${page}.mdx`))),
    );
  const written = writeLanguages(text, languages, LANGUAGES.map((language) => language.code));
  if (written !== text) writeFileSync(DOCS_JSON, written);
}

async function main() {
  const langs = arg('lang')?.split(',');
  const targets = TRANSLATED.filter((language) => !langs || langs.includes(language.dir) || langs.includes(language.code));
  if (targets.length === 0) throw new Error(`--lang names no translated language; use some of: ${TRANSLATED.map((language) => language.dir).join(', ')}`);
  const concurrency = Number(arg('concurrency') ?? 6);
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('--concurrency takes a whole number of at least 1');

  const docs = JSON.parse(readFileSync(DOCS_JSON, 'utf8'));
  const works = targets.map((language) => plan(language, arg('page'), flag('all')));

  if (flag('dry-run')) {
    for (const { language, pending, orphans } of works) {
      const size = pending.reduce((sum, page) => sum + readPage(language.from, page).length, 0);
      console.log(`${language.dir}: ${pending.length} page(s), ${Math.round(size / 1000)}k characters from ${language.from}${orphans.length ? `; ${orphans.length} to delete` : ''}`);
    }
    return;
  }

  let failed = 0;
  if (!flag('links-only') && works.some((work) => work.pending.length > 0 || labelJobs(null, work, docs).length > 0)) {
    const llm = connect(arg('model'));
    const total = works.reduce((sum, work) => sum + work.pending.length, 0);
    console.log(`translate: ${llm.model}, ${total} page(s) in ${works.length} language(s), ${concurrency} requests at a time`);

    await runPool(works.flatMap((work) => [...labelJobs(llm, work, docs), ...metaJobs(llm, work)]), concurrency);
    const glossaries = new Map(works.map(({ language }) => [language.dir, loadGlossary(languageByDir(language.from).web, language.web)]));
    // A page's parts run side by side, so fewer pages than requests are in flight at once.
    await runPool(works.flatMap((work) => bodyJobs(llm, work, glossaries.get(work.language.dir))), Math.max(1, Math.ceil(concurrency / 2)));
    failed = works.reduce((sum, work) => sum + work.failed.length, 0);
  }

  for (const { language, orphans } of works) {
    for (const page of orphans) rmSync(pagePath(language.dir, page));
  }
  for (const { language } of works) {
    fixWrappedLines(language);
    fixImages(language);
  }
  const unresolved = works.flatMap(({ language }) => fixAnchors(language));
  const relinked = fixLanguageLinks();
  fixNavigation(works);

  if (relinked > 0) console.log(`translate: language links rewritten on ${relinked} page(s)`);
  if (unresolved.length > 0) {
    console.log(`translate: ${unresolved.length} anchor(s) match no heading:`);
    for (const line of unresolved.slice(0, 30)) console.log(`  ${line}`);
  }
  if (failed > 0) {
    console.error(`\ntranslate: ${failed} page(s) left untranslated — run the same command again to retry them:`);
    for (const work of works) for (const line of work.failed) console.error(`  ${work.language.dir}/${line}`);
    process.exit(1);
  }
  console.log('\ntranslate: done. Check with `mint validate` and `mint broken-links --check-anchors`.');
}

main().catch((error) => {
  console.error(`translate: ${error.message}`);
  process.exit(1);
});
