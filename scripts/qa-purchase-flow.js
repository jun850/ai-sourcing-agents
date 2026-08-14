#!/usr/bin/env node
"use strict";

const base = (process.argv[2] || "http://127.0.0.1:8090").replace(/\/$/, "");
const debug = process.env.CHROME_DEBUG || "http://127.0.0.1:9223";

function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) {
      const handler = pending.get(message.id);
      pending.delete(message.id);
      return message.error ? handler.reject(new Error(message.error.message)) : handler.resolve(message.result);
    }
    for (const listener of listeners.get(message.method) || []) listener(message.params || {});
  };
  return {
    ready: new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = () => reject(new Error("Could not connect to Chrome DevTools"));
    }),
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const callId = ++id;
        pending.set(callId, { resolve, reject });
        socket.send(JSON.stringify({ id: callId, method, params }));
      });
    },
    on(method, listener) {
      if (!listeners.has(method)) listeners.set(method, []);
      listeners.get(method).push(listener);
    },
    close() { socket.close(); },
  };
}

async function newPage() {
  const response = await fetch(`${debug}/json/new?about%3Ablank`, { method: "PUT" });
  if (!response.ok) throw new Error(`Chrome debug endpoint returned ${response.status}`);
  return response.json();
}

const mockApi = `(() => {
  const profile={id:'qa-user',email:'buyer@example.com',name:'Jun Buyer',full_name:'Jun Buyer',company_name:'Atelix QA',country:'Indonesia',role:'buyer',handle:'jun-buyer'};
  let addresses=[
    {id:'addr-id',label:'Bali office',recipient_name:'Jun Buyer',phone:'+62 812 0000 0000',line1:'Jalan Sunset Road 88',line2:'Unit 4',city:'Denpasar',province:'Bali',postal_code:'80221',country:'Indonesia',is_default:true},
    {id:'addr-jp',label:'Tokyo showroom',recipient_name:'Jun Buyer',phone:'+81 3 0000 0000',line1:'2-1 Marunouchi',line2:null,city:'Chiyoda',province:'Tokyo',postal_code:'100-0005',country:'Japan',is_default:false}
  ];
  const decorate=api=>Object.assign(api,{
    getSessionProfile:async()=>profile,getMyProfile:async()=>profile,onChange:()=>({data:{subscription:{unsubscribe(){}}}}),
    fetchCatalog:async()=>({products:[],factories:[]}),getCart:async()=>localStorage.getItem('qa_force_empty_db')==='1'||location.search.includes('qa-persist-empty-db')?[]:[{id:'FAB-100',qty:300,key:'FAB-100',options:{}}],replaceCart:async()=>({error:null}),
    getWishlist:async()=>[],replaceWishlist:async()=>({error:null}),getMyOrders:async()=>[],
    getAddresses:async()=>location.search.includes('qa-empty-address')?[]:addresses.map(address=>({...address})),
    createAddress:async payload=>{const address={...payload,id:'addr-new',is_default:false};addresses.push(address);return {address,error:null};},
    updateAddress:async(id,payload)=>{addresses=addresses.map(address=>address.id===id?{...address,...payload}:address);return {address:addresses.find(address=>address.id===id),error:null};},
    deleteAddress:async id=>{addresses=addresses.filter(address=>address.id!==id);return {error:null};},
    setDefaultAddress:async id=>{addresses=addresses.map(address=>({...address,is_default:address.id===id}));return {error:null};},
    getShippingRates:async()=>[
      {id:'ship-id',country_code:'ID',country_name:'Indonesia',service_name:'Tracked freight',flat_rate_usd:42,eta_min_days:4,eta_max_days:7,is_active:true},
      {id:'ship-jp',country_code:'JP',country_name:'Japan',service_name:'Air freight',flat_rate_usd:65,eta_min_days:3,eta_max_days:6,is_active:true}
    ],
    getShippingQuote:async country=>({quote:country==='Indonesia'?{id:'ship-id',country_code:'ID',country_name:'Indonesia',service_name:'Tracked freight',flat_rate_usd:42,eta_min_days:4,eta_max_days:7}:country==='Japan'?{id:'ship-jp',country_code:'JP',country_name:'Japan',service_name:'Air freight',flat_rate_usd:65,eta_min_days:3,eta_max_days:6}:null,error:null}),
    updateProfile:async()=>({error:null}),updateEmail:async()=>({error:null}),uploadImage:async()=>({error:{message:'Upload not used in QA'}}),
    placeOrder:async payload=>{window.__qaOrderPayload=payload;return {orderNo:null,error:{message:'QA stops before persistence'}};}
  });
  let value;
  Object.defineProperty(window,'ARCANA_API',{configurable:true,get:()=>value,set:api=>{value=decorate(api);}});
  try {
    localStorage.setItem('arcana_cart',JSON.stringify([{id:'FAB-100',qty:300,key:'FAB-100',options:{}}]));
    localStorage.setItem('arcana_cart_merged_qa-user','1');
    localStorage.setItem('arcana_session',JSON.stringify({role:'buyer',name:'Jun Buyer',avatarUrl:null}));
  } catch (_) {}
})()`;

