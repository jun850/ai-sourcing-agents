import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Athelia reads source material into a structured brief; Atelix's own catalog data supplies
// every supplier, certification, MOQ, lead-time, and price shown to a buyer.
const MODEL = "gemini-3.6-flash";
const MAX_FILES = 8;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_PDF_BYTES = 30 * 1024 * 1024;
const MAX_TOTAL_BYTES = 30 * 1024 * 1024;
// Inline small requests so a normal tech pack does not depend on the Files
// API's asynchronous processing state. Larger batches use Files API URIs to
// keep the Edge worker and generateContent request comfortably bounded.
const MAX_INLINE_TOTAL_BYTES = 12 * 1024 * 1024;
const FILE_PROCESSING_TIMEOUT_MS = 60 * 1000;
const MODEL_TIMEOUT_MS = 75 * 1000;
const MAX_DAILY_CALLS = 3;
const UNLIMITED_EMAIL = "jun@arcanawangsa.com";
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PDF = "application/pdf";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};
const BOM_CATEGORIES = ["fabrics", "buttons", "zippers", "labels", "trims", "yarns", "accessories"];
const MATCH_DEFINITIONS: Record<string, { catalog: string[]; cues: string[] }> = {
  fabrics: { catalog: ["fabrics"], cues: ["fabric", "textile", "shell", "lining"] },
  buttons: { catalog: ["accessories"], cues: ["button", "buttons", "shank", "snap", "rivet"] },
  zippers: { catalog: ["accessories", "trims"], cues: ["zip", "zipper", "coil", "slider", "puller"] },
  labels: { catalog: ["trims", "accessories"], cues: ["label", "labels", "hangtag", "hang-tag", "care-label"] },
  trims: { catalog: ["trims", "accessories"], cues: ["trim", "tape", "elastic", "cord", "patch", "interlining", "rib"] },
  yarns: { catalog: ["yarns"], cues: ["yarn", "thread", "sewing-thread"] },
  accessories: { catalog: ["accessories", "trims"], cues: ["accessory", "buckle", "hook", "eyelet", "grommet"] },
};

