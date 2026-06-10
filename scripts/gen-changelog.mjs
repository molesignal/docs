#!/usr/bin/env node
/**
 * Generate the changelog pages from GitHub Releases.
 *
 * Pulls releases from the MoleSignal repo and rewrites the block between the
 * `BEGIN GENERATED` / `END GENERATED` markers in en-US/changelog.mdx and
 * zh-Hans/changelog.mdx as a list of Mintlify <Update> components.
 *
 * Usage:
 *   node scripts/gen-changelog.mjs
 *
 * Auth: uses the GitHub CLI if available (`gh api ...`), otherwise the REST API
 * with GITHUB_TOKEN. The repo can be overridden with CHANGELOG_REPO.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = process.env.CHANGELOG_REPO || 'molesignal/molesignal';
const DOCS_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const BEGIN = '{/* BEGIN GENERATED */}';
const END = '{/* END GENERATED */}';

/** Fetch releases as an array of { tag_name, name, body, published_at, prerelease, html_url }. */
function fetchReleases() {
  // Prefer gh (inherits the user's auth); fall back to a raw token request.
  try {
    const out = execFileSync('gh', ['api', `repos/${REPO}/releases?per_page=100`], {
      encoding: 'utf8',
    });
    return JSON.parse(out);
  } catch {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error('gh CLI failed and GITHUB_TOKEN is not set');
    const out = execFileSync(
      'curl',
      [
        '-sSL',
        '-H', `authorization: Bearer ${token}`,
        '-H', 'accept: application/vnd.github+json',
        `https://api.github.com/repos/${REPO}/releases?per_page=100`,
      ],
      { encoding: 'utf8' },
    );
    return JSON.parse(out);
  }
}

/** Escape the few characters that would break MDX/JSX in release bodies. */
function escapeMdx(text) {
  return String(text || '')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;')
    .trim();
}

function formatDate(iso) {
  if (!iso) return '';
  // Stable YYYY-MM-DD; avoids locale variance.
  return iso.slice(0, 10);
}

function renderUpdates(releases, lang) {
  if (!releases.length) {
    return lang.startsWith('zh')
      ? `<Update label="未发布" description="pre-1.0">\n  尚无打标签的正式发布。关注 [GitHub Releases](https://github.com/${REPO}/releases)。\n</Update>`
      : `<Update label="Unreleased" description="pre-1.0">\n  No tagged release yet. Follow [GitHub Releases](https://github.com/${REPO}/releases).\n</Update>`;
  }
  // Newest first.
  const sorted = [...releases].sort(
    (a, b) => new Date(b.published_at || 0) - new Date(a.published_at || 0),
  );
  return sorted
    .map((r) => {
      const label = formatDate(r.published_at) || r.tag_name;
      const desc = r.tag_name || r.name || '';
      const tags = r.prerelease ? ` tags={["pre-release"]}` : '';
      const body = escapeMdx(r.body) || (lang.startsWith('zh') ? '_无说明。_' : '_No release notes._');
      const indented = body
        .split('\n')
        .map((l) => (l ? `  ${l}` : ''))
        .join('\n');
      return `<Update label="${label}" description="${desc}"${tags}>\n${indented}\n</Update>`;
    })
    .join('\n\n');
}

function rewrite(lang) {
  const file = join(DOCS_ROOT, lang, 'changelog.mdx');
  const src = readFileSync(file, 'utf8');
  const start = src.indexOf(BEGIN);
  const end = src.indexOf(END);
  if (start === -1 || end === -1) {
    throw new Error(`markers not found in ${file}`);
  }
  const before = src.slice(0, start + BEGIN.length);
  const after = src.slice(end);
  const block = renderUpdates(releases, lang);
  writeFileSync(file, `${before}\n${block}\n${after}`);
  console.log(`updated ${lang}/changelog.mdx (${releases.length} releases)`);
}

const releases = fetchReleases();
rewrite('en-US');
rewrite('zh-Hans');
