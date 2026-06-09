#!/usr/bin/env node
/**
 * Re-extracts profile.py's setter list and prints TS method declarations.
 * Re-run when the upstream Python lib adds new profile properties.
 *
 * Usage: PYTHON_PROFILE_PY=/path/to/profile.py node scripts/extract-profile-setters.mjs
 */
'use strict';

import fs from 'node:fs';

const path =
  process.env.PYTHON_PROFILE_PY ||
  process.argv[2] ||
  '/Users/djpadz/Library/Application Support/iTerm2/iterm2env-79/versions/3.14.0/lib/python3.14/site-packages/iterm2/profile.py';

const src = fs.readFileSync(path, 'utf8');

const blocks = src.split(/(?=    def set_)/u);
const out = [];
for (const block of blocks) {
  const m = block.match(/^    def (set_[a-z0-9_]+)\(self,\s*value(?:[^)]*)\):/u);
  if (!m) continue;
  const name = m[1];
  const inner = block.match(/self\._(simple|color)_set\(\s*"([^"]+)"/u);
  if (!inner) continue;
  out.push([name, inner[1], inner[2]]);
}

const camel = (s) =>
  s
    .split('_')
    .map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join('');

for (const [name, kind, key] of out) {
  const js = camel(name);
  if (kind === 'color') {
    console.log(
      `  ${js}(value: Color): void { this._colorSet(${JSON.stringify(key)}, value); }`
    );
  } else {
    console.log(
      `  ${js}(value: unknown): void { this._simpleSet(${JSON.stringify(key)}, value); }`
    );
  }
}
process.stderr.write(`${out.length} setters extracted\n`);
