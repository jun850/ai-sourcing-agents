#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const output = path.resolve(process.argv[2] || 'data/catalog-runs/apparelx-oem-20260814/translations.json');
const inputs = process.argv.slice(3).map(file => path.resolve(file));
if (!inputs.length) throw new Error('Usage: merge-translations.js OUTPUT INPUT...');
const translations = inputs.flatMap(file => JSON.parse(fs.readFileSync(file, 'utf8')).translations || []);
if (translations.length !== 35 || new Set(translations.map(item => item.id)).size !== 35) {
  throw new Error(`Expected 35 unique translations, received ${translations.length}`);
}
fs.writeFileSync(output, `${JSON.stringify({ schemaVersion: 1, translations }, null, 2)}\n`, { flag: 'wx' });
console.log(`Merged ${translations.length} translations into ${output}`);
