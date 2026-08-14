#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const base = (process.argv[2] || "http://127.0.0.1:8091").replace(/\/$/, "");
const debug = process.env.CHROME_DEBUG || "http://127.0.0.1:9223";
const outputDir = process.env.QA_SCREENSHOTS || "/private/tmp/atelix-qa";
const routes = [
  "/",
  "/categories",
  "/categories/fabrics",
  "/categories/fabrics/denim",
  "/categories/oem",
  "/categories/oem/clothing",
  "/categories/yarns/viscose",
  "/search?q=wool%20suiting",
  "/search",
  "/search?q=zzzz-no-match-9482",
  "/search?q=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E",
  "/search?q=YKK%20Corporation&type=factories",
  "/pages/product.html?id=FAB-153",
  "/pages/product.html?id=FAB-100&lang=en",
  "/pages/product.html?id=FAB-149",
  "/pages/product.html?id=FAB-149&lang=ja",
  "/pages/product.html?id=FAB-149&lang=zh",
  "/pages/product.html?id=FAB-163",
  "/pages/product.html?id=does-not-exist",
  "/pages/factories.html",
  "/pages/supplier.html?id=F-18",
  "/pages/supplier.html?id=does-not-exist",
  "/pages/cart.html",
  "/pages/cart.html?seed=cart",
  "/pages/checkout.html",
  "/pages/wishlist.html",
  "/pages/private-offers.html",
  "/pages/orders.html",
  "/pages/order.html?no=not-found",
  "/pages/brand-owner.html",
  "/pages/dashboard.html",
  "/pages/admin-orders.html",
  "/pages/admin-supplier.html",
  "/pages/login.html",
  "/pages/signup.html",
  "/pages/forgot-password.html",
  "/pages/reset-password.html",
  "/pages/campaign.html",
  "/pages/building.html",
  "/about",
  "/help-center",
  "/legal",
  "/terms",
  "/privacy",
  "/trust-safety",
  "/pages/sell.html",
];
const viewports = [
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "mobile", width: 390, height: 844, mobile: true },
];

function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      return message.error ? reject(new Error(message.error.message)) : resolve(message.result);
    }
    for (const fn of listeners.get(message.method) || []) fn(message.params || {});
  };
  const ready = new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error("Could not connect to Chrome DevTools"));
  });
  return {
    ready,
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const callId = ++id;
        pending.set(callId, { resolve, reject });
        socket.send(JSON.stringify({ id: callId, method, params }));
      });
    },
    on(method, fn) {
      if (!listeners.has(method)) listeners.set(method, []);
      listeners.get(method).push(fn);
    },
    close() { socket.close(); },
  };
}

