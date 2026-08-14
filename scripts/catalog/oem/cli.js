#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { normalizeManifest } = require('./normalize');

const DEFAULT_INPUT = path.resolve(__dirname, '../../../data/apparel-x-oem/factories.json');

function help() {
  return `ApparelX OEM supplier normalizer

Usage:
  node scripts/catalog/oem/cli.js --dry-run [--report]
  node scripts/catalog/oem/cli.js --output-dir <directory> [--report]

Options:
  --input <file>          Input factories.json (default: data/apparel-x-oem/factories.json)
  --output-dir <dir>      Write separate public, private, and report manifests
  --dry-run               Validate and normalize without writing files
  --report                Print the normalization report as JSON
  --help                  Show this help

Outputs:
  public-suppliers.json             Sanitized, production-facing supplier records
  private-supplier-sources.json     Private provenance, contacts, and source media
  normalization-report.json         Counts, review queue, and content hashes
`;
}

function parseArgs(argv) {
  const options = { input: DEFAULT_INPUT, outputDir: null, dryRun: false, report: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--report') options.report = true;
    else if (arg === '--input') options.input = path.resolve(argv[++index] || '');
    else if (arg === '--output-dir') options.outputDir = path.resolve(argv[++index] || '');
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!options.help && !options.dryRun && !options.outputDir) {
    throw new Error('Choose --dry-run or provide --output-dir');
  }
  if (options.dryRun && options.outputDir) {
    throw new Error('--dry-run and --output-dir are mutually exclusive');
  }
  return options;
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}

function assertOutputFilesAbsent(files) {
  const existing = files.filter(file => fs.existsSync(file));
  if (existing.length) throw new Error(`Refusing to overwrite existing manifest: ${existing.join(', ')}`);
}

function run(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(help());
    return 0;
  }
  const input = JSON.parse(fs.readFileSync(options.input, 'utf8'));
  const result = normalizeManifest(input);
  if (options.outputDir) {
    fs.mkdirSync(options.outputDir, { recursive: true });
    const files = {
      public: path.join(options.outputDir, 'public-suppliers.json'),
      private: path.join(options.outputDir, 'private-supplier-sources.json'),
      report: path.join(options.outputDir, 'normalization-report.json')
    };
    assertOutputFilesAbsent(Object.values(files));
    writeJson(files.public, result.publicManifest);
    writeJson(files.private, result.privateManifest);
    writeJson(files.report, result.report);
  }
  if (options.report || options.dryRun) process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = run();
  } catch (error) {
    process.stderr.write(`OEM normalization failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { DEFAULT_INPUT, assertOutputFilesAbsent, help, parseArgs, run };
