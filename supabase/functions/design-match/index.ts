import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Design Match is intentionally separate from Sourcing Copilot. Gemini reads
// source material into a structured brief; ARCANA's own catalog data supplies
// every supplier, certification, MOQ, lead-time, and price shown to a buyer.
const MODEL = "gemini-3.6-flash";
const MAX_FILES = 8;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 75 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PDF = "application/pdf";

const BRIEF_SCHEMA = {
  type: "object",
  properties: {
    garmentType: { type: "string" },
    description: { type: "string" },
    quantities: { type: "string" },
    sizes: { type: "string" },
    targetRegion: { type: "string" },
    targetPrice: { type: "string" },
    leadTime: { type: "string" },
    certifications: { type: "array", items: { type: "string" } },
    construction: { type: "array", items: { type: "string" } },
    colorways: { type: "array", items: { type: "object", properties: {
      component: { type: "string" }, color: { type: "string" }, code: { type: "string" }
    }, required: ["component", "color"] } },
    fabrics: {
      type: "array",
      items: { type: "object", properties: {
        name: { type: "string" }, specification: { type: "string" },
        composition: { type: "string" }, confidence: { type: "string" }
      }, required: ["name"] }
    },
    trims: {
      type: "array",
      items: { type: "object", properties: {
        name: { type: "string" }, specification: { type: "string" },
        confidence: { type: "string" }
      }, required: ["name"] }
    },
    unsupportedOrUnclear: { type: "array", items: { type: "string" } }
  },
  required: ["garmentType", "description", "fabrics", "trims", "construction", "colorways", "certifications", "unsupportedOrUnclear"]
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function safeText(value: unknown, max = 240) { return String(value || "").slice(0, max).trim(); }
function terms(value: unknown) {
  return safeText(value, 1000).toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) || [];
}
function scoreText(haystack: string, wanted: string[]) {
  const source = haystack.toLowerCase();
  return wanted.reduce((score, term) => score + (source.includes(term) ? 1 : 0), 0);
}
function normalizeBrief(raw: any) {
  const list = (value: unknown, max = 8) => Array.isArray(value)
    ? value.slice(0, max).map(x => safeText(x, 120)).filter(Boolean) : [];
  const requirements = (value: unknown) => Array.isArray(value) ? value.slice(0, 8).map((x: any) => ({
    name: safeText(x?.name, 120), specification: safeText(x?.specification, 180),
    composition: safeText(x?.composition, 120), confidence: ["high", "medium", "low"].includes(x?.confidence) ? x.confidence : "medium"
  })).filter(x => x.name) : [];
  const colors = Array.isArray(raw?.colorways) ? raw.colorways.slice(0, 12).map((x: any) => ({
    component: safeText(x?.component, 100), color: safeText(x?.color, 100), code: safeText(x?.code, 80)
  })).filter(x => x.component || x.color) : [];
  return {
    garmentType: safeText(raw?.garmentType, 120) || "Garment design",
    description: safeText(raw?.description, 600), quantities: safeText(raw?.quantities, 100), sizes: safeText(raw?.sizes, 100),
    targetRegion: safeText(raw?.targetRegion, 100), targetPrice: safeText(raw?.targetPrice, 100), leadTime: safeText(raw?.leadTime, 100),
    certifications: list(raw?.certifications), construction: list(raw?.construction), colorways: colors,
    fabrics: requirements(raw?.fabrics), trims: requirements(raw?.trims),
    unsupportedOrUnclear: list(raw?.unsupportedOrUnclear)
  };
}

