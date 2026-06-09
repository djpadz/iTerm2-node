#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src', 'generated', 'api.js');
const DEST_DIR = path.join(__dirname, '..', 'dist', 'generated');
const DEST = path.join(DEST_DIR, 'api.js');
const DIST = path.join(__dirname, '..', 'dist');

fs.mkdirSync(DEST_DIR, { recursive: true });
fs.copyFileSync(SRC, DEST);

// Report what tsc + copy produced.
const jsCount = fs.readdirSync(DIST).filter((f) => f.endsWith('.js')).length;
const dtsCount = fs.readdirSync(DIST).filter((f) => f.endsWith('.d.ts')).length;
console.log(
  `built ${jsCount} .js + ${dtsCount} .d.ts in dist/, plus dist/generated/api.{js,d.ts}`
);
