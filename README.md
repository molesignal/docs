# MoleSignal documentation

This repository contains the bilingual MoleSignal documentation site built with
[Mintlify](https://mintlify.com).

## Structure

- `en-US/` — English product guides and API reference
- `zh-Hans/` — Simplified Chinese product guides and API reference
- `docs.json` — navigation, branding, and site configuration
- `diagrams/` — editable Excalidraw architecture sources
- `images/architecture/` — rendered light and dark architecture diagrams

Keep English and Chinese navigation in parity. Additions or renames of public
pages must update both language trees and `docs.json` in the same change.

## Local development

Install the Mintlify CLI, then start the preview from this directory:

```bash
npm install -g mint
mint dev
```

The preview is available at `http://localhost:3000`.

## Validation

Run these checks before publishing:

```bash
mint broken-links
mint a11y
node -e "JSON.parse(require('fs').readFileSync('docs.json', 'utf8'))"
```

API behavior must match the current MoleSignal source:

- HTTP routes: `molesignal/src/api/http/routes/`
- Web routes and feature access: `molesignal/web/src/routes/` and
  `molesignal/web/src/product/`
- Runtime configuration: `molesignal/conf/config.toml` and
  `molesignal/src/config/`
- OpenAPI source: `molesignal/docs/api/openapi.yaml`

## Writing conventions

- Use **workspace** for an organization in end-user UI instructions. Use
  **organization** for API and IAM boundary names.
- Use **Mole Agent** consistently for the product area and embedded
  assistant.
- Use **OpenSource Edition** and **Enterprise Edition** in user-facing copy.
- Name exact permissions, such as `streams.query`, instead of assuming a
  display role.
- Put UI labels in bold and paths, commands, fields, and permission keys in
  code formatting.
- Avoid first-, second-, and third-person personal pronouns. Prefer direct
  imperatives, named actors, or objective statements.
