import cors from "cors";
import express from "express";
import { insertSupabaseRecord, sendInvitationPlaceholder } from "./supabase-placeholder.mjs";

const app = express();
const port = Number(process.env.ATELIX_API_PORT || 3001);
const host = process.env.ATELIX_API_HOST || "127.0.0.1";
if (process.env.NODE_ENV === "production" || !["127.0.0.1", "::1"].includes(host)) {
  throw new Error("The Phase 1 review server is development-only and must bind to loopback.");
}
const allowedOrigins = new Set(
  (process.env.ATELIX_WEB_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3010,http://127.0.0.1:3010")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed."));
  },
}));
app.use(express.json({ limit: "1mb" }));

let rfqs = [
  { id: "RFQ-1042", title: "Organic cotton poplin shirt", status: "draft", updatedAt: "Today", nextStep: "Add quantity and target delivery", language: "English", product: "Relaxed-fit woven shirt", materials: "Organic cotton poplin", quantity: "", destination: "", targetPrice: "" },
  { id: "RFQ-1041", title: "Structured canvas tote", status: "sourcing", updatedAt: "2 hours ago", nextStep: "Atelix is validating production fit", language: "English", product: "Structured everyday tote", materials: "Cotton canvas with webbing handles", quantity: "1,200 units", destination: "Los Angeles, US", targetPrice: "USD 14–18 / unit" },
  { id: "RFQ-1038", title: "Technical running shell", status: "quoting", updatedAt: "Yesterday", nextStep: "Review quote context when ready", language: "Japanese", product: "Lightweight seam-sealed running shell", materials: "Recycled nylon, waterproof membrane", quantity: "800 units", destination: "Tokyo, Japan", targetPrice: "USD 42–55 / unit" },
];
let invoices = [
  { id: "INV-2026-048", rfqId: "RFQ-1041", amount: 1800, currency: "USD", dueDate: "28 Aug 2026", status: "due" },
  { id: "INV-2026-044", rfqId: "RFQ-1038", amount: 960, currency: "USD", dueDate: "30 Aug 2026", status: "due" },
];
let preferences = { defaultLanguage: "English" };
let registrationRequests = [];
let supplierIntakes = [];
const supportedLanguages = ["English", "Indonesian", "Vietnamese", "Chinese", "Japanese"];

function error(res, status, message) {
  return res.status(status).json({ error: message });
}

function requireReviewAccess(req, res) {
  const configuredKey = process.env.ATELIX_LOCAL_REVIEW_KEY;
  if (configuredKey && req.get("x-atelix-review-key") === configuredKey) return true;
  error(res, 401, "Review access is required.");
  return false;
}

function findRfq(id, res) {
  const rfq = rfqs.find((item) => item.id === id);
  if (!rfq) {
    error(res, 404, "RFQ not found.");
    return null;
  }
  return rfq;
}

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  if (username !== "admin" || password !== "123456") {
    return error(res, 401, "Use admin / 123456 for this local demo.");
  }
  return res.json({ username: "admin", name: "Atelix Review", role: "Brand owner" });
});

app.post("/api/auth/registration-requests", async (req, res) => {
  const body = req.body || {};
  const required = ["name", "email", "companyName", "sourcing", "annualRevenue"];
  if (required.some((field) => typeof body[field] !== "string" || !body[field].trim())) return error(res, 422, "Complete the required registration fields.");
  if (!/^\S+@\S+\.\S+$/.test(body.email)) return error(res, 422, "Use a valid work email.");
  const request = { id: `REG-${1000 + registrationRequests.length + 1}`, ...body, status: "pending_review", createdAt: new Date().toISOString() };
  registrationRequests = [request, ...registrationRequests];
  try { await insertSupabaseRecord("registration_requests", { name: request.name, email: request.email, company_name: request.companyName, sourcing: request.sourcing, annual_revenue: request.annualRevenue, phone: request.phone || null, country_code: request.countryCode || null, status: request.status, created_at: request.createdAt }); } catch (cause) { return error(res, 502, cause.message); }
  return res.status(202).json({ ok: true, status: request.status, message: "Your registration is queued for review." });
});

app.get("/api/admin/registration-requests", (req, res) => { if (!requireReviewAccess(req, res)) return; return res.json(registrationRequests.map(({ password, ...request }) => request)); });

app.post("/api/admin/registration-requests/:id/approve", async (req, res) => {
  if (!requireReviewAccess(req, res)) return;
  const request = registrationRequests.find((item) => item.id === req.params.id);
  if (!request) return error(res, 404, "Registration request not found.");
  request.status = "approved";
  const invitation = await sendInvitationPlaceholder(request.email);
  request.invitation = invitation;
  return res.json({ ok: true, status: request.status, invitation });
});

