// Builds the architecture diagrams of the docs, in both languages, light and dark.
//
// Mintlify cannot embed live Excalidraw, so each diagram is committed as static SVGs that the .mdx
// pages <img>, with light and dark variants through `className="block dark:hidden"` and
// `"hidden dark:block"`. The definitions below are the source of truth. The .excalidraw scene written
// next to them opens on excalidraw.com for a look, but a change made there is lost at the next build.
//
// The rendered images must not live under any directory named `diagrams`: .mintignore ignores that
// name, which once excluded them from the deploy and made every diagram 403 on the CDN.
//
// Keep a diagram at most about 900 wide: the page column is 609 pixels on a 1440 screen, so the
// 16 pixel text of a wider diagram becomes too small to read without opening it.
//
// Usage: node scripts/diagrams/build.mjs [key ...]      (default: all keys)
// Needs Playwright on disk: the product's web app has it, or set PLAYWRIGHT_PATH.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderDiagrams } from './render.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const t = (en, zh) => ({ en, 'zh-Hans': zh });

const overview = {
  nodes: [
    { id: 'frame', x: 205, y: -50, w: 430, h: 470, frame: true },
    { id: 'telemetry', x: 0, y: 40, w: 175, h: 92, text: t('Telemetry senders\nOTLP · Prometheus\nLoki · ES Bulk', '遥测发送端\nOTLP · Prometheus\nLoki · ES Bulk') },
    { id: 'rum', x: 0, y: 152, w: 175, h: 72, text: t('Browsers, mobile\nRUM SDKs', '浏览器与移动端\nRUM SDK') },
    { id: 'monitors', x: 0, y: 244, w: 175, h: 72, text: t('Existing monitors\nAlert webhooks', '现有监控\n告警 Webhook') },
    { id: 'clients', x: 0, y: 336, w: 175, h: 64, text: t('Web · API\nMCP · CLI', '网页 · API\nMCP · CLI') },
    { id: 'router', x: 220, y: 40, w: 115, h: 360, text: t('Router\n\nHTTP API\nWeb UI\nOTLP gRPC\nMole Agent', 'Router\n\nHTTP API\n网页界面\nOTLP gRPC\nMole Agent') },
    { id: 'intake', x: 435, y: 40, w: 185, h: 72, text: t('Intake\nValidate · Mask\nPipelines · WAL', 'Intake\n校验 · 脱敏\n流水线 · WAL') },
    { id: 'querier', x: 435, y: 136, w: 185, h: 72, text: t('Querier\nSQL · PromQL\nSearch jobs', 'Querier\nSQL · PromQL\n搜索任务') },
    { id: 'compactor', x: 435, y: 232, w: 185, h: 72, text: t('Compactor\nMerge · Downsample\nRetention', 'Compactor\n合并 · 降采样\n保留 · 清理') },
    { id: 'alert', x: 435, y: 328, w: 185, h: 72, text: t('Alert\nRules · Escalation\nNotifications', 'Alert\n规则 · 值班升级\n通知') },
    { id: 'store', x: 705, y: 40, w: 190, h: 264, text: t('Object storage\n\nParquet\nTantivy indexes\n\nLocal disk · S3\nAzure Blob · GCS', '对象存储\n\nParquet\nTantivy 索引\n\n本地磁盘 · S3\nAzure Blob · GCS') },
    { id: 'notify', x: 705, y: 328, w: 190, h: 72, text: t('Notifications\nPhone · SMS\nIM · Email', '通知渠道\n电话 · 短信\nIM · 邮件') },
    { id: 'model', x: 170, y: 500, w: 215, h: 92, text: t('Model services\nOpenAI · Anthropic\nOpenAI-compatible APIs', '模型服务\nOpenAI · Anthropic\nOpenAI 兼容接口') },
    { id: 'probe', x: 395, y: 500, w: 180, h: 92, text: t('Probe Agent\nRuns synthetic\nchecks', 'Probe Agent\n执行拨测') },
    { id: 'postgres', x: 590, y: 500, w: 200, h: 72, text: t('PostgreSQL\nMetadata\nFile catalog', 'PostgreSQL\n元数据 · 文件目录') },
  ],
  texts: [{ id: 'title', x: 220, y: -38, text: t('MoleSignal: a single binary,\nrun as one process or split by role', 'MoleSignal：单个二进制，\n可同进程运行，也可按角色拆分') }],
  edges: [
    { from: 'telemetry', to: 'router' },
    { from: 'rum', to: 'router' },
    { from: 'monitors', to: 'router' },
    { from: 'clients', to: 'router' },
    { from: 'router', to: 'intake', label: t('writes', '写入') },
    { from: 'router', to: 'querier', label: t('queries', '查询') },
    { from: 'router', to: 'alert', label: t('alerts', '外部告警') },
    { from: 'intake', to: 'store', label: t('flush', '刷写') },
    { from: 'querier', to: 'store', label: t('scan', '扫描') },
    { from: 'compactor', to: 'store', label: t('merge', '合并') },
    { from: 'alert', to: 'notify' },
    { from: 'probe', to: 'alert', label: t('register · control', '注册 · 控制') },
    { from: 'router', to: 'model' },
    { from: 'frame', to: 'postgres', fromSide: 'bottom', toSide: 'top', fromAt: 0.97, toAt: 0.16 },
  ],
};

