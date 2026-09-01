// Deterministic supplier-routing prior. Pure, no I/O — unit-testable and used
// as the always-available fallback ranking when the model path is unavailable.
//
// Eligibility is NOT decided here (Postgres owns that). This module only turns
// the buyer-stated RFQ into routing signals, scores each enabled country against
// the Ops dimension policy, and ranks the real candidate suppliers.

export type Tier = "low" | "mid" | "high" | "unstated";
export type ComplexityTier = "unstated" | "simple" | "mid" | "high";

export type RoutingSignals = {
  price: Tier;
  quality: Tier;
  complexity: ComplexityTier;
  premiumCuration: boolean;
  leadTime: "urgent" | "normal" | "unstated"; // urgent = < ~1 month
  moq: Tier;
  simplicity: boolean; // short prompt, no attachments, few populated brief fields
};

export type CountryProfile = {
  country: string;
  enabled?: boolean;
  price_tiers: string[];
  quality_tiers: string[];
  complexity_tiers: string[];
  premium_curation: boolean;
  fast_lead_time: boolean;
  low_moq: boolean;
  fallback_rank: number;
  version?: number;
};

export type Candidate = {
  factory_id: string;
  name?: string;
  type?: string;
  region?: string;
  country?: string;
  moq?: string | null;
  lead?: string | null;
  capacity?: string | null;
  tags?: string[];
  certs?: string[];
  rating?: number | null;
  years?: number | null;
  bio_excerpt?: string;
};

export type RoutingContext = {
  rfq?: { title?: string; brief?: Record<string, unknown>; intake?: Record<string, unknown> | null };
  buyer_prompt?: string;
  reference_facts?: { field_key: string; value: string; confidence?: string }[];
  bom_lines?: { component?: string; specification?: string }[];
  attachment_excerpts?: { name?: string; text?: string }[];
  country_profiles?: CountryProfile[];
  candidates?: Candidate[];
};

export type ScoredCandidate = {
  factory_id: string;
  score: number; // 0..100
  rank: number;
  country: string;
  countryScore: number;
  factFit: number;
  dimensionBreakdown: Record<string, { fit: number; weight: number }>;
};

const SIMPLICITY_COUNTRIES = new Set(["vietnam", "indonesia", "china", "malaysia"]);

const WEIGHTS = {
  price: 0.22,
  quality: 0.2,
  complexity: 0.18,
  moq: 0.15,
  premium: 0.15,
  simplicity: 0.1,
};

function textBlob(ctx: RoutingContext): string {
  const parts: string[] = [];
  if (ctx.buyer_prompt) parts.push(ctx.buyer_prompt);
  if (ctx.rfq?.title) parts.push(ctx.rfq.title);
  const fields = (ctx.rfq?.brief as { fields?: Record<string, unknown> } | undefined)?.fields;
  if (fields && typeof fields === "object") {
    for (const v of Object.values(fields)) if (typeof v === "string") parts.push(v);
  }
  for (const f of ctx.reference_facts ?? []) parts.push(`${f.field_key}: ${f.value}`);
  for (const a of ctx.attachment_excerpts ?? []) if (a.text) parts.push(a.text);
  return parts.join("\n").toLowerCase();
}

function briefField(ctx: RoutingContext, key: string): string {
  const fields = (ctx.rfq?.brief as { fields?: Record<string, unknown> } | undefined)?.fields;
  const v = fields && typeof fields === "object" ? fields[key] : undefined;
  return typeof v === "string" ? v.toLowerCase() : "";
}

function factValue(ctx: RoutingContext, key: string): string {
  const hit = (ctx.reference_facts ?? []).find((f) => f.field_key === key);
  return hit ? hit.value.toLowerCase() : "";
}

