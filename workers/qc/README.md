# Atelix QC worker

Deploy this directory as a separate native Vercel Python Function project. The runtime is pinned by `.python-version`; OpenCV performs bounded validation and frame extraction without a Docker image or system FFmpeg dependency. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `QC_WORKER_BEARER_SECRET`, `OPENROUTER_API_KEY`, and optionally `OPENROUTER_QC_MODEL` / `OPENROUTER_QC_PRESET` as encrypted project variables.

`POST /run` accepts only `Authorization: Bearer <QC_WORKER_BEARER_SECRET>`. It claims one job, downloads private evidence directly from Supabase, performs deterministic validation and bounded frame extraction, asks OpenRouter only for evidence-linked risk findings, then completes or checkpoints the durable job. `GET /healthz` performs no provider or database call.

The application stops starting work after 220 seconds and checkpoints before 240 seconds, beneath the documented Vercel Hobby 300-second ceiling. Supabase Pro `pg_cron` + `pg_net` owns scheduling; do not configure Vercel Cron.