const dataPath = (() => {
  const column = (x, step, items) => items.map(([id, text], index) => ({ id, x, y: 52 + index * step, w: 330, h: 48, text }));
  const write = column(35, 74, [
    ['sender', t('Sender', '发送端')],
    ['receiver', t('Protocol receiver', '协议接收端')],
    ['auth', t('Authentication + IAM', '身份验证 + IAM')],
    ['transform', t('Schema · Masking · Pipeline', 'schema · 脱敏 · 流水线')],
    ['wal', t('WAL + Arrow buffer', 'WAL + Arrow 缓冲')],
    ['parquet', t('Parquet + Search index', 'Parquet + 检索索引')],
    ['stored', t('Object storage\nCatalog row in PostgreSQL', '对象存储\nPostgreSQL 中的目录行')],
  ]);
  const read = column(475, 88.8, [
    ['query', t('Query', '查询')],
    ['planner', t('Planner + Organization rewrite', '规划器 + 组织改写')],
    ['pruning', t('Catalog and index pruning', '目录与索引裁剪')],
    ['engine', t('DataFusion · PromQL', 'DataFusion · PromQL')],
    ['scan', t('Local or federated scan', '本地或联邦扫描')],
    ['result', t('Rows · NDJSON · Async search job', '结果行 · NDJSON · 异步搜索任务')],
  ]);
  const chain = (nodes) => nodes.slice(1).map((node, index) => ({ from: nodes[index].id, to: node.id }));

  return {
    nodes: [
      { id: 'write-frame', x: 0, y: 0, w: 400, h: 564, frame: true },
      { id: 'read-frame', x: 440, y: 0, w: 400, h: 564, frame: true },
      ...write,
      ...read,
    ],
    texts: [
      { id: 'write-title', x: 35, y: 14, text: t('Write path', '写入路径') },
      { id: 'read-title', x: 475, y: 14, text: t('Read path', '读取路径') },
    ],
    edges: [...chain(write), ...chain(read)],
  };
})();

