#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { buildManifest, buildPrivateSidecar, stableStringify } = require('./manifest');

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1];
}

const inputPath = valueAfter('--input');
const outputPath = valueAfter('--output');
const privateOutputPath = valueAfter('--private-output');
if (!inputPath || !outputPath) {
  process.stderr.write('Usage: node build-manifest.js --input batch-input.json --output batch-manifest.json [--private-output batch-private.json]\n');
  process.exitCode = 2;
} else {
  const input = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
  const manifest = buildManifest(input);
  const privateSidecar = buildPrivateSidecar(input);
  if (privateSidecar.entities.length && !privateOutputPath) throw new Error('--private-output is required when the batch has supplier contacts or source pricing');
  let privateTarget = null;
  if (privateSidecar.entities.length) {
    privateTarget = path.resolve(privateOutputPath);
    const ignoredRoot = `${path.resolve('data/catalog-runs')}${path.sep}`;
    if (!privateTarget.startsWith(ignoredRoot)) throw new Error('Private sidecars must be stored under gitignored data/catalog-runs/');
  }
  fs.writeFileSync(path.resolve(outputPath), `${stableStringify(manifest)}\n`, { flag: 'wx' });
  if (privateSidecar.entities.length) {
    fs.writeFileSync(privateTarget, `${stableStringify(privateSidecar)}\n`, { flag: 'wx', mode: 0o600 });
  }
  process.stdout.write(`${manifest.batch_id} ${manifest.manifest_sha256}\n`);
}
