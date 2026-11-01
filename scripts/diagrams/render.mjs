// Renders diagram definitions with Excalidraw: an editable .excalidraw scene, and a light and a dark SVG.
//
// Excalidraw's exporters need a real DOM, so they run inside headless Chromium through Playwright, with
// the library loaded from esm.sh. Each SVG embeds a subset of the hand-drawn fonts, Excalifont and, for
// Chinese, Xiaolai, so it looks the same through <img> on any machine.
//
// A definition holds one layout and the text of every language, so the languages cannot drift apart:
//
//   { nodes: [{ id, x, y, w, h, text, dashed, frame }], texts: [{ id, x, y, text }],
//     edges: [{ from, to, label, dashed, fromSide, toSide, fromAt, toAt, via }] }
//
// `text` and `label` are either one string or { en, 'zh-Hans' }. An edge finds its own anchors: sides
// follow from where the two boxes sit, and the arrow stays straight when the boxes overlap on that axis.
// `fromSide` and `toSide`, given together, choose the sides instead. `fromAt` and `toAt` move an anchor
// along its side, from 0 to 1. `via` adds corner points, in absolute coordinates.

import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXCALIDRAW_VERSION = '0.18.0';
const EXC = `https://esm.sh/@excalidraw/excalidraw@${EXCALIDRAW_VERSION}?deps=react@18.3.1,react-dom@18.3.1`;
const ASSETS = `https://esm.sh/@excalidraw/excalidraw@${EXCALIDRAW_VERSION}/dist/prod/`;

const FONT_SIZE = 16;
const BASE = { strokeColor: '#1e1e1e', backgroundColor: 'transparent', strokeWidth: 2, roughness: 1 };

// Playwright is a development tool of the product's web app, not a dependency of this site.
function findPlaywright() {
  if (process.env.PLAYWRIGHT_PATH) return process.env.PLAYWRIGHT_PATH;
  const pnpm = resolve(HERE, '..', '..', '..', 'molesignal', 'web', 'node_modules', '.pnpm');
  const dir = readdirSync(pnpm).find((name) => name.startsWith('playwright@'));
  return resolve(pnpm, dir, 'node_modules', 'playwright');
}

const pick = (text, lang) => (typeof text === 'string' ? text : text?.[lang]);

function anchors(from, to, edge) {
  if (edge.fromSide && edge.toSide) {
    return [point(from, edge.fromSide, edge.fromAt ?? 0.5), point(to, edge.toSide, edge.toAt ?? 0.5)];
  }

  const horizontal = from.x + from.w <= to.x || to.x + to.w <= from.x;
  const [start, size, side] = horizontal ? ['y', 'h', 'x'] : ['x', 'w', 'y'];
  const span = horizontal ? 'w' : 'h';
  const forward = from[side] + from[span] / 2 <= to[side] + to[span] / 2;
  const within = (value, box) => value >= box[start] && value <= box[start] + box[size];
  const centre = (box) => box[start] + box[size] / 2;

  let a = edge.fromAt == null ? null : from[start] + from[size] * edge.fromAt;
  let b = edge.toAt == null ? null : to[start] + to[size] * edge.toAt;

  if (a == null && b == null) {
    if (within(centre(from), to)) a = b = centre(from);
    else if (within(centre(to), from)) a = b = centre(to);
    else [a, b] = [centre(from), centre(to)];
  } else if (a == null) {
    a = within(b, from) ? b : centre(from);
  } else if (b == null) {
    b = within(a, to) ? a : centre(to);
  }

  const fromEdge = from[side] + (forward ? from[span] : 0);
  const toEdge = to[side] + (forward ? 0 : to[span]);

  return horizontal ? [[fromEdge, a], [toEdge, b]] : [[a, fromEdge], [b, toEdge]];
}

function point(box, side, at) {
  if (side === 'left') return [box.x, box.y + box.h * at];
  if (side === 'right') return [box.x + box.w, box.y + box.h * at];
  if (side === 'top') return [box.x + box.w * at, box.y];
  return [box.x + box.w * at, box.y + box.h];
}

