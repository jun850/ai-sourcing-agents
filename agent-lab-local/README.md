# Agent Lab (local-only)

This is a standalone static prototype for reviewing agent concepts. It has no
authentication, API client, persistence, credentials, analytics, or connection
to the marketplace app.

Run it only on this computer:

```sh
cd /Users/jun/marketplace/agent-lab-local
npm run dev
```

Vite is explicitly bound to `127.0.0.1`, so it is available only through the
local machine at the URL Vite prints (usually `http://127.0.0.1:5173`).
