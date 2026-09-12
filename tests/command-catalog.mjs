import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// The catalog is held against reality: names unique, groups and risks from
// the fixed vocabulary, and every cataloged name present in the codebase's
// actual dispatch strings so descriptions cannot drift from the boundary.
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env={}', shortCircuit: true };
  if (specifier.startsWith('@/')) return next(pathToFileURL(resolve(specifier.slice(2) + '.ts')).href, context);
  return next(specifier, context);
} });
const { commandCatalog, catalogByName } = await import('../lib/command-catalog.ts');
const { readFileSync, readdirSync } = await import('node:fs');

const names = commandCatalog.map((c) => c.name);
assert.equal(new Set(names).size, names.length, 'names are unique');
const groups = new Set(['capture','tasks','projects','clients','meetings','planning','calendar','sales','library','access']);
for (const c of commandCatalog) {
  assert.ok(groups.has(c.group), c.name + ' group');
  assert.ok(['write','destructive'].includes(c.risk), c.name + ' risk');
  assert.ok(c.summary.length > 10, c.name + ' has a real summary');
  for (const f of c.fields)
    assert.ok(['text','id','day','number','flag','list','object'].includes(f.kind), c.name + '.' + f.name);
}

// Every cataloged name appears as a dispatch string in lib/.
const source = readdirSync('lib')
  .filter((f) => f.endsWith('.ts'))
  .map((f) => readFileSync('lib/' + f, 'utf8'))
  .join('\n');
for (const name of names)
  assert.ok(source.includes("'" + name + "'"), name + ' exists in the boundary');

assert.equal(catalogByName('capture-entry')?.group, 'capture');
assert.equal(catalogByName('never-a-command'), null);

console.log('PASS: command catalog — ' + names.length + ' commands, unique names, fixed vocabularies, and every name present in the boundary’s real dispatch.');
