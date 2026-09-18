import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const assets = path.join(dist, 'assets');
const missing = new Set();
let checked = 0;

// Check the emitted files, after every build plugin has run. Vite's lazy-load
// dependency lists can still reference entry CSS that a plugin has inlined.
for (const file of fs.readdirSync(assets).filter(name => name.endsWith('.js'))) {
  const source = fs.readFileSync(path.join(assets, file), 'utf8');
  for (const match of source.matchAll(/["']((?:assets\/|\.\/)[^"'\s]+\.(?:css|js))["']/g)) {
    const dependency = match[1];
    const target = path.resolve(dependency.startsWith('assets/') ? dist : assets, dependency);
    checked++;
    if (!fs.existsSync(target)) missing.add(`${file} -> ${dependency}`);
  }
}

assert.ok(checked > 0, 'No built JavaScript/CSS dependencies were found to validate.');
assert.equal(missing.size, 0, `Built chunks reference missing assets:\n${[...missing].join('\n')}`);
console.log(`Build asset check passed (${checked} JavaScript/CSS references).`);