async function open(route, width, height) {
  const target = await newPage();
  const cdp = connect(target.webSocketDebuggerUrl);
  await cdp.ready;
  const errors = [];
  const failures = [];
  cdp.on("Runtime.exceptionThrown", event => {
    const detail=event.exceptionDetails||{};
    errors.push(`${detail.url||"document"}: ${detail.exception?.description||detail.text||"Uncaught exception"}`);
  });
  cdp.on("Runtime.consoleAPICalled", event => {
    if (event.type === "error") errors.push(event.args?.map(arg => arg.value || arg.description || "").join(" "));
  });
  cdp.on("Network.responseReceived", event => {
    const response = event.response || {};
    if (response.status >= 400 && response.url?.startsWith(base) && !/favicon\.ico|_vercel\/insights/.test(response.url)) failures.push(`${response.status} ${response.url}`);
  });
  await Promise.all([cdp.send("Page.enable"), cdp.send("Runtime.enable"), cdp.send("Network.enable")]);
  await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 720, screenWidth: width, screenHeight: height });
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: mockApi });
  await cdp.send("Page.navigate", { url: `${base}${route}` });
  return { cdp, errors, failures };
}

async function waitFor(cdp, expression, timeout = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true });
    if (result.result.value) return true;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  return false;
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Browser evaluation failed");
  return result.result.value;
}

async function checkoutScenario(width, height) {
  const browser = await open("/pages/checkout.html", width, height);
  const { cdp } = browser;
  if (!await waitFor(cdp, "document.querySelector('[data-place]') && !document.querySelector('[data-place]').disabled")) throw new Error("Checkout did not resolve the default address and shipping quote");
  const data = await evaluate(cdp, `(() => {
    const place=document.querySelector('[data-place]');
    document.querySelector('[data-address-picker]').click();
    const picker=document.querySelector('.address-picker');
    const second=picker.querySelector('[data-address-select="addr-jp"]');
    const pickerOpened=picker.open;
    second?.click();
    return new Promise(resolve=>setTimeout(()=>{
      const note=document.querySelector('[data-item-note="0"]');
      note.value='Match the approved Light Gray lab dip.';
      note.dispatchEvent(new Event('input',{bubbles:true}));
      place.click();
      setTimeout(()=>resolve({
        h1:document.querySelector('h1')?.textContent.trim(),pickerOpened,pickerClosed:!picker.open,
        selected:document.getElementById('selectedAddress')?.innerText,shipping:document.getElementById('shippingStatus')?.innerText,
        summary:document.getElementById('summaryShipping')?.textContent,placeEnabled:!place.disabled,
        noteFields:document.querySelectorAll('[data-item-note]').length,noteCount:document.querySelector('[data-item-note-count]')?.textContent,
        globalNote:Boolean(document.getElementById('orderNote')),orderPayload:window.__qaOrderPayload,
        overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth,
        dialogs:document.querySelectorAll('dialog.address-dialog').length
      }),100);
    },250));
  })()`);
  cdp.close();
  const issues = [...browser.errors, ...browser.failures];
  if (data.h1 !== "Checkout") issues.push("missing checkout heading");
  if (!data.pickerOpened || !data.pickerClosed) issues.push("address picker open/select/close flow failed");
  if (!/Tokyo showroom/.test(data.selected) || !/Air freight/.test(data.shipping) || data.summary === "—" || !data.placeEnabled) issues.push("address selection did not update shipping and summary");
  if (data.noteFields !== 1 || data.globalNote || data.noteCount !== "38" || data.orderPayload?.items?.[0]?.note !== "Match the approved Light Gray lab dip." || data.orderPayload?.notes) issues.push("item-level supplier note did not replace the global order note contract");
  if (data.dialogs !== 1) issues.push("shared address editor was not created exactly once");
  if (data.overflow > 2) issues.push(`horizontal overflow: ${data.overflow}px`);
  return issues;
}

async function checkoutHandoffScenario() {
  const browser = await open("/pages/cart.html?seed=cart", 1440, 900);
  const { cdp } = browser;
  if (!await waitFor(cdp, "document.querySelector('[data-checkout]')")) throw new Error("Seeded cart did not expose checkout");
  await evaluate(cdp, `(() => {
    localStorage.setItem('qa_force_empty_db','1');
    document.querySelector('[data-checkout]').click();
    return true;
  })()`);
  if (!await waitFor(cdp, "location.pathname.endsWith('/pages/checkout.html') && document.querySelector('[data-place]')")) throw new Error("Checkout handoff lost the cart while account data was stale");
  const data = await evaluate(cdp, `(() => {
    const result={
      heading:document.querySelector('h1')?.textContent.trim(),
      items:document.querySelectorAll('.checkout-item').length,
      snapshot:Boolean(sessionStorage.getItem('arcana_checkout_cart'))
    };
    localStorage.removeItem('qa_force_empty_db');
    return result;
  })()`);
  cdp.close();
  const issues = [...browser.errors, ...browser.failures].filter(issue=>!issue.includes('AbortError: Transition was skipped'));
  if (data.heading !== "Checkout" || data.items < 1 || !data.snapshot) issues.push("checkout intent snapshot was not preserved across navigation");
  return issues;
}

