/* Shared, category-agnostic product option contract and editor. */
(function () {
  "use strict";

  const escapeHtml = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[character],
    );

  function normalizeProductOptions(input) {
    const source = Array.isArray(input) ? input : [];
    const groups = new Map();
    const add = (name, value) => {
      const optionName = String(name || "Color").trim();
      const optionValue = String(value || "").trim();
      if (!optionName || !optionValue || optionValue.toLowerCase() === "default")
        return;
      if (!groups.has(optionName)) groups.set(optionName, []);
      const values = groups.get(optionName);
      if (!values.some((item) => item.toLowerCase() === optionValue.toLowerCase()))
        values.push(optionValue);
    };

    source.forEach((item) => {
      if (typeof item === "string") {
        add("Color", item);
        return;
      }
      if (!item || typeof item !== "object") return;
      const name = item.name || item.option_name || "Color";
      if (Array.isArray(item.values)) item.values.forEach((value) => add(name, value));
      else add(name, item.value || item.option_value || item.colorway);
    });

    return [...groups].map(([name, values]) => ({ name, values }));
  }

  function optionRow(option = {}) {
    const values = Array.isArray(option.values) ? option.values.join(", ") : "";
    return `<div class="product-option-row" data-option-row>
      <label><span>Option name</span><input type="text" maxlength="40" value="${escapeHtml(option.name || "")}" placeholder="Color, Length, Size"></label>
      <label><span>Values</span><textarea rows="2" maxlength="2000" placeholder="Navy, Black, Natural">${escapeHtml(values)}</textarea></label>
      <button class="product-option-remove" type="button" data-option-remove aria-label="Remove this option">Remove</button>
    </div>`;
  }

  function productOptionEditor(options) {
    const normalized = normalizeProductOptions(options);
    return `<div class="product-option-editor" data-option-editor>
      <div class="product-option-editor__head"><p>Define only options buyers must choose on the product page. Separate values with commas or new lines.</p><button type="button" data-option-add>Add option</button></div>
      <div data-option-list>${normalized.map(optionRow).join("")}</div>
    </div>`;
  }

  function bindProductOptionEditor(scope) {
    const editor = scope?.querySelector?.("[data-option-editor]");
    if (!editor || editor.dataset.optionBound === "true") return;
    editor.dataset.optionBound = "true";
    const list = editor.querySelector("[data-option-list]");
    const wireRemove = (row) =>
      row
        .querySelector("[data-option-remove]")
        ?.addEventListener("click", () => row.remove());
    list.querySelectorAll("[data-option-row]").forEach(wireRemove);
    editor.querySelector("[data-option-add]")?.addEventListener("click", () => {
      list.insertAdjacentHTML("beforeend", optionRow());
      const row = list.lastElementChild;
      wireRemove(row);
      row.querySelector("input")?.focus();
    });
  }

  function readProductOptions(scope) {
    const editor = scope?.querySelector?.("[data-option-editor]");
    if (!editor) return [];
    const options = [];
    const names = new Set();
    editor.querySelectorAll("[data-option-row]").forEach((row) => {
      const name = row.querySelector("input")?.value.trim() || "";
      const values = (row.querySelector("textarea")?.value || "")
        .split(/[\n,]/)
        .map((value) => value.trim())
        .filter(Boolean)
        .filter(
          (value, index, all) =>
            all.findIndex((item) => item.toLowerCase() === value.toLowerCase()) ===
            index,
        );
      if (!name && !values.length) return;
      if (!name) throw new Error("Every product option needs a name.");
      if (!values.length) throw new Error(`${name} needs at least one value.`);
      const key = name.toLowerCase();
      if (names.has(key)) throw new Error(`Merge the duplicate ${name} option.`);
      names.add(key);
      options.push({ name, values });
    });
    return options;
  }

  window.ATELIX_normalizeProductOptions = normalizeProductOptions;
  window.ATELIX_productOptionEditor = productOptionEditor;
  window.ATELIX_bindProductOptionEditor = bindProductOptionEditor;
  window.ATELIX_readProductOptions = readProductOptions;
})();
