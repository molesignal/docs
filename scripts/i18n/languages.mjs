// The languages of the site, and how each machine-translated one is described to the model.
//
// en-US and zh-Hans are written by hand. Every other language is translated from one of them by
// `translate.mjs`: zh-Hant from zh-Hans, the rest from en-US.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The product's translation files, for the UI labels the pages quote. */
export const WEB_I18N = resolve(ROOT, '..', 'molesignal', 'web', 'src', 'i18n');

/**
 * Every language in `docs.json` order. `code` is Mintlify's language code, used in `docs.json`
 * and in the `<code>_link` frontmatter keys; `dir` holds the pages and starts their URLs.
 */
export const LANGUAGES = [
  { code: 'en', dir: 'en-US', web: 'en-us' },
  { code: 'zh-Hans', dir: 'zh-Hans', web: 'zh-cn' },
  {
    code: 'zh-Hant',
    dir: 'zh-Hant',
    web: 'zh-tw',
    from: 'zh-Hans',
    name: 'Traditional Chinese as written in Taiwan (zh-TW)',
    style: [
      'Use Taiwan software vocabulary, not a character-by-character conversion: 伺服器, 資料, 程式, 檔案, 設定, 介面, 預設, 網路, 訊息, 使用者, 登入, 帳號, 物件儲存, 叢集.',
      'Write each paragraph and list item on one line, as the input does.',
    ],
  },
  {
    code: 'ja',
    dir: 'ja',
    web: 'ja-jp',
    from: 'en-US',
    // Written without spaces, so a line break inside a paragraph would show as one.
    joinLines: true,
    name: 'Japanese (ja-JP)',
    style: [
      'Write sentences in the polite です/ます style and instructions as 〜します / 〜してください, as Japanese SaaS documentation does. Write established technical terms in katakana (ダッシュボード, アラート, トレース).',
    ],
  },
  {
    code: 'ko',
    dir: 'ko',
    web: 'ko-kr',
    from: 'en-US',
    name: 'Korean (ko-KR)',
    style: ['Write sentences in the formal 합니다 style, as Korean SaaS documentation does.'],
  },
  {
    code: 'de',
    dir: 'de',
    web: 'de',
    from: 'en-US',
    name: 'German (de)',
    style: [
      'Write instructions in the "Sie" imperative ("Klicken Sie auf …"). Prefer established German IT terms but keep the English ones German readers use (Dashboard, Trace, Span, Log, Pipeline).',
    ],
  },
  {
    code: 'es',
    dir: 'es',
    web: 'es',
    from: 'en-US',
    name: 'Spanish (es), neutral international Spanish',
    style: [
      'Write instructions in the "tú" imperative ("Haz clic en …"), as the product does; avoid words particular to Spain or to any single Latin American country.',
    ],
  },
  {
    code: 'fr',
    dir: 'fr',
    web: 'fr',
    from: 'en-US',
    name: 'French (fr)',
    style: [
      'Write instructions in the "vous" imperative ("Cliquez sur …"). Use French typography: a non-breaking space before : ; ? ! and inside « », except inside code.',
    ],
  },
  {
    code: 'pt-BR',
    dir: 'pt-BR',
    web: 'pt-br',
    from: 'en-US',
    name: 'Brazilian Portuguese (pt-BR)',
    style: ['Write instructions in the imperative ("Clique em …"). Use Brazilian vocabulary (arquivo, tela, usuário), not European Portuguese.'],
  },
];

export const TRANSLATED = LANGUAGES.filter((language) => language.from);

export function languageByDir(dir) {
  const language = LANGUAGES.find((candidate) => candidate.dir === dir);
  if (!language) throw new Error(`unknown language directory ${dir}`);
  return language;
}

export function languageName(dir) {
  if (dir === 'en-US') return 'English';
  if (dir === 'zh-Hans') return 'Simplified Chinese';
  return languageByDir(dir).name;
}
