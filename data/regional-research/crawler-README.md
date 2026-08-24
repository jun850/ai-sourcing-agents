# Regional crawler

The worker is resumable and review-first. It reads pending tasks from `research_queue.csv`, searches public web results, fetches result pages with a rate limit, extracts only explicit page facts, writes unresolved leads to `crawler_candidates.jsonl`, and appends rows with a recognized city to `raw_suppliers.jsonl` for normalization.

Run one batch:

```sh
REGIONAL_CRAWLER_MAX_TASKS=1 npm run suppliers:crawl-regional -- --once
```

Run continuously:

```sh
REGIONAL_CRAWLER_MAX_TASKS=2 REGIONAL_CRAWLER_INTERVAL_MS=300000 npm run suppliers:crawl-regional
```

Recommended search-provider configuration:

- `SERPER_API_KEY`: preferred Google-results API provider.
- `BING_SEARCH_V7_KEY`: Bing Web Search API fallback.

Without one of these keys, the worker tries public HTML search endpoints. Those endpoints may timeout or return anti-bot pages; failed tasks remain retryable in `crawler_state.json` and are not counted as completed.

Useful controls:

- `REGIONAL_CRAWLER_MAX_TASKS` - tasks per cycle, default `1`.
- `REGIONAL_CRAWLER_PAGES` - result pages per task, default `3`.
- `REGIONAL_CRAWLER_DELAY_MS` - delay between requests, default `1800`.
- `REGIONAL_CRAWLER_TIMEOUT_MS` - request timeout, default `15000`.
- `REGIONAL_CRAWLER_USER_AGENT` - identify the research worker.

The worker does not auto-promote to Supabase. Normalize, inspect provenance, run the existing dry-run importer, and have an admin review before promotion.
