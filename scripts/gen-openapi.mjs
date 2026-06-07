#!/usr/bin/env node
/**
 * Build a Mintlify-ready OpenAPI spec from the source YAML.
 *
 * The backend's hand-maintained `api-reference/openapi.yaml` uses compact flow
 * mappings and omits boilerplate (some operations have no `responses`, etc.).
 * This script parses it, expands path-level `$ref` aliases, fills in the fields
 * OpenAPI 3.0 requires, and writes a validated `api-reference/openapi.json`,
 * which is what `docs.json` serves.
 *
 * Usage:
 *   npm install        # once, to get the js-yaml dependency
 *   node scripts/gen-openapi.mjs
 */
import yaml from 'js-yaml';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DOCS_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(DOCS_ROOT, 'api-reference', 'openapi.yaml');
const OUT = join(DOCS_ROOT, 'api-reference', 'openapi.json');
const METHODS = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];

const doc = yaml.load(readFileSync(SRC, 'utf8'));

/** Resolve a JSON Pointer like '#/paths/~1api~1v1~1ingest~1logs~1{stream}'. */
function resolvePointer(root, ptr) {
  const parts = ptr
    .replace(/^#\//, '')
    .split('/')
    .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
  let cur = root;
  for (const p of parts) cur = cur?.[p];
  return cur;
}

// Expand path-level $ref (e.g. metrics/traces ingest aliasing the logs path).
for (const [p, item] of Object.entries(doc.paths)) {
  if (item && typeof item === 'object' && item.$ref) {
    const target = resolvePointer(doc, item.$ref);
    if (target) doc.paths[p] = JSON.parse(JSON.stringify(target));
  }
}

// Keep sidebar labels short: the sidebar shows each operation's `summary`, so
// move any trailing parenthetical detail out of the summary and into the
// description (which renders in the page body, not the nav).
let shortened = 0;
for (const item of Object.values(doc.paths)) {
  if (!item || typeof item !== 'object') continue;
  for (const m of METHODS) {
    const op = item[m];
    if (!op || typeof op !== 'object' || typeof op.summary !== 'string') continue;
    const idx = op.summary.indexOf(' (');
    if (idx === -1) continue;
    const head = op.summary.slice(0, idx).trim();
    // Strip the outermost surrounding parens from the moved-out note.
    const note = op.summary.slice(idx + 1).trim().replace(/^\((.*)\)$/s, '$1').trim();
    if (!head) continue;
    op.summary = head;
    op.description = op.description ? `${op.description}\n\n${note}` : note;
    shortened++;
  }
}

// Synthesize a sample value from a JSON Schema so every response renders as a
// concrete JSON code block (not just a schema table).
function exampleFromSchema(schema, seen = new Set(), depth = 0) {
  if (!schema || typeof schema !== 'object' || depth > 6) return null;
  if (schema.example !== undefined) return schema.example;
  if (schema.$ref) {
    if (seen.has(schema.$ref)) return null;
    seen.add(schema.$ref);
    return exampleFromSchema(resolvePointer(doc, schema.$ref), seen, depth + 1);
  }
  if (schema.oneOf || schema.anyOf) {
    return exampleFromSchema((schema.oneOf || schema.anyOf)[0], seen, depth + 1);
  }
  if (schema.allOf) {
    return schema.allOf.reduce(
      (acc, s) => Object.assign(acc, exampleFromSchema(s, seen, depth + 1) || {}),
      {},
    );
  }
  if (schema.enum) return schema.enum[0];
  switch (schema.type) {
    case 'object': {
      const out = {};
      for (const [k, v] of Object.entries(schema.properties || {})) {
        out[k] = exampleFromSchema(v, seen, depth + 1);
      }
      return out;
    }
    case 'array':
      return [exampleFromSchema(schema.items, seen, depth + 1)].filter((x) => x !== null);
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return true;
    case 'string':
      return schema.format === 'date-time' ? '1970-01-01T00:00:00Z' : 'string';
    default:
      return schema.properties ? exampleFromSchema({ ...schema, type: 'object' }, seen, depth + 1) : null;
  }
}

// Build a JSON example body for a text-only response, so Mintlify renders the
// response as a JSON code block instead of a bare description line.
function jsonBodyFor(code, description) {
  if (/^[45]/.test(code)) {
    // Error envelope — the API returns `{ "error": "<message>" }`.
    return {
      schema: { $ref: '#/components/schemas/Error' },
      example: { error: description || 'error' },
    };
  }
  // Success / redirect / informational — synthesize a status + message body.
  return {
    example: {
      status: Number(code) || code,
      message: description || 'OK',
    },
  };
}

// Give every response a JSON code block. If it has no content, synthesize a
// body from the description; if it has a JSON schema but no example, synthesize
// an example from the schema.
function ensureJsonContent(code, resp) {
  if (!resp || typeof resp !== 'object' || '$ref' in resp) return false;
  const json = resp.content && resp.content['application/json'];
  if (!resp.content || !Object.keys(resp.content).length) {
    resp.content = { 'application/json': jsonBodyFor(code, resp.description) };
    return true;
  }
  if (json && json.example === undefined && json.schema) {
    const ex = exampleFromSchema(json.schema);
    if (ex !== null) {
      json.example = ex;
      return true;
    }
  }
  return false;
}

// Ensure every operation has a responses object, every response a description,
// and every text-only response a JSON example body.
let fixedOps = 0;
let fixedResp = 0;
let fixedBodies = 0;
for (const item of Object.values(doc.paths)) {
  if (!item || typeof item !== 'object') continue;
  for (const m of METHODS) {
    const op = item[m];
    if (!op || typeof op !== 'object') continue;
    if (!op.responses || typeof op.responses !== 'object' || !Object.keys(op.responses).length) {
      op.responses = { '200': { description: 'OK' } };
      fixedOps++;
    }
    for (const [code, resp] of Object.entries(op.responses)) {
      if (resp && typeof resp === 'object' && !('$ref' in resp) && !resp.description) {
        resp.description = code.startsWith('2') ? 'OK' : 'Error';
        fixedResp++;
      }
      if (ensureJsonContent(code, resp)) fixedBodies++;
    }
  }
}

writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n');
console.log(`wrote ${OUT}`);
console.log(
  `paths: ${Object.keys(doc.paths).length}, shortened ${shortened} summaries, ` +
    `filled responses on ${fixedOps} ops, descriptions on ${fixedResp} responses, ` +
    `JSON bodies on ${fixedBodies} responses`,
);
