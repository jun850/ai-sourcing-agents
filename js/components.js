/* Atelix shared layer: stores, header/footer, toast, full interaction wiring */
(function () {
  "use strict";

  /* ---------- path helpers ---------- */
  const CLEAN_MARKETPLACE_ROUTE = /^\/(?:categories|search)(?:\/|$)/.test(
    location.pathname,
  );
  const ROOT = document.body.dataset.root === ".." && !CLEAN_MARKETPLACE_ROUTE; // true inside /pages
  const P = (n) =>
    CLEAN_MARKETPLACE_ROUTE ? "/pages/" + n : ROOT ? n : "pages/" + n;
  const HOME = CLEAN_MARKETPLACE_ROUTE
    ? "/"
    : ROOT
      ? "../index.html"
      : "index.html";
  const ASSET = (f) =>
    (CLEAN_MARKETPLACE_ROUTE ? "/assets/" : ROOT ? "../assets/" : "assets/") +
    f;
  const resolveAsset = (value, fallback) => {
    const image = String(value || "").trim();
    if (!image) return ASSET(`${fallback}.webp`);
    if (/^(?:https?:|data:|blob:|\/|\.\.?\/)/i.test(image)) return image;
    return ASSET(
      /\.(?:avif|jpe?g|png|webp|gif|svg)$/i.test(image)
        ? image
        : `${image}.webp`,
    );
  };
  const productAsset = (product) =>
    resolveAsset(product && product.img, "fabric-stack");
  const factoryAsset = (factory) =>
    resolveAsset(factory && (factory.logo_img || factory.img), "factory-interior");
  const factoryCardAsset = (factory) =>
    resolveAsset(
      factory && (factory.page_img || (!factory.logo_img ? factory.img : "")),
      "factory-interior",
    );
  const factoryPageAsset = (factory) =>
    factoryCardAsset(factory);
  const factoryHasLinkedProducts = (factory) =>
    (window.ARCANA_PRODUCTS || []).some((product) =>
      product.factorySlug
        ? String(product.factorySlug) === String(factory && factory.id)
        : product.factoryId && factory && factory.databaseId
          ? String(product.factoryId) === String(factory.databaseId)
          : /^F-\d+$/.test(String(factory && factory.id)) && product.seller === factory.name,
    );
  const factoryLocation = (factory) => {
    const cityById = {
      "F-01": "Shaoxing",
      "F-02": "Shaoxing",
      "F-03": "Guangzhou",
      "F-04": "Dongguan",
      "F-05": "Huzhou",
      "F-06": "Fukui",
      "F-07": "Imabari",
      "F-08": "Tokyo",
      "F-09": "Guangzhou",
      "F-10": "Guangzhou",
      "F-11": "Osaka",
      "F-12": "Wakayama",
      "F-13": "Nishiwaki",
    };
    const country = String((factory && (factory.country || factory.region)) || "").trim();
    const city = String(
      (factory && factory.city) ||
      cityById[factory && factory.id] ||
      String((factory && factory.loc) || "")
        .split(",")[0]
        .trim(),
    ).trim();
    return [country, city].filter((value, index, values) => value && values.indexOf(value) === index).join(", ");
  };
  window.ATELIX_factoryAsset = factoryAsset;
  window.ATELIX_factoryCardAsset = factoryCardAsset;
  window.ATELIX_factoryPageAsset = factoryPageAsset;
  window.ATELIX_factoryHasLinkedProducts = factoryHasLinkedProducts;
  window.ATELIX_factoryLocation = factoryLocation;
  window.ATELIX_productAsset = productAsset;
  document.addEventListener(
    "error",
    (event) => {
      const image = event.target;
      if (
        !(image instanceof HTMLImageElement) ||
        image.dataset.atelixFallback === "done"
      )
        return;
      if (
        !image.dataset.atelixFallback &&
        /\.webp(?:$|[?#])/i.test(image.src)
      ) {
        image.dataset.atelixFallback = "jpg";
        image.src = image.src.replace(/\.webp(?=$|[?#])/i, ".jpg");
        return;
      }
      image.dataset.atelixFallback = "done";
      image.src = ASSET(
        image.closest(".fcard,.factory-network-item,.sup-company-image,.sup-identity")
          ? "factory-interior.webp"
          : "fabric-stack.webp",
      );
    },
    true,
  );

  /* ---------- safe, lightweight rich text for editable product copy ---------- */
  function sanitizeRichText(value) {
    const template = document.createElement("template");
    template.innerHTML = String(value || "");
    const allowed = new Set([
      "P",
      "BR",
      "STRONG",
      "B",
      "EM",
      "I",
      "U",
      "UL",
      "OL",
      "LI",
      "FONT",
    ]);
    const clean = (node, parent) => {
      if (node.nodeType === Node.TEXT_NODE) {
        parent.appendChild(document.createTextNode(node.textContent || ""));
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const tag = node.tagName;
      if (
        tag === "SCRIPT" ||
        tag === "STYLE" ||
        tag === "IFRAME" ||
        tag === "OBJECT"
      )
        return;
      const target = allowed.has(tag)
        ? document.createElement(
            tag === "B" ? "strong" : tag === "I" ? "em" : tag.toLowerCase(),
          )
        : parent;
      if (target !== parent) {
        if (tag === "FONT") {
          const size = node.getAttribute("size");
          if (["2", "3", "4"].includes(size)) target.setAttribute("size", size);
        }
        parent.appendChild(target);
      }
      [...node.childNodes].forEach((child) => clean(child, target));
    };
    const output = document.createElement("div");
    [...template.content.childNodes].forEach((node) => clean(node, output));
    return output.innerHTML;
  }
  function initRichEditors(scope = document) {
    scope.querySelectorAll("[data-rich-editor]").forEach((editor) => {
      if (editor.dataset.richReady) return;
      editor.dataset.richReady = "1";
      const input = editor.querySelector("[data-rich-input]");
      const value = editor.querySelector("[data-rich-value]");
      let range = null;
      const remember = () => {
        const selection = getSelection();
        if (
          selection &&
          selection.rangeCount &&
          input.contains(selection.anchorNode)
        )
          range = selection.getRangeAt(0).cloneRange();
      };
      const restore = () => {
        input.focus();
        if (!range) return;
        const selection = getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      };
      const sync = () => {
        value.value = sanitizeRichText(input.innerHTML).trim();
      };
      ["keyup", "mouseup", "input"].forEach((type) =>
        input.addEventListener(type, () => {
          remember();
          sync();
        }),
      );
      input.addEventListener("blur", () => {
        input.innerHTML = sanitizeRichText(input.innerHTML);
        sync();
      });
      input.addEventListener("paste", (event) => {
        event.preventDefault();
        document.execCommand(
          "insertText",
          false,
          event.clipboardData.getData("text/plain"),
        );
      });
      editor.querySelectorAll("[data-rich-command]").forEach((button) =>
        button.addEventListener("click", () => {
          restore();
          document.execCommand(button.dataset.richCommand, false);
          remember();
          sync();
        }),
      );
      const size = editor.querySelector("[data-rich-size]");
      if (size)
        size.addEventListener("change", () => {
          restore();
          document.execCommand("fontSize", false, size.value);
          remember();
          sync();
        });
    });
  }
  function setRichEditor(form, name, value) {
    const hidden = form.elements[name];
    const editor = hidden && hidden.closest("[data-rich-editor]");
    if (!editor) return;
    const safe = sanitizeRichText(value);
    editor.querySelector("[data-rich-input]").innerHTML = safe;
    hidden.value = safe;
  }
  function syncRichEditors(scope = document) {
    scope.querySelectorAll("[data-rich-editor]").forEach((editor) => {
      const input = editor.querySelector("[data-rich-input]");
      editor.querySelector("[data-rich-value]").value = sanitizeRichText(
        input.innerHTML,
      ).trim();
    });
  }
  window.ATELIX_sanitizeRichText = sanitizeRichText;
  window.ATELIX_initRichEditors = initRichEditors;
  window.ATELIX_setRichEditor = setRichEditor;
  window.ATELIX_syncRichEditors = syncRichEditors;

  /* ---------- optimistic browser state, synchronized where APIs are available ---------- */
  const LS = {
    get(k, d) {
      try {
        return JSON.parse(localStorage.getItem("arcana_" + k)) ?? d;
      } catch (_) {
        return d;
      }
    },
    set(k, v) {
      localStorage.setItem("arcana_" + k, JSON.stringify(v));
    },
  };
  const normalizeSelection = (options) =>
    Object.fromEntries(
      Object.entries(options || {})
        .map(([name, value]) => [String(name).trim(), String(value).trim()])
        .filter(([name, value]) => name && value)
        .sort(([left], [right]) => left.localeCompare(right)),
    );
  const cartLineKey = (id, options, lineType = "product") => {
    const selection = normalizeSelection(options);
    const suffix = Object.entries(selection)
      .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
      .join("&");
    const prefix = lineType === "swatch" ? `${id}::swatch` : id;
    return suffix ? `${prefix}${lineType === "swatch" ? "&" : "::"}${suffix}` : prefix;
  };
  window.ATELIX_cartLineKey = cartLineKey;
  const checkoutCartKey = "arcana_checkout_cart";
  const normalizeCartItems = (items) =>
    (Array.isArray(items) ? items : []).map((item) => ({
      ...item,
      lineType: item.lineType === "swatch" ? "swatch" : "product",
      key: item.key || cartLineKey(item.id, item.options, item.lineType),
      options: normalizeSelection(item.options),
    }));
  const readCartPending = () => LS.get("cart_pending", {});
  const clearSyncedCartPending = (synced) => {
    const current = readCartPending();
    Object.entries(synced || {}).forEach(([key, operation]) => {
      if (current[key] && current[key].token === operation.token)
        delete current[key];
    });
    LS.set("cart_pending", current);
  };
  const sameCartItems = (left, right) => {
    const comparable = (items) =>
      normalizeCartItems(items)
        .map(({ id, qty, key, options, lineType }) => ({ id, qty, key, options, lineType }))
        .sort((a, b) => a.key.localeCompare(b.key));
    return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
  };
  const Store = {
    session() {
      return LS.get("session", null);
    },
    login(role, name) {
      LS.set("session", {
        role,
        name:
          name || (role === "seller" ? "Zhejiang Greenknit" : "Jessica Smith"),
      });
    },
    logout() {
      const clear = () => {
        localStorage.removeItem("arcana_session");
      };
      if (window.ARCANA_API && ARCANA_API.signOut) {
        return Promise.resolve(ARCANA_API.signOut()).then(clear, clear);
      }
      clear();
      return Promise.resolve();
    },
    cart() {
      return normalizeCartItems(LS.get("cart", []));
    },
    beginCheckout() {
      try {
        sessionStorage.setItem(
          checkoutCartKey,
          JSON.stringify({ createdAt: Date.now(), items: Store.cart() }),
        );
      } catch (_) {}
    },
    checkoutCart() {
      try {
        const snapshot = JSON.parse(sessionStorage.getItem(checkoutCartKey));
        const isFresh =
          snapshot &&
          Array.isArray(snapshot.items) &&
          Date.now() - Number(snapshot.createdAt || 0) < 30 * 60 * 1000;
        if (isFresh) return normalizeCartItems(snapshot.items);
        sessionStorage.removeItem(checkoutCartKey);
      } catch (_) {}
      return Store.cart();
    },
    cartCount() {
      return Store.cart().length;
    }, // distinct SKUs (header badge)
    cartUnits() {
      return Store.cart().reduce((n, i) => n + i.qty, 0);
    },
    addToCart(id, qty, options = {}, lineType = "product") {
      qty = qty || 1;
      const selection = normalizeSelection(options);
      const normalizedLineType = lineType === "swatch" ? "swatch" : "product";
      const key = cartLineKey(id, selection, normalizedLineType);
      const c = Store.cart();
      const row = c.find((i) => i.key === key);
      if (row) row.qty += qty;
      else c.push({ id, qty, key, options: selection, lineType: normalizedLineType });
      LS.set("cart", c);
      syncBadges();
      pushCartItem(id, row ? row.qty : qty, selection, key, normalizedLineType);
      return Store.cartCount();
    },
    setQty(key, qty) {
      const c = Store.cart();
      const r = c.find((i) => i.key === key || (i.id === key && i.key === i.id));
      if (r) {
        r.qty = Math.max(1, qty);
        LS.set("cart", c);
        pushCartItem(r.id, r.qty, r.options, r.key, r.lineType);
      }
    },
    remove(key) {
      const row = Store.cart().find((item) => item.key === key || (item.id === key && item.key === item.id));
      LS.set(
        "cart",
        Store.cart().filter((i) => i.key !== key && !(i.id === key && i.key === i.id)),
      );
      syncBadges();
      if(row)pushCartItem(row.id,0,row.options,row.key,row.lineType);
    },
    clearCart() {
      localStorage.removeItem("arcana_cart");
      localStorage.removeItem("arcana_addons");
      localStorage.removeItem("arcana_cart_pending");
      try {
        sessionStorage.removeItem(checkoutCartKey);
      } catch (_) {}
      syncBadges();
    },
    addons() {
      return LS.get("addons", { qc: false, ins: false });
    },
    setAddon(k, v) {
      const a = Store.addons();
      a[k] = !!v;
      LS.set("addons", a);
    },
    // legacy entries were plain SKU strings; normalize to {id, qty} on read.
    saved() {
      return LS.get("saved", []).map((x) =>
        typeof x === "string" ? { id: x, qty: 1 } : x,
      );
    },
    isSaved(id) {
      return Store.saved().some((i) => i.id === id);
    },
    toggleSaved(id, qty) {
      const s = Store.saved();
      const i = s.findIndex((x) => x.id === id);
      const on = i < 0;
      if (on) s.push({ id, qty: qty || 1 });
      else s.splice(i, 1);
      LS.set("saved", s);
      syncBadges();
      pushWishlistItem(id, on ? qty || 1 : 0);
      return on;
    },
    setSavedQty(id, qty) {
      const s = Store.saved();
      const r = s.find((x) => x.id === id);
      if (r) {
        r.qty = Math.max(1, qty);
        LS.set("saved", s);
        pushWishlistItem(id, r.qty);
      }
    },
    removeSaved(id) {
      LS.set(
        "saved",
        Store.saved().filter((i) => i.id !== id),
      );
      syncBadges();
      pushWishlistItem(id, 0);
    },
    orders() {
      return LS.get("orders", []).slice().reverse();
    },
    getOrder(no) {
      return LS.get("orders", []).find((o) => o.no === no) || null;
    },
    saveOrder(order) {
      const o = LS.get("orders", []);
      o.push(order);
      LS.set("orders", o);
    },
    updateOrder(no, patch) {
      const o = LS.get("orders", []);
      const r = o.find((x) => x.no === no);
      if (r) Object.assign(r, patch);
      LS.set("orders", o);
      return r;
    },
  };
  window.ARCANA = Store;

  /* ---------- Copilot match scoping ----------
   sessionStorage, not localStorage: the "why this matched" panel on a PDP
   must only reflect the ACTUAL result set from the most recent Copilot
   search, and must evaporate the moment the user steps outside the
   Copilot-results <-> PDP loop (home, plain category browsing, cart, nav
   elsewhere) — never resurface later, never appear on a product that
   wasn't really shown as a match. Writer: category.html's run(). Reader:
   product.html's match panel. */
  const COP_MATCH_KEY = "arcana_copilot_matches";
  function setCopilotMatches(list) {
    try {
      const items = {};
      (list || []).forEach((r) => {
        if (r && r.p)
          items[r.p.id] = {
            score: r.score,
            hits: r.hits,
            miss: r.miss,
            matched: r.matched,
            total: r.total,
          };
      });
      sessionStorage.setItem(COP_MATCH_KEY, JSON.stringify({ items }));
    } catch (_) {}
  }
  function getCopilotMatchFor(id) {
    try {
      const raw = sessionStorage.getItem(COP_MATCH_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return (data && data.items && data.items[id]) || null;
    } catch (_) {
      return null;
    }
  }
  window.ARCANA_setCopilotMatches = setCopilotMatches;
  window.ARCANA_getCopilotMatchFor = getCopilotMatchFor;
  (function pruneCopilotMatchesIfOutsideFlow() {
    const path = location.pathname;
    const onCopilotResults =
      /category\.html$/.test(path) &&
      /(^|[?&])copilot=1(&|$)/.test(location.search);
    const onPDP = /product\.html$/.test(path);
    if (!onCopilotResults && !onPDP) {
      try {
        sessionStorage.removeItem(COP_MATCH_KEY);
      } catch (_) {}
    }
  })();

  /* ---------- icons ---------- */
  const IC = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 10 9-7 9 7"/><path d="M5.5 9v11h13V9M9.5 20v-6h5v6"/></svg>',
    search:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>',
    caret:
      '<svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>',
    heart:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"/></svg>',
    globe:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/></svg>',
    seller:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 21h18M5 21V9l5-3v15M14 21V9l5 3v9M9 12h.01M9 15h.01"/></svg>',
    cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.4 12.4a1.5 1.5 0 0 0 1.5 1.2h8.7a1.5 1.5 0 0 0 1.5-1.2L22 7H6"/></svg>',
    shield:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6z"/><path d="m9 12 2 2 4-4"/></svg>',
    medal:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="9" r="6"/><path d="m9 14-2 7 5-3 5 3-2-7"/></svg>',
    truck:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 6h11v11H2zM13 9h4l4 4v4h-8"/><circle cx="6" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
    headset:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="2" y="14" width="4" height="6" rx="1.5"/><rect x="18" y="14" width="4" height="6" rx="1.5"/><path d="M20 20a4 4 0 0 1-4 3h-2"/></svg>',
    check:
      '<svg viewBox="0 0 24 24" fill="var(--green)" stroke="#fff" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/></svg>',
    chevR:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="m9 6 6 6-6 6"/></svg>',
    logout:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
    factory:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 21V9l6 3V9l6 3V6l6 3v12z"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z"/><circle cx="12" cy="9" r="2.2"/></svg>',
    tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20.6 13.4 12 22l-9-9V4a1 1 0 0 1 1-1h9z"/><circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" stroke="none"/></svg>',
    msg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/></svg>',
    share:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5 8.6 10.5"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 8 12 3 3 8l9 5zM3 8v8l9 5 9-5V8"/></svg>',
    bookmark:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>',
    camera:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 8h3.2L9 5.4A1 1 0 0 1 9.8 5h4.4a1 1 0 0 1 .8.4L16.8 8H20a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.4"/></svg>',
    document:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 3h8l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v5h5M8 13h8M8 17h6"/></svg>',
    spark:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.4 2.4M15.3 15.3l2.4 2.4M17.7 6.3l-2.4 2.4M8.7 15.3l-2.4 2.4"/><circle cx="12" cy="12" r="3"/></svg>',
  };
  window.ARCANA_IC = IC;

  /* ---------- shared product card (single source, used on every surface) ---------- */
  // Shared cards always show the catalog price. Campaign pricing is currently hidden.
  const soldOf = (id) => {
    const value = String(id || "");
    return ["500+", "1rb+", "2rb+", "5rb+", "800+"][
      (value.charCodeAt(Math.min(4, Math.max(0, value.length - 1))) || 0) % 5
    ];
  };
  /* opts: {href, shop=true, fabricSpec=false} — language + currency aware */
  function cardHTML(p, opts) {
    opts = opts || {};
    p = p || {};
    const tr = window.ARCANA_TR || ((s) => s),
      t = window.ARCANA_T || ((s) => s),
      money = window.ARCANA_money || ((n) => "$" + n.toFixed(2)),
      productMoney = window.ATELIX_productMoney || ((product) => money(product.price));
    const esc = (s) =>
      String(s == null ? "" : s).replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
    const translated = (s) => (s == null ? "" : String(tr(s) || "").trim());
    const href = opts.href || P("product.html") + "?id=" + p.id;
    const isService = p.cat === "oem";
    const badge = isService
      ? `<span class="tbadge">${t("OEM SERVICE")}</span>`
      : p.badge === "recycle"
        ? `<span class="tbadge" style="background:var(--green)">${t("RECYCLED")}</span>`
        : p.badge === "oem"
          ? '<span class="tbadge">OEM</span>'
          : "";
    const nm = translated(p.name),
      comp = translated(p.comp),
      spec = translated(p.spec);
    const titleParts =
      opts.fabricSpec && p.cat === "fabrics" ? [nm, comp, spec] : [nm, comp];
    const title = titleParts.filter(Boolean).join(" — ");
    const priceLine =
      p.price > 0
        ? `${esc(productMoney(p))}${p.unit ? `<small>/${esc(translated(p.unit))}</small>` : ""}`
        : `<span class="tquote">${t("Contact supplier")}</span>`;
    const meta = isService
      ? `<div class="tmeta">${IC.truck} ${esc(spec)} ${t("lead")} <span class="dot">·</span> ${t("MOQ")} ${esc(translated(p.moq))}</div>`
      : `<div class="tmeta">${soldOf(p.id)} ${t("sold")}</div>`;
    const shopRow =
      opts.shop === false
        ? ""
        : `<div class="tshop"><span class="tnm">${esc(translated(p.seller))}</span>${p.supplierVerified===false?'':`<span class="tvf">${IC.check}</span>`}</div>`;
    return `<a class="tcard" href="${esc(href)}">
    <div class="tthumb">${badge}<img src="${esc(productAsset(p))}" alt="${esc(nm)}" loading="lazy"></div>
    <div class="tbody">
      <h4>${esc(title || t("Product"))}</h4>
      <div class="tprice">${priceLine}</div>
      ${meta}
      ${shopRow}
      ${p.loc ? `<div class="tloc">${IC.pin}<span>${esc(translated(p.loc))}</span></div>` : ""}
    </div></a>`;
  }
  /* pages register a render fn so cards/prices re-render on language switch */
  const langRenderers = [];
  window.ARCANA_onLang = (fn) => {
    if (typeof fn === "function") {
      langRenderers.push(fn);
    }
  };
  /* attach add-to-cart handlers inside a freshly-rendered container */
  function wireCards(container) {
    (container || document).querySelectorAll(".tcard [data-add]").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        Store.addToCart(b.dataset.add, parseInt(b.dataset.qty || "1", 10));
        const p =
          window.ARCANA_PRODUCT_MAP && window.ARCANA_PRODUCT_MAP[b.dataset.add];
        toast(`Added ${p ? p.name : "item"} to cart`, {
          href: P("cart.html"),
          label: "View cart",
        });
      }),
    );
    // Fade thumbnails in as they finish loading instead of popping in. Default
    // (no .will-fade) stays opacity:1, and both load/error add .loaded, so an
    // image can never get stuck invisible.
    (container || document).querySelectorAll(".tthumb img").forEach((img) => {
      if (img.complete) return;
      img.classList.add("will-fade");
      const done = () => img.classList.add("loaded");
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
    });
  }
  window.ARCANA_card = cardHTML;
  window.ARCANA_wireCards = wireCards;

  /* ---------- "Recommended for you" — used by empty cart/wishlist states ----------
   One pick per category first (so the shelf isn't all-fabrics), then filled
   randomly up to n. Non-deterministic by design (matches how a real reco
   shelf would vary); callers should compute it once per page load, not per render. */
  function pickRecommended(n) {
    n = n || 8;
    const pool = (window.ARCANA_PRODUCTS || []).filter((p) => p.cat !== "oem");
    const shuffle = (arr) => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    const byCat = {};
    pool.forEach((p) => {
      (byCat[p.cat] = byCat[p.cat] || []).push(p);
    });
    const picks = [];
    shuffle(Object.keys(byCat)).forEach((c) => {
      if (picks.length < n) picks.push(shuffle(byCat[c])[0]);
    });
    shuffle(pool.filter((p) => !picks.includes(p))).forEach((p) => {
      if (picks.length < n) picks.push(p);
    });
    return picks.slice(0, n);
  }
  window.ARCANA_recommended = pickRecommended;

  function markSVG(color) {
    return `<svg class="mark" viewBox="0 0 2000 2000" fill="${color || "currentColor"}" aria-hidden="true">
<path d="M672.85,1077.33c-89.31,71.09-24.4,192-22.2,196.07-5.25-1.36-179.8-48.89-165.65-217.59,2.94-35.09,21.1-70.47,49.87-99.24,162.43-162.43,469.66,21.34,393.78,208.71h0c-42.2-97.19-153.7-169.12-255.8-87.95Z"/>
<path d="M1349.35,1273.4c2.2-4.07,67.11-124.98-22.2-196.07-121.59-96.68-256.4,23.72-271.9,145.31-15.42,121.59,79.56,198.95,79.56,198.95-81.77,58.55-134.81,153.62-134.81,153.62,0,0-53.04-95.07-134.81-153.62,113.28-92.12,69.22-261.95,239.57-432.3,190.62-190.62,399.61-60.17,410.23,66.51,14.15,168.7-160.4,216.23-165.65,217.59Z"/>
<path d="M1134.7,888.48l-4.7,5.4c10.52-50.25-1.28-105.4-35.41-144.55l-94.59-108.54-94.5,108.54c-34.21,39.25-46.01,94.41-35.41,144.65l-4.79-5.5c-74.4-85.38-74.4-223.75,0-309.12l134.7-154.56,134.7,154.56c74.4,85.38,74.4,223.75,0,309.12Z"/>
</svg>`;
  }

  function brand() {
    return `<a class="brand" href="${HOME}" aria-label="Atelix">${markSVG()}<span class="brand-name"><span class="word">Atelix</span></span></a>`;
  }
  const ALGOLIA_CONFIG_URL =
    "https://bobwfxvxzjovpgmmqsew.supabase.co/functions/v1/algolia-public-config";
  let algoliaConfigPromise = null;
  function getAlgoliaConfig() {
    if (!algoliaConfigPromise)
      algoliaConfigPromise = fetch(ALGOLIA_CONFIG_URL).then((response) => {
        if (!response.ok) throw new Error("search_config_unavailable");
        return response.json();
      });
    return algoliaConfigPromise;
  }
  async function searchPublicAlgolia(kind, query, options) {
    const config = await getAlgoliaConfig();
    const index = config.indices && config.indices[kind];
    if (!index) throw new Error("search_index_unavailable");
    const params = {
      attributesToHighlight: [],
      highlightPreTag: "",
      highlightPostTag: "",
      ...(options || {}),
    };
    delete params.hitsPerPage;
    delete params.page;
    const response = await fetch(
      `https://${config.appId}-dsn.algolia.net/1/indexes/${encodeURIComponent(index)}/query`,
      {
        method: "POST",
        headers: {
          "X-Algolia-Application-Id": config.appId,
          "X-Algolia-API-Key": config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: String(query || ""),
          hitsPerPage: options?.hitsPerPage || 12,
          page: options?.page || 0,
          ...params,
        }),
      },
    );
    if (!response.ok) throw new Error("search_request_failed");
    return response.json();
  }
  window.ATELIX_getAlgoliaConfig = getAlgoliaConfig;
  window.ATELIX_searchPublicAlgolia = searchPublicAlgolia;
  /* Algolia is a search index, never an authority for customer-facing links.
   Resolve every hit against the current public catalog before making it clickable. */
  const productRoute = (id) => {
    const product = window.ARCANA_PRODUCT_MAP?.[id];
    return product
      ? P("product.html") + "?id=" + encodeURIComponent(product.id)
      : null;
  };
  const factoryRoute = (id) => {
    const factory = window.ARCANA_FACTORY_MAP?.[id];
    return factory
      ? P("supplier.html") + "?id=" + encodeURIComponent(factory.id)
      : null;
  };
  window.ATELIX_productRoute = productRoute;
  window.ATELIX_factoryRoute = factoryRoute;

  const searchBox = (
    ph,
  ) => `<form class="search" role="search" data-search-form>
  <label class="visually-hidden" for="site-search">Search</label>${IC.search}
  <input id="site-search" name="q" placeholder="${ph}" data-i18n-ph="search.ph" autocomplete="off" spellcheck="false"
    role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="autocomplete">
  <button type="button" class="s-design" data-design-match aria-label="Match a design reference" title="Match a tech pack or design reference">${IC.document}</button>
  <button type="button" class="s-cam" data-cam aria-label="Search fabrics by photo" title="Search fabrics by photo">${IC.camera}</button>
  <div class="s-pop" id="autocomplete" role="listbox" aria-label="Search suggestions" data-search-pop hidden></div>
</form>`;

  const KAT = [
    {
      label: "Fabrics",
      slug: "fabrics",
      subs: [
        ["Cotton", "cotton"],
        ["Linen", "linen"],
        ["Polyester", "polyester"],
        ["Viscose & Rayon", "viscose"],
        ["Knits", "knits"],
        ["Denim", "denim"],
      ],
    },
    {
      label: "Accessories",
      slug: "accessories",
      subs: [
        ["Labels & Tags", "labels"],
        ["Garment Hardware", "hardware"],
      ],
    },
    {
      label: "Trims",
      slug: "trims",
      subs: [
        ["Zippers", "zippers"],
        ["Buttons", "buttons"],
        ["Interlining", "interlining"],
        ["Lining", "lining"],
        ["Tapes & Elastic", "simple-trims"],
      ],
    },
    {
      label: "Yarns & Threads",
      slug: "yarns",
      subs: [
        ["Cotton yarn", "cotton"],
        ["Polyester thread", "polyester"],
        ["Wool yarn", "wool"],
        ["Nylon yarn", "nylon"],
      ],
    },
    {
      label: "OEM Services",
      slug: "oem",
      subs: [
        ["Clothing", "clothing"],
        ["Accessories", "accessories"],
        ["Socks", "socks"],
      ],
    },
    {
      label: "Factories",
      slug: "factories",
      subs: [
        ["Verified mills", ""],
        ["OEM factories", ""],
        ["Material suppliers", ""],
      ],
    },
  ];
  const katHref = (slug, sub = "") =>
    slug === "factories"
      ? P("factories.html")
      : "/categories/" + slug + (sub ? "/" + sub : "");
  function katPanel() {
    const items = KAT.map(
      (category, i) =>
        `<button class="kat-item${i === 0 ? " on" : ""}" data-kat-item="${i}"><span>${category.label}</span>${IC.chevR}</button>`,
    ).join("");
    const panels = KAT.map(
      (category, i) =>
        `<div class="kat-detail${i === 0 ? " on" : ""}" data-kat-detail="${i}"><h4>${category.label}</h4><div class="kat-subs">${category.subs.map(([label, sub]) => `<a href="${katHref(category.slug, sub)}">${label}</a>`).join("")}</div><a class="kat-all" href="${katHref(category.slug)}">View all ${category.label} ${IC.chevR}</a></div>`,
    ).join("");
    return `<div class="kat-panel" data-kat-panel hidden><div class="kat-list">${items}</div><div class="kat-details">${panels}</div></div>`;
  }

  /* single auth cluster: one Log in + one Sign up, or account menu when signed in */
  function authCluster() {
    const s = Store.session();
    if (s) return accountMenu(s);
    return `<a class="btn-login" href="${P("login.html")}" data-i18n="auth.login">Log in</a><a class="btn-daftar" href="${P("signup.html")}" data-i18n="auth.signup">Sign up</a>`;
  }
  function accountMenu(s) {
    const initials = s.name
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
    const av = s.avatarUrl
      ? `<img src="${s.avatarUrl}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`
      : initials;
    const dest =
      s.role === "seller" ? P("dashboard.html") : P("brand-owner.html");
    const roleLabel =
      s.role === "seller"
        ? "Factory · Seller"
        : s.role === "admin"
          ? "Atelix · Admin"
          : "Brand Owner · Buyer";
    const adminLinks =
      s.role === "admin"
        ? `<a role="menuitem" href="/intools/dashboard">Intools</a><a role="menuitem" href="${P("admin-orders.html")}">Users &amp; orders</a>`
        : "";
    const privateOffers =
      s.role === "buyer"
        ? `<a role="menuitem" href="${P("private-offers.html")}">Private offers</a>`
        : "";
    return `<div class="acct" data-acct>
    <button class="acct-btn" aria-haspopup="true" aria-expanded="false"><span class="acct-av">${av}</span><span class="acct-nm">${s.name.split(" ")[0]}</span>${IC.caret}</button>
    <div class="acct-pop" role="menu" hidden>
      <div class="acct-hd"><span class="acct-av">${av}</span><div><b>${s.name}</b><span>${roleLabel}</span></div></div>
      <a role="menuitem" href="${dest}">${s.role === "seller" ? "Supplier dashboard" : "My profile"}</a>
      ${adminLinks}
      <a role="menuitem" href="${P("cart.html")}">My cart</a>
      <a role="menuitem" href="${P("wishlist.html")}">Wishlist</a>
      ${privateOffers}
      <button role="menuitem" data-logout>${IC.logout}<span>Log out</span></button>
    </div>
  </div>`;
  }

  function buildHeader() {
    const body = document.body,
      root = document.getElementById("hdr");
    if (!root) return;
    const s = Store.session();
    const productContext = /\/product\.html$/.test(location.pathname);
    const mobileMarketplaceSearch = body.hasAttribute(
      "data-marketplace-search",
    );
    // seller surface = explicit data-surface, or a signed-in seller viewing their workspace
    const seller =
      body.dataset.surface === "seller" ||
      (s && s.role === "seller" && body.dataset.surface !== "buyer");
    const ph = seller
      ? "Search your SKUs, orders and buyers…"
      : body.dataset.search || "Search fabrics, trims, accessories, factories…";
    root.className =
      "hdr" + (mobileMarketplaceSearch ? "" : " no-marketplace-search");
    // seller sees a workspace strip (no buyer "sell" pitch, no cart); buyer sees the sell pitch + cart
    const topbar = seller
      ? `<div class="topbar"><div class="topbar-in">
        <span class="tb-app">${IC.seller}<span>Supplier workspace</span></span>
        <a class="tb-app" href="${HOME}">Browse the marketplace ${IC.chevR}</a>
      </div></div>`
      : "";
    const cartIcon = seller
      ? ""
      : `<a class="ic-link cart-ic" href="${P("cart.html")}" aria-label="Cart">${IC.cart}<span class="badge-count" data-cart-badge hidden></span></a><span class="hdr-div"></span>`;
    const mobileBack = productContext
      ? `<a class="mobile-back" href="/categories" aria-label="Back to browse"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m14 5-7 7 7 7M7 12h13"/></svg></a>`
      : "";
    if (productContext) root.dataset.context = "product";
    root.innerHTML = `
  ${topbar}
  <div class="hdr-in">
    ${mobileBack}
    ${brand()}
    <button class="kat-btn" data-kat aria-haspopup="true" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg><span data-i18n="nav.categories">Categories</span>${IC.caret}</button>
    ${searchBox(ph)}
    ${cartIcon}
    ${authCluster()}
    ${katPanel()}
  </div>`;
    syncBadges();
  }

  /* Phone navigation is deliberately a different information architecture from
   the desktop header. Buyer browsing is a frequent, thumb-led loop; seller
   and admin work remains contextual in the compact header and page tabs. */
  function buildMobileNav() {
    const path = location.pathname;
    const focused =
      /\/(?:login|signup|forgot-password|reset-password|checkout|order|building)\.html$/.test(
        path,
      );
    const workspace =
      document.body.dataset.surface === "seller" ||
      /\/(?:dashboard|admin-orders|admin-supplier)\.html$/.test(path);
    const transactional = /\/(?:cart|product)\.html$/.test(path);
    if (
      focused ||
      workspace ||
      transactional ||
      document.querySelector(".mobile-nav")
    )
      return;
    const normalizedPath = path.replace(/\/+$/, "") || "/";
    const onHome =
      normalizedPath === "/" || /\/index\.html$/.test(normalizedPath);
    const onBrowse =
      /^\/(?:categories|search)(?:\/|$)/.test(normalizedPath) ||
      /\/(?:category|categories|factories|supplier|search)\.html$/.test(
        normalizedPath,
      );
    const onSaved = /\/wishlist\.html$/.test(normalizedPath);
    const onOrders = /\/orders\.html$/.test(normalizedPath);
    const onAccount = /\/brand-owner\.html$/.test(normalizedPath) && !onOrders;
    const guest = !Store.session();
    const nav = document.createElement("nav");
    nav.className = "mobile-nav";
    nav.setAttribute("aria-label", "Primary navigation");
    const navItem = (active, href, icon, label, key, badge = "") =>
      `<a class="${active ? "on" : ""}" href="${href}" ${active ? 'aria-current="page"' : ""}><span class="mobile-nav__icon">${icon}${badge}</span><span data-i18n="${key}">${label}</span></a>`;
    nav.innerHTML = `
    ${navItem(onHome, HOME, IC.home, "Home", "nav.home")}
    ${navItem(onBrowse, "/categories", IC.search, "Browse", "nav.browse")}
    ${navItem(onSaved, P("wishlist.html"), IC.heart, "Saved", "nav.saved", "<i data-saved-badge hidden></i>")}
    ${navItem(onOrders, P("orders.html"), IC.document, "Orders", "nav.orders")}
    ${
      guest
        ? `<button class="mobile-account-trigger" type="button" aria-haspopup="dialog"><span class="mobile-nav__icon">${IC.user}</span><span data-i18n="nav.account">Account</span></button>`
        : navItem(
            onAccount,
            P("brand-owner.html"),
            IC.user,
            "Account",
            "nav.account",
          )
    }`;
    document.body.appendChild(nav);
    const accountTrigger = nav.querySelector(".mobile-account-trigger");
    if (accountTrigger)
      accountTrigger.addEventListener("click", () => {
        const gate = document.createElement("div");
        gate.className = "mobile-account-gate";
        gate.setAttribute("role", "dialog");
        gate.setAttribute("aria-modal", "true");
        gate.setAttribute("aria-labelledby", "mobileAccountGateTitle");
        gate.innerHTML = `<div class="mobile-account-gate__sheet"><button type="button" class="mobile-account-gate__close" aria-label="Close account options">×</button><span class="mobile-account-gate__icon">${IC.user}</span><h2 id="mobileAccountGateTitle">Your Atelix account</h2><p>Log in to manage orders and saved products, or create a brand owner account to start sourcing.</p><a class="btn btn-green btn-block" href="${P("signup.html")}">Create an account</a><a class="mobile-account-gate__login" href="${P("login.html")}">Log in</a></div>`;
        const close = () => {
          gate.remove();
          document.removeEventListener("keydown", onKey);
        };
        const onKey = (event) => {
          if (event.key === "Escape") close();
        };
        gate
          .querySelector(".mobile-account-gate__close")
          .addEventListener("click", close);
        gate.addEventListener("click", (event) => {
          if (event.target === gate) close();
        });
        document.addEventListener("keydown", onKey);
        document.body.appendChild(gate);
        gate.querySelector(".mobile-account-gate__close").focus();
      });
    syncBadges();
  }

  function buildFooter() {
    const el = document.getElementById("ftr");
    if (!el) return;
    const building = P("building.html");
    const about = ROOT ? "../about" : "about";
    const helpCenter = ROOT ? "../help-center" : "help-center";
    const terms = P("terms.html"),
      privacy = P("privacy.html"),
      trust = P("trust-safety.html"),
      contact = "mailto:info@arcanawangsa.com";
    const soc = {
      x: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h3l-7 8 8 12h-6l-5-6-5 6H2l8-9L2 2h6l4 5z"/></svg>',
      li: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM3 9h3v12H3zM9 9h3v2a3.5 3.5 0 0 1 3-2c3 0 4 2 4 5v7h-3v-6c0-1.5-.5-2.5-2-2.5S12 14 12 15.5V21H9z"/></svg>',
    };
    el.innerHTML = `
  <footer class="site-footer"><div class="sf-in">
    <div class="sf-brand">
      <div class="sf-word">Atelix</div>
      <p data-i18n="ft.tagline">The wholesale marketplace connecting brand owners with verified fabric mills and OEM factories.</p>
    </div>
    <div class="sf-col">
      <h5 data-i18n="ft.company">Atelix</h5>
      <a href="${about}" data-i18n="ft.about">About Atelix</a>
      <a href="${building}" data-i18n="ft.b2b">B2B sourcing</a>
      <a href="${trust}" data-i18n="ft.trustsafety">Trust &amp; safety</a>
    </div>
    <div class="sf-col">
      <h5 data-i18n="ft.help">Help &amp; Guides</h5>
      <a href="${helpCenter}" data-i18n="ft.helpcenter">Help center</a>
      <a href="${terms}" data-i18n="ft.terms">Terms &amp; conditions</a>
      <a href="${privacy}" data-i18n="ft.privacy">Privacy policy</a>
      <a href="${contact}" data-i18n="ft.contact">Contact us</a>
    </div>
    <div class="sf-col">
      <h5 data-i18n="ft.follow">Follow us</h5>
      <div class="sf-social"><a href="https://x.com/junarcana263" target="_blank" rel="noopener noreferrer" aria-label="X">${soc.x}</a><a href="https://linkedin.com/in/junarcana" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">${soc.li}</a></div>
    </div>
  </div>
  <div class="sf-bottom">
    <span>© 2026 Atelix. <span data-i18n="ft.rights">All rights reserved.</span></span>
    <div class="lang-switch" data-lang-switch role="group" aria-label="Language">
      <button data-lang="en">English</button>
      <button data-lang="ja">日本語</button>
      <button data-lang="zh">中文</button>
    </div>
  </div></footer>`;
  }

  /* Fire-and-forget DB write-through for a cart line, only when signed in. */
  function pushCartItem(sku, qty, options, lineKey, lineType = "product") {
    const api = window.ARCANA_API;
    const signedIn = !!Store.session();
    const operation = {
      id: sku,
      qty,
      key: lineKey,
      options: normalizeSelection(options),
      lineType: lineType === "swatch" ? "swatch" : "product",
      token: `${Date.now()}-${Math.random()}`,
    };
    if (signedIn) {
      const pending = readCartPending();
      pending[lineKey] = operation;
      LS.set("cart_pending", pending);
    }
    if (!api || api.unavailable || !signedIn) return;
    api
      .syncCartItem(sku, qty, operation.options, lineKey, operation.lineType)
      .then((result) => {
        if (!result || !result.error)
          clearSyncedCartPending({ [lineKey]: operation });
      })
      .catch(() => {});
  }

  /* Fire-and-forget DB write-through for a wishlist line, only when signed in. */
  function pushWishlistItem(sku, qty) {
    const api = window.ARCANA_API;
    if (!api || api.unavailable || !Store.session()) return;
    api.syncWishlistItem(sku, qty).catch(() => {});
  }

  /* ---------- live badges ---------- */
  function syncBadges() {
    const n = Store.cartCount();
    document.querySelectorAll("[data-cart-badge]").forEach((b) => {
      b.textContent = n;
      b.hidden = n === 0;
    });
    const s = Store.saved().length;
    document.querySelectorAll("[data-saved-badge]").forEach((b) => {
      b.textContent = s;
      b.hidden = s === 0;
    });
  }

  /* ---------- toast ---------- */
  let toastEl;
  function toast(msg, action) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast-wrap";
      document.body.appendChild(toastEl);
    }
    const t = document.createElement("div");
    t.className = "toast";
    t.setAttribute("role", "status");
    t.innerHTML = `${IC.check}<span>${msg}</span>${action ? `<a href="${action.href}">${action.label}</a>` : ""}`;
    toastEl.appendChild(t);
    requestAnimationFrame(() => t.classList.add("in"));
    setTimeout(
      () => {
        t.classList.remove("in");
        setTimeout(() => t.remove(), 250);
      },
      action ? 6000 : 3200,
    );
  }
  window.ARCANA_toast = toast;

  /* ---------- contact-by-email: shared by the OEM CTA, "Email supplier"
   and "Contact Supplier". Keep this synchronous: mobile
   browsers only hand mailto links to the email app during the original tap. */
  function contactEmail({ subjectPrefix, bodyLines }) {
    const session = Store.session();
    const requester = session?.name || "guest";
    const subject = `${subjectPrefix} - ${requester}`;
    const body = (bodyLines || []).filter(Boolean).join("\n");
    const contact = window.ATELIX_CONTACT_EMAIL || "info@arcanawangsa.com";
    location.href = `mailto:${contact}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }
  window.ARCANA_contactEmail = contactEmail;

  /* ---------- floating Athelia launcher (buyer surfaces) ---------- */
  function buildCopilotFab() {
    if (!window.ARCANA_Copilot) return;
    const s = Store.session();
    const seller =
      document.body.dataset.surface === "seller" ||
      (s && s.role === "seller" && document.body.dataset.surface !== "buyer");
    if (
      seller ||
      /login\.html|signup\.html|checkout\.html/.test(location.pathname)
    )
      return;
    const t = window.ARCANA_T || ((x) => x);
    const esc = (x) =>
      String(x).replace(
        /[&<>"]/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
      );
    const SPARK =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.4 2.4M15.3 15.3l2.4 2.4M17.7 6.3l-2.4 2.4M8.7 15.3l-2.4 2.4"/><circle cx="12" cy="12" r="3"/></svg>';
    const EG = [
      "Organic cotton jersey, GOTS, under $7/m, MOQ ≤ 200",
      "Recycled polyester for activewear, low MOQ, GRS certified",
      "Soft cotton jersey, light enough for a summer shirt",
      "Warm brushed wool for a winter flannel shirt",
    ];
    const wrap = document.createElement("div");
    wrap.className = "cop-fab";
    wrap.innerHTML = `
    <button type="button" class="cop-fab-btn" aria-expanded="false" aria-haspopup="dialog" aria-label="${esc(t("Athelia"))}">${markSVG()}</button>
    <div class="cop-fab-panel" role="dialog" aria-label="${esc(t("Athelia"))}" hidden>
      <div class="cop-fab-pop" data-cop-pop></div>
      <form class="cop-fab-bar" data-cop-form>
        <span class="cfb-mark" aria-hidden="true">${markSVG()}</span>
        <label class="visually-hidden" for="copFabInput">${esc(t("Describe what you're sourcing…"))}</label>
        <input id="copFabInput" autocomplete="off" placeholder="${esc(t("Describe what you're sourcing…"))}">
        <button class="cfb-close" type="button" aria-label="${esc(t("Close Athelia"))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
        <button class="cfb-go" type="submit" aria-label="${esc(t("Ask Athelia"))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>
      </form>
    </div>`;
    document.body.appendChild(wrap);
    const btn = wrap.querySelector(".cop-fab-btn"),
      panel = wrap.querySelector(".cop-fab-panel");
    const pop = wrap.querySelector("[data-cop-pop]"),
      form = wrap.querySelector("[data-cop-form]");
    const input = form.querySelector("input");
    function renderPop() {
      const brief = window.ARCANA_Copilot.getBrief();
      let h = "";
      if (brief && brief.text) {
        h += `<div class="cfp-hd">${esc(t("Recent brief"))}</div>
          <button type="button" class="cfp-row" data-eg="${esc(brief.text)}">${SPARK}<span>${esc(brief.text)}</span></button>`;
      }
      h +=
        `<div class="cfp-hd">${esc(t("Try asking"))}</div>` +
        EG.map(
          (e) =>
            `<button type="button" class="cfp-row" data-eg="${esc(e)}">${IC.search}<span>${esc(e)}</span></button>`,
        ).join("");
      pop.innerHTML = h;
    }
    function open() {
      renderPop();
      panel.hidden = false;
      wrap.dataset.open = "1";
      requestAnimationFrame(() => panel.classList.add("in"));
      btn.setAttribute("aria-expanded", "true");
      input.focus();
    }
    function close(focusBtn) {
      panel.classList.remove("in");
      panel.hidden = true;
      delete wrap.dataset.open;
      btn.setAttribute("aria-expanded", "false");
      if (focusBtn) btn.focus();
    }
    btn.addEventListener("click", open);
    form
      .querySelector(".cfb-close")
      .addEventListener("click", () => close(true));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v) {
        input.focus();
        return;
      }
      window.ARCANA_Copilot.setBrief(v);
      if (!window.ARCANA_requireCopilotAuth()) {
        close(false);
        return;
      }
      location.href = P("category.html") + "?copilot=1";
    });
    pop.addEventListener("click", (e) => {
      const r = e.target.closest("[data-eg]");
      if (r) {
        input.value = r.dataset.eg;
        input.focus();
      }
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close(true);
    });
    document.addEventListener("pointerdown", (e) => {
      if (!wrap.hidden && !wrap.contains(e.target) && !panel.hidden)
        close(false);
    });
    window.ARCANA_onLang(() => {
      input.placeholder = t("Describe what you're sourcing…");
      if (!panel.hidden) renderPop();
    });
  }

  /* ---------- Athelia auth gate: public users get a login/signup modal
   instead of AI-matched results. Basic catalog search stays open to
   everyone — only the Athelia surface (parsed brief, ranked
   verified matches, LLM summary) is a signed-in perk. The brief is always
   saved to localStorage BEFORE the gate opens, so login.html's ?next=
   round-trip lands the user straight back on their results. */
  let copilotGateEl = null;
  function ensureCopilotGate() {
    if (copilotGateEl) return copilotGateEl;
    const t = window.ARCANA_T || ((x) => x);
    const esc = (x) =>
      String(x).replace(
        /[&<>"]/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
      );
    const next = encodeURIComponent("category.html?copilot=1");
    const wrap = document.createElement("div");
    wrap.className = "modal-overlay cop-gate-overlay";
    wrap.hidden = true;
    wrap.innerHTML = `
    <div class="modal-box cop-gate cop-invite" role="dialog" aria-modal="true" aria-labelledby="cgTitle" aria-describedby="cgDesc">
      <button type="button" class="cop-gate-x" data-cg-close aria-label="${esc(t("Close"))}">&times;</button>
      <div class="cop-gate-art"><img src="${ASSET("copilot-gate.webp")}" alt="" width="168" height="168" loading="lazy"></div>
      <h3 id="cgTitle">${esc(t("Sign in to use Athelia"))}</h3>
      <p id="cgDesc" class="muted">${esc(t("Athelia matches your brief against every verified SKU in the catalog and explains why. It's free for brand owners — sign in or create an account to see your ranked results."))}</p>
      <div class="modal-actions" style="justify-content:center">
        <a class="btn btn-out" href="${P("login.html")}?next=${next}">${esc(t("Log in"))}</a>
        <a class="btn btn-green" href="${P("signup.html")}">${esc(t("Sign up free"))}</a>
      </div>
      <button type="button" class="cop-gate-later" data-cg-close>${esc(t("Continue browsing without Athelia"))}</button>
    </div>`;
    document.body.appendChild(wrap);
    let closeT = null;
    const close = () => {
      clearTimeout(closeT);
      wrap.classList.remove("in");
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      closeT = setTimeout(
        () => {
          wrap.hidden = true;
          if (openTrigger && document.contains(openTrigger))
            openTrigger.focus();
        },
        reduce ? 0 : 180,
      );
    };
    wrap
      .querySelectorAll("[data-cg-close]")
      .forEach((b) => b.addEventListener("click", close));
    wrap.addEventListener("pointerdown", (e) => {
      if (e.target === wrap) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !wrap.hidden) close();
    });
    copilotGateEl = wrap;
    return wrap;
  }
  let openTrigger = null;
  function openCopilotGate() {
    const wrap = ensureCopilotGate();
    openTrigger = document.activeElement;
    wrap.hidden = false;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => wrap.classList.add("in")),
    );
    const focusTarget = wrap.querySelector(".btn-out");
    if (focusTarget) focusTarget.focus();
  }
  window.ARCANA_openCopilotGate = openCopilotGate;
  /* Call at the point of Copilot submission. Returns true (proceed) when
   signed in; opens the gate and returns false otherwise. */
  window.ARCANA_requireCopilotAuth = function () {
    if (Store.session()) return true;
    openCopilotGate();
    return false;
  };

  /* ---------- Design Match: private, session-only tech-pack analysis ---------- */
  const DESIGN_MATCH_KEY = "arcana_design_match";
  function setDesignMatch(value) {
    try {
      if (value)
        sessionStorage.setItem(DESIGN_MATCH_KEY, JSON.stringify(value));
      else sessionStorage.removeItem(DESIGN_MATCH_KEY);
    } catch (_) {}
  }
  window.ARCANA_getDesignMatch = function () {
    try {
      return JSON.parse(sessionStorage.getItem(DESIGN_MATCH_KEY) || "null");
    } catch (_) {
      return null;
    }
  };
  window.ARCANA_clearDesignMatch = function () {
    setDesignMatch(null);
  };

  let designMatchModal;
  function ensureDesignMatchModal() {
    if (designMatchModal) return designMatchModal;
    const wrap = document.createElement("div");
    wrap.className = "modal-overlay design-match-overlay";
    wrap.hidden = true;
    wrap.innerHTML = `<section class="design-match-modal" role="dialog" aria-modal="true" aria-labelledby="dmTitle" aria-describedby="dmDesc">
    <button type="button" class="dm-close" data-dm-close aria-label="Close">&times;</button>
    <div class="dm-intro"><div class="dm-mark">${IC.document}</div><div>
      <h2 id="dmTitle">Turn your tech pack into product matches</h2>
      <p id="dmDesc">Athelia turns your BOM into relevant product recommendations.</p>
    </div></div>
    <form data-dm-form>
      <input type="file" data-dm-files accept="application/pdf,image/jpeg,image/png,image/webp" multiple hidden>
      <button type="button" class="dm-drop" data-dm-browse>
        ${IC.document}<span><b>Upload a tech pack or garment design</b><small>Drop files here or browse · PDF up to 30 MB · up to 8 files</small></span>
      </button>
      <ul class="dm-files" data-dm-list aria-live="polite"></ul>
      <p class="dm-note">Private to this browser session. Source files are analyzed in transit and are not saved to your Atelix profile.</p>
      <div class="dm-actions"><button type="button" class="btn btn-out" data-dm-close>Cancel</button><button type="submit" class="btn btn-green" data-dm-submit disabled>Find product matches</button></div>
    </form>
    <div class="dm-analysis" data-dm-analysis role="status" aria-live="polite" aria-atomic="true" tabindex="-1" hidden>
      <div class="dm-analysis-visual" aria-hidden="true"><span>${IC.document}</span><i></i></div>
      <div class="dm-analysis-copy">
        <h3 data-dm-status>Securing your upload</h3>
        <p data-dm-status-detail>Keeping source files private while the transfer completes.</p>
      </div>
      <div class="dm-analysis-rail" aria-hidden="true"><span></span></div>
      <small data-dm-wait>This can take a little longer for scanned or image-heavy PDFs.</small>
      <button type="button" class="btn btn-out" data-dm-retry hidden>Back to upload</button>
    </div>
  </section>`;
    document.body.appendChild(wrap);
    designMatchModal = wrap;
    const input = wrap.querySelector("[data-dm-files]"),
      list = wrap.querySelector("[data-dm-list]"),
      submit = wrap.querySelector("[data-dm-submit]");
    const form = wrap.querySelector("[data-dm-form]"),
      analysis = wrap.querySelector("[data-dm-analysis]");
    const status = wrap.querySelector("[data-dm-status]"),
      statusDetail = wrap.querySelector("[data-dm-status-detail]");
    const title = wrap.querySelector("#dmTitle"),
      description = wrap.querySelector("#dmDesc"),
      waitCopy = wrap.querySelector("[data-dm-wait]");
    const retry = wrap.querySelector("[data-dm-retry]"),
      closeButtons = [...wrap.querySelectorAll("[data-dm-close]")];
    let files = [],
      busy = false,
      statusTimers = [];
    const clearStatusTimers = () => {
      statusTimers.forEach(clearTimeout);
      statusTimers = [];
    };
    const close = () => {
      if (busy) return;
      clearStatusTimers();
      wrap.classList.remove("in");
      wrap.hidden = true;
    };
    const showUpload = () => {
      busy = false;
      clearStatusTimers();
      wrap.setAttribute("aria-busy", "false");
      form.hidden = false;
      analysis.hidden = true;
      analysis.dataset.state = "";
      retry.hidden = true;
      closeButtons.forEach((button) => (button.disabled = false));
      submit.disabled = !files.length;
      submit.textContent = "Find product matches";
    };
    const setStatus = (title, detail, state = "working") => {
      status.textContent = title;
      statusDetail.textContent = detail;
      analysis.dataset.state = state;
    };
    const showAnalysis = () => {
      busy = true;
      form.hidden = true;
      analysis.hidden = false;
      retry.hidden = true;
      wrap.setAttribute("aria-busy", "true");
      closeButtons.forEach((button) => (button.disabled = true));
      setStatus(
        "Securing your upload",
        "Keeping source files private while the transfer completes.",
      );
      analysis.focus();
      const phases = [
        [
          900,
          "Reading every page",
          "Finding text, tables, material specifications, and annotations.",
        ],
        [
          2800,
          "Identifying the reference",
          "Checking whether this is a tech pack, design, or fabric photo.",
        ],
        [
          5500,
          "Building the sourcing brief",
          "Extracting the garment type, design notes, and bill of materials.",
        ],
        [
          9000,
          "Matching the verified catalog",
          "Ranking products and suppliers against your requirements.",
        ],
        [
          14000,
          "Finishing your match",
          "Checking the brief and preparing your search results.",
        ],
      ];
      statusTimers = phases.map(([delay, title, detail]) =>
        setTimeout(() => setStatus(title, detail), delay),
      );
    };
    const renderFiles = () => {
      list.innerHTML = files
        .map(
          (file, index) =>
            `<li><span>${IC.document}<b>${String(file.name).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])}</b><small>${(file.size / 1024 / 1024).toFixed(file.size > 1024 * 1024 ? 1 : 0)} MB</small></span><button type="button" data-dm-remove="${index}" aria-label="Remove ${String(file.name).replace(/"/g, "")}">&times;</button></li>`,
        )
        .join("");
      submit.disabled = !files.length;
    };
    const accept = (added) => {
      const allowed = (file) =>
        /^(image\/(jpeg|png|webp)|application\/pdf)$/.test(file.type);
      const invalid = added.find((file) => !allowed(file));
      if (invalid) {
        toast("Use JPG, PNG, WebP, or PDF files.");
        return false;
      }
      if (files.length + added.length > 8) {
        toast("Upload up to 8 files at a time.");
        return false;
      }
      const oversized = added.find(
        (file) =>
          file.size > (file.type === "application/pdf" ? 30 : 25) * 1024 * 1024,
      );
      if (oversized) {
        toast(
          oversized.type === "application/pdf"
            ? "Keep each PDF under 30 MB."
            : "Keep each image under 25 MB.",
        );
        return false;
      }
      if (
        [...files, ...added].reduce((total, file) => total + file.size, 0) >
        30 * 1024 * 1024
      ) {
        toast("Keep the total upload under 30 MB.");
        return false;
      }
      files = [...files, ...added];
      renderFiles();
      return true;
    };
    wrap.__loadDesignFiles = (added) => {
      files = [];
      renderFiles();
      return accept(added);
    };
    wrap.__startDesignAnalysis = () => form.requestSubmit();
    wrap.__showDesignUpload = showUpload;
    wrap.__setDesignMode = (mode) => {
      const fabric = mode === "fabric";
      title.textContent = fabric
        ? "Find fabrics from a photo"
        : "Turn your tech pack into product matches";
      description.textContent = fabric
        ? "Athelia reads your photo and recommends relevant fabrics."
        : "Athelia turns your BOM into relevant product recommendations.";
      waitCopy.textContent = fabric
        ? "Visual analysis may take a moment."
        : "This can take a little longer for scanned or image-heavy PDFs.";
    };
    input.addEventListener("change", () => {
      accept([...input.files]);
      input.value = "";
    });
    wrap
      .querySelector("[data-dm-browse]")
      .addEventListener("click", () => input.click());
    wrap
      .querySelector("[data-dm-browse]")
      .addEventListener("dragover", (event) => {
        event.preventDefault();
        wrap.querySelector("[data-dm-browse]").classList.add("drag");
      });
    wrap
      .querySelector("[data-dm-browse]")
      .addEventListener("dragleave", () =>
        wrap.querySelector("[data-dm-browse]").classList.remove("drag"),
      );
    wrap.querySelector("[data-dm-browse]").addEventListener("drop", (event) => {
      event.preventDefault();
      wrap.querySelector("[data-dm-browse]").classList.remove("drag");
      accept([...((event.dataTransfer && event.dataTransfer.files) || [])]);
    });
    list.addEventListener("click", (event) => {
      const button = event.target.closest("[data-dm-remove]");
      if (button) {
        files.splice(+button.dataset.dmRemove, 1);
        renderFiles();
      }
    });
    closeButtons.forEach((button) => button.addEventListener("click", close));
    retry.addEventListener("click", showUpload);
    wrap.addEventListener("pointerdown", (event) => {
      if (event.target === wrap) close();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !wrap.hidden) close();
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!files.length) return;
      const api = window.ARCANA_API;
      if (!api || !api.analyzeDesign) {
        toast("Design analysis is unavailable.");
        return;
      }
      submit.disabled = true;
      submit.textContent = "Analyzing…";
      showAnalysis();
      const { data, error } = await api.analyzeDesign(files);
      clearStatusTimers();
      if (error || !data || !data.ok) {
        const reason =
          (data && data.reason) ||
          (error && error.message) ||
          "analysis_failed";
        const stage = data && data.stage,
          detail = data && data.detail;
        console.error("[Design Match] Analysis failed", {
          reason,
          stage,
          detail,
          upstreamStatus: data && data.upstreamStatus,
          error,
        });
        const stageMessage = {
          file_upload:
            "Athelia could not finish processing this PDF. Please retry.",
          model:
            "Athelia could not analyze this document right now. Please retry.",
          model_request:
            "Athelia could not be reached. Check your connection and retry.",
          model_output:
            "Athelia could not produce a usable sourcing brief from this file.",
          structured_output:
            "Athelia read the file but could not format the sourcing brief. Please retry.",
          provider_capacity:
            "Athelia analysis is temporarily unavailable. Please try again later.",
          usage:
            "Your daily Athelia allowance could not be checked. Please retry.",
        }[stage];
        const message =
          {
            limit_reached:
              "You've used today's 3 Athelia analyses. Contact info@arcanawangsa.com if you need more.",
            unsupported_file: "Use JPG, PNG, WebP, or PDF files.",
            file_count: "Upload between 1 and 8 files.",
            file_size:
              "Keep PDFs and the total upload under 30 MB; images under 25 MB each.",
            unsupported_document:
              (data && data.document && data.document.reason) ||
              "Athelia could not identify a usable tech pack or garment design.",
            unauthorized: "Please sign in before uploading a design.",
            analysis_unavailable:
              "Athelia analysis is temporarily unavailable. Please try again later.",
            usage_unavailable:
              "Your daily Athelia allowance could not be checked. Please retry.",
            catalog_unavailable:
              "The supplier catalog is temporarily unavailable.",
            internal_error:
              "Athelia could not complete this match. Please retry.",
            analysis_failed:
              "Athelia could not read that document. Try a clearer PDF or image.",
          }[reason] ||
          stageMessage ||
          "Athelia could not read those files. Try a clearer PDF or image.";
        busy = false;
        wrap.setAttribute("aria-busy", "false");
        closeButtons.forEach((button) => (button.disabled = false));
        setStatus("Analysis stopped", message, "error");
        retry.hidden = false;
        retry.focus();
        const contact =
          reason === "limit_reached"
            ? {
                label: "Contact us",
                href:
                  "mailto:info@arcanawangsa.com?subject=" +
                  encodeURIComponent("More Athelia analyses"),
              }
            : null;
        toast(message, contact);
        return;
      }
      setDesignMatch(data);
      setStatus(
        "Match ready",
        "Opening your supplier and material results…",
        "success",
      );
      wrap.setAttribute("aria-busy", "false");
      setTimeout(() => {
        location.href = P("category.html") + "?design-match=1";
      }, 450);
    });
    return wrap;
  }
  window.ARCANA_openDesignMatch = function (initialFiles, options = {}) {
    if (!Store.session()) {
      toast("Sign in to upload a private design reference.");
      location.href =
        P("login.html") +
        "?next=" +
        encodeURIComponent("category.html?design-match=1");
      return;
    }
    const modal = ensureDesignMatchModal();
    modal.__showDesignUpload();
    modal.__setDesignMode(options.mode);
    const loaded =
      Array.isArray(initialFiles) && initialFiles.length
        ? modal.__loadDesignFiles(initialFiles)
        : true;
    modal.hidden = false;
    requestAnimationFrame(() => {
      modal.classList.add("in");
      if (loaded && options.autoStart) modal.__startDesignAnalysis();
      else modal.querySelector("[data-dm-browse]").focus();
    });
  };

  /* ---------- smart search: plain keyword autocomplete + image search ---------- */
  function wireSearch() {
    const form = document.querySelector("[data-search-form]");
    if (!form) return;
    const input = form.querySelector("input"),
      pop = form.querySelector("[data-search-pop]");
    const cam = form.querySelector("[data-cam]");
    if (!input || !pop) return;
    const t = window.ARCANA_T || ((s) => s),
      tr = window.ARCANA_TR || ((s) => s),
      money = window.ARCANA_money || ((n) => "$" + n.toFixed(2)),
      productMoney = window.ATELIX_productMoney || ((product) => money(product.price));
    const PROD = window.ARCANA_PRODUCTS || [],
      FACT = window.ARCANA_FACTORIES || [];
    const esc = (s) =>
      String(s).replace(
        /[&<>"]/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
      );
    const norm = (s) =>
      String(s || "")
        .toLowerCase()
        .trim();

    /* --- suggestion pool + intent scoring --- */
    const KW_EXTRA = [
      "low moq fabrics",
      "oem hoodie full package",
      "oem t-shirt cut & sew",
      "recycled polyester grs",
      "ykk zipper wholesale",
      "denim 12 oz stretch",
      "organic cotton jersey 180 gsm",
      "linen blend shirting",
      "custom woven labels",
      "wool flannel suiting",
      "sampling package",
      "private label packaging",
    ];
    const POOL = [
      ...new Set([...PROD.map((p) => p.name.toLowerCase()), ...KW_EXTRA]),
    ];
    const SUP_TOKENS = [
      "mill",
      "mills",
      "factory",
      "factories",
      "supplier",
      "suppliers",
      "manufacturer",
      "works",
      "studio",
      "house",
      "co.",
      "ltd",
      "textile",
      "dye",
      "senshoku",
      "garment",
      "verified",
    ];

    function hit(hay, q, words) {
      hay = norm(hay);
      if (!hay) return 0;
      let s = 0;
      if (hay.startsWith(q)) s += 3;
      if (hay.includes(q)) s += 2;
      for (const w of words) if (w.length > 1 && hay.includes(w)) s += 1;
      return s;
    }
    const prodScore = (p, q, w) =>
      2 * hit(p.name, q, w) +
      hit(p.comp, q, w) +
      hit(p.seller, q, w) +
      hit(p.cat, q, w) +
      hit(p.spec, q, w);
    const factScore = (f, q, w) =>
      2 * hit([f.name, ...Object.values(f.copyI18n||{}).map(copy=>copy&&copy.name)].filter(Boolean).join(' '), q, w) +
      hit(f.tags.join(" "), q, w) +
      hit(f.type, q, w) +
      hit(f.loc + " " + f.region, q, w);
    const catalogMatch = (value, q) => {
      const text = norm(value),
        words = norm(q)
          .split(/\s+/)
          .filter((word) => word.length > 2);
      return (
        !!q &&
        (text.includes(norm(q)) || words.some((word) => text.includes(word)))
      );
    };

    /* --- open/close --- */
    let opts = [],
      sel = -1;
    const optId = (i) => "s-opt-" + i;
    function open() {
      if (pop.hidden) {
        pop.hidden = false;
        requestAnimationFrame(() => pop.classList.add("in"));
        input.setAttribute("aria-expanded", "true");
      }
    }
    function close() {
      pop.classList.remove("in");
      pop.hidden = true;
      sel = -1;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
    }

    /* --- row templates --- */
    function mark(k, q) {
      const i = q ? k.indexOf(q) : -1;
      if (i < 0) return esc(k);
      return (
        esc(k.slice(0, i + q.length)) +
        "<b>" +
        esc(k.slice(i + q.length)) +
        "</b>"
      );
    }
    const kwHref = (k) => "/search?q=" + encodeURIComponent(k);
    function kwRow(k, q, i) {
      opts.push(1);
      return `<a class="s-row" role="option" id="${optId(i)}" href="${kwHref(k)}">${IC.search}<span class="s-kw">${mark(k, q)}</span></a>`;
    }
    function supRow(f, i) {
      const href = factoryRoute(f.id);
      if (!href) return "";
      const supplierName = window.ATELIX_supplierText ? window.ATELIX_supplierText(f, 'name') : tr(f.name);
      opts.push(1);
      return `<a class="s-row" role="option" id="${optId(i)}" href="${href}">
      <img class="s-av" src="${factoryAsset(f)}" alt="" loading="lazy">
      <span class="s-main"><span class="s-nm">${esc(supplierName)} ${IC.check}</span>
      <span class="s-meta">${esc(tr(f.type))} · ${esc(tr(factoryLocation(f)))}</span></span>
      <span class="s-go">${IC.chevR}</span></a>`;
    }
    function prodRow(p, i) {
      const href = productRoute(p.id);
      if (!href) return "";
      opts.push(1);
      const price =
        p.price > 0
          ? productMoney(p) +
            "<small>/" +
            esc(tr(p.unit)) +
            "</small>"
          : esc(t("Contact for quote"));
      return `<a class="s-row" role="option" id="${optId(i)}" href="${href}">
      <img class="s-th" src="${productAsset(p)}" alt="" loading="lazy">
      <span class="s-main"><span class="s-nm">${esc(tr(p.name))}</span>
      <span class="s-meta">${esc(tr(p.comp))} · ${esc(tr(p.seller))}</span></span>
      <span class="s-pr">${price}</span></a>`;
    }
    function footRow(q, i) {
      opts.push(1);
      return `<a class="s-row s-foot" role="option" id="${optId(i)}" href="${kwHref(q)}">${IC.search}<span>${esc(t("See all results for"))} “${esc(q)}”</span>${IC.chevR}</a>`;
    }

    /* --- image search --- */
    function camPanel() {
      pop.innerHTML = `<div class="s-drop">
      <span class="s-drop-ic">${IC.camera}</span>
      <b>${esc(t("Search by fabric photo"))}</b>
      <span class="s-drop-sub">${esc(t("Drop an image here, paste it, or"))} <button type="button" class="s-browse" data-browse>${esc(t("browse"))}</button></span>
      <span class="s-drop-note">Source photos are analyzed in transit and are not saved</span>
    </div>`;
      opts = [];
      sel = -1;
      open();
    }
    function process(f) {
      if (!f || !/^image\/(jpeg|png|webp)$/.test(f.type)) {
        toast("Use a JPG, PNG, or WebP fabric photo.");
        return;
      }
      if (f.size > 25 * 1024 * 1024) {
        toast("Keep the fabric photo under 25 MB.");
        return;
      }
      close();
      window.ARCANA_openDesignMatch &&
        window.ARCANA_openDesignMatch([f], { autoStart: true, mode: "fabric" });
    }

    /* --- main render --- */
    async function renderRecent() {
      opts = [];
      sel = -1;
      const api = window.ARCANA_API;
      const recent =
        Store.session() && api?.getRecentSearches
          ? await api.getRecentSearches(6)
          : [];
      if (input.value.trim()) return;
      if (!recent.length) {
        close();
        return;
      }
      let html = `<div class="s-hd" role="presentation">${esc(t("Recent searches"))}</div>`,
        i = 0;
      recent.forEach((query) => {
        html += kwRow(query, "", i++);
      });
      pop.innerHTML = html;
      open();
    }
    function renderLocal() {
      const q = norm(input.value),
        words = q.split(/\s+/).filter(Boolean);
      let html = "";
      opts = [];
      let i = 0;
      if (!q) {
        close();
        return;
      }
      if (q.length < 2) {
        const kws = POOL.filter((k) => k.startsWith(q)).slice(0, 6);
        for (const k of kws) html += kwRow(k, q, i++);
        html += footRow(q, i++);
      } else {
        const kws = POOL.filter(
          (k) => k.includes(q) || words.some((w) => k.includes(w)),
        )
          .sort((a, b) => (b.startsWith(q) ? 1 : 0) - (a.startsWith(q) ? 1 : 0))
          .slice(0, 4);
        const fs = FACT.map((f) => [factScore(f, q, words), f])
          .filter((x) => x[0] > 2)
          .sort((a, b) => b[0] - a[0])
          .slice(0, 3);
        const ps = PROD.map((p) => [prodScore(p, q, words), p])
          .filter((x) => x[0] > 2)
          .sort((a, b) => b[0] - a[0])
          .slice(0, 5);
        const supFirst =
          fs.length &&
          (SUP_TOKENS.some((tk) => q.includes(tk)) ||
            (ps.length ? fs[0][0] > ps[0][0] : true));
        for (const k of kws) html += kwRow(k, q, i++);
        const secS = () => {
          if (fs.length) {
            html += `<div class="s-hd" role="presentation">${esc(t("Suppliers"))}</div>`;
            for (const [, f] of fs) html += supRow(f, i++);
          }
        };
        const secP = () => {
          if (ps.length) {
            html += `<div class="s-hd" role="presentation">${esc(t("Products"))}</div>`;
            for (const [, p] of ps) html += prodRow(p, i++);
          }
        };
        if (supFirst) {
          secS();
          secP();
        } else {
          secP();
          secS();
        }
        if (!kws.length && !fs.length && !ps.length)
          html += `<div class="s-empty">${esc(t("No matches in the catalog yet"))}<span>${esc(t("Try a material, product or factory name"))}</span></div>`;
        html += footRow(q, i++);
      }
      pop.innerHTML = html;
      sel = -1;
      input.removeAttribute("aria-activedescendant");
      open();
    }

    let renderSequence = 0;
    const algoliaProduct = (hit) =>
      window.ARCANA_PRODUCT_MAP?.[hit.objectID] || null;
    const algoliaFactory = (hit) =>
      window.ARCANA_FACTORY_MAP?.[hit.objectID] || null;
    async function render() {
      const sequence = ++renderSequence;
      const q = norm(input.value);
      if (!q) {
        await renderRecent();
        return;
      }
      pop.innerHTML = `<div class="s-loading" role="status"><span aria-hidden="true"></span>${esc(t("Searching Atelix…"))}</div>`;
      opts = [];
      sel = -1;
      open();
      try {
        const [suggestions, products, factories] = await Promise.all([
          searchPublicAlgolia("suggestions", q, { hitsPerPage: q ? 5 : 6 }),
          searchPublicAlgolia("products", q, { hitsPerPage: q ? 5 : 3 }),
          searchPublicAlgolia("factories", q, { hitsPerPage: q ? 3 : 2 }),
        ]);
        if (sequence !== renderSequence) return;
        let html = "",
          i = 0;
        const suggestionRows = (suggestions.hits || [])
          .map((hit) => hit.query)
          .filter(Boolean);
        if (suggestionRows.length) {
          html += `<div class="s-hd" role="presentation">${esc(t("Suggested searches"))}</div>`;
          suggestionRows.forEach((query) => {
            html += kwRow(query, q, i++);
          });
        }
        const productRows = (products.hits || [])
          .map(algoliaProduct)
          .filter(Boolean);
        const indexedProducts = new Set(
          productRows.map((product) => product.id),
        );
        productRows.push(
          ...PROD.filter(
            (product) =>
              !indexedProducts.has(product.id) &&
              catalogMatch(
                [
                  product.name,
                  product.comp,
                  product.spec,
                  product.seller,
                  product.cat,
                ].join(" "),
                q,
              ),
          ).slice(0, 3),
        );
        if (productRows.length) {
          html += `<div class="s-hd" role="presentation">${esc(t("Products"))}</div>`;
          productRows.forEach((product) => {
            html += prodRow(product, i++);
          });
        }
        const factoryRows = (factories.hits || [])
          .map(algoliaFactory)
          .filter(Boolean);
        const indexedFactories = new Set(
          factoryRows.map((factory) => factory.id),
        );
        factoryRows.push(
          ...FACT.filter(
            (factory) =>
              !indexedFactories.has(factory.id) &&
              catalogMatch(
                [
                  factory.name,
                  factory.type,
                  factory.loc,
                  factory.region,
                  ...(factory.tags || []),
                ].join(" "),
                q,
              ),
          ).slice(0, 2),
        );
        if (factoryRows.length) {
          html += `<div class="s-hd" role="presentation">${esc(t("Factories"))}</div>`;
          factoryRows.forEach((factory) => {
            html += supRow(factory, i++);
          });
        }
        if (!html)
          html = `<div class="s-empty">${esc(t("No matches in the catalog yet"))}<span>${esc(t("Try a material, product or factory name"))}</span></div>`;
        if (q) html += footRow(q, i++);
        pop.innerHTML = html;
        sel = -1;
        input.removeAttribute("aria-activedescendant");
        open();
      } catch (_) {
        if (sequence !== renderSequence) return;
        renderLocal();
      }
    }

    /* --- events --- */
    let searchTimer;
    input.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(render, 140);
    });
    input.addEventListener("focus", render);
    input.addEventListener("keydown", (e) => {
      if (pop.hidden) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          render();
        }
        return;
      }
      const els = [...pop.querySelectorAll("[role=option]")];
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && els.length) {
        e.preventDefault();
        sel =
          (sel + (e.key === "ArrowDown" ? 1 : -1) + els.length) % els.length;
        els.forEach((el, j) => el.classList.toggle("sel", j === sel));
        input.setAttribute("aria-activedescendant", els[sel].id);
        els[sel].scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter") {
        // Enter always honours the typed text. Suggestions remain click/arrow
        // navigable, but never replace a deliberate text search with AI.
        e.preventDefault();
        form.requestSubmit();
      } else if (e.key === "Escape") {
        close();
      }
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = input.value.trim();
      const ps = [];
      if (q) ps.push("q=" + encodeURIComponent(q));
      location.href = "/search" + (ps.length ? "?" + ps.join("&") : "");
    });
    if (cam)
      cam.addEventListener("click", () => {
        input.focus();
        camPanel();
      });
    const design = form.querySelector("[data-design-match]");
    if (design)
      design.addEventListener("click", () => {
        if (window.ARCANA_openDesignMatch) window.ARCANA_openDesignMatch();
      });
    const file = document.createElement("input");
    file.type = "file";
    file.accept = "image/*";
    file.hidden = true;
    form.appendChild(file);
    file.addEventListener("change", () => {
      if (file.files[0]) process(file.files[0]);
      file.value = "";
    });
    form.addEventListener("click", (e) => {
      if (e.target.closest("[data-browse]")) file.click();
    });
    input.addEventListener("paste", (e) => {
      const it = [...((e.clipboardData && e.clipboardData.items) || [])].find(
        (i) => i.kind === "file" && /^image\//.test(i.type),
      );
      if (it) {
        e.preventDefault();
        process(it.getAsFile());
      }
    });
    ["dragover", "dragenter"].forEach((ev) =>
      form.addEventListener(ev, (e) => {
        if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) {
          e.preventDefault();
          form.classList.add("drag");
        }
      }),
    );
    ["dragleave", "drop"].forEach((ev) =>
      form.addEventListener(ev, () => form.classList.remove("drag")),
    );
    form.addEventListener("drop", (e) => {
      const f = e.dataTransfer && e.dataTransfer.files[0];
      if (f) {
        e.preventDefault();
        process(f);
      }
    });
    pop.addEventListener("pointerdown", (e) => e.preventDefault()); // keep input focus so row clicks land
    document.addEventListener("pointerdown", (e) => {
      if (!form.contains(e.target)) close();
    });
    form.addEventListener("focusout", (e) => {
      if (!form.contains(e.relatedTarget)) close();
    });
  }

  /* ---------- wiring ---------- */
  function wire() {
    // favorites (persisted). Elements opt in via [data-fav-id]; legacy .fav without id = local toggle.
    document.querySelectorAll(".fav").forEach((f) => {
      const id = f.dataset.favId;
      if (id && Store.isSaved(id)) f.classList.add("on");
      f.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (id) {
          const on = Store.toggleSaved(id);
          f.classList.toggle("on", on);
          toast(
            on ? "Saved to your list" : "Removed from list",
            on
              ? { href: P("wishlist.html"), label: "View wishlist" }
              : undefined,
          );
        } else f.classList.toggle("on");
      });
    });
    // add to cart
    document.querySelectorAll("[data-add]").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = b.dataset.add,
          qty = parseInt(b.dataset.qty || "1", 10);
        Store.addToCart(id, qty);
        const p = window.ARCANA_PRODUCT_MAP && window.ARCANA_PRODUCT_MAP[id];
        toast(`Added ${p ? p.name : "item"} to cart`, {
          href: P("cart.html"),
          label: "View cart",
        });
      }),
    );
    // simple toggle chips (visual)
    document
      .querySelectorAll("[data-toggle-chip]")
      .forEach((c) =>
        c.addEventListener("click", () => c.classList.toggle("on")),
      );
    // tabs
    document.querySelectorAll("[data-tabs]").forEach((g) =>
      g.querySelectorAll("[data-tab]").forEach((t) =>
        t.addEventListener("click", () => {
          g.querySelectorAll("[data-tab]").forEach((x) =>
            x.classList.remove("on"),
          );
          t.classList.add("on");
        }),
      ),
    );
    // qty steppers (generic)
    document.querySelectorAll("[data-qty]").forEach((q) => {
      const inp = q.querySelector("input");
      const dec = q.querySelector("[data-dec]"),
        inc = q.querySelector("[data-inc]");
      if (dec)
        dec.onclick = () => {
          inp.value = Math.max(1, (+inp.value || 1) - 1);
          inp.dispatchEvent(new Event("change", { bubbles: true }));
        };
      if (inc)
        inc.onclick = () => {
          inp.value = (+inp.value || 1) + 1;
          inp.dispatchEvent(new Event("change", { bubbles: true }));
        };
    });
    // oem package select
    document.querySelectorAll("[data-pkg-group]").forEach((g) =>
      g.querySelectorAll("[data-pkg]").forEach((p) =>
        p.addEventListener("click", () => {
          g.querySelectorAll("[data-pkg]").forEach((x) =>
            x.classList.remove("sel"),
          );
          p.classList.add("sel");
        }),
      ),
    );
    // categories mega-menu
    const katBtn = document.querySelector("[data-kat]"),
      katPanel = document.querySelector("[data-kat-panel]");
    if (katBtn && katPanel) {
      const close = () => {
        katPanel.hidden = true;
        katBtn.setAttribute("aria-expanded", "false");
        katBtn.classList.remove("open");
      };
      katBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = katPanel.hidden;
        katPanel.hidden = !open;
        katBtn.setAttribute("aria-expanded", String(open));
        katBtn.classList.toggle("open", open);
      });
      katPanel.addEventListener("click", (e) => e.stopPropagation());
      katPanel.querySelectorAll("[data-kat-item]").forEach((it) => {
        const sel = () => {
          const i = it.dataset.katItem;
          katPanel
            .querySelectorAll("[data-kat-item]")
            .forEach((x) => x.classList.toggle("on", x === it));
          katPanel
            .querySelectorAll("[data-kat-detail]")
            .forEach((d) =>
              d.classList.toggle("on", d.dataset.katDetail === i),
            );
        };
        it.addEventListener("mouseenter", sel);
        it.addEventListener("focus", sel);
      });
      document.addEventListener("click", close);
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") close();
      });
      if (location.search.indexOf("katopen") > -1) {
        katPanel.hidden = false;
        katBtn.classList.add("open");
      }
    }
    // account menu + auth cluster handlers (logout, saved link)
    bindAuthUI(document);
    // search submit + suggestions + image search live in wireSearch()
  }

  /* ---------- auth cluster binding + Supabase session bridge ---------- */
  function bindAuthUI(scope) {
    scope = scope || document;
    scope.querySelectorAll("[data-acct]").forEach((a) => {
      const btn = a.querySelector(".acct-btn"),
        pop = a.querySelector(".acct-pop");
      if (!btn || !pop) return;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = pop.hidden;
        pop.hidden = !open;
        btn.setAttribute("aria-expanded", String(open));
      });
      document.addEventListener("click", () => {
        if (!pop.hidden) {
          pop.hidden = true;
          btn.setAttribute("aria-expanded", "false");
        }
      });
    });
    scope.querySelectorAll("[data-logout]").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.preventDefault();
        Promise.resolve(Store.logout()).then(() => {
          location.href = HOME;
        });
      }),
    );
  }

  /* Re-render ONLY the header auth cluster (login/signup <-> account menu) in place,
   preserving search, categories, cart and their bound handlers. */
  function refreshAuth() {
    const hdrIn = document.querySelector(".hdr-in");
    if (!hdrIn) return;
    hdrIn
      .querySelectorAll(".btn-login,.btn-daftar,.acct")
      .forEach((n) => n.remove());
    const panel = hdrIn.querySelector("[data-kat-panel]");
    const tmp = document.createElement("div");
    tmp.innerHTML = authCluster();
    const added = [...tmp.childNodes];
    added.forEach((n) => hdrIn.insertBefore(n, panel));
    // localize freshly-inserted nodes to the active language
    const lang = document.documentElement.lang || "en",
      d = I18N[lang] || I18N.en;
    added.forEach((n) => {
      if (n.nodeType !== 1) return;
      if (n.dataset && n.dataset.i18n) {
        const v = d[n.dataset.i18n];
        if (v != null) n.textContent = v;
      }
      n.querySelectorAll &&
        n.querySelectorAll("[data-i18n]").forEach((el) => {
          const v = d[el.dataset.i18n];
          if (v != null) el.textContent = v;
        });
    });
    bindAuthUI(hdrIn);
    syncBadges();
  }

  /* Bridge Supabase's async session into the synchronous arcana_session mirror
   the header renders off, then re-render the auth cluster. */
  function bootstrapSession() {
    const api = window.ARCANA_API;
    if (!api || !api.getSessionProfile) return;
    const sync = () =>
      api
        .getSessionProfile()
        .then((profile) => {
          if (profile) {
            LS.set("session", {
              role: profile.role,
              name: profile.name,
              avatarUrl: profile.avatarUrl || null,
            });
            mergeCartOnce(profile.id).catch(() => {});
            mergeSavedOnce(profile.id).catch(() => {});
          } else {
            localStorage.removeItem("arcana_session");
          }
          refreshAuth();
        })
        .catch(() => {});
    sync();
    if (api.onChange) {
      api.onChange((event, session) => {
        if (event === "SIGNED_OUT" || !session) {
          localStorage.removeItem("arcana_session");
          refreshAuth();
          return;
        }
        sync();
      });
    }
  }

  /* Pull the signed-in user's DB cart into the LS mirror. The first time for a
   given uid this session, also push up any pre-login (anon) local items so
   they merge into the account cart instead of being lost. */
  async function mergeCartOnce(uid) {
    const api = window.ARCANA_API;
    if (!api || !api.getCart) return;
    const flag = "arcana_cart_merged_" + uid;
    const dbItems = normalizeCartItems(await api.getCart());
    if (localStorage.getItem(flag)) {
      const localItems = Store.cart();
      const pending = readCartPending();
      const map = new Map(
        dbItems.map((item) => [item.key, { ...item }]),
      );
      // Browser state is the latest buyer-visible cart. Keep its exact
      // quantities while retaining lines added from another signed-in device.
      localItems.forEach((item) => map.set(item.key, { ...item }));
      Object.values(pending).forEach((operation) => {
        if (operation.qty <= 0) map.delete(operation.key);
        else
          map.set(operation.key, {
            id: operation.id,
            qty: operation.qty,
            key: operation.key,
            options: operation.options || {},
            lineType: operation.lineType || "product",
          });
      });
      const merged = Array.from(map.values());
      LS.set("cart", merged);
      if (Object.keys(pending).length || !sameCartItems(dbItems, merged)) {
        const result = await api.replaceCart(merged);
        if (!result || !result.error) clearSyncedCartPending(pending);
      }
      syncBadges();
      return;
    }
    const map = new Map(dbItems.map((i) => [i.key || cartLineKey(i.id,i.options,i.lineType), { ...i }]));
    Store.cart().forEach((li) => {
      if (map.has(li.key)) map.get(li.key).qty += li.qty;
      else map.set(li.key, { ...li });
    });
    const merged = Array.from(map.values());
    if (merged.length) await api.replaceCart(merged);
    LS.set("cart", merged);
    localStorage.setItem(flag, "1");
    syncBadges();
  }

  /* Pull the signed-in user's DB wishlist into the LS mirror. The first time for
   a given uid this session, also push up any pre-login (anon) local saves so
   they merge into the account wishlist instead of being lost. Unlike the cart,
   overlapping items keep the DB's qty rather than summing — a saved quantity
   isn't additive the way cart units are. */
  async function mergeSavedOnce(uid) {
    const api = window.ARCANA_API;
    if (!api || !api.getWishlist) return;
    const flag = "arcana_saved_merged_" + uid;
    const dbItems = await api.getWishlist();
    if (localStorage.getItem(flag)) {
      LS.set("saved", dbItems);
      syncBadges();
      return;
    }
    const map = new Map(dbItems.map((i) => [i.id, { ...i }]));
    Store.saved().forEach((li) => {
      if (!map.has(li.id)) map.set(li.id, { ...li });
    });
    const merged = Array.from(map.values());
    if (merged.length) await api.replaceWishlist(merged);
    LS.set("saved", merged);
    localStorage.setItem(flag, "1");
    syncBadges();
  }

  /* ---------- i18n (EN default · JA · ZH) ---------- */
  const I18N = {
    en: {
      "nav.categories": "Categories",
      "nav.home": "Home",
      "nav.browse": "Browse",
      "nav.saved": "Saved",
      "nav.orders": "Orders",
      "nav.account": "Account",
      "search.ph": "Search fabrics, trims, accessories, factories…",
      "search.refine": "Add keywords to refine your photo search…",
      "auth.login": "Log in",
      "auth.signup": "Sign up",
      "tb.sell": "Sell on Atelix",
      "tb.about": "About",
      "tb.help": "Help",
      "tb.saved": "Saved",
      "ft.tagline":
        "The wholesale marketplace connecting brand owners with verified fabric mills and OEM factories.",
      "ft.company": "Atelix",
      "ft.about": "About Atelix",
      "ft.careers": "Careers",
      "ft.blog": "Blog",
      "ft.b2b": "B2B sourcing",
      "ft.trustsafety": "Trust & safety",
      "ft.buy": "Buy",
      "ft.sourcing": "Sourcing guide",
      "ft.payments": "Payments",
      "ft.shipping": "Shipping",
      "ft.protection": "Transaction support",
      "ft.sell": "Sell",
      "ft.sellon": "Sell on Atelix",
      "ft.dashboard": "Supplier dashboard",
      "ft.help": "Help & Guides",
      "ft.helpcenter": "Help center",
      "ft.terms": "Terms & conditions",
      "ft.privacy": "Privacy policy",
      "ft.contact": "Contact us",
      "ft.follow": "Follow us",
      "ft.rights": "All rights reserved.",
      "home.curated": "Curated for you",
      "home.viewall": "View all products",
      "home.tab.all": "All",
      "home.tab.fabrics": "Fabrics",
      "home.tab.accessories": "Accessories",
      "home.tab.trims": "Trims",
      "hero.btag1": "NEW SEASON SOURCING",
      "hero.h1": "The wholesale marketplace for your next collection",
      "hero.p1":
        "Quality materials and trusted, verified factories — built for brand owners.",
      "hero.cta1": "Start sourcing",
      "hero.btag2": "LIMITED · 11.11 SALE",
      "hero.h2": "Up to 50% off verified fabrics & OEM",
      "hero.p2":
        "Stock your next collection for less — from mills you can trust.",
      "hero.cta2": "Shop the sale",
      "home.popcat": "Popular Categories",
      "home.popcatdesc":
        "Wovens, knits, denim, trims and full-package OEM — sourced from verified mills.",
      "home.explore": "Explore now",
      "home.quickreq": "Quick sourcing request",
      "home.browseall": "Browse all",
      "home.material": "Material",
      "home.quantity": "Quantity",
      "home.qtyph": "e.g. 500 meters / 100 pcs",
      "home.note": "Note",
      "home.notetip":
        "Tell us the characteristics you need: composition, GSM/weight, color, certifications, MOQ flexibility, lead time, or anything else. We'll get back to you.",
      "home.noteph":
        "e.g. GOTS-certified organic cotton, 180gsm, natural undyed, flexible MOQ",
      "home.getquotes": "Get quotes",
      "quick.fabrics": "Fabrics",
      "quick.trims": "Trims",
      "quick.oem": "OEM",
      "beta.eyebrow": "Atelix beta",
      "beta.title": "Start sourcing with us",
      "beta.copy":
        "We’re inviting brand owners to try Atelix before public launch. Register early and receive a first-order launch code.",
      "beta.support": "Need a supplier added or have a question?",
      "beta.email": "Email our team",
      "beta.cta": "Register as a brand owner",
      "beta.close": "Closes automatically in 5 seconds.",
      "promo.title":
        "Mega Sourcing Sale — up to 50% off verified fabrics & OEM",
      "promo.shopnow": "Shop now",
      "mat.cotton": "Cotton",
      "mat.linen": "Linen",
      "mat.polyester": "Polyester",
      "mat.wool": "Wool",
      "mat.nylon": "Nylon",
      "cat.filters": "Filters",
      "cat.reset": "Reset",
      "cat.oemavail": "OEM availability",
      "cat.all": "All",
      "cat.oemAvailable": "OEM available",
      "cat.nonoem": "Non-OEM",
      "cat.material": "Material",
      "cat.price": "Price ($ / unit)",
      "cat.certs": "Certifications",
      "cat.sort": "Sort",
      "cat.verified": "verified suppliers",
      "sort.rec": "Recommended",
      "sort.new": "Newest",
      "sort.moq": "MOQ: Low",
      "sort.price": "Price: Low",
      "noun.fabrics": "fabric options",
      "noun.accessories": "accessory options",
      "noun.trims": "trim options",
      "noun.yarns": "yarn & thread options",
      "noun.oem": "service packages",
      "seo.h1": "Wholesale Fabric & Garment Sourcing for Fashion Brands",
      "seo.p1":
        "Atelix is the B2B marketplace where apparel brand owners source premium fabrics, trims, accessories and full-package OEM services directly from verified mills and factories. Compare woven and knit fabrics — cotton twill, linen blends, organic cotton jersey, denim, satin and recycled polyester — on composition, GSM, minimum order quantity and lead time, then request quotes or add to cart and pay securely. Every supplier is identity, license and capability verified, so you can commit budget with confidence.",
      "seo.h2": "Source from verified factories across Asia and beyond",
      "seo.p2":
        "Connect with fabric mills and OEM factories in established manufacturing regions. Compare low-MOQ sampling, private-label production, custom color matching and bulk manufacturing options, then confirm payment, inspection, trade and shipping terms directly for each order.",
    },
    ja: {
      "nav.categories": "カテゴリー",
      "nav.home": "ホーム",
      "nav.browse": "探す",
      "nav.saved": "保存済み",
      "nav.orders": "注文",
      "nav.account": "アカウント",
      "search.ph": "生地・付属品・工場を検索…",
      "search.refine": "キーワードで写真検索を絞り込む…",
      "auth.login": "ログイン",
      "auth.signup": "新規登録",
      "tb.sell": "Atelixで販売 — 5万社以上の認証バイヤーへ",
      "tb.about": "会社概要",
      "tb.help": "ヘルプ",
      "tb.saved": "保存済み",
      "ft.tagline":
        "ブランドオーナーと認証済みの生地工場・OEM工場をつなぐ卸売マーケットプレイス。",
      "ft.company": "Atelix",
      "ft.about": "Atelixについて",
      "ft.careers": "採用情報",
      "ft.blog": "ブログ",
      "ft.b2b": "B2B調達",
      "ft.trustsafety": "安全性と信頼",
      "ft.buy": "購入",
      "ft.sourcing": "調達ガイド",
      "ft.payments": "お支払い",
      "ft.shipping": "配送",
      "ft.protection": "取引サポート",
      "ft.sell": "販売",
      "ft.sellon": "Atelixで販売",
      "ft.dashboard": "サプライヤー管理画面",
      "ft.help": "ヘルプ・ガイド",
      "ft.helpcenter": "ヘルプセンター",
      "ft.terms": "利用規約",
      "ft.privacy": "プライバシーポリシー",
      "ft.contact": "お問い合わせ",
      "ft.follow": "フォローする",
      "ft.rights": "無断転載を禁じます。",
      "home.curated": "あなたへのおすすめ",
      "home.viewall": "すべての商品を見る",
      "home.tab.all": "すべて",
      "home.tab.fabrics": "生地",
      "home.tab.accessories": "付属品",
      "home.tab.trims": "トリム",
      "hero.btag1": "新シーズン調達",
      "hero.h1": "次のコレクションのための卸売マーケットプレイス",
      "hero.p1":
        "高品質な素材と信頼できる認証工場 — ブランドオーナーのために。",
      "hero.cta1": "調達を始める",
      "hero.btag2": "期間限定 · 11.11セール",
      "hero.h2": "認証生地・OEMが最大50%オフ",
      "hero.p2": "次のコレクションをお得に — 信頼できる工場から。",
      "hero.cta2": "セールを見る",
      "home.popcat": "人気カテゴリー",
      "home.popcatdesc":
        "織物・ニット・デニム・トリム・フルパッケージOEM — 認証工場から。",
      "home.explore": "今すぐ見る",
      "home.quickreq": "クイック見積り依頼",
      "home.browseall": "すべて見る",
      "home.material": "素材",
      "home.quantity": "数量",
      "home.qtyph": "例: 500 m",
      "home.note": "備考",
      "home.notetip":
        "組成、目付(GSM)、色、認証、最低発注数量の柔軟性、リードタイムなど、必要な特性をお知らせください。担当者よりご連絡いたします。",
      "home.noteph":
        "例: GOTS認証オーガニックコットン、180gsm、無染色、MOQ相談可",
      "home.getquotes": "見積りを取得",
      "quick.fabrics": "生地",
      "quick.trims": "トリム",
      "quick.oem": "OEM",
      "beta.eyebrow": "Atelix ベータ",
      "beta.title": "Atelixで調達を始めましょう",
      "beta.copy":
        "一般公開に先駆け、ブランドオーナーの皆さまをAtelixへご招待しています。早期登録で初回取引用のローンチコードをお届けします。",
      "beta.support": "追加してほしいサプライヤーやご質問がありますか？",
      "beta.email": "チームにメールする",
      "beta.cta": "ブランドオーナーとして登録",
      "beta.close": "このメッセージは5秒後に閉じます。",
      "promo.title": "メガ調達セール — 認証生地・OEMが最大50%オフ",
      "promo.shopnow": "今すぐ購入",
      "mat.cotton": "綿",
      "mat.linen": "リネン",
      "mat.polyester": "ポリエステル",
      "mat.wool": "ウール",
      "mat.nylon": "ナイロン",
      "cat.filters": "絞り込み",
      "cat.reset": "リセット",
      "cat.oemavail": "OEM対応",
      "cat.all": "すべて",
      "cat.oemAvailable": "OEM対応あり",
      "cat.nonoem": "非OEM",
      "cat.material": "素材",
      "cat.price": "価格 (¥ / 単位)",
      "cat.certs": "認証",
      "cat.sort": "並び替え",
      "cat.verified": "認証サプライヤー",
      "sort.rec": "おすすめ",
      "sort.new": "新着",
      "sort.moq": "最小ロット: 少",
      "sort.price": "価格: 安い",
      "noun.fabrics": "生地",
      "noun.accessories": "付属品",
      "noun.trims": "トリム",
      "noun.yarns": "糸・スレッド",
      "noun.oem": "サービスパッケージ",
      "seo.h1": "ファッションブランドのための生地・縫製の卸売調達",
      "seo.p1":
        "Atelixは、アパレルブランドが認証済みの工場から高品質な生地・付属品・OEMサービスを直接調達できるB2Bマーケットプレイスです。組成・目付(GSM)・最小ロット・納期で比較し、見積依頼またはカートに追加して安全に決済できます。すべてのサプライヤーは本人・ライセンス・生産能力が認証済みです。",
      "seo.h2": "アジアを中心とした認証工場から調達",
      "seo.p2":
        "中国の浙江・広東・江蘇・山東をはじめ、日本・インド・ベトナム・トルコの工場と直接つながります。小ロットのサンプリングからプライベートラベル、カラーマッチング、量産まで、AtelixのOEMパッケージが糸から完成品まで対応。T/T・PayPalによる安全な決済と120カ国以上への配送で、調達をシンプルに。",
    },
    zh: {
      "nav.categories": "分类",
      "nav.home": "首页",
      "nav.browse": "浏览",
      "nav.saved": "收藏",
      "nav.orders": "订单",
      "nav.account": "账户",
      "search.ph": "搜索面料、辅料、工厂…",
      "search.refine": "输入关键词细化图片搜索…",
      "auth.login": "登录",
      "auth.signup": "注册",
      "tb.sell": "在 Atelix 上销售 — 触达 5 万+ 认证买家",
      "tb.about": "关于",
      "tb.help": "帮助",
      "tb.saved": "收藏",
      "ft.tagline": "连接品牌方与认证面料厂及 OEM 工厂的批发采购平台。",
      "ft.company": "Atelix",
      "ft.about": "关于 Atelix",
      "ft.careers": "招聘",
      "ft.blog": "博客",
      "ft.b2b": "B2B 采购",
      "ft.trustsafety": "信任与安全",
      "ft.buy": "采购",
      "ft.sourcing": "采购指南",
      "ft.payments": "支付",
      "ft.shipping": "物流",
      "ft.protection": "交易支持",
      "ft.sell": "销售",
      "ft.sellon": "在 Atelix 上销售",
      "ft.dashboard": "供应商后台",
      "ft.help": "帮助与指南",
      "ft.helpcenter": "帮助中心",
      "ft.terms": "服务条款",
      "ft.privacy": "隐私政策",
      "ft.contact": "联系我们",
      "ft.follow": "关注我们",
      "ft.rights": "版权所有。",
      "home.curated": "为你精选",
      "home.viewall": "查看全部商品",
      "home.tab.all": "全部",
      "home.tab.fabrics": "面料",
      "home.tab.accessories": "辅料",
      "home.tab.trims": "织带",
      "hero.btag1": "新季采购",
      "hero.h1": "为你的下一个系列而生的批发采购平台",
      "hero.p1": "优质材料与可信认证工厂 — 为品牌方打造。",
      "hero.cta1": "开始采购",
      "hero.btag2": "限时 · 11.11 大促",
      "hero.h2": "认证面料与OEM低至5折",
      "hero.p2": "以更低成本备货下一季 — 来自可信工厂。",
      "hero.cta2": "抢购大促",
      "home.popcat": "热门类目",
      "home.popcatdesc": "梭织、针织、牛仔、织带及全包OEM — 来自认证工厂。",
      "home.explore": "立即探索",
      "home.quickreq": "快速询价",
      "home.browseall": "查看全部",
      "home.material": "材料",
      "home.quantity": "数量",
      "home.qtyph": "例如 500 m",
      "home.note": "备注",
      "home.notetip":
        "请告诉我们您需要的特性：成分、克重(GSM)、颜色、认证、起订量灵活性、交货期等。我们会尽快与您联系。",
      "home.noteph": "例如：GOTS认证有机棉，180gsm，本色未染，起订量可协商",
      "home.getquotes": "获取报价",
      "quick.fabrics": "面料",
      "quick.trims": "织带",
      "quick.oem": "OEM",
      "beta.eyebrow": "Atelix 测试版",
      "beta.title": "和我们一起开始采购",
      "beta.copy":
        "我们诚邀品牌方在正式上线前体验 Atelix。提前注册即可获得首笔交易的上线优惠码。",
      "beta.support": "想新增供应商或有任何问题？",
      "beta.email": "联系团队",
      "beta.cta": "以品牌方身份注册",
      "beta.close": "此提示将在 5 秒后自动关闭。",
      "promo.title": "超级采购大促 — 认证面料与OEM低至5折",
      "promo.shopnow": "立即抢购",
      "mat.cotton": "棉",
      "mat.linen": "亚麻",
      "mat.polyester": "涤纶",
      "mat.wool": "羊毛",
      "mat.nylon": "锦纶",
      "cat.filters": "筛选",
      "cat.reset": "重置",
      "cat.oemavail": "OEM 可选",
      "cat.all": "全部",
      "cat.oemAvailable": "支持 OEM",
      "cat.nonoem": "非 OEM",
      "cat.material": "材料",
      "cat.price": "价格 (¥ / 单位)",
      "cat.certs": "认证",
      "cat.sort": "排序",
      "cat.verified": "认证供应商",
      "sort.rec": "推荐",
      "sort.new": "最新",
      "sort.moq": "起订量: 低",
      "sort.price": "价格: 低",
      "noun.fabrics": "面料",
      "noun.accessories": "辅料",
      "noun.trims": "织带",
      "noun.yarns": "纱线与缝纫线",
      "noun.oem": "服务套餐",
      "seo.h1": "面向时尚品牌的面料与成衣批发采购",
      "seo.p1":
        "Atelix 是一个 B2B 采购平台，品牌方可直接向认证工厂采购优质面料、辅料及全包 OEM 服务。按成分、克重(GSM)、起订量与交期进行比较，然后索取报价或加入购物车并安全支付。每家供应商均通过身份、资质与产能认证，让你放心下单。",
      "seo.h2": "从亚洲及全球认证工厂采购",
      "seo.p2":
        "连接中国浙江、广东、江苏、山东等制造重镇，以及日本、印度、越南和土耳其的合作工厂。无论是小起订量打样、贴牌生产、定制配色，还是带在线质检的批量生产，Atelix 的 OEM 套餐都能让你的系列从纱线到成衣一站完成。T/T 与 PayPal 安全支付、透明贸易条款、覆盖 120+ 国家的物流，让采购井然有序。",
    },
  };
  function applyLang(lang) {
    if (!I18N[lang]) lang = "en";
    try {
      localStorage.setItem("arcana_lang", lang);
    } catch (_) {}
    document.documentElement.lang = lang;
    const d = I18N[lang];
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const v = d[el.dataset.i18n];
      if (v != null) el.textContent = v;
    });
    document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
      const v = d[el.dataset.i18nPh];
      if (v != null) el.setAttribute("placeholder", v);
    });
    document
      .querySelectorAll("[data-lang-label]")
      .forEach(
        (el) => (el.textContent = { en: "EN", ja: "日本語", zh: "中文" }[lang]),
      );
    document
      .querySelectorAll("[data-lang-switch] button")
      .forEach((b) => b.classList.toggle("on", b.dataset.lang === lang));
    // re-render dynamic content (product cards, prices, specs) in the new language
    langRenderers.forEach((fn) => {
      try {
        fn(lang);
      } catch (err) {
        console.error(err);
      }
    });
  }
  window.ARCANA_setLang = applyLang;
  function wireLang() {
    document
      .querySelectorAll("[data-lang-switch] button")
      .forEach((b) =>
        b.addEventListener("click", () => applyLang(b.dataset.lang)),
      );
    const cyc = document.querySelector("[data-lang-cycle]");
    if (cyc)
      cyc.addEventListener("click", () => {
        const o = ["en", "ja", "zh"];
        const c = document.documentElement.lang || "en";
        applyLang(o[(o.indexOf(c) + 1) % o.length]);
      });
    let saved = "en";
    try {
      saved = localStorage.getItem("arcana_lang") || "en";
    } catch (_) {}
    const q = new URLSearchParams(location.search).get("lang");
    if (q && I18N[q]) saved = q;
    applyLang(saved);
  }

  // demo seed: ?seed=cart pre-fills a couple items (for previews)
  if (location.search.indexOf("seed=cart") > -1 && !Store.cart().length) {
    Store.addToCart("FAB-100", 300);
    Store.addToCart("FAB-101", 150);
    Store.addToCart("FAB-102", 500);
  }

  /* ---------- catalog hydration: Supabase is the production source of truth.
   Bundled data.js remains an offline fallback only if the live read fails. ---- */
  function catalogLoadBar(show) {
    let b = document.getElementById("arcanaLoadBar");
    if (show) {
      if (!b) {
        b = document.createElement("div");
        b.id = "arcanaLoadBar";
        b.style.cssText =
          "position:fixed;top:0;left:0;height:2px;width:100%;z-index:9999;" +
          "background:var(--brass,#72531d);transform:scaleX(0);transform-origin:left;" +
          "transition:transform .4s ease,opacity .3s ease";
        document.body.appendChild(b);
      }
      requestAnimationFrame(() => {
        b.style.opacity = "1";
        b.style.transform = "scaleX(0.75)";
      });
    } else if (b) {
      b.style.transform = "scaleX(1)";
      b.style.opacity = "0";
      setTimeout(() => b.remove(), 350);
    }
  }
  async function hydrateCatalog() {
    if (!(window.ARCANA_API && ARCANA_API.fetchCatalog)) return;
    catalogLoadBar(true);
    try {
      const { products, factories } = await ARCANA_API.fetchCatalog();
      if (products && products.length) {
        window.ARCANA_PRODUCTS = products;
        window.ARCANA_PRODUCT_MAP = Object.fromEntries(
          products.map((product) => [product.id, product]),
        );
      }
      if (factories && factories.length) {
        window.ARCANA_FACTORIES = factories;
        window.ARCANA_FACTORY_MAP = Object.fromEntries(
          factories.map((factory) => [factory.id, factory]),
        );
        window.ARCANA_FACTORY_BY_NAME = Object.fromEntries(
          factories.map((factory) => [factory.name, factory.id]),
        );
      }
      if (window.ATELIX_refreshCatalogStats)
        window.ATELIX_refreshCatalogStats();
    } catch (err) {
      console.warn(
        "[Atelix] live catalog unavailable — using bundled data.js",
        err && err.message,
      );
    } finally {
      catalogLoadBar(false);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport && !/viewport-fit/.test(viewport.content))
      viewport.content += ", viewport-fit=cover";
    buildHeader();
    buildFooter();
    buildMobileNav();
    wire();
    wireSearch();
    buildCopilotFab();
    bootstrapSession();
  });
  document.addEventListener("DOMContentLoaded", async () => {
    // Pages that render catalog data opt in with <body data-catalog> so the live
    // read completes before ARCANA_PAGE runs. Other pages render immediately.
    if (document.body.hasAttribute("data-catalog")) await hydrateCatalog();
    if (window.ARCANA_PAGE)
      try {
        await window.ARCANA_PAGE({ P, ASSET, Store, IC, toast });
      } catch (err) {
        console.error(err);
      }
    wireLang();
  });
})();