const BRIEF_SCHEMA = {
  type: "object",
  properties: {
    documentType: { type: "string", enum: ["tech_pack", "design_reference", "fabric_reference", "unsupported"] },
    documentConfidence: { type: "string", enum: ["high", "medium", "low"] },
    documentSummary: { type: "string" },
    unsupportedReason: { type: "string" },
    ocrEvidence: { type: "array", items: { type: "object", properties: {
      page: { type: "string" }, text: { type: "string" }
    }, required: ["page", "text"] } },
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
    bomItems: {
      type: "array",
      items: { type: "object", properties: {
        name: { type: "string" }, category: { type: "string", enum: BOM_CATEGORIES },
        specification: { type: "string" }, composition: { type: "string" },
        quantity: { type: "string" }, unit: { type: "string" },
        color: { type: "string" }, code: { type: "string" }, confidence: { type: "string" },
        source: { type: "string", enum: ["explicit_text", "visual_inference"] }
      }, required: ["name", "category", "confidence", "source"] }
    },
    unsupportedOrUnclear: { type: "array", items: { type: "string" } }
  },
  required: ["documentType", "documentConfidence", "documentSummary", "unsupportedReason", "ocrEvidence", "garmentType", "description", "fabrics", "trims", "bomItems", "construction", "colorways", "certifications", "unsupportedOrUnclear"]
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}
function safeText(value: unknown, max = 240) { return String(value || "").slice(0, max).trim(); }
function terms(value: unknown) {
  return safeText(value, 1000).toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) || [];
}
function scoreText(haystack: string, wanted: string[]) {
  const source = haystack.toLowerCase();
  return wanted.reduce((score, term) => score + (source.includes(term) ? 1 : 0), 0);
}
function canonicalTerm(term: string) {
  if (term === "zip" || term === "zipper" || term === "zippers") return "zipper";
  if (term === "knitted") return "knit";
  if (term === "labels") return "label";
  if (term === "buttons") return "button";
  return term;
}
function exactTermScore(haystack: string, wanted: string[]) {
  const sourceTerms = new Set(terms(haystack).map(canonicalTerm));
  return new Set(wanted.map(canonicalTerm)).size
    ? [...new Set(wanted.map(canonicalTerm))].filter(term => sourceTerms.has(term)).length
    : 0;
}
const MATERIAL_TERMS = ["cotton", "polyester", "linen", "wool", "silk", "nylon", "viscose", "rayon", "lyocell", "modal", "acrylic", "elastane", "spandex", "leather"];
const MATCH_STOP_WORDS = new Set(["article", "supplier", "placement", "unit", "cost", "body", "main", "centre", "center", "front", "back", "custom", "request", "with", "from", "and", "the", "for"]);
function gsm(value: unknown) {
  const match = safeText(value, 500).match(/(\d{2,4})\s*(?:\/\s*\d{2,4}\s*)?gsm/i);
  return match ? Number(match[1]) : null;
}
function materialMismatch(requirement: any, product: any) {
  const required = terms(requirement.composition).filter(term => MATERIAL_TERMS.includes(term));
  if (!required.length) return 0;
  const productMaterial = `${product.comp || ""} ${product.spec || ""}`.toLowerCase();
  const hasRequiredMaterial = required.some(term => productMaterial.includes(term));
  const hasDifferentMaterial = MATERIAL_TERMS.some(term => !required.includes(term) && productMaterial.includes(term));
  return !hasRequiredMaterial && hasDifferentMaterial ? 8 : 0;
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
  const ocrEvidence = Array.isArray(raw?.ocrEvidence) ? raw.ocrEvidence.slice(0, 20).map((x: any) => ({
    page: safeText(x?.page, 40), text: safeText(x?.text, 600)
  })).filter((x: any) => x.text) : [];
  const category = (...values: unknown[]) => {
    const source = values.map(value => safeText(value, 180)).join(" ").toLowerCase();
    if (/button|shank|snap|rivet/.test(source)) return "buttons";
    if (/zip|slider|puller/.test(source)) return "zippers";
    if (/label|hang\s*-?\s*tag|care\s*-?\s*tag/.test(source)) return "labels";
    if (/fabric|textile|shell|lining|main\s+material/.test(source)) return "fabrics";
    if (/yarn|thread/.test(source)) return "yarns";
    if (/trim|tape|elastic|cord|patch|interlining|rib/.test(source)) return "trims";
    if (/accessor|buckle|hook|eyelet|grommet/.test(source)) return "accessories";
    return "trims";
  };
  const bomItems = Array.isArray(raw?.bomItems) ? raw.bomItems.slice(0, 24).map((x: any) => ({
    name: safeText(x?.name, 120), category: category(x?.name, x?.category, x?.specification), specification: safeText(x?.specification, 180),
    composition: safeText(x?.composition, 120), quantity: safeText(x?.quantity, 80), unit: safeText(x?.unit, 40),
    color: safeText(x?.color, 100), code: safeText(x?.code, 80),
    confidence: ["high", "medium", "low"].includes(x?.confidence) ? x.confidence : "medium",
    source: x?.source === "visual_inference" ? "visual_inference" : "explicit_text"
  })).filter((x: any) => x.name) : [];
  const fabrics = requirements(raw?.fabrics);
  const trims = requirements(raw?.trims);
  if (!bomItems.length) {
    fabrics.forEach((item: any) => bomItems.push({ ...item, category: "fabrics", quantity: "", unit: "", color: "", code: "" }));
    trims.forEach((item: any) => bomItems.push({ ...item, category: category(item.name, item.specification), quantity: "", unit: "", color: "", code: "" }));
  }
  const bomFabrics = bomItems.filter((item: any) => item.category === "fabrics").map((item: any) => ({
    name: item.name, specification: item.specification, composition: item.composition, confidence: item.confidence
  }));
  const bomTrims = bomItems.filter((item: any) => item.category !== "fabrics").map((item: any) => ({
    name: item.name, specification: item.specification, composition: item.composition, confidence: item.confidence
  }));
  return {
    documentType: ["tech_pack", "design_reference", "fabric_reference", "unsupported"].includes(raw?.documentType) ? raw.documentType : "unsupported",
    documentConfidence: ["high", "medium", "low"].includes(raw?.documentConfidence) ? raw.documentConfidence : "low",
    documentSummary: safeText(raw?.documentSummary, 500), unsupportedReason: safeText(raw?.unsupportedReason, 300), ocrEvidence,
    garmentType: safeText(raw?.garmentType, 120) || (raw?.documentType === "fabric_reference" ? "Fabric reference" : "Garment design"),
    description: safeText(raw?.description, 600), quantities: safeText(raw?.quantities, 100), sizes: safeText(raw?.sizes, 100),
    targetRegion: safeText(raw?.targetRegion, 100), targetPrice: safeText(raw?.targetPrice, 100), leadTime: safeText(raw?.leadTime, 100),
    certifications: list(raw?.certifications), construction: list(raw?.construction), colorways: colors,
    fabrics: bomFabrics.length ? bomFabrics : fabrics,
    trims: bomTrims.length ? bomTrims : trims,
    bomItems,
    unsupportedOrUnclear: list(raw?.unsupportedOrUnclear)
  };
}

