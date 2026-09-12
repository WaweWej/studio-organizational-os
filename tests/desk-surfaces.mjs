import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env={}', shortCircuit: true };
  if (specifier.startsWith('@/')) return next(pathToFileURL(resolve(specifier.slice(2) + '.ts')).href, context);
  return next(specifier, context);
} });
const { parseSurfaceIntent, resolveSpaceByName } = await import('../lib/desk-surfaces.ts');
const { inferEntryKind } = await import('../lib/entry-model.ts');

const data = { spaces: [
  { id: 's1', name: 'Rørvig Teater' },
  { id: 's2', name: 'Betterlytics' },
  { id: 's3', name: 'Better Homes' },
  { id: 's4', name: 'Internal' },
] };

// The owner's phrasing opens the client log, with the client resolved by name.
const a = parseSurfaceIntent('add to Rørvig Teater log', data);
assert.equal(a?.type, 'client-log');
assert.equal(a?.spaceId, 's1');
assert.equal(a?.seed, '');

// Trailing text seeds the panel; a colon is optional; case is forgiven.
const b = parseSurfaceIntent('add to rørvig teater log: called about the poster', data);
assert.equal(b?.spaceId, 's1');
assert.equal(b?.seed, 'called about the poster');

// Single-word unique prefixes and words resolve; "open" works too.
assert.equal(parseSurfaceIntent('open Betterlytics log', data)?.spaceId, 's2');
assert.equal(parseSurfaceIntent('add to Teater log', data)?.spaceId, 's1');
assert.equal(parseSurfaceIntent('Betterlytics log', data)?.spaceId, 's2');

// Ambiguity refuses deterministically: "Better" prefixes two spaces.
assert.equal(parseSurfaceIntent('add to Better log', data), null);
assert.equal(resolveSpaceByName(data, 'better'), null);
assert.equal(resolveSpaceByName(data, 'betterlytics')?.id, 's2');

// Unknown names fall through to ordinary interpretation.
assert.equal(parseSurfaceIntent('add to Nobody log', data), null);

// The law: only explicit task phrasing makes tasks. Verb-shaped sentences
// are kept as notes, never turned into chores.
assert.equal(inferEntryKind('add to Rørvig Teater log'), 'note');
assert.equal(inferEntryKind('book flights for the festival'), 'note');
assert.equal(inferEntryKind('send the invoice'), 'note');
assert.equal(inferEntryKind('add task send the invoice'), 'task');
assert.equal(inferEntryKind('task: send the invoice'), 'task');
assert.equal(inferEntryKind('new task edit the video'), 'task');

console.log('PASS: surface intents — log phrases resolve clients by exact, prefix, and word match with deterministic ambiguity refusal, seeds carry through, and only explicit task phrasing creates tasks.');