function scene(diagram, lang) {
  const byId = new Map(diagram.nodes.map((node) => [node.id, node]));

  const nodes = diagram.nodes.map((node) => ({
    ...BASE,
    type: 'rectangle',
    id: node.id,
    x: node.x,
    y: node.y,
    width: node.w,
    height: node.h,
    ...(node.frame ? { strokeStyle: 'dashed', strokeWidth: 1 } : {}),
    ...(node.dashed ? { strokeStyle: 'dashed' } : {}),
    ...(node.text ? { label: { text: pick(node.text, lang), fontSize: FONT_SIZE, textAlign: 'center', verticalAlign: 'middle' } } : {}),
  }));

  const texts = (diagram.texts ?? []).map((text) => ({
    type: 'text',
    id: text.id,
    x: text.x,
    y: text.y,
    text: pick(text.text, lang),
    fontSize: FONT_SIZE,
    strokeColor: BASE.strokeColor,
  }));

  const edges = diagram.edges.map((edge, index) => {
    const [[x1, y1], [x2, y2]] = anchors(byId.get(edge.from), byId.get(edge.to), edge);
    const corners = (edge.via ?? []).map(([x, y]) => [x - x1, y - y1]);
    const points = [[0, 0], ...corners, [x2 - x1, y2 - y1]];
    const label = pick(edge.label, lang);

    return {
      ...BASE,
      type: 'arrow',
      id: `edge-${index}-${edge.from}-${edge.to}`,
      x: x1,
      y: y1,
      width: Math.max(...points.map(([x]) => x)) - Math.min(...points.map(([x]) => x)),
      height: Math.max(...points.map(([, y]) => y)) - Math.min(...points.map(([, y]) => y)),
      points,
      start: { id: edge.from },
      end: { id: edge.to },
      endArrowhead: 'arrow',
      ...(edge.dashed ? { strokeStyle: 'dashed' } : {}),
      ...(label ? { label: { text: label, fontSize: FONT_SIZE } } : {}),
    };
  });

  return [...nodes, ...texts, ...edges];
}

async function renderInPage(page, skeleton) {
  return page.evaluate(async ({ skeleton, EXC, ASSETS }) => {
    window.EXCALIDRAW_ASSET_PATH = ASSETS;
    const mod = await import(EXC);
    const exc = mod.convertToExcalidrawElements ? mod : mod.default;
    const appState = { exportBackground: false, viewBackgroundColor: 'transparent' };

    // Text is measured when the scene is converted, so the fonts have to be loaded first, or the masks
    // behind arrow labels come out too narrow and the line runs through the label. The first export
    // carries the fonts this text needs; the second pass measures with them.
    const draft = await exc.exportToSvg({
      elements: exc.convertToExcalidrawElements(skeleton, { regenerateIds: false }),
      appState,
      files: null,
    });
    const style = document.createElement('style');
    style.textContent = draft.querySelector('style.style-fonts')?.textContent ?? '';
    document.head.appendChild(style);
    await Promise.all([...document.fonts].map((font) => font.load().catch(() => null)));

    // Fixed seeds keep the hand-drawn wobble the same in every language and every build.
    const elements = exc.convertToExcalidrawElements(skeleton, { regenerateIds: false }).map((element, index) => ({
      ...element,
      seed: 1 + ((index + 1) * 2654435761) % 2147483646,
      versionNonce: 1 + ((index + 1) * 40503) % 2147483646,
      updated: 1,
    }));

    const svg = async (dark) => {
      const node = await exc.exportToSvg({
        elements,
        appState: { ...appState, exportWithDarkMode: dark },
        files: null,
        exportPadding: 16,
      });
      node.removeAttribute('width');
      node.removeAttribute('height');
      return node.outerHTML;
    };

    return { light: await svg(false), dark: await svg(true), elements: JSON.stringify(elements) };
  }, { skeleton, EXC, ASSETS });
}

/**
 * Writes `<key>_<lang>_<theme>.svg` to `images` and `<key>.<lang>.excalidraw` to `sources`, for each
 * language of `langs`. With `neutral`, the file names leave the language out.
 */
export async function renderDiagrams(diagrams, { images, sources, source, langs = ['en', 'zh-Hans'], neutral = false }) {
  const require = createRequire(import.meta.url);
  const { chromium } = require(findPlaywright());
  const browser = await chromium.launch();
  const context = await browser.newContext();

  mkdirSync(images, { recursive: true });
  mkdirSync(sources, { recursive: true });

  for (const [key, diagram] of Object.entries(diagrams)) {
    for (const lang of langs) {
      // A page of its own: the fonts of one diagram must not measure the text of the next.
      const page = await context.newPage();
      page.on('pageerror', (error) => console.error('[pageerror]', String(error).slice(0, 300)));
      await page.setContent('<!doctype html><html><body></body></html>');

      const { light, dark, elements } = await renderInPage(page, scene(diagram, lang));
      const stem = neutral ? key : `${key}_${lang}`;
      writeFileSync(resolve(images, `${stem}_light.svg`), light, 'utf8');
      writeFileSync(resolve(images, `${stem}_dark.svg`), dark, 'utf8');
      writeFileSync(
        resolve(sources, neutral ? `${key}.excalidraw` : `${key}.${lang}.excalidraw`),
        JSON.stringify({ type: 'excalidraw', version: 2, source, elements: JSON.parse(elements), appState: { viewBackgroundColor: '#ffffff' }, files: {} }, null, 2),
        'utf8',
      );
      console.log(`${stem}: ${Math.round(light.length / 1024)} KiB`);
      await page.close();
    }
  }

  await browser.close();
}
