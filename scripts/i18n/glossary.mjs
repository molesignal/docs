// The product's own UI labels in the source and the target language, so a translated page names a
// button or a menu as the product does in that language.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { WEB_I18N } from './languages.mjs';

const MAX_LABEL = 60;

function flatten(tree, prefix = '', out = new Map()) {
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else if (value && typeof value === 'object') flatten(value, path, out);
  }
  return out;
}

function readLocale(locale) {
  const strings = new Map();
  for (const file of readdirSync(join(WEB_I18N, locale)).filter((name) => name.endsWith('.json'))) {
    const namespace = file.slice(0, -'.json'.length);
    const tree = JSON.parse(readFileSync(join(WEB_I18N, locale, file), 'utf8'));
    for (const [key, value] of flatten(tree)) strings.set(`${namespace}:${key}`, value);
  }
  return strings;
}

/**
 * Source label → target label, from every short string of the product. A label the product
 * translates in more than one way takes the way it uses most.
 */
export function loadGlossary(fromLocale, toLocale) {
  const source = readLocale(fromLocale);
  const target = readLocale(toLocale);
  const votes = new Map();

  for (const [key, text] of source) {
    const translated = target.get(key);
    if (!translated || text.length > MAX_LABEL || text.includes('{{') || text === translated) continue;
    const forText = votes.get(text) ?? new Map();
    forText.set(translated, (forText.get(translated) ?? 0) + 1);
    votes.set(text, forText);
  }

  const glossary = new Map();
  for (const [text, options] of votes) {
    glossary.set(text, [...options].sort((a, b) => b[1] - a[1])[0][0]);
  }
  return glossary;
}

/** The entries a part of a page needs: its bold labels and menu path steps the product has. */
export function glossaryFor(text, glossary) {
  const entries = new Map();

  for (const match of text.matchAll(/\*\*([^*\n]+)\*\*/g)) {
    for (const step of match[1].split('→').map((part) => part.trim())) {
      const translated = glossary.get(step);
      if (translated) entries.set(step, translated);
    }
  }
  return [...entries];
}