const intake = {
  nodes: [
    { id: 'client', x: 0, y: 40, w: 170, h: 68, text: t('Client\nHTTP · OTLP gRPC', '客户端\nHTTP · OTLP gRPC') },
    { id: 'router', x: 250, y: 28, w: 200, h: 92, text: t('Router\nAuthenticate · Decode\nRate limit', 'Router\n认证 · 解码\n限流') },
    { id: 'intake', x: 640, y: 28, w: 215, h: 92, text: t('Intake node\nPipelines · Masking\nSchema evolution', 'Intake 节点\n流水线 · 脱敏\nschema 演化') },
    { id: 'wal', x: 250, y: 210, w: 200, h: 68, text: t('WAL\nOn local disk', 'WAL\n本地磁盘') },
    { id: 'buffer', x: 640, y: 216, w: 215, h: 56, text: t('In-memory buffer', '内存缓冲') },
    { id: 'flush', x: 640, y: 350, w: 215, h: 76, text: t('Background flush\nParquet · Search index', '后台刷写\nParquet · 检索索引') },
    { id: 'store', x: 400, y: 500, w: 205, h: 68, text: t('Object storage\nData and index files', '对象存储\n数据与索引文件') },
    { id: 'postgres', x: 680, y: 500, w: 205, h: 68, text: t('PostgreSQL\nFile catalog', 'PostgreSQL\n文件目录') },
  ],
  edges: [
    { from: 'client', to: 'router' },
    { from: 'router', to: 'intake', label: t('rendezvous hash\nof org and stream', '按组织和数据流\nrendezvous 哈希') },
    { from: 'intake', to: 'wal', fromSide: 'bottom', toSide: 'top', fromAt: 0.15, toAt: 0.8, label: t('append first', '先追加') },
    { from: 'intake', to: 'buffer', label: t('then buffer', '再缓冲') },
    { from: 'buffer', to: 'flush', label: t('interval or size', '到时间或大小') },
    { from: 'flush', to: 'store', fromSide: 'bottom', toSide: 'top', fromAt: 0.2, toAt: 0.7, label: t('1 · upload', '1 · 上传') },
    { from: 'flush', to: 'postgres', label: t('2 · record', '2 · 登记') },
    { from: 'flush', to: 'wal', fromSide: 'left', toSide: 'bottom', dashed: true, label: t('3 · truncate', '3 · 截断') },
    { from: 'client', to: 'intake', dashed: true, fromSide: 'top', toSide: 'top', via: [[85, -40], [747.5, -40]], label: t('OTLP gRPC sent directly', 'OTLP gRPC 直连') },
  ],
};

const query = {
  nodes: [
    { id: 'client', x: 0, y: 50, w: 120, h: 92, text: t('Client', '客户端') },
    { id: 'router', x: 260, y: 50, w: 240, h: 92, text: t('Router\nAuthorization · Admission\nResult cache', 'Router\n授权 · 准入\n结果缓存') },
    { id: 'querier', x: 650, y: 50, w: 220, h: 92, text: t('Querier node\nChosen in turn\nRuns the complete query', 'Querier 节点\n轮流选出\n完整执行查询') },
    { id: 'jobs', x: 0, y: 240, w: 170, h: 48, dashed: true, text: t('Async search job', '异步搜索任务') },
    { id: 'remote', x: 190, y: 240, w: 160, h: 48, dashed: true, text: t('Remote clusters', '远端集群') },
    { id: 'others', x: 370, y: 240, w: 170, h: 92, dashed: true, text: t('Other queriers\nTried when\nunreachable', '其余 querier\n选中的不可达时\n尝试') },
    { id: 'postgres', x: 565, y: 240, w: 150, h: 68, text: t('PostgreSQL\nFile catalog', 'PostgreSQL\n文件目录') },
    { id: 'store', x: 735, y: 240, w: 170, h: 68, text: t('Object storage\nParquet · Indexes', '对象存储\nParquet · 索引') },
  ],
  edges: [
    { from: 'client', to: 'router', fromAt: 0.3, toAt: 0.3, label: t('SQL or PromQL', 'SQL 或 PromQL') },
    { from: 'router', to: 'client', fromAt: 0.7, toAt: 0.7, label: t('result', '结果') },
    { from: 'router', to: 'querier', fromAt: 0.3, toAt: 0.3, label: t('internal gRPC', '内部 gRPC') },
    { from: 'querier', to: 'router', fromAt: 0.7, toAt: 0.7, label: t('result', '结果') },
    { from: 'querier', to: 'postgres', fromSide: 'bottom', toSide: 'top', fromAt: 0.2, toAt: 0.6, label: t('find files', '查找文件') },
    { from: 'querier', to: 'store', fromSide: 'bottom', toSide: 'top', fromAt: 0.7, toAt: 0.4, label: t('read files', '读取文件') },
    { from: 'router', to: 'jobs', dashed: true, fromSide: 'bottom', toSide: 'top', fromAt: 0.1, toAt: 0.7, label: t('too large', '规模超限') },
    { from: 'router', to: 'remote', dashed: true, fromSide: 'bottom', toSide: 'top', fromAt: 0.25, toAt: 0.6, label: t('merge', '合并结果') },
    { from: 'router', to: 'others', dashed: true, fromSide: 'bottom', toSide: 'top', fromAt: 0.75, toAt: 0.5 },
  ],
};