function matchCatalog(brief: ReturnType<typeof normalizeBrief>, products: any[], factories: any[]) {
  const briefWords = [brief.garmentType, brief.description, brief.construction.join(" "), brief.certifications.join(" "), brief.targetRegion, ...brief.bomItems.map((item: any) => `${item.name} ${item.specification} ${item.composition}`)].flatMap(terms);
  const activeProducts = products.filter(p => p.listing_status === "active");
  const mapProduct = (product: any, score: number, matchQuality: "exact" | "partial") => ({
    id: product.sku, name: product.name, img: product.img, comp: product.comp,
    spec: product.spec, price: Number(product.price), unit: product.unit_type,
    moq: product.moq == null ? "" : `${product.moq} ${product.unit_type || ""}`.trim(),
    seller: product.factory?.name || "", loc: product.loc,
    country: product.country || product.factory?.country || product.factory?.region || "",
    badge: product.badge || "", cat: product.category, matchScore: score, matchQuality
  });
  const requirementMatches = (requirements: any[], section: string) => requirements.map(requirement => {
    const definition = MATCH_DEFINITIONS[section] || MATCH_DEFINITIONS.accessories;
    const genericFabricTerms = new Set(["fabric", "material", "textile", "shell", "lining"]);
    const identityTerms = [...new Set([...terms(requirement.name), ...terms(requirement.specification), ...terms(requirement.color)])]
      .filter(term => !MATCH_STOP_WORDS.has(term));
    const scoredIdentityTerms = section === "fabrics" ? identityTerms.filter(term => !genericFabricTerms.has(term)) : identityTerms;
    const compositionTerms = terms(requirement.composition);
    const certificationTerms = terms(brief.certifications.join(" "));
    const ranked = activeProducts.filter(p => definition.catalog.includes(p.category)).map(p => {
      const source = [p.name, p.comp, p.spec, p.badge, p.loc, p.factory?.name, ...(p.factory?.tags || []), ...(p.factory?.certs || [])].join(" ");
      const productMaterial = [p.name, p.comp, p.spec, ...(p.factory?.certs || [])].join(" ");
      const requirementScore = scoreText(source, scoredIdentityTerms);
      const exactIdentityScore = exactTermScore(source, scoredIdentityTerms);
      const compositionScore = scoreText(productMaterial, compositionTerms);
      const certificationScore = scoreText(productMaterial, certificationTerms);
      const cueScore = scoreText(source, definition.cues);
      const score = requirementScore * 2 + compositionScore * 5 + certificationScore * 4 + cueScore - materialMismatch(requirement, p);
      const requiredComposition = compositionTerms.filter(term => /^[a-z]+$/.test(term) && term !== "gsm");
      const requiredCertifications = certificationTerms.filter(term => !["certified", "certification", "standard"].includes(term));
      const compositionExact = !requiredComposition.length || requiredComposition.every(term => productMaterial.toLowerCase().includes(term));
      const certificationExact = !requiredCertifications.length || requiredCertifications.every(term => productMaterial.toLowerCase().includes(term));
      const requestedGsm = gsm(`${requirement.composition} ${requirement.specification}`);
      const productGsm = gsm(`${p.comp || ""} ${p.spec || ""}`);
      const weightExact = !requestedGsm || (!!productGsm && Math.abs(productGsm - requestedGsm) <= Math.max(10, requestedGsm * .05));
      const identityTarget = Math.max(1, Math.ceil(scoredIdentityTerms.length * .75));
      const identityExact = scoredIdentityTerms.length > 0 && exactIdentityScore >= identityTarget;
      const hasExplicitFabricSpec = requiredComposition.length > 0 || !!requestedGsm;
      const exact = section === "fabrics"
        ? (hasExplicitFabricSpec ? compositionExact && weightExact && certificationExact : identityExact)
        : identityExact;
      return { product: p, score, matchQuality: exact ? "exact" as const : "partial" as const };
    }).filter(x => x.score >= (section === "fabrics" && compositionTerms.length ? 6 : 4))
      .sort((a, b) => (a.matchQuality === b.matchQuality ? b.score - a.score : a.matchQuality === "exact" ? -1 : 1))
      .slice(0, 6);
    const exactCount = ranked.filter(item => item.matchQuality === "exact").length;
    const visible = exactCount ? ranked : ranked.slice(0, 4);
    return { requirement, exactCount, partialCount: visible.length - exactCount, matches: visible.map(x => mapProduct(x.product, x.score, x.matchQuality)) };
  });
  const categories = BOM_CATEGORIES.map(category => ({
    category,
    groups: requirementMatches(brief.bomItems.filter((item: any) => item.category === category), category)
  })).filter(group => group.groups.length);
  const matchedSellerNames = new Set(categories.flatMap(category => category.groups.flatMap(group => group.matches.map((product: any) => product.seller))));
  const suppliers = factories.filter(f => f.verify_state === "verified" && /oem|garment/i.test(f.type || "")).map(factory => {
    const source = [factory.name, factory.type, factory.region, factory.loc, factory.bio, ...(factory.tags || []), ...(factory.certs || [])].join(" ");
    const typeBoost = 4;
    const catalogBoost = matchedSellerNames.has(factory.name) ? 6 : 0;
    const score = typeBoost + catalogBoost + scoreText(source, briefWords);
    const coverage = brief.bomItems.filter((r: any) => scoreText(source, terms(`${r.name} ${r.specification} ${r.composition}`)) > 0).length;
    return { id: factory.slug, name: factory.name, type: factory.type, region: factory.region, loc: factory.loc,
      verified: true, years: factory.years, moq: factory.moq, lead: factory.lead, rating: Number(factory.rating || 0),
      orders: factory.orders_label, capacity: factory.capacity, certs: factory.certs || [], tags: factory.tags || [], img: factory.img,
      bio: factory.bio, matchScore: score + coverage * 2, coverage, requirementCount: brief.bomItems.length };
  }).filter(f => f.coverage > 0 || matchedSellerNames.has(f.name)).sort((a, b) => b.matchScore - a.matchScore).slice(0, 8);
  return {
    suppliers,
    oems: suppliers,
    categories,
    fabrics: categories.find(group => group.category === "fabrics")?.groups || [],
    trims: categories.find(group => group.category === "trims")?.groups || []
  };
}

