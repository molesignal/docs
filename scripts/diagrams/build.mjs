// Build Excalidraw architecture diagrams for the docs.
//
// Pipeline: mermaid flowchart  →  @excalidraw/mermaid-to-excalidraw (skeleton)
//           →  convertToExcalidrawElements  →  exportToSvg  →  rsvg-convert PNG
//           (light + dark).
//
// Why a build step: Mintlify cannot embed live Excalidraw, so each diagram is
// rendered to a static PNG that we commit and <img> into the .mdx. We emit PNG
// rather than SVG because Mintlify's image pipeline rejects these complex
// excalidraw SVGs (mask/filter) and never uploads them to its CDN (403). The
// mermaid string is the maintainable source of truth; the .excalidraw scene is
// written alongside so the diagram can still be hand-edited on excalidraw.com.
//
// Excalidraw's exporters need a real DOM, so we drive them inside a headless
// Chromium via Playwright and load the libraries from esm.sh.
//
// Usage:  node scripts/diagrams/build.mjs [key ...]      (default: all keys)
// Requires Playwright on disk and `rsvg-convert` (librsvg) on PATH — both
// dev-only, not used by mint at serve time.

import { writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_ROOT = resolve(__dirname, '..', '..');
// Serve diagrams from `public/` (static passthrough at the site root, referenced
// as `/diagrams/...`). Mintlify's `images/` asset pipeline did not upload these
// files to its CDN (they 403'd), so we bypass it via public/.
const IMG_DIR = resolve(DOCS_ROOT, 'public', 'diagrams');
const SRC_DIR = resolve(DOCS_ROOT, 'diagrams');

// Resolve Playwright from wherever it is installed (npx cache or global).
// It is a CommonJS package, so require() it rather than ESM dir-import.
const PW_PATH = '/Users/gagral/.npm/_npx/e41f203b7505f1fb/node_modules/playwright';
const require = createRequire(import.meta.url);
const { chromium } = require(PW_PATH);

const EXC = 'https://esm.sh/@excalidraw/excalidraw@0.17.6';
const M2E = 'https://esm.sh/@excalidraw/mermaid-to-excalidraw@1.1.0';

// --- Diagram sources: one mermaid flowchart per (key, language) -------------
const DIAGRAMS = {
  ingest: {
    title: { en: 'Ingest path', 'zh-Hans': '写入路径' },
    mermaid: {
      en: `flowchart TD
  client["Client<br/>:5080 / :5082"]
  router["Router<br/>stateless · rate limit"]
  ingester["Ingester<br/>stateful"]
  wal[("WAL on disk")]
  buf["in-memory buffer<br/>by seq"]
  flush["background flush loop"]
  store[("object store<br/>local / s3 / azure / gcs")]
  meta[("Postgres: FileMeta<br/>time_range · rows · min/max")]
  client -->|"HTTP / gRPC"| router
  router -->|"consistent hashing"| ingester
  router -. "429 + Retry-After" .-> client
  ingester -->|"1 · write WAL (fsync)"| wal
  ingester -->|"2 · buffer"| buf
  buf -->|"flush_interval / threshold"| flush
  flush -->|"snapshot: columnar + sidecar"| store
  flush --> meta
  flush -. "seal + truncate WAL" .-> wal`,
      'zh-Hans': `flowchart TD
  client["客户端<br/>:5080 / :5082"]
  router["Router<br/>无状态 · 限流"]
  ingester["Ingester<br/>有状态"]
  wal[("WAL 落盘")]
  buf["内存缓冲<br/>按 seq"]
  flush["后台 flush 循环"]
  store[("对象存储<br/>local / s3 / azure / gcs")]
  meta[("Postgres：FileMeta<br/>time_range · rows · min/max")]
  client -->|"HTTP / gRPC"| router
  router -->|"一致性哈希"| ingester
  router -. "429 + Retry-After" .-> client
  ingester -->|"1 · 写 WAL (fsync)"| wal
  ingester -->|"2 · 缓冲"| buf
  buf -->|"flush_interval / 阈值"| flush
  flush -->|"snapshot：列式 + 侧车"| store
  flush --> meta
  flush -. "seal + 截断 WAL" .-> wal`,
    },
  },

  query: {
    title: { en: 'Query path', 'zh-Hans': '查询路径' },
    mermaid: {
      en: `flowchart TD
  client["Client"]
  qs["QueryService"]
  sync["synchronous<br/>execution"]
  async["async<br/>search_jobs row<br/>202 + job_id"]
  engine["engine composition<br/>local → distributed → federated"]
  prune["FileMeta pruning<br/>+ full-text MATCH"]
  shard["sharding<br/>hash by object_key % peers"]
  p1["Querier peer"]
  p2["Querier peer"]
  p3["Querier peer"]
  coord["coordinator<br/>UNION ALL → in-memory table"]
  result["QueryResult<br/>columns · rows · took_ms"]
  client -->|"POST /api/v1/query"| qs
  qs -->|"Prefer: respond-sync"| sync
  qs -. "async / over threshold" .-> async
  sync --> engine
  engine --> prune
  prune --> shard
  shard -->|"scan RPC :5082"| p1
  shard --> p2
  shard --> p3
  p1 --> coord
  p2 --> coord
  p3 --> coord
  coord -->|"execute full SQL"| result`,
      'zh-Hans': `flowchart TD
  client["客户端"]
  qs["QueryService"]
  sync["同步执行"]
  async["异步<br/>建 search_jobs 行<br/>202 + job_id"]
  engine["引擎组合<br/>本地 → 分布式 → 联邦"]
  prune["FileMeta 分区裁剪<br/>+ 全文 MATCH"]
  shard["分片<br/>按 object_key 哈希 % peers"]
  p1["Querier 对等"]
  p2["Querier 对等"]
  p3["Querier 对等"]
  coord["协调端<br/>UNION ALL → 内存表"]
  result["QueryResult<br/>columns · rows · took_ms"]
  client -->|"POST /api/v1/query"| qs
  qs -->|"Prefer: respond-sync"| sync
  qs -. "异步 / 超阈值" .-> async
  sync --> engine
  engine --> prune
  prune --> shard
  shard -->|"扫描 RPC :5082"| p1
  shard --> p2
  shard --> p3
  p1 --> coord
  p2 --> coord
  p3 --> coord
  coord -->|"执行完整 SQL"| result`,
    },
  },

  async: {
    title: { en: 'Async search job pipeline', 'zh-Hans': '异步搜索作业管线' },
    mermaid: {
      en: `flowchart TD
  post["POST /query<br/>respond-async / over threshold"]
  row["write search_jobs<br/>Pending · expires_at = now+7d"]
  ret["return 202<br/>job_id + monitoring URL"]
  pool["worker pool<br/>default 2"]
  run["QueryService run()"]
  obj[("object store<br/>org/search_jobs/job_id.ndjson")]
  mark["mark_done rows<br/>/ mark_failed error"]
  cleanup["cleanup loop<br/>every cleanup_interval_secs"]
  client["Client"]
  post --> row
  row --> ret
  ret --> pool
  pool -->|"claim_next_pending<br/>FOR UPDATE SKIP LOCKED"| run
  run -->|"NDJSON upload"| obj
  run --> mark
  cleanup -. "delete expired (DB + store)" .-> obj
  client -. "poll job_id · download when Done" .-> ret`,
      'zh-Hans': `flowchart TD
  post["POST /query<br/>respond-async / 超阈值"]
  row["写 search_jobs<br/>Pending · expires_at = now+7d"]
  ret["返回 202<br/>job_id + 监控 URL"]
  pool["worker 池<br/>默认 2"]
  run["QueryService run()"]
  obj[("对象存储<br/>org/search_jobs/job_id.ndjson")]
  mark["mark_done rows<br/>/ mark_failed error"]
  cleanup["清理循环<br/>每 cleanup_interval_secs"]
  client["客户端"]
  post --> row
  row --> ret
  ret --> pool
  pool -->|"claim_next_pending<br/>FOR UPDATE SKIP LOCKED"| run
  run -->|"NDJSON 上传"| obj
  run --> mark
  cleanup -. "删除过期（库 + 存储）" .-> obj
  client -. "轮询 job_id · Done 后下载" .-> ret`,
    },
  },

  federated: {
    title: { en: 'Federated / multi-cluster query', 'zh-Hans': '联邦 / 多集群查询' },
    mermaid: {
      en: `flowchart TD
  post["POST /query?clusters=local,sf,nyc"]
  local["local scan<br/>single-threaded"]
  r1["remote: sf"]
  r2["remote: nyc"]
  merge["merge successful batches"]
  degraded["degraded_clusters<br/>graceful degradation"]
  sql["execute full user SQL"]
  resp["return federation<br/>scanned · degraded · reason"]
  post -->|"license: federated_search<br/>else 403"| local
  local -->|"fan-out"| r1
  local --> r2
  r1 --> merge
  r2 --> merge
  r1 -. "auth / unreachable" .-> degraded
  r2 -. "fail" .-> degraded
  merge --> sql
  sql --> resp`,
      'zh-Hans': `flowchart TD
  post["POST /query?clusters=local,sf,nyc"]
  local["本地扫描<br/>单线程"]
  r1["远程：sf"]
  r2["远程：nyc"]
  merge["合并成功批次"]
  degraded["degraded_clusters<br/>优雅降级"]
  sql["执行完整用户 SQL"]
  resp["返回 federation<br/>scanned · degraded · reason"]
  post -->|"license：federated_search<br/>否则 403"| local
  local -->|"fan-out"| r1
  local --> r2
  r1 --> merge
  r2 --> merge
  r1 -. "鉴权 / 不可达" .-> degraded
  r2 -. "失败" .-> degraded
  merge --> sql
  sql --> resp`,
    },
  },

  pipeline: {
    title: { en: 'Scheduled pipeline', 'zh-Hans': '调度流水线' },
    mermaid: {
      en: `flowchart TD
  trigger["cron tick / backfill<br/>over [from, to]"]
  src[("source stream")]
  read["read window<br/>SELECT * over range"]
  steps["VRL transform chain<br/>function_steps · in order"]
  ext[("extend tables<br/>join lookups")]
  target[("target stream<br/>standard ingest")]
  egress["connectors<br/>S3 / Kafka egress"]
  trigger --> read
  src --> read
  read --> steps
  ext -. "lookup" .-> steps
  steps -->|"write"| target
  steps -. "optional" .-> egress`,
      'zh-Hans': `flowchart TD
  trigger["cron tick / 回填<br/>窗口 [from, to]"]
  src[("源数据流")]
  read["读窗口<br/>SELECT * over range"]
  steps["VRL 转换链<br/>function_steps · 按序"]
  ext[("扩展表<br/>join 查找")]
  target[("目标数据流<br/>标准 ingest")]
  egress["connector<br/>S3 / Kafka egress"]
  trigger --> read
  src --> read
  read --> steps
  ext -. "查找" .-> steps
  steps -->|"写入"| target
  steps -. "可选" .-> egress`,
    },
  },
};

// --- Render one mermaid string to an SVG string, in light or dark -----------
async function renderInPage(page, mermaid, dark) {
  return page.evaluate(async ({ mermaid, dark, EXC, M2E }) => {
    const exc = (await import(EXC)).default;
    const m2e = await import(M2E);
    const parsed = await m2e.parseMermaidToExcalidraw(mermaid, { themeVariables: { fontSize: '16px' } });
    // mermaid-to-excalidraw keeps <br> as literal text; turn it into real line
    // breaks and grow node boxes so the extra lines don't overflow vertically.
    for (const el of parsed.elements) {
      if (el.label && typeof el.label.text === 'string') el.label.text = el.label.text.replace(/<br\s*\/?>/gi, '\n');
      if (typeof el.text === 'string') el.text = el.text.replace(/<br\s*\/?>/gi, '\n');
      if (el.type === 'rectangle' && el.label && el.label.text.includes('\n')) {
        const lines = el.label.text.split('\n').length;
        const need = lines * 26 + 18;
        if (el.height < need) el.height = need;
      }
    }
    const elements = exc.convertToExcalidrawElements(parsed.elements);
    const svg = await exc.exportToSvg({
      elements,
      appState: { exportBackground: false, exportWithDarkMode: dark, viewBackgroundColor: 'transparent' },
      files: parsed.files || null,
      exportPadding: 16,
    });
    // strip the width/height so the SVG scales fluidly to its container
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    return { svg: svg.outerHTML, elements: JSON.stringify(elements) };
  }, { mermaid, dark, EXC, M2E });
}

const keys = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(DIAGRAMS);
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
page.on('pageerror', (e) => console.error('[pageerror]', String(e).slice(0, 300)));
await page.setContent('<!doctype html><html><body></body></html>');

for (const key of keys) {
  const d = DIAGRAMS[key];
  if (!d) { console.error(`unknown diagram: ${key}`); continue; }
  for (const lang of ['en', 'zh-Hans']) {
    for (const theme of ['light', 'dark']) {
      const { svg } = await renderInPage(page, d.mermaid[lang], theme === 'dark');
      // Drop the excalidraw @font-face block (it points at unpkg with an
      // unresolved `@excalidraw/excalidraw@undefined` version); text falls back
      // to "Virgil, Segoe UI Emoji" -> system fonts.
      const cleaned = svg.replace(/\s*<style class="style-fonts">[\s\S]*?<\/style>/g, '');
      // Serve PNG, not SVG: Mintlify's image pipeline rejects these complex
      // excalidraw SVGs (mask/filter) and never uploads them to its CDN (403).
      // Render the SVG to a 2x transparent PNG via librsvg, which honours the
      // dark-mode invert filter. Requires `rsvg-convert` on PATH (dev-only).
      // Single dot before the extension: Mintlify's asset pipeline does not
      // upload multi-dot filenames like `pipeline.en.dark.png` (they 403 on its
      // CDN), so separate the name/lang/theme segments with underscores.
      const out = resolve(IMG_DIR, `${key}_${lang}_${theme}.png`);
      const tmp = resolve(IMG_DIR, `.${key}_${lang}_${theme}.svg.tmp`);
      writeFileSync(tmp, cleaned, 'utf8');
      try {
        execFileSync('rsvg-convert', ['-z', '2', tmp, '-o', out]);
      } finally {
        unlinkSync(tmp);
      }
      console.log(`wrote ${out.replace(DOCS_ROOT + '/', '')}`);
    }
    // editable scene source (theme-neutral, light export elements)
    const { elements } = await renderInPage(page, d.mermaid[lang], false);
    const scene = { type: 'excalidraw', version: 2, source: 'molesignal-docs', elements: JSON.parse(elements), appState: { viewBackgroundColor: 'transparent' }, files: {} };
    const src = resolve(SRC_DIR, `${key}.${lang}.excalidraw`);
    writeFileSync(src, JSON.stringify(scene, null, 2), 'utf8');
    console.log(`wrote ${src.replace(DOCS_ROOT + '/', '')}`);
  }
}

await browser.close();
console.log('done.');
