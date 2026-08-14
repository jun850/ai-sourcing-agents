#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const base = (process.argv[2] || "http://127.0.0.1:8091").replace(/\/$/, "");
const debug = process.env.CHROME_DEBUG || "http://127.0.0.1:9223";
const outputDir = process.env.QA_SCREENSHOTS || "/private/tmp/atelix-qa";
const route = "/intools/dashboard";
const projectRoot = path.resolve(__dirname, "..");
const scenarios = [
  { name: "mobile-admin-blocked", width: 390, height: 844, auth: "admin", expected: "mobile-blocked" },
  { name: "tablet-admin-blocked", width: 768, height: 1024, auth: "admin", expected: "mobile-blocked" },
  { name: "desktop-guest", width: 1440, height: 900, auth: "guest", expected: "login" },
  { name: "desktop-admin", width: 1440, height: 900, auth: "admin", expected: "desktop" },
  { name: "desktop-non-admin", width: 1440, height: 900, auth: "non-admin", expected: "unauthorized" },
  { name: "desktop-locked", width: 1440, height: 900, auth: "locked", expected: "locked", preserveStorage: true },
];

function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) {
      const call = pending.get(message.id);
      pending.delete(message.id);
      return message.error ? call.reject(new Error(message.error.message)) : call.resolve(message.result);
    }
    for (const listener of listeners.get(message.method) || []) listener(message.params || {});
  };
  return {
    ready: new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = () => reject(new Error("Could not connect to Chrome DevTools")); }),
    send(method, params = {}) { return new Promise((resolve, reject) => { const callId = ++id; pending.set(callId, { resolve, reject }); socket.send(JSON.stringify({ id: callId, method, params })); }); },
    on(method, listener) { if (!listeners.has(method)) listeners.set(method, []); listeners.get(method).push(listener); },
    close() { socket.close(); },
  };
}

