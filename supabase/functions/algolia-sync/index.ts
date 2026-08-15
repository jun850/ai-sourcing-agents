import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const PUBLIC_INDEX = "atelix_app_7lq8h80eli_products";
const PUBLIC_FACTORIES_INDEX = "atelix_app_7lq8h80eli_factories";
const PUBLIC_SUGGESTIONS_INDEX = "atelix_app_7lq8h80eli_query_suggestions";
const PRIVATE_ORDERS_INDEX = "atelix_private_orders";
const PRIVATE_WISHLIST_INDEX = "atelix_private_wishlist";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-algolia-sync-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function verifiedGatewayRole(authorization: string) {
  const token = authorization.replace(/^Bearer\s+/i, "");
  const encoded = token.split(".")[1];
  if (!encoded) return "";
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    return String(JSON.parse(atob(base64))?.role || "");
  } catch { return ""; }
}

function algoliaUrl(index: string, suffix = "") { return `https://${Deno.env.get("ALGOLIA_APP_ID")}-dsn.algolia.net/1/indexes/${encodeURIComponent(index)}${suffix}`; }
async function algolia(index: string, body: unknown, suffix = "/batch", admin = false, method = "POST") {
  const key = Deno.env.get(admin ? "ALGOLIA_ADMIN_API_KEY" : "ALGOLIA_WRITE_API_KEY");
  if (!key) throw new Error("algolia_not_configured");
  const result = await fetch(algoliaUrl(index, suffix), { method, headers: { "X-Algolia-Application-Id": Deno.env.get("ALGOLIA_APP_ID")!, "X-Algolia-API-Key": key, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!result.ok) throw new Error(`algolia_${result.status}:${await result.text()}`);
  return result.json();
}
async function indexedObjectIds(index: string) {
  const key = Deno.env.get("ALGOLIA_ADMIN_API_KEY");
  if (!key) throw new Error("algolia_not_configured");
  const ids: string[] = [];
  let cursor = "";
  do {
    const suffix = `/browse?attributesToRetrieve=objectID${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const response = await fetch(algoliaUrl(index, suffix), { headers: { "X-Algolia-Application-Id": Deno.env.get("ALGOLIA_APP_ID")!, "X-Algolia-API-Key": key } });
    if (!response.ok) throw new Error(`algolia_${response.status}:${await response.text()}`);
    const page = await response.json();
    ids.push(...(page.hits || []).map((hit: any) => String(hit.objectID)).filter(Boolean));
    cursor = page.cursor || "";
  } while (cursor);
  return ids;
}
async function pruneIndex(index: string, validIds: Set<string>) {
  const stale = (await indexedObjectIds(index)).filter(id => !validIds.has(id));
  if (stale.length) await algolia(index, { requests: stale.map(objectID => ({ action: "deleteObject", body: { objectID } })) });
  return stale.length;
}

function plain(value: unknown) { return String(value ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim(); }
function compact(value: unknown, max = 1200) { const text = plain(value); return text.length > max ? text.slice(0, max).trimEnd() : text; }
function publicRecord(product: any) {
  const factory = Array.isArray(product.factories) ? product.factories[0] : product.factories;
  const media = [...(product.product_media || [])].sort((a: any, b: any) => Number(a.position) - Number(b.position));
  const localized = Object.values(product.copy_i18n || {}) as any[];
  const city = plain(product.loc).split(",")[0];
  const description = [product.description, product.comp, product.spec, product.construction, product.applications].map(plain).filter(Boolean).join(" · ");
  return {
    objectID: product.sku, sku: product.sku, style_code: product.style_code || "", name: product.name,
    description, localized_names: localized.map(copy => compact(copy?.name, 200)).filter(Boolean), localized_descriptions: localized.map(copy => compact(copy?.description)).filter(Boolean),
    category: product.category, subcategory: product.subcategory || "", construction: product.construction_slug || "", composition: product.comp || "", specification: product.spec || "",
    supplier: factory?.name || "", country: product.country || "", city, price: Number(product.price || 0), unit: product.unit_type || "", moq: Number(product.moq || 0),
    lead_time: product.lead_time || "", image: media[0]?.thumb_url || media[0]?.public_url || product.img || "", url: `https://atelix.app/pages/product.html?id=${encodeURIComponent(product.sku)}`,
  };
}
async function publicProduct(admin: any, id: string) {
  const { data } = await admin.from("products").select("*, product_media(role,position,public_url,thumb_url), factories(name,verify_state,archived_at)").eq("id", id).maybeSingle();
  const factory = Array.isArray(data?.factories) ? data.factories[0] : data?.factories;
  if (!data || data.listing_status !== "active" || data.is_private || data.archived_at || factory?.verify_state !== "verified" || factory?.archived_at) return null;
  return publicRecord(data);
}
async function syncPublicProduct(admin: any, id: string, deletedSku?: string) {
  const record = await publicProduct(admin, id);
  if (record) return algolia(PUBLIC_INDEX, { requests: [{ action: "updateObject", body: record }] });
  return deletedSku ? algolia(PUBLIC_INDEX, { requests: [{ action: "deleteObject", body: { objectID: deletedSku } }] }) : undefined;
}
async function syncFactoryProducts(admin: any, id: string) {
  const { data = [] } = await admin.from("products").select("id").eq("factory_id", id);
  await Promise.all(data.map((product: any) => syncPublicProduct(admin, product.id)));
}
function factoryRecord(factory: any) {
  const localized = Object.values(factory.copy_i18n || {}) as any[];
  const taxonomy = (factory.supplier_taxonomy_memberships || []).map((item: any) => `${plain(item.l2)}/${plain(item.l3)}`);
  return {
    objectID: factory.slug,
    id: factory.slug,
    name: factory.name,
    type: factory.type,
    country: factory.region || "",
    city: plain(factory.loc).split(",")[0],
    location: factory.loc || "",
    certifications: (factory.certs || []).slice(0, 40).map((value: unknown) => compact(value, 120)),
    capabilities: (factory.tags || []).slice(0, 40).map((value: unknown) => compact(value, 120)),
    moq: factory.moq || "",
    lead_time: factory.lead || "",
    description: compact(factory.bio),
    localized_names: localized.map(copy => compact(copy?.name, 200)).filter(Boolean),
    localized_descriptions: localized.map(copy => compact(copy?.description)).filter(Boolean),
    taxonomy,
    image: factory.img || "",
    verified: factory.verify_state === "verified",
    url: `https://atelix.app/pages/supplier.html?id=${encodeURIComponent(factory.slug)}`,
  };
}
async function syncPublicFactory(admin: any, id: string, deletedSlug?: string) {
  const { data } = await admin.from("factories").select("*, supplier_taxonomy_memberships(l2,l3,is_primary)").eq("id", id).maybeSingle();
  const { count } = data ? await admin.from("products").select("id", { count: "exact", head: true }).eq("factory_id", id).eq("listing_status", "active").eq("is_private", false).is("archived_at", null) : { count: 0 };
  if(data?.verify_state === "verified" && !data.archived_at && Number(count || 0) > 0) return algolia(PUBLIC_FACTORIES_INDEX, { requests: [{ action: "updateObject", body: factoryRecord(data) }] });
  const slug=data?.slug||deletedSlug;
  if(slug) return algolia(PUBLIC_FACTORIES_INDEX, { requests: [{ action: "deleteObject", body: { objectID: slug } }] });
}
async function syncOrder(admin: any, id: string) {
  const { data: order } = await admin.from("orders").select("id,order_no,buyer_profile_id,status,total,placed_at,order_items(sku_snapshot,name_snapshot,seller_snapshot,qty)").eq("id", id).maybeSingle();
  if (!order) return algolia(PRIVATE_ORDERS_INDEX, { requests: [{ action: "deleteObject", body: { objectID: `order_${id}` } }] });
  const lines = (order.order_items || []).map((item: any) => [item.sku_snapshot, item.name_snapshot, item.seller_snapshot].filter(Boolean).join(" "));
  return algolia(PRIVATE_ORDERS_INDEX, { requests: [{ action: "updateObject", body: { objectID: `order_${order.id}`, owner_profile_id: order.buyer_profile_id, order_no: order.order_no, status: order.status, total: Number(order.total || 0), placed_at: order.placed_at, searchable_text: lines.join(" · ") } }] });
}
async function syncWishlist(admin: any, profileId: string, productId: string) {
  const { data: saved } = await admin.from("saved_items").select("profile_id,qty,products(id,sku,name,comp,spec,category,factories(name))").eq("profile_id", profileId).eq("product_id", productId).maybeSingle();
  const objectID = `wishlist_${profileId}_${productId}`;
  if (!saved || !saved.products) return algolia(PRIVATE_WISHLIST_INDEX, { requests: [{ action: "deleteObject", body: { objectID } }] });
  const product: any = saved.products;
  const factory = Array.isArray(product.factories) ? product.factories[0] : product.factories;
  return algolia(PRIVATE_WISHLIST_INDEX, { requests: [{ action: "updateObject", body: { objectID, owner_profile_id: profileId, sku: product.sku, product_id: product.id, name: product.name, category: product.category, supplier: factory?.name || "", searchable_text: [product.name, product.sku, product.comp, product.spec, factory?.name].filter(Boolean).join(" · "), qty: Number(saved.qty || 1), url: `https://atelix.app/pages/product.html?id=${encodeURIComponent(product.sku)}` } }] });
}
async function configureIndexes() {
  await algolia(PUBLIC_INDEX, { searchableAttributes: ["unordered(sku)", "unordered(style_code)", "unordered(name)", "unordered(localized_names)", "unordered(description)", "unordered(localized_descriptions)", "unordered(supplier)", "unordered(category)", "unordered(subcategory)", "unordered(construction)"], attributesForFaceting: ["filterOnly(category)", "filterOnly(subcategory)", "filterOnly(construction)", "filterOnly(country)"], customRanking: ["asc(price)", "asc(moq)"], queryType: "prefixLast", removeWordsIfNoResults: "none", exactOnSingleWordQuery: "attribute", alternativesAsExact: ["ignorePlurals", "singleWordSynonym"] }, "/settings", true, "PUT");
  await algolia(PUBLIC_FACTORIES_INDEX, { searchableAttributes: ["unordered(name)", "unordered(localized_names)", "unordered(type)", "unordered(taxonomy)", "unordered(capabilities)", "unordered(certifications)", "unordered(description)", "unordered(localized_descriptions)", "unordered(country)", "unordered(city)"], attributesForFaceting: ["filterOnly(type)", "filterOnly(country)", "filterOnly(certifications)", "filterOnly(taxonomy)"], customRanking: ["desc(verified)"], queryType: "prefixLast", removeWordsIfNoResults: "none", exactOnSingleWordQuery: "attribute", alternativesAsExact: ["ignorePlurals", "singleWordSynonym"] }, "/settings", true, "PUT");
  await algolia(PUBLIC_SUGGESTIONS_INDEX, { searchableAttributes: ["unordered(query)", "unordered(category)"], customRanking: ["desc(weight)"], queryType: "prefixAll", removeWordsIfNoResults: "none" }, "/settings", true, "PUT");
  await Promise.all([PRIVATE_ORDERS_INDEX, PRIVATE_WISHLIST_INDEX].map(index => algolia(index, { searchableAttributes: ["unordered(order_no)", "unordered(name)", "unordered(sku)", "unordered(supplier)", "unordered(searchable_text)"], attributesForFaceting: ["filterOnly(owner_profile_id)"], queryType: "prefixLast", removeWordsIfNoResults: "none" }, "/settings", true, "PUT")));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const authorization = req.headers.get("Authorization") || "";
  const internal = (!!Deno.env.get("ALGOLIA_SYNC_SECRET") && req.headers.get("x-algolia-sync-secret") === Deno.env.get("ALGOLIA_SYNC_SECRET")) ||
    (!!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") && authorization === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`) ||
    verifiedGatewayRole(authorization) === "service_role";
  let requester: any = null;
  if (!internal) {
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return json({ error: "unauthorized" }, 401);
    const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profile?.role !== "admin") return json({ error: "forbidden" }, 403);
    requester = user;
  }
  const { action = "process_queue", limit = 100 } = await req.json().catch(() => ({}));
  try {
    if (action === "configure") { await configureIndexes(); return json({ ok: true }); }
    if (action === "reindex_factories") {
      const [{ data: factories = [] }, { data: productFactories = [] }] = await Promise.all([
        admin.from("factories").select("*, supplier_taxonomy_memberships(l2,l3,is_primary)").eq("verify_state", "verified").is("archived_at", null),
        admin.from("products").select("factory_id").eq("listing_status", "active").eq("is_private", false).is("archived_at", null),
      ]);
      const active = new Set(productFactories.map((product: any) => product.factory_id));
      const requests = factories.filter((factory: any) => active.has(factory.id)).map(factoryRecord).map((body: any) => ({ action: "updateObject", body }));
      for (let offset = 0; offset < requests.length; offset += 500) await algolia(PUBLIC_FACTORIES_INDEX, { requests: requests.slice(offset, offset + 500) });
      return json({ ok: true, factories: requests.length });
    }
    if (action === "reindex_public") {
      const [{ data: products = [] }, { data: factories = [] }] = await Promise.all([
        admin.from("products").select("*, product_media(role,position,public_url,thumb_url), factories(name,verify_state,archived_at)").eq("listing_status", "active").eq("is_private", false).is("archived_at", null),
        admin.from("factories").select("*, supplier_taxonomy_memberships(l2,l3,is_primary)").eq("verify_state", "verified").is("archived_at", null),
      ]);
      const productRequests = products.filter((product: any) => {
        const factory = Array.isArray(product.factories) ? product.factories[0] : product.factories;
        return factory?.verify_state === "verified" && !factory?.archived_at;
      }).map(publicRecord).map((body: any) => ({ action: "updateObject", body }));
      const factoryIdsWithProducts = new Set(products.map((product: any) => product.factory_id));
      const factoryRequests = factories.filter((factory: any) => factoryIdsWithProducts.has(factory.id)).map(factoryRecord).map((body: any) => ({ action: "updateObject", body }));
      const suggestions = [
        ["cotton twill", "Fabrics", 100], ["linen fabric", "Fabrics", 95], ["organic cotton jersey", "Fabrics", 92],
        ["denim", "Fabrics", 90], ["recycled polyester", "Fabrics", 88], ["wool suiting", "Fabrics", 84],
        ["ykk zipper", "Trims", 82], ["metal buttons", "Trims", 78], ["woven labels", "Accessories", 76],
        ["oem clothing", "OEM Services", 74], ["private label manufacturer", "OEM Services", 72], ["sock manufacturer", "OEM Services", 68],
      ].map(([query, category, weight], index) => ({ action: "updateObject", body: { objectID: `suggestion_${index + 1}`, query, category, weight } }));
      if (productRequests.length) await algolia(PUBLIC_INDEX, { requests: productRequests });
      if (factoryRequests.length) await algolia(PUBLIC_FACTORIES_INDEX, { requests: factoryRequests });
      await algolia(PUBLIC_SUGGESTIONS_INDEX, { requests: suggestions });
      const [removedProducts, removedFactories] = await Promise.all([
        pruneIndex(PUBLIC_INDEX, new Set(productRequests.map((request: any) => request.body.objectID))),
        pruneIndex(PUBLIC_FACTORIES_INDEX, new Set(factoryRequests.map((request: any) => request.body.objectID))),
      ]);
      return json({ ok: true, products: productRequests.length, factories: factoryRequests.length, suggestions: suggestions.length, removedProducts, removedFactories });
    }
    const { data: jobs = [] } = await admin.from("algolia_sync_outbox").select("*").is("processed_at", null).order("created_at").limit(Math.min(Number(limit) || 100, 500));
    let processed = 0, failed = 0;
    for (const job of jobs) {
      try {
        if (job.entity_type === "product") await syncPublicProduct(admin, job.entity_id, job.payload?.sku);
        if (job.entity_type === "factory") { await syncPublicFactory(admin, job.entity_id, job.payload?.factory_slug); await syncFactoryProducts(admin, job.entity_id); }
        if (job.entity_type === "order") await syncOrder(admin, job.entity_id);
        if (job.entity_type === "order_item") await syncOrder(admin, job.payload?.order_id);
        if (job.entity_type === "saved_item") await syncWishlist(admin, job.payload?.profile_id, job.payload?.product_id);
        await admin.from("algolia_sync_outbox").update({ processed_at: new Date().toISOString(), attempts: job.attempts + 1, last_error: null }).eq("id", job.id);
        processed += 1;
      } catch (error) {
        await admin.from("algolia_sync_outbox").update({ attempts: job.attempts + 1, last_error: String(error).slice(0, 1000) }).eq("id", job.id);
        failed += 1;
      }
    }
    return json({ ok: true, processed, failed, requester: requester?.id || "internal" });
  } catch (error) { return json({ error: String(error) }, 500); }
});
