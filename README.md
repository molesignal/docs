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
mint validate
mint broken-links
mint a11y
```

API behavior must match the current MoleSignal source:

- HTTP routes: `bin/molesignal/src/api/http/routes/`
- Error shapes: `crates/core/kernel/src/error.rs`
- Web routes and feature access: `web/src/routes/` and `web/src/product/`
- UI labels: `web/src/i18n/`
- Runtime configuration: `conf/config.toml` and `crates/core/settings/src/config/`

## Writing conventions

- Use **workspace** for an organization in end-user UI instructions. Use
  **organization** for API and IAM boundary names.
- Use **Mole Agent** consistently for the product area and embedded
  assistant.
- Keep future offering content in the **Enterprise & Cloud** tab until details are ready.
- Name exact permissions, such as `streams.query`, instead of assuming a
  display role.
- Put UI labels in bold and paths, commands, fields, and permission keys in
  code formatting.
- Avoid first-, second-, and third-person personal pronouns. Prefer direct
  imperatives, named actors, or objective statements.
