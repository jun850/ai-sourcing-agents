"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const { promisify } = require("node:util");

const gzip = promisify(zlib.gzip);

function safeSegment(value, fallback = "unknown") {
  const segment = String(value || "").normalize("NFKC").replace(/[^\p{Letter}\p{Number}._-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 160);
  return segment || fallback;
}

function hashBuffer(value) { return crypto.createHash("sha256").update(value).digest("hex"); }

class EvidenceStore {
  constructor(rootDir) {
    this.rootDir = path.resolve(rootDir);
    this.rawDir = path.join(this.rootDir, "raw");
    this.canonicalPath = path.join(this.rootDir, "canonical.ndjson");
    this.evidenceManifestPath = path.join(this.rootDir, "evidence.ndjson");
  }

  async initialize() { await fs.mkdir(this.rawDir, { recursive: true }); }

  async storeRaw({ kind, sourceId, url, body, contentType = "application/octet-stream", fetchedAt = new Date().toISOString() }) {
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    const digest = hashBuffer(buffer);
    const directory = path.join(this.rawDir, safeSegment(kind));
    await fs.mkdir(directory, { recursive: true });
    const relativePath = path.join("raw", safeSegment(kind), `${safeSegment(sourceId)}-${digest.slice(0, 12)}.gz`);
    const absolutePath = path.join(this.rootDir, relativePath);
    const temporaryPath = `${absolutePath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, await gzip(buffer, { level: 9 }));
    await fs.rename(temporaryPath, absolutePath);
    const record = { kind, sourceId, sourceUrl: url, fetchedAt, contentType, sha256: digest, bytes: buffer.length, encoding: "gzip", path: relativePath.split(path.sep).join("/") };
    await fs.appendFile(this.evidenceManifestPath, `${JSON.stringify(record)}\n`, "utf8");
    return record;
  }

  async appendCanonical(record) {
    const line = `${JSON.stringify(record)}\n`;
    await fs.appendFile(this.canonicalPath, line, "utf8");
    return { path: path.relative(this.rootDir, this.canonicalPath), sha256: hashBuffer(line) };
  }

  async materializeCanonicalJson(metadata = {}) {
    let contents = "";
    try { contents = await fs.readFile(this.canonicalPath, "utf8"); } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const parsedRecords = contents.split("\n").filter(Boolean).map(JSON.parse);
    const records = [...new Map(parsedRecords.map((record) => [`${record.source || ""}:${record.sourceId || ""}`, record])).values()];
    const targetPath = path.join(this.rootDir, "canonical.json");
    const temporaryPath = `${targetPath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify({ metadata: { ...metadata, recordCount: records.length }, records }, null, 2)}\n`, "utf8");
    await fs.rename(temporaryPath, targetPath);
    return { path: path.relative(this.rootDir, targetPath), recordCount: records.length };
  }
}

module.exports = { EvidenceStore, hashBuffer, safeSegment };