async function toInlinePart(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = file.type;
  const nativeBase64 = (bytes as any).toBase64;
  if (typeof nativeBase64 === "function") {
    return { inline_data: { mime_type: mimeType, data: nativeBase64.call(bytes) } };
  }
  // Avoid spreading a multi-megabyte Uint8Array into String.fromCharCode —
  // that exceeds the argument limit on large, valid tech-pack PDFs.
  let binary = "";
  const chunk = 0x8000;
  for (let start = 0; start < bytes.length; start += chunk) binary += String.fromCharCode(...bytes.subarray(start, start + chunk));
  return { inline_data: { mime_type: mimeType, data: btoa(binary) } };
}

async function uploadGeminiFile(file: File, apiKey: string) {
  const start = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files", {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(file.size),
      "X-Goog-Upload-Header-Content-Type": file.type,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: safeText(file.name, 160) || "design-reference" } }),
  });
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!start.ok || !uploadUrl) throw new Error(`file_upload_start_${start.status}`);

  const uploadedResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(file.size),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: file,
  });
  if (!uploadedResponse.ok) throw new Error(`file_upload_${uploadedResponse.status}`);
  const payload = await uploadedResponse.json();
  let uploaded = payload?.file;
  if (!uploaded?.name || !uploaded?.uri) throw new Error("file_upload_invalid_response");

  // Documents can remain PROCESSING well beyond 20 seconds. Poll with a
  // bounded backoff so valid PDFs are not rejected just because ingestion is
  // briefly busy, while still staying inside the Edge Function wall timeout.
  const deadline = Date.now() + FILE_PROCESSING_TIMEOUT_MS;
  let delay = 500;
  while (uploaded.state === "PROCESSING" && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, delay));
    const status = await fetch(`https://generativelanguage.googleapis.com/v1beta/${uploaded.name}`, {
      headers: { "x-goog-api-key": apiKey },
    });
    if (!status.ok) throw new Error(`file_status_${status.status}`);
    uploaded = await status.json();
    delay = Math.min(Math.round(delay * 1.5), 2500);
  }
  if (uploaded.state === "PROCESSING") throw new Error("file_processing_timeout");
  if (uploaded.state && uploaded.state !== "ACTIVE") throw new Error(`file_state_${uploaded.state.toLowerCase()}`);
  return uploaded;
}