async function newPage(url) {
  const response = await fetch(`${debug}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  if (!response.ok) throw new Error(`Chrome debug endpoint returned ${response.status}`);
  return response.json();
}

async function inspect(scenario) {
  const target = await newPage("about:blank");
  const cdp = connect(target.webSocketDebuggerUrl);
  await cdp.ready;
  const errors = [];
  const failed = [];
  const intoolsRequests = [];
  let loadedResolve;
  const loaded = new Promise((resolve) => { loadedResolve = resolve; });
  cdp.on("Runtime.exceptionThrown", (event) => errors.push(event.exceptionDetails?.text || "Uncaught exception"));
  cdp.on("Runtime.consoleAPICalled", (event) => { if (event.type === "error") errors.push(event.args?.map((arg) => arg.value || arg.description || "").join(" ")); });
  cdp.on("Network.requestWillBeSent", ({ request }) => {
    if (/\/rest\/v1\/(?:intools_|content_|widget_|media_assets|admin_audit)|\/rpc\/(?:intools_|admin_)/i.test(request.url || "")) intoolsRequests.push(request.url);
  });
  cdp.on("Network.responseReceived", ({ response = {} }) => {
    const expectedLocalMiss = /\/favicon\.ico$/.test(response.url || "");
    if (response.status >= 400 && response.url?.startsWith(base) && !expectedLocalMiss) failed.push(`${response.status} ${response.url}`);
  });
  cdp.on("Page.loadEventFired", () => loadedResolve());
  await Promise.all([
    cdp.send("Page.enable"), cdp.send("Runtime.enable"), cdp.send("Network.enable"),
    cdp.send("Emulation.setDeviceMetricsOverride", { width: scenario.width, height: scenario.height, deviceScaleFactor: 1, mobile: scenario.width < 1024, screenWidth: scenario.width, screenHeight: scenario.height }),
  ]);
  if (!scenario.preserveStorage) await cdp.send("Storage.clearDataForOrigin", { origin: base, storageTypes: "all" });
  await cdp.send("Page.navigate", { url: `${base}${route}?qa-auth=${encodeURIComponent(scenario.auth)}` });
  await Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, 10000))]);
  await new Promise((resolve) => setTimeout(resolve, 800));
  let editorSmoke = null;
  let featureSmoke = null;
  if (scenario.auth === "admin" && scenario.width >= 1024) {
    const evaluate = async (expression) => (await cdp.send("Runtime.evaluate", { returnByValue: true, awaitPromise: true, expression })).result.value;
    const pause = () => new Promise((resolve) => setTimeout(resolve, 180));
    const views = {};
    for (const view of ["dashboard", "pages", "widgets", "products", "suppliers", "shipping", "media", "history"]) {
      await evaluate(`document.querySelector('[data-view="${view}"]')?.click()`);
      await pause();
      views[view] = await evaluate(`({heading:document.querySelector('[data-workspace] h1')?.textContent.trim()||'',error:Boolean(document.querySelector('[data-workspace] .notice-danger'))})`);
    }

    await evaluate(`document.querySelector('[data-view="pages"]')?.click()`); await pause();
    await evaluate(`document.querySelector('[data-edit-id]')?.click()`); await pause();
    const pageEditor = await evaluate(`({route:document.querySelector('[name="route"]')?.value,template:document.querySelector('[name="template"]')?.value,languages:[...document.querySelectorAll('[role="tablist"] button')].map(button=>button.textContent.trim()),preview:Boolean(document.querySelector('[data-preview-frame]')),archive:Boolean(document.querySelector('[data-archive-page]'))})`);
    await evaluate(`document.querySelector('[data-close]')?.click()`);

    await evaluate(`document.querySelector('[data-view="widgets"]')?.click()`); await pause();
    await evaluate(`document.querySelector('[data-edit-id]')?.click()`); await pause();
    const widgetEditor = await evaluate(`({name:document.querySelector('[name="name"]')?.value,type:document.querySelector('[name="type"]')?.value,zone:document.querySelector('[name="zone"]')?.value,style:document.querySelector('[name="style_preset"]')?.value,target:document.querySelector('[name="target_type"]')?.value,route:document.querySelector('[name="target_value"]')?.value,revisionActions:Boolean(document.querySelector('[data-widget-rollback]')&&document.querySelector('[data-archive]'))})`);
    await evaluate(`document.querySelector('[data-close]')?.click()`);

    await evaluate(`document.querySelector('[data-view="products"]')?.click()`); await pause();
    await evaluate(`document.querySelector('[data-edit-id]')?.click()`); await pause();
    const productEditor = await evaluate(`({supplier:document.querySelector('[name="factory_id"]')?.value,supplierLabel:document.querySelector('[name="factory_id"] option:checked')?.textContent.trim(),addSupplier:Boolean(document.querySelector('[data-add-supplier]')),supplierHelp:document.querySelector('#product-supplier-help')?.textContent.trim(),category:document.querySelector('[name="category"]')?.value,status:document.querySelector('[name="listing_status"]')?.value,application:document.querySelector('[name="applications"]')?.value,unit:document.querySelector('[name="unit_type"]')?.value,pricing:document.querySelector('[name="pricing_mode"]')?.value,imageUrl:document.querySelector('[name="img"]')?.value,gallery:document.querySelector('[name="images"]')?.value,mainLabel:document.querySelector('[data-media-index="0"] .product-media-preview span')?.textContent,optionNames:[...document.querySelectorAll('[data-option-row] input')].map(input=>input.value),optionValues:[...document.querySelectorAll('[data-option-row] textarea')].map(input=>input.value),uploadAccept:document.querySelector('[name="gallery_upload"]')?.accept,assignments:document.querySelector('[name="private_assignments"]')?.value,archive:Boolean(document.querySelector('[data-archive]'))})`);
    await evaluate(`(()=>{document.querySelector('[data-add-supplier]')?.click();document.querySelector('[name="new_supplier_name"]').value='Kyoto Loom';document.querySelector('[name="new_supplier_type"]').value='fabric_mill';document.querySelector('[name="new_supplier_loc"]').value='Kyoto, Japan';document.querySelector('[data-create-supplier]')?.click();return true;})()`); await pause();
    const inlineSupplier = await evaluate(`({selected:document.querySelector('[name="factory_id"]')?.value,label:document.querySelector('[name="factory_id"] option:checked')?.textContent.trim(),savedName:window.__qaSavedSupplier?.name,savedSlug:window.__qaSavedSupplier?.slug,savedType:window.__qaSavedSupplier?.type,saveDisabled:Boolean(document.querySelector('[data-save]')?.disabled),expanded:document.querySelector('[data-add-supplier]')?.getAttribute('aria-expanded'),draftName:document.querySelector('[name="name"]')?.value})`);
    await evaluate(`(()=>{const input=document.querySelector('[name="gallery_upload"]');const transfer=new DataTransfer();transfer.items.add(new File(['qa-image'], 'new-product.webp', {type:'image/webp'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`); await pause();
    await evaluate(`(()=>{const rows=[...document.querySelectorAll('[data-media-index]')];rows.at(-1)?.querySelector('[data-media-up]')?.click();document.querySelectorAll('[data-media-index]')[1]?.querySelector('[data-media-up]')?.click();document.querySelector('[data-save]')?.click();return true;})()`); await pause();
    const productImageSave = await evaluate(`({savedUrl:window.__qaSavedProduct?.img||'',gallery:window.__qaSavedProduct?.images||[],variants:window.__qaSavedProduct?.variants||[],supplier:window.__qaSavedProduct?.factory_id||'',leakedFileField:Object.prototype.hasOwnProperty.call(window.__qaSavedProduct||{},'gallery_upload'),leakedSupplierDraft:Object.keys(window.__qaSavedProduct||{}).some(key=>key.startsWith('new_supplier_'))})`);

    await evaluate(`document.querySelector('[data-view="suppliers"]')?.click()`); await pause();
    await evaluate(`document.querySelector('[data-edit-id]')?.click()`); await pause();
    const supplierEditor = await evaluate(`({type:document.querySelector('[name="type"]')?.value,verification:document.querySelector('[name="verify_state"]')?.value,bio:document.querySelector('[name="description"]')?.value,email:document.querySelector('[name="contact_email"]')?.value,website:document.querySelector('[name="website"]')?.value,capabilities:document.querySelector('[name="capabilities"]')?.value,certifications:document.querySelector('[name="certifications"]')?.value,logoUrl:document.querySelector('[name="logo_url"]')?.value,pageImageUrl:document.querySelector('[name="page_image_url"]')?.value,logoUpload:document.querySelector('[name="logo_upload"]')?.accept,pageUpload:document.querySelector('[name="page_image_upload"]')?.accept,removeLogo:Boolean(document.querySelector('[name="remove_logo"]')),removePageImage:Boolean(document.querySelector('[name="remove_page_image"]')),archive:Boolean(document.querySelector('[data-archive]'))})`);
    await evaluate(`(()=>{const files=[['logo_upload','new-logo.png','image/png'],['page_image_upload','new-company.webp','image/webp']];for(const [name,fileName,type] of files){const transfer=new DataTransfer();transfer.items.add(new File(['qa-image'],fileName,{type}));document.querySelector('[name="'+name+'"]').files=transfer.files;}document.querySelector('[data-save]')?.click();return true;})()`); await pause();
    const supplierImageSave = await evaluate(`({logo:window.__qaSavedSupplier?.logo_img||'',page:window.__qaSavedSupplier?.page_img||'',legacy:window.__qaSavedSupplier?.img||''})`);

    await evaluate(`document.querySelector('[data-view="shipping"]')?.click()`); await pause();
    await evaluate(`document.querySelector('[data-shipping-edit]')?.click()`); await pause();
    const shippingEditor = await evaluate(`({code:document.querySelector('[name="country_code"]')?.value,country:document.querySelector('[name="country_name"]')?.value,service:document.querySelector('[name="service_name"]')?.value,rate:document.querySelector('[name="flat_rate_usd"]')?.value,min:document.querySelector('[name="eta_min_days"]')?.value,max:document.querySelector('[name="eta_max_days"]')?.value,active:document.querySelector('[name="is_active"]')?.checked,archive:Boolean(document.querySelector('[data-shipping-archive]'))})`);
    await evaluate(`document.querySelector('[name="flat_rate_usd"]').value='20';document.querySelector('[data-shipping-save]')?.click()`); await pause();
    const shippingSave = await evaluate(`({country:window.__qaSavedShippingRate?.country_name,rate:window.__qaSavedShippingRate?.flat_rate_usd,active:window.__qaSavedShippingRate?.is_active})`);

    await evaluate(`document.querySelector('[data-view="media"]')?.click()`); await pause();
    const media = await evaluate(`({name:document.querySelector('.media-item b')?.textContent.trim(),alt:document.querySelector('.media-item img')?.alt,archive:Boolean(document.querySelector('[data-media-archive]'))})`);
    await evaluate(`document.querySelector('[data-media-archive]')?.click()`); await pause();
    const mediaConfirm = await evaluate(`Boolean(document.querySelector('[data-confirm]')?.open)`);
    await evaluate(`document.querySelector('[data-confirm] [value="cancel"]')?.click()`);

    await evaluate(`document.querySelector('[data-view="history"]')?.click()`); await pause();
    await evaluate(`document.querySelector('[data-history-rollback]')?.click()`); await pause();
    const historyConfirm = await evaluate(`Boolean(document.querySelector('[data-confirm]')?.open)`);
    await evaluate(`document.querySelector('[data-confirm] [value="cancel"]')?.click()`);

    editorSmoke = { pagesHeading: views.pages.heading, editor: Boolean(pageEditor.preview), languages: pageEditor.languages };
    featureSmoke = { views, pageEditor, widgetEditor, productEditor, inlineSupplier, productImageSave, supplierEditor, supplierImageSave, shippingEditor, shippingSave, media, mediaConfirm, historyConfirm };
  }
  const { result } = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const visible = el => { if(!el) return false; const style=getComputedStyle(el), rect=el.getBoundingClientRect(); return !el.hidden && style.display!=='none' && style.visibility!=='hidden' && rect.width>0 && rect.height>0; };
      const state=document.body.dataset.intoolsState||'';
      const shell=document.querySelector('[data-intools-shell]');
      const blocker=document.querySelector('[data-intools-mobile-block]');
      const bodyText=document.body.innerText;
      return {state, shell:visible(shell), blocker:visible(blocker), overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth, title:document.title, h1:document.querySelector('h1')?.textContent.trim()||'', hasEditor:Boolean(document.querySelector('[contenteditable="true"],textarea,[data-intools-editor]')), hasContentNav:/Pages/i.test(bodyText)&&/Widgets/i.test(bodyText)&&/Products/i.test(bodyText)&&/Suppliers/i.test(bodyText)};
    })()`,
  });
  const data = result.value;
  const issues = [];
  if (errors.length) issues.push(`console: ${[...new Set(errors)].join(" | ")}`);
  if (failed.length) issues.push(`network: ${[...new Set(failed)].join(" | ")}`);
  if (data.overflow > 2) issues.push(`horizontal overflow: ${data.overflow}px`);
  if (!data.title || !data.h1) issues.push("missing title or h1");
  if (data.state !== scenario.expected) issues.push(`expected state ${scenario.expected}, received ${data.state || "none"}`);
  if (scenario.width < 1024) {
    if (!data.blocker || data.shell) issues.push("desktop Intools shell was not isolated below 1024px");
    if (intoolsRequests.length) issues.push(`Intools data loaded below 1024px: ${intoolsRequests.join(" | ")}`);
  }
  if (scenario.auth === "admin" && scenario.width >= 1024 && (!data.shell || !data.hasContentNav || editorSmoke?.pagesHeading !== "Pages" || !editorSmoke?.editor || !["EN", "JA", "ZH"].every((language) => editorSmoke.languages.includes(language)))) issues.push("desktop admin shell or localized page editor smoke failed");
  if (scenario.auth === "admin" && scenario.width >= 1024) {
    const expectedViews = ["dashboard", "pages", "widgets", "products", "suppliers", "shipping", "media", "history"];
    if (expectedViews.some((view) => featureSmoke?.views?.[view]?.heading.toLowerCase() !== view || featureSmoke?.views?.[view]?.error)) issues.push("one or more Intools views failed to load");
    if (featureSmoke?.pageEditor?.route !== "/privacy" || featureSmoke?.pageEditor?.template !== "policy" || !featureSmoke?.pageEditor?.preview || !featureSmoke?.pageEditor?.archive) issues.push("page editor did not preserve route, template, preview, or revision actions");
    if (featureSmoke?.widgetEditor?.name !== "New supplier discount" || featureSmoke?.widgetEditor?.type !== "discount" || featureSmoke?.widgetEditor?.zone !== "managed_page_before_content" || featureSmoke?.widgetEditor?.style !== "brass" || featureSmoke?.widgetEditor?.target !== "route" || featureSmoke?.widgetEditor?.route !== "/privacy" || !featureSmoke?.widgetEditor?.revisionActions) issues.push("widget editor did not preserve configuration or revision actions");
    if (featureSmoke?.productEditor?.supplier !== "f1" || !featureSmoke?.productEditor?.supplierLabel?.includes("Mori Textile") || !featureSmoke?.productEditor?.addSupplier || !featureSmoke?.productEditor?.supplierHelp?.includes("owns this SKU") || featureSmoke?.productEditor?.category !== "fabrics" || featureSmoke?.productEditor?.status !== "active" || featureSmoke?.productEditor?.application !== "Dress" || featureSmoke?.productEditor?.unit !== "kg" || featureSmoke?.productEditor?.pricing !== "quote" || featureSmoke?.productEditor?.imageUrl !== "https://example.com/cotton-twill.jpg" || !featureSmoke?.productEditor?.gallery?.includes("cotton-twill-detail.jpg") || featureSmoke?.productEditor?.mainLabel !== "Main" || featureSmoke?.productEditor?.optionNames?.join(',') !== "Color,Length" || !featureSmoke?.productEditor?.optionValues?.[0]?.includes("Natural") || !featureSmoke?.productEditor?.uploadAccept?.includes("image/webp") || !featureSmoke?.productEditor?.assignments.includes("buyer@example.com") || !featureSmoke?.productEditor?.archive) issues.push("product editor did not preserve supplier linkage, ordered gallery, options, or assignments");
    if (!featureSmoke?.inlineSupplier?.selected || !featureSmoke?.inlineSupplier?.label?.includes("Kyoto Loom") || featureSmoke?.inlineSupplier?.savedName !== "Kyoto Loom" || featureSmoke?.inlineSupplier?.savedSlug !== "kyoto-loom" || featureSmoke?.inlineSupplier?.savedType !== "fabric_mill" || featureSmoke?.inlineSupplier?.saveDisabled || featureSmoke?.inlineSupplier?.expanded !== "false" || featureSmoke?.inlineSupplier?.draftName !== "Organic Cotton Twill") issues.push("inline supplier creation did not preserve the product draft and select the saved supplier");
    if (featureSmoke?.productImageSave?.savedUrl !== "https://storage.example.com/products/new-product.webp" || !featureSmoke?.productImageSave?.gallery?.includes("https://storage.example.com/products/new-product.webp") || featureSmoke?.productImageSave?.variants?.length !== 2 || featureSmoke?.productImageSave?.variants?.[1]?.name !== "Length" || featureSmoke?.productImageSave?.supplier !== featureSmoke?.inlineSupplier?.selected || featureSmoke?.productImageSave?.leakedFileField || featureSmoke?.productImageSave?.leakedSupplierDraft) issues.push("product save did not persist the selected supplier, gallery, options, and generated image URL cleanly");
    if (featureSmoke?.supplierEditor?.type !== "trim_supplier" || featureSmoke?.supplierEditor?.verification !== "pending" || !featureSmoke?.supplierEditor?.bio || featureSmoke?.supplierEditor?.email !== "sales@example.com" || featureSmoke?.supplierEditor?.website !== "https://example.com" || featureSmoke?.supplierEditor?.capabilities !== "Weaving" || featureSmoke?.supplierEditor?.certifications !== "GOTS" || featureSmoke?.supplierEditor?.logoUrl !== "https://example.com/mori-logo.png" || featureSmoke?.supplierEditor?.pageImageUrl !== "https://example.com/mori-company.jpg" || !featureSmoke?.supplierEditor?.logoUpload?.includes("image/png") || !featureSmoke?.supplierEditor?.pageUpload?.includes("image/webp") || !featureSmoke?.supplierEditor?.removeLogo || !featureSmoke?.supplierEditor?.removePageImage || !featureSmoke?.supplierEditor?.archive) issues.push("supplier editor did not preserve identity, capability, or image controls");
    if (featureSmoke?.supplierImageSave?.logo !== "https://storage.example.com/supplier-logos/new-logo.png" || featureSmoke?.supplierImageSave?.page !== "https://storage.example.com/supplier-pages/new-company.webp" || featureSmoke?.supplierImageSave?.legacy !== featureSmoke?.supplierImageSave?.page) issues.push("supplier logo and company image uploads did not persist their generated storage URLs separately");
    if (featureSmoke?.shippingEditor?.code !== "ID" || featureSmoke?.shippingEditor?.country !== "Indonesia" || featureSmoke?.shippingEditor?.service !== "Tracked delivery" || featureSmoke?.shippingEditor?.rate !== "18" || featureSmoke?.shippingEditor?.min !== "3" || featureSmoke?.shippingEditor?.max !== "6" || !featureSmoke?.shippingEditor?.active || !featureSmoke?.shippingEditor?.archive || featureSmoke?.shippingSave?.country !== "Indonesia" || featureSmoke?.shippingSave?.rate !== 20 || !featureSmoke?.shippingSave?.active) issues.push("shipping editor did not preserve or save the country quote contract");
    if (featureSmoke?.media?.name !== "cotton-twill.jpg" || featureSmoke?.media?.alt !== "Folded cotton twill fabric" || !featureSmoke?.media?.archive || !featureSmoke?.mediaConfirm) issues.push("media metadata or archive confirmation failed");
    if (!featureSmoke?.historyConfirm) issues.push("history rollback confirmation failed");
  }
  if (scenario.auth !== "admin" && data.shell) issues.push("non-admin scenario exposed the Intools shell");
  fs.mkdirSync(outputDir, { recursive: true });
  const screenshot = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(outputDir, `intools-${scenario.name}.png`), Buffer.from(screenshot.data, "base64"));
  cdp.close();
  return { scenario: scenario.name, issues, data, editorSmoke, featureSmoke, intoolsRequests };
}

(async () => {
  const adminSupplier = fs.readFileSync(path.join(projectRoot, "pages/admin-supplier.html"), "utf8");
  const intoolsSource = fs.readFileSync(path.join(projectRoot, "intools/intools.js"), "utf8");
  const migration = fs.readFileSync(path.join(projectRoot, "supabase/migrations/20260813170000_atelix_intools.sql"), "utf8");
  const supplierImagesMigration = fs.readFileSync(path.join(projectRoot, "supabase/migrations/20260813174500_supplier_brand_images.sql"), "utf8");
  const shippingMigration = fs.readFileSync(path.join(projectRoot, "supabase/migrations/20260814220000_country_shipping_and_product_media.sql"), "utf8");
  const contractIssues = [];
  const requiredAdminSupplierContracts = ["Atelix Admin", "intoolsSaveSupplier", "intoolsListProducts", "brand_emails", "intoolsSaveProduct", "intoolsArchiveProduct"];
  for (const contract of requiredAdminSupplierContracts) if (!adminSupplier.includes(contract)) contractIssues.push(`admin supplier contract missing: ${contract}`);
  if (/ARCANA Admin/.test(adminSupplier)) contractIssues.push("admin supplier still exposes the retired ARCANA product name");
  if (!intoolsSource.includes("data-magic-link") || !intoolsSource.includes("signInWithMagicLink")) contractIssues.push("password and magic-link login choices are not both wired");
  if (!intoolsSource.includes("const contextMethod=['adminGetIntoolsContext','adminGetContext'].find")) contractIssues.push("optional admin context discovery can incorrectly trigger limited mode");
  if (!intoolsSource.includes("uploadImage(file,'products')") || !intoolsSource.includes("images.push(uploaded.url)")) contractIssues.push("ordered product media upload does not persist the generated storage URL");
  for (const contract of ["name=\"factory_id\" required", "data-add-supplier", "data-create-supplier", "supplierSlug(name)", "adminSaveSupplier", "delete payload.new_supplier_name"]) if (!intoolsSource.includes(contract)) contractIssues.push(`supplier-first product contract missing: ${contract}`);
  for (const contract of ["logo_img", "page_img", "intools_save_supplier_with_images"]) if (!supplierImagesMigration.includes(contract)) contractIssues.push(`supplier image migration contract missing: ${contract}`);
  for (const contract of ["country_shipping_rates", "public_shipping_quote", "intools_save_shipping_rate", "intools_archive_shipping_rate", "intools_save_product_with_images", "shipping_service"]) if (!shippingMigration.includes(contract)) contractIssues.push(`shipping/media migration contract missing: ${contract}`);
  if (/aal2|requires an AAL2/i.test(migration + intoolsSource)) contractIssues.push("MFA/AAL2 requirement remains in the Intools release");
  for (const contract of ["image_callout", "p_name text", "verify_state_change", "intools_save_product", "intools_save_supplier"]) if (!migration.includes(contract)) contractIssues.push(`migration contract missing: ${contract}`);
  const results = [{ scenario: "source-contracts", issues: contractIssues, data: { adminSupplier: true, passwordAndMagicLink: true, noMfa: true } }];
  console.log(contractIssues.length ? `FAIL source-contracts: ${contractIssues.join("; ")}` : "PASS source-contracts");
  for (const scenario of scenarios) {
    const result = await inspect(scenario);
    results.push(result);
    console.log(result.issues.length ? `FAIL ${scenario.name}: ${result.issues.join("; ")}` : `PASS ${scenario.name}`);
  }
  const failures = results.filter((result) => result.issues.length);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "intools-report.json"), JSON.stringify(results, null, 2));
  console.log(`\n${results.length - failures.length}/${results.length} Intools scenarios passed.`);
  process.exitCode = failures.length ? 1 : 0;
})().catch((error) => { console.error(error); process.exit(1); });