async function newPage(url) {
  const response = await fetch(`${debug}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  if (!response.ok) throw new Error(`Chrome debug endpoint returned ${response.status}`);
  return response.json();
}

async function inspect(route, viewport) {
  const targetUrl = base + route;
  const target = await newPage("about:blank");
  const cdp = connect(target.webSocketDebuggerUrl);
  await cdp.ready;
  const errors = [];
  const failed = [];
  let loadedResolve;
  let loaded = new Promise((resolve) => { loadedResolve = resolve; });
  cdp.on("Runtime.exceptionThrown", (p) => errors.push(p.exceptionDetails?.text || "Uncaught exception"));
  cdp.on("Runtime.consoleAPICalled", (p) => {
    if (p.type === "error") errors.push(p.args?.map((a) => a.value || a.description || "").join(" "));
  });
  cdp.on("Network.responseReceived", (p) => {
    const response = p.response || {};
    const expectedLocalMiss = /\/(?:favicon\.ico|_vercel\/insights\/script\.js)$/.test(response.url || "");
    if (response.status >= 400 && response.url?.startsWith(base) && !expectedLocalMiss) failed.push(`${response.status} ${response.url}`);
  });
  cdp.on("Page.loadEventFired", () => loadedResolve());
  await Promise.all([
    cdp.send("Page.enable"), cdp.send("Runtime.enable"), cdp.send("Network.enable"),
    cdp.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width, height: viewport.height, deviceScaleFactor: 1,
      mobile: viewport.mobile, screenWidth: viewport.width, screenHeight: viewport.height,
    }),
  ]);
  await cdp.send("Page.navigate", { url: targetUrl });
  await Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, 10000))]);
  for (let attempt = 0; attempt < 16; attempt++) {
    const ready = await cdp.send("Runtime.evaluate", {
      returnByValue: true,
      expression: "Boolean(document.querySelector('h1'))",
    });
    if (ready.result.value) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (route.startsWith("/search")) {
    for (let attempt = 0; attempt < 24; attempt++) {
      const settled = await cdp.send("Runtime.evaluate", {
        returnByValue: true,
        expression: "document.querySelector('#searchProductGrid')?.getAttribute('aria-busy') === 'false' && Boolean(document.querySelector('#searchProductGrid .tcard, #searchProductGrid .search-empty'))",
      });
      if (settled.result.value) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  let contactData = null;
  if (route === "/pages/product.html?id=FAB-100&lang=en") {
    const contactResult = await cdp.send("Runtime.evaluate", {
      returnByValue: true,
      expression: `(() => { window.__qaContacts=[]; window.ARCANA_contactEmail=payload=>window.__qaContacts.push(payload); document.getElementById('emailBtn')?.click(); document.getElementById('oemContactBtn')?.click(); return window.__qaContacts; })()`,
    });
    contactData = contactResult.result.value;
  }
  const { result } = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const visible = el => { if(!el) return false; const s=getComputedStyle(el), r=el.getBoundingClientRect(); return !el.hidden && s.display!=='none' && s.visibility!=='hidden' && r.width>0 && r.height>0; };
      const ids=[...document.querySelectorAll('[id]')].map(el=>el.id).filter(Boolean);
      const duplicates=[...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))];
      const brokenImages=[...document.images].filter(img=>visible(img)&&img.complete&&img.naturalWidth===0).map(img=>img.currentSrc||img.src);
      const deadLinks=[...document.querySelectorAll('a[href="#"],a:not([href])')].filter(visible).map(a=>a.textContent.trim()).filter(Boolean);
      const unlabeled=[...document.querySelectorAll('input,select,textarea,button')].filter(visible).filter(el=>{
        if(el.tagName==='BUTTON') return !(el.textContent.trim()||el.getAttribute('aria-label')||el.title);
        return !(el.labels&&el.labels.length)&&!el.getAttribute('aria-label')&&!el.getAttribute('aria-labelledby');
      }).map(el=>el.outerHTML.slice(0,160));
      const bodyText=document.body.innerText;
      const sentinel=(bodyText.match(/\\b(undefined|null|NaN)\\b|\\[object Object\\]/g)||[]);
      const overflow=Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth;
      const cart={quantityInputs:[...document.querySelectorAll('[data-qty] input')].map(input=>({value:Number(input.value),min:Number(input.min)})),hasAddons:/Add-on services|QC Inspection|Shipment Insurance/i.test(bodyText),hasPromo:/Promo code/i.test(bodyText),quotesShipping:/Quoted separately/i.test(bodyText)};
      const pdp={quoteHref:document.getElementById('emailBtn')?.getAttribute('href')||'',quoteText:document.getElementById('emailBtn')?.textContent.trim()||'',quantityType:document.getElementById('pdpQuantity')?.type||'',wishlistPressed:document.querySelector('.pdp-save')?.getAttribute('aria-pressed')||'',packageRadios:document.querySelectorAll('[data-pkg-group] input[type="radio"]').length,selectedPackages:document.querySelectorAll('[data-pkg-group] input[type="radio"]:checked').length,optionGroups:document.querySelectorAll('[data-product-option]').length,optionValues:document.querySelectorAll('[data-product-option] input[type="radio"]').length,selectedOptions:document.querySelectorAll('[data-product-option] input[type="radio"]:checked').length,galleryButtons:document.querySelectorAll('[data-gallery-image]').length,touchTargets:[...document.querySelectorAll('.pdp-mini button,.pdp-option-values span')].map(button=>Math.round(button.getBoundingClientRect().height))};
      return {title:document.title, url:location.href, duplicates, brokenImages, deadLinks, unlabeled, sentinel, overflow, h1:document.querySelector('h1')?.textContent.trim()||'', isolation:{mobileNav:visible(document.querySelector('.mobile-nav')),desktopCategories:visible(document.querySelector('.kat-btn')),desktopFilters:visible(document.querySelector('.filter-rail')),mobileListTools:visible(document.querySelector('.mobile-list-tools'))}, search:{empty:Boolean(document.querySelector('.search-empty')),products:document.querySelectorAll('.search-product-grid .tcard').length,factories:document.querySelectorAll('.search-factory-card').length,factoryListVisible:Boolean(document.querySelector('#searchFactoryList:not([hidden])')),injectedImage:Boolean(document.querySelector('img[src="x"]'))},cart,pdp};
    })()`,
  });
  const data = result.value;
  const issues = [];
  if (errors.length) issues.push(`console: ${[...new Set(errors)].join(" | ")}`);
  if (failed.length) issues.push(`network: ${[...new Set(failed)].join(" | ")}`);
  for (const key of ["duplicates", "brokenImages", "deadLinks", "unlabeled", "sentinel"]) {
    if (data[key]?.length) issues.push(`${key}: ${JSON.stringify(data[key])}`);
  }
  if (data.overflow > 2) issues.push(`horizontal overflow: ${data.overflow}px`);
  if (!data.title) issues.push("missing document title");
  if (!data.h1 && !route.includes("wishlist") && !route.includes("cart")) issues.push("missing h1");
  if (route.includes("zzzz-no-match") && !data.search.empty) issues.push("no-result query did not show an empty state");
  if (route === "/search" && data.search.products < 1) issues.push("empty query did not show recommended products");
  if (route.includes("type=factories") && (!data.search.factoryListVisible || data.search.factories < 1)) issues.push("factory result route did not show factories");
  if (route.includes("onerror") && data.search.injectedImage) issues.push("search query created executable markup");
  if (route.includes("cart.html?seed=cart")) {
    if (!data.cart.quantityInputs.length || data.cart.quantityInputs.some((input) => input.value < input.min)) issues.push("cart quantity is below product MOQ");
    if (data.cart.hasAddons || data.cart.hasPromo) issues.push("cart exposes an unsupported add-on or promo affordance");
    if (!data.cart.quotesShipping) issues.push("cart does not identify shipping as separately quoted");
  }
  if (route === "/pages/product.html?id=FAB-100&lang=en") {
    if (!contactData?.length || contactData.some((contact) => contact.subjectPrefix !== "Product request" && contact.subjectPrefix !== "OEM request") || contactData.some((contact) => !contact.bodyLines?.some((line) => /^Specification: /.test(line)))) issues.push("PDP contact CTA did not build a complete email request");
    if (!contactData?.some((contact) => contact.subjectPrefix === "OEM request")) issues.push("PDP OEM Contact us CTA did not trigger email contact");
  }
  if (/\/pages\/product\.html\?id=(?:FAB-149|FAB-153)(?:&|$)/.test(route)) {
    if (!data.pdp.quoteHref.startsWith("mailto:info@arcanawangsa.com?subject=")) issues.push("quote-only PDP does not expose a real email link");
    if (data.pdp.quantityType !== "number") issues.push("PDP quantity is missing numeric semantics");
    if (!/^(true|false)$/.test(data.pdp.wishlistPressed)) issues.push("PDP wishlist is missing pressed state");
    if (viewport.mobile && data.pdp.touchTargets.some((height) => height < 44)) issues.push(`PDP secondary touch target below 44px: ${data.pdp.touchTargets.join(",")}`);
    if (route.endsWith("lang=ja") && data.pdp.quoteText !== "サプライヤーに問い合わせ") issues.push("Japanese supplier contact CTA was not localized");
    if (route.endsWith("lang=zh") && data.pdp.quoteText !== "联系供应商") issues.push("Chinese supplier contact CTA was not localized");
  }
  if (route === "/pages/product.html?id=FAB-163" && (data.pdp.optionGroups !== 1 || data.pdp.optionValues !== 3 || data.pdp.selectedOptions !== 1 || data.pdp.galleryButtons !== 3)) issues.push("variant PDP did not render one selected color group and the supplied image gallery");
  if (route === "/pages/product.html?id=FAB-100&lang=en" && (data.pdp.packageRadios !== 4 || data.pdp.selectedPackages !== 1)) issues.push("OEM package radio group is incomplete or lacks one selected option");
  if (route === "/") {
    if (viewport.mobile && (!data.isolation.mobileNav || data.isolation.desktopCategories)) issues.push("mobile marketplace navigation isolation failed");
    if (!viewport.mobile && (data.isolation.mobileNav || !data.isolation.desktopCategories)) issues.push("desktop marketplace navigation isolation failed");
  }
  if (route === "/categories/fabrics") {
    if (viewport.mobile && (!data.isolation.mobileListTools || data.isolation.desktopFilters)) issues.push("mobile catalog controls are not isolated from desktop filters");
    if (!viewport.mobile && (data.isolation.mobileListTools || !data.isolation.desktopFilters)) issues.push("desktop catalog controls are not isolated from mobile controls");
  }
  if (["/", "/categories/oem/clothing", "/search?q=wool%20suiting", "/pages/product.html?id=FAB-100&lang=en", "/pages/product.html?id=FAB-163", "/pages/factories.html", "/pages/cart.html?seed=cart", "/about", "/terms", "/privacy", "/trust-safety"].includes(route)) {
    fs.mkdirSync(outputDir, { recursive: true });
    if (route === "/about") {
      await cdp.send("Runtime.evaluate", { expression: "window.scrollTo(0, document.documentElement.scrollHeight)" });
      await new Promise((resolve) => setTimeout(resolve, 500));
      await cdp.send("Runtime.evaluate", { expression: "window.scrollTo(0, 0)" });
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (route === "/pages/product.html?id=FAB-163") {
      await cdp.send("Runtime.evaluate", { expression: "document.getElementById('emailBtn')?.scrollIntoView({block:'center'})" });
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    if (route === "/pages/product.html?id=FAB-100&lang=en") {
      await cdp.send("Runtime.evaluate", { expression: "document.querySelector('.oem-packages')?.scrollIntoView({block:'center'})" });
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: route === "/about" });
    fs.writeFileSync(path.join(outputDir, `${viewport.name}-${route.replace(/[^a-z0-9]+/gi,"-").replace(/^-|-$/g,"")||"home"}.png`), Buffer.from(shot.data, "base64"));
  }
  cdp.close();
  await fetch(`${debug}/json/close/${target.id}`, { method: "PUT" }).catch(() => {});
  return { route, viewport: viewport.name, issues, data: { ...data, contactData } };
}

