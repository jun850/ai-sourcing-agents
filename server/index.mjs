import express from "express";

const app = express();
const port = Number(process.env.ATELIX_API_PORT || 3001);
const host = process.env.ATELIX_API_HOST || "127.0.0.1";
if (process.env.NODE_ENV === "production" || !["127.0.0.1", "::1"].includes(host)) {
  throw new Error("The Phase 1 review server is development-only and must bind to loopback.");
}
app.get("/health", (_, res) => res.json({ ok: true, service: "atelix-local-intools-seam" }));
app.use((_, res) => res.status(404).json({ error: "No product API is served locally. Use Supabase." }));

app.listen(port, host, () => console.log(`Atelix development review API listening on http://${host}:${port}`));
