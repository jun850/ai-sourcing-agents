"use strict";

const { DatabaseSync } = require("node:sqlite");
const crypto = require("node:crypto");

const TERMINAL_STATES = new Set(["completed", "review_required", "permanent_error"]);

function isoNow(now = Date.now()) { return new Date(now).toISOString(); }

class RunLedger {
  constructor(filePath, { now = Date.now } = {}) {
    this.now = now;
    this.db = new DatabaseSync(filePath);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS crawl_runs (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        scope TEXT NOT NULL,
        mode TEXT NOT NULL CHECK(mode = 'crawl-only'),
        state TEXT NOT NULL DEFAULT 'running',
        options_json TEXT NOT NULL DEFAULT '{}',
        started_at TEXT NOT NULL,
        discovery_closed_at TEXT,
        completed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS crawl_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL REFERENCES crawl_runs(id),
        entity_kind TEXT NOT NULL,
        source_id TEXT NOT NULL,
        url TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'discovered',
        lease_owner TEXT,
        lease_expires_at TEXT,
        heartbeat_at TEXT,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        payload_json TEXT NOT NULL DEFAULT '{}',
        output_path TEXT,
        output_hash TEXT,
        last_error TEXT,
        discovered_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(run_id, entity_kind, source_id),
        UNIQUE(run_id, url)
      );
      CREATE INDEX IF NOT EXISTS crawl_queue_claim_idx ON crawl_queue(run_id, state, lease_expires_at, id);
    `);
  }

  createRun({ id = crypto.randomUUID(), source, scope, mode = "crawl-only", options = {} }) {
    if (mode !== "crawl-only") throw new Error("This crawler layer only supports crawl-only mode");
    const startedAt = isoNow(this.now());
    this.db.prepare(`INSERT INTO crawl_runs(id,source,scope,mode,options_json,started_at) VALUES(?,?,?,?,?,?)`)
      .run(id, source, scope, mode, JSON.stringify(options), startedAt);
    return this.getRun(id);
  }

  getRun(id) {
    const row = this.db.prepare("SELECT * FROM crawl_runs WHERE id = ?").get(id);
    if (!row) return null;
    return { ...row, options: JSON.parse(row.options_json) };
  }

  enqueue(runId, candidates) {
    const now = isoNow(this.now());
    const statement = this.db.prepare(`
      INSERT INTO crawl_queue(run_id,entity_kind,source_id,url,payload_json,discovered_at,updated_at)
      VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(run_id,entity_kind,source_id) DO UPDATE SET
        url=excluded.url, payload_json=excluded.payload_json, updated_at=excluded.updated_at
      WHERE crawl_queue.state IN ('discovered','retryable_error')
    `);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const candidate of candidates) {
        statement.run(runId, candidate.kind, candidate.sourceId, candidate.url, JSON.stringify(candidate), now, now);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  releaseExpired(runId) {
    const now = isoNow(this.now());
    return Number(this.db.prepare(`
      UPDATE crawl_queue SET state='retryable_error', lease_owner=NULL, lease_expires_at=NULL,
        last_error=COALESCE(last_error,'Lease expired'), updated_at=?
      WHERE run_id=? AND state='crawling' AND lease_expires_at <= ?
    `).run(now, runId, now).changes);
  }

  claimNext(runId, owner, { leaseMs = 60_000 } = {}) {
    const nowMs = this.now();
    const now = isoNow(nowMs);
    const expiry = isoNow(nowMs + leaseMs);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.db.prepare(`
        SELECT * FROM crawl_queue
        WHERE run_id=? AND state IN ('discovered','retryable_error')
          AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
        ORDER BY id LIMIT 1
      `).get(runId, now);
      if (!row) {
        this.db.exec("COMMIT");
        return null;
      }
      this.db.prepare(`
        UPDATE crawl_queue SET state='crawling', lease_owner=?, lease_expires_at=?, heartbeat_at=?,
          attempt_count=attempt_count+1, updated_at=? WHERE id=?
      `).run(owner, expiry, now, now, row.id);
      this.db.exec("COMMIT");
      return { ...row, state: "crawling", lease_owner: owner, lease_expires_at: expiry, attempt_count: Number(row.attempt_count) + 1, payload: JSON.parse(row.payload_json) };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  heartbeat(itemId, owner, { leaseMs = 60_000 } = {}) {
    const nowMs = this.now();
    const result = this.db.prepare(`
      UPDATE crawl_queue SET heartbeat_at=?, lease_expires_at=?, updated_at=?
      WHERE id=? AND state='crawling' AND lease_owner=?
    `).run(isoNow(nowMs), isoNow(nowMs + leaseMs), isoNow(nowMs), itemId, owner);
    if (!result.changes) throw new Error(`Cannot heartbeat unowned queue item ${itemId}`);
  }

  complete(itemId, owner, { outputPath, outputHash, state = "completed" } = {}) {
    if (!TERMINAL_STATES.has(state)) throw new Error(`Invalid terminal state: ${state}`);
    const result = this.db.prepare(`
      UPDATE crawl_queue SET state=?, output_path=?, output_hash=?, lease_owner=NULL,
        lease_expires_at=NULL, heartbeat_at=NULL, last_error=NULL, updated_at=?
      WHERE id=? AND state='crawling' AND lease_owner=?
    `).run(state, outputPath || null, outputHash || null, isoNow(this.now()), itemId, owner);
    if (!result.changes) throw new Error(`Cannot complete unowned queue item ${itemId}`);
  }

  fail(itemId, owner, error, { retryable = true } = {}) {
    const state = retryable ? "retryable_error" : "permanent_error";
    const result = this.db.prepare(`
      UPDATE crawl_queue SET state=?, lease_owner=NULL, lease_expires_at=NULL, heartbeat_at=NULL,
        last_error=?, updated_at=? WHERE id=? AND state='crawling' AND lease_owner=?
    `).run(state, String(error?.message || error), isoNow(this.now()), itemId, owner);
    if (!result.changes) throw new Error(`Cannot fail unowned queue item ${itemId}`);
  }

  closeDiscovery(runId) {
    this.db.prepare("UPDATE crawl_runs SET discovery_closed_at=? WHERE id=?").run(isoNow(this.now()), runId);
  }

  finishRunIfDrained(runId) {
    const unfinished = this.db.prepare(`SELECT count(*) AS count FROM crawl_queue WHERE run_id=? AND state IN ('discovered','crawling','retryable_error')`).get(runId);
    const run = this.getRun(runId);
    if (!run?.discovery_closed_at || Number(unfinished.count) > 0) return false;
    this.db.prepare("UPDATE crawl_runs SET state='completed', completed_at=? WHERE id=?").run(isoNow(this.now()), runId);
    return true;
  }

  stats(runId) {
    const rows = this.db.prepare("SELECT state, count(*) AS count FROM crawl_queue WHERE run_id=? GROUP BY state ORDER BY state").all(runId);
    return Object.fromEntries(rows.map((row) => [row.state, Number(row.count)]));
  }

  close() { this.db.close(); }
}

module.exports = { RunLedger, TERMINAL_STATES };