async function inspectSearch(viewport) {
  const target = await newPage("about:blank");
  const cdp = connect(target.webSocketDebuggerUrl);
  await cdp.ready;
  let loadedResolve;
  const loaded = new Promise((resolve) => { loadedResolve = resolve; });
  cdp.on("Page.loadEventFired", () => loadedResolve());
  await Promise.all([
    cdp.send("Page.enable"), cdp.send("Runtime.enable"),
    cdp.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width, height: viewport.height, deviceScaleFactor: 1,
      mobile: viewport.mobile, screenWidth: viewport.width, screenHeight: viewport.height,
    }),
  ]);
  await cdp.send("Page.navigate", { url: base + "/" });
  await Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, 10000))]);
  await new Promise((resolve) => setTimeout(resolve, 800));
  const evaluate = async (expression) => (await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
  const issues = [];
  const publicEmpty = await evaluate(`(() => { localStorage.removeItem('arcana_session'); const i=document.querySelector('#site-search'); i.value=''; i.focus(); i.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`);
  await new Promise((resolve) => setTimeout(resolve, 400));
  const publicState = await evaluate(`(() => { const p=document.querySelector('[data-search-pop]'); return {hidden:p.hidden,text:p.innerText}; })()`);
  if (!publicEmpty || !publicState.hidden || /Popular|Recent searches/i.test(publicState.text)) issues.push("public empty search exposed keyword suggestions");
  await evaluate(`(() => { const i=document.querySelector('#site-search'); i.value='wool suiting'; i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await new Promise((resolve) => setTimeout(resolve, 1600));
  const populated = await evaluate(`(() => { const p=document.querySelector('[data-search-pop]'); const links=[...p.querySelectorAll('a')].map(a=>a.getAttribute('href')); return {hidden:p.hidden,text:p.innerText,options:p.querySelectorAll('[role=option]').length,links}; })()`);
  if (populated.hidden || populated.options < 1) issues.push("typed search returned no navigable options");
  if (/Popular|undefined|null|\[object Object\]/i.test(populated.text)) issues.push("typed search contains stale or invalid copy");
  if (populated.links.some((href) => !href || href === "#")) issues.push("typed search contains an invalid route");
  const keyboard = await evaluate(`(() => { const i=document.querySelector('#site-search'); i.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})); return i.getAttribute('aria-activedescendant'); })()`);
  if (!keyboard) issues.push("keyboard navigation did not select an option");
  await evaluate(`(() => { localStorage.setItem('arcana_session',JSON.stringify({role:'buyer',name:'QA'})); window.ARCANA_API.getRecentSearches=async()=>['denim','linen fabric']; const i=document.querySelector('#site-search'); i.value=''; i.focus(); i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await new Promise((resolve) => setTimeout(resolve, 400));
  const recent = await evaluate(`document.querySelector('[data-search-pop]').innerText`);
  if (!/Recent searches/i.test(recent) || !/denim/i.test(recent) || /Popular/i.test(recent)) issues.push("signed-in recent searches did not render correctly");
  cdp.close();
  await fetch(`${debug}/json/close/${target.id}`, { method: "PUT" }).catch(() => {});
  return { route: "search interactions", viewport: viewport.name, issues, data: { populated, recent } };
}

(async () => {
  const results = [];
  for (const viewport of viewports) {
    for (const route of routes) {
      const result = await inspect(route, viewport);
      results.push(result);
      process.stdout.write(result.issues.length ? `FAIL ${viewport.name} ${route}: ${result.issues.join("; ")}\n` : `PASS ${viewport.name} ${route}\n`);
    }
    const searchResult = await inspectSearch(viewport);
    results.push(searchResult);
    process.stdout.write(searchResult.issues.length ? `FAIL ${viewport.name} search interactions: ${searchResult.issues.join("; ")}\n` : `PASS ${viewport.name} search interactions\n`);
  }
  const failures = results.filter((result) => result.issues.length);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(results, null, 2));
  console.log(`\n${results.length - failures.length}/${results.length} browser scenarios passed.`);
  process.exitCode = failures.length ? 1 : 0;
})().catch((error) => { console.error(error); process.exit(1); });
