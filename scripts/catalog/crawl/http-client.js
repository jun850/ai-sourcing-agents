"use strict";

const DEFAULT_USER_AGENT = "AtelixCatalogCrawler/1.0 (+https://www.apparel-x.com/businesssearch.html)";

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

class RateLimitedHttpClient {
  constructor({ canonicalizeUrl, delayMs = 750, maxRetries = 3, timeoutMs = 30_000, fetchImpl = globalThis.fetch, userAgent = DEFAULT_USER_AGENT, sleepImpl = sleep } = {}) {
    if (typeof canonicalizeUrl !== "function") throw new TypeError("canonicalizeUrl is required");
    if (typeof fetchImpl !== "function") throw new TypeError("fetch implementation is required");
    if (!Number.isFinite(delayMs) || delayMs < 0) throw new TypeError("delayMs must be non-negative");
    if (!Number.isInteger(maxRetries) || maxRetries < 1) throw new TypeError("maxRetries must be a positive integer");
    this.canonicalizeUrl = canonicalizeUrl;
    this.delayMs = delayMs;
    this.maxRetries = maxRetries;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
    this.userAgent = userAgent;
    this.sleepImpl = sleepImpl;
    this.lastRequestAt = 0;
  }

  async get(value, { accept = "*/*", headers = {} } = {}) {
    let lastError;
    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      try {
        let url = this.canonicalizeUrl(value);
        for (let redirect = 0; redirect <= 5; redirect += 1) {
          const waitMs = this.delayMs - (Date.now() - this.lastRequestAt);
          if (waitMs > 0) await this.sleepImpl(waitMs);
          this.lastRequestAt = Date.now();
          const response = await this.fetchImpl(url, {
            method: "GET", redirect: "manual", headers: { Accept: accept, "User-Agent": this.userAgent, ...headers },
            signal: AbortSignal.timeout(this.timeoutMs),
          });
          if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get("location");
            if (!location) throw new Error(`Redirect without Location from ${url}`);
            url = this.canonicalizeUrl(new URL(location, url));
            continue;
          }
          if (response.ok) return response;
          const error = new Error(`HTTP ${response.status} ${response.statusText || ""} for ${url}`.trim());
          error.status = response.status;
          if (response.status < 500 && response.status !== 429) throw error;
          lastError = error;
          break;
        }
      } catch (error) {
        lastError = error;
        if (error.status && error.status < 500 && error.status !== 429) throw error;
      }
      if (attempt < this.maxRetries) await this.sleepImpl(attempt * 1_000);
    }
    throw lastError || new Error("Request failed");
  }
}

module.exports = { DEFAULT_USER_AGENT, RateLimitedHttpClient };