function matchCatalog(brief: ReturnType<typeof normalizeBrief>, products: any[], factories: any[]) {
  const briefWords = [brief.garmentType, brief.description, brief.construction.join(" "), brief.certifications.join(" "), brief.targetRegion].flatMap(terms);
  const requirementMatches = (requirements: any[], category: string) => requirements.map(requirement => {
    const wanted = [...terms(requirement.name), ...terms(requirement.specification), ...terms(requirement.composition)];
    const ranked = products.filter(p => p.category === category && p.listing_status === "active").map(p => {
      const source = [p.name, p.comp, p.spec, p.badge, p.loc, p.factory?.name, ...(p.factory?.tags || []), ...(p.factory?.certs || [])].join(" ");
      return { product: p, score: scoreText(source, wanted) + scoreText(source, terms(brief.certifications.join(" "))) };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
    return { requirement, matches: ranked.map(x => ({
      id: x.product.sku, name: x.product.name, img: x.product.img, comp: x.product.comp,
      spec: x.product.spec, price: Number(x.product.price), unit: x.product.unit_type,
      moq: x.product.moq == null ? "" : `${x.product.moq} ${x.product.unit_type || ""}`.trim(),
      seller: x.product.factory?.name || "", loc: x.product.loc, country: x.product.factory?.region || "",
      badge: x.product.badge || "", cat: x.product.category, matchScore: x.score
    })) };
  });
  const oems = factories.filter(f => f.verify_state === "verified").map(factory => {
    const source = [factory.name, factory.type, factory.region, factory.loc, factory.bio, ...(factory.tags || []), ...(factory.certs || [])].join(" ");
    const typeBoost = /oem|garment/i.test(factory.type || "") ? 4 : 0;
    const score = typeBoost + scoreText(source, briefWords);
    const coverage = [...brief.fabrics, ...brief.trims].filter(r => scoreText(source, terms(`${r.name} ${r.specification}`)) > 0).length;
    return { id: factory.slug, name: factory.name, type: factory.type, region: factory.region, loc: factory.loc,
      verified: true, years: factory.years, moq: factory.moq, lead: factory.lead, rating: Number(factory.rating || 0),
      orders: factory.orders_label, capacity: factory.capacity, certs: factory.certs || [], tags: factory.tags || [], img: factory.img,
      bio: factory.bio, matchScore: score + coverage * 2, coverage, requirementCount: brief.fabrics.length + brief.trims.length };
  }).filter(f => f.matchScore > 0).sort((a, b) => b.matchScore - a.matchScore).slice(0, 8);
  return { oems, fabrics: requirementMatches(brief.fabrics, "fabrics"), trims: requirementMatches(brief.trims, "trims") };
}

async function toGeminiPart(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let mimeType = file.type;
  if (file.name.toLowerCase().endsWith(".ai")) {
    const signature = new TextDecoder().decode(bytes.slice(0, 8));
    if (!signature.startsWith("%PDF-")) throw new Error("ai_pdf_export_required");
    mimeType = PDF;
  }
  // Avoid spreading a multi-megabyte Uint8Array into String.fromCharCode —
  // that exceeds the argument limit on large, valid tech-pack PDFs.
  let binary = "";
  const chunk = 0x8000;
  for (let start = 0; start < bytes.length; start += chunk) binary += String.fromCharCode(...bytes.subarray(start, start + chunk));
  return { inline_data: { mime_type: mimeType, data: btoa(binary) } };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);
  const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  if (!jwt) return json({ ok: false, reason: "unauthorized" }, 401);
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!apiKey || !supabaseUrl || !serviceKey) return json({ ok: false, reason: "analysis_unavailable" }, 503);

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: { user }, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !user) return json({ ok: false, reason: "unauthorized" }, 401);

  // Re-matching an edited brief does not need the original files again. The
  // client retains only the structured brief in sessionStorage; this path
  // never writes or re-uploads source material.
  if ((req.headers.get("Content-Type") || "").includes("application/json")) {
    let body: any;
    try { body = await req.json(); } catch { return json({ ok: false, reason: "invalid_brief" }, 400); }
    const brief = normalizeBrief(body?.brief);
    const [productResult, factoryResult] = await Promise.all([
      admin.from("products").select("*, factory:factories(*)").eq("listing_status", "active").limit(500),
      admin.from("factories").select("*").eq("verify_state", "verified").limit(300)
    ]);
    if (productResult.error || factoryResult.error) return json({ ok: false, reason: "catalog_unavailable" }, 503);
    return json({ ok: true, model: MODEL, brief, results: matchCatalog(brief, productResult.data || [], factoryResult.data || []) });
  }

  let form: FormData;
  try { form = await req.formData(); } catch { return json({ ok: false, reason: "invalid_upload" }, 400); }
  const files = form.getAll("files").filter((item): item is File => item instanceof File);
  if (!files.length || files.length > MAX_FILES) return json({ ok: false, reason: "file_count" }, 400);
  if (files.some(file => file.size > MAX_FILE_BYTES) || files.reduce((n, file) => n + file.size, 0) > MAX_TOTAL_BYTES) return json({ ok: false, reason: "file_size" }, 413);
  if (files.some(file => !IMAGE_TYPES.has(file.type) && file.type !== PDF && !file.name.toLowerCase().endsWith(".ai"))) return json({ ok: false, reason: "unsupported_file" }, 415);

  let parts: any[];
  try { parts = await Promise.all(files.map(toGeminiPart)); }
  catch (error) { return json({ ok: false, reason: error instanceof Error ? error.message : "invalid_upload" }, 422); }

  const prompt = `Read these fashion design references and return only structured JSON. Extract facts that are explicitly shown or strongly implied; use empty strings or an unsupportedOrUnclear item when unknown. Do not invent supplier facts, costs, certifications, quantities, or manufacturing capabilities. Keep shell and lining as separate fabric requirements. Put zippers, labels, elastic, hanger loops, and similar components in trims. Capture measurements, size ranges, construction changes, and component-level colors/Pantone codes when shown. This brief will be matched only against ARCANA's verified catalog.`;
  let gemini: any;
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }, ...parts] }],
        generationConfig: { responseMimeType: "application/json", responseJsonSchema: BRIEF_SCHEMA, thinkingConfig: { thinkingLevel: "medium" } }
      })
    });
    if (!response.ok) { console.error("[design-match] Gemini error", response.status, (await response.text()).slice(0, 500)); return json({ ok: false, reason: "analysis_failed" }, 502); }
    gemini = await response.json();
  } catch (error) { console.error("[design-match] Gemini request failed", error); return json({ ok: false, reason: "analysis_failed" }, 502); }
  const text = gemini?.candidates?.[0]?.content?.parts?.find((part: any) => part.text)?.text;
  if (!text) return json({ ok: false, reason: "analysis_failed" }, 502);
  let brief: ReturnType<typeof normalizeBrief>;
  try { brief = normalizeBrief(JSON.parse(text)); } catch { return json({ ok: false, reason: "analysis_failed" }, 502); }

  const [productResult, factoryResult] = await Promise.all([
    admin.from("products").select("*, factory:factories(*)").eq("listing_status", "active").limit(500),
    admin.from("factories").select("*").eq("verify_state", "verified").limit(300)
  ]);
  if (productResult.error || factoryResult.error) return json({ ok: false, reason: "catalog_unavailable" }, 503);
  const results = matchCatalog(brief, productResult.data || [], factoryResult.data || []);
  return json({ ok: true, model: MODEL, brief, results, files: files.map(file => ({ name: safeText(file.name, 160), size: file.size })) });
});
