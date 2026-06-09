#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src', 'generated', 'api.js');
const DEST_DIR = path.join(__dirname, '..', 'dist', 'generated');
const DEST = path.join(DEST_DIR, 'api.js');

fs.mkdirSync(DEST_DIR, { recursive: true });
fs.copyFileSync(SRC, DEST);
console.log(`copied ${path.relative(process.cwd(), SRC)} -> ${path.relative(process.cwd(), DEST)}`);