const asyncJobs = {
  nodes: [
    { id: 'client', x: 0, y: 20, w: 130, h: 120, text: t('Client', '客户端') },
    { id: 'router', x: 300, y: 20, w: 240, h: 120, text: t('Router\nPrefer: respond-async, or\nestimate over the threshold', 'Router\nPrefer: respond-async\n或估算规模超过阈值') },
    { id: 'postgres', x: 680, y: 46, w: 225, h: 68, text: t('PostgreSQL\nSearch job', 'PostgreSQL\n搜索任务') },
    { id: 'workers', x: 680, y: 240, w: 225, h: 68, text: t('Workers on querier nodes\n[search_jobs].workers', 'querier 节点上的 worker\n[search_jobs].workers') },
    { id: 'store', x: 300, y: 240, w: 240, h: 68, text: t('Object storage\nResults of search jobs', '对象存储\n搜索任务的结果') },
    { id: 'cleanup', x: 0, y: 240, w: 180, h: 68, text: t('Cleanup\nDeletes expired jobs', '清理\n删除过期任务') },
  ],
  edges: [
    { from: 'client', to: 'router', fromAt: 0.2, toAt: 0.2, label: t('query', '查询') },
    { from: 'router', to: 'client', fromAt: 0.5, toAt: 0.5, label: t('202 + job ID', '202 + 任务 ID') },
    { from: 'client', to: 'router', fromAt: 0.8, toAt: 0.8, dashed: true, label: t('poll · results', '轮询 · 取结果') },
    { from: 'router', to: 'postgres', label: t('store', '存入') },
    { from: 'workers', to: 'postgres', label: t('claim, never twice', '领取，不重复执行') },
    { from: 'workers', to: 'store', label: t('write results', '写入结果') },
    { from: 'store', to: 'router', label: t('read results', '读取结果') },
    { from: 'cleanup', to: 'store', dashed: true },
  ],
};

const federated = {
  nodes: [
    { id: 'client', x: 0, y: 106, w: 200, h: 76, text: t('Client\n?clusters=local,sf,nyc', '客户端\n?clusters=local,sf,nyc') },
    { id: 'node', x: 240, y: 104, w: 170, h: 80, text: t('Receiving node\nScans its own part', '接收请求的节点\n扫描自己的部分') },
    { id: 'sf', x: 480, y: 20, w: 215, h: 68, text: t('Remote cluster: sf\nScan with bearer token', '远端集群：sf\n携带 Bearer Token 扫描') },
    { id: 'nyc', x: 480, y: 200, w: 215, h: 68, text: t('Remote cluster: nyc\nScan with bearer token', '远端集群：nyc\n携带 Bearer Token 扫描') },
    { id: 'merge', x: 745, y: 104, w: 160, h: 80, text: t('Merge batches\nRun the full SQL', '合并各批数据\n执行完整 SQL') },
    { id: 'degraded', x: 400, y: 340, w: 210, h: 68, text: t('Degraded cluster\nReported, not hidden', '降级的集群\n如实标记') },
    { id: 'response', x: 650, y: 320, w: 260, h: 108, text: t('Response\nRows + federation metadata\nscanned · degraded · reason', '响应\n结果行 + 联邦元数据\nscanned · degraded · reason') },
  ],
  edges: [
    { from: 'client', to: 'node' },
    { from: 'node', to: 'sf', fromAt: 0.25 },
    { from: 'node', to: 'nyc', fromAt: 0.75 },
    { from: 'node', to: 'merge', label: t('own batches', '本地数据') },
    { from: 'sf', to: 'merge', toAt: 0.25 },
    { from: 'nyc', to: 'merge', toAt: 0.75 },
    { from: 'nyc', to: 'degraded', dashed: true, label: t('unreachable', '不可达') },
    { from: 'degraded', to: 'response', dashed: true },
    { from: 'merge', to: 'response' },
  ],
};