async function deleteGeminiFile(name: string, apiKey: string) {
  try {
    await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}`, {
      method: "DELETE", headers: { "x-goog-api-key": apiKey },
    });
  } catch (_) {}
}

async function handleRequest(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
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
    return json({ ok: true, brief, results: matchCatalog(brief, productResult.data || [], factoryResult.data || []) });
  }

  let form: FormData;
  try { form = await req.formData(); } catch { return json({ ok: false, reason: "invalid_upload" }, 400); }
  const files = form.getAll("files").filter((item): item is File => item instanceof File);
  if (!files.length || files.length > MAX_FILES) return json({ ok: false, reason: "file_count" }, 400);
  const totalBytes = files.reduce((n, file) => n + file.size, 0);
  if (files.some(file => file.size > (file.type === PDF ? MAX_PDF_BYTES : MAX_IMAGE_BYTES)) || totalBytes > MAX_TOTAL_BYTES) return json({ ok: false, reason: "file_size" }, 413);
  if (files.some(file => !IMAGE_TYPES.has(file.type) && file.type !== PDF)) return json({ ok: false, reason: "unsupported_file" }, 415);

  let reservedUsage: any = null;
  const unlimited = (user.email || "").toLowerCase() === UNLIMITED_EMAIL;
  if (!unlimited) {
    const { data, error } = await admin
      .rpc("reserve_athelia_usage", { p_profile_id: user.id, p_max_calls: MAX_DAILY_CALLS })
      .single();
    if (error || !data) {
      console.error("[design-match] Usage reservation failed", error);
      return json({ ok: false, reason: "usage_unavailable", stage: "usage" }, 503);
    }
    reservedUsage = data;
    if (!reservedUsage.allowed) return json({
      ok: false,
      reason: "limit_reached",
      stage: "usage",
      contact: "info@arcanawangsa.com",
      usage: { callCount: reservedUsage.call_count, maxCalls: MAX_DAILY_CALLS }
    }, 429);
  }

  const parts: any[] = [];
  const temporaryFiles: string[] = [];
  try {
    const useFilesApi = totalBytes > MAX_INLINE_TOTAL_BYTES;
    for (const file of files) {
      if (useFilesApi) {
        const uploaded = await uploadGeminiFile(file, apiKey);
        temporaryFiles.push(uploaded.name);
        parts.push({ file_data: { mime_type: uploaded.mimeType || file.type, file_uri: uploaded.uri } });
      } else {
        parts.push(await toInlinePart(file));
      }
    }
  } catch (error) {
    await Promise.all(temporaryFiles.map(name => deleteGeminiFile(name, apiKey)));
    console.error("[design-match] Gemini file upload failed", error);
    const detail = error instanceof Error ? error.message : "file_upload_failed";
    return json({ ok: false, reason: "analysis_failed", stage: "file_upload", detail }, 502);
  }

  const prompt = `You are Athelia's document intake and sourcing-analysis engine. Process every uploaded page in this order:
1. OCR: read visible headings, annotations, tables, measurements, material labels, Pantone codes, and BOM rows. Put concise verbatim evidence snippets with page references in ocrEvidence.
2. Classify the upload as exactly one documentType:
   - tech_pack: a garment technical package containing technical drawings, measurements, construction notes, specifications, or a bill of materials.
   - design_reference: a garment photo, sketch, illustration, moodboard, or design image that lacks a usable technical specification but can still inform fabric sourcing.
   - fabric_reference: a fabric close-up, swatch, textile sample, fabric label, or material photo that can inform fabric sourcing, even when no complete garment is visible.
   - unsupported: not a garment sourcing/design document, or too unreadable to identify a garment or material direction.
3. Extract and analyze:
   - For tech_pack, extract explicit BOM rows, specifications, quantities, units, composition, colors, codes, construction, sizes, and certifications. Use source=explicit_text. Never invent missing facts.
   - For design_reference, infer only visible fabric/material requirements that would help source the shown design. Use category=fabrics, source=visual_inference, and medium or low confidence. Describe observable cues such as drape, sheen, weight, texture, knit/woven appearance, stretch, transparency, or structure. Do not invent composition, GSM, certification, quantity, price, or supplier facts.
   - For fabric_reference, OCR any visible label or swatch text first, then create only fabric BOM requirements. Preserve printed composition, GSM, construction, certification, color, and codes as explicit_text. Otherwise use visual_inference with medium or low confidence and describe only visible weave/knit, texture, sheen, weight, stretch, transparency, structure, and color cues. Never invent composition, GSM, certification, quantity, price, or supplier facts.
   - For unsupported, explain why in unsupportedReason and return empty sourcing arrays.
4. Normalize supported BOM items into these exact categories: shell and lining materials=fabrics; buttons, snaps, and rivets=buttons; zippers, sliders, and pullers=zippers; brand, care, size, and hang labels/tags=labels; sewing yarn and thread=yarns; tapes, elastic, cords, patches, rib, and interlining=trims; buckles, hooks, eyelets, grommets, and other hardware=accessories.
Return only JSON matching the schema. The resulting supported brief will be matched deterministically against Atelix's verified catalog.`;
  let gemini: any;
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
      body: JSON.stringify({
        contents: [{ role: "user", parts: [...parts, { text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", responseJsonSchema: BRIEF_SCHEMA, thinkingConfig: { thinkingLevel: "medium" } }
      })
    });
    if (!response.ok) {
      const providerBody = (await response.text()).slice(0, 2000);
      console.error("[design-match] Gemini error", response.status, providerBody.slice(0, 500));
      let providerCode = "";
      try { providerCode = JSON.parse(providerBody)?.error?.status || ""; } catch (_) {}
      const creditsExhausted = response.status === 429 && providerCode === "RESOURCE_EXHAUSTED";
      return json({ ok: false, reason: creditsExhausted ? "analysis_unavailable" : "analysis_failed", stage: creditsExhausted ? "provider_capacity" : "model", detail: creditsExhausted ? "credits_exhausted" : providerCode, upstreamStatus: response.status }, creditsExhausted ? 503 : 502);
    }
    gemini = await response.json();
  } catch (error) { console.error("[design-match] Gemini request failed", error); return json({ ok: false, reason: "analysis_failed", stage: "model_request" }, 502); }
  finally { await Promise.all(temporaryFiles.map(name => deleteGeminiFile(name, apiKey))); }
  const tokensUsed = gemini?.usageMetadata?.totalTokenCount
    ?? ((gemini?.usageMetadata?.promptTokenCount || 0) + (gemini?.usageMetadata?.candidatesTokenCount || 0));
  if (!unlimited && tokensUsed > 0) {
    const { error } = await admin.rpc("add_athelia_tokens", { p_profile_id: user.id, p_tokens: tokensUsed });
    if (error) console.error("[design-match] Token accounting failed", error);
  }
  const candidate = gemini?.candidates?.[0];
  const text = candidate?.content?.parts?.find((part: any) => part.text)?.text;
  if (!text) {
    const finishReason = candidate?.finishReason || gemini?.promptFeedback?.blockReason || "empty_response";
    console.error("[design-match] Gemini returned no structured text", { finishReason, promptFeedback: gemini?.promptFeedback });
    return json({ ok: false, reason: "analysis_failed", stage: "model_output", detail: finishReason }, 502);
  }
  let brief: ReturnType<typeof normalizeBrief>;
  try { brief = normalizeBrief(JSON.parse(text)); }
  catch (error) {
    console.error("[design-match] Gemini returned invalid structured JSON", error, text.slice(0, 500));
    return json({ ok: false, reason: "analysis_failed", stage: "structured_output" }, 502);
  }

  if (brief.documentType === "unsupported") {
    return json({ ok: false, reason: "unsupported_document", stage: "classification", document: {
      type: brief.documentType, confidence: brief.documentConfidence, summary: brief.documentSummary,
      reason: brief.unsupportedReason, ocrEvidence: brief.ocrEvidence
    } }, 422);
  }

  const [productResult, factoryResult] = await Promise.all([
    admin.from("products").select("*, factory:factories(*)").eq("listing_status", "active").limit(500),
    admin.from("factories").select("*").eq("verify_state", "verified").limit(300)
  ]);
  if (productResult.error || factoryResult.error) return json({ ok: false, reason: "catalog_unavailable" }, 503);
  const results = matchCatalog(brief, productResult.data || [], factoryResult.data || []);
  return json({ ok: true, brief, results, usage: unlimited ? { unlimited: true } : {
    callCount: reservedUsage.call_count, maxCalls: MAX_DAILY_CALLS
  }, document: {
    type: brief.documentType, confidence: brief.documentConfidence, summary: brief.documentSummary,
    ocrEvidence: brief.ocrEvidence
  }, files: files.map(file => ({ name: safeText(file.name, 160), size: file.size })) });
}

Deno.serve(async req => {
  try {
    return await handleRequest(req);
  } catch (error) {
    console.error("[design-match] Unhandled request failure", error);
    return json({
      ok: false,
      reason: "internal_error",
      stage: "request",
      detail: error instanceof Error ? error.message : "unknown_error"
    }, 500);
  }
});