app.post("/api/supplier-intake", async (req, res) => {
  const body = req.body || {};
  const required = ["companyName", "contactName", "email", "phone", "address", "language", "companyOverview", "leadTime", "moq", "monthlyCapacity", "externalQc", "exportsAbroad", "thirdPartyQc", "rawMaterials", "catalog", "paymentTerms"];
  if (required.some((field) => !String(body[field] || "").trim())) return error(res, 422, "Complete the required supplier intake fields.");
  if (!Array.isArray(body.categories) || !body.categories.length) return error(res, 422, "Choose at least one manufacturing category.");
  if (body.exportsAbroad === "yes" && (!Array.isArray(body.exportRegions) || !body.exportRegions.length)) return error(res, 422, "Choose at least one export region.");
  const intake = { id: `SUP-${1000 + supplierIntakes.length + 1}`, ...body, status: "pending_manual_review", createdAt: new Date().toISOString() };
  supplierIntakes = [intake, ...supplierIntakes];
  try { await insertSupabaseRecord("supplier_intakes", { company_name: intake.companyName, contact_name: intake.contactName, email: intake.email, phone: intake.phone, country_code: intake.countryCode, address: intake.address, payload: body, status: intake.status, created_at: intake.createdAt }); } catch (cause) { return error(res, 502, cause.message); }
  return res.status(202).json({ ok: true, status: intake.status, message: "Your supplier intake has been recorded for manual review." });
});

app.get("/api/rfqs", (_, res) => res.json(rfqs));

app.post("/api/rfqs", (req, res) => {
  const body = req.body || {};
  if (typeof body.title !== "string" || !body.title.trim()) {
    return error(res, 422, "Add a product title before saving the RFQ.");
  }
  const rfq = {
    id: `RFQ-${1043 + rfqs.length}`,
    title: body.title.trim(),
    status: "draft",
    updatedAt: "Just now",
    nextStep: "Review the RFQ draft",
    language: supportedLanguages.includes(body.language) ? body.language : "English",
    product: body.product || "",
    materials: body.materials || "",
    quantity: body.quantity || "",
    destination: body.destination || "",
    targetPrice: body.targetPrice || "",
  };
  rfqs = [rfq, ...rfqs];
  return res.status(201).json(rfq);
});

app.get("/api/rfqs/:id", (req, res) => {
  const rfq = findRfq(req.params.id, res);
  return rfq ? res.json(rfq) : undefined;
});

app.patch("/api/rfqs/:id", (req, res) => {
  const index = rfqs.findIndex((item) => item.id === req.params.id);
  if (index < 0) return error(res, 404, "RFQ not found.");
  rfqs[index] = { ...rfqs[index], ...(req.body || {}), id: rfqs[index].id, updatedAt: "Just now" };
  return res.json(rfqs[index]);
});

app.post("/api/rfqs/:id/lock", (req, res) => {
  const index = rfqs.findIndex((item) => item.id === req.params.id);
  if (index < 0) return error(res, 404, "RFQ not found.");
  rfqs[index] = { ...rfqs[index], status: "locked", updatedAt: "Just now", nextStep: "Prepared for Atelix review" };
  return res.json(rfqs[index]);
});

app.post("/api/assistant/draft", (req, res) => {
  const { brief, language = "English" } = req.body || {};
  if (typeof brief !== "string" || !brief.trim()) {
    return error(res, 422, "Describe what you need before creating a draft.");
  }
  return res.json({
    product: "Fashion item described in your brief",
    materials: "To confirm after technical review",
    quantity: "Not specified",
    destination: "Not specified",
    targetPrice: "Not specified",
    language: supportedLanguages.includes(language) ? language : "English",
    openQuestion: "What is your preferred target delivery date?",
  });
});

app.get("/api/invoices", (_, res) => res.json(invoices));

app.post("/api/invoices/pay", (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((id) => typeof id === "string") : [];
  if (!ids.length) return error(res, 422, "Choose at least one invoice.");
  invoices = invoices.map((invoice) => ids.includes(invoice.id) ? { ...invoice, status: "paid" } : invoice);
  return res.json({ ids, status: "paid", notice: "Payment simulation complete. No card was charged." });
});

app.get("/api/preferences", (_, res) => res.json(preferences));

app.patch("/api/preferences", (req, res) => {
  if (!supportedLanguages.includes(req.body?.defaultLanguage)) {
    return error(res, 422, "Choose a supported RFQ language.");
  }
  preferences = { defaultLanguage: req.body.defaultLanguage };
  return res.json(preferences);
});

app.get("/api/orders", (_, res) => res.json([]));
app.use((_, res) => error(res, 404, "Atelix endpoint not found."));
app.use((cause, _, res, next) => {
  if (res.headersSent) return next(cause);
  return error(res, cause.message === "Origin is not allowed." ? 403 : 500, cause.message === "Origin is not allowed." ? cause.message : "The Atelix service encountered an error.");
});

app.listen(port, host, () => console.log(`Atelix development review API listening on http://${host}:${port}`));
