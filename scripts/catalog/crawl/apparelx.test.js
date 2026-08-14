"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");
const { ApparelXAdapter, canonicalizeApparelXUrl, extractNextPageUrl, extractProductLinks } = require("../adapters/apparelx");

function response(body, { url = "https://www.apparel-x.com/test", status = 200, contentType = "text/html" } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    url,
    headers: new Headers({ "content-type": contentType }),
    text: async () => body,
  };
}

test("canonicalizes the Vietnam host and rejects every other host", () => {
  assert.equal(canonicalizeApparelXUrl("https://vn.apparelx.com/business/acme#team"), "https://www.apparel-x.com/business/acme");
  assert.equal(canonicalizeApparelXUrl("/business/acme"), "https://www.apparel-x.com/business/acme");
  assert.throws(() => canonicalizeApparelXUrl("https://apparel-x.com/business/acme"), /Refusing/);
  assert.throws(() => canonicalizeApparelXUrl("http://www.apparel-x.com/business/acme"), /HTTPS/);
  assert.throws(() => canonicalizeApparelXUrl("https://example.com/business/acme"), /Refusing/);
});

test("discovers OEM suppliers from the business JSON endpoint without network access", async () => {
  const adapter = new ApparelXAdapter();
  const payload = [
    { Company: "OEM1", CompanyFormalName: "OEM One", ApparelXHomePageAddress: "oem-one", BusinessTags: "OEM/ODM,縫製工場" },
    { Company: "MILL1", CompanyFormalName: "Mill One", ApparelXHomePageAddress: "mill-one", BusinessTags: "生地メーカー" },
  ];
  const calls = [];
  const evidence = [];
  const client = { get: async (url) => { calls.push(String(url)); return response(JSON.stringify(payload), { url: String(url), contentType: "application/json" }); } };
  const records = [];
  for await (const item of adapter.discover(client, { scope: "oem", pageSize: 100, onEvidence: async (record) => evidence.push(record) })) records.push(item);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^https:\/\/www\.apparel-x\.com\/php\/GetApparelXBusinessList\.php/);
  assert.deepEqual(records.map((record) => record.sourceId), ["OEM1"]);
  assert.equal(records[0].url, "https://www.apparel-x.com/business/oem-one");
  assert.equal(evidence.length, 1);
});

test("fabric discovery uses the official paginated JSON endpoint and obeys maxItems", async () => {
  const adapter = new ApparelXAdapter();
  const calls = [];
  const client = { get: async (url) => {
    calls.push(String(url));
    const page = Number(new URL(url).searchParams.get("pageno"));
    const payload = page === 1
      ? [{ DataType: "TotalCount", TotalCount: "3" }, { ItemId: "101", ItemCode: "FAB-1", Company: "A" }, { ItemId: "102", ItemCode: "FAB-2", Company: "A" }]
      : [{ DataType: "TotalCount", TotalCount: "3" }, { ItemId: "103", ItemCode: "FAB-3", Company: "B" }];
    return response(JSON.stringify(payload), { url: String(url), contentType: "application/json" });
  } };
  const records = [];
  for await (const item of adapter.discover(client, {
    scope: "fabrics", pageSize: 2, maxItems: 3,
    seedUrls: ["https://www.apparel-x.com/search.php?category=FABRIC"],
  })) records.push(item);
  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[0]).pathname, "/php/GetApparelXItemList.php");
  assert.equal(new URL(calls[0]).searchParams.get("category"), "FABRIC");
  assert.equal(new URL(calls[0]).searchParams.get("aspectlanguagecode"), "en");
  assert.deepEqual(records.map((record) => record.sourceId), ["101", "102", "103"]);
  assert.equal(records[0].url, "https://www.apparel-x.com/item.php?itemid=101");
  await assert.rejects(async () => {
    for await (const _item of adapter.discover(client, { scope: "fabrics", seedUrls: ["https://www.apparel-x.com/search.php?category=INTERLINING"] })) { /* exhaust */ }
  }, /Unverified fabrics seed URL/);
});

test("fallback HTML helpers extract only product and explicit next-page URLs", () => {
  const html = `<a href="/product/fabric-1">Fabric</a><a href="https://vn.apparelx.com/item/fabric-2">Two</a><a href="https://example.com/product/no">No</a>`;
  assert.deepEqual(extractProductLinks(html, "https://www.apparel-x.com/search"), [
    { kind: "product", sourceId: "fabric-1", url: "https://www.apparel-x.com/product/fabric-1" },
    { kind: "product", sourceId: "fabric-2", url: "https://www.apparel-x.com/item/fabric-2" },
  ]);
  assert.equal(extractNextPageUrl(`<a href="/product/first">First</a><a href="/search?page=2" rel="next nofollow">Next</a>`, "https://www.apparel-x.com/search"), "https://www.apparel-x.com/search?page=2");
  assert.equal(extractNextPageUrl(`<a href="/product/first">First</a>`, "https://www.apparel-x.com/search"), null);
});

test("product mapping excludes chrome icons and converts gallery thumbnails to full-size media", () => {
  const adapter = new ApparelXAdapter();
  const html = `<meta property="og:image" content="https://www.apparel-x.com/img/item/MAKER/123.jpg">
    <img class="itemmainphoto itemphoto" src="img/item/MAKER/123.jpg">
    <img class="itemsubphoto" src="img/item/thumb/MAKER/123-1_t2.jpg">
    <img class="footericon" src="img/icon_twitter.png">`;
  const record = adapter.mapToCanonical({ kind: "product", sourceId: "123", url: "https://www.apparel-x.com/item.php?itemid=123", html, discovery: { ECommerceItemName: "Fabric", ItemCode: "F-1", ECommerceItemCategoryCode: "FABRIC" } }, { scope: "fabrics" });
  assert.deepEqual(record.images.map((image) => image.sourceUrl), [
    "https://www.apparel-x.com/img/item/MAKER/123.jpg",
    "https://www.apparel-x.com/img/item/MAKER/123-1.jpg",
  ]);
});

test("maps the cached OEM profile and keeps its email explicitly private", async () => {
  const adapter = new ApparelXAdapter();
  const html = await fs.readFile(path.resolve(__dirname, "../../../data/apparel-x-oem/raw/profiles/PANAA.html"), "utf8");
  const record = adapter.mapToCanonical({
    kind: "supplier", sourceId: "PANAA", url: "https://www.apparel-x.com/business/panaart", html,
    discovery: { CompanyFormalName: "株式会社パナ・アート", BusinessTags: "OEM/ODM,縫製工場" },
  }, { scope: "oem" });
  assert.equal(record.entityType, "supplier");
  assert.equal(record.privateSourceContact?.usageStatus, "documented_only");
  assert.equal(record.privateSourceContact?.outreachAllowed, false);
  assert.equal(record.privateSourceContact?.publicVisibility, false);
  assert.match(record.privateSourceContact?.email || "", /@/);
  assert.ok(record.images.some((image) => image.kind === "logo"));
});
