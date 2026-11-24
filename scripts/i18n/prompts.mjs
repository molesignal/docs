// What the model is told for each kind of request.

import { languageByDir, languageName } from './languages.mjs';

function intro(fromDir, toDir, what) {
  return `You are a professional technical translator localizing ${what} of the MoleSignal documentation site from ${languageName(fromDir)} to ${languageName(toDir)}. MoleSignal is an open-source, self-hostable observability and incident-response product: logs, metrics, traces, profiles, RUM, APM, alerting, on-call, status pages, synthetic monitoring and an AI agent.`;
}

function languageRules(fromDir, toDir) {
  const { style } = languageByDir(toDir);
  const conversion =
    fromDir === 'en-US'
      ? []
      : [`- The input is a reviewed translation: keep its meaning, structure and wording choices, and adapt it to ${languageName(toDir)}.`];
  return [...conversion, ...style.map((line) => `- ${line}`)];
}

const TERMS = [
  '- Do not translate "MoleSignal", "Mole Agent", product and vendor names (PostgreSQL, Kubernetes, OpenTelemetry, Slack …), query languages (SQL, PromQL, VRL), protocol and format names, or units.',
  '- Use the terminology established in localized observability products (Datadog, Grafana, New Relic) for this language, and translate the same term the same way every time.',
];

/** For one part of a page body, returned as MDX. */
export function bodyPrompt(fromDir, toDir, glossary) {
  const lines = [
    intro(fromDir, toDir, 'one part of an MDX page'),
    '',
    'Return only the translated MDX of that part: no preamble, no explanation, no code fence around it.',
    '',
    'Rules:',
    '- Keep the markup exactly as it is: headings and their levels, list markers, numbering, table pipes and separator rows, block quotes, JSX components with their attributes, HTML tags, blank lines, and the leading whitespace of every line.',
    '- Write every input line as one output line. Never join two lines or split one.',
    '- A line holding a token such as %%CODE_3%% stands for a code block: copy it unchanged.',
    '- Never change a URL, a link target, an href, an image path or a #anchor. Translate only the visible text of links.',
    '- In JSX components translate the attributes a reader sees (title, alt, description, placeholder) and nothing else (icon, href, src, cols, color …).',
    '- Keep inline code, configuration keys, environment variables, commands, file paths, API paths, permission keys and field names unchanged.',
    '- Bold text such as **Settings** and menu paths such as **Settings → API tokens** are labels of the product: write them as the product does in this language. Use the glossary when it has them.',
    '- Write in the active voice, with direct instructions and no personal pronouns for people. Keep sentences short; use sentence case where the language has case.',
    ...TERMS,
    ...languageRules(fromDir, toDir),
  ];

  if (glossary.length > 0) {
    lines.push('', `Glossary of product labels (${languageName(fromDir)} → ${languageName(toDir)}):`);
    for (const [source, target] of glossary) lines.push(`${source} → ${target}`);
  }
  return lines.join('\n');
}

/** For page titles and descriptions, or navigation labels, returned as a JSON object. */
export function stringsPrompt(fromDir, toDir, what) {
  return [
    intro(fromDir, toDir, what),
    '',
    'Rules:',
    '- Return ONLY a JSON object mapping each input key to its translated string. No prose, no markdown, no code fences.',
    '- The key tells where the text appears (a page title, a page description, a sidebar title, a navigation group); never translate the key.',
    '- Titles, sidebar titles and navigation labels are short; keep them short and in sentence case where the language has case. Descriptions are one or two sentences for search results.',
    '- Keep inline code in backticks unchanged.',
    ...TERMS,
    ...languageRules(fromDir, toDir),
  ].join('\n');
}
