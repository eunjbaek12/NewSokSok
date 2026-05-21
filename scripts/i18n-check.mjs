// Quick consistency check for i18n. Run with `node scripts/i18n-check.mjs`.
// Reports keys used in `t('...')` but missing in ko.json, and keys defined
// but never called via a static literal (dynamic `t(variable)` calls are
// ignored — so "unused" includes false positives that the human should
// eyeball before deleting).
//
// Not wired into pre-commit; ad hoc.
import fs from 'fs';
import path from 'path';

const ko = JSON.parse(fs.readFileSync('i18n/locales/ko.json', 'utf8'));

function flatten(obj, prefix = '') {
  const keys = new Set();
  for (const k of Object.keys(obj)) {
    const full = prefix ? prefix + '.' + k : k;
    if (obj[k] !== null && typeof obj[k] === 'object' && !Array.isArray(obj[k])) {
      for (const sub of flatten(obj[k], full)) keys.add(sub);
    } else {
      keys.add(full);
    }
  }
  return keys;
}

const definedKeys = flatten(ko);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'build') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

const files = walk('.');
// Match t('key.path') or t("key.path") or t(`key.path`) where the key is
// a dotted static literal. Skips dynamic concatenation.
const re = /\bt\(\s*['"`]([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+)['"`]/g;
const calledKeys = new Map();

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  let m;
  while ((m = re.exec(content)) !== null) {
    const k = m[1];
    if (!calledKeys.has(k)) calledKeys.set(k, file);
  }
}

const missing = [...calledKeys.entries()].filter(([k]) => !definedKeys.has(k));
const unused = [...definedKeys].filter(k => !calledKeys.has(k));

console.log('Static t() call sites (unique keys):', calledKeys.size);
console.log('Defined keys:', definedKeys.size);
console.log();
console.log('Missing (called but undefined):', missing.length);
for (const [k, file] of missing) console.log('  -', k, '<-', file);
console.log();
console.log('Possibly unused (defined but no static call):', unused.length);
for (const k of unused.slice(0, 40)) console.log('  -', k);
if (unused.length > 40) console.log('  ... (' + (unused.length - 40) + ' more)');