export function extractSignals(ctx: RoutingContext): RoutingSignals {
  const blob = textBlob(ctx);
  const budget = `${briefField(ctx, "budget")} ${factValue(ctx, "budget")} ${blob}`;
  const quantity = `${briefField(ctx, "quantity")} ${factValue(ctx, "quantity")}`;
  const timeline = `${briefField(ctx, "timeline")} ${factValue(ctx, "timeline")} ${blob}`;

  let price: Tier = "unstated";
  if (/low cost|lowest price|price sensitive|tight budget|cost sensitive|affordable|cheap/.test(budget)) price = "low";
  else if (/premium|luxury|high[- ]end|willing to pay|no budget constraint|top tier/.test(budget)) price = "high";
  else if (/\$\s?\d/.test(budget) || /\bmid[- ]range\b/.test(budget)) price = "mid";

  let quality: Tier = "unstated";
  if (/luxury|heirloom|fine|high quality|premium finish|investment piece|couture|impeccable/.test(blob)) quality = "high";
  else if (/basic|value|budget make|simple make|entry level/.test(blob)) quality = "low";
  else if (/\b(construction|stitch|seam|gsm|finish|lining|canvas)\b/.test(blob)) quality = "mid";

  const bomCount = (ctx.bom_lines ?? []).length;
  let complexity: ComplexityTier = "unstated";
  if (bomCount >= 5) complexity = "high";
  else if (bomCount >= 2) complexity = "mid";
  else if (bomCount >= 1) complexity = "simple";
  if (/tech[ -]?pack/.test(blob) || (ctx.reference_facts ?? []).some((f) => f.field_key === "tech_pack")) {
    complexity = complexity === "high" ? "high" : complexity === "mid" ? "high" : "mid";
  }
  if (/embellish|multi-panel|multi panel|tailored|structured|pleated|hand-finished|hand finished|intricate/.test(blob)) {
    complexity = complexity === "unstated" || complexity === "simple" ? "mid" : "high";
  }

  const premiumCuration =
    /luxury house|premium curation|curated maker|atelier|couture|artisan house/.test(blob) ||
    (quality === "high" && price === "high");

  let leadTime: RoutingSignals["leadTime"] = "unstated";
  const m = timeline.match(/(?:within|in|under|by)\s*(\d+)\s*(day|week|month)/);
  if (m) {
    const n = Number(m[1]);
    const days = m[2] === "day" ? n : m[2] === "week" ? n * 7 : n * 30;
    leadTime = days < 30 ? "urgent" : "normal";
  } else if (/urgent|rush|asap|as soon as possible|quick turnaround/.test(timeline)) leadTime = "urgent";

  let moq: Tier = "unstated";
  const q = quantity.match(/(\d[\d,]*)\s*(pc|pcs|piece|unit|units)?/);
  const qn = q ? Number(q[1].replace(/,/g, "")) : NaN;
  if (/small run|sample order|low moq|small batch/.test(`${quantity} ${blob}`)) moq = "low";
  else if (!Number.isNaN(qn)) moq = qn < 500 ? "low" : qn <= 5000 ? "mid" : "high";

  const populatedFields = Object.values(
    ((ctx.rfq?.brief as { fields?: Record<string, unknown> } | undefined)?.fields) ?? {},
  ).filter((v) => typeof v === "string" && v.trim().length > 0).length;
  const simplicity =
    (ctx.buyer_prompt ?? "").length < 240 &&
    (ctx.attachment_excerpts ?? []).length === 0 &&
    populatedFields < 3;

  return { price, quality, complexity, premiumCuration, leadTime, moq, simplicity };
}

function tierFit(signal: string, tiers: string[]): number {
  if (signal === "unstated" || tiers.length === 0) return 0.5;
  return tiers.includes(signal) ? 1 : 0.1;
}

export function computeCountryScores(
  signals: RoutingSignals,
  profiles: CountryProfile[],
): Record<string, number> {
  const raw: Record<string, number> = {};
  for (const p of profiles) {
    if (p.enabled === false) continue;
    if (signals.leadTime === "urgent" && !p.fast_lead_time) {
      raw[p.country] = 0;
      continue;
    }
    const priceFit = tierFit(signals.price, p.price_tiers);
    const qualityFit = tierFit(signals.quality, p.quality_tiers);
    const complexityFit = tierFit(signals.complexity, p.complexity_tiers);
    const moqTerm = signals.moq === "low" ? (p.low_moq ? 1 : 0.15) : 0.5;
    const premiumTerm = signals.premiumCuration
      ? p.premium_curation ? 1 : 0.1
      : p.premium_curation ? 0.15 : 1;
    const simplicityTerm = signals.simplicity
      ? SIMPLICITY_COUNTRIES.has(p.country.toLowerCase()) ? 1 : 0.5
      : 0.5;
    raw[p.country] =
      WEIGHTS.price * priceFit +
      WEIGHTS.quality * qualityFit +
      WEIGHTS.complexity * complexityFit +
      WEIGHTS.moq * moqTerm +
      WEIGHTS.premium * premiumTerm +
      WEIGHTS.simplicity * simplicityTerm;
  }
  const max = Math.max(0.0001, ...Object.values(raw));
  const out: Record<string, number> = {};
  for (const [c, v] of Object.entries(raw)) out[c] = Math.max(0, Math.min(1, v / max));
  return out;
}

