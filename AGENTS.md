# Documentation project instructions

## About this project

- This is the bilingual documentation site of MoleSignal, built on [Mintlify](https://mintlify.com).
- Pages are MDX files with YAML frontmatter. English pages live in `en-US/` and Simplified Chinese pages in `zh-Hans/`.
- Mintlify pairs pages across languages only when the folder is named after a language code it knows, and `en-US` is not one. A page without a link to its counterpart leaves the other language greyed out in the language switcher. Every page therefore carries a frontmatter link to its counterpart: `"zh-Hans_link": "/zh-Hans/<path>"` in `en-US/` pages and `"en_link": "/en-US/<path>"` in `zh-Hans/` pages. Drop the `.mdx` extension and a trailing `/index`. Add both links when adding a page pair, and open the switcher in `mint dev` to check them.
- Navigation, branding, redirects, and the 404 page live in `docs.json`.
- `changelog.js` renders the Changelog page from GitHub releases. `style.css` and `sidebar-toggle.js` hold the site customizations.
- Diagrams are rendered SVG files in `images/architecture/` with light and dark variants for each language.
- For Mintlify product knowledge (components, configuration, writing standards), use the Mintlify skill (`npx skills add https://mintlify.com/docs`) or the Mintlify docs MCP server at `https://www.mintlify.com/docs/mcp`.

## Keep the facts verified

Documented behavior must match the product source. The source repository is a sibling checkout named `molesignal`.

- Configuration: `conf/config.toml` and `crates/core/settings/src/config/`. Defaults in the docs come from the sample file, and the description notes any built-in default that differs.
- Environment variables: the `MS_` prefix, then each level of the setting path in upper case, joined by single underscores. `[node].roles` is `MS_NODE_ROLES`, and `[meta_database].dsn` is `MS_META_DATABASE_DSN`.
- HTTP routes and error shapes: `bin/molesignal/src/api/http/routes/` and `crates/core/kernel/src/error.rs`.
- UI labels, menu paths, and Chinese UI terms: `web/src/i18n/en-us/` and `web/src/i18n/zh-cn/`, and the navigation in `web/src/product/ia.ts`.
- When the source is unclear, run the product and call the endpoint. Do not document a setting or an endpoint that has no effect, and mark a reserved setting as reserved.
- Never put real credentials, hostnames of private systems, or session identifiers in the docs. Use placeholders such as `<token>`.

## Terminology

Use one term per concept, in both languages. UI labels follow the product.

| English | Chinese | Notes |
|---|---|---|
| organization | 组织 | Boundary name in the API and in IAM. |
| workspace | 工作区 | The UI name of the selected organization. Use it in UI instructions. |
| stream | 数据流 | Always pair it with a stream type when naming one. |
| pipeline | 流水线 | |
| trace | 链路 | Use `trace` for identifiers such as `trace_id`. |
| span | Span | Keep the English term. |
| incident | 事件 | The alert and status page object. |
| on-call schedule | 值班排班 | UI label. |
| escalation policy | 升级策略 | UI label. |
| silence | 静默 | |
| service account | 服务账号 | |
| API token, intake token | API Token, 接入 Token | Keep `Token`. 令牌桶 is the only place for 令牌. |
| provider (SSO, notification, model) | 服务商 | Identity provider (IdP) is 身份提供方. |
| intake (verb and noun) | 接入 | 采集器 for a collector. |
| datasource | 数据源 | The **Datasource** page. |
| data plane | 数据面 | |
| compactor, compaction | Compactor, 合并 | |
| synthetic monitoring | 拨测 | |
| Mole Agent | Mole Agent | Use the name for the product area and the assistant. |

Describe access with exact permission keys such as `streams.query`.

## Style preferences

- Use active voice and direct imperative sentences without first-, second-, or third-person personal pronouns.
- Keep sentences concise. One idea per sentence.
- Use sentence case for headings, page titles, and navigation groups.
- Bold UI elements: Click **Settings**. Write menu paths with an arrow: **Identity & Access → API tokens**.
- Use code formatting for file names, commands, paths, configuration keys, environment variables, and code references.
- Prefer a table for a list of settings, endpoints, or limits that have several attributes.
- Put shell commands in their own fenced block with the language `bash`. One command per block when a reader is expected to run it.
- Keep English and Chinese pages in parity. A page, a section, and a navigation entry exist in both languages in the same change.

## Content boundaries

- Document the open source edition: Apache License 2.0, PostgreSQL as the only metadata database, the embedded JavaScript and VRL runtimes, RustFS as the sandbox object store, and the standalone deployment as the supported topology.
- Describe the role-split deployment with the router as the entry point of the full API, and state its limits next to it.
- The **Enterprise & Cloud** tab holds placeholders until the content is ready.
- Do not document internal source layout, internal module names, or development-only switches.

## Validation

Run these checks before publishing:

```bash
mint validate
mint broken-links
mint a11y
```
