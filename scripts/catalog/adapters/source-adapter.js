"use strict";

const REQUIRED_METHODS = ["discover", "fetchSupplier", "fetchProducts", "fetchMedia", "mapToCanonical"];

class SourceAdapter {
  constructor({ id, allowedScopes }) {
    if (!id || !Array.isArray(allowedScopes) || !allowedScopes.length) {
      throw new TypeError("SourceAdapter requires an id and at least one scope");
    }
    this.id = id;
    this.allowedScopes = Object.freeze([...new Set(allowedScopes)]);
  }

  assertScope(scope) {
    if (!this.allowedScopes.includes(scope)) {
      throw new Error(`Unsupported ${this.id} scope: ${scope}`);
    }
    return scope;
  }

  assertContract() {
    for (const method of REQUIRED_METHODS) {
      if (this[method] === SourceAdapter.prototype[method]) {
        throw new Error(`${this.constructor.name} must implement ${method}()`);
      }
    }
    return this;
  }

  async *discover() { throw new Error("discover() is not implemented"); }
  async fetchSupplier() { throw new Error("fetchSupplier() is not implemented"); }
  async fetchProducts() { throw new Error("fetchProducts() is not implemented"); }
  async fetchMedia() { throw new Error("fetchMedia() is not implemented"); }
  mapToCanonical() { throw new Error("mapToCanonical() is not implemented"); }
}

module.exports = { REQUIRED_METHODS, SourceAdapter };