const CATEGORY_TYPES: Record<string, string[]> = {
  apparel: ["garment_manufacturer"],
  fabric: ["fabric_mill", "textile_trading_company", "material_innovator"],
  trims_labels: ["trim_supplier", "accessories_supplier"],
  packaging: ["accessories_supplier", "trim_supplier"],
  bags_accessories: ["accessories_supplier", "garment_manufacturer"],
  beauty_personal_care: ["material_innovator"],
};

function candidateFactFit(ctx: RoutingContext, signals: RoutingSignals, c: Candidate): number {
  let score = 0.4;
  const category = String(ctx.rfq?.intake?.["category"] ?? ctx.rfq?.intake?.["subtype"] ?? "").toLowerCase();
  const wanted = CATEGORY_TYPES[category];
  if (wanted && c.type) score += wanted.includes(c.type) ? 0.3 : -0.15;
  const rating = typeof c.rating === "number" ? c.rating : null;
  if (rating != null) score += (Math.max(0, Math.min(5, rating)) / 5) * 0.2;
  const requiredTags = Array.isArray((ctx.rfq?.brief as { required_tags?: unknown })?.required_tags)
    ? ((ctx.rfq!.brief as { required_tags: string[] }).required_tags).map((t) => t.toLowerCase())
    : [];
  const certs = (c.certs ?? []).map((x) => x.toLowerCase());
  const tags = (c.tags ?? []).map((x) => x.toLowerCase());
  if (requiredTags.length) {
    const hit = requiredTags.filter((t) => certs.includes(t) || tags.includes(t)).length / requiredTags.length;
    score += hit * 0.15;
  }
  if (signals.premiumCuration && tags.includes("premium")) score += 0.05;
  return Math.max(0, Math.min(1, score));
}

export function scoreCandidates(
  ctx: RoutingContext,
  signals: RoutingSignals,
  countryScores: Record<string, number>,
  candidates: Candidate[],
): ScoredCandidate[] {
  const scored = candidates.map((c) => {
    const country = c.country || c.region || "";
    const cs = countryScores[country] ?? countryScores[titleCase(country)] ?? 0.15;
    const factFit = candidateFactFit(ctx, signals, c);
    const total = 0.65 * cs + 0.35 * factFit;
    return {
      factory_id: c.factory_id,
      score: Math.round(Math.min(85, total * 100) * 1000) / 1000,
      rank: 0,
      country,
      countryScore: cs,
      factFit,
      dimensionBreakdown: {
        price: { fit: tierFit(signals.price, []), weight: WEIGHTS.price },
        country: { fit: cs, weight: 0.65 },
        factFit: { fit: factFit, weight: 0.35 },
      },
    };
  });
  scored.sort((a, b) => b.score - a.score);
  scored.forEach((s, i) => (s.rank = i + 1));
  return scored;
}

export function hardFallbackOrder(
  candidates: Candidate[],
  profiles: CountryProfile[],
): ScoredCandidate[] {
  const rankByCountry = new Map(profiles.map((p) => [p.country.toLowerCase(), p.fallback_rank]));
  const withRank = candidates.map((c) => {
    const country = (c.country || c.region || "").toLowerCase();
    return {
      c,
      fallbackRank: rankByCountry.get(country) ?? 999,
      rating: typeof c.rating === "number" ? c.rating : 0,
    };
  });
  withRank.sort((a, b) => a.fallbackRank - b.fallbackRank || b.rating - a.rating);
  return withRank.map((x, i) => ({
    factory_id: x.c.factory_id,
    score: Math.round(Math.max(1, 40 - x.fallbackRank) * 1000) / 1000,
    rank: i + 1,
    country: x.c.country || x.c.region || "",
    countryScore: 0,
    factFit: 0,
    dimensionBreakdown: { hardFallback: { fit: 1, weight: 1 } },
  }));
}

function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
}

export function computeRoutingPrior(ctx: RoutingContext) {
  const profiles = ctx.country_profiles ?? [];
  const candidates = ctx.candidates ?? [];
  const signals = extractSignals(ctx);
  const countryScores = computeCountryScores(signals, profiles);
  const scored = scoreCandidates(ctx, signals, countryScores, candidates);
  return { signals, countryScores, scored };
}