async function cartRefreshPersistenceScenario() {
  const browser = await open("/pages/cart.html?qa-persist-empty-db=1", 1440, 900);
  const { cdp } = browser;
  if (!await waitFor(cdp, "document.querySelector('[data-checkout]')")) throw new Error("Persisted cart did not render before account reconciliation");
  await new Promise(resolve=>setTimeout(resolve,500));
  const beforeReload = await evaluate(cdp, `JSON.parse(localStorage.getItem('arcana_cart')||'[]').length`);
  await cdp.send('Page.reload');
  if (!await waitFor(cdp, "document.querySelector('[data-checkout]')")) throw new Error("Cart disappeared after refresh with a stale account cart");
  await new Promise(resolve=>setTimeout(resolve,500));
  const afterReload = await evaluate(cdp, `JSON.parse(localStorage.getItem('arcana_cart')||'[]').length`);
  cdp.close();
  const issues = [...browser.errors, ...browser.failures].filter(issue=>!issue.includes('AbortError: Transition was skipped'));
  if (beforeReload < 1 || afterReload < 1) issues.push("browser cart was overwritten by an empty account cart during refresh");
  return issues;
}

async function profileScenario() {
  const browser = await open("/pages/brand-owner.html#address", 1440, 900);
  const { cdp } = browser;
  if (!await waitFor(cdp, "document.querySelectorAll('#addrList .address-card').length === 2")) throw new Error("Profile address list did not load");
  const data = await evaluate(cdp, `(() => {
    document.getElementById('btnAddAddress').click();
    const editor=document.querySelector('dialog.address-dialog');
    const first=editor.querySelector('[name="recipient_name"]');
    const addOpen=editor.open,focused=document.activeElement===first;
    editor.querySelector('[data-address-close]').click();
    document.querySelector('[data-address-edit="addr-id"]').click();
    return {cards:document.querySelectorAll('#addrList .address-card').length,activeTab:document.querySelector('[data-account-tab="address"]').getAttribute('aria-selected'),addOpen,focused,editOpen:editor.open,editValue:first.value,overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth};
  })()`);
  cdp.close();
  const issues = [...browser.errors, ...browser.failures];
  if (data.cards !== 2 || data.activeTab !== "true") issues.push("profile address tab/list failed");
  if (!data.addOpen || !data.focused || !data.editOpen || data.editValue !== "Jun Buyer") issues.push("profile add/edit address dialog flow failed");
  if (data.overflow > 2) issues.push(`horizontal overflow: ${data.overflow}px`);
  return issues;
}

async function emptyAddressScenario() {
  const browser = await open("/pages/checkout.html?qa-empty-address=1", 1440, 900);
  const { cdp } = browser;
  if (!await waitFor(cdp, "document.querySelector('[data-address-picker]')?.textContent === 'Add address'")) throw new Error("Empty checkout did not expose the address action");
  const data = await evaluate(cdp, `(() => {
    const visible=element=>{const style=getComputedStyle(element),box=element.getBoundingClientRect();return !element.hidden&&style.display!=='none'&&box.width>0&&box.height>0;};
    const buttons=[...document.querySelectorAll('button')].filter(button=>visible(button)&&button.textContent.trim()==='Add address');
    const action=document.querySelector('[data-address-picker]');
    const height=Math.round(action.getBoundingClientRect().height),width=Math.round(action.getBoundingClientRect().width);
    action.click();
    return {buttons:buttons.length,height,width,pickerOpen:document.querySelector('.address-picker').open,hasBodyAction:Boolean(document.querySelector('[data-empty-address]'))};
  })()`);
  cdp.close();
  const issues = [...browser.errors, ...browser.failures];
  if (data.buttons !== 1 || data.hasBodyAction || !data.pickerOpen) issues.push("empty delivery state has duplicate or nonfunctional address actions");
  if (data.height > 38 || data.width > 120) issues.push(`desktop address action is not slim (${data.width}×${data.height})`);
  return issues;
}

(async () => {
  const scenarios = [
    ["cart persists across refresh with stale account cart", cartRefreshPersistenceScenario],
    ["cart to checkout handoff with stale account cart", checkoutHandoffScenario],
    ["checkout desktop", () => checkoutScenario(1440, 900)],
    ["checkout mobile", () => checkoutScenario(390, 844)],
    ["checkout empty address", emptyAddressScenario],
    ["profile addresses", profileScenario],
  ];
  let failed = 0;
  for (const [name, run] of scenarios) {
    try {
      const issues = await run();
      if (issues.length) { failed++; console.error(`FAIL ${name}: ${issues.join(" | ")}`); }
      else console.log(`PASS ${name}`);
    } catch (error) {
      failed++;
      console.error(`FAIL ${name}: ${error.message}`);
    }
  }
  if (failed) process.exitCode = 1;
  else console.log(`PASS ${scenarios.length}/${scenarios.length} signed-in purchase-flow scenarios`);
})().catch(error => { console.error(error); process.exit(1); });