const pipeline = {
  nodes: [
    { id: 'runner', x: 0, y: 0, w: 270, h: 68, text: t('Runner on the alert role\nChecks every 15 seconds', 'alert 角色上的运行器\n每 15 秒检查一次') },
    { id: 'backfill', x: 295, y: 0, w: 270, h: 68, text: t('Backfill\nSubmitted on demand', '回填\n按需提交') },
    { id: 'sources', x: 590, y: 0, w: 270, h: 68, text: t('Source streams\nUp to 8', '来源数据流\n最多 8 个') },
    { id: 'read', x: 120, y: 130, w: 620, h: 92, text: t('Read the sources\nOn schedule: read position to now, minus the wait for late events\nBackfill: the chosen time range', '读取来源\n定时：从读取位置到当前时间，减去迟到事件的等待时间\n回填：指定的时间范围') },
    { id: 'steps', x: 170, y: 280, w: 330, h: 68, text: t('Steps in order\nVRL · Routing', '按顺序执行步骤\nVRL · 路由') },
    { id: 'lookup', x: 650, y: 290, w: 210, h: 48, text: t('Extend tables', '扩展表') },
    { id: 'targets', x: 0, y: 410, w: 205, h: 68, text: t('Target streams\nUp to 8, via intake', '目标数据流\n最多 8 个，走标准接入') },
    { id: 'connectors', x: 218, y: 410, w: 205, h: 68, text: t('Connectors\nS3 · Kafka · HTTP', '连接器\nS3 · Kafka · HTTP') },
    { id: 'tables', x: 436, y: 410, w: 205, h: 68, text: t('Extend tables\nOne row for each event', '扩展表\n每个事件一行') },
    { id: 'dead', x: 654, y: 410, w: 205, h: 68, dashed: true, text: t('Dead letter stream\nEvents that failed', '死信数据流\n失败的事件') },
  ],
  edges: [
    { from: 'runner', to: 'read', fromSide: 'bottom', toSide: 'top', toAt: 0.2 },
    { from: 'backfill', to: 'read' },
    { from: 'sources', to: 'read', fromSide: 'bottom', toSide: 'top', toAt: 0.8 },
    { from: 'read', to: 'steps' },
    { from: 'lookup', to: 'steps', dashed: true, label: t('lookup', '查找') },
    { from: 'steps', to: 'targets', fromSide: 'bottom', toSide: 'top', fromAt: 0.15 },
    { from: 'steps', to: 'connectors', fromSide: 'bottom', toSide: 'top', fromAt: 0.4 },
    { from: 'steps', to: 'tables', fromSide: 'bottom', toSide: 'top', fromAt: 0.65 },
    { from: 'steps', to: 'dead', fromSide: 'bottom', toSide: 'top', fromAt: 0.9, dashed: true },
  ],
};

const DIAGRAMS = { overview, 'data-path': dataPath, intake, query, async: asyncJobs, federated, pipeline };

const keys = process.argv.slice(2);
const selected = keys.length ? Object.fromEntries(keys.map((key) => [key, DIAGRAMS[key]])) : DIAGRAMS;

await renderDiagrams(selected, {
  images: resolve(ROOT, 'images', 'architecture'),
  sources: resolve(ROOT, 'diagrams'),
  source: 'molesignal-docs',
});
console.log('done.');
