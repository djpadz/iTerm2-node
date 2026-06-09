#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SRC_DIR = path.join(__dirname, '..', 'src', 'generated');
const DEST_DIR = path.join(__dirname, '..', 'dist', 'generated');
const DIST = path.join(__dirname, '..', 'dist');

fs.mkdirSync(DEST_DIR, { recursive: true });
// Both the runtime bundle (api.js) and its hand-generated types (api.d.ts)
// need to ship to consumers — tsc doesn't emit .d.ts from .d.ts inputs, so
// we copy both manually.
for (const file of ['api.js', 'api.d.ts']) {
  fs.copyFileSync(path.join(SRC_DIR, file), path.join(DEST_DIR, file));
}

const jsCount = fs.readdirSync(DIST).filter((f) => f.endsWith('.js')).length;
const dtsCount = fs.readdirSync(DIST).filter((f) => f.endsWith('.d.ts')).length;
console.log(
  `built ${jsCount} .js + ${dtsCount} .d.ts in dist/, plus dist/generated/api.{js,d.ts}`
);
